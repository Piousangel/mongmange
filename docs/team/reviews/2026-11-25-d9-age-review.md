# D9 연령 리뷰 — 등급 설문 답안·타깃 연령·처리방침 연령 문구 (법률 검토 에이전트)

- 대상: 커밋 `ab511d5`(main) — `docs/release/age-rating-answers.md`(새 파일), `store-listing.md` 6절·9절, 처리방침 ko·en·테스터 ko·en 연령 변경, `legal-review-questions.md` I절, `roadmap.md` C11
- 검토자: 법률 검토 에이전트(작성 참여 없음). 오너 결정에 따라 변호사 검토를 대신함 — **사람(변호사) 확인 권장**
- 날짜: 2026-11-25. 고치지 않았고 커밋하지 않았음
- 판정: **조건부 통과** — 설문 답 자체는 대부분 맞다. 다만 **중간 3건**(Play 타깃 연령 근거, P8 되돌림, 3-2·3-3 처리 근거 공백)은 12-19 콘솔 입력 전에 정리해야 한다

### 공식 출처 (모두 2026-11-25 이 리뷰에서 직접 확인)

| # | 문서 | 확인한 원문 |
|---|---|---|
| R1 | Apple 'Age ratings values and definitions' https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions | Age Assurance = "Mechanism to confirm an individual's age meets the age requirement for accessing specific content or services. May include: declared age range API; age estimation…; age verification via … or other means of age assurance." / UGC = "broad distribution of content created by users as a component of the app's intended user experience" / Messaging and Chat = "Users can directly communicate … May include: … **public posting**" / Health or Wellness Topics = "Content that provides self-care or lifestyle recommendations. May include: calorie tracking, dieting advice, or exercise recommendations." / Medical or Treatment Information = "… guidance around the management of medical conditions … May include: medication guidance, **emergency medical care**, or treatment information." / Mature or Suggestive Themes 예시에 "psychological trauma or abuse". 전 세계 표: Age Assurance·UGC·Messaging = 4+, Health or Wellness = 9+(빈도 구분 없음), Medical Infrequent = 13+. 한국 표: Age Assurance·UGC·Messaging·Health or Wellness = **All**, Medical Infrequent = **12+**, Mature or Suggestive = 12+ |
| R2 | Apple 'Set an app age rating' https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating | "If your app has a EULA with minimum age requirements that exceed the rating that Apple calculated, you must override to a rating that adheres to the requirements." 빈도 정의·'거짓 답 = 삭제' 문장은 **이 페이지에 없음** |
| R3 | Google Play 'Manage target audience and app content settings' https://support.google.com/googleplay/android-developer/answer/9867159 | 묶음 6개. **13~15와 16~17 둘 다** "may be considered to include children in some locales". 여러 묶음은 앱이 그 묶음을 위해 설계되고 적합할 때만 고름. "It is very important that you provide accurate answers", Google이 타깃이 정확한지 검토. "Any apps that have at least one target audience age group that includes children must comply with" Families |
| R4 | 개인정보 보호법 제22조의2 ①~④ (korea.legal 원문 인용, 국가법령정보센터 원문 대조 권장) | ① "만 14세 미만 아동의 개인정보를 처리하기 위하여 **이 법에 따른 동의를 받아야 할 때에는** 그 법정대리인의 동의" ③ "만 14세 미만의 아동에게 개인정보 처리와 관련한 사항의 고지 등을 할 때에는 이해하기 쉬운 양식과 명확하고 알기 쉬운 언어" |
| R5 | 법률 1차 검토 v1 `docs/release/legal-review-v1.md:62`(B-5), `:111`(E-7), `:166`(P8) | 내부 |

---

## 1. 질문별 답 검증

