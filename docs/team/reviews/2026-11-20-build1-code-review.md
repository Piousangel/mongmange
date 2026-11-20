# 빌드 1 코드 리뷰 — 세이브 v2·공유·평점 (2026-11-20)

- 리뷰어: 독립 코드 리뷰어(작성 참여 안 함), 강도 xhigh
- 대상: `main` 위 미커밋 변경 전체(`git status` 19개 수정 + 신규 `pillars.ts`·`save-v2.test.ts`·`features.ts`·`share/*`·`review*.ts`·`build1.test.ts`)
- 기준: DECISIONS.md D-13·D-15·D-17·D-20·D-21, `docs/design/pillars-v1/C-integrated.md` 4-1, `docs/design/server-v1/architecture.md` 3-4·3-5·5절
- 코드는 고치지 않았다. 아래 줄 번호는 지금 작업 트리 기준이다.

## 0. 직접 실행 결과

| 명령 | 결과 |
|---|---|
| `pnpm typecheck` | 통과(core·mobile 둘 다 오류 0) |
| `cd packages/core && npx vitest run --testTimeout=200000` | 15파일 144건 통과(36.5초) |
| `pnpm --filter mobile test` | 9파일 74건 통과(2.0초) |

worklet 규칙: 새 코드에 `'worklet'` 함수가 없고 `worklet-defaults.test.ts`도 통과한다. 다만 아래 L-5를 참고한다.

## 1. 요약

치명적인 문제는 없다. v1→v2 마이그레이션은 결정적이고, 획·성향·카드를 잃지 않으며, 미래 버전은 거부한 뒤 백업으로 넘어간다. 평점 요청은 "최대 1회"가 보장된다(상태 저장이 먼저, 그다음 `reviewAsked`를 기록하고, 그 뒤에 요청한다).
남은 문제는 다섯 가지다. ① 보안 난수가 실제로는 Math.random으로 떨어질 가능성이 높다. ② 정본 D-13과 구현이 두 군데 어긋난다. ③ 테스트에 골든값이 없어 "타고남이 평생 고정"이라는 약속을 지키지 못한다. ④ 공유 버튼을 빠르게 두 번 누르는 경합이 있다. ⑤ TestFlight에서 옛 빌드로 내려가면 세이브를 덮어쓸 수 있다.

| # | 심각도 | 영역 | 위치 |
|---|---|---|---|
| H-1 | 높음 | 보안 난수가 네이티브에서 사실상 Math.random | `apps/mobile/src/game/store.ts:148-157` |
| H-2 | 높음 | 씨앗·인장·먹 파생값에 골든 테스트가 없음(동어반복) | `packages/core/test/save-v2.test.ts:47,115` |
| M-1 | 중간 | 마이그레이션이 D-13 문구와 다름(보안 난수 대신 createdAt, ink `seeded` 없음) | `packages/core/src/sim/save.ts:38,45` ↔ `DECISIONS.md:46` |
| M-2 | 중간 | 빌드 1에서 첫 밤이 지나도 ink가 null로 남음 → 빌드 2 규칙에 구멍 | `packages/core/src/sim/reduce.ts`(chooseInk만 있음) |
| M-3 | 중간 | `sealCode` 주석이 "링크에 쓴다"고 적음 → 서버 설계 3-5와 충돌 | `packages/core/src/sim/pillars.ts:80-81` ↔ `architecture.md:22,212` |
| M-4 | 중간 | 공유 버튼 연타 경합(state 클로저 가드) | `apps/mobile/src/screens/cardText.tsx:48` |
| M-5 | 중간 | 옛 빌드로 내려가면(TestFlight) 세이브가 사라짐 → 첫 탭에 새 세이브가 본을 덮어씀 | `apps/mobile/src/game/GameApp.tsx:291-292`, `packages/core/src/save/slots.ts` |
| M-6 | 중간 | 마이그레이션 테스트가 실제 v1 원문이 아니라 v2를 깎아 만든 합성본 | `packages/core/test/save-v2.test.ts:37` |
| L-1~L-9 | 낮음 | 아래 4절 | — |

