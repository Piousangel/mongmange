# 라이선스 원장

- 담당: 출시·정책(기록은 만든 사람이 직접). 새 외부 에셋·AI 생성물·글꼴·소리·코드 의존성을 들이면 **같은 커밋에** 한 줄을 추가한다.
- **오너 결정 11-25 (아래 옛 원칙을 바꿈)**: Gemini 생성 이미지는 **앱 에셋으로 쓸 수 있다.** 조건: ① 팀이 손질(투명 배경·먹 농도·종이결·형태 언어 맞춤)한 것만, ② 작성자≠아트 리뷰어 블라인드 판정 통과분만, ③ 이 장부에 모델·프롬프트 요약·날짜·손질 내용·`출시 사용: 앱` 기록, ④ 출시 전 Gemini API 약관(생성물 권리·상업 이용) 재확인(owner-todo), ⑤ 스토어 등록 시 AI 생성 콘텐츠 고지 여부 확인, ⑥ **스토어 스크린샷은 실제 앱 화면만**(D-04 그대로), 마케팅 이미지에는 넣지 않음. 기존 Figma 생성물(gpt-image)은 여전히 탐색 전용.
- 옛 원칙(OPERATING 0-1, 11-19): AI 생성물은 **탐색·레퍼런스 전용**이다. 출시 빌드·스토어 스크린샷·마케팅에는 넣지 않고, 팀이 정한 형태 언어로 벡터·셰이더로 다시 만든다. 스토어 스크린샷은 실제 렌더만 쓴다(D-04).
- 생성물 권리는 각 도구 약관을 따른다. **출시 전 Figma AI 약관(generate_image가 부르는 모델 포함)을 다시 확인한다** — 할 일 1번.
- 처음 작성: 2026-11-19, PM(리뷰 사소 '라이선스 원장 위치' 해소). 아래 AI 이미지 기록은 각 문서의 도구 기록을 옮긴 것이다.

## 1. AI 생성 이미지 (탐색 전용, 출시물 사용 금지)

