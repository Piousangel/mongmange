# 린트 규칙과 검증 층 (로드맵 A6, OPERATING 7-1·7-2·7-3)

- 작성: 개발 환경 담당, 2026-11-20. A6 독립 리뷰(`docs/team/reviews/2026-11-20-a6-review.md`, 조건부 통과) 반영판.
- 설정: `eslint.config.mjs`(저장소 하나에 하나). 로컬 규칙: `tools/eslint/mong-plugin.mjs`. 규칙 시험: `tools/eslint/mong-plugin.test.mjs`. 주석 규율 바깥 검사: `tools/eslint/check-directives.mjs`(+ `.test.mjs`).
- 원칙: 같은 리뷰 지적이 **두 번** 나오면 문서에 한 줄 더하지 않고 검사(린트·시험)로 올린다. 오류 메시지는 '어떻게 고치나'를 말한다. 근거 칸에는 **실제로 그 검사가 막는 지적만** 적는다. 관련은 있지만 이 검사로 막히지 않는 지적은 근거로 쓰지 않는다(리뷰 M4).
- 새 규칙 추가 절차는 네 단계다.
  1. 리뷰 문서에서 반복을 확인한다(원문 대조).
  2. 규칙(또는 시험)과 RuleTester 시험(잡아야 할 꼴·통과해야 할 꼴)을 만든다.
  3. 아래 승격 표에 한 줄 더한다.
  4. `pnpm verify`를 통과시킨다.

## 1. 검증 층 — 무엇이 언제 도나

| 층 | 명령·위치 | 언제 | 무엇을 |
|---|---|---|---|
| 완료 관문 훅 | `.claude/hooks/typecheck-gate.sh`(Stop 훅) | Claude 턴이 끝날 때마다. 단, `apps`·`packages`에 미커밋 변경이 있을 때만 | 타입 검사만 한다(빠른 관문). 실패하면 완료를 막는다 |
| 전체 검증 | `pnpm verify`(`scripts/verify.mjs`) | 커밋·리뷰 요청 전, CI | `typecheck` → `lint`(경고 0) → `directives`(주석 규율, ESLint 밖) → `tools`(린트 규칙·주석 검사·verify 자체 시험) → `test`(전 패키지) → `server-bundle` → `static-empty` |
| CI | `.github/workflows/ci.yml` | PR·main push. 경로: `apps`·`packages`·`scripts`·`tools`·루트 설정·lockfile | `pnpm verify` 그대로(로컬과 같은 명령) |
| 서버 전용 CI | `.github/workflows/server-ci.yml` | 서버·core·contract·루트 `package.json`·lockfile 경로 | Postgres 서비스가 필요한 실제 DB 시험·마이그레이션 어긋남·OpenAPI·docker 스모크 |

- 훅은 그대로 둔다(타입만, 매 턴). verify는 훅을 대신하지 않고 그 위에 얹는다. 훅이 통과해도 verify는 실패할 수 있다(린트·시험).
- `pnpm verify --heavy`는 썸네일 구별 회귀 가드(`RENDER_HEAVY=1`)까지 돈다(11-20 측정: 시험 단계 20초 → 37초).
- `--only lint,test`(또는 `--only=lint,test`)로 일부 단계만 돌릴 수 있다.
  - 모르는 단계 이름, 값 없는 `--only`, 모르는 인자는 단계 목록을 찍고 **종료 코드 2**로 끝난다.
  - 실제로 돈 단계가 0개면 실패다. '0단계 통과'는 없다(리뷰 M1, `scripts/verify.test.mjs`).
- 실패하면 마지막 줄에 `verify 실패: <단계>(…)`가 나온다. 전체 출력은 `VERIFY_VERBOSE=1`.
- 옛 `static-ci.yml`은 전부 verify 안으로 들어와 지웠다(contract 타입·시험, web-static 시험, 빈 값 빌드 실패). server-ci에서는 타입·단위 시험·번들 검사를 뺐다(ci.yml이 한다). 리뷰 1절에서 잃은 검사가 없음을 대조했다.
- 캡처(`scripts/*-capture.mjs`)는 아직 verify 밖이다. Expo 웹 서버를 띄워야 하기 때문이다. 기능별 캡처 명령은 `docs/team/feature-map.md`에 있다. `pnpm verify:screen` 통합은 후속 과제다.

