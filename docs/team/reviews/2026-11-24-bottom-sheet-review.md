# 독립 리뷰 — 공통 바텀시트 (ui/bottom-sheet 68863b8)

- 리뷰어: QA-1(코드) + QA-2(접근성·제스처). 작성에는 참여하지 않았다. 코드는 고치지 않았다.
- 대상: `git diff 9387a8c..68863b8`. 기준: OPERATING 7·8절, lint-rules, D-08, 아트 바이블 v1.5 7-2·8절, 오너 요청(gorhom 참고 공통 컴포넌트).
- **판정: 조건부 통과.** 높음 1건과 중요 1건(M1)을 고치고, 변이에서 살아남은 경계 4건을 시험으로 고정하면 병합해도 된다. 병합 전에 메인과 충돌을 정리해야 한다(M6).

## 직접 실행한 것
| 항목 | 결과 |
|---|---|
| `pnpm verify`(worktree) | 통과. typecheck·lint·directives·tools·test·server-bundle·static-empty 7단계, 38.1초 |
| 변이 6개(sheetMath.ts) → 시험 26개 | **잡힌 것 1개, 살아남은 것 5개**(아래 M2). 끝난 뒤 원본으로 되돌렸고 `cmp` 일치, `git status` 깨끗함 |
| worklet 정적 검사 2종을 `apps/mobile/src/**/*.{ts,tsx}`로 넓혀 돌림 | 기본값 위반 0건. 선언 순서 5건이 걸리는데 모두 오탐이다(아래 W) |
| gorhom 근거 확인(npm registry, GitHub API, RNGH v3 문서) | 사실이 대체로 맞다. #2781 표기 하나만 틀렸다(아래 G) |
| 전후 캡처 비교(01 before/after, 11-overdrag-up) | 머리 줄 위치는 같고 손잡이 선만 늘었다. 과도 당김 때 바닥에 틈이 생긴다(L1) |
| `git merge-tree` 68863b8 × main ca9c305 | **DECISIONS.md가 충돌**한다. 메인 작업 트리에 아직 커밋하지 않은 NoteSheet 변경이 있다(M6) |

## 높음
### H1. 닫히는 240ms 안에 시트를 잡으면 시트가 남은 채 다시 닫을 수 없다
- `BottomSheet.tsx:161-173`(닫기 withTiming의 완료 콜백에서만 unmount), `:232-236`(`begin()`이 `cancelAnimation(pos)`).
- 순서: 배경 탭 → 부모가 `visible=false`로 바꿈 → 닫힘 애니메이션 시작 → 내려가는 시트를 손잡이나 내용으로 6~8px 넘게 끎 → `cancelAnimation`이 콜백을 `done=false`로 부름 → unmount가 일어나지 않음 → 손을 떼면 `settle`이 스냅 자리로 되돌림 → 부모는 닫힌 상태인데 시트는 떠 있음.
- 이 상태에서 배경 탭이나 뒤로 가기를 하면 `onClose`가 불리지만 부모의 visible은 이미 false라 상태가 바뀌지 않는다. 그래서 효과가 다시 돌지 않고, 시트를 닫을 방법이 없다. `onA11yAction`의 increment·decrement도 같은 구멍이 있다(`:328-333`).
- 고칠 방향: `visible`을 shared value로 두고, 닫히는 중에는 `begin`·`onUpdate`·`release`가 아무것도 하지 않게 한다(또는 두 제스처에 `enabled: visible`). 아니면 `release` 끝에서 visible=false면 닫힌 자리로 settle한 뒤 unmount한다. 캡처 스크립트에 '배경 탭 직후 끌기' 항목을 하나 더한다.

## 중요
### M1. 낮은 스냅에서 스크롤이 내려가 있으면 내용을 아래로 끌어도 시트도 스크롤도 움직이지 않는다
- `sheetMath.ts:118-119`. 조건 `delta > 0 && scrollY > 0.5 && pos > top`에서 `{ pos 그대로, sheetOwns: true }`를 돌려주므로 스크롤은 묶이고 시트는 제자리다.
- 재현: 확인판 `?screen=sheet`에서 85%로 펼친다 → 내용을 내려 스크롤한다 → 손잡이로 35%까지 내린다 → 내용을 아래로 끈다 → 아무 반응이 없다. 위로 끌 때만 반응한다.
- gorhom은 시트가 맨 위가 아니면 스크롤 위치와 상관없이 시트가 손가락을 갖는다. 자체 구현이 gorhom이 이미 푼 경계를 다시 밟은 사례다.
- 고칠 방향: `if (p.pos > p.top + 0.5) return { pos: p.pos + p.delta, sheetOwns: true }`를 방향 분기 앞에 둔다. 다른 길로는 시트가 맨 위가 아닌 자리에 스냅될 때 스크롤을 0으로 되돌린다. 시험 한 줄을 더한다: `stepContentDrag({pos:300, delta:40, scrollY:200, top:0, …}).pos === 340`.

### M2. 시험이 경계값을 고정하지 않는다 — 변이 6개 중 5개가 살아남았다
| 변이 | 결과 |
|---|---|
| `Math.abs(velocity) >= FLING_VELOCITY` → `>` | **살아남음**(정확히 500에서 시험하지 않음) |
| `FLING_VELOCITY = 500` → `900` | **살아남음**(시험이 1400 이상이거나 상대값 `FLING_VELOCITY-1`만 씀. 오너 요청의 '500px/s 한 칸'이 시험으로 고정되지 않음) |
| `stepContentDrag` 마지막 `sheetOwns: pos>top` → `false` | **살아남음**(스크롤 소유권의 덜 펼친 갈래를 시험하지 않음) |
| `scrollY <= 0.5` → `<= 50` | **살아남음**(맨 위 판정 경계. 시험은 0과 120만 봄) |
| `shouldClose: target >= closed - 0.5` → `closed - 40` | **살아남음**(닫힌 자리 40px 위의 스냅에서도 닫히는 버그를 못 잡음) |
| `PROJECTION_S = 0.2` → `0` | 잡힘 |
- 더할 시험: `pickSnap(x, 500, …)`과 `pickSnap(x, 499, …)`의 결과가 다른지, 숫자 500 자체, `stepContentDrag`에서 `scrollY` 0.5와 1, `pos>top`이고 `scrollY>0`이며 delta>0인 경우(M1), `shouldClose(closed-1, closed) === false`.
- OPERATING 8-1 '그럴듯한 오답 판별 검사'에 비추면 지금 시험은 그럴듯한 오답을 걸러 내지 못한다.

### M3. 스크린리더: 제목보다 손잡이를 먼저 읽고, 조절 막대가 현재 값을 말하지 않는다
- 포커스 순서: 시트 트리에서 손잡이(`:407-425`)가 머리 줄보다 먼저 온다. 그래서 VoiceOver·TalkBack이 첫 포커스에서 "시트 손잡이, 조절 가능"을 읽고 제목은 그다음에 읽는다. `announceForAccessibility`(`:179-181`)는 Modal이 포커스를 옮길 때 끊기기 쉽다. 고칠 방향: 첫 포커스를 제목으로 보낸다(`AccessibilityInfo.setAccessibilityFocus`). 또는 손잡이 노드를 머리 줄 뒤로 옮기고, 그림은 absolute로 위에 둔다.
- `accessibilityRole="adjustable"`인데 `accessibilityValue`가 없다(`:414-420`). 그래서 위나 아래로 쓸어도 "2단계 중 1"이나 "35%" 같은 결과를 알려 주지 않는다. 고칠 방향: `accessibilityValue={{ min:1, max:n, now:k }}` 또는 `{ text }`를 둔다.
- iOS 두 손가락 Z 문지르기(accessibilityEscape)가 없다. 시트 View에 `onAccessibilityEscape={closable ? onClose : undefined}`를 둔다. 머리 줄을 직접 그려 닫기 버튼이 없는 시트라면 이것이 유일한 닫기 길이다.
- `closable=false`인데도 힌트가 "두 번 눌러 닫기"이고 activate 동작도 그대로 남아 있다(`:418-419`, `:323-326`, `A11Y_ACTIONS`). 거짓 안내다.
- 조절 막대를 두 번 탭해 닫는 방식은 관례 밖이다. 슬라이더는 두 번 탭해도 보통 아무 일이 없다. 버튼인 단일 스냅은 괜찮다. 여러 스냅에서는 닫기를 머리 줄 버튼과 Escape에 맡기고, activate를 빼는 쪽을 권한다(판단은 QA-2 의견).

