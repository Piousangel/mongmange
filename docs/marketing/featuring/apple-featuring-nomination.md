# Apple App Store 피처링 추천(Featuring Nominations) — '앱 출시' 추천서 초안

- 작성: 마케팅(ASO·작가) / 2026-11-25 / v0.1 — 제출·계정 작업 없음
- 제출: **오너**(App Store Connect 역할 Account Holder·Admin·App Manager·Marketing 중 하나)
- 로드맵: D6(관문 아님, 준비되는 대로) — D-26 표기 'Apple 추천 **02-02까지**'
- 답 블록 표시 `<!-- ans id=… max=… -->`는 글자 수 검사 스크립트가 읽는 자리다(README 6절). 지우지 않는다.

---

## 1. 공식 확인 (2026-11-25)

| 항목 | 확인한 내용 | 출처 |
|---|---|---|
| 어디서 | App Store Connect > Featuring > Nominations | [Apple Help — Nominate your app for featuring](https://developer.apple.com/help/app-store-connect/manage-featuring-nominations/nominate-your-app-for-featuring) |
| 누가 | "Required role: Account Holder, Admin, App Manager, or Marketing" | 같음 |
| 유형 | New Content / App Enhancements / **App Launch**("the launch or pre-order of your new app or game") | 같음 |
| 자격 | 체크리스트 없음. 모든 앱·게임이 App of the Day·Game of the Day 대상 | [Getting featured](https://developer.apple.com/app-store/getting-featured/) |
| 리드 타임 | Help: "minimum lead time of **3 weeks**" / Getting featured: "minimum of **two weeks** notice … up to **three months** in advance" — 두 문서가 다르다. **3주를 하한으로 쓴다** | 두 문서 |
| 마감 | Apple 쪽 마감은 없다. **02-02는 우리 내부 마감**(출시 목표 02-23 − 3주, D-26) | — |
| 첨부 | 파일 업로드 칸 없음. **보조 자료 URL 최대 5개**(문서·파일·아트·TestFlight 공개 링크 가능) | Help |
| 인앱 이벤트 | 선택. iPhone·iPad만. "attach … as early as possible" | Help |
| 제출 뒤 | 유형·관련 앱은 못 바꾼다. 나머지는 수정 가능. 보관(archive)하면 복구·수정 불가 | Help |
| 홍보 아트 요청 | 검토 대상이 되면 Apple이 Admin·App Manager·Marketing 역할에게 **홍보 아트를 메일로 요청**할 수 있다 | Getting featured |

### 1-1. 칸과 글자 수
UI 도움말에는 글자 수가 없다. **CSV 템플릿 문서**에 상한이 있어 이를 기준으로 쓴다([Nominations template](https://developer.apple.com/help/app-store-connect/reference/nominations/nominations-template), 2026-11-25 확인). UI 입력 때 카운터로 다시 본다.

| 칸 | 상한 | 우리 답 |
|---|---|---|
| Nomination Name | **60자** | 2-1 |
| Nomination Type | 셋 중 하나 | App Launch |
| Nomination Description | **1,000자** | 2-2 |
| Publish Date (Start/End) | 날짜 또는 범위 | 2-3 |
| Relevant Countries or Regions | ISO 3자 | 2-4 |
| Do you plan to launch in certain markets first? | Yes/No | 2-4 |
| In-App Event 새로 낼 계획 | Yes/No | 2-5 |
| Platforms | iOS (iPhone) 등 | iOS (iPhone) — iPad 대응은 [확인 필요: 빌드 설정] |
| Localization | 로캘 코드 | ko, en-US |
| Supplemental Materials | **URL 5개** | 2-6 |
| Pre-order 포함 | Yes/No | 2-4 |
| Helpful Details | **500자** | 2-7 |

### 1-2. Apple이 보는 것과 우리 답의 연결
Getting featured의 고려 항목(원문 그대로): User experience, UI design, Innovation, Uniqueness, Accessibility, Localization, App Store product page / 게임: Gameplay design, Art and animation, Controls, Story and characters, Replayability, Sound design and music, Technical performance, Overall value.

| Apple 항목 | 우리 사실(정본) | 답 어디에 |
|---|---|---|
| Uniqueness·Gameplay | 먹·한지·글씨 → 몸: 쓴 글씨의 가장 긴 획이 몸에 남고, 말의 뜻이 몸짓·먹빛·꿈이 된다(D-26, store-listing 3절) | 설명 1~2문단 |
| Story·Replayability | 28밤 = 함께 잔 잠의 수, 이레마다 한 장, 28번째 아침 낙관(D-26·D-07) | 설명 3문단 |
| Art and animation | 몸은 2D 수묵 + 빛 한 방향·그림자(정반사 없음), 도구는 구운 3D 렌더(D-26 아트) | 설명 2문단(한 줄) |
| Accessibility | 스크린리더 사용자는 키보드로 한 마디 입력, 대답마다 스크린리더 알림(concept-review 3-1, heart-grain 8-4) | 도움말(H) |
| Localization | 한국어·영어를 번역이 아니라 각각 원작으로 씀(D-06·D-17) | 설명 끝, 도움말 |
| Overall value | 처벌 없음, 확률형·화면 가리는 광고·에너지 제한 없음(D-03, F13) | 설명 3문단, 도움말 |

> 쓰지 않는 것: '광고 없음·결제 없음'(D-05 잠정), 효능, '위기 감지', 28밤 뒤 처리, 출시 날짜를 공개 약속처럼 쓰는 말, 'AI', 최초·유일. 영문은 en-copy-review 6절 용어집을 따른다(hanji, inkstone, water dropper, the word of the day, seal은 `is stamped with its seal`, 대명사 it).

---

## 2. 답안 (en = 제출본, ko = 같은 뜻의 한국어 원작 — 한국 편집팀·오너 확인용)

> `{EN_NAME}`은 12-05 영문명 결정(D-06 R5) 뒤 바꾼다. 지금 1순위 `Mongmangi`. 앱 이름이 바뀌면 글자 수를 다시 센다.

### 2-1. Nomination Name (60자)
<!-- ans id=apple.name.en max=60 -->
```text
App Launch: {EN_NAME}: A Drop of Ink
```
<!-- ans id=apple.name.ko max=60 -->
```text
신작 출시: 몽망이 키우기
```

### 2-2. Nomination Description (1,000자)

<!-- ans id=apple.desc.en max=1000 -->
```text
{EN_NAME} is a tiny drop of ink on hanji paper, raised through handwriting. Each day you grind ink on an inkstone and write one word with a brush. {EN_NAME} drinks the letters and answers with its body.

Your writing shapes it. The longest stroke of the word stays on its body, so no two are alike. The meaning of the word seeps into how it moves, the shade of its ink, and what it dreams. At night a drop from the water dropper puts it to sleep, and the water loosens the word into a dream you lift out each morning as a card. Its body is painted in ink wash, lit from one side.

Its life is twenty-eight nights, counted in sleeps you share, not calendar days. Each seven nights leaves a picture, and on the twenty-eighth morning the grown {EN_NAME} is stamped with its seal. No scores or numbers appear on screen. Left alone, it does not fall ill or disappear.

Made by one developer in Korea. Korean and English are each written on their own, not translated.
```

<!-- ans id=apple.desc.ko max=1000 -->
```text
몽망이는 한지 위의 작은 먹 방울이고, 글씨로 키워요. 날마다 벼루에 먹을 갈고 붓으로 낱말 하나를 써요. 몽망이가 그 글자를 마시고 몸으로 대답해요.

쓴 글씨가 몽망이를 빚어요. 낱말의 가장 긴 획이 몸에 남아서 같은 몽망이는 없어요. 말의 뜻은 몸짓과 먹빛과 꿈에 스며요. 밤에는 연적의 물 한 방울로 재우고, 물이 말을 풀어 꿈이 돼요. 아침마다 그 꿈을 한지 카드로 건져 올려요. 몸은 한쪽에서 빛이 드는 수묵으로 그렸어요.

생애는 스물여덟 밤이에요. 달력 날짜가 아니라 함께 잔 잠으로 세요. 이레마다 그 무렵의 모습이 한 장 남고, 스물여덟째 아침에 다 자란 몽망이에게 낙관이 찍혀요. 화면에 점수나 수치는 없어요. 오래 비워 두어도 아프거나 사라지지 않아요.

한국의 1인 개발자가 만들어요. 한국어와 영어는 번역하지 않고 각각 따로 썼어요.
```

- 근거: 1문단 = FACTS F2, 2문단 = store-listing 3절 '쓴 말로 자라요'·F3·D-26 아트 줄, 3문단 = store-listing '밤은 함께 잔 잠으로 세요'·D-03, 4문단 = marketing-plan 10절 ③(개발자 공개 = 손만, '1인 개발' 사실만)·D-06.
- '같은 몽망이는 없어요(no two are alike)'는 '가장 긴 획이 몸에 남는다'의 결과로만 쓴다. 순위·최초 말은 아니다. 11-30 V0에서 **C′-키보드**가 되면 2문단 첫 두 문장을 다시 쓴다(store-listing 게시 조건 ①과 같음).

### 2-3. Publish Date
- 출시일이 관문으로 정해지므로(D-22·D-23) **범위(custom range)**로 낸다: Start **2027-02-23**, End **2027-03-16**(목표 시작 ~ 상한). 판정(02-11~02-16) 뒤 날짜가 정해지면 이 칸만 고친다(제출 뒤에도 수정 가능 — 1절).
- 3주 하한 계산: 02-23 출시면 02-02까지 제출. 03-02면 02-09. **02-02를 내부 마감으로 유지**한다.

### 2-4. 국가·현지화·사전 주문
| 칸 | 답 | 근거 |
|---|---|---|
| Relevant Countries or Regions | KOR, USA, CAN, GBR, AUS, NZL … 실제 배포 국가(앱 레코드에서 자동 선택된 값을 그대로) | D-06 영·한. 캐나다는 법률 회신 뒤(B안) — 앱 레코드 값이 정본 |
| Launch in certain markets first? | **No**(iOS는 소프트런칭 출시 안 함, TestFlight만 — D-23 '뺄 것') | D-23 |
| Localization | ko, en-US | D-06 |
| Pre-order 포함 | **No**(현재 결정 없음. D-18 '사전 주문은 출시일이 정해지면 다시 잡는다'). 오너가 사전 주문을 켜면 Yes로 바꾸고 날짜를 맞춘다 | D-18 |

### 2-5. In-App Event
- **이번 추천에는 붙이지 않는다(No).** 보름밤(C4 완료)은 기능이지 App Store 인앱 이벤트 레코드가 아니고, 출시 뒤 첫 보름(02-20 전후 [확인 필요])용 이벤트 카드는 아직 만들지 않았다. 이벤트 카드를 만들면 그때 추천서에 첨부한다(Help: "as early as possible").

### 2-6. Supplemental Materials (URL 5개)
| # | URL | 무엇 | 준비 시점 |
|---|---|---|---|
| 1 | TestFlight 공개 링크 | 실제 빌드(외부 테스트, 베타 심사 통과 뒤) | 01-12(D8) |
| 2 | `https://mongmang.ink/en/press` | 프레스킷: 스크린샷 원본·아이콘·영상·연락처 | 01-11 전 갱신(aso-geo Q2) + V19 반영 |
| 3 | 미리보기 영상 25초(실제 렌더) — 프레스킷 안 파일 주소 | 눈 열림 → 먹 갈기 → 쓰기·마시기·대답 → 잠 → 아침 카드 | V19(RC 01-05 뒤) |
| 4 | `https://mongmang.ink/en/facts` | 사실 페이지(FACTS, 금지 목록 포함) | 있음 |
| 5 | `https://mongmang.ink/en` | 랜딩(한 줄 + 15초 루프) | 있음 |

- 첨부 목록 전체와 촬영 연결은 `assets.md`.

### 2-7. Helpful Details (500자) — 두 판 중 하나를 고른다

**판 A — 안전 문단 없음(기본, 지금 바로 쓸 수 있음)**
<!-- ans id=apple.help.A.en max=500 -->
```text
Accessibility: with VoiceOver, the word can be typed instead of handwritten, and each answer it gives with its body is read aloud. Handwriting is read on the device. There are no loot boxes, no ads that cover the screen, and no energy limits. Made for ages 14 and up. One developer; Korean and English are each written on their own.
```
<!-- ans id=apple.help.A.ko max=500 -->
```text
접근성: VoiceOver를 쓰면 손글씨 대신 키보드로 낱말을 쓸 수 있고, 몽망이가 몸으로 하는 대답을 하나하나 읽어 줘요. 손글씨는 기기 안에서 읽어요. 확률형 아이템, 화면을 가리는 광고, 에너지 제한은 없어요. 만 14세 이상 대상이에요. 1인 개발이고, 한국어와 영어를 각각 따로 썼어요.
```

**판 B — 안전 설계 한 문단 포함(PM·QA-3 승인 뒤에만)**
<!-- ans id=apple.help.B.en max=500 -->
```text
Accessibility: with VoiceOver, the word can be typed instead of handwritten, and each answer is read aloud. Some words bring it close, and sometimes it leaves a note on where to find someone to talk to; that place is always in the Studio Notebook. On such days only the one stroke on its body is kept, so the app holds no record of the word. It does not replace counseling. Ages 14 and up.
```
<!-- ans id=apple.help.B.ko max=500 -->
```text
접근성: VoiceOver를 쓰면 키보드로 낱말을 쓸 수 있고, 대답을 하나하나 읽어 줘요. 어떤 말에는 몽망이가 곁에 오고, 때로는 이야기 나눌 곳을 적은 쪽지를 놓아요. 이야기 나눌 곳은 공방 노트에 늘 있어요. 그런 날은 몸에 붙는 한 획만 남겨서, 앱 안에 그 말을 쓴 기록이 남지 않아요. 몽망이는 상담을 대신하지 않아요. 만 14세 이상 대상이에요.
```

- 판 B 문장은 `heart-grain-48.md` 9-4 처리방침 문구 초안(QA-3 검수 대상)을 줄인 것이다. '감지한다'는 말, 효능 말, 연락처 이름은 쓰지 않았다(heart-grain 8절 마케팅 규칙). '기록이 남지 않아요'는 **앱 안** 범위로 좁혔다 — 기기 키보드 자체 학습은 약속하지 않는다(9-2 R8).
- **충돌 알림**: risk-check 1-1은 "위기 대응 기능을 홍보에 쓰지 않는다"이다. 추천서는 공개 홍보물이 아니라 편집팀에게만 가는 글이지만, 편집팀 기사로 옮겨질 수 있다. 그래서 **기본은 판 A**, 판 B는 PM·QA-3가 승인할 때만 쓴다(README 5절 결정 1).
- 두 판 모두 'VoiceOver 대답 읽기'는 설계(heart-grain 8-4) 단계다. **RC(01-05) 실기기에서 VoiceOver로 확인한 뒤에만 제출**한다(README 4절 사실 확인표 #7).

---

## 3. 제출 전 점검 (오너가 콘솔에서)

| # | 확인 | 막히면 |
|---|---|---|
| 1 | 앱 레코드가 있다(Apple Developer 가입 12-19 전, C9) | 추천서를 만들 수 없다 |
| 2 | `{EN_NAME}`을 확정 이름으로 바꿨다 | 12-05 결정 대기 |
| 3 | README 4절 사실 확인표가 모두 '확인' | 그 문장을 빼고 낸다 |
| 4 | 보조 URL 5개가 모두 열린다(로그인 없이) | 열리지 않는 것은 빼고 낸다 |
| 5 | Helpful Details 판 A/B 중 승인된 판 | 판 A |
| 6 | 콘솔 카운터로 이름 ≤ 60, 설명 ≤ 1,000, 도움말 ≤ 500 | 스크립트 값과 다르면 콘솔이 정본 |
| 7 | 'Submit Nomination' 뒤 확인 창에서 Submit | 초안 저장(Save as Draft)으로 먼저 팀 확인 가능 |
