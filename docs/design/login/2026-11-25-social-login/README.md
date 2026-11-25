# 소셜 로그인·개인화 설계 — 로그인·개인화 TF · 2026-11-25

- 참석: UX 리서처(PL-3), 서버 개발(DV-3), 앱 개발(DV-1), QA-3(보안·개인정보)
- 전제: 오너 결정 ④(DECISIONS 11-25): **로그인의 목적은 개인화이고, 방식은 가장 간편한 소셜 로그인으로 한다.** 시점, Apple 로그인 의무, 처리방침은 팀이 정한다. 팀은 이미 '첫 화면 가입 벽은 피한다'고 권고했다.
- 상태: **TF 제안안.** 코드, roadmap, DECISIONS, 처리방침 본문은 고치지 않았고 커밋도 하지 않았다. 오너가 승인하면 PM이 기록한다.
- 표기: `[추정]`은 팀 추정, `[확인 필요]`는 원문 확인이나 실측을 아직 못 한 것이다.
- 함께 있는 것: `mock/flows.html`(목업 원본, `?s=R1`은 한 장, `?board=all`은 전부), `mock/*.png`(360×740 @2x 캡처), `feedback.md`(블라인드 유저 피드백).

---

## 오너용 한 장 요약

**한 줄 추천: 로그인은 '지킬 것이 생긴 순간'에 권한다. 7번째 아침 이레 한 폭을 받은 뒤 한 번 권하고, 공유 서명이나 맡겨 두기를 처음 켤 때 다시 권한다. 제공자는 Apple과 Google 두 가지다. 이름·이메일은 받지 않고, 제공자 번호만 변환해 '되찾기 열쇠'로 쓴다.**

| 질문 | 팀 답 |
|---|---|
| 로그인하면 유저는 무엇을 얻나 | ① **기기를 바꿔도 글귀 없이 이어 키운다**(가치가 가장 크고, 서버가 이미 있다. 블라인드 유저도 '이것 하나면 충분'이라고 했다). ② 공유물에 찍는 **내 호(號)와 인장**(오너 결정 ③ '공유가 핵심'과 이어진다. 첫 공유 때 정하고 로그인 흐름에는 넣지 않는다). ③ 1.x에 **친구 몽망이에게 꿈 한 장 보내기**(링크로 하고, 친구 목록은 두지 않는다). 알림 시각 맞춤은 지금도 기기 안에서 되므로 로그인이 필요 없다(2절). |
| 언제 권하나 | **(다)안.** 7번째 아침에 조용한 카드로 한 번 권하고, 닫으면 다시 묻지 않는다. 그 밖에는 공유 미리보기의 '서명 찍기'와 공방 노트의 '맡겨 두기'에서 권한다. 첫 화면과 둘째 날 아침에는 권하지 않는다(3절). |
| 제공자 | 1.0과 소프트런칭(CA·NZ·PH)은 **Apple + Google**이다. 카카오는 한국 정식 출시 때 다시 판단하고(1.x), 이메일 매직링크는 넣지 않는다(4절). |
| Apple 의무 | Google을 넣으면 iOS에 Sign in with Apple을 같은 크기 이상으로 함께 둬야 한다(4.8). 로그인 없이 쓰는 길은 지금 그대로다(5.1.1(v)). 계정 삭제는 앱 안에 이미 있고, 여기에 Apple 토큰 철회를 더한다(5절). |
| 기술 | Firebase는 쓰지 않는다. Supabase 익명 로그인(C11)은 그대로 둔다. 소셜 로그인은 **'되찾기 글귀를 대신하는 열쇠'**로 서버에 붙인다. 서버는 제공자 ID 토큰을 검증한 뒤 `HMAC(제공자 번호)`만 저장한다. 이 길은 지금 recover·충돌 고르기 경로를 그대로 다시 쓰므로 기록 유실이 없다(5절). |
| 개인정보 | 받는 것은 제공자 번호를 변환한 값 하나다. 이메일·이름·사진은 받지 않는다. Data safety의 '이메일' 항목은 '아니요'로 유지한다. 처리방침은 1·3-5·6·7·8·12절에 한 줄씩 더하면 되고, 초안은 6절에 있다. |
| 일정 영향 | **12-12 리허설 전에 네이티브 모듈 2개만 넣는다**(`expo-apple-authentication`, `expo-web-browser`, 약 1일). 기능은 플래그 `social`을 끈 채 바이너리에 실어 두고, JS·서버 일 약 8~9일 [추정]은 소프트런칭 중 OTA로 켠다(목표 01-19, OTA 마감 02-02). 01-12 소프트런칭 날짜는 바뀌지 않는다. |
| **오너 몫** | ① 이 추천안 승인(시점·제공자·'호' 포함 여부) ② **12-08까지** Apple Developer에서 App ID에 Sign in with Apple 기능 켜기, Services ID와 도메인 `mongmang.ink` 등록, 키(.p8) 발급 ③ **12-08까지** Google Cloud에서 OAuth 동의 화면과 클라이언트(iOS·Android·웹)를 만들고, Android는 EAS 서명 키와 Play 앱 서명 키의 SHA-1을 등록 ④ 12-05 법률 검토 범위에 '소셜 연결' 더하기. 카카오 앱 등록은 지금은 하지 않는다(7절). |
| 정해 주실 것 | **A.** 추천안 (다) 승인(예/아니요) **B.** 공유 '호(號)·인장'을 1.0에 넣을지(추천 예, 약 1일, 첫 공유 미리보기에서 정함) **C.** '친구에게 꿈 보내기'는 D-23 '친구 그래프 없음'을 지키는 링크 방식으로 1.x에 둘지(추천 예) |