### M4. 웹에서 손잡이의 역할을 뺀 손해: 여러 스냅 시트는 키보드·스크린리더 사용자가 크기를 바꿀 수 없다
- `:410-413`. 단일 스냅(지금 소비자는 NoteSheet뿐)은 손해가 없다. 닫기 버튼·배경·Esc가 있다.
- 여러 스냅 시트(확인판 35·85%)는 웹 키보드·스크린리더 사용자가 35%에 갇힌다. 35%에서도 화면 밖 행에 Tab 포커스가 가므로, 눈으로 보는 키보드 사용자는 보이지 않는 곳에 포커스가 간다.
- 대안(포인터 캡처 문제를 피함): GestureDetector **밖**의 형제 노드로 접근성 노드를 둔다. absolute로 손잡이 위에 겹치고 `pointerEvents="none"`, `focusable`, role=adjustable(RNW → slider, aria-valuenow)을 주고, `onKeyDown`에서 ArrowUp·ArrowDown을 받아 한 칸씩 움직인다. 또는 시각적으로 숨긴 "더 펼치기·접기" 버튼 두 개를 둔다. 포인터 이벤트는 그림 쪽 View가 그대로 받는다.

### M5. 효과(useEffect)가 드래그 중에도 시트를 다시 목표로 끌고 간다
- `:149-175`. 의존성에 `snapPoints`(참조)·`sheetH`·`container`가 있다. 소비자가 `snapPoints={['35%','85%']}`처럼 인라인 배열을 넘기면 부모가 다시 그릴 때마다 효과가 돈다. 그러면 `cancelAnimation`과 withTiming이 손가락과 싸운다(지금 소비자는 모듈 상수를 써서 안전하다).
- 앨범 썸네일이 늦게 그려져 `sheetH`가 바뀌거나, 회전이나 안전 영역 변화가 드래그 중에 들어올 때도 같은 일이 생긴다.
- 고칠 방향: 의존성을 `snapPoints.join('|')` 같은 값 키로 바꾸고, 드래그가 활성인 동안(shared flag)은 재계산을 미룬다. JSDoc에 "snapPoints는 안정 참조"라고 적는 것만으로는 부족하다(7-1: 같은 지적은 검사로).

### M6. 메인과 병합 충돌
- `git merge-tree` 결과 **DECISIONS.md가 충돌**한다. 두 쪽 모두 파일 끝에 절을 덧붙였다. 손으로 합치면 된다.
- **NoteSheet.tsx**: 메인 작업 트리에 아직 커밋하지 않은 M2 이름·인장 변경(+38줄)이 있다. 내용은 `onName` prop, `tagOpen`과 `<NameTag>` 겹침, ScrollView 안 이름·이름표 두 행, CardViewer `owner` prop이다. 이것이 이 커밋이 다시 쓴 Modal과 ScrollView 덩어리와 정확히 겹치므로 충돌이 확실하다. 합칠 때 NameTag는 `overlay={<>{viewer}{tag}</>}`로 넘겨야 한다. `!visible`일 때 `setTagOpen(false)`하는 효과도 유지한다. **어느 쪽이 먼저 들어갈지 PM이 정해야 한다**(권장: M2가 먼저 커밋하고 이 브랜치를 rebase).
- i18n ko/en: 메인은 끝부분(약 321줄)에, 이 커밋은 약 117줄에 추가했다. 자동 병합될 가능성이 높다. App.tsx는 메인이 건드리지 않았다.

