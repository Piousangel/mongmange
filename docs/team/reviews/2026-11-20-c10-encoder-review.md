# C10 첫 조각 — 이레 영상 네이티브 인코더 독립 리뷰 (iOS AVFoundation·Android MediaCodec·RN 모듈, 2026-11-20)

- 리뷰어: 독립 리뷰어(작성 불참). 강도: 높음(네이티브 크래시·메모리·빌드는 위험 영역이고 실기기 확인 전이라 정적 리뷰로 잡아야 함).
- 대상(미커밋 C10만): `apps/mobile/modules/ire-encoder/**`(index.ts, expo-module.config.json, ios/IreEncoder.podspec·IreEncoderModule.swift, android/build.gradle·IreEncoderModule.kt), `src/share/ireMp4.ts`·`ireNativeEncoder.ts`·`ireVideoDev.ts`·`ireVideo.ts`, `App.tsx`, `src/game/DevPanel.tsx`, 시험(ire-mp4·ire-native-encoder·ire-video·skia/ire-frames·support/mp4Fixture), `packages/core/src/visual/ireScroll.ts`(540×676)·시험, `scripts/check-ire-mp4.mjs`, `docs/app/c7/device-gate.md`·`ART-CHECK.md`, DECISIONS 'C7' 절의 변경 두 곳.
- 범위 밖: B3(apps/server·web-static·core snap·contract). 다만 3번 항목에서 서버 파서와 규칙을 대조했다.
- 기준: DECISIONS 'C7 이레 두루마리 영상'(원시 RGBA·차례·미완료 2·파일명 고정·메타 없음), architecture 3-5-3 ③, `src/lib/optionalModule.ts`.
- 고친 것: 없음. 돌연변이와 교차 시험은 적용한 뒤 원본으로 되돌렸고 `cmp`로 일치를 확인했다. 임시 시험 폴더(`apps/server/test/__tmp_review`)는 지웠다.

## 실행 결과

| 항목 | 결과 |
|---|---|
| `pnpm verify` | **통과**(7단계, 32.2초). typecheck·lint·directives·tools·test·server-bundle·static-empty 모두 초록. B3 쪽에서도 빨간불 없음 |
| ire 시험 3파일(mobile) | 46/46 통과 |
| `swiftc -typecheck`를 재현함(macOS SDK + 직접 쓴 ExpoModulesCore 대역) | `-swift-version 5`: **오류 0**. `-swift-version 6`: **오류 1** — `IreEncoderModule.swift:231` `reference to captured var 'pos' in concurrently-executing code`(L-4) |
| Kotlin 컴파일 | **못 함**(kotlinc 없음). 정적으로만 읽음 |
| 서버 `checkMp4` ↔ 앱 `finalizeIreMp4` 교차 | 임시 시험으로 확인. muxer 꼴 고정물을 마무리한 뒤 서버 `checkMp4(head, size, PAGE_FILES.loop)`에 넣으면 `{ok:true}`. 리뷰하는 동안 B3이 contract를 540×676으로 고쳤다(처음 grep에서는 675였다) |
| EAS·실기기 | 하지 않음(로컬에서 불가) |

### Swift typecheck 대역 방식의 한계
대역은 `Function`·`AsyncFunction`을 아무 제네릭이나 받게 만든 것이라 다음은 **검증하지 못한다**. (1) 실제 `AnyArgument` 제약과 인자 변환(`Uint8Array`·`Record`·`Promise`의 위치). (2) iOS SDK 전용 가용성·심볼 차이(macOS SDK로 검사함). (3) 결과 빌더가 실제 `ModuleDefinition`을 만드는지. (4) 런타임 동작(AVAssetWriter 상태 기계, 아래 H-1·M-2) — 크래시 위험은 타입 검사로 잡을 수 없다. 대역이 통과해도 '컴파일된다'는 근거는 되지만 '돈다'는 근거는 아니다. EAS 개발 빌드가 첫 진짜 증거다.

## 발견

### 높음

