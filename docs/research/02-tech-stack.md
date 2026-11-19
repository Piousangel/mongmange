> **11-19 갱신:** D-04에 따라 캐릭터를 Rive로 그린다는 전제(5.1 Character 구조, 7절 스파이크, 6절 Rive 계정)는 대체되었습니다. 렌더 방식은 미정이고 3갈래 스파이크로 정합니다. 앱 틀(Expo·EAS·core 분리·저장·오프라인 정산)은 유효합니다.

# 02. 기술 스택 조사 — 몽망이 키우기

작성: 테크 리드 · 2026-11-19
상태: 제안 (오너 결정 대기)

## 0. 결론 요약

- **추천: (a) Expo SDK 58 (React Native 0.88, New Architecture 고정) + Rive(캐릭터) + react-native-skia(배경·꾸미기·이펙트) + Reanimated 4, 빌드·제출은 EAS Build/Submit.**
- 시뮬레이션 코어는 렌더러와 무관한 **순수 TS 패키지 `@mong/core`** 로 두고 Vitest로 테스트한다. 앱(Expo)은 코어를 "그리는 쪽"일 뿐이다.
- 에이전트 검증 루프: `vitest`(코어) → Expo Web + Playwright 스크린샷(화면) → EAS 개발 빌드를 실기기에서 확인(오너가 가끔) + Maestro(EAS Workflows) E2E.
- 2순위 대안은 **Godot 4.7**. 2D 애니메이션 도구는 가장 좋지만, iOS 빌드에 Xcode가 있는 Mac이 꼭 필요하고 IAP·광고는 커뮤니티 플러그인에 기대야 하며, 오너가 코드를 읽기 어렵다.

---

## 1. 2026-11 기준 최신 상태 (문서 확인)

