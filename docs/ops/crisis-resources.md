# 나라별 위기 연락처 정본 (v1 · 데이터 2026-11-25.2, 확인 2026-11-25 · 다음 확인 2027-02-25)

- 앱 데이터: `docs/ops/crisis-resources.v1.json`(V5c가 core로 옮김), 구조: `docs/ops/crisis-resources.schema.json`(JSON Schema 2020-12 — 나라마다 긴급 1개·첫 줄 1개, 링크 없는 채널은 안내 문장 필수, 모든 키 항상 존재). **이 문서와 JSON이 정본**이다. `heart-grain-48.md` 8-6 표와 `crisis-disclosure.md` 3절 견본은 이 정본을 따른다(다르면 이 정본이 맞다).
- 확인 방법: 2026-11-25 QA-3가 공식 기관 페이지를 직접 열어 문구를 확인했다. 열지 못했거나 공식 문구가 없는 값은 **넣지 않고 [확인 필요]**로 둔다. JSON에서는 `null` + `unverified` 목록이다.
- 나라 판정: **기기 지역 설정의 지역 코드만** 쓴다. 위치(GPS)·IP·SIM·스토어 국가는 읽지 않는다. 코드가 없거나 표에 없으면 '그 밖의 나라'를 보여 준다. 이때 긴급 줄은 번호 없이 '지금 있는 곳의 긴급 번호'로 쓴다.

## 1. 한국 (KR)

