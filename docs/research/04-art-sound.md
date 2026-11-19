> **11-19 갱신:** D-01(꿈 흙·분청) 채택으로 1절 판단('단순 덩어리형'), 3절 시안(모찌·콩·솜뭉치), 4절 사운드 톤(칼림바·오르골)은 대체되었습니다. 귀여움 원칙(2절)·라이선스 원칙·햅틱은 유효합니다.

# 04. 아트·사운드 조사 및 제안 (아트 디렉터 겸 사운드 담당)

- 작성일: 2026-11-19
- 전제: 사람 아티스트 없음. 코드는 Claude Code 에이전트. Gemini 잔액 약 1만원. Figma MCP(이미지·벡터 생성) 있음.
- 산출물: 이 문서, `art-sketches/` 아래 파라메트릭 SVG 시안 3장과 생성기(`generate.mjs`)
- 표기: [확인]은 공식·1차 출처, [2차]는 블로그·집계 사이트라 출시 전에 공식 약관으로 다시 확인해야 함.

---

## 0. 한 줄 결론

**몽망이 본체(몸·눈·입·볼·성장 파츠)는 "코드로 그리는 파라메트릭 벡터(Skia)"로 만든다.** 부가 에셋(옷·소품·가구)도 같은 벡터 문법으로 그리고, AI 이미지는 레퍼런스·무드보드 용도로만 쓴다(출시물에는 넣지 않음). Rive는 2단계 옵션으로 남겨 둔다. 사운드는 CC0 효과음(Kenney 등)과 직접 합성한 효과음(ChipTone, jfxr)으로 채우고, BGM은 CC0 음원이나 소액 외주로 확보한다. AI 음악은 쓰지 않는다.

---

## 1. 일관된 고품질 캐릭터 아트를 만드는 방법 비교

키우기 게임은 **성장 단계 × 표정 × 옷/소품 × 방** 조합이 곱으로 늘어난다. 그래서 장 단위 그림 품질보다 **조합해도 깨지지 않는 일관성**과 **변형 비용이 0에 가까운 구조**가 더 중요하다.

| 방식 | 일관성 | 변형 수 확장 | 애니메이션 품질 | 비용 | 스토어·저작권 리스크 |
|---|---|---|---|---|---|
| (a) 코드·파라메트릭 벡터 (SVG/Skia, 파츠 조합·프로시저럴 표정) | **최상**: 같은 함수와 팔레트 토큰을 쓰므로 어긋날 수 없음 | **최상**: 표정·단계 = 파라미터 객체 하나 | 상: 스쿼시·깜빡임·호흡을 60fps 실시간으로 계산. 파라미터끼리 연속 보간 가능 | 0원 (에이전트 시간만 듦) | **최저**: 사람이 짠 코드와 디자인이라 저작권이 명확 |
| (b) AI 이미지 생성 후 정리 | 하: 같은 캐릭터를 수십 장 뽑으면 형태가 흔들림. 레퍼런스 이미지를 넣어도 완전히 막을 수 없음 | 중: 장당 약 $0.04지만, 고르고 다듬는 비용이 큼 | 하: 정지 이미지만 나옴. 움직이려면 분리·리깅이 따로 필요 | Gemini 2.5 Flash Image 약 $0.039/장 [2차]. 1만원이면 대략 180장 | **높음**: 순수 AI 생성물은 미국에서 저작권 등록 불가(Thaler 판결, USCO 2025 보고서). 남이 복제해도 막기 어려움. 학습 데이터 유사성 분쟁 가능성도 있음 |
| (c) Rive 스테이트머신 리그 | 상: 리그 하나에서 모든 상태가 나옴 | 상: 입력값(감정·배고픔)으로 블렌딩 | **최상**: 본 + 메시 변형 + 스테이트머신. Duolingo가 캐릭터 립싱크에 사용 | 무료 플랜은 파일 3개 제한. 유료는 월 $9~32대 [2차, 가격이 출처마다 다름] | 낮음 (직접 만든 경우) |
| (d) Spine 스켈레탈 | 상 | 중: 스킨·어태치먼트 교체 가능 | 최상: 게임 업계 표준 | Essential $69, Pro $379 일회성. 매출 $50만 이하 조건 [확인] | 낮음. 다만 원화를 따로 구해야 함 |
| (e) 에셋 스토어 구매 후 커스터마이즈 | 중: 팩 안에서는 일관되지만 우리 캐릭터와 섞으면 깨짐 | 하: 팩에 없는 변형은 만들 수 없음 | 팩마다 다름 | 수만~수십만 원 | 중: "독창적 캐릭터"가 될 수 없음. 라이선스 범위(재배포·수정) 확인 필요 |
| (f) 외주 (크몽 등) | 상: 한 사람이 그리면 일관됨 | 하: 추가 표정·옷마다 추가 비용 | 원화만 받으면 리깅이 따로 필요. 원화+Spine 리깅 패키지도 있음 | 캐릭터 1종 + 표정 10 + 포즈 10이 18만원대, 마스코트급 개발은 43만원 이상 [크몽 가격 안내]. 표정 4종 세트 약 15만원 | 낮음. 단, **상업적 이용·2차 수정 권리를 계약서에 명시**해야 함. 비상업 전용 판매자도 있음 |

