# 스토어 등급 설문 답안 — 타깃 만 14세 이상 (로드맵 D9)

- 작성: 출시·정책 담당 / 2026-11-25 / v0.1(초안, 법률 검토 전)
- 범위: Google Play 콘텐츠 등급(IARC) · Play 타깃층과 콘텐츠 · Families 정책 해당 여부 · Apple App Store 연령 등급(2025-07 공지, 2026-01-31부터 필수인 개정 설문) · 한국 게임물 자체등급분류(구글·애플 경유)
- 기준 빌드: **빌드 2(12-19, 맡겨 두기·링크 코드는 들어 있고 플래그 꺼짐)와 1.0 RC(01-05)**. Apple은 1.0 기능을 켠 상태로 심사받으므로(서버 아키텍처 3-11) 1.0 기능까지 넣어 답한다. 이 문서는 `store-listing.md` 6절의 근거 문서다. 6절과 이 문서가 다르면 이 문서를 먼저 고치고 6절을 맞춘다.
- 정본 결정: DECISIONS D-06 개정(타깃 만 14세 이상, `DECISIONS.md:133`·`:308`), D-23 ②(계정 직전 중립형 연령 확인, 미달은 기기에만, `DECISIONS.md:134`), V22 ③(통계 토글은 14세 확인 통과자에게만, `DECISIONS.md:461`), 실제 걸음도 14세 확인 통과자에게만(`DECISIONS.md:521`), D-05 수익 [잠정](`DECISIONS.md:123-127`), B5 신고·이름 가리기(`DECISIONS.md:412-417`)
- 원칙: **거짓 답은 등급 취소·앱 삭제 사유**다(Google 9898843, Apple 'Set an app age rating'). 애매하면 보수적으로(높은 쪽·'있음' 쪽) 답하고, 그 때문에 등급이 바뀌는지 표에 적는다. 콘솔 화면 문구가 아래 표와 다르면 **콘솔 원문이 정본**이다 — 입력 때 원문을 이 문서에 옮겨 적고 날짜를 붙인다.

### 출처 (모두 2026-11-25 확인)

| # | 문서 | 주소 | 이 문서에서 쓴 것 |
|---|---|---|---|
| S1 | Apple App Store Connect 도움말 'Age ratings values and definitions' | https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions | 설문 묶음·항목 이름과 정의, 항목 → 등급(4+/9+/13+/16+/18+) 표, 한국 지역 등급(All/12+/15+/19+) 표 |
| S2 | Apple 'Set an app age rating' | https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating | 입력 순서(in-app controls·capabilities → 묶음별 빈도 → Age Suitability URL), Made for Kids, Override to Higher Age Rating, EULA 최소 연령 규칙, 한국 RCN |
| S3 | Apple 'Updated age ratings in App Store Connect'·'Age Rating Updates' | https://developer.apple.com/news/?id=ks775ehf · https://developer.apple.com/news/upcoming-requirements?id=07242025a | 새 등급 13+·16+·18+, 새 질문(in-app controls, capabilities, medical or wellness, violent themes), **2026-01-31까지 답하지 않으면 업데이트 제출 불가** |
| S4 | Google Play 'Manage target audience and app content settings' | https://support.google.com/googleplay/android-developer/answer/9867159 | 연령 묶음 6개, **13~15·16~17은 'may be considered to include children in some locales'**, 18+만이면 Restrict Minor Access, 아동 묶음이 있으면 Families |
| S5 | Google Play 'Families policies' | https://support.google.com/googleplay/android-developer/answer/9893335 | '아동'은 지역·맥락마다 다름(나이를 정하지 않음), 아동을 겨냥한 그림·말이 타깃 판단에 영향 |
| S6 | Google Play 'Content ratings'·'Content rating requirements' | https://support.google.com/googleplay/android-developer/answer/188189 · https://support.google.com/googleplay/android-developer/answer/9898843 | IARC 등급 필수, 답이 바뀌는 업데이트는 설문 다시 제출, 한국 게임 = GRAC 등급(전체·12·15·19), 그 밖 지역 = IARC Generic |
| S7 | IARC 'Ratings Definitions' | https://www.globalratings.com/ratingsguide.aspx | Generic 3+/7+/12+/16+/18+ 정의 |
| S8 | 우리 조사 `docs/research/03-store-release.md` 3-1 | (내부) | 자체등급분류사업자 구조, 2026-11-02 GCRB 이관 |

