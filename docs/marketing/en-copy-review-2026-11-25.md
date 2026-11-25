# 영문 문구 검수 보고서 (로드맵 D4 준비)

- 작성: 마케팅 · 영문 작가 / 2026-11-25 / v0.1
- 범위: `apps/mobile/src/i18n/en.ts` · `docs/release/store-listing.md` 영어 부분 · `apps/web-static`(`scripts/site.mjs` FACTS·UI en, `src/delete/index.html` en) · `docs/release/privacy-policy.en.md`·`privacy-policy-tester.en.md`의 머리와 쉬운 말 요약 · `docs/marketing/launch-4weeks/week1`의 영어 원고(`bluesky-en.md`, `instagram.md`·`short-videos.md`의 영어 줄)
- 기준 독자: 소프트런칭 국가 **캐나다(en-CA)·뉴질랜드(en-NZ)·필리핀(en-PH)** 성인(만 14세 이상). 스토어 영어 판은 하나(en-US 철자 기준)로 두고, 철자가 갈리는 낱말은 되도록 피하는 쪽을 권한다.
- **이 보고서는 파일을 고치지 않았다.** 다른 담당이 i18n·store-listing·web-static을 동시에 고치는 중이라 제안 문장만 적는다. 줄 번호는 2026-11-25 작업 시점 기준이다.
- 심각도: **높음** = 오역·문화권 오해·안전/법 문구 오류로 게시 전 반드시 고침 / **중간** = 어색함·용어 불일치·접근성으로 RC 전 고침 / **낮음** = 다듬기.

---

## 0. 먼저 볼 것 (높음 7건 요약)

| # | 자리 | 문제 | 한 줄 처방 |
|---|---|---|---|
| H1 | en.ts 213·228·272 `washi` | 'washi'는 **일본 종이** 이름이다. 스토어가 `sumi`를 뺀 것과 같은 이유로, 한국 한지 정체성이 흐려진다 | `hanji` 또는 `paper` |
| H2 | site.mjs 146 `See you in winter` | 뉴질랜드는 1월이 **한여름**, 필리핀은 겨울이 없다. 북반구 계절 가정 | `Still in the making` 등 계절 없는 말 |
| H3 | heart-grain-48 8-4 도움말 `you can call 911` (처리방침 2절 연결 문구) | 뉴질랜드 긴급 번호는 **111**. 도움말에 911이 고정돼 있다 | 긴급 번호는 원격 매니페스트 국가 값으로 끼운다 |
| H4 | 8-4 늘 있는 항목 본문 `you can text`·`It's free` | 필리핀 NCMH는 **전화만**, NZ 0508 828 865는 문자 없음·24시간 아님. 모든 나라 같은 문장이면 거짓이 된다 | 본문을 나라별로 나눈다(5절) |
| H5 | site.mjs 92 `Set it down at the water dropper.` | 한국어 의례 이름 '내려놓기'를 직역해, 영어로는 '몽망이를 연적에 내려놓으라'로 읽힌다(오역) | `At night, a drop from the water dropper puts it to sleep.` |
| H6 | en.ts 전체(특히 59~68·135~136·304~323) | 앱 문구가 아직 **v2 '하루 한 획'** 이다. 스토어·사이트·SNS는 v3 '하루 한 마디'. 영어 유저가 스토어에서 읽은 것과 앱이 다르다 | v3 키 작업 때 이 보고서의 용어집(4절)으로 함께 쓴다 |
| H7 | 개인정보 쉬운 말 머리(`privacy-policy.en.md:12`, `tester.en.md:9`) | '14세 미만도 읽어 주세요' + '부모나 다른 어른과 함께 메일' → 해외 독자에게 **어린이 대상 앱**으로 읽힌다(D-06 아동 오인 금지와 충돌). 'another adult'는 법적 표준어가 아님 | `parent or guardian`, 머리 문구 교체(3-4절) |

---

## 1. 앱 문구 `apps/mobile/src/i18n/en.ts`

> 전제: 이 파일은 v2(획) 기준이다(H6). 아래는 v3에서도 살아남는 키와 문장 자체의 문제를 본다.

