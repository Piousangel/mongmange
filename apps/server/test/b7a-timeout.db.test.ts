// B7a 클라이언트 쪽 쿼리 제한 시간(B7-report 4절 B3) — 실제 Postgres 앞에 시험 안 TCP 프록시를 두고 'DB 응답 멈춤(블랙홀)'을 만든다.
// load/delay-proxy.mjs의 hold와 같은 뜻: 앱 → DB는 흘려보내고 DB → 앱만 붙잡는다(쿼리는 DB에서 실행·커밋되지만 앱은 답을 못 받는다).
// 그럴듯한 오답 판별(OPERATING 8-1):
//  - 멈춘 DB에 대한 쿼리가 DB_QUERY_TIMEOUT_MS 근처에서 끊기지 않고 멈춘 시간만큼 기다리면 실패(전: 15초 멈춤 = 15초 대기)
//  - 제한 시간에 걸린 연결이 풀에 돌아가면 실패(트랜잭션 경로 — 다음 요청이 멈춘 쿼리 뒤에 줄을 선다)
//  - 멈춤 중 /readyz가 200이거나 /healthz(라이브니스)가 DB를 따라 실패하면 실패(재시작 폭주)
//  - 멈춤 중 링크 퍼널 flush가 '결과 모름'으로 끝난 뒤 다시 보내 두 번 세면 실패
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { Writable } from 'node:stream';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { logSink } from '../src/common/logging';
import type { LinkCounter } from '../src/pages/link-counter';
import type { PrismaService } from '../src/prisma/prisma.service';

const QUERY_TIMEOUT = 1500;
const READY_TIMEOUT = 1000;

/** 앱 ↔ Postgres 프록시. hold면 DB → 앱 방향을 붙잡는다 */
class HoldProxy {
  hold = false;
  readonly open = new Set<net.Socket>();
  private readonly held: Array<() => void> = [];
  private server!: net.Server;
  port = 0;
  constructor(private readonly up: { host: string; port: number }) {}
  async start(): Promise<void> {
    this.server = net.createServer((client) => {
      const upstream = net.connect(this.up.port, this.up.host);
      this.open.add(client);
      const close = () => {
        this.open.delete(client);
        client.destroy();
        upstream.destroy();
      };
      client.on('data', (d) => upstream.write(d));
      upstream.on('data', (d) => {
        if (this.hold) this.held.push(() => client.writable && client.write(d));
        else if (client.writable) client.write(d);
      });
      // 앱이 소켓을 닫으면(끊기·FIN) 연결이 끝난 것으로 본다
      client.on('end', close).on('close', close).on('error', close);
      upstream.on('close', close).on('error', close);
    });
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    this.port = (this.server.address() as net.AddressInfo).port;
  }
  release(): void {
    this.hold = false;
    for (const f of this.held.splice(0)) f();
  }
  async stop(): Promise<void> {
    for (const s of this.open) s.destroy();
    await new Promise<void>((r) => this.server.close(() => r()));
  }
}

let app: NestFastifyApplication;
let prisma: PrismaService;
let proxy: HoldProxy;
let counter: LinkCounter;
const logs: string[] = [];

