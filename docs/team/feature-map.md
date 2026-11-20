# 기능 지도 (OPERATING 7-3, 로드맵 A6)

- 사용자 관점의 기능 목록 = 사람과 에이전트의 공용 어휘. **하루 한 번 실제 앱(웹 또는 실기기)과 맞추고 '확인' 칸을 갱신한다.** 기능을 더하거나 고치는 작업은 이 표의 행도 같이 고친다.
- 열: 기능 / 기둥(D-19 ①자유도 ②자랑 ③감정 교류, — = 기반) / 정본·결정 / 코드 / 시험(`pnpm verify`에 포함) / 플래그(`apps/mobile/src/features.ts`, 기본값) / 증거(캡처 명령 → 산출 폴더) / 확인.
- 경로 줄임: `m/` = `apps/mobile/src/`, `c/` = `packages/core/src/`, `mt/` = `apps/mobile/test/`, `ct/` = `packages/core/test/`, `s/` = `apps/server/src/`, `st/` = `apps/server/test/`. 캡처는 Expo 웹 서버를 띄운 뒤 `node scripts/<이름>.mjs [baseUrl]`.
- 처음 작성 2026-11-20(A6, B0 2240ff2 기준). '확인'은 문서·코드·시험 대조까지 한 날이고, 실제 앱 화면 대조는 아직이다(첫 일일 대조 때 채운다).

## 1. 빌드 1 — 켜져 있는 기능

