# B6 배포 — 오너 단계별 안내서 (처음이면 75~120분, DNS 대기 제외 — 두 번에 나눠도 됨)

- 작성: DV-3(서버·배포), 2026-11-25. 독립 리뷰 반영(`docs/team/reviews/2026-11-25-b6-prep-review.md`, 조건부 통과 → 높음 2·중간 11·낮음 10 반영).
- 대상: 오너(계정·결제·도메인·키를 가진 사람). 팀은 원격 자원을 만들지 않았다 — 아래 명령은 **오너 노트북에서 오너가** 실행한다.
- 근거: architecture.md v2.2(2-3·2-4·5-2·6-4·8·9-3), B7-report 5·6절, B4-report 3절 10·12, ota-self-host.md 6절, DECISIONS(D-21·D-26·V21·PM 11-25·B6 배포 준비), roadmap B6(소프트런칭 01-12 전, Supabase Pro 01-08 전), 처리방침 K6·K21, apps/web-static/README.md(PRIVACY_OFFICER).
- 팀이 미리 만든 설정: `apps/server/deploy/`(서비스 YAML·Scheduler 잡 3개·정리 정책·`deploy.sh`, 팀용 README). `deploy.sh`는 **기본이 미리 보기**이고 `--apply`를 붙여야 실행된다. `--apply`는 자리표시자 값(`000000000000`·`REPLACE`)을 거부하고 프로젝트 번호를 gcloud로 대조한다.
- 지역: **GCP 서울 `asia-northeast3`**(Cloud Run·Artifact Registry·Scheduler·Secret Manager·로그 버킷), **Supabase 서울 `ap-northeast-2`**(architecture 0절·2-4).

> **요청 순서와 다른 점**: ① 로그 설정(요청 로그 제외·서울 버킷)을 **첫 배포 전**(3단계)으로 당겼다 — 첫 요청부터 플랫폼 로그가 global 버킷에 쌓이지 않게. ② Supabase와 비밀값을 Cloud Run 첫 배포 앞으로 당겼다 — 운영 이미지는 DB 주소·키·pepper·토큰이 없으면 부팅을 거부한다(`apps/server/src/config/env.ts`).

| # | 단계 | 시간(처음 기준) | 막히면 |
|---|---|---|---|
| 0 | 준비물 + 2단계 인증 | 15~25분(설치 포함) | — |
| 1 | GCP 프로젝트 | 3분 | 프로젝트 ID가 이미 쓰임 → 다른 ID |
| 2 | 결제 연결 | 3분 | — |
| 3 | API 켜기 + 예산 알림 + 로그 설정 | 5분 | 결제가 안 붙어 있으면 실패 |
| 4 | Artifact Registry | 2분 | — |
| 5 | 서비스 계정·최소 권한 + 비밀 자리 | 3분 | — |
| 6 | Supabase 프로젝트(서울, Pro는 01-08 전) | 10~15분(생성 대기 포함) | — |
| 7 | DB 롤·마이그레이션·pg_cron | 10분 | 7-4 권한 오류 → 팀에 알림 |
| 8 | 비밀값 넣기(Secret Manager) + 키 보관함 만들기 | 10분 | — |
| — | **여기서 끊어도 된다(중단점)** | | 다음 날 9단계부터 |
| 9 | Cloud Run 첫 배포 | 15~25분(Apple Silicon에서 amd64 빌드) | B7a 커밋 전이면 `build`가 멈춤 — 팀에 알림 |
| 10 | Scheduler + 스모크 | 3분 | `smoke`가 까닭을 찍고 멈춤 → 팀에 알림 |
| 11 | 로그 규칙 확인(K6 증거) | 3분 | — |
| 12 | Firebase Hosting 연결·도메인 | 10분 + DNS 대기 | 인증서 발급은 최대 24시간 |
| 13 | 원격 설정 서명 키·OTA 서명 키(오프라인) | 10분 | — |
| 14 | `PRIVACY_OFFICER` 상호 입력 + 첫 정적 배포 | 5분 | 스토어 값이 없으면 막힌다 — 14-1 |

---

## 0. 준비물 + 2단계 인증

```sh
brew install --cask google-cloud-sdk          # gcloud
npm install -g firebase-tools                   # firebase
gcloud auth login                               # 오너 Google 계정
firebase login
cd ~/Developer/mongmange && git pull && pnpm install
```
- Docker Desktop이 켜져 있어야 한다(9단계 이미지 빌드).
- 비밀번호 관리자(1Password·Bitwarden 등)를 열어 둔다. 이 안내서에서 만드는 비밀번호는 **영문 대소문자·숫자만, 32자**로 생성한다(`@ : / # ? %`가 들어가면 7·8단계의 `postgresql://…` 주소가 깨진다).
- **2단계 인증(처리방침 14절·K21)** — 관리 계정 세 곳 모두 켜고, 켜진 설정 화면을 캡처해 팀에 보낸다(K21 증거):
  - Google 계정(GCP·Firebase): myaccount.google.com → 보안 → 2단계 인증.
  - Supabase: 대시보드 → 계정 → Security → Multi-factor authentication.
  - Cloudflare: My Profile → Authentication → Two-Factor Authentication.