| 파일 | 도구 · 모델 | Figma 파일 / 노드 | 날짜 | 용도 | 출시 사용 |
|---|---|---|---|---|---|
| `docs/creative/img/A1-buncheong-creature.png` | Figma MCP `generate_image` · gpt-image-2.5-flare | `oqp3yw0MyoLELOia12O3db` 1:2 | 11-19 | 디렉션 A 시안 | 금지 |
| `docs/creative/img/A2-buncheong-home.png` | 같음 | 같은 파일 1:3 | 11-19 | A 홈 목업 | 금지 |
| `docs/creative/img/A3-buncheong-variants.png` | 같음 | 같은 파일 1:8 | 11-19 | A 변형 | 금지 |
| `docs/creative/img/B1-thread-creature.png` | 같음 | 같은 파일 1:4 | 11-19 | 디렉션 B 시안 | 금지 |
| `docs/creative/img/B2-thread-home.png` | 같음 | 같은 파일 1:5 | 11-19 | B 홈 목업 | 금지 |
| `docs/creative/img/C1-ink-creature.png` | 같음 | 같은 파일 1:6 | 11-19 | 디렉션 C 시안 | 금지 |
| `docs/creative/img/C2-ink-home.png` | 같음 | 같은 파일 1:7 | 11-19 | C 홈 목업 | 금지 |
| `docs/creative/rival/img/*.png` 10장(A1-day0-day30, A1-…-v1-rejected, A2-home, A3-variants, A4-in-engine, B1-day0-day30, B2-home, B3-variants, B4-in-engine, B1-…-gemini) | Figma MCP `generate_image` · gpt-image-2.5-flare, `B1-day0-day30-gemini.png`만 gemini-3.1-flash-image | `rLODpdydp9cdDRLPRZIceN` 1:2~1:11 | 11-19 | 경쟁 디렉션 시안 | 금지 |
| `docs/creative/v1/img/*.png` 17장(01a~06c) | Figma MCP `generate_image` · gpt-image-2.5-flare 16장, `01b-day0-expressions-gemini.png`만 gemini-3.1-flash-image | `AIt2sfjDp4IHeRLcswb3mJ` 1:2~1:18 | 11-19 | 아트 바이블 v1 탐색 | 금지 |
| `docs/creative/c14b-ref/*.jpg` 10장(letter-1~3, palm-1~3, window-1~3, kite-1 — 원본 PNG를 640px JPG로 줄임) | Figma MCP `generate_image` · gemini-3.1-flash-image | `iSFrS9WX2yICuXVJbctIHN` 1:2~1:11 | 11-25 | C14b 꿈 모티프 3차 수묵·마블링 레퍼런스(참고용, **앱 번들 금지** — 붓맛은 셰이더·경로로 다시 만든다) | 금지 |
| `docs/creative/c14b-ref/<모티프>-f1~f4.jpg`·`-p1~p2.jpg` 42장(letter·palm·window·kite·boat·umbrella·path 각 6, 640px JPG) | Gemini API 직접(`scripts/gemini-ref.mjs`, 키 = env `GEMINI_API_KEY`) · f = gemini-3.1-flash-image, p = gemini-3-pro-image | — | 11-25 | C14b 3차 수묵·마블링 레퍼런스(참고용, **앱 번들 금지**). 고른 안은 `docs/app/c14b/compare-ref.png` ★ | 금지 |
| `docs/creative/meal-ref/{clear-ink,pine-pollen-ink,dew-ink}-f1~f3.jpg` 9장 | Gemini API 직접(`scripts/gemini-meal-ref.mjs`) · gemini-3.1-flash-image | — (프롬프트 원문 `docs/creative/meal-ref/prompts.json`) | 11-25 | V30 선행 밥 3종 아이콘 탐색 | **탐색 — 앱 사용 전 손질·리뷰 필요** |
| `docs/creative/meal-ref/{clear-ink,pine-pollen-ink,dew-ink}-p1.jpg` 3장 | 같음 · gemini-3-pro-image | 같음 | 11-25 | 같음 | 탐색 — 앱 사용 전 손질·리뷰 필요 |
| `docs/creative/meal-ref/{patterned-chip,ink-ribbon,dewdrop}-f1~f3.jpg` 9장 | 같음 · gemini-3.1-flash-image | 같음 | 11-25 | V30 선행 간식 3종 아이콘 탐색 | 탐색 — 앱 사용 전 손질·리뷰 필요 |
| `docs/creative/meal-ref/{patterned-chip,ink-ribbon,dewdrop}-p1.jpg` 3장 | 같음 · gemini-3-pro-image | 같음 | 11-25 | 같음 | 탐색 — 앱 사용 전 손질·리뷰 필요 |
| `docs/creative/meal-ref/{inkstone-empty,inkstone-spoon,inkstone-clear}-f1~f3.jpg` 9장 | 같음 · gemini-3.1-flash-image | 같음 | 11-25 | V30 선행 벼루 연지 상태 3종 탐색(V12b 굽기 목표 이미지) | 탐색 — 앱 사용 전 손질·리뷰 필요 |
| `docs/creative/meal-ref/{inkstone-empty,inkstone-spoon,inkstone-clear}-p1.jpg` 3장 | 같음 · gemini-3-pro-image | 같음 | 11-25 | 같음 | 탐색 — 앱 사용 전 손질·리뷰 필요 |
| `docs/creative/meal-ref/sheet.png` | 팀 작성 코드(`scripts/meal-ref-sheet.mjs`)가 위 생성물을 배치·축소·알파 손질 1차 | — | 11-25 | 고른 안 비교 시트(64·128pt·다크) | 탐색 |

