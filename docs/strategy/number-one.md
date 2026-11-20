# 1위 전략 — 몽망이 키우기

- 작성: 성장·출시 전략 담당 / 2026-11-20 / v0.1
- 계기: 오너 지시(11-20) "몽망이 키우기 팀에 전권 위임. 스토어 1위 앱을 향해 계속 달려보자."
- 근거 문서: DECISIONS(D-03·05·06·08·09·10·12·15), `docs/research/01-game-design-market.md`, `docs/research/03-store-release.md`, `docs/release/store-listing.md`, `docs/creative/v1/art-bible-v1.md`(톤), `docs/design/systems-v1.md`(4.1·5절, 부록 A).
- 표기: 출처가 있는 수치는 링크를 단다. 제3자 추정은 **[추정]**, 팀 판단은 **[팀 추정]**, 공식 문서로 못 본 것은 **[확인 필요]**.
- 전제: 마케팅 예산 0에 가깝다. 광고·확률형 없음(D-05), 전체이용가·타깃 13세 이상(D-06), 로그인 없음, 1인 개발자 + AI 팀.
- 변경 이력: 11-20 v0.2 — D-20 정본 개정(`docs/design/pillars-v1/C-integrated.md` v1.1 9절 #25): 4절 규격 4:5 + 9:16·영상 8초·인장 무늬·'획 → 몸' 랜딩, 6-1 ①, 8절 로드맵을 빌드 1·2·3 계획으로. 옛 값은 [대체됨]으로 남겼다.
- 이 문서의 '1위'는 **팀 내부 목표**다. 스토어 문구·스크린샷에는 순위·수상 주장을 쓰지 않는다(store-listing 톤 규칙).

---

## 0. 결론 (먼저 읽을 것)

1. **우리가 닿을 수 있는 '1위'는 카테고리 차트다.** 미국 전체 무료나 게임 전체 1위는 하루 10만 단위 다운로드가 필요하다(아래 1-2). 현실적인 사다리는 ① 한국 App Store 게임 > 시뮬레이션 무료 1위 → ② 한국 게임 무료 Top 10 → ③ App Store '투데이' 또는 Google Play 인디 코너 피처드 → ④ 연말 Google Play 'Best of 2027'·Apple Design Award 후보다. ④가 진짜 목표이고, 차트 1위는 그 길의 중간 표식이다.
2. **돈 없이 쓸 수 있는 가장 큰 지렛대는 플랫폼 편집팀이다.** Apple 피처링 추천(App Store Connect > Featuring > Nominations, '앱 출시' 유형, **최소 3주 전**)과 Google Play 'Indie Games / Up-and-Coming Apps Featuring Request'(팀 1~15명, 평점 3.8 이상, **출시 10주 안**에 제출)은 무료이고 1인 개발자도 낼 수 있다. 우리 강점(수묵 렌더, 처벌 없음, 광고 없음, 스크린리더로도 획을 긋는 접근성 D-08)은 편집팀이 보는 항목과 겹친다.
3. **출시일은 2027-02-02(화) 전후, 설 연휴(2027-02-06~, [확인 필요]) 직전으로 잡는다.** 먹·한지·꿈이라는 소재가 설에 맞고, 편집팀 추천 리드타임(3주~)과 Google 비공개 테스트(12명·14일)·소프트런칭(3주)을 넣으면 그때가 가장 이른 현실적 날짜다.
4. **지금 MVP로는 D30을 지킬 수 없다.** 꿈 카드 장면이 12개라 7밤이면 다 쓰고, 이레(7획) 뒤의 표식이 없으며, 공유는 아직 자리만 있고, 리텐션을 잴 방법이 없다. 출시 전에 더할 것 5개(6절)가 이 구멍을 막는다.
5. **오너가 오늘 할 일은 두 개다.** Google Play Console 개인 계정(25 USD)과 Apple Developer 개인 가입(연 99 USD). 이 둘이 늦으면 아래 날짜가 전부 그만큼 밀린다.

---

## 1. '1위'의 현실적 정의

### 1-1. 차트 종류와 우리 위치

| 차트 | 닿을 수 있나 | 이유 |
|---|---|---|
| 미국 App Store 전체 무료 1위 | 거의 불가 | 하루 10만 단위 필요(1-2) |
| 미국 App Store 게임 무료 Top 10 | 낙관 시나리오에서도 어려움 | 2022년 기준 하루 약 2.6만(1-2) |
| 미국 게임 > 시뮬레이션 무료 Top 10 | 피처드가 붙으면 가능 | 하위 카테고리는 문턱이 낮다 [팀 추정] |
| **한국 App Store 게임 > 시뮬레이션 무료 1위** | **가능(1차 목표)** | 한국 iOS 하위 카테고리 문턱은 하루 수백~2천 다운로드로 본다 [팀 추정, 도구 확인 필요] |
| 한국 App Store 게임 무료 Top 10 | 기본 시나리오 목표 | 하루 수천~1만대 [팀 추정] |
| 한국 Google Play 게임 인기 Top 10 | 어려움 | 한국 안드로이드 사용자가 많아 문턱이 높고, 방치형·고스톱·대형 신작이 차지한다. 2025 하반기 국내 다운로드 1위는 '고스톱M'이었다([Sensor Tower](https://sensortower.com/ko/blog/2H2025-mobile-games-recap-in-Korea)) |
| App Store '투데이' 피처드 | **가능(가장 큰 한 방)** | 차트가 아니라 편집. 추천 양식이 있다(2절) |
| Google Play 인디 코너 | 가능 | 인디 전용 양식이 있다(2절) |
| Google Play 'Best of 2027' 한국 인디 부문 | 2027년 목표 | 한국은 매년 인디 부문을 뽑는다: 2024 '탕후루 마스터'(후야호), 2025 '딸깍삼국'(반지가게임즈)([Google 코리아 2024](https://blog.google/intl/ko-kr/products/android-play-hardware/googleplay-best-of-2024/), [2025](https://blog.google/intl/ko-kr/products/android-play-hardware/googleplay-best-of-2025/)) |
| Apple Design Award 2027 | 장기 목표 | 응모 양식 없이 Apple이 고른다. 2026 결선 36작에는 'Inclusivity'·'Visuals and Graphics' 부문이 있었다([MacRumors](https://www.macrumors.com/2026/05/18/apple-design-award-finalists-2026/), [9to5Mac 수상작](https://9to5mac.com/2026/06/02/apple-reveals-apple-design-awards-app-and-game-winners-for-2026/)) |

- 주의: 한국에서 '키우기'는 방치형 RPG의 장르명이 됐다. 2026 Google Play 한국 올해의 게임이 넥슨 '메이플 키우기'다([wowtale](https://wowtale.net/2026/11/18/268245/)). '몽망이 키우기'로 검색하면 방치형을 찾던 사람이 들어와 바로 나갈 수 있다. 이름은 오너 원안이니 유지하고, 부제와 첫 스크린샷으로 "방치형이 아니다"를 보여 준다(3절).

### 1-2. 1위에 필요한 하루 다운로드 (공개된 최신값이 오래됐다)

| 출처 | 시점 | 차트 | 하루 다운로드 |
|---|---|---|---|
| [Sensor Tower](https://sensortower.com/blog/app-downloads-to-number-one) | 2019 상반기 | 미국 App Store 게임 1위 | 약 174,000 (중앙값) |
| 같은 글 | 2019 상반기 | 미국 App Store 게임 10위 | 약 43,000 |
| 같은 글 | 2019 상반기 | 미국 Google Play 게임 1위 / 10위 | 약 116,000 / 34,000 |
| [Statista 요약(Sensor Tower)](https://www.statista.com/statistics/1317770/us-daily-downloads-needed-rank-first-10-positions-ios-apps) | 2022 | 미국 iPhone 게임 Top 10 | 약 26,000 (2019년 43,000에서 감소) |
| [PocketGamer.biz](https://www.pocketgamer.biz/comment-and-opinion/67142/sponsored-app-stores-top-ranking-download-requirements/) | 2017-01 | 미국 iOS 게임 > 단어 Top 10 | 약 3,949 (하위 카테고리 예시) |
| [AppTweak](https://www.apptweak.com/en/aso-blog/number-of-downloads-to-reach-top-rankings) | 2025-07 갱신 | 국가·카테고리 비교 | 미국이 App Store에서 가장 경쟁적, 아시아에서는 일본이 가장 높고 한국은 그 아래. 게임 수치는 공개 안 함 |

- **한국 문턱은 공개 수치를 찾지 못했다.** 아래는 팀 추정이다. 출시 전 무료 도구(AppTweak·Appfigures 체험판) 한 번으로 확인한다.

| 차트(한국) | 1위에 필요한 하루 다운로드 [팀 추정] |
|---|---|
| App Store 게임 > 시뮬레이션 무료 | 300~2,000 |
| App Store 게임 무료 전체 | 1만~3만 |
| App Store 전체 무료 | 3만 이상 |
| Google Play 게임 > 시뮬레이션 인기 | 2,000~8,000 |
| Google Play 게임 인기 전체 | 5만 이상 |

- 차트는 최근 며칠 다운로드의 속도로 매긴다는 것이 업계 통설이다 [확인 필요: 양 스토어 모두 알고리즘 비공개]. 그래서 **사전 등록·사전 주문을 출시일 하루에 몰아 넣는 것**이 무예산 팀이 차트를 밀 수 있는 거의 유일한 방법이다.

### 1-3. 코지·펫 게임이 차트·피처드에 오른 경로

| 게임 | 경로 | 우리에게 주는 교훈 |
|---|---|---|
| Neko Atsume (Hit-Point, 2014) | 일본어판만으로 입소문, 2015-05 400만, 같은 해 해외가 다운로드의 30~40%. Apple이 일본 '고양이의 날'에 고양이 게임 기획전을 열며 세계로 퍼짐. 2015-10 영어판 뒤 1,000만([Wikipedia](https://en.wikipedia.org/wiki/Neko_Atsume), [Japan Times](https://www.japantimes.co.jp/news/2015/06/29/business/tech/japanese-cat-collecting-game-is-apps-meow), [Know Your Meme](https://knowyourmeme.com/memes/subcultures/neko-atsume)) | 결과물 스크린샷 공유 + 편집팀의 '날' 기획전. **설·추석·한글날 같은 날짜형 기획**이 우리 몫이다 |
| Cats & Soup (HIDEA, 한국, 2021) | 출시 직후 일본·미국 Google Play 게임 다운로드 3·4위, 5개월 만에 4,000만([indiegame.com](https://indiegame.com/en/archives/5610), [PocketGamer](https://www.pocketgamer.com/cats-soup/40m-downloads)) | 한국 소규모 팀이 **영어·일본어로 처음부터** 나가 해외 차트에 오른 사례. 다만 퍼블리셔(네오위즈)가 붙었다 |
| Finch (2021~) | 미국 다운로드가 약 62%, App Store Editors' Choice, Health & Fitness Top 10권 [추정, [FoxData](https://foxdata.com/en/blogs/finch-as-app-store-editors-choice-a-self-care-companion/)] | 게임이 아닌 '셀프케어' 카테고리에서 1위권. **경쟁이 덜한 카테고리를 고르는 것**도 전략이다 |
| Tsuki's Odyssey (HyperBeard) | Android 약 970만 설치 [추정, [AppGoblin](https://appgoblin.info/apps/com.hyperbeard.odyssey)] | 느린 하루 방문형도 오래 산다. 바이럴 경로 자료는 찾지 못했다 |
| 탕후루 마스터(후야호), 딸깍삼국(반지가게임즈) | 한국 Google Play 올해의 인디(2024·2025) | 한국 소규모 개발사도 연말 시상에 오른다. 둘 다 캐주얼·짧은 루프 |

- 한국 1인 개발 코지 게임이 App Store '투데이'에 오른 기록은 이번 조사에서 찾지 못했다 [확인 필요]. 찾지 못한 것이 없다는 뜻은 아니다.

---

## 2. 무료 지렛대 (플랫폼·행사)

### 2-1. 피처드 신청

| 항목 | 내용 | 마감·시점 |
|---|---|---|
| **Apple 피처링 추천** | App Store Connect > Featuring > Nominations. 유형: 새 콘텐츠 / 앱 개선 / **앱 출시(사전 주문 포함)**. 설명·게시일·국가·현지화·보조 자료 URL 5개(TestFlight 공개 링크 가능)·접근성 메모를 적는다. 역할: Account Holder·Admin·App Manager·Marketing([Apple Help](https://developer.apple.com/help/app-store-connect/manage-featuring-nominations/nominate-your-app-for-featuring)) | Apple은 "**최소 3주**" 전을 권한다(같은 문서). 일본어 안내 페이지는 최대 3개월 전부터 가능하다고 한다([Apple JP](https://developer.apple.com/jp/app-store/getting-featured/)). 제3자 가이드는 6~8주 전을 권한다. → **우리는 6주 전(12-22)** |
| Apple이 보는 것 | "체크리스트는 없다"며 UX·UI 디자인·현지화 등을 든다([Getting featured](https://developer.apple.com/app-store/getting-featured), [한국어](https://developer.apple.com/kr/app-store/getting-featured/)) | 추천 문안에 **D-08 접근성(스크린리더로 획 긋기)**, 광고·확률형 없음, 한국 수묵 미술을 적는다 |
| Apple 인앱 이벤트 | 검색 결과·투데이에 카드로 뜬다. 추천서에 첨부 가능(같은 Help 문서). iPhone·iPad만 | '설날 아침의 꿈'(설 전용 모티프 1개) 같은 작은 이벤트를 출시 주에 건다 [팀 추정: 효과] |
| **Google Play 인디 코너 신청** | 'Indie Games / Up-and-Coming Apps Featuring Request'. 팀 1~15명, 평균 평점 3.8 이상. 패키지명·개발 단계·수익 모델·출시일 기재. **출시가 10주 넘게 남았으면 기다렸다 내라**, 신작 피처링은 출시 1~2개월 뒤([Google 양식](https://support.google.com/googleplay/contact/indie_corners)) | 출시 02-02 기준 **11-24 이후** 제출 가능 → **12-01에 제출** |
| Apple Design Award | 응모 없음, Apple이 1년 내내 찾는다는 설명뿐(공식 자격 문서 못 찾음 [확인 필요]). 2026 결선은 5월 발표·6월 수상 | 2027 결선을 바라면 **3월 전에 출시**해 있어야 한다 [팀 추정] |
| Google Play Best of | 2026은 11-17 발표([Google](https://blog.google/products-and-platforms/platforms/google-play/best-of-play-awards-2026)) | 2027년 11월. 그해 출시작이 유리 [팀 추정] |

### 2-2. 한국 프로그램·행사

| 이름 | 내용 | 2027 예상 일정 |
|---|---|---|
| **구글플레이 창구 프로그램** | 2026 8기: 업력 7년 미만 모바일 앱·게임 개발사, 2-27~3-16 모집, 5-17 100곳 선정. 세미나·1:1 컨설팅·클라우드 크레딧·중기부 사업화 자금(최대 2억), 게임은 구글플레이 마케팅 캠페인 참여 기회([Google 코리아](https://blog.google/intl/ko-kr/company-news/outreach-initiatives/2026changgooapplication/), [유니콘팩토리](https://www.unicornfactory.co.kr/article/2026022310584210525)) | 9기 2027-02~03 모집 [추정]. 오너 개인사업자 '행복가게'로 자격이 되는지 K-Startup 공고에서 확인 [확인 필요] |
| Google Play Indie Games Festival (한국) | 2020년대 초까지 한국·일본·유럽에서 열렸다(2022 한국 우승 'The Greater', [Android Developers Blog](https://android-developers.googleblog.com/2022/09/google-play-2022-winning-indie-titles.html?hl=ko)). **2024~2026 한국 개최 기록은 찾지 못했다** | 지금은 BIC·창구 쪽으로 옮겨 간 것으로 본다 [팀 추정] |
| Indie Games Accelerator | 2024 한국 8개사 선정, 10주 멘토링([Google 코리아](https://blog.google/intl/ko-kr/company-news/outreach-initiatives/korean-cohort-for-googleplay-iga)). 2026 아시아 모집은 찾지 못함 | 공고가 나오면 지원 [확인 필요] |
| **BIC 페스티벌**(부산) | 2026 Google Play 공식 후원, 'BIC x Google Play Indie Fest Awards' 시상, 8월 BEXCO([Inven Global](https://www.invenglobal.com/articles/22904/google-play-joins-as-official-sponsor-for-bic-festival-2026)) | 2027 봄 출품 모집 [추정] |
| 인디크래프트 | 2026 출품 4-30 마감, 2025 모바일 부문 1위는 3인 팀([게임메카](https://www.gamemeca.com/en/view.php?gid=1773732), [디스이즈게임](https://www.thisisgame.com/articles/403276)) | 2027-04 마감 [추정] |
| 서울 인디게임 개발 챌린지 | 구글플레이 인디게임그룹 코리아 공동 주최, 2026-06-26~28 DDP([indiegame.com](https://indiegame.com/en/archives/27454)) | 2027-06 [추정] |
| Wholesome Direct(해외 코지 쇼케이스) | 2026은 6-6 방송, 출품 3-31 마감으로 보임([wholesomegames.com](https://wholesomegames.com)). 자매 행사 Wholesome Snack 2026-12-05([Gamespress](https://www.gamespress.com/Wholesome-Snack-Returns-on-December-5th-2026)) | 2027 출품 ~3월 [추정]. 모바일 출품 가능 여부 [확인 필요] |

### 2-3. 사전 등록·사전 주문

| 항목 | 규칙 | 우리 쓰임 |
|---|---|---|
| App Store 사전 주문 | 출시 2~180일 전부터 가능([Apple Help](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/publish-for-pre-order), [Apple 프리미엄 게임 안내](https://developer.apple.com/app-store/freemium-games/)). 사전 주문한 사람에게는 출시일에 자동 다운로드 | 심사 통과 즉시(목표 01-12) 사전 주문을 연다. 출시일 다운로드가 몰려 차트에 유리 |
| Google Play 사전 등록 | 최대 90일([Play Console Help](https://support.google.com/googleplay/android-developer/answer/9859047)). 보상은 관리형 인앱 상품만 가능, 만든 뒤 수정·삭제 불가, 이정표 보상 가능. 넥슨 사례: 보상으로 전환 +20%([Google Play](https://play.google.com/console/about/nexon-casestudy/)) | **보상은 쓰지 않는다**(MVP에 인앱 상품이 없고, 보상 하나 때문에 결제를 넣는 것은 과설계). 신규 개인 계정은 사전 등록 전에 프로덕션 액세스가 필요할 가능성이 높다 [확인 필요] → 비공개 테스트를 서두르는 이유 |

### 2-4. 지역 출시 순서

| 단계 | 기간 | 지역·스토어 | 목적 |
|---|---|---|---|
| ① 비공개 테스트 | 12-01~12-15 | Google 비공개(테스터 15~20명), TestFlight | 프로덕션 액세스 조건(12명·14일), 크래시·흐름 |
| ② 소프트런칭 | 12-29~01-19 (3주) | **Google Play만**, 캐나다·뉴질랜드·필리핀 | D1·D7 측정. 영어권이고 미국·영국과 비슷하게 쓰는 시장으로 흔히 쓴다([PocketGamer.biz](https://www.pocketgamer.biz/feature/60621/soft-launch/entry/4), [PayPro](https://payproglobal.com/?p=18889)). iOS는 소프트런칭하지 않는다 — 편집팀이 보는 '신작' 자격을 아끼기 위해서다 [팀 추정] |
| ③ 정식 출시 | **2027-02-02(화)** | 양 스토어, 전 세계(한·영), 한국·미국 중심 | 사전 주문·사전 등록을 하루에 모음, 설 연휴 직전 |
| ④ 일본어 | 1.x | — | Neko Atsume·다마고치 시장. 품질 확보 후 |

- 소프트런칭은 무예산이면 설치 수가 수백에 그친다. D7을 믿으려면 300명 이상이 필요하다 [팀 추정]. 오너가 허락하면 필리핀 Google 앱 캠페인에 **10~20만 원**을 쓰는 안을 둔다(필리핀 CPI는 낮은 편 [추정, 금액 확인 필요]). 허락이 없으면 커뮤니티 모집(4절)으로 채우고 표본이 작다는 것을 판정에 적는다.

---

## 3. ASO

### 3-1. 키워드 후보와 경쟁도

경쟁도는 도구 없이 매긴 **[팀 추정]**이다. 출시 4주 전 AppTweak/Astro 체험판으로 한 번 검증한다. 타사 상표(다마고치 등)는 넣지 않는다(store-listing).

| 한국어 | 경쟁도 | 메모 |
|---|---|---|
| 키우기 | 매우 높음 | 방치형 RPG가 점령. 이름에 이미 있음, 키워드로 따로 넣지 않음 |
| 힐링게임 / 힐링 | 높음 | 그래도 전환이 좋은 말 |
| 가상펫 / 펫 키우기 | 중간 | 핵심 |
| 수묵 / 한지 / 먹 / 붓 / 서예 | **낮음** | 게임 경쟁작이 거의 없음. 서예 도구 앱과 겹친다. 우리가 1위 할 수 있는 말 |
| 잔잔한 게임 / 하루 한 번 / 매일 | 낮음~중간 | 코지 유저가 쓰는 말 |
| 꿈 / 꿈일기 | 중간 | 비게임 꿈일기 앱과 겹침 |
| 그림 그리기 게임 / 손그림 | 높음 | 그림 맞히기 게임이 많음 |
| 귀여운 게임 | 높음 | |

| English | 경쟁도 | 메모 |
|---|---|---|
| virtual pet | 매우 높음 | 핵심이지만 1페이지 진입 어려움 |
| cozy game / cozy | 높음 | |
| ink / sumi / sumi-e / calligraphy / brush | **낮음~중간** | 우리 몫. calligraphy는 도구 앱과 겹침 |
| zen / calm / relaxing | 높음 | |
| daily ritual / one stroke a day | 낮음 | 긴 꼬리 |
| dream / dream card | 중간 | |
| korean / hanji | 낮음 | 한국 문화 관심층 |

- 지금 store-listing 4절 키워드 줄은 대체로 맞다. 고칠 점 두 개: ① 한국어 줄에 `먹`·`잔잔한게임`을 넣고 `일상`·`루틴`을 뺀다(검색 의도가 생산성 앱) ② 영어 줄에 `sumi-e`·`korean`을 넣고 `cute`를 뺀다(경쟁이 너무 높고 아동 어필 오인 위험, D-06).
- 영문명이 확정돼야 이름·부제 색인이 정해진다. D-06 R5 이름 테스트를 **12-05까지** 끝낸다(7절).

### 3-2. 스크린샷·미리보기 영상 원칙

| 원칙 | 근거 |
|---|---|
| 검색 결과에는 첫 2~3장만 보인다. **1장 = 7일차 몽망이 + 아침 카드**, **2장 = 0일차와 7일차를 나란히, 그 사이 7획**("세상에 하나뿐인"의 증거), 3장 = 획 긋는 손 | store-listing 8절의 1장 원칙 유지 + 2장 교체 제안. 0일차 단독은 블랙 슬라임처럼 보인다(아트 14절 3) |
| 실제 렌더만(D-04). 캡션 한 줄, 명조, 느낌표 없음 | store-listing 톤 |
| 2장 캡션에서 "방치형이 아니다"를 장면으로 보인다: "하루 한 획. 나머지는 몽망이가 합니다" 같은 문장 [카피 담당 다듬기] | 1-1 '키우기' 오인 |
| 미리보기 영상: App Store는 소리 없이 자동 재생된다고 가정한다 [확인 필요]. **첫 3초 = 손끝이 닿고 눈이 열리는 순간**, 15초 안에 하루(긋기→재우기→물 위→아침 카드), 25초 안팎 | 03 문서 6절 규격 |
| Google Play 피처 그래픽 1024×500: 한지 위 방울 하나 + 이름. 글자 최소 | 인디 코너 배너에 쓰일 수 있음 [팀 추정] |
| 스크린샷에 아이·아동 표현 없음 | D-06 |

### 3-3. 아이콘·스토어 A/B

| 도구 | 규칙 | 계획 |
|---|---|---|
| Google Play 스토어 등록정보 실험 | 기본 그래픽(아이콘·피처 그래픽·스크린샷)과 문구를 나눠 시험. 변형 수는 자료마다 3~5개로 엇갈림 [확인 필요]. 커스텀 스토어 등록정보는 최대 50개, 무작위 시험은 아님([Google Play](https://play.google.com/console/about/customstorelistings/)) | **소프트런칭 3주 동안 아이콘 3안 시험**: A 0일차 방울 얼굴 크게 / B 7일차 획 두른 몸 / C 밤 물 위의 방울. 지표 = 첫 설치 전환 |
| Apple 제품 페이지 최적화(PPO) | 원본 + 대안 3개, 아이콘 대안은 앱 바이너리에 넣어 심사를 거쳐야 함. 커스텀 제품 페이지 70개, 키워드 연결 가능([Apple PPO](https://developer.apple.com/app-store/product-page-optimization), [FoxData](https://foxdata.com/en/blogs/apple-doubles-custom-product-page-limit-smarter-aso-asa-strategies-for-black-friday/)) | 출시 빌드에 Google 시험의 상위 2안을 대체 아이콘으로 넣고, 출시 2주 뒤 PPO를 켠다. 커스텀 페이지 2개: '수묵·서예' 키워드용, '코지 펫' 키워드용 |

---

## 4. 바이럴 구조

### 4-1. 아침 꿈 카드 공유

지금 공유는 자리만 있다(progress: "TODO 다음 빌드 expo-file-system·sharing"). 공유가 바이럴의 유일한 통로라 6절 ①로 올린다.

| 설계 | 이유 |
|---|---|
| 내보내기 두 규격: **9:16 스토리**(인스타·스레드·틱톡 배경)와 ~~**1:1**~~ **4:5(1080×1350)** [개정 11-20, D-18·D-20] | 플랫폼마다 잘리는 것을 막음. 4:5는 피드에서 1:1보다 크게 보이고 꿈 카드 파이프라인 기본 규격 |
| 카드 아래 띠: ~~`몽망이 키우기 · 이레째` + 몽망이마다 다른 **먹 인장 번호**~~ **`{이름} · {먹} · {결}` 꼬리표 + 주사 '몽' 인장 무늬**(이 빠짐 16칸, 씨앗에서 파생, 개인정보 아님), 그 아래 앱 이름·도메인. **인장 코드는 이미지에 넣지 않고** 공유 글 링크(`도메인/m/{코드}`)에만 [개정 11-20, D-20] | "세상에 하나뿐인"을 ~~숫자~~ 무늬로 보증(코드가 이미지에 있으면 제품 키처럼 읽힘 — 리뷰 3-1), 앱 이름이 따라감 |
| **이레 두루마리 ~~6초~~ 8초 영상**(4:5·9:16, 240프레임) 내보내기: 0일차 방울에서 7획이 차례로 붙는 타임랩스(소리: 붓·먹방울, AAC). 끝 1.5초에 꼬리표. 자체 Expo 인코더가 12-05 관문을 못 넘으면 9:16 두루마리 이미지 [개정 11-20, D-18·D-20] | 틱톡·릴스는 이미지보다 짧은 영상이 퍼진다 [팀 추정]. 렌더 코드를 그대로 재생하므로 새 그림이 필요 없다 |
| 공유 버튼은 아침 카드와 이레 두루마리 두 곳에만, 문구는 "꺼내 두기" 정도 | 톤(광고체 금지), 강요 없음(D-03) |
| **[11-20 추가] 랜딩 기본 = '획 → 몸' 15초 루프**(미리보기 영상을 잘라 재사용). 링크의 먹·결을 읽어 "송연먹 · 느긋결 몽망이를 보셨군요" 한 줄(2언어 한 틀). 유형별 예시 그림은 만들지 않는다 | 결과(카드)만이 아니라 과정(내 획이 몸이 됨)을 보여야 "나도"가 생긴다(리뷰 1-3) |
| 남의 몽망이를 보는 피드는 MVP에 없음 | 자유 그리기 생물의 음란 형태 위험(D-10 반증 조사, Spore 사례). 공유는 유저가 직접 내보내는 이미지뿐 |

### 4-2. '세상에 하나뿐인 몽망이' 비교 밈

- 형식: "같은 먹 한 방울, 7일 뒤" — 친구·커플·가족이 같은 날 시작해 이레째 두루마리를 나란히 올린다. 해시태그 `#내몽망이` / `#mymongmangi` [영문명 확정 후].
- 앱이 할 일은 하나: 이레 두루마리 화면에 "같은 날 시작한 사람과 나란히 놓아 보세요" 한 줄(1회만). 서버·친구 기능은 만들지 않는다.
- 위험: 획을 일부러 이상하게 그어 밈을 만드는 경우. D-12 금지 자리·돌출 상한이 형태를 핵 둘레로 묶어 둔다. 그래도 나오는 웃긴 모양은 막지 않는다(유저가 만든 것이고 피드가 없다).

### 4-3. 크리에이터 시딩 (돈 없이)

| 대상 | 왜 맞나 | 무엇을 보내나 |
|---|---|---|
| **서예·캘리그래피 크리에이터**(한·영) | 경쟁 게임이 없는 빈 틈. 붓 획 영상이 이미 그들의 콘텐츠 | TestFlight 공개 링크 + "당신의 획으로 키운 몽망이" 제안 |
| ASMR 유튜버 | 먹 가는 소리·붓 소리·물소리가 앱 안에 있다(D-14) | 단, 지금 소리는 자체 합성 v0.1이다. 녹음본이 나오기 전에는 ASMR 채널에 먼저 보내지 않는다 |
| 코지 게임 틱톡커·유튜버(한·영) | 장르 정면 | 출시 2주 전 빌드 + 프레스킷(GIF, ~~6초~~ 8초 영상, 개발 이야기) |
| 한국 다꾸·문구 커뮤니티 | 한지·먹·인장 감성 | 카드 이미지 묶음 |
| 해외 Wholesome Games 계정 | 코지 인디가 무료 리포스트로 위시리스트를 크게 늘린 사례가 있다(Urban Jungle, [teletype 요약](https://teletype.in/@sadari/urban_jungl), 원문 러시아어 [추정]) | 메일 1통 + ~~6초~~ 8초 영상 |

- 규칙: 대가성 게시는 하지 않는다(무예산 + 표시 의무). 무료 빌드를 보내고, 올리든 말든 자유.
- 목표: 출시 전 30명 연락 → 5명 게시 [팀 추정 응답률 15%].
- 참고: 유료 숏폼 광고가 코지 인디(HOZY, Steam)에서 큰 효과를 냈다는 사례가 있으나([80.lv](https://80.lv/articles/tinybuild-ceo-discusses-success-of-cozy-room-restoration-game-hozy)) 우리는 예산이 없어 쓰지 않는다.

### 4-4. 팀의 Threads·Bluesky 자동 게시 인프라 재사용 (아이디어만)

- 다른 팀이 Threads 자동 게시(Meta 앱·토큰)를 돌리고 있다. **같은 방식으로 몽망이 전용 계정**을 만든다(토큰·계정은 분리).
- 매일 아침 1개: "개발자의 몽망이 · N째 밤" 실제 꿈 카드 1장 + 한 줄. 출시 전 10주 동안 쌓이면 출시일에 70장짜리 이야기가 된다(빌드 인 퍼블릭).
- **말투는 몽망이 톤(아트 바이블: 절제, 느낌표·이모지 없음)**을 따른다. 다른 앱의 친구 반말체를 그대로 가져오지 않는다.
- Bluesky에는 영어판을 같이 올린다(해외 인디·아트 커뮤니티).

---

## 5. 리텐션 목표와 1위 시나리오

### 5-1. 기준값

| 기준 | D1 | D7 | D30 | 출처 |
|---|---|---|---|---|
| 모바일 게임 중앙값(2025) | 약 22~26% | 4% 미만 | 4% 미만 | 01 문서, [InvestGame 요약](https://investgame.net/wp-content/uploads/2026/01/2026-01-20-Mobile_retention_benchmarks_2026.pdf), [gamedevreports](https://gamedevreports.substack.com/p/gameanalytics-mobile-and-pc-game) |
| 상위 25% | 40%+ | 20%+ | 10%+ | 같은 곳(2차 인용) [추정] |
| 퍼즐(장르 예) | 약 32% | 약 12% | 약 5% | Mistplay 인용 [추정] |
| 우리 D-09 확장 조건 | 30% | 10% | — | DECISIONS D-09 |

### 5-2. 우리 목표 (소프트런칭 관문)

| 지표 | 합격 | 1위 시나리오용 목표 | 이유 |
|---|---|---|---|
| D1 | ≥ 35% | 40% | 첫 30초 눈 뜨는 순간 + 첫 밤 아침 카드가 D1의 전부 |
| D7 | ≥ 15% | 20% | '하루 한 획'은 D7이 장르 평균보다 높아야 의미가 있다 |
| D30 | ≥ 6% | 10% | 이레 뒤 표식·카드 풀이 없으면 여기서 무너진다(6절 ②) |
| 카드 공유율(아침 방문 중) | ≥ 5% | 10% | 바이럴 계수의 바닥 [팀 추정] |
| 평점 | ≥ 4.5 | 4.7 | 인디 코너 3.8 하한, 차트 전환 |

- 관문에 못 미치면 정식 출시를 2주 미루고 첫 30초·아침 카드를 고친다. D-09 확장 조건(30/10)보다 높게 잡은 것은 '1위'를 목표로 했기 때문이다.

### 5-3. 시나리오 3개 (모두 [팀 추정])

가정: 출시 02-02, 사전 주문·사전 등록이 출시일에 한꺼번에 설치, 출시일 다운로드의 절반이 한국.

| | 보수 | 기본 | 낙관 |
|---|---|---|---|
| 피처드 | 없음 | Apple 한국 게임 탭 신작 배너 또는 Google 인디 코너 중 하나 | Apple 한국·미국 '투데이' + Google 인디 코너 |
| 크리에이터 | 1~2명 게시 | 5명, 그중 하나 10만 조회 | 영상 하나 100만 조회+ |
| 사전 주문·등록 | 1,500 | 6,000 | 2만 |
| 출시일 다운로드 | 1,500 | 8,000 | 3만 |
| 첫 주 합계 | 4,000 | 3만 | 15만 |
| 첫 달 합계 | 1만 | 8만 | 60만 |
| D1 / D7 / D30 | 30 / 10 / 4 | 38 / 16 / 7 | 45 / 22 / 10 |
| 차트 결과 | 한국 App Store 시뮬레이션 **1위 하루~이틀**, 게임 전체 100위권 | 한국 시뮬레이션 1위 1주, **한국 게임 무료 Top 10 하루**, 미국 시뮬레이션 Top 20 | **한국 App Store 게임 무료 1위**, 미국 게임 무료 Top 50, 2027 Best of 후보권 |
| 1개월 뒤 DAU | 600 | 6,000 | 6만 |

- 갈림길은 **피처드 여부**다. 그래서 2절의 두 신청서와 접근성·현지화 품질이 마케팅 예산의 대신이다.

---

## 6. 출시 전에 반드시 더할 것 5개 / 뺄 것

### 6-1. 더할 것 (우선순위 순)

| # | 무엇 | 왜 1위에 필요한가 | 크기 [팀 추정] |
|---|---|---|---|
| ① | **공유 실제 구현**: 9:16·~~1:1~~ **4:5** 카드 내보내기, ~~인장 번호~~ **꼬리표 + 인장 무늬**, 이레 두루마리 ~~6초~~ **8초** 영상, 사진 저장 [개정 11-20, D-20] | 무예산 팀의 유일한 바이럴 통로. 지금은 TODO | M. 이미지 공유·평점은 **빌드 1(11-29 동결)**, 영상 인코더는 12-05 관문 뒤 빌드 2. 빌드 1 전 11-25 의존성 리허설 빌드 |
| ② | **이레 뒤 30일 이어짐**: 8일째 이후도 하루 한 획·카드 계속, '보름(15획)' 표식 하나를 MVP로 당김(부록 A-1), 꿈 모티프 10 → **25개**(30밤 동안 같은 장면 없음) | 지금은 장면 12개라 7밤이면 다 쓰고 이레가 '끝'처럼 보인다. D30 6%는 이게 없으면 불가능 | M~L. 모티프는 아트·카피 생산이 병목 |
| ③ | **리텐션 측정**: 1차는 Play Console 리텐션·App Store Connect App Analytics(옵트인 사용자). 부족하면 익명 집계 1개(예: Aptabase·TelemetryDeck 계열)를 넣고 개인정보 라벨·방침을 같은 커밋에 고친다 | 소프트런칭 관문(5-2)을 잴 수 없으면 소프트런칭이 무의미 | S~M. SDK를 넣으면 'Data Not Collected'가 바뀐다 — 오너 결정 필요 |
| ④ | **스토어 첫인상 묶음**: 미리보기 영상 25초(실제 렌더), 아이콘 3안, 스크린샷 1~3장(3-2), 피처 그래픽, 1쪽짜리 프레스킷·랜딩(사전 주문/등록 링크, 개인정보처리방침 같은 사이트) | 피처드 신청서의 '보조 자료 URL'과 크리에이터 시딩 재료 | M. 코드 아님, 디자인·영상 |
| ⑤ | **평점 요청**: 이레째 아침 카드를 본 직후 1회만 OS 리뷰 창(StoreKit / Play In-App Review) | 인디 코너 3.8 하한, 차트 전환. 가장 기분 좋은 순간에 1번 | S. 네이티브 의존성 → ①과 같은 빌드에 |

- 덤(여유가 있으면): 설 전용 모티프 1개 + Apple 인앱 이벤트 '설날 아침의 꿈'. 출시 주 편집팀이 쓸 거리가 된다.

### 6-2. 뺄 것 (과설계)

| 무엇 | 왜 빼나 |
|---|---|
| 사전 등록 보상용 인앱 상품 | 보상 하나 때문에 결제·라벨·심사를 늘린다. 효과(+20%)는 대형 RPG 사례 |
| 수익화('공방 열쇠') 출시 빌드 포함 | 1위·피처드에 필요 없음. D-05대로 1.0 지표 뒤 |
| 획 보정 L1·L2·L3 토글 | 테스트로 하나 고르고 나머지는 코드에서 내린다 |
| 연습지 A/B | 출시 전 테스트를 못 하면 넣지 않는다(D-02 테스트 조건) |
| 대금 녹음·사람 허밍 외주 | 출시 뒤. v0.1 합성음으로 출시, ASMR 시딩만 미룸 |
| 위젯·친구 방문·일본어·LLM·81 기질·결 도감 | D-09 그대로 1.0 이후 |
| 차트 순위 실시간 추적 유료 도구 | 출시 주에만 무료 체험으로 |
| iOS 소프트런칭 | '신작' 편집 기회를 아낀다 |
| 영문명 장기 테스트 | 12-05까지 끝내고 정한다. 미루면 ASO·스크린샷·추천서가 다 멈춘다 |

- **빼지 않는 것**: D-08 스크린리더 획 대체. 공수가 들었지만 Apple 편집팀·ADA 'Inclusivity' 부문에 쓸 수 있는 가장 드문 장점이다.

---

## 7. 오너가 할 일 (계정·신청·마감)

| 마감 | 할 일 | 비용 | 막히면 |
|---|---|---|---|
| **11-21(금)** | Google Play Console 개인 계정 + 신원·기기 인증 | 25 USD | 비공개 테스트·사전 등록·출시가 전부 밀림 |
| **11-21(금)** | Apple Developer Program 개인 가입 | 연 99 USD | TestFlight·사전 주문·피처링 추천 불가 |
| 11-28 | 테스터 15~20명 Gmail 확보(만 14세 이상) | 0 | 14일 카운트 지연 |
| 11-28 | 3절 측정 SDK 여부 결정(넣는다/콘솔만) | 0 | 소프트런칭 판정 불가 |
| 11-28 | 소프트런칭 광고 10~20만 원 허락 여부 | 0~20만 원 | 표본이 작아짐 |
| 12-05 | 영문명 확정(D-06 R5 테스트) + 상표 검색 | 0 | ASO·추천서 정지 |
| 12-05 | 개인정보처리방침·지원 URL 게시 확인, 연락 이메일 | 0 | 심사 거절 |
| 12-01 | (팀 작성, 오너 제출) Google 인디 코너 신청서 | 0 | |
| **12-22** | (팀 작성, 오너 제출) Apple 피처링 추천 '앱 출시' — 늦어도 01-12 | 0 | 3주 미만이면 효과 낮음 |
| 01-12 | App Store 사전 주문 공개, Google 사전 등록 공개 | 0 | |
| 2027-02 | 창구 9기 공고 확인·지원(자격 확인) | 0 | |
| 2027 봄 | BIC·인디크래프트 출품 | 0~소액 | |
| 출시 전 | 게임제작업 등록(구청) | 확인 필요 | 03 문서 |

- Apple Small Business Program·결제 프로필은 인앱 결제가 생기는 1.0 때 해도 된다.

---

## 8. 실행 로드맵 (주 단위, 2026-11-20 금 시작)

**[개정 11-20, D-20] 개발 열은 아래 빌드 계획이 정본이다**(C-integrated v1.1 4-1). 그 아래 옛 표의 '개발' 열(W0~W4)은 [대체됨]이고, 성장·출시·오너 열과 W5 이후는 그대로 유효하다. 비공개 테스트 14일은 **11-29 빌드 1 → 12-13 충족**으로 당겨졌다(옛 가정 12-01 → 12-15).

| 빌드 | 날짜 | 담는 것 | 늦어지면 |
|---|---|---|---|
| 리허설 | 11-25 | 새 네이티브 의존성(sharing·file-system·media-library)만 넣은 EAS 빌드 | 저메모리 설정 재확인 |
| **빌드 1** | **11-29 동결·제출** → 12-13 14일 충족 | 세이브 v2(새 필드 기록, 기능 꺼짐) + 공유(4:5·9:16 PNG, OS 공유, 사진 저장) + 평점 | 평점 → 사진 저장 → (12-01까지 안 되면) 공유 순으로 뺀다. 세이브 v2는 빼지 않는다 |
| 빌드 2 | 12-10 | 세 기둥 M1~M4(기능 플래그), 획 층 가시성, 인코더(12-05 통과 시) 또는 두루마리 이미지 | 미완 기능은 플래그를 끈 채 |
| 빌드 3(RC1) | 12-19 | M5, 모티프 25, 보름 표식, 버그 | 자르는 순서 적용 |
| 동결 | 12-26 전후 | 소프트런칭 빌드(12-29) | — |

| 주 | 기간 | 개발(정본) | 판정 |
|---|---|---|---|
| W0 | 11-21~11-28 | 세이브 v2·공유·평점, 11-25 리허설. 병행: M1 렌더 스파이크, 인코더 스파이크 | 11-26 아트 형태 판정, **11-29 빌드 1** |
| W1 | 11-29~12-05 | M1·M2, 획 층 가시성 | 12-03 처리량 점검, **12-05 블라인드·결 이름 서열·인코더** |
| W2 | 12-06~12-10 | M3·M4 | **12-10 빌드 2** |
| W3 | 12-11~12-17 | M5, 인코더 통합 또는 이미지판, 모티프 | 12-12 머뭇거림 비네트, 12-17 테스터 인터뷰(참고) |
| W4 | 12-18~12-24 | RC1(12-19), 버그 | **12-22 Apple 추천**(스크린샷: 세로 이름·이름표·먹 넷 나란히) |

옛 표(성장·출시·오너 열 유효, W0~W4 '개발' 열은 [대체됨]):

| 주 | 기간 | 개발 | 성장·출시 | 오너 |
|---|---|---|---|---|
| W0 | 11-20~11-26 | EAS Android 빌드 안정화, 공유 ①·평점 ⑤ 네이티브 의존성 목록 확정 | 이 문서 리뷰, 키워드 수정안 store-listing 반영, Threads·Bluesky 몽망이 계정 설계 | **양 스토어 계정 가입**, 테스터 모집 시작 |
| W1 | 11-27~12-03 | 첫 테스트 빌드(공유·평점 포함) | **12-01 Google 인디 코너 신청**, '개발자의 몽망이' 매일 게시 시작 | 테스터 확정, 측정·광고 결정 |
| W2 | 12-04~12-10 | 이레 뒤 이어짐 ②, 모티프 10→18 | 영문명 확정, 아이콘 3안, 프레스킷 초안 | 영문명·URL 확정 |
| W3 | 12-11~12-17 | 모티프 18→25, 보름 표식, 측정 ③ | Google 비공개 테스트 14일 진행 중(12-01 시작 가정 → 12-15 충족), 미리보기 영상 | |
| W4 | 12-18~12-24 | 버그 수정, 출시 후보 1 | **12-22 Apple 피처링 추천 제출**, 프로덕션 액세스 신청(심사 ~7일) | 추천서 제출 |
| W5 | 12-25~12-31 | 소프트런칭 빌드 | **12-29 소프트런칭**(Google, CA·NZ·PH), 아이콘 실험 시작 | |
| W6 | 2027-01-01~01-07 | D1 데이터로 첫 30초 수정 | 크리에이터 30명 연락 시작 | |
| W7 | 01-08~01-14 | App Store 심사 제출 | **01-12 사전 주문·사전 등록 공개**, 랜딩 링크 교체 | |
| W8 | 01-15~01-21 | 설 모티프·인앱 이벤트(여유 시) | **01-19 소프트런칭 판정**(5-2 관문). 미달이면 출시 02-16으로 2주 연기 | 연기 여부 승인 |
| W9 | 01-22~01-28 | 출시 빌드 확정, 대체 아이콘 2안 포함 | 스크린샷·영상 최종, 크리에이터에게 출시 빌드 | |
| W10 | 01-29~02-04 | 출시 감시 | **02-02(화) 양 스토어 정식 출시**, 인앱 이벤트, 출시일 공유 이벤트("같은 날 시작한 몽망이") | |
| W11 | 02-05~02-11 | 핫픽스 | 설 연휴, 차트 매일 기록(한국 시뮬레이션·게임), 리뷰 답글 | |
| W12 | 02-12~02-18 | 1.0 계획 | Apple PPO 켜기, 1차 회고(시나리오 셋 중 어디인가), 창구 9기 지원 | 창구 지원 |
| W13~ | 02-19~ | 1.0(수익 D-05, 바램) | Google 인디 코너 피처링 기대 시점(출시 1~2개월), BIC·인디크래프트·Wholesome 출품 | |

- 빠르게 볼 표식: ~~12-15~~ **12-13** 비공개 테스트 14일 충족([개정 11-20], 빌드 1 11-29 기준) / 12-22 Apple 추천 제출 / 01-19 소프트런칭 관문 / 02-02 출시 / 02-09 한국 시뮬레이션 1위 여부.
- 이 로드맵은 W0에 계정이 열린다는 가정이다. 계정이 한 주 늦으면 W3 이후가 전부 한 주씩 밀리고, 출시는 설 뒤(02-16)로 간다.

---

## 9. 열린 질문·한계

1. 한국 차트 문턱(1-2)은 공개 자료가 없어 팀 추정이다. 출시 4주 전 도구로 확인한다.
2. Google Play Indie Games Festival의 2026 한국 개최 여부를 찾지 못했다. 열리면 1순위로 낸다.
3. 신규 개인 계정의 사전 등록에 프로덕션 액세스가 필요한지 Play Console에서 확인한다.
4. 2027 설 날짜(02-06 전후)와 연휴 범위를 확인한다.
5. 측정 SDK를 넣으면 'Data Not Collected'가 깨진다. 콘솔 지표만으로 판정할 수 있는지 소프트런칭 첫 주에 본다.

## 출처 모음
- Apple 피처링 추천: https://developer.apple.com/help/app-store-connect/manage-featuring-nominations/nominate-your-app-for-featuring
- Apple Getting featured: https://developer.apple.com/app-store/getting-featured · https://developer.apple.com/kr/app-store/getting-featured/ · https://developer.apple.com/jp/app-store/getting-featured/
- Apple 사전 주문: https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/publish-for-pre-order · https://developer.apple.com/app-store/freemium-games/
- Apple PPO: https://developer.apple.com/app-store/product-page-optimization · CPP 70개: https://foxdata.com/en/blogs/apple-doubles-custom-product-page-limit-smarter-aso-asa-strategies-for-black-friday/
- Apple Design Award 2026: https://www.macrumors.com/2026/05/18/apple-design-award-finalists-2026/ · https://9to5mac.com/2026/06/02/apple-reveals-apple-design-awards-app-and-game-winners-for-2026/
- Google 인디 코너 신청: https://support.google.com/googleplay/contact/indie_corners
- Google 사전 등록 90일: https://support.google.com/googleplay/android-developer/answer/9859047 · 넥슨 사례: https://play.google.com/console/about/nexon-casestudy/
- Google 스토어 등록정보 실험·커스텀: https://play.google.com/console/about/customstorelistings/
- Google Play Best of 2026: https://blog.google/products-and-platforms/platforms/google-play/best-of-play-awards-2026 · 한국: https://blog.google/intl/ko-kr/products/android-play-hardware/googleplay-best-of-2026-kr/ · https://wowtale.net/2026/11/18/268245/
- Google Play Best of 2024·2025 한국: https://blog.google/intl/ko-kr/products/android-play-hardware/googleplay-best-of-2024/ · https://blog.google/intl/ko-kr/products/android-play-hardware/googleplay-best-of-2025/
- 창구 8기: https://blog.google/intl/ko-kr/company-news/outreach-initiatives/2026changgooapplication/ · https://blog.google/intl/ko-kr/company-news/outreach-initiatives/changgoo-program-2026-kickoff-kr/ · https://www.unicornfactory.co.kr/article/2026022310584210525
- IGA 2024 한국: https://blog.google/intl/ko-kr/company-news/outreach-initiatives/korean-cohort-for-googleplay-iga
- 2022 Indie Games Festival 한국: https://android-developers.googleblog.com/2022/09/google-play-2022-winning-indie-titles.html?hl=ko
- BIC 2026 Google Play 후원: https://www.invenglobal.com/articles/22904/google-play-joins-as-official-sponsor-for-bic-festival-2026
- 인디크래프트 2026: https://www.gamemeca.com/en/view.php?gid=1773732 · https://www.thisisgame.com/articles/403276
- 서울 인디게임 개발 챌린지 2026: https://indiegame.com/en/archives/27454
- Wholesome: https://wholesomegames.com · https://www.gamespress.com/Wholesome-Snack-Returns-on-December-5th-2026
- 다운로드 문턱: https://sensortower.com/blog/app-downloads-to-number-one · https://www.statista.com/statistics/1317770/us-daily-downloads-needed-rank-first-10-positions-ios-apps · https://www.pocketgamer.biz/comment-and-opinion/67142/sponsored-app-stores-top-ranking-download-requirements/ · https://www.apptweak.com/en/aso-blog/number-of-downloads-to-reach-top-rankings
- 한국 시장 2025 하반기: https://sensortower.com/ko/blog/2H2025-mobile-games-recap-in-Korea
- 리텐션 2026: https://investgame.net/wp-content/uploads/2026/01/2026-01-20-Mobile_retention_benchmarks_2026.pdf · https://gamedevreports.substack.com/p/gameanalytics-mobile-and-pc-game
- 소프트런칭 국가: https://www.pocketgamer.biz/feature/60621/soft-launch/entry/4 · https://payproglobal.com/?p=18889
- 사례: Neko Atsume https://en.wikipedia.org/wiki/Neko_Atsume · https://www.japantimes.co.jp/news/2015/06/29/business/tech/japanese-cat-collecting-game-is-apps-meow · https://knowyourmeme.com/memes/subcultures/neko-atsume / Cats & Soup https://indiegame.com/en/archives/5610 · https://www.pocketgamer.com/cats-soup/40m-downloads / Finch https://foxdata.com/en/blogs/finch-as-app-store-editors-choice-a-self-care-companion/ / Tsuki https://appgoblin.info/apps/com.hyperbeard.odyssey / HOZY https://80.lv/articles/tinybuild-ceo-discusses-success-of-cozy-room-restoration-game-hozy / Urban Jungle https://teletype.in/@sadari/urban_jungl