**블라인드 피드백**(타깃 유저 역할 1명, 안 이름 숨김)도 가장 좋은 안으로 **(다)**를, 가장 싫은 안으로 (가)를 골랐다. 문구 5곳을 고치고 호 정하기를 로그인 흐름에서 빼는 것까지 목업 v1에 반영했다(`feedback.md`).

---

## 0. 이미 있는 것 (코드 확인)

| 조각 | 위치 | 이번 설계에서 쓰는 방식 |
|---|---|---|
| C11 로그인 포트 `CloudAuth.token()` → `ok / none / unavailable` | `apps/mobile/src/net/supabaseAuth.ts`, `cloud/api.ts` | Supabase 익명 세션은 **그대로 둔다**. 소셜 로그인은 이 포트를 바꾸지 않고, 서버의 '열쇠'로 붙는다 |
| 14세 확인(태어난 해·달, 저장 0, 같은 날 다시 묻지 않음) | `apps/mobile/src/cloud/ageGate.ts`, 화면은 CloudSheet | 연결 직전에 한 번 묻는다. 통과 기록이 있으면 다시 묻지 않는다(R2) |
| B2 계정: `bootstrap`(연령 `{v, ok:true}` 필수)·`recover`(글귀)·`DELETE /me`·웹 `/delete` | `apps/server/src/account/*`, `auth/*` | 소셜은 **두 번째 되찾기 수단**이다. recover와 같은 결과를 낸다(새 sub, 옛 로그인 revoked 410) |
| B2b 멱등(recover 재시도, DELETE 다시, 401 `no_account` 분리) | 같은 곳 | 소셜 되찾기도 같은 멱등 규칙을 따른다 |
| C12 맡겨 두기 UI(충돌 시 나란히 고르기, preRestore·parked 칸, 지우기 확인) | `apps/mobile/src/cloud/model.ts`·`tasks.ts` | 새 기기에서 소셜로 되찾을 때도 이 화면을 그대로 쓴다. 기기에 있던 본은 preRestore 칸에 남는다 |
| C10b 세션 백업 제외 | `apps/mobile/plugins/withSessionBackupExclusion.js` | 바뀌는 것 없음 |
| 처리방침 v3.4 1절 "로그인 화면이 없고…" | `docs/release/privacy-policy.ko.md:88` | 이 문장을 고친다(6절) |
| store-listing 7-1 '이메일 — 아니요 [1.0.x에 예]' | `docs/release/store-listing.md:281` | 이번 설계를 따르면 **계속 '아니요'**이므로 줄을 고친다 |

**'C12 맡겨 두기가 Google 로그인 계열인가?'에 대한 답: 아니다.** 맡겨 두기는 Supabase **익명** 로그인에 되찾기 글귀(80비트, 서버에는 HMAC만)를 더한 구조이고, Google이나 Apple 계정과는 관계가 없다. 이번 설계는 여기에 '글귀 대신 Apple·Google 계정으로 되찾기'를 붙인다.

---

## 1. '개인화'가 무엇인가 — 로그인해서 유저가 얻는 것

D-23 원칙은 지킨다. 앱은 서버 없이 완결되고, 친구 그래프는 두지 않으며, 숫자나 순위도 두지 않는다. 그 안에서 로그인이 **처음으로 가능하게 하는 것**만 골랐다.

| # | 얻는 것 | 유저 가치 | 비용·위험 | 로그인이 꼭 필요한가 | 판정 |
|---|---|---|---|---|---|
| P1 | **기기를 바꾸거나 앱을 지워도 이어 키우기**(글귀 16자 대신 Apple·Google 한 번) | **가장 크다.** 28밤을 키운 아이를 잃는 것이 오래 키운 유저의 가장 큰 공포다. 글귀는 적어 두지 않으면 잃는다 [추정] | 서버 약 2일, 앱 약 2일. recover·충돌 경로를 다시 쓴다 | 예. 글귀 없이 같은 사람임을 확인할 방법은 이것뿐이다 | **1.0 핵심** |
| P2 | **공유물에 찍는 내 호(號)와 인장**(첫 공유 때 정함) | 공유가 핵심(오너 ③)이다. 받은 사람이 '누가 키운 꿈'인지 보고, 보낸 사람은 내 것이라는 느낌을 얻는다. 먹·낙관과 세계관이 맞다 | 앱 약 1일. 호는 유저가 직접 쓰고, 계정 실명은 가져오지 않는다. 이름 규칙(`normalizeName`)과 공개 범위 설정을 다시 쓴다 | 기술로는 아니다(기기 안에 둘 수 있다). 다만 기기를 바꾸면 사라지므로 P1과 함께 가야 뜻이 있다 | **1.0 권장(오너 B)** |
| P3 | **친구 몽망이에게 꿈 한 장 보내기·놀러 가기** | 공유 루프의 '받은 사람도 해 보고 싶게'와 바로 이어진다 | 크다. D-23 '친구 그래프 없음'과 충돌하고, UGC 신고·차단(Apple 1.2), 14세, 처리 항목 추가가 따라온다. 서버 약 4~6일 [추정] | 예(보낸 사람 확인) | **1.x.** 링크 방식(친구 목록 없이 받은 링크로 한 번)으로 하자는 제안이다(오너 C) |
| P4 | 여러 기기에서 **동시에** 키우기(폰과 태블릿) | 작다. 몽망이는 하루 한 번 의례라 동시에 쓸 일이 드물다 | 크다. 1.0 서버는 '한 계정에 로그인 하나'(recover가 옛 로그인을 revoked로 바꾼다)라 동시 쓰기 충돌 규칙이 새로 필요하다 | 예 | **하지 않음.** 1.0은 '옮기기'만 한다 |
| P5 | 맞춤 알림 시각 | 있다. 다만 지금도 잠 시각과 밥 알림이 **기기 안**에서 맞춰진다(D-27, 처리방침 11절) | 0 | **아니다** | 로그인과 묶지 않는다. 로그인 혜택으로 홍보하면 과장이다 |
| P6 | 완주한 아이들의 서가(28밤 두루마리 보관)를 기기 사이로 옮기기 | 중간. 두 번째 아이부터 커진다 | 맡겨 두기가 '사용자당 몽망이 하나'라 스키마가 바뀐다 | 예 | 1.x, P1 다음 |
| P7 | 웹(`mongmang.ink/me`)에서 내 몽망이 보기 | 작다 | 웹 로그인과 세션이 새로 생긴다 | 예 | 하지 않음 |

