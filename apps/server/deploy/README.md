# apps/server/deploy — mong-api 배포 설정(B6)

- 작성: DV-3(서버·배포), 2026-11-25. 독립 리뷰 반영(`docs/team/reviews/2026-11-25-b6-prep-review.md`, 조건부 통과 → 높음 2·중간 11·낮음 10 반영).
- 오너용 단계별 안내는 `docs/ops/b6-owner-guide.md`. 이 문서는 팀용(무엇이 어디에, 왜, 운영 절차).
- 원격 자원은 아직 하나도 없다. 이 폴더는 **오너가 실행할 설정과 명령**만 담는다. 비밀값은 이름과 판 번호 자리만 있고 값은 없다.

## 1. 파일과 명령

| 파일 | 무엇 |
|---|---|
| `cloudrun/mong-api.service.yaml` | Cloud Run 서비스(Knative YAML). `${…}` 자리는 `deploy.sh`가 채운다. 비밀은 **판 번호 고정** |
| `scheduler/{storage-gc,moderation,cdn-purge}.flags.yaml` | Scheduler 잡 3개. `gcloud scheduler jobs create|update http <이름> --flags-file=`로 그대로 넘긴다(잡 정의의 단일 출처) |
| `registry/cleanup-policy.json` | Artifact Registry 정리 정책(최근 5개 보존, 나머지 14일 뒤 삭제) |
| `deploy.env.example` | 비밀 아닌 입력값. 사본은 저장소 밖 `~/.config/mong/deploy.env` |
| `deploy.sh` | 단계별 도우미. **기본 dry-run**(원격 호출 0), `--apply`일 때만 실행. `check`는 gcloud 없이 템플릿 문법·기대값을 검사 |

```sh
apps/server/deploy/deploy.sh check                                     # 문법·기대값만(로컬)
apps/server/deploy/deploy.sh check apis budget logging registry accounts secrets build deploy scheduler smoke   # 전체 미리 보기
apps/server/deploy/deploy.sh --apply --digest sha256:<64자> deploy      # 첫 배포·새 이미지
apps/server/deploy/deploy.sh --apply --digest current deploy            # 비밀만 바꿨을 때: 같은 이미지 + 새 판 번호로 새 리비전
apps/server/deploy/deploy.sh --apply --launch-week --digest current deploy   # 정식 출시 주: min 1
apps/server/deploy/deploy.sh --apply logs-on --hours 2                  # 장애 조사(7절)
apps/server/deploy/deploy.sh --apply k6                                 # 처리방침 K6 증거(7-3)
```

`--apply` 안전장치: ① 모든 단계 전에 `check` ② 자리표시자 거부(`PROJECT_NUMBER` 0만·`REPLACE`·Supabase 주소 꼴) + `gcloud projects describe` 번호 대조 ③ `build`는 HEAD에 B7a(`DB_QUERY_TIMEOUT_MS`·`RATE_LIMIT_MAX_KEYS`)가 없거나 apps/server·packages가 더러우면 멈춤 ④ `deploy`는 비밀마다 enabled 판이 없으면 멈춤 ⑤ `smoke`는 하나라도 틀리면 까닭을 찍고 실패 ⑥ `budget`·로그 제외·리소스 생성은 이미 있으면 건너뜀(다시 돌려도 안전).

## 2. 설정값과 근거