| # | 심각도 | 파일:줄 | 판단 | 근거 |
|---|---|---|---|---|
| 1-1 | 낮음(답 유지) | `age-rating-answers.md:106`, `store-listing.md:219` | **Health or Wellness Topics '예' → 9+는 받아들일 수 있다. 다만 근거 문장을 정의에 맞춰 고쳐야 한다.** R1 정의는 '자기 돌봄·생활 방식 권유'이고 예시는 식단·운동이다. '마음이 무거운 날엔 사람과 이야기해도 괜찮아요'는 자기 돌봄 권유로 읽을 수 있어 '예'가 거짓은 아니고, '아니요'도 방어 가능하다(경계 사례). 비용은 전 세계 4+→9+ 하나, 한국 지역은 둘 다 All(R1 한국 표)이라 보수적 선택으로 적절하다. **'Infrequent 수준'이라는 표현은 빼야 한다** — R1 표에서 이 항목은 빈도 구분 없이 9+다 | R1 |
| 1-2 | **중간** | `age-rating-answers.md:107`, `:129` | **Medical or Treatment Information 'None'의 근거가 빠져 있다.** R1 정의 예시에 'emergency medical care'가 있고, strong 쪽지 맨 아래 '지금 위험하다면 {긴급}에 바로 연락할 수 있어요'(`docs/design/concept-v3/heart-grain-48.md:367`)는 심사자가 이 예시로 읽을 수 있다. Infrequent로 답하면 **13+, 한국 12+**가 되어 GRAC 전체이용가와 어긋난다(RCN 문제). 우리 판단은 None이 맞다 — 진단·관리 안내가 아니고 공공 긴급 번호로 **안내만** 한다. 그런데 문서의 '보수적으로 예' 논리(심사자가 숨겼다고 볼 위험)를 그대로 적용하면 정의상 더 가까운 쪽은 Health/Wellness보다 이 항목이라 논리가 한쪽으로만 쓰였다. **3-3 표에 '긴급 줄은 안내이지 응급 처치 지도가 아님 → None' 근거를 적고 심사 메모에도 한 줄** 넣을 것 | R1 |
| 1-3 | 낮음(답 유지) | `age-rating-answers.md:95`, `:142-146` | **UGC '예' 동의.** 링크를 받은 사람만 보므로 'broad distribution'에 딱 맞지는 않지만 공개 URL이고 4+·한국 All이라 '예'가 안전하다. 다만 '예'로 답하면 심사자가 가이드라인 1.2(필터·신고·**차단**·연락처)를 본다. '1:1 소통이 없어 차단 대상이 없다'는 논리는 심사자에 따라 거절될 수 있다 → 1.0 심사 메모에 '방문자는 미리 정한 반응만 남기고, 주인은 링크 끄기·반응 숨기기로 막을 수 있음'을 적고, 가능하면 반응 숨기기를 차단 대용으로 설계해 둘 것 | R1, App Review Guidelines 1.2 |
| 1-4 | 낮음 | `age-rating-answers.md:97` | **Messaging and Chat '아니요'의 근거 보강.** R1 정의 예시에 'public posting'이 있다. 공유 링크 페이지가 '공개 게시'로 읽힐 수 있다. 판단은 '아니요'가 맞다(유저끼리 직접 소통 수단 없음) — 그러나 '예'여도 4+·한국 All이라 등급 비용이 0이므로, 원문 예시를 언급하고 '공개 게시는 UGC 항목으로 신고함'이라고 적어 두면 된다 | R1 |
| 1-5 | 낮음(답 유지) | `age-rating-answers.md:88` | **Age Assurance '예' 동의.** R1 정의가 'other means'를 포함하므로 자기 신고형 연령 확인도 해당한다. 등급 영향 0(4+·All). 참고: 미달 기록이 **같은 날만** 다시 묻지 않으므로(`ageGate.ts:66`, feat/c12 브랜치) 다음 날 다른 해를 고르면 통과한다. 자기 신고형의 한계로 받아들일 수준이지만, 처리방침·심사 메모에서 '확인'을 '검증'처럼 쓰지 말 것 | R1 |
| 1-6 | 낮음 | `age-rating-answers.md:108` | Mature or Suggestive Themes None 동의. R1 예시 'psychological trauma or abuse'는 앱이 **다루는 주제**를 말하며, 유저 입력에 지지 쪽지로 반응하는 것은 해당하지 않는다. A-1의 '바뀌는 조건'(28밤 결말 B)은 정확하다 | R1 |
| 1-7 | 낮음 | `age-rating-answers.md:30`, `:56` | IARC 상호작용 '예(보수적)'·GRAC 전체이용가 예상 동의. 문항 원문 미공개라는 한계를 정직하게 적은 점이 좋다 | — |

## 2. Play 타깃 연령 16~17·18+ vs 법률 v1 B-5

