// V25 — 활동 달(인증된 요청마다, 달마다 최대 한 번 쓰기) + 2년 미사용 정리 잡(삭제 연쇄 재사용). 처리방침 6절·K20, architecture.md 5-5.
// 실제 Postgres + 실제 JWT 경로 + 로컬 파일 저장소. 그럴듯한 오답 판별(OPERATING 8-1):
//  - 링크만 쓰는 사용자(세이브 없이 /creature·링크 API만)가 활동으로 잡히지 않으면 실패(처리방침 리뷰 H3·PIA R13)
//  - 마지막 활동 뒤 2년이 안 된 계정(23개월 남짓)을 지우거나, 2년 지난 계정을 남기면 실패 — UTC 월 경계 1초 앞뒤로 고정
//  - 같은 달 두 번째 요청부터 users 행을 다시 쓰면(xmin이 바뀌면) 실패 / 시계가 늦은 인스턴스가 값을 되돌리면 실패
//  - 정리 뒤 어느 표(app 스키마 전부)·세 버킷·Auth 사용자에 흔적이 남으면 실패 / 로그·응답에 id·sub·코드가 있으면 실패
//  - 후보로 뽑힌 뒤 활동한 사용자를 지우면 실패
//  - 매일 storage-gc가 2년 정리를 함께 돌리지 않거나, 대기열·정리 중 한쪽 실패가 다른 쪽을 막으면 실패(PM 11-25)
//  - (리뷰 반영) 인증 요청 1건에 로그인·사용자 조회 SQL이 둘 이상이면 실패(M1) / 하루 상한(1%·200)을 넘는 날이나 시계가 튄 날
//    한 명이라도 지우면 실패(M2) / Scheduler 재시도가 같은 날 정리를 다시 돌리거나, 정리 실패가 500을 내면 실패(M3)
//  - 동시 실행이 404를 failed로 세면 실패(L1) / recover가 활동 달을 쓰지 않거나 되돌리면 실패(L2) / 값 없는 행을 갱신하지 않으면 실패(L4)
import 'reflect-metadata';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sim } from '@mong/core';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CountingInvalidator } from '../src/cdn/cdn-purge';
import type { Clock } from '../src/common/clock';
import { logSink } from '../src/common/logging';
import type { CronAuth } from '../src/cron/cron.controller';
import type { DeletionService } from '../src/deletion/deletion.service';
import type { GcService } from '../src/deletion/gc.service';
import type { InactiveSweep } from '../src/deletion/inactive-sweep';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { LocalObjectStore } from '../src/storage/local-store';
import { jpeg, mp4 } from './media-fixtures';
import { SERVICE_KEY, startFakeSupabase, type FakeSupabase } from './fake-supabase';

let app: NestFastifyApplication;
let prisma: PrismaService;
let sb: FakeSupabase;
let clock: Clock;
let store: LocalObjectStore;
let cdn: CountingInvalidator;
let sweep: InactiveSweep;
let deletion: DeletionService;
let gc: GcService;
let cronAuth: CronAuth;
const logs: string[] = [];
const filler: string[] = [];
const realNow = Date.now.bind(Date);
const SNAP_OK = JSON.parse(readFileSync(join(__dirname, '../../../packages/core/test/fixtures/snap/ok.json'), 'utf8')) as Record<string, unknown>;