> **확인 못 한 것(그대로 적음)**: IARC 설문 문항 원문은 공개 도움말(S6·S7)에 없다. 6-1 묶음 이름은 우리 전 문서(`store-listing.md` 6-1)와 IARC 등급 정의에서 온 것이고, 문항 문장은 **콘솔에서 처음 열 때 옮겨 적는다**. Apple '빈도(Infrequent/Frequent)'의 정의도 S1 공개 부분에서 찾지 못했다. Play '아동 어필' 문항 문장도 S4에 없다(S4는 '어린 캐릭터·유아풍 그림이 있으면 거절될 수 있음'만 적는다).

---

## 0. 한 줄 결론

| 스토어·항목 | 고를 답 | 예상 결과 |
|---|---|---|
| Play 콘텐츠 등급(IARC) | 폭력·공포·성·약물·도박·비속어 모두 아니요. 사용자 상호작용은 **예(보수적)**, 위치·디지털 구매·무제한 인터넷은 아니요 | 한국 GRAC **전체이용가**, Generic 3+(상호작용 표시 'Users Interact'가 붙을 수 있음) |
| Play 타깃 연령 | **16~17 + 18세 이상**(13~15 고르지 않음) | Families 정책 대상 아님. 14~15세는 막지 않음 — 처리방침·설명에 '만 14세 이상 대상' |
| Play 아동 어필 | 아니요 [오너 확인] | 캐릭터가 귀여워 Google 판단 위험은 남음(2절) |
| Play 광고 포함 | 아니요(지금) | D-05 (나) 채택 시 예 |
| Apple 연령 등급 | Age Assurance 예, User-Generated Content 예, **Health or Wellness Topics 예(보수적)**, 나머지 없음 | 전 세계 **9+**, 한국 지역 **All(전체)** |
| Apple Made for Kids | Not Applicable | Kids 카테고리 아님 |
| Apple Override | 하지 않음(앱 자체의 최소 연령 없음, 4절 A-2) | — |
| 한국 자체등급분류 | 구글(IARC)·애플(설문) 결과를 그대로 받음 | 전체이용가. 결과가 다르면 Apple은 RCN 입력 |

`store-listing.md` 6-3의 '예상 등급 4+'는 **9+로 바뀐다**(3절 Health or Wellness Topics). 아래 3-3에 이유를 적었다.

---

## 1. Google Play 콘텐츠 등급(IARC)

> 문항 원문 확인 전이므로 묶음 단위로 답한다. 카테고리 = 게임.

