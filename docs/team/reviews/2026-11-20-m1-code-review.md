# M1(타고남 + 먹 고르기) 코드 리뷰 — 2026-11-20

- 리뷰어: 독립 코드 리뷰어(작성 참여 안 함). 강도 높음.
- 범위: 미커밋 변경 중 M1 관련만. core `visual/{traits,ink,look}.ts`, `geometry/shape.ts`·shape 인자로 바뀐 `geometry/{attach,comb,eyes,assist}.ts`·`visual/pose.ts`, `sim/{reduce,types}.ts` stroke 부착, `test/{traits,attach-slide}.test.ts` / mobile `screens/{InkSticks,M1Board,GameHome,StrokeScreen,MorningScreen,ui}.tsx`, `game/{look.ts,GameApp.tsx}`, `render/{Mongmangi.tsx,shaders.ts}`, `features.ts`, i18n `ink.*`, `test/m1.test.ts`, `scripts/m1-capture.mjs`. (apps/server·docs/release·content-v1·mentors.md 제외)
- 기준: DECISIONS D-12·D-13 개정·D-20·D-23, C-integrated v1.1(2-1·4-2), art-bible v1.3 금지표, worklet 규칙 테스트.

## 직접 실행 결과

| 명령 | 결과 |
|---|---|
| `pnpm typecheck` | 통과(EXIT 0, apps/server·mobile·core 모두 Done) |
| `cd packages/core && npx vitest run --testTimeout=200000` | 16 파일 / **207 통과** |
| `cd apps/mobile && npx vitest run` | 10 파일 / **84 통과** (worklet-defaults·worklet-order 포함) |
| 리뷰어 임시 탐침(실행 후 삭제) | 아래 ①·② 수치 근거 |

## 결론

치명 없음. 결정성 핵심(씨앗·`seededInk`·저장된 raw/attach)은 지켜졌다. 다만 **'플래그 꺼짐 = 빌드 1과 같음'이 셰이더에서 정확히 성립하지 않고**(높음), **먹 고르기가 첫날 이후·여러 날 세이브에도 열려 전 획을 소급 재색칠**해 C-integrated 2-1·D-05와 어긋난다(높음). 꿈 카드·공유 이미지는 기본형으로 그려져 앱 화면과 다른 몽망이가 나온다(높음, 남은 일로 적혀 있으나 몸 모양까지 포함해야 함).

## 발견

### 높음

**H1. 플래그 꺼짐인데 획 칠 셰이더가 바뀐다 — 빌드 1과 픽셀 동일하지 않음**
`apps/mobile/src/render/shaders.ts:139,154`, `Mongmangi.tsx:370~`
- 셰이더는 플래그와 무관하게 새 식으로 바뀌었다. 기본형 토큰은 정확히 일치한다(탐침: `mixHex(body,bg,0.32)` = `#5F5C56` = `PALETTE.day.strokeInk`, 밤 `#59585A` 일치). 그러나
  - 농담 결 진폭: 옛 식 최종 바탕 비율 = `tone + tone·0.16(n−0.5)`, 새 식 = `tone + (1−tone)·tone·0.16(n−0.5)` → 진폭이 **×0.68(낮 C)/×0.65(밤)**. 주석의 "옛 식과 같은 폭"은 사실이 아니다.
  - 낮↔밤 전환: 옛 식은 몸·바탕·tone을 각각 보간한 뒤 섞음(n에 대해 2차), 새 식은 최종 획 색을 선형 보간 → 전환 중간 프레임 색이 다르다.
  - `clamp(k, -0.1, 1.0)`로 획 색보다 어두워지는 쪽이 새로 열림.
- 영향: 빌드 1 → 빌드 2 업데이트만으로(플래그 꺼짐) 기존 유저 획 결이 옅어진다. D-20 "플래그 꺼짐 = 빌드 1 화면" 약속과 어긋남. 블라인드·캡처 기준 이미지도 흔들림.
- 제안: 결 항을 `tone·0.16·(n−0.5) / (1−tone)`으로 환산해 옛 진폭을 복원하고, 전환은 `ink/paper/tone`을 따로 보간한 옛 경로를 기본형에서 유지(또는 `stroke`를 매 프레임 `mix(ink,paper,tone)`로 계산하고 고른 먹일 때만 토큰으로 대체). 기본형 픽셀 동일 캡처 비교 1건 추가.

