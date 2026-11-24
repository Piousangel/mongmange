# GEO v1 — AI 답변 엔진이 몽망이를 정확히 말하게 하기

- 작성: GE-1(GEO)·SE-2(웹 SEO) / 2026-11-24 / v1 → **v1.1(2026-11-25): 독립 리뷰 `docs/team/reviews/2026-11-25-web-prelaunch-review.md`(보류: 차단 2·중요 5·경미 7)와 PM 11-25 결정 반영**
- 범위: mongmang.ink 출시 전 판(`/`·`/facts`·`/press`·`/privacy`, 한·영)과 GEO 기본기(사실 페이지·FAQ 구조화 데이터·`/llms.txt`·sitemap·robots).
- 코드: `apps/web-static/scripts/site.mjs`(사실 FACTS 한 곳 → 모든 페이지·JSON-LD·llms.txt), `scripts/markdown.mjs`(처리방침 렌더), `scripts/build.mjs` 검사 ⑦, 시험 `test/site.test.mjs`.
- 캡처: `docs/app/web-prelaunch/`(`node scripts/web-prelaunch-capture.mjs`).
- 표시: [확인 필요] = 사실 확인 전, [팀 추정] = 근거 없는 판단, [오너 결정] = 오너가 정할 것.

---

## 0. 결론

1. **2026년 기준, AI 답변 엔진에 잘 나오는 법은 '좋은 SEO'와 거의 같다.** Google은 AI Overviews·AI Mode에 특별한 최적화·특별한 마크업·llms.txt가 필요 없다고 공식 문서에 적었다(1절). 그래서 우리가 할 일은 ① 사실을 **글자로**, **한 곳에서**, **크롤러가 읽을 수 있게** 두고 ② 검색 크롤러를 막지 않는 것이다.
2. **사실 한 곳 원칙**: 같은 사실(가격·연령·플랫폼·출시 시기)이 페이지마다 다르게 적히면 AI가 엇갈린 답을 낸다. 사실은 `site.mjs` FACTS 한 곳에서 화면·JSON-LD·llms.txt로 나간다. 정본 문서와의 대조는 3절 표.
3. **JSON-LD는 보이는 글과 같을 때만 쓴다.** FAQPage 구조화 데이터는 화면의 질문·답과 글자까지 같아야 빌드가 통과한다(검사 ⑦).
4. **llms.txt는 비용이 거의 없어서 둔다. 효과는 약속하지 않는다.** 주요 AI 검색 회사가 읽는다는 공식 확인이 없다(1절). 개발 도구·에이전트가 읽는 경우가 있어 사실 요약 한 장으로 둔다.
5. **출시 전이라 약속하지 않는다.** 출시는 '준비 중'만(시기·날짜 없음). D-05([잠정])보다 강한 약속('광고 없음'·'결제 없음')을 쓰지 않고, 아직 구현되지 않은 동작(처리방침 K1·K9·K11·K25)은 현재형 사실이 아니라 '준비 중인 원칙'으로만 쓴다(marketing-plan 1절, 리뷰 I2·I3).
6. **출시 전 사이트의 /privacy는 '출시 전 개인정보 안내'다**(PM 11-25). 지금 받는 개인정보는 테스터 신청 메일뿐이라 그 사실만 적는다. 처리방침 v3.1 전체는 `SITE_MODE=launch` 빌드에서만 렌더하고, 렌더 HTML에 `[ … ]` 메모·작업 메모·체크리스트 행이 하나라도 있으면 빌드가 실패한다.

---

## 1. 조사 — 2026년 AI 답변 엔진 노출 방법