### 판단 근거

- **변형 수가 많은 게임에서는 (a)가 압도적이다.** 표정 20종 × 성장 5단계 × 옷 30종을 손으로 그리면 수천 장이 필요하다. 파라메트릭 방식에서는 "몸 함수 + 얼굴 파라미터 + 소품 레이어"의 합성일 뿐이다.
- **(a)의 약점은 "표현 상한"이다.** 붓 질감, 복잡한 머리카락, 원근이 큰 포즈는 어렵다. 그래서 몽망이는 처음부터 **단순한 덩어리형(모찌, 콩, 솜뭉치)**으로 설계해 약점을 피한다. 이 형태는 Kindchenschema와도 일치한다(2절).
- **(b)는 출시 에셋에 쓰지 않는다.** 일관성이 떨어지고, 저작권 보호를 받지 못하며(스토어 경쟁작이 그대로 베껴도 대응이 약함), 잔액도 적다. 대신 **무드보드·실루엣 탐색·배경 아이디어 레퍼런스**로는 아주 효율적이다. 레퍼런스로 쓴 경우에도 최종본은 사람(에이전트)이 벡터로 다시 그리고, 생성 기록을 남긴다(USCO는 사람의 선택·배열·수정 기여를 보호한다).
- **스토어 정책**: Google Play의 AI 생성 콘텐츠 정책은 "앱 안에서 생성형 AI가 콘텐츠를 만드는" 앱을 대상으로 한다(부적절 콘텐츠 차단, 신고 기능). AI로 만든 고정 에셋을 쓰는 것 자체를 금지하지는 않는다 [확인]. 스토어 등록 에셋에 AI 사용을 신고하는 의무가 2026년에 생겼다는 2차 자료가 있지만 서로 엇갈린다 [2차]. EU AI Act 표기 의무도 언급된다. (a)를 택하면 이 불확실성 전체를 피할 수 있다.
- **Figma MCP의 이미지·벡터 생성**도 (b)와 같은 범주로 취급한다(생성물 권리는 Figma AI 약관을 따른다. 출시 전 확인 필요). 다만 **벡터 일러스트 생성 결과를 SVG로 받아 path를 우리 파라메트릭 코드로 옮기는** 방식은 탐색 도구로 유용하다.

---

## 2. 귀여움과 애착을 만드는 원칙

### 2-1. 형태: Kindchenschema(아기 도식)

