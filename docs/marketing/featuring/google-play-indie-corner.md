# Google Play 인디 게임 코너 신청서(Indie Games / Up-and-Coming Apps Featuring Request) 초안

- 작성: 마케팅(ASO·작가) / 2026-11-25 / v0.1 — 제출 없음
- 제출: **오너**(연락 메일 = 확인 메일 링크를 눌러야 검토됨)
- 로드맵: D6 — D-26 표기 '인디 코너 **12-15 이후**'
- 답 블록 표시 `<!-- ans … -->`는 README 6절 검사 스크립트가 읽는다.

---

## 1. 공식 확인 (2026-11-25)

출처: [Indie Games/ Up-and-Coming Apps Featuring Request](https://support.google.com/googleplay/contact/indie_corners) (양식 원문, 2026-11-25 확인)

| 항목 | 원문 요지 | 우리 |
|---|---|---|
| 팀 크기 | 게임 1~15명 | 1명 — 충족 |
| 평점 | 사용자 평균 **3.8 이상** | **출시 전에는 평점이 없다.** 소프트런칭(01-12~, CA·NZ·PH) 평점이 생긴 뒤 확인 |
| 시기 | 출시가 **10주 넘게 남았으면 기다렸다 내라**. 새로 나온 게임은 **출시 1~2개월 뒤** 피처링 | 출시 02-23 목표 → **12-15부터** 낼 수 있음(10주 전). 03-16 상한이면 01-05부터 |
| 첨부 | **업로드 칸 없음**. 스토어 등록 정보(스크린샷·영상·피처 그래픽)가 사실상 자료 | `assets.md` 2절 |
| 글자 수 | 표시 없음 | 자유 글 한 칸만 — 500자 안팎으로 짧게 |
| 심사 | 기준을 충족하는지 본다. 찾는 것은 "high quality, fun, quirky hidden gems". 더 필요할 때만 연락 | — |
| 앱 쪽(Apps Innovation Corner) | 미국 기반 개발자만 | 우리는 게임 쪽만 해당 |

> **기존 문서 정정**: number-one 2절·DECISIONS D-18의 'Google 인디 코너 신청 **출시 후 10주 안**'은 원문과 다르다. 원문은 "출시가 10주 **넘게 남았으면 기다려라**"(= 출시 10주 **전부터** 낼 수 있음)이다. 로드맵 D6의 '12-15 이후'는 원문과 맞다. 이 정정은 PM에게 올린다(README 5절 결정 4) — DECISIONS는 고치지 않았다.

---

## 2. 양식 질문과 답 (원문 순서)

| # | 질문(원문) | 필수 | 답 | 메모 |
|---|---|---|---|---|
| 1 | App or Game? | 필수 | **Game** | |
| 2 | Does your game meet all of the above minimum requirements? | — | **Yes — 평점 3.8 이상을 콘솔에서 확인한 날에만** | 평점이 없거나 3.8 미만이면 내지 않는다(거짓 답 금지) |
| 3 | Developer (company) name | 필수 | Play 개발자 계정 표시 이름 그대로 [오너 기입] | 판매자명 = 오너 실명(store-listing 9절). 공개 범위는 콘솔과 같음 |
| 4 | Team size | 필수 | **1** | |
| 5 | Outside investment range | — | **$0-$5M**(실제 투자 0원) | 보기 중 0을 포함하는 칸 |
| 6 | Contact e-mail | 필수 | 오너가 확인 링크를 누를 수 있는 주소 — `hello@mongmang.ink`(Cloudflare 라우팅 → 오너 Gmail, DECISIONS 11-24) | 확인 메일 링크를 꼭 누른다(원문) |
| 7 | Contact name | 필수 | [오너 기입] | |
| 9 | Game name | 필수 | 스토어 등록 이름 그대로: `몽망이 키우기` / 영어 스토어는 `{EN_NAME}: A Drop of Ink` | 둘 중 어느 쪽을 쓸지: Play 기본 언어 이름 [오너가 콘솔 값 확인] |
| 11 | Package ID | 필수 | **`com.piousangel.mongmange`** | apps/mobile/app.json `android.package` |
| 12 | Current development stage | 필수 | **Soft launched**(01-12 소프트런칭 뒤). 출시 뒤에 내면 Released | Open Beta(비공개 테스트)는 평점 조건 때문에 고르지 않는다 |
| 13 | Business model | 필수 | **F2P** | 무료 내려받기(F7). 1.0 수익 모델은 D-05 [잠정] — 'Premium' 아님 |
| 15 | Planned (full) launch date | 필수 | 판정(02-11~02-16) 전에 내면 **2027-02-23**(목표 시작), 판정 뒤면 정해진 날 | 날짜를 바꿀 길이 양식에 없다 → 판정 뒤 제출을 권함(3절) |
| 17 | Device optimization | 필수 | **Phone** | 태블릿 대응 확인 전 |
| 18 | Other significant updates | — | 아래 2-1 | 원문 예: 새 레벨, 큰 변경 |

### 2-1. Other significant updates (자유 글, 상한 표시 없음 — 우리 기준 500자)

<!-- ans id=google.updates.en max=500 -->
```text
{EN_NAME} is a tiny drop of ink on hanji paper, raised through handwriting. Each day you write one word with a brush; it drinks the letters and answers with its body. The longest stroke stays on its body, and the word's meaning colors how it moves and dreams. Its life is twenty-eight nights, counted in sleeps. Soft launched in Canada, New Zealand and the Philippines; full launch in Korean and English follows.
```

<!-- ans id=google.updates.ko max=500 -->
```text
몽망이는 한지 위의 작은 먹 방울이고, 글씨로 키워요. 날마다 붓으로 낱말 하나를 쓰면 몽망이가 그 글자를 마시고 몸으로 대답해요. 가장 긴 획은 몸에 남고, 말의 뜻은 몸짓과 꿈에 스며요. 생애는 함께 잔 잠으로 세는 스물여덟 밤이에요. 캐나다·뉴질랜드·필리핀에서 소프트런칭 중이고, 한국어·영어 정식 출시가 이어져요.
```

- 양식은 영어다. 한국어는 오너 확인용 같은 뜻 원작이다(한국 편집팀이 볼 가능성 [팀 추정]).
- '01-26 스토어 업데이트(위젯·실제 걸음)'는 넣지 않았다 — D-27 [잠정], 실제 걸음은 01-19 준비 여부로 1.1이 될 수 있다. 업데이트가 실제로 배포된 뒤에 내면 한 문장 더한다: `A home-screen widget arrived in the first update.` / `첫 업데이트에서 홈 화면 위젯이 들어왔어요.`(배포 확인 뒤에만)
- 캐나다를 빼는 B안(DECISIONS 11-24 ⑤)으로 바뀌면 국가 이름을 고친다.

---

## 3. 언제 낼까

| 안 | 날짜 | 장점 | 단점 |
|---|---|---|---|
| ① 가장 이르게 | 12-15~01-11 | 10주 조건 충족 | **평점이 없다** → 2번 질문에 Yes를 쓸 수 없음. 쓰지 않는다 |
| **② 권장** | **01-26~02-09** — 소프트런칭 2주 뒤 평점 ≥ 3.8 확인한 날 | 평점 조건 충족, 출시 날짜가 판정(02-11~02-16) 직전이라 거의 맞음 | 표본이 작아 평점이 흔들릴 수 있음 |
| ③ 판정 뒤 | 02-16~출시일 | 출시 날짜를 정확히 씀 | 출시까지 1~2주뿐. 피처링은 어차피 출시 1~2개월 뒤라 손해 작음 |

- 권장: **②, 늦어도 ③(출시일 전)**. 평점이 3.8 미만이면 내지 않고, 정식 출시 뒤 평점이 오르면 'Released'로 낸다.
- 피처링 기대 시점(원문): 출시 1~2개월 뒤 → 03~04월. 평점 요청(이레째 아침 1회, number-one ⑤)이 이 조건과 이어진다.
