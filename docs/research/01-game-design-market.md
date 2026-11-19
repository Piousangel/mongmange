# 01. 게임 디자인·시장 조사 — mongmangE 키우기

- 작성: 게임 기획 리드 / 2026-11-19
- 범위: 레퍼런스 조사, 자유도 구현 방식 비교, 실패 사례(반증), 몽망이 제안
- 수치 원칙: 출처를 달 수 있는 수치만 쓴다. 제3자 추정치(AppGoblin, Adapty, Sensor Tower 블로그 스냅샷 등)는 **[추정]**, 팀 판단은 **[팀 추정]** 이라고 표시한다. 출처끼리 수치가 다르면 둘 다 적는다.
- 한계: 앱스토어 리뷰 원문을 대량으로 긁지는 않았다. 불만 항목은 리뷰 집계 사이트, 언론 리뷰, 커뮤니티 글에서 가져왔고 일부는 AI가 요약한 집계(marlvel.ai, GameBrain)라 근거가 약하다. 근거가 약한 곳은 본문에 그렇다고 적었다.

---

## 0. 결론 요약

1. 장르가 오래 버티는 조건은 **"짧은 하루 방문 + 실시간 시간 흐름 + 수집/분기의 장기 목표 + 강요 없는 과금"** 이다. Neko Atsume, Cats & Soup, Finch가 이 공식으로 오래 버텼다. Talking Tom류는 광고 과다로 규제기관 지적과 학부모 비판을 받았다.
2. "엄청난 자유도"를 첫 버전부터 전부 넣으면 1인+AI 팀은 콘텐츠를 감당하지 못한다. 추천은 **습관·성격 시뮬레이션(유저가 하루하루 하는 행동이 쌓여 성격 수치가 되고, 그 성격이 외형·진화·행동을 결정)** 하나를 핵심 축으로 두는 것이다. 나머지 자유도(꾸미기, 직업)는 이 축 위에 얹는다.
3. 생성형 대화(LLM)는 차별점이 될 수 있지만 운영비, 아동 안전 정책, 캐릭터가 엇나가는 위험이 커서 **MVP에서는 빼고 1.x 옵션 기능으로 실험**한다.
4. 수익 모델은 **무료 + 꾸미기 IAP + 선택형 보상 광고 + 일회성 "후원자 팩"** 을 추천한다. 에너지 제한, "돌보려면 돈을 내야 하는" 구조, 강제 전면광고는 쓰지 않는다.
5. 출시 언어는 **영어+한국어 동시**를 추천한다. 코지 펫 장르의 매출은 북미 비중이 크고(Finch 다운로드의 약 62%가 미국 [추정]), 한국 상위 매출은 방치형 RPG가 차지하고 있어 한국만 노리기는 어렵다.

---

## 1. 레퍼런스 조사

### 1.1 요약표