| 심각도 | 파일:줄 | 의견 |
|---|---|---|
| **중간** | `age-rating-answers.md:69-70`, `store-listing.md:206`, `legal-review-questions.md:397` | **결론: B-5(13~15·16~17·18+)가 정책 문언에 더 맞다. 다만 결정은 콘솔에서 확인한 사실로 하라.** ① R3은 타깃을 '앱이 설계된 대상'으로 묻고 정확성을 검토한다고 적는다. 우리는 처리방침·스토어 설명에 스스로 '만 14세 이상을 대상으로 만들었다'고 쓴다(`privacy-policy.ko.md:75`, `:189`, `store-listing.md:98`). 14~15세는 **설계 대상 안**이므로 16~17·18+만 고르면 사실보다 좁은 신고가 되고, 처리방침 링크가 스토어에 붙어 있어 불일치가 겉으로 보인다. ② 문서의 회피 논리('13~15는 일부 지역에서 아동을 포함할 수 있다')는 R3에서 **16~17에도 같은 문장**이 붙어 있어 13~15만 가르는 근거가 못 된다. 이 문장이 자동으로 Families를 붙인다면 16~17을 고른 모든 앱이 Families 대상이 되므로, 안내 문구로 읽는 것이 자연스럽다(B-5와 같은 결론). ③ 반대 쪽 위험(한국에서 13세 = 아동 → Families 요건)은 문언상 완전히 배제되지 않는다. 그러나 **지금 빌드는 광고·위치·결제가 0**이고 연령 화면이 이미 중립형이라 Families 요건이 붙어도 추가 부담이 작다. 부담이 커지는 때는 D-05 (나) 광고 채택 때다. |
| — | — | **'허위 신고'에 해당하나**: 14~15세가 쓸 수 있는데 타깃에서 빼는 것 자체가 곧 허위 신고라고 단정할 근거는 없다(Google의 제재 사례는 대부분 '아동에게 어필하면서 성인 타깃 신고' 유형). 다만 ①의 불일치 + 귀여운 캐릭터(T4 위험)가 겹치면 Google이 '타깃 부정확'으로 거절할 명분이 생긴다. 위험도: 낮음~중간. |
| — | — | **권장 순서**: 12-19 전에 오너가 콘솔 타깃 화면에서 13~15를 체크해 보고(저장 전) Families 추가 질문·광고 SDK 요구가 뜨는지 캡처한다. 뜨지 않으면 B-5 안을 채택. 뜨면 16~17·18+ 유지하되 **처리방침·설명의 '만 14세 이상 대상' 문구를 '계정 기능은 만 14세 이상'으로 낮춰**(아래 4-1) 겉으로 보이는 불일치를 없앤다. 어느 쪽이든 I-1 회신 전에 이 캡처를 변호사에게 함께 줄 것 |

## 3. I-6 — 'Play 건강 기능 없음' vs 'Apple Health/Wellness 예'

| 심각도 | 파일:줄 | 의견 |
|---|---|---|
| 낮음 | `age-rating-answers.md:74`, `:106`, `legal-review-questions.md:402` | **모순 위험은 낮다.** 두 질문은 대상이 다르다 — Play 건강 앱 선언은 앱의 **기능**(건강 관리·의료 기능 제공 여부, E-7), Apple 항목은 **콘텐츠**(자기 돌봄 권유 문장이 있는가)를 묻는다. 두 스토어 심사는 서로의 답을 대조하지 않는다. 오히려 Apple을 None으로 내리면 '보수적으로 답한다'는 문서 원칙(`age-rating-answers.md:7`)과 어긋난다. 유지 권장. 다만 1-1대로 Apple 답의 근거를 '자기 돌봄 권유 한 문장, 건강 기능 아님'으로 적어 두면 두 답이 한 문장으로 설명된다 |

## 4. 처리방침 연령 문구와 개인정보 보호법 제22조의2