| 기능 | 기둥 | 정본·결정 | 코드 | 시험 | 플래그 | 증거 | 확인 |
|---|---|---|---|---|---|---|---|
| 인트로·설치(첫 탭 = 설치, 첫 30초) | ③ | D-15, 아트 11절, `docs/app/flow-v1/REPORT.md` | `m/screens/IntroScreen.tsx`, `m/game/GameApp.tsx`(install), `m/game/store.ts` | `mt/store.test.ts`(설치 판정·세이브 손실) | — | `app-flow-capture` → `docs/app/flow-v1/` | 11-20 문서 |
| 획 긋기·몸에 붙기(모양은 손, 자리는 몸) | ① | D-12, D-02, 아트 1-3, 시스템 2.5 | `c/geometry/*`(attach·comb·ribbon·simplify), `c/visual/grammar.ts`, `m/screens/StrokeScreen.tsx`, `m/render/Mongmangi.tsx` | `ct/body`·`attach-slide`·`worklet-defaults`·`worklet-order`, `mt/skia/mongmangi-render` | — | `render03-capture` → `docs/spike/render-03-grammar/` | 11-20 문서 |
| 대체 획 입력(스크린리더·버튼으로 긋기) | ① | D-08, `docs/app/flow-v1/` v1.2 | `c/geometry/assist.ts`, `m/screens/StrokeScreen.tsx`(AssistPanel) | `ct/assist-stroke` | — | `v12-capture`(`?sr=1`) → `docs/app/flow-v1/v1.2/` | 11-20 문서 |
| 낮 동사(쓰다듬기·씻기·먹 갈기·재우기)·처벌 없음 | ③ | D-03, D-07, 시스템 1.1 동사 표 | `c/sim/reduce.ts`·`ledger.ts`, `m/screens/GameHome.tsx`, `m/game/GameApp.tsx` | `ct/sim-loop`·`tick`·`sim-property` | — | `app-flow-capture` | 11-20 문서 |
| 시간·잠·하루 경계·성향 | ③ | D-07, 시스템 3·4절, `docs/design/sim/` | `c/sim/time.ts`·`temperament.ts` | `ct/sim-time`·`sim-temperament`·`sim-property` | — | `docs/design/sim/temperament-7day.mjs` | 11-20 문서 |
| 밤(물 차오름·밤 몸·환경음) | ③ | 아트 5·11절, D-14 | `m/screens/HomeScreen.tsx`·`GameHome.tsx`(night), `m/render/shaders.ts` | `mt/engine.test.ts`(환경음 전환 규칙) | — | `app-flow-capture` | 11-20 문서 |
| 아침 꿈 카드(건져 올리기 → 인화) | ②③ | D-20, D-25, `docs/creative/dream-card-v1/REPORT.md` | `c/visual/dreamCard.ts`, `c/sim/dream.ts`, `m/render/dreamCard/*`, `m/screens/MorningScreen.tsx`·`cardText.tsx` | `ct/dream-card`(해시 스냅숏·자르기 0·과녁 금지), `mt/dream-card-shader`·`text` | — | `dream-card-capture` → `docs/creative/dream-card-v1/cards/`, `v12-capture` | 11-20 문서 |
| 꿈 콘텐츠(빌드 1 = 모티프 10, 옛 규칙) | ②③ | D-25, `docs/design/content-v1/dreams-30days.md` | `c/sim/dream.ts`(`pickCard`), `m/game/text.ts` | `ct/dream-card`(형상 10 구성 서로 다름), `ct/dream-wake`(연결 전 고정 기대값) | — | `dream-card-capture` | 11-20 문서 |
| 공방 노트(설정·앨범·다시 보기·언어·알림 토글) | ② | D-15, 아트 7절 | `m/screens/NoteSheet.tsx`, `m/render/dreamCard/DreamCardThumb.tsx` | `mt/store.test.ts`(메타 설정) | — | `app-flow-capture`, `v12-capture` | 11-20 문서 |
| 공유(꿈 카드 4:5·9:16 PNG, 이레 두루마리 이미지) | ② | D-18 ①, D-20 공유 구체화 | `m/share/shareCard.ts`·`layout.ts`·`native.ts`(웹 `native.web.ts`), `m/screens/cardText.tsx`(ShareBar, 연타 잠금) | `mt/build1.test.ts` | `share` = 켬 | `build1-capture` → `docs/app/build1/` | 11-20 문서 |
| 평점 요청(이레 아침 1회) | — | D-18 ⑤ | `m/game/review.ts`·`reviewPolicy.ts` | `mt/build1.test.ts`(1회 보장) | `review` = 켬 | `build1-capture` | 11-20 문서 |
| 아침 알림(첫 재우기 뒤 사전 문구 → 권한 1회) | ③ | D-15, D-03 | `m/game/notify.ts`(직렬 큐) | 자동 시험 없음(네이티브 모듈) | — | `app-flow-capture`(사전 문구) | 11-20 문서 |
| 세이브 v2(입력 점열 정본·백업·미래 세이브 보호) | — | D-13, D-15, `docs/design/sim-impl-v1.md` | `c/save/envelope.ts`·`slots.ts`, `c/sim/save.ts`, `m/game/store.ts`·`storage.ts` | `ct/save`·`save-v2`·`save-slots`·`sim-save`, `mt/store.test.ts`, `st/save-contract.test.ts` | — | — | 11-20 문서 |
| 효과음·햅틱 v0.1 | ③ | D-14, `docs/sound/sound-v0.md` | `m/audio/*`(engine·soundMap·sound), `tools/sound/` | `mt/engine.test.ts` | 노트의 소리 설정(메타) | — | 11-20 문서 |
| 다국어(ko·en, 조사·ICU, 언어별 원작 시 문구) | — | D-17, D-06 | `m/i18n/*`, `m/game/text.ts` | `mt/i18n`·`i18n-types`·`i18n-static`·`text`, 린트 `mong/no-literal-ui-text` | — | `i18n-capture` → `docs/app/i18n-v1/` | 11-20 문서 |
| 명조 글꼴 서브셋 | — | D-16 | `apps/mobile/assets/fonts/`, `tools/font/subset*.mjs`, `m/ui/type.tsx` | `mt/font-subset.test.ts` | — | `i18n-capture` | 11-20 문서 |
| 접근성 최소선(모션 줄이기·스크린리더 라벨·글자 200%) | — | D-08 | `apps/mobile/index.ts`(reduceMotion), `m/render/clock.ts`(PARAMS.rm) | 린트 `mong/no-literal-ui-text`(접근성 속성) | — | `app-flow-capture --gate-only`(폭 5 × 글자 3) | 11-20 문서 |

