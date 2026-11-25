// B2 맡겨 두기 — 실제 Postgres + 실제 JWT 검사 경로(로컬 JWKS·Auth Admin 자리 서버) e2e.
// architecture.md v2.2 3-4-1 'B2 e2e 필수' 1~9 + 그럴듯한 오답 판별(OPERATING 8-1):
//  - 두 기기 동시 PUT이 둘 다 성공하면 실패(하나는 409) / 남의 이력이 보이면 실패 / 28일 지난 이력이 남으면 실패(처리방침 '최대 4주')
//  - 삭제 뒤 어떤 표에든 그 사용자·기기·몽망이·코드의 흔적이 남으면 실패 / 되찾은 뒤 옛 기기가 계속 쓰면 실패
// DATABASE_URL은 밖에서(로컬 compose db, CI 서비스 컨테이너). 마이그레이션이 먼저 돌아 있어야 한다.
import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SCHEMA_VERSION, sim } from '@mong/core';
import { normalizeRecoveryCode, SAVE_DAILY_GZIP_BYTES } from '@mong/contract';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Clock } from '../src/common/clock';
import type { GcService } from '../src/deletion/gc.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SERVICE_KEY, startFakeSupabase, type FakeSupabase } from './fake-supabase';

let app: NestFastifyApplication;
let prisma: PrismaService;
let sb: FakeSupabase;
let clock: Clock;
let gc: GcService;
const DAY = 86_400_000;