| 설정 | 값 | 근거 |
|---|---|---|
| 리전 | `asia-northeast3`(서울) — Cloud Run·AR·Scheduler·Secret Manager·로그 버킷 | architecture 0절·2-3 |
| 동시성 | 40 | B7-report 5절(동시 40 p95 39ms·134ms, DB 풀 5) |
| 인스턴스 | min 0(소프트런칭) / 1(정식 출시 주, `--launch-week`), max 3 | architecture 2-3, B7 5절 |
| 요청 제한 | 300초 **[잠정 — B7a 커밋 뒤 확정]** | architecture 2-4 Scheduler 행. 3절 |
| 메모리·CPU | 1GiB · 1, cpu-boost, 요청 기반 과금 | B7 5절(B2 OOM 고치기 전 1Gi) |
| 프로브 | startup·liveness = `/healthz`(DB 안 봄) — DB가 죽어도 리비전은 Ready가 되어 트래픽을 받는다. DB는 `smoke`의 `/readyz`로 본다 | B7 5절 |
| 인그레스 | `all` | 4절 |
| 이미지 | `asia-northeast3-docker.pkg.dev/<P>/mong/mong-api@sha256:…`(다이제스트 고정), linux/amd64, provenance·SBOM 끔 | architecture 6-4, 리뷰 L6 |
| 비밀 | `DATABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`·`RECOVERY_PEPPER`·`READY_TOKEN` — Secret Manager(서울만 복제), **판 번호 고정** | env.ts 운영 필수값, 리뷰 H2(6절) |
| 운영 필수 env(비밀 아님) | `TRUSTED_PROXY_HOPS_API/WEB/OTA`(시작값 1/2/2, 실측 전), `CRON_AUDIENCE`(= 서비스 주소, 경로 없음), `CRON_SA_EMAIL`, `SUPABASE_URL`, `STORAGE_DRIVER=none`, `REPORT_AUTO_HIDE=false` | env.ts superRefine, architecture 0-3 B5·B6 행 |
| DB 시간 | 풀 5 · 연결 1.5초 · statement 5초 · query 6초(B7a) | B7 5절, env.ts 교차 검사 |
| 서비스 계정 | `mong-api-run`(비밀 4개 각각 `secretAccessor`만), `mong-scheduler`(`mong-api`에 `run.invoker`만). 프로젝트 수준 역할 없음. 기본 Compute 계정의 자동 Editor는 회수 | 최소 권한, 리뷰 L7 |
| Scheduler | `storage-gc` 매일 04:30 KST, 300초, retry 2, 600→1200초, maxDoublings 1 / `moderation` 5분, 180초, retry 0 / `cdn-purge` 1분, 60초, retry 0. OIDC audience = `CRON_AUDIENCE` | architecture 2-4·0-3 B5 행, DECISIONS B3 |
| 로그 | 서울 버킷 `mong-logs` 7일, `_Default` 싱크 전환, **Cloud Run 플랫폼 요청 로그 제외**(조사 때만 시한부 수집 — 7절), 옛 `_Default` 버킷 1일. 첫 배포 **전에** | 처리방침 K6, architecture 5-2, 리뷰 M1 |
| 예산 | 결제 계정 통화로 120달러 상당, 25·50·100% + 예측 100%, 프로젝트 번호로 거름. 알림은 결제 관리자 메일로 | B7 6절 |

`deploy.sh check`가 위 값을 검사한다. 값을 바꾸면 검사 기대값도 같은 커밋에서 바꾼다.

## 3. 요청 제한 300초 — 잠정, B7a 커밋 뒤 확정
- `storage-gc`가 같은 서비스로 오고 attemptDeadline이 300초다. Cloud Run 제한이 더 짧으면 Cloud Run이 먼저 끊어 Scheduler가 재시도를 반복한다.
- B7이 60초를 권한 까닭(멈춘 DB 연결이 슬롯을 잡음)은 B7a `DB_QUERY_TIMEOUT_MS`(6초)·Auth Admin 호출의 자체 제한(`auth-admin.ts`)·JWKS 3초가 막는다. **B7a가 HEAD에 들어오기 전에는 `build --apply`가 멈춘다.** B7a 커밋 뒤 이 절의 '잠정'을 지우고 DECISIONS ①을 확정한다.
- 남는 위험: **느리게 본문을 보내는 클라이언트**가 공개 경로 슬롯을 300초까지 잡을 수 있다(동시성 40 × max 3 = 120 슬롯). 권고(서버 담당):
  1. 공개 경로(`/api/v1/**`·`/m/**`)는 **경로별 30초 제한**(본문 수신 + 처리) — Fastify `connectionTimeout`·`requestTimeout` 또는 Nest 인터셉터 타임아웃. 세이브 PUT(64KB)·핑은 정상이면 1초 안이다.
  2. `/internal/cron/*`만 300초를 허용한다(Scheduler는 본문 없음).
  3. OTA 에셋(스트림)은 저장소가 생긴 뒤 별도로 정한다(지금 `STORAGE_DRIVER=none`이라 근거 아님).
