# B1 서버 골격 · B0 측정 시계 결과 보고 (2026-11-20)

> B0(측정 시계)는 맨 아래 **7절**. 1~6절은 B1 기록.

- 범위: 로드맵 B1(`apps/server` 골격: NestJS + Prisma + 로컬 DB + Docker·compose + 헬스체크 + CI). B0(집계 핑·`config/v1.json`·`/m` 임시 정적·AASA·assetlinks)는 **하지 않았다**. 골격 위에 얹는 다음 작업이다(아래 '남은 일').
- 정본: `architecture.md` v2 2-5·3-1·3-2·3-8·6절, DECISIONS D-21·D-23. 서버 v2 독립 리뷰가 진행 중이라 테이블 열은 최소로 두었고, 리뷰에서 먼저 나온 네 항목(아래 3절)은 반영했다.
- 커밋하지 않았다.
- **2차(같은 날): B1 독립 리뷰(`docs/team/reviews/2026-11-20-server-b1-review.md`, '고친 뒤 커밋 가능') 팀 결정을 반영했다 → 6절.** 1~4절은 1차 기록이고, 6절과 다르면 6절이 맞다.

## 1. 만든 것

| 영역 | 내용 | 파일 |
|---|---|---|
| 스택 | NestJS 12.5.1(ESM) + Fastify 5, Prisma 7.10.1(`prisma-client` 생성기 + `@prisma/adapter-pg`), zod 4, nestjs-pino 5, @nestjs/throttler 6, @nestjs/swagger 12, TypeScript ~6.0.3, Vitest 5(팀과 같음). 버전은 2026-11-20 npm 기준 최신 안정판(Prisma `latest` 태그는 8.0.0-rc라 7.x 마지막 안정판으로) | `apps/server/package.json` |
| 설정 | `@nestjs/config` + zod 검증. 틀리면 시작하지 않고, 오류 문구에 값(비밀번호)을 싣지 않는다. `.env` 파일은 읽지 않음(compose·Cloud Run 환경 변수) | `src/config/env.ts`, `.env.example` |
| 헬스체크 | `GET /healthz` 라이브니스 `{ok, ver, saveSchema, simSchema}`(DB 안 봄), `GET /readyz` DB `select 1`(제한 2초, 실패 503 `db_unavailable`). 둘 다 `no-store`·레이트 리밋 제외·요청 로그 제외. DB 연결은 lazy라 DB가 죽어도 프로세스는 뜬다 | `src/health/*`, `src/prisma/prisma.service.ts` |
| 로그 | pino JSON 한 줄, `severity`를 Cloud Logging 이름으로. 요청 id는 `x-request-id`를 이어받거나 UUID | `src/common/logging.ts` |
| 에러 | 전역 필터 — 모든 오류가 `{error:{code,message,details?}, requestId}`. 500은 내용을 숨기고 스택은 로그에만. zod 오류 400, 레이트 리밋 429, Fastify 4xx(본문 초과·깨진 JSON)도 같은 모양 | `src/common/http-exception.filter.ts` |
| 레이트 리밋 | 전역 IP당 120/분(설정), 경로별은 `@Throttle`. 키 = 아래 3절 ① | `src/common/throttler.guard.ts`, `client-ip.ts` |
| OpenAPI | `OPENAPI_UI=true`면 `/api/docs`, `pnpm --filter server openapi` → `openapi.json`(CI 산출물). 요청 스키마는 zod → `z.toJSONSchema(target openapi-3.0)` | `src/app.factory.ts`, `src/openapi.ts` |
| core 재사용 | `POST /api/v1/saves/validate {save}` — `@mong/core`의 `sim.parseState`로 검사(검증됨 200 / 미래 버전 200 `validated:false, future:true` / 손상·옛 형식 422 `save_invalid`). B2 `PUT /saves/main`이 같은 `inspectSave`를 쓴다. `/healthz`의 `saveSchema`·`simSchema`도 core 상수 | `src/saves/*`, `src/version.ts` |
| Prisma | 스키마 `app`, 표 3개(`users`·`creatures`·`saves`) — B2·B3 첫 작업에 꼭 필요한 최소. init 마이그레이션 1개 + RLS 켜기(정책 0개). `prisma.config.ts`: CLI는 `DIRECT_URL`(세션 풀러/직접), 런타임은 `DATABASE_URL`(트랜잭션 풀러) + 풀 5 | `prisma/*`, `prisma.config.ts` |
| Docker | node:24-slim 다단(manifests → deps → build → prod-deps → runtime), pnpm 12.16.1, `--filter server...`로 서버·core만 설치, `prisma generate` → tsup 번들, 운영 의존성만, Prisma 런타임에서 postgresql 외 wasm 제거, 비루트(`node` uid 1000), `HEALTHCHECK /healthz`, 시작 때 마이그레이션 없음 | `Dockerfile`, `Dockerfile.dockerignore` |
| compose | `db`(postgres:17-alpine, 127.0.0.1:54329) → `migrate`(build 단계 이미지로 `prisma migrate deploy` 한 번) → `api`(8080) | `compose.yaml` |
| CI | `server-ci.yml`: ① 서버·core만 설치 → typecheck → test → Postgres 서비스에 migrate deploy → 실제 DB 시험 → **스키마·마이그레이션 어긋남 검사**(`migrate diff --exit-code`) → OpenAPI 산출물 ② docker build(push 없음, gha 캐시) → compose up `--wait` → `/healthz`·`/readyz`. 비밀값 없음, B6용 Secrets 이름만 주석 | `.github/workflows/server-ci.yml` |
| 저장소 | `pnpm-workspace.yaml`에 `allowBuilds`(Prisma 엔진·SWC·esbuild 허용, scarf 텔레메트리 차단), `pnpm-lock.yaml` 갱신. 루트 `pnpm test`·`pnpm typecheck`(`pnpm -r`)는 서버를 자동 포함 | — |