beforeAll(async () => {
  sb = await startFakeSupabase();
  Object.assign(process.env, {
    SUPABASE_URL: sb.url,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    TRUSTED_PROXY_HOPS_API: '1',
    TRUSTED_PROXY_HOPS_WEB: '2',
    WEB_ORIGIN: 'https://mongmang.ink',
  });
  const { createApp } = await import('../src/app.factory');
  const { Clock } = await import('../src/common/clock');
  const { GcService } = await import('../src/deletion/gc.service');
  const { PrismaService } = await import('../src/prisma/prisma.service');
  app = await createApp({ bufferLogs: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  prisma = app.get(PrismaService);
  clock = app.get(Clock);
  gc = app.get(GcService);
});
afterAll(async () => {
  await app?.close();
  await sb?.close();
});

// ───────────── 도구 ─────────────

const http = () => request(app.getHttpServer());
let ipSeq = 0;
const T0 = Date.UTC(2026, 10, 20, 10);

interface Device {
  sub: string;
  token: string;
  ip: string;
}
async function device(): Promise<Device> {
  const { sub, token } = await sb.signIn();
  ipSeq++;
  return { sub, token, ip: `10.${(ipSeq >> 8) & 255}.${ipSeq & 255}.7` };
}
const as = (d: Device, r: request.Test) => r.set('authorization', `Bearer ${d.token}`).set('x-forwarded-for', d.ip);
const gate = { v: 2, ok: true };

async function boot(d: Device): Promise<{ userId: string; code: string }> {
  const r = await as(d, http().post('/api/v1/me/bootstrap')).send({ ageGate: gate }).expect(200);
  return { userId: r.body.userId, code: r.body.creature.code };
}
/** 서로 다른 세이브 본문(i가 다르면 savedAt이 달라 sha가 다르다) */
const body = (i: number, seed = 3) => sim.serializeState(sim.createInitial(T0, -540, seed), T0 + i * 1000);
const savedAt = '2026-11-20T10:00:00.000Z';
function put(d: Device, b: string, pre: { ifMatch?: number; none?: true }, extra: Record<string, unknown> = {}) {
  let r = as(d, http().put('/api/v1/saves/main'));
  if (pre.none) r = r.set('if-none-match', '*');
  if (pre.ifMatch !== undefined) r = r.set('if-match', String(pre.ifMatch));
  return r.send({ body: b, clientSavedAt: savedAt, ...extra });
}
async function versionsOf(userId: string) {
  const c = await prisma.creature.findUniqueOrThrow({ where: { userId } });
  const rows = await prisma.saveVersion.findMany({ where: { creatureId: c.id }, orderBy: { id: 'asc' } });
  const by = (r: string) => rows.filter((v) => v.reason === r).length;
  return { rows, weekly: by('weekly'), overwritten: by('overwritten'), conflict: by('conflict'), pre_restore: by('pre_restore') };
}
const statuses = (rs: Array<{ status: number }>) => rs.map((r) => r.status).sort();

/**
 * 동시성 시험을 결정적으로: 트랜잭션 안에서 saves 행을 읽은 직후 150ms 멈춘다. 행 잠금(FOR UPDATE)이 있으면 둘째 요청은
 * 첫째가 끝날 때까지 읽기에서 기다려 새 rev를 보고, 잠금이 없으면 둘 다 옛 rev를 읽는다 — '잠금 없이도 통과'하는 시험을 막는다.
 */
async function withSlowSaveReads<T>(fn: () => Promise<T>): Promise<T> {
  const orig = prisma.$transaction.bind(prisma);
  const slow = (tx: Record<string, unknown>) =>
    new Proxy(tx, {
      get(t, k) {
        const v = t[k as string];
        if (k !== '$queryRawUnsafe' || typeof v !== 'function') return v;
        return async (...a: unknown[]) => {
          const r = await (v as (...x: unknown[]) => Promise<unknown>).apply(t, a);
          if (typeof a[0] === 'string' && a[0].includes('FROM app.saves')) await new Promise((ok) => setTimeout(ok, 150));
          return r;
        };
      },
    });
  (prisma as unknown as { $transaction: unknown }).$transaction = (f: (tx: unknown) => unknown, o?: unknown) =>
    orig((tx) => f(slow(tx as unknown as Record<string, unknown>)) as Promise<unknown>, o as never);
  try {
    return await fn();
  } finally {
    (prisma as unknown as { $transaction: unknown }).$transaction = orig;
  }
}

/** 사용자 하나: 기기 + bootstrap + 첫 PUT(rev 1) */
async function userWithSave(): Promise<{ d: Device; userId: string; code: string }> {
  const d = await device();
  const u = await boot(d);
  expect((await put(d, body(0), { none: true }).expect(200)).body).toEqual({ rev: 1, sha: expect.stringMatching(/^[0-9a-f]{64}$/) });
  return { d, ...u };
}
async function putN(d: Device, from: number, n: number): Promise<number> {
  let rev = 1;
  for (let i = 0; i < n; i++) rev = (await put(d, body(from + i), { ifMatch: rev }).expect(200)).body.rev;
  return rev;
}

// ───────────── 계정·연령 ─────────────

describe('bootstrap — 필요할 때 익명 계정 + 14세 확인', () => {
  it('ageGate 없음·미달·태어난 해 동봉은 400, 통과면 계정 + 몽망이(인장 코드 8자)', async () => {
    const d = await device();
    await as(d, http().post('/api/v1/me/bootstrap')).send({}).expect(400);
    await as(d, http().post('/api/v1/me/bootstrap')).send({ ageGate: { v: 2, ok: false } }).expect(400);
    await as(d, http().post('/api/v1/me/bootstrap')).send({ ageGate: { ...gate, birthYear: 2008 } }).expect(400);
    const u = await boot(d);
    expect(u.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    // 최소 수집: 연령은 판 번호와 통과 날짜만(5-3) — 태어난 해·달·나이·locale 칸 값이 없다
    const row = await prisma.user.findUniqueOrThrow({ where: { id: u.userId } });
    expect(row.ageGateV).toBe(2);
    expect(row.ageConfirmedOn?.toISOString()).toMatch(/T00:00:00\.000Z$/);
    expect(row.locale).toBeNull();
    const cols = await prisma.$queryRaw<{ column_name: string }[]>`
      select column_name from information_schema.columns where table_schema = 'app' and table_name = 'users' order by 1`;
    // delete_requested_at(B5): 운영자가 확인한 삭제 요청 시각 — 사용자 행과 함께 지워진다(5분 안 처리)
    expect(cols.map((c) => c.column_name)).toEqual(['age_confirmed_on', 'age_gate_v', 'created_at', 'delete_requested_at', 'id', 'last_active_month', 'locale']);
  });
  it('멱등: 두 번·동시에 불러도 몽망이 하나', async () => {
    const d = await device();
    const [a, b] = await Promise.all([
      as(d, http().post('/api/v1/me/bootstrap')).send({ ageGate: gate }),
      as(d, http().post('/api/v1/me/bootstrap')).send({ ageGate: gate }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body).toEqual(b.body);
    expect(await prisma.creature.count({ where: { userId: a.body.userId } })).toBe(1);
  });
  it('auth.users에 없는 sub(삭제된 계정의 남은 토큰)는 401 — 계정이 되살아나지 않는다', async () => {
    const d = await device();
    sb.users.delete(d.sub);
    await as(d, http().post('/api/v1/me/bootstrap')).send({ ageGate: gate }).expect(401);
    expect(await prisma.userAuth.count({ where: { sub: d.sub } })).toBe(0);
  });
  it('bootstrap 전에는 다른 JWT API가 401(계정은 필요할 때만)', async () => {
    const d = await device();
    await as(d, http().get('/api/v1/saves/main/meta')).expect(401);
    await put(d, body(0), { none: true }).expect(401);
    await as(d, http().post('/api/v1/recovery-code')).expect(401);
  });
  it('토큰 없음·형식 틀림은 401', async () => {
    await http().get('/api/v1/saves/main').expect(401);
    await http().get('/api/v1/saves/main').set('authorization', 'Bearer x.y').expect(401);
    await http().get('/api/v1/saves/main').set('authorization', 'Basic abc').expect(401);
  });
  it('새 계정은 IP 접두당 5/시간 — 여섯째는 429, 다른 IP는 통과', async () => {
    const ip = '10.250.250.1';
    for (let i = 0; i < 5; i++) {
      const d = { ...(await device()), ip };
      await as(d, http().post('/api/v1/me/bootstrap')).send({ ageGate: gate }).expect(200);
    }
    const sixth = { ...(await device()), ip };
    const r = await as(sixth, http().post('/api/v1/me/bootstrap')).send({ ageGate: gate }).expect(429);
    expect(r.body.error.code).toBe('rate_limited');
    await boot(await device());
  });
});

// ───────────── 세이브 ─────────────

describe('세이브 PUT·조회(3-4)', () => {
  it('첫 PUT → rev 1, meta·본문이 그대로 돌아온다(서버는 gzip 보관)', async () => {
    const { d, userId } = await userWithSave();
    const meta = (await as(d, http().get('/api/v1/saves/main/meta')).expect(200)).body;
    expect(meta).toMatchObject({ rev: 1, envelopeVer: SCHEMA_VERSION, simVer: sim.SIM_SCHEMA_VERSION, validated: true, dayIndex: 0, strokesTotal: 0 });
    const full = (await as(d, http().get('/api/v1/saves/main')).expect(200)).body;
    expect(full.body).toBe(body(0));
    expect(full.sha).toBe(meta.sha);
    const c = await prisma.creature.findUniqueOrThrow({ where: { userId } });
    const s = await prisma.save.findUniqueOrThrow({ where: { creatureId: c.id } });
    expect(Buffer.from(s.body).subarray(0, 2).toString('hex')).toBe('1f8b'); // gzip
  });
  it('맡긴 적 없으면 meta·본문 404', async () => {
    const d = await device();
    await boot(d);
    const r = await as(d, http().get('/api/v1/saves/main/meta')).expect(404);
    expect(r.body.error.code).toBe('no_save');
  });
  it('If-Match·If-None-Match 둘 다 없으면 428, 둘 다면 400', async () => {
    const { d } = await userWithSave();
    await as(d, http().put('/api/v1/saves/main')).send({ body: body(1), clientSavedAt: savedAt }).expect(428);
    await as(d, http().put('/api/v1/saves/main')).set('if-match', '1').set('if-none-match', '*').send({ body: body(1), clientSavedAt: savedAt }).expect(400);
  });
  it('e2e 1: 같은 주 PUT 5번 → weekly 1 + overwritten 3', async () => {
    const { d, userId } = await userWithSave();
    await putN(d, 1, 4);
    const v = await versionsOf(userId);
    expect([v.weekly, v.overwritten, v.conflict, v.pre_restore]).toEqual([1, 3, 0, 0]);
    // 이력 목록: 본문 없이 최신순, id는 uuid(순번이 아님)
    const list = (await as(d, http().get('/api/v1/saves/main/versions')).expect(200)).body as Array<Record<string, unknown>>;
    expect(list).toHaveLength(4);
    for (const it of list) {
      expect(it.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(it).not.toHaveProperty('body');
    }
  });
  it('e2e 2: 최대 4주 — 29일 뒤 솎기에 overwritten·weekly 0벌(현재본만), conflict는 30일 경계(29일 남음·31일 삭제)', async () => {
    const { d, userId } = await userWithSave();
    await putN(d, 1, 4);
    await as(d, http().post('/api/v1/saves/main/conflicts')).send({ body: body(99), clientSavedAt: savedAt }).expect(201);
    const now = clock.now();
    const prune = async (days: number) =>
      (await prisma.$queryRaw<{ n: number }[]>`select app.prune_save_versions(${new Date(now + days * DAY)}) as n`)[0]!.n;
    await prune(27);
    expect(await versionsOf(userId)).toMatchObject({ weekly: 1, overwritten: 3, conflict: 1 });
    await prune(29);
    expect(await versionsOf(userId)).toMatchObject({ weekly: 0, overwritten: 0, conflict: 1 });
    await prune(31);
    expect(await versionsOf(userId)).toMatchObject({ weekly: 0, overwritten: 0, conflict: 0 });
    await as(d, http().get('/api/v1/saves/main/meta')).expect(200);
  });
  it('주가 바뀌면 그 주의 weekly가 새로 생긴다(주마다 1벌, 서버 UTC ISO 주)', async () => {
    const real = clock.now.bind(clock);
    try {
      const { d, userId } = await userWithSave();
      let rev = await putN(d, 1, 2);
      clock.now = () => real() + 7 * DAY;
      rev = (await put(d, body(10), { ifMatch: rev }).expect(200)).body.rev;
      clock.now = () => real() + 14 * DAY;
      await put(d, body(11), { ifMatch: rev }).expect(200);
      const v = await versionsOf(userId);
      expect(v.weekly).toBe(3);
      expect(new Set(v.rows.filter((r) => r.reason === 'weekly').map((r) => r.isoWeek)).size).toBe(3);
    } finally {
      clock.now = real;
    }
  });
  it('PUT 안 두 번째 겹(리뷰 I2): weekly는 최신 4벌, 28일 지난 일반 이력은 pg_cron 없이도 다음 PUT에서 사라진다', async () => {
    const real = clock.now.bind(clock);
    try {
      const { d, userId } = await userWithSave();
      // 일요일에서 시작하면 22일 안에 ISO 주 다섯 개(일·월·월·월·월) — 개수 상한 4가 기간 상한보다 먼저 걸리는 경우
      const sunday = Date.UTC(2026, 10, 22, 12);
      let rev = 1;
      for (const day of [0, 1, 8, 15, 22]) {
        clock.now = () => sunday + day * DAY;
        rev = (await put(d, body(100 + day), { ifMatch: rev }).expect(200)).body.rev;
      }
      expect((await versionsOf(userId)).weekly).toBe(4);
      // 그 뒤 올리지 않다가 29일 뒤 한 번 올리면 — 솎기 함수를 부르지 않아도 28일 넘은 일반 이력은 0
      const last = sunday + 22 * DAY;
      clock.now = () => last + 29 * DAY;
      await put(d, body(200), { ifMatch: rev }).expect(200);
      const v = await versionsOf(userId);
      expect(v.rows.filter((r) => r.createdAt.getTime() < last + DAY)).toEqual([]);
      expect(v.weekly).toBe(1);
    } finally {
      clock.now = real;
    }
  });
  it('e2e 3: 두 기기 동시 PUT(같은 If-Match) → 하나 200·하나 409, weekly 1벌', async () => {
    const { d, userId } = await userWithSave();
    const rs = await withSlowSaveReads(() => Promise.all([put(d, body(1), { ifMatch: 1 }), put(d, body(2), { ifMatch: 1 })]));
    expect(statuses(rs)).toEqual([200, 409]);
    const lost = rs.find((r) => r.status === 409)!;
    expect(lost.body.error.code).toBe('save_conflict');
    expect(lost.body.error.details.server.rev).toBe(2);
    const v = await versionsOf(userId);
    expect([v.weekly, v.overwritten]).toEqual([1, 0]);
  });
  it('e2e 4: 첫 PUT 동시 둘 — 500 없이, 같은 본이면 둘 다 200, 다른 본이면 200·409', async () => {
    const same = await device();
    await boot(same);
    const a = await withSlowSaveReads(() => Promise.all([put(same, body(5), { none: true }), put(same, body(5), { none: true })]));
    expect(statuses(a)).toEqual([200, 200]);
    const diff = await device();
    await boot(diff);
    const b = await withSlowSaveReads(() => Promise.all([put(diff, body(5), { none: true }), put(diff, body(6), { none: true })]));
    expect(statuses(b)).toEqual([200, 409]);
  });
  it('e2e 5: 반쯤 성공 재전송(같은 본·옛 If-Match) → 200 빨리 감기, 행 없음 + If-Match → 409 server:null', async () => {
    const { d } = await userWithSave();
    const ok = await put(d, body(1), { ifMatch: 1 }).expect(200);
    const again = await put(d, body(1), { ifMatch: 1 }).expect(200);
    expect(again.body).toEqual(ok.body);
    const fresh = await device();
    await boot(fresh);
    const r = await put(fresh, body(1), { ifMatch: 3 }).expect(409);
    expect(r.body.error.details).toEqual({ server: null });
  });
  it('e2e 6a: keep_mine → 덮인 서버 본이 conflict, 일반 이력으로 가지 않음', async () => {
    const { d, userId } = await userWithSave();
    const r = await put(d, body(2), { ifMatch: 1 }, { resolve: 'keep_mine' }).expect(200);
    expect(r.body.rev).toBe(2);
    const v = await versionsOf(userId);
    expect([v.conflict, v.weekly, v.overwritten]).toEqual([1, 0, 0]);
    expect(v.rows[0]!.rev).toBe(1);
  });
  it('e2e 6b: conflicts 4번 → 3벌(가장 오래된 것부터), 맡긴 본이 없으면 404', async () => {
    const { d, userId } = await userWithSave();
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push((await as(d, http().post('/api/v1/saves/main/conflicts')).send({ body: body(20 + i), clientSavedAt: savedAt }).expect(201)).body.id);
    const v = await versionsOf(userId);
    expect(v.conflict).toBe(3);
    expect(v.rows.map((r) => r.publicId)).not.toContain(ids[0]);
    const none = await device();
    await boot(none);
    await as(none, http().post('/api/v1/saves/main/conflicts')).send({ body: body(1), clientSavedAt: savedAt }).expect(404);
  });
  it('e2e 6c: restore — 현재본은 pre_restore, 고른 본이 새 현재본(rev+1). 동시 restore 둘은 200·409, 상한 3', async () => {
    const { d, userId } = await userWithSave();
    let rev = await putN(d, 1, 3);
    const list = (await as(d, http().get('/api/v1/saves/main/versions')).expect(200)).body as Array<{ id: string; rev: number }>;
    const pick = list.find((x) => x.rev === 1)!;
    const both = await withSlowSaveReads(() =>
      Promise.all([
        as(d, http().post(`/api/v1/saves/main/versions/${pick.id}/restore`)).set('if-match', String(rev)),
        as(d, http().post(`/api/v1/saves/main/versions/${pick.id}/restore`)).set('if-match', String(rev)),
      ]),
    );
    expect(statuses(both)).toEqual([200, 409]);
    rev++;
    const full = (await as(d, http().get('/api/v1/saves/main')).expect(200)).body;
    expect(full.body).toBe(body(0));
    expect(full.rev).toBe(rev);
    for (let i = 0; i < 4; i++) {
      rev = (await as(d, http().post(`/api/v1/saves/main/versions/${pick.id}/restore`)).set('if-match', String(rev)).expect(200)).body.rev;
    }
    expect((await versionsOf(userId)).pre_restore).toBe(3);
    // 고른 이력 행은 지우지 않는다
    await as(d, http().get(`/api/v1/saves/main/versions/${pick.id}`)).expect(200);
  });
  it('e2e 7: 남의 public_id로 GET versions/{id}·restore → 404, 내 것은 200', async () => {
    const a = await userWithSave();
    await putN(a.d, 1, 1);
    const [mine] = (await as(a.d, http().get('/api/v1/saves/main/versions')).expect(200)).body as Array<{ id: string }>;
    const b = await userWithSave();
    await as(b.d, http().get(`/api/v1/saves/main/versions/${mine!.id}`)).expect(404);
    await as(b.d, http().post(`/api/v1/saves/main/versions/${mine!.id}/restore`)).set('if-match', '1').expect(404);
    await as(b.d, http().get('/api/v1/saves/main/versions/123')).expect(404);
    const got = (await as(a.d, http().get(`/api/v1/saves/main/versions/${mine!.id}`)).expect(200)).body;
    expect(got.body).toBe(body(0));
    // b의 현재본은 그대로
    expect((await as(b.d, http().get('/api/v1/saves/main/meta')).expect(200)).body.rev).toBe(1);
  });
  it('e2e 8: gzip 256KB 넘는 본 413, sim +2 본 422, +1 본 200 validated:false(원문만, 날 세기 null)', async () => {
    const { d } = await userWithSave();
    const fut = JSON.parse(body(1)) as { schemaVersion: number; sim: { version: number } };
    fut.schemaVersion = SCHEMA_VERSION + 1;
    // 미래 판은 JSON·필수 키만 보므로 쓰레기를 실을 수 있다 — 압축되지 않는 400KB는 413
    const junk = JSON.stringify({ ...fut, pad: randomBytes(300 * 1024).toString('base64') });
    expect(Buffer.byteLength(junk)).toBeLessThan(512 * 1024);
    expect((await put(d, junk, { ifMatch: 1 }).expect(413)).body.error.code).toBe('save_too_large');
    const far = JSON.parse(body(2)) as typeof fut;
    far.sim.version = sim.SIM_SCHEMA_VERSION + 2;
    const r422 = await put(d, JSON.stringify(far), { ifMatch: 1 }).expect(422);
    expect(r422.body.error.details.reason).toBe('future_too_far');
    const ok = await put(d, JSON.stringify(fut), { ifMatch: 1 }).expect(200);
    const meta = (await as(d, http().get('/api/v1/saves/main/meta')).expect(200)).body;
    expect(meta).toMatchObject({ rev: ok.body.rev, validated: false, envelopeVer: SCHEMA_VERSION + 1, dayIndex: null, strokesTotal: null });
    // 512KB 넘는 본·깨진 본
    await put(d, 'x'.repeat(513 * 1024), { ifMatch: 2 }).expect(413);
    expect((await put(d, '{"sim":{"version":1}}', { ifMatch: 2 }).expect(422)).body.error.code).toBe('save_invalid');
  });
  it('하루 4MB(압축 뒤) 상한 → 429 save_quota, 다음 날(UTC)은 다시', async () => {
    const real = clock.now.bind(clock);
    try {
      const { d, userId } = await userWithSave();
      const c = await prisma.creature.findUniqueOrThrow({ where: { userId } });
      const today = new Date(`${new Date(real()).toISOString().slice(0, 10)}T00:00:00Z`);
      await prisma.save.update({ where: { creatureId: c.id }, data: { quotaDay: today, quotaBytes: SAVE_DAILY_GZIP_BYTES - 10 } });
      expect((await put(d, body(1), { ifMatch: 1 }).expect(429)).body.error.code).toBe('save_quota');
      expect((await as(d, http().post('/api/v1/saves/main/conflicts')).send({ body: body(2), clientSavedAt: savedAt }).expect(429)).body.error.code).toBe('save_quota');
      clock.now = () => real() + DAY;
      await put(d, body(1), { ifMatch: 1 }).expect(200);
    } finally {
      clock.now = real;
    }
  });
  it('PUT은 이달 활동만 월 단위로 남긴다(last_active_month = 그달 1일)', async () => {
    const { userId } = await userWithSave();
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.lastActiveMonth?.toISOString()).toMatch(/-01T00:00:00\.000Z$/);
  });
});

// ───────────── 되찾기 ─────────────

describe('되찾기 글귀(3-3 ⑤) — bootstrap 없이 새 기기 세션을 기존 사용자에 연결', () => {
  async function withCode() {
    const u = await userWithSave();
    const phrase = (await as(u.d, http().post('/api/v1/recovery-code')).expect(200)).body.code as string;
    return { ...u, phrase };
  }

  it('새 기기: recover → 같은 몽망이·세이브 메타·새 글귀, 옛 기기는 410, 옛 글귀는 무효', async () => {
    const old = await withCode();
    expect(old.phrase).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    const fresh = await device();
    // 옮겨 적은 꼴(소문자·공백)도 같은 글귀
    const typed = old.phrase.toLowerCase().replace(/-/g, ' ');
    const r = await as(fresh, http().post('/api/v1/recover')).send({ code: typed, ageGate: gate }).expect(200);
    expect(r.body.creature.code).toBe(old.code);
    expect(r.body.save).toMatchObject({ rev: 1 });
    expect(r.body.newCode).not.toBe(old.phrase);
    // 새 기기는 bootstrap 없이 바로 세이브를 받는다(빈 몽망이가 생기지 않음)
    expect((await as(fresh, http().get('/api/v1/saves/main')).expect(200)).body.body).toBe(body(0));
    expect(await prisma.creature.count({ where: { userId: old.userId } })).toBe(1);
    // 옛 기기 → 410 moved
    const gone = await put(old.d, body(1), { ifMatch: 1 }).expect(410);
    expect(gone.body.error.code).toBe('moved');
    await as(old.d, http().post('/api/v1/me/bootstrap')).send({ ageGate: gate }).expect(410);
    // 옛 글귀 무효, 새 글귀로는 다음 기기가 되찾는다
    await as(await device(), http().post('/api/v1/recover')).send({ code: old.phrase, ageGate: gate }).expect(404);
    await as(await device(), http().post('/api/v1/recover')).send({ code: r.body.newCode, ageGate: gate }).expect(200);
    // 쓰는 기기는 하나
    expect(await prisma.userAuth.count({ where: { userId: old.userId, revokedAt: null } })).toBe(1);
  });
  it('pepper 회전(B2 리뷰 m1): 옛 판으로 저장된 글귀도 찾고, 되찾으면 새 글귀는 지금 판으로 — 옛 판을 빼면 옛 글귀는 404', async () => {
    const { RecoveryPepper } = await import('../src/account/recovery-pepper');
    const pep = app.get(RecoveryPepper);
    const orig = { current: pep.current, previous: pep.previous };
    const p1 = { v: 1, value: 'pepper-one-'.padEnd(40, '1') };
    const p2 = { v: 2, value: 'pepper-two-'.padEnd(40, '2') };
    try {
      pep.configure(p1, []);
      const a = await withCode();
      const b = await withCode();
      pep.configure(p2, [p1]); // 회전: 지금 판 2, 옛 판 1을 함께 대 본다
      const r = await as(await device(), http().post('/api/v1/recover')).send({ code: a.phrase, ageGate: gate }).expect(200);
      const ca = await prisma.creature.findUniqueOrThrow({ where: { userId: a.userId } });
      expect(ca.recoveryPepperV).toBe(2);
      pep.configure(p2, []); // 옛 판을 너무 일찍 빼면 아직 안 바뀐 b의 글귀는 찾지 못한다 — 절차가 '옛 판 행 0개 뒤에 뺀다'인 까닭
      await as(await device(), http().post('/api/v1/recover')).send({ code: b.phrase, ageGate: gate }).expect(404);
      await as(await device(), http().post('/api/v1/recover')).send({ code: r.body.newCode, ageGate: gate }).expect(200);
    } finally {
      pep.configure(orig.current, orig.previous);
    }
  });
  it('글귀는 해시로만 — 어떤 표에도 평문(정규·보이는 꼴)이 없다', async () => {
    const u = await withCode();
    const norm = normalizeRecoveryCode(u.phrase)!;
    for (const t of await appTables()) {
      const [n] = await prisma.$queryRawUnsafe<{ n: number }[]>(
        `select count(*)::int as n from app."${t}" x where x::text like $1 or x::text like $2`,
        `%${u.phrase}%`,
        `%${norm}%`,
      );
      expect({ t, n: n!.n }).toEqual({ t, n: 0 });
    }
  });
  it('이 기기에 이미 몽망이가 있으면 409 has_creature, 틀린 글귀 404, 연령 확인 없으면 400', async () => {
    const owner = await withCode();
    const other = await device();
    await boot(other);
    expect((await as(other, http().post('/api/v1/recover')).send({ code: owner.phrase, ageGate: gate }).expect(409)).body.error.code).toBe('has_creature');
    await as(await device(), http().post('/api/v1/recover')).send({ code: '0000-0000-0000-0000', ageGate: gate }).expect(404);
    await as(await device(), http().post('/api/v1/recover')).send({ code: owner.phrase }).expect(400);
  });
  it('무차별 대입: IP 접두당 5/시간(틀린 시도도 센다), 글귀당 10/일(IP를 바꿔도)', async () => {
    const owner = await withCode();
    const ip = '10.251.0.1';
    for (let i = 0; i < 5; i++) await as({ ...(await device()), ip }, http().post('/api/v1/recover')).send({ code: `ZZZZ-ZZZZ-ZZZZ-ZZZ${i}`, ageGate: gate }).expect(404);
    await as({ ...(await device()), ip }, http().post('/api/v1/recover')).send({ code: owner.phrase, ageGate: gate }).expect(429);
    // 같은 글귀를 서로 다른 IP 열 곳에서(앞의 1회는 IP 한도에 막혀 세지지 않음)
    const target = await withCode();
    for (let i = 0; i < 10; i++) {
      const d = await device();
      await boot(d); // 이 기기엔 몽망이가 있어 409지만 시도로는 센다
      await as(d, http().post('/api/v1/recover')).send({ code: target.phrase, ageGate: gate }).expect(409);
    }
    await as(await device(), http().post('/api/v1/recover')).send({ code: target.phrase, ageGate: gate }).expect(429);
  });
  it('끊긴 옛 기기 로그인은 30일 뒤 Auth에서 지우고 행도 지운다(처리방침 6절 옛 계정 30일)', async () => {
    const real = clock.now.bind(clock);
    try {
      const old = await withCode();
      await as(await device(), http().post('/api/v1/recover')).send({ code: old.phrase, ageGate: gate }).expect(200);
      clock.now = () => real() + 29 * DAY;
      await gc.runDue();
      expect(sb.users.has(old.d.sub)).toBe(true);
      clock.now = () => real() + 31 * DAY;
      await gc.runDue();
      expect(sb.users.has(old.d.sub)).toBe(false);
      expect(await prisma.userAuth.count({ where: { sub: old.d.sub } })).toBe(0);
      expect(await prisma.authGc.count({ where: { sub: old.d.sub } })).toBe(0);
    } finally {
      clock.now = real;
    }
  });
});

// ───────────── 삭제 ─────────────

async function appTables(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ t: string }[]>`
    select table_name as t from information_schema.tables where table_schema = 'app' and table_type = 'BASE TABLE' order by 1`;
  return rows.map((r) => r.t);
}
/** 모든 app 표의 모든 행을 글자로 펴서 needle이 들어 있는 행 수 */
async function traces(needles: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of await appTables()) {
    for (const n of needles) {
      // 서명 업로드 꼬리 행(B6a 리뷰 H1)은 뺀다: 사람과 이어지지 않는 staging 판 폴더(무작위 키)만, 2시간 15분 뒤 스스로 지워진다 — b6a 시험이 따로 고정
      const tail = t === 'storage_gc' ? ` and not (x.reason = 'upload_tail' and x.creature_id is null and x.deletion_id is null)` : '';
      const [r] = await prisma.$queryRawUnsafe<{ n: number }[]>(`select count(*)::int as n from app."${t}" x where x::text ilike $1${tail}`, `%${n}%`);
      if (r!.n) out[`${t}:${n}`] = r!.n;
    }
  }
  return out;
}

describe('DELETE /me — 연쇄 삭제·영수증(3-8)', () => {
  it('삭제 뒤 모든 표에 사용자·기기(옛 기기 포함)·몽망이·인장 코드 흔적 0, Auth 사용자도 없음, 영수증 done', async () => {
    const u = await userWithSave();
    await putN(u.d, 1, 3);
    const code1 = (await as(u.d, http().post('/api/v1/recovery-code')).expect(200)).body.code as string;
    const d2 = await device();
    await as(d2, http().post('/api/v1/recover')).send({ code: code1, ageGate: gate }).expect(200); // 옛 sub는 revoked로 남아 있다
    await as(d2, http().post('/api/v1/saves/main/conflicts')).send({ body: body(50), clientSavedAt: savedAt }).expect(201);
    const c = await prisma.creature.findUniqueOrThrow({ where: { userId: u.userId } });
    const before = await traces([u.userId, u.d.sub, d2.sub, c.id, c.code]);
    expect(Object.keys(before).length).toBeGreaterThan(3); // 시험이 실제로 무언가를 찾는지(무력화 방지)

    const r = await as(d2, http().delete('/api/v1/me')).expect(202);
    expect(r.headers['cache-control']).toBe('no-store');
    const receipt = r.body.receipt as string;
    expect(receipt).toMatch(/^[A-Za-z0-9_-]{22}$/);

    expect(await traces([u.userId, u.d.sub, d2.sub, c.id, c.code])).toEqual({});
    expect(sb.users.has(u.d.sub)).toBe(false);
    expect(sb.users.has(d2.sub)).toBe(false);
    // 영수증: 인증 없이, 해시만 저장(평문 영수증은 어떤 표에도 없다)
    expect((await http().get(`/api/v1/deletion/${receipt}`).expect(200)).body).toEqual({ state: 'done' });
    expect(await traces([receipt])).toEqual({});
    // deletion_log에는 개수만
    const log = await prisma.deletionLog.findFirstOrThrow({ orderBy: { id: 'desc' } });
    expect(Object.keys(log.items as object).sort()).toEqual(['files', 'logins', 'saves', 'versions']);
    expect(log).toMatchObject({ channel: 'app', kind: 'user_request' });
  });
  it('e2e 9: 삭제 직후 옛 토큰으로 PUT·bootstrap → 401(되살아나지 않는다)', async () => {
    const u = await userWithSave();
    await as(u.d, http().delete('/api/v1/me')).expect(202);
    await put(u.d, body(1), { ifMatch: 1 }).expect(401);
    await as(u.d, http().get('/api/v1/saves/main')).expect(401);
    // Auth 삭제가 늦어도(아래 시험) bootstrap은 auth_gc를 보고 막는다
    await as(u.d, http().post('/api/v1/me/bootstrap')).send({ ageGate: gate }).expect(401);
    await as(u.d, http().delete('/api/v1/me')).expect(401);
  });
  it('Auth 삭제가 실패하면 pending → 그동안 남은 토큰으로 bootstrap 401 → Scheduler 재시도 뒤 done', async () => {
    const real = clock.now.bind(clock);
    try {
      const u = await userWithSave();
      sb.failDeletes = true;
      const { receipt } = (await as(u.d, http().delete('/api/v1/me')).expect(202)).body as { receipt: string };
      expect((await http().get(`/api/v1/deletion/${receipt}`).expect(200)).body).toEqual({ state: 'pending' });
      expect(sb.users.has(u.d.sub)).toBe(true);
      await as(u.d, http().post('/api/v1/me/bootstrap')).send({ ageGate: gate }).expect(401);
      expect(await prisma.user.count({ where: { id: u.userId } })).toBe(0);
      sb.failDeletes = false;
      clock.now = () => real() + 2 * 3_600_000;
      await gc.runDue();
      expect((await http().get(`/api/v1/deletion/${receipt}`).expect(200)).body).toEqual({ state: 'done' });
      expect(sb.users.has(u.d.sub)).toBe(false);
      expect(await traces([u.d.sub])).toEqual({});
    } finally {
      sb.failDeletes = false;
      clock.now = real;
    }
  });
  it('영수증은 24시간: 지나면 404, 만료 함수가 해시를 지운다. 모르는·형식 틀린 영수증 404', async () => {
    const real = clock.now.bind(clock);
    try {
      const u = await userWithSave();
      const { receipt } = (await as(u.d, http().delete('/api/v1/me')).expect(202)).body as { receipt: string };
      clock.now = () => real() + 25 * 3_600_000;
      await http().get(`/api/v1/deletion/${receipt}`).expect(404);
      await prisma.$queryRaw`select app.expire_deletion_log(${new Date(real() + 25 * 3_600_000)})`;
      expect(await prisma.deletionLog.count({ where: { receiptExpiresAt: { lt: new Date(real() + 25 * 3_600_000) } } })).toBe(0);
      await http().get(`/api/v1/deletion/${'A'.repeat(22)}`).expect(404);
      await http().get('/api/v1/deletion/short').expect(404);
    } finally {
      clock.now = real;
    }
  });
  it('백업 복원 뒤 되살아남(B2 리뷰 m2): 지운 사용자 HMAC(7일)으로 다시 지운다, 7일 뒤에는 표지도 사라진다', async () => {
    const { DeletionService } = await import('../src/deletion/deletion.service');
    const del = app.get(DeletionService);
    const real = clock.now.bind(clock);
    try {
      const u = await userWithSave();
      const c = await prisma.creature.findUniqueOrThrow({ where: { userId: u.userId } });
      await as(u.d, http().delete('/api/v1/me')).expect(202);
      const log = await prisma.deletionLog.findFirstOrThrow({ orderBy: { id: 'desc' } });
      expect(log.subjectHmac).not.toBeNull();
      expect(Buffer.from(log.subjectHmac!).toString('latin1')).not.toContain(u.userId);
      expect(log.subjectExpiresAt!.getTime() - log.requestedAt.getTime()).toBe(7 * DAY);
      // 복원 흉내: 백업 속 행이 돌아온다(사용자·기기 로그인·몽망이, Auth 사용자도)
      const restore = async () => {
        await prisma.user.create({ data: { id: u.userId, ageGateV: 2 } });
        await prisma.userAuth.create({ data: { sub: u.d.sub, userId: u.userId } });
        await prisma.creature.create({ data: { id: c.id, userId: u.userId, code: c.code } });
        sb.users.add(u.d.sub);
      };
      await restore();
      expect(await del.reapplyAfterRestore()).toEqual({ reapplied: 1 });
      expect(await prisma.user.count({ where: { id: u.userId } })).toBe(0);
      expect(sb.users.has(u.d.sub)).toBe(false);
      const again = await prisma.deletionLog.findFirstOrThrow({ where: { kind: 'restore_reapply' }, orderBy: { id: 'desc' } });
      // 8일 뒤: 만료 함수가 표지를 지우면 같은 복원이 와도 다시 지울 근거가 없다(보관 기간 = 백업 기간)
      await prisma.$queryRaw`select app.expire_deletion_log(${new Date(real() + 8 * DAY)})`;
      expect(await prisma.deletionLog.count({ where: { id: { in: [log.id, again.id] }, subjectHmac: { not: null } } })).toBe(0);
      clock.now = () => real() + 8 * DAY;
      await restore();
      expect(await del.reapplyAfterRestore()).toEqual({ reapplied: 0 });
      await prisma.user.delete({ where: { id: u.userId } });
    } finally {
      clock.now = real;
    }
  });
  it('웹 /delete 시도 한도(리뷰 I3): IP 접두당 5/시간 — 틀린 5번 뒤 맞는 쌍도 429', async () => {
    const u = await userWithSave();
    const phrase = (await as(u.d, http().post('/api/v1/recovery-code')).expect(200)).body.code as string;
    const ip = '10.253.0.1';
    const web = (b: object) => http().post('/api/v1/deletion/web').set('x-forwarded-for', ip).send(b);
    for (let i = 0; i < 5; i++) await web({ code: u.code, phrase: `ZZZZ-ZZZZ-ZZZZ-ZZZ${i}` }).expect(404);
    expect((await web({ code: u.code, phrase }).expect(429)).body.error.code).toBe('rate_limited');
    expect(await prisma.user.count({ where: { id: u.userId } })).toBe(1);
  });
  it('웹 /delete 시도 한도(리뷰 I3): 글귀당 10/일 — IP 열 곳에서 같은 글귀(틀린 코드)로 시도하면 열한째는 맞는 쌍도 429', async () => {
    const u = await userWithSave();
    const phrase = (await as(u.d, http().post('/api/v1/recovery-code')).expect(200)).body.code as string;
    const web = (b: object, n: number) => http().post('/api/v1/deletion/web').set('x-forwarded-for', `10.254.${n}.1`).send(b);
    for (let i = 0; i < 10; i++) await web({ code: 'ZZZZZZZZ', phrase }, i).expect(404);
    expect((await web({ code: u.code, phrase }, 99).expect(429)).body.error.code).toBe('rate_limited');
    expect(await prisma.user.count({ where: { id: u.userId } })).toBe(1);
  });
  it('웹 /delete: 인장 코드 + 글귀가 같은 몽망이일 때만(하나만 맞으면 404), CORS는 우리 웹 출처만', async () => {
    const u = await userWithSave();
    const phrase = (await as(u.d, http().post('/api/v1/recovery-code')).expect(200)).body.code as string;
    const other = await userWithSave();
    const otherPhrase = (await as(other.d, http().post('/api/v1/recovery-code')).expect(200)).body.code as string;
    const web = (b: object, origin = 'https://mongmang.ink') =>
      http().post('/api/v1/deletion/web').set('origin', origin).set('x-forwarded-for', `10.252.${ipSeq++ & 255}.1`).send(b);
    await web({ code: u.code }).expect(400);
    await web({ code: u.code, phrase: otherPhrase }).expect(404); // 코드만 맞음
    await web({ code: other.code, phrase }).expect(404); // 글귀만 맞음
    const pre = await http().options('/api/v1/deletion/web').set('origin', 'https://mongmang.ink').set('access-control-request-method', 'POST');
    expect(pre.status).toBe(204);
    expect(pre.headers['access-control-allow-origin']).toBe('https://mongmang.ink');
    const evil = await http().options('/api/v1/deletion/web').set('origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    const ok = await web({ code: u.code.toLowerCase(), phrase: phrase.toLowerCase() }).expect(202);
    expect(ok.headers['access-control-allow-origin']).toBe('https://mongmang.ink');
    expect(await prisma.user.count({ where: { id: u.userId } })).toBe(0);
    expect(await prisma.user.count({ where: { id: other.userId } })).toBe(1);
    const log = await prisma.deletionLog.findFirstOrThrow({ orderBy: { id: 'desc' } });
    expect(log).toMatchObject({ channel: 'web', kind: 'web_request' });
  });
});
