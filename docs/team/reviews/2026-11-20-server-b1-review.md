# 독립 리뷰 — 서버 골격 B1 (백엔드·보안·인프라)

- 대상: 미커밋 변경 중 B1만 — `apps/server/**`, `.github/workflows/server-ci.yml`, `pnpm-workspace.yaml`(allowBuilds), `pnpm-lock.yaml`(서버 의존성), `docs/design/server-v1/B0-B1-report.md`. core·mobile·DECISIONS 변경은 범위 밖.
- 기준: `architecture.md` v2.1(2-4·2-5·3-8·5-2·6-1·6-2·6-4), `reviews/2026-11-20-server-v2-review.md`(C1·S5·S12), DECISIONS D-21, OPERATING 7절(신뢰 피라미드: 같은 지적은 검사로 승격).
- 리뷰어: 독립(작성 참여 안 함). 코드는 고치지 않았고 이 파일만 새로 썼다.
- 판정: **고친 뒤 커밋 가능(치명 0, 중요 7, 사소 12).** 골격 자체는 단단하다. 중요 항목은 대부분 B6 배포 전에 "설정 실수가 조용히 통과하는" 구멍이라, 문서보다 **검사(zod·테스트·CI)로 막는** 쪽을 권한다.

## 직접 실행한 것

| 명령 | 결과 |
|---|---|
| `pnpm --filter server test` | 5파일 **37개 통과**(6.3초) |
| `pnpm typecheck`(루트) | core·mobile·server **모두 Done**(exit 0) |
| `node dist/main.js`(dist가 src보다 새것임을 확인, `NODE_ENV=production LOG_LEVEL=info TRUSTED_PROXY_HOPS=1`, DB 없음)에 XFF·UA·`Authorization: Bearer …`·Cookie·쿼리 토큰을 실어 422·404·503·415·413·OPTIONS 요청 | 로그에 **IP·XFF·UA·인증 헤더·쿠키·쿼리 문자열이 0건**(grep 0). 요청 로그 필드는 `req{id,method,route}`·`res{statusCode}`·`responseTime`뿐. 413(768KB 초과)·415도 같은 오류 모양으로 나옴 |
| Docker·`test:db`·CI | 돌리지 않음(지시대로 작성자 결과를 따름) |

## 잘된 점(유지)

- XFF는 오른쪽에서 고르고, 체인이 짧거나 IP가 아니면 소켓 주소로 떨어진다. Fastify `trustProxy`를 끄고 판단 지점을 하나로 둔 것이 맞다. IPv6 /64 접기 + 왼쪽 위조 무시 e2e까지 있다.
- 로그 화이트리스트 직렬화기 + redact 이중 장치가 실제로 작동한다(위 실행). 5xx는 메시지를 숨기고 스택은 로그에만 둔다.
- 환경 변수 zod 검증, 오류에 값을 싣지 않는 테스트, `.env` 미사용, `.dockerignore`에서 `.env` 제외.
- Docker 비루트(uid 1000), 시작 때 마이그레이션 없음, compose에서 migrate 분리, CI `permissions: contents: read`, 이미지 push 없음, `migrate diff --exit-code`로 스키마·마이그레이션 어긋남을 검사로 막음.
- 세이브 계약 테스트가 core 고정물을 그대로 읽는다(앱과 같은 판정).

---

## 중요

### I1. 믿을 XFF 위치가 전역 하나이고, 운영에서 0(기본값)이어도 뜬다 — `src/common/throttler.guard.ts:7`, `src/app.factory.ts:24`, `src/config/env.ts:28`
- 정본 3-8은 경로가 둘(앱 API = GFE 직접, `/m/**` = Firebase 경유)이라 **`clientIp(req, routeGroup)`로 경로별 N**을 둔다고 적었다. 지금은 `proxyTrust.hops` 전역 값 하나다. B3에서 `/m/**`가 붙으면 어느 값을 넣어도 한쪽 경로가 틀린다: hops=2면 앱 API(값 1개)는 전부 소켓 주소로 떨어져 **모든 사용자가 한 키**(서비스 전체 429), hops=1이면 `/m/**`의 키가 Firebase 엣지 주소가 된다.
- 기본값 0이 운영에서도 허용된다. Cloud Run에서 0이면 소켓 주소(구글 프런트엔드 내부 주소)가 키라 역시 **전원이 한 버킷**이다. 환경 변수 한 줄 빠뜨리면 조용히 자기 서비스를 막는다.
- 권고: ① `NODE_ENV=production`이면 `TRUSTED_PROXY_HOPS`를 필수·≥1로 zod `superRefine`(env.test에 한 줄) ② B3 전에 `clientIp(req, group)` 시그니처로 바꾸고 그룹별 값(`TRUSTED_PROXY_HOPS_API`, `…_WEB`)을 둔다 ③ 모듈 전역 가변 객체 대신 가드 생성자에 `ConfigService` 주입(테스트 간 누수도 없앰) ④ "hops"의 뜻(= 오른쪽에서 몇 번째)을 B6 실측 때 GFE가 자기 주소를 덧붙이는지와 함께 고정물로 박는다.

