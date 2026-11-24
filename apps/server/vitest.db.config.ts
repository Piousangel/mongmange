import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// 실제 Postgres가 필요한 시험(로컬: docker compose의 db, CI: postgres 서비스 컨테이너). DATABASE_URL은 밖에서 준다
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  // 파일을 차례로 돌린다(B5): b3·b5가 함께 쓰는 한 행 표(cdn_purge — CDN 무효화 1분 묶음)를 서로 비우고 세면 횟수 단언이 엇갈린다
  test: { include: ['test/**/*.db.test.ts'], environment: 'node', testTimeout: 30_000, fileParallelism: false, env: { LOG_LEVEL: 'silent' } },
});