## 2. 판단한 것(정본과 다르거나 정본이 [확인 필요]였던 곳)

1. **core를 빌드하지 않고 서버 번들에 넣었다.** 정본 6-1은 core `tsup → dist` + `exports` 조건 분기를 적었지만, core의 `main`·`exports`를 바꾸면 Metro(웹·네이티브)와 앱 Vitest의 해석이 바뀔 수 있다(금지: 앱 동작 변경). 서버는 tsup(esbuild, `emitDecoratorMetadata`면 SWC)으로 `@mong/core`와 Prisma 생성 클라이언트를 TS 원본째 번들에 넣는다(6-2가 허용한 '한 파일 번들' 대안). core 파일은 하나도 고치지 않았다. Node에서 core가 도는 것은 컨테이너 안 `/api/v1/saves/validate`로 확인(core 고정물 v1 세이브 → 200 검증됨). 웹 뷰어(B3 live.js)도 esbuild 번들이라 같은 방식이 통한다 — core `exports` 정리는 필요해질 때 core 담당과 따로.
2. **`pnpm deploy` 대신 `--prod --filter server` 설치**: 정본 6-2의 [확인 필요](`pnpm deploy` + `nodeLinker: hoisted`)를 피했다. core가 번들 안이라 운영 의존성에 워크스페이스 패키지가 없어 단순 설치로 충분하다. `@mong/core`는 서버의 devDependency.
3. **로컬 DB = postgres:17 하나**: 이 Mac에 supabase CLI가 없다(다른 프로젝트의 Supabase 로컬 스택이 54322 등을 쓰는 중이라 포트도 54329로 피함). B1에 필요한 것은 Postgres뿐이고, Auth·Storage가 필요한 B2·B3부터 `pnpm dlx supabase start`(Studio 54323, DB 54322)로 바꾸면 `DATABASE_URL`만 바뀐다. 마이그레이션의 RLS SQL은 일반 Postgres에서도 돈다. `auth.users` 외래 키는 두지 않았다(로컬 Postgres에 `auth` 스키마 없음 — B2에서 Supabase 로컬로 바꿀 때 결정).
4. **이미지 크기**: 압축(레지스트리) **94.6MB**, 풀린 디스크 450MB. 정본 목표 '200MB 미만'을 레지스트리 크기로 보면 통과, 풀린 크기로 보면 미달(node:24-slim 자체가 약 200MB). 더 줄이려면 distroless node 또는 esbuild로 node_modules까지 번들 — B6에서 콜드 스타트 실측 뒤 판단.
5. **Prisma 7.10.1**: npm `latest`가 8.0.0-rc라 정본(Prisma 7)과 안정판 기준으로 7.x를 고정.

## 3. 서버 v2 리뷰 선반영(조정자 전달 4건)

| # | 요청 | 반영 |
|---|---|---|
| ① | 신뢰할 XFF 위치를 설정 하나로, IPv6 /64 접기 + 테스트 | `TRUSTED_PROXY_HOPS`(기본 0 = XFF 무시). 오른쪽에서 hops번째만 믿고, 체인이 짧거나 IP가 아니면 소켓 주소. Fastify `trustProxy`는 끔(판단 지점 하나). `rateLimitKey`: IPv4 그대로, `::ffff:` 매핑은 IPv4로, IPv6는 `xxxx:xxxx:xxxx:xxxx::/64`. 단위 12개 + e2e(같은 /64 한 키·다른 /64 따로·왼쪽 위조 무시). Cloud Run 단독 1 / Firebase 경유 2는 **B6에서 실측 [확인 필요]** |
| ② | `creatures` UNIQUE(user_id) DB 제약 | `userId @unique` → `creatures_user_id_key`. 실제 DB 시험으로 두 번째 생성 거부·CASCADE 확인 |
| ③ | IP와 링크 코드를 같은 로그 줄에 두지 않음 | 규칙을 `logging.ts` 머리에 고정: 요청 로그 필드 화이트리스트(reqId·method·route·statusCode·responseTime), **IP·XFF·UA·Authorization·Cookie는 어떤 로그에도 없음**(직렬화기 + redact 이중), 쿼리 문자열 제거, 본문 미기록. 실행 로그로 확인 |
| ④ | 관리 도구 골격에서 제외 | `admin` 모듈·`ADMIN_MODE` 없음. `app.module.ts`에 미룬 사실만 주석 |