- **확인**: `gcloud --version`, `firebase --version`, `docker info` 가 오류 없이 나오고, 2단계 인증 캡처 3장이 있다.

## 1. GCP 프로젝트

1. https://console.cloud.google.com → 위쪽 프로젝트 선택 → **새 프로젝트** → 이름 `mongmange`, 조직 없음 → 만들기.
   프로젝트 ID가 이미 쓰였다고 나오면 `mongmange-ink` 같은 다른 ID를 쓴다.
2. 입력 파일을 만든다(비밀값이 아닌 것만 들어간다. 저장소 밖에 둔다):
   ```sh
   mkdir -p ~/.config/mong && cp apps/server/deploy/deploy.env.example ~/.config/mong/deploy.env
   gcloud config set project <프로젝트 ID>
   gcloud projects describe <프로젝트 ID> --format='value(projectNumber)'   # 이 숫자를 PROJECT_NUMBER에
   open -e ~/.config/mong/deploy.env      # PROJECT_ID·PROJECT_NUMBER 채우기
   ```
- **확인**: `apps/server/deploy/deploy.sh check` 가 `check 통과`를 찍는다(이 명령은 아무것도 만들지 않는다).

## 2. 결제 연결

1. 콘솔 → **결제** → '이 프로젝트에 결제 계정 연결' → 기존 **'내 결제 계정'**(11-20 확인된 계정) 선택.
2. 결제 → 계정 관리에서 결제 계정 ID(`XXXXXX-XXXXXX-XXXXXX`)와 **통화**를 본다 → `deploy.env`의 `BILLING_ACCOUNT`, `BUDGET_AMOUNT`(원화 계정이면 `160000KRW`처럼, 달러면 `120USD`).
- **확인**: `gcloud billing projects describe <프로젝트 ID> --format='value(billingEnabled)'` → `True`.
- 예산 알림은 예산 API를 켠 뒤라야 하므로 3단계에서 함께 만든다. 예산은 **알림일 뿐 지출을 멈추지 않는다**. 실제 상한은 Cloud Run 최대 인스턴스 3과 버킷 크기 제한뿐이다(architecture 8절). 알림 메일은 결제 계정 관리자(오너)에게 간다.

### 비용 예상

| 항목 | 지금 ~ 01-07 | 01-08 ~ 소프트런칭 | 무료 한도와 비교 |
|---|---|---|---|
| Cloud Run(min 0, 요청 기반 과금) | 0 | 0 | 널리 알려진 무료 한도는 월 180,000 vCPU초·360,000 GiB초·200만 요청. 우리 고정 부하는 Scheduler 호출 약 5.2만 건/월 ≈ 수천 vCPU초 → 한도 안으로 본다. **[확인 필요: 서울(Tier 2)에도 같은 무료 한도가 적용되는지 — 공식 가격 페이지 원문을 받지 못함. 오너 실행 전 팀이 가격 계산기로 확인]** |
| Cloud Run 인터넷 송신(앱 API 응답·Cloud Run → Firebase rewrite 구간) | 0 | 소액 | **[확인 필요: 서울 송신 단가·무료분]**. 링크 HTML·JSON은 작다 |
| Artifact Registry | 0 | 0 | 0.5GB 무료. 이미지 약 150MB(압축) × 최근 5개 보존(정리 정책) — 한도 근처. 넘어도 GB당 월 0.1달러 수준 |
| Secret Manager | 0 | 0 | 활성 비밀 판 6개·접근 1만 회 무료. 우리는 4개(교체 직후 잠시 옛 판까지 8개 — 옛 판은 하루 뒤 끈다) |
| Cloud Scheduler | 0 | 0 | **결제 계정당** 잡 3개 무료. 우리는 정확히 3개. 같은 결제 계정의 다른 프로젝트에 잡이 있으면 잡당 월 0.1달러 |
| Cloud Logging | 0 | 0 | 수집 50GiB/월 무료, 7일 보존 무료. 플랫폼 요청 로그는 받지 않는다 |
| Cloud Monitoring(업타임·알림, B7 6절 — 팀이 나중에) | 0 | **[확인 필요]** | 업타임 체크·알림 정책 요금은 설정할 때 확인 |
| Firebase Hosting(Blaze) | 0 | 0~1달러 | 공식 가격 페이지: 저장 10GB, 전송 **하루 360MB** 무료(일 단위로 셈), 넘으면 GB당 0.15달러. 링크가 퍼지는 날은 월 합계가 작아도 그날 과금될 수 있다 |
| Supabase | 0(Free) | **25달러(Pro)** | Pro는 **01-08 전** 전환(D-26). Free는 7일 무활동 일시 정지·백업 없음 |
| 도메인 | 이미 결제(연 25.20달러) | — | — |
| **합계(월)** | **약 0~1달러** | **약 25~30달러** | architecture 8절 '소프트런칭 25~30달러 + 도메인'과 같다(단 [확인 필요] 두 줄) |

## 3. API 켜기 + 예산 알림 + 로그 설정

