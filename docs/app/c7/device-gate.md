# C7·C10 이레 영상 — 실기기 관문 (12-05, S25)

- 근거: DECISIONS 'C7 이레 두루마리 영상'(15초 관문, 출력 두 벌), D-20(12-05까지 중급 Android 8초·240프레임 + 소리를 15초 안에 못 만들면 9:16 두루마리 이미지로 출시), architecture 3-5-3 ③(루프 커밋 검사).
- 대상 코드: `apps/mobile/modules/ire-encoder/`(iOS AVAssetWriter, Android MediaCodec + MediaMuxer), `src/share/ireNativeEncoder.ts`(차례·역압·중단·마무리·자체 검사), `src/share/ireMp4.ts`(faststart·메타 0·표시 크기·검사 규칙), `scripts/check-ire-mp4.mjs`(산출물 검사).
- 규격: 공유 1080×1920·30fps·240프레임·H.264 + AAC(모노 44.1kHz, 지금은 무음 — 소리 섞기는 다음 조각) / 웹 루프 **540×676**(PM 11-20 개정)·24fps·192프레임·무음.

## 0. 준비 (PM C10 묶음 리허설 때)

0. 리허설 전 실제 컴파일 한 번(리뷰 5번 — 로컬에는 Kotlin 컴파일러·Xcode가 없어 정적 점검만 했다): `cd apps/mobile && npx expo prebuild --clean` 뒤 `cd android && ./gradlew :ire-encoder:compileDebugKotlin`, `xcodebuild -workspace ios/*.xcworkspace -scheme IreEncoder build`. prebuild 산출물은 커밋하지 않는다.
1. 개발 빌드: `eas build --profile development --platform android`(그리고 `ios`). 로컬 모듈은 `apps/mobile/modules/`에서 자동 링크된다(app.json 수정 없음).
2. 설치 뒤 Metro 연결. 개발 메뉴(DEV) → **이레 영상 켜기**(플래그 `ireVideo`, 재시작하면 꺼짐).
3. 세이브: 이레(7일째)까지 있는 세이브. 개발 메뉴의 '다음 아침'을 7번 또는 세이브 고정물.
4. 로그 보기: Android `adb logcat -s ReactNativeJS:V | grep ire-video`, iOS Xcode 콘솔에서 `[ire-video]`.

## 1. 측정 항목·명령

| # | 항목 | 하는 법 | 기록 |
|---|---|---|---|
| 1 | 공유판 전체 시간(누름 → 시트) | 아침 이레 화면에서 '보내기'를 누르고 시트가 뜰 때까지 초시계. 같은 값이 로그 `[ire-video] share 1080x1920 240f total …ms`에도 남는다 | 3회, 중앙값 |
| 2 | 단계 나눔 | 같은 로그 줄의 `render-wait`(JS 그리기 기다림)·`encoder-wait`(네이티브 대기열 기다림) | `render-wait`가 크면 그리기가 병목, `encoder-wait`가 크면 하드웨어 인코더가 병목 |
| 3 | 웹 루프 시간 | 개발 메뉴 → **루프 인코딩 측정**. 화면에 `prepare …ms + encode …ms`, 로그에 `[ire-video] webLoop 540x676 192f …` | 3회 |
| 4 | 파일 크기 | 로그 `bytes` | 공유·루프 각각 |
| 4-1 | **렌더 시간 대비 파일 크기**(리뷰 M-5) | 같은 로그 줄의 `total`과 `bytes`. 공유판을 3회 + 개발 메뉴에서 일부러 느리게(다른 앱을 띄운 상태 등) 1회 | Android에서 `bytes`가 `total`에 비례해 커지면 비트 예산이 벽시계를 따른다는 뜻 → 아래 3절 'EGL 전환' 결정 |
| 5 | 서버 검사 통과 | 아래 2절 명령으로 기기 파일을 꺼내 `node scripts/check-ire-mp4.mjs` | 합격/불합격 이유 |
| 6 | 재생·화질 | 꺼낸 파일을 맥에서 재생(QuickTime), 프레임 수 `ffprobe -v error -count_frames -show_entries stream=nb_read_frames <파일>`. **오른쪽·아래 가장자리를 확대**해 녹색 띠·줄 밀림이 없는지(540·676·1080은 16의 배수가 아니다, 리뷰 L-2). 색이 원본 PNG와 같은지(BT.709 꼬리표, L-3) | 공유 240·루프 192, 가장자리 정상 |
| 7 | 공유 앱 | 시트에서 **인스타그램(스토리·릴스)·카카오톡(나와의 채팅)** 으로 보내 재생되는지, 잘림·회전·검은 화면이 없는지 | 화면 녹화 1개씩 |
| 8 | 메모리 | Android Studio Profiler 또는 `adb shell dumpsys meminfo com.piousangel.mongmange`를 인코딩 중 2회 | 최고 PSS |
| 9 | 중단 | 인코딩 중 홈으로 나가기·화면 떠나기 → 시트·이미지판 모두 안 뜨고, 다음 공유 때 정상. **iOS에서 꼭**(리뷰 H-1: 소리 입력이 있는 공유판 취소 경로 — 앱이 죽지 않아야 한다). 떠났다가 곧바로 돌아와 다시 보내기도 1회(세션 id, M-3) | 통과/실패 |
| 9-1 | 멈춤 | 네이티브가 멈추면 프레임 대기 5초·finish 20초 상한(`IRE_WAIT_MS`)에서 cancel → 이미지판. 로그에 `took longer than`이 보이면 기록 | 발생 횟수 |
| 10 | 폴백 | 플래그 끔 상태에서 보내기 → 이미지판(빌드 1 두루마리 PNG) | 통과/실패 |