Lorenz(1943)가 제안했고 Glocker 외(2009)가 실험으로 검증했다. **큰 머리, 둥근 얼굴, 높은 이마, 큰 눈, 작은 코와 입**이 귀여움을 느끼게 하고 돌봄 동기를 높인다. 2014년 Frontiers 연구에서는 사람뿐 아니라 개·고양이 이미지에서도, 3~6세 아동에게서도 효과가 나타났다.

몽망이에 적용하면 이렇다.
- 머리 = 몸(1등신). 얼굴은 몸 높이의 **55% 지점 아래**에 둔다. 이마가 넓어 보여서 더 아기 같다.
- 눈 간격은 넓게, 입은 눈 크기보다 작게. 코는 생략한다.
- 각진 곳 없이 모두 곡선. 바닥만 평평하게 해서 "앉아 있는" 안정감을 준다.
- 디테일은 최소로 유지한다. 귀여운 그림에 디테일을 과하게 넣으면 섬뜩해질 수 있다는 지적이 있다(Envato Tuts+ kawaii 팁). 실루엣 하나로 알아볼 수 있어야 한다.

### 2-2. 애니메이션 원칙 (Disney 12원칙 중 키우기 게임에 맞는 것)

| 원칙 | 몽망이 구현 | 파라미터 |
|---|---|---|
| 스쿼시·스트레치 | 터치하면 눌렸다가(0.85) 튀어 오름(1.1)을 거쳐 1.0으로. **부피 보존**(폭 ∝ 1/√squash) | `squash`, 스프링(damping 12, stiffness 180 정도) |
| 아이들 호흡 | 2.8~3.5초 주기로 squash 0.98↔1.02. 주기를 개체마다 살짝 다르게 | `breathPeriod` 랜덤 ±10% |
| 눈 깜빡임 | 2~6초 사이 **불규칙**. 가끔 연속 2회. 닫힘 80ms, 열림 120ms | `eyeOpen` 1→0→1 |
| 시선 따라가기 | 손가락 위치로 동공을 최대 3px 이동. **150~250ms 늦게** 따라옴 | `gaze(x,y)` + lag |
| 반응 지연(anticipation) | 밥을 주면 바로 먹지 않음. 쳐다보고(200ms), 기대 표정을 지은 뒤 먹는다. "살아 있다"는 느낌은 지연에서 온다 | 상태 머신 전이 딜레이 |
| 2차 동작(follow-through) | 몸이 멈춘 뒤에도 잎·귀·소품이 한 번 더 흔들림 | 소품 각도 = 몸 squash 미분값 |
| 과장 | 기쁨은 크게: 눈이 ^ 모양이 되고 볼 터치가 진해지고 반짝이 파티클이 나옴 | `blushA`, `extra` |
| 무작위 아이들 | 30~90초마다 하품·두리번·작은 점프 중 하나. 같은 동작이 연속되지 않게 | 가중 랜덤 |

### 2-3. 애착을 만드는 시스템 원칙 (레퍼런스 분석, 복제 아님)

- **다마고치**: 단순한 실루엣과 "돌보지 않으면 상태가 변한다"는 결과가 애착을 만든다. 시각적으로 뽐내는 것보다 **내 행동에 따라 달라지는 모습**이 핵심이다.
- **Neko Atsume**: 단순한 루프와 아트 스타일 덕분에 바이럴됐다. 플랫 컬러와 얇은 라인, 일상적인 포즈가 특징이다. **"관찰하는 재미"**를 위해 같은 캐릭터의 포즈 변형을 많이 만든다. 이 점이 몽망이의 파라메트릭 방식과 잘 맞는다.
- **Finch(셀프케어 펫)**: 사용자가 현실에서 자기 관리를 하면 펫이 자란다. 리뷰에서는 "aesthetic"과 "cute"가 반복된다. **저채도 파스텔, 둥근 UI, 펫이 말을 걸어오는 구조**가 특징이다. 하루 단위 성장 리듬이 몽망이 컨셉과 같다.
- 공통 원칙은 다음과 같다. ① 실루엣이 단순하다 ② 표정은 적은 파츠의 조합으로 만든다 ③ 성장이 **눈에 보이는 작은 차이**로 매일 쌓인다(잎 1장, 볼 색, 크기 3%) ④ 반응에 약간의 지연과 랜덤이 있다.