- 확인 필요: rival 문서 머리말은 "9장 중 8장 gpt, 1장 gemini"라고 적었는데 파일은 10장·노드 10개다. `A4-in-engine`·`B4-in-engine`이 생성 이미지인지 코드 렌더인지 작성자(경쟁 디렉터)가 이 표를 고친다. 그전까지는 생성 이미지로 취급한다.
- Figma 에셋 URL은 7일 뒤 만료된다. 로컬 사본이 원본이다. 프롬프트 원문은 각 Figma 노드 생성 기록에 있다.
- 밥·간식 36장(11-25): Gemini 2K(2048px) 출력을 1536px JPG(품질 90)로 줄인 사본이다. 앱에 쓰려면 머리말 오너 결정 11-25 조건 ①~⑥을 거쳐 1-1 같은 손질본 행(`출시 사용: 앱`, 손질 내용 포함)을 새로 만든다. 판정은 `docs/creative/meal-ref/README.md`.
- 합계: AI 생성 이미지 161장(7 + 10 + 17 + 10 + 42 + 18 + 21 + 밥·간식 36), 출시물 사용 12장(1-1 표, 손질본·블라인드 판정 조건). C14b 레퍼런스 처음 10장은 Figma AI로 만들다 크레딧 한도(11-25)에 걸려, 나머지는 Gemini API로 직접 만들었다. **Gemini API 생성물 약관도 출시 전 할 일 1번에 함께 확인한다.**

## 1-1. 앱 에셋으로 쓰는 AI 생성물(손질본) — C14b 4차 혼합안

- 근거: 위 머리말의 오너 11-25 결정(조건 ①~⑥)과 PM 혼합안(C). 4차 아트 리뷰는 **조건부**(편지·창가 손·우산 수정 + 블라인드 판정) — 그 둘이 끝나기 전에는 출시 빌드에 켜지 않는다(`dreamContent` 꺼짐). 블라인드 시트 `docs/app/c14b/blind/sheet-25.png`(정답표는 리뷰어에게 주지 않음).
- **운영 노출 범위(코드 리뷰 H1 반영, 6차)**: 아래 12장(8차)은 **판 1 카드(꿈 콘텐츠 `dreamContent`가 켜진 밤에 받은 카드)**에만 그려진다. 플래그가 꺼진 카드(판 번호 없음 = 판 0)는 빌드 1의 10개 그림이 main과 바이트 같게 그대로다(창가 손 래스터 포함 AI 생성물 0 — 시험 고정). 그래서 조건부 아트 리뷰·블라인드 판정 전까지 운영 화면·공유 이미지에 AI 생성물이 나가지 않는다.
- 판(artRev): 에셋은 `apps/mobile/assets/motifs/r<판>/`에 둔다. 그림을 바꾸면 판을 올리고 이전 판 폴더는 지우지 않는다(이미 받은 카드가 그 판으로 그려진다 — 시험 고정). 아래 표는 1판.
- 공통 손질(`scripts/motif-raster.mjs`, 재현 가능): 원본(2048px PNG → 저장소 1536px JPG q92)에서 한지 배경 제거(테두리 중앙값 = 종이, 가장 짙은 0.5% = 먹) → 밝기를 알파로(먹 한 색, 검정 + 알파) → 알파 0.06 아래 0(종이 결·얼룩 지움), 중간 농담 감마 0.8 → 최대 농도 0.72 → 사물 경계로 자르기(여백 3%, 멀리 떨어진 티끌 버림) → 긴 변 448px WebP(알파 — 8차에 640 → 448). 7차: 종이배 밑은 직선으로 자르지 않고 아래 22%에서 번지듯 사라지게, 창가 손은 감마 0.6(밤 판에서 손이 서게), 손바닥은 palm-o1을 앱에서 상자에 맞춰 납작하게(초승달 → 얕은 그릇). 5차: 가림 마스크(사물 실루엣, 속 채움) `.mask.webp`를 함께 뽑고(앱이 종이 토큰 × 가림 농도로 사물 밑에 깐다), 편지는 −28° 돌려 덜 기울이고, 종이배는 밑 25%(장식 물결)를 지운다. 색·종이 결은 앱이 그릴 때 입힌다(테마 토큰, 공통 FractalNoise). 번들 예산: 먹 장당 200KB·가림 장당 24KB·판당 760KB·모든 판 2MB(시험 고정).
- 공통 프롬프트 요약: '한지 위 먹 사물 하나만, 젖은 테·과립·비백, 마블링·배경·글자·인물·생물 없음, 정사각'. 모델 gemini-3-pro-image(Gemini API 직접, 2K), 날짜 11-25. 원본 18장(장마다 3안) = `docs/creative/c14b-ref/<모티프>-o1~o3.jpg`.

