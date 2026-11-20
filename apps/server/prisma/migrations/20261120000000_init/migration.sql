
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateTable
CREATE TABLE "app"."users" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_month" DATE,
    "locale" CHAR(2),
    "age_gate_v" SMALLINT,
    "age_confirmed_on" DATE,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."creatures" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code" CHAR(8) NOT NULL,
    "link_enabled" BOOLEAN NOT NULL DEFAULT false,
    "name_visible" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."saves" (
    "creature_id" UUID NOT NULL,
    "rev" INTEGER NOT NULL,
    "body" BYTEA NOT NULL,
    "body_sha256" BYTEA NOT NULL,
    "envelope_ver" SMALLINT NOT NULL,
    "sim_ver" SMALLINT NOT NULL,
    "validated" BOOLEAN NOT NULL,
    "client_saved_at" TIMESTAMPTZ(6) NOT NULL,
    "day_index" INTEGER NOT NULL,
    "strokes_total" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "saves_pkey" PRIMARY KEY ("creature_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "creatures_user_id_key" ON "app"."creatures"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "creatures_code_key" ON "app"."creatures"("code");

-- AddForeignKey
ALTER TABLE "app"."creatures" ADD CONSTRAINT "creatures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."saves" ADD CONSTRAINT "saves_creature_id_fkey" FOREIGN KEY ("creature_id") REFERENCES "app"."creatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase 전용(architecture.md 2-4): app 스키마 표는 RLS를 켜고 정책을 두지 않는다.
-- Data API(anon·authenticated 롤)로는 아무것도 읽을 수 없고, Nest는 소유자 롤로 접속한다. 일반 Postgres에서도 그대로 돈다.
ALTER TABLE "app"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app"."creatures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app"."saves" ENABLE ROW LEVEL SECURITY;

-- 방어 겹(B1 리뷰 I4): Supabase Data API 롤이 있으면 app 스키마 권한을 모두 거둔다. 일반 Postgres(롤 없음)에서는 건너뛴다.
-- 표 소유자 = 이 마이그레이션을 돌린 롤 = 런타임 롤(prisma)이어야 한다(B6 체크리스트).
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA app FROM %I', r);
      EXECUTE format('REVOKE ALL ON SCHEMA app FROM %I', r);
    END IF;
  END LOOP;
END $$;