---

## 3. 아트 방향 시안 3개 (SVG 실증)

파일: `docs/research/art-sketches/`
- `generate.mjs`: 생성기. `node generate.mjs`로 SVG 3장을 다시 만든다.
- `A-mochi-jelly.svg`, `B-sprout-bean.svg`, `C-dream-puff.svg`: 각 시트에 **0일차(알) + 표정 5종(기본·기쁨·졸림·놀람·시무룩)**과 팔레트 칩이 들어 있다.

**실증 결과**: 모든 표정은 `EXPRESSIONS` 객체 한 줄(`squash`, `eyeOpen`, `eyeMode`, `mouthCurve`, `mouthOpen`, `blushA`, `extra`)로 정의된다. 같은 표정 데이터를 세 시안에 그대로 적용해도 각 시안의 형태 언어가 유지된다. 출력은 SVG path `d` 문자열이라 `react-native-skia`의 `Skia.Path.MakeFromSVGString`이나 `<Path path=...>`에 그대로 쓸 수 있다. 파라미터는 Reanimated shared value로 보간한다(같은 명령 구조끼리는 `interpolatePaths`도 쓸 수 있음).

### A. 말랑 모찌 (추천 1순위)
- 형태 언어: 원과 슈퍼타원. 외곽선 없음. 2톤 셀 셰이딩(아래 음영 + 왼쪽 위 하이라이트).
- 팔레트: 몸 `#FFD9C7` / 음영 `#F7B9A3` / 잉크 `#3B2A2A` / 볼 `#FF8E8E` / 강조 `#FFC94D` / 배경 `#FFF7F0`
- 장점: 스쿼시·스트레치가 가장 자연스럽다. 외곽선이 없어서 형태가 변해도 선 두께가 깨지지 않는다. 몸 색 파라미터로 성장 분기(먹이·성격별 색)를 만들기 쉽다.
- 위험: 밝은 배경이나 방 가구 위에서 대비가 약하다. 바닥 그림자와 잉크 눈으로 보완한다.

### B. 새싹 콩
- 형태 언어: 비대칭 콩과 두꺼운 갈색 라인(5px). 머리 위 새싹이 **성장 단계 표식**이다(잎 수·길이·꽃).
- 팔레트: 몸 `#CFE8B9` / 음영 `#A9D18E` / 라인 `#4A3B32` / 볼 `#F59E8B` / 강조 `#F7C948` / 배경 `#F6F3E8`
- 장점: "씨앗에서 키운다"는 컨셉이 가장 직관적이다. 라인 덕분에 어떤 방 배경 위에서도 또렷하다. 잎이 2차 동작(눌리면 눕기)을 보여 준다.
- 위험: 라인 두께를 스케일과 상관없이 일정하게 유지해야 하고, 옷·소품에도 같은 라인 규칙을 강제해야 한다(아트 바이블).

### C. 꿈 솜뭉치
- 형태 언어: 구름 가장자리(타원 위 N개 점을 부푼 곡선으로 연결. `n`, `bulge`, `phase` 파라미터). 저채도 라벤더. 밤·수면 테마.
- 팔레트: 몸 `#E6DDFB` / 음영 `#C7B8F2` / 잉크 `#2B2340` / 볼 `#FF9EC4` / 강조 `#FFE08A` / 배경 `#2E2A4F`
- 장점: 정서적으로 차분하다. `phase`를 천천히 돌리면 털이 일렁이는 아이들 모션이 공짜로 생긴다.
- 위험: 어두운 배경이 기본이라 낮 시간 연출과 충돌한다. 시간대 테마 시스템이 필요하다.

