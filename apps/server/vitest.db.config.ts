import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// 실제 Postgres가 필요한 시험(로컬: docker compose의 db, CI: postgres 서비스 컨테이너). DATABASE_URL은 밖에서 준다
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: { include: ['test/**/*.db.test.ts'], environment: 'node', env: { LOG_LEVEL: 'silent' } },
});
