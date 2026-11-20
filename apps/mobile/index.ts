import { registerRootComponent } from 'expo';
import { createElement, useEffect, useState, type ComponentType } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { PARAMS } from './src/render/clock';
import { skiaReady } from './src/skiaReady';

// 진입점은 **동기로** 등록해야 한다. 네이티브는 번들을 읽자마자 'main'을 찾기 때문에,
// 준비(Skia·모션 줄이기)를 기다린 뒤 등록하면 콜드 스타트에서 "App entry not found"가 난다(11-20 S25).
// 그래서 'main'은 즉시 등록하고, 준비가 끝날 때까지 한지색 빈 화면을 보여 준 뒤 App을 불러온다.
// - Skia(웹은 CanvasKit) 로드가 끝난 뒤에 App 모듈을 require한다(화면 모듈이 Skia를 바로 쓰므로).
// - 모션 줄이기(D-08): 화면 모듈이 PARAMS.rm을 읽기 전에 OS 설정을 반영한다(웹은 ?rm=1).
const reduceMotion =
  Platform.OS === 'web' ? Promise.resolve(false) : AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
const ready: Promise<ComponentType> = Promise.all([skiaReady(), reduceMotion]).then(([, rm]) => {
  if (rm) PARAMS.rm = true;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./App').default as ComponentType;
});

function Boot() {
  const [App, setApp] = useState<ComponentType | null>(null);
  useEffect(() => {
    let alive = true;
    ready.then((C) => {
      if (alive) setApp(() => C);
    });
    return () => {
      alive = false;
    };
  }, []);
  return App ? createElement(App) : createElement(View, { style: { flex: 1, backgroundColor: '#EFE8DA' } });
}

registerRootComponent(Boot);