beforeAll(async () => {
  logSink.stream = new Writable({
    write(chunk, _e, cb) {
      logs.push(...String(chunk).split('\n').filter(Boolean));
      cb();
    },
  });
  sb = await startFakeSupabase();
  Object.assign(process.env, {
    SUPABASE_URL: sb.url,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    TRUSTED_PROXY_HOPS_API: '1',
    TRUSTED_PROXY_HOPS_WEB: '2',
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_DIR: mkdtempSync(join(tmpdir(), 'mong-v25-')),
    STORAGE_LOCAL_BASE_URL: 'http://localhost:9999',
    SITE_ORIGIN: 'https://mongmang.ink',
    APP_STORE_ID: '6739012345',
    LOG_LEVEL: 'info',
    RATE_LIMIT_PER_MIN: '10000',
  });
  const { createApp } = await import('../src/app.factory');
  const { Clock } = await import('../src/common/clock');
  const { PrismaService } = await import('../src/prisma/prisma.service');
  const { CDN_INVALIDATOR } = await import('../src/cdn/cdn-purge');
  const { OBJECT_STORE } = await import('../src/storage/object-store');
  const { InactiveSweep } = await import('../src/deletion/inactive-sweep');
  const { DeletionService } = await import('../src/deletion/deletion.service');
  const { GcService } = await import('../src/deletion/gc.service');
  const { CronAuth } = await import('../src/cron/cron.controller');
  app = await createApp({ bufferLogs: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  prisma = app.get(PrismaService);
  clock = app.get(Clock);
  store = app.get(OBJECT_STORE);
  cdn = app.get(CDN_INVALIDATOR);
  sweep = app.get(InactiveSweep);
  deletion = app.get(DeletionService);
  gc = app.get(GcService);
  cronAuth = app.get(CronAuth);
  // 차단기 ①(전체의 1%)이 이 파일의 소수 삭제를 막지 않도록, 이달 활동한 채움 계정 1000개(끝나면 지움)
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO app.users (id, created_at, last_active_month)
    SELECT gen_random_uuid(), now(), date_trunc('month', now() AT TIME ZONE 'UTC')::date FROM generate_series(1, 1000) RETURNING id`;
  filler.push(...rows.map((r) => r.id));
});
afterAll(async () => {
  if (filler.length) await prisma.user.deleteMany({ where: { id: { in: filler } } });
  await app?.close();
  await sb?.close();
  logSink.stream = undefined;
});
beforeEach(() => {
  clock.now = realNow;
});

// ───────────── 도구 ─────────────

const http = () => request(app.getHttpServer());
let ipSeq = 0;
interface Device {
  sub: string;
  token: string;
  ip: string;
}
async function device(): Promise<Device> {
  const { sub, token } = await sb.signIn();
  ipSeq++;
  return { sub, token, ip: `10.${120 + ((ipSeq >> 8) & 63)}.${ipSeq & 255}.25` };
}
const as = (d: Device, r: request.Test) => r.set('authorization', `Bearer ${d.token}`).set('x-forwarded-for', d.ip);
const ids: string[] = [];
async function user(): Promise<{ d: Device; userId: string; code: string }> {
  const d = await device();
  const r = await as(d, http().post('/api/v1/me/bootstrap')).send({ ageGate: { v: 2, ok: true } }).expect(200);
  ids.push(r.body.userId, d.sub, r.body.creature.code);
  return { d, userId: r.body.userId, code: r.body.creature.code };
}
const pathOf = (u: string) => {
  const x = new URL(u);
  return x.pathname + x.search;
};
/** 링크 켜기 전체(PUT → 올림 → commit) */
async function publish(d: Device) {
  const put = await as(d, http().put('/api/v1/creature/page'))
    .send({
      snapshot: SNAP_OK,
      nameVisible: false,
      lang: 'ko',
      files: { poster: { contentType: 'image/jpeg', bytes: 5000 }, og: { contentType: 'image/jpeg', bytes: 5000 }, loop: { contentType: 'video/mp4', bytes: 5000 } },
    })
    .expect(200);
  await http().put(pathOf(put.body.upload.poster.signedUrl)).set('content-type', 'image/jpeg').send(jpeg(1080, 1350)).expect(200);
  await http().put(pathOf(put.body.upload.og.signedUrl)).set('content-type', 'image/jpeg').send(jpeg(1200, 630)).expect(200);
  await http().put(pathOf(put.body.upload.loop.signedUrl)).set('content-type', 'video/mp4').send(mp4()).expect(200);
  await as(d, http().post(`/api/v1/creature/page/${put.body.ver}/commit`)).send().expect(200);
}
const T0 = Date.UTC(2026, 10, 20, 10);
const saveBody = (i: number) => sim.serializeState(sim.createInitial(T0, -540, 3), T0 + i * 1000);

const at = (iso: string) => {
  const t = Date.parse(iso);
  clock.now = () => t;
};
async function setMonth(userId: string, month: string | null) {
  await prisma.$executeRaw`UPDATE app.users SET last_active_month = ${month}::date WHERE id = ${userId}::uuid`;
}
async function monthOf(userId: string): Promise<string | null> {
  const [r] = await prisma.$queryRaw<{ m: string | null }[]>`SELECT last_active_month::text AS m FROM app.users WHERE id = ${userId}::uuid`;
  return r ? r.m : 'gone';
}
/** 행 판(xmin) — UPDATE가 한 번이라도 나면(값이 같아도) 바뀐다 */
async function xminOf(userId: string): Promise<string> {
  const [r] = await prisma.$queryRaw<{ x: string }[]>`SELECT xmin::text AS x FROM app.users WHERE id = ${userId}::uuid`;
  return r!.x;
}
async function exists(userId: string): Promise<boolean> {
  return (await prisma.user.count({ where: { id: userId } })) === 1;
}
async function traces(needles: string[]): Promise<Record<string, number>> {
  const tables = await prisma.$queryRaw<{ t: string }[]>`
    select table_name as t from information_schema.tables where table_schema = 'app' and table_type = 'BASE TABLE' order by 1`;
  const out: Record<string, number> = {};
  for (const { t } of tables) {
    for (const n of needles) {
      const [r] = await prisma.$queryRawUnsafe<{ n: number }[]>(`select count(*)::int as n from app."${t}" x where x::text ilike $1`, `%${n}%`);
      if (r!.n) out[`${t}:${n}`] = r!.n;
    }
  }
  return out;
}
async function filesUnder(storeKey: string): Promise<string[]> {
  return [
    ...(await store.list('public-pages', storeKey)),
    ...(await store.list('page-staging', storeKey)),
    ...(await store.list('quarantine', storeKey)),
  ];
}
const cron = (job: string) => http().post(`/internal/cron/${job}`).set('x-forwarded-for', '192.0.2.25');
/** OIDC 검사(cron-auth.test.ts가 따로 고정)를 이 안에서만 통과시킨다 — 경로·조합을 실제 HTTP로 보려고 */
async function withCronAuth(fn: () => Promise<void>) {
  const orig = cronAuth.check.bind(cronAuth);
  cronAuth.check = () => Promise.resolve();
  try {
    await fn();
  } finally {
    cronAuth.check = orig;
  }
}
/** 대기열 처리(gc.runDue) 호출 수를 센다 — 실제 처리는 그대로 */
function spyGc() {
  const orig = gc.runDue.bind(gc);
  const calls = {
    n: 0,
    restore: () => {
      gc.runDue = orig;
    },
  };
  gc.runDue = () => {
    calls.n++;
    return orig();
  };
  return calls;
}
/** 하루 1회 잠금을 비운다(시험마다 같은 날을 다시 쓰므로) */
async function resetDaily() {
  await prisma.inactiveSweepState.update({ where: { id: 1 }, data: { lastDay: null } });
}
/** 다른 시험 파일이 남긴 옛 사용자가 개수 단언을 흐리지 않게, 그 시각의 대상을 먼저 비운다(운영자 확인 confirm으로 차단기 ① 통과) */
async function drainAt(iso: string) {
  at(iso);
  for (;;) {
    const r = await sweep.run({ confirm: await sweep.candidateCount() });
    if (r.halted) throw new Error(`drain halted: ${r.halted}`);
    if (!r.more) break;
  }
}
async function oldUsers(n: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO app.users (id, created_at, last_active_month)
    SELECT gen_random_uuid(), '2020-01-01T00:00:00Z', '2020-01-01' FROM generate_series(1, ${n}::int) RETURNING id`;
  return rows.map((r) => r.id);
}
const thisMonth = () => new Date(realNow()).toISOString().slice(0, 8) + '01';
/** pg 드라이버로 나가는 SQL 문장을 모은다(Prisma 어댑터 → pg Client.query) */
async function sqlDuring(fn: () => Promise<unknown>): Promise<string[]> {
  const proto = pg.Client.prototype as unknown as { query: (...a: unknown[]) => unknown };
  const orig = proto.query;
  const seen: string[] = [];
  proto.query = function (this: unknown, ...a: unknown[]) {
    const q = a[0];
    seen.push(typeof q === 'string' ? q : String((q as { text?: string } | undefined)?.text ?? ''));
    return orig.apply(this, a);
  };
  try {
    await fn();
  } finally {
    proto.query = orig;
  }
  return seen;
}

// ───────────── ① 활동 달 ─────────────

describe('활동 달 — 인증된 요청이면 무엇이든, 달마다 최대 한 번', () => {
  it('링크만 쓰는 사용자: 세이브 없이 GET·PATCH /creature, 링크 켜기·끄기 각각이 활동으로 잡힌다(값 없는 행 포함)', async () => {
    const u = await user();
    const probes: Array<[string, () => request.Test, string | null]> = [
      ['GET /creature', () => as(u.d, http().get('/api/v1/creature')), '2024-01-01'],
      ['GET /creature(값 없는 행 — L4)', () => as(u.d, http().get('/api/v1/creature')), null],
      ['PATCH /creature', () => as(u.d, http().patch('/api/v1/creature')).send({ nameVisible: false }), '2024-01-01'],
      ['PUT /creature/page', () => as(u.d, http().put('/api/v1/creature/page')).send({ snapshot: SNAP_OK, nameVisible: false, lang: 'ko', files: { poster: { contentType: 'image/jpeg', bytes: 5000 }, og: { contentType: 'image/jpeg', bytes: 5000 } } }), '2024-01-01'],
      ['DELETE /creature/page', () => as(u.d, http().delete('/api/v1/creature/page')), '2024-01-01'],
      ['POST /recovery-code', () => as(u.d, http().post('/api/v1/recovery-code')), '2024-01-01'],
      ['GET /saves/main/meta(세이브 없음 404도 인증된 요청)', () => as(u.d, http().get('/api/v1/saves/main/meta')), '2024-01-01'],
    ];
    for (const [name, call, start] of probes) {
      await setMonth(u.userId, start);
      const r = await call();
      expect(r.status, name).toBeLessThan(500);
      expect(await monthOf(u.userId), name).toBe(thisMonth());
    }
    expect(await prisma.save.count({ where: { creature: { userId: u.userId } } })).toBe(0);
  });

  it('세이브 PUT도 그대로 활동(가드 한 곳으로 옮긴 뒤에도)', async () => {
    const u = await user();
    await setMonth(u.userId, '2024-01-01');
    await as(u.d, http().put('/api/v1/saves/main')).set('if-none-match', '*').send({ body: saveBody(1), clientSavedAt: '2026-11-20T10:00:00.000Z' }).expect(200);
    expect(await monthOf(u.userId)).toBe(thisMonth());
  });

  it('M1: 인증 요청 1건의 로그인·사용자 조회는 SQL 한 문장(user_auth JOIN users), 같은 달이면 쓰기 문장 0', async () => {
    const u = await user();
    await as(u.d, http().get('/api/v1/creature')).expect(200); // 이달로 맞춤
    const sql = await sqlDuring(() => as(u.d, http().get('/api/v1/creature')).expect(200));
    expect(sql.length).toBeGreaterThan(0); // 드라이버 문장을 실제로 받았는지
    const authReads = sql.filter((q) => /user_auth/i.test(q));
    expect(authReads, authReads.join('\n---\n')).toHaveLength(1);
    expect(authReads[0]).toMatch(/JOIN\s+app\.users/i);
    // 활동 달을 따로 읽는 문장이 없다(처음 판은 Prisma 관계 select가 users를 한 번 더 읽었다). 핸들러 자신의 users 읽기(삭제 요청 표시)는 별개
    expect(sql.filter((q) => /last_active_month/i.test(q) && !/user_auth/i.test(q))).toEqual([]);
    expect(sql.filter((q) => /^\s*UPDATE\s+app\.users/i.test(q))).toEqual([]);
  });

  it('같은 달 두 번째 요청부터는 users 행 쓰기 0(xmin 그대로), 동시 요청 여럿도 값 하나', async () => {
    const u = await user();
    at('2027-03-31T23:59:59Z');
    await setMonth(u.userId, '2027-02-01');
    await Promise.all(Array.from({ length: 6 }, () => as(u.d, http().get('/api/v1/creature')).expect(200)));
    expect(await monthOf(u.userId)).toBe('2027-03-01');
    const x = await xminOf(u.userId);
    for (let i = 0; i < 5; i++) await as(u.d, http().get('/api/v1/creature')).expect(200);
    at('2027-03-01T00:00:00Z');
    await as(u.d, http().get('/api/v1/creature')).expect(200);
    expect(await xminOf(u.userId)).toBe(x);
    // UTC 월 경계 1초 뒤 = 새 달 → 한 번 쓴다
    at('2027-04-01T00:00:00Z');
    await as(u.d, http().get('/api/v1/creature')).expect(200);
    expect(await monthOf(u.userId)).toBe('2027-04-01');
    expect(await xminOf(u.userId)).not.toBe(x);
    await setMonth(u.userId, thisMonth());
  });

  it('시계가 늦은 인스턴스(이전 달)는 값을 되돌리지 않는다', async () => {
    const u = await user();
    await setMonth(u.userId, '2027-05-01');
    at('2027-04-30T23:59:59Z');
    const x = await xminOf(u.userId);
    await as(u.d, http().get('/api/v1/creature')).expect(200);
    expect(await monthOf(u.userId)).toBe('2027-05-01');
    expect(await xminOf(u.userId)).toBe(x);
    await setMonth(u.userId, thisMonth());
  });

  it('L2: recover(새 기기 — 가드가 아직 못 씀)가 이달로 쓰고, 시계가 늦어도 미래 값을 되돌리지 않는다', async () => {
    const u = await user();
    await setMonth(u.userId, '2024-01-01');
    const phrase = (await as(u.d, http().post('/api/v1/recovery-code')).expect(200)).body.code as string;
    await setMonth(u.userId, '2024-01-01'); // recovery-code 요청이 가드로 쓴 값을 되돌려 recover만 보게
    const d2 = await device();
    ids.push(d2.sub);
    const r = await as(d2, http().post('/api/v1/recover')).send({ code: phrase, ageGate: { v: 2, ok: true } }).expect(200);
    expect(await monthOf(u.userId)).toBe(thisMonth());
    await setMonth(u.userId, '2027-06-01');
    const d3 = await device();
    ids.push(d3.sub);
    await as(d3, http().post('/api/v1/recover')).send({ code: r.body.newCode, ageGate: { v: 2, ok: true } }).expect(200);
    expect(await monthOf(u.userId)).toBe('2027-06-01');
    await setMonth(u.userId, thisMonth());
  });

  it('③ 갱신이 실패해도 요청은 200, `activity_touch_failed`를 누적 개수와 함께 남기고 다음 요청이 다시 쓴다', async () => {
    const u = await user();
    await setMonth(u.userId, '2024-01-01');
    // 인스턴스에 자기 속성으로 덮고, 끝나면 속성째 지운다(바인딩한 함수로 되돌리면 트랜잭션의 tx.$executeRaw까지 트랜잭션 밖으로 샌다)
    (prisma as { $executeRaw: unknown }).$executeRaw = () => Promise.reject(new Error('잠깐 실패'));
    try {
      await as(u.d, http().get('/api/v1/creature')).expect(200);
    } finally {
      delete (prisma as { $executeRaw?: unknown }).$executeRaw;
    }
    expect(await monthOf(u.userId)).toBe('2024-01-01');
    await new Promise((r) => setTimeout(r, 20));
    const hit = logs.map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => l.code === 'activity_touch_failed');
    expect(hit.length).toBeGreaterThanOrEqual(1);
    expect(hit.at(-1)!.failures).toEqual(expect.any(Number));
    await as(u.d, http().get('/api/v1/creature')).expect(200);
    expect(await monthOf(u.userId)).toBe(thisMonth());
  });

  it('인증 없는 길(삭제 영수증 조회·/m)은 활동이 아니다 — 토큰 없는 요청은 401이고 값은 그대로', async () => {
    const u = await user();
    await setMonth(u.userId, '2024-01-01');
    await http().get('/api/v1/deletion/AAAA-AAAA-AAAA-AAAA').set('x-forwarded-for', u.d.ip);
    await http().get(`/m/${u.code}`).set('x-forwarded-for', `1.1.1.1, 10.201.0.1, 35.0.0.1`);
    await http().get('/api/v1/creature').set('x-forwarded-for', u.d.ip).expect(401);
    expect(await monthOf(u.userId)).toBe('2024-01-01');
    await setMonth(u.userId, thisMonth());
  });
});

// ───────────── ② 정리 잡 ─────────────

describe('2년 미사용 정리 — 경계(UTC 월)', () => {
  it('23개월 남짓은 남기고 24개월 지난 것만: 2024-10 활동은 2026-10-31T23:59:59Z에 남고 2026-11-01T00:00:00Z에 지워진다', async () => {
    await drainAt('2026-11-11T12:00:00Z');
    const oct = await user(); // 마지막 활동 2024-10(최대 10-31) → 2026-11-01부터 2년 경과
    const nov = await user(); // 2024-11(최대 11-30) → 2026-11-11에는 23개월 11일 남짓 → 남김
    const nullOld = await user(); // 값 없음 → 만든 달로
    const nullNew = await user();
    await setMonth(oct.userId, '2024-10-01');
    await setMonth(nov.userId, '2024-11-01');
    await setMonth(nullOld.userId, null);
    await setMonth(nullNew.userId, null);
    await prisma.$executeRaw`UPDATE app.users SET created_at = '2024-10-31T23:00:00Z' WHERE id = ${nullOld.userId}::uuid`;
    await prisma.$executeRaw`UPDATE app.users SET created_at = '2024-11-01T00:00:00Z' WHERE id = ${nullNew.userId}::uuid`;

    at('2026-10-31T23:59:59Z');
    expect(await sweep.run()).toMatchObject({ inactiveDeleted: 0, skipped: 0, failed: 0, more: false, candidates: 0, halted: null });
    expect(await exists(oct.userId)).toBe(true);

    at('2026-11-01T00:00:00Z');
    expect(await sweep.run()).toEqual({ inactiveDeleted: 2, skipped: 0, failed: 0, more: false, candidates: 2, halted: null });
    expect(await exists(oct.userId)).toBe(false);
    expect(await exists(nullOld.userId)).toBe(false);
    expect(await exists(nov.userId)).toBe(true);
    expect(await exists(nullNew.userId)).toBe(true);

    at('2026-11-30T23:59:59Z');
    expect((await sweep.run()).inactiveDeleted).toBe(0);
    at('2026-12-01T00:00:00Z');
    expect((await sweep.run()).inactiveDeleted).toBe(2);
    expect(await exists(nov.userId)).toBe(false);
  });
});

describe('2년 미사용 정리 — 삭제 연쇄 흔적 0', () => {
  it('공개 링크(세 버킷)·세이브·이력·link_daily·되찾기로 끊긴 옛 기기까지: 모든 표·버킷·Auth 사용자 0, deletion_log는 kind=inactive 개수만', async () => {
    await drainAt(new Date(realNow()).toISOString());
    clock.now = realNow;
    const u = await user();
    await as(u.d, http().put('/api/v1/saves/main')).set('if-none-match', '*').send({ body: saveBody(1), clientSavedAt: '2026-11-20T10:00:00.000Z' }).expect(200);
    await as(u.d, http().put('/api/v1/saves/main')).set('if-match', '1').send({ body: saveBody(2), clientSavedAt: '2026-11-20T10:00:00.000Z' }).expect(200);
    await publish(u.d);
    await http().post(`/m/${u.code}/seen`).set('x-forwarded-for', '1.1.1.1, 10.202.0.1, 35.0.0.1').expect(204);
    // 되찾기: 새 기기로 옮김 → 옛 sub는 revoked(30일 대기 중) — 정리가 두 sub 모두 Auth에서 지워야 한다
    const phrase = (await as(u.d, http().post('/api/v1/recovery-code')).expect(200)).body.code as string;
    const fresh = await device();
    ids.push(fresh.sub);
    await as(fresh, http().post('/api/v1/recover')).send({ code: phrase, ageGate: { v: 2, ok: true } }).expect(200);
    const c = await prisma.creature.findUniqueOrThrow({ where: { userId: u.userId }, include: { page: true } });
    const storeKey = c.page!.storeKey;
    expect(await filesUnder(storeKey)).not.toEqual([]);
    expect(await prisma.saveVersion.count({ where: { creatureId: c.id } })).toBeGreaterThan(0);
    expect(sb.users.has(u.d.sub) && sb.users.has(fresh.sub)).toBe(true);
    const needles = [u.userId, u.d.sub, fresh.sub, u.code, c.id, storeKey];
    expect(Object.keys(await traces(needles)).length).toBeGreaterThanOrEqual(5);

    await setMonth(u.userId, '2020-01-01');
    const logsBefore = await prisma.deletionLog.count({ where: { kind: 'inactive' } });
    cdn.calls = 0;
    const r = await sweep.run();
    expect(r).toMatchObject({ inactiveDeleted: 1, failed: 0, halted: null });

    expect(await traces(needles)).toEqual({});
    expect(await filesUnder(storeKey)).toEqual([]);
    expect(sb.users.has(u.d.sub)).toBe(false);
    expect(sb.users.has(fresh.sub)).toBe(false);
    expect((await http().get(`/m/${u.code}`).set('x-forwarded-for', '1.1.1.1, 10.203.0.1, 35.0.0.1').expect(200)).text).toContain('data-state="gone"');
    const log = await prisma.deletionLog.findFirstOrThrow({ where: { kind: 'inactive' }, orderBy: { id: 'desc' } });
    expect(await prisma.deletionLog.count({ where: { kind: 'inactive' } })).toBe(logsBefore + 1);
    expect(log.channel).toBe('app');
    expect(log.completedAt).not.toBeNull();
    expect(Object.keys(log.items as object).sort()).toEqual(['files', 'logins', 'saves', 'versions']);
    expect(log.items).toMatchObject({ saves: 1, logins: 2 });
  });
});

describe('2년 미사용 정리 — 차단기(M2)', () => {
  it('① 하루 대상이 min(1%, 200)을 넘으면 한 명도 지우지 않고 멈춘다 → 운영자 confirm(같은 수)일 때만 진행, 200명 상한·more로 잇는다', async () => {
    await drainAt(new Date(realNow()).toISOString());
    clock.now = realNow;
    const made = await oldUsers(201);
    const tripped = await sweep.run();
    expect(tripped).toEqual({ inactiveDeleted: 0, skipped: 0, failed: 0, more: false, candidates: 201, halted: 'limit' });
    expect(await prisma.user.count({ where: { id: { in: made } } })).toBe(201);
    // 틀린(낡은) 확인 수는 통과하지 못한다
    expect((await sweep.run({ confirm: 200 })).halted).toBe('limit');
    expect(await sweep.run({ confirm: 201 })).toMatchObject({ inactiveDeleted: 200, failed: 0, more: true, halted: null });
    // 남은 1명은 하루 상한 안 → 확인 없이 진행
    expect(await sweep.run()).toMatchObject({ inactiveDeleted: 1, more: false, halted: null });
    expect(await prisma.user.count({ where: { id: { in: made } } })).toBe(0);
    await new Promise((r) => setTimeout(r, 20));
    const trip = logs.map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => l.code === 'inactive_sweep_tripped');
    expect(trip.at(-1)).toMatchObject({ level: 'error', candidates: 201 });
  });

  it('② 서버 시계가 DB 최신 활동 달보다 2달 넘게 앞서면(시계가 튐·갱신이 통째로 멈춤) 멈춘다 — confirm도 넘지 못한다', async () => {
    const [row] = await prisma.$queryRaw<{ latest: Date }[]>`SELECT max(last_active_month) AS latest FROM app.users`;
    const latest = row!.latest;
    const ahead3 = new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth() + 3, 1)).toISOString();
    const ahead2 = new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth() + 2, 28)).toISOString();
    const victim = (await oldUsers(1))[0]!;
    at(ahead3);
    const r = await sweep.run({ confirm: await sweep.candidateCount() });
    expect(r).toMatchObject({ inactiveDeleted: 0, halted: 'clock' });
    expect(await exists(victim)).toBe(true);
    // 2달 앞까지는 정상(월초 직후엔 최신 달이 지난달일 수 있다)
    at(ahead2);
    expect((await sweep.run({ confirm: await sweep.candidateCount() })).halted).toBeNull();
    expect(await exists(victim)).toBe(false);
  });
});

