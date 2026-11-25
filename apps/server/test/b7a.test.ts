// B7a(부하 시험 후속, docs/design/server-v1/B7-report.md 4절 B1~B5) — DB 없이 확인하는 것.
// 그럴듯한 오답 판별(OPERATING 8-1):
//  - 서로 다른 IP 20만 개를 넣었을 때 전역 리밋 저장소 키 수·힙이 상한을 넘으면 실패(B2 — 기본 저장소는 키 하나 약 1.2KB, 상한 없음)
//  - 창이 끝난 IP 접두가 '창 + 10초' 넘게 메모리에 남으면 실패(처리방침 3-1 '약 1분')
//  - 전역 throttler의 429에 Cache-Control: no-store가 없으면 실패(B5)
//  - 비콘·스토어 이동 요청이 DB를 한 번이라도 치면 실패(B1 — 메모리에 모아 주기적으로)
//  - query_timeout이 statement_timeout보다 짧거나 같아도 부팅되면 실패(B3)
import 'reflect-metadata';
import { runInNewContext } from 'node:vm';
import { setFlagsFromString } from 'node:v8';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BoundedThrottlerStorage, THROTTLER_SWEEP_EVERY_MS } from '../src/common/throttler-storage';
import { envSchema } from '../src/config/env';
import { LINK_FLUSH_EVERY_MS, LINK_MAX_CELLS, LinkCounter } from '../src/pages/link-counter';
import { PrismaService } from '../src/prisma/prisma.service';
import { startApp } from './support';

setFlagsFromString('--expose_gc');
const gc = runInNewContext('gc') as () => void;

