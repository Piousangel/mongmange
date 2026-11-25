# B6 배포 — 오너 단계별 안내서 (약 30분)

- 작성: DV-3(서버·배포), 2026-11-25. 대상: 오너(계정·결제·도메인·키를 가진 사람). 팀은 원격 자원을 만들지 않았다 — 아래 명령은 **오너 노트북에서 오너가** 실행한다.
- 근거: architecture.md v2.2(2-3·2-4·5-2·6-4·8·9-3), B7-report 5·6절, B4-report 3절 10·12, ota-self-host.md 6절, DECISIONS(D-21·D-26·V21·PM 11-25·B6 배포 준비), roadmap B6(소프트런칭 01-12 전, Supabase Pro 01-08 전), apps/web-static/README.md(PRIVACY_OFFICER).
- 팀이 미리 만든 설정: `apps/server/deploy/`(서비스 YAML·Scheduler 잡 3개·정리 정책·`deploy.sh`). `deploy.sh`는 **기본이 미리 보기**이고 `--apply`를 붙여야 실행된다.
- 지역: **GCP 서울 `asia-northeast3`**(Cloud Run·Artifact Registry·Scheduler·Secret Manager·로그 버킷), **Supabase 서울 `ap-northeast-2`**(architecture 0절·2-4).

> **요청 순서와 다른 점 한 가지**: Supabase와 비밀값을 Cloud Run 첫 배포 **앞으로** 당겼다. 운영 이미지는 DB 주소·Supabase 키·pepper·토큰이 없으면 부팅을 거부한다(`apps/server/src/config/env.ts`). 나머지는 요청 순서 그대로다.

| # | 단계 | 시간 | 막히면 |
|---|---|---|---|
| 0 | 준비물 | 5분(설치 제외) | — |
| 1 | GCP 프로젝트 | 2분 | 프로젝트 ID가 이미 쓰임 → 다른 ID, `deploy.env`에 적기 |
| 2 | 결제 연결 + 예산 알림 | 3분 | — |
| 3 | API 켜기 | 2분 | 결제가 안 붙어 있으면 실패 |
| 4 | Artifact Registry | 1분 | — |
| 5 | 서비스 계정·최소 권한 + 비밀 자리 | 2분 | — |
| 6 | Supabase 프로젝트(서울, Pro는 01-08 전) | 6분 | — |
| 7 | DB 롤·마이그레이션·pg_cron | 4분 | 7-4 권한 오류 → 팀에 알림 |
| 8 | 비밀값 넣기(Secret Manager) | 3분 | — |
| 9 | Cloud Run 첫 배포 | 5분(빌드 포함) | `/readyz` 503 → 팀에 알림(DB TLS 확인) |
| 10 | Scheduler(storage-gc 등) | 1분 | — |
| 11 | 로그 보존 최소화 | 1분 | — |
| 12 | Firebase Hosting 연결·도메인 | 4분 + DNS 대기 | 인증서 발급은 최대 24시간 |
| 13 | 원격 설정 서명 키·OTA 서명 키(오프라인) | 5분 | — |
| 14 | `PRIVACY_OFFICER` 상호 입력 + 첫 정적 배포 | 2분 | 스토어 값(Apple Team ID 등)이 없으면 정적 배포가 막힌다 — 14-1 |

---

## 0. 준비물

```sh
brew install --cask google-cloud-sdk          # gcloud
npm install -g firebase-tools                   # firebase
gcloud auth login                               # 오너 Google 계정
firebase login
cd ~/Developer/mongmange && pnpm install && git pull
```
- Docker Desktop이 켜져 있어야 한다(9단계 이미지 빌드).
- 비밀번호 관리자(1Password·Bitwarden 등)를 열어 둔다. 이 안내서에서 만드는 비밀값은 모두 거기에 먼저 넣는다.
- **확인**: `gcloud --version`, `firebase --version`, `docker info` 가 오류 없이 나온다.

## 1. GCP 프로젝트

1. https://console.cloud.google.com → 위쪽 프로젝트 선택 → **새 프로젝트** → 이름 `mongmange`, 조직 없음 → 만들기.
   프로젝트 ID가 이미 쓰였다고 나오면 `mongmange-ink` 같은 다른 ID를 쓴다.