- 버린 안: cron 전용 두 번째 서비스(같은 이미지) — 비용 0이지만 배포·비밀·계정이 두 벌.

## 4. `*.run.app` 직접 호출 차단은 인그레스로 할 수 없다
- 앱 API는 `*.run.app`에 **직접** 오고(architecture 2-1), Firebase Hosting rewrite(`/m/**`, `ota.mongmang.ink`)도 **공개 run.app 주소**를 부른다. 인그레스를 좁히면 둘 다 끊긴다 → `ingress: all`, `check`가 고정.
- 막는 길(PM·서버 결정, DECISIONS B6 준비 ②):
  1. **서버 코드(권장, B7a)** — 위조할 수 있는 머리글이 아니라 **위조할 수 없는 마지막 홉**을 근거로 한다. Google 프런트엔드가 덧붙이는 XFF 가장 오른쪽 값(직접 연결한 상대)이 Firebase 송신 대역일 때만 web·ota 그룹 HOPS를 적용하고, 아니면 그 값을 리밋 키로 쓴다. 대역은 B6 실측으로 확인하고 스테이징 고정물·알림을 둔다. B7a의 상한 있는 저장소는 이것과 별개로 유지.
  2. 외부 HTTPS 부하 분산기 + Cloud Armor: 확실하지만 월 약 18달러 + 주소 재설계 — 실제 남용이 관측되면 쓰는 예비안.
  3. Cloudflare Worker: 국외 엣지 경유가 늘고 처리방침 7·8절·K27을 고쳐야 함 — 비권장.

## 5. 손으로 부르는 cron(복원 런북)
`reapply-deletions`는 정기 잡을 만들지 않는다(Scheduler 무료 3개 유지). `docs/ops/restore-runbook.md` 4단계의 'Scheduler에서 지금 실행' 대신 아래처럼 부른다.
- 권한: 공식 문서(IAM '서비스 계정 권한')는 ID 토큰 발급 권한 `iam.serviceAccounts.getOpenIdToken`을 가진 역할로 Service Account OpenID Connect Identity Token Creator(`roles/iam.serviceAccountOpenIdTokenCreator`)·Token Creator·Workload Identity User를 든다. 기본 역할 Owner가 이 권한을 포함하는지는 공식 문서에서 확인하지 못했다 **[확인 필요]** → 이전의 '소유자면 있음'은 근거가 없어 지웠다. 쓸 때만 `mong-scheduler` 계정 하나에 **가장 좁은 역할**을 주고, 끝나면 회수한다.
```sh
P=<프로젝트 ID>; SA=mong-scheduler@$P.iam.gserviceaccount.com; ME=$(gcloud config get-value account)
URL=https://mong-api-<프로젝트 번호>.asia-northeast3.run.app
gcloud iam service-accounts add-iam-policy-binding $SA --member=user:$ME --role=roles/iam.serviceAccountOpenIdTokenCreator --project=$P
# 토큰은 인자에 싣지 않고 헤더 파일로(-H @-) — ps·셸 기록에 남지 않는다(리뷰 L9)
gcloud auth print-identity-token --impersonate-service-account=$SA --audiences=$URL --include-email | sed 's/^/Authorization: Bearer /' | curl -fsS -X POST -H @- $URL/internal/cron/reapply-deletions
gcloud iam service-accounts remove-iam-policy-binding $SA --member=user:$ME --role=roles/iam.serviceAccountOpenIdTokenCreator --project=$P
```
런북 문구 정정은 런북 담당에게 넘긴다.