**TF가 정직하게 보고하는 것:** 오너가 말한 '개인화' 가운데 **로그인 없이는 안 되는 것은 P1(이어 키우기)과 P3(친구)뿐**이다. 호·인장, 알림, 테마 같은 것은 기기 안에서도 된다. 그래서 첫 권유 문구는 '개인화'가 아니라 **"이 아이를 지켜 두기"**로 쓴다. 호·인장은 첫 공유 때 정하고, 지켜 두면 기기 사이로 함께 옮겨 간다(C1). 앞으로 P3을 하게 되면 로그인의 두 번째 이유가 된다.

---

## 2. 로그인 시점·흐름 3안 비교

목업은 `mock/board-ga.png`·`board-na.png`·`board-da.png`(설명 포함), 블라인드용은 `blind-*.png`에 있다.

| | (가) 스플래시 직후 + 건너뛰기 | (나) 첫 꿈 카드 아침에 '이 꿈을 간직하기' | **(다) 지킬 것이 생긴 순간(추천)** |
|---|---|---|---|
| 화면 | A1 연령 확인 → A2 Apple·Google·'로그인 없이 시작' | B1 둘째 날 아침 꿈 카드 아래 버튼 → B2 로그인 시트 | R1 7번째 아침 카드(한 번만) → R2 연령 → R3 무엇을 받는지 + Apple·Google·복구 글귀 → R4 지켜 둠(새 기기 안내). 다른 입구로 C1 공유 미리보기 '호와 인장 찍기'(처음 켤 때 호를 정함)와 공방 노트 '지켜 두기'가 있다 |
| 이탈 | **나쁘다.** 첫 실행 가입 벽에서 약 20%가 이탈한다(Phiture, 업계 관찰치·원출처 미확인 [1]). 건너뛰기가 있어도 첫 두 장이 모두 입력이다. 그런데 판정 지표가 D1 35%다(D-23) | 중간. 몰입이 가장 높은 '첫 아하' 순간을 끊는다. 유저가 쌓은 것은 밤 하나뿐이라 지킬 동기가 약하다 [추정]. 게다가 꿈 카드는 이미 기기에 남아 있어서 '간직'이라는 말이 오해를 부른다 | **가장 낫다.** Apple HIG의 "Delay sign-in as long as possible"[2]과 같다. Duolingo는 가입을 체험 뒤로 미뤄 DAU를 약 20% 늘렸다[3]. 7밤을 쌓은 유저는 잃을 것이 있으므로 손실 회피가 권유를 돕는다 [추정] |
| 연결률 | 시도하는 사람 수는 가장 많지만 그만큼 첫 실행에서 많이 떠난다 | 중간 | 7번째 아침까지 오는 사람만 본다(D7 15% 목표 기준으로 설치자의 약 2할 [추정]). 대신 연결할 가치가 큰 사람에게 닿는다 |
| Apple 5.1.1(v) | 건너뛰기가 있어 위반은 아니다. 다만 심사에서 '로그인 강제 인상'으로 지적받을 위험이 있다 [추정] | 통과 | 통과 |
| 14세 확인 | **모든 신규 유저의 첫 화면이 연령 입력이 된다.** 14세 미만은 바로 '안 됨'을 만난다(처리방침 4절 '게임은 누구나'와 어긋나 보인다) | 둘째 날에 연령 입력이 들어온다 | 연결하려는 사람만, 그 직전에 본다(D-23 그대로) |
| D-23 '계정은 필요할 때만' | 충돌 | 약하게 충돌 | 맞음 |
| Google Play | 정책상 막는 것은 없다. 계정을 만드는 앱이면 앱 안 삭제 + 웹 삭제 링크가 필요하다[6] | 같다 | 같다 |
| 만드는 일 | 화면 2장 | 화면 2장 | 화면 4장 + 입구 2곳 |

**추천: (다).** 이유는 셋이다. ① 첫 실행 이탈이 0이다. ② 권하는 순간과 얻는 가치('일곱 밤을 지켜 두기')가 맞물린다. ③ D-23, 14세 순서, 처리방침 4절을 하나도 바꾸지 않는다.