| 게임 | 핵심 루프 | 리텐션 장치 | 수익 모델 | 반복되는 불만 | 규모 지표 |
|---|---|---|---|---|---|
| 다마고치 (Uni 포함, Bandai) | 배고픔/기분/똥 처리 → 성장 단계 → 돌본 방식에 따라 다른 캐릭터로 진화 | 실시간 시간, 방치하면 상태 악화와 사망, 진화 분기 수집, Uni는 Wi-Fi로 Tamaverse 연결 | 하드웨어 판매(Uni는 충전식) | Tamaverse 버그(Bandai가 2.1.0 패치로 수정), 배터리 약 3일, 기능 대비 비싼 가격 | 2025년 7월 말 기준 누적 출하 1억 대 돌파(Bandai Namco 공식). 출하량의 약 절반이 일본, 33%가 미주 |
| Tamagotchi Adventure Kingdom (Apple Arcade, 2024-01) | 오픈월드 탐험, 퀘스트, 캠프 꾸미기 | 캐릭터 약 300종 수집, 캠프 건설 | Apple Arcade 구독 안에 포함(앱 내 과금 없음) | 할 일 목록이 계속 늘어나 부담스럽다(GamesHub) | GamesHub 4/5. 판매·이용자 공개 수치 없음 |
| Pou (Zakeh) | 먹이기, 씻기기, 재우기, 미니게임으로 코인 → 옷·방 꾸미기 | 상태 수치 감소, 미니게임 | iOS는 IAP 100% [추정], 3D 신작은 광고+IAP [추정] | 크래시·기술 문제, 플랫폼 간 가격 차이(AI 요약, 근거 약함) | Google Play 5억+ 설치(Exodus), AppBrain은 10억+ 설치로 표기. 수치가 출처마다 다름 |
| My Talking Tom (Outfit7) | 따라 말하기 반응, 먹이기, 미니게임, 꾸미기 | 상태 수치, 레벨, 미니게임, 대규모 IP 미디어(애니) | 광고와 IAP. MTT Friends 2는 IAP 85%/광고 15% [추정] | 광고 과다. CARU(미국 어린이광고심의기구)가 2019년 광고 표시와 COPPA 미준수를 지적. Common Sense Media는 "광고로 가득 찬" 앱이라고 평가. 20개 넘는 단체가 FTC에 제한을 청원 | 브랜드 누적 250억 다운로드(Outfit7 발표). MTT Friends 2는 출시 1주일 만에 600만 다운로드 |
| Neko Atsume (Hit-Point, 2014) / 2편(2024-10) | 마당에 밥과 장난감을 놓고 앱을 끄면, 다음에 열었을 때 어떤 고양이가 와 있다 | 실시간 방문, 희귀 고양이 수집, 사진첩, 선물 | 무료+IAP(소액). 2편은 IAP 100% [추정] | 2편이 1편보다 과금이 무겁고 재화가 덜 나온다(유저 리뷰 요약) | 1편 1,900만 이상(ANN 2024) 또는 2,200만(Sensor Tower 2018) 다운로드. 시리즈 3,300만+(2편 스토어 설명). 수치가 출처마다 다름 |
| Finch: Self-Care Pet | 유저가 현실 목표(물 마시기, 일기 쓰기)를 달성 → 새가 에너지를 얻어 모험을 떠남 → 성장과 대화 | 현실 습관이 곧 펫 성장, 연속 기록, 친구 기능 | 구독(Finch Plus 연 $39.99~$69.99), 주로 꾸미기. 기본 기능은 무료 | 무료 체험 후 연간 요금 즉시 결제 같은 결제 혼선(Trustpilot), 에너지 장치가 "게임 루프 같다", UI 학습 비용 | 월 약 $1M 매출 [추정, Adapty·Screens Design], 월 25만 또는 60만 설치로 추정치가 엇갈림. 최근 90일 234만 다운로드, 미국 61.78% [추정, FoxData]. 평점 4.95 [AppGoblin] |
| Cats & Soup (HIDEA / 퍼블리셔 Neowiz) | 방치형. 고양이가 요리 → 재화 → 시설과 고양이 해금 | 오프라인 보상, 고양이 수집, 꾸미기 | 광고+IAP | 이번 조사에서 확인 못 함 | 2023년 누적 4,000만 다운로드(국내 보도). 미국 주간 매출 약 $57K~$61K(2025 Q4) [추정, Sensor Tower 스냅샷] |
| Tsuki's Odyssey (HyperBeard) | 토끼 Tsuki가 시골에서 혼자 사는 일상을 지켜본다. 낚시와 마을 주민 관계 | 실시간 진행, "천천히 조금씩 하는" 설계 | 선택형 광고+IAP. 비중은 출처마다 다름(IAP 59/광고 41 또는 25/75) [추정] | 바를 연 뒤로는 목표가 없다, 스토리 진행이 너무 느리다(GameBrain 리뷰 요약) | 월 매출 $10K 미만 [추정]. GameGrin 8.5/10, GameBrain 유저 점수 80%(3,088건) |
| Slime Rancher 1·2 (PC/콘솔) | 슬라임 포획 → 먹이 → 플로트(재화) → 목장 확장, 교배하면 창발적 혼란 | 탐험, 신종 슬라임, 슬라임끼리 섞이는 창발 시스템 | 유료 패키지 | (모바일 아님) | 1편 2022-01 기준 500만 장, 2편 출시 후 30만 장(2022) |
| Ooblets (PC/콘솔) | 농사 + 웁렛 수집 + 댄스 배틀 | 수집, 마을 꾸미기 | 유료 패키지 | Epic 독점 계약으로 개발사가 혐오 공격을 받음 | 판매량 공개 수치 못 찾음 |
| BitLife (Candywriter) | 텍스트로 한 해씩 살며 선택 → 무작위 사건 → 한 인생 완주 → 새로 시작 | 짧은 회차 반복, 엔딩과 업적 수집, 시즌성 챌린지 | 광고+IAP(비중 59/41 [추정]), 확장팩 판매 | 광고와 페이월 과다, 이전 구매 복원 실패(AI 요약, 근거 약함) | 설치 1.277억 [추정, AppGoblin]. 미국 주간 매출 2025 Q2 최대 약 $497K [추정, Sensor Tower 스냅샷] |
| 동물의 숲 포켓캠프 (Nintendo) | 캠프 꾸미기, 주민 요청, 재료 수집 | 이벤트, 주민 호감도 | F2P(리프티켓, 월 구독) → 2024-11 서비스 종료 → 유료판 Complete로 전환 | 유료판에서 일부 기능이 빠졌다(GamesRadar) | 종료 사유는 공식 발표 없음. 유료판은 $19.99 정가, 출시 초기 $9.99 할인 |

### 1.2 시장 맥락

