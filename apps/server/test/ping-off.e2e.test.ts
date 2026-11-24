// B4: 집계 수집 끄기 스위치(METRICS_INGEST=off). 동의 버그가 있는 앱 판이 퍼졌을 때 서버가 할 수 있는 일 —
// 서버는 동의를 구별하지 못하므로 받지 않는 것으로 멈춘다(응답은 같은 204, 앱 재전송 없음). 설정은 파일마다 한 번 읽혀 따로 둔다.
import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { FLUSH_EVERY_MS, MetricAggregator } from '../src/metrics/metric-aggregator';
import { PrismaService } from '../src/prisma/prisma.service';
import { startApp } from './support';

let app: NestFastifyApplication;
let writes = 0;
beforeAll(async () => {
  app = await startApp({ TRUSTED_PROXY_HOPS_API: '1', TRUSTED_PROXY_HOPS_WEB: '2', METRIC_APP_VERSIONS: '1.0', METRICS_INGEST: 'off' });
  (app.get(PrismaService) as unknown as { $executeRaw: () => Promise<number> }).$executeRaw = async () => {
    writes++;
    return 1;
  };
});
afterAll(async () => {
  await app?.close();
});

it('끄면 정상 핑도 204로 받고 칸을 만들지 않으며, 끈 상태로 버린 개수만 남는다', async () => {
  const agg = app.get(MetricAggregator);
  let clock = Date.parse('2026-12-25T03:00:00Z');
  agg.now = () => clock;
  const warned: unknown[] = [];
  (agg as unknown as { log: { warn: (o: unknown) => void } }).log = { warn: (o) => warned.push(o) };
  const ok = { cohortDay: '2026-12-22', dayN: 3, platform: 'android', appVer: '1.0', lang: 'ko', dims: { nt: 'A', wg: '-', moon: '0' }, events: [{ e: 'open', dayN: 3 }] };
  const r = await request(app.getHttpServer()).post('/api/v1/ping').set('x-forwarded-for', '10.1.1.1').send(ok).expect(204);
  expect(r.headers['cache-control']).toBe('no-store');
  expect(agg.size).toBe(0);
  clock += FLUSH_EVERY_MS;
  await request(app.getHttpServer()).post('/api/v1/ping').set('x-forwarded-for', '10.1.1.2').send(ok).expect(204);
  expect(warned).toEqual([{ msg: '집계 핑 거절', rejected: { off: 2 } }]);
  expect(writes).toBe(0);
});
