# 사실 문장 출처표

- 작성: 마케팅(작가·채널) / 2026-11-25 / v0.1
- `kit.md`·`media.md` 공개 블록의 **사실 문장마다** 정본 위치(파일:줄)와 그 줄에 있어야 할 대조 낱말을 적었다. 검사 스크립트가 각 줄을 열어 대조 낱말이 실제로 있는지 본다(README 검증). 줄 번호는 2026-11-25 기준이라 정본이 고쳐지면 어긋난다 — 스크립트가 잡는다.
- '쓴 곳' 약칭: L = 한 줄, S = 짧은 소개, Lo = 긴 소개, T = 사실표, F# = 특징, Q# = 자주 묻는 질문, Cap = 캡션, Logo = 로고 규칙. ko·en은 같은 사실이라 한 줄로 묶고, 영어 정본이 따로 있으면 줄을 하나 더 둔다.

| # | 사실 문장 (요약) | 쓴 곳 | 출처 | 대조 낱말 |
|---|---|---|---|---|
| 1 | 태그라인 '먹으로 쓴 한 마디, 스물여덟 밤' | L | apps/web-static/scripts/site.mjs:53 | `먹으로 쓴 한 마디, 스물여덟 밤.` |
| 2 | 태그라인 en | L | apps/web-static/scripts/site.mjs:93 | `One word in ink, twenty-eight nights.` |
| 3 | 한지 위의 먹 한 방울을 키우는 모바일 게임, 낱말 하나 → 마시고 몸으로 대답, 스물여덟 밤 동안 자람 | L·S·Q1 | apps/web-static/scripts/site.mjs:54 | `몸으로 대답해요. 스물여덟 밤 동안 그렇게 자라요` |
| 4 | 같은 문장 en | L·S·Q1 | apps/web-static/scripts/site.mjs:94 | `drinks the letters and answers with its body` |
| 5 | 하루 의례 = 벼루 → 붓(낱말 하나) → 연적, 몸으로 대답, 점수·수치 안 보임 | S·Lo·F1·F3 | DECISIONS.md:431 | `점수·수치는 화면에 보이지 않음` |
| 6 | 간 만큼 먹의 양과 진하기 / 가장 긴 획은 몸에 / 연적 물 한 방울, 물이 말을 풀어 꿈 | Lo·F2·F3 | apps/web-static/scripts/site.mjs:55 | `글씨의 가장 긴 획은 몸에 남아요` |
| 7 | 같은 문장 en | Lo·F2·F3 | apps/web-static/scripts/site.mjs:95 | `The longest stroke of your writing stays on its body` |
| 8 | 콩처럼 작고 동그란 먹 방울 | Lo | docs/release/store-listing.md:66 | `콩처럼 작고 동그란 먹 방울` |
| 9 | 같은 문장 en | Lo | docs/release/store-listing.md:108 | `tiny, round drop of ink` |
| 10 | 손끝으로 건드리면 먹이 갈라지며 두 눈이 열림 | Lo·Cap2 | docs/release/store-listing.md:64 | `먹이 갈라지며 두 눈이 열려요` |
| 11 | 같은 문장 en | Lo·Cap2 | docs/release/store-listing.md:106 | `the ink parts to open two small eyes` |
| 12 | 밤에 연적에서 물 한 방울로 재움 | Lo·F3 | docs/release/store-listing.md:73 | `연적에서 물 한 방울을 떨어뜨려 재워요` |
| 13 | 같은 문장 en | Lo·F3 | docs/release/store-listing.md:115 | `from the water dropper to put it to sleep` |
| 14 | 아침에 한지를 건져 올려 꿈을 카드로 받음 | Lo·F5·Q1 | docs/release/store-listing.md:74 | `간밤의 꿈을 카드로 받아요` |
| 15 | 같은 문장 en | Lo·F5 | docs/release/store-listing.md:116 | `keep last night's dream as a card` |
| 16 | 같은 말도 글씨는 사람마다 다름, 뜻은 몸짓·먹빛·꿈에 스밈 | Lo·F2 | docs/release/store-listing.md:77 | `말의 뜻은 몸짓과 먹빛과 꿈에 스며요` |
| 17 | 같은 문장 en | Lo·F2 | docs/release/store-listing.md:119 | `No two hands write the same word alike` |
| 18 | 이레마다 그 무렵의 모습이 한 장씩 남음 | Lo·F5 | docs/release/store-listing.md:78 | `이레마다 그 무렵의 모습이 한 장씩 남고` |
| 19 | 같은 문장 en | Lo·F5 | docs/release/store-listing.md:120 | `Each seven nights leaves a picture of who it is becoming` |
| 20 | 생애 28밤 = 함께 잔 잠의 수, 이레마다 스냅숏 | Lo·F4·F5 | DECISIONS.md:432 | `생애 = 28밤(네 이레, 함께 잔 잠의 수` |
| 21 | 28밤이 지나면 쓴 말로 자란 몽망이가 남음 / 점수·수치 안 보임 | Lo | apps/web-static/scripts/site.mjs:142 | `28밤이 지나면 그동안 쓴 말로 자란 몽망이가 남아요` |
| 22 | 같은 문장 en | Lo | apps/web-static/scripts/site.mjs:157 | `After 28 nights, you have a Mongmangi grown from the words you wrote` |
| 23 | 달력 날짜가 아니라 함께 잔 잠의 수, 하루 걸러도 줄지 않음 | Lo·F4 | docs/release/store-listing.md:82 | `하루를 걸러도 줄어들지 않아요` |
| 24 | 같은 문장 en | Lo·F4 | docs/release/store-listing.md:124 | `Skipping a day doesn't shorten them` |
| 25 | 하루 = 잠 한 번 | Lo·F4 | DECISIONS.md:144 | `하루 = 잠 한 번` |
| 26 | 오래 비워 두어도 아프거나 사라지지 않음 | Lo·F4 | docs/release/store-listing.md:83 | `아프거나 사라지지 않아요` |
| 27 | 같은 문장 en | Lo·F4 | docs/release/store-listing.md:125 | `won't fall ill or disappear` |
| 28 | 처벌 없음(방치해도 죽거나 망가지지 않음) [확정] | Lo·F4 | DECISIONS.md:110 | `방치해도 죽거나 망가지지 않는다` |
| 29 | 화면에 점수나 수치 안 보임 | Lo·F4 | docs/release/store-listing.md:79 | `화면에 점수나 수치는 보이지 않아요` |
| 30 | 같은 문장 en | Lo·F4 | docs/release/store-listing.md:121 | `No scores or numbers appear on screen` |
| 31 | 몸과 꿈은 앱이 정해진 규칙으로 그림(AI가 그리지 않음) | Lo·Q7 | apps/web-static/scripts/site.mjs:86 | `앱이 정해진 규칙으로 그려요` |
| 32 | 같은 문장 en | Lo·Q7 | apps/web-static/scripts/site.mjs:124 | `The app draws Mongmangi’s body and dreams by fixed rules` |
| 33 | 1.0 = 기기 안 손글씨 인식 + 닫힌 사전(앱 안 생성 AI 없음의 근거) | Q7 | DECISIONS.md:433 | `기기 안 손글씨 인식 + 닫힌 사전` |
| 34 | 플랫폼 iOS, Android | T·Lo·Q4 | apps/web-static/scripts/site.mjs:57 | `['플랫폼', 'iOS, Android']` |
| 35 | 언어 한국어, 영어 | T·Lo·Q4 | apps/web-static/scripts/site.mjs:58 | `['언어', '한국어, 영어']` |
| 36 | 가격: 무료로 내려받아요 | T·Q3 | apps/web-static/scripts/site.mjs:59 | `무료로 내려받아요` |
| 37 | 같은 문장 en | T·Q3 | apps/web-static/scripts/site.mjs:99 | `Free to download` |
| 38 | 대상 연령 만 14세 이상 | T·Q5 | apps/web-static/scripts/site.mjs:60 | `만 14세 이상` |
| 39 | 타깃 만 14세 이상(결정) | T·Q5 | DECISIONS.md:133 | `타깃 만 14세 이상` |
| 40 | 출시: 준비 중, 날짜는 테스트를 마친 뒤 | T·Q2 | apps/web-static/scripts/site.mjs:61 | `날짜는 테스트를 마친 뒤 정해요` |
| 41 | 같은 문장 en | T·Q2 | apps/web-static/scripts/site.mjs:101 | `The date is set after testing` |
| 42 | 소프트런칭 예정 Google: 캐나다·뉴질랜드·필리핀 | T·Q2 | docs/team/roadmap.md:150 | `Google: 캐나다·뉴질랜드·필리핀` |
| 43 | 캐나다 유지 결정 | T·Q2 | DECISIONS.md:445 | `캐나다 유지` |
| 44 | 일정 '예정'(1월 둘째 주 소프트런칭, 03-16 상한) — 내부 메모에만 | T 메모 | DECISIONS.md:435 | `03-16 상한` |
| 45 | 정식 출시에 한국 포함으로 읽힘 — 내부 메모에만, 공개 안 함 | T 메모 | DECISIONS.md:220 | `한국 App Store` |
| 46 | 만든 사람 1인 개발 | T·S·Lo·Q8 | apps/web-static/scripts/site.mjs:62 | `['만든 사람', '1인 개발']` |
| 47 | 같은 문장 en | T·Lo | apps/web-static/scripts/site.mjs:102 | `One independent developer` |
| 48 | 혼자 만들고 있어요 | Q8 | apps/web-static/scripts/site.mjs:88 | `혼자 만들고 있어요` |
| 49 | 개발자 공개 = 손만(이름·얼굴 없이 '1인 개발'만) | T·Q8·M10 | docs/strategy/marketing-plan.md:201 | `개발자 공개 = 손만(이름·얼굴 없이` |
| 50 | 연락처 hello@mongmang.ink | T·Q8·연락처·Logo | apps/web-static/scripts/site.mjs:17 | `hello@mongmang.ink` |
| 51 | 취재와 자료 요청은 아래 주소로 | 연락처·Q8 | apps/web-static/scripts/site.mjs:143 | `취재와 자료 요청은 아래 주소로 보내 주세요` |
| 52 | 확률형 아이템·화면을 가리는 광고 넣지 않음 | Q3 | apps/web-static/scripts/site.mjs:83 | `확률형 아이템과 화면을 가리는 광고는 넣지 않아요` |
| 53 | 같은 문장 en | Q3 | apps/web-static/scripts/site.mjs:121 | `loot boxes or ads that cover the screen` |
| 54 | D-05 금지 목록(확률형 뽑기·에너지 제한·전면 광고) | Q3 | DECISIONS.md:126 | `확률형 뽑기, 에너지 제한, 전면 광고` |
| 55 | 테스트 빌드는 ML Kit으로 기기 안에서 읽고 글씨·결과를 보내지 않음, 정식판은 처리방침에 | Q6 | apps/web-static/scripts/site.mjs:85 | `정식 출시판의 내용은 출시 때 개인정보처리방침에 적어요` |
| 56 | 같은 문장 en | Q6 | apps/web-static/scripts/site.mjs:123 | `The details for the full release will be in the Privacy Policy at launch` |
| 57 | iPhone(iOS)과 Android 폰, 한국어와 영어 | Q4 | apps/web-static/scripts/site.mjs:84 | `iPhone(iOS)과 Android 폰이에요` |
| 58 | 한지 위의 먹 한 방울을 스물여덟 밤 동안 키움, 아침마다 꿈 카드 | Q1 | apps/web-static/scripts/site.mjs:81 | `아침마다 꿈 카드가 한 장 남아요` |
| 59 | 같은 문장 en | Q1 | apps/web-static/scripts/site.mjs:119 | `each morning leaves a dream card` |
| 60 | 스크린샷 캡션 1~7 | Cap | docs/release/store-listing.md:333 | `쓴 말로 자란 몽망이` |
| 61 | 캡션 7(아침) | Cap | docs/release/store-listing.md:339 | `아침마다 간밤의 꿈 한 장` |
| 62 | 실물 영상·사진 캡션 '게임에서는 손가락으로 써요' | Cap | docs/marketing/featuring/assets.md:5 | `게임에서는 손가락으로 써요` |
| 63 | 얼굴 사진(실제 렌더, 780×520) | M1 | apps/web-static/scripts/site.mjs:39 | `face: { w: 780, h: 520` |
| 64 | 첫 이레 두루마리(724×1200) | M2 | apps/web-static/scripts/site.mjs:41 | `w: 724` |
| 65 | 미리보기 영상 25초 = V19 | M5 | docs/marketing/featuring/assets.md:11 | `미리보기 영상 25초` |
| 66 | 스크린샷 7장 = V19 | M3 | docs/marketing/featuring/assets.md:12 | `스크린샷 7장` |
| 67 | 1번 장면은 넷째 이레 스냅숏으로 대신 | M4 | docs/marketing/featuring/assets.md:13 | `넷째 이레 스냅숏` |
| 68 | 아이콘 = V19 3안 → 테스트 선택 | M8·Logo | docs/marketing/featuring/assets.md:14 | `아이콘 3안` |
| 69 | 피처 그래픽 1024×500 | M9 | docs/marketing/featuring/assets.md:15 | `1024×500` |
| 70 | 8초 이레 두루마리 영상 C10·D1 | M6 | docs/marketing/featuring/assets.md:16 | `8초 이레 두루마리 영상` |
| 71 | '글씨 → 몸' 클립 R4·R9 | M7 | docs/marketing/featuring/assets.md:17 | `R4(고양이)·R9(바다)` |
| 72 | 만드는 손 사진 P1·P7, 얼굴 대신 | M10 | docs/marketing/featuring/assets.md:18 | `P1(먹 가는 손)·P7` |
| 73 | 원본 파일 이름 규칙 YYMMDD-코드-설명 | 2-2 | docs/marketing/launch-4weeks/shoot-plan.md:174 | `YYMMDD-코드-설명.확장자` |
| 74 | 촬영 폰 위치 정보 저장 끔 | 2-3 | docs/marketing/launch-4weeks/shoot-plan.md:30 | `위치 정보 저장 끔` |
| 75 | 몽망이 대명사 it, 영문명 {EN_NAME} | 전체 en·Logo | docs/marketing/en-copy-review-2026-11-25.md:158 | `대명사 **it**` |
| 76 | 로고 금지: 외곽선·발광 | Logo | docs/creative/v1/art-bible-v1.md:124 | `스티커·발광` |
| 77 | 금지 색: 파스텔·무지개 등 | Logo | docs/creative/v1/art-bible-v1.md:213 | `파스텔, 무지개 그라디언트` |
| 78 | 날짜 약속 금지('곧 출시·2월 출시') | T·Q2 | docs/marketing/launch-4weeks/risk-check.md:53 | `곧 출시·겨울 출시·2월 출시` |
| 79 | '광고 없음·결제 없음' 금지, F7 문장만 | Q3 | docs/marketing/launch-4weeks/risk-check.md:52 | `광고 없음·결제 없음·완전 무료` |
| 80 | 28밤 뒤 처리 말하지 않음 | 전체 | docs/marketing/launch-4weeks/risk-check.md:18 | `28밤 뒤 처리(곁에 남음/떠남)는 팀 결정 전이라 말하지 않는다` |