describe('2년 미사용 정리 — 시간 예산·경합·실패(M3·L1·L3)', () => {
  it('시간 예산을 넘기면 한 명을 처리한 뒤 more=true로 마친다(다음 날 잇기)', async () => {
    await drainAt(new Date(realNow()).toISOString());
    clock.now = realNow;
    const made = await oldUsers(3);
    sweep.budgetMs = 1;
    const orig = deletion.deleteUser.bind(deletion);
    deletion.deleteUser = async (id, s) => {
      await new Promise((r) => setTimeout(r, 30));
      return orig(id, s);
    };
    try {
      expect(await sweep.run()).toMatchObject({ inactiveDeleted: 1, more: true, halted: null });
    } finally {
      deletion.deleteUser = orig;
      sweep.budgetMs = 60_000;
    }
    expect(await prisma.user.count({ where: { id: { in: made } } })).toBe(2);
    await sweep.run();
    expect(await prisma.user.count({ where: { id: { in: made } } })).toBe(0);
  });

  it('L1: 두 실행이 겹쳐도(재시도·수동) 먼저 지운 쪽만 세고 나머지는 skipped — failed 0', async () => {
    await drainAt(new Date(realNow()).toISOString());
    clock.now = realNow;
    const made = await oldUsers(4);
    const [a, b] = await Promise.all([sweep.run(), sweep.run()]);
    expect(a.failed + b.failed).toBe(0);
    expect(a.inactiveDeleted + b.inactiveDeleted).toBe(4);
    expect(a.skipped + b.skipped).toBe(a.candidates + b.candidates - 4);
    expect(await prisma.user.count({ where: { id: { in: made } } })).toBe(0);
  });

  it('후보로 뽑힌 뒤 활동했으면 잠근 행에서 다시 보고 건너뛴다(지우지 않음)', async () => {
    const u = await user(); // 이달 활동
    const before = new Date(Date.UTC(2025, 0, 1));
    await expect(deletion.deleteUser(u.userId, { channel: 'app', kind: 'inactive', activeBefore: before })).rejects.toMatchObject({ name: 'InactiveSkipped' });
    expect(await exists(u.userId)).toBe(true);
    expect(sb.users.has(u.d.sub)).toBe(true);
  });

  it('한 사용자 삭제가 실패해도 나머지는 지우고 failed로 센다(error `inactive_sweep_failed`) — 실패한 사용자는 다음 실행이 다시', async () => {
    await drainAt(new Date(realNow()).toISOString());
    clock.now = realNow;
    const a = await user();
    const b = await user();
    await setMonth(a.userId, '2020-01-01');
    await setMonth(b.userId, '2020-01-01');
    const orig = deletion.deleteUser.bind(deletion);
    deletion.deleteUser = (id, s) => (id === a.userId ? Promise.reject(new Error('잠깐 실패')) : orig(id, s));
    try {
      expect(await sweep.run()).toMatchObject({ inactiveDeleted: 1, failed: 1 });
    } finally {
      deletion.deleteUser = orig;
    }
    await new Promise((r) => setTimeout(r, 20));
    const codes = logs.map((l) => JSON.parse(l) as Record<string, unknown>).map((l) => l.code);
    expect(codes).toContain('inactive_sweep_failed');
    expect(await exists(a.userId)).toBe(true);
    expect(await sweep.run()).toMatchObject({ inactiveDeleted: 1, failed: 0 });
    expect(await exists(a.userId)).toBe(false);
  });

  it('cron 경로는 B2 OIDC 그대로 — 토큰 없으면 storage-gc·inactive-sweep 모두 404(정리가 돌지 않음)', async () => {
    const u = await user();
    await setMonth(u.userId, '2020-01-01');
    for (const job of ['storage-gc', 'inactive-sweep']) {
      await cron(job).expect(404);
      await cron(job).set('authorization', 'Bearer x.y.z').expect(404);
    }
    expect(await exists(u.userId)).toBe(true);
    await sweep.run();
  });
});