| 파일:줄 | 지금 문장 | 문제 | 제안 문장 | 심각도 |
|---|---|---|---|---|
| en.ts:213 | `washi on the line` | 문화권 오해 — washi는 일본 종이(H1) | `hanji on the line` (낯설면 `paper on the line`) | 높음 |
| en.ts:228 | `Two sheets of washi paper sway on a line` | 같음 | `Two sheets of hanji sway on a line` | 높음 |
| en.ts:272 | `Sheets of washi swayed on a line` | 같음 | `Sheets of hanji swayed on a line` | 높음 |
| en.ts:19 | `Double-tap to touch it` | 접근성 — VoiceOver·TalkBack은 '두 번 탭' 안내를 스스로 읽는다. 힌트에 제스처를 넣으면 두 번 들린다(Apple 힌트 지침: 결과를 동사로) | `Touches the drop of ink` | 중간 |
| en.ts:52 | `Double-tap to pet` | 같음 | `Pets ${M}` | 중간 |
| en.ts:124 | `Double-tap to close` | 같음 | `Closes the sheet` | 중간 |
| en.ts:48 · 363 | `(press and hold)` · `Long press for the pattern letters` | 용어 불일치 + 'pattern letters' 뜻 불분명. Apple 표준은 'touch and hold' | 48: `{name} · {label} (touch and hold)` / 363: `Seal, with its own chipped edge. Touch and hold to see its pattern code` | 중간 |
| en.ts:40 | `Picks this ink and grinds it. ${M}'s strokes will take this ink` | 'take this ink' 어색 | `Picks this ink and grinds it. ${M}'s strokes will be in this ink` | 낮음 |
| en.ts:56 · 131 | `Studio notebook` / `Studio Notebook` | 대소문자 불일치(native-review 51행과 같은 지적) | 고유 이름으로 **`Studio Notebook`** 통일 | 낮음 |
| en.ts:70 | `…the original is kept safe on this device` | 'kept safe'가 기능 이름 **Keep it safe**(클라우드 보관)와 겹쳐 '서버에 맡겨졌나?'로 오해 | `Your ${M}'s save couldn't be read · the original is still on this device` | 중간 |
| en.ts:77 · 82 vs store-listing:131 | `when the dream surfaces` · `has surfaced` / 스토어 `when a dream has developed` | 같은 사건(꿈 현상) 동사가 두 개 | 앱 그림(물 위로 떠오르는 종이)에 맞춰 **surface**로 통일. 스토어 쪽 제안은 2절 | 중간 |
| en.ts:114 · 117 | `The First Seven Days` · `${M}'s seven nights` | 생애는 '밤(잠)'으로 센다(D-07·D-26). 제목은 days, 부제는 nights로 섞임 | `The First Seven Nights` (용어집 '이레') | 중간 |
| en.ts:119 | `Slow-spread / Quick-breath / Fine-tip / Firm-stroke / Own-pace / Close-by / Homebody / Far-gazer` | 'Own-pace'는 영어 명사가 아니고, 'Quick-breath'는 숨이 가쁘다는 뜻(불안·호흡곤란 연상), 'Homebody'만 일상어라 결이 섞임 | 붓 은유로 묶은 안: `Slow Bloom / Quick Spark · Fine Tip / Bold Stroke · Own Corner / Close By · Homebody / Wanderer` — D-17대로 원어민 2명 이상 평정 | 중간 |
| en.ts:227 | `…beside an inkstone, a stone for grinding ink, pooled with water` | 끼운 풀이 때문에 'pooled with water'가 무엇에 걸리는지 흐림. 스크린리더 문장이 길다 | `${M} sleeps curled beside an inkstone pooled with water` (풀이는 obj.inkstone 첫 안내로 충분) | 낮음 |
| en.ts:254~268 | `it watches small things lately` · `it nuzzles your finger lately` · `it favors no direction lately` 등 | 문법 — 'lately'는 현재완료(진행)와 쓴다. 현재 단순형 + lately는 비문 | `lately it's been watching small things` · `lately it's been nuzzling your finger` · `lately it leans no particular way` (favors/favours 철자 갈림도 피함) | 중간 |
| en.ts:322~323 | `you showed it all around yesterday` / `you showed it just one spot yesterday` | 'showed it all around'는 '여기저기 구경시켜 줌'으로 읽힘(오역). 원뜻은 여러 곳을 톡톡 건드림 | `you tapped all around it yesterday` / `you tapped just one spot yesterday` ('touched it all over'는 성적 뉘앙스 — 쓰지 않음) | 중간 |
| en.ts:356 · 357 | `Our ${M}` · `Open our ${M}'s name tag` | 한국어 '우리'의 직역. 혼자 쓰는 앱에서 'our'는 운영사와 공유하는 것처럼 읽힘 | `Name tag` · `Open ${M}'s name tag` | 중간 |
| en.ts:336 · 343 | `Up to 12 letters, or 6 Hangul syllables` | 숫자·공백도 되는데 'letters' | `Up to 12 characters, or 6 Hangul syllables` | 낮음 |
| en.ts:249 · 299 | `gourd dipper` | 캐나다·뉴질랜드 독자에게 낯섦(필리핀은 'tabo'가 익숙). 장면 설명이라 뜻은 통함 | 그대로 두되 원어민 검수 항목에 넣음. 대안 `gourd ladle` | 낮음 |
| en.ts:333 · 77 | `What shall we call this one?` · `Shall we let you know…` | 'Shall we'는 격식·영국식. 북미 독자에게 조금 딱딱하나 톤(절제·우아)에는 맞음 | 33: 그대로 / 77: `Want a note each morning when the dream surfaces?`(선택) | 낮음 |
| en.ts:113 | `${M}: A Drop of Ink · App Store · Google Play` | 이름 확정 전 문구. 출시 전 카드는 이 줄을 잘라 냄(week1 README 0-7) | 이름 확정 뒤 `MONG_EN` 상수 한 곳만 바꿈. 상표 표기는 Apple·Google 배지 지침 [확인 필요] | 낮음 |

## 2. 스토어 문구 `docs/release/store-listing.md` (영어 부분)

