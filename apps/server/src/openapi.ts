// OpenAPI 문서 생성: `pnpm --filter server openapi` → apps/server/openapi.json (DB 접속 없이 — 연결은 lazy)
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';

// ConfigModule.forRoot는 모듈을 import할 때 환경 변수를 읽으므로 값을 먼저 채우고 동적으로 불러온다
process.env.DATABASE_URL ??= 'postgresql://openapi@localhost:5432/openapi';
process.env.LOG_LEVEL ??= 'warn';
const { buildOpenApi, createApp } = await import('./app.factory');
const app = await createApp({ bufferLogs: false });
await app.init();
writeFileSync('openapi.json', JSON.stringify(buildOpenApi(app), null, 2) + '\n');
await app.close();
process.stdout.write('openapi.json 작성\n');