## 쓰지 않은 사실(근거는 있지만 뺀 것)

| 사실 | 정본 | 뺀 까닭 |
|---|---|---|
| 스물여덟째 아침 낙관 | D-26(DECISIONS.md:432), store-listing:78 | 승인된 사실이지만 '낙관 새김'(미확정 기능)과 헷갈리지 않게 이번 판에서 뺐다. FACTS에도 없다. PM이 원하면 store-listing 문장 그대로 넣을 수 있다 |
| 밥·간식, 밥 알림 | D-27 [잠정] | 지시(미확정 기능) + risk-check 1-7 |
| 실제 걸음·위젯 | D-27·D-04 보강(01-26 업데이트 미정) | 지시(미확정) |
| 한쪽 빛의 수묵 | D-26:434, featuring README #11 | `bodyLight` V20 관문 뒤 켜짐 — 미확정 |
| 손글씨는 정식판에서 기기 안에서만 읽힘(현재형) | 처리방침 K9 | RC '일치' 전 — 테스트 빌드 사실(F12)과 '만들고 있어요'(F12b)만 |
| VoiceOver 지원 | concept-review 3-1 | 설계 단계 — 실기기 확인 전 |
| 시 문구는 언어별 원작 | D-17(DECISIONS.md:209) | 문구 원칙이라 독자에게 확인할 화면이 아직 없음. 인터뷰 질문이 오면 답으로 쓸 수 있다 |
| 정식 출시 국가·날짜 | D-26:435, DECISIONS:220 | 날짜 약속 금지(F9). 내부 메모에만 |