| # | 묶음(문항 요지) | 고를 답 | 근거(기능·문서, 파일:줄) | 등급 영향 |
|---|---|---|---|---|
| G1 | 폭력·유혈 | 아니요 | 다치거나 죽는 표현 없음, 처벌 없음(D-03). 오래 비워도 '아프거나 사라지지 않아요'(`store-listing.md:83`) | 없음 |
| G2 | 공포·겁주는 장면 | 아니요 | 밤 연출은 잠듦, 눈은 감은 호(`store-listing.md:191`) | 없음 |
| G3 | 성적 내용·노출 | 아니요 | — | 없음 |
| G4 | 비속어·혐오·조잡한 유머 | 아니요 | 앱이 내놓는 문장은 사람이 쓴 원작뿐(런타임 LLM 없음, `DECISIONS.md:107`). 유저가 쓴 낱말은 기기 안에서 읽고 다른 사람에게 보이지 않음, 공유물에 글자 없음(처리방침 ko 3-4·5절, `packages/core/src/snap/publicSnapshot.ts:220` 허용 목록에 글자 칸 없음). 이름은 공개 시 금칙어·서버 판정(`apps/server/src/pages/name-blocklist.ts`) | 없음 |
| G5 | 약물·술·담배 | 아니요 | — | 없음 |
| G6 | 도박·모의 도박·확률형 | 아니요 | 확률형 뽑기 금지(D-05, `DECISIONS.md:126`) | 없음 |
| G7 | **민감 주제(자살·자해 언급)** — 문항이 있으면 | **아니요 + 콘솔 원문 확인** | 앱 콘텐츠는 자살·자해를 그리거나 이야기하지 않는다. 유저가 위기 낱말을 쓰면 몽망이가 곁에 와 숨을 쉬고 '이야기 나눌 곳' 쪽지를 둔다(`docs/design/concept-v3/heart-grain-48.md:361-375`). 쪽지 문장은 지지·연락처 안내뿐이고 방법·수단 낱말 0(법률 v1 E-5, `legal-review-v1.md:109`). 판단은 4절 A-1 | 없음(예상). 문항이 '언급(reference)'까지 묻는다면 '예'로 답하고 등급 변화를 기록 |
| G8 | 사용자 간 상호작용·콘텐츠 공유 | **예(보수적)** | 앱 안 채팅·피드·자유 글 없음. 다만 1.0 '링크로 공유'가 몸 그림·이름(선택)을 공개 웹 페이지에 올린다(처리방침 ko 3-4·5절). 방문자가 할 수 있는 것은 미리 정한 반응과 신고 4사유뿐(`packages/contract/src/index.ts:1018`) — 판단은 4절 A-3 | 등급 변화 없음, 'Users Interact' 표시가 붙을 수 있음 |
| G9 | 위치 공유 | 아니요 | 위치 권한 0(`apps/mobile/app.json`에 위치 권한 없음), IP로 위치를 추정·저장하지 않음(`store-listing.md:277`). 위기 연락처의 나라는 기기 지역 설정 코드만 씀(`heart-grain-48.md:380`) | 없음 |
| G10 | 디지털 상품 구매 | 아니요 | 결제 0, 결제 SDK 없음(`apps/mobile/package.json`). D-05 (가) '공방 열쇠'가 들어가면 그 판 전에 '예'로 다시 제출 | 없음 |
| G11 | 무제한 인터넷 접근 | 아니요 | 앱 안 브라우저 없음. 의견 설문·도움 연락처 링크는 시스템 브라우저/전화 앱으로 연다 | 없음 |
| **예상** | | | | 한국(게임) **GRAC 전체이용가**, 그 밖 지역 **IARC Generic 3+** 또는 각 기관 최저 등급 |

- **손글씨 인식(ML Kit)**: 기기 안 인식이고 결과를 다른 사람에게 보이지 않으므로 등급 문항과 관계없다. Data safety(7절)에서만 다룬다.
- **다시 제출하는 때**: 광고·결제 추가, 공유 기능 범위 변경(예: 글자를 공유물에 넣기), 위기 쪽지 범위 변경, 1.0 직후 '밤물'(다른 사람과 먹 조각을 주고받음 — 상호작용 문항 재검토).

## 2. Google Play 타깃층·콘텐츠(App content)

| # | 항목 | 고를 답 | 근거 | 결과 |
|---|---|---|---|---|
| T1 | 타깃 연령 묶음 | **16~17, 18세 이상** | Play 묶음은 '5 이하·6~8·9~12·13~15·16~17·18+'(S4). 13~15는 **'일부 지역에서 아동을 포함하는 것으로 볼 수 있다'**(S4 원문 'may be considered to include children in some locales'), Families는 '아동을 포함하는 묶음이 하나라도 있으면' 적용(S4). 한국 개인정보 보호법·퀘벡 Law 25는 만 14세 미만을 아동으로 다루므로, 13~15를 고르면 13세(아동)를 겨냥한다고 선언하는 셈이 되어 Families 요건이 붙을 수 있다. 우리 타깃은 만 14세 이상(D-06)이라 13~15를 고르면 사실보다 넓어진다 | Families 정책 대상 아님 |
| T2 | 14~15세 이용 | 막지 않음(선언 밖이지만 이용 허용) | 기기 안 게임은 누구나, 계정 기능·통계는 14세 확인 통과자만(처리방침 ko 4절 `privacy-policy.ko.md:188-194`, 앱 `ageGate.ts:9` `MIN_AGE = 14`) | 법률 v1 B-5는 '13~15 포함'을 사실에 가깝다고 봤다 → **S4 문구로 판단이 갈리므로 법률 질문 I-1로 다시 묻는다** |
| T3 | Restrict Minor Access | 켜지 않음 | 18+만 고를 때만 가능(S4). 우리는 16~17을 고름 | — |
| T4 | 아동에게 어필할 수 있는가(콘솔이 물으면) | **아니요** [오너 확인] | 스토어 문구에 아동 말 0(`store-listing.md:13`·`:417`), 스크린샷 손은 성인 손·세상 가족 낱말(`store-listing.md:325-326`), 설명 끝 '만 14세 이상을 대상으로'(`store-listing.md:98`·`:140`). 위험: 먹 방울 캐릭터가 귀엽다 — S5는 '아동을 겨냥한 것으로 볼 수 있는 그림·말'이 Google 판단에 영향을 준다고 적는다. 아이콘·피처 그래픽은 아동풍 원색·말풍선 없이 수묵 톤(아트 바이블) | Google이 아동 어필로 보면 Families 요건 요구 가능 |
| T5 | 광고 포함 | 아니요(지금 빌드) | 광고 SDK 0(`apps/mobile/package.json`). D-05 (나) '보상 광고 1곳'은 [잠정] | 채택 시 '예' + 처리방침 A1(광고 개정 목록) — 14세 미만·연령 미확인 이용자에게는 비맞춤 광고만 |
| T6 | 건강 앱 선언 | 건강 기능 없음 | 위기 쪽지는 상담·의료 기능이 아니고 스토어 문구로 소개하지 않음(`store-listing.md:208`, 법률 v1 E-7) | — |
| T7 | Data safety | `store-listing.md` 7절(이 작업 범위 밖) | — | — |