(다)의 세부 규칙:
- 7번째 아침 카드(R1)는 이레 한 폭 연출이 **끝난 뒤** 홈에 한 번만 뜬다. '괜찮아요'를 누르면 다시 묻지 않는다(기기 기록 `mong.social.asked`). 카운트다운이나 '잃어요' 같은 겁주는 말은 쓰지 않는다(D-27 L3, C12 재촉 검사).
- 14번째나 28번째 아침에 다시 묻지 않는다. 대신 공방 노트에 '지켜 두기' 행을 늘 둔다.
- **새 기기 첫 화면:** 스플래시 아래 작은 글씨로 '예전 몽망이 데려오기'를 둔다. 로그인 벽이 아니라 링크다. 누르면 연령 확인 → Apple·Google·글귀 → C12 되찾기 흐름으로 간다. 누르지 않으면 지금처럼 바로 먹 방울을 고른다.
- 공유(C1)는 서명 없이도 된다. '내 호와 인장 찍기'를 처음 켜면 그 자리에서 호를 정하고, 지켜 두지 않았다면 보낸 뒤 R2 → R3를 한 번 권한다(넘길 수 있음). 호는 기기에 두고, 지켜 두면 맡긴 기록과 함께 옮겨 간다.

---

## 3. 심사·정책 근거 (원문)

| 규정 | 원문 요지 | 우리 설계 |
|---|---|---|
| App Review **4.8 Login Services**[4] | 제3자·소셜 로그인으로 **주 계정**을 만들거나 인증하면, 다음 조건을 갖춘 로그인도 **동등한 선택지로** 함께 제공해야 한다. (a) 수집을 이름·이메일로 한정 (b) 이메일 숨김 허용 (c) 동의 없는 광고용 추적 없음 | iOS에 Google을 넣으므로 **Sign in with Apple을 함께 둔다**. 버튼은 같은 크기로 하고 iOS에서는 Apple을 위에 둔다(HIG Sign in with Apple 버튼 규칙). Android에는 의무가 없지만, iOS에서 Android로 옮기는 사람을 위해 브라우저 방식의 Apple 로그인을 둔다(5-3) |
| **5.1.1(v) Account Sign-In**[4] | "If your app doesn't include significant account-based features, let people use it without a login." 계정을 만들 수 있으면 **앱 안 계정 삭제**가 필수다. 핵심 기능과 관계없는 개인정보를 요구하면 안 된다 | 로그인 없이 모든 게임이 된다(지금 그대로). 삭제는 C12 '서버에 맡긴 것 지우기' + 웹 `/delete`로 이미 있다. 여기에 Apple 토큰 철회를 더한다 |
| **TN3194** 계정 삭제와 Sign in with Apple 토큰 철회[5] | Sign in with Apple을 쓰는 앱은 계정을 지울 때 REST API `/auth/revoke`로 토큰을 철회해야 한다. 토큰이 없더라도 삭제 요청은 처리해야 한다 | 5-4 '지울 때 Apple 한 번 더 확인 → 바로 철회' |
| **Google Play 계정 삭제 요건**[6] | 앱에서 계정을 만들 수 있으면 앱 안 삭제 요청과 **웹 링크**를 함께 제공해야 한다(웹 링크는 Data safety에 입력). 지울 때 연결된 데이터도 지우고, 보존하는 것은 알린다 | 웹 `/delete`는 지금 '인장 코드 + 글귀'를 요구한다. **글귀 없이 소셜로만 지킨 유저**도 웹에서 지울 수 있게 `/delete`에 'Apple·Google로 확인' 갈래를 더한다(서버 1일) |
| Apple HIG Managing accounts[2] | "Delay sign-in as long as possible." | (다) |

---

## 4. 제공자

| 제공자 | 1.0 / 소프트런칭(CA·NZ·PH) | 이유 | 비용·일 |
|---|---|---|---|
| **Sign in with Apple** | **넣음(iOS 네이티브, Android는 브라우저)** | 4.8 의무다. 이메일 범위를 요청하지 않으면 제공자 번호만 받는다 [확인 필요: 범위 없이 요청했을 때 ID 토큰에 email 클레임이 없는지 실기기로 확인] | 무료(Apple Developer 연회비 안). `expo-apple-authentication` |
| **Google** | **넣음(iOS·Android)** | CA·NZ·PH의 Android 점유율이 높다. Android 유저에게는 기본 계정이다 | 무료. 방식은 5-3에서 고른다 |
| 카카오 | **넣지 않음** → 한국 정식 출시를 판단할 때(1.x) | 소프트런칭 국가에서는 효용이 0에 가깝다(4-ux-growth 2절). 한국에서는 간편하지만, 이메일·이름 같은 동의 항목을 받으려면 비즈 앱 심사가 필요하고 우리 원칙(번호만)과 맞지 않는다 [확인 필요]. **브라우저 OAuth 방식으로 만들면 네이티브 모듈 없이 OTA로 더할 수 있다**(5-3에서 `expo-web-browser`를 넣어 두는 이유) | 넣는다면 서버 0.5일 + 앱 0.5일 [추정] |
| 이메일 매직링크 | **넣지 않음** | 이메일을 받아 저장해야 하고(처리 항목이 늘어난다), 메일 발송 수탁사와 국외 이전이 새로 생긴다. 딥링크로 돌아오는 흐름은 웹뷰나 메일 앱에서 자주 끊긴다. Apple이나 Google 계정이 없는 사람에게는 **되찾기 글귀**가 이미 같은 역할을 한다 | — |

---

## 5. 기술 설계