## 2. 규칙 목록과 심각도

**경고 0 정책**: 모든 규칙은 `error` 또는 끔이다(`--max-warnings 0`). 경고는 에이전트 작업에서 쌓이기만 하고 읽히지 않는다. 그러면 교정이 가장 약한 층으로 내려간다.

판단이 필요한 예외는 규칙을 끄지 않는다. 그 줄에서 `// eslint-disable-next-line <규칙> -- <이유>`로 비활성화한다. eslint 주석은 세 장치로 지킨다.
- `mong/eslint-comment-discipline`(린트 안)이 세 꼴을 오류로 낸다.
  - 이유 없는 disable
  - 규칙 이름 없는 disable(모든 규칙을 끈다)
  - 인라인 설정 주석(`/* eslint 규칙: "off" */`·`/* global … */`): 이유가 있어도 금지
- `reportUnusedDisableDirectives`가 쓸모없어진 disable을 오류로 낸다.
- `pnpm verify`의 `directives` 단계가 같은 판정 함수(`classifyComment`)로 ESLint **밖에서** 한 번 더 본다. 인라인 설정 주석은 규율 규칙 자신까지 끌 수 있어서, 린트 안에서만 보면 우회가 남는다(리뷰 M3 탐침, `check-directives.test.mjs`·`mong-plugin.test.mjs`에 고정).

`linterOptions.noInlineConfig`를 쓰지 않은 이유: 그 옵션은 인라인 설정과 함께 `eslint-disable` 주석까지 전부 무시한다. 그러면 '이유를 단 줄 단위 예외'라는 정답 길이 막힌다. 그래서 로컬 규칙과 바깥 검사로 인라인 설정만 골라 막았다. 이유를 단 disable이 계속 동작하는 것은 시험 '이유를 단 줄 단위 disable은 계속 쓸 수 있다'와 코드의 실제 예외 4곳(NetBridge·DreamCardPreview·GameHome·native.web)이 린트를 통과하는 것으로 확인한다.

| 규칙 | 범위 | 심각도 | 근거 |
|---|---|---|---|
| `@eslint/js` recommended | 전체 | error | 기본 |
| `typescript-eslint` recommended | TS 전체 | error | 기본. `no-explicit-any`·`no-empty-function`은 시험 파일에서 끈다(목 객체) |
| `@typescript-eslint/no-unused-vars` | TS 전체 | error | 죽은 import를 남기지 않는다(OPERATING 7-6 덜어내기). `_` 접두는 일부러 안 쓴다는 표시 |
| `@typescript-eslint/no-require-imports` | `apps/mobile`에서 **끔** | — | Metro는 에셋(`require('x.wav')`)과 지연 로드(Skia 뒤 App, `optionalModule`)를 require로만 한다. 서버·core에서는 켜짐 |
| `@typescript-eslint/no-floating-promises` · `no-misused-promises` | TS 전체(타입 정보) | error | 발사 후 무시는 `void p`로 드러낸다. 이미 쓰던 관례를 규칙으로 올린 것이다. JSX 속성의 async 핸들러는 허용(`checksVoidReturn.attributes: false`) |
| `react-hooks/rules-of-hooks` | `apps/mobile` | error | 기본 |
| `react-hooks/exhaustive-deps` | `apps/mobile` | error | 위반 0건에서 시작해 경고로 둘 이유가 없다. 의도적 누락 2곳에는 이유를 달았다(GameHome `clock.value`, DreamCardPreview `labels`) |
| `mong/no-floating-timer` | 앱 코드·서버 src | error | 아래 승격 표 1 |
| `mong/effect-needs-cleanup` | 앱 코드 | error | 승격 표 2 |
| `mong/no-literal-ui-text` | 앱 `.tsx`(언어 파일 제외) | error | 승격 표 3 |
| `no-restricted-syntax` 모듈 최상위 `throw` | 앱 코드 | error | 승격 표 4 |
| core 결정성(`Math.random`·`Date.now`·`performance.now`·`new Date()`) | `packages/core/src` | error | 승격 표 5 |
| 경계 import(`no-restricted-imports`) | core·contract·앱 | error | 승격 표 6 |
| `mong/no-excuse-comment` | 전체 | error | OPERATING 7-2 '땜질 변명 주석 금지'. 'HACK'·'XXX'·'workaround'·'땜질'·'임시 방편/처리'만 잡는다. '임시 파일'·'임시 호칭'처럼 제품 뜻의 '임시'는 잡지 않는다 |
| `mong/eslint-comment-discipline` | 전체 | error | 위 문단(규칙을 끄는 판단도 리뷰 대상) |