**H2. 먹 고르기가 첫날에 한정되지 않고, 고르면 지금까지의 모든 획·고리·밤 몸이 소급해서 바뀐다**
`apps/mobile/src/screens/GameHome.tsx:276`, `i18n/ko.ts:39`·`en.ts:42`, `render/Mongmangi.tsx`(먹 색 = 한 마리 전역 uniform)
- `pickInk`는 `ink.id === null || ink.seeded`이면 **매일** 네 자루를 띄운다. 첫 밤에 씨앗 먹이 정해진 뒤에도 유저가 고를 때까지 평생 계속 뜬다.
- C-integrated 2-1: "**첫날에는** 이미 그은 첫 두름도 고른 먹으로 다시 스민다. 첫 밤까지 벼루를 열지 않으면 씨앗이 고른다. 공방 노트에서 바꾸지 않는다(1.0 직후 '먹 바꾸기'는 새 획에만)". D-05 개정: "먹 바꾸기 … 새 획에만, 몸의 먹(번짐·밤)과 이미 그은 획은 바뀌지 않는다".
- 지금 구현은 2일째 이후 고르기 = 몸 전체·모든 과거 획 재색칠이라 1.0의 '먹 바꾸기' 규칙(새 획만)과 정면으로 다르고, 문구도 "지금까지 그은 획도 이 먹으로 스며요"로 이를 굳힌다.
- D-13 개정의 "빌드 2 먹 고르기는 '바꾸기'"는 **빌드 1에서 첫 밤을 넘긴 기존 세이브**에 대한 이행 규칙으로 읽힌다. 그 경우 한 번은 허용해도, 새 빌드 2 유저의 2일째 이후까지 여는 것은 근거가 없다.
- 제안(결정 필요, 오너/기획): (a) 새 유저는 첫 잠 전에만 열고, (b) 빌드 1 이행 세이브는 빌드 2 첫 실행 하루만 열기(소급 재색칠 허용을 DECISIONS에 명시) 중 택일 → 조건을 `GameHome`에 반영하고 `m1.test.ts`에 '첫 밤 뒤 새 유저에게는 안 뜸' 테스트. 획별 먹을 저장하지 않으므로 '새 획만' 규칙은 지금 세이브로 구현 불가하다는 점도 1.0 전에 결정 필요.

**H3. 꿈 카드·이레 두루마리·공유 이미지가 기본형 몸·기본 먹으로 그려진다(앱 화면과 다른 아이)**
`apps/mobile/src/render/dreamCard/DreamCard.tsx:181~183`(`coreOutline(s,160)`·`combStrands(..)`·`eyeCenters()`·`strokeSpine` 모두 shape 없음), `share/shareCard.ts`
- 플래그를 켜면 홈은 1.15/1.35 체형·빗 모양·먹인데 아침 카드·노트·공유 PNG는 1.25·층진·기본 먹이다. 체형으로 부착된 획(`birthShape: true`)이 기본 몸 위에 다시 놓여 자리도 미세하게 다르다.
- C-integrated 9절 블라인드 '같은 몽망이 찾기'의 자극물이 **카드**다. progress.md '남음'에는 "꿈 카드·두루마리에 **먹** 반영"만 있어 **몸 모양(shape)**이 빠져 있다.
- 제안: `DreamCardInput`에 `look: MongLook`을 더해 core 경로에 shape를 넘기고 먹 토큰을 쓴다. 빌드 2 플래그를 켜기 전 필수로 남은 일 목록 갱신.

### 보통

**M1. 성향 측정(몸과의 거리)이 체형을 무시한다 — 타고남이 결(성향)에 새어 든다**
`packages/core/src/sim/ledger.ts:58`(`coreSdf(p.x,p.y,coreScaleNow)` 기본 핵), 호출 `sim/reduce.ts:291~292`
- 부착은 그 개체 체형으로 하는데 거리 측정은 기본 핵(h = 1/1.25) 기준. 1.15(높음)·1.35(넓음)는 정수리·바닥에서 표면이 기본형과 약 ±0.05W 어긋나, 같은 손이라도 체형마다 '몸과의 거리' 평균이 체계적으로 달라진다 → 결 이름(M3) 분포가 체형과 상관.
- 제안: `measureStroke`에 shape(또는 core)를 넘기고, `applyStroke`에서 `birthShape`일 때 같은 shape 사용. 체형 3종 × 같은 손 획의 측정 차이 테스트.