- **한국 시장**: 2025년 하반기 한국 모바일 게임 매출은 약 28억 달러로 상반기보다 8.3% 늘었다(Sensor Tower). 상위권은 '메이플 키우기'와 '갓깨비 키우기' 같은 **방치형 RPG "키우기"** 가 차지한다. 한국에서 "키우기"라고 하면 보통 수치를 키우는 RPG를 떠올리기 때문에, 우리 게임은 생명체를 돌보는 게임이라는 것을 스토어 문구와 아트로 분명히 보여줘야 한다. 그렇지 않으면 엉뚱한 기대를 하고 들어온 유저가 빠져나간다 [팀 추정].
- **펫 장르 매출 규모**: 미국 가상 펫 카테고리 상위 앱의 주간 매출은 1~5만 달러대다(2025 Q4, My Cat 약 $53K/주) [추정, Sensor Tower 블로그. 이 블로그는 AI 작성자 표기가 있어 원 데이터로 다시 확인해야 함]. 이 장르는 BitLife(주간 수십만 달러)나 방치형 RPG보다 매출 규모가 작다. 대신 오래 서비스되고 평판이 좋다.
- **AI 펫 흐름**: 2025년에 Pengu(Born, $15M 투자 유치), ZumiGames, AIBI Pocket 같은 AI 펫이 잇따라 나왔다. 2026-10에는 Meta가 대화하면서 학습하는 AI 펫 앱(Waddle World, 성인 대상)을 냈다. "AI가 말하는 펫"만으로는 이제 차별점이 되지 않는다.
- **리텐션 기준**: 2025년 모바일 게임 중앙값은 D1 약 22%, 상위 25%는 D1 30% 남짓, 중앙값 D7은 4% 미만이다(GameAnalytics·InvestGame 2026 벤치마크, 1.6만 개 이상 게임). 장르 범위로는 캐주얼 D30 3~7%가 자주 인용되지만 출처가 불분명하다.
- **알림**: 게임 앱의 푸시 수신 동의율은 iOS 약 20~30%로 낮다(Pushwoosh, 보고서마다 다름). 수신 동의 유저의 한 달 뒤 잔존율은 55%, 거부 유저는 29%였다(PocketGamer.biz 차트). 알림은 리텐션에 크게 영향을 주지만, 동의를 받을 기회가 사실상 한 번뿐이다.

---

## 2. "엄청난 자유도" 구현 방식 비교

| 방식 | 예시 | 재미 | 제작비 | 위험 |
|---|---|---|---|---|
| A. 성장 분기(진화 트리) | 다마고치, 디지몬 | 높음. "우리 애는 뭐가 될까"라는 기대와 수집욕 | 중~상. 분기마다 아트 세트가 필요하다. 분기 수 × 단계 수만큼 그림이 늘어난다 | 분기가 공략으로 정리되면 자유도가 아니라 정답 찾기가 된다. 한번 다 보면 콘텐츠가 바닥난다 |
| B. 성격·습관 시뮬레이션 | Finch(현실 습관), The Sims의 특성, 다마고치의 돌봄 실수 | 높음. "내가 키운 방식 그대로 자란다"는 소유감 | 중. 시스템 설계가 중심이라 수치와 규칙으로 표현을 늘릴 수 있고, 아트는 모듈식으로 조합한다 | 차이가 눈에 안 보이면 의미가 없다. 성격이 행동·대사·외형에 드러나야 한다 |
| C. 생성형 대화(LLM) | Pengu, Waddle World, iPET(ACL 2025) | 초반 놀라움이 매우 크다. 장기 재미는 아직 검증되지 않음 | 개발은 낮지만 **운영비가 유저 수에 비례**해 늘어난다 | 캐릭터 붕괴, 부적절한 출력, 아동 대상이면 정책 위험이 크다. Google Play는 AI 생성 앱에 앱 안 신고 기능을 의무로 요구하고, Families 정책도 함께 적용된다. 경쟁작이 늘어 차별점이 약해진다 |
| D. 꾸미기·집 | Pou, 포켓캠프, Cats & Soup | 중~높음. 표현욕을 채우고 과금과 연결이 쉽다 | 중. 아이템을 계속 만들어야 한다(AI 아트로 생산 가능하지만 품질 관리가 필요) | 혼자서는 자유도라기보다 장식이다. 아이템 공급이 끊기면 할 게 없다 |
| E. 직업·인생 선택 | BitLife, 다마고치 직업 | 높음. 서사가 생기고 회차를 반복할 동기가 된다 | 중~상. 텍스트 사건 풀이 넓어야 한다(LLM 보조 집필은 가능) | 텍스트 위주면 "키우는" 감각이 약하다. 사건이 반복되면 바로 티가 난다 |
| F. 창발적 시스템 | Slime Rancher의 슬라임 혼합, 생태계 | 매우 높음. 유저마다 다른 이야기가 생기고 공유할 거리가 된다 | 상. 균형을 잡고 버그를 잡는 데 비용이 크다 | 예측이 어려워 QA가 힘들다. 모바일의 짧은 세션과 잘 맞지 않을 수 있다 |