## 2. 높음

### H-1. "보안 난수"가 네이티브에서 Math.random으로 떨어질 가능성이 높다
`store.ts:148` 주석은 "Hermes·웹 crypto.getRandomValues"라고 적는다. 하지만 React Native·Hermes는 기본으로 `globalThis.crypto`를 제공하지 않는다. 이 저장소의 `node_modules`에도 `getRandomValues` 폴리필이 없다(`expo/src/winter`, `react-native/Libraries`, `expo-crypto`·`react-native-get-random-values` 없음을 확인).
그래서 iOS·Android에서는 `catch` 없이 바로 `Math.random()` 대체 경로로 간다. 실패를 알리는 신호도 없다. 웹에서만 진짜 보안 난수가 쓰인다.
- 영향: C-integrated 2-1·D-13의 "32비트 보안 난수" 요구를 충족하지 못한다. 링크 코드는 서버 난수로 분리돼 있으므로(3-5) 보안 사고로 바로 이어지지는 않는다. 하지만 정본 문구와 주석이 사실과 다르다.
- 제안: 빌드 1 동결(11-29) 전에 결정해야 한다. ① `expo-crypto`의 `getRandomValues`를 쓴다. 새 네이티브 모듈이라 이번 EAS 빌드에 함께 넣어야 한다. ② 아니면 Math.random을 받아들이고 정본·주석을 "가능하면 보안 난수"로 고친다. 어느 쪽이든 실기기에서 `typeof globalThis.crypto?.getRandomValues`를 한 번 찍어 사실을 확인한다. 이 항목은 **[실기기 확인 필요]**다.

### H-2. 타고남·인장·먹 파생 규칙에 골든값 테스트가 없다
`save-v2.test.ts:47`은 `s.birth.seed`를 `sim.birthSeedOf(FIRST_TAP)`, 곧 같은 함수의 결과와 비교한다. `:115`도 `seededInk`의 결과가 목록 안에 있는지만 본다.
그래서 `fnv1a`·`birthSeedOf`의 양자화(`q`)·`sealSeedOf` 꼬리표·`sealCode`·`sealNotches`·`seededInk`가 바뀌어도 테스트는 모두 통과한다. 그러면 이미 태어난 모든 몽망이의 체형·인장 무늬·먹이 조용히 바뀐다. `TRAIT_VERSION`이 지키려는 약속("옛 몽망이는 옛 규칙으로")을 테스트가 받쳐 주지 못한다.
- 제안: 고정 입력 두세 개에 대해 `birthSeedOf`, `sealSeedOf`, `sealCode`, `sealNotches`, `seededInk`, 그리고 마이그레이션 씨앗(`up1to2`, createdAt 고정)의 **숫자·문자열 리터럴**을 박는다. FNV-1a 표준 벡터(예: 빈 입력 = `0x811c9dc5`)도 하나 넣는다.

## 3. 중간

### M-1. 마이그레이션 규칙이 정본 D-13과 다르다
D-13(`DECISIONS.md:46`)은 "옛 세이브는 `birth.seed`를 설치 시각 + 보안 난수로 만들고 `ink`는 `seeded`"라고 정한다. 구현(`save.ts:38`)은 `createdAt`만으로 씨앗을 결정적으로 만들고, `ink`는 `{id:null, seeded:false}`로 둔다(`:45`).
- 구현 쪽 선택에는 근거가 있다. `parseState`는 순수 함수라 읽을 때마다 마이그레이션을 다시 한다. 백업 키는 다음 깸까지 v1 원문으로 남는다(`writeSave`가 v1 본을 백업으로 민다, 테스트 `:684`). 그래서 난수를 쓰면 본이 깨져 백업으로 복원할 때 **다른 몽망이**가 된다. 결정적으로 만드는 쪽이 D-03(잃지 않음)에 더 맞다.
- 대신 씨앗이 `createdAt`만으로 계산되므로 누구나 재현할 수 있다. 인장 무늬가 공개 정보가 된다는 뜻이다. 링크 코드를 분리하는 한 문제는 없다(M-3).
- 제안: 정본 담당이 D-13을 구현에 맞춰 개정한다("결정적: createdAt + 'migr' 꼬리표, source 'migrated'"). ink의 `seeded`도 어떻게 할지 함께 정한다(M-2).

