# 프레스 킷 이미지·영상 목록, 파일 이름 규칙, 로고 사용 규칙

- 작성: 마케팅(작가·채널) / 2026-11-25 / v0.1 초안 — 촬영·캡처·게시 없음.
- 원칙: **실제 게임 화면만**(D-04, featuring/assets.md 머리). AI 시안·합성 금지. 홍보 주연은 ① 눈이 열리는 얼굴 ② 글씨 → 몸 ③ 아침 카드(number-one 3-2 '홍보 주연 규칙'). 화면에 쓰는 낱말은 세상 가족(자연·살림)만. 감정 낱말·위기 대응 화면·공방 노트 설정·알림 권한 화면은 찍지 않는다(risk-check 1-1·1-2, store-listing 8절).
- 실물(먹·붓·한지) 사진은 게임 화면으로 내지 않는다. 프레스 킷 '만드는 손' 자리에만 두고 "실물 사진 · 게임에서는 손가락으로 써요"를 붙인다(risk-check 4절).
- 손만: 얼굴·목소리·방·반사·장신구 없음, 위치 정보 저장 끔(shoot-plan 1절 점검표). 사진 파일의 EXIF는 올리기 전에 지운다(아래 2-3).

---

## 1. 자료 목록

`A#`는 featuring/assets.md의 번호, `P#·R#·C#·RM·D1`은 shoot-plan의 장면 번호다. '1차'는 01-11 전 `/press` 1차(assets A9), '2차'는 02-07~02-09 최종 몽망이 뒤.

| # | 자료 | 규격 | 원본(만드는 일) | 1차 | 2차 | 공개 파일 이름(2절 규칙) |
|---|---|---|---|---|---|---|
| M1 | 얼굴(눈 뜬 몽망이) | 780×520 JPG | 지금 사이트 `IMAGES.face`(실제 렌더 캡처, `/img/face.jpg`) | 있음 | 유지 | `mongmang-press-face-01-780x520.jpg` |
| M2 | 첫 이레 두루마리 | 724×1200 JPG, ko·en 각 1 | 지금 사이트 `IMAGES.ire`(`/img/first-ire.{ko,en}.jpg`) | 있음 | 유지 | `mongmang-press-scroll-01-ko-724x1200.jpg` · `…-en-…` |
| M3 | 스크린샷 7장(ko·en 캡션) | Apple iPhone 필수 크기 + Play 9:16 | **V19** — store-listing 8절 표 1~7(A2) | RC 뒤 ~01-12 | 1번 교체 | `mongmang-press-shot-01-ko-{w}x{h}.png` ~ `-07-` |
| M4 | 1번 장면 = 다 자란 몽망이 + 아침 카드 | M3과 같음 | 최종 몽망이는 02-02 OTA → 그 전엔 **넷째 이레 스냅숏**(A3, C38·C39) | 대체본 | 교체 | M3의 `shot-01` |
| M5 | 미리보기 영상 25초 | 세로, 실제 렌더, 음악·성우 없음 | **V19**(A1), 자막은 store-listing 8절 캡션에서만 | ~01-12 | 유지 | `mongmang-press-trailer-25s-ko-1080x1920.mp4` · `-en-` |
| M6 | 이레 두루마리 영상 8초 | 9:16, 실제 렌더 | 앱 공유 출력 — C10 첫 이레(01-17), D1 최종(02-07)(A6) | 01-17 뒤 | D1로 교체 | `mongmang-press-scroll-8s-01-ko-1080x1920.mp4` |
| M7 | '글씨 → 몸' 짧은 클립 | 세로 5~8초 화면 녹화 | R4(고양이)·R9(바다)(A7) | 01-18 뒤 | 유지 | `mongmang-press-clip-01-ko-1080x1920.mp4` |
| M8 | 아이콘(얼굴안) | 1024×1024 PNG, 배경 있는 판 | **V19 아이콘 3안 → 테스트 선택**(A4) | 자리만 | 선택안 | `mongmang-press-icon-1024x1024.png` |
| M9 | 피처 그래픽 | 1024×500 | V19(A5) | RC 전 | 유지 | `mongmang-press-feature-1024x500.png` |
| M10 | 만드는 손(실물) | 4:5 | P1(먹 가는 손)·P7(벼루·붓·연적 나란히)(A8), 세션 A 01-09 | 01-09 뒤 | 유지 | `mongmang-press-hands-01-1080x1350.jpg` · `-02-` |
| M11 | 전체 묶음 | ZIP | M1~M10 중 그때 있는 것 | 1차 | 2차 다시 묶음 | `mongmang-presskit-{YYMMDD}.zip` |

- 로고(글자 로고)는 아직 없다. 만들 계획도 정해지지 않았다(결정 필요 3, README). 그 전까지 '로고'는 M8 아이콘 + 이름 글자다.
- Apple 홍보 아트(A12)는 요청이 올 때만 실제 렌더로 만든다. 프레스 킷에 미리 넣지 않는다.

### 1-1. 대체 텍스트·캡션 (공개 문구)

스크린샷 캡션은 store-listing 8절 표와 같은 문장을 쓴다(사이트·스토어·프레스가 같은 한 줄). M1·M2의 대체 텍스트는 site.mjs `IMAGES`의 ko·en 문장을 그대로 쓴다.