## 4. 검증(실행 명령과 결과)

| 명령 | 결과 |
|---|---|
| `pnpm typecheck`(루트) | core·mobile·server 모두 Done |
| `pnpm --filter server test` | 5파일 **37개 통과**(client-ip 12·env 4·에러 필터 6·세이브 계약 6·e2e 9 — 실제 Nest+Fastify를 supertest로) |
| `pnpm --filter mobile test` | 10파일 84개 통과 |
| `pnpm --filter @mong/core exec vitest run --testTimeout=200000` | 16파일 207개 통과 |
| `pnpm test`(루트) | core `dream-card.test.ts` 1개가 **5초 타임아웃**(Docker 빌드·다른 작업과 동시 부하). 단독 실행은 7/7 통과 — 기존에 알려진 부하 타임아웃(progress.md '--testTimeout=200000')이고 이번 변경과 무관. core 파일은 건드리지 않음 |
| `docker build -f apps/server/Dockerfile -t mong-api:local .` | 성공(첫 빌드 157초), 압축 94.6MB, 사용자 uid 1000(node) |
| `docker compose -f apps/server/compose.yaml up -d --build --wait db api` | db healthy → migrate `20261120000000_init` 적용 후 종료(0) → api **healthy** |
| `curl localhost:8080/healthz` / `/readyz` | **200** `{"ok":true,"ver":"local-compose","saveSchema":2,"simSchema":2}` / **200** `{"ok":true,"db":"up"}` |
| `docker compose stop db` 후 | `/healthz` 200 유지, `/readyz` **503** `db_unavailable` |
| 컨테이너 `POST /api/v1/saves/validate`(core 고정물 v1-ire-developed) | 200 `validated:true, simVer:1, dayIndex:7, strokesTotal:7` |
| `DATABASE_URL=…54329 pnpm --filter server test:db` | 3개 통과(readyz·UNIQUE·CASCADE·RLS 켜짐) |
| `prisma migrate diff --from-config-datasource --to-schema … --exit-code` | No difference detected |
| `pnpm --filter server openapi` | `openapi.json`(OpenAPI 3.0, 경로 3개) |
| GitHub Actions `server-ci.yml` | **실행 못 함**(푸시하지 않음). 같은 단계를 로컬에서 위와 같이 확인 |

## 5. 남은 일·주의

- **B0**: `POST /api/v1/ping`(메모리 합산 → `metric_daily`, 표는 그때 마이그레이션 추가), `apps/web-static`(config/v1.json·content/v1.json·AASA·assetlinks·`/m` 임시 랜딩) — B6 배포 경로가 생긴 뒤.
- `/api/v1/saves/validate`는 개발 전용 예시다(운영 이미지에는 없음 — 6절).
- 404(없는 경로)는 가드보다 먼저 끝나 레이트 리밋을 받지 않는다. B3 `/m/{code}` '사라진 링크'는 실제 경로라 한도가 걸린다(3-8의 30/분은 그때 `@Throttle`).
- `.github/`는 이번에 처음 생긴 폴더다. 저장소가 GitHub(`Piousangel/mongmange`)에 있으므로 푸시하면 PR·main에서 돈다. 액션 메이저 버전(checkout v7·setup-node v7·pnpm/action-setup v6·buildx v4·build-push v7·upload-artifact v7)은 11-20 기준 최신.
- 이 작업 중 작업 트리의 `DECISIONS.md`·`packages/core/*`·`apps/mobile/*` 변경은 다른 작업자의 것이다(이 작업은 건드리지 않음).

## 6. 2차 — B1 리뷰 팀 결정 반영

