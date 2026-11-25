# apps/server/deploy — mong-api 배포 설정(B6)

- 작성: DV-3(서버·배포), 2026-11-25. 오너용 단계별 안내는 `docs/ops/b6-owner-guide.md`. 이 문서는 팀용(무엇이 어디에, 왜).
- 원격 자원은 아직 하나도 없다. 이 폴더는 **오너가 실행할 설정과 명령**만 담는다. 비밀값은 이름만 있고 값은 없다.

## 1. 파일

| 파일 | 무엇 |
|---|---|
| `cloudrun/mong-api.service.yaml` | Cloud Run 서비스(Knative YAML). `${…}` 자리는 `deploy.sh`가 채운다 |
| `scheduler/{storage-gc,moderation,cdn-purge}.flags.yaml` | Scheduler 잡 3개. `gcloud scheduler jobs create|update http <이름> --flags-file=`로 그대로 넘긴다(잡 정의의 단일 출처) |
| `registry/cleanup-policy.json` | Artifact Registry 정리 정책(최근 3개 보존, 나머지 14일 뒤 삭제 — 무료 0.5GB 안) |
| `deploy.env.example` | 비밀 아닌 입력값(프로젝트 ID·번호·Supabase 주소·hops 시작값). 사본은 저장소 밖 `~/.config/mong/deploy.env` |
| `deploy.sh` | 단계별 도우미. **기본 dry-run**(명령을 찍기만), `--apply`일 때만 실행. `check`는 gcloud 없이 템플릿 문법·기대값을 검사 |

```sh
apps/server/deploy/deploy.sh check                                   # 문법·기대값만(로컬)
apps/server/deploy/deploy.sh check apis registry accounts secrets logging budget build deploy scheduler smoke   # 전체 미리 보기
apps/server/deploy/deploy.sh --apply --digest sha256:<64자> deploy    # 실제 배포(오너)
apps/server/deploy/deploy.sh --apply --launch-week --digest … deploy  # 정식 출시 주: min 1
```

## 2. 설정값과 근거

| 설정 | 값 | 근거 |
|---|---|---|
| 리전 | `asia-northeast3`(서울) — Cloud Run·AR·Scheduler·Secret Manager·로그 버킷 | architecture 0절·2-3 |
| 동시성 | 40 | B7-report 5절(동시 40 p95 39ms·134ms, DB 풀 5) |
| 인스턴스 | min 0(소프트런칭) / 1(정식 출시 주, `--launch-week`), max 3 | architecture 2-3, B7 5절 |
| 요청 제한 | **300초** | architecture 2-4 Scheduler 행 'Cloud Run 요청 timeout 300초 이상'. B7은 60초를 권했다 — 3절 |
| 메모리·CPU | 1GiB · 1, cpu-boost, 요청 기반 과금 | B7 5절(B2 OOM 고치기 전 1Gi) |
| 프로브 | startup·liveness = `/healthz`(DB 안 봄) | B7 5절 |
| 인그레스 | `all` | 4절 |
| 이미지 | `asia-northeast3-docker.pkg.dev/<P>/mong/mong-api@sha256:…`(다이제스트 고정), linux/amd64 | architecture 6-4 |
| 비밀 | `DATABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`·`RECOVERY_PEPPER`·`READY_TOKEN` — Secret Manager(서울만 복제), `latest` | env.ts 운영 필수값, architecture 6-4 |
| 운영 필수 env(비밀 아님) | `TRUSTED_PROXY_HOPS_API/WEB/OTA`(시작값 1/2/2, 실측 전), `CRON_AUDIENCE`(= 서비스 주소, 경로 없음), `CRON_SA_EMAIL`, `SUPABASE_URL`, `STORAGE_DRIVER=none`, `REPORT_AUTO_HIDE=false` | env.ts superRefine, architecture 0-3 B5·B6 행 |
| DB 시간 | 풀 5 · 연결 1.5초 · statement 5초 · **query 6초**(B7a) | B7 5절, env.ts 교차 검사(query > statement, connect < ready 2초) |
| 서비스 계정 | `mong-api-run`(비밀 4개 각각 `secretAccessor`만), `mong-scheduler`(`mong-api`에 `run.invoker`만). 프로젝트 수준 역할 없음, 기본 Compute 계정 안 씀 | 최소 권한 |
| Scheduler | `storage-gc` 매일 04:30 KST, attemptDeadline 300초, retry 2, minBackoff 600초, maxBackoff 1200초, maxDoublings 1 / `moderation` 5분, 180초, retry 0 / `cdn-purge` 1분, 60초, retry 0. OIDC audience = `CRON_AUDIENCE`와 같은 글자 | architecture 2-4·0-3 B5 행, DECISIONS B3 |
| 로그 | 서울 버킷 `mong-logs` 7일, `_Default` 싱크 전환, **Cloud Run 플랫폼 요청 로그 제외**, 옛 `_Default` 버킷 1일 | architecture 5-2, B4-report 3절 12, B7 4절 |
| 예산 | 결제 계정 통화로 120달러 상당, 25·50·100% + 예측 100% | B7 6절(30·60·120달러) |

