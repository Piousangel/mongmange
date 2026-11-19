# 렌더 스파이크 01 — 먹 한 방울 몽망이 (웹/CanvasKit)

- 날짜: 2026-11-19 · 작성: 테크 리드 · 상태: 독립 리뷰 완료(docs/team/reviews/2026-11-19-v1-review.md), 후속은 docs/spike/render-02/BRIEF.md
- **11-19 정정(PM)**: ① 아래 60·45·40%는 이전 시안(rival A4·C2) 기준 체감치라 판정 근거로 쓰지 않는다(리뷰 I5, D-11). ② 이 스파이크의 몽망이 형태(외눈, 번짐 가시, 떨어진 E 틱, 초승달 주획 몸통·꼬리·붉은 볏)는 아트 바이블 v1과 다르며 폐기한다(D-10 "핵 = 몸", D-12). ③ 3절 '세이브는 획 점열뿐이다'는 사실과 다르다 — 현재 코드는 다듬은 메시만 들고 원 점열을 저장하지 않는다. 세이브 정본은 D-13.
- 질문: 실제 앱 렌더(Skia 셰이더)가 시안(A4 in-engine, C2 밤 홈)에 얼마나 다가가는가?
- 결론: 낮 화면은 A4의 약 60%, 획 긋기는 약 45%, 밤은 C2의 약 40%다(체감). 기술 경로(Skia 2D + SkSL)는 맞다. 남은 격차는 대부분 연출·튜닝이고 엔진 한계는 아니다. 구조 과제는 두 가지다: 몸 이음매(방울과 획이 겹치는 자리가 더 진함), 밤에 먹이 실제로 풀려 나가게 하는 피드백 버퍼.