### M-2. 빌드 1에서는 ink가 아무도 고르지 않은 채 첫 밤을 지난다
`chooseInk`는 이벤트로만 들어온다. "첫 밤까지 고르지 않으면 씨앗이 고름"은 빌드 1 sim 어디에도 없다. 빌드 1 테스터는 모두 첫 밤 이후에도 `ink.id === null`이고, 마이그레이션한 v1 사용자도 마찬가지다.
D-13·C-integrated 4-1의 "빌드 1부터 값이 쌓인다"를 문자 그대로 읽으면 첫 `slept` 때 `seededInk(birth.seed)`로 `{id, chosenAt, seeded:true}`를 기록해야 한다.
- 제안: ① 첫 잠(`doSleep`, `dayIndex===0`)에서 `ink.id===null`이면 씨앗 먹을 기록한다. 이렇게 하면 플래그와 무관하게 값만 쌓이므로 원칙에 맞는다. ② 아니면 빌드 2에서 "첫 밤 지났고 ink null → 씨앗 먹" 보정 규칙을 둔다고 D-13에 적는다. 어느 쪽이든 지금 정해 두지 않으면 빌드 2에서 이미 며칠을 함께한 몽망이에게 갑자기 먹 고르기 화면이 뜬다.

### M-3. `sealCode` 주석이 서버 설계와 충돌한다
`pillars.ts:80` 주석은 "공유 글 링크·이름표 세부에만"이라고 적는다. 서버 설계 `architecture.md:22,212`는 "링크 코드는 서버 보안 난수(40비트), `sealSeed`에서 파생하지 않는다(32비트 → 열거 가능)"이다.
지금은 `sealCode` 호출부가 없다(테스트 제외). 하지만 빌드 2 담당이 주석을 믿고 이 함수를 링크 키로 쓰면 코드를 열거할 수 있게 된다. migrated 몽망이는 씨앗이 createdAt만으로 정해지므로(M-1) 더 쉽게 추측할 수 있다.
- 제안: 주석을 "인장 **표시용** 코드(이름표 장식). 링크 키 아님 — 링크 키는 서버 발급 `cloud.code`"로 고친다. 아니면 이 함수를 지우거나 `sealGlyph`처럼 이름을 바꿔 오용을 막는다. C-integrated 2-2도 함께 고친다(서버 설계 540행 할 일 1).

### M-4. 공유 버튼 연타 경합
`cardText.tsx:48` `if (busy) return;`는 렌더 시점의 state 클로저를 본다. 다시 렌더되기 전에 두 번 누르면(같은 버튼 연타, 또는 카드·세로 버튼을 거의 동시에) `run`이 두 번 돈다.
Skia 렌더가 두 번 일어나고, `shareAsync`도 두 번 불린다. iOS는 이미 시트가 떠 있으면 두 번째 호출이 실패하므로 "보내지 못했어요"가 잘못 뜬다. 같은 파일 이름이면 `native.ts:27`의 `file.delete()`가 첫 번째 공유가 아직 읽고 있는 파일을 지울 수도 있다.
- 제안: `useRef` 잠금(`if (lock.current) return; lock.current = true; … finally lock.current = false`)을 쓴다. 언마운트 뒤 `setBusy`/`setNote`가 불리지 않게 하는 마운트 ref도 같이 두면 좋다.

### M-5. 옛 빌드로 내려가면 세이브가 사라진 것으로 보이고, 첫 탭에 본을 덮어쓴다
TestFlight 테스터는 이전 빌드를 다시 설치할 수 있다. 옛 앱(sim 1)이 sim 2 본을 읽으면 미래 버전으로 거부한다. 첫 깸 뒤에는 백업도 v2이므로 백업도 거부한다. 그러면 `lostSave` 상태가 되고, 인트로 첫 탭(`GameApp.tsx:291-292`)의 `install()`이 **본 키를 새 몽망이로 덮어쓴다**. 원래 몽망이는 `corrupt` 키에만 남고, 깨진 본이 두 번 더 생기면 그마저 밀려난다.
다시 새 빌드로 올리면 새로 만든 몽망이가 이어진다. 자동 복구 경로가 없다.
- 이 동작은 이번 변경 전부터 있었다. 하지만 버전 올림은 이번 빌드가 처음이라 실제로 일어날 수 있게 됐다.
- 제안: ① `readSave`가 "미래 버전" 오류를 구분해 돌려주게 한다(`error` 대신 `futureVersion: true`). 앱은 이때 설치하지 말고 "새 버전으로 업데이트해 주세요"를 띄운다. 이 처리는 옛 빌드에는 넣을 수 없으므로 **지금 빌드 1에 넣어야** 빌드 2→1 내려가기를 막는다. ② 아니면 `install()` 전에 본 키 원문을 `pre-install` 키에 보존한다. ③ 테스트 공지에 "이전 빌드로 내려가지 마세요"를 적는다.

### M-6. 마이그레이션 테스트가 합성 v1을 쓴다
`save-v2.test.ts:37` `asV1`은 지금 코드가 만든 v2 원문에서 새 필드를 지우고 버전을 1로 바꾼다. 실제 빌드 1 이전 앱이 쓴 원문과 같다는 보장은 테스트 밖에 있다. 예를 들어 이번 변경이 v1 필드의 직렬화를 바꿔도 테스트는 잡지 못한다.
서버 설계 `architecture.md:303`도 `packages/core/test/fixtures/saves/*.json`(v1 옛 세이브 등)을 core·서버 e2e 공통 계약으로 정했는데, 아직 없다.
- 제안: `HEAD` 코드로 만든 v1 세이브 원문(7일 플레이·이레 전후 2개)을 픽스처로 커밋한다. 마이그레이션 결과의 핵심 값(획 수, 성향, 카드, birth.seed 리터럴)을 그 픽스처에 대해 단언한다.

## 4. 낮음

