-- B2 맡겨 두기(architecture.md v2.2 3-1·3-3·3-4-1·3-8). 위쪽은 prisma migrate diff가 만든 그대로, 아래 '수작업' 절은 Prisma가 표현하지 못하는 것.
-- CreateEnum
CREATE TYPE "app"."save_version_reason" AS ENUM ('overwritten', 'weekly', 'conflict', 'pre_restore');

-- CreateEnum
CREATE TYPE "app"."deletion_channel" AS ENUM ('app', 'web', 'email');

-- CreateEnum
CREATE TYPE "app"."deletion_kind" AS ENUM ('user_request', 'web_request', 'inactive', 'report_confirmed', 'restore_reapply');

-- CreateEnum
CREATE TYPE "app"."storage_gc_reason" AS ENUM ('old_version', 'uncommitted', 'quarantine_expiry', 'deletion');

-- AlterTable
ALTER TABLE "app"."creatures" ADD COLUMN     "recovery_hash" BYTEA,
ADD COLUMN     "recovery_pepper_v" SMALLINT,
ADD COLUMN     "recovery_rotated_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "app"."saves" ADD COLUMN     "quota_bytes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "quota_day" DATE,
ALTER COLUMN "day_index" DROP NOT NULL,
ALTER COLUMN "strokes_total" DROP NOT NULL;

-- CreateTable
CREATE TABLE "app"."user_auth" (
    "sub" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "linked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_auth_pkey" PRIMARY KEY ("sub")
);

-- CreateTable
CREATE TABLE "app"."save_versions" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "creature_id" UUID NOT NULL,
    "rev" INTEGER NOT NULL,
    "body" BYTEA NOT NULL,
    "body_sha256" BYTEA NOT NULL,
    "envelope_ver" SMALLINT NOT NULL,
    "sim_ver" SMALLINT NOT NULL,
    "validated" BOOLEAN NOT NULL,
    "day_index" INTEGER,
    "strokes_total" INTEGER,
    "client_saved_at" TIMESTAMPTZ(6) NOT NULL,
    "reason" "app"."save_version_reason" NOT NULL,
    "iso_week" CHAR(8),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "save_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."deletion_log" (
    "id" BIGSERIAL NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "channel" "app"."deletion_channel" NOT NULL,
    "kind" "app"."deletion_kind" NOT NULL,
    "items" JSONB NOT NULL,
    "receipt_hash" BYTEA,
    "receipt_expires_at" TIMESTAMPTZ(6),
    "subject_hmac" BYTEA,
    "subject_expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "deletion_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."storage_gc" (
    "id" BIGSERIAL NOT NULL,
    "bucket" VARCHAR(32) NOT NULL,
    "prefix" TEXT NOT NULL,
    "creature_id" UUID,
    "deletion_id" BIGINT,
    "reason" "app"."storage_gc_reason" NOT NULL,
    "not_before" TIMESTAMPTZ(6) NOT NULL,
    "attempts" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "storage_gc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."auth_gc" (
    "sub" UUID NOT NULL,
    "deletion_id" BIGINT,
    "not_before" TIMESTAMPTZ(6) NOT NULL,
    "attempts" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "auth_gc_pkey" PRIMARY KEY ("sub")
);

-- CreateIndex
CREATE INDEX "user_auth_user_id_idx" ON "app"."user_auth"("user_id");

-- CreateIndex
CREATE INDEX "user_auth_linked_at_idx" ON "app"."user_auth"("linked_at");

-- CreateIndex
CREATE UNIQUE INDEX "save_versions_public_id_key" ON "app"."save_versions"("public_id");

-- CreateIndex
CREATE INDEX "save_versions_creature_id_reason_created_at_idx" ON "app"."save_versions"("creature_id", "reason", "created_at" DESC);

-- CreateIndex
CREATE INDEX "save_versions_created_at_idx" ON "app"."save_versions"("created_at");

-- CreateIndex
CREATE INDEX "deletion_log_receipt_hash_idx" ON "app"."deletion_log"("receipt_hash");

-- CreateIndex
CREATE INDEX "deletion_log_subject_hmac_idx" ON "app"."deletion_log"("subject_hmac");

-- CreateIndex
CREATE INDEX "storage_gc_not_before_idx" ON "app"."storage_gc"("not_before");

-- CreateIndex
CREATE INDEX "storage_gc_creature_id_idx" ON "app"."storage_gc"("creature_id");

-- CreateIndex
CREATE INDEX "storage_gc_deletion_id_idx" ON "app"."storage_gc"("deletion_id");

-- CreateIndex
CREATE INDEX "auth_gc_not_before_idx" ON "app"."auth_gc"("not_before");

