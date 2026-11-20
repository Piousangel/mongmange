// e2e(supertest): 실제 Nest 앱(Fastify)을 띄우고 HTTP로 친다. DB는 가짜 PrismaService로 바꾼다
// (실제 Postgres 시험은 db.db.test.ts, 운영 설정은 production.e2e.test.ts, 컨테이너 시험은 docker compose).
import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sim } from '@mong/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { startApp } from './support';

let app: NestFastifyApplication;
let dbUp = true;
let pings = 0;
const TOKEN = 'ready-token-for-e2e-0001';

beforeAll(async () => {
  app = await startApp({
    TRUSTED_PROXY_HOPS_API: '1',
    TRUSTED_PROXY_HOPS_WEB: '2',
    RATE_LIMIT_PER_MIN: '5',
    READY_TIMEOUT_MS: '300',
    DB_CONNECT_TIMEOUT_MS: '200',
    READY_CACHE_MS: '400',
    READY_TOKEN: TOKEN,
    APP_VERSION: 'e2e',
  });
  // 가짜 DB: dbUp에 따라 성공·실패. 실패는 '응답 없음'(타임아웃)으로 흉내
  app.get(PrismaService).ping = async () => {
    pings++;
    if (!dbUp) await new Promise((r) => setTimeout(r, 1000));
  };
});

afterAll(async () => {
  await app?.close();
});

const http = () => request(app.getHttpServer());
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('헬스체크', () => {
  it('/healthz 200 + 버전·세이브 스키마 + 보안 헤더', async () => {
    const r = await http().get('/healthz').expect(200);
    expect(r.body).toEqual({ ok: true, ver: 'e2e', saveSchema: 2, simSchema: sim.SIM_SCHEMA_VERSION });
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
  });
  it('/healthz는 레이트 리밋을 받지 않는다', async () => {
    for (let i = 0; i < 8; i++) await http().get('/healthz').set('x-forwarded-for', '7.7.7.7').expect(200);
  });
  it('/readyz는 내부 토큰이 없거나 틀리면 404(존재를 알리지 않음)', async () => {
    const r = await http().get('/readyz').set('x-forwarded-for', '7.0.0.1').expect(404);
    expect(r.body.error).toEqual({ code: 'not_found', message: '찾을 수 없습니다' });
    await http().get('/readyz').set('x-forwarded-for', '7.0.0.1').set('x-ready-token', 'wrong-token-wrong-token').expect(404);
  });
  it('/readyz 캐시: 창 안의 연속 요청은 DB를 한 번만 친다', async () => {
    dbUp = true;
    await wait(450);
    pings = 0;
    const ok = () => http().get('/readyz').set('x-forwarded-for', '7.0.0.2').set('x-ready-token', TOKEN);
    await Promise.all([ok().expect(200, { ok: true, db: 'up' }), ok().expect(200)]);
    await ok().expect(200);
    expect(pings).toBe(1);
  });
  it('/readyz DB가 안 닿으면 제한 시간 뒤 503', async () => {
    dbUp = false;
    await wait(450);
    const r = await http().get('/readyz').set('x-forwarded-for', '7.0.0.3').set('x-ready-token', TOKEN).expect(503);
    expect(r.body.error.code).toBe('db_unavailable');
    dbUp = true;
  });
});

describe('세이브 검사 예시 엔드포인트(개발 전용, @mong/core 재사용)', () => {
  const T0 = Date.UTC(2026, 10, 20, 10);
  it('검증됨', async () => {
    const save = sim.serializeState(sim.createInitial(T0, -540, 3), T0);
    const r = await http().post('/api/v1/saves/validate').set('x-forwarded-for', '1.0.0.1').send({ save }).expect(200);
    expect(r.body).toMatchObject({ validated: true, future: false, dayIndex: 0, strokesTotal: 0, server: { saveSchema: 2 } });
  });
  it('손상 → 422 save_invalid, 형식 틀림 → 400', async () => {
    const r = await http().post('/api/v1/saves/validate').set('x-forwarded-for', '1.0.0.2').send({ save: '{"x":1,"sim":{}}' }).expect(422);
    expect(r.body.error).toMatchObject({ code: 'save_invalid', details: { reason: 'corrupt' } });
    expect(r.body.requestId).toEqual(expect.any(String));
    const b = await http().post('/api/v1/saves/validate').set('x-forwarded-for', '1.0.0.2').send({ nope: 1 }).expect(400);
    expect(b.body.error.code).toBe('bad_request');
  });
  it('깨진 JSON 본문 → 400 같은 모양', async () => {
    const r = await http().post('/api/v1/saves/validate').set('x-forwarded-for', '1.0.0.3').set('content-type', 'application/json').send('{bad').expect(400);
    expect(r.body.error.code).toBe('bad_request');
  });
});

