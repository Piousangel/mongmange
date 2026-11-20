# 05 — 1위 앱 해부: 키우기·코지·반려 앱은 무엇을 했기에 올랐나

- 작성: 시장 분석가 / 2026-11-20 / v0.1
- 계기: 오너 "대충 만들면 앱스토어 1위 못 한다." → 실제로 1위·피처드에 오른 앱의 공통 기준선을 만들고, 우리 기획과 비교한다.
- 비교 대상: DECISIONS D-19(세 기둥)·D-20(통합 설계 v1.1)·D-21(서버), `docs/design/pillars-v1/C-integrated.md` v1.1, `docs/strategy/number-one.md` v0.2.
- 표기: 출처 링크가 붙은 수치는 그 출처의 값이다. 제3자 추정 도구(AppMagic·Sensor Tower·AppGoblin 등)의 값은 **[추정]**, 팀 판단은 **[팀 추정]**, 앱을 직접 써 본 기억이나 스토어 관찰에 기대고 1차 출처로 확인하지 못한 것은 **[관찰·확인 필요]**로 적는다.
- 한계: 차트 순위의 '날짜별 원자료'(어느 날 몇 위)는 공개 자료가 드물다. 순위 서술은 보도·개발사 발표에 기댄다. 한국 1인·인디 코지 앱이 App Store '투데이'에 오른 1차 기록은 이번에도 찾지 못했다(number-one 1-3과 같은 결론).

---

## 0. 결론 (먼저 읽을 것)

1. **1위·장수 앱은 모두 '돌아올 약속'이 하나 있고, 그 약속이 홈 화면 밖(위젯·알림·잠)까지 나와 있다.** Finch는 6시간 모험 + 위젯, Pokémon Sleep은 잠 → 아침 결과, Neko Atsume는 밥 놓고 닫았다 열기. 우리 '재우기 → 아침 현상'은 이 구조와 같고 Pokémon Sleep이 이미 2억 달러대로 증명한 리듬이다. **기준선은 통과한다.**
2. **우리에게 가장 크게 빠진 것은 두 가지다: ① 홈 화면 위젯(살아 있는 상태가 앱 밖에서 보이는 것) ② 매달 돌아오는 날짜형 이벤트.** Finch는 D1 54%·D7 37% [추정, Sensor Tower 인용]로 장르 최상위인데, 분석가들이 가장 먼저 꼽는 장치가 위젯이다. Duolingo도 위젯 사용자 리텐션이 더 높다고 공개했다. Pokémon Sleep의 매출 급등은 매달 보름달 전후 3일 'Good Sleep Day'와 전설 이벤트에서 나온다. 우리는 이미 '달 모양'과 '보름(15획)'을 갖고 있어 **월 1회 보름밤**이 거의 공짜로 맞는다.
3. **이름은 첫 세션에서 짓는 것이 업계 기준선이다.** Finch·다마고치·Pocket Camp류는 첫 1~2분에 이름을 짓게 해 소유감을 만든다. 우리는 의도적으로 둘째 날 아침에 묻는다(C 2-2). 근거가 있는 선택이지만, D1 이탈자(약 60%)는 이름을 한 번도 못 짓고 떠난다. **'첫날 이름 짓기' vs '둘째 날'을 비공개 테스트 A/B 항목으로 올릴 것을 제안한다.**
4. **장기(D30) 수집 축이 얇다.** 1위 앱은 모두 '칸이 차는 것'(고양이 도감, 잠 모양 도감, 레시피, 옷)이 있다. 우리 출시 전 장기 축은 꿈 모티프 25와 보름 표식뿐이고 결 도감은 1.x다. **피드 없이 혼자 채우는 도감**(꿈 조각·밤 모양 기록)을 1.0 직후 첫 줄로 당길 것을 권한다.
5. **서버 소셜은 '비동기·친구 그래프 없이·자유 글 없이'가 정답 범위다.** 1위 코지 앱 중 실시간 소셜로 오른 것은 없다. 실시간·자유 대화 중심 앱(Miitomo, Bondee)은 1위를 찍고 두 달 안에 무너졌다. 서버 운영비를 감당 못 한 Peridot·Pocket Camp는 서비스를 끝냈다. **D-21 서버는 '링크 보기·백업·플래그·익명 지표'까지만 출시 범위로 두고, 방문·선물은 1.x에 프리셋 반응만 허용**하는 것이 기준선이다(5절).
6. **우리만의 무기는 셋이다: ① 손 획이 몸이 되는 진짜 UGC(경쟁 키우기 앱에 없음) ② 수묵·먹·한지라는 비어 있는 미감 ③ 처벌 없음 + 스크린리더 획 긋기(편집팀이 보는 항목).** 과한 것은 '나란히 놓아야 보이는' 층(타고남 48조합·이름 가락 32·결 이름 8)이 첫인상에 기여하지 않는다는 점이다. 이것들은 지키되 **홍보·스토어 첫 장의 주연으로 쓰지 말 것**.

---

## 1. 사례 해부 (11개)

### 1-0. 한눈에 보기

| # | 앱 | 오른 곳·시점 | 계기 | 공개 수치 |
|---|---|---|---|---|
| 1 | Finch: Self-Care Pet | 미국 Health & Fitness 상위권, App Store Editors' Choice [추정] | 사용자 자발 틱톡(무광고 성장 사례로 자주 인용) | D1 54%·D7 37% [추정], MAU 약 1,000만 [추정], 평점 4.9(약 55만 건) |
| 2 | Cats & Soup (한국 HIDEA → NEOWIZ) | 2021 출시 직후 일본·미국 Google Play 게임 다운로드 3·4위 | 귀여운 고양이 짧은 영상, 시즌 콜라보(산리오) | 누적 6,000만 다운로드 |
| 3 | Neko Atsume (Hit-Point, 일본) | 2014~15 일본 입소문 → Apple '고양이의 날' 기획전 → 세계 | 사진(고양이 앨범) 스크린샷 공유 | 2015 1,000만, 시리즈 3,300만+ |
| 4 | Pokémon Sleep | 2023-07 출시 주 전 세계 게임 다운로드 1위(data.ai) | IP + '잠을 게임으로' 새로움 | 첫해 2,000만 다운로드, 3년 누적 2억 3,490만 달러 [추정] |
| 5 | Pikmin Bloom | 2021 출시 2주 200만, 2025 역대 최고 매출 해 | 걷기 + 꽃 심기, 커뮤니티 데이 | 누적 1억 달러(2025-12) [추정], 5년차 3,610만 달러 |
| 6 | 다마고치(Paradise 기기 + 앱 생태계) | 2025-07 Paradise 예약이 이전 모델의 4배, 누적 1억 대 | 30주년 향수 + 20~30대 | 시리즈 출하 1억 대 |
| 7 | Duolingo의 Duo(감정 마스코트) | 2025-02 'Duo 사망' 캠페인 | 틱톡 캐릭터 운영 | 2주 노출 17억 회, 다음 날 Android 다운로드 +38% [2차 인용] |
| 8 | Bear's Restaurant (Odencat, 일본 인디) | Google Indie Games Festival 2019, Google Play Best of 2019 | 수상 → 피처드 | 150만 다운로드(2022) |
| 9 | Tsuki Adventure / Tsuki's Odyssey (HyperBeard) | 장기 스테디셀러 | 느림 자체가 상품 | Odyssey Android 약 970만 설치 [추정] |
| 10 | Pengu / Friends (Slay GmbH) | 미국 가상 펫 Top 5(2025 Q1) | 친구·연인과 '공동 육아' | 평점 4.8(약 23.8만 건) [추정] |
| 11 | Neko Atsume 2 | 2024-10 출시, 사전 등록 자동 설치 | 전작 팬덤 | Android 약 51만 설치 [추정] — 후속작은 전작만큼 오르지 못함 |