| 리뷰 | 팀 결정 | 반영 | 검사 |
|---|---|---|---|
| I1 XFF | 운영 필수·0이면 부팅 거부, 정본 3-8 `clientIp(req, routeGroup)` | `TRUSTED_PROXY_HOPS_API`(앱 직접)·`TRUSTED_PROXY_HOPS_WEB`(`/m/**`, Firebase 경유). `NODE_ENV=production`이면 둘 다 ≥1 필수(zod `superRefine`). `ClientIpService.clientIp(req, group)`(경로로 그룹 자동 선택), 가드는 DI로 받는다(모듈 전역 가변 값 제거) | env.test(없음·0 거부), e2e(web은 오른쪽 2번째·api는 1번째, 엣지 주소가 바뀌어도 같은 키) |
| I2 /readyz | 공개 경로에서 빼기, 짧은 캐시, 풀 연결 제한 시간 설정화 | `READY_TOKEN`(운영 필수, 16자+) — `x-ready-token`이 다르면 404. OpenAPI에서 제외. 결과 캐시 `READY_CACHE_MS`(기본 2초) + 동시 요청 단일 비행, 실패는 캐시 창마다 warn 한 줄. 레이트 리밋 적용. `DB_CONNECT_TIMEOUT_MS`(기본 1.5초, `< READY_TIMEOUT_MS`를 zod로 강제) + `DB_STATEMENT_TIMEOUT_MS`(기본 5초) | e2e(토큰 없음/틀림 404, 캐시 창 안 DB 1회, 타임아웃 503), env.test |
| I3 마이그레이션 | DIRECT_URL 없으면 실패 | `prisma.config.ts`: `migrate`·`db`·`studio`는 `DIRECT_URL` 필수, `:6543`(트랜잭션 풀러)이면 거부. `DATABASE_URL`로 대신하지 않음. generate는 DB 불필요라 자리 URL | 손으로 확인(없음·6543 둘 다 오류 문구) |
| I4 RLS | 비슈퍼유저 런타임 롤로 시험, 소유자·롤 분리 재현 | `prisma/local/00-roles.sql`(compose·CI): 비슈퍼유저·NOBYPASSRLS `prisma` 롤이 마이그레이션과 런타임을 함께 쓴다(정본 2-4 '소유자'), `anon`·`authenticated` 자리 롤. init 마이그레이션에 방어 겹(`anon`·`authenticated`가 있으면 `app` 권한 회수, 없으면 건너뜀) | test:db 6개: 롤이 슈퍼유저·BYPASSRLS 아님·표 소유자, RLS 켜짐·정책 0, **anon은 permission denied**, **소유자 아닌 롤은 SELECT 권한을 줘도 0행**(Supabase에서 런타임 롤을 잘못 붙였을 때 모습) |
| I5 로그 | IP·헤더·쿼리 토큰 미기록을 테스트로, route는 템플릿 | Fastify `onRequest` 훅이 `routeOptions.url`(템플릿)을 원본 요청에 붙이고 직렬화기는 그것만 쓴다 → `/m/:code`, 404는 `null`. 쿼리 문자열은 아예 안 남음 | `test/log-redaction.test.ts`: 실제 앱 로그를 메모리로 받아 200·422·404·500에서 IP(v4·v6·위조·프록시)·UA·Bearer·쿠키·쿼리 토큰·링크 코드 0건, 키 화이트리스트, route 템플릿 단언 |
| I7 예시 엔드포인트 | 운영에서 끄기 | `ConditionalModule.registerWhen(SavesModule, NODE_ENV !== 'production')` — 운영 이미지에는 모듈 자체가 없다 | production.e2e(404), compose 스모크(404) |
| I6 core 번들 | 지금 방식 유지 + CI 검사, DECISIONS는 PM | `scripts/check-bundle.mjs`(`pnpm --filter server check:bundle`): dist에 `@mong/core` import/require 0건 + core `dependencies` 0개. CI `check` 잡에 추가 | 음성 시험 3종(side-effect import·from·동적 import) 모두 실패로 잡음 |
| 사소 1 | 레이트 리밋 = IP당 전역 키 | 가드 `generateKey` = `이름:추적자` → 핸들러가 달라도 같은 카운터. 경로 `@Throttle`은 같은 카운터의 더 낮은 천장 | e2e(API 3회 + /readyz 2회 = 한도 5 → 6번째 429) |
| 사소 2 | 404에 쿼리 반사 금지 | 404는 고정 문구 '찾을 수 없습니다'(직접 code를 단 404만 예외) | 단위·e2e |
| 사소 3 | 5xx 숨김·로그 넓히기 | 500대 전부 문구 숨김(직접 code를 단 예외만 그 문구), 503은 warn, 나머지 500대는 스택과 error(`exception` 키 — pino `err` 직렬화기가 스택을 지우지 않게) | 단위(502·504), 로그 시험 |
| 사소 6 | 비밀값 이름 정본 6-4와 맞춤 | `DIRECT_URL_SESSION_POOLER`(Environments), Secret Manager `DATABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`·`RECOVERY_PEPPER`·`READY_TOKEN`, `REPORT_HMAC_KEY` 삭제 | — |
| 사소 7 | 다이제스트·SHA 고정 | Dockerfile `NODE_IMAGE=node:24-slim@sha256:dc26ae92…`, compose·CI `postgres:17-alpine@sha256:526f86d9…`, 액션 6개 커밋 SHA(+태그 주석), checkout `persist-credentials: false` | — |
| 사소 8 | 파일은 root, 실행은 비루트 | runtime 단계 `COPY`에서 `--chown` 제거(root 소유), `USER node` | compose에서 확인(6-1) |
| 사소 5 | 기본 보안 헤더 | 모든 응답에 `x-content-type-options: nosniff`·`referrer-policy: no-referrer`·`x-frame-options: DENY`·`cross-origin-resource-policy: same-site`(`/m` CSP는 B3) | e2e |