### 5-1. Firebase Auth? Supabase Auth의 identity linking? → **둘 다 아니고, '소셜 열쇠'**

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| Firebase Auth | 인증을 Firebase로 옮긴다 | 소셜 SDK가 성숙하다 | 수탁사·국외 이전이 하나 더 생긴다(처리방침 7·8절). Supabase JWT 검증(B2)을 다시 짜야 한다. **버림** |
| Supabase identity linking | 익명 사용자에게 `linkIdentity` 또는 `linkIdentityWithIdToken`으로 Apple·Google ID를 붙인다(수동 연결을 켜야 한다)[7] | 서버 코드가 적다 | Supabase가 제공자가 준 값(이메일·이름·사진 주소)을 `auth.users`·`auth.identities`에 **자동으로 저장한다**. 그러면 '이메일·이름 받지 않음'을 지킬 수 없고 Data safety '이메일 예'가 된다. 새 기기에서 같은 sub로 로그인하면 '한 계정에 로그인 하나'(recover가 옛 로그인을 revoked로 바꿈)가 깨져 C12 갈래(orphan·410)를 다시 설계해야 한다. supabase-js를 들이지 않은 C11 원칙과도 어긋난다 |
| **소셜 열쇠(추천)** | Supabase **익명** 세션은 그대로 둔다. 앱이 받은 Apple·Google **ID 토큰**을 우리 서버가 JWKS로 검증한 뒤(`jose`, B2에서 이미 씀) `HMAC(pepper, 제공자 ‖ sub)`만 저장한다. 되찾기는 지금 `recover`와 같은 결과를 낸다(새 익명 sub를 붙이고 옛 로그인을 revoked로) | **이메일·이름이 어디에도 저장되지 않는다.** recover·충돌·멱등·410 갈래를 그대로 다시 쓴다. 새 의존성이 없다. 되찾기 글귀와 대칭이다(글귀도 HMAC만 저장) | 서버가 ID 토큰 검증(aud·iss·exp·nonce)을 직접 맡는다. Apple 토큰 철회도 직접 한다 |

**Supabase 비용:** 익명 세션은 지금도 맡겨 두기와 공유 때만 생긴다. 소셜 열쇠는 새 Auth 사용자를 만들지 않으므로 **MAU 증가가 0**이다. 참고로 Pro 요금제에 100,000 MAU가 포함되고, 넘으면 MAU당 $0.00325다[8]. Apple·Google 로그인 자체는 무료다.

### 5-2. 서버 (DV-3, 약 3일 [추정])
- 새 표 `app.social_keys(user_id → users ON DELETE CASCADE, provider char, key_hmac bytea UNIQUE, created_at)`. 사용자당 제공자별로 하나다. 제공자 원문 sub, 이메일, 이름은 받을 칸이 없다(계약 시험에서 확인).
- `POST /me/social-key {provider, idToken, nonce}`: 로그인한 사용자에게 열쇠를 붙인다. ID 토큰은 Apple `https://appleid.apple.com/auth/keys`와 Google JWKS로 검증하고, `aud`(번들 id·클라이언트 id), `iss`, `exp`, `nonce`(앱이 만들어 SHA-256을 넘긴 값)를 본다. 이미 **다른 사용자**에 붙은 열쇠면 409 `key_in_use`를 돌려준다. 이때 앱은 '그 계정에 다른 몽망이가 있어요 → 데려오기로'를 안내한다.
- `POST /recover/social {provider, idToken, nonce}`: 지금 `recover`와 같은 트랜잭션이다. 같은 리밋(IP 접두당 5/시간), Auth Admin 존재 확인, `auth_gc` 거절, 24시간 replay 멱등(B2b)을 그대로 쓴다. 차이는 글귀 대신 열쇠로 찾는다는 것 하나다. 되찾으면 글귀는 바뀌지 않는다(글귀를 받은 유저는 계속 쓸 수 있다).
- `DELETE /me/social-key/{provider}`: 연결을 끊는다(5.1.1(v) '연결 끊기'). 열쇠도 글귀도 없는 상태가 되면 앱이 먼저 경고한다.
- `DELETE /me` 확장: `social_keys`는 CASCADE로 지워진다. Apple 연결이 있으면 앱이 지우기 직전에 **Apple 로그인을 한 번 더 받아 `authorizationCode`를 함께 보낸다**. 서버는 그 코드를 토큰으로 바꾼 뒤 곧바로 `/auth/revoke`를 부르고, 아무것도 저장하지 않는다. 웹 삭제와 2년 미사용 정리처럼 코드가 없는 경우에는 TN3194대로 **삭제만 하고**, 처리방침에 '그 경우 Apple 설정의 앱 연결은 직접 끊을 수 있다'를 적는다. [QA-3 확인 필요: 이 방식으로 심사가 충분한지, 아니면 연결할 때 받은 Apple refresh token을 암호화해 보관할지. 보관하면 처리 항목이 하나 는다]
- 웹 `/delete`: 'Apple·Google로 확인' 갈래를 더한다(Play 웹 링크 요건). 이 갈래는 Firebase Hosting 정적 페이지에서 Apple JS와 Google Identity Services로 ID 토큰을 받아 Cloud Run으로 보낸다(CSP connect-src에 제공자 출처를 더해야 한다).
- Apple 클라이언트 시크릿(JWT, .p8 키로 서명)은 Secret Manager에 둔다. 키는 오너가 발급한다.

