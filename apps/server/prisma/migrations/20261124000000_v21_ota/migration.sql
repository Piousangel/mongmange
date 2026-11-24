-- V21 자체 OTA(docs/design/server-v1/ota-self-host.md, DECISIONS '법률 1차 검토 뒤 오너 결정 3'·'V21 자체 OTA 구현 결정', legal-review-v1 C-1).
-- 게시 목록 + 되돌린 번들 목록. 사용자·설치와 무관 — 설치 id(EAS-Client-ID)·IP·기기 정보·현재 업데이트 id·오류 텍스트를 담는 칸이 없다.
-- 권한(리뷰 M4, DB가 강제): 쓰기 = 게시 롤 `ota_publisher`(SELECT·INSERT만 — 수정·삭제 없음), 서버 런타임 롤 = SELECT만.
-- 서버 롤은 표 소유자라 RLS를 그냥 지나가므로 FORCE ROW LEVEL SECURITY로 소유자에게도 정책을 건다. 정책은 SELECT(둘)·INSERT(게시 롤)뿐.
-- 남은 한계: 소유자는 DDL로 FORCE를 끌 수 있다(소유자 분리는 B6 Supabase 롤 설계에서). `ota_publisher`는 로컬·CI는 prisma/local/00-roles.sql,
-- 운영은 B6에서 같은 이름으로 만들고(비밀번호 = 오너 보관) 이 마이그레이션의 GRANT·정책 블록을 다시 돌린다.

CREATE TYPE "app"."ota_kind" AS ENUM ('update', 'rollback');

CREATE TABLE "app"."ota_releases" (
    "id" UUID NOT NULL,
    "channel" VARCHAR(32) NOT NULL,
    "runtime_version" VARCHAR(128) NOT NULL,
    "platform" VARCHAR(8) NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" "app"."ota_kind" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    -- 서명한 JSON 원문(다시 직렬화하지 않는다). 원문 안의 seq·channel을 서버가 행과 대조한다
    "body" TEXT NOT NULL,
    "signature" TEXT,
    "key_id" VARCHAR(64),
    "asset_hashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "ota_releases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ota_releases_platform_check" CHECK ("platform" IN ('ios', 'android')),
    CONSTRAINT "ota_releases_channel_check" CHECK ("channel" ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
    CONSTRAINT "ota_releases_seq_check" CHECK ("seq" > 0),
    -- 롤백 지시는 에셋이 없고, 업데이트는 launchAsset 하나 이상
    CONSTRAINT "ota_releases_assets_check" CHECK (("kind" = 'rollback') = (cardinality("asset_hashes") = 0))
);

-- 판 번호는 (채널·런타임·플랫폼) 안에서 하나뿐 — 동시에 둘이 같은 번호로 게시하면 하나는 실패한다. 서버는 이 색인을 거꾸로 읽어 가장 큰 seq를 고른다
CREATE UNIQUE INDEX "ota_releases_channel_runtime_version_platform_seq_key"
  ON "app"."ota_releases"("channel", "runtime_version", "platform", "seq");

CREATE TABLE "app"."ota_revoked" (
    "launch_hash" VARCHAR(43) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "reason" VARCHAR(200),
    CONSTRAINT "ota_revoked_pkey" PRIMARY KEY ("launch_hash")
);

ALTER TABLE "app"."ota_releases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app"."ota_releases" FORCE ROW LEVEL SECURITY;
ALTER TABLE "app"."ota_revoked" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app"."ota_revoked" FORCE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
DECLARE t text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE app.ota_releases, app.ota_revoked FROM %I', r);
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['ota_releases', 'ota_revoked'] LOOP
    -- 서버 런타임 롤(= 이 마이그레이션을 돌리는 롤, 표 소유자): 읽기만
    EXECUTE format('CREATE POLICY %I ON app.%I FOR SELECT TO %I USING (true)', t || '_server_read', t, current_user);
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'ota_publisher') THEN
      EXECUTE format('GRANT SELECT, INSERT ON TABLE app.%I TO ota_publisher', t);
      EXECUTE format('CREATE POLICY %I ON app.%I FOR SELECT TO ota_publisher USING (true)', t || '_publisher_read', t);
      EXECUTE format('CREATE POLICY %I ON app.%I FOR INSERT TO ota_publisher WITH CHECK (true)', t || '_publisher_insert', t);
    END IF;
  END LOOP;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'ota_publisher') THEN
    GRANT USAGE ON SCHEMA app TO ota_publisher;
    GRANT USAGE ON TYPE app.ota_kind TO ota_publisher;
  END IF;
END $$;