describe('공통', () => {
  it('없는 경로 → 404 고정 문구(경로·쿼리를 되돌려 주지 않음)', async () => {
    const r = await http().get('/nope/ABCD1234?sig=QSECRET2').expect(404);
    expect(r.body.error).toEqual({ code: 'not_found', message: '찾을 수 없습니다' });
    expect(JSON.stringify(r.body)).not.toMatch(/QSECRET2|ABCD1234/);
  });
  it('x-request-id를 이어받는다', async () => {
    const r = await http().get('/nope').set('x-request-id', 'trace-abc-123').expect(404);
    expect(r.body.requestId).toBe('trace-abc-123');
  });
  it('500대는 내용을 숨긴다', async () => {
    const r = await http().get('/boom').set('x-forwarded-for', '1.0.0.9').expect(500);
    expect(r.body.error).toEqual({ code: 'internal', message: '서버 오류' });
  });
});

describe('레이트 리밋 — IP 접두당 전역 카운터, 경로 그룹별 XFF 위치', () => {
  it('같은 IPv6 /64는 한 키이고, 서로 다른 경로도 같은 카운터를 쓴다(한도 5)', async () => {
    const api = (xff: string) => http().post('/api/v1/saves/validate').set('x-forwarded-for', xff).send({});
    const ready = (xff: string) => http().get('/readyz').set('x-forwarded-for', xff).set('x-ready-token', TOKEN);
    await wait(450); // 앞 시험의 실패 캐시가 지나가게
    for (let i = 1; i <= 3; i++) await api(`9.9.9.9, 2001:db8:1:2::${i}`).expect(400);
    for (let i = 4; i <= 5; i++) await ready(`9.9.9.9, 2001:db8:1:2::${i}`).expect(200);
    // /readyz(전역 한도 5)는 앞의 API 3회까지 합쳐 6번째라 429 — 핸들러가 달라도 같은 카운터
    const r = await ready('9.9.9.9, 2001:db8:1:2::ff').expect(429);
    expect(r.body.error.code).toBe('rate_limited');
    // 다른 /64는 따로 센다
    await ready('9.9.9.9, 2001:db8:1:3::1').expect(200);
    // 왼쪽(클라이언트가 위조할 수 있는) 값을 바꿔도 같은 키 → 여전히 429
    await ready('1.1.1.1, 2001:db8:1:2::1').expect(429);
  });
  it('/m/**(web)은 오른쪽에서 2번째, API는 1번째를 클라이언트로 본다', async () => {
    // web: [위조, 클라이언트, Firebase 엣지] → 클라이언트 5.5.5.5. 엣지 주소가 바뀌어도 같은 키
    // 형식이 틀린 코드는 DB를 보지 않고 '사라진 링크'(200) — DB 없는 시험에서도 실제 /m 경로로 센다
    for (let i = 1; i <= 5; i++) await http().get('/m/k7m3qx9p').set('x-forwarded-for', `6.6.6.${i}, 5.5.5.5, 35.0.0.${i}`).expect(200);
    await http().get('/m/k7m3qx9p').set('x-forwarded-for', '6.6.6.9, 5.5.5.5, 35.0.0.9').expect(429);
    // 같은 헤더라도 API 그룹은 오른쪽 끝(35.0.0.x)을 클라이언트로 본다 → 5.5.5.5 한도와 무관
    await http().post('/api/v1/saves/validate').set('x-forwarded-for', '6.6.6.9, 5.5.5.5, 35.0.0.77').send({}).expect(400);
  });
});
