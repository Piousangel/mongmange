-- 로컬(compose)·CI 전용 Postgres 초기화: Supabase의 롤 관계를 흉내 낸다(B1 리뷰 I4). 운영 Supabase에서는 돌리지 않는다.
--  - prisma: 마이그레이션과 런타임이 함께 쓰는 롤(정본 2-4 'Nest는 prisma 롤 = 표 소유자'). 슈퍼유저·BYPASSRLS 아님.
--    → RLS(ENABLE, 정책 0개)를 표 소유자라서 통과한다. 소유자가 다른 롤로 런타임을 붙이면 0행이 된다(db 시험이 보여 줌).
--  - metrics_reader: 대시보드 조회 롤 자리(app.metric_daily_k5 뷰만).
--  - anon·authenticated: Supabase Data API 롤 자리. 시험이 SET ROLE로 흉내 내도록 prisma에 멤버십만 준다(운영에서는 주지 않는다).
-- 비밀번호는 로컬 고정값(운영 값 아님).
CREATE ROLE prisma LOGIN PASSWORD 'prisma-local' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
-- 집계 조회 전용 롤 자리(B0 리뷰 I2): 칸 5 미만을 숨긴 뷰만 읽는다. 운영에서는 B6에서 같은 이름으로 만든다
CREATE ROLE metrics_reader NOLOGIN NOINHERIT;
-- OTA 게시 롤(V21, 리뷰 M4): ota_releases·ota_revoked에 SELECT·INSERT만(마이그레이션이 GRANT·정책을 건다). prisma는 이 롤의 멤버가 아니다 —
-- 서버가 게시 권한을 빌릴 수 없게. 운영은 B6에서 같은 이름으로(비밀번호 = 오너 보관)
CREATE ROLE ota_publisher LOGIN PASSWORD 'ota-publisher-local' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT anon, authenticated, metrics_reader TO prisma;
GRANT CONNECT, CREATE ON DATABASE mong TO prisma;
GRANT CONNECT ON DATABASE mong TO ota_publisher;
GRANT USAGE, CREATE ON SCHEMA public TO prisma;