앱 코드 = `apps/mobile/src/**`, `App.tsx`, `index.ts`. 캡처 스크립트(`scripts/*.mjs`)는 `page.evaluate` 콜백이 브라우저에서 돌기 때문에 Node·브라우저 전역을 같이 연다.

## 3. 승격 표 — 근거 → 검사

| # | 범주 | 근거(이 검사가 실제로 막는 것만) | 검사 | 위치 |
|---|---|---|---|---|
| 1 | 타이머 핸들을 버림(정리 누락 → 언마운트 뒤 setState·소리) | ① OPERATING 7-2 '`setTimeout` 같은 땜질 수단은 범주째 막는다' ② mentors.md 1절-5(이유를 단 `setTimeout` 땜질이 복제되어 183개) ③ **A6 첫 실행에서 실제 위반 6건**(정리 전 기준: `GameApp.tsx:150·152·155·317·422`, `share/native.web.ts:40`) | `mong/no-floating-timer`: 타이머 결과를 문장으로 버리면 오류. `&&`·삼항·형 단언·`void`를 거쳐 버려도 오류(리뷰 L6). 컴포넌트 안 일회 지연의 정답 길은 `useLater()`(언마운트 때 취소, 반드시 일어나야 하는 정리는 `flushOnUnmount`) | `tools/eslint/mong-plugin.mjs`, `apps/mobile/src/lib/useLater.ts`(+ `test/use-later.test.ts`) |
| 2 | effect가 시작한 일을 정리하지 않음(언마운트·재실행 뒤 늦은 setState) | ① OPERATING 7-2 '`useEffect`… 용도를 분류해 허용 위치를 정한다' ② **A6 첫 실행 실제 위반 1건**(`DreamCardPreview.tsx:54`, export 경로 `.then`에 정리 없음) ③ 리뷰 M2 보강 뒤 재실행 1건(`NetBridge.tsx:26` `void flush` — 이유를 단 예외) | `mong/effect-needs-cleanup`: effect가 타이머·`addEventListener/addListener/subscribe`·`.then/.catch/.finally`·`await`·`void 호출`을 시작하거나, effect 안에서 선언한 함수(그런 일을 하거나 async)를 부르면, 그 뒤에 **정리 return**(몸통 있는 함수·함수 이름·해제 함수를 돌려주는 호출)이 있어야 한다. `return null`·빈 함수는 정리가 아니다. async 콜백은 금지 | 같은 파일 |
| 3 | 사용자 글 하드코딩(라틴 포함) | ① `2026-11-20-i18n-review.md` 4절-1 "영어(라틴) 하드코딩은 못 잡는다(P2)". 이 지적은 i18n 작업에서 이미 정규식 시험(`i18n-static.test.ts` `latinOffenders`)으로 올라갔다 ② **A6 첫 실행에서 그 정규식이 놓친 2건**(`StrokeScreen.tsx` `L{l}`·`L{level}` — `{`가 섞인 JSX 글) | `mong/no-literal-ui-text`: 같은 범주를 AST로 본다. JSX 글, 자식 자리 `{'글'}`·`{ok ? 'A' : 'B'}`·`{x ?? '글'}`(리뷰 L5), `accessibilityLabel`·`accessibilityHint`·`placeholder`·`title`·`aria-label`의 문자열·템플릿·조건식. 예외 표시는 시험과 같은 말(`i18n-ignore` 줄, `// i18n-ignore-file:` 파일 — 허용 목록은 시험이 고정) | 같은 파일 |
| 4 | 모듈을 불러오는 순간 던져 앱 전체가 죽음 | `2026-11-20-dream-card-review.md` 1(`marbleFx` 모듈 최상위 throw) | `no-restricted-syntax` `Program > ThrowStatement`(앱 코드) | `eslint.config.mjs` |
| 5 | core 결정성(숨은 시계·난수) | `2026-11-20-sim-review.md` "src/sim에서 Date·Math.random·performance 검색 0건" — 사람이 grep으로 하던 확인을 검사로 옮김(현재 위반 0, 예방) | `no-restricted-properties`·`no-restricted-syntax`로 core src에서 금지 | `eslint.config.mjs` |
| 6 | 패키지 경계 | mentors.md 적용안 1(core → RN·expo·apps 금지, 앱 → 서버 내부 금지), 서버 `check:bundle` ②(core 런타임 의존성 0) | `no-restricted-imports`: core는 react·RN·expo·`@shopify/`·`node:`·`zod`·`@mong/contract`·apps 금지. contract는 프레임워크·apps 금지. 앱은 서버 내부·`@nestjs/`·`@prisma/` 금지 | `eslint.config.mjs` |

