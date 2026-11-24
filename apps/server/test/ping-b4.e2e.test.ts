// B4 집계 핑 — 거절은 '숫자만' 센다, 동의 여부를 서버가 구별하지 못한다는 전제의 고정.
// 그럴듯한 오답 판별: ① 거절한 핑의 값(이벤트 이름·appVer·날짜)이 로그에 실리면 실패 ② 'consent: true' 같은 동의 칸을 받아 주면 실패
// (서버는 동의를 확인할 수 없다 — 그런 칸은 위조 가능한 장식이고, 모르는 키는 핑을 통째로 버린다).
import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FLUSH_EVERY_MS, MetricAggregator } from '../src/metrics/metric-aggregator';
import { PrismaService } from '../src/prisma/prisma.service';
import { startApp } from './support';

let app: NestFastifyApplication;
let agg: MetricAggregator;
let clock = Date.parse('2026-12-25T03:00:00Z');
let writes = 0;
const warned: unknown[] = [];

beforeAll(async () => {
  app = await startApp({ TRUSTED_PROXY_HOPS_API: '1', TRUSTED_PROXY_HOPS_WEB: '2', RATE_LIMIT_PER_MIN: '1000', METRIC_APP_VERSIONS: '1.0' });
  (app.get(PrismaService) as unknown as { $executeRaw: () => Promise<number> }).$executeRaw = async () => {
    writes++;
    return 1;
  };
  agg = app.get(MetricAggregator);
  agg.now = () => clock;
  (agg as unknown as { log: { warn: (o: unknown) => void } }).log = { warn: (o) => warned.push(o) };
});
afterAll(async () => {
  await app?.close();
});
beforeEach(async () => {
  clock += FLUSH_EVERY_MS + 1;
  await agg.flush();
  writes = 0;
  warned.length = 0;
});

let ip = 0;
const send = (body: unknown) => request(app.getHttpServer()).post('/api/v1/ping').set('x-forwarded-for', `10.8.0.${ip++ & 255}`).send(body as object);
const ok = {
  cohortDay: '2026-12-22',
  dayN: 3,
  platform: 'android',
  appVer: '1.0',
  lang: 'ko',
  dims: { nt: 'A', wg: '-', moon: '0' },
  events: [{ e: 'open', dayN: 3 }],
};

describe('B4 핑 거절 개수', () => {
  it('거절 까닭별 개수만 다음 flush 때 경고 로그로 — 값은 싣지 않는다', async () => {
    await send({ ...ok, events: [{ e: 'K7M3QX9P', dayN: 3 }] }).expect(204); // schema
    await send({ ...ok, deviceId: 'DEVICE-6f1c2a7e' }).expect(204); // schema
    await send({ ...ok, appVer: '9.9' }).expect(204); // version
    await send({ ...ok, cohortDay: '2027-03-01' }).expect(204); // date
    await send(ok).expect(204); // 받음
    expect(warned).toHaveLength(0);
    clock += FLUSH_EVERY_MS;
    await send(ok).expect(204); // 이 요청이 flush를 연다
    expect(warned).toEqual([{ msg: '집계 핑 거절', rejected: { schema: 2, version: 1, date: 1 } }]);
    const text = JSON.stringify(warned);
    for (const v of ['K7M3QX9P', 'DEVICE', '9.9', '2027-03-01']) expect(text).not.toContain(v);
    expect(writes).toBe(1);
  });

  it('받은 칸이 하나도 없어도(전부 거절) 개수는 남는다', async () => {
    await send({ ...ok, appVer: '9.9' }).expect(204);
    clock += FLUSH_EVERY_MS;
    await send({ ...ok, appVer: '9.8' }).expect(204);
    expect(warned).toEqual([{ msg: '집계 핑 거절', rejected: { version: 2 } }]);
    expect(writes).toBe(0);
  });

  it('동의 칸을 실어도 받지 않는다(서버는 동의를 구별하지 못한다 — 칸이 있으면 모르는 키로 통째 버림)', async () => {
    await send({ ...ok, consent: true }).expect(204);
    await send({ ...ok, dims: { ...ok.dims, consent: '1' } }).expect(204);
    expect(agg.size).toBe(0);
  });
});
