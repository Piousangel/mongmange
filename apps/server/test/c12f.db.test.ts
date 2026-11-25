// C12f '맡긴 것 보기'(처리방침 12절 열람 요구) — GET /api/v1/me/data. 실제 Postgres + 실제 JWT 검사 경로 e2e.
// 그럴듯한 오답 판별(OPERATING 8-1):
//  - 세이브·이력 본문, 이름(링크 메타 name), 글귀(해시 포함)·sub·userId·sha가 응답 어디에든 실리면 실패(유저 글자 노출 0)
//  - 남의 몽망이·남의 이력이 보이면 실패 / 크기가 서버에 실제로 보관된 압축 바이트와 다르면 실패
//  - 토큰 없음 401 unauthorized, 맡긴 적 없는 로그인 401 no_account, 옮겨 간 옛 기기 410 moved — 갈래가 섞이면 실패
//  - 사용자당 시간 한도(MY_DATA_PER_HOUR)를 넘겨도 계속 주면 실패 / 요청 로그에 sub·인장 코드·userId가 남으면 실패
import 'reflect-metadata';
import { Writable } from 'node:stream';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sim } from '@mong/core';
import { MY_DATA_PER_HOUR, myDataSchema } from '@mong/contract';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { logSink } from '../src/common/logging';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SERVICE_KEY, startFakeSupabase, type FakeSupabase } from './fake-supabase';

const lines: string[] = [];
let app: NestFastifyApplication;
let prisma: PrismaService;
let sb: FakeSupabase;

beforeAll(async () => {
  sb = await startFakeSupabase();
  logSink.stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(...String(chunk).split('\n').filter(Boolean));
      cb();
    },
  });
  Object.assign(process.env, {
    LOG_LEVEL: 'info',
    SUPABASE_URL: sb.url,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    TRUSTED_PROXY_HOPS_API: '1',
    TRUSTED_PROXY_HOPS_WEB: '2',
  });
  const { createApp } = await import('../src/app.factory');
  const { PrismaService } = await import('../src/prisma/prisma.service');
  app = await createApp({ bufferLogs: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  prisma = app.get(PrismaService);
});
afterAll(async () => {
  await app?.close();
  await sb?.close();
  logSink.stream = undefined;
});

const http = () => request(app.getHttpServer());
const T0 = Date.UTC(2026, 10, 20, 10);
const gate = { v: 2, ok: true };
let ipSeq = 0;
interface Device {
  sub: string;
  token: string;
  ip: string;
}
async function device(): Promise<Device> {
  const { sub, token } = await sb.signIn();
  ipSeq++;
  return { sub, token, ip: `10.77.${ipSeq & 255}.9` };
}
const as = (d: Device, r: request.Test) => r.set('authorization', `Bearer ${d.token}`).set('x-forwarded-for', d.ip);
const body = (i: number, seed = 5) => sim.serializeState(sim.createInitial(T0, -540, seed), T0 + i * 1000);
const NAME = '몽이름표시안됨';

async function userWithData(seed: number) {
  const d = await device();
  const boot = await as(d, http().post('/api/v1/me/bootstrap')).send({ ageGate: gate }).expect(200);
  const userId = boot.body.userId as string;
  const code = boot.body.creature.code as string;
  const b1 = body(1, seed);
  const b2 = body(2, seed);
  await as(d, http().put('/api/v1/saves/main')).set('if-none-match', '*').send({ body: b1, clientSavedAt: '2026-11-20T10:00:00.000Z' }).expect(200);
  await as(d, http().put('/api/v1/saves/main')).set('if-match', '1').send({ body: b2, clientSavedAt: '2026-11-20T11:00:00.000Z' }).expect(200);
  await as(d, http().post('/api/v1/saves/main/conflicts')).send({ body: body(3, seed), clientSavedAt: '2026-11-20T12:00:00.000Z' }).expect(201);
  await as(d, http().post('/api/v1/recovery-code')).expect(200);
  // 링크 페이지 행(이름이 실린 메타) — 응답에 이름 글자가 새는지 보려고 직접 넣는다
  const c = await prisma.creature.findUniqueOrThrow({ where: { userId } });
  await prisma.publicPage.create({ data: { creatureId: c.id, ver: 1, state: 'live', pathPrefix: 'p/test', meta: { snap: 1, name: NAME, lang: 'ko' }, nameShown: true, publishedAt: new Date(T0) } });
  return { d, userId, code, creatureId: c.id, bodies: [b1, b2] };
}

