# 위기 연락처 정본 독립 확인 (2026-11-25)

- 대상: `docs/ops/crisis-resources.v1.json`·`crisis-resources.md`(커밋 3aabccf), `heart-grain-48.md` 8-4·8-4-1·8-6, `crisis-disclosure.md` 3·6절
- 확인자: 독립 검증자(작성 불참). 작성자가 단 출처를 그대로 믿지 않고, 2026-11-25에 공식 페이지를 직접 다시 열거나 따로 찾아 대조했다. 고치지 않았고 커밋하지 않았다.
- **판정: 조건부 통과.** JSON에 들어간 번호는 **틀린 것이 없다**(불일치 0). 다만 ① 필리핀 Smart/TNT 사용자를 덮는 번호가 비어 있고 1553 라벨에 근거가 약하다. ② 조합 규칙에 빈 문장·과장 문장이 나올 틈이 4곳 있다. ③ `crisis-disclosure.md` 3절 견본과 `heart-grain` 8-6 표는 정본과 어긋나고, 그중 **ko 견본의 '이름을 말하지 않아도'와 en 견본의 0919 번호·'free'·'text'는 지금 그대로 쓰면 사실이 아닌 약속**이 된다. 출시 전에 ②③을 고쳐야 한다.

## 1. 값 하나씩 확인

판정: **일치** = 공식 페이지에서 직접 같은 값을 봤다 · **불일치** = 다르다(정답·출처) · **확인 불가** = 공식 페이지를 열지 못했거나 값이 없다. 작성자가 `null`로 둔 값은 '빈칸이 맞는지'를 판정했다.

### 1-1. 한국 (KR)