### 공통: 0일차 알
- 알 표면의 점무늬는 앞으로 나올 몽망이의 몸 색을 미리 보여 준다. `crack`(0~1)으로 부화 진행을 표현한다. 성장 단계 0은 별도 에셋이 아니라 **같은 함수의 다른 파라미터**다.

> 결정 요청(오너): A·B·C 중 하나를 고른다. 아트 디렉터 추천은 **A 기반에 B의 "머리 위 성장 표식"만 차용**한 하이브리드다(외곽선 없는 모찌 + 단계별로 자라는 새싹·뿔·꽃 파츠).

---

## 4. 사운드

### 4-1. 효과음 (SFX)

| 출처 | 라이선스 | 용도 | 비고 |
|---|---|---|---|
| **Kenney** (Interface Sounds, UI Audio, Impact, RPG Audio 등) | **CC0** [확인] | UI 클릭·토글·획득 | 출처 표기 의무 없음. 1순위 |
| **ChipTone** (SFB Games, 브라우저) | 생성음 **CC0** [확인] | 귀여운 뿅·톡·팝 계열 | 피치를 올린 사각파·삼각파가 귀여운 톤에 잘 맞음 |
| **jfxr** (bfxr 후속) | 생성음 무제한 자유 사용 [확인] | 같음 | 파라미터 JSON 저장 가능 → 레포에 소스로 보관 |
| jsfxr | 생성음 라이선스 명시가 불명확 [2차] | 비권장 | jfxr나 ChipTone 사용 |
| **Freesound** | 파일마다 CC0, CC-BY, CC-BY-NC가 섞여 있음 | 폴리(천·물방울·냠냠) | **CC0 필터만 사용**. CC-BY-NC는 금지 |
| OpenGameArt | 파일마다 다름 | 보조 | CC0만 사용 |
| ElevenLabs Sound Effects | 무료 플랜은 **비상업**. 유료(월 $5~6~)부터 상업 이용 가능 [확인 + 2차] | 특수한 폴리가 꼭 필요할 때만 | 출력물 저작권은 AI 생성물과 같은 문제가 있음 |

**직접 합성(프로시저럴) 권장**: 몽망이 목소리(옹알이)는 짧은 사인·삼각파 음절 여러 개를 이어 붙이고, **감정 파라미터에 따라 피치와 속도를 바꾸는** 방식(Animal Crossing류 "가짜 말")으로 만든다. 표정 파라미터와 소리 파라미터가 같은 상태 머신에서 나오므로 시각과 청각이 일관된다. 런타임 합성(expo-av 대신 Web Audio 계열이나 react-native-audio-api 등)을 쓸지, 미리 렌더한 wav 30~50개를 쓸지는 구현 단계에서 결정한다.

### 4-2. BGM

| 방법 | 라이선스·리스크 | 판단 |
|---|---|---|
| CC0 음원 (OpenGameArt CC0, Kenney Music Jingles 등) | 안전 | 1차 확보. 선택지가 좁음 |
| Pixabay Music | 무료 상업 사용 가능. 단 **원본 그대로 "단독 배포"는 금지**. 게임 안에 결합하면 일반적으로 허용 [확인]. 일부 곡은 YouTube Content ID 클레임이 걸림 | 후보. 곡마다 기록 보관 |
| Suno / Udio (AI 음악) | 유료 플랜만 상업 이용 가능. Suno는 WMG 합의 후 "소유" 표현이 "라이선스"로 바뀌었다는 보고가 있음. Udio는 다운로드 제한 전환 중. Sony 소송 진행 중 [2차] | **비권장**: 권리 불확실, 저작권 등록 불가, 약관 변동이 큼 |
| 외주 작곡 (크몽 등) | 계약으로 권리 확보 | 메인 테마 1곡(30~60초 루프)만 외주. 수십만 원대 예상, 견적 필요 |