| 자원 | 채널(보여 줄 순서) | 운영 시간 | 무료 | 언어 | 공식 출처 |
|---|---|---|---|---|---|
| **긴급** 112(경찰)·119(소방·구급) | 전화 | [확인 필요](공식 1차 문구 없음, 표시 안 함) | [확인 필요] | 한국어(다국어는 '긴급신고 바로앱' 기능 — 앱 안내엔 넣지 않음) | [행안부 긴급신고 통합서비스](https://www.mois.go.kr/frt/sub/a06/b10/emergencycall/screen.do) |
| **자살예방상담전화 109** (첫 줄) | 문자 109(마들랜 문자 상담) · 카카오톡 '마들랜' 검색 · '마들랜' 앱 · 전화 109 | 365일 24시간(전화·마들랜 모두) | 전화: **무료**(수신자부담, 2026-10-01부터 요금 미납 휴대전화도 연결) · 109로 보내는 문자: **무료** · 앱·카카오톡: **데이터 요금이 붙을 수 있음** | 한국어 [다른 언어 확인 필요] | [복지부 보도자료(109 수신자부담·24시간)](https://mohw.go.kr/board.es?act=view&bid=0027&list_no=1491820&mid=a10503010100&nPage=1&tag=) · [복지로 마들랜 안내](https://www.bokjiro.go.kr/ssis-tbu/cms/pc/news/promotion/1307179_1118.html) |
| **청소년상담 1388** (9~24세·보호자) | 문자: 수신자 번호 **1388** · 카카오톡 '청소년상담1388' 채널 · 전화: 유선 1388, 휴대전화 **지역번호+1388** | 365일 24시간 | **무료** | 한국어 | [복지로 1388 안내](https://www.bokjiro.go.kr/ssis-tbu/cms/pc/news/promotion/1307645_1118.html) |

- 1388 문자 번호: 공식 안내는 `1388`이다(`#1388`은 공식 페이지에 없음). 실기기 발송 확인은 그대로 남긴다.
- 휴대전화 1388 전화는 지역번호가 필요해 `tel:` 링크를 만들지 않는다. 안내 문장만 보여 준다.
- [확인 필요] '이름을 말하지 않아도 된다'(익명)는 109·마들랜·1388 공식 페이지에서 직접 확인하지 못했다. 확인 전에는 문구에 넣지 않는다(4절 규칙).
- [확인 필요] 카카오톡 채널 링크 URL(마들랜·청소년상담1388). 공식 링크를 확인하지 못해 **[카카오톡] 버튼은 만들지 않고**, '카카오톡에서 ○○ 검색(데이터 요금이 붙을 수 있어요)' 안내 문장만 쓴다(JSON `url: null` + `displayHint`).
- 무료 절: KR은 카카오톡·앱이 데이터 요금 조건부라 '무료이고'가 아니라 **'전화는 무료이고'**로 쓴다(heart-grain 8-4-1).
- 참고(응답률): 109 응답률 2023년 55.7%, 2024년 56.7%, 2025년 상반기 49.0%(주간경향 2025-11-03, 복지부 자료 인용). 문구는 '지금 연결'을 약속하지 않고, '전화가 연결되지 않으면 문자나 카카오톡으로도' 대안 줄을 둔다.

## 2. 캐나다 (CA, 퀘벡 포함)

| 자원 | 채널 | 운영 시간 | 무료 | 언어 | 공식 출처 |
|---|---|---|---|---|---|
| **긴급** 911 | 전화 | — | [확인 필요] | — | [988.ca](https://988.ca/) "If your safety is at risk, call 9-1-1 right away." |
| **9-8-8 Suicide Crisis Helpline** (첫 줄) | 문자 988 · 전화 988 | 24/7/365 | 전화: **무료**(어디서든) · 문자: **무제한 문자 요금제면 무료**, 한도 초과 시 통신사 요금 가능 | 영어·프랑스어(다른 언어는 통역 가능할 수 있음) | [988.ca](https://988.ca/) · [What to expect](https://988.ca/get-help/what-to-expect) · [Terms](https://988.ca/terms) |
| **퀘벡** 1 866 APPELLE (1-866-277-3553) | 문자 **535353** · 채팅 suicide.ca · 전화 | 24/7 | 전화 'free and confidential' · 문자·채팅 'gratuit 24/7' | 누리집 불·영 [상담 언어 확인 필요] | [suicide.ca 24/7 help line](https://suicide.ca/en/lets-talk-about-suicide/learn-about-suicide/24-7-help-line) · [suicide.ca](https://suicide.ca/) |
| **Kids Help Phone** (어린이·10대·청년) | 문자 **CONNECT** → **686868** · 전화 1-800-668-6868 | 24/7 | **무료**(/text "The texting service is free") | 문자 영·불, 전화 여러 언어 | [kidshelpphone.ca](https://kidshelpphone.ca/) · [/text](https://kidshelpphone.ca/text) |

- **퀘벡 처리**: 기기 지역 설정은 주(州)를 알려 주지 않는다. 그래서 캐나다는 **988을 첫 줄**로 둔다. 988.ca/terms는 "In Quebec, you will be connected to the existing crisis service for your province or territory"라고 하고(988.ca 첫 화면에는 이 문구가 없다), suicide.ca도 988이 퀘벡 서비스로 넘겨진다고 쓴다. 퀘벡 번호(1 866 APPELLE·535353)는 목록에 **'Québec' 라벨로 한 줄 더** 둔다. **전화·문자·채팅 모두 퀘벡 안에서만** 된다(suicide.ca "Suicide.ca's phone, online chat, and text messaging services are available in Quebec only."). 앱 언어가 영·한뿐이므로 문구는 그대로 두고, 퀘벡 자원 이름만 프랑스어 표기를 함께 쓴다.
- 988 익명: 공식 문구는 "It is up to you how much or how little personal information you share with us."다. '이름을 말하지 않아도 돼요'와 뜻이 맞으므로 CA는 익명 절을 쓸 수 있다(JSON `anonymousOk: true`, 근거 문구는 `anonymousNote`). 단 같은 페이지에 통화 녹음·문자 기록 가능 안내가 있어 '비밀' 류 약속은 계속 금지.
- [확인 필요] Kids Help Phone 프랑스어 문자 키워드(PARLER 등)는 공식 페이지에서 확인 못 함 → 넣지 않음.

## 3. 뉴질랜드 (NZ)

| 자원 | 채널 | 운영 시간 | 무료 | 언어 | 공식 출처 |
|---|---|---|---|---|---|
| **긴급 111** | 전화(휴대전화·유선) | — | [확인 필요](NZ Police 페이지에 '111 무료'로 색인돼 있으나 직접 열기 실패 — 다음 확인 때 police.govt.nz에서 채움) | — | [1737.org.nz](https://1737.org.nz/) "If someone is in immediate danger of harming themselves or others, please call 111." |
| **1737 Need to talk?** (첫 줄) | 문자 1737 · 전화 1737 | 24/7 | **무료** ("Free call or text 1737 any time") | [확인 필요] | [1737.org.nz](https://1737.org.nz/) · [Mental Health Foundation](https://mentalhealth.org.nz/helplines) |
| **Suicide Crisis Helpline** 0508 828 865 | **전화만** | [확인 필요] — Mental Health Foundation은 '7am until midnight', Find A Helpline은 24시간으로 서로 다름 | **무료** ("A free, nationwide service") | [확인 필요] | [Lifeline](https://www.lifeline.org.nz/services/suicide-crisis-helpline) |
| **Youthline** (청소년) | 문자 **234** · 웹채팅 · 전화 0800 376 633 | 전화 24/7 (문자·채팅 시간 [확인 필요]) | **무료** ("Free call", "Free text 234") | [확인 필요] | [youthline.co.nz](https://www.youthline.co.nz/get-help/) |

- 0508 828 865는 공식 페이지에 문자 안내가 없다 → 문자 버튼 없음. 운영 시간이 확인될 때까지 시간을 보여 주지 않고, '지금 바로' 문장의 근거로 쓰지 않는다(첫 줄은 24/7인 1737).
- [확인 필요] 1737 익명 여부: 공식 FAQ는 'confidential'만 쓰고 'anonymous'는 쓰지 않는다 → 익명 절 넣지 않음.

## 4. 필리핀 (PH)

| 자원 | 채널 | 운영 시간 | 무료 | 언어 | 공식 출처 |
|---|---|---|---|---|---|
| **긴급 911** | 전화 | — | [확인 필요] | — | [PH Emergency Hotlines(e.gov.ph)](https://ehotlines.e.gov.ph/) "National Emergency Hotline 911" |
| **NCMH Crisis Hotline** (첫 줄) | **전화만**: 휴대전화 **0917-899-8727**(Globe/TM) · **1553**(전국, Nationwide) | 24/7 | [확인 필요] — Find A Helpline은 'free'로 등록했지만 공식 확인 못 함. PIA 기사에 Smart/TNT의 1800-1888-1553 일회 요금 언급이 있어 '무료'를 쓰지 않음 | [확인 필요] | [ehotlines.e.gov.ph](https://ehotlines.e.gov.ph/)(0917-899-8727) · [Find A Helpline NCMH](https://findahelpline.com/organizations/ncmh-crisis-hotline) · [Find A Helpline PH](https://findahelpline.com/countries/ph/topics/suicidal-thoughts)(1553, 'support over the phone') |

- **문자·채팅 없음.** 필리핀 문구에서 '문자'·'text'와 [Text] 버튼을 뺀다.
- [확인 필요] **0919-057-1553(Smart/TNT)**: 검색 색인상 **NCMH 공식 연락처 페이지**(ncmh.gov.ph/contact-us, "SMART/TNT: 0919-057-1553")와 **DOH 지역청 페이지**에 실려 있고, 언론(Manila Bulletin 2026-01-03, GMA 2026-05-12)도 같다. 다만 이번에 공식 페이지 원문을 직접 열지 못했다(ncmh.gov.ph·doh.gov.ph·ro2.doh.gov.ph·pia.gov.ph 모두 자동 요청에 403, 캐시·보관본 열람도 이 작업 환경에서 허용되지 않음). 그래서 JSON에는 아직 넣지 않았다(`pendingCheck`). **오너·QA 할 일(최우선): 브라우저로 ncmh.gov.ph/contact-us를 직접 열어 0919 번호와 1553 표기를 확인한 뒤, 정본·JSON·crisis-disclosure 3절 견본에 같은 날 넣는다.** 지금 정본은 Smart/TNT 사용자(필리핀 이동통신 약 절반)에게 Globe 번호와 1553만 준다.
- 1553 라벨: '유선'은 근거가 없어 지웠다. NCMH 연락처 페이지 색인 표기 "Nationwide: 1553 or 1800-1888-1553"대로 '전국'으로 쓴다(1800-1888-1553은 직접 확인 전이라 넣지 않음).
- [확인 필요] 'free'·익명·언어. 그래서 PH 본문에는 '무료'·'이름' 절이 모두 빠진다.
- 참고: e.gov.ph 표에는 PNP 117 등 통합 전 번호가 남아 있어 표 전체가 최신은 아니다. 911 줄과 NCMH 0917 줄만 쓴다.

## 5. 그 밖의 나라 (`_default`, 판정 불확실 포함)

| 자원 | 내용 | 공식 출처 |
|---|---|---|
| 긴급 | 번호를 쓰지 않는다. '지금 있는 곳의 긴급 번호' / 'your local emergency number' | — |
| **Find A Helpline** (첫 줄) | findahelpline.com — ThroughLine가 운영하는 공공 서비스, "We partner with verified helplines in 175+ countries." 나라를 고르면 전화·문자·채팅 상담처가 나온다 | [findahelpline.com](https://findahelpline.com/) |

- 지역 코드가 표에 있는 나라라도, 연락처 화면 맨 아래에 '다른 나라에 있다면: findahelpline.com' 한 줄을 늘 둔다(여행·이주로 지역 설정이 실제 위치와 다를 수 있다).

## 6. 문구 조합에 쓰는 값 (앱 규칙 요약 — 문장 틀은 `heart-grain-48.md` 8-4-1)

| 조합 값 | KR | CA | NZ | PH | 그 밖 |
|---|---|---|---|---|---|
| `{EMERGENCY}` | 112나 119 / 112 or 119 | 911 | 111 | 911 | 지금 있는 곳의 긴급 번호 / your local emergency number |
| 첫 줄 자원 | 109 | 988 | 1737 | NCMH | Find A Helpline |
| {지금 줄} | '하루 중 언제든 연락할 수 있는 곳'(24/7) | 같음 | 같음 | 같음 | '이야기 나눌 곳을 찾아볼 수 있어요'(디렉터리) |
| 무료 절 | '전화는 무료'(카카오톡·앱 데이터 요금) | '전화는 무료'(문자는 요금제 조건부) | '무료' | 없음 [확인 필요] | (디렉터리 문장) |
| 이름 절(익명) | 없음 [확인 필요] | 있음 | 없음 [확인 필요] | 없음 [확인 필요] | (디렉터리 문장) |
| 채널 절 | 전화·문자·카카오톡 | 전화·문자 | 전화·문자 | 전화 | (디렉터리 문장) |
| {대안 줄} | 전화가 안 되면 문자·카카오톡 | 전화가 안 되면 문자 | 전화가 안 되면 문자 | 한 번호가 안 되면 다른 번호 | 없음 |
| strong 쪽지 버튼 | [문자] [전화] + 카카오톡 검색 안내 문장 | [Text] [Call] | [Text] [Call] | [Call 0917…] [Call 1553] | [Find a helpline] |

## 7. 이번 확인에서 바뀐 것 (8-6 초기값 대비)

- PH 0919-057-1553: NCMH 공식 연락처 페이지 색인에 있으나 원문 직접 열람 실패 → 데이터에서 제외, 브라우저 확인을 오너·QA 할 일로(위 4절). 1553 라벨 '유선' → '전국'.
- NZ 0508 828 865 '7am–midnight': 출처끼리 달라 시간 표시 제외.
- CA 988 문자: '무료'가 아니라 '무제한 문자 요금제면 무료' → 캐나다 문구는 '전화는 무료'.
- 퀘벡 1 866 APPELLE·535353: 1차 확인됨 → 'Québec' 라벨로 추가.
- KR 1388 문자 번호: 공식 안내는 `1388`.
- NZ Youthline 문자 234: 1차 확인됨.
- 익명('이름을 말하지 않아도'): CA만 공식 문구로 확인. 나머지는 [확인 필요].
- (데이터 2026-11-25.2, 독립 확인 `docs/team/reviews/2026-11-25-crisis-resources-review.md` 반영) 퀘벡 이용 지역을 '전화·문자·채팅 모두 퀘벡 안'으로 고침 · KHP 무료 인용문을 /text 실제 문구로 바꿈 · 988 퀘벡 연결 인용 출처를 988.ca/terms로 고침 · KR 긴급의 2016년 보도자료 출처를 빼고 시간은 [확인 필요]로(긴급 자원 시간은 모두 null) · 카카오톡 버튼 제거(안내 문장) · 모든 자원에 같은 키를 두고 스키마 파일 추가 · 109 응답률을 반영해 '지금 이야기할 수 있는' → '하루 중 언제든 연락할 수 있는' + 대안 줄.
