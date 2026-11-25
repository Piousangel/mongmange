# 독립 리뷰 — web-static W1~W7 · B4 후속(서명·캐시·사전 팩) 미커밋 변경

- 날짜: 2026-11-25
- 리뷰어: 독립 리뷰어(QA-1 빌드·배포 관문 · QA-3 개인정보 게시 정확성 · 보안 서명 검사 겸임, 작성 불참)
- 대상: `apps/web-static`의 미커밋 변경 — `scripts/build.mjs`·`scripts/site.mjs`·`firebase.json`·`remote-public-keys.json`·`README.md`·`test/helpers.mjs`·`test/remote.test.mjs`·`test/site.test.mjs`·`test/build.test.mjs` (git diff 5파일 +269 −118, 새 파일 4)
- 기준: `docs/release/README.md` W1~W8, `docs/release/privacy-policy-tester.{ko,en}.md`, DECISIONS '2026-11-25 PM 판정 — 빌드 2 Data safety'(보호책임자 = 상호, 값은 저장소에 두지 않음), `docs/design/server-v1/B4-report.md` 3절, `architecture.md` 3-7-2 캐시 표(643~645행), `packages/contract` `verifyRemoteDocStrict`
- 고치지 않았고 커밋하지 않았다. 변이는 모두 되돌렸고 `cmp`로 원본과 같음을 확인했다.

## 판정: 조건부 통과

막는 결함(차단)은 없다. W7 차단은 빈 값·공백으로는 뚫리지 않고, HTML·스크립트 주입도 막힌다. 출시 모드는 공개키가 없으면 실제 CLI에서 실패한다.
다만 **'칸을 채운 것처럼 보이지만 실제로는 빈' 값**(미정·TBD·제로폭 문자 등)이 통과해 W7의 취지를 사고로 우회할 수 있고(R1), 캡처 스크립트가 이 변경으로 깨졌다(R2). R1·R2는 B6 첫 배포 전에 고치길 권한다.

## 직접 실행한 것

| 무엇 | 결과 |
|---|---|
| `pnpm verify`(1회차) | 6단계 통과, **test 단계 실패** — `packages/core` 시험 2개가 5초 시간 초과(dream-card·dream-rules). 같은 시각 리뷰어의 빌드 탐침을 함께 돌려 CPU가 붐볐다. web-static과 무관 |
| `pnpm verify --only test`(재실행) | **통과**(96.8초). web-static 3파일 75/75, core 574 통과·2 건너뜀, server 258, mobile 322 |
| static-empty 단계 | 통과(빈 4값 → 종료 1 + '비어 있다' 문구 4개). `SITE_MODE` 미설정 = 출시 전 모드로 돈다 |
| 실제 CLI `node scripts/build.mjs`, 기입 전(4값만) | **종료 1**, W7 문제 2건(`privacy/index.html`·`en/privacy/index.html` 기입 칸 1곳씩, PRIVACY_OFFICER 안내 포함) |
| 실제 CLI, `PRIVACY_OFFICER=행복가게` | **통과**, 19개 원본 파일. 한·영 11절 칸에 값이 들어감, 경고 3건(정본 메모 58곳·서명 없음 2) |
| 실제 CLI, 위 + `SITE_MODE=launch` | **종료 1**, 7건(공개키 목록 비어 있음·config/content unsigned·정본 메모·작업 메모). 실패 시 `public/`을 지움 |
| 실행 뒤 `git status`·`git diff --stat` | 실행 전과 같음, `public/` 없음 |

## 1. 게시 차단(W7) 우회 경로

`build()`에 PRIVACY_OFFICER 값 26가지를 넣어 출시 전 모드로 빌드했다(지금 정본 docs 그대로).