- 이번에 하지 않은 리뷰 항목(팀 결정 목록 밖): 사소 9(`SAVE_MAX_CHARS` 바이트 기준), 10(`::ffff:` 16진 표기), 11(`x-request-id` 신뢰), 12(lockfile 피어 키 — mobile 테스트로 확인함). B2·B3에서.
- compose의 `api`는 운영 이미지 그대로(`NODE_ENV=production`)라 운영 필수값을 로컬 값으로 준다(`TRUSTED_PROXY_HOPS_API=1`·`_WEB=2`·`READY_TOKEN=local-ready-token-0000`, 로컬 전용).

### 6-1. 2차 검증

| 명령 | 결과 |
|---|---|
| `pnpm typecheck`(루트) | core·mobile·server 모두 Done |
| `pnpm --filter server test` | 7파일 **52개 통과**(client-ip 12·env 9·에러 필터 8·세이브 계약 6·e2e 14·운영 설정 e2e 2·로그 가림 1) |
| `pnpm --filter server check:bundle` | dist 4개 파일, `@mong/core` import 0건, core 런타임 의존성 0개(일부러 넣은 import 3종은 모두 실패로 잡음) |
| `prisma migrate status`(DIRECT_URL 없음 / 6543) | 둘 다 설정 로드 단계에서 오류로 중단 |
| `docker compose -f apps/server/compose.yaml up -d --build --wait db api` | 롤 SQL → migrate(prisma 롤) init 적용 → api healthy. 이미지 압축 94.6MB |
| compose 스모크 | `/healthz` 200, `/readyz`+토큰 200, 토큰 없이 404, `POST /api/v1/saves/validate` 404(운영 이미지), `nosniff`·`no-referrer` 헤더, 컨테이너 uid 1000 + `/app/dist` root 소유·쓰기 거부, DB 중지 시 `/readyz` 503 + warn 한 줄·`/healthz` 200 |
| `DATABASE_URL=prisma@…54329 pnpm --filter server test:db` | **6개 통과**(비슈퍼유저·소유자, RLS·정책 0, UNIQUE·CASCADE, anon 권한 거부, 비소유자 0행) |
| `prisma migrate diff --from-config-datasource … --exit-code`(prisma 롤) | No difference detected |
| `pnpm --filter mobile test` | 1개 실패 — 다른 작업자가 새로 만든 미추적 `apps/mobile/test/skia/golden-gen.test.tsx`의 파싱 오류(이번 변경과 무관, 서버 작업은 mobile·lockfile을 이번에 건드리지 않음). 나머지 89개 통과 |
| GitHub Actions | 실행 못 함(푸시 안 함) |

- compose에서 하나 고침: Postgres 초기화 SQL을 도는 임시 서버가 유닉스 소켓만 열어 `pg_isready`(소켓)가 init 도중 healthy가 되고, migrate가 재시작 틈에 붙어 실패했다 → 헬스체크를 TCP(`-h 127.0.0.1`)로 바꾸고 `start_period: 120s`(이 Mac의 Docker가 느림). CI 서비스 헬스체크도 TCP로.

## 7. B0 측정 시계 (2026-11-20, 커밋 전)

- 범위: 로드맵 B0 — 식별자 없는 집계 핑 + `config/v1.json` + `content/v1.json`(빈 목록) + `/m/{code}` 임시 정적 페이지 + AASA·assetlinks. **배포·계정 작업 없음**(B6, 오너 승인 필요). 결정은 DECISIONS 'B0 측정 시계 구현 결정'.
- 정본: architecture.md v2.1 3-2·3-5·3-6·3-7·3-9·3-10·4-1·5-2, dreams-30days v1.1 5-2(스키마 1), 처리방침 3-1, B1 리뷰의 IP·로그·레이트 리밋 규칙.

### 7-1. 만든 것

