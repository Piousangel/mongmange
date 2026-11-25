// B7a 링크 퍼널 메모리 합산 — 실제 Postgres(docs/design/server-v1/B7-report.md 4절 B1·B4, DECISIONS B7a).
// 그럴듯한 오답 판별(OPERATING 8-1):
//  - 보낸 비콘 수와 link_daily 합계가 하나라도 다르면 실패(오차 0)
//  - 인스턴스 둘이 같은 칸을 동시에 써서 합계가 어긋나면 실패(UPSERT 더하기)
//  - DB 실패 뒤 다시 보낼 때 잃거나(되돌리지 않음), 커밋된 묶음을 또 더하면(결과 모르는 실패) 실패
//  - 꺼진·없는 코드가 세지면 실패 / 종료(SIGTERM) 때 남은 칸을 쓰지 않으면 실패
//  - /get이 한도를 넘었다고 429를 내면 실패(넘친 것은 세지만 않는다)
// 오차 0 증명은 '센 합계 = 보낸 수'를 서로 다른 IP·동시 요청·실패 주입·두 인스턴스 각각에서 단언한다.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Clock } from '../src/common/clock';
import { LinkCounter } from '../src/pages/link-counter';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SERVICE_KEY, startFakeSupabase, type FakeSupabase } from './fake-supabase';

let app: NestFastifyApplication;
let prisma: PrismaService;
let counter: LinkCounter;
let clock: Clock;
let sb: FakeSupabase;
/** 하루 새 계정 상한 시험용(이 파일의 앱에만) */
const ACCOUNT_CAP = 3;

