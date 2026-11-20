-- 처리방침 6절 '이용 통계: 90일 뒤 월 합계로 바꿈'을 참으로 만드는 작업(B0 리뷰 반영).
-- metric_daily에서 cutoff 이전 날짜의 행을 지우면서 월 단위로 합쳐 metric_monthly에 더한다(한 문장 — 중간 실패로 이중 계산되지 않음).
-- 월 표에는 정확한 날짜·설치일·보름·위젯 칸이 없다(달 단위, 코호트도 달 단위). 실행 예약(pg_cron 매일 1회)은 B6.
CREATE TABLE "app"."metric_monthly" (
    "month" DATE NOT NULL,
    "cohort_month" DATE NOT NULL,
    "event" VARCHAR(16) NOT NULL,
    "day_n" SMALLINT NOT NULL,
    "platform" VARCHAR(8) NOT NULL,
    "app_ver" VARCHAR(24) NOT NULL,
    "lang" CHAR(2) NOT NULL,
    "nt" CHAR(1) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "metric_monthly_pkey" PRIMARY KEY ("month","cohort_month","event","day_n","platform","app_ver","lang","nt")
);
ALTER TABLE "app"."metric_monthly" ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION "app"."rollup_metric_daily"(cutoff DATE DEFAULT (CURRENT_DATE - 90)) RETURNS INTEGER
LANGUAGE sql AS $$
  WITH moved AS (
    DELETE FROM app.metric_daily WHERE day < cutoff
    RETURNING day, cohort_day, event, day_n, platform, app_ver, lang, nt, count
  ), ins AS (
    INSERT INTO app.metric_monthly (month, cohort_month, event, day_n, platform, app_ver, lang, nt, count)
    SELECT date_trunc('month', day)::date, date_trunc('month', cohort_day)::date, event, day_n, platform, app_ver, lang, nt, SUM(count)::int
    FROM moved
    GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
    ON CONFLICT (month, cohort_month, event, day_n, platform, app_ver, lang, nt)
    DO UPDATE SET count = app.metric_monthly.count + EXCLUDED.count
    RETURNING 1
  )
  SELECT COUNT(*)::int FROM moved;
$$;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'metrics_reader'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE app.metric_monthly FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION app.rollup_metric_daily(date) FROM %I', r);
    END IF;
  END LOOP;
  REVOKE ALL ON FUNCTION app.rollup_metric_daily(date) FROM PUBLIC;
END $$;