## 2. 기기 파일 꺼내기 → 검사

공유 폴더는 `캐시/mong-share/`이고 다음 공유 전에 비워진다. 그래서 **보낸 직후** 꺼낸다.

```sh
# Android(개발 빌드는 debuggable이라 run-as가 된다)
adb exec-out run-as com.piousangel.mongmange cat cache/mong-share/mongmangi-ire-9x16.mp4 > /tmp/ire-share.mp4
adb exec-out run-as com.piousangel.mongmange cat cache/mong-share/loop.mp4 > /tmp/loop.mp4
node scripts/check-ire-mp4.mjs /tmp/ire-share.mp4 --kind share
node scripts/check-ire-mp4.mjs /tmp/loop.mp4            # 이름이 loop.mp4면 webLoop 규칙
# iOS: Xcode → Devices and Simulators → 앱 컨테이너 내려받기 → Library/Caches/mong-share/
```

검사 규칙(서버 3-5-3 ③과 같은 코드 경로를 앱도 쓴다): 첫 상자 `ftyp`, `moov`가 `mdat` 앞이고 앞 64KB 안에서 끝남, 상자 크기 0·64비트·넘침 없음, `mvhd` 길이 7.5~8.5초, 트랙 = 영상 하나(공유판은 + 소리 하나), `tkhd` 크기 = 규격, `udta`·`meta` 없음·만든 시각 0, 루프 600KB 이하. 앱은 인코딩 직후 같은 검사를 스스로 하고, 떨어지면 시트를 열지 않고 이미지판으로 간다.

## 3. 합격 기준

| 항목 | 합격 | 불합격이면 |
|---|---|---|
| 공유판 시간(S25, 중앙값) | **15초 이하** | ① DECISIONS 'C7' 15초 추정의 대책 ①(art를 최종 표면에 바로 그려 복사 1회 줄임) ② 720×1280(PM 결정, `IRE_OUTPUTS.share` 한 곳) ③ 그래도 넘으면 D-20대로 9:16 이미지로 출시(플래그 `ireVideo` 끈 채) |
| 웹 루프 시간 | 10초 이하(사용자가 링크 켜기에서 기다림) | 루프 없이 올림(`has_loop = false`, 3-5-3) |
| 공유판 크기 | 8MB 이하(인스타·카카오 여유) | `IRE_BITRATE.share` 낮춤(OTA로 바뀜) |
| 루프 크기 | **600KB 이하**(서버 상한) — 400kbps 목표라 보통 약 400KB | `IRE_BITRATE.webLoop` 낮춤 |
| 서버 검사 | 두 파일 모두 `합격` | 불합격 이유를 C10 묶음에 기록 |
| 프레임 수 | 공유 240·루프 192, 디코드 오류 0 | Android면 Baseline·시각 다시 적기 경로 확인(아래 위험 2) |
| 렌더 시간 대비 크기(Android) | 느린 실행에서도 공유 8MB·루프 600KB 아래 | **EGL 전환 결정**(리뷰 M-5): 입력 Surface를 EGLSurface로 감싸 `eglPresentationTimeANDROID(n/fps)`로 시각을 직접 넣는다. 그러면 비트 예산이 영상 시간 기준이 되고, 출력 시각 다시 적기·Baseline 강제도 풀 수 있다. 이번 조각은 CBR(지원 시) + 부호화 중 크기 상한(`maxBytes`) + JS 자체 검사로 막아 두었다 |
| 인스타·카카오 | 재생·비율 정상 | 이미지판으로 출시 |
| 메모리 | 인코딩 중 최고 PSS가 평소 + 150MB 이하, 앱 종료 없음 | 대기열 2 → 1(`IRE_NATIVE_QUEUE`, 네이티브 `MAX_QUEUED`). 그다음은 `readPixels` 대상 버퍼 재사용(리뷰 L-5): 어댑터가 프레임 i를 넘긴 뒤에야 i+2를 요청하므로 버퍼 2개를 번갈아 쓰면 안전하다. 다만 RN Skia `readPixels`가 대상 버퍼 인자를 받는지는 기기 빌드에서 확인해야 해서 이번에는 바꾸지 않았다 |

