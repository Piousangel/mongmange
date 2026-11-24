-- B5 안전 장치(architecture.md v2.2 3-8 '신고 → 자동 숨김'·3-9 상태 전이·3-12 Studio + SQL 함수·3-5-2 '이름 가리기').
-- reports: 대상마다 열린 행 하나 + 그 신고 전용 소금(열려 있을 때만). report_hits: HMAC(소금, IP 접두) — 같은 사람은 PK로 1.
-- admin_actions: 운영 기록(SQL 함수가 같은 트랜잭션에서 쓴다). 운영 함수 = 관리 API 대신 Supabase Studio에서 부르는 것(docs/ops/moderation/*.sql).
-- Storage를 건드리는 일(격리본 되돌리기·지우기·이름 뺀 판 다시 쓰기)은 SQL이 storage_gc 대기 행으로 적고 서버의 Scheduler 작업
-- `moderation`(5분마다)·`storage-gc`가 처리한다 — SQL은 파일을 만지지 않는다.

CREATE TYPE "app"."report_target" AS ENUM ('link', 'encounter', 'cohort', 'footprint');
-- account_deleted: 대상 계정이 지워져 닫힌 신고(B5 리뷰 M2 — 격리 중 삭제된 신고 행이 열린 채 남지 않게)
CREATE TYPE "app"."report_status" AS ENUM ('open', 'auto_hidden', 'expired', 'restored', 'confirmed', 'dismissed', 'account_deleted');
-- 격리본 → 공개 되돌리기(운영자 복원), 이름 뺀 판 다시 쓰기(운영자 이름 가리기). 이 마이그레이션 안에서는 쓰지 않는다(같은 트랜잭션 제약) —
-- 아래 plpgsql 함수 본문은 실행 때 읽힌다
ALTER TYPE "app"."storage_gc_reason" ADD VALUE 'restore_move';
ALTER TYPE "app"."storage_gc_reason" ADD VALUE 'name_mask';

-- 운영자 이름 가리기(3-5-2). 켜져 있으면 공개 판정(nameShown)은 늘 거짓, 주인은 이름 공개를 다시 켤 수 없다(409). 해제는 운영자만
ALTER TABLE "app"."creatures" ADD COLUMN "name_blocked" BOOLEAN NOT NULL DEFAULT false;
-- 운영자 삭제 요청 시각(삭제 요청 절차 docs/ops/deletion-requests.md). **72시간 대기** 뒤 서버 작업이 DELETE /me와 같은 연쇄로 지운다
-- (B5 리뷰 H1 — 즉시 삭제 금지). 대기 중에는 주인 앱이 알리고(GET /creature deletionPendingUntil) 운영자는 취소할 수 있다.
-- 사용자 행에 있으므로 지워지면 함께 사라진다(흔적 0)
ALTER TABLE "app"."users" ADD COLUMN "delete_requested_at" TIMESTAMPTZ(6);

CREATE TABLE "app"."reports" (
    "id" BIGSERIAL NOT NULL,
    "target_kind" "app"."report_target" NOT NULL,
    -- link = 인장 코드. 계정을 지워도 1년 남는다(코드만 — 같은 대상의 재발 판단, 처리방침 6절)
    "target_ref" TEXT NOT NULL,
    -- 사유 코드별 개수 {"sexual":2,"other":1} — 자유 글 없음(contract REPORT_REASONS)
    "reason_counts" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "window_ends_at" TIMESTAMPTZ(6) NOT NULL,
    -- 그 신고 전용 소금(32바이트). 열려 있을 때만 있다 — 창이 끝나거나 숨김·운영 처리가 되면 NULL(아래 CHECK)
    "salt" BYTEA,
    "distinct_reporters" SMALLINT NOT NULL DEFAULT 0,
    "status" "app"."report_status" NOT NULL DEFAULT 'open',
    "resolved_at" TIMESTAMPTZ(6),
    -- 자동 숨김이 일어난 시각(서비스 전체 차단기가 1시간 안 건수를 센다)
    "hidden_at" TIMESTAMPTZ(6),
    -- 문턱을 넘었지만 숨기지 않고 운영자 대기 목록에만 올린 까닭(B5 리뷰 H2): immune = 최근 7일 안에 복원된 대상,
    -- breaker = 서비스 전체 1시간 자동 숨김 상한, disabled = 자동 숨김 꺼짐(운영 기본 — B6 XFF 실측 전)
    "held" VARCHAR(16),
    CONSTRAINT "reports_pkey" PRIMARY KEY ("id"),
    -- 소금은 열린 행에만: 닫힌 행에 소금이 남으면 7일 뒤에도 IP를 되짚을 수 있다(3-8 ④)
    CONSTRAINT "reports_salt_only_open" CHECK (("status" = 'open') = ("salt" IS NOT NULL)),
    CONSTRAINT "reports_reason_counts_object" CHECK (jsonb_typeof("reason_counts") = 'object'),
    CONSTRAINT "reports_held_reason" CHECK ("held" IS NULL OR "held" IN ('immune', 'breaker', 'disabled'))
);
-- 대상마다 열린 행 하나(부분 UNIQUE — Prisma가 표현하지 못해 SQL에만)
CREATE UNIQUE INDEX "reports_open_target" ON "app"."reports"("target_kind", "target_ref") WHERE "status" = 'open';
CREATE INDEX "reports_status_window_ends_at_idx" ON "app"."reports"("status", "window_ends_at");
CREATE INDEX "reports_target_ref_idx" ON "app"."reports"("target_ref");
CREATE INDEX "reports_created_at_idx" ON "app"."reports"("created_at");
CREATE INDEX "reports_hidden_at_idx" ON "app"."reports"("hidden_at");

-- reporter_key = HMAC-SHA256(reports.salt, IP 접두). 시각·UA·IP 없음. 행이 열린 동안만 있다(아래 트리거)
CREATE TABLE "app"."report_hits" (
    "report_id" BIGINT NOT NULL,
    "reporter_key" BYTEA NOT NULL,
    CONSTRAINT "report_hits_pkey" PRIMARY KEY ("report_id", "reporter_key")
);
ALTER TABLE "app"."report_hits" ADD CONSTRAINT "report_hits_report_id_fkey"
  FOREIGN KEY ("report_id") REFERENCES "app"."reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 운영 기록(3-1). 1년 뒤 지운다(신고 기록과 같은 기간). 계정 삭제 요청 기록에는 코드를 적지 않는다(근거 유형과 운영자만 — 지운 뒤 흔적 0).
-- actor = 실행한 DB 로그인(session_user — Studio면 그 접속 롤). 메모에 이메일을 적지 못하게 '@'를 막는다(B5 리뷰 L5)
CREATE TABLE "app"."admin_actions" (
    "id" BIGSERIAL NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "target_kind" VARCHAR(16) NOT NULL,
    "target_ref" TEXT,
    "note" TEXT,
    "actor" VARCHAR(64) NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_actions_note_no_email" CHECK ("note" IS NULL OR "note" !~ '@')
);
CREATE INDEX "admin_actions_at_idx" ON "app"."admin_actions"("at");

-- 열린 행이 닫히면(어느 길이든 — 자동 숨김·창 끝·운영 처리) 신고자 키를 행째 지운다. 함수마다 지우기를 잊어도 구조가 막는다
CREATE OR REPLACE FUNCTION "app"."report_close_hits"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM app.report_hits WHERE report_id = NEW.id;
  RETURN NEW;
END $$;
CREATE TRIGGER "reports_close_hits" AFTER UPDATE OF "status" ON "app"."reports"
  FOR EACH ROW WHEN (OLD."status" = 'open' AND NEW."status" <> 'open') EXECUTE FUNCTION "app"."report_close_hits"();

-- ───────────── 운영 함수(Studio에서 부른다 — 상태 전이와 admin_actions를 한 트랜잭션에) ─────────────

-- 사람이 옮겨 적은 인장 코드 → 정규 8자(contract normalizeCreatureCode와 같은 Crockford 읽기). 틀리면 오류
CREATE OR REPLACE FUNCTION "app"."mod_code"("p_raw" text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE s text := translate(upper(regexp_replace(coalesce(p_raw, ''), '[[:space:]-]', '', 'g')), 'ILO', '110');
BEGIN
  IF s !~ '^[0-9A-HJKMNP-TV-Z]{8}$' THEN
    RAISE EXCEPTION '인장 코드 형식이 아닙니다(8자, 예: 7K2M9QXA)' USING ERRCODE = '22023';
  END IF;
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION "app"."mod_creature_id"("p_code" text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE cid uuid;
BEGIN
  SELECT id INTO cid FROM app.creatures WHERE code = app.mod_code(p_code);
  IF cid IS NULL THEN
    RAISE EXCEPTION '그 코드의 몽망이가 없습니다(계정이 이미 지워졌을 수 있음)' USING ERRCODE = 'P0002';
  END IF;
  RETURN cid;
END $$;

CREATE OR REPLACE FUNCTION "app"."mod_log"("p_action" text, "p_kind" text, "p_ref" text, "p_note" text, "p_at" timestamptz) RETURNS void LANGUAGE sql AS $$
  INSERT INTO app.admin_actions (action, target_kind, target_ref, note, actor, at) VALUES (p_action, p_kind, p_ref, nullif(btrim(p_note), ''), session_user, p_at);
$$;

-- /m HTML CDN 무효화 요청(cdn_purge 한 행 — 서버 Scheduler `cdn-purge`가 1분 묶음으로 낸다)
CREATE OR REPLACE FUNCTION "app"."mod_cdn_purge"("p_at" timestamptz) RETURNS void LANGUAGE sql AS $$
  INSERT INTO app.cdn_purge (id, requested_at) VALUES (1, p_at)
  ON CONFLICT (id) DO UPDATE SET requested_at = coalesce(app.cdn_purge.requested_at, EXCLUDED.requested_at);
$$;

-- 공개 사본을 내린다(확정 삭제 = removed, 격리 중에 주인이 끈 판의 복원 = off): 지금 판(공개·격리 두 버킷)·커밋 전 판·지난 판을
-- 지금 지우도록 대기열에 적고, 남은 격리·복원·이름 작업은 취소한다. 페이지 행은 부르는 쪽이 이미 잠갔다
CREATE OR REPLACE FUNCTION "app"."mod_take_down"("p_cid" uuid, "p_state" app.page_state, "p_at" timestamptz) RETURNS void LANGUAGE plpgsql AS $$
DECLARE p app.public_pages;
BEGIN
  SELECT * INTO p FROM app.public_pages WHERE creature_id = p_cid FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  DELETE FROM app.storage_gc WHERE creature_id = p_cid AND reason IN ('quarantine_move', 'restore_move', 'name_mask');
  IF p.path_prefix IS NOT NULL THEN
    INSERT INTO app.storage_gc (bucket, prefix, creature_id, reason, not_before) VALUES
      ('quarantine', p.store_key || '/' || p.path_prefix, p_cid, 'quarantine_expiry', p_at),
      ('public-pages', p.store_key || '/' || p.path_prefix, p_cid, 'old_version', p_at);
  END IF;
  IF p.pending_prefix IS NOT NULL THEN
    UPDATE app.storage_gc SET not_before = p_at WHERE creature_id = p_cid AND reason = 'uncommitted' AND prefix = p.store_key || '/' || p.pending_prefix;
  END IF;
  -- 2시간 유예 중인 지난 판도 지금(이름이 실렸을 수 있다)
  UPDATE app.storage_gc SET not_before = p_at WHERE creature_id = p_cid AND reason = 'old_version';
  UPDATE app.public_pages
     SET state = p_state, state_changed_at = p_at, path_prefix = NULL, meta = NULL, name_shown = false, has_loop = false,
         pending_ver = NULL, pending_prefix = NULL, pending_meta = NULL, pending_name_shown = NULL, pending_has_loop = NULL
   WHERE creature_id = p_cid;
  PERFORM app.mod_cdn_purge(p_at);
END $$;

-- 복원: 격리본을 공개로 되돌린다(서버 작업이 파일을 옮긴 뒤 live). 주인이 격리 중에 링크를 껐으면 되살리지 않고 off + 격리본 삭제
CREATE OR REPLACE FUNCTION "app"."restore_page"("p_code" text, "p_note" text DEFAULT NULL, "p_at" timestamptz DEFAULT now()) RETURNS text LANGUAGE plpgsql AS $$
DECLARE cid uuid := app.mod_creature_id(p_code); v_code text := app.mod_code(p_code); p app.public_pages; linked boolean;
BEGIN
  SELECT * INTO p FROM app.public_pages WHERE creature_id = cid FOR UPDATE;
  IF NOT FOUND OR p.state <> 'quarantined' THEN
    RAISE EXCEPTION '격리 중인 링크가 아닙니다(지금 상태: %)', coalesce(p.state::text, '없음') USING ERRCODE = '55000';
  END IF;
  SELECT link_enabled INTO linked FROM app.creatures WHERE id = cid;
  UPDATE app.reports SET status = 'restored', salt = NULL, resolved_at = p_at
   WHERE target_kind = 'link' AND target_ref = v_code AND status IN ('open', 'auto_hidden');
  DELETE FROM app.storage_gc WHERE creature_id = cid AND reason IN ('quarantine_move', 'restore_move');
  IF linked THEN
    INSERT INTO app.storage_gc (bucket, prefix, creature_id, reason, not_before)
    VALUES ('quarantine', p.store_key || '/' || p.path_prefix, cid, 'restore_move', p_at);
    PERFORM app.mod_log('restore', 'link', v_code, p_note, p_at);
    RETURN 'restore_queued — 서버 작업(moderation, 5분마다)이 파일을 옮기면 live';
  END IF;
  PERFORM app.mod_take_down(cid, 'off', p_at);
  PERFORM app.mod_log('restore_off', 'link', v_code, p_note, p_at);
  RETURN 'off — 주인이 격리 중에 링크를 꺼서 되살리지 않고 격리본을 지운다';
END $$;

-- 확정 삭제: 격리본(또는 아직 live인 판)을 지우고 removed. 주인의 다시 만들기는 409(되돌리기는 reopen_page)
CREATE OR REPLACE FUNCTION "app"."confirm_hide"("p_code" text, "p_note" text DEFAULT NULL, "p_at" timestamptz DEFAULT now()) RETURNS text LANGUAGE plpgsql AS $$
DECLARE cid uuid := app.mod_creature_id(p_code); v_code text := app.mod_code(p_code); st app.page_state;
BEGIN
  SELECT state INTO st FROM app.public_pages WHERE creature_id = cid FOR UPDATE;
  IF st IS NULL OR st NOT IN ('quarantined', 'live') THEN
    RAISE EXCEPTION '내릴 공개 사본이 없습니다(지금 상태: %)', coalesce(st::text, '없음') USING ERRCODE = '55000';
  END IF;
  UPDATE app.reports SET status = 'confirmed', salt = NULL, resolved_at = p_at
   WHERE target_kind = 'link' AND target_ref = v_code AND status IN ('open', 'auto_hidden');
  PERFORM app.mod_take_down(cid, 'removed', p_at);
  PERFORM app.mod_log('confirm_hide', 'link', v_code, p_note, p_at);
  RETURN 'removed';
END $$;

-- 기각: 아직 문턱을 넘지 않은 열린 신고를 닫는다(소금·신고자 키 즉시 삭제). 이미 숨겨진 것은 restore_page
CREATE OR REPLACE FUNCTION "app"."dismiss_report"("p_code" text, "p_note" text DEFAULT NULL, "p_at" timestamptz DEFAULT now()) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_code text := app.mod_code(p_code); n int;
BEGIN
  UPDATE app.reports SET status = 'dismissed', salt = NULL, resolved_at = p_at
   WHERE target_kind = 'link' AND target_ref = v_code AND status = 'open';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION '열린 신고가 없습니다(숨겨진 것은 restore_page)' USING ERRCODE = '55000'; END IF;
  PERFORM app.mod_log('dismiss', 'link', v_code, p_note, p_at);
  RETURN 'dismissed';
END $$;

-- 이름 가리기(3-5-2): name_blocked → 공개 판정 늘 거짓. 지금 판에서 이름을 바로 뺀다 — 문은 name_shown 하나(B3 리뷰 M2)라
-- name_shown = false + meta에서 name 삭제 + og:image는 포스터로(meta.ogPoster, OG 그림에 이름이 그려져 있다) + 이름 없는 판이 생길 때까지
-- HTML에 data-snap을 싣지 않는다(meta.snapPending, B5 리뷰 M3 — 옛 snap.json에는 이름이 있다). 이름이 든 snap.json·og.jpg는
-- 서버 작업(name_mask)이 새 pageKey로 이름 없는 판을 쓰고 옛 경로를 지운다. 커밋 전 판·지난 판도 지금 지운다
CREATE OR REPLACE FUNCTION "app"."mask_name"("p_code" text, "p_note" text DEFAULT NULL, "p_at" timestamptz DEFAULT now()) RETURNS text LANGUAGE plpgsql AS $$
DECLARE cid uuid := app.mod_creature_id(p_code); v_code text := app.mod_code(p_code); p app.public_pages; named boolean := false;
BEGIN
  -- 잠금 순서는 서버와 같게: 페이지 행 → 몽망이 행(PUT page가 그 순서)
  SELECT * INTO p FROM app.public_pages WHERE creature_id = cid FOR UPDATE;
  UPDATE app.creatures SET name_blocked = true, name_visible = false WHERE id = cid;
  IF p.creature_id IS NOT NULL THEN
    named := p.name_shown OR coalesce(p.meta ? 'name', false);
    IF p.pending_prefix IS NOT NULL THEN
      UPDATE app.storage_gc SET not_before = p_at WHERE creature_id = cid AND reason = 'uncommitted' AND prefix = p.store_key || '/' || p.pending_prefix;
    END IF;
    UPDATE app.storage_gc SET not_before = p_at WHERE creature_id = cid AND reason = 'old_version';
    UPDATE app.public_pages
       SET name_shown = false,
           meta = CASE WHEN meta IS NULL THEN NULL WHEN named THEN (meta - 'name') || '{"ogPoster": true, "snapPending": true}'::jsonb ELSE meta END,
           pending_ver = NULL, pending_prefix = NULL, pending_meta = NULL, pending_name_shown = NULL, pending_has_loop = NULL
     WHERE creature_id = cid;
    IF named AND p.path_prefix IS NOT NULL AND p.state IN ('live', 'quarantined') THEN
      DELETE FROM app.storage_gc WHERE creature_id = cid AND reason = 'name_mask';
      INSERT INTO app.storage_gc (bucket, prefix, creature_id, reason, not_before)
      VALUES (CASE WHEN p.state = 'live' THEN 'public-pages' ELSE 'quarantine' END, p.store_key || '/' || p.path_prefix, cid, 'name_mask', p_at);
    END IF;
    PERFORM app.mod_cdn_purge(p_at);
  END IF;
  PERFORM app.mod_log('mask_name', 'link', v_code, p_note, p_at);
  RETURN CASE WHEN named THEN 'masked — 이름 뺀 판은 서버 작업(moderation)이 쓴다' ELSE 'masked — 공개 판에 이름이 없었다(앞으로도 실리지 않음)' END;
END $$;

-- 이름 가리기 해제(운영자만). 이름 공개는 꺼진 채로 둔다 — 주인이 다시 켜고 다시 만들어야 실린다
CREATE OR REPLACE FUNCTION "app"."unmask_name"("p_code" text, "p_note" text DEFAULT NULL, "p_at" timestamptz DEFAULT now()) RETURNS text LANGUAGE plpgsql AS $$
DECLARE cid uuid := app.mod_creature_id(p_code); v_code text := app.mod_code(p_code);
BEGIN
  UPDATE app.creatures SET name_blocked = false WHERE id = cid AND name_blocked;
  IF NOT FOUND THEN RAISE EXCEPTION '이름이 가려져 있지 않습니다' USING ERRCODE = '55000'; END IF;
  PERFORM app.mod_log('unmask_name', 'link', v_code, p_note, p_at);
  RETURN 'unmasked';
END $$;

-- 확정 삭제 되돌리기: removed → off(주인이 다시 링크를 켤 수 있다). 지운 파일은 돌아오지 않는다
CREATE OR REPLACE FUNCTION "app"."reopen_page"("p_code" text, "p_note" text DEFAULT NULL, "p_at" timestamptz DEFAULT now()) RETURNS text LANGUAGE plpgsql AS $$
DECLARE cid uuid := app.mod_creature_id(p_code); v_code text := app.mod_code(p_code);
BEGIN
  UPDATE app.public_pages SET state = 'off', state_changed_at = p_at WHERE creature_id = cid AND state = 'removed';
  IF NOT FOUND THEN RAISE EXCEPTION '확정 삭제된 링크가 아닙니다' USING ERRCODE = '55000'; END IF;
  PERFORM app.mod_log('reopen', 'link', v_code, p_note, p_at);
  RETURN 'off';
END $$;

-- 운영자 계정 삭제 요청(삭제 요청 절차 2절의 예외 길 — B5 리뷰 H1). **바로 지우지 않는다**: 요청 → 72시간 대기(주인 앱에 알림, 운영자 취소 가능)
-- → 서버 작업(moderation)이 DELETE /me와 같은 연쇄로 지운다. 기록에는 코드 없이 근거 유형(guardian 보호자·legal 법령·self 본인)과 운영자만.
-- 이미 대기 중이거나 대상이 없으면 오류(0행인데 '접수'로 보이는 일이 없게)
CREATE OR REPLACE FUNCTION "app"."request_account_deletion"("p_code" text, "p_basis" text, "p_at" timestamptz DEFAULT now()) RETURNS text LANGUAGE plpgsql AS $$
DECLARE cid uuid := app.mod_creature_id(p_code); n int;
BEGIN
  IF p_basis IS NULL OR p_basis NOT IN ('guardian', 'legal', 'self') THEN
    RAISE EXCEPTION '근거 유형은 guardian·legal·self 중 하나' USING ERRCODE = '22023';
  END IF;
  UPDATE app.users u SET delete_requested_at = p_at FROM app.creatures c
   WHERE c.id = cid AND u.id = c.user_id AND u.delete_requested_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION '이미 삭제 대기 중입니다(취소는 08b)' USING ERRCODE = '55000'; END IF;
  PERFORM app.mod_log('delete_request', 'account', NULL, p_basis, p_at);
  RETURN 'scheduled — 72시간 뒤 서버 작업이 지운다(그 전에는 08b로 취소)';
END $$;

-- 삭제 대기 취소(72시간 안). 기록에는 코드 없이 운영자만
CREATE OR REPLACE FUNCTION "app"."cancel_account_deletion"("p_code" text, "p_at" timestamptz DEFAULT now()) RETURNS text LANGUAGE plpgsql AS $$
DECLARE cid uuid := app.mod_creature_id(p_code); n int;
BEGIN
  UPDATE app.users u SET delete_requested_at = NULL FROM app.creatures c
   WHERE c.id = cid AND u.id = c.user_id AND u.delete_requested_at IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION '삭제 대기 중이 아닙니다' USING ERRCODE = '55000'; END IF;
  PERFORM app.mod_log('delete_cancel', 'account', NULL, NULL, p_at);
  RETURN 'cancelled';
END $$;

-- ───────────── 만료(서버 Scheduler `moderation`이 5분마다 부른다) ─────────────
-- 파기 여유 10분: 창 끝(7일)·격리 최대(30일)보다 10분 일찍 닫아, 5분 주기 작업이어도 처리방침의 '최대 7일'·'최대 30일'을 넘지 않는다

-- ① 7일 창이 끝난 열린 신고: expired + 소금 NULL(트리거가 신고자 키 삭제) ② 1년 지난 닫힌 신고·운영 기록 삭제
CREATE OR REPLACE FUNCTION "app"."expire_reports"("p_at" timestamptz DEFAULT now()) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  UPDATE app.reports SET status = 'expired', salt = NULL, resolved_at = p_at
   WHERE status = 'open' AND window_ends_at <= p_at + interval '10 minutes';
  GET DIAGNOSTICS n = ROW_COUNT;
  -- 1년 지난 신고 행은 상태와 무관하게 지운다(열린 행은 7일 창이라 1년이 될 수 없다 — B5 리뷰 M2)
  DELETE FROM app.reports WHERE created_at < p_at - interval '1 year' AND status <> 'open';
  DELETE FROM app.admin_actions WHERE at < p_at - interval '1 year';
  RETURN n;
END $$;

-- 격리 30일이 지나도록 운영자가 정하지 않은 판: **복원이 기본값**(B5 리뷰 H2 — 악성 신고가 운영자 부재로 영구 삭제가 되지 않게.
-- 처리방침 5절 '30일 안에 결정하지 못하면 다시 공개'). 주인이 격리 중에 링크를 껐으면 되살리지 않고 off + 격리본 삭제.
-- 복원된 대상은 7일 동안 자동 숨김 면역(대기 목록으로만). 복원이 이미 대기 중이면 건너뛴다
CREATE OR REPLACE FUNCTION "app"."expire_quarantine"("p_at" timestamptz DEFAULT now()) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT p.creature_id, p.store_key, p.path_prefix, c.code, c.link_enabled FROM app.public_pages p JOIN app.creatures c ON c.id = p.creature_id
     WHERE p.state = 'quarantined' AND p.state_changed_at <= p_at - (interval '30 days' - interval '10 minutes')
       AND NOT EXISTS (SELECT 1 FROM app.storage_gc s WHERE s.creature_id = p.creature_id AND s.reason = 'restore_move')
     FOR UPDATE OF p
  LOOP
    UPDATE app.reports SET status = 'restored', salt = NULL, resolved_at = p_at
     WHERE target_kind = 'link' AND target_ref = r.code AND status IN ('open', 'auto_hidden');
    DELETE FROM app.storage_gc WHERE creature_id = r.creature_id AND reason = 'quarantine_move';
    IF r.link_enabled THEN
      INSERT INTO app.storage_gc (bucket, prefix, creature_id, reason, not_before)
      VALUES ('quarantine', r.store_key || '/' || r.path_prefix, r.creature_id, 'restore_move', p_at);
    ELSE
      PERFORM app.mod_take_down(r.creature_id, 'off', p_at);
    END IF;
    PERFORM app.mod_log('auto_restore', 'link', r.code, '격리 30일 — 결정 없음, 복원 기본값(B5 리뷰 H2)', p_at);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- 함수 굳히기(B5 리뷰 L2·L3): 검색 경로 고정, 기간 계산은 세션 시간대와 무관하게 UTC 달력(DST 세션에서 10분 여유가 1시간 차이에 먹히지 않게)
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'app' AND p.proname IN ('report_close_hits', 'mod_code', 'mod_creature_id', 'mod_log', 'mod_cdn_purge', 'mod_take_down',
       'restore_page', 'confirm_hide', 'dismiss_report', 'mask_name', 'unmask_name', 'reopen_page', 'request_account_deletion',
       'cancel_account_deletion', 'expire_reports', 'expire_quarantine')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, app', f);
    EXECUTE format('ALTER FUNCTION %s SET timezone = %L', f, 'UTC');
  END LOOP;
END $$;

ALTER TABLE "app"."reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app"."report_hits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app"."admin_actions" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA app FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM %I', r);
    END IF;
  END LOOP;
  -- 운영 함수는 소유자(마이그레이션 롤)와 Studio(postgres)만 — 기본 EXECUTE(PUBLIC) 회수. 앞으로 이 롤이 만들 함수도 기본 회수(B5 리뷰 L1)
  REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
  -- 스키마별 기본 권한은 전역 기본값에 '더하기'만 되어 PUBLIC을 뺄 수 없다 → 이 롤의 전역 기본값에서 뺀다(이 롤은 app 함수만 만든다)
  ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
END $$;
