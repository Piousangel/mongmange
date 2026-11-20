// 집계 핑 e2e(B0). 실제 Nest+Fastify 앱에 HTTP로 치고, DB 쓰기는 가짜 $executeRaw로 받아 '무엇이 DB로 가는가'를 단언한다.
// 그럴듯한 오답 판별(OPERATING 8-1): 식별 가능한 값이 실린 핑을 '모르는 키는 무시하고' 받아 주면 실패한다 —
// 그런 핑은 칸 하나도 만들지 않아야 하고, DB로 가는 값 목록에 그 값이 나타나면 안 된다.
import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FLUSH_EVERY_MS, MetricAggregator } from '../src/metrics/metric-aggregator';
import { PING_LIMIT_PER_MIN } from '../src/metrics/metrics.controller';
import { PrismaService } from '../src/prisma/prisma.service';
import { startApp } from './support';

let app: NestFastifyApplication;
let agg: MetricAggregator;
let clock = Date.parse('2026-12-25T03:00:00Z');
/** 가짜 DB가 받은 UPSERT 값(배열 인자들) */
let writes: unknown[][] = [];
let dbFails = false;
/** 가짜 DB 지연(ms) — 느린 DB 흉내(I4) */
let dbDelayMs = 0;

beforeAll(async () => {
  app = await startApp({ TRUSTED_PROXY_HOPS_API: '1', TRUSTED_PROXY_HOPS_WEB: '2', RATE_LIMIT_PER_MIN: '1000', METRIC_APP_VERSIONS: '1.0,1.1' });
  const prisma = app.get(PrismaService) as unknown as { $executeRaw: (s: TemplateStringsArray, ...v: unknown[]) => Promise<number> };
  prisma.$executeRaw = async (_s, ...values) => {
    if (dbDelayMs) await new Promise((r) => setTimeout(r, dbDelayMs));
    if (dbFails) throw new Error('db down');
    writes.push(values);
    return 1;
  };
  agg = app.get(MetricAggregator);
  agg.now = () => clock;
});
afterAll(async () => {
  await app?.close();
});
beforeEach(async () => {
  // 이전 시험이 남긴 칸을 비운다
  clock += FLUSH_EVERY_MS + 1;
  await agg.flush();
  writes = [];
  dbFails = false;
  dbDelayMs = 0;
});

let ipSeq = 0;
const send = (body: unknown) => request(app.getHttpServer()).post('/api/v1/ping').set('x-forwarded-for', `10.9.${(ipSeq >> 8) & 255}.${ipSeq++ & 255}`).send(body as object);

// 보내는 날 = 12-22 + 3 = 12-25(서버 시계와 같음)
const ok = {
  cohortDay: '2026-12-22',
  dayN: 3,
  platform: 'android',
  appVer: '1.0',
  lang: 'ko',
  dims: { nt: 'A', wg: '-', moon: '0' },
  events: [
    { e: 'open', dayN: 3 },
    { e: 'name_set', dayN: 2 },
  ],
};

/** 쓰기 값을 칸 단위 행으로 펼친다(열 순서 = metric-aggregator.ts의 INSERT 열 순서) */
function rows(): string[][] {
  const out: string[][] = [];
  for (const w of writes) {
    const cols = w as string[][];
    for (let i = 0; i < cols[0]!.length; i++) out.push(cols.map((c) => c[i]!));
  }
  return out;
}

