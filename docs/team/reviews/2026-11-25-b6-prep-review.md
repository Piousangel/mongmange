# B6 배포 준비 독립 리뷰 — 5fef729

- 리뷰어: 독립 리뷰어(클라우드 배포·보안·비용·오너 안내서 사용성 겸임, 작성 참여 없음), 2026-11-25, 강도 높음
- 대상: `docs/ops/b6-owner-guide.md`, `apps/server/deploy/`(README·deploy.sh·deploy.env.example·cloudrun·scheduler·registry), DECISIONS '2026-11-25 B6 배포 준비'
- 기준: architecture.md v2.2(0-3 B6 행·2-3·2-4·5-2·6-4), B7-report 5·6절, B4-report 3절, ota-self-host.md 6절, docs/release/README W 목록, 처리방침 v3.3(정본 3-1·K6·K26)과 테스터판(`privacy-policy-tester.ko.md` 28·67·79·99행), DECISIONS(V21·PM 11-25·D-26)
- 이 리뷰는 고치지 않는다. 커밋하지 않는다.

## 판정: **조건부 통과**

설정 파일과 `deploy.sh`는 단단하다. 미리 보기에서 원격 호출 0건을 확인했고, 비밀값이 인자·출력에 나가지 않으며, 권한도 자원 단위로 좁다. 오너가 실행하기 **전에** 높음 2건(H1·H2)과 중간 M1~M4는 고쳐야 한다. 특히 H1은 이 안내서 14단계가 게시하는 테스터판 처리방침이 11단계 설정과 정면으로 어긋나는 문제다.

| 등급 | 개수 |
|---|---|
| 높음 | 2 |
| 중간 | 11 |
| 낮음 | 10 |

## 검증한 것(증거)

- **가짜 도구 실행**: 스크래치 폴더에 인자만 기록하는 `gcloud`·`docker`·`curl`을 만들어 PATH 맨 앞에 두었다. macOS 기본 `/bin/bash` 3.2.57에서 돌렸고, 실제 원격 호출은 없었다.
  - 미리 보기 `deploy.sh check apis registry accounts secrets logging budget build deploy scheduler smoke`: **exit 0, 가짜 도구 호출 0건**. `check 통과`.
  - 실행 `--apply --digest sha256:a…(64) apis registry accounts secrets logging budget deploy scheduler smoke`: `HOME`에 공백이 든 경로(`home dir/.config/mong/deploy.env`)를 썼다. 기록된 명령은 39개이고 순서·인자가 미리 보기와 같았다. 마지막 smoke의 cron 404 검사는 가짜 curl이 빈 값을 돌려주어 exit 1로 끝났다(예상된 결과). 이때 **실패 문구 없이** 끝난다(L4).
  - 비밀값 경로: `--set-env-vars`를 쓰지 않는다. YAML은 `secretKeyRef`만 쓰고, `check`가 평문 비밀처럼 보이는 값(`postgres://`·`sb_secret_`·`eyJ…`)을 막는다. `smoke`는 READY_TOKEN을 `gcloud secrets versions access | sed | curl -H @-`로 넘겨 인자·화면에 남기지 않는다. 안내서 8단계는 `read -rs` → `printf`(내장 명령이라 ps에 안 보임) → `--data-file=-`로 넣는다. **셸 기록·로그·인자에 비밀값이 남는 경로는 없다.** 예외는 README 5절의 수동 cron 명령으로, OIDC 토큰(1시간 유효)이 curl 인자에 실린다(L9).