| 값 | 결과 | 평가 |
|---|---|---|
| `''`·`'   '`·NBSP·전각 공백 `　` | 실패(칸이 남아 ⑦이 잡음) | 맞음 — `trim()`이 유니코드 공백을 걷는다 |
| 제로폭 1자 `​` | 실패(`looksPlaceholder` 같은 글자 반복) | 맞음 |
| `[상호]`·`a\|b`·`<b>x</b>`·`TODO` | 실패(형식) | 맞음, 값은 오류 문구에 안 실림 |
| `https://evil.example` | 실패(허용 밖 외부 주소) | 맞음(④가 잡음) |
| `초안`·`K1` | 실패(작업 메모·K행) | 안전(문구는 엉뚱하지만 막힘) |
| `&lt;script&gt;`·`"onload="x`·`$&$\`` | 통과, `&amp;lt;…`·`&quot;…`로 이스케이프, `replace(() => officer)`라 `$&` 치환 없음 | **주입 불가 확인** |
| **`​‌`(제로폭 2자)·`‮‭`(방향 제어)** | **통과 — 칸이 화면에서 비어 보임** | **R1** |
| **`미정`·`TBD`·`N/A`·`상호`·`오너 기입`** | **통과** | **R1** |
| **`［상호］`·`【상호】`(전각 괄호)** | **통과** — ⑦ 메모 정규식이 ASCII `[ ]`만 봄 | **R1** |
| `**굵게**`·`` `코드` ``·`https://mongmang.ink/x` | 통과, 마크다운 문법이 적용됨(굵게·code·자기 도메인 링크) | R7(위험 없음) |

- **렌더 HTML 검사 범위**: `visibleText`는 태그·주석·script·style을 빼고 본다 → `alt`·`title` 속성·`meta content`는 검사하지 않는다. 지금 렌더러(`markdown.mjs`)는 이미지 문법이 없고, md 글이 속성으로 가는 곳은 H1(→ `<title>`·description)뿐인데 H1은 보이는 글자에도 있어 **지금은 빈틈이 없다**(R10, 미래 위험). md 안의 `<!-- 메모 -->`는 이스케이프되어 **화면에 보이는 글자로** 나간다 — 숨겨지지 않으니 게시 전 눈에 띄지만, `[ ]`·작업 메모 낱말이 없으면 빌드는 통과한다.
- **두 모드가 게시하는 것**: 출시 전 = `privacy-policy-tester.*.md`(H1 '테스트 빌드'·'Test Build' 필수, s-17 이상 금지), 출시 = 정본(상자 제외, s-17 필수). facts 링크 문구·llms.txt 제목도 모드에 맞게 바뀜. **정확함.** 단, PRIVACY_OFFICER는 테스터판만 채운다(R5).

## 2. 테스터판 렌더 ↔ 원문 의미 대조

`PRIVACY_OFFICER=행복가게`로 빌드해 `<main>`의 보이는 글자와 md 모든 글줄(표 칸 포함, 마크업만 걷음)을 대조했다.

| | ko | en |
|---|---|---|
| md 글줄 중 렌더에 없는 것 | **0** | **0** |
| 표 / 칸 | 3/3 · 60/60 | 3/3 · 60/58(md의 빈 머리 칸 2개 `\| \| \|`) |
| H2 / H3 | 13/13 · 2/2(1-1·1-2) | 13/13 · 2/2 |
| 외부 링크 | ML Kit 공개 문서 · Google 개인정보 문의 2곳만(괄호 뒤 `)` 제외 정확) | 같음 |
| 쉬운 말 요약 | 굵은 제목 문단 + 목록 5개 그대로 | 같음 |

- ko·en 절 구조 13절 대응. 영어 11절 표 머리가 비어 빈 `<th>` 두 개가 나간다(R8, 원문 쪽). 12절 구제 기관 수가 ko 4·en 2인 것은 원문 차이(렌더 문제 아님).
- 같은 PRIVACY_OFFICER 값이 영어판에도 들어간다 — 한글 상호가 영어 페이지에 그대로 나간다(정보, 법적 문제는 아님).

## 3. 서명·만료 검사