BGM 톤은 오르골, 칼림바, 마림바, 부드러운 패드. BPM 70~90. 낮/밤 버전 2개. 볼륨 기본값은 낮게 잡는다(키우기 게임은 오래 켜 두므로 피로 관리가 중요).

### 4-3. 햅틱

- `expo-haptics`: iOS는 Taptic Engine 스타일을 그대로 쓴다. Android는 `performAndroidHapticsAsync` 사용이 권장된다(Vibrator API보다 나음) [확인].
- 저전력 모드, 카메라 사용 중, 받아쓰기 중, 사용자가 설정에서 끈 경우에는 iOS에서 동작하지 않는다. **햅틱만으로 정보를 전달하지 않는다.**
- 매핑 제안:
  - 쓰다듬기 시작: `selectionAsync` (가벼운 틱. 연속이면 200ms 스로틀)
  - 콕 찌르기, 스쿼시 바닥 찍는 순간: `impactAsync(Light)`. 애니메이션의 최대 압축 프레임과 맞춘다
  - 밥 먹기 완료, 레벨업: `notificationAsync(Success)`
  - 성장·부화 연출: `Medium`을 3번(알 금 가는 박자) 친 뒤 `Heavy` 1번
- 설정에서 사운드·햅틱을 따로 켜고 끌 수 있게 한다.

---

## 5. 추천 파이프라인

### "파라메트릭 벡터 코어 + AI는 레퍼런스 전용 + CC0/합성 사운드"

```
[1] 무드보드: Figma MCP / Gemini로 레퍼런스 10~20장 (출시물 아님, 기록 보관)
        ↓  오너가 방향 선택
[2] 아트 바이블 토큰화: palette.ts, shape.ts(비율), stroke.ts, motion.ts(스프링 값)
        ↓
[3] 파라메트릭 리그(코드): body(stage, squash, color) + face(expr) + props(layer, anchor)
    - 표정·성장 = 데이터(JSON). 새 표정 추가 = 객체 1개
    - 소품·옷 = 앵커 포인트(머리 위, 볼, 손 자리)에 붙는 벡터 컴포넌트
        ↓
[4] 렌더: react-native-skia <Canvas> + Reanimated shared value (60fps)
        ↓
[5] 검수 자동화: 스토리북식 "조합 시트" 생성 (모든 단계 × 표정 × 대표 의상) → PNG 스냅샷
    → 작성자가 아닌 리뷰어 에이전트가 바이블 체크리스트로 검토 (팀 리뷰 원칙)
        ↓
[6] 사운드: Kenney CC0 + ChipTone/jfxr(파라미터 파일 커밋) + 옹알이 합성
    → assets/LICENSES.md에 파일별 출처·라이선스·URL 기록
```

**이유**
1. **일관성이 구조적으로 보장된다.** 사람의 손이 없는 팀에서 일관성을 지키는 가장 확실한 방법은 "그리는 행위"를 함수로 바꾸는 것이다.
2. **조합 폭발을 감당할 수 있다.** 에셋이 이미지 파일이 아니라 파라미터이므로 조합 수가 늘어나도 용량과 작업량이 거의 늘지 않는다(시트 1장 약 10KB).
3. **애니메이션 품질 상한이 높다.** 정지 이미지 교체가 아니라 모든 값이 연속 보간되므로, 스쿼시·호흡·시선·지연 같은 애착 원칙을 그대로 구현할 수 있다.
4. **비용 0원, 권리 명확.** Gemini 잔액은 무드보드에만 쓴다(약 50장 이내).
5. **탈출구가 있다.** 표현 한계에 부딪히면(예: 성체 단계의 복잡한 포즈) 그 부분만 Rive(월 $9~)로 옮긴다. 같은 벡터 원본을 Rive에 가져갈 수 있다. 유료 도구는 **Rive Cadet 플랜만** 필요할 때 제안한다.