## 2. 빌드 2 기능 — 코드는 있고 플래그로 꺼짐

| 기능 | 기둥 | 정본·결정 | 코드 | 시험 | 플래그 | 증거 | 확인 |
|---|---|---|---|---|---|---|---|
| M1 타고남(체형 3·빗 모양 4·번짐 고리) | ① | DECISIONS 'M1 구현 결정', 아트 1-1·4절, C-integrated 2-1 | `c/visual/traits.ts`·`look.ts`·`bodySpec.ts`, `m/game/look.ts` | `ct/traits`(분포·χ²), `mt/m1.test.ts` | `birthTraits` = 끔(`?ff=m1`) | `m1-capture` → `docs/app/m1/` | 11-20 문서 |
| M1 먹 고르기(네 자루, 첫날 뒤 노트 '먹 바꾸기') | ① | 같음 + 팀 결정 H2 | `m/screens/InkSticks.tsx`, `c/visual/ink.ts`, `c/sim/reduce.ts`(chooseInk) | `mt/m1.test.ts`, `ct/body`(칠 셰이더 고정) | `inkChoice` = 끔 | `m1-capture` | 11-20 문서 |
| A7 썸네일 LOD(몸 폭 48pt 이하 보정) + 눈 소실 수정(블러 하한, 플래그 무관) | ② | D-24, 아트 1-5(v1.4), `docs/creative/thumb-identity-v1.md` | `c/visual/lod.ts`, `m/render/Mongmangi.tsx`, `m/render/dreamCard/*` | `ct/lod`, `mt/skia/distinct.test.tsx`(`pnpm verify --heavy`) | `thumbLod` = 끔 | `a7-capture` → `docs/app/a7/`, `scripts/a7-gpu-blur-probe.mjs` | 11-20 문서 |
| 이름 시점 A/B 군(nt) | — | B0 결정, 기획 v2.2(C2) | `m/game/abGroup.ts` | `mt/build1.test.ts` | — (군만 정함, 화면은 C2) | — | 11-20 문서 |
| M2 이름·인장·이름표·가락 | ②③ | D-20, C-integrated 2-2 | 미구현 | — | `naming`·`nameMelody` = 끔 | — | — |
| M3 결 이름·공유 꼬리표 | ② | D-20, C-integrated 2-3 | 미구현 | — | `temperamentLabel` = 끔 | — | — |
| M4 정·손 기억·반김·머뭇거림 | ③ | D-20, 시스템 3.8 | 미구현 | — | `relation`·`hesitation` = 끔 | — | — |
| M5 함께 숨 쉬기(빌드 3) | ③ | D-20 | 미구현 | — | `breathe` = 끔 | — | — |
| C6 꿈 콘텐츠(모티프 25·점적 해금·반복 방지 R1~R5·카드 캡션·처음 꾼 꿈) | ②③ | D-25(C6 줄 2), dreams-30days v1.1 1~3절 | `c/sim/dreamMotifs.ts`·`dream.ts`(`pickNightCard`)·`reduce.ts`(doWake·`nightCtx`), `m/game/text.ts`(`dreamCaption`)·`store.ts`(`nightFields`), `m/screens/MorningScreen.tsx`·`NoteSheet.tsx` | `ct/dream-rules`(정본 시뮬 한 밤씩 대조·200회 표, 문서 2000회 표는 `--heavy`), `ct/dream-wake`(켬→끔 복귀·해금 변이), `ct/dream-card`(제품 plain), `ct/motif-distinct`(64px 틀, C14 전 대상 0 단언), `mt/dream-text` | `dreamContent` = 끔(`?ff=dreamContent`). 새 15개는 형상(C14) 전이라 제품 빌드에서 안 고름 | `dream-card-capture`(개발 빌드 임시 형상) | 11-20 웹(카드) |
| 보름밤(달 위상·번들 모티프, C4 679c4d1 + C6 doWake 연결) | ②③ | D-25 보름 사흘, 로드맵 C4 | `c/moon/*`, `c/sim/dream.ts`, `c/sim/reduce.ts` | `ct/moon-phase`·`moon-motifs`·`moon-night-card`·`dream-wake`, `mt/moon-contract.test.ts` | `moonNight` = 끔(`?ff=moonNight`, 보름 캡션은 이 플래그만으로도). 번들 3은 자리표시 형상·en 장면 초안이라 제품 빌드에서 안 고름 | — (자리표시 형상, C14) | 11-20 문서 |
| C7 이레 두루마리 영상(타임라인·프레임 렌더·인코더 계약, 실패·미등록 = 두루마리 PNG) | ② | DECISIONS 'C7', D-20, B-identity-share 4-2 ③, architecture 3-5-3 | `c/visual/ireScroll.ts`, `m/render/ireVideo/*`, `m/share/ireVideo.ts`(`IreEncoder` 계약), `m/screens/IreFramesBoard.tsx`(개발) | `ct/ire-scroll`, `mt/ire-video`(가짜 인코더 분기·계약), `mt/skia/ire-frames`(1080은 `--heavy`) | `ireVideo` = 끔. 인코더 네이티브 모듈 미구현(C10) — 켜도 이미지판 | `c7-capture` → `docs/app/c7/`(비고: 인코더는 원시 RGBA·차례·동시 2장, 파일명·메타는 앱 고정, 아트 판정 `ART-CHECK.md`) | 11-20 웹 캡처 |