**Families 정책 해당 여부: 해당 없음(예상).** 조건은 ① 타깃에 아동 묶음이 없고(T1) ② Google이 아동 어필로 보지 않는 것(T4)이다. ②가 뒤집히면 Families 요건(자가인증 광고 SDK만, 위치 권한 금지 등 — `docs/research/03-store-release.md` 4-4 표)을 따져야 한다. 지금 빌드는 광고·위치가 없어 영향이 작고, 연령 확인 화면이 이미 중립형(기본값 없음·기준 숫자 비노출, `ageGate.ts:1-4`)이라 혼합 연령 요건의 '중립 연령 화면'과도 맞는다.

## 3. Apple App Store 연령 등급 (개정 설문)

> 입력 순서(S2): ① in-app controls·capabilities 고르기 → ② 묶음별 빈도(None/Infrequent/Frequent) 또는 예·아니요 → ③ Age Suitability URL(선택) → ④ Age Categories and Override. 항목 이름·정의는 S1 원문(2026-11-25).

### 3-1. In-App Controls

| 항목(S1 정의 요지) | 고를 답 | 근거 | 등급 |
|---|---|---|---|
| Parental Controls(보호자가 자녀의 접근을 관리하는 설정) | 아니요 | 보호자 기능 없음 | — |
| **Age Assurance**('특정 콘텐츠·서비스에 접근할 때 나이가 기준을 넘는지 확인하는 장치') | **예** | 링크로 공유·맡겨 두기·(1.0 직후) 밤물·이용 통계 앞의 중립형 연령 확인(`ageGate.ts:38-43` 판정, `:60-68` 같은 날 다시 묻지 않음, `:83-86` 통과만 서버로). 자기 신고형이지 신원 확인은 아님 | 4+(영향 없음) |

### 3-2. Capabilities

| 항목 | 고를 답 | 근거 | 등급 |
|---|---|---|---|
| Unrestricted Web Access | 아니요 | 앱 안 브라우저 없음 | (예면 16+) |
| **User-Generated Content**('유저가 만든 콘텐츠의 넓은 배포가 앱 경험의 일부') | **예(1.0)** | '링크로 공유'가 유저가 키운 몽망이 그림·이름(선택)을 공개 URL로 배포. 안전 장치: 이름 기본 숨김, 금칙어, 신고 4사유·서로 다른 3명 7일 자동 숨김, 링크 끄기, 운영자 이름 가리기(`DECISIONS.md:413-417`). 빌드 2(플래그 꺼짐)만 내는 동안에도 코드가 들어 있어 '예'로 둔다 | 4+(영향 없음) |
| Social Media(피드 등으로 많은 사람에게 퍼뜨림) | 아니요 | 피드·검색·추천 없음. 링크는 받은 사람만 엶 | (예면 13+) |
| Messaging and Chat | 아니요 | 유저끼리 글을 주고받는 기능 없음(반응은 미리 정한 것, 신고는 사유 코드뿐 — 자유 글 칸 0, `DECISIONS.md:414`) | — |
| Shared Location | 아니요 | 위치 0 | — |
| Advertising | 아니요(지금). D-05 (나) 채택 판에서 예 | 광고 SDK 0 | (예여도 4+) |