- **공개키 없음 + 출시 모드**: `strict && !keys.length` 문제 줄 + 두 문서 `unsigned` → 실패. 실제 CLI로 확인.
- **만료 7일 경계**: `expiresAtMs - now <= 7일`이면 실패. 시험이 '정확히 7일 = 실패'와 '7일 + 1분 = 통과'를 둘 다 본다. 변이 M2(`<=`→`<`)를 잡음. B4 3절 3 '7일 안이면 실패'와 맞음. 30일 상한은 `verifyRemoteDocStrict`의 `too_long`.
- **매니페스트 밖 파일**: `content/lex/` 아래(하위 폴더 포함 `walk`)는 매니페스트에 없으면 실패. lex `url`은 계약 정규식(`/content/lex/(ko|en)-N.<8hex>.json`)이라 경로 이탈 불가. **`content/motifs/`는 같은 immutable 캐시인데 고아 파일을 검사하지 않는다**(R6).
- **키 파일 바꿔 치기 경로**: CLI에는 키 경로를 바꾸는 환경 변수·인자가 없다(`remoteKeysPath`는 `build()` 인자로만) → 배포 환경에서 바꿀 길은 저장소 커밋뿐. 모양 틀린 키·같은 kid는 실패. **남는 위험**: ① 엄격 검사가 '이 파일이 비어 있지 않음'에 묶여 있어, C11 키가 든 앱이 나간 뒤에도 이 파일을 비워 두면 출시 전 모드는 서명 없는 config를 경고만 내고 배포한다(B4 리뷰 M3의 원래 위험) ② 이 파일과 앱 번들 키 목록의 동치를 확인하는 장치가 없다 — 다른 키를 넣고 그 키로 서명하면 빌드는 통과하고 앱은 `unknown_kid`로 버린다(R3). 지금은 앱 키 목록이 아직 없다(C11 전).
- `floor`(바닥 판)·직전 배포 대비 사전 팩 불변(B4 3절 4)·`escape` 명시(3절 5)는 README '아직 안 한 것'에 적혀 있다 — 범위 밖으로 인정.

## 4. 캐시 머리글

| 경로 | firebase.json | architecture 3-7-2 / B4 3절 1 |
|---|---|---|
| `/config/v1.json` | `public, max-age=300` | 300 그대로 ✔ |
| `/content/v1.json` | `public, max-age=300`(3600에서) | 300 ✔ |
| `/content/lex/**` | `public, max-age=31536000, immutable`(새로) | ✔ |
| `/content/motifs/**` | 같음 | ✔ |

B7 보고서는 이 경로들에 따로 권고가 없다(B7은 `/m` 429·503 캐시). 빌드가 네 값을 검사한다. 단, 검사는 `source` 문자열 정확 일치라 겹치는 넓은 규칙(예: `/content/**` 3600)을 나중에 더하면 못 잡는다(낮음, 기록만).

## 5. CI

- `ci.yml`은 `pnpm verify` 하나. static-empty는 `SITE_MODE` 없이(출시 전 모드) 빈 4값으로 돌려 '실패 + 네 문구'만 본다 → W7 때문에 기본 빌드가 실패해도 이 단계는 통과(4값 문제가 먼저 나옴). **CI에는 성공 빌드 CLI 단계가 없다** — 성공 경로는 `build()` 시험(칸을 채운 사본·PRIVACY_OFFICER)이 맡는다.
- 배포 워크플로가 저장소에 없다(README는 'GitHub Environments'라 적음) → 실제 배포 = 오너 로컬 `firebase deploy` predeploy. 그 경로에서 PRIVACY_OFFICER를 넣는 방법을 README에 한 줄 적길 권한다(R9).
- **CI 밖 회귀**: `scripts/web-prelaunch-capture.mjs`가 PRIVACY_OFFICER 없이 `build()`를 불러 이제 BuildError로 멈춘다(실제 CLI 기입 전 실패와 같은 조건). 44행 주석도 옛 '출시 전 개인정보 안내'(R2).

## 6. 시험 품질 — 변이 8개

`scripts/build.mjs` 한 곳씩 바꾸고 `vitest run`(web-static) → 되돌린 뒤 `cmp` 같음. 마지막에 build.mjs·site.mjs 모두 원본과 `cmp` 같음.

| # | 변이 | 결과 |
|---|---|---|
| M1 | PRIVACY_OFFICER 금지 글자에서 `< >` 뺌 | 잡음(W7 주입 시험) |
| M2 | 만료 경계 `<=` → `<` | 잡음(경계 시험) |
| M3 | W7 메모 검사를 출시 모드에서만 | 잡음(2개) |
| M4 | 엄격 조건에서 '공개키가 있으면' 뺌 | 잡음 |
| M5 | 매니페스트 밖 사전 팩 검사 끔 | 잡음 |
| **M6** | **PRIVACY_OFFICER 길이 상한 80 → 800** | **살아남음** — 시험 값 `'x'.repeat(81)`이 길이보다 먼저 `looksPlaceholder`(같은 글자 반복)에 걸린다(R4) |
| M7 | 출시 모드 '공개키 목록 비어 있음' 문제 줄 제거 | 잡음 |
| M8 | `/content/lex/**` 캐시 검사 항목 제거 | 잡음 |