| 영역 | 내용 | 파일 |
|---|---|---|
| 계약(새 패키지) | `@mong/contract`(zod 4.6.7, 한 파일): 핑 스키마(모든 객체 strict·이벤트 화이트리스트 10 + `open`·차원 3·날짜는 일 단위·appVer/lang/platform 닫힌 형식), `pingDateOk`(서버 날짜 ±2일), `pingToCells`, config(앱 lenient / CI strict), content 매니페스트, 모티프 파일 스키마 1(zone·family 정식, scene 필수, ko 12·22·45 / en 32·45·100, 3-7 금지어, 경로 데이터만) | `packages/contract/` |
| 서버 | `POST /api/v1/ping` → 204·`no-store`. 검증 실패·날짜 밖은 조용히 204. 칸 메모리 합산 → **요청 안 flush**(10초) + 종료 때 flush(`beforeApplicationShutdown`, Prisma 끊기는 `onApplicationShutdown`으로 옮김), 실패 시 메모리에 되돌림, 칸 상한 5000. IP 접두당 20/분(같은 전역 카운터). 컨트롤러는 요청 객체를 받지 않는다 | `apps/server/src/metrics/*` |
| DB | `app.metric_daily`(PK = day·event·cohort_day·day_n·platform·app_ver·lang·nt·wg·moon, count) + RLS + Data API 롤 권한 회수. 한 문장 `unnest` UPSERT | `prisma/schema.prisma`, `migrations/20261120120000_metric_daily` |
| 앱 | `src/net/`: 핑 클라이언트(아웃박스 `mong.net.outbox` 128개 상한, 7일 지난 것·4xx 버림, 5xx·429·오프라인은 다음 기회, 같은 차원끼리 32개씩 배치, 열기 하루 한 번, 평생 한 번 이벤트, 설정 끄기 = 아웃박스 비움, 보내기 전 contract 스키마로 한 번 더 거름), `deriveEvents`(세이브 변화 → first_tap·first_night·ire7·name_set·ink_chosen, 화면 코드 수정 없음), 원격 설정 로더(캐시·실패 시 마지막 캐시/번들 기본값·minAppBuild·minBundle·rollout·TTL 1시간·포그라운드 15분), `NetBridge`(그리지 않는 컴포넌트). 주소(`EXPO_PUBLIC_API_BASE`·`EXPO_PUBLIC_STATIC_BASE`)가 비면 no-op = **기본 꺼짐**. 웹은 핑 안 보냄 | `apps/mobile/src/net/*`, `App.tsx` 한 줄 |
| 정적 | `apps/web-static/`(정본 6-1 위치): `src/`(config·content·AASA·assetlinks·`/m/index.html`·랜딩·robots) → `scripts/build.mjs`가 `public/`로. 팀 ID·지문·App Store id 주입, **비었거나 자리표시자 모양이면 실패**(firebase.json predeploy), app.json 번들 id·패키지와 대조, config strict·매니페스트·모티프 파일(존재·바이트·sha256·이름 해시·스키마 1) 검사, HTML 외부 스크립트·분석·비콘·허용 밖 주소 금지. `/m`은 주소를 읽지 않고 `no-referrer`·noindex·CSP(인라인 해시 하나, connect 금지), 스토어 링크 캠페인 값에 코드 없음 | `apps/web-static/*` |
| CI | `server-ci.yml` 경로에 contract 추가 + compose 스모크에 핑 204. 새 `static-ci.yml`(contract typecheck·test, web-static 시험, 값 없이 빌드하면 실패 확인). Dockerfile·check-bundle에 contract(번들 안, zod 버전 서버와 일치 검사) | `.github/workflows/*`, `Dockerfile`, `scripts/check-bundle.mjs` |

### 7-2. 그럴듯한 오답 판별 검사(OPERATING 8-1)

| 그럴듯한 오답 | 떨어뜨리는 검사 |
|---|---|
| 서버가 모르는 키(기기 id·씨앗·ms 시각·IP)를 '무시하고' 핑을 받아 준다 | contract 17종 거부 + 서버 e2e 9종: 칸 0개·DB 쓰기 0 |
| DB로 가는 값에 시각·씨앗·IP 모양이 섞인다 | e2e: UPSERT 값이 일 단위 날짜·열거·버전·작은 정수뿐(9자리 이상 숫자·IPv4 없음) |
| 집계 표에 사람·시각을 담을 열이 생긴다 | test:db: `metric_daily` 열 목록 고정 + timestamp·uuid·inet·json 열 없음 |
| 앱 핑에 세이브 씨앗·인장 씨앗·설치 ms가 실린다 | mobile: 서로 다른 세이브 200개에서 보낸 핑 JSON에 그 값 0회, 6자리 이상 숫자 0, 키 7개 고정 |
| 로그에 IP·본문이 남는다 | log-redaction에 식별 값을 실은 핑 추가 → IP·코드·쿼리 0건, route `/api/v1/ping` |
| 팀 ID·지문이 빈 채로 AASA가 배포된다 | web-static: 빈 값·`XXXXXXXXXX`·0000… 지문·중복 지문 → 빌드 실패, `public/` 남기지 않음 |
| `/m` 페이지가 코드를 분석·외부로 흘린다 | web-static: 외부 스크립트·비콘·허용 밖 주소 주입 시 실패, 페이지가 `location`을 읽지 않음, CSP 해시 일치 |
| 모티프 매니페스트가 없는 파일·틀린 해시·금지어 문구를 가리킨다 | web-static·contract 고장 사본 시험 |

### 7-3. 검증(실행 명령과 결과)