### 1-1. Finch: Self-Care Pet — 감정 마스코트 + 위젯 + 6시간 약속

| 항목 | 내용 |
|---|---|
| 오른 계기 | 광고비 없이 사용자 틱톡으로 성장했다는 분석이 반복된다. 미국 다운로드 약 62%, 최근 90일 234만 다운로드 [추정, [FoxData](https://foxdata.com/en/blogs/finch-as-app-store-editors-choice-a-self-care-companion/)]. 게임이 아닌 Health & Fitness 카테고리에서 경쟁했다(number-one 1-3) |
| 핵심 루프 | 하루 자기돌봄 과제(기분 기록·일기·목표) → 에너지 → 진행 막대가 차면 새가 약 **6시간 모험**을 떠남 → 돌아와 저녁 '대화' → 옷·방 꾸미기 보상 ([Deconstructor of Fun](https://www.deconstructoroffun.com/blog/x0hd2ssr80y5n7gv0w967pg7hwd7tl)) |
| 애착 장치 | 내가 이름 짓고 성별·대명사를 고른 새, 새가 먼저 고마워하고 칭찬함, 성장 단계(아기 → 청소년 → 어른), 위젯 속 새가 내가 없어도 '살아 있음' |
| 소셜 | 친구 코드로 서로 추가(상호 동의). 보낼 수 있는 것은 **프리셋 반응뿐**(안아주기·하이파이브·생각하고 있어) → 받는 쪽에 친구 새가 방문 ([Finch 도움말](https://help.finchcare.com/hc/en-us/articles/37780369483533-Sending-Good-Vibes), [Adding Friends](https://help.finchcare.com/hc/en-us/articles/37780316582413-Adding-Friends)). **자유 메시지가 없다**는 점이 안전한 소셜로 평가됨([Internet Matters](https://www.internetmatters.org/advice/apps-and-platforms/wellbeing/finch/)) |
| 리텐션 | **D1 54% / D7 37%**(Duolingo 51/35, Royal Match 40/25와 비교) — Sensor Tower 담당자 인용 [추정, [Deconstructor of Fun](https://www.deconstructoroffun.com/blog/x0hd2ssr80y5n7gv0w967pg7hwd7tl)]. 리뷰 분석은 새에 대한 애착과 지속 사용이 함께 나타나지만 인과는 아니라고 정리([Appbot](https://appbot.co/blog/finch-app-reviews-emotional-attachment-user-retention-product-loyalty/)) |
| 수익 | 무료 + Finch Plus 구독(소프트 페이월, 체험 후) [추정, [Screens Design](https://screensdesign.com/showcase/finch-self-care-pet)]. 핵심 돌봄은 무료 |
| 첫 세션 | 알 → 부화 → **바로 이름 짓기** → 첫 목표 설정 → 새가 첫 모험을 약속 [관찰·확인 필요] |
| 스토어 페이지 | 아이콘 = 새 얼굴 정면 클로즈업. 스크린샷은 새가 말하는 말풍선 + 짧은 효능 카피(셀프케어) [관찰·확인 필요] |
| 교훈 | ① 위젯이 '앱 밖의 생명'이 된다 ② 소셜은 프리셋 반응만으로 충분하다 ③ 카테고리 선택도 전략 |

### 1-2. Cats & Soup — 보는 것만으로 되는 방치 + 시즌 콜라보 (한국 개발)

| 항목 | 내용 |
|---|---|
| 오른 계기 | 2021 출시 직후 일본·미국 Google Play 게임 다운로드 3·4위([indiegame.com](https://indiegame.com/en/archives/5610) 계열 보도). 1,000만(2022-01) → 2,000만(2022-05) → 3,000만(2022-11) → 4,000만(2023-04) → 5,000만(2023-10) → 6,000만([PocketGamer 20M](https://www.pocketgamer.com/cats-soup/20-million-downloads-event-model-train-tuxedo-cat), [40M](https://www.pocketgamer.com/cats-soup/40m-downloads), [50M](https://pocketgamer.com/cats-soup/50m/), [60M](https://www.pocketgamer.com/cats-soup/60m-downloads/)) |
| 핵심 루프 | 고양이가 알아서 요리 → 코인 → 시설·고양이 해금. 손을 놓아도 화면이 계속 귀엽게 움직임 |
| 애착 장치 | 고양이마다 다른 무늬·성격·이름, 옷 입히기, 아기 고양이(2주년) |
| 소셜 | 친구 그래프·방문 없음(이번 조사에서 확인 못 함). **여행 사진을 SNS에 올리게 하는 기능**(2주년)이 사실상 유일한 공유 장치 ([PocketGamer 2주년](https://pocketgamer.com/cats-soup/2nd-anniv/)) |
| 리텐션·운영 | 다운로드 이정표마다 출석 이벤트, 계절 대형 업데이트(벚꽃 2026-03 등, [NEOWIZ](https://www.neowiz.com/en/media/press-release-detail/3332)), 산리오 콜라보([Inven Global](https://www.invenglobal.com/articles/20753/sanrio-friends-have-come-to-visit-cats-soup)). 공식 유튜브 50만 구독([Game Developer](https://gamedeveloper.com/press-release/cats-soups-youtube-breaks-500k)) |
| 수익 | 무료 + 보상형 광고 + 인앱 결제(코스튬·편의) |
| 첫 세션 | 설치 30초 안에 고양이가 요리하는 장면이 나오고, 첫 탭이 바로 코인 [관찰·확인 필요] |
| 스토어 페이지 | 아이콘 = 고양이 얼굴 한 마리, 큰 눈. 스크린샷은 실제 게임 화면 그대로 + 짧은 카피 [관찰·확인 필요] |
| 교훈 | 소셜 기능이 거의 없어도 6,000만. **화면이 '그 자체로 볼거리'이고, 그게 쇼츠 소재**가 된다. 운영은 '계절 캘린더 + 이정표 이벤트' |

### 1-3. Neko Atsume — 닫아야 진행되는 게임, 공유는 스크린샷

| 항목 | 내용 |
|---|---|
| 오른 계기 | 일본어판만으로 입소문 → Apple이 일본 '고양이의 날'(2/22)에 고양이 기획전 → 해외가 다운로드 30~40% → 2015-10 영어판 뒤 1,000만([Wikipedia](https://en.wikipedia.org/wiki/Neko_Atsume), number-one 1-3). 개발자는 원래 연 5만 다운로드를 목표로 했다([nippon.com](https://nippon.com/en/nipponblog/m00083)) |
| 핵심 루프 | 밥·장난감 두기 → 앱 닫기 → 다시 열면 누가 와 있음 → 사진 찍기·멸치 선물 |
| 애착 장치 | 고양이마다 이름·성격(희귀 고양이), 고양이가 두고 가는 선물(편지 같은 것) |
| 소셜 | 게임 안 소셜 없음. 팬 공유는 거의 트위터 스크린샷 ([nippon.com](https://nippon.com/en/nipponblog/m00083) 계열 해설) |
| 수익 | 무료 + 금 멸치 결제 + 소액 광고 |
| 첫 세션 | 1분 안에 밥을 두고 닫으라는 안내 → '기다림'이 첫 경험 [관찰·확인 필요] |
| 후속작 | Neko Atsume 2(2024-10-20, [Famitsu](https://www.famitsu.com/article/202410/21665))는 Android 약 51만 설치 [추정, [AppGoblin](https://appgoblin.info/apps/jp.co.hit_point.nekoatsume2)] — 전작만큼 차트를 흔들지 못함. **새로움이 빠진 속편은 팬덤만으로 1위가 어렵다** |
| 교훈 | '닫고 기다리는 것'이 루프가 될 수 있다. **편집팀의 날짜 기획전**이 국경을 넘게 했다 |

### 1-4. Pokémon Sleep — 잠이 곧 게임, 매달 보름달 이벤트

| 항목 | 내용 |
|---|---|
| 오른 계기 | 2023-07 출시 주 전 세계 게임 다운로드 1위(data.ai, [Japan Times](https://japantimes.co.jp/business/2023/08/26/tech/pokemon-sleep-smartphone-apps)). 약 5~6주에 1,000만, 첫해 2,000만([Game Developer](https://www.gamedeveloper.com/press-release/pok-mon-sleep-celebrates-one-year-anniversary-and-twenty-million-downloads)) |
| 핵심 루프 | 밤: 폰을 베개 옆에 둠 → 아침: 잠 점수 + '잠 모양'(포켓몬이 자는 모습) 도감 칸이 참 → 낮: 잠만보 키우기 요리 |
| 애착 장치 | 내 잠이 결과를 바꾼다(내 몸 데이터가 재료), 도감 채우기, 잠만보 성장 |
| 소셜 | **친구 그래프·실시간 없음** [관찰·확인 필요]. 공유는 아침 결과 화면·도감 스크린샷. 3주년 'Nap Island'에서 잡은 포켓몬을 보내는 기능 정도 |
| 이벤트 | **Good Sleep Day: 매달 보름달 전후 72시간**, 보상 배율 상승([Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Good_Sleep_Day), [Serebii](https://serebii.net/pokemonsleep/goodsleepday.shtml)). 전설 이벤트가 매출 급등을 만듦(엔테이 리서치 때 월 매출 +55%, [PocketGamer.biz](https://www.pocketgamer.biz/pokmon-sleep-sleepwalks-to-1828m-in-two-years)) |
| 수익 | 무료 + 인앱(꿈 조각·이벤트 팩·월 패스). 3년 누적 2억 3,490만 달러, 첫해 약 1억 달러, 2년차는 첫해의 77% [추정, [Respawn](https://respawn.outlookindia.com/gaming/gaming-news/pok%C3%A9mon-sleep-hits-2349m-revenue-on-3rd-anniversary), [PocketGamer.biz](https://www.pocketgamer.biz/pokmon-sleep-surpasses-230m-in-three-years/)) |
| 리텐션 | 공개 수치 없음. 2025 Q2 미국 Android 활성 16만 → 12.7만 [추정, [Sensor Tower](https://sensortower.com/blog/2025-q2-android-top-5-pokemon%20collector%20games-revenue-us-6089902328293296048c7c1b)] — 이벤트 없으면 완만히 빠짐 |
| 첫 세션 | 첫날은 설정 + "오늘 밤 폰을 베개 옆에" 약속으로 끝난다. **진짜 보상은 첫 아침** [관찰·확인 필요] |
| 교훈 | **우리 '재우기 → 아침 현상' 구조의 가장 가까운 성공 사례.** 첫 아침이 D1의 전부이고, 매달 '달'에 맞춘 이벤트가 장기 리텐션·매출을 끌어올린다 |

### 1-5. Pikmin Bloom — 매출은 해마다 오르는 느린 게임

| 항목 | 내용 |
|---|---|
| 오른 계기 | 출시 2주 200만, 일본이 43%([Nintendo Life](https://www.nintendolife.com/news/2021/11/niantics-new-pikmin-game-has-been-downloaded-2-million-times-in-two-weeks)) |
| 핵심 루프 | 걷기 → 꽃 심기 → 피크민 키우기 → 엽서 모으기 |
| 소셜 | 친구에게 **엽서 보내기**(비동기), 커뮤니티 데이(같은 날 다 같이 걷기 = 공동 목표 느낌), 버섯 함께 부수기 |
| 수익·지표 | 누적 1억 달러(2025-12), **2025년이 역대 최고 해**, 5년차 3,610만 달러로 누적의 37% [추정, [PocketGamer.biz](https://www.pocketgamer.biz/pikmin-bloom-hits-100m-after-four-years-as-2025-becomes-its-best-year-yet), [5년차](https://www.pocketgamer.biz/pikmin-bloom-blossoms-in-fifth-year-with-record-36m/)). 다운로드는 늘지 않는데 매출은 매년 오름(AppMagic) |
| 교훈 | **작은 핵심 유저층 + 꾸준한 날짜 이벤트 = 해마다 자라는 느린 앱.** 1위 순간보다 '안 죽는 것'이 더 큰 매출을 만든다 |

### 1-6. 다마고치 (Paradise 기기 + Uni·앱)

| 항목 | 내용 |
|---|---|
| 오른 계기 | 30주년(2026) 향수. Paradise(2025-07-12) 예약이 이전 모델의 400%, 20~30대가 주 구매층, 시리즈 출하 1억 대 돌파([DIME](https://dime.jp/genre/1976634/), [unwire.hk](https://unwire.hk/2025/08/29/tamagotchi-100-million-units-sold-2025/hottopic), [Bandai Namco](https://www.bandainamco.co.jp/en/ir/library/newsletter82_special.html)) |
| 소셜 | Uni의 Tamaverse: **남이 키운 다마고치가 실시간이 아닌 방식으로 매일 등장**, 유저끼리 메시지는 **불가**([공식 FAQ](https://tamagotchi-official.com/gb/series/uni/faq)). Paradise는 기기를 물리적으로 맞대야 친구 연결 |
| 실패 쪽 | 휴대폰 앱 'Tamagotchi ON' 서비스 종료(2022-08) 때 팬 청원([change.org](https://www.change.org/p/ashley-keep-the-tamagotchi-on-app-running)) — 서버에 기대는 기능이 사라지면 애착 대상이 망가진 느낌 |
| 교훈 | ① 소셜은 '남의 아이가 지나간다' 정도의 비동기면 충분 ② 서버 의존 기능은 끝날 때 배신감이 된다 |

### 1-7. Duolingo의 Duo — 감정 마스코트의 힘과 그림자

| 항목 | 내용 |
|---|---|
| 오른 계기 | 틱톡 캐릭터 운영. 2025-02-11 'Duo 사망' 발표 → 2주 노출 약 17억 회, 사이버트럭 영상 2,570만 회([Fast Company](https://www.fastcompany.com/91313082/duolingo-dead-duo-owl-social-media-campaign), [TechCrunch](https://techcrunch.com/2025/02/18/duolingo-killed-its-mascot-with-a-cybertruck-and-its-going-weirdly-well)). 다음 날 Android 다운로드 +38% [2차 인용, Similarweb] |
| 애착 장치 | **위젯 속 Duo가 연속 기록을 채우지 않으면 점점 불안해지고, 채우면 편해짐**([Duolingo 블로그](https://blog.duolingo.com/widget-feature)). 위젯 사용자는 원래 열심인 사람이라는 점을 보정해도 리텐션이 더 높다고 회사가 밝힘 |
| 그림자 | "포기자를 뭐라고 하지?" 같은 죄책감 알림이 '길트 마케팅' 비판을 받음([요약](https://jtbdux-protocol.pages.dev/adoption-and-behavior/behavior-design-patterns/how-duolingo-engineered-50-million-daily-users-and-the-backlash-that-came-with-it)). 캠페인과 DAU 증가의 직접 관계는 확인 안 됨, CEO는 2025년 DAU 성장 둔화를 인정 |
| 교훈 | **캐릭터가 감정을 '앱 밖'(위젯·알림·SNS)에서 보여 줄 때 가장 강하다.** 단 죄책감은 우리 D-03과 정면 충돌 — 우리는 '기다림·반김'만 가져오고 '불안·실망'은 가져오지 않는다 |

### 1-8. Bear's Restaurant (Odencat) — 인디가 상으로 피처드에 오른 길

| 항목 | 내용 |
|---|---|
| 오른 계기 | Google Play Indie Games Festival 2019 수상 + Google Play Best of 2019([Game Developer](https://www.gamedeveloper.com/press-release/award-winning-mobile-adventure-game-bears-restaurant-gets-free-expansion)). 2022 기준 150만 다운로드 |
| 핵심 | 짧고 감정이 큰 이야기(죽음 이후 기억을 맛보는 식당), 도트 아트 |
| 교훈 | 소규모 인디에게 **'상 → 피처드'가 마케팅을 대신**한다. number-one 2절(인디 코너·Best of)과 같은 길 |

### 1-9. Tsuki Adventure / Tsuki's Odyssey — 느림이 상품

| 항목 | 내용 |
|---|---|
| 내용 | 당근 농장 토끼의 느린 일상. 서두를 방법·시간 빨리감기가 없음. 알림은 '당근 수확' 하나([Sunday Times LK](https://www.sundaytimes.lk/220130/magazine/one-rabbits-journey-to-a-million-carrots-470316.html)) |
| 지표 | Odyssey Android 약 970만 설치, 평점 4.41(8.1만), 수익 인앱 59%·광고 41% [추정, [AppGoblin](https://appgoblin.info/apps/com.hyperbeard.odyssey)] |
| 교훈 | '하루 한 번 잠깐'은 단점이 아니라 정체성이 될 수 있다. 우리 '하루 한 획'과 같은 편 |

### 1-10. Pengu / Friends — 친구·연인과 '공동 육아'

| 항목 | 내용 |
|---|---|
| 내용 | 같은 펫을 친구·연인·가족이 같이 키움(초대 링크로 '가족 그룹'), 위젯으로 앱을 안 열고 상호작용([App Store](https://apps.apple.com/us/app/id6462927800)). 2025 Q1 미국 가상 펫 Top 5 [추정, [Sensor Tower](https://sensortower.com/blog/2025-q1-unified-top-5-virtual%20pet-units-us-62f83d1bf5dff39390bc09c4)] |
| 그림자 | '버그가 많다'는 리뷰, 좋은 콘텐츠가 구독 뒤에 있음([Screens Design](https://screensdesign.com/discover/apps/pengu-raise-virtual-ai-pets/)) |
| 교훈 | **친구 그래프를 '이미 아는 한두 사람'으로 좁히면** 소셜이 가볍다. 단 서버 기능이 늘수록 버그가 평점을 깎는다 |

---

## 2. 공통 패턴 — 1위 앱이 공통으로 가진 것 10개 (필수 기준선)

| # | 기준선 | 근거 사례 | 몽망이 현재 상태 |
|---|---|---|---|
| B1 | **3초 안에 '살아 있는 얼굴'**: 아이콘·첫 화면·영상 첫 장면이 캐릭터 얼굴 | Finch·Cats & Soup·Neko Atsume 아이콘 전부 얼굴 정면 | ◐ 아트 11절 '눈이 열리는 순간'이 첫 30초에 있음. 아이콘 3안 중 A안(방울 얼굴)만 해당 — **아이콘은 얼굴안을 기본으로** |
| B2 | **첫 세션에 소유감**: 이름 짓기·고르기가 첫 2분 안 | Finch 부화 → 이름, 다마고치 | ◐ 첫날 먹 고르기(M1)는 있음. 이름은 **둘째 날**(C 2-2) |
| B3 | **돌아올 약속 1개**(타이머·잠·모험) | Finch 6시간 모험, Pokémon Sleep 아침, Neko Atsume | ● 재우기 → 아침 현상. 강함 |
| B4 | **앱 밖의 생명**: 위젯·잠금화면·정보형 알림 | Finch 위젯, Duo 위젯, Pengu 위젯 | ○ 위젯은 D-09 '1.0 이후'. 알림은 하루 1~2회 정보형(D-03) |
| B5 | **칸이 차는 장기 축**(도감·옷·레시피) | 고양이 도감, 잠 모양 도감, 레시피, 꽃·엽서 | ◐ 꿈 모티프 25, 보름 표식. 결 도감 1.x |
| B6 | **날짜형 이벤트 캘린더**(월·계절·기념일) | Good Sleep Day(매달 보름), Cats & Soup 계절, 고양이의 날 | ○ 설 모티프 1개가 '덤'(number-one 6-1) |
| B7 | **공유할 '결과 한 장'이 자동으로 생김** | 아침 잠 결과, 고양이 사진, 여행 사진 | ● 아침 꿈 카드·이름표·이레 두루마리 |
| B8 | **비침해 수익**: 핵심 돌봄은 무료, 꾸미기·편의를 팖 | Finch(구독은 꾸미기), Cats & Soup, Tsuki | ● D-05 '키운 결과 판매 금지' |
| B9 | **낮은 죄책감 또는 잘 다룬 죄책감** | Tsuki·Neko Atsume(처벌 없음). Duo는 죄책감이 역풍 | ● D-03 처벌 없음, 머뭇거림 0.8초만 |
| B10 | **평점 4.5 이상 + 안정성** | Finch 4.9, Tsuki 4.4~4.7. Pengu는 버그로 비판 | ◐ 목표 4.5(number-one 5-2). 서버 추가(D-21)로 장애 표면이 늘어남 |

범례: ● 기준선 충족 / ◐ 일부 / ○ 없음

### 2-1. 차별화 요소 (1위 앱이 '하나씩' 가진 것)

| 차별화 | 누가 | 몽망이에 있나 |
|---|---|---|
| 내 몸·생활 데이터가 재료(잠·걸음) | Pokémon Sleep, Pikmin Bloom | ● **내 손 획이 재료** — 같은 급의 차별화 |
| 감정이 '효능'(셀프케어) | Finch | ◐ 함께 숨 쉬기(M5)가 약하게 닿음. 효능 주장은 하지 않음(톤) |
| 거대 IP | Pokémon, Pikmin, 다마고치 | ○ 없음 → 미감·새로움으로 대신 |
| 볼거리 화면(방치 중에도 움직임) | Cats & Soup | ◐ 낮 화면 아이들 모션, 흘끗 보기 |
| 공동 육아(친구와 한 아이) | Pengu | ○ 하지 않음(4-4 '하지 않는 것'과 무관하나 서버·관계 위험) |
| 상·피처드 | Bear's Restaurant | 계획 있음(number-one 2절) |

---

## 3. 실패·소멸 사례 5개

| # | 앱 | 무슨 일 | 이유 | 몽망이 교훈 |
|---|---|---|---|---|
| F1 | **Miitomo** (Nintendo, 2016) | 미국·일본 iOS 무료 1위, 3일 만에 100만 → 주간 이탈 약 50%, 2018-05 종료([TechCrunch](https://techcrunch.com/2016/05/26/nintendos-first-game-miitomo-is-turning-into-a-ghost-town/), [GameSpot](https://www.gamespot.com/articles/nintendo-is-shutting-down-its-first-smartphone-gam/1100-6456331/)) | **소셜(친구에게 질문·답)이 핵심 루프의 전부**였고, 친구가 안 오면 할 게 없음. 혼자 하는 이유가 없었다 | 소셜은 혼자 하는 루프 위에 얹는 층이어야 한다. 우리 루프는 혼자 완결 — 지킬 것 |
| F2 | **Bondee** (Metadream, 2023) | 2023-01 출시 며칠 만에 여러 나라 App Store 1위 → 다운로드 2월 260만 → 3월 40만([Bloomberg](https://brp-prod-bcc.bloomberg.com/news/articles/2023-04-26/bondee-app-downloads-plummet-as-china-ties-come-to-light), [Campaign Asia](https://www.campaignasia.com/article/is-bondee-a-brand-safety-red-flag/483501)) | 친구 아바타 방문·실시간 대화가 중심인데, 서비스 불안정·개인정보 의혹·개발사 신뢰 문제가 겹침 | **서버를 두면 신뢰(개인정보·출처)가 제품의 일부**가 된다. D-21 '익명 우선·라벨 다시 쓰기'는 필수 |
| F3 | **Peridot** (Niantic, 2023~2026) | AR 반려 생물. 2023 초 인앱 매출 140만 달러 [추정], 2026-08-31 서버 종료([PocketGamer.biz](https://www.pocketgamer.biz/niantic-to-shut-down-peridot-mobile-as-ar-ambitions-shift-beyond-smartphones/), [mobilegamer.biz](https://mobilegamer.biz/niantic-is-closing-its-virtual-pet-game-peridot/)) | 라이브 AR·서버 운영비에 비해 작은 매출(분석가 해석). 회사 우선순위 변경 | **서버에 기대는 반려는 회사 사정으로 죽는다.** 키운 아이가 사라지는 것은 D-03(처벌 없음)의 최악 버전 |
| F4 | **Animal Crossing: Pocket Camp** (2017~2024) | 2024-11-28 온라인 종료 → 유료 오프라인판 'Complete'(9.99→19.99달러)로 세이브 이전([Nintendo Life](https://www.nintendolife.com/news/2024/11/its-over-animal-crossing-pocket-camps-online-service-has-officially-ended), [Automaton](https://automaton-media.com/en/news/is-nintendos-animal-crossing-pocket-camp-complete-the-perfect-way-to-end-a-live-service-game/)) | 확률형(포춘 쿠키)·라이브 운영 모델이 지속 불가. 다만 '세이브를 살려 오프라인으로 넘긴 것'은 모범 종료로 평가 | **오프라인 완결 + 세이브 내보내기**가 서버 종료 때 유저를 지킨다. D-21 원칙 '앱은 오프라인에서 완전히 동작'을 끝까지 지킬 것 |
| F5 | **Tamagotchi ON 앱** (2022 종료) | 기기와 연동하던 앱 서비스 종료에 팬 청원([change.org](https://www.change.org/p/ashley-keep-the-tamagotchi-on-app-running)). 일부 구형 다마고치 앱은 업데이트 없이 스토어에서 사라짐([TamaTalk](https://www.tamatalk.com/threads/two-tamagotchi-apps-are-soon-to-stop-working-on-ios.194684/)) | 서버·연동 기능이 애착 대상의 일부였는데, 끊기자 '아이 일부를 잃음' | 서버 기능은 **없어도 아이가 온전한 것**만 서버에 둔다(링크 보기·백업·통계). 몸·결·정은 기기에 |

참고(부분 실패): **Duolingo 죄책감 알림 역풍**(1-7), **Neko Atsume 2 속편 부진**(1-3), **Pengu 버그·페이월 비판**(1-10).

---

## 4. 소셜 기능의 정답 범위

### 4-1. 1위 코지 앱의 소셜 지도

| 방식 | 사례 | 결과 |
|---|---|---|
| 소셜 없음 + 스크린샷 공유 | Neko Atsume, Cats & Soup(여행 사진), Pokémon Sleep | 1위·장수. **가장 흔한 1위 형태** |
| 프리셋 반응(자유 글 없음) | Finch 하이파이브·안아주기 → 친구 새 방문 | 안전하다는 평가, 관리비 거의 0 |
| 비동기 편지·엽서 | Pikmin Bloom 엽서, Kind Words | 효과 있음. 단 Kind Words는 50만+ 편지 중 약 3%를 운영자가 처리, 2인이 5년간 조정([Ziba Scott 인터뷰](https://technotherapies.substack.com/p/a-conversation-with-ziba-scott-on)) |
| '남의 아이가 지나감'(비동기·익명) | 다마고치 Uni Tamaverse(메시지 불가) | 세계와 이어진 느낌을 대화 없이 |
| 공동 목표(날짜) | Pikmin Bloom 커뮤니티 데이, Pokémon Sleep 보름 이벤트(모두 같은 날 보너스) | 친구 그래프 없이도 '다 같이'를 만든다 |
| 공동 육아(1~3명) | Pengu | 작동하나 서버·버그 부담 |
| 실시간·자유 대화 중심 | Miitomo, Bondee | **1위 후 급락** |

### 4-2. 정답 범위 (몽망이용)

| 구분 | 허용 | 금지 |
|---|---|---|
| 그래프 | 친구 그래프 없음(출시) → 1.x에 '링크 손님'(C 4-3)만 | 연락처 불러오기, 추천 친구, 팔로우 수 |
| 내용 | 프리셋 반응(먹 한 방울 보내기·인장 찍기 등), 꿈 조각 선물 | 자유 글·자유 그림 전송(음란 형태 위험 — number-one 4-1, D-10 Spore 사례) |
| 시간 | 비동기(다음 아침에 도착) | 실시간 접속 표시, 채팅 |
| 다 같이 | 날짜형 공동 순간(보름밤에 모두의 몽망이가 같은 달을 봄) | 랭킹·공유 횟수 보상(C 4-4와 같음) |
| 운영 | 신고·숨기기 + 서버에서 내리기 | 사람 손 조정이 필요한 공개 피드 |

- **피로·독성·관리 비용 판단**: 1인 + AI 팀은 Kind Words 수준(3% 조정)의 사람 손을 감당할 수 없다 [팀 추정]. 그래서 **사용자가 만든 글·그림이 다른 사람에게 '전달'되는 기능은 출시 전·1.0에 넣지 않는다.** 획으로 만든 몸 이미지는 공유 링크 웹 페이지(D-21 ①)에서만 보이고, 링크를 받은 사람만 본다(이미 정해진 범위와 같음).
- **친구 그래프 없이 되는 소셜**(D-21 ③의 1.x 후보를 이 순서로 권함): ① 보름밤 공동 순간(서버는 '오늘 몇 명이 같은 달을 봤나' 숫자 하나) ② 링크 손님 프리셋 반응 ③ 꿈 조각 선물(비동기, 다음 아침 도착). 이 셋 모두 자유 입력 0.

---

## 5. 몽망이 갭 분석

### 5-1. 기준선에서 빠진 것 (우선순위 순)

| # | 빠진 것 | 왜 중요한가(근거) | 제안 | 비용·위험 [팀 추정] |
|---|---|---|---|---|
| G1 | **홈 화면 위젯** (B4) | Finch·Duolingo 모두 위젯을 리텐션 핵심으로 꼽음. 우리 '잠·기다림'은 위젯에 가장 잘 맞는 상태다(자는 몽망이, 기다림 자세) | **1.0 직후 첫 줄**. 정적 이미지 위젯(낮/밤/기다림 3상태)부터. 출시 전 여유가 생기면 M5 함께 숨 쉬기(1.5일)와 맞바꾸는 안을 PM에 제안 | 2~3개발일, 네이티브 타깃 추가라 EAS 메모리 위험(D-18) 재확인 필요 |
| G2 | **월 1회 날짜형 이벤트 '보름밤'** (B6) | Pokémon Sleep의 매달 보름 72시간 이벤트가 매출·복귀를 만든다. 우리는 이름표에 '그날 밤 달 모양'이 이미 있고, 보름(15획) 표식도 있다 | 보름 전후 밤에 특별 꿈 모티프 1개 + 아침 카드 테두리. **D-21 ④ 원격 플래그로 켜고 끔**(앱 업데이트 없이). 첫 회는 출시 직후 보름 | 모티프 아트 1장/월. 서버는 날짜 플래그뿐 |
| G3 | **첫날 이름 짓기 검증** (B2) | 업계 기준선은 첫 세션 이름. D1 이탈자는 둘째 날 이름 화면을 못 본다 | 비공개 테스트(빌드 2)에서 '첫 밤 직전 이름' vs '둘째 날 아침 이름' 비교. 지금 설계(둘째 날)의 근거(첫 밤 권한·안심 문구 과밀)는 유지하되 숫자로 판정 | 플래그 하나, 0.5일 |
| G4 | **혼자 채우는 도감** (B5) | 모든 사례가 '칸이 차는 것'을 가짐. D30 6%의 가장 큰 구멍(number-one 0-4와 같은 진단) | 1.0 직후: '꿈 조각 도감'(모티프 25칸) + '밤 모양 기록'. 결 도감(8칸)은 1.x 그대로. 피드·비교 없이 내 것만 | 1.5~2일 + 아트 기존 재사용 |
| G5 | **스토어 첫 장 = 얼굴** (B1) | 사례 아이콘이 모두 얼굴 정면 클로즈업 | 아이콘 A안(방울 얼굴 크게)을 기본, B·C는 시험군. 스크린샷 1장 = 7일차 얼굴 + 아침 카드(number-one 3-2 유지) | 0일(결정만) |
| G6 | **서버 장애·신뢰 설계** (B10) | Bondee·Peridot·Tamagotchi ON | 서버가 꺼져도 앱 100% 동작 테스트를 출시 기준에 넣기, 세이브 내보내기 코드(D-06) 유지, 개인정보 라벨 재작성(D-21) | 테스트 0.5일 |

### 5-2. 과한 것 (기준선 대비)

| # | 과한 것 | 왜 | 제안 |
|---|---|---|---|
| X1 | **나란히 놓아야 보이는 층의 수**(타고남 48조합·이름 가락 32·결 이름 8·정 단계) | 1위 앱의 개체 차이는 **한눈에** 보인다(고양이 무늬, 잠 모양). 우리는 한눈에 보이는 주연이 손 획 하나이고 나머지는 지내야 보임(C 0-2가 이미 인정) | 기능은 지키되 **스토어·홍보·첫 30초에서 언급하지 않는다**. 12-03 처리량 미달 시 자르는 순서(M5 → 가락 → 결 이름)는 기준선 관점에서도 맞음 |
| X2 | **'정' 단계의 미세 신호**(흘끗 보기 1/6 확률, 정 4 ±45분 기다림) | 사례의 애착 신호는 크고 분명하다(Finch 새가 말로 고마워함, Duo 표정). 은은하면 못 알아봄(C M4 위험란과 같음) | 못 알아보면 '처음 3번 자막' 대체안(C 4-1)을 기본값으로 시작하고 테스트에서 끄는 방향 검토 |
| X3 | **서버 범위가 출시 전에 넓어질 위험**(D-21 ③ 방문·도감·비교) | 실패 사례 F1·F2·F3 모두 서버 소셜이 핵심이었다. 가용일은 0.25일 여유(C 4-1) | 출시 전 서버 = 링크 웹 보기·백업·플래그·익명 지표 **까지만**. 방문은 1.x에 프리셋 반응만 |
| X4 | 영상 인코더 자체 모듈(5일) | 사례 중 공유 영상을 앱이 직접 만든 곳은 드물다. 1위 앱 공유의 기본은 이미지 한 장 | 12-05 관문 미달 시 이미지판으로 가는 기존 결정(D-18)이 맞다. 관문을 엄격히 지킬 것 |

### 5-3. 우리만의 무기 (지키고 키울 것)

| # | 무기 | 사례 대비 |
|---|---|---|
| W1 | **손 획이 몸이 됨**(진짜 UGC 성장) | 키우기 앱 중 유저가 몸을 직접 그리는 것은 사례에 없다. Pokémon Sleep '내 잠이 재료'와 같은 급의 새로움 → 편집팀 이야깃거리. 미리보기 영상·랜딩의 주연(C '획 → 몸' 15초 루프) |
| W2 | **잠 → 아침 리듬** | Pokémon Sleep이 증명한 구조를 IP 없이, 센서 없이 한다. 첫 아침 카드가 D1의 전부 — 품질을 가장 많이 들일 곳 |
| W3 | **수묵·먹·한지 미감** | 코지 장르는 파스텔·도트가 대부분. 빈 자리. 설·추석·한글날 같은 **날짜형 편집 기획**(Neko Atsume '고양이의 날' 경로)에 맞는다 |
| W4 | **처벌 없음 + 관계 문구 알림 금지** | Duolingo 죄책감 역풍의 반대편. 셀프케어 성향 유저(Finch 층)가 편하게 남는 이유가 된다 |
| W5 | **스크린리더 획 긋기**(D-08) | 사례 어디에도 없다. Apple 편집팀·ADA Inclusivity에 쓸 수 있는 가장 드문 장점(number-one 6-2와 같음) |
| W6 | **광고·확률형 없음**(D-05) | Pocket Camp 종료 원인(확률형 라이브 모델)을 처음부터 피한다 |

### 5-4. 출시 전 품질 기준선 체크리스트 (제안)

이 표를 '1위 기준선' 점검표로 12-19 RC1 리뷰 때 쓴다.

| # | 기준 | 통과선 [팀 추정] |
|---|---|---|
| Q1 | 설치 후 눈이 열리는 순간까지 | 10초 이내(아트 11절 9.0초 비트 유지) |
| Q2 | 첫 세션에 고른 것 1개 이상 | 먹 고르기 완료율 90% 이상(안 고르면 씨앗) |
| Q3 | 첫 아침 카드 도달 | 첫 밤을 넘긴 유저의 80% 이상이 카드를 봄 |
| Q4 | 공유 1탭 | 아침 카드에서 OS 공유까지 2탭 이하 |
| Q5 | 오프라인 완전 동작 | 서버 차단 상태로 7일 시나리오 통과 |
| Q6 | 평점 요청 | 이레 아침 1회만, 그 외 0회 |
| Q7 | 아이콘·첫 스크린샷 | 얼굴이 보인다(외부 5명 중 4명이 "얼굴"이라고 답함) |
| Q8 | 알림 | 정보형만, 관계 문구 0개(D-03) |

---

## 6. 열린 질문

1. 위젯(G1)을 출시 전으로 당길지 — M5와 맞바꿀지는 PM·오너 판단. 1.0 직후가 기본.
2. 보름밤(G2)이 '하루 한 획' 리듬과 충돌하지 않는지(그날만 특별 꿈) — 시스템 디자이너 확인.
3. 이름 시점 A/B(G3)를 비공개 테스트 12명으로 판정할 수 있는가 — 표본이 작아 '참고'로만. 소프트런칭(12-29~01-19)에서 다시 본다.
4. Finch D1·D7 수치는 Sensor Tower 담당자의 2차 인용이다. 소프트런칭 비교 기준은 number-one 5-1 장르 기준을 그대로 쓴다.

---

## 출처 모음

- Finch: [Deconstructor of Fun](https://www.deconstructoroffun.com/blog/x0hd2ssr80y5n7gv0w967pg7hwd7tl) · [FoxData](https://foxdata.com/en/blogs/finch-as-app-store-editors-choice-a-self-care-companion/) · [Appbot](https://appbot.co/blog/finch-app-reviews-emotional-attachment-user-retention-product-loyalty/) · [Finch 도움말 Good Vibes](https://help.finchcare.com/hc/en-us/articles/37780369483533-Sending-Good-Vibes) · [Finch 친구 추가](https://help.finchcare.com/hc/en-us/articles/37780316582413-Adding-Friends) · [Internet Matters](https://www.internetmatters.org/advice/apps-and-platforms/wellbeing/finch/) · [Screens Design](https://screensdesign.com/showcase/finch-self-care-pet)
- Cats & Soup: [PocketGamer 20M](https://www.pocketgamer.com/cats-soup/20-million-downloads-event-model-train-tuxedo-cat) · [40M](https://www.pocketgamer.com/cats-soup/40m-downloads) · [50M](https://pocketgamer.com/cats-soup/50m/) · [60M](https://www.pocketgamer.com/cats-soup/60m-downloads/) · [2주년](https://pocketgamer.com/cats-soup/2nd-anniv/) · [NEOWIZ 봄 업데이트](https://www.neowiz.com/en/media/press-release-detail/3332) · [Inven Global 산리오](https://www.invenglobal.com/articles/20753/sanrio-friends-have-come-to-visit-cats-soup) · [유튜브 50만](https://gamedeveloper.com/press-release/cats-soups-youtube-breaks-500k) · [indiegame.com](https://indiegame.com/en/archives/5610)
- Neko Atsume: [Wikipedia](https://en.wikipedia.org/wiki/Neko_Atsume) · [nippon.com](https://nippon.com/en/nipponblog/m00083) · [Famitsu(2편)](https://www.famitsu.com/article/202410/21665) · [AppGoblin(2편)](https://appgoblin.info/apps/jp.co.hit_point.nekoatsume2)
- Pokémon Sleep: [Japan Times](https://japantimes.co.jp/business/2023/08/26/tech/pokemon-sleep-smartphone-apps) · [Game Developer 1주년](https://www.gamedeveloper.com/press-release/pok-mon-sleep-celebrates-one-year-anniversary-and-twenty-million-downloads) · [PocketGamer.biz 3년](https://www.pocketgamer.biz/pokmon-sleep-surpasses-230m-in-three-years/) · [2년](https://www.pocketgamer.biz/pokmon-sleep-sleepwalks-to-1828m-in-two-years) · [Respawn](https://respawn.outlookindia.com/gaming/gaming-news/pok%C3%A9mon-sleep-hits-2349m-revenue-on-3rd-anniversary) · [Sensor Tower 2025 Q2](https://sensortower.com/blog/2025-q2-android-top-5-pokemon%20collector%20games-revenue-us-6089902328293296048c7c1b) · [Bulbapedia Good Sleep Day](https://bulbapedia.bulbagarden.net/wiki/Good_Sleep_Day) · [Serebii](https://serebii.net/pokemonsleep/goodsleepday.shtml)
- Pikmin Bloom: [Nintendo Life](https://www.nintendolife.com/news/2021/11/niantics-new-pikmin-game-has-been-downloaded-2-million-times-in-two-weeks) · [PocketGamer.biz 1억](https://www.pocketgamer.biz/pikmin-bloom-hits-100m-after-four-years-as-2025-becomes-its-best-year-yet) · [5년차](https://www.pocketgamer.biz/pikmin-bloom-blossoms-in-fifth-year-with-record-36m/)
- 다마고치: [공식 Uni FAQ](https://tamagotchi-official.com/gb/series/uni/faq) · [DIME](https://dime.jp/genre/1976634/) · [unwire.hk](https://unwire.hk/2025/08/29/tamagotchi-100-million-units-sold-2025/hottopic) · [Bandai Namco](https://www.bandainamco.co.jp/en/ir/library/newsletter82_special.html) · [Tamagotchi ON 청원](https://www.change.org/p/ashley-keep-the-tamagotchi-on-app-running) · [TamaTalk](https://www.tamatalk.com/threads/two-tamagotchi-apps-are-soon-to-stop-working-on-ios.194684/)
- Duolingo: [Fast Company](https://www.fastcompany.com/91313082/duolingo-dead-duo-owl-social-media-campaign) · [TechCrunch](https://techcrunch.com/2025/02/18/duolingo-killed-its-mascot-with-a-cybertruck-and-its-going-weirdly-well) · [Duolingo 위젯 블로그](https://blog.duolingo.com/widget-feature) · [백래시 요약](https://jtbdux-protocol.pages.dev/adoption-and-behavior/behavior-design-patterns/how-duolingo-engineered-50-million-daily-users-and-the-backlash-that-came-with-it)
- Bear's Restaurant: [Game Developer](https://www.gamedeveloper.com/press-release/award-winning-mobile-adventure-game-bears-restaurant-gets-free-expansion)
- Tsuki: [AppGoblin](https://appgoblin.info/apps/com.hyperbeard.odyssey) · [Sunday Times LK](https://www.sundaytimes.lk/220130/magazine/one-rabbits-journey-to-a-million-carrots-470316.html)
- Pengu: [App Store](https://apps.apple.com/us/app/id6462927800) · [Sensor Tower 2025 Q1](https://sensortower.com/blog/2025-q1-unified-top-5-virtual%20pet-units-us-62f83d1bf5dff39390bc09c4) · [Screens Design](https://screensdesign.com/discover/apps/pengu-raise-virtual-ai-pets/)
- 실패: Miitomo [TechCrunch](https://techcrunch.com/2016/05/26/nintendos-first-game-miitomo-is-turning-into-a-ghost-town/) · [GameSpot](https://www.gamespot.com/articles/nintendo-is-shutting-down-its-first-smartphone-gam/1100-6456331/) / Bondee [Bloomberg](https://brp-prod-bcc.bloomberg.com/news/articles/2023-04-26/bondee-app-downloads-plummet-as-china-ties-come-to-light) · [Campaign Asia](https://www.campaignasia.com/article/is-bondee-a-brand-safety-red-flag/483501) / Peridot [PocketGamer.biz](https://www.pocketgamer.biz/niantic-to-shut-down-peridot-mobile-as-ar-ambitions-shift-beyond-smartphones/) · [mobilegamer.biz](https://mobilegamer.biz/niantic-is-closing-its-virtual-pet-game-peridot/) / Pocket Camp [Nintendo Life](https://www.nintendolife.com/news/2024/11/its-over-animal-crossing-pocket-camps-online-service-has-officially-ended) · [Automaton](https://automaton-media.com/en/news/is-nintendos-animal-crossing-pocket-camp-complete-the-perfect-way-to-end-a-live-service-game/)
- 소셜 운영: Kind Words [Ziba Scott 인터뷰](https://technotherapies.substack.com/p/a-conversation-with-ziba-scott-on) · [Kotaku](https://kotaku.com/kind-words-a-game-about-sending-nice-letters-to-strang-1840537946)