- **OIDC**: 잡 3개의 `--oidc-token-audience`와 YAML의 `CRON_AUDIENCE`는 같은 결정적 주소이고, `check`가 이 일치를 검사한다. `cron.controller.ts`는 RS256·iss(Google)·aud·`email == CRON_SA_EMAIL`·`email_verified`를 모두 확인하고 실패하면 404를 돌려준다. allUsers invoker 환경에서 다른 프로젝트가 발급받은 토큰은 email 검사에서 걸린다. **적합**.
- **권한**: `mong-api-run`은 비밀 4개 각각에 `secretAccessor`만, `mong-scheduler`는 `mong-api`에만 `run.invoker`를 받는다. 프로젝트 수준 역할은 없고 기본 Compute 계정도 쓰지 않는다. **최소 권한에 맞다.** 다만 안 쓰는 기본 계정의 정리가 빠졌다(L7).
- **인그레스 `all`**: 앱 API가 run.app에 직접 오고 Firebase rewrite도 공개 run.app을 부르는 구조(architecture 2-1)라서 맞는 판단이다.
- **작업 트리 확인**: 5fef729 기준 HEAD의 `env.ts`에는 `DB_QUERY_TIMEOUT_MS`가 **없다**. B7a(throttler 상한 저장소·query_timeout)는 아직 커밋되지 않은 작업 트리에만 있다(M3).
- **공식 가격 페이지**: Firebase 가격 페이지에서 Hosting Blaze 무료 한도가 **저장 10GB, 전송 하루 360MB**(일 단위로 계산)이고 넘으면 0.15달러/GB임을 확인했다. Cloud Run·Secret Manager 가격 페이지는 가져오기가 잘려 원문을 확인하지 못했다(M10).

## 높음

### H1. 플랫폼 요청 로그 제외가 처리방침(정본·테스터판)·K6과 어긋난다. DECISIONS ③의 '그대로 참'은 사실이 아니다
- 방침 문구:
  - 정본 3-1과 테스터판 28행: "클라우드 사업자(Google Cloud Run)의 접속 기록에는 IP 주소·User-Agent·요청 경로·시각 등이 **남으며** 7일 뒤 지워집니다."
  - 테스터판 67·79·99행: '클라우드 접속 기록 7일'.
  - '최대 7일'이라는 문구는 어디에도 없다. README 6절 #8과 DECISIONS ③은 '최대 7일로 그대로 참'이라고 했지만 근거가 없다.
- K6 증거 계획: "**요청 로그 한 건 원문 캡처**(`httpRequest.remoteIp`·`userAgent`·`requestUrl`)". 로그를 제외하면 이 증거를 만들 수 없다.
- 방침 원칙은 "넓게도 좁게도 쓰지 않음"이다. 지금 상태에서는 방침이 **남지 않는 기록을 남는다고** 적는 셈이다.
- 더 급한 문제: 안내서 14단계가 바로 이 테스터판을 게시한다(W 목록 마감 12-15). 11단계 설정과 14단계 게시물이 같은 날 서로 어긋난다.
- **고칠 것(같은 묶음에서)**:
  1. 제외를 유지하려면 정본 3-1·3-2(OTA 문단 148행)·6·8절, 테스터판 28·67·79·99행, K6(증거 = 싱크 제외 필터 출력 + 제외 뒤 `run.googleapis.com/requests` 0건 조회)을 함께 고친다. 문구 예: "운영자는 클라우드 접속 기록을 보관하지 않습니다(장애 조사 때 켜면 최대 7일)."
  2. 또는 architecture 5-2대로 `/m/`·`/deletion/`만 제외하고 7일 문구를 유지한다.
  3. 어느 쪽인지는 QA-3·PM이 **14단계 전에** 정한다.
  - '7일'이라는 숫자를 모두 지우면 안 된다. Supabase Auth 세션 기록(정본 3-4·K17)은 별개 항목이고, Pro 플랜 로그 보존과도 따로 대조해야 한다.

### H2. 비밀을 `key: latest`로 참조하면 **인스턴스가 시작될 때** 값을 읽는다. 안내서의 "새 리비전부터 새 값"은 틀렸다
- Cloud Run 문서는 환경 변수로 노출한 비밀이 인스턴스 시작 시점에 해석된다고 설명하고, `latest` 대신 판 번호 고정을 권한다. 그러면 새 판을 추가한 순간부터 **같은 리비전 안에서도** 콜드 스타트나 확장으로 뜬 인스턴스는 새 값을 쓰고, 기존 인스턴스는 옛 값을 쓴다.
- `RECOVERY_PEPPER`에서 특히 위험하다. 판이 섞이면 `RECOVERY_PEPPER_V=1`인 채로 다른 pepper가 해시를 만들어 **되찾기 글귀가 영구히 깨질 수 있다.** `DATABASE_URL` 교체 도중에도 인스턴스마다 다른 DB 자격을 쓰게 된다.
- **고칠 것**:
  - YAML의 비밀 4개를 판 번호로 고정한다. 최소한 `RECOVERY_PEPPER`와 `DATABASE_URL`은 고정한다.
  - `deploy.sh`가 `gcloud secrets versions list --filter=state=enabled --limit=1`로 최신 판 번호를 채워 넣는다.
  - pepper 교체는 `RECOVERY_PEPPER_V`·`RECOVERY_PEPPERS_PREVIOUS` 절차로만 한다고 안내서 8단계에 적는다.
  - 안내서 8단계 마지막 줄을 고친다.