### I2. `/readyz`가 인증·레이트 리밋 없이 공개되고 요청마다 DB를 친다 — `src/health/health.controller.ts:20,35-56`
- `@SkipThrottle()`이 컨트롤러 전체에 걸려 있어 `/readyz` 홍수가 곧 DB(풀러 연결 한도 15) 왕복 홍수다. 정본상 Cloud Run 프로브는 `/healthz`만 쓰므로 `/readyz`를 공개로 열어 둘 이유가 약하다.
- 또 `Promise.race`가 2초에 503을 내도 `ping()`은 계속 돌고, 풀의 `connectionTimeoutMillis`는 5000으로 하드코딩(`src/prisma/prisma.service.ts:17`)이라 DB가 느릴 때 프로브마다 풀 자리를 최대 5초 잡는다(풀 5).
- 권고: `/readyz`만 스로틀을 걸거나(예: IP당 10/분) 결과를 1~2초 캐시, `connectionTimeoutMillis ≤ READY_TIMEOUT_MS`로 맞추고 `statement_timeout`(예: 5초)을 연결 문자열/풀 옵션에 둔다.

### I3. 마이그레이션이 `DIRECT_URL` 없을 때 조용히 `DATABASE_URL`(트랜잭션 풀러)로 간다 — `prisma.config.ts:10`
- 정본 2-5·6-4는 런타임 6543 / 마이그레이션 5432(세션 풀러)를 나눴다. 배포 워크플로에서 비밀값 이름을 하나 틀리면 `migrate deploy`가 트랜잭션 풀러로 붙는다(어드바이저리 락·세션 단위 DDL이 깨질 수 있음). 마지막 `placeholder` URL 폴백도 실패를 늦출 뿐이다.
- 권고: `CI`나 `NODE_ENV=production`에서는 `DIRECT_URL`이 없으면 throw. 6543 포트를 가리키면 거부하는 한 줄 검사도 싸다.

### I4. RLS 시험이 "켜짐" 플래그만 보고, 실제 롤 관계(소유자 우회·anon 차단)는 확인하지 않는다 — `prisma/migrations/20261120000000_init/migration.sql:59-63`, `test/db.db.test.ts:38-47`
- `ENABLE`(FORCE 아님) + 정책 0개는 **표 소유자만** 통과한다. 정본 2-4는 "Nest는 `prisma` 롤(소유자)"이다. 그런데 Supabase에서 마이그레이션을 `postgres`로 돌리고 런타임을 `prisma` 롤로 붙이면 소유자가 달라 **런타임 쿼리가 전부 0행/거부**된다. 반대 실수(런타임이 `postgres`·BYPASSRLS)는 최소 권한이 깨진다. 로컬·CI는 둘 다 슈퍼유저 `mong`이라 어느 쪽도 잡지 못한다.
- 권고: ① 마이그레이션과 런타임이 **같은 `prisma` 롤**임을 B6 체크리스트에 명시(또는 마이그레이션에 `ALTER TABLE … OWNER TO prisma`) ② db 시험에 `create role anon_test nologin; set role anon_test;`로 `select`가 0행/권한 오류인지, 런타임 롤이 읽고 쓰는지를 넣는다 ③ 방어 겹: `REVOKE ALL ON SCHEMA app FROM anon, authenticated`를 `DO $$ … IF EXISTS (select from pg_roles where rolname='anon') …$$`로 감싸 일반 Postgres에서도 돌게.