<!-- ans id=media.cap.ko max=400 unit=chars -->
```text
1 쓴 말로 자란 몽망이
2 손끝이 닿으면 눈을 떠요
3 벼루에 먹을 갈아요
4 붓으로 오늘의 한 마디
5 글자를 마시고 몸으로 대답해요
6 물이 말을 풀어 꿈이 돼요
7 아침마다 간밤의 꿈 한 장
실물 사진 · 게임에서는 손가락으로 써요
```
<!-- ans id=media.cap.en max=500 unit=chars -->
```text
1 Grown from the words you wrote
2 Touch it, and it opens its eyes
3 Grind ink on the inkstone
4 Write the word of the day
5 It drinks the letters and answers with its body
6 The water loosens the word into a dream
7 Each morning, last night's dream
Photo of real ink and brush. In the game, you write with your finger.
```

---

## 2. 파일 이름 규칙

### 2-1. 공개용(프레스 킷에서 받는 파일)

`mongmang-press-{종류}-{번호|길이}-{언어}-{가로}x{세로}.{확장자}`

| 칸 | 규칙 | 예 |
|---|---|---|
| 머리 | `mongmang-press` 고정. 영문명(12-05 결정)이 바뀌어도 파일 이름은 그대로 두려고 도메인 `mongmang.ink`의 앞부분을 쓴다 | — |
| 종류 | `face` `scroll` `shot` `trailer` `clip` `icon` `feature` `hands` | `shot` |
| 번호·길이 | 두 자리 번호(`01`) 또는 영상 길이(`25s`·`8s`). 스크린샷 번호 = store-listing 8절 표 번호 | `03` |
| 언어 | 글자가 든 자료만 `ko`·`en`. 글자 없는 자료(아이콘·손·얼굴)는 뺀다 | `ko` |
| 크기 | 실제 픽셀 | `1290x2796` |
| 확장자 | 사진 `.jpg`, 화면 캡처·아이콘 `.png`, 영상 `.mp4` | — |

- 소문자·숫자·하이픈만. 한글·공백·날짜를 넣지 않는다(내려받는 쪽 시스템에서 깨지지 않게, 갱신해도 링크가 그대로).
- 같은 자리의 파일을 바꿀 때는 **이름을 그대로 두고 내용만 바꾼다**(기사에 걸린 링크 유지). 묶음 ZIP만 날짜를 붙인다.

### 2-2. 원본(팀 공유 폴더, 공개 안 함)

shoot-plan 8절 규칙 그대로 `YYMMDD-코드-설명.확장자`(예: `270109-P1-grind.jpg`, `270207-RM-final-morning.mp4`). 원본은 저장소에 넣지 않는다(용량·개인정보).

| 공개 파일 | ← 원본 코드 |
|---|---|
| `shot-01~07` | V19 캡처(RC 01-05 뒤), 1번은 C38·C39 → 02-07 뒤 RM |
| `trailer-25s` | V19 미리보기 |
| `scroll-8s-01` | C10(첫 이레) → 2차 D1 |
| `clip-01`·`02` | R4·R9 |
| `hands-01`·`02` | P1·P7 |

### 2-3. 내보내기 전 점검

1. EXIF·위치 정보 지움(`exiftool -all= 파일` 또는 편집기 '메타데이터 없이 내보내기'). 손 사진은 특히.
2. 화면 캡처의 상태 표시줄: 시각·배터리·통신사·알림 아이콘이 개인 기기를 드러내지 않게(가능하면 시뮬레이터 상태 표시줄 고정 또는 잘라 냄).
3. 쓴 낱말이 세상 가족인지, 위기·설정·알림 권한 화면이 아닌지(위 원칙).
4. 실제 렌더인지(합성·AI 보정 0).

---

## 3. 로고·아이콘 사용 규칙 (공개 문구)

지금은 아이콘이 테스트 전이라 '준비 중'이다(사이트 `logoBody`). 아이콘이 정해지면(V19 → 소프트런칭 아이콘 3안 시험, number-one 3-3) 아래를 함께 올린다. 금지 항목은 아트 바이블의 금지 목록(1-4 외곽선·발광, 4절 금지 색)에서 옮겼다.

<!-- ans id=logo.ko max=600 unit=chars -->
```text
아이콘과 이름은 기사, 소개 글, 영상 리뷰에 그대로 쓸 수 있어요.
이름은 '몽망이 키우기'로 띄어 써 주세요. 영어로는 {EN_NAME}이에요.
아이콘은 받은 그대로 써 주세요. 크기만 바꿔도 되고, 가로세로 비율은 지켜 주세요.
다시 그리기, 색 바꾸기, 외곽선이나 빛 번짐 더하기, AI로 고치거나 늘리기는 하지 말아 주세요.
다른 캐릭터나 상표와 한 그림으로 합치지 말아 주세요.
아이콘 둘레에 아이콘 폭의 4분의 1 이상 여백을 두고, 한지색이나 먹색처럼 차분한 바탕 위에 올려 주세요.
궁금한 점은 hello@mongmang.ink로 물어봐 주세요.
```
<!-- ans id=logo.en max=800 unit=chars -->
```text
You may use the icon and name as they are in articles, posts and video reviews.
Please write the name as {EN_NAME}. The Korean title is 몽망이 키우기.
Use the icon as provided. Resizing is fine; please keep the proportions.
Please do not redraw it, recolor it, add outlines or glow, or edit or extend it with AI.
Please do not combine it with other characters or brands in one image.
Leave clear space of at least a quarter of the icon's width around it, on a plain background such as paper or ink tones.
Questions are welcome at hello@mongmang.ink.
```

- 여백 1/4·바탕 색은 팀 제안이다(아트 정본에 로고 여백 규칙이 없다). 아이콘이 정해질 때 DS-1이 확인한다.
- 대명사는 it(용어집). 'he/she/the pet'으로 쓴 기사를 보면 고쳐 달라고 하지 않는다(외부 글은 통제하지 않음) — 우리 글만 지킨다.