describe('POST /api/v1/ping', () => {
  it('정상 핑 → 204·no-store, 10초 전에는 메모리에만, 10초 뒤 요청이 응답 전에 UPSERT', async () => {
    const r = await send(ok).expect(204);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.text).toBe('');
    expect(writes).toHaveLength(0);
    expect(agg.size).toBe(2);

    await send(ok).expect(204);
    expect(writes).toHaveLength(0);
    clock += FLUSH_EVERY_MS;
    await send({ ...ok, events: [{ e: 'open', dayN: 3 }] }).expect(204);
    expect(writes).toHaveLength(1);
    expect(agg.size).toBe(0);
    // 칸 2개: open(day 12-25) ×3, name_set(day 12-24) ×2
    expect(rows().sort()).toEqual(
      [
        ['2026-12-25', 'open', '2026-12-22', '3', 'android', '1.0', 'ko', 'A', '-', '0', '3'],
        ['2026-12-24', 'name_set', '2026-12-22', '2', 'android', '1.0', 'ko', 'A', '-', '0', '2'],
      ].sort(),
    );
  });

  const BAD: Array<[string, unknown]> = [
    ['기기 id', { ...ok, deviceId: 'DEVICE-6f1c2a7e' }],
    ['세이브 씨앗', { ...ok, seed: 2864434397 }],
    ['정밀 시각', { ...ok, ts: 1766631600123 }],
    ['이벤트 안 시각', { ...ok, events: [{ e: 'open', dayN: 3, at: 1766631600123 }] }],
    ['IP', { ...ok, ip: '203.0.113.7' }],
    ['화이트리스트 밖 이벤트', { ...ok, events: [{ e: 'K7M3QX9P', dayN: 3 }] }],
    ['서버 날짜 ±2일 밖(미래 코호트)', { ...ok, cohortDay: '2027-01-10' }],
    ['dayN 범위 밖', { ...ok, dayN: 401 }],
    ['배열 본문', [ok]],
    ['알려진 출시 판 밖(형식은 맞음, I5)', { ...ok, appVer: '9.9' }],
    ['빌드 번호가 붙은 판(I2)', { ...ok, appVer: '1.0.0(14)' }],
  ];
  it('식별 가능한 값·범위 밖 핑은 조용히 204로 버리고 칸을 하나도 만들지 않는다', async () => {
    for (const [name, body] of BAD) {
      await send(body).expect(204);
      expect(agg.size, name).toBe(0);
    }
    clock += FLUSH_EVERY_MS;
    await agg.flush();
    expect(writes).toHaveLength(0);
  });

  it('DB로 가는 값에는 날짜(일 단위)·열거 차원·버전·개수뿐 — 시각·씨앗·IP 모양의 값이 없다', async () => {
    await send(ok).expect(204);
    clock += FLUSH_EVERY_MS;
    await agg.flush();
    const flat = rows().flat();
    expect(flat.length).toBeGreaterThan(0);
    for (const v of flat) {
      expect(v).toMatch(/^(\d{4}-\d{2}-\d{2}|[a-z_]+|\d{1,3}|\d{1,2}\.\d{1,2}|[AB01-])$/);
      expect(v).not.toMatch(/\d{9,}/); // ms 시각·32비트 씨앗
      expect(v).not.toMatch(/^\d+\.\d+\.\d+\.\d+$/); // IPv4
    }
  });

  it('DB가 실패하면 합계를 메모리에 되돌리고, 그사이 쌓인 같은 칸과 **합산**해 다음 flush에 쓴다(잃지 않음)', async () => {
    dbFails = true;
    dbDelayMs = 300; // 실패하는 쓰기가 도는 동안 같은 칸이 새로 들어온다
    agg.add([{ day: '2026-12-25', event: 'open', cohortDay: '2026-12-22', dayN: 3, platform: 'android', appVer: '1.0', lang: 'ko', nt: 'A', wg: '-', moon: '0' }]);
    const failing = agg.flush();
    await new Promise((r) => setTimeout(r, 50));
    await send({ ...ok, events: [{ e: 'open', dayN: 3 }] }).expect(204);
    await failing;
    expect(agg.size).toBe(1);
    dbFails = false;
    dbDelayMs = 0;
    await agg.flush();
    expect(rows()).toHaveLength(1);
    expect(rows()[0]![10]).toBe('2'); // 되돌린 1 + 새로 온 1
  });

  it('느린 DB(6초): 핑 응답은 2초 안에 204, 쓰기는 뒤에서 끝나 한 번만 세어진다(I4 — 앱이 시간 초과로 다시 보내지 않게)', async () => {
    dbDelayMs = 6000;
    await send(ok).expect(204);
    clock += FLUSH_EVERY_MS;
    const t0 = Date.now();
    await send({ ...ok, events: [{ e: 'open', dayN: 3 }] }).expect(204);
    expect(Date.now() - t0).toBeLessThan(2000);
    await agg.flush(); // 뒤에서 도는 쓰기를 기다림
    // 칸마다 합이 정확히 보낸 수(중복 0): open 2, name_set 1
    const sum = (e: string) => rows().filter((r) => r[1] === e).reduce((a, r) => a + Number(r[10]), 0);
    expect(sum('open')).toBe(2);
    expect(sum('name_set')).toBe(1);
    expect(agg.size).toBe(0);
  }, 15_000);

  it(`IP 접두당 분당 ${PING_LIMIT_PER_MIN}회 → 429`, async () => {
    const same = () => request(app.getHttpServer()).post('/api/v1/ping').set('x-forwarded-for', '10.200.0.1').send(ok);
    for (let i = 0; i < PING_LIMIT_PER_MIN; i++) await same().expect(204);
    await same().expect(429);
  });

  it('인스턴스당 하루 새 칸 상한을 넘는 새 칸은 버리고, 버린 개수만 경고 로그에 남는다(I5)', async () => {
    // 설정은 파일마다 한 번 읽히므로(ConfigModule 캐시) 상한 2로 집계기를 직접 만든다
    const a3 = new MetricAggregator({ $executeRaw: async () => 1 } as never, { get: () => 2 } as never);
    a3.now = () => clock;
    const warned: unknown[] = [];
    (a3 as unknown as { log: { warn: (o: unknown) => void } }).log = { warn: (o) => warned.push(o) };
    const cell = (dayN: number) => ({ day: '2026-12-25', event: 'open' as const, cohortDay: '2026-12-22', dayN, platform: 'android' as const, appVer: '1.0', lang: 'ko' as const, nt: 'A' as const, wg: '-' as const, moon: '0' as const });
    expect(a3.add([cell(3), cell(2), cell(3)])).toBe(true); // 새 칸 2개(같은 칸은 상한을 쓰지 않음)
    expect(a3.add([cell(1), cell(0)])).toBe(false);
    expect(a3.size).toBe(2);
    await a3.flush();
    expect(warned).toEqual([{ msg: '집계 칸 상한 초과로 버림', dropped: 2 }]);
    // 다음 날(UTC)에는 상한이 새로 시작한다
    clock += 86_400_000;
    expect(a3.add([cell(1)])).toBe(true);
  });

  it('종료(SIGTERM 경로) 때 남은 칸을 flush한다', async () => {
    const app2 = await startApp({ TRUSTED_PROXY_HOPS_API: '1', TRUSTED_PROXY_HOPS_WEB: '2' });
    const got: unknown[][] = [];
    (app2.get(PrismaService) as unknown as { $executeRaw: (...a: unknown[]) => Promise<number> }).$executeRaw = async (_s, ...v) => {
      got.push(v as unknown[]);
      return 1;
    };
    const a2 = app2.get(MetricAggregator);
    a2.now = () => clock;
    await request(app2.getHttpServer()).post('/api/v1/ping').set('x-forwarded-for', '10.77.0.1').send(ok).expect(204);
    expect(got).toHaveLength(0);
    await app2.close();
    expect(got).toHaveLength(1);
  });

  it('종료: 진행 중 flush가 끝나기를 기다린 뒤 그사이 쌓인 칸도 쓴다(리뷰 m2)', async () => {
    const app4 = await startApp({ TRUSTED_PROXY_HOPS_API: '1', TRUSTED_PROXY_HOPS_WEB: '2' });
    const got: unknown[][] = [];
    (app4.get(PrismaService) as unknown as { $executeRaw: (...a: unknown[]) => Promise<number> }).$executeRaw = async (_s, ...v) => {
      await new Promise((r) => setTimeout(r, 200));
      got.push(v as unknown[]);
      return 1;
    };
    const a4 = app4.get(MetricAggregator);
    a4.now = () => clock;
    const cell = { day: '2026-12-25', event: 'open' as const, cohortDay: '2026-12-22', dayN: 3, platform: 'android' as const, appVer: '1.0', lang: 'ko' as const, nt: 'A' as const, wg: '-' as const, moon: '0' as const };
    a4.add([cell]);
    void a4.flush(); // 진행 중
    a4.add([{ ...cell, dayN: 2, day: '2026-12-24' }]); // 그사이 쌓임
    await app4.close();
    expect(got).toHaveLength(2);
  });
});