`deploy.sh check`가 위 값(동시성·max·min 범위·timeout·메모리·CPU·인그레스·이미지 다이제스트 꼴·서비스 계정·비밀 4개는 참조만·비밀값처럼 보이는 평문 금지·cron audience·잡 3개 일정·제한·재시도·백오프·잡 제한 ≤ Cloud Run 제한·정리 정책)을 검사한다. 값을 바꾸면 검사 기대값도 같은 커밋에서 바꾼다.

## 3. 결정: 요청 제한 300초(B7의 60초 대신)
`storage-gc`가 같은 서비스로 오고 attemptDeadline이 300초다(대기열 약 200건 + 정리 예산 60초 + 여유). Cloud Run 제한이 그보다 짧으면 Cloud Run이 먼저 끊어 Scheduler가 실패로 보고 재시도한다. B7이 60초를 권한 까닭(멈춘 DB 연결이 슬롯을 5분 잡음)은 B7a의 `DB_QUERY_TIMEOUT_MS`(6초)가 먼저 끊으므로 해소된다. OTA 큰 에셋이 느린 회선에서 오래 걸리는 경우도 300초가 더 안전하다. 버린 안: cron 전용 두 번째 서비스(같은 이미지) — 비용 0이지만 배포·비밀·계정이 두 벌이 된다.

## 4. `*.run.app` 직접 호출 차단은 인그레스로 할 수 없다
- 앱 API는 `*.run.app`에 **직접** 온다(architecture 2-1 — 세이브·글귀가 Firebase를 거치지 않게). Firebase Hosting rewrite(`/m/**`, `ota.mongmang.ink`)도 Cloud Run을 **공개 run.app 주소**로 부른다. 인그레스를 `internal-and-cloud-load-balancing`으로 좁히면 앱 API와 rewrite가 **둘 다** 끊긴다. 그래서 `ingress: all`이고 `check`가 이 값을 고정한다.
- B7 B2의 위험(`*.run.app/m/…` 직접 호출로 XFF 왼쪽을 바꿔 리밋 키를 무한히 만듦)은 남는다. 막는 길(PM·서버 결정 필요, DECISIONS B6 준비 ②):
  1. **서버 코드(권장, B7a 담당)**: `/m/**`·`/api/v1/ota/**`(web·ota 그룹)은 Firebase를 거쳐야만 받는다 — Firebase가 붙이는 표지(`x-forwarded-host: mongmang.ink`·`ota.mongmang.ink`)가 없으면 404. 표지는 위조할 수 있으므로 **위조해도 이득이 없게**(그 경우 XFF를 믿지 않고 소켓 주소 = Google 프런트엔드 한 키로 묶음) 한다. B6 실측에서 Firebase가 실제로 붙이는 머리글을 확인한 뒤 고정.
  2. 외부 HTTPS 부하 분산기 + 서버리스 NEG + Cloud Armor, 인그레스 `internal-and-cloud-load-balancing`: 확실하지만 월 약 18달러 + 앱 API 주소·Firebase 경로 재설계.
  3. Cloudflare Worker 앞단(architecture 3-8): DNS가 이미 Cloudflare. 앱 API까지 Worker를 거치면 국외 엣지 경유가 늘어난다(PM 11-25 정정으로 전제는 약해졌음).
