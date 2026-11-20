// 테스트용 헤드리스 Skia(CanvasKit CPU 래스터) + reanimated 최소 대역.
// 실제 렌더 컴포넌트(Mongmangi 등)를 노드에서 그려 픽셀로 검사한다(앱 의존성만 사용, 새 의존성 없음).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
type CK = { MakeSurface(w: number, h: number): unknown };
let ready: Promise<void> | null = null;

/** CanvasKit을 한 번만 띄워 전역에 둔다(RN Skia 웹 구현이 globalThis.CanvasKit을 쓴다) */
export function initSkia(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const init = require('canvaskit-wasm/bin/full/canvaskit.js') as () => Promise<CK>;
      (globalThis as { CanvasKit?: CK }).CanvasKit = await init();
    })();
  }
  return ready;
}
