-- B0 집계 핑(architecture.md v2.1 3-1·3-6). 식별자 없는 칸 + 개수. IP·기기·계정·시각 열 없음.
-- CreateTable
CREATE TABLE "app"."metric_daily" (
    "day" DATE NOT NULL,
    "event" VARCHAR(16) NOT NULL,
    "cohort_day" DATE NOT NULL,
    "day_n" SMALLINT NOT NULL,
    "platform" VARCHAR(8) NOT NULL,
    "app_ver" VARCHAR(24) NOT NULL,
    "lang" CHAR(2) NOT NULL,
    "nt" CHAR(1) NOT NULL,
    "wg" CHAR(1) NOT NULL,
    "moon" CHAR(1) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "metric_daily_pkey" PRIMARY KEY ("day","event","cohort_day","day_n","platform","app_ver","lang","nt","wg","moon")
);

-- init과 같은 규칙: RLS 켜고 정책 0개, Data API 롤 권한 회수(있을 때만)
ALTER TABLE "app"."metric_daily" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE app.metric_daily FROM %I', r);
    END IF;
  END LOOP;
END $$;