**M2. 어느 몸으로 부착했는지 세이브에 남지 않는다 — 플래그를 켰다 끄면 저장 attach와 그리는 몸이 어긋난다**
`apps/mobile/src/game/GameApp.tsx:347`(`birthShape: isOn('birthTraits')`), `packages/core/src/sim/types.ts`(Event만, StrokeRecord에는 없음)
- D-12 개정 ① "저장된 attach는 그대로 그린다"는 지켜지지만, 렌더는 늘 '지금 플래그'의 몸으로 그린다. 원격 플래그를 롤백하면 1.15 체형으로 붙은 획(금지 ① 상한 77.8°)이 기본 몸(81.0°)의 금지 자리 안에 놓일 수 있다.
- 탐침: 반대 방향(빌드 1 기본 부착 획 → 1.15/1.35 몸에 그림)은 금지 비율 최대 0.136(≤ 0.15), 최대 돌출 0.124~0.134W로 허용 범위 안 — **빌드 1 세이브를 새 체형에 그리는 것은 안전**하다.
- 제안: 플래그를 '켜면 끄지 않음(one-way)'으로 DECISIONS에 명시하거나, attach에 체형 번호(또는 aspect)를 기록하는 필드를 검토(세이브 형식 변경이므로 D-13 개정 필요).

**M3. Mongmangi가 렌더마다 새 배열을 worklet 클로저로 넘긴다**
`apps/mobile/src/render/Mongmangi.tsx:234~235`(`coreU`·`coreKU`), 그 밖에 `shape`·`inkL`·`strokeDayRgb` 캡처
- deps 없는 `useDerivedValue`는 클로저 값이 바뀌면 다시 만들어지는데, `coreU/coreKU`는 매 렌더 새 배열이라 Mongmangi가 다시 렌더될 때마다(페인트 양자화 `setKey` 포함) SDF 매퍼가 UI 스레드로 재직렬화된다. 기존(모듈 상수)보다 비용이 늘었다. 48칸 M1Board에서 특히 큼.
- 제안: `useMemo(() => [...], [shape])` 또는 `BodyShape`에 미리 만든 `coreU`를 두기. 실기기(S25) 프레임 시간 확인.
- worklet 규칙 자체는 위반 없음: 새 기하 함수는 기본값에 모듈 상수를 쓰지 않고 `pIn ?? CONST` 형태, `coreOf`는 사용처보다 앞(테스트 통과로 확인).

**M4. '다시 스밈'이 연출 없이 즉시 바뀐다**
`apps/mobile/src/game/GameApp.tsx`(onChooseInk), `Mongmangi.tsx`(먹 색은 props 교체)
- 정본(D-13 점열·attach)은 건드리지 않고 색만 파생으로 바꾸므로 **세이브 정본은 안전**하다. 다만 C-integrated "첫 두름도 고른 먹으로 다시 스민다"의 '스밈'은 연출 없이 한 프레임에 바뀐다(번짐 고리·밤 몸까지 동시에). 아트 11절 v1.3과 맞는지 아트 확인 필요. 모션 줄이기면 즉시 교체가 맞다.

### 낮음

- **L1. a11y 라디오 상태**: `InkSticks.tsx:78` `checked: false` 고정. 씨앗 먹이 있는 '바꾸기' 상태에서 지금 먹이 선택됨으로 읽히지 않는다 → `checked: ink === current`. `radiogroup`은 iOS에서 네이티브 대응이 약해 라벨에 "네 개 중 하나" 정도를 넣는 편이 안전.
- **L2. en 힌트에 제스처 서술**: `en.ts:40` "Double-tap to …" — 플랫폼 가이드(VoiceOver/TalkBack)는 힌트에 조작법을 쓰지 않도록 권한다(스위치 제어·키보드 사용자에게 틀림). ko도 "두 번 누르면". 결과만 쓰기 권장: "Picks this ink …".
- **L3. en 먹 이름 가칭**: `Plum-smoke ink`(자연 紫煙)은 자줏빛을 전달하지 못한다. 작가 검수 항목으로 이미 남아 있음(progress) — 확인만.
- **L4. 웹 쿼리 플래그**: `features.ts:44` `decodeURIComponent`가 잘못된 `%`에서 throw → 모듈 로드 시 웹 앱 전체가 죽는다. try/catch. 또한 웹 배포본이 있다면 쿼리로 미출시 기능이 켜지므로 `__DEV__` 한정 검토.
- **L5. 금지 자리 ① 상한 여유**: 1.35 체형 ① 상한 83.9°(탐침), 테스트 상한 85°까지 1.1°뿐. 아트가 끝값을 1.32로 바꾸면 괜찮지만, 빗 수치를 조금만 바꿔도 테스트가 깨질 수 있다는 점을 알고 있을 것.