- 4번 근거에서 `2026-11-20-m1-code-review.md` L4(`features.ts`의 `decodeURIComponent`)는 뺐다. 최상위에서 부른 함수 안의 throw라 이 검사로 막히지 않는다.
- 1·2번은 '리뷰에서 두 번 나온 지적'이 아니다. 근거는 OPERATING 7-2의 범주 금지 지시와 첫 실행의 실제 위반이다. 리뷰 M4가 정정한 내용이다.
- 처음 판에서는 build1 L-6(평점 정책), app-flow C9(누수 없음으로 결론), server-v2 4(Cloud Run CPU 할당), build1 M-4·app-flow C8(정적 판정 불가)을 근거로 적었다. 모두 이 검사로 막히지 않아서 근거에서 뺐다.

### 승격하지 않은 것(이유)

| 지적 | 왜 린트가 아닌가 | 대신 |
|---|---|---|
| worklet 기본 인자에 모듈 상수(`2026-11-20-build1-code-review.md` L-5, S25 사고) | 이미 시험으로 막혀 있다 | `packages/core/test/worklet-defaults.test.ts`(중복 규칙 만들지 않음) |
| worklet 선언 순서 TDZ(`2026-11-20-spike02-review.md` 2-2가 ESLint `no-use-before-define` 제안) | 시험이 같은 위험을 더 정확히(worklet만) 본다. 규칙은 일반 함수까지 잡아 오탐이 난다 | `packages/core/test/worklet-order.test.ts` |
| 한글 하드코딩(문자열 전체) | 이미 시험이 문자열·JSX 전부를 본다 | `apps/mobile/test/i18n-static.test.ts`(사용자 화면 파일의 예외 표시 상한 16. 현재 14) |
| 버튼 연타 경합(state 클로저 가드, build1 M-4) | '같은 틱 두 번 누름'은 정적으로 판정할 수 없다 | 구조: `useRef` 잠금(`cardText.tsx` `lock`) |
| 알림 예약 경합(app-flow C8) | 호출 순서 문제라 정적으로 판정할 수 없다 | 구조: `notify.ts` 직렬 큐(i18n 리뷰 3-3에서 확인) |
| 백그라운드에서 지연이 사라짐(build1 L-6 평점 타이머, server-v2 4 Cloud Run flush) | 정책·플랫폼 실행 모델 문제다. 핸들을 지켜도 막히지 않는다 | 각 리뷰의 결정(D-18 ⑤ 허용, 서버는 요청 처리 중 flush) |
| 보안 난수가 Math.random으로 떨어짐(build1 H-1, 앱 쪽) | 1회 지적이다. 앱에는 Math.random이 정당한 곳(연출 흔들림)이 있다 | 결정 기록(DECISIONS) + 실기기 확인 |
| 서버 운영 기본값(XFF 0, `DIRECT_URL` 누락 — server-b1 I1·I3) | 값 검사라 린트 대상이 아니다 | `apps/server/test/env.test.ts` |