2. 입력 파일을 만든다(비밀값이 아닌 것만 들어간다. 저장소 밖에 둔다):
   ```sh
   mkdir -p ~/.config/mong && cp apps/server/deploy/deploy.env.example ~/.config/mong/deploy.env
   gcloud config set project <프로젝트 ID>
   gcloud projects describe <프로젝트 ID> --format='value(projectNumber)'   # 이 숫자를 PROJECT_NUMBER에
   open -e ~/.config/mong/deploy.env      # PROJECT_ID·PROJECT_NUMBER·ALERT_EMAIL 채우기
   ```
- **확인**: `apps/server/deploy/deploy.sh check` 가 `check 통과`를 찍는다(이 명령은 아무것도 만들지 않는다).

## 2. 결제 연결 + 예산 알림

1. 콘솔 → **결제** → '이 프로젝트에 결제 계정 연결' → 기존 **'내 결제 계정'**(11-20 확인된 계정) 선택.
2. 결제 → 계정 관리에서 결제 계정 ID(`XXXXXX-XXXXXX-XXXXXX`)와 **통화**를 본다 → `deploy.env`의 `BILLING_ACCOUNT`, `BUDGET_AMOUNT`(원화 계정이면 `160000KRW`처럼, 달러면 `120USD`).
3. 예산 알림(25%·50%·100% + 예측 100% = 약 30·60·120달러)은 예산 API를 켠 뒤라야 하므로 **3단계에서 함께** 만든다(`apis budget`).
   (콘솔로 하려면: 결제 → 예산 및 알림 → 예산 만들기 → 프로젝트 = 이 프로젝트, 금액 120달러, 문턱 25·50·100%.)
- **확인**: `gcloud billing projects describe <프로젝트 ID> --format='value(billingEnabled)'` → `True`. (3단계 뒤) 콘솔 '예산 및 알림'에 `mong-monthly`가 보인다.
- 예산은 **알림일 뿐 지출을 멈추지 않는다**. 실제 상한은 Cloud Run 최대 인스턴스 3과 버킷 크기 제한뿐이다(architecture 8절).

### 비용 예상

| 항목 | 지금 ~ 01-07(소프트런칭 준비) | 01-08 ~ 소프트런칭 | 무료 한도와 비교 [팀 추정] |
|---|---|---|---|
| Cloud Run(min 0, 요청 기반 과금) | 0 | 0 | 월 180,000 vCPU초·360,000 GiB초·200만 요청 무료. 우리 고정 부하는 Scheduler 호출 약 5.2만 건/월(1분 cdn-purge 4.3만 + 5분 moderation 8,640 + 하루 1번) ≈ 수천 vCPU초 → **한도 안**. 서울은 Tier 2 단가라 한도를 넘으면 더 비싸다 [확인 필요: 무료 한도가 서울에도 같은지] |
| Artifact Registry | 0 | 0 | 0.5GB 무료. 이미지 약 150MB(압축) × 최근 3개만 남김(정리 정책) → **한도 안** |
| Secret Manager | 0 | 0 | 활성 비밀 판 6개·접근 1만 회 무료. 우리는 4개 → **한도 안** |
| Cloud Scheduler | 0 | 0 | **결제 계정당** 잡 3개 무료. 우리는 정확히 3개. 같은 결제 계정의 다른 프로젝트에 잡이 있으면 잡당 월 0.1달러 |
| Cloud Logging | 0 | 0 | 수집 50GiB/월 무료, 7일 보존 무료. 플랫폼 요청 로그는 받지 않는다(11단계) |
| Firebase Hosting(Blaze) | 0 | 0~1달러 | 저장 10GB·전송 월 10GB 무료 [확인 필요: Blaze 무료 전송량]. CanvasKit wasm·루프 영상이 커지면 늘어난다(01월 R2 이전 계획) |
| Supabase | 0(Free) | **25달러(Pro)** | Pro는 **01-08 전** 전환(D-26). Free는 7일 무활동 일시 정지·백업 없음 |
| 도메인 | 이미 결제(연 25.20달러) | — | — |
| **합계(월)** | **약 0~1달러** | **약 25~30달러** | architecture 8절 '소프트런칭 25~30달러 + 도메인'과 같다 |

## 3. API 켜기

