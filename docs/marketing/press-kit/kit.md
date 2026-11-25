# 프레스 킷 본문 (ko·en)

- 작성: 마케팅(작가·채널) / 2026-11-25 / v0.1 초안 — **게시·외부 전송·커밋 없음.** 웹 `/press`·`/en/press`에 옮기는 일은 SE-2·GE-1(구조안: `web-press.md`).
- 사실의 정본 순서: `apps/web-static/scripts/site.mjs` FACTS → `docs/release/store-listing.md` v0.5 → 이 문서. 이 문서가 그 둘과 다르면 이 문서가 틀린 것이다. 문장별 출처는 `sources.md`.
- 코드 블록(```text) 안이 **공개 문구**다. 블록 머리 `<!-- ans id=… max=… unit=… -->`는 검사 스크립트가 읽는다(unit=chars 글자 / words 낱말·어절).
- `{EN_NAME}` = 영문명 자리(12-05 오너 결정 전, 지금 사이트는 `Mongmangi`). 확정되면 바꾸고 검사를 다시 돌린다.
- 영어는 번역이 아니라 따로 썼다(D-06·D-17). 낱말은 en-copy-review 6절 용어집(hanji paper → paper, inkstone, water dropper, the word of the day, nights, sleeps, dream card, it).

---

## 1. 소개 세 길이

### 1-1. 한 줄 (태그라인 + 설명 한 문장)

<!-- ans id=line.tag.ko max=30 unit=chars -->
```text
먹으로 쓴 한 마디, 스물여덟 밤.
```
<!-- ans id=line.tag.en max=60 unit=chars -->
```text
One word in ink, twenty-eight nights.
```
<!-- ans id=line.desc.ko max=60 unit=chars -->
```text
날마다 붓으로 쓴 낱말 하나로 먹 방울 몽망이를 키우는 모바일 게임이에요.
```
<!-- ans id=line.desc.en max=100 unit=chars -->
```text
A mobile game about raising a drop of ink with one word a day, written with a brush.
```

### 1-2. 짧은 소개 (50단어 이내)

<!-- ans id=short.ko max=50 unit=words -->
```text
몽망이 키우기는 한지 위의 먹 한 방울, 몽망이를 키우는 모바일 게임이에요. 날마다 붓으로 낱말 하나를 쓰면 몽망이가 그 글자를 마시고 몸으로 대답해요. 글씨의 가장 긴 획은 몸에 남아요. 스물여덟 밤 동안 그렇게 자라요. 1인 개발 게임이에요.
```
<!-- ans id=short.en max=50 unit=words -->
```text
{EN_NAME} is a mobile game about raising a drop of ink on hanji paper. Each day you write one word with a brush, and it drinks the letters and answers with its body. The longest stroke of your writing stays on its body. It grows over twenty-eight nights.
```

### 1-3. 긴 소개 (200단어 이내)

<!-- ans id=long.ko max=200 unit=words -->
```text
몽망이는 한지 위에 떨어진 콩처럼 작고 동그란 먹 방울이에요. 손끝으로 건드리면 먹이 갈라지며 두 눈이 열려요.

하루는 세 사물로 흘러가요. 벼루에 먹을 갈면 간 만큼 먹의 양과 진하기가 정해져요. 붓으로 오늘의 한 마디, 낱말 하나를 쓰면 몽망이가 그 글자를 마시고 몸으로 대답해요. 밤에는 연적에서 물 한 방울을 떨어뜨려 재우고, 물이 말을 풀어 그날 밤 꿈이 돼요. 아침에는 물 위에 뜬 한지를 건져 올려 간밤의 꿈을 카드로 받아요.

같은 말을 써도 글씨는 사람마다 달라요. 글씨의 가장 긴 획은 몸에 남고, 말의 뜻은 몸짓과 먹빛과 꿈에 스며요. 이레마다 그 무렵의 모습이 한 장씩 남고, 스물여덟 밤이 지나면 그동안 쓴 말로 자란 몽망이가 남아요.

스물여덟 밤은 달력 날짜가 아니라 함께 잔 잠의 수예요. 하루를 걸러도 줄어들지 않고, 오래 비워 두어도 아프거나 사라지지 않아요. 화면에 점수나 수치는 보이지 않아요. 몸과 꿈은 앱이 정해진 규칙으로 그려요.

iOS와 Android, 한국어와 영어로 준비하고 있어요. 1인 개발 게임이에요.
```
<!-- ans id=long.en max=200 unit=words -->
```text
{EN_NAME} is a tiny, round drop of ink on hanji paper. Touch it, and the ink parts to open two small eyes.

Each day, grind ink on the inkstone and write the word of the day with the brush. {EN_NAME} drinks the letters and answers with its body. At night, a drop from the water dropper puts it to sleep, and the water loosens the word into a dream you keep as a card in the morning.

No two hands write the same word alike. The longest stroke of your writing stays on its body; the meaning seeps into how it moves, the shade of its ink, and what it dreams. Each seven nights leaves a picture of who it is becoming, and after twenty-eight nights you have a {EN_NAME} grown from the words you wrote.

The nights are counted in sleeps, not calendar days. Skipping a day doesn't shorten them, and it won't fall ill or disappear if you leave it for a while. No scores or numbers appear on screen. The app draws its body and dreams by fixed rules.

Coming to iOS and Android, in Korean and English. Made by one independent developer.
```

---

## 2. 핵심 사실표

공개 칸은 아래 두 표뿐이다. 날짜는 쓰지 않는다(FACTS F9, risk-check 4절).

<!-- ans id=facts.ko max=600 unit=chars -->
```text
이름 | 몽망이 키우기
장르 | 모바일 게임. 한지 위의 먹 방울을 붓글씨 한 마디로 키워요
플랫폼 | iOS, Android
언어 | 한국어, 영어
가격 | 무료로 내려받아요
대상 연령 | 만 14세 이상
출시 | 준비 중이에요. 날짜는 테스트를 마친 뒤 정해요
먼저 여는 곳(예정) | Google Play 소프트런칭: 캐나다, 뉴질랜드, 필리핀. 나라는 바뀔 수 있어요
만든 사람 | 1인 개발. 이름과 얼굴은 공개하지 않고, 만드는 모습은 손만 보여 드려요
웹 | mongmang.ink
문의 | hello@mongmang.ink
```
<!-- ans id=facts.en max=700 unit=chars -->
```text
Name | {EN_NAME} (Korean title: 몽망이 키우기)
Genre | Mobile game. Raise a drop of ink on hanji paper with one handwritten word a day
Platforms | iOS, Android
Languages | Korean, English
Price | Free to download
Age | 14 and over
Release | In development. The date is set after testing
First available (planned) | Google Play soft launch in Canada, New Zealand and the Philippines. Countries may change
Made by | One independent developer. No name or face is shared; behind-the-scenes material shows hands only
Web | mongmang.ink
Contact | hello@mongmang.ink
```

- 내부 메모(공개 금지): 지금 계획은 RC 01-05 → 소프트런칭·TestFlight 01-12 전후 → 판정 02-11~02-16 → 정식 출시 02-23~03-02 목표, 03-16 상한(D-26·roadmap D5′). 정식 출시 국가는 한국을 포함하는 것으로 읽히나(DECISIONS '1위의 단계') 국가 목록 결정은 찾지 못해 공개 표에 넣지 않았다.
- '먼저 여는 곳' 줄은 PM이 공개 여부를 정한다(결정 필요 1, README). 빼면 '출시' 줄만 남긴다.

---

## 3. 특징 5

<!-- ans id=feat.ko max=700 unit=chars -->
```text
1. 붓으로 쓰는 하루 한 마디
날마다 붓으로 낱말 하나를 써요. 몽망이가 그 글자를 마시고 몸으로 대답해요.

2. 글씨가 몸이 돼요
같은 말을 써도 글씨는 사람마다 달라요. 글씨의 가장 긴 획은 몸에 남고, 말의 뜻은 몸짓과 먹빛과 꿈에 스며요.

3. 벼루, 붓, 연적
벼루에 먹을 갈고, 붓으로 쓰고, 밤에는 연적의 물 한 방울로 재워요. 물이 말을 풀어 그날 밤 꿈이 돼요.

4. 함께 잔 잠으로 세는 스물여덟 밤
하루를 걸러도 줄어들지 않아요. 오래 비워 두어도 아프거나 사라지지 않고, 화면에 점수나 수치는 보이지 않아요.

5. 아침마다 꿈 카드 한 장
아침에는 간밤의 꿈을 카드로 받아요. 이레마다 그 무렵의 모습이 한 장씩 남아요.
```
<!-- ans id=feat.en max=1000 unit=chars -->
```text
1. One word a day, with a brush
Each day you write a single word with the brush. {EN_NAME} drinks the letters and answers with its body.

2. Your writing becomes its body
No two hands write the same word alike. The longest stroke of your writing stays on its body; the meaning seeps into how it moves, the shade of its ink, and what it dreams.

3. Inkstone, brush, water dropper
Grind ink, write with the brush, and at night let a drop from the water dropper put it to sleep. The water loosens the word into that night's dream.

4. Twenty-eight nights, counted in sleeps
Skipping a day doesn't shorten them. It won't fall ill or disappear if you leave it for a while, and no scores or numbers appear on screen.

5. A dream card each morning
Each morning you keep last night's dream as a card. Each seven nights leaves a picture of who it is becoming.
```

---

## 4. 자주 묻는 질문 8

<!-- ans id=faq.ko max=1200 unit=chars -->
```text
Q1. 몽망이 키우기는 어떤 게임인가요?
한지 위의 먹 한 방울을 스물여덟 밤 동안 키우는 모바일 게임이에요. 날마다 붓으로 낱말 하나를 쓰면 몽망이가 그 글자를 마시고 몸으로 대답하고, 아침마다 꿈 카드가 한 장 남아요.

Q2. 언제, 어디서 나오나요?
준비 중이에요. 날짜는 테스트를 마친 뒤 정해요. Google Play에서 캐나다, 뉴질랜드, 필리핀 소프트런칭을 먼저 할 예정이고, 나라는 바뀔 수 있어요.

Q3. 무료인가요?
무료로 내려받아요. 확률형 아이템과 화면을 가리는 광고는 넣지 않아요.

Q4. 어떤 기기와 언어를 지원하나요?
iPhone(iOS)과 Android 폰이에요. 한국어와 영어를 지원해요.

Q5. 몇 살부터 할 수 있나요?
만 14세 이상을 대상으로 만들어요.

Q6. 제가 쓴 글씨가 서버로 가나요?
테스트 빌드는 글씨를 Google ML Kit으로 기기 안에서 읽고, 쓴 글씨와 인식 결과는 Google이나 운영자에게 보내지 않아요. 정식 출시판의 내용은 출시 때 개인정보처리방침에 적어요.

Q7. AI가 그림을 그려 주나요?
아니요. 몽망이의 몸과 꿈은 앱이 정해진 규칙으로 그려요.

Q8. 누가 만드나요? 취재할 수 있나요?
혼자 만들고 있어요. 이름과 얼굴은 공개하지 않아요. 취재와 자료 요청은 hello@mongmang.ink로 보내 주세요.
```
<!-- ans id=faq.en max=1800 unit=chars -->
```text
Q1. What is {EN_NAME}?
A mobile game about raising a drop of ink on paper for twenty-eight nights. Each day you write one word with a brush, {EN_NAME} drinks the letters and answers with its body, and each morning leaves a dream card.

Q2. When and where does it come out?
It is in development. The date is set after testing. We plan to soft launch on Google Play in Canada, New Zealand and the Philippines first; the countries may change.

Q3. Is it free?
It is free to download. We do not put in loot boxes or ads that cover the screen.

Q4. Which devices and languages?
iPhone (iOS) and Android phones, in Korean and English.

Q5. What age is it for?
It is made for people aged 14 and over.

Q6. Does my handwriting go to a server?
The test build reads your handwriting on your device with Google's ML Kit, and your handwriting and the recognition result are not sent to Google or to us. The details for the full release will be in the Privacy Policy at launch.

Q7. Does AI draw the pictures?
No. The app draws {EN_NAME}'s body and dreams by fixed rules.

Q8. Who makes it, and can I interview them?
One person makes it. The developer's name and face are not shared. Please send interview and material requests to hello@mongmang.ink.
```

- Q6은 FACTS F12(테스트 빌드, 지금 사실) 문장이다. 정식 출시판은 처리방침 K9·K11이 RC에서 '일치'가 된 뒤에만 현재형으로 바꾼다(store-listing 머리 게시 조건 ③). 그 전에는 '기기 안에서 읽도록 만들고 있어요'(F12b)보다 강하게 쓰지 않는다.
- Q2의 나라 이름은 2절 '먼저 여는 곳'과 함께 PM 결정 뒤에 공개한다. 빼는 경우 Q2 답은 앞 두 문장만.

---

## 5. 연락처

<!-- ans id=contact.ko max=120 unit=chars -->
```text
취재와 자료 요청은 hello@mongmang.ink로 보내 주세요. 고해상도 원본과 영상이 더 필요하면 같은 주소로 알려 주세요.
```
<!-- ans id=contact.en max=200 unit=chars -->
```text
Send interview and material requests to hello@mongmang.ink. For more high-resolution originals or video, write to the same address.
```