## 4. useEffect·setTimeout 용도 분류(OPERATING 7-2, 11-20 현재)

앱 코드에 `useEffect` 23곳, `setTimeout`·`setInterval` 직접 호출 19곳(주입 어댑터 포함)이 있다. 전면 금지는 하지 않는다(mentors.md 적용안 2 '분류 뒤 금지 범위 결정'). 허용 위치는 아래와 같다.

| 용도 | 허용 위치·모양 | 예 |
|---|---|---|
| 컴포넌트 일회 지연(연출 순서·소리 뒤 소리) | `useLater()` — 언마운트 때 취소 | GameApp 기쁨 소리 900ms, 씻기 창 닫기, 첫 획 문구, 세이브 손실 문구 |
| 반드시 일어나야 하는 지연 정리(루프 소리 멈춤·자원 해제) | `useLater(fn, ms, { flushOnUnmount: true })` — 언마운트 때 바로 실행 | GameApp 먹 갈기 루프 멈춤(리뷰 L2) |
| 다시 걸면 앞의 것을 취소하는 지연 | `useRef` 핸들 + `clearTimeout` | GameApp `flash`·`returnTimer`·`promptTimer`, cardText `noteTimer`, GameHome 길게 누르기 |
| 화면 수명과 같은 지연·주기 | effect 안 + 정리 함수 | GameApp 틱 `setInterval`, 첫 밤 문구, 환경음 전환, MorningScreen 카드 등장·스크린리더 안내 |
| 컴포넌트 밖 엔진 | 주입 타이머(`audio/engine.ts` `Timers`) — 시험에서 가짜 시계 | 소리 엔진 램프·원샷 해제 |
| 네트워크 제한 시간 | `AbortController` + `finally clearTimeout` | `net/http.ts` |
| 애니메이션 지연(새로 만들 때) | 타이머 대신 Reanimated(`withDelay`·공유값). UI 스레드에서 돌고 언마운트와 함께 멈춘다 | (현재 사용처 없음) |
| 시간 흐름(하루·잠·바램) | 타이머가 아니라 core sim 시계(`tickNow`) | — |

## 5. A6에서 고친 기존 위반

첫 실행 기준:
- `mong/no-floating-timer` 6건: GameApp 5건은 `useLater()`로 바꿨다. `share/native.web.ts` 1건은 이유를 단 예외다(컴포넌트 밖, state와 무관한 URL 해제).
- `mong/effect-needs-cleanup` 1건: `DreamCardPreview` export 경로에 `alive` 표시와 정리 함수를 넣었다.
- 이유 없는 disable 3건: 이유를 2건에 달았다(GameHome·DreamCardPreview). 필요 없어진 1건(`index.ts` require — 모바일에서 규칙 끔)은 지웠다.
- `mong/no-literal-ui-text` 2건: StrokeScreen 스파이크 개발 막대와 연구 표식. 리뷰 반영 후 `StrokeDevBar.tsx`(`// i18n-ignore-file:`, 허용 목록 등록)로 떼어 냈다. i18n 예외 상한은 16 그대로다(리뷰 L4).
- `no-unused-vars` 5건: DreamCard 죽은 import 4(`RoundedRect`·`CORE`·`strokeSpine`·`serifFamily`), 서버 시험 `expect` 1.
- 코어 규칙 4건, 각 1건:
  - `no-floating-promises`: `index.ts` `ready.then` → `void`
  - `no-unused-expressions`: engine 삼항 문장 → if
  - `no-useless-assignment`: GameApp `body`
  - `no-unexpected-multiline`: 서버 시험
- `no-undef` 34건: 캡처 스크립트의 브라우저 콜백이다. 환경 설정으로 풀었다(코드 변경 없음).
- `no-require-imports` 30건: 모바일 Metro require다. 규칙을 껐다(위 2절).