| 항목 | JSON 값 | 판정 | 근거(직접 연 페이지) |
|---|---|---|---|
| 긴급 112·119 | 112(경찰)·119(소방·구급) | 일치 | 행안부 긴급신고 통합서비스 "긴급상황 112(각종범죄)·119(각종재난)" |
| 긴급 24/7 | "24/7" | 확인 불가(값은 상식상 맞음) | 행안부 페이지에 24시간 문구 없음. 두 번째 출처 korea.kr 156163473은 **2016-10-26 국민안전처 보도자료**(통합서비스 개시)로, 24시간 근거로는 약하다 → 출처 교체 권고 |
| 긴급 무료 | null | 빈칸 맞음 | 공식 1차 페이지에 112·119 무료 문구 없음(언론만 있음) |
| 109 번호 | 109 | 일치 | 복지부 보도자료(2026-09-08) "365일 24시간 운영되는 자살예방용 상담전화", 복지로 마들랜 안내 |
| 109 통합 이력 | — | 일치(변경 없음) | korea.kr 정책뉴스(2023-10-27): 1393·1577-0199·1588-9191·1388 등 8개 번호를 109로 묶어 2024-01 개통. 2025~2026년에 109 번호 자체가 바뀐 공식 발표는 찾지 못함 |
| 109 전화 무료 | call: true | 일치 | 복지부 "발신자에게 요금이 부과되지 않는 수신자부담 전화" |
| 109 문자(마들랜) | text 109 | 일치 | 복지로 "자살예방 상담전화(109)로 문자메시지를 발송하면 상담원과 연결" |
| 109 문자 무료 | text: true | 일치 | 복지로 "문자메세지 발신 요금은 무료" |
| 카카오톡·앱 | 마들랜 검색·앱 / conditional | 일치 | 복지로 "카카오톡 검색에서 '마들랜'", 앱 내려받아 회원가입, "데이터 이용에 따른 요금 발생 가능" |
| 109 시간 | 24/7 | 일치 | 복지부·복지로 모두 365일 24시간 |
| 109 익명 | null | 빈칸 맞음 | 두 페이지 모두 익명 문구 없음 |
| **새 사실(참고)** | — | — | 복지부 2026-09-08 보도자료: **2026-10-01부터 요금 미납으로 휴대전화 발신이 막혀도 109가 연결**(긴급통신용 지정 추진, 잠금화면 바로 연결 예정). 번호 변경은 아니지만 `crisis-resources.md`에 '요금 미납이어도 연결'로 적을 수 있다 |
| 1388 대상 | 9~24세·보호자 | 일치 | 복지로 "9~24세 청소년 또는 청소년 자녀를 둔 부모 및 보호자" |
| 1388 전화 | 유선 1388, 휴대전화 지역번호+1388, dial null | 일치 | 복지로 같은 문구 |
| 1388 문자 | 1388 | 일치 | 복지로 "1388로 문자" (#1388 없음). 성평등가족부 지표(index.go.kr, 2026-02 갱신)도 문자(1388) 계속 운영 |
| 1388 카카오톡 | '청소년상담1388' 채널 | 일치 | 복지로·index.go.kr |
| 1388 시간·무료 | 24/7·무료 | 일치 | 복지로 "365일 24시간 언제든 무료로 이용 가능" |
| 1388 익명 | null | 빈칸 맞음 | 공식 문구 없음 |

### 1-2. 캐나다 (CA, 퀘벡 포함)

| 항목 | JSON 값 | 판정 | 근거 |
|---|---|---|---|
| 긴급 911 | 911 | 일치 | 988.ca "If your safety is at risk, call 9-1-1 right away." |
| 988 전화·문자 | call/text 988 | 일치 | 988.ca "Call 9-8-8", "Text 9-8-8" |
| 988 시간 | 24/7 | 일치 | 988.ca "24/7/365" |
| 988 전화 무료 | true | 일치 | What to expect "Calling 9-8-8 is toll-free … free wherever you are in Canada" |
| 988 문자 무료 | conditional | 일치 | "Texting 9-8-8 is free if you have an unlimited texts plan", 초과 시 "may be charged by your service provider" |
| 988 언어 | en·fr, 통역 가능할 수 있음 | 일치 | "available 24/7 in English and French", 다른 언어는 "may be available by phone, via an interpreter" |
| 988 익명 | true + anonymousNote | 일치(문구) | "It is up to you how much or how little personal information you share with us." 단 같은 페이지에 "We may monitor or record your call or keep a transcript of your text" — 익명 절은 쓸 수 있으나 '비밀' 류 약속은 계속 금지 |
| 988 → 퀘벡 연결 | regionalRouting QC | 일치 | suicide.ca "the call or text will be redirected to Quebec services, namely 1-866-APPELLE (277-3553) or 53 53 53". 988.ca 이용약관에도 "In Quebec, you will be connected to the existing crisis service" (988.ca **첫 화면에는 없음** — `crisis-resources.md` 2절의 인용 출처를 988.ca/terms로 고칠 것) |
| 퀘벡 전화 | 1-866-277-3553 / 1 866 APPELLE | 일치 | suicide.ca "1 866 APPELLE (277-3553)" |
| 퀘벡 문자 | 535353 | 일치 | suicide.ca "please text 535353" |
| 퀘벡 시간·무료 | 24/7·무료 | 일치 | "available 24 hours a day, 7 days a week", "free and confidential" |
| 퀘벡 이용 지역 | `availability` "문자·채팅만 퀘벡 안" | **불일치(경미)** | 정답: suicide.ca "Suicide.ca's **phone**, online chat, and text messaging services are available in Quebec only." 전화도 퀘벡 전용 → `availability` 문구를 '전화·문자·채팅 모두 퀘벡 안에서만'으로 |
| 퀘벡 상담 언어 | null | 빈칸 맞음 | 공식 페이지에 상담 언어 없음 |
| KHP 전화 | 1-800-668-6868 | 일치 | kidshelpphone.ca |
| KHP 문자 | CONNECT → 686868 | 일치 | /text "text CONNECT to 686868" |
| KHP 시간·무료·언어 | 24/7·무료·문자 영불/전화 다국어 | 일치 | /text "available across Canada 24/7", "The texting service is free", 문자 영·불, 전화 "multiple languages" |
| KHP `free.note` 인용 | "'free, multilingual and confidential support'" | **불일치(인용문)** | 홈에 이 정확한 문구 없음(about-us는 미확인). 값(무료)은 맞으므로 인용문만 /text의 "The texting service is free"로 바꿀 것 |
| KHP 프랑스어 키워드 | 없음 | 빈칸 맞음 | 공식 페이지에 없음 |

### 1-3. 뉴질랜드 (NZ)

| 항목 | JSON 값 | 판정 | 근거 |
|---|---|---|---|
| 긴급 111 | 111 | 일치 | 1737.org.nz "please call 111" |
| 111 무료 | null | 빈칸 맞음(채울 수 있음) | NZ Police 페이지 검색 색인 "111 calls are free … even if the phone is out of credit". 직접 열기는 실패(404 경로 변경) → 다음 확인 때 police.govt.nz/call-111을 열어 `free: true`로 채울 수 있다 |
| 1737 전화·문자 | call/text 1737 | 일치 | "Call or text 1737" |
| 1737 시간·무료 | 24/7·무료 | 일치 | "Free, confidential support – 24/7", MHF "Free call or text 1737 any time" |
| 1737 언어·익명 | null | 빈칸 맞음 | FAQ에 언어·익명 없음('confidential'만) |
| 0508 828 865 | 전화만 | 일치 | Lifeline "0508 828 865"(0508 TAUTOKO), 문자 안내 없음 |
| 0508 시간 | null | 빈칸 맞음 | Lifeline "available 7 days a week"(시간 없음) vs MHF "7am - midnight" — 출처끼리 다름 확인 |
| 0508 무료 | true | 일치 | "A free, nationwide service" |
| Youthline 전화·문자·채팅 | 0800 376 633 · 234 · 웹채팅 | 일치 | youthline.co.nz/get-help "Free call", "Free text 234", Webchat |
| Youthline 시간 | 전화 24/7, 문자·채팅 미확인 | 일치 | 공식 페이지엔 helpline만 24/7. MHF는 Youthline 전체를 24/7로 적음(2차) |
| 참고 | — | — | MHF에 Youthline WhatsApp 09 886 56 96, Lifeline 0800 543 354(7am–midnight)·문자 4357도 있음. 정본 누락은 아니고 선택 사항 |

### 1-4. 필리핀 (PH)

| 항목 | JSON 값 | 판정 | 근거 |
|---|---|---|---|
| 긴급 911 | 911 | 일치 | ehotlines.e.gov.ph "National Emergency Hotline 911" |
| NCMH 0917-899-8727 | Globe/TM | 일치 | ehotlines.e.gov.ph "0917-899-8727 (USAP)" |
| NCMH 1553 | **'유선(Landline)' 라벨** | **확인 불가 · 라벨 근거 약함** | ehotlines에는 1553이 없다. NCMH 공식 연락처 페이지의 검색 색인은 "**Nationwide: 1553 or 1800-1888-1553**"로 적고 '유선'이라 하지 않는다. GMA(2026-05-12)도 "1553 or 1800-1888-1553". '유선'은 Find A Helpline에서 온 라벨로 보인다 → 라벨을 빼거나('전국') 직접 확인 전까지 '유선' 단정 금지 |
| NCMH 0919-057-1553 (Smart/TNT) | 제외 | **확인 불가 — 그러나 공식 페이지 색인에 있음** | ncmh.gov.ph/contact-us·ro2.doh.gov.ph·pia.gov.ph 모두 이번에도 403. 다만 검색 색인상 **NCMH 공식 연락처 페이지에 "SMART/TNT: 0919-057-1553 · GLOBE/TM: 0917-899-8727 & 0966-351-4518"**, DOH 지역청 페이지도 0919를 Smart/TNT로 적는다. 언론(MB 2026-01-03, GMA 2026-05-12)도 같다. 즉 '언론에만 있다'는 정본 설명은 **틀렸다**. 열람 전 제외는 규칙상 맞지만, 현재 정본은 **Smart/TNT 사용자(필리핀 이동통신 약 절반)에게 다른 통신망 번호만** 준다 → 최우선 확인 대상(브라우저로 ncmh.gov.ph/contact-us 직접 열기) |
| NCMH 시간 | 24/7 | 일치(2차) | Find A Helpline "24/7, free … support over the phone". 공식 1차는 403 |
| NCMH 무료 | call: null | 빈칸 맞음 | 1차 미확인. 참고: PIA 기사에는 Smart/TNT가 1800-1888-1553으로 걸면 "one-time charge of P7.50" 문구가 있다 → '무료'를 넣지 않은 판단이 맞다 |
| NCMH 문자 | 없음 | 일치 | Find A Helpline 채널은 전화뿐 |
| 참고 | — | — | e.gov.ph 표에는 "989-8727 (USAP)", "(02) 8531-9001 to 10 local 201"도 있다. DOH CARO 게시물엔 Smart/Sun용 0908-639-2672(구번호) — 출처마다 Smart 번호가 달라 1차 확인이 꼭 필요하다 |

### 1-5. 그 밖 (`_default`)

| 항목 | 판정 | 근거 |
|---|---|---|
| Find A Helpline · ThroughLine 운영 | 일치 | "Find A Helpline is powered by ThroughLine" |
| "175+ countries" | 일치 | "over 175 countries", "verified helplines" |
| 긴급 '지금 있는 곳의 긴급 번호' | 해당 없음(번호 없음, 안전) | — |

### 1-6. 범위 밖이지만 알릴 것

- **미국(US)**: 8-6 표에는 '미국(들어오면) 988·911'이 있으나 JSON에는 US가 없다 → US 기기는 `_default`로 떨어진다(안전하지만 988을 놓친다). 미국 출시가 계획에 있으면 JSON에 US를 넣고 988lifeline.org로 확인할 것.
- **109 응답률**: 주간경향(2025-11-03, 복지부 자료 인용) 2023년 55.7%, 2024년 56.7%, **2025년 상반기 49.0%**. '지금 이야기할 수 있는 곳이 있어요'가 실제로는 절반가량 연결 실패할 수 있다 → 3절 권고 참조.

## 2. JSON 구조 — 빈 문장·대체의 안전성

| # | 위치 | 문제 | 결과 | 권고 |
|---|---|---|---|---|
| S1 | 8-4-1 {채널 절} en '전화만' = "and you can call **any time of day**." | 채널 절에 **시간 주장**이 섞였다. ko('전화로 이야기할 수 있어요')에는 없다. 지금은 PH(24/7)만 해당이라 맞지만, 첫 줄이 전화만이고 `hours = null`인 자원이 되면 24시간이라고 거짓말한다 | 잠재 거짓 | en을 "and you can call."로 바꾸고 시간은 {NOW_LINE}만 맡게 한다. 또는 조건에 `hours = "24/7"`을 넣는다 |
| S2 | `_default` 본문 | 8-4-1 절 규칙으로는 `_default` 본문이 나오지 않는다(무료·이름 null, 채널 = web chat → 규칙상 '…or chat'). 예시 표의 "You can find someone to talk to near you at findahelpline.com."은 **규칙에 없는 특수 문장** | 구현이 규칙만 따르면 "You can call, text or chat." 같은 틀린 문장, 또는 빈 본문 | 8-4-1 표에 `kind = directory` 행을 추가: ko "findahelpline.com에서 가까운 곳을 찾아볼 수 있어요." / en "You can find someone to talk to near you at findahelpline.com." |
| S3 | 긴급 줄 ko 조사 | 틀은 "{긴급}**에** 바로 연락할 수 있어요"인데 예시(그 밖 ko)는 "긴급 번호**로**". 시험 기대값과 틀이 서로 다르다 | 시험이 깨지거나, 한쪽이 틀린 채 통과 | 틀과 예시를 '에'로 통일(“지금 있는 곳의 긴급 번호에 바로 연락할 수 있어요”도 자연스럽다) |
| S4 | KR {무료 절} | 조건이 `free.call`·`free.text`만 본다. KR 109는 `chat = "conditional"`(카카오톡·앱 데이터 요금)인데 결과는 "무료이고, 전화나 문자, **카카오톡으로도**…" → 카카오톡도 무료로 읽힌다 | 경미한 과장 | 채팅 채널이 있고 `free.chat ≠ true`면 ko "전화와 문자는 무료이고," / en "Calling and texting are free," |
| S5 | strong 쪽지 버튼 KR [카카오톡] | `crisis-resources.md` 6절 표는 [문자][카카오톡][전화] 버튼을 약속하지만 카카오톡 `url = null`. `fieldNotes`의 `dial = null → 링크 없음` 규칙은 chat 채널(dial 키 자체가 없음)에 적용되는지 불분명 | 눌러도 아무 일 없는 버튼, 또는 버튼 누락 | 규칙을 '링크(dial·url)가 없으면 버튼 대신 displayHint 문장'으로 일반화하고 6절 표를 [문자][전화] + 안내 문장으로 고친다 |
| S6 | `free` 형 | `fieldNotes.free`는 true/'conditional'/null이라 적지만 실제 값은 객체({call,text,chat,note})와 null이 섞여 있다. `_default` 긴급에는 `hours`·`free` 키 자체가 없다(undefined) | 구현이 `free === true`로 보면 모든 무료 절이 빠지고, `free.call`로 보면 null에서 터진다 | fieldNotes를 실제 형으로 고치고 키를 항상 두게(null) 한다. 6절 '스키마 검사'에 쓸 **스키마 파일이 아직 없다** → JSON Schema 추가 필요 |
| S7 | 퀘벡 `availability` | 1-2 표 참조(전화도 퀘벡 전용) | 사람용 문서 오류 | 문구 수정 |
| S8 | 나라 판정 실패 → `_default` | 판정 실패·미등록 지역은 번호 없는 긴급 문장 + Find A Helpline. **안전함.** 남는 위험은 '지역 설정 = KR인데 실제로 해외'일 때 112·119가 나오는 것. 연락처 화면 맨 아래 'findahelpline.com' 상시 줄로 덜어진다 | 수용 가능 | strong 쪽지에도 "다른 나라에 있다면 findahelpline.com" 한 줄(작게)을 두는 것을 검토 |
| S9 | `primary` 없는 나라 | 지금은 모든 나라에 primary 1개. 원격 팩에서 빠지면 본문을 못 만든다 | 원격 팩 오류 시 빈 본문 | 스키마에 '나라마다 primary 정확히 1개·emergency 정확히 1개'를 검사로 넣는다 |

## 3. 문장 틀과 안전 메시지 지침

기준: WHO(언론·온라인 자살 예방 권고), Samaritans Online Safety Guidelines(도움처 안내·과장 금지·비밀 보장 약속 금지), 한국 자살보도 권고기준 3.0(상담 번호 109·마들랜 안내, 희망적 표현).

| 문장 | 판정 | 메모 |
|---|---|---|
| ko "마음이 무거운 날엔 사람과 이야기해도 괜찮아요." / en "On hard days, it can help to talk with someone." | 맞음 | 낙인·진단어 없음, 도움 요청을 정상화 |
| ko "힘든 날을 혼자 견디지 않아도 돼요." / en "You don't have to get through hard days alone." | 맞음 | 희망·연결 메시지 |
| {NOW_LINE} ko "지금 이야기할 수 있는 곳이 있어요." / en "There are people you can talk to right now." | **주의** | 24/7 조건은 맞지만 109 응답률 49%(2025 상반기)를 보면 '지금' 연결을 약속하는 셈이다. Samaritans는 과장된 약속을 피하라고 한다. 권고: 채널이 둘 이상이면 "전화가 연결되지 않으면 문자나 카카오톡으로도 할 수 있어요" / "If a call doesn't connect, you can try texting." 같은 대안 줄을 둔다(KR·CA·NZ) |
| 긴급 줄 ko "지금 위험하다면 {긴급}에 바로 연락할 수 있어요." | 맞음 | 명령형 예외 원칙과 맞음. 다만 ko는 권유형, en은 명령형("call 911")이라 강도가 다르다 — en이 지침상 더 분명하다. ko도 "바로 연락해 주세요"로 올릴지 안전 검수 판단 필요(선택) |
| 도움말 "몽망이는 상담을 대신하지 않아요" | 맞음 | 한계 고지 |
| '비밀' 약속 없음 | 맞음 | 988도 통화 녹음 가능, 1388 신고 의무 — 금지 유지가 옳다 |
| {이름 절} CA만 | 맞음 | 공식 문구 근거 있음 |
| 방법·수단·작별 표현 | 없음 | 맞음 |

## 4. 다른 담당 몫으로 넘긴 두 가지 — 위치와 고칠 문장

### 4-1. `docs/ops/crisis-disclosure.md` 3절 견본

**(a) ko 견본 26행** — 지금: "무료이고, 이름을 말하지 않아도 되고, 문자로도 할 수 있어요."
- 문제: KR 익명은 정본에서 [확인 필요](공식 문구 없음) → **확인되지 않은 약속**. 
- 고칠 문장: `지금 마음을 사람과 나눌 수 있는 곳이 있어요. 무료이고, 전화나 문자, 카카오톡으로도 할 수 있어요.`(앱 조합 결과 KR과 같게. S4를 반영하면 "전화와 문자는 무료이고,")

**(b) en 견본 33행** — 지금: "There are people you can talk to — it's free, you don't have to give your name, and you can text."
- 문제 셋: 'you can text'(PH NCMH·NZ 0508은 문자 없음), 'it's free'(PH 미확인, CA 문자는 요금제 조건부), 'you don't have to give your name'(CA만 확인).
- 고칠 문장: `There are people you can talk to. Most of the services below are free, and many also take texts.` 혹은 나라별 확정 사실만 쓰는 더 안전한 판: `There are people you can talk to:` (뒤 목록에 나라별로 'call or text'/'call' 표기)

**(c) en 견본 35행** — "Youthline 0800 37 66 33" → `Youthline: call 0800 376 633 or text 234`(정본 표기·문자 번호 반영)

**(d) en 견본 36행** — 지금: "NCMH Crisis Hotline 0919-057-1553 (Smart/TNT) · 0917-899-8727 (Globe/TM) · 1553 (landline)"
- 문제: 정본은 0919를 제외했고 1553 '유선' 라벨은 근거가 약하다(1-4).
- 고칠 문장(정본 유지 시): `Philippines: call the NCMH Crisis Hotline at 0917-899-8727 or 1553 (24/7)` — 0919 1차 확인이 끝나면 `· 0919-057-1553 (Smart/TNT)`를 정본과 같은 날 함께 넣는다.

**(e) en 견본 34행(캐나다)** — 퀘벡 줄이 없다. 추가: `· Québec: call 1 866 APPELLE (1-866-277-3553) or text 535353`

**(f) en 견본 38행** — "(911, or 111 in New Zealand)" → 한국·필리핀이 빠져 있고 숫자를 고정했다. 고칠 문장: `· If you're in danger right now, please call your local emergency number (911 in Canada and the Philippines, 111 in New Zealand, 112 or 119 in Korea).`

**(g) en 39행·ko 30행 맺음말** — "these services can listen right now" / "지금 바로 이야기를 들어 줄 수 있어요" → 연결 약속 과장(3절). `these services are there to listen, any time of day.` / `이 연락처들은 하루 중 언제든 이야기를 들어 주는 곳이에요.`

**(h) 41행** — "연락처는 `heart-grain-48.md` 8-6(원격 매니페스트 초기값)과 같게 유지한다" → 6절과 충돌. `연락처는 docs/ops/crisis-resources.md(정본)와 같게 유지한다.`

**(i) 55행(5절)** — "1388 문자 수신번호(`1388`/`#1388`)는 실기기 확인 뒤" → 공식은 `1388`로 확인됨. `1388 문자는 공식 안내대로 1388. 실기기 발송 확인만 남음.`

### 4-2. `docs/design/concept-v3/heart-grain-48.md` 8-6 표 (421~430행)

| 행 | 정본과 다른 점 | 고칠 문장 |
|---|---|---|
| 421 제목 | `verifiedAt` 2026-11-24 | `verifiedAt` 2026-11-25 — 값은 `docs/ops/crisis-resources.md`가 정본(이 표는 요약) |
| 425 한국 '확인' 칸 | "`1388`과 `#1388`을 둘 다 보내 보고 확정 [확인 필요]" | "1388 문자 = 공식 안내 `1388`(복지로). 실기기 발송 확인만 남음 · 카카오톡 채널 링크 [확인 필요](링크 전엔 검색 안내 문장)" |
| 426 캐나다 | 988 문자 무료 조건 없음 · '퀘벡 1-866-APPELLE·535353 1차 페이지 미확인 [확인 필요]' | 순서 칸에 "· 퀘벡: 1 866 APPELLE(1-866-277-3553) / 문자 535353(퀘벡 안에서만)" 추가, 확인 칸을 "퀘벡 번호 1차 확인됨(suicide.ca). 988 문자는 무제한 요금제일 때만 무료 → 문구 '전화는 무료'" |
| 427 뉴질랜드 | "0508 828 865 (7am–midnight)" · Youthline 0800 37 66 33 · "Youthline 문자 번호 [확인 필요]" | "Suicide Crisis Helpline 0508 828 865(전화만, 운영 시간 [확인 필요] — 출처끼리 다름, 표시 안 함)" · "Youthline 0800 376 633 / 문자 234 / 웹채팅(전화 24/7)" · 확인 칸 "Youthline 문자 234 1차 확인됨" |
| 428 필리핀 | "무료" · "0919-057-1553(Smart/TNT)" 포함 · '유선 1553' | "NCMH Crisis Hotline(24/7, **전화만**): 0917-899-8727(Globe/TM) · 1553 · 긴급 911" · 확인 칸 "0919-057-1553(Smart/TNT)는 NCMH 연락처 페이지 직접 열람 후 추가(최우선) · 무료·1553 유선 여부 [확인 필요]" |
| 429 미국 | JSON에 US 없음 | 표에서 빼거나 "JSON 미등록 → `_default`로 표시됨"을 적는다 |

## 5. 우선순위

1. **출시 전 필수**: 4-1 (a)(b)(d) — 사람 채널 답장이 확인 안 된 약속·제외된 번호를 그대로 내보낸다.
2. **출시 전 필수**: S1·S2·S3·S6(스키마 파일) — 구현이 8-4-1을 그대로 옮기면 틀린/빈 문장이 나온다.
3. **최우선 확인**: PH 0919-057-1553·1553 라벨 — 브라우저로 ncmh.gov.ph/contact-us 직접 열기(WebFetch·curl은 403).
4. 권장: S4·S5·S7, 4-2 표 갱신, KHP 인용문, NZ 111 무료 채우기, KR 긴급 두 번째 출처 교체, '연결 안 되면 다른 채널' 줄.

## 6. 직접 연 출처 (2026-11-25)

- KR: mois.go.kr 긴급신고 통합서비스 · mohw.go.kr 보도자료 list_no=1491820(2026-09-08) · bokjiro 1307179(마들랜)·1307645(1388) · korea.kr newsId=148921874(109 통합, 2023-10-27) · m.korea.kr 156163473(2016-10-26) · 주간경향 202511030600041(응답률)
- CA: 988.ca · 988.ca/get-help/what-to-expect · 988.ca/terms(검색 색인) · suicide.ca 24-7 help line · suicide.ca 988 시행 소식 · kidshelpphone.ca · kidshelpphone.ca/text
- NZ: 1737.org.nz · 1737.org.nz/faq · lifeline.org.nz suicide-crisis-helpline · youthline.co.nz/get-help · mentalhealth.org.nz/helplines · police.govt.nz(검색 색인, 직접 열기 404)
- PH: ehotlines.e.gov.ph · findahelpline.com NCMH · ncmh.gov.ph/contact-us·doh.gov.ph·ro2.doh.gov.ph·pia.gov.ph(모두 403, 검색 색인만) · GMA 2026-05-12 · Manila Bulletin 2026-01-03
- 기타: findahelpline.com
