// 운영 설정(NODE_ENV=production)으로 띄운 앱: 예시 엔드포인트가 없고, /readyz는 토큰 없이는 404.
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { startApp } from './support';

let app: NestFastifyApplication;

beforeAll(async () => {
  app = await startApp({
    NODE_ENV: 'production',
    TRUSTED_PROXY_HOPS_API: '1',
    TRUSTED_PROXY_HOPS_WEB: '2',
    READY_TOKEN: 'prod-ready-token-000001',
    SUPABASE_URL: 'https://unit.supabase.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-for-tests-0001',
    RECOVERY_PEPPER: 'recovery-pepper-for-tests-0000000001',
    CRON_AUDIENCE: 'https://mong-api-test-du.a.run.app',
    CRON_SA_EMAIL: 'scheduler@mong-test.iam.gserviceaccount.com',
    // B6a: 운영은 DB CA 필수(시험 전용 공개 인증서 — 이 시험은 DB에 붙지 않는다)
    DATABASE_CA_CERT: readFileSync(new URL('./fixtures/tls/test-ca.pem', import.meta.url), 'utf8'),
  });
});
afterAll(async () => {
  await app?.close();
});

describe('운영 설정', () => {
  it('세이브 검사 예시 엔드포인트가 없다(404)', async () => {
    await request(app.getHttpServer()).post('/api/v1/saves/validate').send({ save: '{}' }).expect(404);
  });
  it('/readyz는 토큰 없이 404, /healthz는 200', async () => {
    await request(app.getHttpServer()).get('/readyz').expect(404);
    await request(app.getHttpServer()).get('/healthz').expect(200);
  });
});
