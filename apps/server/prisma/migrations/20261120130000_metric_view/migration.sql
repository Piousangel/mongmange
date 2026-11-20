-- B0 리뷰 I2: 원표(metric_daily)는 서비스 롤(표 소유자 prisma)만 읽는다. 사람이 보는 조회는 칸 수 5 미만을 숨긴 뷰로만.
-- 뷰는 소유자 권한으로 돈다(security_invoker 끔) — 조회 롤은 원표 권한 없이 뷰만 읽는다. 원표 내보내기 금지는 docs/ops/metrics/README.md.
CREATE VIEW "app"."metric_daily_k5" AS
  SELECT "day", "event", "cohort_day", "day_n", "platform", "app_ver", "lang", "nt", "wg", "moon", "count"
  FROM "app"."metric_daily"
  WHERE "count" >= 5;

DO $$
BEGIN
  -- 조회 롤이 있으면(로컬 00-roles.sql, 운영은 B6에서 만든 뒤 이 GRANT를 다시 돌린다) 뷰만 허용
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'metrics_reader') THEN
    GRANT USAGE ON SCHEMA app TO metrics_reader;
    GRANT SELECT ON app.metric_daily_k5 TO metrics_reader;
    REVOKE ALL ON TABLE app.metric_daily FROM metrics_reader;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON app.metric_daily_k5 FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON app.metric_daily_k5 FROM authenticated;
  END IF;
END $$;