**H-1 iOS: 인코딩 중 취소하거나 실패하면 `DispatchGroup`이 남은 enter를 안은 채 해제되어 크래시 가능** — `ios/IreEncoderModule.swift:124, 228-243, 439-452`
- `startAudio`가 `audioDone.enter()`를 부르고, `leave()`는 `requestMediaDataWhenReady` 블록 안에서만 부른다. 그런데 `cancel()`이 `writer.cancelWriting()`을 부른 뒤로 AVFoundation이 그 블록을 다시 불러 준다는 보장이 없다. 게다가 블록은 `[weak self]`라 세션이 먼저 해제되면 `guard let self` 단계에서 바로 빠진다.
- 세션이 해제되는 시점은 모듈의 `swap(nil)` 직후다. 클로저들이 모두 weak이라 세션을 잡고 있는 것이 없다. 그때 그룹이 `leave` 없이 해제되면 libdispatch가 `BUG IN CLIENT OF LIBDISPATCH: Group object deallocated while in use`로 **프로세스를 죽인다**.
- 발생 경로는 흔하다. 공유판은 소리가 늘 켜져 있고, interleave 때문에 소리 입력은 영상보다 앞서 끝나지 못한다. ① 인코딩 중 화면을 떠남(abort → `native.cancel()`) ② 백그라운드 전환(VideoToolbox 세션 무효화 → append 실패 → JS가 cancel) ③ 실패한 뒤 `finish`의 오류 경로(`cancel()` → done). device-gate 9번 '중단' 항목이 바로 이 경로다.
- 제안: `cancel()`·`fail()`에서 아직 떠나지 않았으면 한 번만 `leave()`하도록 플래그를 잠금 아래 둔다. 또는 DispatchGroup 대신 '소리 끝남' 플래그와 완료 콜백을 쓴다. 고친 뒤 gate 9번을 iOS에서 꼭 돌린다.

### 중간

**M-1 iOS: AVAssetWriter 호출이 여러 스레드에서 겹친다 — ObjC 예외(Swift에서 못 잡음)로 크래시할 여지** — `IreEncoderModule.swift:344-359, 412-427, 450` [Apple 동작 확인 필요]
- `cancel()`은 모듈 큐(또는 JS)에서 `cancelWriting()`을 부르고, 같은 순간 `videoQueue`가 `adaptor.append`를, `audioQueue`가 `input.append`나 `markAsFinished`를 부를 수 있다. 353행의 `stopped` 확인과 append 사이도 경쟁 구간이다.
- `finish`는 `failure`만 확인하고 `writer.status == .writing`은 보지 않은 채 `endSession`·`finishWriting`을 부른다. 백그라운드 전환처럼 writer가 비동기로 `.failed`가 되면 'Cannot call method when status is 3' 류의 예외가 날 수 있다.
- 제안: 모든 writer·input 호출(cancelWriting 포함)을 `videoQueue` 한 곳에서 직렬화하고, 호출할 때마다 `writer.status == .writing`을 확인한다.

**M-2 JS: 네이티브 대기에 시간 상한이 없고 중단이 전달되지 않는다 — 공유 버튼이 영원히 '만드는 중'** — `src/share/ireNativeEncoder.ts:75, 80`
- abort는 `await native.waitForCapacity()`·`await native.finish()`가 **끝난 뒤에만** 확인한다. 네이티브가 멈추면 다음처럼 영원히 기다린다.
  - Android: EOS가 안 오면 `drainLoop`가 `!stopped` 동안 10ms 간격으로 계속 돈다(`IreEncoderModule.kt:348`).
  - iOS: H-1을 고쳐도 소리 블록이 다시 불리지 않으면 `audioDone.notify`가 오지 않는다.
- 이 경우 화면을 떠나도 풀리지 않고, `cardText`의 lock은 컴포넌트 단위라 다시 들어오면 새 인코딩이 겹친다(M-3으로 이어짐).
- 제안: abort 리스너에서 곧바로 `native.cancel()`을 부른다(두 플랫폼 모두 cancel이 대기자를 reject함). 감시 시간(예: 공유 30초·루프 20초)을 넘기면 cancel한 뒤 이미지판으로 넘어간다.

**M-3 네이티브 세션이 모듈 전역 하나이고 cancel·finish에 세션 구분이 없다** — `IreEncoderModule.swift:63-71, 101-103`, `IreEncoderModule.kt:75-80, 98-101`, `ireNativeEncoder.ts:39, 95`
- 앞 인코딩이 중단되어 catch에서 `native.cancel()`을 부르는 순간, 이미 새 `begin`을 한 **다른 인코딩의 세션**을 죽인다. 새 인코딩의 `resetDir`도 앞 인코딩의 파일을 지운다.
- 경로: 화면을 떠났다가 곧바로 돌아와 다시 보내기(M-2가 겹치면 쉬움), 개발 메뉴 '루프 인코딩 측정'과 공유를 동시에 실행.
- 제안: `begin`이 세션 id를 돌려주고 `appendFrame`·`waitForCapacity`·`finish`·`cancel`이 그 id를 받는다. 다른 id면 아무것도 하지 않는다. 또는 JS 모듈 전역의 단일 진행 잠금을 둔다.