**판단**: 1인+AI 팀이 "자유도가 크다"는 느낌을 가장 싸게 내려면, **B(성격·습관)를 엔진으로 두고 그 결과를 A(외형 변화)와 E(진로)로 보여주는 구조**가 맞다. 몽망이의 외형을 부위별 파츠로 조합하면 그림 수가 곱으로 늘어나지 않고 더해지는 수준으로 줄어든다 [팀 추정]. C(LLM)는 B의 성격 수치를 입력으로 받는 말투 레이어로 나중에 붙일 수 있게 설계만 열어둔다.

---

## 3. 반증: 실패 사례와 이유

### 3.1 장르 실패 패턴
- **초반 이탈**: 모바일 게임 중앙값 D7이 4% 미만이다(GameAnalytics). 키우기 게임은 첫날 보상이 늦게 온다(알 → 부화까지 대기). 첫 세션 안에 "얘가 나를 알아본다"는 순간을 주지 못하면 대부분 이튿날 돌아오지 않는다 [팀 추정].
- **콘텐츠 고갈**: Tsuki's Odyssey는 "바를 연 뒤 목표가 없다"는 리뷰를 받았다. 가상 펫 커뮤니티가 꼽는 이탈 이유도 "콘텐츠 정체, 같은 이벤트 반복, 활동이 반복적"이다(VirtualPetList 포럼). PetVille(Zynga)은 페이스북 좋아요 750만에 DAU 6만 수준까지 떨어진 뒤 종료됐다.
- **과금 반발**: Talking Tom은 광고 과다로 CARU 지적, FTC 청원, Common Sense Media 혹평을 받았다. Neko Atsume 2는 "1편보다 과금이 무겁다"는 평을 들었다. Finch는 무료 체험이 바로 연간 결제로 넘어간 건으로 Trustpilot 불만이 쌓였다. 포켓캠프는 F2P 서비스를 접고 유료판으로 바꾸면서 일부 기능을 뺐다는 비판을 받았다.
- **알림 피로**: 게임 앱은 푸시 동의율이 가장 낮은 축이다(Pushwoosh). 주 6~10회 이상 보내면 삭제가 늘어난다는 인용도 있지만 출처가 2차 자료라 근거가 약하다. "몽망이가 배고파요!" 같은 죄책감형 알림은 다마고치식 긴장감을 주지만, 성인 유저에게는 피로로 받아들여지기 쉽다 [팀 추정].
- **사망·처벌 장치**: 다마고치식 사망은 긴장감을 주지만 모바일에서는 바로 삭제로 이어질 수 있다. Finch, Neko Atsume, Tsuki는 **처벌하지 않는 설계**(펫이 죽거나 떠나지 않음)로 평판을 지켰다.
- **서비스 종료 반발**: 가상 펫 종료는 감정적 반발이 특히 크다(Wharton 연구). 서버가 꼭 필요한 구조라면 종료 리스크가 그대로 평판 리스크가 된다.

### 3.2 1인+AI 팀의 함정
1. **콘텐츠 소모 속도 > 생산 속도**: 진화 분기 아트, 꾸미기 아이템, 이벤트는 유저가 우리가 만드는 것보다 빨리 소모한다. 시스템이 콘텐츠를 만들어내는 구조(조합, 성격 기반 행동)가 필요하다.
2. **AI 아트 일관성**: 생성 이미지를 쓰면 캐릭터 화풍이 이미지마다 흔들린다. 오리지널 IP의 신뢰도에 직결된다. 핵심 캐릭터는 사람이 정한 가이드와 파츠 시스템으로 고정하고, AI는 변형과 보조에만 쓴다.
3. **IP 유사성**: "말랑한 동그란 생물"은 이미 많다(다마고치, 커비류, 각종 슬라임). 실루엣·이름·색이 기존 캐릭터와 닮아 보이면 스토어 리젝이나 분쟁 위험이 있다. 콘셉트 단계에서 유사 캐릭터 대조 검사를 한다.
4. **LLM 운영비와 정책**: 유저 수에 비례하는 추론비가 무료 게임의 매출 구조와 맞지 않을 수 있다. 아동이 볼 수 있는 앱이면 Families 정책, AI 생성 콘텐츠 정책, COPPA를 함께 지켜야 한다.
5. **"오래 걸려도 최고 완성도"의 함정**: 출시를 미루면 실제 유저 리텐션 데이터 없이 감으로 만들게 된다. 소프트런칭(일부 국가, 테스트 트랙)으로 D1/D7을 먼저 재는 것이 완성도를 높이는 길이다.
6. **실시간·서버 의존**: 실시간 시간 흐름은 기기 시계를 조작하는 꼼수에 취약하다. 반대로 서버 시간에만 의존하면 오프라인일 때 플레이가 깨진다. 오프라인 우선으로 만들고 서버 검증은 보상에만 건다.