| 파일:줄 | 지금 문장 | 문제 | 제안 문장 | 심각도 |
|---|---|---|---|---|
| store-listing.md:39 | 부제 `Raise it with one word a day` (28자) | 'it'이 가리킬 것이 없다(부제는 이름 아래 단독으로 보임). 'raise it'은 '들어 올리다'로도 읽힘. 'pet'이 없어 검색 낱말(virtual pet)도 놓침 | `A tiny ink pet, one word a day` (30자, 상한 딱 맞음) 또는 `An ink pet that grows on words` (30자) | 중간 |
| store-listing.md:48 | `One word in ink, twenty-eight nights. Write a word; it answers with its body.` (77자) | 'answers with its body'는 영어로 몸으로 '응답한다'가 아니라 어색한 직역(12절 남은 위험 ①과 같은 지적). 세미콜론은 모바일 짧은 설명에서 딱딱함 | `One word in ink, twenty-eight nights. Write a word, and watch it answer.` (72자) | 중간 |
| store-listing.md:50 | `…and it drinks the letters and answers with its body.` | 같음 | `One word in ink, twenty-eight nights. Write one word each day; it drinks the letters and answers with a small gesture.` | 중간 |
| store-listing.md:105 | `A single drop of ink falls onto hanji paper.` | 좋음. 첫 언급 'hanji paper'는 풀이 역할로 유지 | 그대로 | — |
| store-listing.md:109 | `Mongmangi drinks the letters and answers with its body.` | 위와 같음 | `Mongmangi drinks the letters and answers with a gesture.` | 중간 |
| store-listing.md:113 | `How long you grind sets how much ink there is and how dark it is.` | 문장이 무겁다 | `The longer you grind, the more ink there is, and the darker it gets.` | 낮음 |
| store-listing.md:114 | `Write the word of the day with the brush: a single word.` | 'word of the day'와 'a single word' 중복 | `Then write the word of the day with the brush — just one word.` | 낮음 |
| store-listing.md:120 | `Each seven nights leaves a picture… the grown Mongmangi receives its seal.` | 'Each seven nights' 비문. 'receives its seal'은 바다표범(seal)으로도 읽힘(12절 위험 ①) | `Every seven nights leaves a picture of who it is becoming, and on the twenty-eighth morning the grown Mongmangi is stamped with its seal.` | 중간 |
| store-listing.md:124 | `…counted in sleeps you share… Skipping a day doesn't shorten them.` | 'sleeps'를 세는 말은 NZ·호주에서 아이 말투('three more sleeps')로 들림 — 톤은 귀엽지만 유지 가능. 'shorten'은 논리가 반대(빼먹으면 줄어드는 게 아니라 미뤄짐) | `The twenty-eight nights are counted in sleeps, not calendar days. Missing a day costs you nothing.` | 낮음 |
| store-listing.md:125 | `It's glad when you come back.` | 감정 단정(12절 '감정 단정' 검사 취지). 한국어 정본은 '반겨요' | `It greets you when you come back.` | 중간 |
| store-listing.md:131 | `You'll hear when a dream has developed.` | 'hear'는 소리 알림으로 읽힘. 동사 '현상'은 앱과 불일치(1절) | `You'll get one notification when a dream surfaces. Any other notification comes only if you turn it on.` | 중간 |
| store-listing.md:138 | `What you raise is not for sale.` | '유저가 팔 수 없다'로도 읽힘. 원뜻은 '우리가 키운 결과(모양)를 팔지 않는다'(D-05) | `We don't sell looks or growth — what it becomes comes from your hand.` 짧게는 `We don't sell what your Mongmangi becomes.` | 중간 |
| store-listing.md:162 | 키워드 `…inkwash,cozy,…` | 'inkwash'는 보통 두 낱말(`ink wash`). `cozy`는 NZ·영연방 철자 `cosy`로 찾는 사람이 있음 | `ink wash`는 이름·부제와 따로 매기는 Apple 규칙상 `inkwash` 유지 가능 [콘솔 확인]. 여유 바이트가 생기면 `cosy` 추가. App Store의 NZ 스토어가 어떤 영어 지역화를 읽는지 [확인 필요] | 낮음 |
| store-listing.md:334 | 캡션 `It drinks the letters and answers with its body` | 위와 같음 | `It drinks the letters and answers` | 중간 |
| store-listing.md:305 | `Saves your morning card to Photos.` | 좋음(목적을 말함) | 그대로 | — |

## 3. 사이트·개인정보

### 3-1. `apps/web-static/scripts/site.mjs` FACTS·UI (en)

| 파일:줄 | 지금 문장 | 문제 | 제안 문장 | 심각도 |
|---|---|---|---|---|
| site.mjs:146 | `See you in winter` | 문화권 — NZ는 1월이 여름, PH는 겨울 없음(H2) | `Still in the making` / winterBody 그대로 | 높음 |
| site.mjs:92 (day[2]) | `Set it down at the water dropper. The water loosens…` | 오역(H5). 스토어 115행과도 다름(FACTS가 정본이라 스토어보다 먼저 고쳐야 함) | `At night, a drop from the water dropper puts it to sleep. The water loosens the word into that night's dream.` | 높음 |
| site.mjs:92 (day[1]) | `Write the word of the day with the brush, a single word.` | 쉼표 접속이 어색 | `Write the word of the day with the brush — just one word.` | 낮음 |
| site.mjs:151 (howNote) | `After 28 nights, a Mongmangi grown from the words you wrote remains.` | 'remains'(남다)는 명사 '유해'를 떠올리게 하고, 28밤 뒤 '떠남' 결정 전 문장처럼 읽힘 | `After 28 nights, you have a Mongmangi grown from the words you wrote.` | 중간 |
| site.mjs:107~109 | `…is being built to be read on your device.` 외 2줄 | 'being built to be'가 세 번 반복, 수동 겹침 | `We're building it so the word you write each day is read on your device.` / `Usage statistics will be off by default, sent only if you pass the age check and turn them on.` / `Share links and cloud backup will exist only if you turn them on, and you can delete them in the app.` | 낮음 |
| site.mjs:111 | `Selling what you raised (strokes, ink, grain)` | 'grain'은 v2 내부어라 뜻이 안 통함. 'strokes'도 v2 | `Selling looks or growth (its body, ink or nature)` | 중간 |
| site.mjs:115 | `We do not put in loot boxes or ads that cover the screen.` | 'put in' 구어·어색 | `It is free to download. There are no loot boxes and no ads that cover the screen.` | 낮음 |
| site.mjs:148 (tester[1]) | `…a Gmail address signed in to Google Play.` | 주소가 로그인하지 않음 | `…an Android phone signed in to Google Play with a Gmail address.` | 낮음 |

### 3-2. `apps/web-static/src/delete/index.html` (en)

| 파일:줄 | 지금 문장 | 문제 | 제안 문장 | 심각도 |
|---|---|---|---|---|
| delete/index.html:69 | `Studio Notebook → Delete what's kept on the server` | 앱 en.ts에 이 메뉴 문구가 아직 없다. 앱 라벨과 글자 그대로 같아야 찾을 수 있음 | 앱 키를 만들 때 이 문구로 맞추거나 양쪽을 `Delete what's on our server`로 | 중간 |
| delete/index.html:60 | `there is an anonymous account on our server` | 뜻은 정확. 조금 딱딱함 | 그대로(법적 정확성 우선) | — |

### 3-3. `docs/release/privacy-policy.en.md` 머리·쉬운 말 요약