/** 서로 다른 IPv4 n번째(키 꼴은 throttler.guard.ts generateKey = `default:` + IP 접두) */
const ipKey = (n: number) => `default:${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;

describe('전역 리밋 저장소 — 상한 있는 LRU(B2)', () => {
  it('서로 다른 IP 20만 개: 키 수는 상한(10만)을 넘지 않고, 힙 증가는 메모리 예산(10만 × 약 200바이트 ≈ 20MB, 여유 두어 40MB) 안', async () => {
    let t = 1_000_000;
    const s = new BoundedThrottlerStorage(100_000, () => t);
    try {
      gc();
      const before = process.memoryUsage().heapUsed;
      for (let i = 0; i < 200_000; i++) {
        await s.increment(ipKey(i), 60_000, 120, 60_000);
        if (i % 1000 === 0) t += 1; // 1분 안에 다 온다(만료 정리로 줄지 않게)
      }
      gc();
      const grown = process.memoryUsage().heapUsed - before;
      expect(s.size).toBeLessThanOrEqual(100_000);
      expect(s.size).toBeGreaterThanOrEqual(90_000);
      expect(s.size + s.evicted).toBe(200_000);
      expect(grown).toBeLessThan(40 * 1024 * 1024);
      // 기록용: 키 하나당 바이트(B7-report 기본 저장소 약 1.2KB와 비교)
      console.info(`[B7a] throttler 키 하나 ≈ ${Math.round(grown / s.size)}B, 10만 키 ≈ ${(grown / 1048576).toFixed(1)}MB`);
    } finally {
      s.onApplicationShutdown();
    }
  }, 60_000);

  it('상한에 닿은 뒤에도 빠르다: 넘친 상태에서 서로 다른 키 20만 번 < 2초(하나씩 버리면 수십 초)', async () => {
    const s = new BoundedThrottlerStorage(100_000, () => 1);
    try {
      for (let i = 0; i < 100_000; i++) await s.increment(ipKey(i), 60_000, 120, 60_000);
      const t0 = performance.now();
      for (let i = 100_000; i < 300_000; i++) await s.increment(ipKey(i), 60_000, 120, 60_000);
      expect(performance.now() - t0).toBeLessThan(2000);
    } finally {
      s.onApplicationShutdown();
    }
  }, 60_000);

  it('가장 오래 안 쓴 키부터 버린다 — 방금 쓴 키의 횟수는 남는다', async () => {
    const s = new BoundedThrottlerStorage(1000, () => 5);
    try {
      await s.increment('default:hot', 60_000, 120, 60_000);
      for (let i = 0; i < 999; i++) await s.increment(ipKey(i), 60_000, 120, 60_000);
      await s.increment('default:hot', 60_000, 120, 60_000); // 맨 뒤로
      for (let i = 1000; i < 1500; i++) await s.increment(ipKey(i), 60_000, 120, 60_000);
      expect(s.size).toBeLessThanOrEqual(1000);
      expect((await s.increment('default:hot', 60_000, 120, 60_000)).totalHits).toBe(3);
      expect((await s.increment(ipKey(0), 60_000, 120, 60_000)).totalHits).toBe(1); // 버려졌다가 새로 시작
    } finally {
      s.onApplicationShutdown();
    }
  });

  it('한도 뜻은 기본 저장소와 같다: limit을 넘는 순간 blockDuration 동안 막힘, 끝나면 0부터', async () => {
    let t = 0;
    const s = new BoundedThrottlerStorage(1000, () => t);
    try {
      for (let i = 1; i <= 3; i++) expect((await s.increment('default:a', 60_000, 3, 60_000)).isBlocked).toBe(false);
      const r = await s.increment('default:a', 60_000, 3, 60_000);
      expect(r).toMatchObject({ isBlocked: true, totalHits: 4, timeToBlockExpire: 60 });
      t = 30_000;
      expect((await s.increment('default:a', 60_000, 3, 60_000)).isBlocked).toBe(true);
      t = 60_001;
      expect(await s.increment('default:a', 60_000, 3, 60_000)).toMatchObject({ isBlocked: false, totalHits: 1 });
      // 경로의 더 낮은 천장(@Throttle)은 같은 키의 같은 횟수로 판정된다
      expect((await s.increment('default:a', 60_000, 1, 60_000)).isBlocked).toBe(true);
    } finally {
      s.onApplicationShutdown();
    }
  });

  it('창이 끝난 IP 접두는 창 + 최대 10초 안에 메모리에서 지운다(요청 때 쓸기 포함)', async () => {
    let t = 0;
    const s = new BoundedThrottlerStorage(1000, () => t);
    try {
      for (let i = 0; i < 50; i++) await s.increment(ipKey(i), 60_000, 120, 60_000);
      t = 60_000 + THROTTLER_SWEEP_EVERY_MS;
      await s.increment('default:other', 60_000, 120, 60_000);
      expect(s.size).toBe(1);
    } finally {
      s.onApplicationShutdown();
    }
  });
});

describe('env — 클라이언트 쪽 쿼리 제한 시간(B3)', () => {
  const base = { DATABASE_URL: 'postgresql://x@127.0.0.1:1/x' };
  it('기본 6초(> statement_timeout 5초)', () => {
    const e = envSchema.parse(base);
    expect(e.DB_QUERY_TIMEOUT_MS).toBe(6000);
    expect(e.DB_QUERY_TIMEOUT_MS).toBeGreaterThan(e.DB_STATEMENT_TIMEOUT_MS);
  });
  it('statement_timeout 이하이면 부팅 거부', () => {
    expect(envSchema.safeParse({ ...base, DB_QUERY_TIMEOUT_MS: '5000' }).success).toBe(false);
    expect(envSchema.safeParse({ ...base, DB_QUERY_TIMEOUT_MS: '4000', DB_STATEMENT_TIMEOUT_MS: '3000' }).success).toBe(true);
  });
});

describe('앱 조립', () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    app = await startApp({ TRUSTED_PROXY_HOPS_API: '1', TRUSTED_PROXY_HOPS_WEB: '2', RATE_LIMIT_PER_MIN: '5', RATE_LIMIT_MAX_KEYS: '1000' });
  });
  afterAll(async () => {
    await app?.close();
  });
  const http = () => request(app.getHttpServer());

  it('전역 throttler 저장소는 상한 있는 저장소(RATE_LIMIT_MAX_KEYS)', () => {
    const s = app.get(ThrottlerStorage);
    expect(s).toBeInstanceOf(BoundedThrottlerStorage);
    expect((s as BoundedThrottlerStorage).maxKeys).toBe(1000);
  });

  it('서로 다른 IP 3,000개가 실제 경로를 쳐도 저장소 키는 1,000을 넘지 않는다', async () => {
    const f = app.getHttpAdapter().getInstance();
    for (let i = 0; i < 3000; i++) {
      const r = await f.inject({ method: 'GET', url: '/m/k7m3qx9p/report', headers: { 'x-forwarded-for': `1.1.1.1, 10.${(i >> 8) & 255}.${i & 255}.7, 35.0.0.1` } });
      expect(r.statusCode).toBe(200);
    }
    expect((app.get(ThrottlerStorage) as BoundedThrottlerStorage).size).toBeLessThanOrEqual(1000);
  });

  it('전역 throttler 429: Cache-Control no-store + Retry-After(B5)', async () => {
    const xff = '1.1.1.1, 10.250.0.1, 35.0.0.1';
    for (let i = 0; i < 5; i++) await http().get('/m/k7m3qx9p/report').set('x-forwarded-for', xff).expect(200);
    const r = await http().get('/m/k7m3qx9p/report').set('x-forwarded-for', xff).expect(429);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['retry-after']).toBeDefined();
    expect(r.body.error.code).toBe('rate_limited');
  });

  it('스토어 이동 /get은 전역 한도(5)를 다 쓴 IP도 302 — 사용자에게 429를 보이지 않는다(B4)', async () => {
    const xff = '1.1.1.1, 10.250.0.2, 35.0.0.1';
    for (let i = 0; i < 6; i++) await http().get('/m/k7m3qx9p/report').set('x-forwarded-for', xff);
    for (let i = 0; i < 40; i++) {
      const r = await http().get('/m/K7M3QX9P/get?p=android').set('x-forwarded-for', xff).expect(302);
      expect(r.headers['cache-control']).toBe('no-store');
    }
  });

  it('비콘·스토어 이동은 DB를 치지 않고 메모리에 모은다(B1)', async () => {
    const prisma = app.get(PrismaService);
    const q = vi.spyOn(prisma, '$queryRaw');
    const x = vi.spyOn(prisma, '$executeRaw');
    const counter = app.get(LinkCounter);
    const before = counter.state.cells;
    try {
      for (let i = 0; i < 20; i++) {
        await http().post('/m/K7M3QX9Q/seen').set('x-forwarded-for', `1.1.1.1, 10.251.0.${i}, 35.0.0.1`).expect(204);
        await http().get('/m/K7M3QX9Q/get?p=ios').set('x-forwarded-for', `1.1.1.1, 10.251.1.${i}, 35.0.0.1`).expect(302);
      }
      expect(q).not.toHaveBeenCalled();
      expect(x).not.toHaveBeenCalled();
      expect(counter.state.cells).toBe(before + 2); // (오늘, 코드, view)·(오늘, 코드, store_ios)
    } finally {
      q.mockRestore();
      x.mockRestore();
    }
  });
});

describe('LinkCounter — 메모리 상한·주기(DB는 가짜)', () => {
  const fake = () => {
    const calls: unknown[][] = [];
    const prisma = { $executeRaw: vi.fn(async (...a: unknown[]) => void calls.push(a)) } as unknown as PrismaService;
    return { prisma, calls };
  };
  it(`칸 상한 ${LINK_MAX_CELLS}: 꽉 차면 flush를 시작하고, flush가 막혀 있는 동안 새 칸은 버린다(있는 칸은 계속 센다)`, async () => {
    let release!: () => void;
    const prisma = { $executeRaw: vi.fn(() => new Promise<void>((r) => (release = r))) } as unknown as PrismaService;
    const c = new LinkCounter(prisma, { now: () => 0 });
    try {
      const code = (i: number) => `K${String(i).padStart(7, '0')}`;
      for (let i = 0; i < LINK_MAX_CELLS; i++) c.add(code(i), 'view');
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1); // 꽉 찬 순간 한 묶음으로 떼어 보냄
      expect(c.state).toMatchObject({ cells: 0, pendingCells: LINK_MAX_CELLS });
      for (let i = 0; i < LINK_MAX_CELLS; i++) c.add(code(LINK_MAX_CELLS + i), 'view');
      expect(c.add('ZZZZZZZZ', 'view')).toBe(false); // 대기 묶음 + 모으는 칸 모두 꽉 참 → 새 칸 버림
      expect(c.add(code(LINK_MAX_CELLS), 'view')).toBe(true); // 있는 칸은 센다
      expect(c.state.cells).toBe(LINK_MAX_CELLS);
      release();
    } finally {
      c.onModuleDestroy();
    }
  });
  it(`주기(${LINK_FLUSH_EVERY_MS / 1000}초)가 지나면 요청이 flush를 시작한다(기다리지 않음), 주기 안에서는 안 쓴다`, async () => {
    const { prisma, calls } = fake();
    let t = 0;
    const c = new LinkCounter(prisma, { now: () => t });
    try {
      c.add('K7M3QX9P', 'view');
      t = LINK_FLUSH_EVERY_MS - 1;
      c.add('K7M3QX9P', 'view');
      expect(calls).toHaveLength(0);
      t = LINK_FLUSH_EVERY_MS;
      c.add('K7M3QX9P', 'store_ios');
      await c.drain(1000);
      expect(calls).toHaveLength(1);
      // 값 배열: 날짜·코드·이벤트·개수(키 순서 정렬)
      const vals = calls[0]!.slice(1);
      expect(vals.slice(1)).toEqual([
        ['1970-01-01', '1970-01-01'],
        ['K7M3QX9P', 'K7M3QX9P'],
        ['store_ios', 'view'],
        ['1', '2'],
      ]);
    } finally {
      c.onModuleDestroy();
    }
  });
});

describe('B7a 리뷰 반영 — 재시도 간격·종료 마감·규칙별 창 상한', () => {
  it('M2: 실패 중 칸이 꽉 찬 채 요청 1,000번 → DB 시도는 1번, 15초 뒤에야 다음 시도', async () => {
    let t = 0;
    const prisma = { $executeRaw: vi.fn(() => Promise.reject(new Error('down'))) } as unknown as PrismaService;
    const c = new LinkCounter(prisma, { now: () => t });
    try {
      const code = (i: number) => `K${String(i).padStart(7, '0')}`;
      for (let i = 0; i < LINK_MAX_CELLS; i++) c.add(code(i), 'view');
      await c.flush(); // 꽉 찬 순간 떼어 보낸 묶음이 실패 → 대기 묶음
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      for (let i = 0; i < LINK_MAX_CELLS; i++) c.add(code(LINK_MAX_CELLS + i), 'view'); // 다시 꽉 참
      for (let i = 0; i < 1000; i++) c.add(code(3 * LINK_MAX_CELLS + i), 'view');
      await Promise.resolve();
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      t = LINK_FLUSH_EVERY_MS;
      c.add(code(0), 'view');
      await c.flush();
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    } finally {
      c.onModuleDestroy();
    }
  });

  it('M1: 종료 마감 하나를 두 집계기가 병렬로 나눠 쓴다 — DB가 멈춰도 마감 안에 끝나고 못 쓴 개수만 로그', async () => {
    const { ShutdownBudget } = await import('../src/common/shutdown-budget');
    const { MetricAggregator } = await import('../src/metrics/metric-aggregator');
    const budget = new ShutdownBudget();
    budget.totalMs = 1000;
    const never = { $executeRaw: vi.fn(() => new Promise(() => undefined)) } as unknown as PrismaService;
    const link = new LinkCounter(never, { now: () => Date.now() }, budget);
    const agg = new MetricAggregator(never, { get: () => 100 } as never, budget);
    const logs: Array<Record<string, unknown>> = [];
    for (const o of [link, agg]) (o as unknown as { log: { error: (x: Record<string, unknown>) => void; warn: () => void } }).log = { error: (x) => logs.push(x), warn: () => undefined };
    for (let i = 0; i < 7; i++) link.add('K7M3QX9P', 'view');
    agg.add([{ day: '2026-11-25', event: 'open', cohortDay: '2026-11-25', dayN: 0, platform: 'android', appVer: '1.0', lang: 'ko', nt: 'A', wg: '-', moon: '0' } as never]);
    const t0 = Date.now();
    agg.beforeApplicationShutdown();
    link.beforeApplicationShutdown();
    await budget.settle();
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(1300); // 차례로였다면 2초 이상
    expect(logs).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'link_flush_lost', count: 7 }), expect.objectContaining({ code: 'metric_flush_lost' })]));
    expect(JSON.stringify(logs)).not.toContain('K7M3QX9P'); // 개수만
  });

  it('M3: RateLimiter는 규칙마다 상한 — 위조 키로 분 단위 규칙을 넘치게 해도 다른 규칙의 긴 창은 남는다', async () => {
    const { MAX_WINDOWS, RateLimiter } = await import('../src/common/rate-limiter');
    const l = new RateLimiter({ now: () => 0 } as never);
    try {
      const day = { name: 'account_ip_day', key: '198.51.100.7', limit: 2, windowMs: 86_400_000 };
      expect(l.take([day])).toBeNull();
      expect(l.take([day])).toBeNull();
      for (let i = 0; i < MAX_WINDOWS * 2; i++) l.take([{ name: 'm_get', key: `forged-${i}`, limit: 30, windowMs: 60_000 }]);
      expect(l.take([day])).toBe(day); // 하루 창이 살아 있어 여전히 막힌다
      expect(l.size).toBeLessThanOrEqual(MAX_WINDOWS + 1);
    } finally {
      l.onModuleDestroy();
    }
  });
});
