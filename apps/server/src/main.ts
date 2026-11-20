import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { createApp } from './app.factory';
import type { Env } from './config/env';

async function main(): Promise<void> {
  const app = await createApp();
  const port = app.get<ConfigService<Env, true>>(ConfigService).get('PORT', { infer: true });
  // Cloud Run·컨테이너는 0.0.0.0에서 들어야 한다
  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((e: unknown) => {
  // 환경 변수 오류 등 시작 실패 — 로거가 없을 수 있어 stderr에 한 줄 JSON
  process.stderr.write(JSON.stringify({ severity: 'CRITICAL', message: String(e instanceof Error ? e.message : e) }) + '\n');
  process.exit(1);
});