| 명령 | 결과 |
|---|---|
| `pnpm typecheck`(루트) | contract·core·server·mobile 모두 Done |
| `pnpm --filter @mong/contract test` | 36개 통과(식별 값 거부 17종 포함) |
| `pnpm --filter server test` | 8파일 **58개 통과**(핑 e2e 6 추가, 로그 가림에 핑 포함) |
| `pnpm --filter server build && check:bundle` | dist 4개, `@mong/core`·`@mong/contract` import 0건, contract의 zod 버전 서버와 일치 |
| compose db + `prisma migrate deploy`(prisma 롤) + `test:db` | 마이그레이션 2개 적용, **9개 통과**(metric_daily 열 고정·실제 UPSERT 합산·anon 거부·RLS) |
| `prisma migrate diff … --exit-code` | No difference detected |
| `docker build -f apps/server/Dockerfile` | 성공(contract 포함) |
| compose 스모크 | `/healthz` 200, 엉터리 핑 204, 정상 핑 2회 204(10초 안 → 메모리) → `docker compose stop`(SIGTERM) 뒤 `metric_daily`에 open·first_tap 각 count 2(종료 flush 확인), 엉터리 핑은 행 없음, api 로그에 `/api/v1/ping` 3줄·IP·deviceId 0건 |
| `pnpm --filter mobile exec vitest run` | 14파일 **116개 통과**(net 17개 추가, skia 포함 전부 통과) |
| `packages/core vitest run --testTimeout=200000` | 17파일 229개 통과 |
| `pnpm --filter web-static test` | 11개 통과 |
| `node apps/web-static/scripts/build.mjs`(값 없음 / 가짜 값) | exit 1(세 이름 나열) / 7개 파일 생성 |
| Playwright 390px `/m` ko·en | 언어 전환 확인, 콘솔 오류 0 — `docs/design/server-v1/b0/m-page-{ko,en}.png` |
| GitHub Actions | 실행 못 함(푸시 안 함) |

### 7-4. 남은 일·주의

- **오너 값 대기**: `APPLE_TEAM_ID`(11-26)·`ANDROID_CERT_SHA256`(EAS 업로드 키 + 11-30 Play 앱 서명 키 — 정본은 둘 다)·`APP_STORE_ID`. 지금 빌드는 하나만 있어도 통과한다(Play 서명 키는 콘솔 생성 뒤 추가).
- **앱 네이티브(빌드 2 묶음, 이번에 안 함)**: `ios.associatedDomains: applinks:mongmang.ink`, Android `intentFilters autoVerify` — app.json 변경은 Apple 캐퍼빌리티가 필요해 지금 EAS 리허설을 깨뜨릴 수 있어 앱 레인과 함께. 딥링크 수신 화면(이름표 시트)도 앱 레인.
- **연결 대기**: ① 설정 화면 '이용 통계 보내기' 토글(`pingClient.setEnabled`) — 처리방침 3-1이 약속하므로 빌드 2 전 필수(공방 노트 화면은 다른 작업자 영역이라 손대지 않음) ② `features.ts`의 `isOn`에 `remoteConfig.remoteFlag`를 가운데 층으로 끼우기(A7 작업 중인 파일이라 미룸, 원격 키 9개와 FEATURE_DEFAULTS 키 이름이 달라 대응표가 필요 — PM) ③ `isMoonWindow`(core 달 위상, 로드맵 core 함수) — 그 전까지 `moon`은 늘 '0'으로 간다 ④ `widgetCount`(위젯 모듈, 빌드 2) — 그 전 기기는 7일째에 '-'로 고정 ⑤ share_*·cloud_on·restore_ok는 해당 기능 코드가 `pingClient.track`을 불러야 한다.
- appVer의 빌드 번호는 `expo-application`(expo-notifications의 하위 의존으로 이미 바이너리에 있음)을 선택적으로 읽는다. 빌드 2 묶음에서 앱 package.json에 직접 선언 권고.
- OG 이미지(`src/og.jpg`)는 아트 대기 — 없으면 og:image 없이 빌드(경고). `/m` 문구('누군가 자기 몽망이를 보여 주고 싶었나 봐요')는 임시, 작가 검수 필요.
- App Store 캠페인 `ct=m_link`는 `pt`(제공자 토큰) 없이는 집계되지 않을 수 있다 [확인 필요].
- 90일 뒤 월 단위 말기(`pg_cron`)·판정 SQL(`docs/ops/metrics/*.sql`)은 B6 이후.

## 8. B0 독립 리뷰 반영(2026-11-20, 커밋 전)

리뷰 `docs/team/reviews/2026-11-20-b0-review.md`('고친 뒤 커밋 가능', 중요 7·사소 11)와 v2.2-applied 4절(처리방침↔구현 10건)을 팀 결정대로 반영했다. 7절과 다르면 이 절이 맞다.