```sh
apps/server/deploy/deploy.sh apis budget logging            # 미리 보기
apps/server/deploy/deploy.sh --apply apis budget logging    # 실행
```
- 켜는 API: Cloud Run, Artifact Registry, Secret Manager, Cloud Scheduler, Logging, Monitoring, IAM, IAM Credentials, Firebase, Firebase Hosting, Billing Budgets.
- 예산 `mong-monthly`: 25%·50%·100% + 예측 100%(약 30·60·120달러). 이미 있으면 건너뛴다.
- 로그(처리방침 K6과 같은 규칙): 서울 버킷 `mong-logs`(보존 7일)로 `_Default` 싱크를 돌리고, **Cloud Run 플랫폼 요청 로그(IP·User-Agent·전체 주소)는 제외 필터로 받지 않는다.** 옛 `_Default` 버킷(global)은 보존 1일. 장애 조사 때만 오너가 최대 4시간 켜는 절차는 `apps/server/deploy/README.md` 7절.
- **확인**:
  - `gcloud services list --enabled --format='value(config.name)' | grep -xE 'run.googleapis.com|artifactregistry.googleapis.com|secretmanager.googleapis.com|cloudscheduler.googleapis.com|firebasehosting.googleapis.com' | wc -l` → `5`.
  - 콘솔 '결제 → 예산 및 알림'에 `mong-monthly`.
  - `gcloud logging sinks describe _Default --format='value(destination)'` 가 `…/locations/asia-northeast3/buckets/mong-logs`.

## 4. Artifact Registry

```sh
apps/server/deploy/deploy.sh --apply registry
```
서울에 Docker 저장소 `mong`을 만들고 정리 정책(최근 5개 보존, 14일 넘은 나머지 삭제)을 건다. 5개 = 되돌릴 수 있는 배포 판 수.
- **확인**: `gcloud artifacts repositories describe mong --location=asia-northeast3` 에 `format: DOCKER`.

## 5. 서비스 계정·최소 권한 + 비밀 자리

```sh
apps/server/deploy/deploy.sh --apply accounts secrets
```

| 계정 | 하는 일 | 받는 권한(그 자원 하나에만, 프로젝트 전체 역할 없음) |
|---|---|---|
| `mong-api-run@<프로젝트 ID>.iam.gserviceaccount.com` | Cloud Run `mong-api`가 이 계정으로 돈다 | 비밀 4개 각각 `secretAccessor`(읽기만) |
| `mong-scheduler@<프로젝트 ID>.iam.gserviceaccount.com` | Scheduler가 이 계정의 OIDC 토큰으로 `/internal/cron/*`을 부른다 | `mong-api` 서비스 하나에 `run.invoker`(10단계에서) |

- 비밀 4개(`DATABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`·`RECOVERY_PEPPER`·`READY_TOKEN`)는 **빈 자리만** 만들고 서울에만 보관한다. 값은 8단계에서 오너가 넣는다.
- 기본 Compute 서비스 계정(`<번호>-compute@developer…`)은 쓰지 않는다. 결제를 붙이면 자동으로 받는 **Editor 역할을 이 단계가 회수**한다(없으면 건너뜀).
- Firebase를 붙이면(12단계) `firebase-adminsdk-…` 계정이 생긴다 — 쓰지 않지만 Firebase가 관리하므로 지우지 않는다.
- **확인**: `gcloud iam service-accounts list` 에 두 계정, `gcloud secrets list` 에 4개, `gcloud secrets get-iam-policy READY_TOKEN` 에 `mong-api-run`만.

## 6. Supabase 프로젝트(서울)

1. https://supabase.com/dashboard → 기존 조직 → **New project**
   - Name `mong-prod`, Region **Northeast Asia (Seoul)**, Plan **Free**(지금) → **01-08 전에 Pro**(조직 → Billing → Change plan, 월 25달러). Spend cap은 켠 채로 둔다.
   - Database password: 비밀번호 관리자에서 **영숫자 32자**로 만들어 붙여 넣고 `mong-prod postgres`로 저장.