beforeAll(async () => {
  logSink.stream = new Writable({
    write(chunk, _e, cb) {
      logs.push(...String(chunk).split('\n').filter(Boolean));
      cb();
    },
  });
  const real = new URL(process.env.DATABASE_URL!);
  proxy = new HoldProxy({ host: real.hostname, port: Number(real.port || 5432) });
  await proxy.start();
  const via = new URL(real);
  via.hostname = '127.0.0.1';
  via.port = String(proxy.port);
  Object.assign(process.env, {
    DATABASE_URL: via.toString(),
    DB_POOL_MAX: '2',
    DB_CONNECT_TIMEOUT_MS: '800',
    DB_STATEMENT_TIMEOUT_MS: '1000',
    DB_QUERY_TIMEOUT_MS: String(QUERY_TIMEOUT),
    READY_TIMEOUT_MS: String(READY_TIMEOUT),
    READY_CACHE_MS: '0',
    TRUSTED_PROXY_HOPS_API: '1',
    TRUSTED_PROXY_HOPS_WEB: '2',
    LOG_LEVEL: 'info',
  });
  const { createApp } = await import('../src/app.factory');
  const { PrismaService } = await import('../src/prisma/prisma.service');
  const { LinkCounter } = await import('../src/pages/link-counter');
  app = await createApp({ bufferLogs: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  prisma = app.get(PrismaService);
  counter = app.get(LinkCounter);
});
afterAll(async () => {
  proxy?.release();
  await app?.close();
  await proxy?.stop();
  logSink.stream = undefined;
});

const http = () => request(app.getHttpServer());
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** 풀 연결 2개를 데운다 */
async function warm(): Promise<Set<net.Socket>> {
  await Promise.all([prisma.$executeRaw`select pg_sleep(0.05)`, prisma.$executeRaw`select pg_sleep(0.05)`]);
  expect(proxy.open.size).toBe(2);
  return new Set(proxy.open);
}
async function timed<T>(p: Promise<T>): Promise<{ ms: number; ok: boolean }> {
  const t0 = Date.now();
  const ok = await p.then(
    () => true,
    () => false,
  );
  return { ms: Date.now() - t0, ok };
}

describe('DB 응답 멈춤(데운 풀)', () => {
  it('쿼리는 query_timeout 근처에서 끊기고, /readyz 503·/healthz 200, 풀린 뒤 바로 회복', async () => {
    await warm();
    proxy.hold = true;
    try {
      const [q, ready, live] = await Promise.all([
        timed(prisma.$queryRaw`select 1`),
        timed(http().get('/readyz').expect(503)),
        timed(http().get('/healthz').expect(200)),
      ]);
      expect(q.ok).toBe(false);
      expect(q.ms).toBeGreaterThanOrEqual(QUERY_TIMEOUT - 100);
      expect(q.ms).toBeLessThan(QUERY_TIMEOUT + 1500);
      expect(ready.ok).toBe(true);
      expect(ready.ms).toBeLessThan(READY_TIMEOUT + 500);
      expect(live.ok).toBe(true);
      expect(live.ms).toBeLessThan(300);
    } finally {
      proxy.release();
    }
    await wait(200);
    const after = await timed(prisma.$queryRaw`select 1`);
    expect(after).toMatchObject({ ok: true });
    expect(after.ms).toBeLessThan(1000);
    await http().get('/readyz').expect(200);
  });

  it('트랜잭션 안에서 걸린 연결은 풀에 돌려보내지 않고 끊는다(DroppingClient)', async () => {
    await wait(QUERY_TIMEOUT + 500); // 앞 시험의 연결 정리가 끝나게
    const warmSet = await warm();
    try {
      // BEGIN까지는 정상으로 → 트랜잭션 안 쿼리에서 멈춤(BEGIN에서 걸리면 pg-pool이 오류와 함께 돌려받아 어차피 버린다)
      const tx = await timed(
        prisma.$transaction(
          async (t) => {
            await t.$executeRaw`select 1`;
            proxy.hold = true;
            await t.$executeRaw`select 2`;
          },
          { timeout: 10_000 },
        ),
      );
      expect(tx.ok).toBe(false);
      expect(tx.ms).toBeLessThan(QUERY_TIMEOUT * 2 + 1500);
      await wait(300);
      // 데운 연결 둘 중 트랜잭션이 쓴 하나는 앱이 닫았다(나머지 하나는 쉬는 연결로 남아도 된다)
      const stillOpen = [...warmSet].filter((s) => proxy.open.has(s)).length;
      expect(stillOpen).toBeLessThanOrEqual(1);
    } finally {
      proxy.release();
    }
    expect((await timed(prisma.$queryRaw`select 1`)).ok).toBe(true);
  });

  it('멈춤 중 링크 퍼널 flush: DB는 커밋했지만 앱은 시간 초과(결과 모름) → 풀린 뒤 같은 묶음 재전송, 합계 정확(중복 0)', async () => {
    const code = 'T' + randomUUID().replace(/[^0-9]/g, '').slice(0, 7).padEnd(7, '1');
    const uid = randomUUID();
    const cid = randomUUID();
    await prisma.$executeRaw`INSERT INTO app.users (id) VALUES (${uid}::uuid)`;
    await prisma.$executeRaw`INSERT INTO app.creatures (id, user_id, code, link_enabled) VALUES (${cid}::uuid, ${uid}::uuid, ${code}, true)`;
    await prisma.$executeRaw`
      INSERT INTO app.public_pages (creature_id, store_key, ver, state, meta, name_shown, path_prefix, has_loop, published_at)
      VALUES (${cid}::uuid, ${randomUUID().replaceAll('-', '')}, 1, 'live', '{"snap":1,"ink":"songyeon","bornDate":"2026-11-01","dayAtPublish":7,"lang":"ko"}', false, 'kTimeoutTest', false, now())`;
    await warm();
    for (let i = 0; i < 12; i++) await http().post(`/m/${code}/seen`).set('x-forwarded-for', `1.1.1.1, 10.120.0.${i}, 35.0.0.1`).expect(204);
    proxy.hold = true;
    try {
      const f = await timed(counter.flush());
      expect(f.ms).toBeLessThan(QUERY_TIMEOUT + 1500);
      expect(counter.state.pendingCells).toBe(1); // 결과를 모르니 들고 있다
      // 멈춤 중 새 조회는 새 칸에
      for (let i = 0; i < 3; i++) await http().post(`/m/${code}/seen`).set('x-forwarded-for', `1.1.1.1, 10.120.1.${i}, 35.0.0.1`).expect(204);
    } finally {
      proxy.release();
    }
    await wait(200);
    expect(await counter.drain(10_000)).toBe(true);
    const row = await prisma.linkDaily.findMany({ where: { code } });
    expect(row.map((r) => [r.event, r.count])).toEqual([['view', 15]]);
  });

  it('종료(SIGTERM) 중 DB가 멈춰 있어도 공유 마감 8초 안에 끝나고, 못 쓴 개수만 손실 로그로 남긴다(B7a 리뷰 M1)', async () => {
    for (let i = 0; i < 4; i++) await http().post('/m/K7M3QX9P/seen').set('x-forwarded-for', `1.1.1.1, 10.121.0.${i}, 35.0.0.1`).expect(204);
    await warm();
    proxy.hold = true;
    const t0 = Date.now();
    await app.close();
    const ms = Date.now() - t0;
    app = undefined as unknown as NestFastifyApplication;
    proxy.release();
    expect(ms).toBeLessThan(9_500); // Cloud Run 유예 10초 안
    const lost = logs.map((l) => JSON.parse(l) as Record<string, unknown>).find((l) => l.code === 'link_flush_lost');
    expect(lost).toMatchObject({ code: 'link_flush_lost', count: 4 });
    expect(logs.join('\n')).not.toContain('K7M3QX9P');
  }, 20_000);
});