| 파일:줄 | 지금 문장 | 문제 | 제안 문장 | 심각도 |
|---|---|---|---|---|
| privacy-policy.en.md:1 | `Privacy Policy — [English app name — set after the name test]` | 자리표시. 이름 확정 뒤 | `Privacy Policy — {EN_NAME}` | — |
| privacy-policy.en.md:12 | `In plain words first (please read this too if you are under 14)` | H7 — 대상이 14세 이상인데 '14세 미만 독자'를 부르는 머리 | `In plain words first` | 높음 |
| privacy-policy.en.md:14 | `The Mongmangi game runs inside your phone. The handwriting you write with the brush is read only inside your phone.` | 'inside your phone'은 어색(영어는 *on* your phone), 'handwriting you write' 중복 | `The game runs on your phone. What you write with the brush is read only on your phone.` | 낮음 |
| privacy-policy.en.md:16 | 한 문장에 세 흐름 | 쉬운 말 요약치고 길다 | `A few things leave every phone: the App checking for a new version, downloads of game files and the handwriting tool, and reports Google's handwriting tool sends Google about how well it works. Your handwriting is not in any of them.` | 낮음 |
| privacy-policy.en.md:18 | `…email hello@mongmang.ink together with a parent or another adult.` | 'another adult'는 법 문서 표준어가 아니고, 성인 독자에게도 부모 동반을 요구하는 것처럼 읽힘. 캐나다(퀘벡 Law 25 14세 기준)·NZ·PH 모두 표준 표현은 **parent or guardian** | `If you have a question or want something deleted, email hello@mongmang.ink. If you are under 14, please ask a parent or guardian to help.` | 높음 |
| privacy-policy.en.md:55 | `…leaves a note with places where you can talk to someone. … Mongmangi is not a substitute for support from people.` | 뜻 맞음. 'support from people'은 어색 | `…sometimes leaves a note listing places where you can talk to someone. … Mongmangi can't take the place of support from real people.` | 낮음 |

### 3-4. `docs/release/privacy-policy-tester.en.md` 머리·쉬운 말 요약

| 파일:줄 | 지금 문장 | 문제 | 제안 문장 | 심각도 |
|---|---|---|---|---|
| tester.en.md:9 | `(please read this too if you are under 14)` | H7. 게다가 테스트 신청은 14세 이상만 가능(60행)이라 모순 | `In plain words first` | 높음 |
| tester.en.md:11 | `runs inside your phone` · `read only inside your phone` | 3-3과 같음 | `runs on your phone` · `read only on your phone` | 낮음 |
| tester.en.md:15 | `…together with a parent or another adult.` | 테스터는 14세 이상인데 어른 동반 요구 | `If you have a question or want something deleted, email hello@mongmang.ink.` | 중간 |
| tester.en.md:3 | `distributed from December 19, 2026` | 날짜 표기 — 캐나다·필리핀은 '월 일, 연'이 자연스럽고, NZ는 '19 December 2026'이 표준. 법 문서에서는 모호하지 않으면 됨 | 그대로(월 이름을 써서 모호함 없음) | — |

## 4. 1주차 영어 원고 `docs/marketing/launch-4weeks/week1`

| 파일:줄 | 지금 문장 | 문제 | 제안 문장 | 심각도 |
|---|---|---|---|---|
| bluesky-en.md:20 | `For 28 nights I'll post a morning a day of my own Mongmangi.` | 'a morning a day of'가 꼬임 | `For the next 28 nights, I'll post one morning from my own Mongmangi each day.` | 중간 |
| bluesky-en.md:16 | `I'm making a small game on my own about raising a drop of ink.` | 'on my own'이 'about'과 붙어 읽힘 | `I'm making a small game about raising a drop of ink. Just me.` (말투가 과하면 `I'm making it on my own.`을 뒤로) | 낮음 |
| bluesky-en.md:32 | `The first word I gave it was 눈 (snow).` | 좋음. 다만 '눈'은 snow·eye 둘 다라는 점이 훅이 됨 | 선택: `…was 눈 (snow — the same word means "eye").` | 낮음 |
| bluesky-en.md:61 | `a test version is out on Android in a few countries` | 소프트런칭 나라 독자는 '우리 나라인가'를 먼저 묻는다 | `…out on Android in Canada, New Zealand and the Philippines.` (게시 조건이 실제 개방국과 같을 때) | 중간 |
| bluesky-en.md:87 · 99 · 111 | `Its two tufts…` | 빗(E 빗)을 'tufts'로 씀. 앱·스토어에는 이 부위 영어 이름이 없음 → 용어집으로 고정 | 용어집 '빗' = **tuft(s)** 로 확정하고 앱 a11y에도 같은 말 | 낮음 |
| bluesky-en.md:127 · instagram.md:44 | `Night 7, the end of the first week` · `Night 7 · first week` | 앱 두루마리 제목 `The First Seven Days`와 다름 | 앱을 `The First Seven Nights`로 맞추면 원고는 그대로 | 낮음 |
| instagram.md:28 | `All game images here are real screens.` | 'real screens' 어색 | `Every game image here is a real screenshot.` | 낮음 |
| instagram.md:28 | `…Mongmangi drinks the letters and answers with its body, over twenty-eight nights.` | 2절 'answers with its body'와 같음 | `…Mongmangi drinks the letters and answers with a gesture. It grows over twenty-eight nights.` | 중간 |
| short-videos.md:40 | `Write one word a day, and it answers with its body.` | 같음 | `Write one word a day, and it answers.` | 중간 |
| short-videos.md:31 · 68 | `#cozygames` | NZ 철자는 cosy지만 해시태그 커뮤니티는 `#cozygames`가 표준 | 그대로 | — |

---

## 5. 안전 문구 따로 보기 (위기 '이야기 나눌 곳')

정본: `docs/design/concept-v3/heart-grain-48.md` 8-4·8-6, 확인 출처: `docs/design/concept-v3/reviews/2026-11-24-crisis-expert-review.md`(988.ca, kidshelpphone.ca, 1737.org.nz, mentalhealth.org.nz, findahelpline NCMH). 처리방침 en 55행이 이 기능을 설명한다.

