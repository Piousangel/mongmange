# 라이선스 원장

- 담당: 출시·정책(기록은 만든 사람이 직접). 새 외부 에셋·AI 생성물·글꼴·소리·코드 의존성을 들이면 **같은 커밋에** 한 줄을 추가한다.
- 원칙(OPERATING 0-1): AI 생성물은 **탐색·레퍼런스 전용**이다. 출시 빌드·스토어 스크린샷·마케팅에는 넣지 않고, 팀이 정한 형태 언어로 벡터·셰이더로 다시 만든다. 스토어 스크린샷은 실제 렌더만 쓴다(D-04).
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

- 확인 필요: rival 문서 머리말은 "9장 중 8장 gpt, 1장 gemini"라고 적었는데 파일은 10장·노드 10개다. `A4-in-engine`·`B4-in-engine`이 생성 이미지인지 코드 렌더인지 작성자(경쟁 디렉터)가 이 표를 고친다. 그전까지는 생성 이미지로 취급한다.
- Figma 에셋 URL은 7일 뒤 만료된다. 로컬 사본이 원본이다. 프롬프트 원문은 각 Figma 노드 생성 기록에 있다.
- 합계: AI 생성 이미지 34장(7 + 10 + 17), 출시물 사용 0장.

## 2. 팀이 만든 것 (AI 생성 아님)

| 파일 | 만든 방법 | 비고 |
|---|---|---|
| `docs/creative/img/A4-pinch-rig-code.png`, `docs/creative/proto/pinch-rig.*` | 팀 작성 코드 → SVG → Chrome headless 캡처 | 팀 저작 |
| `docs/spike/render-01/*.png·*.jpg·video/*` | 스파이크 01 실제 렌더 캡처(Playwright) | 팀 저작 |
| `apps/mobile/assets/*`(아이콘·스플래시) | `create-expo-app` 템플릿 기본 에셋 | **교체 필요**(템플릿 아이콘·배경 #E6F4FE). 출시 전 팀 아이콘으로 |

## 3. 글꼴 (출시 번들 후보, 아트 6절)

| 글꼴 | 라이선스 | 상태 |
|---|---|---|
| **Gowun Batang** 400 (명조, 본문·제목·시 한 줄) | SIL OFL 1.1 | **번들(11-20 앱 흐름 v1.1)**. 출처 npm `@expo-google-fonts/gowun-batang@0.4.1`의 `400Regular/GowunBatang_400Regular.ttf`(8.4MB, Google Fonts 배포본). 원문 `node_modules/@expo-google-fonts/gowun-batang/LICENSE_FONT`. 서브셋은 아직(용량 줄이기 할 일) |
| **Pretendard** Regular (UI 고딕) | SIL OFL 1.1 | **번들(11-20)**. 출처 npm `pretendard@1.3.9`의 `dist/public/static/Pretendard-Regular.otf`(1.6MB). 원문은 패키지 `LICENSE` |
| 본명조(Noto Serif KR) | SIL OFL 1.1 | 후보(Gowun Batang으로 대체, 미번들) |
| Cormorant Garamond | SIL OFL 1.1 | 후보, 아직 번들 안 함(영어판) |

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
- 11-20 앱 흐름에서 추가(모두 `npx expo install`, SDK 58): react-native-mmkv 4.3.2(MIT), react-native-nitro-modules 0.37.2(MIT), expo-notifications·expo-audio·expo-haptics·expo-font(MIT), react-native-safe-area-context 5.11.1(MIT). 개발용 vitest(MIT). 글꼴 패키지 두 개는 3절.
- npm 의존성 라이선스는 첫 EAS 빌드 전에 `license-checker` 등으로 한 번 뽑아 이 절에 요약한다(GPL 계열이 앱 번들에 들어오지 않는지).

## 할 일
1. 출시 전 Figma AI 생성물 약관 재확인(출시·정책).
2. rival `A4`·`B4-in-engine` 출처 확인(경쟁 디렉터).
3. 템플릿 앱 아이콘 교체 시 이 원장 2절 갱신.