### 5-3. 앱 (DV-1·DV-4, 약 4.5일 [추정])
- **네이티브(12-12 리허설 전, 약 1일):** `expo-apple-authentication`(iOS 엔타이틀먼트 `com.apple.developer.applesignin`)과 `expo-web-browser`(Google 브라우저 OAuth·PKCE, Android의 Apple 로그인, 나중의 카카오)를 넣는다. 둘 다 Expo SDK 모듈이라 C10 묶음에 함께 들어간다. 병합 매니페스트 검사(AD_ID 없음)도 다시 돌린다.
- **Google 방식:** 기본은 브라우저 OAuth(PKCE, `openid` 범위만 요청)다. 이 방식은 네이티브 모듈을 더 넣지 않고 iOS와 Android 모두 같은 코드로 된다. Android Credential Manager(바텀시트 한 번 탭)가 연결률에는 더 좋다. 다만 `@react-native-google-signin`의 무료판과 유료판 기능 차이, Google 측 지원 중단 일정이 [확인 필요]라, **12-01~12-05 스파이크**로 정한 뒤 12-12 리허설 전에 고른다.
- **흐름(JS, OTA 가능):**
  1. 연결: 연령 확인(이미 있음) → 익명 로그인과 `bootstrap`(맡겨 두기가 꺼져 있었다면 '지켜 두기'가 맡겨 두기를 함께 켠다) → 제공자 로그인 → `POST /me/social-key`. 열쇠를 붙이지 못해도 맡겨 두기는 켜진 채로 남는다('Apple 연결은 안 됐어요. 글귀로 맡겨 두었어요'). **실패해서 사라지는 경로는 없다.**
  2. 되찾기(새 기기): '예전 몽망이 데려오기' → 연령 확인 → 제공자 로그인 → `POST /recover/social` → 지금의 C12 되찾기 결과 갈래를 그대로 탄다. 기기에 이미 키우던 본이 있으면 **나란히 고르기**를 하고, 진 본은 preRestore·parked 칸에 남는다(C12 ③⑦⑨). → **익명 → 로그인 승격에서 기록 유실 0.** 승격은 같은 sub 위에 열쇠만 더하는 일이라 기기 세이브와 서버 본은 한 바이트도 움직이지 않는다.
  3. 공방 노트: '지켜 두기: Apple로 연결됨 · 끊기' 행. 지우기는 기존 '서버에 맡긴 것 지우기'로 하고, Apple이면 한 번 더 확인한다.
- 플래그 `social`의 기본값은 꺼짐이다. 켜는 조건은 QA-3 리뷰 통과, 처리방침 개정판 게시, Data safety·App Privacy 갱신이다.
- 시험: 계약(열쇠 요청 본문에 이메일·이름 칸 0), 승격 전후 세이브 sha 동일, 409 `key_in_use` 갈래, 되찾기 replay, 연결 실패 뒤 맡겨 두기 유지, 변이(nonce 검사 제거, aud 검사 제거, CASCADE 제거, 철회 생략).

### 5-4. 순서 (14세 확인이 언제나 먼저)
`입구(R1·C1·공방·데려오기) → 14세 확인(통과 기록 있으면 생략, 미달이면 오늘은 끝) → 무엇을 받는지 보이기(R3) → 제공자 로그인 → 익명 세션·bootstrap → 열쇠 붙이기 → 끝(R4, 새 기기 안내). 호·인장은 첫 공유(C1)에서`
14세 미만은 연결하지 못하고, 게임은 그대로 이어진다(처리방침 4절 그대로).

### 5-5. 일정

| 날짜 | 일 | 담당 |
|---|---|---|
| 11-26~11-30 | 오너 승인(A·B·C), V0-5와 함께 | 오너 |
| 12-01~12-05 | Google 방식 스파이크, Apple 범위 없이 요청할 때의 토큰 클레임 실측 | DV-4·DV-1 |
| **~12-08** | **오너 계정 작업 완료**(7절). 늦으면 리허설 빌드에 엔타이틀먼트가 들어가지 않는다 | 오너 |
| **12-12 리허설** | 네이티브 2개 모듈 + 엔타이틀먼트를 빌드에 포함, 병합 매니페스트 확인 | DV-4 |
| 12-19 빌드 2 동결 | 바이너리에 실음(플래그 꺼짐) | — |
| 12-15~01-09 | 서버 3일, 앱 JS 3.5일, 호·인장 1일, 처리방침·스토어 1일, 독립 리뷰·변이 1일 → **합계 약 9.5일 [추정]**. V절 빌드 2 일과 겹치지 않게 RC 뒤로 돌려도 된다 | DV-3·DV-1·QA-3 |
| 01-12 | 소프트런칭(소셜은 꺼짐) | — |
| **~01-19** | 리뷰 통과 → Data safety·App Privacy 갱신 → OTA로 `social` 켜기 | PM |
| 02-02 | OTA 마감. 못 켜면 정식 출시 판으로 넘긴다 | — |

- **일정 영향:** 빌드 2 전에 더해지는 일은 **네이티브 약 1일(DV-4)뿐**이다. 12-12 리허설은 V2 ML Kit 모듈과 같은 창이라 DV-4 부하가 늘어난다. 오너 계정 작업이 12-08을 넘기면 네이티브를 01-26 위젯 스토어 업데이트(D-27 V33)로 미루고, 소셜은 그 판에서 켠다.
- 소프트런칭 중에 켜는 이유: 판정 코호트(D1·D7)를 오염시키지 않으려면 **판정 기간 동안 R1 카드 노출을 50:50으로 나눠** 연결률과 D7을 함께 본다 [PM 판단 필요]. 나누지 않을 거라면 02-16 판정 뒤에 켠다.