## 지적 목록

| # | 심각도 | 무엇 | 권고 |
|---|---|---|---|
| R1 | 중간 | PRIVACY_OFFICER가 의미상 자리표시자(`미정`·`TBD`·`N/A`·`상호`·`오너 기입`), 보이지 않는 값(제로폭 2자·방향 제어), 전각 괄호(`［상호］`)를 통과시킨다 → 보호책임자 칸이 사실상 빈 채 게시될 수 있다(W7 취지 우회, 개인정보보호법 제30조 기재) | `\p{Cc}`·`\p{Cf}` 금지, `\p{L}` 2자 이상, 거부 목록(미정·TBD·N/A·상호·성명·오너·기입·owner·fill·name), 전각 `［］【】〔〕` 금지. ⑦ 메모 정규식에도 전각 괄호 추가 |
| R2 | 중간 | `scripts/web-prelaunch-capture.mjs`가 이 변경으로 실패(PRIVACY_OFFICER 없음), 44행 주석이 옛 안내 | ENV에 시험 상호 추가 또는 `filledDocs` 사용, 주석 갱신 |
| R3 | 중간(C11 때) | 서명 엄격 검사가 `remote-public-keys.json` 비어 있지 않음에 묶이고, 앱 번들 키와 동치 확인이 없다 | C11 완료 조건에 '두 키 목록 단일 원천 또는 동치 시험' 추가. 그 전까지 README에 '키 든 앱 빌드를 내는 날 이 파일도 채운다'를 체크 항목으로 |
| R4 | 낮음 | 길이 상한 시험이 `looksPlaceholder`에 가려짐(M6 생존) | 서로 다른 글자 81자로 시험 |
| R5 | 낮음 | 출시 모드 실패 문구가 정본 기입 칸에도 'PRIVACY_OFFICER를 넣으라'고 안내하지만 그 값은 테스터판만 채운다. 출시 때 정본 17절 상호는 저장소 md에 써야 해 DECISIONS '값은 저장소에 두지 않음'과 어긋난다 | 문구를 `mode`별로 나누고, 출시 전에 정본 17절도 같은 주입을 쓸지 PM 판정 |
| R6 | 낮음 | `content/motifs/` 고아 파일 미검사(같은 1년 immutable) | lex와 같은 고아 검사 |
| R7 | 낮음 | 값에 마크다운이 적용됨(`*`가 든 상호가 굵게로 바뀜, 자기 도메인 주소는 링크) | 값을 `inline` 전에 넣지 말고 렌더 뒤 이스케이프해 넣거나 `*`·`` ` ``·`https://` 금지 |
| R8 | 낮음 | 영어 테스터판 11절 표 머리가 비어 빈 `<th>` 2개(스크린 리더) | docs/release 담당에 넘김(`Item \| Details`) |
| R9 | 낮음 | README는 GitHub Environments라 하지만 배포 워크플로가 없다 | 실제 경로(오너 로컬 `firebase deploy`)에서 환경 변수 넣는 법 한 줄 |
| R10 | 정보 | 렌더 검사가 속성(`alt`·`title`·`meta`)을 보지 않음 — 지금은 빈틈 없음 | 마크다운에 이미지·링크 제목 문법을 더할 때 속성 값도 검사 |

## 잘된 점

- 값은 저장소에 두지 않고(환경 변수), 오류 문구에 싣지 않으며, `replace(() => officer)`로 `$` 치환 함정을 피했다.
- W7이 '렌더 HTML 기준'이라 md 쪽 문법이 바뀌어도 화면에 남는 `[ ]`는 잡는다. 실제 CLI에서 오너 할 일까지 안내한다.
- 출시 모드 차단(키 없음·unsigned·만료 경계)이 실제 CLI와 시험 양쪽에서 확인된다. 사전 팩 검사는 B4 3절 2 항목을 빠짐없이 덮는다.
- 변이 8개 중 7개를 잡는다.