describe('매일 storage-gc = 대기열 + 2년 정리(PM 11-25) — 독립·하루 1회·500은 대기열만(M3)', () => {
  beforeEach(resetDaily);

  it('storage-gc 한 번이 대기열 처리와 2년 정리를 모두 한다(응답 {gc, inactive}), 수동 inactive-sweep은 정리만', async () => {
    await drainAt(new Date(realNow()).toISOString());
    clock.now = realNow;
    const u = await user();
    await setMonth(u.userId, '2020-01-01');
    // 공유 시험 DB의 대기열 순번에 기대지 않게, 대기열 처리가 실제로 불렸는지를 센다(실제 runDue는 그대로 돈다)
    const calls = spyGc();
    try {
      await withCronAuth(async () => {
        const r = (await cron('storage-gc').expect(200)).body;
        expect(Object.keys(r).sort()).toEqual(['gc', 'inactive']);
        expect(Object.keys(r.gc).sort()).toEqual(['authDone', 'authFailed', 'deletionsCompleted', 'revokedQueued', 'storageDone', 'storageFailed']);
        expect(r.inactive).toMatchObject({ inactiveDeleted: 1, failed: 0, more: false, halted: null });
        expect(calls.n).toBe(1);
        expect(Object.keys((await cron('inactive-sweep').expect(200)).body).sort()).toEqual(['candidates', 'failed', 'halted', 'inactiveDeleted', 'more', 'skipped']);
        expect(calls.n).toBe(1);
      });
    } finally {
      calls.restore();
    }
    expect(await exists(u.userId)).toBe(false);
  });

  it('하루 1회: 같은 날 재시도(storage-gc 두 번째)는 정리를 다시 하지 않고(already_ran), 다음 날 잇는다 — 기록 행은 개수만', async () => {
    await drainAt(new Date(realNow()).toISOString());
    clock.now = realNow;
    await withCronAuth(async () => {
      const first = await oldUsers(1);
      expect((await cron('storage-gc').expect(200)).body.inactive).toMatchObject({ inactiveDeleted: 1, halted: null });
      expect(await exists(first[0]!)).toBe(false);
      const second = await oldUsers(1);
      expect((await cron('storage-gc').expect(200)).body.inactive).toMatchObject({ inactiveDeleted: 0, halted: 'already_ran' });
      expect(await exists(second[0]!)).toBe(true);
      const state = await prisma.inactiveSweepState.findUniqueOrThrow({ where: { id: 1 } });
      expect(state).toMatchObject({ deleted: 1, failed: 0, halted: null });
      expect(state.finishedAt).not.toBeNull();
      const next = realNow() + 86_400_000;
      clock.now = () => next;
      expect((await cron('storage-gc').expect(200)).body.inactive).toMatchObject({ inactiveDeleted: 1, halted: null });
      expect(await exists(second[0]!)).toBe(false);
    });
  });

  it('대기열 처리가 던져도 2년 정리는 돈다 — 500(Scheduler 재시도 대상은 대기열)', async () => {
    await drainAt(new Date(realNow()).toISOString());
    clock.now = realNow;
    const u = await user();
    await setMonth(u.userId, '2020-01-01');
    const orig = gc.runDue.bind(gc);
    gc.runDue = () => Promise.reject(new Error('대기열 실패'));
    try {
      await withCronAuth(async () => {
        await cron('storage-gc').expect(500);
        // 재시도가 와도 정리는 오늘 이미 돌았다
        const u2 = await oldUsers(1);
        await cron('storage-gc').expect(500);
        expect(await exists(u2[0]!)).toBe(true);
        await sweep.run();
      });
    } finally {
      gc.runDue = orig;
    }
    expect(await exists(u.userId)).toBe(false);
  });

  it('2년 정리가 던져도 대기열 처리는 돌고 응답은 200(정리 실패는 error 로그 + 다음 날)', async () => {
    const calls = spyGc();
    const orig = sweep.runDaily.bind(sweep);
    sweep.runDaily = () => Promise.reject(new Error('정리 실패'));
    try {
      await withCronAuth(async () => {
        const r = (await cron('storage-gc').expect(200)).body;
        expect(r.inactive).toBeNull();
        expect(r.gc).not.toBeNull();
      });
    } finally {
      sweep.runDaily = orig;
      calls.restore();
    }
    expect(calls.n).toBe(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(logs.map((l) => JSON.parse(l) as Record<string, unknown>).some((l) => l.code === 'cron_inactive_failed' && l.level === 'error')).toBe(true);
  });
});

describe('로그 — 식별 값 0', () => {
  it('이 파일의 모든 요청·정리 뒤 로그 어디에도 user id·sub·인장 코드가 없고, 정리 로그는 개수만', async () => {
    await new Promise((r) => setTimeout(r, 50));
    const all = logs.join('\n');
    expect(ids.length).toBeGreaterThan(30);
    for (const v of ids) expect(all, v).not.toContain(v);
    for (const v of filler.slice(0, 50)) expect(all, v).not.toContain(v);
    const sweepLogs = logs.map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => 'inactive' in l);
    expect(sweepLogs.length).toBeGreaterThan(3);
    for (const l of sweepLogs) expect(Object.keys(l.inactive as object).sort()).toEqual(['candidates', 'failed', 'halted', 'inactiveDeleted', 'more', 'skipped']);
  });
});