리뷰 반영 후 재실행:
- `mong/effect-needs-cleanup` 1건: `NetBridge.tsx` `void pingClient.flush`. 이유를 단 예외로 뒀다. 결과를 state에 쓰지 않고, 언마운트 때 취소하면 쌓인 칸을 잃는다.
- L5로 넓힌 `no-literal-ui-text`의 새 위반은 0건이다.

그 밖:
- C4 파일(`packages/core/src/moon/**`, `sim/dream.ts`, `core/src/index.ts`, `moon-*.test.ts`, `moon-contract.test.ts` — A6 중 679c4d1로 커밋됨)은 린트 대상에 그대로 있고 위반 0건이다(손대지 않음).
- core `testTimeout 30초` 전역 설정은 리뷰 L3에 따라 뺐다. 착수 전 1회 본 시간 초과(동시 부하 중)는 리뷰어 2회와 A6 반영 후 verify 2회 연속에서 재현되지 않았다. 다시 나면 그 시험에만 제한을 건다.

## 6. 한계(정적으로 판정 못 하는 것 — 리뷰 몫)

- `effect-needs-cleanup`은 정리 return이 **있는지**만 본다. `alive` 표시를 실제로 확인하는지는 보지 않는다.
- 같은 규칙은 effect 밖에서 정의한 비동기 함수를 `void` 없이 부르는 꼴도 못 본다. 이 꼴은 `no-floating-promises`가 `void`나 `.catch`를 요구하므로 결국 위 트리거로 잡힌다. 단, 반환형이 약속이 아니라고 선언된 함수 안에서 비동기 일을 하면 놓친다.
- `no-floating-timer`가 못 보는 꼴은 세 가지다.
  - 별칭(`const st = setTimeout; st(f)`)
  - 계산 접근(`globalThis['setTimeout']`)
  - 객체 속성의 간결 화살표(`{ onDone: () => setTimeout(f) }`). 주입 어댑터(`setTimer: (fn, ms) => setTimeout(fn, ms)`)와 모양이 같아 구별할 수 없다.
- disable의 이유 칸에 한 글자(`-- .`)만 적어도 통과한다. 이유가 말이 되는지는 리뷰가 본다.
- 린트는 타입 정보를 쓴다(`projectService`). tsconfig에 들지 않는 새 `.ts` 설정 파일은 파싱 오류가 난다. 설정 파일은 `.mjs`로 두거나 tsconfig에 넣는다.

## 7. 새 의존성(루트 devDependencies, 린트 전용)

| 패키지 | 버전 | 이유 |
|---|---|---|
| `eslint` | 10.15.0 | 린트 실행기(flat config) |
| `@eslint/js` | 10.0.1 | JS 기본 권장 규칙 |
| `typescript-eslint` | 8.73.0 | TS 파서·권장 규칙·타입 정보 규칙(`no-floating-promises`), 주석 검사의 파서. typescript 6.0.x 지원(peer `<6.1.0`) |
| `eslint-plugin-react-hooks` | 7.1.1 | `rules-of-hooks`·`exhaustive-deps`. 권장 묶음의 React Compiler 규칙은 켜지 않는다 |
| `globals` | 17.14.0 | Node·브라우저 전역 목록 |

- `expo lint`(eslint-config-expo)는 쓰지 않았다. 위 다섯으로 같은 규칙을 덮고, 저장소 전체(서버·core·contract·스크립트)를 설정 하나로 보기 위해서다.
- lockfile 변경은 추가만 있고 `pnpm install --frozen-lockfile`을 통과한다.
- 주의(리뷰 I3): typescript는 루트 의존성이 아니고 hoisted 6.0.x로 peer를 채운다. **typescript를 6.1 이상으로 올리는 작업은 typescript-eslint도 함께 올려야** 린트가 깨지지 않는다.
- 첫 CI 실행 때 확인할 것(리뷰 I2): 모바일 시험이 ubuntu(대소문자 구별 파일 시스템)에서 처음 돈다. 첫 결과를 progress에 남긴다.