| 주제 | 지금 알려진 것 | 우리에게 뜻하는 것 | 출처 |
|---|---|---|---|
| Google AI Overviews·AI Mode | 핵심 검색 순위·품질 시스템을 그대로 쓴다. "AEO·GEO도 SEO"다. 색인되고 스니펫이 허용된 페이지여야 한다. 특별한 최적화 불필요 | 색인 가능·크롤 가능·글자로 된 사실 페이지가 기본. `noindex`·`nosnippet`을 사실 페이지에 두지 않는다 | [Google Search Central: Optimizing your website for generative AI features](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), [AI features and your website](https://developers.google.com/search/docs/appearance/ai-features) |
| 구조화 데이터 | AI 기능에 필수 아님, 특별한 schema.org 없음. 일반 SEO의 일부로 계속 쓰라고 권함. "구조화 데이터에 지나치게 매달리기"를 미신으로 꼽음. 마크업은 보이는 글과 같아야 한다 | SoftwareApplication·Organization·FAQPage를 **보이는 글과 같게** 최소로 | 위 Google 문서 |
| FAQ 리치 결과 | Google은 2023-08부터 FAQ 리치 결과를 권위 있는 정부·보건 사이트에만 보인다 | FAQPage 마크업은 리치 결과 목적이 아니라 '질문 → 답' 구조를 기계가 읽게 하는 용도. 효과를 약속하지 않는다 | [Google Search Central Blog 2023-08: Changes to HowTo and FAQ rich results](https://developers.google.com/search/blog/2023/08/howto-faq-changes) |
| llms.txt | 제안 형식(H1 · `>` 요약 · H2 아래 링크 목록). Google은 Search가 무시한다고 문서화. OpenAI 크롤러 문서에 언급 없음. 채택·조회 통계는 업체 조사뿐이고 서로 엇갈림(조회가 거의 없다는 보고가 많음) [확인 필요: 원자료] | 사실 요약 + 색인 페이지 링크만 담은 짧은 파일로 둔다. 효과 지표로 쓰지 않는다 | [llmstxt.org](https://llmstxt.org/), 위 Google 문서, [Search Engine Land: Does llms.txt matter?](https://searchengineland.com/does-llms-txt-matter-467740), [Ahrefs: What is llms.txt](https://ahrefs.com/blog/llms-txt/) |
| AI 검색 크롤러 | OpenAI `OAI-SearchBot`(ChatGPT 검색)·`GPTBot`(학습), Anthropic `Claude-SearchBot`(검색)·`ClaudeBot`(학습)·`Claude-User`(사용자 요청), Perplexity `PerplexityBot`(검색)·사용자 요청 수집기. 검색용과 학습용 토큰이 분리돼 있다. 검색 크롤러를 막으면 그 회사 답변에서 사이트가 덜 보인다 | robots.txt는 `User-agent: *` 하나로 모두 허용(설정·콘텐츠 폴더만 막음). 학습용 크롤러를 막을지는 [오너 결정](5절) | [OpenAI: Overview of OpenAI crawlers](https://platform.openai.com/docs/bots), [Anthropic: Does Anthropic crawl data from the web](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler), [Perplexity Crawlers](https://docs.perplexity.ai/guides/bots) |
| 글자·자바스크립트 | AI 답변은 공개되고 크롤 가능한 글을 근거로 쓴다. JS로 그린 글은 추가 부담 | 새 페이지는 **스크립트 0**, 모든 사실을 HTML 글자로. 언어마다 별도 주소(`/`·`/en`) + hreflang | 위 Google 문서 |
| '신뢰할 1차 자료' | 고유한 1차 정보·경험이 요약물보다 낫다. 가짜 '언급' 만들기는 효과 없음 | 사실 페이지·프레스킷·처리방침이 1차 자료. 외부 언급은 보도·크리에이터(marketing-plan 4-4·4-6)로 자연히 | 위 Google 문서 |

- 출시 뒤(B6 배포 후) 할 일: Google Search Console 속성 등록·sitemap 제출·'생성형 AI 실적' 보고서 확인, Bing Webmaster Tools 등록 [확인 필요: Copilot·ChatGPT 검색이 Bing 색인을 얼마나 쓰는지 공식 자료]. 이 문서 범위(배포 금지) 밖.

---

## 2. 무엇을 만들었나

| 주소 | 내용 | 색인 | 왜 |
|---|---|---|---|
| `/` · `/en` | 이름, D-26 한 줄, 실제 캡처 2장(눈 뜬 얼굴·첫 이레 두루마리), "겨울에 만나요", Android 비공개 테스트 안내(신청 = `hello@mongmang.ink` 글자, 출시 30일 뒤 삭제), 더 보기 링크 | index | marketing-plan 4-1 링크 페이지 출시 전 판 |
| `/facts` · `/en/facts` | 무엇·하루(벼루·붓·연적)·기본 정보·개인정보('지금' 2줄 + '준비 중인 원칙' 3줄)·하지 않는 것·FAQ 8문항, 마지막 확인 날짜 | index | GEO 1차 자료. AI가 인용할 '한 문장 = 한 사실' |
| `/press` · `/en/press` | 한 줄 소개, 기본 정보, 스크린샷 2장(실제 렌더, 원본 받기), 로고·아이콘·영상 자리(준비 중), '1인 개발', 연락처 | index | marketing-plan 4-4 |
| `/privacy` · `/en/privacy` | **출시 전 모드(기본)**: '출시 전 개인정보 안내' — 테스터 신청 메일 → 운영자 Gmail 전달(서버 저장 없음), Play 테스터 목록 등록, 정식 출시 30일 뒤 삭제, 문의처, 출시 때 전체 방침 게시. **출시 모드**: 처리방침 정본 전체(체크리스트 상자 제외) | index | 스토어 등록·`/delete`가 가리키는 주소 |
| `/delete` | 기존(B2) 그대로 | index | 바꾸지 않음 |
| `/m/{코드}` | Cloud Run(B3), `X-Robots-Tag: noindex` | **noindex** | 링크 코드 보호(B0 리뷰 I6) |
| `/sitemap.xml` | 색인 페이지 9개, 한·영 hreflang 짝 | — | |
| `/llms.txt` | 한·영 요약, 기본 정보, 하지 않는 것, 색인 페이지 링크 | — | 1절 |
| `/robots.txt` | 기존 규칙 + `Sitemap:` 줄. `/m/`은 막지 않음 | — | |

- JSON-LD(실행되지 않는 데이터 블록이라 CSP와 충돌 없음): 첫 화면 `WebSite`+`Organization`+`SoftwareApplication`, 사실 페이지 `+FAQPage`, 프레스킷 `Organization`+`SoftwareApplication`. `SoftwareApplication`·`WebSite`의 `@id`는 언어별(`/#app`·`/en#app`, 리뷰 L6), `Organization`은 하나. **사람 이름·전화·주소·창업자 칸 없음**, 메일은 `hello@mongmang.ink` 하나.
- 헤더: 생성 페이지마다 firebase.json에서 `Content-Security-Policy: frame-ancestors 'none'`·`X-Frame-Options: DENY`(meta CSP로는 frame-ancestors가 안 걸림, 리뷰 L5). `/img/**` 캐시 1시간(파일명에 해시 없음).
- llms.txt: H1 · `>` 요약 · 제목 없는 사실 목록 · H2(`Pages`·`Optional`) 아래는 링크 목록만(llmstxt.org 형식, 리뷰 L6).
- 언어 전환은 링크(`/` ↔ `/en`)다. 자동 언어 이동은 하지 않는다 — 크롤러(대개 en-US)가 한국어판을 못 보게 되기 때문이다. `/delete`만 기존 방식(한 파일, 브라우저 언어로 숨김) 유지.

---

## 3. 사실 대조표 (화면 문장 ↔ 정본)

정본이 바뀌면 이 표 → `site.mjs` FACTS 순서로 고치고, 날짜 `FACTS_CHECKED`를 바꾼다.

| # | 사이트 문장(한) | 정본 | 비고 |
|---|---|---|---|
| F1 | 먹으로 쓴 한 마디, 스물여덟 밤. | DECISIONS D-26 제목 '먹으로 쓴 한 마디 × 스물여덟 밤' | 영: One word in ink, twenty-eight nights. [카피팀 검수] |
| F2 | 한지 위의 먹 한 방울을 키우는 모바일 게임, 날마다 붓으로 낱말 하나 → 글자를 마시고 몸으로 대답, 스물여덟 밤 | D-26 선택·생애, store-listing 3-1 '한지 위에 먹 한 방울' | '하루 한 획'(D-10)은 D-26이 '하루 한 마디'로 대체 — 옛 문구를 쓰지 않음 |
| F3 | 벼루에 먹을 갈고 → 붓으로 낱말 하나(가장 긴 획은 몸에) → 연적에 내려놓으면 꿈 | D-26 '하루 의례' | D-26이 '5일 검증 뒤 세부 확정'이라 화면에 "세부는 테스트로 다듬는 중" 한 줄 |
| F4 | 28밤 뒤 그 말로 자란 몽망이가 남음, 점수·수치 안 보임 | D-26 생애·'점수·수치는 화면에 보이지 않음' | 28밤 뒤 처리(곁에 남음/떠남)는 팀 결정 전이라 쓰지 않음 |
| F5 | 플랫폼 iOS, Android | D-06, store-listing | |
| F6 | 언어 한국어, 영어 | D-06 '영어+한국어 동시' | |
| F7 | 무료로 내려받아요 / 확률형 아이템과 화면을 가리는 광고는 넣지 않아요 | D-05 [잠정] 1.0 후보 (가)·(나) 모두 무료 시작, 금지 목록(확률형 뽑기·전면 광고) | **v1.1**: '광고 없음·결제 없음' 삭제 — D-05 (가)는 판매 품목, (나)는 보상 광고 1곳이 있어 정본보다 강한 약속이었다(리뷰 I2) |
| F8 | 만 14세 이상 | D-06·D-23 개정, store-listing 6-2 | 콘텐츠 등급(전체이용가)과 별개 |
| F9 | 준비 중, 날짜는 테스트 뒤 | D-22 '관문 통과 즉시', marketing-plan 1절 '겨울에 만나요 수준' | **v1.1**: '2027년 초'도 시기 약속이라 뺐다(리뷰 L1) |
| F10 | 1인 개발 | marketing-plan 10절 오너 결정 ③ | **v1.1**: '이름 비공개' 문구 삭제 — 출시 때 처리방침 17절 보호책임자 성명(법정 필수)과 충돌(리뷰 I5) |
| F11 | 문의 hello@mongmang.ink | 처리방침 머리·17절, DECISIONS 11-24 법률 검토 뒤 결정 | 메일 경로 = Cloudflare 라우팅 → 오너 Gmail(처리방침 K31, 설정 전) |
| F12 | **지금**: 이 사이트는 쿠키·분석 도구 없음 / 지금 받는 개인정보는 테스트 신청 메일뿐, 출시 30일 뒤 삭제 | 빌드 검사 ④·⑦(스크립트·외부 요청 0), DECISIONS PM 11-25(30일), V22 ④(Cloudflare 라우팅 → Gmail, 서버 저장 없음) | |
| F12b | **준비 중인 원칙**: 한 마디는 기기 안에서 읽도록 / 통계 기본 꺼짐·14세 확인 뒤 직접 켤 때만 / 공유·보관은 켠 분만·앱에서 지울 수 있게 — 모두 '만들고 있어요' | 처리방침 v3.1 1절·3-1·12절 | K1(다름)·K9·K11·K25(구현 전)라 현재형으로 쓰지 않음(리뷰 I3). K표가 '일치'가 되면 '지금'으로 옮긴다 |
| F13 | 하지 않는 것: 광고, 확률형 뽑기, 에너지 제한, 키운 결과 판매, 모르는 사람 그림 피드, 앱 안 생성형 AI | D-05 금지 목록, 기획 v2.2 8절 #8 '피드 없음 유지'(plan-v2 520행), D-26 AI(기기 안 손글씨 인식 + 닫힌 사전, LLM은 출시 전 제작 도구), marketing-plan 2-3 'AI가 그려 준다 류 금지' | |
| F14 | FAQ 8문항 | F1~F13의 묶음(새 사실 없음) | 글씨 질문은 '기기 안에서 읽도록 만들고 있어요 · 확정은 출시 때 방침에' |
| F15 | Android 비공개 테스트: 14일, 만 14세 이상, Android 폰 + Google Play 로그인 Gmail, iPhone은 아직. 받은 주소는 테스터 등록·연락에만, 정식 출시 30일 뒤 삭제 | tester-recruit.md 1·2절, D-06(12명·14일), DECISIONS PM 11-25(30일) | |

### 4. 그림 출처(실제 렌더만, D-04)

| 사이트 파일 | 원본 | 손질 | 주연 규칙(number-one 3-2) |
|---|---|---|---|
| `img/face.jpg` 780×520 | `docs/app/flow-v1/03-first-tap-eyes.png` | 얼굴 둘레 자르기(DEV 버튼 제외) | ① 눈이 열리는 얼굴 |
| `img/first-ire.{ko,en}.jpg` 724×1200 | `docs/app/build1/share-ire-scroll-9x16.{ko,en}.png` | 위 1790px만 잘라 스토어 글자 줄('App Store · Google Play') 제외, 축소·JPEG | ③ 아침 카드(첫날~이레째 일곱 장) |
| ~~`img/morning-card.{ko,en}.jpg`~~ | ~~`build1/share-ire-card-4x5`~~ | **v1.1 삭제** — 카드 글이 컨셉 v2('첫 획은…')이고 아래 스토어 이름이 보였다(리뷰 L2). v3 화면 캡처가 나오면 다시 넣는다 | |

- 아이콘(`apps/mobile/assets/icon.png`)은 아직 Expo 기본 그림이라 쓰지 않았다. 프레스킷 '로고와 아이콘'은 자리만(아이콘 3안 시험 뒤, number-one 3-3).
- 첫 이레 두루마리도 빌드 1(컨셉 v2) 화면이다. 글은 날짜 이름뿐이라 남겼고, v3 캡처가 나오면 바꾼다. `og:image`는 얼굴(780×520).

---

## 5. 결정과 남은 것

| # | 내용 | 상태 |
|---|---|---|
| G1 | 페이지마다 언어별 주소(`/`·`/en/…`) + hreflang, 자동 언어 이동 없음 | 팀 결정(SE-2) — DECISIONS 반영은 PM |
| G2 | 처리방침은 정본 md를 빌드 때 렌더(복사본을 두지 않음), 내부 체크리스트 상자만 뺌 | 팀 결정 |
| G3 | robots.txt: AI 크롤러는 검색용·학습용(GPTBot·ClaudeBot·Google-Extended 등) 모두 허용 | **확정(PM 11-25)** — 공개 사실만 있고 개인정보가 없다. 시험이 'AI 크롤러별 차단 줄 없음'을 고정 |
| G4 | 처리방침 정본의 `[ … ]` 내부 메모·오너 기입 칸(현재 ko·en 합 46곳: 운영자·시행일·영문명·법률 검토·확인 필요·도입 시 추가 등)과 작업 메모(초안·판 이력) | **차단(K32)**: 출시 모드(`SITE_MODE=launch`, 전체 방침을 게시하는 빌드 — 개발·배포 모두)는 렌더 HTML에 하나라도 남으면 실패. 출시 전 모드는 정본을 게시하지 않으므로 개발 빌드에서 남은 수를 경고로만 알린다. 정본을 출시용으로 다듬는 일은 처리방침 담당 |
| G5 | 영어 이름은 'Mongmangi'(D-06 1순위)로 썼다 | 12-05 이름 테스트 뒤 확정 → FACTS.en.name·JSON-LD alternateName 교체 |
| G6 | `og:image`는 얼굴 780×520. 전용 1200×630 공유 그림은 아트 대기 | 남음 |
| G7 | 영상(8초·25초)·아이콘·보도자료 | 준비되면 프레스킷 자리를 채움 |
| G8 | 출시 모드로 바꿀 때 사이트 사실도 함께 바꾼다: F9(출시), F12 '지금'(테스터 메일만 → 앱 처리 요약), F12b(구현 확인이 끝난 원칙을 '지금'으로), 처리방침 정본에 '테스트 신청 메일' 행 추가(리뷰 I4, 처리방침 담당) | 출시 체크리스트 |
| G9 | `/delete`(B2)는 '개인정보처리방침 12절'을 가리키는데 출시 전 모드의 /privacy에는 12절이 없다 | /delete 담당(B2)에 문구 조정 요청 — 이번 범위에서 손대지 않음 |

## 6. 지키는 검사(빌드 ⑦, `apps/web-static/scripts/build.mjs`)

- 색인 정책 표(`site.mjs` PAGES)에 없는 HTML이 생기면 실패. index 페이지에 noindex, noindex 페이지에 robots meta 없음 → 실패. `/m`은 기존 ⑤(정적 파일 금지·X-Robots-Tag noindex).
- 사이트 안 링크·그림 주소는 파일 또는 firebase.json rewrite로 이어져야 하고, `#조각`은 대상에 있어야 한다. 상대 주소 금지.
- 그림: alt·width·height 필수, 한 장 160KB, 페이지 합 400KB.
- 생성 페이지: 실행 스크립트 0(JSON-LD만), canonical·hreflang, JSON-LD에 사람·연락 칸 없음·메일은 하나, FAQ 구조화 데이터 = 화면 글, 느낌표·이모지 0.
- 내부 메모(모든 생성 페이지, **렌더된 HTML의 보이는 글자** 기준): `[ … ]` 꼴 0, 체크리스트 행(`<td>K1</td>`·글자 K1~K32) 0, '게시 전 삭제' 표식 0.
- /privacy 출시 전 모드: 문의처·'출시 30일 뒤 삭제' 있음, 정본 절(`id="s-…"`) 없음. 출시 모드: 17절(보호책임자) 렌더, 작업 메모(초안·법률 검토·확인 필요·도입 시 추가·독립 리뷰·P1~P19·draft 등) 0, 외부 링크는 Google 문서 두 곳만.
- 체크리스트 상자 제외(`markdown.mjs stripInternal`)는 시작 표식부터, 명시적 끝 표식(`<!-- 게시 전 삭제 끝 -->`)이 있으면 거기까지, 없으면 인용·빈 줄이 끝날 때까지 — 상자 안 빈 줄(변이 M4)에도 새지 않음(시험 고정).
- 위험한 스킴(`javascript:`·`data:`·`vbscript:`)의 href·src 등 금지(모든 HTML), markdown 변환기는 https만 링크(변이 M3 시험 고정).
- firebase.json: 생성 페이지마다 frame-ancestors 'none' 헤더.
- sitemap = 색인 페이지 전부, robots가 색인 페이지를 막지 않고 Sitemap 줄이 있음, llms.txt 링크는 색인 페이지만.
- 통신·분석 흔적 검사를 '코드'(태그·주석·스크립트)로 좁혔다 — 처리방침 본문의 'usage analytics' 같은 낱말은 코드가 아니다(시험으로 고정).
