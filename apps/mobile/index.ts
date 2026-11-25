import { registerRootComponent } from 'expo';
import { createElement, useEffect, useState, type ComponentType } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { PARAMS } from './src/render/clock';
import { skiaReady } from './src/skiaReady';
import { startOta } from './src/ota';
import { rethrowLater } from './src/lib/rethrowLater';

// 진입점은 **동기로** 등록해야 한다. 네이티브는 번들을 읽자마자 'main'을 찾기 때문에,
// 준비(Skia·모션 줄이기)를 기다린 뒤 등록하면 콜드 스타트에서 "App entry not found"가 난다(11-20 S25).
// 그래서 'main'은 즉시 등록하고, 준비가 끝날 때까지 한지색 빈 화면을 보여 준 뒤 App을 불러온다.
// - Skia(웹은 CanvasKit) 로드가 끝난 뒤에 App 모듈을 require한다(화면 모듈이 Skia를 바로 쓰므로).
// - 모션 줄이기(D-08): 화면 모듈이 PARAMS.rm을 읽기 전에 OS 설정을 반영한다(웹은 ?rm=1).
const reduceMotion =
  Platform.OS === 'web' ? Promise.resolve(false) : AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
const ready: Promise<ComponentType> = Promise.all([skiaReady(), reduceMotion]).then(([, rm]) => {
  if (rm) PARAMS.rm = true;
  return require('./App').default as ComponentType;
});
// App 로드(또는 Skia 준비)가 실패하면 빈 화면에 멈추지 않고 크래시로 끝낸다(V24 리뷰 M2) — 크래시 루프 판정·네이티브 오류 복구가 보게.
// 등록은 그대로 동기다(아래 registerRootComponent). 다시 던지기만 다음 틱으로 미룬다
void ready.catch((e: unknown) => {
  rethrowLater(e);
});

function Boot() {
  const [App, setApp] = useState<ComponentType | null>(null);
  useEffect(() => {
    let alive = true;
    void ready.then(
      (C) => {
        if (alive) setApp(() => C);
      },
      () => {
        /* 실패는 위 ready.catch가 크래시로 끝낸다 */
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  return App ? createElement(App) : createElement(View, { style: { flex: 1, backgroundColor: '#EFE8DA' } });
}

registerRootComponent(Boot);

// OTA 확인(V24): Skia·화면 준비를 기다리지 않고 곧바로 — 첫 화면 뒤 크래시 루프에서도 고친 판·내장판 지시를 받을 기회를 늘린다.
// 받기만 하고 적용은 다음 콜드 스타트(src/ota/checker.ts). 개발·웹·모듈 없음이면 아무것도 안 한다.
// 무슨 일이 있어도 진입점을 죽이지 않는다(V24 리뷰 L2 — startOta 안에도 try가 있고, 여기서 한 겹 더)
try {
  startOta();
} catch {
  /* OTA만 꺼진다 */
}

// Android 위젯 작업 핸들러(C10 자리 — 화면은 C3). 위젯이 헤드리스로 JS를 깨울 때 찾도록 번들 평가 때 등록한다.
// 실패해도 위젯만 빈 칸이 되고 앱은 그대로다
if (Platform.OS === 'android') {
  try {
    (require('./src/widget/androidTask') as typeof import('./src/widget/androidTask')).registerMongWidget();
  } catch {
    /* 위젯만 꺼진다 */
  }
}