---

## 4. 제안

### 4.1 몽망이 컨셉 후보 3개

| 후보 | 생물 정체성 | 톤 | 타깃 | 차별점 한 줄 |
|---|---|---|---|---|
| **① 꿈 반죽 몽망이** | 잠든 사람의 꿈 부스러기가 뭉쳐 생긴 말랑한 반죽 생물. 하루 동안 본 것, 먹은 것, 들은 말에 따라 모양·색·무늬가 바뀐다 | 몽글몽글한 수면·코지 톤, 파스텔, 밤하늘 | 18~34세 코지 게임 유저(Finch, Neko Atsume, Tsuki 유저층) | "같은 알에서 시작해도 내 하루가 반죽돼서 세상에 하나뿐인 몽망이가 된다" |
| ② 망아지 몽망이 | 몽(夢)과 망아지를 합친, 작은 뿔이 난 상상 속 들짐승. 자라면서 진로(농부·음악가·탐험가 등)를 고른다 | 동화책 일러스트, 따뜻한 모험 | 10대 후반~20대, BitLife·포켓캠프 유저 | "펫 키우기와 인생 시뮬을 합쳐, 몽망이의 일생을 내가 함께 쓴다" |
| ③ 습관 정령 몽망이 | 유저의 현실 루틴(물, 수면, 산책)을 먹고 자라는 정령 | 차분한 웰니스, 미니멀 | 20~30대 자기관리 관심층(Finch 유저층) | "Finch의 습관 루프에 진화 분기와 수집을 더한 게임형 자기돌봄" |

**추천: ① 꿈 반죽 몽망이.**
- '몽망'이라는 이름의 어감(몽글몽글, 몽(夢))과 바로 이어진다.
- "반죽"이라는 설정 덕분에 외형 자유도(파츠, 색, 무늬, 질감 조합)를 세계관 안에서 자연스럽게 설명할 수 있다.
- ③은 Finch와 정면으로 겹치고, ②는 텍스트 비중이 커서 "키우는" 감각이 약해진다. ①은 ③의 현실 습관 연동과 ②의 진로를 나중에 옵션으로 흡수할 수 있다.

### 4.2 하루 단위 핵심 루프 초안 (①안 기준)

```
[아침 방문 1~3분]  밤사이 몽망이가 꾼 꿈 결과 확인(새 무늬나 소품, 짧은 꿈 일기)
       ↓
[돌봄·놀이 2~5분]  먹이 고르기(재료마다 성격 수치가 움직임) · 쓰다듬기 · 미니 놀이 1개
       ↓
[하루 선택 1개]    오늘 몽망이를 어디로 보낼지/무엇을 시킬지 정함(산책·공방·도서관…)
                    → 실시간으로 몇 시간 동안 다녀옴(Neko Atsume식 "앱을 끄고 기다리는 재미")
       ↓
[저녁 방문 1~3분]  다녀온 결과(이야기·재료·친구) 확인 → 방 꾸미기 → 재우기
       ↓
[밤]               오늘 쌓인 성격 수치가 "꿈 반죽"으로 처리됨 → 다음 날 아침 변화
```

- 장기 목표: 성장 단계(알 → 아기 → 어린이 → 청년 → 어른, 약 2~4주 [팀 추정]) 동안 성격 프로필에 따라 외형과 칭호가 갈린다. 다 자란 몽망이는 "꿈 도감"에 남기고 다음 알을 받아 다시 키운다(BitLife식 회차, 도감 수집).
- 처벌하지 않음: 며칠 방치해도 죽지 않는다. 대신 "외로움"이 성격 수치에 반영되어 다른 결과가 된다. 방치도 하나의 키우는 방식으로 인정한다.
- 알림: 기본은 하루 최대 1~2회, 유저가 시간대를 정한다. 문구는 정보 전달형("몽망이가 산책에서 돌아왔어요")으로 쓰고 죄책감형은 쓰지 않는다.

### 4.3 자유도 핵심 시스템 추천: **성격·습관 시뮬레이션("반죽 성향" 시스템)**

- 구조: 숨은 성향 축 5~6개(예: 호기심/느긋함, 사교/독립, 장난/차분, 대담/섬세 …). 먹이, 놀이, 하루 선택, 방치 같은 모든 상호작용이 성향 축을 조금씩 움직인다. 축 조합이 ① 외형 파츠 확률, ② 대기 애니메이션과 말버릇, ③ 진화 결과와 칭호, ④ 하루 선택에서 일어나는 사건을 결정한다.
- 이유:
  1. "내가 키운 방식 그대로"라는 소유감이 자유도 체감의 핵심이다. 분기 트리만 있으면 공략표가 생기지만, 연속 수치 조합은 정답표를 만들기 어렵다.
  2. 콘텐츠를 규칙이 만든다. 아트를 파츠 단위로 만들면 조합 수가 늘어나서, 적은 인력으로도 다양성을 낼 수 있다.
  3. 나중에 LLM 대화를 붙일 때 성향 수치가 그대로 성격 프롬프트가 되므로 확장 경로가 깔끔하다.
  4. 공유하기 좋은 결과물(세상에 하나뿐인 몽망이 카드)이 생겨 자연 유입 장치가 된다.