```sh
apps/server/deploy/deploy.sh apis budget            # 미리 보기
apps/server/deploy/deploy.sh --apply apis budget    # 실행(API 켜기 → 2단계 예산 알림)
```
켜는 것: Cloud Run, Artifact Registry, Secret Manager, Cloud Scheduler, Logging, Monitoring, IAM, IAM Credentials, Firebase, Firebase Hosting, Billing Budgets.
- **확인**: `gcloud services list --enabled | grep -E 'run|artifactregistry|secretmanager|cloudscheduler|firebasehosting'` 가 5줄.

## 4. Artifact Registry

```sh
apps/server/deploy/deploy.sh --apply registry
```
서울에 Docker 저장소 `mong`을 만들고 정리 정책(최근 3개 보존, 14일 넘은 나머지 삭제)을 건다 — 무료 0.5GB 안에 머문다.
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
- 기본 Compute 서비스 계정은 쓰지 않는다(프로젝트 편집자 권한이 붙어 있어서).
- **확인**: `gcloud iam service-accounts list` 에 두 계정, `gcloud secrets list` 에 4개, `gcloud secrets get-iam-policy READY_TOKEN` 에 `mong-api-run`만.

## 6. Supabase 프로젝트(서울)

1. https://supabase.com/dashboard → 기존 조직 → **New project**
   - Name `mong-prod`, Region **Northeast Asia (Seoul)**, Plan **Free**(지금) → **01-08 전에 Pro**(조직 → Billing → Change plan, 월 25달러). Spend cap은 켠 채로 둔다.
   - Database password: **Generate a password** → 비밀번호 관리자에 `mong-prod postgres`로 저장.