## 중간

- **M1. 로그 단계 순서**: 11단계(`logging`)가 9단계(첫 배포)와 10단계(smoke·Scheduler) 뒤에 있다.
  - 그 사이 요청 로그(오너 IP 포함)가 `_Default` **global** 버킷에 30일 보존으로 쌓인 뒤에야 1일로 줄어든다. 테스터판 79행의 "처리·저장은 서울 리전"과도 잠시 어긋난다.
  - `logging`을 3~5단계(API 켜기 직후)로 당긴다. `deploy.sh`의 단계 목록 예시 순서도 함께 바꾼다.
- **M2. OTA 공개 인증서 단계가 실패한다**:
  - `apps/mobile/certs/` 폴더가 없어 13-3의 `cp … certs/ota-$C.pem`이 실패한다.
  - 폴더를 만들어도 `apps/mobile/.gitignore:31 *.pem`에 걸린다(`git check-ignore`로 확인). 따라서 확인 문구 "git status에 두 파일만 보인다"가 성립하지 않는다.
  - 고칠 것: `mkdir -p certs`, `.gitignore`에 `!certs/ota-*.pem`을 넣거나 팀이 `git add -f`. 개인키 파일명(`private-key.pem`)은 루트 `.gitignore`에 있어 안전하다.
- **M3. B7a 미커밋에 기대고 있다**:
  - 요청 제한 300초의 근거(`DB_QUERY_TIMEOUT_MS` 6초)와 '1Gi → 512Mi' 계획은 커밋되지 않은 B7a를 전제로 한다. HEAD 이미지에서는 `DB_QUERY_TIMEOUT_MS` 환경 변수가 무시된다.
  - `build`는 작업 트리가 더러우면 멈추지만, B7a가 커밋되지 않은 채 트리가 깨끗해지면 그대로 배포된다.
  - 안내서 9단계 앞에 "B7a 커밋 해시 ○○ 이후에만" 조건을 적고, `check`에 이미지 판 조건을 둘 수 있는지 검토한다.
- **M4. pepper를 클립보드로 다룬다**: `pbcopy`/`pbpaste`는 Universal Clipboard(같은 Apple ID의 iPhone·iPad)와 클립보드 기록 앱(Raycast·Alfred·Paste)에 값을 남긴다.
  - 대안: 비밀번호 관리자의 생성기로 만든 값을 ①처럼 `read -rs`로 넣거나, `openssl rand … > /Volumes/mong-keys/pepper-v1`처럼 암호화 볼륨에 쓴 뒤 `--data-file=`로 넣는다.
  - 8단계는 "13단계 오프라인 사본에도"라고 했지만 13단계에는 pepper를 dmg에 넣는 지시가 **없다**. pepper를 잃으면 모든 글귀가 무효가 되므로 지시를 넣어야 한다.
