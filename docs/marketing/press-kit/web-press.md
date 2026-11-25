# 웹 `/press`·`/en/press` 구조안 (구현하지 않음)

- 작성: 마케팅(작가·채널) / 2026-11-25 / v0.1 — **제안만. 코드는 고치지 않았다.** 구현은 SE-2·GE-1(assets A9: 1차 01-11 전, 2차 02-09).
- 지금 판: `apps/web-static/scripts/site.mjs` `press()` — 제목·안내 → 태그라인 → 요약 → 기본 정보(FACTS rows) → 스크린샷 2장(face·ire) → 로고와 아이콘(준비 중) → 영상(준비 중) → 만든 사람(1인 개발) → 연락처.
- 지킬 규칙(site.mjs 머리·geo-v1): 스크립트 0, 외부 자원 0, 느낌표·이모지 0, 날짜 약속 0, 사실은 FACTS 한 곳에서, 사람 이름·전화·주소 칸 없음, 렌더 HTML에 `[ … ]` 기입 칸이 남으면 빌드 실패.

## 1. 섹션 순서 (위 → 아래)

| # | 섹션 (id) | 내용 | 데이터 출처 | 지금 판과의 차이 |
|---|---|---|---|---|
| 1 | 머리 (`h1`) | 프레스킷 · 안내 한 줄 | UI `pressH`·`pressLead` | 같음 |
| 2 | 한 줄 (`tagline`) | 태그라인 + 설명 한 문장 | FACTS `tagline` + 새 `oneLine`(kit 1-1) | 설명 한 문장 추가 |
| 3 | 소개 (`about`) | 짧은 소개 → '더 긴 소개' 펼침(`<details>`, 스크립트 없음) | 새 `pressShort`·`pressLong`(kit 1-2·1-3) | 새 섹션. 지금 `summary`는 짧은 소개로 바뀜 |
| 4 | 기본 정보 (`basics`) | 사실표 | FACTS `rows` + '먼저 여는 곳' 줄(PM 승인 시) | 줄 1개 추가 가능 |
| 5 | 특징 (`features`) | 다섯 줄, 제목 + 한두 문장 | 새 `features`(kit 3절) | 새 섹션 |
| 6 | 이미지 (`shots`) | 사진 격자, 그림마다 대체 텍스트·캡션·'원본 받기'(파일 크기 표시) | `IMAGES` + V19 스크린샷 7 | 2장 → 1차 2장 + 7장 |
| 7 | 영상 (`video`) | 25초·8초·짧은 클립. `<video controls preload="none" poster>` + 원본 받기 링크 | 새 `VIDEOS` | '준비 중' → 채움. 자동 재생 없음 |
| 8 | 아이콘과 이름 (`logo`) | 아이콘 PNG + 사용 규칙 목록 | media 3절 | '준비 중' → 아이콘 정해진 뒤 채움 |
| 9 | 묶음 받기 (`download`) | ZIP 하나(크기·날짜) | media M11 | 새 섹션 |
| 10 | 자주 묻는 질문 (`faq`) | 8문답 | 새 `pressFaq`(kit 4절) | 새 섹션 |
| 11 | 만든 사람 (`maker`) | '1인 개발' + 만드는 손 사진 1장(M10) | UI `makerBody` + M10 | 사진 추가(얼굴 대신 손) |
| 12 | 연락처 (`contact`) | 안내 + 메일 상자 | `CONTACT` | 같음 |

- 목차(`toc`)를 맨 위에 둔다(섹션이 12개라 길다). 지금 UI 문자열 `toc`가 이미 있다.
- '더 긴 소개'는 펼침 안에 두되 **HTML 본문에는 들어 있게** 한다(GEO — 크롤러가 읽음).

## 2. 데이터 구조 제안 (FACTS 확장)

- 소개·특징·FAQ 문장은 `FACTS[lang]`에 새 키로 넣는다: `oneLine`, `pressShort`, `pressLong`(문단 배열), `features`([제목, 본문] 5개), `pressFaq`([질문, 답] 8개). 사실 페이지(`/facts`)와 문장이 겹치는 것(FAQ Q1·Q3·Q4·Q6·Q7)은 **같은 문자열을 참조**해 두 곳이 어긋나지 않게 한다.
- 미디어는 `IMAGES`처럼 `MEDIA` 표 하나: `{ key, kind, file, w, h, bytes, lang?, alt: {ko, en}, caption: {ko, en} }`. 파일 이름은 media 2-1 규칙. 빌드 검사에 '파일이 public/에 있고 크기가 표와 같다'를 더한다.
- `{EN_NAME}`은 `FACTS.en.name` 한 곳에서 채운다(앱 `brand.ts MONG_EN`과 같은 값).

## 3. 구조화 데이터·색인

- JSON-LD: 지금처럼 `Organization` + `SoftwareApplication`. `SoftwareApplication`에 `image`(M1·M3 절대 URL), `video`(`VideoObject` — name·description·thumbnailUrl·contentUrl·duration·uploadDate)를 영상이 생긴 뒤 더한다. **`FAQPage`는 `/facts`에만 둔다**(같은 문답을 두 페이지에 구조화하지 않음 — 프레스 FAQ는 일반 HTML).
- `offers`(가격 0)는 넣지 않는다 — D-05가 [잠정]이라 '무료로 내려받아요'보다 강하게 읽힐 수 있다.
- `/press`·`/en/press` `index: true` 유지, `hreflang` 짝 유지, `llms.txt`의 Press kit 줄 설명을 "one-line, short and long description, facts, features, FAQ, actual screenshots and video, icon rules, contact"로 바꾼다.

## 4. 접근성·성능

- 이미지 `width`·`height` 지정, `loading="lazy"`(첫 그림 제외), 대체 텍스트는 장면 묘사(media 1-1).
- 영상은 `preload="none"` + 포스터, 자막 없음(대사 없음)이므로 영상 아래에 한 줄 설명.
- '원본 받기' 링크에 형식·크기 표기(예: "PNG, 1.2MB"). `download` 속성.
- CSP는 지금 `img-src 'self'`뿐이라 `<video>`를 넣으면 `media-src 'self'`를 더해야 한다.

## 5. 단계

| 단계 | 언제 | 채우는 것 |
|---|---|---|
| 1차 | 01-11 전(assets A9) | 2·3·5·10 섹션 문장, 6 = M1·M2(+ RC 캡처가 있으면 M3), 8 = 규칙만(아이콘 준비 중), 11 = M10(01-09 촬영 뒤) |
| 1.5차 | 01-12~01-18 | M3 7장, M5 25초, M6 첫 이레 8초, M7 |
| 2차 | 02-07~02-09 | M4 교체(최종 몽망이), M6 최종 두루마리(aso-geo Q6), 아이콘 확정 시 M8, ZIP 다시 묶음 |

- 날짜를 바꾸는 FAQ(Q2 '먼저 여는 곳')는 aso-geo Q2와 같은 날(01-12) 함께 고친다.