| 항목 | 상태 | 출처 |
|---|---|---|
| Expo SDK | **SDK 58 정식(2026-10-15)**, RN 0.88, React 19.3. iOS 27 SDK 기준, scene 기반 라이프사이클 필수. Node 22.13+/24.3+/**26+** 지원 → 개발 Mac의 Node 26 그대로 쓸 수 있음. Android는 prebuilt expo-modules-core로 클린 빌드 시간 약 절반. CocoaPods가 여전히 기본이고 SwiftPM은 기초 작업 단계 | expo.dev/changelog/sdk-58 |
| New Architecture | SDK 55부터 끌 수 없음(SDK 54가 Legacy를 지원한 마지막 버전). 지금 쓰는 주요 라이브러리는 모두 New Arch 기준 | expo.dev/changelog/sdk-55 |
| Expo Go | SDK 58용 스토어 버전은 "몇 주 안에" 배포 예정. **우리는 네이티브 모듈(Rive·MMKV)을 써서 어차피 개발 빌드(dev client)를 쓰므로 영향 없음** | 같은 문서 |
| react-native-skia | 2.x, RN ≥0.79·React ≥19. 웹은 CanvasKit(WASM, gzip 약 2.9MB)으로 동작하고 Expo가 공식 지원 | shopify.github.io/react-native-skia/docs/getting-started/web |
| Rive RN | 새 런타임 `@rive-app/react-native`(Nitro 기반)가 권장. 0.5.0부터 Rive 새 네이티브 런타임 사용. Expo SDK 53+, iOS 15.1+, Android 24+. 데이터 바인딩(ViewModel)을 지원하고, ref 메서드는 폐기 예정. Margelo 측정으로 여러 뷰 로딩이 최대 94배 빠름 | rive.app/docs/runtimes/react-native |
| Rive 웹 | RN 패키지 문서에 웹 지원 언급 없음 → **웹 미리보기는 `@rive-app/react-webgl2` 등 웹 런타임으로 `.web.tsx` 플랫폼 분기**(같은 .riv 파일을 씀) | rive.app/docs |
| MMKV | v4는 Nitro 모듈. 웹에서는 localStorage를 쓰고, 막혀 있으면 메모리로 대체 | github.com/mrousavy/react-native-mmkv |
| expo-sqlite | 네이티브는 안정, **웹은 alpha**(wasm, SharedArrayBuffer용 COOP/COEP 헤더 필요) | docs.expo.dev/versions/v58.0.0/sdk/sqlite |
| IAP | Expo 공식 가이드는 RevenueCat(`react-native-purchases`)과 `expo-iap`(OpenIAP) 두 가지를 안내 | docs.expo.dev/guides/in-app-purchases |
| Godot | 4.7 정식(2026-06), 4.7.2 패치, 4.8 베타. 웹 export는 WebGL2(Compatibility), 4.6.3에서 Xcode 26 원클릭 배포 수정 | godotengine.org |
| Unity | 6.3 LTS(2027-12까지 지원). Runtime Fee 폐지, Personal은 무료(매출 상한 $200k), Unity 6부터 Personal의 스플래시 생략 가능 | unity.com/unity-6-release |
| Flutter/Flame | Flame 1.38.x(2026-08), Flutter 3.4x, rive(Flutter) 0.14.x 안정 + 0.15 dev | pub.dev |
| 스토어 심사 | Apple 4.2(최소 기능): "웹사이트를 껍데기에 넣은 앱"은 거절됨. Capacitor 앱도 네이티브다운 기능이 없으면 걸린다는 사례가 여러 건 있음 | developer.apple.com/app-store/review/guidelines |

> 주의: 서드파티 블로그만 근거인 항목(예: SDK 56의 최소 iOS 16.4, Hermes v1 기본값)은 표에서 뺐다. 착수할 때 `npx expo install --check`와 각 패키지 README로 다시 확인한다.

---

## 2. 비교표

점수: ◎ 아주 좋음 / ○ 좋음 / △ 보통·제약 있음 / ✕ 나쁨

| 기준 | (a) Expo + Skia + Reanimated + Rive | (b) RN CLI + 같은 스택 | (c) Godot 4.7 | (d) Unity 6.3 | (e) Flutter + Flame | (f) Phaser/Pixi + Capacitor |
|---|---|---|---|---|---|---|
| 2D 캐릭터 애니메이션 품질 | ◎ Rive 상태 머신으로 표정·감정 블렌딩, Skia 셰이더·파티클 | ◎ (a)와 같음 | ◎ AnimationTree·Skeleton2D·셰이더, 에디터 내장 | ◎ 2D Animation·Spine 공식 지원 | ○ flame_rive, Spine은 서드파티 | ○ Spine·Rive 웹 런타임, 웹뷰 성능에 좌우됨 |
| 성능(모바일) | ○ UI 스레드 Skia + Reanimated 워크릿. 키우기 게임엔 충분 | ○ 같음 | ◎ 네이티브 엔진 | ◎ (빌드 크기·시작 시간은 큼) | ◎ Impeller | △ WKWebView/WebView 위의 WebGL, 저가 Android에서 불안정 |
| 에이전트가 코드로 다루기 | ◎ 전부 TS/TSX, 씬도 JSX, 에이전트 학습 데이터 가장 많음 | ○ 네이티브 설정을 직접 관리해야 함 | ○ .tscn/.gd는 텍스트지만 에디터 의존 작업(애니메이션 트랙·리그)이 많음 | ✕ 씬·프리팹 YAML이 GUID 덩어리라 에이전트 편집이 위험, 에디터 필수 | ○ Dart는 다룰 만하지만 오너가 리뷰하기 어려움 | ◎ 순수 TS |
| 웹 미리보기·자동 테스트 | ◎ Expo Web + Playwright, 코어는 Vitest. 클라우드 리눅스에서 그대로 실행 | ○ react-native-web을 따로 붙여야 함 | ○ 웹 export + headless(gdUnit4/GUT). 리눅스 CI 가능 | △ WebGL 빌드가 무겁고 느림, 리눅스 headless 라이선스 설정이 번거로움 | ○ Flutter web + golden test | ◎ 브라우저가 곧 본체 |
| 로컬 Xcode 없이 iOS 빌드·제출 | ◎ **EAS Build/Submit(클라우드 macOS)** | △ 직접 CI(macOS 러너·fastlane)를 짜야 함 | ✕ iOS export가 Xcode 프로젝트를 만들어 내고, 서명·빌드는 Mac+Xcode 또는 macOS CI가 필요 | △ Unity Build Automation(유료) 또는 macOS CI | △ Codemagic 같은 외부 CI 필요 | △ Ionic Appflow·Capawesome·Codemagic 등 외부 서비스 필요 |
| 로컬 알림·IAP·광고·클라우드 저장 | ◎ expo-notifications, RevenueCat/expo-iap, react-native-google-mobile-ads(config plugin), Firebase/Supabase, iCloud·Play Games는 모듈로 | ◎ 같음(설정은 수동) | △ 공식 IAP 플러그인(Android 위주)과 커뮤니티 플러그인, AdMob도 커뮤니티 | ◎ Unity IAP·LevelPlay·UGS Cloud Save 공식 | ○ 공식 in_app_purchase, google_mobile_ads | ○ Capacitor 플러그인(RevenueCat 포함) |
| 스토어 심사 리스크 | 낮음 | 낮음 | 낮음 | 낮음 | 낮음 | **중간~높음**(4.2 웹 래퍼 판정) |
| 오너 역량과 맞음 (RN 4년차) | ◎ | ◎ | ✕ | ✕ | △ | ○ |
| 2026 생태계 상태 | ◎ SDK 58, New Arch 고정, Rive Nitro 런타임 | ○ | ○ 모바일 개선 중 | ○ 수수료 논란은 끝났지만 신뢰 회복 중 | ○ | ○ |

---

## 3. 추천: (a) Expo — 이유

1. **Xcode 없이 출시까지 갈 수 있음.** EAS Build가 클라우드 macOS에서 서명·빌드하고, EAS Submit이 App Store Connect·Play Console에 올린다. 오너 Mac에 Xcode·Android SDK·CocoaPods가 없어도 된다.
2. **에이전트 검증 루프가 가장 짧음.** 코어는 Vitest, 화면은 Expo Web을 Playwright로 스크린샷해 비교하고, 같은 명령이 클라우드 리눅스 루틴에서도 돈다. Godot·Unity는 화면 검증을 사실상 에디터나 실기기에서 해야 한다.
3. **오너가 읽을 수 있는 코드.** 전부 TS다. "큰 방향만 보는" 오너도 PR diff를 읽고 판단할 수 있다.
4. **캐릭터 품질은 Rive로 확보.** 표정·성격별 걸음·감정 전환을 Rive 상태 머신과 ViewModel 데이터 바인딩(예: `mood`, `energy`, `personality.shy` 같은 숫자 입력)으로 처리한다. 코어 상태를 렌더러 입력으로 그대로 연결하면 된다. 배경·방 꾸미기·파티클·셰이더 효과는 Skia가, 제스처와 UI 애니메이션은 Reanimated 4가 맡는다.
5. **수익화 생태계가 정석적임.** RevenueCat, AdMob, Firebase 등이 config plugin으로 붙어 네이티브 프로젝트를 직접 만질 일이 거의 없다(CNG: `ios/`·`android/`는 생성물로 다루고 커밋하지 않음).

### 알려진 약점과 대응

| 약점 | 대응 |
|---|---|
| Rive RN 런타임이 웹을 공식 지원하지 않음 | `Character.native.tsx`(@rive-app/react-native)와 `Character.web.tsx`(@rive-app/react-webgl2)로 나누고 같은 .riv·같은 props 인터페이스를 쓴다. 웹은 "미리보기용"이라는 점을 명시하고, 최종 확인은 실기기 개발 빌드에서 한다 |
| Rive 상태 머신 API가 아직 바뀌는 중(ref 메서드 폐기 예정) | 데이터 바인딩(ViewModel)만 쓴다. 렌더러 어댑터 한 곳에 몰아서 교체 비용을 줄인다 |
| Rive 무료 플랜 export에는 스플래시가 붙음(문서 기준) | 출시 전에 유료 플랜(Cadet 약 $9/월) 검토. 아트 제작 주체는 별도로 결정 |
| Skia 웹(CanvasKit) 2.9MB | 웹은 미리보기·테스트용이라 문제 없음 |
| 무거운 실시간 액션 게임에는 약함 | 키우기·꾸미기 장르엔 해당 없음. 미니게임이 필요하면 Skia 캔버스 안에서 해결 |
| Hermes v1 + Reanimated/worklets 메모리 회귀 이력(SDK 56) | 착수할 때 이슈 트래커를 확인하고 기본 Hermes 설정을 유지 |

---

## 4. 버린 안과 이유

- **(b) RN CLI**: 그래픽 스택은 (a)와 같은데, 네이티브 프로젝트·CocoaPods·Gradle을 직접 관리해야 하고 클라우드 빌드도 직접 짜야 한다. 오너가 RN CLI에 익숙하다는 점 말고는 얻는 게 없다. 필요하면 Expo의 prebuild로 언제든 같은 상태가 된다.
- **(c) Godot 4.7** (2순위): 2D 애니메이션 도구와 성능은 최고 수준이고 .tscn도 텍스트다. 버린 이유는 ① iOS 빌드에 Xcode가 있는 Mac이나 macOS CI가 필수라 "Xcode 없이"라는 조건을 못 지킴 ② IAP·AdMob·클라우드 저장이 커뮤니티 플러그인이라 유지보수 리스크가 있음 ③ 애니메이션 트랙·리깅은 에디터 GUI 작업이라 에이전트가 하기 어려움 ④ 오너가 GDScript 리뷰를 못 함.
- **(d) Unity**: 생태계는 가장 완비됐지만 씬·프리팹 YAML을 에이전트가 고치기 위험하고, 에디터 없이 개발할 수 없으며, 리눅스 headless 테스트에 라이선스 설정이 필요하다. 빌드 크기·시작 시간도 키우기 게임에는 과하다.
- **(e) Flutter + Flame**: 기술적으로는 탄탄하다(Impeller, flame_rive). 하지만 Dart라 오너의 4년 RN 경험이 쓸모없고, iOS 클라우드 빌드는 외부 CI에 의존해야 한다. (a) 대비 뚜렷한 이점이 없다.
- **(f) Phaser/Pixi + Capacitor**: 웹 테스트는 가장 쉽다. 하지만 ① 웹뷰 래핑 앱이 Apple 4.2로 거절될 리스크가 있고 ② 저가 Android WebView에서 WebGL 성능·메모리가 불안정하며 ③ 백그라운드·알림·IAP를 플러그인으로 이어 붙여야 하고 ④ "완성도 최우선"과 맞지 않는다.

---

## 5. 아키텍처 제안

### 5.1 모노레포 구조 (pnpm workspace)

```
mongmange/
  packages/
    core/            # @mong/core — 순수 TS, React/RN import 금지 (ESLint로 강제)
      src/
        model/       # 상태 타입: Pet, Needs, Personality, Inventory, Room
        sim/         # step(state, dtMs, rng) / advance(state, fromMs, toMs)
        events/      # 행동·이벤트 정의 (데이터 테이블)
        save/        # 직렬화, schemaVersion, migrations/
        time/        # 시간 신뢰도 판정(치트 방지), 오프라인 정산
        notify/      # "다음에 일어날 일" 예측 → 알림 스케줄 목록(순수 계산)
      test/          # vitest + fast-check(속성 기반) + 세이브 fixture
    content/         # 성격·아이템·대사 JSON + zod 스키마 (기획 데이터)
  apps/
    mobile/          # Expo SDK 58 앱
      src/render/    # Character.native.tsx / Character.web.tsx (Rive), Room (Skia)
      src/platform/  # storage, clock, notifications, iap, ads 어댑터
    e2e/             # Playwright(웹 스크린샷), Maestro 플로우(.yaml)
```

원칙:
- 코어는 `(state, input, now, rng) → newState` 형태의 **결정적 순수 함수**로 짠다. 난수는 시드 RNG(예: mulberry32)를 상태에 들고 다닌다. 그래서 같은 입력이면 항상 같은 결과가 나오고, 세이브만 있으면 버그를 재현할 수 있다.
- 플랫폼 의존성(시계, 저장소, 알림)은 인터페이스로 주입한다: `Clock`, `SaveStore`, `Scheduler`.
- 렌더러는 코어 상태에서 파생한 "표현 상태"(`mood: 0..1`, `expression: 'sleepy'|...`)만 받는다. 이 매핑(`selectVisual(state)`)도 코어에 두고 테스트한다.
- 테스트 계층:
  - 단위: 욕구 감소 곡선, 성격 변화, 이벤트 확률
  - 속성 기반: "advance를 한 번에 72시간 하든 1시간씩 72번 하든 결과가 같다", "모든 수치는 0..100을 벗어나지 않는다"
  - 골든: 시드 고정 30일 시뮬레이션 결과 스냅샷
  - 마이그레이션: v1~vN fixture 세이브 → 최신 스키마 검증

### 5.2 시간 흐름과 오프라인 진행

- 모바일 OS는 백그라운드에서 JS를 계속 돌려주지 않는다. 그래서 **"백그라운드에서 돌린다"가 아니라 "돌아왔을 때 정산한다"** 로 설계한다.
- 포그라운드: 1초(또는 화면 프레임과 분리된 저빈도) 틱으로 `step`을 실행한다. 렌더링 보간은 Reanimated가 맡는다.
- `AppState`가 `background`로 바뀔 때: 즉시 저장하고, 코어의 `notify.plan(state)`로 "배고픔 30 이하 도달 예상 시각" 같은 알림을 계산해 expo-notifications로 로컬 예약한다(iOS는 대기 알림이 64개로 제한되니 우선순위 상위 N개만).
- `active`로 돌아올 때: `elapsed = trustedNow - lastSimAt`을 구해 `advance()`로 정산한다.
  - **고정 스텝 + 해석식 혼합**: 욕구 감소처럼 선형·지수인 값은 닫힌 식으로 한 번에 계산하고, 이벤트(잠들기, 기분 변화)는 "다음 이벤트 시각"을 계산해 그 시점까지 점프하는 이벤트 드리븐 방식으로 처리한다. 수천 스텝을 루프 돌리지 않는다.
  - **상한(cap)**: 오프라인 진행은 최대 N시간(예: 72h)까지만 반영한다. 키우기 장르의 관례이면서 치트 피해를 줄이는 장치이기도 하다.
  - 정산 결과로 "자는 동안 있었던 일" 요약(일기)을 만들어 복귀 연출에 쓴다.

### 5.3 시간 조작 치트 방지

완벽한 방지는 불가능하다(오프라인 우선이라). 목표는 **"기기 시계를 앞으로 돌려도 얻는 게 별로 없게"** 만드는 것이다.

1. **단조 시계와 벽시계 교차 검증**: 네이티브 단조 시계(iOS `mach_continuous_time`/`ProcessInfo.systemUptime`, Android `SystemClock.elapsedRealtime`)를 Expo Modules API로 만든 작은 모듈로 읽는다. 저장할 때 `(wallMs, monoMs, bootId)`를 함께 기록한다.
   - 같은 부팅 안에서는 `Δwall`과 `Δmono`가 크게 어긋나면 시계를 조작한 것으로 보고 `Δmono`를 쓴다.
   - 재부팅 후(bootId가 바뀜)에는 단조 시계를 비교할 수 없으므로 벽시계를 쓰되 cap을 적용한다.
2. **역행 감지**: `wallNow < lastWall`이면 시간이 0만큼 흐른 것으로 처리하고, `lastWall`은 되돌리지 않는다(high-water mark).
3. **서버 시간(온라인일 때만)**: 앱이 시작되거나 복귀할 때 가벼운 HTTPS 엔드포인트의 `Date` 헤더나 자체 `/time`으로 오프셋을 보정한다. 실패해도 게임은 그대로 진행된다.
4. **보상 설계로 완화**: 시간에 비례하는 보상에 상한을 두고, 희귀 보상은 "같이 보낸 시간(포그라운드 플레이)"에 묶는다. 유료 재화가 생기면 서버 검증(RevenueCat 영수증 + 클라우드 세이브 서버 타임스탬프)을 붙인다.
5. 이 판정 로직은 전부 `core/time`에 두고, 시나리오 테이블(정상, 앞으로 돌림, 뒤로 돌림, 재부팅, 시간대 변경)로 단위 테스트한다.

### 5.4 저장과 세이브 마이그레이션

- **1차 선택: MMKV(v4)에 세이브 스냅샷 JSON 저장.** 키우기 게임의 상태는 수십 KB 수준이라 KV 하나면 충분하다. 동기 API라 백그라운드로 전환되는 순간 바로 저장할 수 있고, 웹에서는 localStorage로 동작해 Playwright 테스트도 그대로 된다.
  - 키: `save/current`, `save/backup/1..3`(롤링 백업), `save/meta`
  - 원자성: `save/pending`에 먼저 쓰고 검증(zod parse)한 뒤 `current`로 승격한다. 로드할 때 `current`가 깨져 있으면 백업으로 복구한다.
- **SQLite는 나중에, 필요할 때만**: 일기·사진첩·행동 로그처럼 계속 쌓이고 조회해야 하는 데이터가 생기면 expo-sqlite를 추가한다(웹은 alpha라 처음부터 핵심 저장소로 쓰지 않는다).
- **마이그레이션**:
  - `{ schemaVersion: number, savedAt, data }` 봉투로 감싼다.
  - `migrations/v1_to_v2.ts` 같은 순수 함수 체인으로 짜고, 로드할 때 `current < LATEST`면 차례대로 적용한 뒤 zod로 최종 검증한다.
  - 마이그레이션 전 원본은 `save/backup/pre-vN`에 보관한다.
  - **출시 버전마다 fixture 세이브를 `core/test/fixtures/`에 고정**하고, CI에서 모든 fixture가 최신 스키마로 올라오는지 확인한다.
  - 다운그레이드(새 세이브를 옛 앱이 읽는 경우)는 거부하고 안내 화면을 띄운다.
- **클라우드 저장(나중)**: 같은 봉투를 그대로 업로드한다(Supabase/Firebase, 또는 플랫폼 iCloud KVS·Play Games Saved Games). 충돌하면 `savedAt`과 플레이 시간 같은 진행도 지표를 함께 보여 주고 사용자가 고르게 한다.

---

## 6. 오너가 설치·준비해야 할 것

필수(출시까지):
1. **Apple Developer Program 가입**($99/년) — EAS가 인증서·프로비저닝을 자동으로 만들려면 오너 계정 로그인(2FA)이 한 번 필요하다.
2. **Google Play Console 계정**($25, 1회) + 첫 업로드용 서비스 계정 키(EAS Submit용).
3. **Expo 계정** + `eas login`(eas-cli 설치는 에이전트가 `pnpm dlx`나 전역 설치로 처리).
4. **실기기 1대 이상(iPhone 권장 + Android 1대)** — EAS 개발 빌드 설치, 애니메이션·알림·IAP 최종 확인용. iOS는 기기 UDID 등록(`eas device:create`)을 한 번 해야 한다.
5. **Rive 계정**(에디터). 출시 빌드 전에 스플래시 없는 export가 되는 유료 플랜을 검토.

권장(있으면 오너 손이 덜 감):
6. **Xcode(App Store) + iOS 시뮬레이터** — 로컬에서 바로 띄워 보거나 네이티브 크래시를 볼 때 필요. 없어도 개발과 출시는 가능하다.
7. **Android Studio(SDK·에뮬레이터)** — 위와 같은 이유.

에이전트가 알아서 하는 것: pnpm 워크스페이스, Expo 프로젝트, Playwright 브라우저(`npx playwright install chromium`), Vitest, EAS 설정(`eas.json`), Maestro 플로우.

설치하지 않아도 되는 것: CocoaPods(EAS 클라우드에서 처리), Ruby·fastlane, Godot·Unity·Flutter.

---

## 7. 다음 단계 제안

1. 오너가 스택을 결정하면 `DECISIONS.md`에 기록한다.
2. 스파이크(1~2일, 에이전트): Expo SDK 58 템플릿 + Rive 샘플 캐릭터(표정 3개, 데이터 바인딩) + Skia 방 배경 + `@mong/core` 최소 틱 → 웹 Playwright 스크린샷 → EAS iOS·Android 개발 빌드 성공까지 확인.
3. 스파이크에서 확인할 리스크: Rive 웹·네이티브의 렌더링 차이, SDK 58에서 Rive Nitro·MMKV·Skia 버전 호환성, 백그라운드 전환 시 동기 저장 시간.

---

## 출처

- Expo SDK 58 changelog: https://expo.dev/changelog/sdk-58
- Expo SDK 58 업그레이드: https://expo.dev/blog/how-to-upgrade-to-sdk-58
- Expo SDK 56: https://expo.dev/changelog/sdk-56
- Expo SDK 55 (New Architecture 필수): https://expo.dev/changelog/sdk-55
- Expo New Architecture 가이드: https://docs.expo.dev/guides/new-architecture
- Expo Skia: https://docs.expo.dev/versions/latest/sdk/skia
- React Native Skia 웹: https://shopify.github.io/react-native-skia/docs/getting-started/web
- Rive React Native: https://rive.app/docs/runtimes/react-native/react-native
- Rive RN 마이그레이션 가이드: https://rive.app/docs/runtimes/react-native/migration-guide
- Rive 기능 지원표: https://help.rive.app/runtimes/feature-support
- Margelo, Rive RN Nitro 재작성: https://margelo.com/blog/rewriting-rive-react-native-with-nitro-modules
- Rive export(플랜별): https://rive.app/docs/editor/exporting
- react-native-mmkv: https://github.com/mrousavy/react-native-mmkv
- expo-sqlite (SDK 58): https://docs.expo.dev/versions/v58.0.0/sdk/sqlite
- Expo 인앱 결제 가이드: https://docs.expo.dev/guides/in-app-purchases/
- Godot 4.6.3 유지보수 릴리스: https://godotengine.org/article/maintenance-release-godot-4-6-3/
- Godot 모바일 업데이트(2026-04): https://godotengine.org/article/godot-mobile-update-apr-2026/
- Godot 4.7 정리(서드파티): https://ziva.sh/blogs/godot-4-7
- Unity 6 릴리스: https://unity.com/unity-6-release
- Unity Runtime Fee 폐지: https://unity.com/blog/unity-is-canceling-the-runtime-fee
- Flame: https://pub.dev/documentation/flame/latest/
- Rive Flutter: https://rive.app/docs/runtimes/flutter
- Apple App Review Guidelines(4.2): https://developer.apple.com/app-store/review/guidelines/
- 웹뷰 래핑 앱 심사(서드파티, 참고용): https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper
