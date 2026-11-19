import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

// 웹은 CanvasKit(WASM)을 먼저 내려받아야 Skia 모듈을 import할 수 있다.
export function skiaReady(): Promise<void> {
  return LoadSkiaWeb({ locateFile: (file: string) => `/${file}` });
}
