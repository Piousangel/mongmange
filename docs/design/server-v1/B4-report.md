# B4 보고 — 원격 플래그·모티프 팩·사전 팩(lexVer)·집계 핑의 서버 쪽

- 작성: DV-3(서버), 2026-11-25. 상태: **구현 완료, 커밋 대기**(커밋·푸시 하지 않음).
- 근거: 로드맵 B4(D-26 '원격 사전 팩을 같은 매니페스트로'), DECISIONS B0 측정 시계·PM 11-24 V22 ③(통계 opt-in·14세 확인)·D-26, architecture.md 3-6·3-7·3-10·3-11, ota-self-host.md 1절(키 원칙), privacy-policy.ko.md K1~K32, pia-quebec.md.
- 설계 정본은 architecture.md **3-6-1**(동의를 서버가 구별하지 못함)·**3-7-2**(서명·크래시 루프 탈출·캐시 머리글)·**3-10 B4 상자**(사전 팩). 이 문서는 범위·증거·남은 일·문구 대조 목록이다.

## 1. 범위 판단

`config/v1.json`·`content/v1.json`은 처리방침 3-3대로 **Firebase Hosting 정적 파일**이고 원본·`firebase.json`·빌드 검사는 `apps/web-static`(이 작업 범위 밖)에 있다. Nest로 옮기지 않았다 — 옮기면 처리방침 3-3('운영자는 이 요청을 기록하지 않습니다')·PIA B행이 바뀌고 비용·장애 면이 늘어난다. 그래서 B4의 서버 몫은:

| # | 한 것 | 파일 |
|---|---|---|
| 1 | 계약: 순수 JS `sha256`·`sha256Hex`·`utf8Bytes`·`canonicalJson`, RS256 `verifyRemoteDoc`·`remoteSigningInput`·`remoteSigSchema`·`remotePublicKeySchema`, 되감기 막기 `acceptRemoteVersion` | `packages/contract/src/index.ts` |
| 2 | 계약: config `escape`(크래시 루프 탈출 값)·`sig`, 매니페스트 `lex`(사전 팩)·`escape.lexVer`·`sig`, `lexPackHeaderSchema`·`lexPackMatchesEntry`·`pickLexPack` — 모두 기본값이 있어 **B0 배포본·web-static 빌드가 그대로 통과** | 같음 |
| 3 | 오프라인 서명 CLI `remote-cli keygen|sign|verify`(서버 런타임은 부르지 않음, 개인키 저장소 안 거부, strict 스키마 통과한 문서만 서명, 만든 서명을 계약 검사기로 되검사) | `apps/server/src/remote/remote-sign.ts`·`remote-cli.ts`, `tsup.config.ts` 엔트리 |
| 4 | 핑: 거절 까닭별 **개수만** 로그(`schema`·`version`·`date`·`off`), 수집 끄기 `METRICS_INGEST=off` | `apps/server/src/metrics/*`, `src/config/env.ts` |
| 5 | 문서 | architecture.md 0-3 B4 행·3-6-1·3-7-2·3-10, 이 문서 |

화이트리스트 이벤트 10개 + `open`, 차원 3개(`nt`·`wg`·`moon`)는 **그대로**다. `life_done`·`drop_new`(PM 11-24 승인)는 K3대로 처리방침 3-1(ko·en)·store-listing 7-0·contract 개수 시험을 **같은 커밋에서** 고칠 때 넣는다 — 이번에 넣지 않았다. 마이그레이션 없음(`prisma migrate diff` 차이 없음).

## 2. 증거

| 검사 | 결과 |
|---|---|
| `packages/contract` vitest | 3파일 97 통과(새 `test/remote.test.ts` 37 — 독립 생성 고정 서명 `test/remote-fixture.ts`) |
| `pnpm --filter server test` | 21파일 239 통과(새 `remote-sign.test.ts` 11, `ping-b4.e2e.test.ts` 3, `ping-off.e2e.test.ts` 1) |
| `pnpm --filter server test:db`(compose db 54329) | 8파일 163 통과 |
| `prisma migrate diff --from-config-datasource --to-schema` | No difference detected |
| `pnpm verify --only typecheck,lint,directives,server-bundle` | 4단계 통과 |
| 영향 확인 | web-static 57 통과, mobile net-config·net-ping·dream-text·moon-contract 38 통과 |
| 실제 CLI(dist) | 지금 배포본 `config/v1.json`·`content/v1.json` 사본에 keygen → sign → verify 성공, 종류 바꿔 verify는 종료 1 |
| 변이 7개 | ① 서명 원문에서 종류 빼기 ② 정규 JSON 정렬 빼기 ③ `pickLexPack`이 `minAppBuild` 무시 ④ 탈출 고정 판 존재 검사 빼기 ⑤ SHA-256 길이 비트 틀리기 ⑥ schema 거절을 세지 않기 ⑦ `METRICS_INGEST` 무시 — **모두 잡힘**, 되돌린 뒤 `cmp` 원본 일치 |