### 3-3. 그 밖의 묶음

| 묶음·항목 | 고를 답 | 근거 | 등급 |
|---|---|---|---|
| Mature Themes: Profanity/Crude Humor, Horror/Fear, Alcohol·Tobacco·Drugs, Dating and Relationships | 모두 None | G2·G4·G5 | — |
| **Medical or Wellness: Health or Wellness Topics**('자기 돌봄이나 생활 방식을 권하는 콘텐츠') | **예(Infrequent 수준) — 보수적** | 위기 낱말을 쓴 날 '힘든 날을 혼자 견디지 않아도 돼요… 사람과 이야기해도 괜찮아요' 쪽지와 늘 있는 '이야기 나눌 곳' 항목(`heart-grain-48.md:363-367`). 진단·치료 안내는 아니지만 '사람과 이야기해도 괜찮다'는 자기 돌봄 권유로 읽힐 수 있다. 4절 A-1 | **9+**(한국 지역 등급은 All) |
| Medical or Treatment Information('진단이나 질환 관리 안내') | None | 진단·치료·관리 안내 없음. 연락처 안내만(법률 v1 E-7) | (예면 13+/16+) |
| Sexuality or Nudity: Mature or Suggestive Themes('…복잡·강렬·민감한 성격 때문에 더 나이 든 이용자 대상인 주제, 현실 문제') | None [법률·출시 판단, 4절 A-1] | 앱이 자살·자해를 주제로 다루지 않는다. 유저 입력에 지지 쪽지로만 반응 | (Infrequent면 9+, 한국 12+) |
| Violence(만화·사실·무기) | 모두 None | G1 | — |
| Chance-Based: Gambling, Simulated Gambling, Contests, Loot Boxes | 모두 None/아니요 | G6. 순위·겨루기 없음(Contests 정의 '서로 겨루어 순위·보상') | — |
| **예상** | | | **전 세계 9+ / 한국 지역 All** (Health or Wellness를 None으로 답하면 4+ / All) |

### 3-4. Age Categories and Override, 그 밖

| 항목 | 고를 답 | 근거 |
|---|---|---|
| Made for Kids | **선택 안 함(Not Applicable)** | Kids 카테고리 미참여(D-06). S2: 한 번 승인되면 바꿀 수 없다 |
| Override to Higher Age Rating | **하지 않음** | S2: 'EULA에 Apple 계산 등급보다 높은 최소 연령이 있으면 그 등급으로 올려야 한다'. 우리 앱에는 **앱 전체의 최소 연령이 없다** — 기기 안 게임은 누구나, 14세 기준은 계정 기능에만 있다(처리방침 ko 4절). 이용약관(A-4, 아직 없음)을 만들 때 '앱 이용 최소 연령 14세'로 쓰면 13+로는 부족해 **16+로 올려야 하는 문제**가 생긴다 → 약관은 '계정 기능 14세 이상'으로만 쓴다(법률 질문 I-3) |
| Age Suitability URL(선택) | 비움 | 넣으면 그 페이지도 심사·표시 대상. 필요해지면 `https://mongmang.ink`의 '몇 살부터' FAQ(`apps/web-static/scripts/site.mjs:84`) |
| Korea RCN | 처음엔 비움 | GRAC/GCRB가 다른 등급을 내면 App Review가 연락 → RCN 입력·새 판 제출(S2) |

## 4. 따로 판단한 것

### A-1. 위기 도움말·자살 예방 내용이 '민감 주제' 답에 주는 영향

- **사실**: 앱은 유저가 쓴 낱말이 위기 낱말이면 ① 몽망이가 곁에 와 함께 숨을 쉬고 ② (strong이면) 지지 문장과 나라별 연락처 버튼이 든 쪽지를 둔다. '이야기 나눌 곳'은 공방 노트에 늘 있다(`heart-grain-48.md:361-375`, 연락처 정본 `docs/ops/crisis-resources.md`). 위기 낱말·결과는 기기 밖으로 나가지 않는다(처리방침 ko 2절·K12~K13).
- **판단**: 앱이 자살·자해를 **그리거나 주제로 삼지 않는다**. 유저 입력에 대한 지지 반응과 연락처 안내다. 그래서
  - IARC(G7): 묘사·언급 문항이 있으면 '아니요'가 사실에 가깝다. 다만 문항이 '앱 안에 자살·자해 관련 언급이 있는가'처럼 넓게 묻는다면 '예'로 답한다(쪽지 문장이 위기 상황을 전제로 하므로). 콘솔 원문을 옮겨 적고 결정한다.
  - Apple: 'Mature or Suggestive Themes'는 None, **'Health or Wellness Topics'는 보수적으로 예** → 9+. 비용은 '4+ → 9+' 표시 하나이고(한국 지역 등급은 둘 다 All), 심사자가 쪽지를 발견했을 때 '숨겼다'로 읽힐 위험을 없앤다. 스토어 문구에는 이 기능을 계속 소개하지 않는다(`store-listing.md:12`) — 설문 답과 마케팅 문구는 별개다.
