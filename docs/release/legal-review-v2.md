# 법률 검토 의견서 v2 — 처리방침 v3.4 '법률 검토' 표시 13곳 판정

- 작성: 2026-11-25, 몽망이 키우기 팀 법률 검토 에이전트(AI). 오너 결정에 따라 변호사 검토를 대신하며, 사람 전문가 확인은 '권장'입니다.
- 대상: `privacy-policy.ko.md`·`en.md` v3.4(커밋 a6bb7b4)의 '법률 검토' 표시 13곳, 같은 쟁점의 테스터판(`privacy-policy-tester.ko.md`·`en.md`). 함께 본 문서: `legal-review-questions.md` B·F·H·I절, `legal-review-v1.md`, 처리방침 K 체크리스트, DECISIONS B5 H1·`docs/ops/deletion-requests.md`, 앱 문구 `apps/mobile/src/i18n/*.ts`(2d08504).
- 원칙: 사실은 K 체크리스트·커밋 근거만 따랐고 새 사실을 만들지 않았습니다. 오너 기입 칸(시행일·상호·영문 앱 이름·17절 성명·전화)은 채우지 않았습니다. 커밋하지 않았습니다.
- 질문서 답변: `legal-review-questions.md`의 B-1·B-2·B-3·B-4·B-11·B-12(12-1)·B-14 ③·B-15·F-6·H-1·H-2·I-3·I-5 아래에 '답변(AI 법률 검토 11-25)'.

> 이 문서는 법률 자문이 아닙니다. 확신도: 높음 = 조문 문언에 직접 있음 / 중간 = 문언은 확인했으나 우리 사안에 맞추는 데 해석이 들어감 / 낮음 = 원문 미확인·해석이 갈림.

## 1. 확인한 원문 (2026-11-25)

