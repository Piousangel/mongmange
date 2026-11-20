import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Vitest의 기본 변환(esbuild/oxc)은 emitDecoratorMetadata를 내지 않는다 → Nest DI를 위해 SWC로 변환
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/**/*.db.test.ts'],
    environment: 'node',
    // e2e도 DB 없이 돈다(PrismaService를 가짜로 바꿈). 실제 DB 시험은 vitest.db.config.ts
    env: { DATABASE_URL: 'postgresql://test@127.0.0.1:1/test', LOG_LEVEL: 'silent' },
  },
});