- 위험과 대응: 차이가 안 보이면 실패다. 성향 변화가 생기면 그날 바로 눈에 보이게 한다(무늬 하나, 말버릇 하나). 플레이테스트로 "두 사람의 몽망이가 다르다고 느끼는가"를 측정한다.

### 4.4 MVP 범위 vs 출시 1.0 범위

| 항목 | MVP (소프트런칭·내부 테스트, 리텐션 검증용) | 출시 1.0 |
|---|---|---|
| 성장 | 알 → 아기 → 어린이 3단계, 약 7일 | 5단계, 약 2~4주 + 회차(다음 알) + 꿈 도감 |
| 성향 시스템 | 축 4개, 결과 외형 8~12종 | 축 5~6개, 파츠 조합으로 외형 수십~수백 종 [팀 추정] |
| 하루 선택 | 장소 3곳, 사건 30개 | 장소 8곳 이상, 사건 200개 이상, 계절·요일 사건 |
| 꾸미기 | 방 1개, 소품 20개 | 방 확장, 소품 150개 이상, 몽망이 의상 |
| 소셜 | 없음(공유 카드 이미지만) | 친구 몽망이 방문(비동기), 공유 카드 |
| 알림 | 로컬 알림 1종 | 유저 설정형 알림, 위젯(iOS/Android) |
| 수익 | 없음 또는 보상 광고 1곳(측정용) | 4.5 모델 전체 |
| 서버 | 오프라인 우선, 백업 정도 | 계정 연동, 클라우드 세이브, 이벤트 배포 |
| LLM 대화 | 없음 | 없음(1.x에서 옵션으로 실험) |
| 언어 | 영어·한국어 | 영어·한국어(+ 일본어 검토) |
| 합격 기준 | D1 ≥ 30%, D7 ≥ 10% 목표 [팀 추정: 업계 상위 25% 수준을 기준으로 삼음] | 별도 KPI 문서 |

### 4.5 수익 모델 추천

**무료 + 꾸미기 IAP + 선택형 보상 광고 + 일회성 후원자 팩. 구독은 1.x 이후 검토.**

- **꾸미기 IAP**: 소품과 의상 묶음, 꿈 테마 팩. 성향이나 진화에 영향을 주는 아이템은 팔지 않는다(돌봄을 돈으로 사는 구조 금지).
- **선택형 보상 광고**: "산책 시간을 줄이기", "꿈 재료 하나 더 받기"처럼 유저가 고를 때만 보여준다. 전면광고와 배너는 쓰지 않는다. Talking Tom의 CARU 지적과 Common Sense 혹평이 반면교사다. Tsuki's Odyssey는 "광고가 선택형이라 공정하다"는 평을 받았다.
- **일회성 후원자 팩($4.99~$9.99 [팀 추정])**: 광고 제거, 전용 몽망이 무늬, 방 하나. 포켓캠프가 유료판으로 바꾼 사례와 Neko Atsume의 소액 과금 사례로 볼 때, 이 장르 유저는 강요 없는 일회성 결제에 우호적이다 [팀 추정].
- **구독**: Finch는 구독으로 월 약 $1M 규모를 낸다 [추정]. 다만 결제 혼선으로 생긴 불만이 평판 비용이 됐다. 콘텐츠 공급이 안정된 뒤(1.x)에 시즌 패스형 구독을 검토한다.
- **한국/글로벌 차이**: 한국 상위 매출은 방치형 RPG의 확률형 과금 구조다. 우리 장르에 그대로 가져오면 핵심 유저층(코지 유저)이 떠난다 [팀 추정]. 확률형 아이템(가챠)은 쓰지 않거나, 쓰더라도 꾸미기 전용·확률 공개·천장을 둔다. 한국은 확률형 아이템 확률 공개가 법적 의무라는 점도 고려한다(별도 법무 확인 필요).
- **아동 정책**: 타깃을 "전체 이용가지만 주 타깃은 13세 이상"으로 둘지, Families 프로그램에 들어갈지 먼저 정해야 한다. Families에 들어가면 개인화 광고가 금지되고 인증된 광고 SDK만 쓸 수 있다.

### 4.6 출시 언어

