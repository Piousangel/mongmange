# Reddit 1회 — 01-21(목) 22:00 KST (미국 동부 08:00) · 조건부

- 근거: marketing-plan 4-2(Reddit은 2주차에 한 번), calendar 5절 2주차 메모, risk-check 3절(서브레딧마다 자기 홍보 규칙이 다름).
- 올리는 사람: 오너 본인 계정(개발자 신분을 밝힌다). 에이전트는 올리지 않고, 댓글 원문도 읽지 않는다(metrics 1-1). 오너가 '이거 어디서 받아요' 류 댓글 수만 센다.

## 0. 올리기 전 조건 (셋 다 '예'일 때만)

| # | 조건 | 확인 |
|---|---|---|
| 1 | 고른 서브레딧의 규칙 원문(사이드바·위키)을 01-19까지 오너가 직접 읽었고, 개발자 자기 홍보·테스터 모집 글이 허용된다(요일 지정 스레드만 허용이면 그 스레드에 댓글로) | [확인 필요: 서브레딧별 원문] |
| 2 | 소프트런칭이 실제로 열려 있다. TestFlight 공개 링크를 알릴지 PM이 정했다(README 결정 #2) | [PM 확인] |
| 3 | 같은 글을 둘 이상의 서브레딧에 올리지 않는다. 한 곳만 | 팀 규칙(marketing-plan 1절) |

- 후보(규칙 확인 전, 하나만 고름): r/AndroidGaming(소프트런칭이 Android) · r/iosgaming(TestFlight를 알릴 때만) · r/IndieGaming. [팀 추정: 테스터 모집은 플랫폼 서브레딧이 맞다]
- 하지 않는 것: 투표 부탁, 다른 계정으로 댓글, 같은 글 다시 올리기, 나라 이름 쓰기(캐나다 B안 대기).

## 1. 원고

- 제목(300자 이하):

```
I'm making a small game where you raise a drop of ink by writing one word a day. It's in testing now and I'd like feedback.
```

- 본문:

```
Hi, I'm the solo developer.

The game is called {EN_NAME}. A drop of ink sits on hanji paper. Each day you write one word with your fingertip, and it drinks the letters and answers with its body within a few seconds. The longest stroke of your handwriting stays on its body. It grows over twenty-eight nights.

There are three objects: an inkstone to grind ink, a brush to write the word, and a water dropper to put it to sleep. Each morning you get a card with the dream from the night before.

It is in a test now on Android in a few countries. [PM 확인: TestFlight를 알릴 때만 → On iPhone there is a TestFlight beta.] It is made for people aged 14 and over.

What I would like to know: does the first minute make sense without any explanation, and do the answers feel different enough from word to word?

All images and video are real game screens. Details: mongmang.ink/en
```

- 첨부: V3 영상 파일(15초, 01-20 게시분) 또는 C10 첫 이레 스냅숏 1장 중 서브레딧 규칙이 허용하는 것 하나. C21(두 이레)은 01-24에 생기므로 쓸 수 없다.
- 사실 대조: 소개 문장 = FACTS en summary·day, 대상 연령 = F8, 시험 범위 = S1-en과 같은 말. 출시 날짜·가격·광고 여부는 쓰지 않는다. 댓글로 물으면 FACTS 그대로("The date is set after testing", "Free to download").
- 'within a few seconds'는 D-26 '3초 안에'의 영어 표현이다. 실제 녹화에서 3초가 넘으면 이 말을 지운다.

## 2. 올린 뒤

- 24시간 동안 오너가 답글을 단다(개발자로서 사실만). 답글 원문은 팀에 넘기지 않는다.
- 숫자만 기록: 추천 수(올린 지 24시간), 댓글 수, '어디서 받나' 류 댓글 수, 위기·14세 미만 경계 지표 수(metrics 2절).
- 반응이 없어도 2주 안에 다시 올리지 않는다.
