# 03. 스토어 출시·정책 조사 (몽망이 키우기)

- 작성: 출시·정책 담당 / 조사일: 2026-11-19
- 대상: 한국 거주 개인 개발자, 기존 개인사업자 '행복가게'(부업종 722001·722002 추가 정정 신고 중), 2D 캐릭터 키우기 게임, iOS App Store + Google Play, 전 연령 대상 가능성 높음
- 원칙: 공식 문서(Apple Developer, Google Play Console 고객센터, 법령·정부 발표) 우선. 공식 문서로 확인하지 못한 항목은 **[확인 필요]** 로 표시했다.
- 현재 상태: **Apple·Google 개발자 계정 없음 [확인 필요: 오너가 기존에 만든 계정이 정말 없는지 확인]**

---

## 0. 핵심 결론 (먼저 읽을 것)

1. **Google Play 개인 계정은 출시까지 최소 약 3주가 고정으로 걸린다.** 신규 개인 계정은 비공개 테스트에 **테스터 12명 이상이 14일 연속** 참여해야 프로덕션 신청을 할 수 있고, 신청 심사는 보통 7일 이내다. 그래서 **계정은 지금 만들고, 첫 빌드가 나오는 대로 비공개 테스트를 시작해야 한다.**
2. **Apple은 개인사업자도 '개인(Individual)'으로 가입해야 한다.** 판매자 이름은 **오너 실명**으로 표시되고 '행복가게'로는 표시할 수 없다. 법인이 아니면 D-U-N-S가 필요 없다. 비용은 연 99 USD다.
3. **Google은 개인 계정을 권장한다.** 조직 계정을 쓰면 테스트 의무가 없지만 D-U-N-S(최대 30일)가 필요하고, 개인사업자가 조직 계정을 썼다가 지급이 보류된 사례가 있다. 다만 **개인 계정으로 유료 판매나 인앱 결제를 하면 Google Play에 전체 주소가 공개된다**(사업장 주소를 쓸 수 있는지 확인 필요).
4. **등급분류**: 구글·애플은 자체등급분류사업자라서 스토어 설문(IARC, Apple 연령 등급)으로 국내 등급이 매겨진다. 별도 심의 비용은 없다. 다만 게임산업법상 영리 목적 게임 제작자는 **관할 시·군·구에 '게임제작업' 등록 의무**가 있다. 구청에 확인하고 미리 등록해 두는 것이 안전하다.
5. **확률형 아이템(가챠)**: 2024-03-22부터 확률 표시가 의무이고, 2025-08-01부터 고의로 위반하면 최대 3배 징벌적 손해배상이다. 3년 연평균 매출 1억 원 이하 중소기업은 표시 의무에서 제외되지만, **Apple 심사지침 3.1.1은 규모와 상관없이 구매 전 확률 공개를 요구**한다. 그래서 가챠를 넣으면 처음부터 확률표를 공개하도록 설계한다.
6. **개인정보처리방침 URL은 양 스토어 모두 필수**다(데이터를 수집하지 않아도 필요하다). 광고 SDK를 넣으면 iOS ATT 동의 창, Apple 개인정보 라벨, Google 데이터 보안 섹션에 SDK가 수집하는 항목까지 반영해야 한다.
7. **아동 대상 카테고리(Apple Kids, Google Families 아동 타깃)는 들어가지 않는 쪽을 권장**한다. 들어가면 맞춤형 광고와 서드파티 분석을 거의 쓸 수 없고 외부 링크와 결제에 보호자 확인(parental gate)이 필요하다. 콘텐츠 등급은 전체이용가로 두고, 타깃 연령은 13세 이상으로 선언한다. 단, 캐릭터가 귀여운 게임은 '아동에게 어필'한다고 판단될 위험이 있다.
8. **수수료**: Apple 소규모 사업자 프로그램 15%(신청해야 적용), Google은 연 첫 100만 USD까지 15%(자동). 한국 외부결제는 Apple 26%, Google 기본 수수료에서 4%p 인하 수준이라 실익이 작다. **표준 인앱 결제를 권장**한다.

---

## 1. Apple Developer Program