서버 실행 포트는 쓰지 않았다(시험은 supertest 메모리 서버).

## 3. 남은 일(다른 담당)

**web-static(정적 배포 담당)**
1. `firebase.json`: `/content/v1.json` `max-age=3600` → `public, max-age=300`. `/content/lex/**` → `public, max-age=31536000, immutable` 헤더 추가. `/config/v1.json` 300은 그대로(architecture 3-7-2 표).
2. `scripts/build.mjs`: 사전 팩 파일 검사(존재·바이트·sha256·이름 해시 8자·`lexPackHeaderSchema`·`lexPackMatchesEntry`), `sig`가 있으면 `verifyRemoteDoc`로 검사(공개키 파일 경로는 저장소 안 `apps/mobile` 공개키 목록과 같은 값).
3. **출시 모드 빌드 차단(B4 리뷰 M3·M5, PM 결정 — 키가 든 첫 앱 빌드 제출 전 필수)**: 출시 모드(`MONG_RELEASE=1` 같은 스위치)에서 `config/v1.json`·`content/v1.json`이 ① 서명이 없거나 `verifyRemoteDocStrict`가 `ok`가 아니면 ② `expiresAt`이 없거나 **만료까지 `REMOTE_EXPIRY_WARN_DAYS`(7일) 안**이면 빌드(predeploy)가 실패한다. 서명 없는 배포가 나가면 키가 든 빌드는 끄는 손잡이를 받지 못하고, 만료가 가까운 배포는 며칠 뒤 모든 기기에서 서버 기능을 끈다.
4. **사전 팩 불변**(리뷰 L5): 빌드가 직전 배포 매니페스트(또는 git의 지난 판)와 `lexImmutableViolations(lexHashIndex(지난), 새)`로 대조해 비어 있지 않으면 실패.
5. `src/config/v1.json`에 `escape`를 명시(범위는 이제 afterCrashes 1~2·withinSec 10~60), 배포 전마다 `remote-cli sign --prev <지난 배포본>`(판 증가·`expiresAt` 14일 자동).

**앱(C11)**
6. 공개키 목록과 `REMOTE_BUNDLE_FLOOR`(빌드 때 배포본 판)를 번들에 넣고, 받은 원문(`JSON.parse` 결과 그대로)을 **`verifyRemoteDocStrict`만으로** 검사 → `ok`만 캐시(roadmap C11 완료 조건). 만료되면 번들 기본값.
7. 크래시 루프 탈출: 문턱 = `escapeThresholds(원격 escape)`(번들보다 둔해지지 않음) → 탈출 중 값 = `escapeFlags(번들, 마지막 원격 실효 값, off)`(꺼짐 우선) + 원격 팩은 `pickLexPack(…, {escaping:true})`만, 원격 모티프 새로 넣지 않음. 더 큰 `v`에서 풀림.
8. 팩 파일은 `sha256Hex`로 매니페스트 값과 대조(다르면 `cache: 'reload'`로 한 번 다시 받기 — 기기 HTTP 캐시에 깨진 immutable 파일이 남지 않게), 사전 팩은 머리를 `lexPackMatchesEntry`로, 본 적 있는 `(언어, 판) → sha256`을 기억해 `lexImmutableViolations`가 있으면 그 매니페스트를 쓰지 않음.
9. 핑 요청의 User-Agent를 고정값으로 덮을지 결정(리뷰 L1 — iOS 기본 UA에 빌드 번호가 실려 플랫폼 로그 7일에 남는다. OTA가 `EAS-Client-ID`를 덮은 것과 같은 방식).