**M-4 Android: 정리(teardown) 순서 때문에 그리기 스레드와 Surface 해제가 경쟁** — `IreEncoderModule.kt:404-428, 322-342, 319`
- 드레인이 멈추면 인코더 출력을 아무도 비우지 않는다. 그러면 입력 Surface의 BufferQueue가 차고, 그리기 스레드가 `lockHardwareCanvas`의 dequeue에서 막힌다. `shutdownNow()`의 interrupt로는 네이티브 대기가 풀리지 않으므로 `awaitTermination(2s)`이 시간을 다 쓰게 되고, 그 뒤 `codec.stop/release`·`surface.release`·`recycleBitmaps()`가 아직 살아 있는 그리기 스레드와 겹친다.
- 제안: 순서를 `codec.stop()`(BufferQueue를 버려 dequeue를 깨움) → `drawer.awaitTermination` → `surface.release()` → `codec.release()` → 비트맵 회수로 바꾼다. `append`의 `drawer.execute`는 try 밖이라, 종료된 뒤에 부르면 `RejectedExecutionException`이 나고 queued 감소도 빠진다. 세션이 죽은 뒤라 영향은 작지만 try 안으로 옮기는 편이 낫다.

**M-5 Android: 비트레이트 예산이 벽시계 기준이라 파일 크기가 인코딩 시간에 비례할 위험** — `IreEncoderModule.kt:5-6, 173-184, 322-334` [기기마다 다름, 확인 필요]
- Canvas로 넣은 프레임의 시각은 시스템 시계다. 하드웨어 VBR 상당수는 입력 시각 간격으로 프레임당 비트를 나눈다. 렌더가 1/fps보다 느리면 '긴 영상'으로 보고 프레임당 비트를 더 쓴다.
  - 루프: 400kbps × 실제 인코딩 시간(예: 12초) ≈ 600KB로 상한에 닿는다. 그러면 자체 검사 `size`에서 떨어지고, **느린 기기일수록 늘 이미지판**이 된다.
  - 공유: 4Mbps × 15초 ≈ 7.5MB로 gate의 8MB 경계에 붙는다.
- 반대로 렌더가 빠르면 화질이 떨어진다.
- 제안: EGL 입력 Surface에 `eglPresentationTimeANDROID(n/fps)`로 시각을 직접 넣는다(표준 방식). 그러면 출력 시각을 다시 적을 필요도 없고 Baseline 강제도 풀 수 있다. 최소한 gate 표에 '렌더 시간 대비 파일 크기'를 한 칸 추가한다.

**M-6 시험 공백: 자체 검사·표시 크기 쓰기를 지워도 시험이 통과한다** — 아래 돌연변이 M8·M9
- '검사에 떨어진 파일은 시트에 올리지 않는다'(`ireNativeEncoder.ts:85-86`)는 C7 계약의 핵심 안전장치인데, 지워도 46/46 그대로다. 마무리는 되지만 검사에 떨어지는 원시 파일(예: 9초, 600KB 초과, 트랙 수 불일치)을 가짜 네이티브가 쓰게 하고 → 거절되고 두 파일 모두 없음을 확인하는 시험이 필요하다.
- tkhd 표시 크기 덮어쓰기(`ireMp4.ts:177-182`)도 고정물의 tkhd가 이미 정답 크기라 살아남는다. 고정물에 tkhd 542×678 같은 다른 값과 tkhd 버전 1을 하나씩 넣어야 한다.

### 낮음