**영어 + 한국어 동시 출시를 추천한다. 일본어는 1.x에서 검토한다.**
- Finch 다운로드의 약 62%가 미국, 10%가 캐나다다 [추정, FoxData]. Sensor Tower 펫 카테고리 매출 스냅샷도 미국 중심이다. 코지 펫 장르의 매출은 북미가 크다.
- 한국어는 팀의 모국어라 문구 품질과 QA 비용이 가장 낮고, 국내 커뮤니티에서 초기 피드백을 받기 좋다. 다만 한국 시장은 방치형 RPG가 상위권이라 매출 기대치는 보수적으로 잡는다.
- 일본어는 다마고치 출하량의 약 절반이 일본이고 Neko Atsume도 일본발이라 장르 친화도가 높다. 현지화 품질을 확보할 수 있을 때 추가한다.
- 텍스트(꿈 일기, 사건)가 많은 설계라 처음부터 문자열 외부화와 성별·조사 처리(한국어 은/는, 이/가)를 설계에 넣는다.

---

## 5. 다음 결정이 필요한 것 (오너/팀)
1. 컨셉 ①(꿈 반죽)으로 확정할지
2. 주 타깃 연령(13세 이상 vs Families 프로그램): 광고, LLM, 데이터 정책 전체에 영향
3. 엔진과 기술 스택(별도 기술 조사 문서에서)
4. 아트 파이프라인: 파츠 기반 2D로 갈지, AI를 어디까지 쓸지
5. 소프트런칭 국가와 시점

---

## 출처

**다마고치**
- Bandai Namco IR (1억 대): https://www.bandainamco.co.jp/en/ir/library/newsletter82_special.html
- Japan Times (1억 대): https://www.japantimes.co.jp/business/2025/09/02/companies/tamagotchi-100-million
- Essential Japan: https://essential-japan.com/news/bandais-tamagotchi-has-officially-shipped-over-100-million-units-worldwide/
- Malay Mail (AFP, 30주년): https://malaymail.com/news/life/2026/01/07/still-hungry-after-30-years-tamagotchi-proves-retro-pets-never-go-out-of-style/204577
- Siliconera (Uni 리뷰): https://www.siliconera.com/tamagotchi-uni-is-surprisingly-good-at-being-a-wearable-virtual-pet/
- T3 (Uni 리뷰): https://www.t3.com/us/news/i-tried-the-tamagotchi-uni-and-it-makes-my-pet-free-existence-less-sad
- ChannelNews (업데이트 오류): https://www.channelnews.com.au/tamagotchis-new-shop-opens-as-update-malfunctions/
- Mozilla Privacy Not Included: https://www.mozillafoundation.org/en/privacynotincluded/tamagotchi-uni/
- GamesHub (Adventure Kingdom 리뷰): https://www.gameshub.com/news/reviews/tamagotchi-adventure-kingdom-review-apple-arcade-ios-2635408/
- Apple Newsroom: https://apple.com/newsroom/2024/01/tamagotchi-adventure-kingdom-and-cornsweeper-launch-on-apple-arcade

**Pou / Talking Tom**
- Exodus Privacy (Pou): https://reports.exodus-privacy.eu.org/en/reports/1736
- AppBrain (Zakeh): https://www.appbrain.com/dev/Zakeh/
- AppGoblin (Pou iOS): https://appgoblin.info/apps/575154654
- mobilegamer.biz (Outfit7): https://mobilegamer.biz/outfit7s-talking-tom-series-has-quietly-become-a-colossal-media-empire/
- Senal News (MTT Friends 2): https://senalnews.com/en/content/my-talking-tom-friends-2-surpassed-6-million-downloads-
- AppGoblin (MTT Friends 2): https://appgoblin.info/apps/com.outfit7.mytalkingtomfriends2
- BBB/CARU (My Talking Tom): https://bbbprograms.org/media/newsroom/decisions/caru-s-not-kitten-around-during-review-of-outfit7-s-my-talking-tom-app-recommends-modifications-comp
- Common Sense Media (MTT2): https://www.commonsensemedia.org/app-reviews/my-talking-tom-2