- **바뀌는 조건**: 쪽지에 상담 기법·호흡 지도 같은 '관리 안내'를 넣으면 Medical or Treatment Information 재검토(13+ 이상 가능). 28밤 결말 B('꿈으로 떠나요')를 넣으면 죽음 비유 금지 규칙(`heart-grain-48.md:375`)과 함께 Mature Themes 재검토.

### A-2. 앱 전체 최소 연령을 두지 않는 이유와 등급의 관계

- 콘텐츠 등급(전체이용가·9+)은 '누가 봐도 되는가', 타깃 만 14세 이상은 '누구를 위해 만들었나'다(`store-listing.md:206`). 둘은 별개이며 모순이 아니다.
- 만약 '만 14세 미만은 앱을 쓸 수 없다'로 바꾸면: Apple은 Override로 16+(14를 담는 가장 낮은 등급), Play는 연령 확인을 앱 진입에 둬야 하고, 연령 확인 전 전송(업데이트 확인·ML Kit 진단)이 모든 설치자에게서 일어나는 문제는 그대로 남는다. 지금 설계(기기 안 게임은 열고, 계정·통계만 잠금)가 데이터 최소화와 맞다.

### A-3. 사용자 생성 콘텐츠(이름·공유 링크·신고 B5)

| 요소 | 다른 사람에게 보이나 | 안전 장치 | 설문 영향 |
|---|---|---|---|
| 쓴 낱말(손글씨) | 아니요 — 기기 안에서 읽음, 공유물에 글자·말결 없음 | 공개 스냅숏 허용 목록에 글자 칸 없음(`publicSnapshot.ts:220`) | 없음 |
| 몽망이 이름 | 링크 페이지에서 **이름 공개를 켠 경우만**(기본 꺼짐, `DECISIONS.md:301`) | 금칙어·숫자 검사(서버), 운영자 이름 가리기(`DECISIONS.md:417`) | Apple UGC 예, IARC 상호작용 예의 근거 |
| 공개 페이지(몸 그림·포스터·8초 루프) | 링크를 받은 사람 | 신고 4사유·자유 글 0, 서로 다른 3명/7일 자동 숨김(운영 기본 꺼짐, B6 실측 뒤 켬), 링크 끄기, 삭제 | 같음 |
| 방문자 반응 | 미리 정한 반응뿐 | 글 입력 0 | Messaging 아니요 |

- Apple 1.2(UGC 앱 요건: 신고·차단·연락처)는 1.0 제출 때 대조한다 — 신고·링크 끄기·연락처(hello@)는 있고, '차단'은 1:1 소통이 없어 대상이 없다고 본다 [확인 필요: 1.0 심사 메모에 적기].

### A-4. 손글씨 인식 · 위치 0 · 결제 0 · 광고(D-05 잠정)

| 항목 | 지금 | 설문에 주는 영향 | 바뀌면 |
|---|---|---|---|
| 손글씨 인식(ML Kit, 기기 안) | 모든 설치자, 연령 확인 전에도 진단 전송 | 등급 설문 0. Data safety·처리방침만(법률 H-1·H-2) | 키보드 대체로 바뀌어도 등급 영향 없음 |
| 위치 | 권한 0, IP 위치 추정 0 | IARC G9 아니요, Apple Shared Location 아니요 | — |
| 결제 | 0 | IARC G10 아니요 | D-05 (가) 채택 판 전에 G10 예로 다시 제출. 등급 변화 없음 |
| 광고 | 0 | Play '광고 포함' 아니요, Apple Advertising 아니요 | D-05 (나) 채택 판 전에 둘 다 예. Apple 4+ 영향 없음. 14세 미만·연령 미확인 이용자 비맞춤 광고(처리방침 ko A1), Families가 아니므로 자가인증 SDK 의무는 없지만 처음부터 고르는 것을 권함(`03-store-release.md` 4-4) |

