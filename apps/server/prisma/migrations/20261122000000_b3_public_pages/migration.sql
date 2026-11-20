-- B3 공유 링크·웹 뷰어(architecture.md v2.2 3-1·3-5·3-5-3·3-6·3-9).
-- public_pages: 몽망이마다 공개 사본 하나(판 번호·상태·공개 경로·커밋 전 판). link_daily: 코드별 페이지 로드·스토어 이동(30일).
-- link_funnel_daily: 코드 없는 합계. cdn_purge: /m HTML CDN 무효화 대기(한 행 — 경로·코드를 담지 않는다: Firebase 릴리스는 사이트 전체를 비운다).

CREATE TYPE "app"."page_state" AS ENUM ('live', 'off', 'quarantined', 'removed');
CREATE TYPE "app"."link_event" AS ENUM ('view', 'store_ios', 'store_android', 'open_app');
-- 격리 이동 대기(B3 리뷰 M5): 공개 → quarantine 이동이 일부만 되면 대기열이 다시 옮긴다. 이 마이그레이션 안에서는 쓰지 않는다(같은 트랜잭션 제약)
ALTER TYPE "app"."storage_gc_reason" ADD VALUE 'quarantine_move';

CREATE TABLE "app"."public_pages" (
    "creature_id" UUID NOT NULL,
    -- 몽망이별 저장소 접두(서버 난수 128비트, 16진 32자). 모든 판의 파일 = {store_key}/{pageKey}/파일 —
    -- 계정 삭제가 이 접두로 세 버킷을 통째로 훑어 지운다(마지막 그물, B3 리뷰 I1). 코드·몽망이 id에서 파생하지 않는다
    "store_key" TEXT NOT NULL DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text),
    "ver" INTEGER NOT NULL DEFAULT 0,
    "state" "app"."page_state" NOT NULL DEFAULT 'off',
    "meta" JSONB,
    "name_shown" BOOLEAN NOT NULL DEFAULT false,
    "path_prefix" TEXT,
    "has_loop" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(6),
    "state_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "pending_ver" INTEGER,
    "pending_prefix" TEXT,
    "pending_meta" JSONB,
    "pending_name_shown" BOOLEAN,
    "pending_has_loop" BOOLEAN,
    CONSTRAINT "public_pages_pkey" PRIMARY KEY ("creature_id"),
    -- live면 공개 경로가 반드시 있다(경로 없는 live = 빈 페이지가 캐시되는 사고)
    CONSTRAINT "public_pages_live_has_prefix" CHECK ("state" <> 'live' OR "path_prefix" IS NOT NULL),
    -- 커밋 전 판의 칸은 함께 있거나 함께 없다
    CONSTRAINT "public_pages_pending_together" CHECK (("pending_ver" IS NULL) = ("pending_prefix" IS NULL) AND ("pending_ver" IS NULL) = ("pending_meta" IS NULL))
);
CREATE UNIQUE INDEX "public_pages_store_key_key" ON "app"."public_pages"("store_key");
CREATE INDEX "public_pages_state_idx" ON "app"."public_pages"("state");
ALTER TABLE "app"."public_pages" ADD CONSTRAINT "public_pages_creature_id_fkey"
  FOREIGN KEY ("creature_id") REFERENCES "app"."creatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "app"."link_daily" (
    "day" DATE NOT NULL,
    "code" CHAR(8) NOT NULL,
    "event" "app"."link_event" NOT NULL,
    "count" INTEGER NOT NULL,
    CONSTRAINT "link_daily_pkey" PRIMARY KEY ("day", "code", "event")
);
CREATE INDEX "link_daily_code_idx" ON "app"."link_daily"("code");

CREATE TABLE "app"."link_funnel_daily" (
    "day" DATE NOT NULL,
    "event" "app"."link_event" NOT NULL,
    "count" INTEGER NOT NULL,
    CONSTRAINT "link_funnel_daily_pkey" PRIMARY KEY ("day", "event")
);

CREATE TABLE "app"."cdn_purge" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "requested_at" TIMESTAMPTZ(6),
    "released_at" TIMESTAMPTZ(6),
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    CONSTRAINT "cdn_purge_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cdn_purge_single_row" CHECK ("id" = 1)
);
INSERT INTO "app"."cdn_purge" ("id") VALUES (1) ON CONFLICT DO NOTHING;

-- link_daily 30일 말기(3-1, 처리방침 6절 '링크 페이지 로드 수 30일 뒤 코드 없는 합계'). pg_cron 예약 등록은 B6.
-- 삭제와 합산이 한 문장(중간에 실패하면 둘 다 없던 일).
CREATE OR REPLACE FUNCTION "app"."rollup_link_daily"("at" date DEFAULT current_date)
RETURNS integer LANGUAGE sql AS $$
  WITH d AS (
    DELETE FROM app.link_daily WHERE day < "at" - 30 RETURNING day, event, count
  ), s AS (
    INSERT INTO app.link_funnel_daily (day, event, count)
    SELECT day, event, sum(count)::int FROM d GROUP BY day, event
    ON CONFLICT (day, event) DO UPDATE SET count = app.link_funnel_daily.count + EXCLUDED.count
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM d)::integer;
$$;

ALTER TABLE "app"."public_pages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app"."link_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app"."link_funnel_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app"."cdn_purge" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA app FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM %I', r);
    END IF;
  END LOOP;
  -- 함수 기본 EXECUTE(PUBLIC)도 회수(B0 rollup_metric_daily와 같은 방식, B3 리뷰 L2)
  REVOKE ALL ON FUNCTION app.rollup_link_daily(date) FROM PUBLIC;
END $$;