## 사소
- **L1 과도 당김 때 바닥 틈**: 위로 넘쳐 끌면 시트 전체가 `translateY<0`으로 들려 아래에 배경이 드러난다. `after/11-overdrag-up.png` 바닥에 DEV 배지가 보인다. 시트 아래로 같은 색 띠를 연장하거나(gorhom 방식), 최대 높이 시트는 위 저항을 높이로 흡수하는 것을 권한다. `:257`, `:448`.
- **L2 두 손가락**: 손잡이와 내용을 동시에 잡으면 두 Pan이 모두 활성이 될 수 있다(RNGH는 포인터를 공유하지 않는 핸들러를 서로 취소하지 않는다). 그러면 같은 `drag`와 `pos`를 덮어써 시트가 튄다. 실기기에서 확인이 필요하다. 고칠 방향: 활성 소유자를 표시하는 shared flag를 둔다.
- **L3 키보드**: iOS 키보드 높이에는 아래 안전 영역이 이미 들어 있다. 그런데 `paddingBottom: insets.bottom + 16`이 그대로라 여백이 겹친다(`:395`). Android는 `statusBarTranslucent` Modal에서 adjustResize가 듣지 않는 RN 알려진 문제가 있으니 입력이 들어가는 시트가 생기면 실기기로 확인한다. 지금은 입력 시트가 없다.
- **L4 모션 줄이기**: Reanimated `useReducedMotion`은 시작할 때 한 번만 읽는다. 앱 사용 중에 설정을 바꾸면 반영되지 않는다(`:121-122`). D-08 기준으로는 `PARAMS.rm`과 함께 쓰므로 웹 캡처에서는 통과했다.
- **L5** 끌어 닫기 → `onClose` → visible=false → 이미 닫힌 자리에서 거리 0인 withTiming을 240ms 더 돈다. Modal이 늦게 내려간다. `sheetH`가 같으면 바로 unmount해도 된다.
- **L6** 다른 캡처(app-flow·m1·v12·i18n)를 다시 돌리지 않았다. 셀렉터(`card-viewer`, `album-0`, `lang-system`의 scrollIntoView)는 그대로라 위험은 낮지만, OPERATING 7-3에 따라 m1·v12를 한 번 돌려 증거를 남긴다. `sheet-capture`도 verify에 묶여 있지 않다.
- **G** DECISIONS의 "열린 이슈 … #2781"은 사실과 다르다. #2781은 2026-11-23에 stale bot이 닫았다(고쳐지지 않음). 그 밖의 근거는 확인됐다: npm latest 5.2.14 = 2026-05-09, #2785·#2749·#2744 open, RNGH v3 문서 "Gesture relations cannot be set between hook-based API and previous APIs". → 자체 구현 결정은 **타당**하다. 다만 '잠정'을 유지하고, H1·M1처럼 gorhom이 이미 푼 경계를 시험 목록으로 옮겨 두기를 권한다.