- **L-1 Android `KEY_LEVEL` = Baseline 최고 레벨**(`kt:179`): 일부 인코더는 명시한 레벨·프로필 조합을 configure에서 거부하거나 무시한다. 레벨은 빼거나 크기에 맞는 최저 레벨을 쓰고, 거부되면 프로필 없이 다시 시도한다. 재정렬은 기존 검사(`kt:364`)가 잡는다.
- **L-2 16배수가 아닌 크기**: 540(=16×33.75)과 676(=16×42.25), 1080(=16×67.5)이 그렇다(1920은 16배수). `isSizeSupported`는 기기가 광고한 정렬만 본다. 옛 MTK·Exynos 계열은 오른쪽·아래 가장자리에 녹색 띠나 줄 밀림이 생기는데 실패로 잡히지 않는다. gate 6번 '재생·화질'에 '가장자리 확대 확인'을 명시한다.
- **L-3 색 꼬리표가 없다**: iOS에 `AVVideoColorPropertiesKey`가 없고, Android에 `KEY_COLOR_STANDARD/RANGE/TRANSFER`(API 24+)가 없다. 두 플랫폼의 RGB→YUV 행렬(601/709)이 다를 수 있고, SNS가 꼬리표 없는 영상을 다시 해석하면 색이 어긋날 수 있다. 둘 다 BT.709·limited로 명시하기를 권한다.
- **L-4 Swift 6 모드에서 컴파일 실패**(`swift:231`, `pos`·`left`를 @Sendable 클로저가 잡음): podspec은 `swift_version '5.9'`로 고정되어 있어 지금은 문제없다. ExpoModulesCore 쪽은 6.0이라, 나중에 맞춰 올리면 빌드가 깨진다. 상태를 클래스 필드(잠금 아래)로 옮겨 두면 안전하다.
- **L-5 Hermes 메모리 회전**: `renderFrame.tsx:51`의 `readPixels`가 프레임마다 새 8.3MB 배열을 만든다(240장이면 약 2GB가 오간다). 네이티브는 호출 안에서만 읽어 수명은 안전하다. iOS는 `rawPointer` 복사, Android는 `toDirectBuffer` → `copyPixelsFromBuffer`로 둘 다 동기다. 다만 외부 메모리 GC가 늦으면 저메모리 Android에서 OOM이 날 수 있으니 gate 8번(최고 PSS)에서 꼭 본다. `readPixels`에 대상 버퍼를 넘기는 재사용 방식을 검토한다.
- **L-6 AAC priming 차이**: iOS는 elst에 priming을 적는다(마무리가 edts를 보존해서 맞음). Android MediaMuxer는 적지 않는다. 지금은 무음이라 무해하지만, 다음 조각에서 PCM을 섞으면 두 플랫폼 사이에 약 23~46ms의 A/V 차이가 생긴다.
- **L-7 iOS `shouldOptimizeForNetworkUse = true`**(`swift:147`): JS 마무리가 어차피 moov를 다시 쓰므로 finishWriting에서 파일을 한 번 더 고쳐 쓰는 시간·디스크 비용만 든다. false로 두면 공유 시간이 조금 준다.
- **L-8 규칙 상수 시험이 contract를 import하지 않는다**(`test/ire-mp4.test.ts:28-29`): 600KB를 숫자로 적었고 폭·높이는 contract `PAGE_FILES.loop`와 대조하지 않는다. 675/676 같은 어긋남을 시험이 못 잡는다(이번에는 B3이 손으로 맞춤). `@mong/contract`의 `PAGE_FILES.loop`·`LOOP_SECONDS`를 직접 대조하고, 가능하면 서버 `checkMp4`를 마무리 결과에 돌리는 교차 시험을 하나 둔다(이번 리뷰에서 임시로 돌려 통과 확인).

## 항목별 점검 요약