| 앱 에셋 | 원본(고른 안) | 프롬프트 요약 | 손질 | 출시 사용 |
|---|---|---|---|---|
| `apps/mobile/assets/motifs/r1/near-with.letter.webp` | `letter-o2.jpg` | 비스듬한 한지 한 장, 한 모서리 접힘(농담·두께), 봉투·글자 없음 | 공통 | 앱 |
| `apps/mobile/assets/motifs/r1/far-alone.kite.webp` | `kite-o3.jpg` | 가오리연, 위 꼭짓점 먹 고임, 댓살 자국, 꼬리 두 가닥, 구멍·줄 없음 | 공통 | 앱 |
| `apps/mobile/assets/motifs/r1/near-with.umbrella.webp` | `umbrella-o1.jpg` | 옆에서 본 지우산, 살 끝 물결 가장자리 고임 + 먹 줄기, 막대가 덮개 위로 안 솟음 | 공통 | 앱 |
| `apps/mobile/assets/motifs/r1/far-alone.paper-boat.webp` | `boat-o1.jpg` | 종이배(밝은 돛·짙은 몸통 농담), 배 밑 짧은 물살 | 공통 | 앱 |
| `apps/mobile/assets/motifs/r1/near-with.palm.webp` | `palm-o1.jpg`(6차에 o3 → o1) | 오목한 손바닥 그림자 = 넓은 붓 한 번 U자, 바닥 먹 고임, 손가락 갈래 없음 | 공통 | 앱 |
| `apps/mobile/assets/motifs/r1/near-with.window-hand.webp` | `windowsill-o1.jpg`(8차에 `window-o3` → 교체) | 창호지 너머 등불 빛 + 굵기 다른 창살 + 창턱 한 면, **손·손자국·사람 그림자 없음**(3차 블라인드 안전 — 손자국 창이 공포). 고른 이유: 세 안 중 실루엣(창 + 창턱)이 가장 또렷하고 테두리 얼룩이 없다 | 공통(감마 0.8) | 앱 |
| `apps/mobile/assets/motifs/r1/near-alone.quilt.webp` | `quilt-o1.jpg` | 옆에서 본 접힌 이불, 담묵 면 + 성긴 땀, 접힌 곳 젖은 테. 이유: 납작하게 누워 몽망이 아랫몸을 덮어도 눈이 남는다(o2·o3는 높게 말려 눈을 가림) | 공통 | 앱 |
| `apps/mobile/assets/motifs/r1/near-alone.teacup.webp` | `teacup-o1.jpg` | 찻사발 옆모습, 아래 가장자리 먹 고임, 입술은 종이 여백, 김 한 획. 이유: 사발이 넓어 몸이 들어앉고 굽 고임이 또렷 | 공통 | 앱 |
| `apps/mobile/assets/motifs/r1/near-with.teacup-two.webp` | `teacuptwo-o2.jpg` | 크기 다른 두 사발(앞·아래 큰 잔, 뒤·위 작은 잔), 두 김이 감김. 이유: 앞 잔이 커서 몽망이 잔·뒤 잔이 곁 잔으로 자리가 맞다(o1·o3는 뒤 잔이 큼) — 64px에서 '찻잔 하나'와 갈림 | 공통 | 앱 |
| `apps/mobile/assets/motifs/r1/near-alone.inkstone.webp` | `inkstone-o2.jpg` | 비스듬히 본 긴 직사각 벼루, 한쪽 끝 연지 홈에 고인 먹, 먹 한 자루. 이유: 직사각 실루엣·연지가 가장 또렷하고 판이 옅어 몽망이와 다투지 않음(o3는 연지가 커서 검은 덩어리) | 공통 | 앱 |
| `apps/mobile/assets/motifs/r1/far-with.stepping-stones.webp` | `stones-o3.jpg` | 모난 판돌 다섯이 지그재그로 멀어짐, 물에 닿는 아랫선이 짙음. 이유: 타원이 아니어서 입술 연상(3차 블라인드 안전)이 없고 앞 돌이 커서 몽망이가 설 자리 — o2는 종이 바탕이 누렇게 번짐 | 공통 | 앱 |
| `apps/mobile/assets/motifs/r1/near-alone.washing-line.webp` | `washingline-o3.jpg` | 비백 줄 하나에 걸린 한지 한 장, 윗변이 줄 처짐을 따르고 아랫변 찢긴 결. 이유: 한지가 가장 밝고 비쳐 젖은 천·얼룩으로 무겁지 않음(3차 블라인드 6번 지적, o1은 테가 짙음) | 공통 | 앱 |