## 3. 서버·정적 배포(B0·B1)

| 기능 | 기둥 | 정본·결정 | 코드 | 시험 | 플래그 | 증거 | 확인 |
|---|---|---|---|---|---|---|---|
| 식별자 없는 집계 핑(앱 → 서버) | — | DECISIONS 'B0 측정 시계', architecture.md v2.1 3-6 | `packages/contract/src/index.ts`, `m/net/ping.ts`·`gate.ts`·`http.ts`·`NetBridge.tsx`, `s/metrics/*` | `mt/net-ping`·`net-gate`, `packages/contract/test/contract.test.ts`, `st/ping.e2e`, server-ci `test:db` | 핑 = 서버 주소 AND 동의(`METRICS_SETTING_CONNECTED = false`라 지금 늘 꺼짐) | server-ci docker 스모크(핑 204) | 11-20 문서 |
| 원격 설정 `config/v1.json`(플래그 우선순위 바이너리 < 원격 < 개발 메뉴) | — | architecture.md 3-7·4-1 | `m/net/remoteConfig.ts`, `apps/web-static/src/config/` | `mt/net-config`, `packages/contract/test/contract.test.ts`, `apps/web-static/test/build.test.mjs` | 로더는 아직 화면에서 읽지 않음(B4) | — | 11-20 문서 |
| `/m/{code}` 임시 정적 페이지·AASA·assetlinks | ② | architecture.md 3-5·3-10, B0 결정 | `apps/web-static/src/*`, `apps/web-static/scripts/build.mjs` | `apps/web-static/test/build.test.mjs`, verify `static-empty`(빈 주입 값이면 실패) | — | — (배포 B6) | 11-20 문서 |
| 서버 골격(헬스·readyz 토큰·로그 가림·IP 신뢰 홉·번들) | — | D-21, architecture.md 6절, `docs/design/server-v1/B0-B1-report.md` | `s/*`(health·common·config·prisma), `apps/server/scripts/check-bundle.mjs` | `st/app.e2e`·`production.e2e`·`log-redaction`·`client-ip`·`env`·`error-filter`, verify `server-bundle`, server-ci DB·docker | — | server-ci OpenAPI 산출물 | 11-20 문서 |
| 맡겨 두기(익명 계정·14세 확인·세이브 리비전·이력 최대 4주·충돌본 30일·되찾기 글귀·삭제 영수증) — 서버만, 앱 연결은 C11·C12 | ③ | D-21·D-23, architecture.md v2.2 3-3·3-4·3-4-1·3-8, DECISIONS 'B2 맡겨 두기 구현 결정' | `s/auth/*`·`s/account/*`·`s/saves/cloud-*`·`s/deletion/*`·`s/cron/*`, `packages/contract/src/index.ts`(B2 절), 마이그레이션 `20261121000000_b2_cloud_save` | `st/cloud.db`(e2e 1~9 + 흔적 0 + PUT 안 기간 겹·웹 삭제 한도·pepper 회전·복원 뒤 재삭제)·`cloud-logs.db`(로그에 토큰·글귀·IP 0)·`auth-jwt`·`cron-auth`·`cloud.e2e`·`cloud-units`, `packages/contract/test/cloud.test.ts`, server-ci `test:db`·docker 스모크(401·404) | config `cloud` = 끔 | — (앱 화면 C12) | 11-20 시험 |
| 웹 `/delete`(앱 없이 지우기: 인장 코드 + 되찾기 글귀) | — | architecture.md 3-8 ②, 처리방침 12절 | `apps/web-static/src/delete/index.html`, `apps/web-static/scripts/build.mjs`(`deleteScript`·`API_ORIGIN`) | `apps/web-static/test/build.test.mjs`(connect-src 한 출처·fetch 대상·처리방침 링크), verify `static-empty`(API_ORIGIN 빈 값 실패) | — | — (배포 B6) | 11-20 시험 |
| 이름 숫자 규칙(7개 이상 연속 거부) | ② | architecture.md 3-5-2 | `c/sim/pillars.ts` `normalizeName` | `ct/name-rules`(구분자·전각 숫자 우회 막음, 하위 호환: 옛 이름 세이브는 열림) | — | — | 11-20 시험 |
| 세이브 검사 엔드포인트(개발 전용, 운영 404) | — | D-13, architecture.md | `s/saves/*` | `st/save-contract`, `st/production.e2e`(운영 404) | `NODE_ENV` | — | 11-20 문서 |
| B3 공유 링크·웹 뷰어(`/m/{code}` HTML·업로드 commit 검사·링크 끄기·이름 공개·CDN 무효화·삭제 연쇄 ①②④) | ② | DECISIONS 'B3 구현 결정', architecture 3-5·3-5-1~3-5-3·3-9, A-3 #37~#52 | `s/pages/*`·`s/storage/*`·`s/cdn/cdn-purge.ts`, `c/snap/publicSnapshot.ts`, `apps/web-static/live/live.ts`·`scripts/build.mjs` | `st/m-html`·`media-check`·`local-store`, `st/b3.db`(test:db), `ct/public-snapshot`, web-static `build.test` | 서버 스위치 `link`·`webLive` = 끔(config/v1.json), `STORAGE_DRIVER=none`(운영) | `pnpm --filter server build && DATABASE_URL=… node scripts/b3-capture.mjs` → `docs/app/b3/`(한·영·사라진 링크·webLive, `metrics.json` FCP·LCP·번들 크기) | 11-20 웹(캡처) |

## 4. 일일 대조 방법

1. `pnpm verify` 통과(시험 열이 살아 있는지).
2. Expo 웹(`pnpm web`)에서 1절 행을 위에서부터 한 번씩 거친다. 플래그 기능은 `?ff=<키>`로 켠다(개발 빌드만).
3. 어긋나면 행을 고치고(코드가 옮겨졌으면 경로, 시험이 없어졌으면 시험 열) '확인'을 날짜 + `웹`/`S25`로 바꾼다.
4. 후속: 캡처 명령을 `pnpm verify:screen <기능>` 하나로 모으면 '증거' 열을 그 명령으로 바꾼다(mentors.md 적용안 3).