1. **스레드·메모리**: JS 메모리는 두 플랫폼 모두 동기 호출 안에서만 읽는다(OK). vImage 채널 맵 `[2,1,0,3]`은 RGBA→BGRA로 정확하다. 입력이 비곱셈 알파이고 두 플랫폼 모두 알파를 무시하므로(iOS H.264, Android `setHasAlpha(false)`) 결과가 같다. 불투명 배경이면 무해하다. iOS는 `adaptor.pixelBufferPool`을 쓰고 ARC가 관리해 누수가 없다. Android 비트맵 2장 풀의 `free.offer`가 `queued--`보다 먼저라 'no free bitmap' 경쟁은 없다(OK). `lock/unlockCanvasAndPost` 짝은 finally로 맞다. 해제 경로의 위험은 H-1·M-1·M-4에 적었다.
2. **인코딩 정확성**: iOS CMTime은 `index/fps`, `endSession(frames/fps)`로 맞다. Android 출력 시각 재기록은 Baseline·재정렬 검사·`written==frames` 검사와 함께 맞다. Baseline이 없으면 begin에서 실패해 이미지판으로 간다(OK). 드레인 무한 대기는 M-2, 크기 정렬은 L-2, 비트레이트는 M-5에 적었다.
3. **JS 마무리**: stco·co64 이동(delta), largesize mdat, 크기 0 mdat, 상자 크기 재계산(컨테이너 머리를 뒤에서 채움), 시각 0(mvhd·tkhd·mdhd, 버전 1 포함), tkhd 폭·높이 오프셋 76/88 모두 맞다. edts/elst를 보존하는 것도 맞다. 서버 파서와 규칙(크기 0·1·8 미만, moov 64KB, 7.5~8.5초, `soun` → audio, tkhd)이 같고, 앱이 더 엄격하다(moov 뒤 상자를 파일 끝까지 보고 메타도 검사). 손상 위험은 찾지 못했다.
4. **실패 경로**: 모든 단계 실패 → catch에서 cancel·두 파일 삭제 → `shareIre`가 이미지판으로 간다. abort는 시트·이미지판 모두 열지 않는다(OK). 측정 로그(`[ire-video] kind 크기 프레임 ms bytes`)에 개인정보는 없다. `console.warn`에 앱 캐시 경로가 섞일 수 있지만 개인정보는 아니다. 남은 구멍은 M-2(멈춤)·M-3(교차 취소)·M-6(자체 검사 시험)이다.
5. **빌드**(근거와 함께):
   - 로컬 모듈은 `apps/mobile/modules/`가 autolinking 기본 `nativeModulesDir`라 app.json 수정 없이 잡힌다. `expo-module.config.json`의 `platforms: ["apple","android"]`·`apple.modules`는 SDK 58 형식이다.
   - podspec은 iOS 16.4로 ExpoModulesCore 58.1.0 podspec(16.4)과 같고, `static_framework`·`DEFINES_MODULE`도 템플릿과 같다. Swift 5.9 모드로 pod를 따로 컴파일하는 것은 허용된다(L-4).
   - gradle은 SDK 53+ 템플릿 꼴(`expo-module-gradle-plugin`이 kotlin·SDK 버전을 넣음)이다. minSdk 기본 24로 `lockHardwareCanvas`(23+)를 만족하고, `KEY_MAX_B_FRAMES`는 Q 가드가 있다.
   - R8: expo-modules-core consumer 규칙이 `Record` 구현체·`@Field`·`Module` 하위 클래스를 keep한다(proguard-rules.pro 6-27행) → OK.
   - **EAS에서 깨질 수 있는 지점**: (a) Kotlin을 한 번도 컴파일하지 않았다 — `private class EncodedAudio`를 public 클래스의 private 프로퍼티 타입으로 쓰는 것은 같은 파일이라 허용으로 보이지만 컴파일러 확인 전이다. (b) Swift 실제 `AnyArgument` 제약(대역 한계). (c) 새 아키텍처: Expo 모듈은 JSI 경로라 별도 설정이 필요 없다. 할 일: 리허설 전에 `npx expo prebuild --clean` 뒤 `./gradlew :ire-encoder:compileDebugKotlin`, `xcodebuild -scheme IreEncoder` 한 번씩 돌린다.
6. **시험 품질**: 아래 표 참조. 핵심인 stco/co64 재계산·역압·cancel·파일 삭제·시각 0은 모두 잡힌다. 자체 검사와 표시 크기는 공백이다(M-6).
7. **개발 메뉴**: `DevPanel`은 `GameApp.tsx:476`에서 `__DEV__ &&`로만 그린다 → 제품 빌드에 노출되지 않는다. `ireVideoDev.ts`는 번들에 죽은 코드로 남지만 닿지 않는다. 플래그 `ireVideo` 기본값은 false이고 웹 쿼리 켜기도 `__DEV__`에서만 된다(OK). 측정 버튼은 중단할 수 없고 공유 폴더를 같이 지운다(M-3, 개발 전용).

## 돌연변이(직접 9종, 모두 되돌린 뒤 cmp 일치)

| # | 바꾼 것 | 결과 |
|---|---|---|
| M1 | `ireMp4.ts` stco/co64 delta = 0(오프셋 재계산 제거) | **잡힘**(3 실패) |
| M2 | co64 표 수집 제거 | **잡힘**(1 실패) |
| M3 | `framePump` 미완료 상한(2) 무시 | **잡힘**(역압 시험, 시간 초과로 실패) |
| M4 | 어댑터의 `waitForCapacity` 제거 | **잡힘**(4 실패) |
| M5 | catch의 raw·out 파일 삭제 제거 | **잡힘**(1 실패) |
| M6 | catch의 `native.cancel()` 제거 | **잡힘**(2 실패) |
| M7 | `zeroTimes` 무력화 | **잡힘**(6+ 실패) |
| M8 | tkhd 표시 높이 쓰기 제거 | **살아남음**(M-6) |
| M9 | 자체 검사 실패 시 throw 제거 | **살아남음**(M-6) |

## 커밋 전 권고 순서
1. H-1(DispatchGroup)과 M-1(writer 호출 직렬화)을 고친다 — 크래시 계열이라 리허설 전에 끝낸다.
2. M-2(abort → 즉시 cancel + 감시 시간)와 M-3(세션 id)을 고친다.
3. M-6 시험 두 개와 L-8 contract 대조를 추가한다.
4. M-4 teardown 순서를 바꾼다. M-5는 gate에서 측정 칸을 추가한 뒤 EGL로 갈지 PM과 정한다.
5. 리허설 전에 Kotlin·Xcode 실제 컴파일을 한 번 돌린다(5번 항목의 명령).