- **M5. README 5절 "프로젝트 소유자면 tokenCreator가 있음"은 의심스럽다** [확인 필요]: 기본 역할(Owner)에 `iam.serviceAccounts.getOpenIdToken`이 없어 `--impersonate-service-account`가 거부되는 경우가 흔하다. `mong-scheduler`에 대한 자원 단위 `roles/iam.serviceAccountTokenCreator`를 오너 본인에게 주는 한 줄을 넣고, 쓴 뒤 회수하도록 적는다.
- **M6. smoke가 거짓으로 통과할 수 있다**: `jobs run` 직후 `describe`의 `status`는 아직 시도 전이라 비어 있고, 안내서는 빈 값을 '성공'으로 읽는다. `lastAttemptTime`이 run 시각 이후인지 30초 정도 기다려 확인하고, 실패하면 문구를 출력하게 한다(cron 404 검사 실패도 지금은 아무 문구 없이 끝난다).
- **M7. '약 30분'은 처음 하는 사람에게 비현실적이다**: 리뷰어 추정은 **75~120분**이다.
  - Apple Silicon에서 linux/amd64 이미지를 에뮬레이션 빌드하면 pnpm 설치와 prisma generate까지 10~20분이 걸릴 수 있다.
  - 그 밖에 Supabase 생성 대기, 설정 5곳, 비밀번호 3개 생성·저장, DNS 대기, 도구 설치가 있다.
  - 제목을 '1~2시간(DNS 대기 제외), 두 번에 나눠도 됨'으로 바꾸고 중단점(6~8단계 뒤)을 표시한다.
- **M8. 2단계 인증 안내가 없다**: 방침 14절과 K21(관리 계정 2단계 인증, 증거 = 설정 화면 캡처)은 B6 몫인데, 0단계 준비물에 Google 계정·Supabase·Cloudflare의 2단계 인증 확인과 캡처 지시가 없다.
- **M9. DB 비밀번호 특수문자 문제**: 7-2에서 비밀번호 관리자로 만든 32자 이상 값에 `@ : / # ? %`가 들어가면 7-3과 8단계①의 `postgresql://…` URL이 깨진다. '영숫자만으로 생성' 또는 URL 인코딩을 지시한다.
- **M10. 비용표**:
  - ① Firebase Hosting 전송은 '월 10GB'가 아니라 **하루 360MB**(일 단위로 계산, 넘으면 0.15달러/GB)다. 링크가 퍼지는 날에는 월 합계가 한도 안이어도 과금된다.
  - ② Cloud Run 인터넷 송신(앱 API 응답, Cloud Run → Firebase rewrite 구간) 행이 없다 [확인 필요: 서울 송신 단가·무료분].
  - ③ Cloud Run 무료 한도가 서울(Tier 2)에도 같은지는 표에 [확인 필요]로 남아 있는데, 공식 페이지 원문을 이번에도 받지 못했다. 오너 실행 전에 팀이 가격 계산기로 확인한다.
  - ④ 이후 업타임·알림(B7 6절)에서 생길 수 있는 Monitoring 비용을 '없음'이 아니라 [확인 필요]로 둔다.
  - 그 밖의 행(AR 0.5GB, Secret Manager 활성 판 6개·접근 1만 회, Scheduler는 결제 계정당 3개·잡당 0.1달러, Logging 50GiB, Supabase Pro 25달러, 예산 120달러·25/50/100%)은 맞다.
- **M11. `--apply`에서 자리표시자가 통과한다**: `check`는 `SUPABASE_URL=https://REPLACE.supabase.co`와 `PROJECT_NUMBER=000000000000`을 그대로 받아들인다. 이 값으로 배포하면 부팅은 되지만 JWT 검증과 cron이 조용히 실패한다(aud 불일치 → 404). `--apply`일 때는 REPLACE·0으로만 된 값을 거부하고, `gcloud projects describe`로 확인한 번호와 대조하게 한다.

## 낮음

- L1. 다시 실행하면 안전하지 않은 단계가 있다.
  - `logging`의 `--add-exclusion`은 같은 이름이 이미 있으면 실패한다. `set -e` 때문에 뒤의 `_Default` 1일 설정도 건너뛴다.
  - `budget`은 실행할 때마다 예산을 하나씩 더 만든다.
  - 두 단계 모두 기존 설정이 있으면 건너뛰도록 확인을 넣는다.