- **L-1 이름 원문을 불러올 때 재검증하지 않음** (`pillars.ts:259`): `name.text`가 문자열이기만 하면 통과한다. 세이브를 조작하거나 손상되면 길이·문자 제한을 넘는 이름이 들어온다. 빌드 2에서 웹 공개(서버 금칙어와 별개)·이름표 렌더로 이어진다. `normalizeName(nm.text).ok && 결과 === nm.text`를 검증에 넣기를 권한다. `birth.seed`·`sealSeed`도 `isNum`만 보므로 uint32 범위 검사(`v === v >>> 0`)를 더하면 좋다.
- **L-2 v1 블록의 state 버전 불일치를 가림** (`save.ts:43`): `up1to2`가 `schemaVersion: 2`를 덮어쓴다. 그래서 `sim.version=1`인데 state가 다른 버전인 손상 원문도 `validateState`의 "블록과 state 버전 불일치" 검사를 통과한다. 원래 `st.schemaVersion !== 1`이면 던지는 편이 맞다.
- **L-3 공유 임시 파일 누적** (`native.ts:26`): 파일 이름이 `kind-night-aspect` 조합마다 달라서, 공유할 때마다 캐시에 PNG(1~3MB)가 하나씩 쌓인다. "다음 공유 때 덮어쓴다"는 주석은 같은 밤·같은 비율일 때만 맞다. OS가 캐시를 비우므로 치명적이지는 않다. 공유 전에 `Paths.cache`의 `mongmangi-*.png`를 지우거나, 고정 하위 폴더를 하나 두고 통째로 비우기를 권한다(Android 수신 앱이 아직 읽는 중일 수 있으므로 공유 **직후**가 아니라 **다음 공유 전**에 지운다).
- **L-4 Skia 객체 해제** (`renderImage.tsx` 두루마리 루프): `drawAsImage`로 만든 SkImage 7장과 surface를 `dispose()`하지 않는다. GC에 맡기는 셈이라 저사양 Android에서 연속으로 공유하면 메모리가 급증한다. 웹의 `ImageBitmap`도 `close()`하지 않는다.
- **L-5 `fnv1a`의 기본값이 모듈 상수** (`pillars.ts:38` `h0 = FNV_OFFSET`): 지금은 worklet이 아니므로 규칙 위반이 아니다. 하지만 빌드 2에서 인장 무늬·체형을 UI 스레드(worklet)에서 계산하게 되면, 11-20 S25 사고('Property CORE doesn't exist')와 같은 패턴이 된다. 미리 `h0In?: number` + `?? 0x811c9dc5` 리터럴로 바꿔 두기를 권한다.
- **L-6 평점 타이머** (`GameApp.tsx:173`): `setTimeout` 4.2초 사이에 앱이 백그라운드로 가면 OS 창이 뜨지 않는다. 그래도 이미 `reviewAsked=true`라 다시 묻지 않는다. "최대 1회"는 지켜지지만 "0회"가 될 수 있다. 정책(D-18 ⑤)상 허용 범위라면 그대로 둬도 된다. 다만 `AppState.currentState === 'active'`일 때만 부르고, 백그라운드로 갔으면 플래그를 기록하지 않고 다음 기회로 넘길지 정책 결정이 필요하다. 또 비공개 테스트 기간에 이레를 지난 테스터는 운영판에서도 다시 묻지 않는다(메타가 유지됨). 의도한 것인지 확인이 필요하다.
- **L-7 1회 보장 로직이 테스트 밖에 있음**: `shouldAskReview`(순수 함수)만 테스트되고, "setMeta 먼저 → 요청" 순서는 컴포넌트 안에 있다. `REVIEW_DELAY_MS > 2400` 테스트는 상수 비교라 사실상 동어반복이다. 순서를 `maybeAskReview(line, deps)` 같은 함수로 빼서 "requestReview가 throw해도 reviewAsked=true", "두 번 불러도 요청 1회"를 테스트하기를 권한다.
- **L-8 `clearSave`가 `pre-v*` 키를 지우지 않음** (`slots.ts:150`): 주석은 "보존 원문도 지운다"인데 `pre-v2.1`이 남는다(개발 메뉴 초기화 뒤 stale). 미래 버전 본도 `pre-v2.3` 키에 "마이그레이션 전" 이름으로 남는다. 둘 다 해는 없지만 이름이 오해를 부른다.
- **L-9 `expo-sharing` 설정 플러그인** (`app.json`): 이 플러그인은 "다른 앱에서 받기(share extension)"용이고, 옵션이 없으면 아무것도 하지 않는다. 보내기만 할 거라면 필요 없다. 나중에 누가 `ios.enabled`를 켜면 App Group·확장 타깃이 생기므로, 지우거나 "보내기에는 불필요" 주석을 남기기를 권한다.

## 5. 개인정보(⑥)

- 세이브에 새로 쌓이는 값: `relation.hour[24]`(시간대별 방문 습관), `todayHour`, `lastSeenAt`, `lastAbsenceMs`·`longestAbsenceMs`(부재 길이), `birth.at`(ms 단위 설치 시각), `name.text`. 기존 `clock.tzOffsetMin`과 함께 보면 **생활 리듬(언제 깨어 앱을 여는지·얼마나 비우는지)**이 드러난다.
- 서버로 나가는 시점은 빌드 3 '맡겨 두기'(세이브 통째 업로드, architecture 3-4)다. 5-1 표에는 "정·손 기억"만 적혀 있으므로 처리방침·Data safety에 **"이용 시간대 패턴·부재 기간"**을 명시하라고 권한다. 데이터를 덜 남기려면 `longestAbsenceMs`처럼 감정 상태 입력에만 쓰는 값은 업로드할 때 빼는 방안(서버 검증 = parseState라 필드 제거는 어렵다)보다, 처리방침에 적는 쪽이 현실적이다.
- 첫 탭 좌표·보안 난수 원값은 해시로만 남고 저장하지 않는다. 좋다.
- 공유 이미지에는 인장 코드·이름이 없고, 띠에는 앱 이름·스토어만 있다(C-integrated 2-2 준수). 파일 이름도 영문·밤 번호뿐이다. 웹 `__mongLastShare`가 base64 원문 전체를 전역에 붙잡아 두는데, 이는 운영 웹 빌드에도 들어간다(메모리 문제일 뿐 유출은 아님). `__DEV__`로 감싸기를 권한다.

## 6. 확인했고 문제없음

- 마이그레이션은 결정적이다(같은 원문 → 같은 상태, 테스트 `:646-648`). 획·성향·카드를 보존하고, 이레 전 세이브는 결 이름이 null이다.
- 미래 버전(sim 3)은 거부하고 백업으로 넘어가며, 원문은 corrupt에 보존한다. `validateState`는 마이그레이션 **뒤**에 돌아 새 필드까지 검증한다.
- `writeSave`는 쓰기 전에 다시 파싱해 검증하고, 실패하면 쓰지 않는다. 저장소 예외는 던지지 않는다. 그래서 MMKV 동기 쓰기에 경합은 없다(단일 JS 스레드).
- 평점 순서: `apply()`가 상태(`ire7LineShown=true`)를 **먼저** 저장하고 효과 구독자를 부른다. 효과 처리에서 `reviewAsked`를 기록한 **뒤** 요청한다. 어느 지점에서 크래시가 나도 두 번 묻지 않는다.
- `rebase`(시계 보정)가 `relation.lastSeenAt`도 함께 옮긴다. 잠든 동안의 탭·종이 탭은 정을 올리지 않는다.
- 지연 로드: `require`를 try로 감싸서, 모듈이 없는 옛 바이너리에서 공유 버튼을 숨기고 평점은 no-op이 된다. `expo-file-system` 58의 `File.write(…, {encoding:'base64'})` 시그니처가 맞다(타입체크 통과).
- i18n(D-17): ko·en 키가 짝이 맞고, i18n 정적 테스트도 통과한다.

## 7. 재사용·단순화(⑧)

- `up1to2`의 씨앗 계산(`fnv1a([hi, lo, 0x6d696772])`)과 `createInitial`의 대체 씨앗(`fnv1a([seed, lo, hi])`)이 같은 일을 다른 순서로 한다. `split()`을 export해 `migratedBirthSeed(createdAt)` 하나로 모으면 H-2 골든 테스트도 한 곳에서 걸 수 있다.
- `renderIreScrollImage`의 네이티브·웹 두 벌은 배치를 `ireScrollLayout`으로 공유한다. 좋은 분리다. 글 그리기(`drawText`/`text`) 인자 순서가 서로 달라서, 한쪽만 고치는 실수가 생기기 쉽다. 두 함수의 인자 순서를 맞추기를 권한다.
- `optional(require)` 지연 로드가 `review.ts`와 `share/native.ts`에 두 번 있다. `lib/optionalModule.ts`로 모으면 빌드 2의 다른 네이티브 모듈(애플 로그인 등)에도 그대로 쓸 수 있다.