### 아트 바이블에 들어갈 항목

1. **캐릭터 정체성**: 한 문장 컨셉, 성격 3단어, 금지 사항(무섭게, 날카롭게, 실사풍 금지)
2. **비율표**: 몸 W:H, 얼굴 중심 높이(55%), 눈 간격, 눈 반지름 대 몸 폭 비율, 입 폭 ≤ 눈 지름
3. **형태 언어**: 허용 곡선(원, 슈퍼타원), 모서리 최소 반경, 직선과 예각 금지, 바닥 평평
4. **팔레트 토큰**: 몸/음영/하이라이트/잉크/볼/강조/배경. 성장 분기 색은 HSL 범위로 제한(채도 상한, 명도 하한)
5. **라인 규칙**: 외곽선 유무, 두께(화면 크기와 무관한 고정 px), 선 끝·이음 round
6. **셰이딩 규칙**: 2톤만 허용, 광원 왼쪽 위 고정, 그라디언트 금지 또는 1종만
7. **표정 사전**: 표정마다 파라미터 값표와 사용 상황
8. **모션 사전**: 스프링 상수, 깜빡임 주기, 호흡 주기, 반응 지연 ms, 아이들 동작 목록과 가중치
9. **성장 단계 규칙**: 단계별 크기 비율, 추가 파츠, "매일 보이는 작은 변화" 목록
10. **소품·옷 규칙**: 앵커 포인트 좌표계, 레이어 순서(몸 → 옷 → 얼굴 → 모자), 소품 최대 크기, 몸과 같은 라인·셰이딩 규칙
11. **방·배경 규칙**: 캐릭터보다 낮은 채도, 원근 없음(정면 2.5D), 캐릭터와 대비 확보
12. **사운드 바이블**: 음색 팔레트(오르골, 칼림바, 사인파 뿅), 음량 LUFS 기준, 효과음과 감정 매핑, 옹알이 피치 범위
13. **햅틱 매핑표**
14. **라이선스 원장**: 모든 외부 에셋의 출처 URL, 라이선스, 다운로드일. AI 사용 기록(프롬프트, 날짜, 용도: 레퍼런스 전용)
15. **검수 체크리스트**: 조합 시트에서 확인할 항목(비율 이탈, 팔레트 외 색, 라인 불일치, 접지 그림자 누락)

---

## 출처

