-- 판정 전 단조 검사(B0 리뷰 I5). 인증 없는 핑이라 분자(n일째 열기·사건)만 부풀리는 조작이 가능하다.
-- 같은 코호트 묶음(cohort_day·platform·app_ver·lang·nt)에서 아래가 하나라도 깨지면 그 코호트 묶음을 판정에서 뺀다.
--   ① n일째 열기 ≤ 설치일(0일째) 열기   ② 평생 한 번 사건(어느 날이든 합) ≤ 설치일 열기
-- 결과 = 깨진 묶음 목록(빈 결과면 통과). 서비스 롤(원표 접근)로만 돌린다. 판정 SQL은 이 결과를 제외 조건으로 쓴다.
WITH base AS (
  SELECT cohort_day, platform, app_ver, lang, nt, SUM(count) AS open0
  FROM app.metric_daily
  WHERE event = 'open' AND day_n = 0
  GROUP BY cohort_day, platform, app_ver, lang, nt
),
opens AS (
  SELECT cohort_day, platform, app_ver, lang, nt, day_n, SUM(count) AS n
  FROM app.metric_daily
  WHERE event = 'open' AND day_n > 0
  GROUP BY cohort_day, platform, app_ver, lang, nt, day_n
),
onces AS (
  SELECT cohort_day, platform, app_ver, lang, nt, event, SUM(count) AS n
  FROM app.metric_daily
  WHERE event IN ('first_tap', 'first_night', 'ire7', 'name_set', 'ink_chosen', 'cloud_on')
  GROUP BY cohort_day, platform, app_ver, lang, nt, event
)
SELECT o.cohort_day, o.platform, o.app_ver, o.lang, o.nt, 'open_d' || o.day_n AS rule, o.n AS value, COALESCE(b.open0, 0) AS open0
FROM opens o LEFT JOIN base b USING (cohort_day, platform, app_ver, lang, nt)
WHERE o.n > COALESCE(b.open0, 0)
UNION ALL
SELECT e.cohort_day, e.platform, e.app_ver, e.lang, e.nt, e.event AS rule, e.n AS value, COALESCE(b.open0, 0) AS open0
FROM onces e LEFT JOIN base b USING (cohort_day, platform, app_ver, lang, nt)
WHERE e.n > COALESCE(b.open0, 0)
ORDER BY cohort_day, rule;