### I5. 로그에 IP·헤더가 안 남는다는 핵심 약속이 테스트로 고정되지 않았다 — `src/common/logging.ts`, `test/` 전체
- 이번 리뷰에서 실행해 보니 지금은 깨끗하다. 그러나 근거가 보고서의 "실행 로그로 확인" 한 줄뿐이고, 의존성(nestjs-pino·pino-http) 메이저가 바뀌거나 누가 `customProps`를 넣으면 조용히 깨진다. 서버 v2 리뷰 S5·정본 5-2가 처리방침 문구('IP는 레이트 리밋 메모리와 7일 요청 로그에만', '/m 로그에 코드·IP 없음')에 직결된다. OPERATING 7-1 "검사로 승격" 대상.
- 권고: e2e에서 pino `destination`을 메모리 스트림으로 바꿔 XFF·UA·Authorization·Cookie·쿼리 토큰을 실은 요청(정상·4xx·500 각 1개)을 보낸 뒤, 출력에 그 값들이 **없고** 키가 화이트리스트뿐인지 단언한다(500 경로는 시험용 컨트롤러 하나로).

### I6. core를 원본째 번들하는 결정이 정본(6-1·6-2)과 다르지만 DECISIONS·architecture에 반영되지 않았다 — `tsup.config.ts:16`, `B0-B1-report.md` 2절 1
- 평가: **방식은 옳다고 본다(유지 권고).** 장점 — core `main/exports`를 안 건드려 Metro·앱 Vitest 해석 불변, core 빌드 단계·`pnpm deploy`([확인 필요] 항목) 제거, 웹 뷰어(esbuild)와 같은 소비 방식, `SAVE_SCHEMA`가 이미지에 고정되어 ota-guard 의미가 분명. 단점 — ① core는 Node에서 단독 import 불가(`main: src/index.ts`)라 서버의 다른 진입점(스크립트·`prisma.config.ts`·향후 cron CLI)이 core를 직접 import하면 런타임에서만 깨진다 ② core에 런타임 의존성이 생기면 서버 `package.json`에 없으므로 번들로 끌려 들어가거나(tsup 기본) 누락된다 — 어느 쪽인지 검사가 없다 ③ 정본과 코드가 달라 다음 작업자가 6-1대로 core 빌드를 추가할 수 있다.
- 권고: DECISIONS에 "서버·웹 뷰어는 core를 TS 원본째 번들, core 빌드 없음"으로 정본 개정(PM), 6-1·6-2 문구 수정. CI에 `! grep -q '@mong/core' apps/server/dist/*.js` 한 줄(지금 0건 확인함)과 core `package.json`에 `dependencies`가 생기면 실패하는 검사.

### I7. 비인증 CPU 엔드포인트 `POST /api/v1/saves/validate`가 그대로 배포 경로에 오른다 — `src/saves/saves.controller.ts:27-33`
- B1 예시인데 B6 `deploy-staging.yml`이 `main` 푸시로 바로 공개한다. 512KB JSON 파싱 + `parseState`를 누구나 IP(/64)당 분당 30회 부를 수 있고, IPv6 /48 하나면 /64가 65,536개라 한도가 사실상 없다(정본이 받아들인 한계지만 이 경로는 받아들일 이유가 없다).
- 권고: B6 전에 지우거나 `NODE_ENV!=='production'`일 때만 모듈을 붙인다. 계약 확인은 단위 테스트(`save-contract.test.ts`)가 이미 한다.

---

## 사소