### 저작권·스토어
- [Perkins Coie – Copyright for AI-generated visual content in video games](https://perkinscoie.com/insights/article/copyright-ai-generated-visual-content-video-games)
- [Promise Legal – AI-Generated Game Assets: What Studios Own (2026)](https://blog.promise.legal/ai-game-assets-what-studios-own-2026/)
- [Promise Legal – AI Game Assets 2026: Copyright, Steam Disclosure, Platform Compliance](https://blog.promise.legal/ai-game-assets-copyright-steam-disclosure-2026/)
- [The Fashion Law – Running list of USCO decisions on AI works](https://www.thefashionlaw.com/a-running-list-of-u-s-copyright-office-decisions-on-ai-artworks-post/)
- [Mondaq – Copyright challenges of AI-generated content in gaming](https://www.mondaq.com/unitedstates/copyright/1759920/leveling-up-or-losing-rights-copyright-challenges-of-ai-generated-content-in-gaming)
- [Google Play – Understanding AI-Generated Content policy](https://support.google.com/googleplay/android-developer/answer/14094294)
- [Android Developers Blog – GenAI safety (2026-08)](https://android-developers.googleblog.com/2026/08/ensuring-safety-genai-preventing-non-consensual-intimate-content.html?m=1)
- [Revera – AI in Mobile Applications: Google Play Requirements](https://www.revera.legal/?p=3557)
- [Phiture – EU AI Act ASO strategy](https://phiture.com/asostack/eu-ai-act-aso-strategy/)

### 도구·가격
- [Spine 구매 페이지](https://esotericsoftware.com/spine-purchase) / [Spine 라이선스 포럼 답변](https://esotericsoftware.com/forum/d/29824-spine-43--2d-animation-buy-form)
- [Rive – Character animation use case](https://rive.app/use-cases/character-animation) / [Rive 가격 정리(2026, 2차)](https://makerstack.co/reviews/rive-review/) / [comparetiers Rive](https://comparetiers.com/tools/rive)
- [Duolingo – World character visemes](https://blog.duolingo.com/world-character-visemes) / [Rive – Duolingo Lily](https://rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life)
- [BenchLM – Nano Banana API pricing](https://benchlm.ai/media-pricing/nano-banana) / [Unifically – Nano Banana](https://unifically.com/blogs/nano-banana)
- [크몽 – 캐릭터 제작 가격 안내](https://kmong.com/prices/%EC%BA%90%EB%A6%AD%ED%84%B0-%EC%A0%9C%EC%9E%91)
- [react-native-skia – Animations/Reanimated](https://shopify.github.io/react-native-skia/docs/animations/reanimated2) / [Skia interpolation(미러)](https://www.mintlify.com/shopify/react-native-skia/api/interpolation)

### 귀여움·레퍼런스
- [Glocker 외 – Baby Schema in Infant Faces (UPenn)](https://repository.upenn.edu/entities/publication/2bfa14b1-140d-43bc-94ac-6dbffa99194a)
- [Frontiers in Psychology 2014 – Baby schema in children, dogs, cats](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2014.00411/full)
- [PMC – Baby schema](https://pmc.ncbi.nlm.nih.gov/articles/PMC4019884)
- [Creative Bloq – 10 tips for kawaii character design](https://www.creativebloq.com/character-design/10-tips-kawaii-character-design-514833)
- [Envato Tuts+ – Tips for cute kawaii art](https://design.tutsplus.com/articles/10-top-tips-for-creating-cute-kawaii-art--cms-25705)
- [Fanlore – Neko Atsume](https://fanlore.org/wiki/Neko_Atsume) / [Ludus Novus – The Feline Grace of Neko Atsume](https://ludusnovus.net/2015/07/30/the-feline-grace-of-neko-atsume)
- [Finch: Self-Care Pet (App Store)](https://apps.apple.com/app/id1528595748) / [ScreensDesign – Finch](https://screensdesign.com/showcase/finch-self-care-pet)

### 사운드·햅틱
- [Kenney – RPG Audio (CC0)](https://www.kenney.nl/assets/rpg-audio) / [OpenGameArt – Interface sounds](https://opengameart.org/content/interface-sounds)
- [ChipTone (CC0)](https://sfbgames.itch.io/chiptone) / [jfxr (GitHub)](https://github.com/ttencate/jfxr) / [jsfxr (npm)](https://www.npmjs.com/jsfxr)
- [Cinevva – Free sound effects & music for games (2026)](https://app.cinevva.com/guides/free-sound-effects-music)
- [Pixabay Terms of Service](https://pixabay.com/service/terms/) / [Pixabay License Summary](https://pixabay.com/pl/service/license)
- [ElevenLabs – Commercial sound effects](https://elevenlabs.io/sound-effects/commercial) / [terms.law – ElevenLabs terms](https://terms.law/ai-output-rights/elevenlabs/)
- [Dynamoi – Suno vs Udio distribution rights](https://dynamoi.com/learn/ai-music-distribution/suno-vs-udio-for-commercial-distribution) / [Dubspot – AI music licensing 2026](https://blog.dubspot.com/ai-music-licensing-explained-2026)
- [Expo Haptics docs](https://docs.expo.dev/versions/latest/sdk/haptics) / [LogRocket – haptics in game](https://blog.logrocket.com/?p=141777)