describe('GET /me/data — 맡긴 것 보기(C12f)', () => {
  it('본인 메타만: 몽망이 1, 세이브 크기 = 서버 보관 압축 바이트, 이력 2벌(weekly·conflict), 글귀는 있음/없음만', async () => {
    const a = await userWithData(5);
    const b = await userWithData(6);
    const r = await as(a.d, http().get('/api/v1/me/data')).expect(200);
    expect(r.headers['cache-control']).toBe('no-store');
    const parsed = myDataSchema.safeParse(r.body);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    const v = parsed.data!;
    expect(v.creatures).toBe(1);
    expect(v.creature?.code).toBe(a.code);
    expect(v.creature?.recoveryCodeSet).toBe(true);
    expect(v.creature?.link).toEqual({ enabled: false, nameVisible: false, nameShown: true, pageState: 'live', publishedAt: new Date(T0).toISOString() });
    const [saveRow] = await prisma.$queryRaw<{ bytes: number; updated_at: Date }[]>`
      SELECT octet_length(body)::int AS bytes, updated_at FROM app.saves WHERE creature_id = ${a.creatureId}::uuid`;
    expect(v.save).toMatchObject({ rev: 2, bytes: saveRow!.bytes, lastSavedAt: saveRow!.updated_at.toISOString(), clientSavedAt: '2026-11-20T11:00:00.000Z', validated: true });
    expect(v.save!.bytes).toBeGreaterThan(0);
    const vrows = await prisma.$queryRaw<{ reason: string; bytes: number }[]>`
      SELECT reason::text AS reason, octet_length(body)::int AS bytes FROM app.save_versions WHERE creature_id = ${a.creatureId}::uuid ORDER BY created_at DESC, id DESC`;
    expect(v.versions.map((x) => [x.reason, x.bytes])).toEqual(vrows.map((x) => [x.reason, x.bytes]));
    expect(v.versions.map((x) => x.reason).sort()).toEqual(['conflict', 'weekly']);
    expect(v.account.logins).toBe(1);
    expect(v.account.movedLogins).toBe(0);
    expect(v.account.ageGateVersion).toBe(2);
    expect(v.account.lastActiveMonth).toMatch(/^\d{4}-\d{2}$/);
    // 유저 글자·식별자 노출 0: 본문·이름·sub·userId·남의 인장 코드가 응답 문자열 어디에도 없다
    const raw = JSON.stringify(r.body);
    for (const [n, s] of Object.entries({ name: NAME, sub: a.d.sub, userId: a.userId, otherCode: b.code, body1: a.bodies[0]!.slice(0, 30), body2: a.bodies[1]!.slice(0, 30), token: a.d.token })) {
      expect(raw, `${n}가 응답에 있음`).not.toContain(s);
    }
    // 남의 것: b는 b의 인장 코드만
    const rb = await as(b.d, http().get('/api/v1/me/data')).expect(200);
    expect(rb.body.creature.code).toBe(b.code);
  });

  it('맡긴 세이브가 없는 계정: creature는 있고 save null, versions 빈 배열, 글귀 아직 없음', async () => {
    const d = await device();
    await as(d, http().post('/api/v1/me/bootstrap')).send({ ageGate: gate }).expect(200);
    const r = await as(d, http().get('/api/v1/me/data')).expect(200);
    expect(myDataSchema.safeParse(r.body).success).toBe(true);
    expect(r.body.save).toBeNull();
    expect(r.body.versions).toEqual([]);
    expect(r.body.creature.recoveryCodeSet).toBe(false);
    expect(r.body.creature.link).toEqual({ enabled: false, nameVisible: false, nameShown: false, pageState: null, publishedAt: null });
  });

  it('갈래: 토큰 없음 401 unauthorized · 맡긴 적 없는 로그인 401 no_account · 옮겨 간 옛 기기 410 moved', async () => {
    const none = await http().get('/api/v1/me/data').set('x-forwarded-for', '10.78.0.1');
    expect(none.status).toBe(401);
    expect(none.body.error.code).toBe('unauthorized');
    const fresh = await device();
    const na = await as(fresh, http().get('/api/v1/me/data'));
    expect(na.status).toBe(401);
    expect(na.body.error.code).toBe('no_account');
    expect(na.headers['cache-control']).toBe('no-store');
    // 되찾기로 옮겨 감
    const a = await device();
    await as(a, http().post('/api/v1/me/bootstrap')).send({ ageGate: gate }).expect(200);
    const phrase = (await as(a, http().post('/api/v1/recovery-code')).expect(200)).body.code as string;
    const b = await device();
    await as(b, http().post('/api/v1/recover')).send({ code: phrase, ageGate: gate }).expect(200);
    const moved = await as(a, http().get('/api/v1/me/data'));
    expect(moved.status).toBe(410);
    expect(moved.body.error.code).toBe('moved');
    const nb = await as(b, http().get('/api/v1/me/data')).expect(200);
    expect(nb.body.account.logins).toBe(1);
    expect(nb.body.account.movedLogins).toBe(1);
  });

  it('지운 뒤에는 401 no_account(흔적 0 — 지운 사용자를 알아보지 않는다)', async () => {
    const d = await device();
    await as(d, http().post('/api/v1/me/bootstrap')).send({ ageGate: gate }).expect(200);
    await as(d, http().delete('/api/v1/me')).expect(202);
    const r = await as(d, http().get('/api/v1/me/data'));
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('no_account');
  });

  it(`사용자당 시간 ${MY_DATA_PER_HOUR}번 뒤 429 rate_limited — 다른 사용자는 그대로`, async () => {
    const a = await device();
    await as(a, http().post('/api/v1/me/bootstrap')).send({ ageGate: gate }).expect(200);
    const b = await device();
    await as(b, http().post('/api/v1/me/bootstrap')).send({ ageGate: gate }).expect(200);
    for (let i = 0; i < MY_DATA_PER_HOUR; i++) {
      // 전역 IP 분당 한도에 닿지 않게 요청마다 다른 IP 접두
      a.ip = `10.79.${i}.1`;
      await as(a, http().get('/api/v1/me/data')).expect(200);
    }
    a.ip = '10.79.200.1';
    const over = await as(a, http().get('/api/v1/me/data'));
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('rate_limited');
    await as(b, http().get('/api/v1/me/data')).expect(200);
  });

  it('요청 로그: route는 템플릿, sub·인장 코드·userId·토큰 0건', async () => {
    const a = await userWithData(9);
    lines.length = 0;
    await as(a.d, http().get('/api/v1/me/data')).expect(200);
    await new Promise((ok) => setTimeout(ok, 30));
    const all = lines.join('\n');
    const routes = lines.map((l) => JSON.parse(l) as { req?: { route: string | null } }).filter((o) => o.req).map((o) => o.req!.route);
    expect(routes).toContain('/api/v1/me/data');
    for (const [n, s] of Object.entries({ sub: a.d.sub, code: a.code, userId: a.userId, token: a.d.token, ip: a.d.ip, name: NAME })) {
      expect(all, `${n}가 로그에 있음`).not.toContain(s);
    }
  });
});