## 결정성·호환성 점검(요청 ①)

- `mix32`는 `traits.ts`의 타고남 축에만 쓰인다. `sim/pillars.ts`(`fnv1a`·`seededInk`·`birthSeedOf`·`migratedBirthSeed`)는 **변경 없음** → 빌드 1 세이브의 씨앗·씨앗 먹 불변. 골든(`traits.test.ts` ②)과 기존 `save-v2.test.ts` 골든이 함께 고정.
- 타고남은 빌드 1에 렌더된 적이 없으므로(HEAD에 `traitsOf` 없음) `mix32` 도입으로 '바뀌는' 옛 외형은 없다. 플래그를 켜면 체형이 생기는 것은 설계 의도.
- 저장된 획: raw·attach는 그대로, 렌더 때 그 개체 몸 표면에 다시 놓인다(D-12 개정 ①). 빌드 1 기본 부착 획을 세 체형에 그려도 금지·돌출 기준 안(M2 수치).
- 플래그 꺼짐: 기하 경로는 `shape` 미지정 → `CORE`·`FORBIDDEN_ZONES` 그대로, `BASE_SHAPE`도 깊은 비교로 동일(테스트 확인). `reduce`의 `birthShape` 미지정 = 빌드 1 부착. **예외는 H1(셰이더)** 하나.

## 부착 기하(요청 ②)

- 체형별 금지 ① 상한: 1.15 = 77.8°, 1.25 = 81.0°, 1.35 = 83.9°(②는 200~250° 고정). 빗 모양은 금지 자리 불변(D-12 개정 ② 테스트 있음).
- 7일차 기준·서툰 손: 자기 체형 부착 시 최대 돌출 0.122~0.148W(L2 상한 0.33W 안), 금지 비율 ≤ 15%(테스트). 머리 띠 상한(0.12W)은 `attachStroke` 축소 루프가 체형 핵으로 계산하므로 유지.
- '다시 스밈' 정본: 먹은 색 파생값일 뿐 점열·attach를 다시 쓰지 않음 → D-13 유지(M4는 연출 문제).

## 테스트 동어반복(요청 ⑤)

- `traits.test.ts:260` 'sim: birthShape…'는 reduce 결과를 같은 인자의 `attachStroke`로 다시 계산해 비교 — 배선 확인일 뿐 기하 성질을 검증하지 않는다(유지하되 의미 있는 단언은 '그 체형 표면 0.05W 안'으로 보강).
- ② 골든은 구현에서 뽑은 값을 고정하는 회귀 잠금 — 동어반복이지만 의도된 용도(바꾸면 TRAIT_VERSION). 분포 검정(①)은 독립 검증이라 좋다.
- `attach-slide.test.ts:47` '체형 1.25'는 `BASE_SHAPE`와 동일해 '기본 경로'와 중복(실행 시간만 늘어남). 삭제하거나 1.18/1.32 끝값 대안으로 교체 권장.
- `m1.test.ts` 첫 케이스는 `traits.test.ts` ②의 플래그 꺼짐 단언과 중복.
- **빠진 테스트**: H1 기본형 셰이더 동일성, H2 첫 밤 뒤 네 자루 숨김, M1 체형별 측정 편향, 빌드 1 기본 부착 획을 다른 체형에 그렸을 때 금지·돌출(리뷰어 탐침으로만 확인).

## 권장 처리 순서

1. H1(셰이더 진폭·전환 복원) — 플래그 꺼짐 약속, 빌드 2 머지 전.
2. H2 결정(먹 고르기 열리는 기간·소급 범위) → DECISIONS 기록 후 조건 수정.
3. H3 카드·공유에 look 전달 — 블라인드 자극물(12-01) 전.
4. M1·M2·M3, 나머지 낮음.