- 안 고른 원본 12장(`-o1~o3` 중 나머지)은 탐색 전용(출시 사용 금지).
- **8차 추가(11-25, 오너 Gemini 충전 → 열린 판 1에 바로 — 판 1은 운영에서 켠 적 없음)**: gemini-3-pro-image 2K(Gemini API 직접, `scripts/gemini-ref.mjs --set object`), 장마다 3안·재시도 0 — `quilt`·`teacup`·`teacuptwo`·`inkstone`·`stones`·`washingline`·`windowsill` 각 `-o1~o3` 21장(원본 PNG 2048px → 저장소 1536px JPG q92). 고른 7장은 위 표, 나머지 14장은 탐색 전용(출시 사용 금지). 옛 창(`window-o3`)은 앱에서 빠져 탐색 전용으로 돌아간다(원본은 남김). 출시 사용 앱 에셋 = **12장**. 손질 변경: 12장이 되어 긴 변 640 → 448px(판 1 합계 633KB, 예산 760KB 안 — 기존 5장도 같은 손질로 다시 뽑음), 창 감마 0.6 → 0.8.
- **⑤ 스토어 AI 생성 콘텐츠 고지 — 확인 필요**: 위 12장(꿈 카드 12모티프의 사물 한 겹)이 AI 생성물을 손질한 앱 에셋이다. App Store·Google Play의 AI 생성 콘텐츠 고지 항목에 해당하는지, 고지 문구 범위를 출시 전에 정한다(PM·출시 담당).
- **⑥ 스토어·마케팅 규칙**: 스토어 스크린샷·미리보기 영상·마케팅의 아침 카드는 **코드로만 그린 카드(판 0의 빌드 1 10장, 판 1의 장형 카드)**로 고른다 — 위 12모티프 카드는 쓰지 않는다(오너 조건 ⑥, 아트 7-5 홍보 주연 ③과 함께 적용). 최종은 PM·오너 확인.

## 2. 팀이 만든 것 (AI 생성 아님)