1. **레이트 리밋은 "전역 IP당"이 아니라 "IP당·핸들러당"이다** — `@nestjs/throttler` 6.8 `generateKey`가 `클래스-핸들러-이름-추적자`로 키를 만든다(`node_modules/@nestjs/throttler/dist/throttler.guard.js`). 보고서 1절 "전역 IP당 120/분"은 틀린 표현. 의도가 맞다면 문구만, 전역 상한이 필요하면 `generateKey` 재정의.
2. **404 응답이 쿼리 문자열까지 되돌려 준다** — 실행 결과 `"Cannot GET /nope/ABCD1234?sig=QSECRET2"`. 로그는 깨끗하지만 응답 본문이 서명·토큰을 반사해 앱 크래시 리포트 등에 옮겨 갈 수 있다. `src/common/http-exception.filter.ts:49` — 404는 고정 문구로.
3. **5xx 처리가 `=== 500`에만 걸린다** — `http-exception.filter.ts:49,72`. 501·502·504 `HttpException`은 메시지가 그대로 나가고 로그도 안 남는다. `status >= 500 && status !== 503` 정도로. 또 `/readyz`가 요청 로그 제외 + 503 미기록이라 DB 장애가 로그 어디에도 안 남는다(`warn` 한 줄 권고).
4. **로그 `route`가 실제 경로다(템플릿 아님)** — `logging.ts:28`. 정본 5-2는 `/m/:code` 템플릿을 요구한다. 지금은 IP가 없어 연결은 안 되지만 B3에서 코드가 7일 로그에 남는다. Fastify `request.routeOptions.url`을 쓰도록 `customProps`/훅에서 바꾸고 404는 `route: null`.
5. **CORS·보안 헤더 없음** — 지금은 기본 거부라 안전하다. 다만 정본 2-1의 웹 앱(Expo web)이 API를 직접 부르면 B2에서 허용 출처 목록이 필요하고, B3 `/m` HTML에는 CSP·`X-Content-Type-Options: nosniff`·`Referrer-Policy`가 필요하다. 일단 전역 `nosniff`만 넣어도 싸다.
6. **CI 주석의 비밀값 이름이 정본과 다르다** — `server-ci.yml:5-6`: `DIRECT_URL`(정본 6-4는 `DIRECT_URL_SESSION_POOLER`, 리뷰 S12), `REPORT_HMAC_KEY`(v2.1에서 없앰).
7. **공급망 고정** — 베이스 이미지 `node:24-slim`·`postgres:17-alpine` 다이제스트 미고정(`Dockerfile:7,39`), 액션 메이저 태그 고정(SHA 아님), `actions/checkout`의 `persist-credentials` 기본 true. 소프트런칭 전 다이제스트·SHA 고정 + `persist-credentials: false`.
8. **런타임 파일 소유자가 `node`** — `Dockerfile:43-45`의 `--chown=node:node`로 앱 프로세스가 자기 코드·node_modules를 고칠 수 있다. 소유자는 root(기본)로 두고 읽기만 허용하는 편이 낫다.
9. **`SAVE_MAX_CHARS`가 바이트가 아니라 UTF-16 글자 수** — `inspect-save.ts:7,16`, `saves.controller.ts:12`. 정본 3-1은 512KB. 본문 상한 768KB가 실제 상한이 되어 큰 문제는 없지만, B2 저장 열 기준과 맞추려면 `Buffer.byteLength`.
10. **IPv4-매핑 16진 표기**(`::ffff:102:304`)는 `0:0:0:0::/64` 한 키로 접힌다 — `client-ip.ts:36-39`. GFE가 붙인 값이 이 형태일 일은 드물지만 한 줄로 막을 수 있다(`::ffff:` 접두면 마지막 32비트를 IPv4로).
11. **`genReqId`가 클라이언트 `x-request-id`를 그대로 믿는다** — `logging.ts:36-39`. 형식 검사가 있어 주입은 없지만, 클라이언트가 고정 id를 보내면 요청끼리 묶이는 식별자가 로그에 생긴다(5-2 '식별자 없음'). Cloud Run의 `X-Cloud-Trace-Context`만 잇거나 항상 새로 만들기를 권고.
12. **lockfile에서 mobile 항목의 피어 키가 바뀌었다** — vitest/vite가 `esbuild`·`jiti` 피어를 얻고 `@shopify/react-native-skia` 해시 키가 바뀜(버전은 같음). mobile typecheck는 통과. 커밋 전에 mobile 테스트 한 번이면 충분.

## 테스트가 의미 있나(④)

- 의미 있음: `client-ip`(12)·e2e 레이트 리밋(같은 /64 한 키·다른 /64 분리·왼쪽 위조 무시)·헬스체크 SkipThrottle(한도 5로 8회)·세이브 계약(고정물)·env 비밀값 비노출.
- 빈 곳: I5 로그 누출 단언 없음, I4 RLS는 플래그만, I1 운영 기본값 검사 없음, 413·415 e2e 없음(이번에 손으로 확인 — 작동함), 레이트 리밋이 핸들러별이라는 사실을 드러내는 시험 없음. `process.env`·`proxyTrust` 전역을 시험이 바꾸므로 파일 간 순서 의존 위험(지금은 파일별 워커라 무해).

## 과설계(⑥)

- 크지 않다. 수작업 IPv6 확장 파서는 테스트가 받쳐 주므로 둬도 된다. Swagger UI·`openapi.js` 진입점·`@fastify/static`은 정본(OpenAPI diff)이 요구하니 적정. 덜어낼 것은 I7 예시 엔드포인트 하나와, 정본상 쓰는 곳이 없는 공개 `/readyz`(I2: 막거나 내부용으로).

## 커밋 전 최소 권고 순서

1. I1-①(운영 hops 필수 zod) · I3(DIRECT_URL 필수) — 각 몇 줄 + env.test.
2. I5 로그 누출 e2e.
3. I6 DECISIONS 정본 개정 요청(PM) + dist에 `@mong/core` 없음 CI 검사.
4. 사소 2·3·6.
5. I2·I4·I7과 I1-②는 B2~B6 체크리스트로 넘겨도 된다(배포 전 필수).