## W. worklet 안전
- BottomSheet 안 worklet(`bounds`→`settle`→`begin`→`release`→제스처)은 부르기 전에 선언되어 있다. 기본 인자에 모듈 상수를 쓰지 않는다. sheetMath의 모듈 상수(`FLING_VELOCITY`·`PROJECTION_S`·`MIN_SETTLE_MS`)는 본문에서 참조하므로 클로저로 캡처되어 안전하다. 컴포넌트 안 worklet은 렌더할 때 만들어지므로 TDZ와 무관하다. `runOnJS(closeJS)`·`runOnJS(unmount)`로 JS 함수를 부르는 방식도 맞다(동기 Remote Function 호출 없음). → **위반 없음**(웹에서만 확인했고, S25·iPhone 실기기 확인은 DECISIONS 잠정 조건 그대로).
- 정적 검사를 `apps/mobile/src`로 넓히면 걸리는 곳: 기본값 0건, **선언 순서 5건(모두 오탐)**. 오탐인 까닭은 `topLevelDecls`가 본문 어딘가에 `'worklet';`이 있으면 컴포넌트 전체를 worklet으로 보기 때문이다.
  - `screens/HomeScreen.tsx` HomeScreen → Soothe·NightWater·NightRings·styles
  - `screens/IntroScreen.tsx` IntroScreen → styles
  - `screens/MorningScreen.tsx` MorningScreen → WetSheet·styles
  - `screens/StrokeScreen.tsx` StrokeScreen → pointsStroke·choiceText·AssistPanel·JarBreath·styles
  - `ui/BottomSheet/BottomSheet.tsx` BottomSheet → DEFAULT_SNAPS·A11Y_ACTIONS·A11Y_ACTIONS_MULTI·noop·styles
- 넓힐 때 필요한 것: (1) glob에 `.tsx`를 추가한다. (2) "선언 본문의 **첫 문장**이 `'worklet'`"인 최상위 선언만 worklet으로 판정한다. (3) 중첩 worklet은 TDZ 대상이 아니므로 순서 검사에서 빼고, 기본값 검사는 화살표 worklet(`(a = X) => { 'worklet'`)까지 포함한다.

## 아트·과함
- **손잡이 선 36×4(wash, 불투명도 0.8)와 7-2 '장식은 상단 한지 결 하나뿐'**: 손잡이는 장식이 아니라 기능 표시(끌 수 있음)이므로 정신상으로는 충돌하지 않는다고 본다. 다만 문구와는 글자 그대로 충돌하므로, 아트 디렉터 판정을 받아 7-2에 "손잡이 선(기능 표시)"을 한 줄 추가해야 한다. `wash`는 '장식만'(1.7:1) 토큰이라 정보를 싣는 데 쓰는 셈이다. 다만 대체 수단(닫기 버튼·Esc·배경)이 있으니 1.4.11 위반으로 보지는 않는다. 한지 결(높이 6) 바로 아래 14px 줄이라 두 요소가 붙어 보이는지 실기기에서 함께 본다.
- 모션: 스프링이 없고 ease-out cubic, 최소 140ms, 모션 줄이기는 0ms다. 아트 8절에 맞다.
- 과함: 공용 API 표면(17 prop)은 지금 소비자 두 곳에 비해 넓은 편이다. `maxWidth`·`sheetStyle`·`handle=false`는 쓰는 곳이 없다. 6-덜어내기 원칙에 따라 쓰임이 생길 때 여는 것을 권한다(사소).

## 회귀
- NoteSheet 전후(01~05): 머리 줄·목록 위치가 같고 손잡이만 늘었다. 200% 글자(02)와 320 폭(03)도 같다. `note-close`·`card-viewer`·`album-*`·`lang-*` testID는 유지됐다. 카드 크게 보기 겹침은 같은 Modal의 `overlay`로 옮겨져 캡처 13에서 확인했다.
- 원래 있던 문제가 공용 API로 굳어진 것: overlay(CardViewer)가 `accessibilityViewIsModal` 시트의 형제다. 둘 다 modal이면 VoiceOver가 어느 쪽에 갇힐지 정해져 있지 않다. 그리고 overlay가 열려 있을 때 Android 뒤로 가기는 overlay가 아니라 시트 전체를 닫는다. 이전과 같아서 회귀는 아니지만, 공용 컴포넌트라면 `overlay`가 열려 있을 때 시트에 `accessibilityElementsHidden`을 두고 뒤로 가기는 overlay 닫기로 돌리는 것을 권한다.
- 개발 패널은 이전하지 않았다(DECISIONS 근거에 동의한다). 개발 패널과 캡처 스크립트에는 영향이 없다.