| 파일 | 만든 방법 | 비고 |
|---|---|---|
| `docs/creative/img/A4-pinch-rig-code.png`, `docs/creative/proto/pinch-rig.*` | 팀 작성 코드 → SVG → Chrome headless 캡처 | 팀 저작 |
| `docs/spike/render-01/*.png·*.jpg·video/*` | 스파이크 01 실제 렌더 캡처(Playwright) | 팀 저작 |
| `apps/mobile/assets/*`(아이콘·스플래시) | `create-expo-app` 템플릿 기본 에셋 | **교체 필요**(템플릿 아이콘·배경 #E6F4FE). 출시 전 팀 아이콘으로 |

## 3. 글꼴 (출시 번들 후보, 아트 6절)

| 글꼴 | 라이선스 | 상태 |
|---|---|---|
| **Gowun Batang** 400 (명조, 본문·제목·시 한 줄) | SIL OFL 1.1 | **번들(11-20 앱 흐름 v1.1)**. 출처 npm `@expo-google-fonts/gowun-batang@0.4.1`의 `400Regular/GowunBatang_400Regular.ttf`(8.4MB, Google Fonts 배포본). 원문 `node_modules/@expo-google-fonts/gowun-batang/LICENSE_FONT`. **11-20 v1.2 서브셋**: 앱 번들은 `apps/mobile/assets/fonts/GowunBatang_400Regular.subset.ttf`(1,430,408B ≈ 1.4MB, 원본 8,433,188B의 17%) — 앱 소스 글자 + KS X 1001 완성형 한글 2,350자 + ASCII·Latin-1·문장부호·호환 자모, 총 2,698자(목록 `.subset.chars.txt`, 누락 검사 `apps/mobile/test/font-subset.test.ts`). 도구 `tools/font/subset.mjs`(npm `subset-font@2.9.0` BSD-3-Clause, harfbuzzjs wasm, devDependency). **OFL 확인**: 저작권 줄에 Reserved Font Name 선언이 없어(“Copyright 2021 The Gowun Batang Project Authors”만) 수정본도 원래 글꼴 이름을 쓸 수 있다(OFL 3항 제한 없음) → name 테이블·저작권 문자열 그대로 유지, 파일명도 원래 이름 + `.subset`. OFL 원문을 `assets/fonts/OFL-GowunBatang.txt`로 함께 둔다(OFL 2항). 원본 패키지는 devDependency로 옮김(서브셋 원본) |
| **Pretendard** Regular (UI 고딕) | SIL OFL 1.1 | **번들(11-20)**. 출처 npm `pretendard@1.3.9`의 `dist/public/static/Pretendard-Regular.otf`(1.6MB). 원문은 패키지 `LICENSE` |
| 본명조(Noto Serif KR) | SIL OFL 1.1 | 후보(Gowun Batang으로 대체, 미번들) |
| **Cormorant Garamond** 500 Medium · 500 Medium Italic (영어 명조: 제목 · 시 한 줄) | SIL OFL 1.1 | **번들(11-20 i18n v1, D-17)**. 출처 npm `@expo-google-fonts/cormorant-garamond@0.4.1`(devDependency, 서브셋 원본)의 `500Medium/…_500Medium.ttf`(666,868B)·`500Medium_Italic/…_500Medium_Italic.ttf`(407,796B). 앱 번들은 라틴 서브셋 `apps/mobile/assets/fonts/CormorantGaramond_500Medium.subset.ttf`(149,004B)·`…_500Medium_Italic.subset.ttf`(100,792B) — ASCII·Latin-1·문장부호 + 영어 문구 파일 글자, 206자(목록 `CormorantGaramond.subset.chars.txt`, 누락 검사 `font-subset.test.ts`). 도구 `tools/font/subset-latin.mjs`(subset-font, 네이티브 의존성 없음 — expo-font로 실음). **OFL 확인**: 저작권 줄 “Copyright 2015 the Cormorant Project Authors”에 Reserved Font Name 선언 없음 → 원래 이름 유지. 원문 `assets/fonts/OFL-CormorantGaramond.txt`. 굵기는 아트 6절(제목 Medium, 시 Italic)에 맞추되 Italic도 Medium을 골랐다(400 Italic은 폰 15pt에서 획이 가늘어 한지 위 대비 부족) |

번들할 때 OFL 원문을 앱 '오픈소스 라이선스' 화면과 저장소에 함께 넣는다.

## 4. 소리
- 원칙(04-art-sound): CC0(Kenney, ChipTone 생성음, Freesound CC0 필터)만, CC-BY-NC 금지, AI 음악 금지. 몽망이 허밍은 사람 녹음(외주면 계약서에 권리 양도 명시).

| 파일 | 만든 방법 | 외부 소스 | 날짜 | 출시 사용 |
|---|---|---|---|---|
| `apps/mobile/assets/sounds/*.wav` 15개(효과음 v0.1, 목록 `docs/sound/sound-v0.md`) | **자체 합성**: `tools/sound/synth.mjs`·`dsp.mjs`(순수 Node, `import`는 node 내장 모듈뿐)가 시드 PRNG 노이즈·사인·필터·합성 잔향으로 PCM을 직접 계산. `node tools/sound/synth.mjs`로 비트 단위 재생성 | 없음(샘플·녹음·AI 음성/음악 모델·다운로드 0) | 11-19 v0, 11-20 v0.1 | 가능(팀 저작). 목소리 4종(pet_hum·mong_hum_wait·mong_joy·mong_sleepy)과 eye_open·stroke_attach 안의 허밍 2곳은 **임시 합성**이다. 아트 9절대로 사람 허밍 녹음이 나오면 교체 |
- 저작권자: 앱 저작권자(오너 개인 — 스토어 개발자 계정 명의와 같게)다. 합성 스크립트 `tools/sound/*.mjs`는 앱 저장소 코드에 포함된다. 저장소에 아직 LICENSE 파일이 없으므로 비공개 전용(All rights reserved)으로 본다. 오픈소스로 공개할 때 이 줄을 고친다.
- AI 사용 기록: 합성 **코드**는 사운드 디자이너 에이전트(Claude Code, Claude Opus 5.5)가 11-19~20에 작성했다. 용도는 출시 효과음 생성 도구다. 음원은 모델 출력이 아니라 그 코드의 결정적 DSP 연산 결과다(AI 음성·음악 생성 모델 미사용). 프롬프트는 팀 작업 지시(사운드 v0 과제와 리뷰 반영)다.
- 사람 허밍 녹음으로 바꿀 때는 새 행을 만든다. 녹음자의 **서면 동의**(상업 이용, 피치·시간 변형·편집 허용, 기한·지역 무제한, 권리 양도 또는 독점 이용 허락)를 받고, 외주면 계약서에 같은 조항을 넣는다.

## 5. 코드 의존성
- 11-20 v1.2: `subset-font@2.9.0`(BSD-3-Clause, 개발 도구 — 앱 번들 아님, 루트 devDependency). 네이티브 의존성 추가 없음.
- 11-20 앱 흐름에서 추가(모두 `npx expo install`, SDK 58): react-native-mmkv 4.3.2(MIT), react-native-nitro-modules 0.37.2(MIT), expo-notifications·expo-audio·expo-haptics·expo-font(MIT), react-native-safe-area-context 5.11.1(MIT). 개발용 vitest(MIT). 글꼴 패키지 두 개는 3절.
- 11-24 V21 자체 OTA에서 추가(`npx expo install`, SDK 58): expo-updates 58.0.22(MIT) — 네이티브 모듈, 빌드 2 묶음. 하위 의존 expo-eas-client·expo-manifests·expo-structured-headers·expo-updates-interface·@expo/code-signing-certificates(모두 Expo, MIT). 서버 쪽 새 의존성 0(서명·multipart·SFV는 node:crypto와 자체 코드).
- 11-20 B2 서버: `jose@6.2.18`(MIT, 런타임 의존성 0, `apps/server` dependencies) — Supabase JWT 비대칭 서명 검증·JWKS 캐시와 Cloud Scheduler OIDC 검증. 정본 2-4 'JWT 검증(`jose`)'이 지정한 라이브러리. 직접 짜면 알고리즘 혼동(HS256·none)·kid 처리 실수가 나기 쉬운 보안 경로라 들였다. 서버 번들 밖(외부 패키지)이라 앱 번들 영향 없음.
- 11-20 B3 웹 뷰어(`apps/web-static` devDependencies — 앱 번들 아님): `canvaskit-wasm@0.41.0`(BSD-3-Clause, Google Skia — `/w/ck/0.41.0/canvaskit.js`·`.wasm`을 그대로 배포하므로 **배포물에 포함**: 저작권 고지는 패키지 `LICENSE`를 `/w/ck/0.41.0/`에 함께 두는 것을 B6 배포 체크에 넣는다), `esbuild@0.28.2`(MIT, live.js 묶음 도구), `typescript@~6.0.3`(Apache-2.0, 타입 검사). 셋 다 이미 lockfile에 있던 판(react-native-skia·tsup 경유)이라 새로 받은 패키지는 0. 서버 MP4·JPEG 검사는 자체 파서(의존성 추가 없음). 시험 고정물 `apps/server/test/fixtures/media/*`는 ffmpeg 9.0.2로 팀이 만든 단색 영상·그림(2절 성격, 저작물 아님).
- npm 의존성 라이선스는 첫 EAS 빌드 전에 `license-checker` 등으로 한 번 뽑아 이 절에 요약한다(GPL 계열이 앱 번들에 들어오지 않는지).

## 할 일
1. 출시 전 Figma AI 생성물 약관 재확인(출시·정책).
2. rival `A4`·`B4-in-engine` 출처 확인(경쟁 디렉터).
3. 템플릿 앱 아이콘 교체 시 이 원장 2절 갱신.