## 5. 한국 게임물 자체등급분류(구글·애플 경유)

- 구조: Google·Apple은 자체등급분류사업자다. 우리가 따로 신청하지 않고 **Play는 IARC 설문 결과로 GRAC 등급**(전체·12·15·19, S6), **App Store는 Apple 설문 결과에 한국 지역 등급**(All·12+·15+·19+, 게임·엔터테인먼트 카테고리에 표시, S1)이 붙는다. 2026-11-02부터 모바일 게임 등급분류 업무 일부가 GCRB로 넘어갔고 자체등급분류 구조는 그대로다(`03-store-release.md` 3-1).
- 예상: Play **전체이용가**, Apple 한국 **All**(9+든 4+든 같음).
- 15세이용가 기준(S1 한국 표)은 Unrestricted Web Access·Social Media·Frequent Medical — 우리는 모두 없음.
- 등급 표시: 홍보물에 다른 등급을 쓰면 안 된다(게임산업법 제34조 제1항 제2호, `legal-review-questions.md` G절). 스토어 문구의 '만 14세 이상 대상'은 **등급이 아니라 타깃 설명**이라는 점을 법률 질문 I-2로 확인한다.
- 게임제작업 등록(A-1)과 등급 전 홍보(G절)는 별도 질문에 있다.

## 6. 만 14세 미만이 들어왔을 때 — 문서끼리 맞춘 표

| 상황 | 앱(C12 `ageGate.ts`, 읽기만) | 처리방침 ko·en 4절 | 스토어 |
|---|---|---|---|
| 기기 안 게임 | 누구나 | 누구나 | 설명 '만 14세 이상을 대상으로'(대상 선언) |
| 링크로 공유·맡겨 두기(·밤물) | 연령 확인 '미달' → 계정 만들지 않음, 익명 로그인 안 함(`ageGate.ts:4`) | 같음 | — |
| 이용 통계 | 14세 확인 통과자에게만 토글이 보이고 기본 꺼짐 | 같음(3-1·4절) | Data safety '선택' |
| 미달 기록 | `under:<날짜>`만, 같은 날 다시 묻지 않음(`ageGate.ts:65-66`) | '미달'과 날짜만, 같은 날 다시 묻지 않음 | — |
| 경계 달 | **태어난 달이 이번 달이면 아직 생일 전으로 봄**(`ageGate.ts:34-37`) | 이번 판에서 4절에 한 줄 더함 | — |
| 업데이트 확인·ML Kit 진단 | 연령과 관계없이 | 연령과 관계없이(4절 넷째 줄) | — |

- **어긋남 하나(코드, 이 작업에서 고치지 않음)**: 본 저장소 `apps/mobile/src/net/gate.ts:13-19`의 `metricsConsent`는 토글이 연결되면 '끈 표시가 없으면 켜짐'(opt-out)으로 읽는다. 처리방침 K1·K25와 V22 ③은 **opt-in(명시적 켬만) + 14세 확인 통과자만**이다. 지금은 `METRICS_SETTING_CONNECTED = false`라 핑이 나가지 않으므로 문제가 드러나지 않는다 — 토글을 연결하는 C 항목에서 고쳐야 한다(K25 '구현 전'과 같은 줄).

## 7. 콘솔에 넣는 때와 순서

| 때 | 할 일 | 담당 |
|---|---|---|
| 12-05 | 법률 회신(`legal-review-questions.md` I-1~I-6) 반영. I-1이 '13~15 포함'이면 T1·T4·Families 절을 다시 쓴다 | 출시·정책 |
| 12-19 빌드 2 제출 전 | Play: IARC 설문(1절), 타깃층(2절), 광고 아니요. **IARC 문항 원문을 이 문서 1절에 옮겨 적기** | 오너(콘솔), 출시·정책(원문 대조) |
| 01-07 TestFlight 베타 심사 전 | Apple 연령 등급(3절). 2026-01-31부터 개정 설문 답이 없으면 제출 불가(S3) | 오너(콘솔) |
| 광고·결제·공유 범위가 바뀌는 판 전 | 1절 G8·G10, 2절 T5, 3절 Advertising 다시 답하고 다시 제출 | 출시·정책 |