## 1. 만든 것
| 위치 | 내용 |
|---|---|
| package.json, pnpm-workspace.yaml | pnpm 모노레포(nodeLinker: hoisted). 스크립트 typecheck, test, web, spike:capture |
| packages/core | @mong/core 순수 TS. tick(state, dtMs) 자리 + Vitest 2건 |
| apps/mobile | Expo SDK 58.0.26(npm latest로 확인), RN 0.88.1, React 19.3, Skia 2.14.0, Reanimated 4.7.1 |
| src/render/shaders.ts | SkSL 6개: 한지, 먹 방울, 비백 획, 획 번짐 halo, 밤 수면, 밤 워프 |
| src/render/strokeMesh.ts | 점열 → Chaikin 다듬기 → 2.5px 재표본 → 속도·압력 가변 폭 리본(둥근 시작, 끝 테이퍼) → Vertices + 텍스처 좌표 |
| src/render/pose.ts | 같은 몽망이의 0일차(방울 + E 틱)·7일차(방울 머리 + 초승달 주획 + E 빗 + 꼬리 + 주홍 한 점) |
| src/screens/* | (a) DayScreen (b) StrokeScreen (c) NightScreen |
| scripts/spike-capture.mjs | Playwright: 스크린샷, 연속 프레임, 영상, rAF fps, 부하 조건 |

웹 URL: `pnpm web` → `http://localhost:8081/?screen=a|b|c&day=0|7&clean=1`

기법
- (a) 한지 = fbm 얼룩 + 방향이 다른 섬유 3겹 + 드문 짙은 섬유 + 1px 입자 + 비네트. 방울 = SDF 원(아래가 무거움), fbm 가장자리, 번짐 가시, 옅은 테. 눈은 알파 구멍이라 한지가 비친다. 깜빡임 4.2초 주기(세 번에 한 번은 두 번), 숨 3.6초 squash-stretch(세로 +2.5%).
- (b) 그리는 중 다듬기 1회, 손을 떼면 3회. 빠를수록 폭이 줄고 건조도가 오른다. 압력은 force가 있으면 쓰고 없으면 0.5. 붓털 노이즈 + 건조도 임계값으로 비백, 끝으로 갈수록 먹이 마른다. 시작점이 몸에서 14px 넘게 떨어지면 420ms 동안 가장 가까운 몸 위치로 끌려와 붙는다. 갓 그은 획은 1초 동안 번짐이 짙다.
- (c) 2단 도메인 워핑 fbm + 중심 소용돌이 + 고리 먹구름 마스크 + 등치선 금빛 결 + 숨결 동심원. 파문은 터치 3개와 6초마다 물방울 1개. 낮의 몸 획은 DisplacementMap으로 물속에서 흔들린다. 잠든 눈은 은빛 곡선.

## 2. 캡처 (이 폴더)
a-day0.png, a-day7.png(390×844 @2x) / sheet-a-day0·day7.jpg(24프레임) / b-stroke-before·after.png, sheet-b-stroke.jpg, sheet-b-stroke-snap.jpg / c-night.png, c-night-touch.png, sheet-c-night*.jpg / video/*.webm / metrics.json

## 3. 시안 대비 평가
### (a) 낮 vs A4 — 약 60%
- 닮은 점: 네 가지 색, 여백, 세로 명조 제목, 인장, 하단 "오늘의 한 획". 0일차 방울은 A1과 거의 같은 인상.
- 모자란 점: ① 방울·주획 겹치는 자리가 더 진함(A4는 실루엣 하나) ② 주획 질감이 고르고 부드러움, 비백 띠·강한 붓결 없음 ③ 주획 폭·곡률 단조로움 ④ 섬유 색 섞임 없음 ⑤ 숨쉬기는 영상에서만 보임.
### (b) 획 긋기 — 약 45%
- 된 것: 드래그 → 다듬기 → 몸에 붙기 → 번짐 고리가 돈다. 빠른 획은 끝 비백이 길다.
- 모자란 점: ① 사용자 획이 막대 팔다리처럼 보임(돈필·수필 형태 없음) ② 꺾인 획 모서리가 각지고 V자 홈 → 큰 반경 스플라인과 조인 필요 ③ 마우스라 압력 없음, 실기기에서 다시 맞춤 ④ 붙기가 평행 이동뿐, 탄성·방울 반응 필요.
### (c) 밤 vs C2 — 약 40%
- 닮은 점: 남색 수면, 소용돌이 먹구름, 금빛 결, 동심원 파문, 잠든 눈. 터치 파문 반응 좋음.
- 모자란 점: ① C2의 가는 실 가닥 대신 마블링처럼 뭉툭, 금빛 결이 갈색 얼룩에 가까움 ② 몸 획이 흔들릴 뿐 풀려 나가지 않음(이류 피드백 버퍼 필요) ③ 소품은 범위 밖 ④ 반사·깊이감 약함.
### 종합
셰이더 6개와 Vertices 리본만으로 "한지 위 먹"이 실시간으로 나온다. ~~세이브는 획 점열뿐이다.~~(정정: 지금은 메시만 보관, D-13 참고) 격차의 약 70%는 튜닝·연출, 약 30%는 구조 과제.

## 4. 성능 (웹, 대략)
Playwright Chromium headless, ANGLE Metal(M3 Pro), rAF 4초.
| 조건 | a-day0 | a-day7 | b 그리는 중 | c-night |
|---|---|---|---|---|
| DPR 2, CPU 1x | 60fps(p95 16.7ms) | 60 | 60 | 60 |
| DPR 3, CPU 4x 감속 | — | 60 | 56~59(최대 50~67ms) | 60 |
- 끊김은 획을 긋는 중의 JS(리본 재계산 + React 재렌더)뿐. rAF는 GPU 비용을 드러내지 않는다. 밤 셰이더는 픽셀당 fbm 약 8회라 중급 Android에서 위험. 판정은 실기기(D-04).

## 5. 네이티브 위험
R1 밤 셰이더 fill-rate(Adreno 6xx·Mali) → 절반 해상도 오프스크린, 옥타브 축소, 정적 부분 굽기
R2 fract 해시 mediump 줄무늬 → 기기별 highp 확인, 안 되면 노이즈 텍스처
R3 터치 입력 차이(120Hz, force·pressure, 다중 터치) → RNGH Pan + 워크릿 수집
R4 그리는 중 JS 재렌더 → 점열을 SharedValue로, UI 스레드에서 Vertices 갱신
R5 DisplacementMap 비용 → 몸만 작은 오프스크린에서 변위
R6 색공간(iOS P3) → sRGB 고정
R7 글꼴(웹은 AppleMyungjo 폴백) → expo-font로 명조 서브셋 번들
R8 Android SurfaceView와 RN 오버레이 z-order
R9 CanvasKit과 네이티브 Skia 차이 → 실기기 스크린샷이 기준, 웹은 회귀 감지용
R10 canvaskit.wasm 8MB → 웹 미리보기만 느림

## 6. 다음 단계
1. 이음매: 몸 전체를 한 오프스크린 coverage로 그려 먹을 한 번만 칠하거나, 방울·주획을 SDF 하나로 합친다.
2. 획 입력 보정: 스플라인 피팅, 돈필·수필 템플릿, 모서리 조인. 손가락 획 20개로 비교.
3. 주획 비백 띠·질감을 A4 옆에 놓고 아트와 함께 튜닝.
4. 밤: 피드백 버퍼 이류로 풀려 나가는 먹, 금빛 결을 선으로.
5. EAS 개발 빌드(Expo 계정 필요, 오너) → 중급 Android에서 R1·R2·R4 측정.

## 7. 실행한 명령과 결과
npm view expo dist-tags(latest 58.0.26) / create-expo-app blank-typescript / npx expo install(Skia·Reanimated·Worklets·RNGH·RNW) / npx expo-doctor 20/20 / pnpm typecheck 통과 / pnpm test 2/2 통과 / pnpm spike:capture 콘솔 에러 0. EAS 빌드·네이티브 실행은 하지 않음.