- L2. `deploy.env`의 `ALERT_EMAIL`을 어디서도 쓰지 않는다. 예산 알림은 결제 관리자에게만 간다. 쓰지 않을 거면 지우고, 쓸 거면 알림 채널을 연결한다.
- L3. `deploy.sh` 3·211행과 YAML 머리말이 비밀값 넣기를 '10단계'로 가리키는데, 실제로는 8단계다.
- L4. smoke 실패가 아무 문구 없이 끝난다(M6과 함께 고친다).
- L5. 안내서 9단계의 "`/readyz` 503이면 서비스는 뜨지 않은 채 남는다"는 틀렸다. startup 프로브가 `/healthz`라서 리비전은 Ready가 되어 트래픽을 받는다(DB만 죽은 상태). 문구를 고친다.
- L6. 정리 정책 '최근 3개'에 대해:
  - ① buildx는 기본으로 provenance 증명을 붙여 이미지 인덱스와 추가 매니페스트를 만든다. 이것이 판 수를 차지할 수 있다 [확인 필요] → `--provenance=false --sbom=false` 검토.
  - ② 되돌릴 수 있는 범위가 빌드 3개뿐이고, 지운 이미지로는 되돌리거나 새 인스턴스를 띄우지 못할 수 있다. 보존 수를 5개로 늘리는 쪽을 검토한다.
- L7. 결제를 연결하면 기본 Compute 계정에 Editor 역할이 자동으로 붙고, Firebase를 추가하면 `firebase-adminsdk` 계정이 생긴다. 쓰지 않는 기본 Compute 계정의 Editor를 회수하거나 계정을 끄는 한 줄을 넣는다.
- L8. 7-2의 psql `sslmode=require`는 인증서를 검증하지 않는다(postgres 비밀번호를 입력하는 단계). Supabase CA로 `verify-full`을 쓰도록 권한다. README 6절 #2와 같은 CA를 쓰면 된다.
- L9. README 5절 수동 cron 명령은 OIDC 토큰을 curl 인자에 싣는다. smoke와 같은 `-H @-` 방식으로 바꾼다.
- L10. 그 밖:
  - 0단계의 `pnpm install && git pull` 순서가 거꾸로다.
  - 3단계 확인의 `grep -E 'run|…'` '5줄'은 `runtimeconfig` 같은 이름에도 걸릴 수 있다.
  - `--filter-projects=projects/<ID>`는 API가 프로젝트 **번호**를 받는다 [확인 필요].
  - `bash` 3.2에서는 문제가 없지만 Homebrew bash 5.2에서는 `patsub_replacement` 때문에 치환할 값에 `&`가 들어가면 깨진다. 지금 값들에는 `&`가 없다.

## 설정값 판단(요청 3)

- **동시성 40, max 3, min 0/1, 1Gi, cpu-boost, `/healthz` 프로브**: B7 5절과 같다. **타당**.
- **요청 제한 300초(B7 권고 60초 대신)**: **조건부 타당**.
  - storage-gc의 attemptDeadline 300초가 같은 서비스로 오므로 60초로 두면 Cloud Run이 먼저 끊고 재시도가 반복된다. 이 부분은 맞다.
  - B7이 걱정한 '멈춘 연결이 슬롯을 5분 잡는 일'은 B7a의 query_timeout(작업 트리)과 Supabase Auth 관리 호출의 자체 시간 제한(`auth-admin.ts` AbortController), JWKS 3초가 막아 준다.
  - 다만 조건이 둘 있다. ① B7a가 커밋되어야 한다(M3). ② 느리게 본문을 보내는 클라이언트는 여전히 슬롯을 300초까지 잡을 수 있다. 공개 경로에 Fastify `connectionTimeout`이나 경로별 30초 제한을 두면 위험이 남지 않는다.
  - OTA 큰 에셋은 지금 `STORAGE_DRIVER=none`이라 근거가 되지 않는다.
  - 두 번째 서비스를 버린 판단(설정 두 벌)은 동의한다.