| 항목 | 반영 | 검사(테스트로 고정) |
|---|---|---|
| I1 처리방침 3-1 | ko·en 3-1 항목을 실제 페이로드로: 앱을 연 날(하루 한 번)·사건 10가지와 그 날·되풀이 사건 횟수·출시 판·'모름' 값. IP는 ① 레이트 리밋 메모리 약 1분 ② 앱 로그 없음 ③ 클라우드 접속 기록 7일로 나눔. 2절 기기 저장 표에 '보내기 전 통계(최대 7일치)·보낸 사건 표시'와 '화면 실험 군'. 6절 행 정정, 8절 Google 행에 '요청 시각'(m11) | contract 테스트 설명에 'open = 처리방침 3-1 앱을 연 날' 짝 표시 |
| I2 재식별 | appVer = 출시 판 `1.0`. 원표는 서비스 롤만, 뷰 `metric_daily_k5`(count ≥ 5)와 조회 롤 `metrics_reader`. 법률 질문 B-17. 운영 규칙(테스터 기간 원표 열람 금지·내보내기 금지) `docs/ops/metrics/README.md` | contract `1.0.0(14)` 거부, test:db 조회 롤은 원표 permission denied·뷰에 4는 안 보이고 5만 |
| I3 첫 밤 누락 | 평생 한 번 사건을 세이브 상태에서 뽑음(`onceEventsFromState`), '보냄' 영구 표시, 날짜는 세이브의 사건 시각 | mobile: 앱을 닫은 채 첫 밤 → 다음 날 boot 정산 → first_tap·first_night가 dayN 0으로 한 번, 새 클라이언트에서도 재전송 없음 |
| I4 중복 | 서버 요청 안 flush 최대 1.5초(넘으면 뒤에서 계속, 204), 앱 제한 10초·응답 받음/시간 초과 = 보냄, 연결 실패만 재전송 | server e2e: 느린 DB 6초에도 응답 < 2초·칸 합 정확, mobile: 4xx·5xx·429·시간 초과 재전송 0, 연결 실패만 재전송 |
| I5 칸 폭주 | 서버 출시 판 목록 `METRIC_APP_VERSIONS`, 인스턴스당 하루 새 칸 상한 `METRIC_NEW_CELLS_PER_DAY`(로그는 개수만), `docs/ops/metrics/monotonic-check.sql`, 한계(인스턴스 수만큼 느슨) 문서화 | server e2e: 모르는 판 버림·상한 초과 버림·경고 `{dropped: n}`·다음 날 초기화, test:db: 단조 검사가 n일째 열기·이름 짓기 과다 코호트를 잡음 |
| I6 robots | `Disallow: /m/` 삭제, `/m/**` X-Robots-Tag + meta noindex | web-static: robots가 /m 막으면·헤더·meta 빠지면 실패 |
| I7 nt 위치 | `game/abGroup.ts`가 `install()`·`boot()`에서 정함(통계와 무관), 핑은 읽기만 | mobile: 군 고정·핑 클라이언트는 군을 만들지 않음 |
| m1 게이트 | 핑 켜짐 = 주소 AND 동의(`gate.ts`, 토글 연결 전 늘 false), https만(개발 예외) | mobile net-gate: 주소가 있어도 fetch 0회 |
| m2 종료 유실 | flush가 진행 중 쓰기를 기다린 뒤 그사이 쌓인 칸도 씀, 종료 때 최대 3번 | server e2e |
| m3 변이 생존 4건 | appVer 앞뒤 고정 사례, 되돌림 합산(진행 중 실패 + 같은 칸 새로 도착 → 2), `check()` 직접 호출로 referrer·CSP·`ping=` 시험 | 각 변이가 이제 실패함 |
| m4·m5 | 외부 주소 검사를 모든 속성·작은따옴표·`//`로, CSP meta 필수, 자리표시자에 연속값·두 글자 반복·예시 낱말 | web-static |
| m6 `.well-known` | `ignore`를 `["**/.DS_Store"]`로(점 파일 패턴 없음), build가 점 파일을 빼는 패턴을 거부. 배포 뒤 curl 확인은 로드맵 B6 | web-static |
| m7 CI | 값 없이 빌드 → 종료 코드 1 + 세 문구 확인 | 로컬 재현 code=1, 문구 3개 |
| m8 번들 | contract를 `zod/mini`로. esbuild 측정: 트리 셰이킹 없이(Metro 근사) contract 전체 **min 101KB / gzip 28.7KB**(전체 zod는 gzip 92.5KB), 셰이킹 시 gzip 11.5KB | — |
| m9 원격 설정 | 쓰는 곳이 없어 `refresh` 호출을 뺐다. 크래시 루프 탈출·content 해시 검증은 소비 단계 관문 | — |
| m10 moon | 연결 전에는 핑을 켜지 않는다(게이트) + 운영 문서에 '연결 전 moon 미사용' | — |
| 90일 말기 | **구현**: `metric_monthly` + `app.rollup_metric_daily()`(삭제·월 합계 한 문장), 예약은 B6 | test:db: cutoff 전 행만 옮기고 합계 정확 |
| B6 체크 | 로그 7일 버킷·`_Default` 끄기·`/m` 제외, pg_cron 말기, 조회 롤·GRANT, `.well-known` curl | `docs/team/roadmap.md` B6 하위 항목 |