**Neko Atsume / Cats & Soup / Tsuki**
- Wikipedia: https://en.wikipedia.org/wiki/Neko_Atsume
- Anime News Network (2편 발표, 1,900만): https://admin.animenewsnetwork.com/news/2024-03-05/hit-point-reveals-neko-atsume-2-sequel-game-for-summer-release/.208322
- App Store (Neko Atsume 2): https://apps.apple.com/us/app/neko-atsume-2/id6499131935
- GameBrain (Neko Atsume 2): https://gamebrain.co/game/neko-atsume-2-kitty-collector
- Sensor Tower (2025 Q4 미국 고양이 게임 매출): https://sensortower.com/blog/2025-q4-unified-top-5-cat-games-revenue-us-608810b928293296047965a0
- indiegame.com (Cats & Soup): https://indiegame.com/en/archives/5610
- GameBrain (Tsuki's Odyssey): https://gamebrain.co/game/tsukis-odyssey
- GameGrin (Tsuki's Odyssey 리뷰): https://www.gamegrin.com/reviews/tsukis-odyssey-review/
- AppGoblin (Tsuki's Odyssey): https://appgoblin.info/apps/com.hyperbeard.odyssey

**Finch**
- FoxData: https://foxdata.com/en/blogs/finch-as-app-store-editors-choice-a-self-care-companion/
- Adapty: https://adapty.io/paywall-library/finch/
- AppGoblin: https://appgoblin.info/apps/1528595748
- Unstar (리뷰 비교): https://unstar.app/vi/blog/day-one-journey-reflectly-stoic-finch-journaling-apps-ranked-2026
- Trustpilot: https://se.trustpilot.com/review/finchcare.com
- Headway 리뷰: https://makeheadway.com/blog/finch-app-review/

**Slime Rancher / Ooblets / BitLife / 포켓캠프**
- NoobFeed (Slime Rancher 500만): https://www.noobfeed.com/news/slime-rancher-reaches-5-million-copies-sold
- PC Gamer (Slime Rancher 2): https://www.pcgamer.com/slime-rancher-2-sales-smash-devs-pipe-dream-in-6-hours
- VGC (Ooblets): https://www.videogameschronicle.com/news/ooblets-studio-devastated-by-hateful-reaction-to-epic-games-exclusivity-deal
- Sensor Tower (2025 Q2 미국 시뮬레이터 매출): https://sensortower.com/blog/2025-q2-unified-top-5-simulator%20games-revenue-us-60416e41241bc16eb8905c2f
- AppGoblin (BitLife): https://appgoblin.info/apps/com.candywriter.bitlife
- marlvel.ai (BitLife, AI 요약이라 근거 약함): https://marlvel.ai/intel-report/games/bitlife-life-simulator
- Nintendo Life (포켓캠프 종료): https://www.nintendolife.com/news/2024/11/its-over-animal-crossing-pocket-camps-online-service-has-officially-ended
- TechCrunch (Complete): https://techcrunch.com/2024/10/28/nintendo-to-launch-10-animal-crossing-mobile-game-on-december-3
- GamesRadar (유료판 기능 축소): https://gamesradar.com/games/animal-crossing/im-still-not-over-new-horizons-and-now-nintendo-is-ending-support-for-another-animal-crossing-game-in-favor-of-a-new-paid-version-with-fewer-features

**시장 / 리텐션 / 알림 / 정책 / AI 펫**
- Sensor Tower (2025 하반기 한국): https://sensortower.com/ko/blog/2H2025-mobile-games-recap-in-Korea
- Sensor Tower (갓깨비 키우기): https://sensortower.com/ko/blog/God-Goblin-Raising-ranks-No-1-in-idle-RPG-revenue
- Sensor Tower (2025 Q4 미국 가상 펫 매출): https://sensortower.com/blog/2025-q4-unified-top-5-virtual-pet-revenue-us-62f83d1bf5dff39390bc09c4
- 지디넷코리아 (방치형 올드 IP): https://zdnet.co.kr/view/?no=20260803105811
- InvestGame/GameAnalytics 2026 벤치마크: https://investgame.net/wp-content/uploads/2026/01/2026-01-27-2026-mobile-pc-benchmarks_compressed.pdf
- GameAnalytics 벤치마크 요약: https://gameindustrylibrary.com/documents/gameanalytics-mobile-and-pc-game-benchmarks-in-2026-sponsored-by-pwn-games
- PocketGamer.biz (푸시 동의와 리텐션): https://www.pocketgamer.biz/chart-of-the-week-why-getting-players-to-opt-in-to-game-push-notifications-matters/
- Pushwoosh 벤치마크: https://www.pushwoosh.com/blog/push-notification-benchmarks/
- VirtualPetList (이탈 이유): https://www.virtualpetlist.com/threads/reasons-why-users-leave-quit-a-pet-game.329/
- PC Gamer (Zynga 종료, PetVille): https://www.pcgamer.com/zynga-shut-down-11-games-close-japanese-studio
- Wharton (가상 펫 종료 반발): https://knowledge.wharton.upenn.edu/article/farewell-to-fido-a-lesson-in-digital-customer-relationship-management/
- Google Play AI 생성 콘텐츠 정책: https://support.google.com/googleplay/android-developer/answer/14094294
- Google Play Families: https://play.google.com/intl/en-GB_ALL/console/about/programs/families
- TechCrunch (Pengu/Born): https://techcrunch.com/2025/09/10/born-maker-of-virtual-pet-pengu-raises-15m-to-launch-a-new-wave-of-social-ai-companions
- ProPakistani (Meta AI 펫, 2026-10): https://propakistani.pk/2026/10/28/meta-launches-new-ai-app-that-lets-you-raise-a-virtual-pet/
- ACL 2025 iPET: https://aclanthology.org/2025.acl-demo.40