| # | 심각도 | 파일:줄 | 의견 |
|---|---|---|---|
| 4-1 | **중간** | `privacy-policy.ko.md:75`, `:189`, `privacy-policy.en.md:14`, `:128`, 테스터 ko·en `:11`·`:93` | **법률 v1 P8을 기록 없이 되돌렸다.** P8(`legal-review-v1.md:166`)은 4절 첫 줄 '만 14세 이상을 대상으로 합니다'를 '계정이 생기는 기능은 만 14세 이상만'으로 **의도적으로 바꾼** 수정안이다. 이번 커밋이 '대상' 문장을 요약·4절 맨 앞에 다시 넣었고, 판 메모에도 P8 언급이 없다. 법적으로 '대상' 문구가 제22조의2를 위반하지는 않지만 ① Play 16~17·18+ 신고와의 불일치를 더 드러내고(2절) ② Apple이 처리방침·설명을 '최소 연령'으로 읽을 여지를 키우며(5절) ③ 14세 미만도 쓰는 앱이라는 사실을 흐린다. **권장**: 4절 첫 문장은 P8 문장(계정 기능 기준)을 유지하고, '대상' 표현은 쓴다면 뒤에 '주로 만 14세 이상을 생각하고 만들었으며, 기기 안 게임은 누구나 쓸 수 있어요'처럼 사실을 함께 적을 것. 되돌림이 의도라면 DECISIONS에 P8 대체 결정으로 남길 것 |
| 4-2 | **중간** | `privacy-policy.ko.md:139-153`(3-2·3-3) | **제22조의2 판단의 열쇠인 '처리 근거'가 3-2·3-3에 없다.** 제22조의2 ①은 '이 법에 따른 동의를 받아야 할 때'만 법정대리인 동의를 요구한다(R4). 3-1·3-4·3-5는 근거를 적었는데(`:130`·`:162`·`:175`), 연령 확인 **전에** 14세 미만에게서도 나가는 3-2(업데이트 확인, IP)·3-3(파일·모델 다운로드, IP)만 근거가 없다. 동의 근거로 읽히면 14세 미만 이용자에 대해 법정대리인 동의가 필요하다는 해석이 가능해진다. **권장**: 3-2·3-3에 '계약 이행에 필요(제15조 제1항 제4호)' 또는 '정당한 이익(제6호)'을 명시하고, I-3에 '이 근거라면 14세 미만에게도 동의 없이 처리 가능한지'를 직접 묻는 문장으로 고칠 것. ML Kit 진단(Google 처리)은 H-1·H-2 회신에 따름 |
| 4-3 | 낮음 | `privacy-policy.ko.md:73-79` | **'14세 미만이 쓸 수 있지만 계정 기능이 잠기는 구조'에 지금 문구는 대체로 충분하다.** 4절이 미달 처리·미달 기록·연령과 무관한 전송·발견 시 삭제를 모두 적고 있고, 요약도 쉬운 말을 유지했다. 머리 '(만 14세가 안 된 분도 읽어 주세요)'를 뺀 것은 제22조의2 ③ 위반이 아니다(③은 쉬운 양식·언어를 요구할 뿐 어린이 대상 표지를 요구하지 않음). I-4의 질문은 적절하다 |
| 4-4 | 낮음 | `privacy-policy-tester.ko.md:15`, `privacy-policy-tester.en.md` 요약 끝 줄 | 본판은 요약 끝에 '만 14세가 안 됐다면 부모님이나 보호자에게 도움을…'을 남겼는데 **테스터판은 보호자 줄을 지우기만 했다**. 테스터 빌드도 14세 미만이 설치해 3-2와 같은 전송이 일어날 수 있으므로(테스터판 7절 `:94`) 본판과 같은 줄을 둘 것 |

## 5. 약관 연령 조항(Apple 16+ 상향 위험)

| 심각도 | 파일:줄 | 의견 |
|---|---|---|
| 낮음(판단 맞음) | `age-rating-answers.md:118`, `store-listing.md:221`, `legal-review-questions.md:399` | **판단이 맞다.** R2: EULA 최소 연령이 계산 등급보다 높으면 그 요구를 담는 등급으로 Override해야 한다. 계산 등급 9+(또는 4+)에서 '앱 이용 최소 14세'는 13+로 담기지 않으므로 16+가 된다. 약관을 '계정 기능 14세 이상'으로 한정하면 앱 이용 최소 연령이 아니므로 Override 의무가 생기지 않는다고 보는 것이 문언에 맞다. 보완 두 가지: ① 약관을 따로 두지 않으면 Apple 표준 EULA가 적용되어 최소 연령이 없다는 점을 문서에 적을 것 ② 4-1의 '앱은 만 14세 이상을 대상으로' 문장이 약관에도 그대로 들어가면 '최소 연령'으로 읽힐 여지가 생기므로 약관에는 쓰지 말 것 |

## 6. 놓친 것

