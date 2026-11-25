// B2 경로의 DB 없는 e2e: 인증이 '열리는' 길이 없는지(SUPABASE_URL 없음 = 모든 JWT 401), 인증 없는 경로의 형식 검사.
// 실제 흐름(DB·JWKS)은 cloud.db.test.ts.
import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApp } from './support';

let app: NestFastifyApplication;
beforeAll(async () => {
  app = await startApp({ TRUSTED_PROXY_HOPS_API: '1', TRUSTED_PROXY_HOPS_WEB: '2' });
});
afterAll(async () => {
  await app?.close();
});
const http = () => request(app.getHttpServer());
const fakeJwt = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln';

describe('B2 경로 — 인증 없이는 닫혀 있다', () => {
  it.each([
    ['post', '/api/v1/me/bootstrap'],
    ['post', '/api/v1/recovery-code'],
    ['post', '/api/v1/recover'],
    ['delete', '/api/v1/me'],
    ['get', '/api/v1/me/data'],
    ['get', '/api/v1/saves/main'],
    ['get', '/api/v1/saves/main/meta'],
    ['put', '/api/v1/saves/main'],
    ['post', '/api/v1/saves/main/conflicts'],
    ['get', '/api/v1/saves/main/versions'],
    ['get', '/api/v1/saves/main/versions/00000000-0000-0000-0000-000000000000'],
    ['post', '/api/v1/saves/main/versions/00000000-0000-0000-0000-000000000000/restore'],
  ] as const)('%s %s → 401(토큰 없음·SUPABASE_URL 없는 서버의 토큰)', async (m, path) => {
    const r = await http()[m](path).set('x-forwarded-for', '192.0.2.10').send({});
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('unauthorized');
    await http()[m](path).set('x-forwarded-for', '192.0.2.10').set('authorization', `Bearer ${fakeJwt}`).send({}).expect(401);
  });
  it('영수증 조회: 형식이 틀리면 DB를 보기 전에 404, no-store', async () => {
    const r = await http().get('/api/v1/deletion/not-a-receipt').set('x-forwarded-for', '192.0.2.11').expect(404);
    expect(r.headers['cache-control']).toBe('no-store');
  });
  it('웹 삭제: 코드·글귀 둘 다 없으면 400(모르는 키도 400)', async () => {
    await http().post('/api/v1/deletion/web').set('x-forwarded-for', '192.0.2.12').send({ code: 'ABCD2345' }).expect(400);
    await http().post('/api/v1/deletion/web').set('x-forwarded-for', '192.0.2.12').send({ code: 'ABCD2345', phrase: 'x', email: 'a@b.c' }).expect(400);
  });
});

describe('/internal/cron — 설정이 없으면 존재를 알리지 않는다', () => {
  it('POST /internal/cron/storage-gc → 404', async () => {
    await http().post('/internal/cron/storage-gc').set('x-forwarded-for', '192.0.2.13').set('authorization', `Bearer ${fakeJwt}`).expect(404);
  });
});