## 4. 실기기에서만 확인되는 위험 (정적 점검으로 못 잡음)

0. **iOS 취소 경로(H-1)**: DispatchGroup을 없애고 writer 큐 하나 + 상태 기계로 바꿨다(enter/leave 짝 없음). 그래도 AVAssetWriter의 실제 상태 전이는 기기에서만 확인된다 — 9번을 iOS에서 반드시 돌린다.
1. **Android Canvas → 인코더 Surface**(`lockHardwareCanvas`): 기기에 따라 프레임이 버려질 수 있다. 버려지면 출력 수가 모자라 실패로 끝나고(`encoder wrote n/N frames`) 이미지판으로 간다 — 조용히 짧은 영상이 나가지는 않는다.
2. **Android 시각 다시 적기**: Canvas 프레임의 시각은 시스템 시계라 쓰지 않고, Baseline 프로필(B 프레임 없음)로 출력 n번째 = n/fps로 적는다. Baseline 설정이 거부되면 프로필 없이 다시 연다(레벨은 적지 않음, L-1). 재정렬이 생기면 실패로 끝난다(이미지판). 비트 예산이 벽시계를 따를 수 있다(M-5, 4-1번 측정).
3. **540×676·1080×1920 크기 지원**: `isSizeSupported`가 거절하는 인코더(폭 16 정렬 요구 등)는 begin에서 실패한다(이미지판).
4. **iOS 대기 폴링**: 영상 큐가 `isReadyForMoreMediaData`를 2ms 간격으로 기다린다. 소리 입력과의 끼워 넣기(interleave) 때문에 오래 막히는지 `encoder-wait`로 본다.
5. **하드웨어 VBR 넘침**: 루프 400kbps 목표가 기기에 따라 넘칠 수 있다(상한 600KB).
6. **JS 스레드 복사 시간**: `appendFrame`이 JS 스레드에서 8.3MB(공유판)를 한 번 복사한다(iOS vImage, Android `copyPixelsFromBuffer`). 프레임당 2~5ms 추정 — `render-wait`에 섞여 보인다.
7. **AAC 앞 무음(priming)**: 공유판 소리 트랙 길이가 8.02초쯤으로 영상보다 조금 길 수 있다(ffmpeg 실측 8.023초). 공유판 검사는 `mvhd` 길이만 본다. iOS는 priming을 elst에 적고(마무리가 edts를 보존) Android MediaMuxer는 적지 않는다 — 지금은 무음이라 무해하지만, 소리를 섞는 다음 조각에서 두 플랫폼 사이에 약 23~46ms A/V 차이가 생긴다(리뷰 L-6, 그 조각에서 Android 쪽 elst를 맞춘다).
8. **소리 내용**: 지금은 무음 AAC다. C7 `ireAudioCues`를 PCM으로 섞어 `setAudioPcm`으로 넘기는 일은 다음 조각(네이티브 재빌드 없이 JS만).

## 5. 결과 기록

이 파일 아래에 날짜·기기·빌드 번호·표 1의 값·로그 줄 원문·검사 출력·녹화 경로를 붙인다. 합격이면 DECISIONS 'C7' 절의 [잠정]을 확정으로 바꾸는 것은 PM 몫이다.
