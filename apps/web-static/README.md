# apps/web-static — mongmang.ink 정적 사이트

Firebase Hosting 공개 폴더 원본. `node scripts/build.mjs`가 `src/` → `public/`을 만들고 배포 전 검사를 한다.
`firebase.json` predeploy가 이 스크립트를 부르므로 **빌드가 실패하면 `firebase deploy`가 멈추고, 이미 나가 있는 판이 그대로 남는다**(반쯤 만든 판은 나가지 않음).

## 배포 환경 변수(저장소에 두지 않음 — GitHub Environments)

| 이름 | 필수 | 무엇 |
|---|---|---|
| `APPLE_TEAM_ID`·`ANDROID_CERT_SHA256`·`APP_STORE_ID`·`API_ORIGIN` | 예 | 딥링크·스토어·/delete. 비면 실패(`pnpm verify` static-empty가 이 실패를 확인) |
| `PRIVACY_OFFICER` | 사실상 예(아래) | 보호책임자 칸: 테스터판 11절 '성명(또는 상호)', 출시 모드는 정본 17절 표의 보호책임자 행만(PM 11-25 R5). 오너 11-25 결정 = **상호**. 정본의 운영자 실명·전화 칸은 채우지 않는다 |
| `SITE_MODE` | 아니요 | `prelaunch`(기본) / `launch` |

## `/privacy` 두 모드

- **출시 전 모드(기본)**: 빌드 2 테스터판 방침 `docs/release/privacy-policy-tester.{ko,en}.md`를 렌더(README W1).
- **출시 모드**(`SITE_MODE=launch`): 처리방침 정본 `docs/release/privacy-policy.{ko,en}.md`('게시 전 삭제' 상자 제외).
- 두 모드 모두 렌더 HTML의 보이는 글자에 `[ … ]` 꼴, 작업 메모(초안·확인 필요·법률 검토·draft·To verify 등), 체크리스트 행(`K\d+`·`U\d+`·`A\d+`)이 하나라도 있으면 **빌드 실패**(W3·W4·W7).

### 보호책임자 칸 때문에 지금은 배포가 막힌다(W7)

- 테스터판 정본에는 `[성명 또는 상호 — 오너 기입]`·`[Name or business name — owner to fill]` 칸이 남아 있다. 그래서 **2026-11-25 기준 출시 전 모드 빌드도 실패하는 것이 정상**이다.
- **오너가 상호를 채우기 전에는 mongmang.ink에 어떤 배포도 나가지 않는다**(첫 화면·/delete·config 포함 — 빌드가 사이트 전체 단위라서). 지금은 첫 배포(B6) 전이라 막히는 실제 배포는 없다. 막힘이 실제로 걸리는 시점 = **B6 첫 배포**, 늦어도 테스터판 게시 마감 **12-15**(Play Console 방침 URL 입력 W6은 12-19 제출 전).
- 푸는 방법(둘 중 하나):
  1. 배포 환경에 `PRIVACY_OFFICER=<상호>`를 넣는다 — 저장소의 md는 그대로 두고 빌드가 그 칸만 채운다(DECISIONS PM 11-25 '값은 저장소에 넣지 않음'과 맞음). 값은 정규화(앞뒤 공백·제로폭·방향 제어 문자 제거)한 뒤 검사한다: 의미 있는 글자 2자 이상·80자 이하, 괄호류(`[ ]`·`［ ］`·`【 】`·`〔 〕` 등, 둥근 괄호는 허용)·`| < >`·자리표시자 낱말(미정·TBD·N/A·상호·성명·오너 기입·owner·to fill 등) 금지.
     지금 배포 워크플로는 저장소에 없다 — 오너 로컬에서 `PRIVACY_OFFICER='상호' APPLE_TEAM_ID=… firebase deploy --only hosting`처럼 같은 셸에 넣으면 predeploy 빌드가 받는다.
  2. 방침 md의 칸을 직접 채운다(출시·정책 담당이 docs/release를 고칠 때).
- 시험은 '칸을 채운 사본'(`test/helpers.mjs` `filledDocs`)과 `PRIVACY_OFFICER`로 성공 경로를, 지금 정본으로 실패 경로를 본다. 정본이 채워지면 `site.test.mjs`의 'W7 … 지금 정본' 시험을 지운다.

## 원격 문서 서명·캐시(B4 후속)

- `firebase.json` OTA(B6b, V21): `/api/v1/ota/**` → Cloud Run `mong-api`(서울) rewrite. `ota.mongmang.ink`는 같은 사이트의 사용자 도메인이다. OTA 응답의 Cache-Control은 서버가 정하므로(매니페스트 `private, max-age=0`·에셋 immutable·오류 no-store, `docs/design/server-v1/ota-self-host.md` 3절) **OTA 경로에 닿는 헤더 규칙(`**` 포함)에 Cache-Control을 두면 빌드가 실패**한다. 앞선 rewrite·redirect(redirects는 rewrites보다 먼저 적용)가 OTA 경로를 가로채거나 정적 `public/api`가 생겨도 실패. 판정 표본은 매니페스트·에셋 경로 둘이고, `source` glob(확장 glob·중괄호·`:마디` 포함)과 `regex` 키를 모두 해석한다 — 해석 못 하면 빌드 실패. Hosting → Cloud Run은 60초 요청 제한이 있다(`ota-self-host.md` 10-1, 체크리스트 T5b). 첫날 실측은 `docs/ops/b6-day1-checklist.md` T5.
- `firebase.json` 캐시: `/config/v1.json`·`/content/v1.json` `public, max-age=300`, `/content/lex/**`·`/content/motifs/**` `public, max-age=31536000, immutable`(빌드가 값까지 검사).
- 공개키 자리: `remote-public-keys.json`의 `keys`(앱 번들 공개키 목록과 같은 `{kid, n, e}` — C11). 지금은 비어 있다.
- 앱 번들 키 대조 자리: `apps/mobile/src/net/remote-public-keys.json`(C11이 만든다)이 있으면 두 목록의 kid·n·e가 같아야 통과. 없으면 대조를 건너뛰고, 이쪽에만 키가 있으면 경고.
- [ ] **키가 든 앱 빌드를 내는 날 `remote-public-keys.json`도 같은 키로 채운다**(비어 있으면 출시 전 모드는 서명 없는 config를 경고만 내고 배포한다 — 리뷰 R3).
- **엄격 검사(실패)** = 출시 모드이거나 `keys`가 하나라도 있을 때: `config/v1.json`·`content/v1.json`이 `verifyRemoteDocStrict` ok(서명·kid·만료·30일 상한)이고 `expiresAt`까지 **7일 넘게** 남아야 한다. 서명은 `remote-cli sign --prev <지난 배포본>`(apps/server, 오너 오프라인 키), 주 1회 다시 서명.
- **느슨(경고만)** = 키가 없는 출시 전 모드(지금): 서명이 없으면 경고.
- 사전 팩: 매니페스트 `lex` 항목마다 파일 존재·바이트·sha256·이름의 해시 8자·`lexPackHeaderSchema`·`lexPackMatchesEntry`. 매니페스트에 없는 `content/lex`·`content/motifs` 파일은 실패(immutable 1년 캐시).
- 캡처 스크립트 `scripts/web-prelaunch-capture.mjs`는 캡처용 `PRIVACY_OFFICER`를 넣어 빌드한다. `--build-only` 회귀는 `test/capture.test.mjs`가 본다.
- 아직 안 한 것: 직전 배포 매니페스트와의 사전 팩 (언어, 판) 불변 대조(`lexImmutableViolations`, B4 3절 4), `src/config/v1.json`의 `escape` 명시(3절 5).