**오너·운영(B6)**
10. 원격 문서 서명 키 생성(OTA 키와 따로, `remote-cli keygen --out <저장소 밖>`), 보관 = 비밀번호 관리자 + 오프라인 사본 1. **주 1회 재서명 루틴**(만료 14일, 7일 안이면 출시 빌드 실패).
11. `docs/ops/metrics/`에 '동의 버그 판 걷어 내기' 런북(3-6-1: `METRICS_INGEST=off` 또는 판 빼기 → `DELETE … WHERE app_ver = $1`, **같은 판의 정상 동의자 칸도 지워짐**을 적기)과 경고 로그 `집계 핑 거절` 알림 기준.
12. Cloud Run 플랫폼 요청 로그 보존 기간 최소화 검토(지금 7일 — `/api/v1/ping`은 IP·UA·시각이 남는다), 원표 `metric_daily`에 닿는 롤 목록(service role·Studio `postgres`) 확인, '플랫폼 로그와 원표를 함께 보지 않는다' 규칙(리뷰 L1·L2).

## 4. 처리방침·PIA 문구 대조 — 고칠 곳(docs/release는 직접 고치지 않음, QA-3·PM 몫)

| # | 문서·절 | 지금 문구 | 구현 | 제안 |
|---|---|---|---|---|
| P1 | 처리방침 ko·en **3-3** | '기능 켜고 끄기 파일과 새 꿈 그림 파일을 … 내려받습니다' | 같은 경로로 **말 사전 추가 파일**(`/content/lex/*`)도 받는다(원격 사전 팩을 켤 때) | '기능 켜고 끄기 파일, 새 꿈 그림 파일, 낱말 사전 추가 파일'로. 1절 요약 1번의 '설정·콘텐츠 파일'은 그대로 참 |
| P2 | PIA **3-1 표 B행**·**3-2 흐름** | '설정·꿈 그림 파일' | 사전 파일 추가 | '설정·꿈 그림·낱말 사전 파일' |
| P3 | 처리방침 K 체크리스트 **K4** 증거 칸(그리고 K1·K3·K25는 'B4 커밋 뒤 대조'로 남아 있음 — 서버 쪽은 이 보고 2절이 증거) | `rate-limiter.ts`·`client-ip.ts`·`account.service.ts`·`ota.controller.ts` | 통계 핑의 IP 창은 `throttler.guard.ts`(`@nestjs/throttler` 메모리, 60초 창) + `metrics.controller.ts` `PING_LIMIT_PER_MIN` | K4 증거에 두 파일을 더함(문구 '약 1분·저장 안 함'은 일치) |
| P4 | 처리방침 K 체크리스트(새 줄 제안 **K36** — K33~K35는 D-27 돌봄이 11-25에 씀) | — | 서버는 동의·연령을 구별하지 못한다(3-6-1). 동의 버그 판은 `METRICS_INGEST=off`·판 빼기·`app_ver` 삭제로 걷어 낸다 | K1·K25 옆에 'K36 동의 버그 판 걷어 내기 런북 있음(docs/ops/metrics)' — 3-1 '직접 켠 경우에만 보냅니다'가 참이 되게 하는 운영 장치 |
| P5 | PIA **5절 R1·R12** 줄의 완화 칸 | 통계 토글 14세 확인·opt-in(앱) | 서버는 구별 못 함 → 칸 합계만·식별자 0·IP 저장 0 + 걷어 내기 손잡이 | 완화 칸에 '서버는 동의를 확인할 수 없으므로 동의 오류 판의 통계는 판 단위로 수집을 멈추고 지움' 한 줄. A표에 P4 런북 행 |
| P6 | 처리방침 ko·en **3-1** | '정해진 게임 사건 10가지' | 그대로 10(이번에 안 바꿈) | 변경 없음. `life_done`·`drop_new`는 K3 절차 그대로 |
| P7 | 처리방침 **14절** 안전성 확보 조치(선택) | — | 설정·콘텐츠 파일 전자서명 검사(앱이 서명 틀린 파일을 쓰지 않음) | 개인정보 항목은 아니므로 넣지 않아도 됨. 넣는다면 '설정·콘텐츠 파일의 위·변조 검사' 한 줄 |
| P8 | 처리방침 3-1 '통계 값에는 누가 보냈는지 나타내는 값이 없습니다' | — | 거절 로그는 까닭별 **개수만**(값 없음, `test/ping-b4.e2e.test.ts`) | 변경 없음(일치) |
| P9 | 처리방침 ko·en **3-1 'IP 주소'** 항목(리뷰 L1) | '클라우드 사업자의 접속 기록에는 IP 주소·요청 경로·시각이 남으며 7일' | 운영자 코드는 IP·UA를 저장하지 않음. Cloud Run 플랫폼 요청 로그에는 **IP·User-Agent**·경로·시각이 7일 남음(iOS 기본 UA에 앱 빌드 번호 포함). B6에서 보존 기간 최소화 검토 | 3-1 접속 기록 항목에 'User-Agent(기기·앱 판 정보)'를 더할지 QA-3·PM 결정(3-2는 이미 UA를 적음). C11이 핑 UA를 고정값으로 덮으면 '고정된 앱 이름만'으로 쓸 수 있음. 보존 기간이 바뀌면 6절 표도 함께 |
| P10 | PIA **5절 R2**(한 사람 칸 재식별) 완화 칸 | k5 뷰·원표 내보내기 금지·90일 | 집계 공개 기준(밖으로 내는 수치는 k≥5 칸만), 플랫폼 로그(7일)와 원표를 함께 보지 않는 규칙, 원표 접근 롤 목록(B6) | 완화 칸에 '접속 기록과 통계 원표를 함께 보지 않음' 한 줄 |