| 항목 | 내용 | 출처 |
|---|---|---|
| 가입 유형 | 개인(Individual) / 조직(Organization) | [Apple – Enrollment](https://developer.apple.com/programs/enroll/) |
| 개인사업자 | **개인으로 가입해야 함.** "If you are a sole proprietor/single-person business, you must join as an individual and your legal name will appear as the seller." | [Apple – Enrollment support](https://developer.apple.com/support/enrollment/) |
| 조직 요건 | 계약 주체가 될 수 있는 법인. **DBA·상호(trade name)·지점은 불가.** D-U-N-S, 조직 도메인 이메일, 실제로 운영 중인 웹사이트 필요 | [Apple – Enrollment](https://developer.apple.com/programs/enroll/) |
| D-U-N-S | 개인 가입이면 필요 없음. 조직은 무료로 발급되며 D&B 발급에 최대 5영업일, Apple 반영에 최대 2영업일 | [Apple – D-U-N-S](https://developer.apple.com/help/account/membership/D-U-N-S/) |
| 비용 | **연 99 USD**. 가입 시 현지 통화로 표시 (원화 금액은 [확인 필요: 가입 화면에서 확인]) | [Apple – Enrollment](https://developer.apple.com/programs/enroll/) |
| 판매자 이름 | 개인: **실명**("Your name will be displayed as the seller name"). 조직: 법인명 | 위와 동일 |
| 준비물 | 2단계 인증을 켠 Apple 계정, 실명(별명·회사명 금지), 이메일·전화·주소(사서함 불가). 카드 결제 시 **본인 명의 카드**(아니면 신분증 제출 요구로 지연) | [Apple – Enrollment support](https://developer.apple.com/support/enrollment/) |
| 소요 기간 | 공식 문서에 처리 기간은 명시되어 있지 않음. 결제 후 24시간 안에 확인 메일이 오지 않으면 문의하라고 안내. 개인은 보통 1~2일 정도로 짧은 편 [확인 필요: 실제 소요] | 위와 동일 |
| 가입 경로 | 웹 또는 Apple Developer 앱. 앱으로 가입하면 연 자동갱신 구독 | 위와 동일 |

**판단**: 개인으로 가입한다. 판매자 표시가 실명이라는 점은 오너가 받아들여야 한다. '행복가게' 이름으로 표시하려면 법인을 세우고 조직으로 가입하는 방법밖에 없다.

### 2026년 기준 기술 요건 (빌드에 영향)
- **2026-04-28부터** 업로드하는 빌드는 Xcode 26 이상 / iOS 26 SDK로 빌드해야 한다.
- **2026-09-09부터** 최소 배포 타깃이 iOS 13 이상이어야 한다.
- **2026-01-31부터** 새 연령 등급 체계(4+/9+/13+/16+/18+)가 적용됐고, 개정된 연령 등급 설문에 답해야 업데이트를 제출할 수 있다.
- 출처: [Apple – Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)

---

## 2. Google Play Console

| 항목 | 내용 | 출처 |
|---|---|---|
| 비용 | **1회 25 USD** (선불카드 불가, 정보가 무효로 판정되면 환불 안 됨). 만 18세 이상 | [Play – 가입](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en) |
| 개인 vs 조직 | 기능은 같다. 조직은 "organization or business"용이고 금융·건강·VPN·정부 앱은 조직 계정이 필수 | [Play – 계정 유형 선택](https://support.google.com/googleplay/android-developer/answer/13634885?hl=en) |
| D-U-N-S | 조직 계정만 필수 ("You can't create an organization developer account without a valid D-U-N-S number"). 무료 발급에 **최대 30일** | [Play – 계정 요건](https://support.google.com/googleplay/android-developer/answer/13628312?hl=en), [Android Developers Blog](https://android-developers.googleblog.com/2023/07/boosting-trust-and-transparency-in-google-play.html) |
| 신원 확인 | 결제 프로필의 법적 이름·주소를 인증하고 연락처 이메일·전화는 OTP로 인증. 정부 발급 신분증이 필요할 수 있음. 개인 계정은 **Play Console 모바일 앱으로 Android 기기 접근 인증**도 해야 함 | 위 두 문서 |
| 공개 정보 (개인) | 법적 이름, 국가, 개발자 이메일. **수익화(유료 앱/인앱 결제)를 하면 전체 주소 공개.** 전화번호는 trader 상태일 때만 공개 | [Play – 계정 요건](https://support.google.com/googleplay/android-developer/answer/13628312?hl=en) |
| 공개 정보 (조직) | 법적 이름, D-U-N-S, 법적 주소, 개발자 이메일·전화 | 위와 동일 |

### 신규 개인 계정의 테스트 의무 (2026-11 기준으로 다시 확인함)
- 대상: **2023-11-13 이후에 만든 개인 계정**
- 요건: 비공개 테스트에 **테스터 12명 이상이 14일 이상 연속** 옵트인 상태를 유지해야 한다. 중간에 나갔다 다시 들어오면 카운트가 처음부터 다시 시작된다.
- 충족 후: 대시보드에서 '프로덕션 액세스 신청'을 하고 비공개 테스트, 앱, 출시 준비에 관한 설문 3섹션을 작성한다. **심사는 보통 7일 이내**지만 더 걸릴 수 있고, 거절되면 테스트를 더 진행해야 한다.
- 출처: [Play – 신규 개인 계정 테스트 요건](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- 함의: 계정 생성부터 프로덕션 공개까지 **최소 약 3주(14일 + 심사 최대 7일)** 가 고정으로 든다. 테스터 12명은 구글 계정 이메일로 모아야 하고, 14일 동안 실제로 써 본 흔적(피드백)이 있어야 신청 설문이 수월하다.

### 개인 vs 조직 판단
- 조직 계정의 장점은 테스트 의무가 없다는 점(위 요건은 개인 계정에만 적용)과 판매자명을 사업자명으로 표시할 수 있다는 점이다.
- 조직 계정의 단점: D-U-N-S(최대 30일)와 영문 사업자등록증명 등으로 정보를 정확히 맞춰야 한다. 또 **1인 개인사업자가 조직 계정을 썼다가 결제 프로필 유형이 맞지 않아 지급이 보류되고, 개인 계정을 새로 만들어 앱을 이전하라는 안내를 받은 사례**가 있다([인프런 Q&A](https://www.inflearn.com/community/questions/1780821/), 개별 사례라 공식 정책은 아님).
- **권장**: 개인 계정을 쓴다. 테스트 기간은 일정에 미리 넣는다. 주소 공개가 부담되면 결제 프로필 주소를 사업장 주소로 쓸 수 있는지 확인한다 **[확인 필요]**.

### 2026년 기준 기술 요건
- **2026-08-31부터** 신규 앱과 업데이트는 **Android 16 (API 36)** 을 타깃으로 해야 한다.
- 출처: [Play – 타깃 API 수준 요건](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)

---

## 3. 한국 게임 등급분류·게임산업법

### 3-1. 자체등급분류 (스토어 설문으로 등급이 정해지는 구조)
- 오픈마켓 모바일 게임은 **자체등급분류사업자**(스토어)가 전체이용가~15세이용가 등급을 매긴다. 청소년이용불가는 제외된다.
- 지정 사업자 목록(2021-01 보도 기준): 구글, 애플, 삼성전자, SIE코리아, 카카오게임즈, 원스토어, 오큘러스, 한국MS, 에픽게임즈코리아 ([지디넷코리아 2021-01-04](https://zdnet.co.kr/view/?no=20210104110646)).
  - **[확인 필요]** 지정 기간은 5년 단위다. 2026년 현재 구글·애플의 재지정 현황은 게임물관리위원회 공식 목록에서 확인하지 못했다(GRAC 사이트 접근이 차단됨). 출시 전에 [게임물관리위원회](https://www.grac.or.kr)에서 확인한다.
- 실무: Google Play는 IARC 콘텐츠 등급 설문으로 국내 등급이 나온다. App Store는 연령 등급 설문을 작성하고, GRAC 등급이 Apple 등급과 다르면 App Review가 연락하며 App Information의 Republic of Korea 옆에 등급분류번호(RCN)를 입력한다([Apple – 연령 등급 설정](https://developer.apple.com/kr/help/app-store-connect/manage-app-information/set-an-app-age-rating/)).
- **2026-11-02부터** 모바일 게임 등급분류(청불 포함)와 내용수정신고가 민간 기관인 **게임콘텐츠등급분류위원회(GCRB)** 로 이관됐다. 사후관리와 직권 재분류는 여전히 게임위가 맡는다. 전체~15세 자체등급분류 구조는 그대로다([바이라인네트워크 2026-10-29](https://byline.network/2026/10/29-577/), [비즈워치 2026-11-05](https://news.bizwatch.co.kr/article/mobile/2026/11/03/0019)).
- **우리 게임**: 2D 캐릭터 키우기에 폭력·선정성 요소가 없으면 전체이용가가 예상된다. 스토어 설문만 작성하면 되고 별도 심의 수수료는 없다. 단, **사행성 요소(현금화, 유료 랜덤 + 거래)를 넣으면 게임위의 직접 관리 대상**이 될 수 있으니 피한다.

### 3-2. 사업자 요건: 게임제작업 등록
- 게임산업법 제25조 제1항: "게임제작업 또는 게임배급업을 영위하고자 하는 자는 … 시장·군수·구청장에게 등록하여야 한다." 예외는 국가·공공기관·교육 목적, 그리고 특정인만을 위한 비영리 제작 등이다. 영리 목적의 1인 개발은 예외에 해당하지 않는다([국가법령정보센터 – 게임산업진흥에 관한 법률](https://www.law.go.kr/법령/게임산업진흥에관한법률), 조문 인용은 [위키문헌](https://ko.wikisource.org/wiki/게임산업진흥에_관한_법률) 및 [디스이즈게임](https://www.thisisgame.com/articles/420492)을 통해 확인).
- 미등록 영업은 벌칙 대상이고, 주소 변경 등록을 하지 않으면 과태료가 부과된다는 보도가 있다([디스이즈게임](https://www.thisisgame.com/articles/420492)).
- 앱스토어 출시 자체는 등록증 없이도 기술적으로 가능하다. 하지만 GRAC/GCRB에 직접 심의를 신청하거나 앱인토스 같은 플랫폼에 입점할 때는 **게임제작업(또는 배급업) 등록증을 요구**한다([토스 앱인토스 가이드](https://toss.im/apps-in-toss/blog/game_rating_classification)).
- 질문의 '게임제공업 신고'는 PC방이나 오락실처럼 장소를 두고 게임을 제공하는 영업(청소년게임제공업 등)에 해당하는 개념으로, 모바일 앱 출시와는 관련이 없다. 해당되는 것은 **게임제작업 등록**이다.
- **권장**: 사업자등록(행복가게) 업종 정정이 끝나면 관할 구청 문화체육 부서에 '게임제작업 등록'을 문의하고 등록한다. 수수료, 구비서류, 자가 주소지로 등록할 수 있는지는 **[확인 필요: 구청]**.

### 3-3. 확률형 아이템 표시 의무 (가챠를 넣을 경우)
- **2024-03-22 시행**: 확률형 아이템의 종류와 확률을 게임 내, 홈페이지, 광고·선전물에 표시해야 한다. 홈페이지에는 검색 가능하게 표시해야 한다([정책브리핑 2023-11-13](https://www.korea.kr/briefing/policyBriefingView.do?newsId=156599363)).
- **제외 대상**: **3년간 연평균 매출액 1억 원 이하 중소기업**이 제작·배급하는 게임물, 아케이드 게임, 등급분류 예외 게임물(법 제33조, 시행령 제19조의2). 출처는 같은 정책브리핑이다. 시행령 원문은 [국가법령정보센터](https://www.law.go.kr)에서 재확인해야 한다 **[확인 필요]**.
- **2025-08-01 시행**: 표시 의무를 고의로 위반하면 **손해액의 3배 이내 징벌적 손해배상**을 지고, 고의·과실이 없었다는 입증 책임은 사업자에게 있다(제33조의2)([CEO스코어데일리 2025-08-04](https://www.ceoscoredaily.com/page/view/2025080415181654698)).
- **Apple 심사지침 3.1.1**: "Apps offering 'loot boxes' … must disclose the odds of receiving each type of item to customers prior to purchase." 국내 매출 기준 예외와 상관없이 **iOS에서는 확률 공개가 필수**다([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)).
- **영향과 권장**:
  1. 출시 초기에는 매출 1억 원 이하라 국내법상 면제일 가능성이 높다. 그래도 Apple 때문에 **확률 공개 UI는 필수**다.
  2. 확률표를 게임 데이터(서버 또는 설정 파일)에서 생성하는 구조로 만들어 표기와 실제 확률이 어긋날 여지를 없앤다. 징벌적 배상은 '거짓 표시'가 핵심 리스크다.
  3. 유료 재화로 뽑는 가챠는 전체이용가 유지와 아동 정책 측면에서도 부담이다. **무료 재화 뽑기나 확정형 상품(직접 구매)** 을 먼저 고려한다.

---

## 4. 개인정보·광고·아동 정책

### 4-1. 개인정보처리방침
- **Apple**: "All apps must include a link to their privacy policy in the App Store Connect metadata field and within the app in an easily accessible manner."(5.1.1(i)) App Store Connect에서 Privacy Policy URL은 필수 항목이다([Guidelines](https://developer.apple.com/app-store/review/guidelines/), [App privacy details](https://developer.apple.com/app-store/app-privacy-details/)).
- **Google**: 데이터 보안 양식을 작성하려면 개인정보처리방침이 필수다. 아동 타깃이면 Families 정책에 따라 방침이 실제 처리 내용과 일치해야 한다([Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)).
- **국내법**: 개인정보보호법상 개인정보처리방침을 공개해야 한다(제30조). **만 14세 미만 아동의 개인정보를 처리하려면 법정대리인 동의**가 필요하다(제22조의2)([국가법령정보센터 – 개인정보 보호법](https://www.law.go.kr/법령/개인정보보호법)). 전 연령 게임에서 로그인이나 서버 저장을 하면 이 조항이 설계에 영향을 준다.
- **권장**: 처음에는 **로그인 없이 로컬 저장**으로 만들어 수집 항목을 최소화한다. 방침은 GitHub Pages나 Notion 같은 공개 URL에 한국어와 영어로 올리고, 앱 안 설정 화면에도 링크를 넣는다.

### 4-2. Apple App Privacy 라벨 / Google 데이터 보안
- Apple: 신규 앱과 업데이트를 제출하려면 작성해야 한다. **서드파티 SDK(분석, 광고)가 수집하는 데이터까지 포함**해야 한다([App privacy details](https://developer.apple.com/app-store/app-privacy-details/)).
- Google: **데이터를 수집하지 않는 앱도 작성 필수**다. 내부 테스트 트랙만 예외다. SDK가 수집하는 데이터도 반영해야 하고, 실제 동작과 다르면 업데이트가 차단되거나 앱이 삭제될 수 있다([Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)).

### 4-3. 광고 SDK와 ATT
- 다른 회사 데이터와 연결해 맞춤형 광고나 광고 측정을 하는 것('tracking')은 **App Tracking Transparency 동의**를 받아야 한다(5.1.2)([Guidelines](https://developer.apple.com/app-store/review/guidelines/), tracking 정의는 [App privacy details](https://developer.apple.com/app-store/app-privacy-details/)).
- AdMob 같은 광고 SDK를 넣으면 ATT 팝업, 개인정보 라벨의 'Tracking' 항목, 데이터 보안의 광고 ID 수집 항목을 함께 처리해야 한다. 동의를 거부한 사용자에게는 비맞춤 광고를 보여 준다.

### 4-4. 아동 대상 정책: 들어갈지 말지

| 구분 | Apple Kids Category | Google Families(타깃 연령에 아동 포함) |
|---|---|---|
| 핵심 제약 | 서드파티 분석·광고 원칙적 금지. 외부 링크·구매는 parental gate 뒤에서만 허용 (1.3) | Families 자가인증 광고 SDK만 사용, 맞춤형 광고·리마케팅 금지, 아동 전용 앱은 AAID 전송 금지, 위치 권한 금지, 혼합 연령이면 중립적 연령 확인 화면 필요 |
| 장점 | 키즈 카테고리 노출, 보호자 신뢰 | Teacher Approved 대상 가능, 아동·보호자 신뢰 |
| 단점 | 광고 수익모델이 사실상 불가능, 분석 도구 제한, 심사가 더 엄격 | 광고 수익 감소, SDK 선택 제한, 정책 위반 시 제재 리스크 |
| 출처 | [Guidelines 1.3](https://developer.apple.com/app-store/review/guidelines/) | [Families 정책](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en) |

- **권장: 아동 카테고리와 아동 타깃에 들어가지 않는다.**
  - 콘텐츠 등급은 '전체이용가'로 둔다(누구나 받을 수 있는 등급). 하지만 **타깃 연령(Google 타깃층 설정)은 13세 이상**으로 선언하고, 아동을 겨냥한 마케팅 문구는 쓰지 않는다.
  - 리스크: 캐릭터, 색감, 문구가 아동에게 어필한다고 판단되면 Google이 Families 요건을 요구할 수 있다 **[확인 필요: 타깃층 및 콘텐츠 설문 시 '아동에게 어필' 문항 답변 기준]**. 광고 SDK는 처음부터 Families 자가인증 SDK(예: AdMob)를 골라 두면 나중에 전환하기 쉽다.

---

## 5. 결제·수수료·정산

| 항목 | Apple | Google |
|---|---|---|
| 기본 | 30% | 30% |
| 소규모 | **App Store Small Business Program 15%**: 전년도 수익 100만 USD 이하 또는 신규 개발자. **직접 신청해야 함**(Paid Apps 계약 동의 후 등록). 연간 100만 USD를 넘으면 이후 판매분은 표준 요율 | **연 첫 100만 USD까지 15%**, 정기구독은 15% |
| 출처 | [Small Business Program](https://developer.apple.com/app-store/small-business-program/) | [Play 서비스 수수료](https://support.google.com/googleplay/android-developer/answer/112622?hl=en) |

- Google은 2026-06-30(EEA·영국·미국), 2026-09-30(호주·일본)부터 새 수수료 구조를 지역별로 도입하고 있다. 한국을 포함한 나머지 시장의 변경 일정은 아직 공지되지 않았다 **[출시 직전 재확인]** ([Play 서비스 수수료](https://support.google.com/googleplay/android-developer/answer/112622?hl=en)).

### 한국 외부결제
- **Apple (한국)**: StoreKit External Purchase Entitlement를 쓰면 **수수료 26%**다. 한국 스토어 전용 별도 바이너리여야 하고, 같은 앱에서 Apple 인앱 결제와 함께 쓸 수 없으며, PG는 KCP·이니시스·토스·NICE 중 1곳이다. 월별 보고와 대금 납부 의무도 있다. 소규모 사업자 감면에 대한 언급은 없다([Apple – 한국 외부결제](https://developer.apple.com/support/storekit-external-entitlement-kr/)).
- **Google (한국)**: 사용자 선택 결제 시 수수료가 기존 요율에서 4%p 인하된다(15%면 11%). 대체 결제 API 사용이 필수다([Play – 한국 대체 결제](https://support.google.com/googleplay/android-developer/answer/11222040)).
- **판단**: 15% 요율에서 외부결제로 얻는 차이는 PG 수수료를 빼면 거의 없거나 오히려 손해다. 별도 바이너리를 만들고 정산·보고·세금을 직접 처리하는 부담도 크다. **양 스토어 모두 표준 인앱 결제 + 15% 프로그램을 쓴다.**

### 정산 정보 (계정을 만든 뒤 설정)
- Apple: App Store Connect의 **유료 앱 계약(Paid Apps Agreement)**, 은행 계좌, 세금 양식을 등록해야 인앱 결제와 유료 앱을 판매할 수 있다. 소규모 사업자 프로그램 신청의 선행 조건이기도 하다([Small Business Program](https://developer.apple.com/app-store/small-business-program/)).
- Google: Play Console에 연결한 **결제 프로필(Payments profile)** 에 판매자 정보와 은행 계좌를 등록한다. 이때 이름과 주소가 신원 확인 및 공개 정보와 연결된다([Play – 계정 요건](https://support.google.com/googleplay/android-developer/answer/13628312?hl=en)).
- **[확인 필요: 세무사]** 개인사업자 '행복가게'로 스토어 수익을 신고하는 방법(부가세 과세·영세율 여부, 해외 플랫폼 정산 매출의 증빙)과 722001·722002 업종 정정 결과의 연관성.

---

## 6. 심사 거절 흔한 사유와 등록 자산 요건

### 6-1. 흔한 거절 사유 (Apple 공식)
- 미해결 이슈의 **40% 이상이 2.1 App Completeness**(크래시, 플레이스홀더, 정보 누락)다([Apple – App Review](https://developer.apple.com/distribute/app-review/)).
- 그 밖의 목록: 깨진 링크(지원 URL·개인정보 URL 필수), 플레이스홀더 콘텐츠, 심사 정보 누락, 부실한 개인정보처리방침, 권한 요청 사유 불명확, 실제와 다른 스크린샷, 웹 클리핑, 유사 앱 반복 제출, 모방, 지속 가치 부족(최소 기능).
- **게임·웹뷰 관련 지침**
  - 4.2 최소 기능: "elevate it beyond a repackaged website" → **웹뷰로 웹게임을 감싸기만 한 앱은 거절 위험이 높다.** 웹 기술(React Native WebView, Capacitor 등)을 쓰더라도 오프라인 동작, 네이티브 저장, 햅틱, 알림 같은 앱다운 요소를 넣는다.
  - 4.7: HTML5/JS 미니게임은 바이너리에 포함하지 않고 제공할 수 있지만, 그 콘텐츠도 모든 지침을 지켜야 한다.
  - 4.3 스팸: 흔한 '키우기' 템플릿 앱과 구분되지 않으면 거절된다. 고유한 캐릭터와 시스템이 필요하다.
  - 3.1.1: 디지털 재화는 인앱 결제로만 판매한다. 랜덤 상품은 확률을 공개해야 한다.
- 심사 속도: 보통 **50%는 24시간 이내, 90%는 48시간 이내**([Apple – App Review](https://developer.apple.com/distribute/app-review/)).
- 출처: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

### 6-2. App Store 등록 자산
| 자산 | 요건 | 출처 |
|---|---|---|
| 앱 아이콘 | 1024×1024 PNG (Xcode 에셋, 투명 불가) **[확인 필요: 최신 Icon Composer 요건]** | [Apple HIG – App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons) |
| iPhone 스크린샷 | **필수: iPhone with Dynamic Island (medium display)** 최소 1장. 1179×2556, 1206×2622(세로) 또는 가로. 대형(1320×2868, 1290×2796, 1260×2736)은 선택. 기기 크기별 최대 10장, jpg/png, 알파 채널 불가 | [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) |
| iPad 스크린샷 | iPad에서 실행되는 앱이면 필수: 13" 2064×2752 또는 2048×2732. **iPad를 지원하지 않으면 생략 가능** → 처음에는 iPhone 전용 출시도 고려 | 위와 동일 |
| 앱 미리보기 영상 | 선택. **15~30초**, 최대 500MB, .mov/.m4v/.mp4(H.264), iPhone 기준 해상도 886×1920(세로), 30fps 이하, 기기 크기·언어별 최대 3개. 처리에 최대 24시간 | [App preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications) |
| 참고 | 'iPhone Duo' 스크린샷은 **2027-04부터** iOS 27.1 SDK 이상 앱에 필수 예정 | [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) |

### 6-3. Google Play 등록 자산
| 자산 | 요건 |
|---|---|
| 앱 아이콘 | **512×512**, 32비트 PNG(알파 포함), 최대 1024KB |
| 그래픽 이미지(피처 그래픽) | **1024×500**, JPEG 또는 24비트 PNG(알파 없음) |
| 휴대전화 스크린샷 | **2~8장**, PNG/JPEG, 장당 8MB 이하, 변 길이 320~3840px |
| 게임 추천 노출 조건 | **16:9 가로 3장 이상(최소 1920×1080) 또는 9:16 세로 3장 이상(최소 1080×1920)** |
| 미리보기 영상 | 선택이지만 게임에는 강력히 권장. 일부 게임 노출 영역은 영상이 있어야 함. YouTube URL(공개 또는 일부공개, 광고 꺼짐, 연령 제한 없음, 퍼가기 허용). 처음 30초만 자동재생 |

- 출처: [Play – 미리보기 자산](https://support.google.com/googleplay/android-developer/answer/1078870?hl=en)

**공통 제작 팁**: 세로 9:16 원본을 1320×2868 크기로 만든다. Apple medium 사이즈(1206×2622)와 Google용(1080×1920 이상)은 이 원본에서 리사이즈해 한 번에 만든다. 영상은 25초 안팎으로 1개 만들고, Apple 규격과 YouTube 업로드를 함께 처리한다.

---

## 7. 출시 전 체크리스트와 타임라인

### 7-1. 개발 초기에 미리 시작할 일 (리드타임이 긴 순서)
| 순서 | 할 일 | 이유와 소요 |
|---|---|---|
| 1 | **Google Play 개인 계정 생성 + 신원·기기 인증** | 인증 지연 가능성이 있고, 이후 테스트 14일과 심사 7일이 고정으로 필요 |
| 2 | **테스터 12명 이상 모집**(지인, 커뮤니티, 팀). 구글 계정 이메일 목록 확보 | 14일 연속 유지 조건 때문에 이탈을 고려해 15~20명 확보 권장 |
| 3 | **Apple Developer 개인 가입** | 보통 빠르지만 실명·카드 불일치 시 지연. TestFlight 내부 테스트에도 필요 |
| 4 | 사업자 업종 정정 완료 → **관할 구청 게임제작업 등록 문의·등록** | 구청 처리 기간 [확인 필요] |
| 5 | **수익 모델 결정**(광고 / 인앱 / 가챠 여부), 아동 타깃 여부 결정 | SDK 선택, 개인정보 라벨, ATT, 확률 공개 UI 설계가 모두 여기에 달려 있음 |
| 6 | 개인정보처리방침·지원 페이지 URL 준비(한국어·영어) | 심사 필수, 깨진 링크는 거절 사유 |
| 7 | 빌드 환경을 Xcode 26 / iOS 26 SDK, Android targetSdk 36으로 맞춤 | 2026 업로드 요건 |

### 7-2. 권장 타임라인 (개발 착수 = W0)
| 주차 | 개발 | 출시·정책 |
|---|---|---|
| W0 | 프로토타입 | Google·Apple 계정 생성, 테스터 모집 시작, 수익 모델·아동 타깃 결정 |
| W1~W2 | 핵심 루프 | 개인정보처리방침 초안, 게임제작업 등록 문의, 광고/IAP SDK 확정 |
| W3 | **첫 플레이 가능 빌드** | **Google 비공개 테스트 시작(14일 카운트 시작)**, iOS TestFlight 배포 |
| W3~W5 | 피드백 반영 | 테스터 유지 관리, 스토어 문구·스크린샷·영상 제작, IARC·Apple 연령 설문, 데이터 보안·개인정보 라벨 작성, Paid Apps 계약·Small Business Program 신청·결제 프로필 |
| W5 | 출시 후보 | **Google 프로덕션 액세스 신청**(심사 최대 약 7일), App Store 심사 제출(보통 24~48시간) |
| W6 | — | 양 스토어 동시 공개 |

- 핵심: Google 비공개 테스트를 **첫 빌드가 나오는 날 시작**해야 출시가 늦어지지 않는다. 빌드가 미완성이어도 테스트 트랙에는 올릴 수 있고 이후 업데이트해도 카운트는 유지된다(옵트인 상태 기준).

### 7-3. 제출 직전 체크리스트
- [ ] 크래시 없음, 최신 OS 실기기 테스트 (Apple 2.1)
- [ ] 플레이스홀더 텍스트·이미지 없음
- [ ] 개인정보처리방침 URL·지원 URL 동작 확인, 앱 안에 방침 링크
- [ ] Apple App Privacy 라벨 / Google 데이터 보안을 SDK 포함해 작성
- [ ] 광고 SDK가 있으면 ATT 문구(NSUserTrackingUsageDescription)와 동의 흐름
- [ ] 가챠가 있으면 구매 전 확률 공개 화면 + 웹 확률표
- [ ] 연령 등급 설문(Apple 신규 체계), IARC 설문, Google 타깃층·광고 포함 여부 선언
- [ ] 스크린샷: Apple iPhone medium 필수 사이즈, Google 2장 이상(게임은 3장 이상 16:9 또는 9:16 권장), 피처 그래픽 1024×500, 아이콘 512×512
- [ ] 인앱 상품 등록, 심사용 메모(App Review Information) 작성
- [ ] Apple Paid Apps 계약 + Small Business Program 신청 완료
- [ ] targetSdk 36 / Xcode 26 빌드

---

## 8. 오너가 직접 해야 할 일 (순서·비용·소요 시간)

> 본인 명의 인증과 결제가 필요해 팀이 대신할 수 없는 일만 모았다.

| # | 할 일 | 비용 | 소요 시간(예상) | 비고 |
|---|---|---|---|---|
| 1 | 기존 Apple Developer / Google Play Console 계정이 정말 없는지 확인 | 0원 | 10분 | 예전에 만든 계정이 있으면 재사용. 특히 Google 개인 계정이 2023-11-13 이전에 만든 것이면 테스트 의무가 없음 |
| 2 | **Google Play Console 개인 계정 생성**(Google 계정, 본인 카드 결제, 신분증 인증, 연락처 OTP, Play Console 앱으로 Android 기기 인증) | **25 USD (1회)** | 가입 30분 + 인증 수일 [확인 필요] | 결제 프로필 주소가 수익화 시 공개됨. 사업장 주소를 쓸 수 있는지 확인 |
| 3 | **Apple Developer Program 개인 가입**(2단계 인증 Apple 계정, 실명, 본인 명의 카드) | **99 USD/년** (원화는 가입 화면에서 확인) | 가입 30분 + 승인 보통 1~2일 [확인 필요] | 판매자명은 실명으로 표시. 행복가게 이름은 사용 불가 |
| 4 | 비공개 테스트 테스터 12명 이상 섭외(구글 계정 이메일 수집) + 14일 동안 유지 독려 | 0원 (사례비는 선택) | 섭외 1주 + **테스트 14일** | 15~20명 확보 권장 |
| 5 | 사업자 업종 정정(722001·722002) 완료 확인 | 0원 | 진행 중 | 아래 6번의 전제 |
| 6 | **관할 구청에 게임제작업 등록** 문의 및 신청 | 수수료 [확인 필요] | 방문 또는 온라인 1회 + 처리 기간 [확인 필요] | 사업자등록증 지참. 자택 주소로 등록할 수 있는지 문의 |
| 7 | Apple **Paid Apps 계약**, 은행·세금 정보, **Small Business Program 신청** | 0원 | 1시간 + 승인 수일 | 인앱 결제 판매 전에 필수. 15% 적용 조건 |
| 8 | Google **결제 프로필(판매자 계정) 은행 계좌** 등록 | 0원 | 30분 + 계좌 인증 수일 | 인앱 결제 판매 전에 필수 |
| 9 | 수익 모델(광고 / 인앱 / 가챠), 아동 타깃 여부 **최종 결정** | 0원 | 회의 1회 | 이 문서의 권장안: 표준 IAP + 아동 타깃 제외 + 가챠는 무료 재화 중심 또는 확률 공개 |
| 10 | Google 프로덕션 액세스 신청서 제출(테스트 14일을 채운 뒤) | 0원 | 작성 30분 + **심사 최대 약 7일** | 신청서 초안은 팀이 준비하고 오너 계정으로 제출 |
| 11 | 세무 확인: 스토어 수익의 부가세·종합소득 신고 방법 | 세무 상담비 [확인 필요] | 상담 1회 | 첫 정산 전까지 |

**총 고정 비용**: 약 124 USD(Google 25 + Apple 99), 이후 매년 Apple 99 USD. 구청 등록 수수료와 세무 상담비는 별도다.
**최단 출시 경로**: 계정 생성(1~3일) → 첫 빌드와 동시에 Google 비공개 테스트(14일) → 프로덕션 심사(~7일). 계정을 지금 만들어도 **Google 공개는 첫 빌드 후 약 3주가 최단**이다.

---

## 부록: 출처 목록
- Apple Developer Program 가입: https://developer.apple.com/programs/enroll/
- Apple 가입 지원(개인사업자·소요): https://developer.apple.com/support/enrollment/
- Apple D-U-N-S: https://developer.apple.com/help/account/membership/D-U-N-S/
- Apple 예정 요건(SDK·연령 등급): https://developer.apple.com/news/upcoming-requirements/
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple App Review(거절 사유·심사 시간): https://developer.apple.com/distribute/app-review/
- Apple App privacy details: https://developer.apple.com/app-store/app-privacy-details/
- Apple Small Business Program: https://developer.apple.com/app-store/small-business-program/
- Apple 한국 외부결제: https://developer.apple.com/support/storekit-external-entitlement-kr/
- Apple 스크린샷 규격: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- Apple 미리보기 규격: https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications
- Apple 연령 등급 설정(한국 RCN): https://developer.apple.com/kr/help/app-store-connect/manage-app-information/set-an-app-age-rating/
- Google Play 가입: https://support.google.com/googleplay/android-developer/answer/6112435?hl=en
- Google Play 계정 유형: https://support.google.com/googleplay/android-developer/answer/13634885?hl=en
- Google Play 계정 요건·공개 정보: https://support.google.com/googleplay/android-developer/answer/13628312?hl=en
- Google Play 신규 개인 계정 테스트 요건: https://support.google.com/googleplay/android-developer/answer/14151465?hl=en
- Google Play 타깃 API: https://support.google.com/googleplay/android-developer/answer/11926878?hl=en
- Google Play 서비스 수수료: https://support.google.com/googleplay/android-developer/answer/112622?hl=en
- Google Play 한국 대체 결제: https://support.google.com/googleplay/android-developer/answer/11222040
- Google Play Families 정책: https://support.google.com/googleplay/android-developer/answer/9893335?hl=en
- Google Play 데이터 보안: https://support.google.com/googleplay/android-developer/answer/10787469?hl=en
- Google Play 미리보기 자산: https://support.google.com/googleplay/android-developer/answer/1078870?hl=en
- Android Developers Blog(D-U-N-S 최대 30일): https://android-developers.googleblog.com/2023/07/boosting-trust-and-transparency-in-google-play.html
- 국가법령정보센터 게임산업진흥에 관한 법률: https://www.law.go.kr/법령/게임산업진흥에관한법률
- 정책브리핑(확률형 아이템 시행령): https://www.korea.kr/briefing/policyBriefingView.do?newsId=156599363
- CEO스코어데일리(징벌적 손해배상 시행): https://www.ceoscoredaily.com/page/view/2025080415181654698
- 지디넷코리아(자체등급분류사업자 목록): https://zdnet.co.kr/view/?no=20210104110646
- 바이라인네트워크(모바일 등급분류 민간 이관): https://byline.network/2026/10/29-577/
- 비즈워치(GCRB 모바일 심의): https://news.bizwatch.co.kr/article/mobile/2026/11/03/0019
- 토스 앱인토스(등급분류·등록증): https://toss.im/apps-in-toss/blog/game_rating_classification
- 디스이즈게임(제작업 등록 의무): https://www.thisisgame.com/articles/420492
- 인프런 Q&A(개인사업자 조직 계정 지급 보류 사례): https://www.inflearn.com/community/questions/1780821/