- **플랫폼 요청 로그 제외가 운영 디버깅에 주는 영향**:
  - 잃는 것: 요청 단위의 상태·지연·전체 URL·IP·UA·trace. 특히 앱 **밖에서** 생긴 오류는 요청 로그에만 남는다. 인스턴스 한도 3에서 나는 "no available instance" 429/503, 플랫폼 504가 그렇다. B7 B2 같은 run.app 직접 홍수가 와도 출처 대역을 볼 수 없다.
  - 남는 것: Monitoring의 `request_count`(응답 코드 등급별)·`request_latencies`·인스턴스·메모리 지표, `varlog/system`(OOM·시작 실패), 앱 pino 로그.
  - 권고: 제외 필터를 '장애 조사 때 `disabled=true`로 잠시 끄고, 끝나면 켜기'로 운영 런북에 적는다. 방침 문구도 '켜면 최대 7일'로 맞춘다(H1).
  - XFF 실측(B6 첫날)도 요청 로그가 필요한지 팀이 미리 정한다. 필요하면 그날만 켜고 그 사실을 기록한다.
- **처리방침 문구를 줄일 수 있는가**: Cloud Run 접속 기록 문장은 줄일 수 있다(H1). 다만 '7일'을 통째로 지우면 안 된다. Supabase Auth 세션 기록(3-4·K17)과 Firebase Hosting 플랫폼 기록(148행 [확인 필요])은 각각 실측한 뒤 별도로 적는다.

## run.app 직접 호출을 막는 세 안에 대한 리뷰어 의견(요청 5)

1. **서버 코드(권장)에 동의한다. 단, 근거를 머리글이 아니라 '위조할 수 없는 마지막 홉'으로 바꾼다.**
   - `x-forwarded-host` 같은 표지는 누구나 붙일 수 있고, 위조한 표지에 위조한 XFF를 더하면 HOPS_WEB=2 위치에 공격자 값이 들어간다.
   - Google 프런트엔드가 덧붙이는 **가장 오른쪽 XFF 항목**(직접 연결한 상대 IP)은 위조할 수 없다. B6 실측에서 Firebase 경유 요청의 이 값이 어느 대역(Google 또는 Firebase CDN 송신 대역)인지 확인한다. 그 대역일 때만 HOPS_WEB/OTA를 적용하고, 아니면 가장 오른쪽 값(진짜 클라이언트)을 키로 쓴다.
   - 이렇게 하면 직접 호출이 키를 무한히 만들 수 없고, 정상적인 직접 호출이 한 키로 묶여 서로 막는 일도 없다.
   - 대역 목록은 바뀔 수 있으므로 실측 고정물(B7 스테이징)과 알림을 함께 둔다.
   - B7a의 상한 있는 저장소는 이 안과 별개로 반드시 둔다(OOM 방지).
2. **부하 분산기 + Cloud Armor**: 확실하지만 소프트런칭 규모에 월 약 18달러가 고정으로 들고, 앱 API 주소와 rewrite를 다시 설계해야 한다. 정식 출시 뒤 실제 남용이 관측될 때를 위한 예비안으로 둔다.
3. **Cloudflare Worker**: 국외 엣지 경유가 늘어난다. 처리방침 7·8절과 K27(PM 11-25 정정) 행을 추가해야 하고, 운영할 것도 하나 더 생긴다. **비권장**이다.

## 잘된 점

- 기본이 미리 보기이고, `--apply`가 아니면 원격 호출이 0건이다(확인함). `check`가 원격 명령보다 먼저 돌고, 설정값과 근거 문서를 결정적으로 대조한다.
- 비밀값은 이름만 다루고, 넣는 방법(`read -rs`·`--data-file=-`·`-H @-`)이 기록에 남지 않는다.
- 권한을 자원 단위로 좁혔고, OIDC audience와 `CRON_AUDIENCE`가 한 글자도 다르지 않음을 검사로 고정했다.
- 다이제스트로 이미지를 고정하고, 더러운 트리에서는 빌드를 막는다.
- 서명 키는 암호화 dmg + 비밀번호 관리자 + USB 오프라인 사본으로 관리하고, 서버·CI에는 두지 않는다. PM 11-25 ③, ota-self-host 6절과 같다.

## 오너 실행 전 필수

H1(방침·K6 정합 결정, 14단계 전) · H2(비밀 판 고정) · M1(로그 단계를 앞으로) · M2(certs 폴더·gitignore) · M3(B7a 커밋 조건) · M4(pepper 클립보드·오프라인 사본) · M11(자리표시자 거부)