beforeAll(async () => {
  sb = await startFakeSupabase();
  Object.assign(process.env, {
    SUPABASE_URL: sb.url,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    TRUSTED_PROXY_HOPS_API: '1',
    TRUSTED_PROXY_HOPS_WEB: '2',
    RATE_LIMIT_PER_MIN: '10000',
    ACCOUNT_NEW_PER_DAY: String(ACCOUNT_CAP),
  });
  const { createApp } = await import('../src/app.factory');
  const { PrismaService } = await import('../src/prisma/prisma.service');
  const { Clock } = await import('../src/common/clock');
  app = await createApp({ bufferLogs: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  prisma = app.get(PrismaService);
  counter = app.get(LinkCounter);
  clock = app.get(Clock);
});
afterAll(async () => {
  await app?.close();
  await sb?.close();
});

const http = () => request(app.getHttpServer());
let ipSeq = 0;
/** 요청마다 다른 클라이언트(/m 경로 — XFF 오른쪽에서 2번째) */
const fresh = (r: request.Test) => {
  ipSeq++;
  return r.set('x-forwarded-for', `1.1.1.1, 10.${70 + ((ipSeq >> 16) & 15)}.${(ipSeq >> 8) & 255}.${ipSeq & 255}, 35.0.0.1`);
};
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const newCode = () => Array.from({ length: 8 }, () => ALPHA[Math.floor(Math.random() * 32)]).join('');

/** 살아 있는 링크 하나(load/seed.sql과 같은 모양) */
async function liveLink(): Promise<string> {
  const code = newCode();
  const uid = randomUUID();
  const cid = randomUUID();
  await prisma.$executeRaw`INSERT INTO app.users (id) VALUES (${uid}::uuid)`;
  await prisma.$executeRaw`INSERT INTO app.creatures (id, user_id, code, link_enabled) VALUES (${cid}::uuid, ${uid}::uuid, ${code}, true)`;
  await prisma.$executeRaw`
    INSERT INTO app.public_pages (creature_id, store_key, ver, state, meta, name_shown, path_prefix, has_loop, published_at)
    VALUES (${cid}::uuid, ${randomUUID().replaceAll('-', '')}, 1, 'live', '{"snap":1,"ink":"songyeon","bornDate":"2026-11-01","dayAtPublish":7,"lang":"ko"}', false, ${'k' + randomUUID().slice(0, 20)}, false, now())`;
  return code;
}
async function counts(code: string): Promise<Record<string, number>> {
  const rows = await prisma.linkDaily.findMany({ where: { code } });
  return Object.fromEntries(rows.map((r) => [r.event, r.count]));
}
const flushAll = async (c: LinkCounter = counter) => expect(await c.drain(10_000)).toBe(true);

describe('비콘 합계 오차 0', () => {
  it('서로 다른 IP 300번 동시 비콘 → 요청 중 DB 쓰기 0, flush 뒤 view = 300', async () => {
    const code = await liveLink();
    await flushAll();
    const spy = vi.spyOn(prisma, '$executeRaw');
    try {
      await Promise.all(Array.from({ length: 300 }, () => fresh(http().post(`/m/${code}/seen`)).expect(204)));
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    expect(await counts(code)).toEqual({});
    await flushAll();
    expect(await counts(code)).toEqual({ view: 300 });
  });

  it('스토어 이동도 같은 합산: ios 7 + android 5 → 302 12번, 합계 정확', async () => {
    const code = await liveLink();
    for (let i = 0; i < 7; i++) await fresh(http().get(`/m/${code}/get?p=ios`)).expect(302);
    for (let i = 0; i < 5; i++) await fresh(http().get(`/m/${code}/get?p=android`)).expect(302);
    await fresh(http().get(`/m/${code}/get`)).expect(302); // 플랫폼 없음은 세지 않음
    await flushAll();
    expect(await counts(code)).toEqual({ store_ios: 7, store_android: 5 });
  });

  it('꺼진 링크·없는 코드·형식 틀린 코드는 세지 않는다 — 끈 시점이 flush 전이면 그 사이 조회도 버린다', async () => {
    const off = await liveLink();
    const ghost = newCode();
    for (let i = 0; i < 3; i++) {
      await fresh(http().post(`/m/${off}/seen`)).expect(204);
      await fresh(http().post(`/m/${ghost}/seen`)).expect(204);
      await fresh(http().post('/m/nope/seen')).expect(204);
    }
    await prisma.$executeRaw`UPDATE app.creatures SET link_enabled = false WHERE code = ${off}`;
    await flushAll();
    expect(await counts(off)).toEqual({});
    expect(await prisma.linkDaily.count({ where: { code: ghost } })).toBe(0);
  });

  it('하루 경계: flush 전에 UTC 날짜가 바뀌어도 각 조회는 그 조회의 날짜 칸으로', async () => {
    const code = await liveLink();
    const real = clock.now;
    try {
      clock.now = () => Date.parse('2026-11-25T23:59:59Z');
      await fresh(http().post(`/m/${code}/seen`)).expect(204);
      clock.now = () => Date.parse('2026-11-26T00:00:01Z');
      await fresh(http().post(`/m/${code}/seen`)).expect(204);
      await fresh(http().post(`/m/${code}/seen`)).expect(204);
      await flushAll();
    } finally {
      clock.now = real;
    }
    const rows = await prisma.linkDaily.findMany({ where: { code }, orderBy: { day: 'asc' } });
    expect(rows.map((r) => [r.day.toISOString().slice(0, 10), r.count])).toEqual([
      ['2026-11-25', 1],
      ['2026-11-26', 2],
    ]);
  });
});

describe('인스턴스 여럿 — UPSERT 더하기', () => {
  it('인스턴스 셋이 같은 칸에 100·200·300을 모아 동시에 flush(5번 겹쳐서) → 합계 600×5', async () => {
    const code = await liveLink();
    const { Clock } = await import('../src/common/clock');
    const others = [new LinkCounter(prisma, new Clock()), new LinkCounter(prisma, new Clock()), new LinkCounter(prisma, new Clock())];
    try {
      for (let round = 0; round < 5; round++) {
        others.forEach((c, i) => {
          for (let k = 0; k < (i + 1) * 100; k++) c.add(code, 'view');
        });
        await Promise.all(others.map((c) => c.flush()));
      }
      await Promise.all(others.map((c) => flushAll(c)));
    } finally {
      others.forEach((c) => c.onModuleDestroy());
    }
    expect(await counts(code)).toEqual({ view: 3000 });
  });
});

describe('DB 실패 — 유실 0·중복 0', () => {
  it('보내기 전 실패(연결 거절 흉내): 같은 묶음을 들고 있다가 다음 flush에 정확히 한 번', async () => {
    const code = await liveLink();
    for (let i = 0; i < 40; i++) counter.add(code, 'view');
    const spy = vi.spyOn(prisma, '$executeRaw').mockRejectedValueOnce(new Error('connection refused'));
    try {
      await counter.flush();
      expect(counter.state.pendingCells).toBe(1);
      expect(counter.state.failures).toBe(1);
      // 실패 동안 들어온 조회는 새 칸에(대기 묶음에 섞지 않는다)
      for (let i = 0; i < 2; i++) counter.add(code, 'view');
      expect(counter.state.cells).toBe(1);
    } finally {
      spy.mockRestore();
    }
    await flushAll();
    expect(await counts(code)).toEqual({ view: 42 });
  });

  it('결과를 모르는 실패(DB는 커밋, 클라이언트는 오류 — 시간 초과·연결 끊김): 같은 id로 다시 보내도 두 번 더하지 않는다', async () => {
    const code = await liveLink();
    for (let i = 0; i < 25; i++) counter.add(code, 'view');
    const real = prisma.$executeRaw.bind(prisma);
    const spy = vi.spyOn(prisma, '$executeRaw').mockImplementationOnce(((...a: Parameters<typeof real>) =>
      real(...a).then(() => {
        throw new Error('Query read timeout');
      })) as typeof real);
    try {
      await counter.flush();
      expect(counter.state.pendingCells).toBe(1);
    } finally {
      spy.mockRestore();
    }
    expect(await counts(code)).toEqual({ view: 25 }); // 이미 반영됨
    await flushAll(); // 같은 묶음 재전송 → 표지가 있어 0
    expect(await counts(code)).toEqual({ view: 25 });
    for (let i = 0; i < 5; i++) counter.add(code, 'view');
    await flushAll();
    expect(await counts(code)).toEqual({ view: 30 });
  });

  it('여러 번 연달아 실패해도(3번) 잃지 않는다, 표지는 묶음마다 하나', async () => {
    const code = await liveLink();
    const before = await prisma.linkFlush.count();
    for (let i = 0; i < 9; i++) counter.add(code, 'store_android');
    const spy = vi.spyOn(prisma, '$executeRaw').mockRejectedValue(new Error('down'));
    try {
      for (let i = 0; i < 3; i++) await counter.flush();
      expect(counter.state.failures).toBe(3);
    } finally {
      spy.mockRestore();
    }
    await flushAll();
    expect(await counts(code)).toEqual({ store_android: 9 });
    expect(await prisma.linkFlush.count()).toBe(before + 1);
  });

  it('표지는 2일 지난 것부터 flush 문장이 지운다(무작위 id·시각만, 코드 없음)', async () => {
    await prisma.$executeRaw`INSERT INTO app.link_flush (id, at) VALUES (${randomUUID()}::uuid, now() - interval '3 days')`;
    const code = await liveLink();
    counter.add(code, 'view');
    await flushAll();
    expect(await prisma.linkFlush.count({ where: { at: { lt: new Date(Date.now() - 2 * 86_400_000) } } })).toBe(0);
    expect(Object.keys((await prisma.linkFlush.findFirstOrThrow()) as object).sort()).toEqual(['at', 'id']);
  });
});

describe('/get 한도(B4) — 넘어도 이동, 세지만 않는다', () => {
  it('한 IP 40번: 302 × 40(429 0), store_ios = 30', async () => {
    const code = await liveLink();
    const xff = '1.1.1.1, 10.99.0.4, 35.0.0.1';
    for (let i = 0; i < 40; i++) {
      const r = await http().get(`/m/${code}/get?p=ios`).set('x-forwarded-for', xff).expect(302);
      expect(r.headers.location).toMatch(/^https:\/\/apps\.apple\.com\//);
    }
    await flushAll();
    expect(await counts(code)).toEqual({ store_ios: 30 });
  });
});

describe('하루 새 계정 상한 — 그날(UTC) 창의 위쪽 끝(B7a 추가)', () => {
  it('시계가 뒤로 가도 다음 날 이후(미래) 행은 세지 않는다, 그날 행은 그대로 센다', async () => {
    // 다른 시험 행과 섞이지 않게 먼 과거 하루를 '오늘'로 쓴다
    const today = Date.parse('2001-03-10T12:00:00Z');
    const users: string[] = [];
    const seed = async (at: string) => {
      const id = randomUUID();
      users.push(id);
      await prisma.$executeRaw`INSERT INTO app.users (id) VALUES (${id}::uuid)`;
      await prisma.$executeRaw`INSERT INTO app.user_auth (sub, user_id, linked_at) VALUES (${id}::uuid, ${id}::uuid, ${new Date(at)})`;
    };
    const bootstrap = async (n: number) => {
      const { token } = await sb.signIn();
      return http()
        .post('/api/v1/me/bootstrap')
        .set('authorization', `Bearer ${token}`)
        .set('x-forwarded-for', `10.98.${n}.1`)
        .send({ ageGate: { v: 2, ok: true } });
    };
    const real = clock.now;
    try {
      clock.now = () => today;
      // 다음 날 0시 정각·그 뒤(미래) 행이 상한만큼 있어도 오늘 새 계정은 된다
      await seed('2001-03-11T00:00:00Z');
      await seed('2001-03-11T09:00:00Z');
      await seed('2001-03-20T00:00:00Z');
      const ok = await bootstrap(1);
      expect(ok.status).toBe(200);
      users.push(ok.body.userId as string);
      // 오늘(0시 정각 포함) 행은 센다 → 오늘 3개(0시 1 + 방금 1 + 1) = 상한 → 503
      await seed('2001-03-10T00:00:00Z');
      await seed('2001-03-10T23:59:59Z');
      const capped = await bootstrap(2);
      expect([capped.status, capped.body.error?.code]).toEqual([503, 'account_cap']);
    } finally {
      clock.now = real;
      await prisma.$executeRaw`DELETE FROM app.users WHERE id = ANY(${users}::uuid[])`;
    }
  });
});

describe('종료(SIGTERM) — 남은 칸을 쓰고 끈다', () => {
  it('app.close() 앞 단계에서 모은 칸 flush → 닫힌 뒤 DB에 합계 그대로', async () => {
    const code = await liveLink();
    for (let i = 0; i < 17; i++) await fresh(http().post(`/m/${code}/seen`)).expect(204);
    expect(await counts(code)).toEqual({});
    await app.close();
    app = undefined as unknown as NestFastifyApplication;
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    try {
      const r = await c.query<{ n: number }>(`select count::int as n from app.link_daily where code = $1 and event = 'view'`, [code]);
      expect(r.rows[0]?.n).toBe(17);
    } finally {
      await c.end();
    }
  });
});