| 법령 | 판 | 주소 | 본 조문 |
|---|---|---|---|
| 개인정보 보호법 | 법률 제21445호, 2026-09-11 시행 | https://www.law.go.kr/법령/개인정보보호법 (lsiSeq 283839, 본문 확인) | 제15조 제1항·제2항, 제17조 제1항, 제22조의2, 제26조, 제28조의8, 제30조 제1항, 제31조, 제37조의2, 제38조 |
| 개인정보 보호법 시행령 | 2026-11-10 시행 | https://www.law.go.kr/법령/개인정보보호법시행령 (lsiSeq 291731, 본문 확인) | 제17조의2, 제28조, 제31조 제1항, 제32조 제1항, 제41조 제2항, 제44조의2~4, 제45조, 제46조 |
| 표준 개인정보 보호지침 | 개인정보보호위원회 고시 제2025-4호, 2025-04-11 시행 | https://www.law.go.kr/행정규칙/표준개인정보보호지침 (본문 확인) | 제10조 제1항(5일 이내 파기) |
| 전자문서 및 전자거래 기본법 | 2022-10-20 시행판 | https://www.law.go.kr/법령/전자문서및전자거래기본법 (본문 확인) | 제4조, 제4조의2 |
| 정보통신망법 | 2026-10-02 시행판 | https://www.law.go.kr/법령/정보통신망이용촉진및정보보호등에관한법률 (본문 확인) | 제50조 |
| 퀘벡 P-39.1 | 현행 | https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1 — **자동 조회 403, 원문 미확인** | 제4.1·9.1·12.1조(2차: https://www.fasken.com/en/knowledge/loi-25/29-pl64-c-comme-consentement) |
| 뉴질랜드 Privacy Act 2020 | — | legislation.govt.nz 자동 조회 403. OPC 안내 https://privacy.org.nz/assets/New-order/Resources-/Publications/Guidance-resources/2024-11-21-s11-third-party-providers.pdf | s 11(대리인), IPP 11·12 |
| Google ML Kit 데이터 공개 | — | https://developers.google.com/ml-kit/android-data-disclosure (본문 확인) | 'Used for diagnostics and usage analytics', 'does not transfer this data to third-parties' |
| 판례·처분(2차) | — | 대법원 2016도13263(위탁·제공 구별, 원문 미확인) https://www.nepla.ai/case/대법원/2016도13263 · 개인정보위 2022-09 구글·메타 처분 https://www.lawtimes.co.kr/news/181713 | 위탁 = 위탁자 이익 / 플랫폼이 수집 주체 |

## 2. 표시별 판정

| # | 표시(절) | 근거 조문 | 판정 | 확신도 | 처리 |
|---|---|---|---|---|---|
| 1 | 3-1 처리 근거 | 제15조 제1항 제1호·제2항, 제22조의2 제1항, 퀘벡 9.1 | 동의 근거 유지가 맞음. 14세 미만은 켤 수 없어 법정대리인 동의 없음. 단 켜기 화면이 제15조 제2항 네 가지를 알려야 동의가 유효 — **지금 앱 문구는 목적·보유 기간·불이익 없음이 없음(K38 불일치)** | 중간~높음 | 확정 |
| 2 | 3-2 처리 근거 | 제15조 제1항 제4호·제6호, 제22조의2 제1항 | 계약 이행(제4호). '안 되면 제6호' 예비 근거를 지우고 IP 잠시 세기만 제6호로 분리. 동의 아님 → 법정대리인 동의 대상 아님 | 중간~높음 | 확정(테스터판 1-1 같이) |
| 3 | 3-3 처리 근거 | 제15조 제1항 제4호, 제26조 제5항 | 파일·모델 = 제4호. ML Kit 진단 = 위탁 아님, Google의 직접 수집(9절) | 중간 | 확정(테스터판 1-2 같이) |
| 4 | 4절 첫 표시(연령 확인 없이 나가는 정보) | 제22조의2 제1항('이 법에 따른 동의를 받아야 할 때'), 퀘벡 4.1 | 국내는 동의 근거가 아닌 처리에 법정대리인 동의 불필요. 퀘벡 4.1은 '명백한 이익' 예외로 설명 가능하나 사례 없음 | 높음(국내)·낮음(퀘벡) | 확정 · 퀘벡 사람 확인 권장 |
| 5 | 4절 둘째 표시(보호자 확인) | 제16조, 제38조 제2항, 시행령 제45·46조, 표준지침 제10조 제1항 | 서류를 받지 않는 지금 안이 맞음(익명 계정과 이을 수 없고 최소 수집에 어긋남). 72시간은 '5일 이내' 안 | 중간 | 확정 |
| 6 | 7절 DPA | 제26조 제1항·제6항, 시행령 제28조 제1항, 전자문서법 제4조·제4조의2 | 전자 수락 DPA도 문서 요건 충족 가능(여덟 항목 대조표·사본 보관 조건). **개인 Gmail이면 DPA 없음** | 중간 | 확정 + Gmail 행 '확인 필요' |
| 7 | 8절 제3호 | 제28조의8 제1항 제3호, 시행령 제31조 제1항 제2호 | 위탁·보관 행은 제3호 맞음. ML Kit 행은 제3호 아님(위탁 아님) — 운영자의 이전이 아닌 Google 직접 수집으로 밝히고 표에는 정보로 남김 | 중간 | 확정(테스터판 6절 같이) |
| 8 | 9절 위탁·제3자 | 제17조, 제26조 제5항, 2016도13263, 개인정보위 2022 처분, NZ s 11 | 위탁도 운영자의 제공도 아님. Google이 자사 목적으로 직접 수집 → 받는 자·항목·목적·보유 기간을 고지 | 중간 | 확정(테스터판 6·7절 같이) · **사람 확인 권장(최우선)** |
| 9 | 11절 F-6 밥 알림 | 정보통신망법 제50조, 퀘벡 9.1 | 14세 미만에게 숨길 법적 의무 없음. 광고·구매 권유를 넣지 않는다는 문장 추가 | 중간 | 확정 |
| 10 | 12절 본인 확인 | 제38조 제4항·제5항, 시행령 제41조 제2항, 제46조 | 앱이 본인 확인 창구. 이메일·공개 링크 코드만으로는 열람·정정하지 않음, 거절 시 사유·이의 방법 안내. **앱에 서버 정보 열람 경로 없음(빈틈)** | 중간 | 확정 · 사람 확인 권장 |
| 11 | 12-1 자동화된 결정 | 제37조의2 제1·2·4항, 시행령 제44조의3·4, 퀘벡 12.1 | 완전 자동 결정이지만 중대한 영향 아님 → 거부 대상 아님, 설명 요구·기준 공개 대상. 빠진 '목적·쓰는 정보' 추가 | 중간 | 확정 |
| 12 | 17절 전화 칸 | 제30조 제1항 제6호('전화번호 등 연락처') | 필수 아님·권장(안심번호 무방). 칸은 오너 기입 그대로, 안내 글만 판정으로 바꿈 | 중간 | 판정만 · 사람 확인 권장 |
| 13 | 17절 끝(이메일만 되는지) | 제30조 제1항 제6호, 제31조 제2항, 시행령 제32조 제1항 | 12번과 같음. 소상공인은 사업주가 보호책임자 → 운영자 본인 기재 맞음 | 중간 | 표시 지움 |

## 3. 확정 문장 (본문에 반영한 그대로)

#### [3-1]
- ko: **목적과 처리 근거**: 게임을 계속 즐기는 비율을 재고 화면을 개선하기 위해서입니다. 이 통계에는 식별자가 없지만 통신에 IP 주소가 쓰이고 설치가 적은 시기에는 한 사람만 있는 칸이 생길 수 있어, 운영자는 이를 개인정보로 보고 이용자의 동의(직접 켬 — 「개인정보 보호법」 제15조 제1항 제1호)를 근거로 처리합니다. 켜지 않거나 꺼도 게임 이용에는 아무 불이익이 없습니다.
- en: **Why, and legal basis**: to measure how many people keep playing and to improve the game. These statistics carry no identifier, but an IP address is used for the connection and, when few people use the App, a combination may contain only one person, so we treat them as personal information and rely on your consent (you turn it on yourself — Article 15(1)1 of Korea's Personal Information Protection Act). Not turning it on, or turning it off, makes no difference to the game.

#### [3-2]
- ko: **목적과 처리 근거**: 이용자가 설치한 앱을 제공하고 오류 수정을 전달하기 위해서입니다(앱 이용 계약의 이행, 「개인정보 보호법」 제15조 제1항 제4호). 과도한 요청을 막으려고 IP 주소를 메모리에서 잠시 세는 것은 서비스를 안전하게 운영하려는 운영자의 정당한 이익을 위한 것입니다(같은 항 제6호). 동의를 근거로 하지 않으므로 연령 확인 전에도, 만 14세 미만 이용자에게서도 같은 방식으로 처리합니다.
- en: **Purpose and legal basis**: to provide the App you installed and deliver bug fixes (performance of our agreement for your use of the App, Korea's Personal Information Protection Act, Article 15(1)(4)). Counting IP addresses briefly in memory to block excessive requests is for our legitimate interest in running the service safely (Article 15(1)(6)). Because this does not rely on consent, it works the same way before the age check and for users under 14.

#### [3-3]
- ko: **목적과 처리 근거**: 설정·콘텐츠 파일과 인식 모델 내려받기는 앱의 기능을 제공하기 위해서입니다(앱 이용 계약의 이행, 「개인정보 보호법」 제15조 제1항 제4호). 동의를 근거로 하지 않으므로 연령 확인 전에도 같은 방식으로 처리합니다. ML Kit 진단 정보는 운영자가 받거나 맡기는 정보가 아니라, Google이 앱에 들어 있는 자사 구성요소를 통해 기기에서 직접 받아 자사 목적(진단·사용 분석)에 쓰는 정보입니다. 그래서 운영자의 처리위탁이 아니며, Google이 자사 방침에 따라 처리합니다(9절).
- en: **Purpose and legal basis**: downloading settings and content files and the recognition model is needed to provide the App's features (performance of our agreement for your use of the App, Article 15(1)(4)). Because this does not rely on consent, it works the same way before the age check. The ML Kit diagnostic data is not something we receive or hand to anyone: Google collects it directly from your device through its own component inside the App and uses it for its own purposes (diagnostics and usage analytics). So it is not processing on our behalf, and Google handles it under its own policies (section 9).

#### [4-a]
- ko: 운영자는 법정대리인 동의 절차를 제공하지 않으며, 만 14세 미만 아동의 계정을 만들지 않습니다. 동의를 근거로 하는 3-1의 이용 통계와 계정이 생기는 기능은 만 14세 확인을 통과한 분만 켤 수 있습니다. 3-2·3-3의 업데이트 확인과 파일·모델 내려받기는 동의가 아니라 앱 이용 계약의 이행을 근거로 하므로, 연령 확인 없이 모든 이용자에게서 같은 방식으로 처리됩니다. 손글씨 인식 진단 정보는 Google이 앱 안 구성요소로 직접 받는 정보입니다(9절).
- en: We do not offer a parental consent process and do not create accounts for children under 14. The usage statistics in 3-1, which rely on consent, and the features that create an account can be turned on only by people who have passed the age check. The update checks and file and model downloads in 3-2 and 3-3 rely on performing our agreement for your use of the App, not on consent, so they work the same way for every user without an age check. Handwriting recognition diagnostics are collected by Google directly through a component inside the App (section 9).

#### [4-b]
- ko: 만 14세 미만 아동의 정보가 서버에 처리된 사실을 알게 되면 지체 없이 지웁니다. 확인하는 즉시 공개 페이지를 내리고, 잘못된 요청으로 다른 사람의 기록이 지워지지 않도록 앱 안에 알린 뒤 **72시간** 뒤 서버에 맡긴 것을 지웁니다. 보호자는 17절의 연락처로 그 몽망이의 공유 링크 코드를 알려 주세요. 정보를 더 모으지 않기 위해 보호자임을 증명하는 서류는 받지 않습니다. 대신 72시간 동안 앱 안에서 계정 주인에게 알리고, 그사이 주인이 연락해 오면 확인한 뒤 삭제를 멈출 수 있습니다. 되찾기 글귀를 알고 있다면 웹 삭제 페이지(12절)에서 바로 지울 수 있습니다.
- en: If we learn that a child under 14's information has been processed on our server, we will delete it without delay. We take the public page down as soon as we confirm, and, so that a mistaken request cannot erase someone else's records, we notify the account in the App and delete what is kept on our server **72 hours** later. Parents or guardians can send us that Mongmangi's share link code at the address in section 17. So that we do not collect more information, we do not ask for documents proving guardianship. Instead, for those 72 hours the account holder is notified in the App, and if they contact us in that time we can check and stop the deletion. If you know the recovery phrase, you can delete right away on the web deletion page (section 12).

#### [7]
- ko: 운영자는 서비스 제공을 위해 아래 업체에 개인정보 처리를 맡깁니다. 각 업체와는 그 업체가 정한 데이터 처리 부속서(DPA)를 전자적으로 받아들이는 방식으로 위탁 계약을 맺습니다.
- en: We use the following providers to run the service. With each provider, the outsourcing contract is made by accepting, electronically, the data processing agreement (DPA) that provider sets.

#### [8]
- ko: 데이터는 대한민국 서울 리전에 저장하지만, 아래 업체가 외국 법인이거나 해외 서버를 쓰므로 국외 이전으로 알립니다. 이 이전은 이용자와의 계약 이행을 위해 처리위탁·보관이 필요한 경우로서, 「개인정보 보호법」 제28조의8 제1항 제3호에 따라 아래 사항을 공개하고 이루어집니다. 다만 표의 ML Kit 행은 운영자가 맡기거나 넘기는 정보가 아니라 Google이 앱 안 구성요소로 직접 받는 정보이므로(9절) 이 근거에 따른 운영자의 이전이 아니며, 정보가 국외로 가기 때문에 같은 항목으로 함께 알립니다.
- en: Our data is stored in the Seoul (Republic of Korea) region, but because the providers below are foreign companies or use servers abroad, we disclose them as international transfers. These transfers are outsourcing and storage needed to perform our agreement with you, made after disclosing the items below, under Article 28-8(1)3 of Korea's Personal Information Protection Act. The ML Kit row, however, is not information we outsource or hand over but information Google collects directly through a component inside the App (section 9), so it is not a transfer by us on that basis; because the information goes abroad, we list it with the same items.

#### [9]
- ko: 손글씨 인식 기능의 진단 정보(3-3)는 앱에 들어 있는 Google ML Kit이 Google에 직접 보내는 정보입니다. 운영자는 이 정보를 받거나 보지 않으므로 Google에 제공하지 않으며, Google이 자사 목적(사용 분석)에도 쓰므로 운영자가 업무를 맡기는 처리위탁(7절)으로도 적지 않습니다. 다만 운영자가 이 구성요소를 앱에 넣었으므로 받는 자(Google LLC), 항목(3-3), 목적(ML Kit 진단·사용 분석), 보유 기간(Google 정책에 따름)을 여기와 8절에 알립니다.
- en: ML Kit diagnostic data (3-3) is sent directly to Google by the Google ML Kit component inside the App. We do not receive or see it, so we do not provide it to Google; and because Google also uses it for its own purposes (usage analytics), we do not list it as processing on our behalf (section 7) either. Because we put this component in the App, we disclose the recipient (Google LLC), the items (3-3), the purpose (ML Kit diagnostics and usage analytics) and the retention (under Google's policies) here and in section 8.

#### [F-6]
- ko: **밥 알림**(선택, **기본 꺼짐**): 켜면 앱을 닫거나 다른 앱으로 나갈 때 몽망이가 벼루 쪽을 본다는 관찰 문장의 알림을 기기 안에 **하나만** 예약합니다. 그 깸에 한 마디를 썼으면 다음다음 깸에, 쓰지 않았으면 다음 깸에 울리며, 무엇을 썼는지와는 상관없습니다. 앱은 따로 기록하지 않으며, 예약은 휴대폰 알림 시스템에 잠시 있다가 앱을 열면 지워집니다. 이미 울린 알림도 앱을 열면 치웁니다. 서버나 이용 통계로 보내지 않습니다. 처음 알림 권한을 여쭐 때 함께 고를 수 있고, 그 뒤에는 공방 노트에서 켜고 끕니다. 켜지 않아도 몽망이는 똑같이 자랍니다. 밥 알림은 연령과 관계없이 고를 수 있으며, 광고나 구매 권유를 싣지 않습니다.
- en: **Meal reminder** (optional, **off by default**): if you turn it on, when you close the App or switch to another app, it schedules **just one** notification on your device — an observation that your Mongmangi is looking toward the inkstone. If you wrote a word during that waking, it comes in the waking after next; if you did not, it comes in the next waking. What you wrote makes no difference. The App keeps no record of its own; the reminder waits briefly in your phone's notification system and is removed when you open the App, which also clears a reminder that has already appeared. Nothing about it goes to our server or into usage statistics. You can choose it when we first ask for notification permission, and later turn it on or off in the Studio Notebook. Your Mongmangi grows the same whether or not you turn it on. The meal reminder can be chosen regardless of age, and it never carries ads or offers to buy anything.

#### [12]
- ko: **이메일 요청의 처리 방식**: 이메일과 메시지는 **운영자(사람)만 읽으며 AI 도구에 넘기지 않습니다.** 익명 계정이라 이메일 주소만으로는 본인인지 확인할 수 없습니다. 삭제 요청에는 앱 안 삭제나 웹 삭제 페이지를 안내합니다. **되찾기 글귀를 이메일에 적지 마세요** — 글귀가 운영자의 메일함과 메일 서비스에 남게 됩니다. 그 밖의 요청(열람·정정·처리정지)은 계정이 연결된 앱에서 하는 방법(위 표)이 본인 확인을 겸합니다. 이메일 주소와 공유 링크 코드(링크 주소에 공개된 값)만으로는 본인임을 확인할 수 없어, 운영자는 이메일만으로 서버에 맡긴 정보를 보내 드리거나 바꾸지 않고 앱에서 하는 방법을 안내합니다. 앱으로 할 수 없는 요청이면 그 사유와 이의를 내는 방법을 답장으로 알립니다.
- en: **How we handle email requests**: emails and messages are **read only by the operator (a person) and are not passed to AI tools.** Accounts are anonymous, so an email address alone cannot show that a request comes from you. For deletion, we point you to in-App deletion or the web deletion page. **Please do not put your recovery phrase in an email** — it would then remain in our mailbox and with our email provider. For other requests (access, correction, stopping processing), using the App linked to your account (table above) is itself how we confirm it is you. An email address and a share link code (a value that is public in the link) cannot show that a request comes from you, so we do not send or change what is kept on our server on the strength of an email alone; we point you to the way to do it in the App. If a request cannot be done in the App, we reply with the reason and how to object.

#### [12-1a]
- ko: **목적과 쓰는 정보**: 자동 숨김은 신고가 몰린 공개 페이지를 운영자가 확인하기 전에 잠시 가리기 위한 것으로, 신고자의 IP 주소를 가명 처리한 값·신고 사유·신고 시각을 씁니다. 이름 자동 비공개는 공개 페이지에 연락처나 부적절한 이름이 실리지 않게 하기 위한 것으로, 몽망이 이름만 씁니다.
- en: **Purpose and data used**: automatic hiding briefly hides a public page that has drawn reports until we can review it, using the pseudonymized IP values of the people reporting, the report reasons and the report times. Automatic name hiding keeps contact details or inappropriate names off public pages, using only the Mongmangi's name.

#### [12-1b]
- ko: 이 두 결정은 공개 범위를 잠시 좁힐 뿐 이용자의 권리·의무에 중대한 영향을 주지 않으므로 「개인정보 보호법」 제37조의2 제1항의 거부 대상은 아니지만, 같은 조 제2항·제4항에 따라 기준을 공개하고 설명 요구를 받습니다.
- en: These two decisions only narrow what is public for a while and do not significantly affect your rights or obligations, so they are not decisions you can refuse under Article 37-2(1) of Korea's Personal Information Protection Act; we still publish the rules and accept requests for explanation under Article 37-2(2) and (4).

#### [17-phone]
- ko: | 전화 | [운영자 기입 — 안심번호 등, 둘지 여부는 오너 결정(법률 판정: 필수 아님·권장)] |
- en: | Phone | [Operator — owner to fill; e.g. a relay number, whether to list one is the owner's decision (legal finding: not required, recommended)] |

테스터판(`privacy-policy-tester.ko.md`·`en.md`)은 1-1·1-2 처리 근거, 6절 첫 문단과 ML Kit 줄, 7절 둘째 줄을 위와 같은 판정으로 맞췄습니다(표시는 원래 없었음 — '아직 확인하고 있으며' 문장 정리).

## 4. 남은 '확인 필요' (사실 확인)

| 곳 | 확인할 것 | 누가 |
|---|---|---|
| 7절 Gmail 행(ko·en) | 운영자 메일함이 Google Workspace인지 개인(무료) Gmail인지. 개인 계정이면 DPA가 없어 '각 업체와 DPA로 위탁 계약' 문장이 이 행에 맞지 않음 → Workspace 전환 또는 행 수정 | 오너 |
| K22(체크리스트) | 각 사 DPA가 여덟 항목(제26조 제1항 3 + 시행령 제28조 제1항 5)을 담는지 대조표, 수락 날짜, PDF 사본 → `docs/release/dpa/`(지금 없음). Supabase 계약 상대 법인 | 출시·정책 담당 |
| K38(체크리스트 신설) | 통계 켜기 화면에 목적·항목·보유 기간(90일 뒤 월 합계)·'켜지 않아도 게임은 같음'을 넣기 — 2d08504 문구에 없음. 토글 연결 전 | 앱 팀 |

## 5. 오너가 정할 것

1. **ML Kit 대비책(H-2)** — 지금 판정(Google 직접 수집, 고지로 충분)대로 갈지, 남는 위험(감독기관이 '운영자의 제3자 제공'으로 보면 동의·14세 미만 법정대리인 동의·국외 이전 별도 동의가 필요, 퀘벡 4.1)을 없애려 **연령 확인 통과 전에는 키보드 입력만** 쓰게 할지. 12-19 빌드 2(네이티브 동결) 전에 정해야 함. 고르면 3-3·4·8·9절·쉬운 말 요약을 다시 고침.
2. **17절 전화** — 법률상 필수 아님(중간), 권장. 050 안심번호를 둘지.
3. **운영자 메일함** — Workspace로 옮길지(7절 Gmail 행).
4. **서버 정보 열람 경로** — 앱에 '서버에 맡긴 것 보기(또는 내보내기)'나 앱 안 1회용 확인 문구를 1.0.x에 넣을지. 지금은 열람 요구를 앱에서도 이메일에서도 처리할 수 없는 빈틈(제35조·제38조 제4항).

## 6. 사람 전문가 확인 권장

1. **ML Kit 진단의 성격(H-1)** — 최우선. 위 5-1의 결정을 이 확인 뒤로 미룰 수 있는지도 함께.
2. 퀘벡 제4.1조 — 연령 확인 전 IP(메모리 1분)·업데이트 확인·ML Kit이 '14세 미만에게서 수집'인지, '명백한 이익' 예외가 되는지(원문 자동 조회 실패).
3. 17절 — 전화 없이 이메일만으로 제30조 제1항 제6호를 충족하는지(I-5).
4. 12절 — 열람 경로가 없는 동안 '사유와 이의 방법 안내'로 제35조·제38조를 지키는지.
5. 7절 — 표준 DPA 수락의 문서 요건 충족과 Supabase 계약 상대 법인.

## 7. 검증

- `cd apps/web-static && npx vitest run` — 4파일 86개 통과(편집 뒤). 중간에 K38 행 삽입 때 K37 행의 인용 표시(`> `)가 빠져 출시 모드 'K행 누출' 6건이 실패했고, 고친 뒤 통과.
- ko·en 대응: 고친 절(3-1·3-2·3-3·4·7·8·9·11·12·12-1·17)의 글머리표·표 행 수가 ko·en 같음(스크립트 비교). 다른 곳은 18절(나라별 안내 구성)·테스터판 12절만 원래부터 다름.
- 남은 '법률 검토' 표시: 본문 0(체크리스트 K17의 'B-8' 참조 1곳은 내부 표). 테스터판 공개 문장에 '확인 필요'·'법률 검토' 없음.