2. 설정(왼쪽 메뉴):
   - **Authentication → Sign In / Providers**: *Allow anonymous sign-ins* **켬**, *Allow manual linking* **켬**.
   - **Project Settings → JWT Keys**: 현재 키가 **비대칭(ECC P-256 또는 RSA)** 인지 본다. 'Legacy HS256'만 있으면 *Create standby key → Rotate* 로 바꾼다(서버는 HS256을 받지 않는다 — architecture 12절 #11).
   - **Project Settings → Data API**: Exposed schemas에 `app`을 **넣지 않는다**(기본 `public`만).
   - **Database → Settings → SSL Configuration**: *Enforce SSL on incoming connections* **켬**, 같은 화면의 **Download certificate**로 CA 파일을 받아 `~/.config/mong/supabase-ca.crt`로 옮긴다(공개 인증서라 비밀 아님).
   - **Database → Extensions**: `pg_cron` **켬**.
3. 값 정리(어디에도 붙여 넣지 않는다):
   - Project URL `https://<ref>.supabase.co` → 비밀이 아니다. `deploy.env`의 `SUPABASE_URL`에 적는다.
   - **Project Settings → API Keys → Secret key**(`sb_secret_…`) → 비밀번호 관리자에 저장 → 8단계 `SUPABASE_SERVICE_ROLE_KEY`. (첫 배포 뒤 팀이 Auth Admin 호출을 확인한다. 안 되면 *Legacy API keys* 탭의 `service_role` 키로 바꾼다 [확인 필요].)
   - **Connect** 단추 → *Transaction pooler*(6543)·*Session pooler*(5432)의 **호스트**(`aws-…-ap-northeast-2.pooler.supabase.com`)만 메모.
- 스테이징 `mong-staging`(Free, 서울)은 B7 계획에 있지만 이번에는 넣지 않는다. 팀이 요청할 때 같은 방법으로.
- **확인**: 대시보드 홈에 Region `ap-northeast-2`, 위 다섯 설정이 저장됨, `ls ~/.config/mong/supabase-ca.crt` 있음.

## 7. DB 롤·마이그레이션·pg_cron

### 7-1. 롤 만들기(SQL Editor, 비밀번호 없이)
Supabase → **SQL Editor** → 새 쿼리 → 아래를 붙여 실행. **마이그레이션 전에** 해야 마이그레이션이 이 롤들에 권한을 건다.
```sql
create role prisma login nosuperuser nobypassrls nocreatedb nocreaterole;
grant create on database postgres to prisma;
grant usage, create on schema public to prisma;
create role metrics_reader nologin noinherit;
create role ota_publisher login nosuperuser nobypassrls nocreatedb nocreaterole noinherit;
grant connect on database postgres to ota_publisher;
-- Studio(postgres)가 운영 함수(restore_page 등)와 pg_cron 정리 함수를 부를 수 있게(B5 리뷰 M4, 7-4) [확인 필요: Supabase에서 이 GRANT가 되는지]
grant prisma to postgres;
```

### 7-2. 비밀번호 넣기(화면·기록에 남지 않게, 인증서 검증)
SQL Editor에 비밀번호를 쓰면 쿼리 기록에 남는다. 대신 터미널에서 `\password`로 넣는다(입력이 보이지 않는다). postgres 비밀번호를 보내는 연결이므로 서버 인증서를 **검증**한다(`verify-full`):
```sh
docker run --rm -it -v ~/.config/mong/supabase-ca.crt:/ca.crt:ro postgres:17-alpine \
  psql "host=<세션 풀러 호스트> port=5432 dbname=postgres user=postgres.<ref> sslmode=verify-full sslrootcert=/ca.crt"
# 비밀번호 = 6단계의 postgres 비밀번호
\password prisma          -- 비밀번호 관리자에서 새로 만든 영숫자 32자 → 'mong-prod prisma'로 저장
\password ota_publisher   -- 또 하나 새 값 → 'mong-prod ota_publisher'로 저장
\q
```
- 인증서 오류로 붙지 않으면 멈추고 팀에 알린다(풀러 인증서가 이 CA로 검증되지 않는 경우 — 팀이 대안을 정한다. `sslmode=require`로 낮추지 않는다).

### 7-3. 마이그레이션(오너 노트북, 세션 풀러 5432)
```sh
cd ~/Developer/mongmange
printf '세션 풀러 주소: '; read -rs DIRECT_URL; export DIRECT_URL; echo
#   붙여 넣을 꼴: postgresql://prisma.<ref>:<prisma 비밀번호>@<세션 풀러 호스트>:5432/postgres?sslmode=require
pnpm --filter server exec prisma migrate deploy
pnpm --filter server exec prisma migrate status
unset DIRECT_URL
```
- **확인**: `migrate status`가 `Database schema is up to date!`. SQL Editor에서 `select count(*) from pg_tables where schemaname = 'app';` 가 0보다 크다.

### 7-4. pg_cron 예약(매일 04:00 KST = 19:00 UTC)
SQL Editor에서:
```sql
select cron.schedule('mong-prune-save-versions', '0 19 * * *', $$select app.prune_save_versions()$$);
select cron.schedule('mong-expire-deletion-log', '5 19 * * *', $$select app.expire_deletion_log()$$);
select cron.schedule('mong-rollup-link-daily',   '10 19 * * *', $$select app.rollup_link_daily()$$);
select cron.schedule('mong-rollup-metric-daily', '15 19 * * *', $$select app.rollup_metric_daily()$$);
-- 한 번 손으로 돌려 권한을 확인한다(오류 없이 숫자나 빈 값이 나오면 통과)
select app.prune_save_versions(); select app.expire_deletion_log(); select app.rollup_link_daily(); select app.rollup_metric_daily();
```
- **확인**: `select jobname, schedule from cron.job;` 4줄. 다음 날 `select jobid, status from cron.job_run_details order by start_time desc limit 4;` 가 모두 `succeeded`.
- `permission denied for function`이 나오면 멈추고 팀에 알린다.

## 8. 비밀값 넣기(Secret Manager — 값은 오너만) + 키 보관함

### 8-1. 키 보관함(암호화 디스크 이미지) — 8·13단계가 함께 쓴다
```sh
hdiutil create -size 50m -fs APFS -encryption AES-256 -volname mong-keys ~/mong-keys.dmg   # 비밀번호 → 비밀번호 관리자 'mong-keys dmg'
hdiutil attach ~/mong-keys.dmg            # → /Volumes/mong-keys
```

### 8-2. 값 넣기
값이 화면·셸 기록·클립보드에 남지 않게 `read -rs`(입력이 안 보임) 또는 파일·파이프로 넣는다.
```sh
P=<프로젝트 ID>
# ① DATABASE_URL — 트랜잭션 풀러(6543), prisma 롤
#    꼴: postgresql://prisma.<ref>:<prisma 비밀번호>@<트랜잭션 풀러 호스트>:6543/postgres?sslmode=require
printf 'DATABASE_URL: '; read -rs V; echo; printf '%s' "$V" | gcloud secrets versions add DATABASE_URL --data-file=- --project=$P; unset V
# ② SUPABASE_SERVICE_ROLE_KEY — 6단계의 sb_secret_…
printf 'Supabase secret key: '; read -rs V; echo; printf '%s' "$V" | gcloud secrets versions add SUPABASE_SERVICE_ROLE_KEY --data-file=- --project=$P; unset V
# ③ RECOVERY_PEPPER — 암호화 볼륨 안에서만 만든다(클립보드 쓰지 않음). 잃으면 모든 되찾기 글귀가 무효
umask 077; openssl rand -base64 48 | tr -d '\n' > /Volumes/mong-keys/recovery-pepper-v1
gcloud secrets versions add RECOVERY_PEPPER --data-file=/Volumes/mong-keys/recovery-pepper-v1 --project=$P
#    비밀번호 관리자에 파일 첨부로 저장('mong RECOVERY_PEPPER v1') — 13단계 USB 사본에도 이 파일이 함께 들어간다
# ④ READY_TOKEN — /readyz 내부 토큰(잃어도 새로 만들면 됨)
openssl rand -base64 32 | tr -d '\n' | gcloud secrets versions add READY_TOKEN --data-file=- --project=$P
```
- **확인**: `gcloud secrets versions list DATABASE_URL --project=$P` 처럼 4개 모두 `enabled` 판 1개. 값을 화면에 꺼내 보지 않는다.
- **판 번호 고정(리뷰 H2)**: Cloud Run은 비밀을 `latest`가 아니라 **판 번호**로 읽는다(`deploy`가 그때의 최신 enabled 판 번호를 채운다). `latest`로 두면 인스턴스가 뜰 때마다 해석되어 같은 리비전 안에서 옛 값·새 값이 섞인다.
- **값을 바꿀 때**: 위 방식으로 새 판 추가 → `apps/server/deploy/deploy.sh --apply --digest current deploy`(같은 이미지, 새 판 번호로 새 리비전) → `smoke` → 하루 뒤 옛 판 `gcloud secrets versions disable <번호> --secret=<이름>`. 배포하기 전에는 운영이 옛 판을 그대로 쓴다.
- **`RECOVERY_PEPPER`는 이렇게 바꾸지 않는다** — 기존 되찾기 글귀가 모두 무효가 된다. 회전은 `RECOVERY_PEPPER_V`·`RECOVERY_PEPPERS_PREVIOUS` 절차로만(팀이 준비, deploy/README 6절).

**— 중단점: 여기까지 하고 끊어도 된다. `hdiutil detach /Volumes/mong-keys` —**

## 9. Cloud Run 첫 배포

**조건**: 서버 B7a(상한 있는 리밋 저장소·DB 쿼리 제한 시간)가 커밋된 뒤에만 한다. `build`가 HEAD를 검사해 없으면 멈춘다(그러면 팀에 알린다).
```sh
git pull                                     # B7a 포함 최신
apps/server/deploy/deploy.sh check           # 통과해야 다음으로
apps/server/deploy/deploy.sh --apply build   # 마지막 줄에 sha256:… 다이제스트(Apple Silicon에서 amd64 빌드라 10~20분)
apps/server/deploy/deploy.sh --apply --digest sha256:<위 값> deploy   # 비밀 판 번호를 찍어 보여 준다
curl -fsS https://mong-api-<프로젝트 번호>.asia-northeast3.run.app/healthz; echo
```
- 설정(B7 권고 반영, 까닭은 YAML 주석): 서울, 동시성 40, 최소 0(정식 출시 주는 `--launch-week`로 1), 최대 3, 요청 제한 300초(잠정 — B7a 뒤 확정), 메모리 1GiB·CPU 1, cpu-boost, 프로브 `/healthz`.
- 서비스 주소 `https://mong-api-<프로젝트 번호>.asia-northeast3.run.app`(결정적 주소)가 `CRON_AUDIENCE`·정적 빌드 `API_ORIGIN`이 된다.
- **확인**: `/healthz` 200 `"ok":true`. DB까지는 10단계 `smoke`가 본다.
- 주의: 프로브는 DB를 보지 않는 `/healthz`라서 **DB 연결이 틀려도 리비전은 Ready가 되어 트래픽을 받는다**(DB를 쓰는 요청만 503). 그래서 10단계 `smoke`의 `/readyz` 통과를 꼭 본다.

## 10. Scheduler + 스모크

```sh
apps/server/deploy/deploy.sh --apply scheduler smoke
```

| 잡 | 언제 | 부르는 곳 | 제한·재시도 |
|---|---|---|---|
| `storage-gc` | 매일 04:30 KST | `/internal/cron/storage-gc` | attemptDeadline **300초**, 재시도 **2**, 10분 → 20분(maxDoublings 1) |
| `moderation` | 5분마다 | `/internal/cron/moderation` | 180초, 재시도 0 |
| `cdn-purge` | 1분마다 | `/internal/cron/cdn-purge` | 60초, 재시도 0 |

- 세 잡 모두 OIDC 계정 `mong-scheduler@…`, audience = 서비스 주소(경로 없음, `CRON_AUDIENCE`와 같은 글자).
- `smoke`는 차례로 본다: `/healthz` `"ok":true` → `/readyz` `"db":"up"`(토큰은 고정 판에서 바로 헤더로, 화면에 안 나옴) → 토큰 없는 `POST /internal/cron/storage-gc`가 404 → `moderation`을 한 번 실행하고 **실행 시각 뒤의 시도 기록**이 성공(status 0)인지 최대 60초 기다림. 하나라도 틀리면 `smoke 실패: …` 까닭을 찍고 멈춘다.
- 복원 런북의 `reapply-deletions`는 정기 잡을 만들지 않는다(무료 3개 유지) — 필요할 때 deploy/README 5절 명령으로.
- **확인**: 출력 끝이 `Scheduler moderation 시도 통과(…)`. `/readyz`에서 멈추면 DB 연결(TLS 검증 포함) 문제 → 팀에 알린다. 잡에서 멈추고 status가 404 계열이면 audience·계정 이메일이 어긋난 것.

## 11. 로그 규칙 확인(처리방침 K6 증거)

```sh
apps/server/deploy/deploy.sh --apply k6
```
① 제외 필터(`run-platform-requests`) ② `mong-logs` 서울·7일 ③ 플랫폼 요청 로그 조회 결과가 **비어 있음**(= 0건)을 출력한다. ④는 12단계 뒤 Firebase 콘솔 → Hosting → 사이트 설정 → **Cloud Logging 통합이 '사용 안 함'**인 화면 캡처(켜지 않는다).
- **확인**: 출력과 캡처를 팀에 보낸다(팀이 `docs/ops/`에 붙인다).
- 장애 조사 때 요청 로그가 필요하면 **오너만** `deploy.sh --apply logs-on --hours 2`(최대 4시간, 만료 뒤 자동으로 다시 제외) — deploy/README 7절.

## 12. Firebase Hosting 연결·도메인

1. https://console.firebase.google.com → **프로젝트 추가** → '기존 Google Cloud 프로젝트에 Firebase 추가' → 1단계 프로젝트 선택 → **Google 애널리틱스 사용 안 함**(처리방침에 없다) → 완료. 결제가 붙어 있어 Blaze로 표시된다.
2. 왼쪽 **Hosting** → 시작하기(CLI 안내 화면은 '다음'으로 넘긴다). Cloud Logging 통합은 켜지 않는다.
3. **커스텀 도메인 추가** → `mongmang.ink` → Firebase가 보여 주는 **TXT·A 레코드**를 Cloudflare에 넣는다:
   - Cloudflare → mongmang.ink → DNS → 레코드 추가. **프록시 상태 = DNS only(회색 구름)**.
   - 루트(`@`)에 이미 있는 **A·AAAA·CNAME**만 지운다. **MX·TXT(SPF 등)는 그대로 둔다**(테스트 신청 메일 Cloudflare → Gmail).
4. 같은 방법으로 `ota.mongmang.ink`도 추가(자체 OTA 주소, V21). `/api/v1/ota/**` rewrite는 web-static 담당이 넣는다.
- **확인**: Firebase Hosting 도메인 목록에 두 도메인 '연결됨'(인증서 발급까지 수 분~최대 24시간). `dig +short mongmang.ink` 가 Firebase IP. 첫 정적 배포(14단계) 전에는 'Site Not Found'가 정상.

## 13. 원격 설정 서명 키·OTA 서명 키(오프라인)

키는 **이 노트북의 암호화 볼륨 안에서만** 만들고, 저장소·클라우드 드라이브·슬랙·Secret Manager·Cloud Run 어디에도 개인키를 두지 않는다(ota-self-host.md 6절, B4-report 3절 10). 만드는 동안 Wi-Fi를 꺼 두면 더 좋다.

1. 보관함 열기: `hdiutil attach ~/mong-keys.dmg`(8-1에서 만든 것).
2. **원격 설정 서명 키**(config·content 문서, OTA 키와 따로):
   ```sh
   pnpm --filter server build
   node apps/server/dist/remote-cli.js keygen --kid prod-1 --out /Volumes/mong-keys/remote
   ```
   → `prod-1.private.pem`(개인키, 0600) + `prod-1.public.json`(공개, 앱·정적 빌드에 넣는 값 — 팀에 보낸다).
3. **OTA 서명 키**(채널마다 따로):
   ```sh
   mkdir -p apps/mobile/certs && cd apps/mobile
   for C in preview production; do
     npx expo-updates codesigning:generate \
       --key-output-directory /Volumes/mong-keys/ota/$C \
       --certificate-output-directory /Volumes/mong-keys/ota/$C-cert \
       --certificate-validity-duration-years 10 \
       --certificate-common-name "mongmangE OTA $C"
     cp /Volumes/mong-keys/ota/$C-cert/certificate.pem certs/ota-$C.pem   # 공개 인증서만 저장소로(팀이 커밋)
   done
   cd ../..
   ```
   `apps/mobile/.gitignore`는 `*.pem`을 막되 `certs/ota-preview.pem`·`certs/ota-production.pem` 두 이름만 예외로 둔다(개인키 이름은 계속 막힘).
4. 보관(PM 11-25 ③ = 비밀번호 관리자 + 오프라인 사본 1):
   - 비밀번호 관리자에 `remote/prod-1.private.pem`, `ota/preview/private-key.pem`, `ota/production/private-key.pem`을 파일 첨부로 저장(`recovery-pepper-v1`은 8단계에서 이미).
   - `hdiutil detach /Volumes/mong-keys` 뒤 `~/mong-keys.dmg`(개인키 3개 + **`recovery-pepper-v1`**)를 **USB 한 개에 복사**해 집에 둔다(오프라인 사본). 노트북의 dmg는 남겨 둔다(서명할 때 연다). pepper·키를 새로 만들면 USB 사본도 다시 복사한다.
- **확인**: `git status --short apps/mobile/certs` 에 `ota-preview.pem`·`ota-production.pem` 두 줄만, `git check-ignore -v apps/mobile/certs/private-key.pem` 이 무시됨. `openssl x509 -in apps/mobile/certs/ota-production.pem -noout -subject -enddate` 가 `mongmangE OTA production`, 10년 뒤 만료. `prod-1.public.json` 내용(kid·n·e)을 팀 슬랙에 보냈다. USB의 dmg를 열어 파일 4개(+ 공개 파일)가 보인다.
- 잃으면: OTA 키 → 그 채널 바이너리는 새 OTA를 영영 못 받는다(스토어 업데이트로만). 원격 설정 키 → 새 키가 든 앱 빌드가 나갈 때까지, 원격 설정이 만료(14일)되면 번들 기본값으로 돈다. pepper → 모든 되찾기 글귀 무효.
- 루틴: 원격 설정은 **주 1회 다시 서명**한다(`remote-cli sign --prev …`, 만료 14일, 7일 안이면 출시 빌드 실패). 팀이 알림을 보낸다.

## 14. `PRIVACY_OFFICER` 상호 입력 + 첫 정적 배포

테스터판 처리방침 11절 보호책임자 칸을 **상호**로 채운다(오너 11-25 결정). 값은 저장소에 넣지 않고 배포하는 셸에만 준다.
```sh
cat > ~/.config/mong/hosting.env <<'EOF'
PRIVACY_OFFICER='<실제 상호 그대로>'
APPLE_TEAM_ID=<Apple Developer → Membership, 10자>
ANDROID_CERT_SHA256=<EAS 업로드 키 SHA-256>,<Play 앱 서명 키 SHA-256>
APP_STORE_ID=<App Store Connect 앱 id, 숫자>
API_ORIGIN=https://mong-api-<프로젝트 번호>.asia-northeast3.run.app
EOF
chmod 600 ~/.config/mong/hosting.env
cd apps/web-static && set -a && . ~/.config/mong/hosting.env && set +a && firebase deploy --only hosting --project <프로젝트 ID>; cd ../..
```
- 상호 규칙(빌드가 검사): 의미 있는 글자 2~80자, `[ ]`류 괄호·`| < >` 금지, '상호'·'성명'·'미정'·'TBD' 같은 자리표시자 낱말 금지.
- 빌드(predeploy)가 실패하면 아무것도 나가지 않고 이전 판이 남는다 — 오류 문구의 항목만 고치면 된다.
- **확인**: `curl -s https://mongmang.ink/privacy | grep -c '<상호>'` 가 1 이상. `curl -sI https://mongmang.ink/.well-known/apple-app-site-association` 와 `…/assetlinks.json` 이 200·`application/json`. `curl -s https://mongmang.ink/m/TESTTEST -o /dev/null -w '%{http_code}'` 가 Cloud Run에서 온 응답(지금은 404 또는 503 — 링크 저장소 연결 전).

### 14-1. 스토어 값이 아직 없을 때
- `APPLE_TEAM_ID`·`ANDROID_CERT_SHA256`·`APP_STORE_ID`가 비면 정적 빌드가 **일부러** 실패한다(빈 딥링크 파일이 나가지 않게). 세 값이 준비될 때까지 14단계는 미룬다. 테스터판 방침 게시 마감은 **12-15**(Play Console 방침 URL 입력은 12-19 제출 전, docs/release/README W6).
- `ANDROID_CERT_SHA256`·`APPLE_TEAM_ID`는 **앱 리허설 빌드(12-12) 전에도 필요하다.** app.json `withAppLinks` props와 같은 값이다.
- Play 지문을 받는 순서: ① 업로드 키 지문 확인(EAS 자격 증명) → ② 빌드 1을 Play Console에 업로드 → ③ Play Console '앱 무결성'에서 **앱 서명 키** 지문 확인 → ④ 두 지문을 **두 곳**(이 `hosting.env`의 `ANDROID_CERT_SHA256`, app.json `withAppLinks` props)에 같은 값으로 입력 → ⑤ 리허설 빌드.

---

## 끝난 뒤 팀에 보낼 것(슬랙 한 줄씩, 비밀값 없이)
1. 프로젝트 ID·프로젝트 번호 2. Supabase 프로젝트 ref 3. 10단계 `smoke` 출력 4. 11단계 K6 출력·캡처 5. 2단계 인증 캡처 3장 6. `prod-1.public.json` 내용 7. 14단계 완료 여부(또는 14-1로 미룸).

팀이 이어서 하는 일(오너 몫 아님): XFF 실측 → `HOPS_*` 고정·`REPORT_AUTO_HIDE` 판단(요청 로그가 필요하면 오너에게 `logs-on` 요청), 업타임 U1~U6·알림, Firebase `/m` 캐시 머리글 보존 실측, Supabase Storage 연결(서버 코드), 스테이징, Cloud Run 서울 무료 한도 확인.

## 부록. 대조표 — 안내서 ↔ 실제 설정 파일 ↔ 근거

| 이름·값 | 이 안내서 | 설정 파일 | 코드·문서 근거 |
|---|---|---|---|
| 리전 `asia-northeast3` | 3·4·9~11단계 | `deploy.sh` `REGION`, service YAML `cloud.googleapis.com/location` | architecture 0절·2-3, firebase.json `/m/**` rewrite `region` |
| 서비스 `mong-api` | 9·10·12단계 | service YAML `metadata.name` | firebase.json rewrite `serviceId: mong-api` |
| 저장소 `mong`, 이미지 `mong-api`, 최근 5개 | 4·9단계 | `deploy.sh` `REPO`·`IMAGE`, `registry/cleanup-policy.json` | architecture 6-4 |
| 실행 계정 `mong-api-run@…` | 5단계 | YAML `serviceAccountName`, `deploy.sh` `RUN_SA` | DECISIONS B6 준비 |
| 호출 계정 `mong-scheduler@…` | 5·10단계 | YAML `CRON_SA_EMAIL`, 잡 3개 `--oidc-service-account-email` | env.ts `CRON_SA_EMAIL`, cron.controller.ts |
| 서비스 주소 `https://mong-api-<번호>.asia-northeast3.run.app` | 9·14단계 | YAML `CRON_AUDIENCE`, 잡 3개 `--oidc-token-audience`·`--uri` | env.ts `CRON_AUDIENCE`, architecture 0-3 B6 행 |
| 비밀 4개, **판 번호 고정** | 5·8단계 | YAML `secretKeyRef.name`·`key: ${VER_…}`, `deploy.sh` `SECRETS`·`resolve_versions` | env.ts 운영 필수값, 리뷰 H2 |
| 동시성 40·최소 0(출시 주 1)·최대 3 | 9단계 | YAML `containerConcurrency`·`minScale`·`maxScale` | B7-report 5절 |
| 요청 제한 300초(잠정) | 9단계 | YAML `timeoutSeconds` | architecture 2-4, deploy/README 3절 |
| 메모리 1GiB | 9단계 | YAML `memory: 1Gi` | B7-report 5절 |
| 인그레스 `all` | — | YAML `run.googleapis.com/ingress` | deploy/README 4절 |
| `storage-gc` 04:30·300초·재시도 2·10분·두 배 1 | 10단계 | `scheduler/storage-gc.flags.yaml` | architecture 2-4 |
| `moderation` 5분 / `cdn-purge` 1분 | 10단계 | `scheduler/*.flags.yaml` | architecture 0-3 B5 행 / DECISIONS B3 |
| 로그 버킷 `mong-logs` 7일, 요청 로그 제외, 조사 때 최대 4시간 | 3·11단계 | `deploy.sh` `step_logging`·`logs-on`·`k6` | 처리방침 K6, architecture 5-2, deploy/README 7절 |
| Supabase 서울·Pro 01-08 전 | 6단계 | `deploy.env` `SUPABASE_URL` | roadmap B6(D-26) |
| 롤 `prisma`·`metrics_reader`·`ota_publisher` | 7-1단계 | — | prisma/local/00-roles.sql, 마이그레이션 `IF EXISTS … GRANT` |
| 마이그레이션 = 세션 풀러 5432 / 런타임 = 트랜잭션 풀러 6543 | 7-3·8단계 | — | prisma.config.ts, architecture 2-5 |
| pg_cron 함수 4개 | 7-4단계 | — | 마이그레이션 함수 정의 |
| 원격 설정 키 `remote-cli keygen --kid prod-1` | 13-2단계 | — | apps/server/src/remote/remote-cli.ts |
| OTA 키 `codesigning:generate`, `certs/ota-<채널>.pem` | 13-3단계 | `apps/mobile/.gitignore` 예외 2줄 | ota-self-host.md 6절 |
| `PRIVACY_OFFICER` + 정적 빌드 값 4개 | 14단계 | — | apps/web-static/README.md·scripts/build.mjs |

`apps/server/deploy/deploy.sh check`가 설정 파일 쪽 값(동시성·최대·timeout·메모리·인그레스·비밀 4개는 이름 + 판 번호·audience = `CRON_AUDIENCE`·잡 3개 시간·제한·재시도·정리 정책 5개)을 자동으로 검사한다.