---

## 6. 개인정보

### 6-1. 수집 항목(기본값)

| 항목 | 받나 | 비고 |
|---|---|---|
| 제공자 고유 번호 | **변환한 값(HMAC)만** 저장 | 원문 sub는 검증할 때 메모리에서만 쓴다 |
| 이메일 | **받지 않음** | Apple은 범위를 요청하지 않는다. Google은 `openid`만 요청하지만 ID 토큰에 email 클레임이 올 수 있다 [확인 필요] → 서버는 읽지 않고 버린다(로그에 토큰 0, 계약 시험) |
| 이름·프로필 사진 | **받지 않음** | 공유 서명은 유저가 직접 쓴 '호'다 |
| 제공자 토큰 | **저장하지 않음** | Apple 철회용 코드는 지우는 순간에만 받아서 쓰고 버린다 |
| 호(號) | 유저가 켰을 때만 | 기기와 공유물에 둔다. 공개 페이지에는 '서명 찍기'를 켰을 때만 오른다(지금 '이름 공개'와 같은 규칙) |

### 6-2. 처리방침 개정 범위와 문안 초안 (v3.5 후보 — QA-3·법률 검토 전)

- **1절(한눈에 보기)** — 지금 문구: "로그인 화면이 없고, 이름·이메일·…을 받지 않습니다."
  - ko 초안: "로그인 없이 시작하며, 이름·이메일·전화번호·광고 ID·위치·연락처·사진을 받지 않습니다. '지켜 두기'에서 Apple이나 Google 계정으로 연결하는 것은 선택이며, 그때도 계정의 이름·이메일은 받지 않고 그 계정을 다시 알아보는 데 필요한 번호를 바꾼 값 하나만 보관합니다."
  - en draft: "You can start without signing in, and we don't collect your name, email, phone number, advertising ID, location, contacts or photos. Linking an Apple or Google account under 'Keep safe' is optional. Even then we don't receive the account's name or email; we keep only one transformed value of the number needed to recognise that account again."
- **3-5절(맡겨 두기) 항목 추가**
  - ko: "Apple·Google로 지켜 두기를 켠 분: 그 계정의 고유 번호를 되돌릴 수 없게 바꾼 값(제공자 종류 포함). 새 기기에서 같은 계정으로 로그인하면 이 값으로 몽망이를 찾습니다. 로그인할 때 Apple·Google이 보내 주는 확인 정보는 검증에만 쓰고 저장하지 않습니다."
  - en: "If you turn on 'Keep safe with Apple/Google': an irreversibly transformed value of that account's unique number (with the provider type). When you sign in with the same account on a new device, we use it to find your Mongmangi. The confirmation that Apple or Google sends at sign-in is used only to verify it and is not stored."
- **6절(보유 기간)**: '맡겨 두기와 같음(지우면 바로, 2년 미사용 정리 대상)' 한 줄.
- **7·8절**: Apple과 Google은 우리가 맡기는 수탁사가 아니라 **이용자가 고른 로그인 제공자**다. 표에 넣지 않고 다음 주석 한 줄만 단다. ko: "Apple·Google 로그인은 이용자와 각 회사 사이의 서비스이며, 그 회사의 방침이 적용됩니다." [법률 확인 필요: 제3자 제공·위탁 어느 쪽에도 해당하지 않는다는 판단]
- **12절(권리)**: "공방 노트에서 Apple·Google 연결을 끊을 수 있습니다. 서버에 맡긴 것을 지우면 연결 값도 함께 지우고, Apple로 연결했다면 Apple에 로그인 철회를 요청합니다. 웹 삭제나 장기 미사용 정리로 지운 경우에는 기기의 Apple ID 설정 > 'Apple로 로그인'에서 직접 끊을 수 있습니다."
- **K표(구현 확인)**: K40 '소셜 열쇠 = HMAC만, 이메일·이름·토큰 저장 0', K41 'Apple 철회'를 새로 둔다.

### 6-3. Data safety · App Privacy
- Google Play Data safety: **'이메일' 항목을 '아니요'로 유지한다.** store-listing 7-1 `[1.0.x에 예]` 메모는 '소셜 열쇠 설계로 아니요 유지'로 고친다. '사용자 ID'(이미 예, 계정 관리)의 설명에 '로그인 제공자 연결 값'을 더한다. 계정 삭제 웹 링크는 그대로 둔다(`/delete`에 소셜 갈래 추가).
- Apple App Privacy: Identifiers > **User ID**(이미 Linked, App Functionality)에 포함한다. Contact Info > Email은 **수집 안 함**. Sign in with Apple을 쓴다는 것 자체로 더할 항목은 없다.
- 심사 메모: "Sign in is optional, offered after day 7 or from Settings > Keep safe. Demo: tap 'Bring back an earlier Mongmangi' on first screen." 7밤을 기다릴 수 없는 심사자를 위해 공방 노트 입구를 안내한다.

---

## 7. 오너 몫 (계정·결정)