2. 설정(왼쪽 메뉴):
   - **Authentication → Sign In / Providers**: *Allow anonymous sign-ins* **켬**, *Allow manual linking* **켬**.
   - **Project Settings → JWT Keys**: 현재 키가 **비대칭(ECC P-256 또는 RSA)** 인지 본다. 'Legacy HS256'만 있으면 *Create standby key → Rotate* 로 바꾼다(서버는 HS256을 받지 않는다 — architecture 12절 #11).
   - **Project Settings → Data API**: Exposed schemas에 `app`을 **넣지 않는다**(기본 `public`만).
   - **Database → Settings → SSL Configuration**: *Enforce SSL on incoming connections* **켬**.
   - **Database → Extensions**: `pg_cron` **켬**.
3. 값 세 개를 비밀번호 관리자에 옮겨 둔다(어디에도 붙여 넣지 않는다):
   - Project URL `https://<ref>.supabase.co` → 이건 비밀이 아니다. `deploy.env`의 `SUPABASE_URL`에 적는다.
   - **Project Settings → API Keys → Secret key**(`sb_secret_…`) → 8단계 `SUPABASE_SERVICE_ROLE_KEY`. (첫 배포 뒤 팀이 Auth Admin 호출을 확인한다. 안 되면 *Legacy API keys* 탭의 `service_role` 키로 바꾼다 [확인 필요].)
   - **Connect** 단추 → *Transaction pooler*(6543)·*Session pooler*(5432) 주소의 **호스트**(`aws-…-ap-northeast-2.pooler.supabase.com`)만 메모.
- 스테이징 `mong-staging`(Free, 서울)은 B7 계획에 있지만 이 30분에는 넣지 않는다. 팀이 요청할 때 같은 방법으로.
- **확인**: 대시보드 홈에 Region `ap-northeast-2`, 위 다섯 설정이 저장됨.

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
-- Studio(postgres)가 운영 함수(restore_page 등)와 pg_cron 정리 함수를 부를 수 있게(B5 리뷰 M4, 7-4)
grant prisma to postgres;
```

### 7-2. 비밀번호 넣기(화면·기록에 남지 않게)
SQL Editor에 비밀번호를 쓰면 쿼리 기록에 남는다. 대신 터미널에서 `\password`로 넣는다(입력이 보이지 않는다):
```sh
docker run --rm -it postgres:17-alpine psql "host=<세션 풀러 호스트> port=5432 dbname=postgres user=postgres.<ref> sslmode=require"
# 비밀번호 = 6-1의 postgres 비밀번호
\password prisma          -- 비밀번호 관리자에서 새로 만든 값(32자 이상) → 'mong-prod prisma'로 저장
\password ota_publisher   -- 또 하나 새 값 → 'mong-prod ota_publisher'로 저장
\q
```

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
- `permission denied for function`이 나오면 멈추고 팀에 알린다(7-1 마지막 줄이 빠졌거나 롤 설계를 다시 봐야 한다).

## 8. 비밀값 넣기(Secret Manager — 값은 오너만)

값이 화면·셸 기록에 남지 않게 `read -rs`(입력이 안 보임) 또는 바로 파이프로 넣는다.
```sh
P=<프로젝트 ID>
# ① DATABASE_URL — 트랜잭션 풀러(6543), prisma 롤
#    꼴: postgresql://prisma.<ref>:<prisma 비밀번호>@<트랜잭션 풀러 호스트>:6543/postgres?sslmode=require
printf 'DATABASE_URL: '; read -rs V; echo; printf '%s' "$V" | gcloud secrets versions add DATABASE_URL --data-file=- --project=$P; unset V
# ② SUPABASE_SERVICE_ROLE_KEY — 6단계의 sb_secret_…
printf 'Supabase secret key: '; read -rs V; echo; printf '%s' "$V" | gcloud secrets versions add SUPABASE_SERVICE_ROLE_KEY --data-file=- --project=$P; unset V
# ③ RECOVERY_PEPPER — 새로 만든다. 잃으면 모든 되찾기 글귀가 무효 → 비밀번호 관리자 + 13단계 오프라인 사본에도
openssl rand -base64 48 | tr -d '\n' | pbcopy      # 클립보드로만 → 비밀번호 관리자에 'mong RECOVERY_PEPPER v1'로 붙여 저장
pbpaste | gcloud secrets versions add RECOVERY_PEPPER --data-file=- --project=$P; pbcopy </dev/null
# ④ READY_TOKEN — /readyz 내부 토큰(잃어도 새로 만들면 됨)
openssl rand -base64 32 | tr -d '\n' | gcloud secrets versions add READY_TOKEN --data-file=- --project=$P
```
- **확인**: `gcloud secrets versions list DATABASE_URL --project=$P` 처럼 4개 모두 `enabled` 판 1개. (값을 화면에 꺼내 보지 않는다.)
- 값을 바꾸면 새 판이 생긴다. Cloud Run은 **새 리비전부터** 새 값을 읽는다 → 9단계 `deploy`를 다시 돌린다.

## 9. Cloud Run 첫 배포

```sh
open -e ~/.config/mong/deploy.env            # SUPABASE_URL 채웠는지 확인
apps/server/deploy/deploy.sh check           # 통과해야 다음으로
apps/server/deploy/deploy.sh --apply build   # 마지막 줄에 sha256:… 다이제스트가 나온다(약 3~5분)
apps/server/deploy/deploy.sh --apply --digest sha256:<위 값> deploy
URL=https://mong-api-<프로젝트 번호>.asia-northeast3.run.app
curl -fsS $URL/healthz; echo
gcloud secrets versions access latest --secret=READY_TOKEN | sed 's/^/x-ready-token: /' | curl -fsS -H @- $URL/readyz; echo
```
- 설정(B7 권고 반영, 값마다 까닭은 YAML 주석): 서울, 동시성 40, 최소 0(정식 출시 주는 `--launch-week`로 1), 최대 3, 요청 제한 300초, 메모리 1GiB·CPU 1, cpu-boost, 프로브 `/healthz`.
- 서비스 주소는 `https://mong-api-<프로젝트 번호>.asia-northeast3.run.app`(결정적 주소). 이 값이 `CRON_AUDIENCE`·정적 빌드 `API_ORIGIN`이 된다.
- `build`는 apps/server·packages에 커밋 안 된 변경이 있으면 멈춘다(이미지 태그 = 커밋).
- **확인**: `/healthz` 200 `"ok":true` · `/readyz` 200 `"db":"up"`(토큰은 화면에 안 나온다). 10단계 `smoke`가 cron 404·Scheduler 통과까지 한 번 더 본다.
- `/readyz`가 503이면 DB 연결(TLS 검증 포함)이 문제다 → 팀에 알린다. 이전 리비전이 없으므로 서비스는 뜨지 않은 채 남고, 고친 뒤 `deploy`만 다시 돌리면 된다.

## 10. Scheduler(storage-gc 등)

```sh
apps/server/deploy/deploy.sh --apply scheduler smoke
```
`smoke` = `/healthz`·`/readyz` + 토큰 없는 `POST /internal/cron/storage-gc` 404 + `moderation` 잡 한 번 실행·상태.

| 잡 | 언제 | 부르는 곳 | 제한·재시도 |
|---|---|---|---|
| `storage-gc` | 매일 04:30 KST | `/internal/cron/storage-gc` | attemptDeadline **300초**, 재시도 **2**, 10분 → 20분(maxDoublings 1) |
| `moderation` | 5분마다 | `/internal/cron/moderation` | 180초, 재시도 0 |
| `cdn-purge` | 1분마다 | `/internal/cron/cdn-purge` | 60초, 재시도 0 |

- 세 잡 모두 OIDC 계정 `mong-scheduler@…`, audience = 서비스 주소(경로 없음, `CRON_AUDIENCE`와 같은 글자).
- 복원 런북의 `reapply-deletions`는 정기 잡을 만들지 않는다(무료 3개 유지) — 필요할 때 팀 README 5절의 한 줄 명령으로 직접 부른다.
- **확인**: `gcloud scheduler jobs list --location=asia-northeast3` 에 3개 `ENABLED`. `gcloud scheduler jobs run moderation --location=asia-northeast3` 뒤 `gcloud scheduler jobs describe moderation --location=asia-northeast3 --format='value(status)'` 가 비어 있음(= 성공). 404가 보이면 audience·계정 이메일이 어긋난 것이다.

## 11. 로그 보존 최소화

```sh
apps/server/deploy/deploy.sh --apply logging
```
- 서울 로그 버킷 `mong-logs`(7일)을 만들고 `_Default` 싱크를 그리로 돌린다. 옛 `_Default` 버킷(global)은 보존 1일로 줄인다.
- **Cloud Run 플랫폼 요청 로그(IP·User-Agent·전체 주소)는 받지 않는다.** `/m/` 링크 코드·`/deletion/{영수증}`·핑의 IP가 남지 않는다. 앱 자체 로그(경로 틀·상태·지연, IP 없음)는 7일 남는다. 5xx·지연 알림은 로그가 아니라 Cloud Monitoring 지표로 본다.
- Firebase Hosting의 Cloud Logging 연동은 켜지 않는다(12단계에서 묻지 않으면 그대로 둔다).
- **확인**: `gcloud logging sinks describe _Default --format='value(destination)'` 가 `…/locations/asia-northeast3/buckets/mong-logs`, `gcloud logging buckets describe mong-logs --location=asia-northeast3 --format='value(retentionDays)'` 가 `7`.

## 12. Firebase Hosting 연결·도메인

1. https://console.firebase.google.com → **프로젝트 추가** → 아래 '기존 Google Cloud 프로젝트에 Firebase 추가' → 1단계 프로젝트 선택 → **Google 애널리틱스 사용 안 함**(처리방침에 없다) → 완료. 요금제는 결제가 붙어 있어 Blaze로 표시된다.
2. 왼쪽 **Hosting** → 시작하기(CLI 안내 화면은 '다음'으로 넘긴다).
3. **커스텀 도메인 추가** → `mongmang.ink` → Firebase가 보여 주는 **TXT·A 레코드**를 Cloudflare에 넣는다:
   - Cloudflare → mongmang.ink → DNS → 레코드 추가. **프록시 상태 = DNS only(회색 구름)**.
   - 루트(`@`)에 이미 있는 **A·AAAA·CNAME**만 지운다. **MX·TXT(SPF 등)는 그대로 둔다**(테스트 신청 메일 Cloudflare → Gmail).
4. 같은 방법으로 `ota.mongmang.ink`도 추가(자체 OTA 주소, V21). 정적 사이트의 `/api/v1/ota/**` rewrite는 web-static 담당이 넣는다.
- **확인**: Firebase Hosting 도메인 목록에 두 도메인 '연결됨'(인증서 발급까지 수 분~최대 24시간). `dig +short mongmang.ink` 가 Firebase IP를 보인다. 첫 정적 배포(14단계) 전에는 'Site Not Found' 화면이 정상이다.

## 13. 원격 설정 서명 키·OTA 서명 키(오프라인)

키는 **이 노트북에서만** 만들고, 저장소·클라우드 드라이브·슬랙·Secret Manager·Cloud Run 어디에도 개인키를 두지 않는다(ota-self-host.md 6절, B4-report 3절 10). 만드는 동안 Wi-Fi를 꺼 두면 더 좋다.

1. 암호화 디스크 이미지를 만들고 연다(비밀번호는 비밀번호 관리자에 `mong-keys dmg`):
   ```sh
   hdiutil create -size 50m -fs APFS -encryption AES-256 -volname mong-keys ~/mong-keys.dmg
   hdiutil attach ~/mong-keys.dmg            # → /Volumes/mong-keys
   ```
2. **원격 설정 서명 키**(config·content 문서, OTA 키와 따로):
   ```sh
   pnpm --filter server build
   node apps/server/dist/remote-cli.js keygen --kid prod-1 --out /Volumes/mong-keys/remote
   ```
   → `prod-1.private.pem`(개인키, 0600) + `prod-1.public.json`(공개, 앱·정적 빌드에 넣는 값 — 팀에 보낸다).
3. **OTA 서명 키**(채널마다 따로):
   ```sh
   cd apps/mobile
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
4. 보관(PM 11-25 ③ = 비밀번호 관리자 + 오프라인 사본 1):
   - 비밀번호 관리자에 `prod-1.private.pem`, `ota/preview/private-key.pem`, `ota/production/private-key.pem`을 파일 첨부로 저장. 8단계 `RECOVERY_PEPPER`도 이미 거기 있다.
   - `hdiutil detach /Volumes/mong-keys` 뒤 `~/mong-keys.dmg`를 **USB 한 개에 복사**해 집에 둔다(오프라인 사본). 노트북의 dmg는 남겨 둔다(서명할 때 연다).
- **확인**: `git status` 에 `apps/mobile/certs/ota-preview.pem`·`ota-production.pem` 두 파일만 새로 보이고 `*.pem` 개인키는 없다. `openssl x509 -in apps/mobile/certs/ota-production.pem -noout -subject -enddate` 가 `mongmangE OTA production`, 10년 뒤 만료. `prod-1.public.json` 내용(kid·n·e)을 팀 슬랙에 보냈다.
- 잃으면: OTA 키 → 그 채널 바이너리는 새 OTA를 영영 못 받는다(스토어 업데이트로만). 원격 설정 키 → 새 키를 넣은 앱 빌드가 나갈 때까지 원격 설정이 만료(14일)되면 번들 기본값으로 돈다.
- 루틴: 원격 설정은 **주 1회 다시 서명**한다(`remote-cli sign --prev …`, 만료 14일, 7일 안이면 출시 빌드 실패). 팀이 알림을 보낸다.

## 14. `PRIVACY_OFFICER` 상호 입력 + 첫 정적 배포

테스터판 처리방침 11절 보호책임자 칸을 **상호**로 채운다(오너 11-25 결정). 값은 저장소에 넣지 않고 배포하는 셸에만 준다.
```sh
cat > ~/.config/mong/hosting.env <<'EOF'
PRIVACY_OFFICER='<상호 — 예: 실제 상호 그대로>'
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
`APPLE_TEAM_ID`·`ANDROID_CERT_SHA256`·`APP_STORE_ID`가 비면 정적 빌드가 **일부러** 실패한다(빈 딥링크 파일이 나가지 않게). 세 값이 준비될 때까지 14단계는 미룬다. 테스터판 방침 게시 마감은 **12-15**(Play Console 방침 URL 입력은 12-19 제출 전, docs/release/README W6).

---

## 끝난 뒤 팀에 보낼 것(슬랙 한 줄씩, 비밀값 없이)
1. 프로젝트 ID·프로젝트 번호 2. Supabase 프로젝트 ref(주소의 앞부분) 3. 10단계 `smoke` 출력 4. `prod-1.public.json` 내용 5. 14단계 완료 여부(또는 14-1로 미룸).

팀이 이어서 하는 일(오너 몫 아님): XFF 프록시 수 실측 → `HOPS_*` 고정·`REPORT_AUTO_HIDE` 판단, 업타임 체크 U1~U6·알림(B7-report 6절), Firebase `/m` 캐시 머리글 보존 실측, Supabase Storage 연결(서버 코드), 스테이징.

## 부록. 대조표 — 안내서 ↔ 실제 설정 파일 ↔ 근거

| 이름·값 | 이 안내서 | 설정 파일 | 코드·문서 근거 |
|---|---|---|---|
| 리전 `asia-northeast3` | 0·4·9~11단계 | `deploy.sh` `REGION`, service YAML `cloud.googleapis.com/location` | architecture 0절·2-3, firebase.json `/m/**` rewrite `region` |
| 서비스 `mong-api` | 9·10·12단계 | service YAML `metadata.name` | firebase.json rewrite `serviceId: mong-api`, architecture 2-3 |
| 저장소 `mong`, 이미지 `mong-api` | 4·9단계 | `deploy.sh` `REPO`·`IMAGE`, YAML `…/mong/mong-api@sha256:` | architecture 6-4 'Artifact Registry(서울)' |
| 실행 계정 `mong-api-run@…` | 5단계 | YAML `serviceAccountName`, `deploy.sh` `RUN_SA` | — (새 이름, DECISIONS B6 준비) |
| 호출 계정 `mong-scheduler@…` | 5·10단계 | YAML `CRON_SA_EMAIL`, 잡 3개 `--oidc-service-account-email` | env.ts `CRON_SA_EMAIL`, cron.controller.ts `CronAuth` |
| 서비스 주소 `https://mong-api-<번호>.asia-northeast3.run.app` | 9·14단계 | YAML `CRON_AUDIENCE`, 잡 3개 `--oidc-token-audience`·`--uri` | env.ts `CRON_AUDIENCE`(경로 없음), architecture 0-3 B6 행(B2 리뷰 I2) |
| 비밀 `DATABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`·`RECOVERY_PEPPER`·`READY_TOKEN` | 5·8단계 | YAML `secretKeyRef.name`, `deploy.sh` `SECRETS` | env.ts 운영 필수값, architecture 6-4 '비밀' |
| 동시성 40·최소 0(출시 주 1)·최대 3 | 9단계 | YAML `containerConcurrency`·`minScale`·`maxScale` | B7-report 5절, architecture 2-3 |
| 요청 제한 300초 | 9단계 | YAML `timeoutSeconds` | architecture 2-4 Scheduler 행('300초 이상'), DECISIONS B6 준비 ①(B7 60초 대신) |
| 메모리 1GiB | 9단계 | YAML `memory: 1Gi` | B7-report 5절(B2 고치기 전 1Gi) |
| 인그레스 `all` | — | YAML `run.googleapis.com/ingress` | deploy/README 4절, DECISIONS B6 준비 ② |
| `storage-gc` 04:30·300초·재시도 2·10분·두 배 1 | 10단계 | `scheduler/storage-gc.flags.yaml` | architecture 2-4 Scheduler 행 |
| `moderation` 5분 | 10단계 | `scheduler/moderation.flags.yaml` | architecture 0-3 B5 행 |
| `cdn-purge` 1분 | 10단계 | `scheduler/cdn-purge.flags.yaml` | DECISIONS 'B3 구현 결정' 캐시·무효화 |
| 로그 버킷 `mong-logs` 7일, 요청 로그 제외 | 11단계 | `deploy.sh` `step_logging` | architecture 5-2, B4-report 3절 12, DECISIONS B6 준비 ③ |
| Supabase 서울·Pro 01-08 전 | 6단계 | `deploy.env` `SUPABASE_URL` | architecture 2-4, roadmap B6(D-26) |
| 롤 `prisma`·`metrics_reader`·`ota_publisher` | 7-1단계 | — | prisma/local/00-roles.sql(같은 이름), 마이그레이션의 `IF EXISTS … GRANT` |
| 마이그레이션 = 세션 풀러 5432 | 7-3단계 | — | prisma.config.ts(6543 거부) |
| 런타임 = 트랜잭션 풀러 6543 | 8단계 ① | — | architecture 2-5·6-4 |
| pg_cron 함수 4개 | 7-4단계 | — | 마이그레이션 `prune_save_versions`·`expire_deletion_log`·`rollup_link_daily`·`rollup_metric_daily` |
| 원격 설정 키 `remote-cli keygen --kid prod-1` | 13-2단계 | — | apps/server/src/remote/remote-cli.ts 머리 주석 |
| OTA 키 `codesigning:generate`, `certs/ota-<채널>.pem` | 13-3단계 | — | ota-self-host.md 6절 |
| `PRIVACY_OFFICER` + 정적 빌드 값 4개 | 14단계 | — | apps/web-static/README.md·scripts/build.mjs |

`apps/server/deploy/deploy.sh check`가 이 표의 설정 파일 쪽 값(동시성·최대·timeout·메모리·인그레스·비밀 4개는 이름만·audience = `CRON_AUDIENCE`·잡 3개 시간·제한·재시도)을 자동으로 검사한다.