| 자리 | 지금 en | 각국 표준과 대조 | 제안 | 심각도 |
|---|---|---|---|---|
| 항목 제목 | `Someone to talk to` | NZ 1737 공식 문구가 'Need to talk?'로 같은 결. 진단어·감시 표현 없음 | 그대로 | — |
| 항목 본문 | `On heavy days, it can help to talk with someone. It's free, you don't have to give your name, and you can text.` | ① 'heavy days'는 덜 쓰는 말 ② **필리핀 NCMH는 문자 없음**, NZ 0508 828 865도 문자 없음 ③ 'free'는 NCMH 휴대전화 번호(0919·0917)가 통신사 요금 무료인지 1차 확인 못 함 [확인 필요] ④ '이름을 말하지 않아도'는 988·KHP·1737 모두 익명 가능 안내와 맞음 | 나라별 문장: **CA/NZ** `On hard days, it can help to talk with someone. It's free, you don't have to give your name, and you can call or text.` / **PH** `On hard days, it can help to talk with someone. You don't have to give your name, and you can call any time of day.` ('free'는 확인 뒤 넣음) | 높음 |
| strong 쪽지 | `You don't have to get through hard days alone. There are people you can talk to right now.` · `[Text] [Call]` · `If you're in danger right now, call 911 (NZ 111)` | 'right now'는 24/7 번호(988·KHP·1737·NCMH)를 첫 줄에 둘 때만 참. 괄호로 다른 나라 번호를 붙이면 화면에서 혼란. PH는 [Text] 버튼이 없어야 함 | `If you or someone else is in immediate danger, call {EMERGENCY}.` — CA·PH `911`, NZ `111`을 매니페스트에서 끼움(캐나다 988.ca·NZ 1737 안내의 'immediate danger' 표현과 같은 결). 버튼은 나라 매니페스트의 채널만 | 높음 |
| 도움말 | `Mongmangi isn't a substitute for support from people. 'Someone to talk to' is always in your notebook. If you're in danger right now, you can call 911.` | **NZ 111 누락(H3)**. 'support from people' 어색 | `Mongmangi can't take the place of support from real people. "Someone to talk to" is always in your Studio Notebook. If you or someone else is in immediate danger, call {EMERGENCY}.` | 높음 |
| 곁 대답 a11y | `Mongmangi comes close and breathes with you` | 자연스러움. 위기만 튀지 않는 설계와 맞음 | 그대로 | — |
| 쪽지 a11y | `A note was left for you.` | 좋음 | 그대로 | — |
| 이름 거절 | `This name can't be used. Want to try another?` | 좋음 | 그대로 | — |
| 처리방침 en:55 | 3-3 표 참고 | 기능 설명은 정확 | 3-3 제안 | 낮음 |

- 문장 규칙 점검: 'safe', 'secret', 'confidential'(비밀 보장) 약속 없음 — 맞다(NCMH·KHP도 위험 시 비밀 보장 예외가 있음). 'We noticed' 같은 감시 표현 없음 — 맞다.
- 캐나다 퀘벡: 988은 퀘벡에서 프랑스어 서비스로 이어진다. 앱은 영·한만이라 영어 문구 그대로 두되, 퀘벡 별도 번호(1-866-APPELLE)는 1차 확인 전이라 넣지 않는다(정본 8-6과 같음).

---

## 6. 세계관 용어집 초안 (en)

원칙: ① 한국 사물은 **영어 일반명**으로 쓰고 한국어 음차는 정체성을 지키는 두 낱말(hanji·Hangul)만 ② 일본어 대체어(washi·sumi) 금지 ③ 기능 이름은 대문자 고유명(Keep it safe, Share by link, Studio Notebook) ④ 몽망이 대명사는 **it** ⑤ 생애는 **nights**로 센다.

| 한국어 | 영어(확정 제안) | 쓰지 않을 말 | 메모·근거 |
|---|---|---|---|
| 몽망이 | `{EN_NAME}`(지금 Mongmangi), 대명사 **it** | he/she, the pet | brand.ts `MONG_EN` 한 곳 |
| 몽망이 키우기 | (한국어 제목 그대로) | — | 처리방침 'Korean title' |
| 먹 | **ink** | sumi | |
| 먹 방울 | **a drop of ink** | inkdrop, ink blob | 'Inkdrop'은 기존 노트 앱 상표(아래 7절) |
| 먹(먹 자루) | **ink stick** | inkbar | en.ts:38 |
| 한지 | **hanji** (첫 언급 `hanji paper`, 이후 `paper`) | **washi**, rice paper | H1 |
| 벼루 | **inkstone** | ink slab | |
| 붓 | **brush** | pen | |
| 연적 | **water dropper** | water bottle | |
| 먹 갈기 | **grind ink** | rub ink | |
| 한 마디(하루 한 마디) | **the word of the day** / **one word** | phrase, sentence | D-26 |
| 획 | **stroke** | line | v3에서는 글씨 안 획 |
| 글씨의 가장 긴 획 | **the longest stroke of your writing** | | |
| 말결(48) | 화면에 내지 않음. 법 문서 **the word's category** | mood, emotion, feeling | 효능·감정 금지어 회피 |
| 결 / 결 이름 8 | 화면어 **nature** (예: `Its nature: Wanderer`) | type, personality type | DECISIONS '유형' 금지 |
| 빗(E 빗) | **tuft(s)** | comb, crest, horns | week1 원고와 같음 |
| 이레 | **week** (제목은 `The First Seven Nights`) | ire, seven-day | |
| 스물여덟 밤 | **twenty-eight nights** (본문), **28 nights** (좁은 칸) | 28 days | |
| 함께 잔 잠 | **sleeps** | days | |
| 꿈 카드 | **dream card** | | |
| 꿈 현상 | **surface** (dream surfaces) | develop(인쇄 공정 장면 `share.busy`에서만) | 1절 |
| 두루마리 | **scroll** | | |
| 화첩 | **album** | gallery | en.ts:162 |
| 공방 노트 | **Studio Notebook** | studio notebook, settings | |
| 낙관 | **seal** — 동사 `is stamped with its seal` | receives its seal | 2절 |
| 인장 / 인장 코드 / 인장 무늬 | **seal / seal code / seal pattern** | stamp ID | delete 페이지와 같음 |
| 이름표 | **name tag** | ID card | |
| 맡겨 두기 | **Keep it safe** | cloud save(본문 풀이로만 `cloud backup`) | |
| 링크로 공유 | **Share by link** | | |
| 되찾기 글귀 | **recovery phrase** | password, seed phrase | |
| 밤물 | **Night Water** | | 처리방침 4절 |
| 밥 / 간식 | **a spoonful of ink / a treat** | food, feeding time | 배고픔 말 금지(D-27) |
| 마실 | **stroll** | walk(실제 걸음과 구분) | |
| 곁 대답 | **comes close** (`stays close`) | comfort, support mode | |
| 이야기 나눌 곳 | **Someone to talk to** | Crisis help, Hotline | 5절 |
| 송연·유연·자연·송화 | Pine-soot · Oil-soot · Violet-smoke(현 Plum-smoke) · Pine-pollen **ink** | | 자연 = 紫煙, hue가 'purplish'라 Violet이 더 직관적 — 원어민 평정 |
| 정 | 화면에 내지 않음. 내부 **bond** | love, affection meter | |
| 타고남 | 화면에 내지 않음. 내부 **birth traits** | DNA, genes | |

