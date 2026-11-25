# 레퍼런스 — 공유로 퍼진 앱·게임 8개 (2026-11-25)

- 조사: UX 리서처(서브에이전트 웹 조사, WebFetch로 출처 문구를 직접 확인). 숫자는 출처 문구를 그대로 옮겼다. 확인하지 못한 것은 `[확인 필요]`로 표시했다.
- 열지 못해서 뺀 것: Spotify 2024 수치 기사(403), Wordle nationalworld 기사(403). 16Personalities와 Apple Replay는 조사하지 않았다.

| # | 사례 | 공유하고 싶게 만든 것 (1줄) | 본 사람이 해 보고 싶어진 장치 | 수치(출처 문구) | 우리에게 주는 시사점 | 출처 |
|---|---|---|---|---|---|---|
| 1 | **Wordle** | 같은 날 같은 문제를 푼다는 공동 의식. 격자에 글자는 없다 | **결과의 모양은 보이고 정답은 가려져 있다** → 직접 풀어야 격자의 뜻을 안다 | "from 90 players on November 1, 2021, to over 300,000 by January 2, 2022" | 쓴 말은 빼고 **흔적(꿈 그림)만 보여 주는 구조가 Wordle 격자와 같다.** 가장 가까운 선례다 | https://en.wikipedia.org/wiki/Wordle · https://www.bustle.com/life/wordle-viral-game-green-gray-square-emoji-meme |
| 2 | **Spotify Wrapped** | 1년 치 취향이 '나를 설명하는 카드'가 된다 | 모두가 같은 날 받으니 친구 것과 비교하게 된다(2025 '청취 나이') | 공유 "more than 500 million times… 41% more than last year"(스크린샷·다운로드 포함) | 28번째 아침 두루마리 = 개인판 Wrapped. 다만 우리는 날짜가 사람마다 다르다 → 동시성 대신 '완주'가 순간이 된다 | https://techcrunch.com/2025/12/04/spotify-says-wrapped-2025-is-its-biggest-yet-with-200m-users-in-its-first-day |
| 3 | **Duolingo Year in Review** | 자랑할 숫자(상위 %). 그런데 숫자가 약한 사람도 공유하게 한 것은 '학습자 유형' 카드였다 | 습관을 성격처럼 이름 붙인 두 번째 카드가 "significantly boosted share rates!" | "top 10% of XP earners contributed to more than half of the total shares" | 숫자·순위 없이도 공유되는 것은 **정체성 라벨**이다 → 비감정 결 이름(하늘결·소반결)을 카드에 싣는다. 순위는 넣지 않는다(D-03) | https://blog.duolingo.com/year-in-review-behind-the-scenes |
| 4 | **BeReal** | 하루 한 번 꾸미지 않은 순간 | 모두에게 동시에 오는 2분 알림, 내가 올려야 친구 것이 보인다 | 2022년 7~8월 "from 21.6 million to 73.5 million", 2024년 초 23 million으로 감소 | **반면교사.** '해야 하는 공유'는 급감했다. 매일 공유를 권하지 않는다(D-03) | https://en.wikipedia.org/wiki/BeReal |
| 5 | **Finch** | 내가 돌본 결과가 귀여운 새의 성장으로 보인다 | 일기 내용이 아니라 '자란 새'만 보이고, 친구 코드로 연결된다 | "over 500,000 reviews", "getting a lot of love on TikTok"(다운로드 수 [확인 필요]) | **사적 기록은 숨기고 생물의 상태만 보여 준다** = 우리 기본값과 같다 | https://www.bustle.com/wellness/finch-app-review-features-price |
| 6 | **Pokémon Sleep** | 내 수면이 귀여운 '자는 모습' 수집으로 바뀐다 | 수면을 유형(Dozing·Snoozing·Slumbering)과 희귀 자세 도감으로 보여 준다. 날것의 건강 데이터는 보이지 않는다 | "downloaded more than 20 million times worldwide… since its launch in July 2023"(공식, 2024) | 민감할 수 있는 기록(수면 ↔ 우리는 마음)을 **유형·수집물로 바꿔야 안전하게 자랑**할 수 있다 → '감정은 사물로만 그린다' | https://press.pokemon.com/en/Pokemon-Sleep-Celebrates-One-Year-Anniversary-and-Twenty-Million-Downl · https://en.wikipedia.org/wiki/Pok%C3%A9mon_Sleep |
| 7 | **Neko Atsume** | 귀엽고, 누가 놀러 왔는지가 사람마다 다르다 | 광고 없이 "Twitter users began sharing pictures of their kitty visitors"로 퍼졌다 | 2014년 가을 출시 뒤 "over 2 million downloads"(원래 목표 연 약 5만) | **날마다 다르게 나오는 장면은 그 자체로 사진이 된다** → 아침 꿈 카드. 조용한 수묵 감성으로도 퍼진 선례다 | https://www.nippon.com/en/nipponblog/m00083/ |
| 8 | **Lensa 매직 아바타** | '예술 작품이 된 나' | 같은 틀에 얼굴만 바뀌어 "나도 해 보면?"이 된다 → 결과물이 곧 광고 | 11월 다운로드 1.6M(10월 219,000 대비 631%) | **화풍 품질이 곧 바이럴**이다. 다만 열기는 짧았다 → 28밤 구조로 돌아올 이유를 함께 둔다 | https://techcrunch.com/2022/12/01/lensa-ai-climbs-the-app-store-charts-as-its-magic-avatars-go-viral |

## 공통 패턴 → 이번 설계에 쓴 곳

| 패턴 | 사례 | 설계에 쓴 곳(README) |
|---|---|---|
| 내용은 가리고 흔적·모양만 보인다 | Wordle·Finch·Pokémon Sleep | 2절 공유물에 글자 0, '그림 수수께끼' 카드 |
| 귀여운 존재·작품이 결과를 대신 말한다 | Neko Atsume·Finch·Lensa | 2절 모든 카드에 몽망이(자는 모습·이레 획) |
| 숫자가 아니라 정체성 라벨 | Duolingo·Pokémon Sleep | 2절 비감정 결 이름, 순위·점수 0 |
| '나도 해 봐야 뜻을 안다' / '내 버전이 궁금하다' | Wordle·Lensa | 4절 웹 `/m` '내 말로 바꿔 보기' |
| 해야 하는 공유는 오래가지 못한다 | BeReal·Lensa(감소) | 1절 매일은 조용한 버튼만, 권함은 이레 한 번·28번째 아침 |