## 4-1. 독립 리뷰 반영(11-25, `docs/team/reviews/2026-11-25-b4-review.md` 조건부 승인 → PM 결정대로)

| 지적 | 반영 |
|---|---|
| M1 `__proto__` 서명 우회 | 재현 시험 먼저(`remote-review.test.ts` — 맨 위·중첩 `__proto__`·`constructor`·`prototype` 6개). `hasForbiddenKey`로 서명 검사 **전에** 거부, `remoteDocBody`(프로토타입 없는 객체)를 검사기·`signRemoteDoc`이 함께 쓴다 |
| M2 살아남은 변이 3개 | 고정 키(2048·1024·2048 e=3, `remote-fixture.ts`)로 순수 BigInt 원시 RSA 벡터: PS 한 바이트 0xfe(세 자리)·e=3에서도, `s + n`·`s = n`, 1024비트 바른 서명 → 모두 bad |
| M3 서명 없는 문서 | `verifyRemoteDocStrict`(서명 필수) — 앱은 이것만(계약 주석·roadmap C11 완료 조건). 출시 모드 빌드 차단은 3절 3 |
| M5 옛 판·신선도 | `expiresAt`(기본 14일·최대 30일, 근거 architecture 3-7-2), 만료 → 번들 기본값, `REMOTE_BUNDLE_FLOOR` 자리, `sign --prev` 판 증가 강제 |
| M4 탈출 | `escapeFlags`(번들 AND 원격이 끈 키는 끈 채 AND NOT off — 전수 시험), 감지 문턱 = 번들 상수 + `escapeThresholds`(더 민감하게만), 스키마 범위 afterCrashes 1~2·withinSec 10~60 |
| L1 'IP 저장 0' 과장 | '운영자 코드는 IP·UA 저장 0, 플랫폼 요청 로그 7일'로 고침(컨트롤러 주석·architecture 3-6-1·DECISIONS), P9 |
| L2 작은 칸 | 집계 공개 기준(k≥5)·로그와 원표 분리 규칙을 architecture 3-6-1에, P10·3절 12 |
| L3 판 단위 삭제 부수 효과 | architecture 3-6-1·3절 11 |
| L4 CLI | keygen은 `mkdir` 뒤 `realpath`로 다시 확인(링크 아래 새 폴더 시험), sign은 키 권한 0600 아니면 경고 |
| L5 사전 팩 불변 | `lexHashIndex`·`lexImmutableViolations` + `sign --prev`가 강제, web-static·앱 후속(3절 4·8) |

## 5. 확인 필요

- Firebase가 새 배포 때 CDN 캐시를 비우는지·`max-age=300`이 기기 HTTP 캐시에서 실제로 지켜지는지(iOS NSURLCache) — B6 실측.
- Hermes에서 RS256 검사 시간(BigInt 거듭제곱 17번, 3072비트) — C11에서 실기기 측정, 1시간에 한 번이라 수십 ms면 충분 **[팀 추정]**.