---

## 7. 영문 앱 이름 후보 (12-05 오너 결정용)

### 7-1. 지금 쓰는 이름

- 문서 기준(DECISIONS D-06 R5·D-17, `brand.ts`, store-listing 1-2): 한국어 **몽망이 키우기**, 영어 임시 **Mongmangi: A Drop of Ink**(R5 1순위), 후보 ② `Mong-mangE` ③ `mongmangE`(오너 원안), 내부명 `mongmange`. 판정은 이름 테스트 '첫인상 한 낱말'에서 피부병·mange 연상 10명 중 1명 이상이면 탈락.

### 7-2. 조사 방법과 한계 (1차)

- **상표**: USPTO는 Trademarkia 공개 색인으로 검색(USPTO tmsearch·CIPO·EUIPO·WIPO는 자바스크립트 화면이라 이 환경에서 결과를 읽지 못함 — CIPO는 빈 결과표만 보임). **캐나다·EU·필리핀(IPOPHL)·NZ(IPONZ) 조회는 사람이 직접 해야 한다**(아래 링크). 1차 결과는 '충돌 신호 없음'이지 '등록 가능'이 아니다. 출시·정책 담당의 확정 조회 필요(D-06).
  - USPTO: https://tmsearch.uspto.gov · CIPO: https://ised-isde.canada.ca/cipo/trademark-search/srch · EUIPO: https://euipo.europa.eu/eSearch · IPONZ: https://app.iponz.govt.nz/app/Extra/IP/TM/Qbe.aspx · IPOPHL: https://www3.wipo.int/branddb/ph/en/ · WIPO Global Brand DB: https://branddb.wipo.int
- **스토어**: App Store는 iTunes Search API(`itunes.apple.com/search`, CA·NZ·PH 스토어, 2026-11-25), Google Play는 웹 검색(gl=CA)에서 같은 이름·거의 같은 이름 앱을 봤다. PH 스토어 API는 대부분 0건으로 돌아와 신뢰하기 어렵다 [확인 필요].
- **도메인**: `dig NS`로 등록 여부만 봄(소유자 미확인).

### 7-3. 평가표