| # | 심각도 | 파일:줄 | 내용 |
|---|---|---|---|
| 6-1 | 낮음 | `age-rating-answers.md:7` | '거짓 답은 … 삭제 사유'의 출처로 Apple 'Set an app age rating'을 들었는데 **그 페이지에 그런 문장이 없다**(R2 확인). Apple 쪽 출처는 App Review Guidelines 2.3.6(연령 등급 설문 정직 답변)으로 바꿀 것 |
| 6-2 | 낮음 | `age-rating-answers.md:70`, `:88`, `:167-173` | `ageGate.ts` 파일:줄 인용이 **main에 없는 파일**이다(`feat/c12-cloud-ui` 브랜치 `apps/mobile/src/cloud/ageGate.ts`). 6절 머리에 'C12'라고만 적혀 있어 경로를 찾을 수 없다 → 브랜치·전체 경로를 적을 것. 병합 뒤 줄 번호가 바뀌면 다시 맞출 것 |
| 6-3 | 낮음 [확인 필요] | `age-rating-answers.md` 전체 | 미국 출시를 하면 **주(州) 앱스토어 연령 확인법(유타·텍사스·루이지애나 등)과 Apple Declared Age Range API** 대응이 Age Assurance 답과 얽힐 수 있다. 시행·효력 정지 여부가 주마다 다르므로 이 리뷰에서 확정하지 않았다. 출시 국가에 미국이 들어가면 I절에 질문 한 줄을 더할 것. B-5가 언급한 **COPPA**(귀여운 캐릭터 + 연령 확인 전 전송)도 I절에서 빠졌다 |
| 6-4 | 낮음 | `privacy-policy.ko.md:184-186`(3-7) | '의견 보내기' 외부 설문은 연령 확인 없이 누구나 열 수 있다. 14세 미만이 설문에 개인정보를 적을 수 있으므로 설문 도구 확정 때 설문 첫 화면에 '이름·연락처를 적지 마세요' 또는 연령 안내를 둘 것 |
| 6-5 | 낮음 | `legal-review-questions.md:401`(I-5) | 제30조 기재 사항의 문언은 '전화번호 **등** 연락처'라 이메일만으로 충족된다는 해석이 가능하나, 보수적으로는 전화(050 포함)를 권한다. 질문은 그대로 두면 된다 |

## 7. 과한 것

| 심각도 | 파일:줄 | 내용 |
|---|---|---|
| 낮음 | `legal-review-questions.md:398`(I-2) | 게임산업법 제34조 제1항 제2호는 '받은 등급과 다른 **등급**을 표시'하는 것을 막는다. '만 14세 이상을 대상으로 만들었어요'는 등급 표시가 아니라 대상 설명이라 위험이 낮다. 질문은 남겨도 되지만 12-05 필수 묶음에서는 우선순위를 낮춰도 된다. 4-1대로 '계정 기능 14세 이상'으로 바꾸면 질문 자체가 사라진다 |
| 낮음 | `age-rating-answers.md:119` | Age Suitability URL을 비우는 판단은 맞다. 다만 '넣으면 그 페이지도 심사 대상'이라는 이유는 R2에 없는 추측이다 — '선택 항목이라 비움'으로 충분 |

## 8. 좋은 점(유지)

- 공식 문서 원문을 인용하고 '확인 못 한 것'을 따로 적었다(`age-rating-answers.md:22`).
- Apple 한국 지역 등급이 9+/4+ 모두 All이라는 계산, Made for Kids를 고르면 되돌릴 수 없다는 점, RCN 절차가 R1·R2와 맞다.
- `gate.ts` metricsConsent opt-out 결함을 찾아 로드맵 C11에 넣은 것은 처리방침 K1·K25와 V22 ③을 지키는 데 중요하다(`roadmap.md:135`).

## 9. 12-19 전 할 일 요약

1. 콘솔에서 13~15 체크 시 Families 추가 질문이 뜨는지 캡처 → 2절 결정, I-1에 첨부 (중간)
2. 처리방침 4절 첫 문장을 P8 문장으로 되돌리거나 DECISIONS에 대체 결정 기록, 테스터판 보호자 줄 복원 (중간·낮음)
3. 처리방침 3-2·3-3에 처리 근거 명시, I-3을 근거 기준 질문으로 고침 (중간)
4. `age-rating-answers.md` 3-3에 Medical None 근거(긴급 줄), Health/Wellness 'Infrequent' 삭제, 7행 출처 교체, ageGate 경로 보강 (중간·낮음)
