// vi.mock 팩토리에서 쓰는 대역. reanimated: 공유값 = 평범한 객체(+ RN Skia가 알아보는 표식), 파생값 = 렌더 때 한 번 계산.
import { useRef } from 'react';
import { createRequire } from 'node:module';
import { initSkia } from './headless';

const require = createRequire(import.meta.url);

export function reanimatedMock() {
  const sv = <T,>(value: T) => ({ value, _isReanimatedSharedValue: true as const });
  return {
    useSharedValue: <T,>(v: T) => useRef(sv(v)).current,
    useDerivedValue: <T,>(fn: () => T) => sv(fn()),
    useAnimatedReaction: () => undefined,
    runOnJS: <F,>(f: F) => f,
    makeMutable: sv,
    useFrameCallback: () => undefined,
  };
}

export async function skiaMock() {
  await initSkia();
  const h = require('@shopify/react-native-skia/lib/commonjs/headless');
  const { Skia } = h.getSkiaExports();
  return { ...h, Skia };
}

/** 렌더 모듈이 쓰는 react-native 조각만(노드에서 RN을 불러오지 않는다) */
export function reactNativeMock() {
  return { PixelRatio: { get: () => 2 }, Platform: { OS: 'web' } };
}
