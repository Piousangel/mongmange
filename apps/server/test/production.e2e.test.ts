// 운영 설정(NODE_ENV=production)으로 띄운 앱: 예시 엔드포인트가 없고, /readyz는 토큰 없이는 404.
import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApp } from './support';

let app: NestFastifyApplication;

beforeAll(async () => {
  app = await startApp({
    NODE_ENV: 'production',
    TRUSTED_PROXY_HOPS_API: '1',
    TRUSTED_PROXY_HOPS_WEB: '2',
    READY_TOKEN: 'prod-ready-token-000001',
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