| # | 할 일 | 기한 | 왜 |
|---|---|---|---|
| 1 | 추천안 승인: A 시점 (다) / B 호·인장 1.0 / C 친구 꿈 보내기 1.x 링크 방식 | 11-30(V0-5와 함께) | 범위 확정 |
| 2 | **Apple Developer**: App ID `…mongmangi`에 *Sign in with Apple* 기능 켜기 → 프로비저닝 갱신(EAS가 다시 만든다) | **12-08** | 엔타이틀먼트 없이는 리허설 빌드에서 로그인이 실패한다 |
| 3 | **Apple Developer**: *Services ID* 만들기(Android·웹용), 도메인 `mongmang.ink` 확인, Return URL 등록 | 12-08 | Android의 Apple 로그인, 웹 `/delete` 갈래 |
| 4 | **Apple Developer**: Sign in with Apple **키(.p8)** 발급 → Key ID·Team ID를 DV-3에 전달하고 파일은 Secret Manager에 직접 올리기(채팅·메일로 보내지 않음) | 12-08 | 토큰 철회(TN3194) |
| 5 | **Google Cloud Console**: OAuth 동의 화면(앱 이름·로고·처리방침 URL·승인 도메인 `mongmang.ink`, 범위 `openid`만) → 게시. 클라이언트 iOS(번들 id)·Android(패키지 + **EAS 서명 키와 Play 앱 서명 키 SHA-1 둘 다**)·웹 | 12-08 | 민감 범위가 없어 Google 검증은 필요 없을 것으로 본다 [확인 필요] |
| 6 | 12-05 법률 검토에 '소셜 연결(6-2 초안)' 더하기 | 12-05 | 7·8절 판단 |
| 7 | (1.x, 지금 아님) Kakao Developers 앱 등록 | 한국 출시 판단 때 | — |

---

## 8. 블라인드 피드백 요약
`feedback.md` 참조(작성하지 않은 서브에이전트 1명, 타깃 유저 역할, 안 이름과 추천 여부는 숨김).
- 가장 좋은 안은 **(다)**다. "일곱 밤 뒤라 정이 들었다", "'폰 바꾸거나 앱 지워도'가 딱 내 두려움"이라고 했다. 가장 싫은 안은 **(가)**다. "몽망이를 보기도 전에 나이를 묻는다", "첫인상이 '가입 앱'"이라고 했다. (나)는 "'간직하기'를 사진 저장인 줄 알았다가 낚인 기분"이었다.
- 가장 민감한 질문은 "내가 쓴 한 마디가 서버로 가나"였다. 그래서 R3에 **'밤마다 쓴 한 마디의 글자는 올리지 않아요'**를 굵게 넣었다(처리방침 3-5와 같은 사실).
- 로그인으로 얻고 싶은 것의 순위는 이어 키우기 > 알림(로그인 없이) > 호·도장 > 친구 꿈 교환("일기라 부담")이다. 1절 판정(P1 핵심, P3 1.x)과 같다.
- 반영: R3 문구 4곳, R1 보조 줄, 호 정하기를 R4에서 C1으로 옮김, 피커 빈 칸. 반영 전 캡처는 `mock/v0/`에 있다.

---

## 9. 남은 질문과 위험
- [확인 필요] Apple: 범위 없이 요청했을 때 ID 토큰의 email 클레임 유무, Android 브라우저 Apple 로그인의 `form_post` 리다이렉트 처리(앱 링크로 돌아오기).
- [확인 필요] Google: 브라우저 OAuth와 Credential Manager 중 어느 쪽인가(12-01 스파이크).
- [QA-3] 웹 삭제와 2년 정리에서 Apple 철회를 못 하는 경우를 심사가 받아들이는가. 아니면 Apple refresh token을 암호화해 보관할 것인가.
- [PM] 판정 기간 R1 카드 노출 50:50 분할을 할 것인가(5-5).
- 위험: 같은 Apple·Google 계정으로 **두 번째 몽망이**를 지키려 하면 409가 난다(1.0은 계정당 하나). 이때 '바꿔 지키기'(옛 아이 열쇠를 옮김)는 1.x로 두고, 1.0은 안내만 한다.
- 위험: 7번째 아침까지 오는 유저만 R1을 보므로 1~6일차에 기기를 바꾼 유저는 연결할 기회가 공방 노트뿐이다. 그 기간에 잃는 것은 6밤 이하라는 점을 받아들인다.

## 출처
1. Phiture, *User accounts: pros and cons for mobile growth* — https://phiture.com/mobilegrowthstack/user-accounts-pros-and-cons-for-mobile-growth-42847cb10f4c/ (업계 관찰치, 원 실험 미공개)
2. Apple HIG, Managing accounts — https://developer.apple.com/design/human-interface-guidelines/managing-accounts · Sign in with Apple — https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple
3. First Round Review, *The tenets of A/B testing from Duolingo's master growth hacker* — https://review.firstround.com/the-tenets-of-a-b-testing-from-duolingos-master-growth-hacker/
4. App Store Review Guidelines 4.8·5.1.1(v) — https://developer.apple.com/app-store/review/guidelines/ (11-25 원문 확인)
5. Apple TN3194, Handling account deletions and revoking tokens for Sign in with Apple — https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple
6. Google Play, Understanding app account deletion requirements — https://support.google.com/googleplay/android-developer/answer/13327111
7. Supabase, Identity Linking·Anonymous Sign-Ins — https://supabase.com/docs/guides/auth/auth-identity-linking · https://supabase.com/docs/guides/auth/auth-anonymous
8. Supabase, Monthly Active Users 사용량 — https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users
9. 참고(맥락이 다름): Baymard, 결제 단계 계정 강제 이탈 — https://baymard.com/learn/reduce-cart-abandonment