-- CreateIndex
CREATE INDEX "auth_gc_deletion_id_idx" ON "app"."auth_gc"("deletion_id");

-- CreateIndex
CREATE UNIQUE INDEX "creatures_recovery_hash_key" ON "app"."creatures"("recovery_hash");

-- AddForeignKey
ALTER TABLE "app"."user_auth" ADD CONSTRAINT "user_auth_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."save_versions" ADD CONSTRAINT "save_versions_creature_id_fkey" FOREIGN KEY ("creature_id") REFERENCES "app"."creatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ───────────── 수작업(Prisma 스키마 밖 — test/db.db.test.ts가 고정) ─────────────

-- 쓰는 기기는 하나(3-1 user_auth): 끊기지 않은 로그인은 사용자당 하나
CREATE UNIQUE INDEX "user_auth_one_live_per_user" ON "app"."user_auth"("user_id") WHERE "revoked_at" IS NULL;

-- 주 1벌(3-4-1): 같은 몽망이·같은 ISO 주의 weekly는 하나. PUT은 ON CONFLICT … DO NOTHING으로 넣고 안 들어가면 overwritten(I3)
CREATE UNIQUE INDEX "save_versions_one_weekly" ON "app"."save_versions"("creature_id", "iso_week") WHERE "reason" = 'weekly';

-- weekly 행에는 iso_week가 반드시, 다른 칸에는 없어야 한다(위 부분 UNIQUE가 NULL 때문에 비지 않게)
ALTER TABLE "app"."save_versions" ADD CONSTRAINT "save_versions_iso_week_only_weekly"
  CHECK (("reason" = 'weekly') = ("iso_week" IS NOT NULL));

-- B1 사용자 한 명당 기기 로그인 한 행(B1: users.id = 첫 기기의 auth.users.id)
INSERT INTO "app"."user_auth" ("sub", "user_id", "linked_at")
SELECT "id", "id", "created_at" FROM "app"."users"
ON CONFLICT DO NOTHING;

-- 이력 솎기(3-4-1, pg_cron 매일 04:00 KST — 예약 등록은 B6). 기간과 개수 중 먼저 걸리는 쪽 → 기간 쪽을 여기서.
-- overwritten·weekly 28일, conflict·pre_restore 30일. 처리방침 6절 '최대 4주'가 이 함수에 기댄다(A4 리뷰 I1).
-- at은 시험이 '29일 뒤'를 주입하려고 받는다. 지운 행 수를 돌려준다.
CREATE OR REPLACE FUNCTION "app"."prune_save_versions"("at" timestamptz DEFAULT now())
RETURNS integer LANGUAGE sql AS $$
  WITH d AS (
    DELETE FROM app.save_versions
     WHERE (reason IN ('overwritten', 'weekly') AND created_at < "at" - interval '28 days')
        OR (reason IN ('conflict', 'pre_restore') AND created_at < "at" - interval '30 days')
    RETURNING 1
  )
  SELECT count(*)::integer FROM d;
$$;

-- 삭제 기록 만료(3-8, 같은 pg_cron 묶음): 영수증 해시는 24시간, 지운 사용자 HMAC은 백업 보관 기간(7일) 뒤 NULL.
-- 그 뒤 deletion_log에는 개수·시각·경로만 남는다.
CREATE OR REPLACE FUNCTION "app"."expire_deletion_log"("at" timestamptz DEFAULT now())
RETURNS integer LANGUAGE sql AS $$
  -- 한 행을 한 문장에서 두 번 UPDATE할 수 없으므로(CTE 둘이면 한쪽이 조용히 빠진다) CASE 한 번으로
  WITH u AS (
    UPDATE app.deletion_log SET
      receipt_hash       = CASE WHEN receipt_expires_at <= "at" THEN NULL ELSE receipt_hash END,
      receipt_expires_at = CASE WHEN receipt_expires_at <= "at" THEN NULL ELSE receipt_expires_at END,
      subject_hmac       = CASE WHEN subject_expires_at <= "at" THEN NULL ELSE subject_hmac END,
      subject_expires_at = CASE WHEN subject_expires_at <= "at" THEN NULL ELSE subject_expires_at END
     WHERE receipt_expires_at <= "at" OR subject_expires_at <= "at"
    RETURNING 1
  )
  SELECT count(*)::integer FROM u;
$$;

-- 새 표도 RLS 켜고 정책 0개(2-4). Data API 롤 권한 회수는 init과 같은 DO 블록
ALTER TABLE "app"."user_auth" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app"."save_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app"."deletion_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app"."storage_gc" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app"."auth_gc" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA app FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM %I', r);
    END IF;
  END LOOP;
END $$;