- 그 전까지 완화: B7a 상한 있는 리밋 저장소 + 메모리 1GiB + max 3 + 메모리 80% 알림(B7 6절).

## 5. 손으로 부르는 cron(복원 런북)
`reapply-deletions`는 정기 잡을 만들지 않는다(Scheduler 무료 3개 유지). `docs/ops/restore-runbook.md` 4단계의 'Scheduler에서 지금 실행' 대신 오너가 같은 서비스 계정 토큰으로 직접 부른다(오너 계정에 `mong-scheduler`의 `iam.serviceAccountTokenCreator`가 있어야 한다 — 프로젝트 소유자면 있음):
```sh
URL=https://mong-api-<프로젝트 번호>.asia-northeast3.run.app
curl -fsS -X POST -H "Authorization: Bearer $(gcloud auth print-identity-token --impersonate-service-account=mong-scheduler@<P>.iam.gserviceaccount.com --audiences=$URL --include-email)" $URL/internal/cron/reapply-deletions
```
런북 문구 정정은 런북 담당에게 넘긴다(이 폴더 범위 밖).

## 6. 서버·다른 담당에게 넘길 것(이 폴더에서 고치지 않음)
| # | 무엇 | 담당 |
|---|---|---|
| 1 | **Supabase Storage 어댑터 없음**: `STORAGE_DRIVER`가 `none`·`local`뿐 → 운영에서 링크 API·OTA 에셋은 503(설계대로). 링크·OTA를 켜기 전에 Supabase 어댑터 + 버킷(`page-staging`·`public-pages`·`quarantine`·`ota-assets`) 필요 | 서버(B3·V21 후속) |
| 2 | **DB TLS**: pg 8.x는 `sslmode=require`를 verify-full로 다룬다. Supabase 풀러 인증서가 공개 CA가 아니면 연결 실패 → 첫 배포 `/readyz`로 확인, 실패하면 Supabase CA를 이미지에 넣고 `ssl.ca`로 검증(평문 연결이나 검증 끄기로 풀지 않는다). 오너 안내서는 Supabase 'Enforce SSL'을 켜게 해 실패가 조용히 평문으로 새지 않게 했다 | 서버 |
| 3 | **CDN 무효화 실제 호출**: `cdn-purge`는 지금 횟수만 센다. Firebase 릴리스 호출을 넣으면 실행 계정에 Hosting 권한이 필요하다(사이트 하나로 좁힌 역할 — 그때 이 폴더에 추가) | 서버(B3 후속) |
| 4 | **`/api/v1/ota/**` Firebase rewrite 없음**: firebase.json에 `/m/**`만 있다. `ota.mongmang.ink`가 동작하려면 같은 rewrite가 필요 | web-static |
| 5 | `run.app` 직접 호출 차단(4절 1안) | 서버(B7a) |
| 6 | 정적 빌드 `API_ORIGIN` = `https://mong-api-<프로젝트 번호>.asia-northeast3.run.app`(결정적 주소) | web-static·오너 |
| 7 | 복원 런북 4단계 문구(5절) | 런북 담당 |
| 8 | 처리방침 3-1 '접속 기록 7일': 플랫폼 요청 로그를 받지 않으므로 운영자 쪽은 7일보다 짧다(앱 로그엔 IP 없음). '최대 7일'로 그대로 참 — 문구를 줄일지 QA-3·PM 판단(B4-report P9) | QA-3·PM |

## 7. B6 첫날 팀이 실측할 것(오너 배포 뒤)
1. XFF 프록시 수(API 직접·Firebase `/m`·`ota`) → `HOPS_*` 고정 + e2e 고정물. 그 전까지 `REPORT_AUTO_HIDE=false`(출시 차단 조건).
2. Firebase `/m/**` rewrite가 서버 `Cache-Control`(300·60·503·429 no-store)·`Sec-Fetch-Site`·`Origin`을 보존하는지.
3. 콜드 스타트 L2(20분 유휴 → 첫 응답 < 3초), Supabase 풀러 왕복 ms.
4. Scheduler 세 잡 OIDC 통과(404가 아닌 200), `gc_stuck` 등 error 로그 알림 연결.
5. 업타임 U1~U6·알림(B7-report 6절) — Monitoring 설정은 그때 이 폴더에 더한다.
