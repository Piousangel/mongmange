import { defineConfig } from 'vitest/config';

// 빌드 시험은 매번 live.js 번들(esbuild)과 CanvasKit 복사(약 7MB)를 해서 기본 5초가 빠듯하다(병렬 부하 때)
export default defineConfig({ test: { testTimeout: 30_000 } });