| 이름(30자 안 전체 표기) | 뜻 | 발음 | 글자 수(이름 / 전체) | 스토어 충돌 | 상표 1차(USPTO) | 문화권 위험(CA·NZ·PH) | mongmang.ink와의 관계 | 순위 |
|---|---|---|---|---|---|---|---|---|
| **[현행] Mongmangi: A Drop of Ink** | 한국어 '몽망이' 그대로 | 의도 MONG-mahng-ee. 영어 독자는 `-gi`를 **'jee'** 로 읽어 *mangy*(옴 오른, MAIN-jee)와 가깝게 들릴 수 있음 [이름 테스트 항목에 추가 권고] | 9 / 24 | App Store CA·NZ 같은 이름 0, Play 0 | 0건 ([Trademarkia](https://www.trademarkia.com/search/trademarks?query=mongmangi)) | ① **'mong'은 영국·아일랜드 속어로 다운증후군 비하어**, NZ에도 1980년대 '가벼운 욕' 용례([Green's](https://greensdictofslang.com/entry/ab5feei), [Wiktionary](https://en.wiktionary.org/wiki/mong)) — 단독이 아니라 낱말 속이라 위험은 낮음 ② 필리핀 *mangmang*(무식한, 모욕어 [tagalog.com](https://tagalog.com/dictionary/mangmang))과 철자 일부가 겹침 — 'Mongmangi'는 모음이 달라 낮음 | 도메인 `mongmang` + `.ink` → 'Mongmang ink'로 읽혀 이름과 가깝다(i 하나 차이). `mongmangi.com` 미등록(NS 없음) | **종합 1위(조건부)** |
| [현행 원안] mongmangE: A Drop of Ink | 끝 E = 빗 | 'mong-mange' → **mange**(옴) | 9 / 24 | 0 | 0건 | mange 연상이 핵심 위험(DECISIONS R5) | 같음 | 비권장 |
| ① **Inkbean: A Drop of Ink** | 'ink + bean' — '콩처럼 작고 동그란 먹 방울'(스토어 3-1 첫 줄)을 그대로 말함 | INK-been, 모호함 없음 | 7 / 22 | App Store CA·NZ 같은 이름 0, Play 0 | 0건 ([Trademarkia](https://www.trademarkia.com/search/trademarks?query=inkbean)) | 알려진 비속어·외국어 오독 없음 | 관계 없음(도메인은 브랜드 홈으로 유지 가능). `inkbean.com`은 **이미 등록됨**, `inkbean.app` 미등록 | **신규 1위** |
| ② Mongmang: A Drop of Ink | 도메인과 같은 철자 | MONG-mang | 8 / 23 | 같은 이름 0. 'MongMong'(Haier, 라이프스타일 앱 [App Store](https://apps.apple.com/us/app/id1588025750)) 비슷 | 0건 ([Trademarkia](https://www.trademarkia.com/search/trademarks?query=mongmang)) | **필리핀 'mangmang'(무식한)과 모음 하나 차이** — 소프트런칭 국가라 위험 큼. 'mong' 속어 위험은 현행과 같음 | **도메인과 완전 일치**(가장 강한 장점). `mongmang.com`은 이미 등록됨 | 3위 |
| ③ Inkpip: A Drop of Ink | 'pip'(작은 씨) — 콩알만 한 먹 | INK-pip | 6 / 21 | 같은 이름 0 | 0건 ([Trademarkia](https://www.trademarkia.com/search/trademarks?query=inkpip)) | NZ·영연방에서 'pip'은 씨·삐 소리, 문제 없음. 다만 'Pip'은 흔한 캐릭터명이라 검색에서 묻힘 | 관계 없음. `inkpip.com` 이미 등록됨 | 2위 |
| ④ Inkmong: A Drop of Ink | ink + 몽 | INK-mong (in-KMONG으로 끊어 읽힐 여지) | 7 / 22 | 같은 이름 0 | 0건 ([Trademarkia](https://www.trademarkia.com/search/trademarks?query=inkmong)) | 'mong'이 끝 음절로 또렷이 들림 → 속어 위험이 현행보다 큼 | 'mong' 공유. `inkmong.com` 미등록 | 4위 |
| ⑤ Dropling: A Drop of Ink | drop + -ling(작은 것) | DROP-ling | 8 / 23 | **같은 이름 앱이 양 스토어에 있음**: 'Dropling: Lock Screen Learning'(App Store CA·NZ·PH), Play `com.duckino.dropling` | 'DROPLINGS'(완구, 28류) **소멸** 1건 ([Trademarkia](https://www.trademarkia.com/search/trademarks?query=dropling)) | 없음 | 관계 없음. `dropling.com` 이미 등록됨 | 5위 |

- 버린 이름(참고): **Inkdrop** — 마크다운 노트 앱 'Inkdrop'이 있음 / **Inkling(s)** — Splatoon 'Inkling', Play에 'inklings' 패키지 / **Mong** 단독 — App Store에 'Mong's Adventure' 등 다수, 속어 위험 최대 / **Sumi** — 일본어(스토어 키워드에서 뺀 이유와 같음).
- 같은 장르 참고: 먹 생물 게임 **Ink Mo!**([App Store CA](https://apps.apple.com/ca/app/ink-mo/id1546692772)), **Blotkins**(먹 얼룩 생물). 'Ink'로 시작하는 이름은 이들과 검색에서 섞인다 — 부제 `A Drop of Ink`로 구분.

### 7-4. 추천

1. **종합 1위 = 현행 `Mongmangi: A Drop of Ink` 유지(조건부).** 한국어 이름·한글 훅(1주차 원고의 축)·도메인과 이어지고, 1차 조사에서 상표·스토어 충돌이 없다. 조건: 12-05 이름 테스트에 **발음 문항('-gi'를 gee/jee 중 어떻게 읽나)과 'mangy' 연상**을 더하고, 기존 판정선(피부병 연상 10명 중 1명 이상 탈락)을 그대로 쓴다. 테스트 응답자에 NZ·PH 출신을 1명 이상 넣는다('mong'·'mangmang' 확인).
2. **탈락하면 신규 1위 `Inkbean: A Drop of Ink`.** 뜻이 바로 통하고 1차 충돌이 없다. 몽망이 이름은 앱 안 기본 이름(`name.default`)으로 남길 수 있다. 단 `inkbean.com`이 남의 것이라 사이트는 mongmang.ink 유지.
3. `Mongmang`은 도메인 일치가 크지만 필리핀 위험 때문에 3위.
4. 확정 전 할 일(출시·정책): CIPO·IPONZ·IPOPHL·EUIPO 9류(게임 소프트웨어)·41류(온라인 게임 제공) 직접 조회, Google Play 콘솔 앱 이름 중복 경고 확인.

---

## 8. 원어민 검수에 넘길 질문 (D-17 확정 조건)

1. 결 이름 8쌍(1절 en.ts:119 제안안) — 평정 차 ≤1.0
2. `answers with a gesture` vs `answers with its body` — 어느 쪽이 자연스러운가
3. `sleeps`로 밤 세기 — 아이 말투로 들리는가(NZ·CA)
4. `gourd dipper`, `Violet-smoke ink` 이해도
5. 이름 발음(7-4 ①)

---

## 9. 반영 기록 — web-static (2026-11-25, DV-1)

범위: `apps/web-static/scripts/site.mjs`(FACTS·UI)·`test/site.test.mjs`·`docs/strategy/geo-v1.md`(v1.2). web-static에 해당하는 높음·중간 항목과 FACTS '지금'(빌드 2 테스터판 정합), 스토어 v0.5 대조를 반영했다. 낮음 항목은 스토어 문장과 겹치는 것만 맞췄다.

| # | 자리 | 이전 | 이후 | 근거 |
|---|---|---|---|---|
| 1 | UI.en.winter · winterBody | `See you in winter` / `It is still being made. Once testing is done, it will be on the stores.` | `Still in the making` / `Once testing is done, it will be on the stores.` (제목과 겹치는 앞 문장은 뺌) | H2, 3-1 site.mjs:146 |
| 2 | FACTS.en.day[2] | `Set it down at the water dropper. The water loosens the word into that night’s dream.` | `At night, let a drop of water fall from the water dropper to put it to sleep. The water loosens the word into that night’s dream.` | H5, 3-1 site.mjs:92. 제안 문장 대신 store-listing v0.5 3-2(115행)와 **같은 문장**을 택함(사이트·스토어 한 문장 원칙) |
| 3 | FACTS.ko.day[2] | `연적에 내려놓아요. 물이 말을 풀어 그날 밤 꿈이 돼요.` | `밤에는 연적에서 물 한 방울을 떨어뜨려 재워요. 물이 말을 풀어 그날 밤 꿈이 돼요.` | H5와 같은 뿌리, store-listing v0.5 3-1(73행)과 같은 문장 |
| 4 | FACTS.en.day[1] | `…with the brush, a single word.` | `…with the brush: a single word.` | 3-1 site.mjs:92 (낮음) — store-listing 3-2(114행)과 같게 |
| 5 | UI.en.howNote | `After 28 nights, a Mongmangi grown from the words you wrote remains.` | `After 28 nights, you have a Mongmangi grown from the words you wrote.` | 3-1 site.mjs:151 (중간) |
| 6 | FACTS.en.not[3] | `Selling what you raised (strokes, ink, grain)` | `Selling looks or growth (its body, ink or nature)` | 3-1 site.mjs:111 (중간), 용어집 '결 = nature' |
| 7 | FACTS.ko.not[3] | `키운 결과(획·먹·결)를 파는 것` | `키운 결과(모습·먹·결)를 파는 것` | 6과 짝. '획'은 v2 '하루 한 획'의 잔재(H6 취지) |
| 8 | FACTS.ko.privacyNow[1] | `지금 받는 개인정보는 테스트 신청 메일뿐이에요. 정식 출시 30일 뒤 지워요.` | 4줄로 나눔: 업데이트 확인(두 번째 실행부터 하루 한 번, 설치·기기 구별 불가) / ML Kit 기기 안 인식·모델 내려받기·Google 진단 정보·글씨와 결과는 안 보냄 / 이용 통계·링크로 공유·맡겨 두기 꺼짐, 계정 없음 / 신청 메일은 등록·연락에만, 출시 30일 뒤 삭제 | 작업 지시 2. 테스터판 방침 1-1·1-2·1절 머리·4절과 같은 사실. 게시일 = 빌드 2 배포일 전제 |
| 9 | FACTS.en.privacyNow[1] | `The only personal information we receive now is test sign-up email. It is deleted 30 days after the official launch.` | 8과 같은 4줄(en): `From its second launch, the Android test build asks our update server once a day…` / `The test build reads handwriting on your device with Google’s ML Kit…` / `Usage statistics, Share by link and Keep it safe are off in the test build, so no account is created.` / `Test sign-up email is used only to register and contact testers, and is deleted 30 days after the official launch.` | 작업 지시 2, 테스터판 en 1-1·1-2. 기능명은 용어집(Share by link·Keep it safe) |
| 10 | FACTS.ko.faq[4] 답 | `글씨는 기기 안에서 읽도록 만들고 있어요. 손글씨 기능은 아직 만드는 중이라…` | `아니요. 테스트 빌드는 글씨를 Google ML Kit으로 기기 안에서 읽고, 쓴 글씨와 인식 결과는 Google이나 운영자에게 보내지 않아요. 정식 출시판의 내용은 출시 때 개인정보처리방침에 적어요.` | 8과 같은 사실(빌드 2에 손글씨 기능이 들어감) |
| 11 | FACTS.en.faq[4] 답 | `We are building it so your handwriting is read on your device. The handwriting feature is still being made…` | `No. The test build reads your handwriting on your device with Google’s ML Kit, and your handwriting and the recognition result are not sent to Google or to us. The details for the full release will be in the Privacy Policy at launch.` | 10과 짝 |

**고치지 않은 것과 이유**

- washi·`하루 한 획`(H1·H6): web-static에는 없다(grep 0건). 화면에 남은 '획'은 v3에서도 쓰는 '글씨의 가장 긴 획'·얼굴 그림 alt의 획(그림 묘사)뿐.
- `answers with its body`(FACTS summary·faq[0]): 스토어 v0.5 짧은 설명·홍보 문구·설명이 같은 말을 쓰고, 8절 질문 2(원어민 검수)로 넘어가 있다. 사이트가 먼저 바꾸면 스토어와 갈라지므로 **스토어가 바뀔 때 같은 날 함께** 바꾼다.
- 태그라인(`먹으로 쓴 한 마디, 스물여덟 밤.` / `One word in ink, twenty-eight nights.`)과 짧은 설명 첫 문장: store-listing v0.5 1~2절과 글자까지 같다 — 바꿀 것 없음.
- 3-2 delete/index.html:69 `Delete what's kept on the server`(중간): 처리방침 en 223행 정본이 같은 글자를 쓴다(docs/release는 이 작업 범위 밖). 리뷰의 첫째 처방대로 **앱 키를 만들 때 이 문구로 맞춘다**(앱 담당에게 넘김).
- 이미지 alt의 `The First Seven Days`: 캡처 속 앱 제목을 그대로 읽는 문장이라, 앱이 `The First Seven Nights`로 바뀌고 캡처를 다시 뜰 때 함께 바꾼다.
- 3-1 낮음(privacyPlan 문장 정리·`put in`·Gmail 문장): 이번 범위 밖. 다음 문구 정리 때.

**검증**: `npx vitest run`(web-static) 84개 통과 — 새 시험 '영문 검수 11-25 반영'(옛 문구 부재·하루 셋째 줄 = 스토어 문장·'지금' = 테스터판 1-1·1-2). 변이 1개(en privacyNow에 옛 '메일뿐' 문장을 되살림) → 그 시험만 실패 확인 후 원복. `pnpm verify --only static-empty,lint` 통과.