## 6. 비밀 바꾸기(판 번호 고정 — 리뷰 H2)
- `key: latest`는 **인스턴스가 시작될 때마다** 해석된다. 새 판을 넣는 순간 같은 리비전 안에서도 새로 뜬 인스턴스는 새 값, 기존 인스턴스는 옛 값을 쓴다(이전 안내서의 '새 리비전부터 읽는다'는 틀렸다). 그래서 YAML은 판 번호를 고정하고 `deploy`가 enabled 최신 판 번호를 채운다(`VER_<이름>=<번호>`로 직접 고를 수도 있다). `check`가 `latest`를 거부한다.
- 절차: ① 안내서 8단계 방식으로 새 판 추가(이 시점에는 운영이 옛 판을 그대로 씀) ② `deploy.sh --apply --digest current deploy`(같은 이미지, 새 판 번호, 새 리비전으로 트래픽 100%) ③ `smoke` ④ 되돌릴 일이 없으면 하루 뒤 옛 판 `gcloud secrets versions disable`.
- **`RECOVERY_PEPPER`는 이 절차로 값을 바꾸지 않는다.** 바꾸면 기존 되찾기 글귀가 모두 무효가 된다. 회전은 env.ts의 판 체계로만: 새 pepper를 새 판으로 넣고 `RECOVERY_PEPPER_V`를 올리며 옛 값은 `RECOVERY_PEPPERS_PREVIOUS`에 남긴다 — 이 env를 비밀로 받는 서버·YAML 변경이 필요하므로 회전 전에 팀이 따로 준비한다(8절 #8).

## 7. Cloud Run 요청 로그 — 운영 규칙(확정, 처리방침 K6과 같은 규칙)
처리방침: "Cloud Run 요청 로그는 제외 필터로 받지 않는다. 장애를 조사할 때만 필터를 잠시 끄고, 그때 받은 로그는 최대 7일 보관한다."

### 7-1. 평소
- `_Default` 싱크 제외 `run-platform-requests` = `log_id("run.googleapis.com/requests")`. 앱 로그(경로 틀·상태·지연, IP·UA 없음)만 `mong-logs`(서울, 보존 7일)에 남는다. 5xx·지연·인스턴스 알림은 Monitoring 지표(`request_count`·`request_latencies`)로 본다.
- 잃는 것(알고 쓰기): 앱 **밖**에서 생긴 오류(인스턴스 한도 3의 'no available instance' 429/503, 플랫폼 504), 직접 호출 홍수의 출처 대역. 이런 때가 7-2의 조사 사유다.

### 7-2. 장애 조사 때만 잠시 받기
| 항목 | 규칙 |
|---|---|
| 누가 | **오너만**(운영 책임자). 팀은 요청만 하고 직접 켜지 않는다 |
| 언제 | 앱 로그·지표로 원인이 안 보이는 장애, 직접 호출 홍수 출처 확인, XFF 실측(B6 첫날) |
| 얼마나 | 한 번에 **최대 4시간**(기본 2, `--hours 1~4`). 더 필요하면 다시 켜고 기록을 한 줄 더 |
| 잊지 않게 하는 장치 | `logs-on`은 필터를 끄는 대신 **만료 시각을 넣는다**: `log_id(…) AND timestamp>="<만료>"`. 만료 전 로그만 들어오고, **만료 뒤에는 끄는 것을 잊어도 자동으로 다시 제외**된다. 조사가 끝나면 `logs-off`로 시간 조건 없는 원래 꼴로 되돌린다 [확인 필요: 첫 사용 때 만료 뒤 7-3 ③이 0건인지 확인해 이 장치를 증명] |
| 보존 | 받은 로그는 `mong-logs` 보존 **7일** 뒤 자동 삭제. 내려받거나 다른 곳으로 옮기지 않는다 |
| 기록 | `docs/ops/log-debug-record.md`에 켠 시각·만료·까닭·끈 시각을 한 줄씩(`logs-on`·`logs-off`가 붙일 문장을 찍는다). 파일이 없으면 첫 사용 때 만든다 |

```sh
apps/server/deploy/deploy.sh --apply logs-on --hours 2    # 켬(만료 시각 자동)
apps/server/deploy/deploy.sh --apply logs-off             # 조사 끝
```

### 7-3. K6 첫날 증거(①~④, 처리방침 K6과 같은 명령)
`apps/server/deploy/deploy.sh --apply k6`가 아래를 차례로 출력한다(읽기만). 결과를 `docs/ops/`에 붙인다.
```sh
gcloud logging sinks describe _Default --format='yaml(destination,exclusions)'                         # ① 제외 필터
gcloud logging buckets describe mong-logs --location=asia-northeast3 --format='value(name,retentionDays)'  # ② 서울·7일
gcloud logging read 'log_id("run.googleapis.com/requests")' --freshness=1d --limit=5 --format='value(timestamp)'  # ③ 빈 출력 = 0건
# ④ Firebase 콘솔 > Hosting > 사이트 설정 > Cloud Logging 통합 '사용 안 함' 화면 캡처
```

## 8. 서버·다른 담당에게 넘길 것(이 폴더에서 고치지 않음)
| # | 무엇 | 담당 |
|---|---|---|
| 1 | **Supabase Storage 어댑터 없음**: `STORAGE_DRIVER`가 `none`·`local`뿐 → 링크 API·OTA 에셋은 운영에서 503(설계대로). 켜기 전에 어댑터 + 버킷 필요 | 서버 |
| 2 | **DB TLS**: pg 8.x는 `sslmode=require`를 verify-full로 다룬다. 첫 배포 `smoke`의 `/readyz`로 확인, 실패하면 Supabase CA(안내서 6단계에서 받는 것과 같은 파일)를 이미지에 넣고 `ssl.ca`로 검증(평문·검증 끄기 금지) | 서버 |
| 3 | CDN 무효화 실제 호출과 그 권한(사이트 하나로 좁힌 역할 — 그때 이 폴더에 추가) | 서버 |
| 4 | firebase.json `/api/v1/ota/**` rewrite 없음 | web-static |
| 5 | `run.app` 직접 호출 차단(4절 1안), 공개 경로 30초 제한(3절) | 서버(B7a) |
| 6 | 정적 빌드 `API_ORIGIN` = 결정적 주소 | web-static·오너 |
| 7 | 복원 런북 4단계 문구(5절) | 런북 담당 |
| 8 | pepper 회전용 `RECOVERY_PEPPERS_PREVIOUS`를 비밀로 받는 경로(6절) | 서버 |

## 9. B6 첫날 팀이 실측할 것(오너 배포 뒤)
1. XFF(API 직접·Firebase `/m`·`ota`) → `HOPS_*` 고정 + e2e 고정물. 요청 로그가 필요하면 오너가 `logs-on`(7-2)으로 그날만 켜고 기록. 그 전까지 `REPORT_AUTO_HIDE=false`(출시 차단 조건).
2. Firebase `/m/**` rewrite가 서버 `Cache-Control`·`Sec-Fetch-Site`·`Origin`을 보존하는지, 마지막 홉 대역(4절 1안).
3. 콜드 스타트 L2(20분 유휴 → 첫 응답 < 3초), Supabase 풀러 왕복 ms.
4. Scheduler 세 잡 OIDC 통과, `gc_stuck` 등 error 로그 알림 연결.
5. 업타임 U1~U6·알림(B7-report 6절) — Monitoring 설정은 그때 이 폴더에 더한다(비용 [확인 필요]).
6. 7-3 K6 증거. Cloud Run 서울(Tier 2) 무료 한도 공식 확인(가격 계산기).
