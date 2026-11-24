// B5 안전 장치 — 실제 Postgres + 실제 JWT 경로 + 로컬 파일 저장소 e2e. architecture.md v2.2 3-8 '신고 → 자동 숨김'·3-9·3-12·3-5-2 '이름 가리기',
// 처리방침 3-6·5·6절. 운영 SQL 스니펫(docs/ops/moderation/*.sql)은 **파일 그대로** 실행한다(자리표시 코드만 바꿔 넣음).
// 그럴듯한 오답 판별(OPERATING 8-1):
//  - 신고 DB·로그에 평문 IP가 있거나, 신고자 키에 코드·IP가 보이면 실패 / 7일 뒤 소금·신고자 키가 남으면 실패
//  - 같은 IP(같은 /64, UA만 바꿈, 하루 간격)의 반복 신고로 문턱을 넘으면 실패 / 대상이 다르면 같은 IP의 키가 같아지면 실패(소금 분리)
//  - 자동 숨김 뒤 HTML·OG·snap.json·포스터 중 하나라도 공개로 읽히면 실패 / 운영자 복원 뒤 원래 판으로 돌아오지 않으면 실패
//  - 이름 가리기 뒤 HTML·DB·공개 파일 어디든 이름이 남거나, 주인이 이름 공개를 다시 켤 수 있으면 실패
//  - 남의 사이트 폼(자동 제출)이 방문자 IP로 신고를 세면 실패
import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CdnPurgeQueue, CountingInvalidator } from '../src/cdn/cdn-purge';
import type { Clock } from '../src/common/clock';
import { logSink } from '../src/common/logging';
import type { ModerationService } from '../src/moderation/moderation.service';
import type { ReportService } from '../src/moderation/report.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { LocalObjectStore } from '../src/storage/local-store';
import { jpeg, mp4 } from './media-fixtures';
import { SERVICE_KEY, startFakeSupabase, type FakeSupabase } from './fake-supabase';

let app: NestFastifyApplication;
let prisma: PrismaService;
let sb: FakeSupabase;
let clock: Clock;
let store: LocalObjectStore;
let storeRoot: string;
let cdn: CountingInvalidator;
let purge: CdnPurgeQueue;
let moderation: ModerationService;
let reports: ReportService;
const logs: string[] = [];
const SITE = 'https://mongmang.ink';
const BASE = 'http://localhost:9998';
const SNAP_OK = JSON.parse(readFileSync(join(__dirname, '../../../packages/core/test/fixtures/snap/ok.json'), 'utf8')) as Record<string, unknown>;
const OPS = join(__dirname, '../../../docs/ops/moderation');
const DAY = 86_400_000;

beforeAll(async () => {
  logSink.stream = new Writable({
    write(chunk, _e, cb) {
      logs.push(...String(chunk).split('\n').filter(Boolean));
      cb();
    },
  });
  sb = await startFakeSupabase();
  storeRoot = mkdtempSync(join(tmpdir(), 'mong-b5-'));
  Object.assign(process.env, {
    SUPABASE_URL: sb.url,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    TRUSTED_PROXY_HOPS_API: '1',
    TRUSTED_PROXY_HOPS_WEB: '2',
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_DIR: storeRoot,
    STORAGE_LOCAL_BASE_URL: BASE,
    SITE_ORIGIN: SITE,
    APP_STORE_ID: '6739012345',
    LOG_LEVEL: 'info',
    RATE_LIMIT_PER_MIN: '10000',
  });
  const { createApp } = await import('../src/app.factory');
  const { Clock } = await import('../src/common/clock');
  const { PrismaService } = await import('../src/prisma/prisma.service');
  const { CDN_INVALIDATOR, CdnPurgeQueue } = await import('../src/cdn/cdn-purge');
  const { OBJECT_STORE } = await import('../src/storage/object-store');
  const { ModerationService } = await import('../src/moderation/moderation.service');
  const { ReportService } = await import('../src/moderation/report.service');
  app = await createApp({ bufferLogs: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  prisma = app.get(PrismaService);
  clock = app.get(Clock);
  store = app.get(OBJECT_STORE);
  cdn = app.get(CDN_INVALIDATOR);
  purge = app.get(CdnPurgeQueue);
  moderation = app.get(ModerationService);
  reports = app.get(ReportService);
  // 이 파일은 실제 시각으로 숨김을 여러 번 만든다 — 서비스 전체 1시간 차단기는 전용 시험에서만 낮춘다
  reports.autoHidePerHour = 1000;
});
afterAll(async () => {
  await app?.close();
  await sb?.close();
  logSink.stream = undefined;
});

// ───────────── 도구 ─────────────

const http = () => request(app.getHttpServer());
let seq = 0;
interface Device {
  token: string;
  ip: string;
}
async function user(): Promise<{ d: Device; userId: string; code: string }> {
  const { token } = await sb.signIn();
  seq++;
  const d = { token, ip: `10.${60 + ((seq >> 8) & 63)}.${seq & 255}.9` };
  const r = await as(d, http().post('/api/v1/me/bootstrap')).send({ ageGate: { v: 2, ok: true } }).expect(200);
  return { d, userId: r.body.userId, code: r.body.creature.code };
}
const as = (d: Device, r: request.Test) => r.set('authorization', `Bearer ${d.token}`).set('x-forwarded-for', d.ip);
const pathOf = (u: string) => {
  const x = new URL(u);
  return x.pathname + x.search;
};
/** OG 그림에 이름이 '그려진' 것처럼 이름 바이트를 채움 자리에 넣는다(앱이 이름을 그린 og.jpg 흉내) */
function ogWith(name: string): Buffer {
  const b = jpeg(1200, 630);
  Buffer.from(name, 'utf8').copy(b, 100);
  return b;
}
async function publish(d: Device, o: { nameVisible?: boolean; name?: string; og?: Buffer } = {}) {
  const put = await as(d, http().put('/api/v1/creature/page'))
    .send({
      snapshot: SNAP_OK,
      nameVisible: o.nameVisible ?? false,
      ...(o.name !== undefined ? { name: o.name } : {}),
      lang: 'ko',
      files: { poster: { contentType: 'image/jpeg', bytes: 5000 }, og: { contentType: 'image/jpeg', bytes: 5000 }, loop: { contentType: 'video/mp4', bytes: 5000 } },
    })
    .expect(200);
  const up = put.body.upload;
  await http().put(pathOf(up.poster.signedUrl)).set('content-type', 'image/jpeg').send(jpeg(1080, 1350)).expect(200);
  await http().put(pathOf(up.og.signedUrl)).set('content-type', 'image/jpeg').send(o.og ?? jpeg(1200, 630)).expect(200);
  await http().put(pathOf(up.loop.signedUrl)).set('content-type', 'video/mp4').send(mp4()).expect(200);
  await as(d, http().post(`/api/v1/creature/page/${put.body.ver}/commit`)).send().expect(200);
  return put;
}
async function pageOf(userId: string) {
  const c = await prisma.creature.findUniqueOrThrow({ where: { userId }, include: { page: true } });
  const p = c.page!;
  return { creature: c, page: p, dir: p.pathPrefix ? `${p.storeKey}/${p.pathPrefix}` : null };
}
/** /m 경로 요청(Firebase 경유 — XFF 오른쪽에서 둘째가 클라이언트) */
const viaWeb = (r: request.Test, client: string) => r.set('x-forwarded-for', `1.1.1.1, ${client}, 35.0.0.1`);
/** 웹 폼 신고 — 진짜 브라우저가 no-referrer 페이지에서 보내는 머리글 그대로(Sec-Fetch-Site same-origin + Origin null, B5 리뷰 C1) */
const reportForm = (code: string, client: string, reason = 'sexual', extra: Record<string, string> = {}) =>
  viaWeb(http().post(`/m/${code}/report`), client)
    .set('sec-fetch-site', 'same-origin')
    .set('origin', 'null')
    .set('user-agent', extra.ua ?? 'Mozilla/5.0')
    .type('form')
    .send(`reason=${reason}`);
/** 앱 신고(JSON, Origin 없음) */
const reportApp = (code: string, client: string, body: unknown = { reason: 'other' }) =>
  viaWeb(http().post(`/m/${code}/report`), client).set('content-type', 'application/json').send(JSON.stringify(body));
let ipN = 0;
/** 신고마다 다른 IPv4(리밋 5/시간에 걸리지 않게) */
const freshIp = () => {
  ipN++;
  return `203.0.${(ipN >> 8) & 255}.${ipN & 255}`;
};
async function reportsOf(code: string) {
  return prisma.report.findMany({ where: { targetKind: 'link', targetRef: code }, include: { hits: true }, orderBy: { id: 'asc' } });
}
const metaContent = (html: string, prop: string) => new RegExp(`<meta property="${prop}" content="([^"]*)">`).exec(html)?.[1];
async function readPublic(key: string): Promise<Buffer | null> {
  const r = await http()
    .get(pathOf(store.publicUrl(key)))
    .buffer(true)
    .parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
  return r.status === 200 ? (r.body as Buffer) : null;
}
async function resetPurge() {
  await prisma.cdnPurge.update({ where: { id: 1 }, data: { requestedAt: null, releasedAt: null, attempts: 0 } });
  cdn.calls = 0;
}
/** app 스키마 모든 표를 글자로 훑는다(행 전체 ::text) */
async function traces(needles: string[]): Promise<Record<string, number>> {
  const rows = await prisma.$queryRaw<{ t: string }[]>`
    select table_name as t from information_schema.tables where table_schema = 'app' and table_type = 'BASE TABLE' order by 1`;
  const out: Record<string, number> = {};
  for (const { t } of rows) {
    for (const n of needles) {
      const [r] = await prisma.$queryRawUnsafe<{ n: number }[]>(`select count(*)::int as n from app."${t}" x where x::text ilike $1`, `%${n}%`);
      if (r!.n) out[`${t}:${n}`] = r!.n;
    }
  }
  return out;
}
/** 로컬 저장소 세 버킷 모든 파일 바이트에서 needle 찾기 */
function filesContaining(needle: string): string[] {
  const hit: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (readFileSync(p).includes(Buffer.from(needle, 'utf8'))) hit.push(p.slice(storeRoot.length));
    }
  };
  walk(storeRoot);
  return hit;
}
/** 운영 스니펫을 파일 그대로 실행 — 자리표시 코드 '________'만 바꿔 넣는다 */
async function snippet<T = unknown>(file: string, code?: string): Promise<T[]> {
  let sql = readFileSync(join(OPS, file), 'utf8');
  if (code !== undefined) {
    expect(sql).toContain("'________'");
    sql = sql.replaceAll("'________'", `'${code}'`);
  }
  return prisma.$queryRawUnsafe<T[]>(sql);
}
const randomName = () => Array.from({ length: 3 }, () => String.fromCharCode(0xac00 + Math.floor(Math.random() * 11172))).join('');
async function withClock<T>(offsetMs: number, fn: () => Promise<T>): Promise<T> {
  const real = clock.now.bind(clock);
  const t = real() + offsetMs;
  clock.now = () => t;
  try {
    return await fn();
  } finally {
    clock.now = real;
  }
}
/** 셋이 신고해 자동 숨김까지 */
async function hideByReports(code: string): Promise<void> {
  for (let i = 0; i < 3; i++) await reportForm(code, freshIp()).expect(303);
}

// ───────────── 신고 경로 ─────────────

describe('신고 POST /m/{code}/report — 인증 없음, 사유 코드만, 같은 출처만', () => {
  it('웹 폼 → 303 감사 페이지(값 없음·no-store), 앱 JSON → 204. 대상이 없어도 응답은 같다', async () => {
    const u = await user();
    await publish(u.d);
    const r = await reportForm(u.code, freshIp()).expect(303);
    expect(r.headers.location).toBe(`/m/${u.code}/report`);
    expect(r.headers['cache-control']).toBe('no-store');
    const t = await viaWeb(http().get(`/m/${u.code}/report`), freshIp()).expect(200);
    expect(t.headers['cache-control']).toBe('no-store');
    expect(t.text).toContain('data-state="reported"');
    expect(t.text).not.toContain(u.code);
    expect(t.headers['content-security-policy']).toContain("form-action 'none'");
    expect((await reportApp(u.code, freshIp()).expect(204)).headers['cache-control']).toBe('no-store');
    // 없는 코드·꺼진 링크도 같은 모양(대상이 있는지 알리지 않는다), 행은 생기지 않는다
    expect((await reportForm('ZZZZZZZZ', freshIp()).expect(303)).headers.location).toBe('/m/ZZZZZZZZ/report');
    await reportApp('ZZZZZZZZ', freshIp()).expect(204);
    expect(await reportsOf('ZZZZZZZZ')).toEqual([]);
    const [rep] = await reportsOf(u.code);
    expect(rep).toMatchObject({ status: 'open', distinctReporters: 2, reasonCounts: { sexual: 1, other: 1 } });
    expect(rep!.salt).toHaveLength(32);
    expect(rep!.windowEndsAt.getTime() - rep!.createdAt.getTime()).toBe(7 * DAY);
  });

  it('같은 출처 판정: Sec-Fetch-Site가 있으면 same-origin만, 없으면 Origin = 사이트(null 거부) — 남의 사이트 자동 제출은 세지 않는다', async () => {
    const u = await user();
    await publish(u.d);
    const post = (h: Record<string, string>, json = false) => {
      const r = viaWeb(http().post(`/m/${u.code}/report`), freshIp()).set(h);
      return json ? r.set('content-type', 'application/json').send('{"reason":"sexual"}') : r.type('form').send('reason=sexual');
    };
    // 현대 브라우저: Sec-Fetch-Site가 1차(Origin이 사이트여도 cross-site·same-site면 거부)
    await post({ 'sec-fetch-site': 'cross-site', origin: SITE }).expect(403);
    await post({ 'sec-fetch-site': 'same-site', origin: 'https://evil.mongmang.ink' }).expect(403);
    await post({ 'sec-fetch-site': 'none' }).expect(403);
    await post({ 'sec-fetch-site': 'cross-site' }, true).expect(403);
    // 옛 브라우저(Sec-Fetch-Site 없음): Origin이 사이트면 통과, null·다른 출처·없음(폼)은 거부
    await post({ origin: 'null' }).expect(403);
    await post({ origin: 'https://evil.example' }).expect(403);
    await post({}).expect(403);
    await post({ origin: 'https://evil.example' }, true).expect(403);
    expect(await reportsOf(u.code)).toEqual([]);
    await post({ origin: SITE }).expect(303);
    await post({ 'sec-fetch-site': 'same-origin', origin: 'null' }).expect(303);
    expect((await reportsOf(u.code))[0]!.distinctReporters).toBe(2);
  });

  it('자유 글·모르는 사유는 400, text/plain은 415. 폼 본문은 이 경로에서만 읽는다(다른 API에 폼을 보내면 415)', async () => {
    const u = await user();
    await publish(u.d);
    await reportForm(u.code, freshIp(), '%EC%9A%95%EC%84%A4').expect(400);
    await reportApp(u.code, freshIp(), { reason: 'other', text: '자유 글' }).expect(400);
    await reportApp(u.code, freshIp(), { reason: 'spam' }).expect(400);
    await viaWeb(http().post(`/m/${u.code}/report`), freshIp()).set('origin', SITE).set('content-type', 'text/plain').send('reason=other').expect(415);
    expect(await reportsOf(u.code)).toEqual([]);
    await http().post('/api/v1/deletion/web').set('origin', SITE).type('form').send(`code=${u.code}&phrase=x`).expect(415);
  });

  it('IP 접두당 5/시간: 6번째 429 no-store — 넘친 요청은 DB를 치지 않는다', async () => {
    const u = await user();
    await publish(u.d);
    const ip = freshIp();
    for (let i = 0; i < 5; i++) await reportForm(u.code, ip).expect(303);
    const tx = vi.spyOn(prisma, '$transaction');
    const q = vi.spyOn(prisma, '$queryRaw');
    try {
      const r = await reportForm(u.code, ip).expect(429);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(tx).not.toHaveBeenCalled();
      expect(q).not.toHaveBeenCalled();
    } finally {
      tx.mockRestore();
      q.mockRestore();
    }
  });
});

describe('신고 DB — 평문 IP 0, 대상별 소금, IPv6 /64, 같은 사람은 1', () => {
  it('신고자 키 = HMAC(그 대상의 소금, IP 접두). 평문 IP는 어떤 표에도·로그에도 없다, 신고자 키에 코드도 없다', async () => {
    const u = await user();
    await publish(u.d);
    const ip = '198.51.100.77';
    await reportForm(u.code, ip).expect(303);
    const [rep] = await reportsOf(u.code);
    expect(rep!.hits).toHaveLength(1);
    expect(Buffer.from(rep!.hits[0]!.reporterKey)).toEqual(createHmac('sha256', rep!.salt!).update(ip).digest());
    // IP를 글자·16진(4바이트)으로 찾는다
    const hex = Buffer.from(ip.split('.').map(Number)).toString('hex');
    expect(await traces([ip, hex, '198.51.100'])).toEqual({});
    expect(logs.filter((l) => l.includes(ip) || l.includes(u.code))).toEqual([]);
    const hitText = Buffer.from(rep!.hits[0]!.reporterKey).toString('latin1');
    expect(hitText).not.toContain(u.code);
    expect(hitText).not.toContain(ip);
  });

  it('같은 IP 다섯 번·UA만 바꿈·같은 /48의 다른 /64·IPv4 매핑 주소는 모두 한 사람 — 문턱을 넘지 못한다', async () => {
    const u = await user();
    await publish(u.d);
    await reportForm(u.code, '192.0.2.10', 'sexual', { ua: 'A' }).expect(303);
    await reportForm(u.code, '192.0.2.10', 'hate', { ua: 'B' }).expect(303);
    await reportApp(u.code, '::ffff:192.0.2.10').expect(204);
    await reportForm(u.code, '2001:db8:aa:bb::1').expect(303);
    await reportForm(u.code, '2001:db8:aa:bb:ffff:1:2:3').expect(303);
    // 같은 /48의 다른 /64(VPS가 통째로 주는 범위 — B5 리뷰 H2)
    await reportForm(u.code, '2001:db8:aa:cc::1').expect(303);
    await reportForm(u.code, '2001:db8:aa:ffff::2').expect(303);
    // 하루 뒤 같은 IP(소금이 날마다 바뀌지 않는다)
    await withClock(DAY, () => reportForm(u.code, '2001:db8:aa:bb::99').expect(303).then(() => undefined));
    const [rep] = await reportsOf(u.code);
    expect(rep).toMatchObject({ status: 'open', distinctReporters: 2 });
    expect(rep!.hits).toHaveLength(2);
    expect((await pageOf(u.userId)).page.state).toBe('live');
  });

  it('대상이 다르면 같은 IP의 키가 다르다 — 대상끼리 신고자를 잇지 못한다(소금 분리)', async () => {
    const a = await user();
    const b = await user();
    await publish(a.d);
    await publish(b.d);
    const ip = '192.0.2.200';
    await reportForm(a.code, ip).expect(303);
    await reportForm(b.code, ip).expect(303);
    const [ra] = await reportsOf(a.code);
    const [rb] = await reportsOf(b.code);
    expect(Buffer.from(ra!.salt!).equals(Buffer.from(rb!.salt!))).toBe(false);
    expect(Buffer.from(ra!.hits[0]!.reporterKey).equals(Buffer.from(rb!.hits[0]!.reporterKey))).toBe(false);
    // 모든 열린 신고에서 같은 키가 두 번 나오지 않는다
    const [dup] = await prisma.$queryRaw<{ n: number }[]>`
      select count(*)::int as n from (select reporter_key from app.report_hits group by reporter_key having count(*) > 1) d`;
    expect(dup!.n).toBe(0);
  });

  it('7일 창: 창이 끝나면(5분 작업) 소금·신고자 키 0, 다음 신고는 새 행·새 소금 — 창을 넘긴 신고 셋은 숨기지 못한다', async () => {
    const u = await user();
    await publish(u.d);
    await reportForm(u.code, freshIp()).expect(303);
    await reportForm(u.code, freshIp()).expect(303);
    // 6일 23시간 49분: 아직 창 안(파기 여유 10분 밖) — 열려 있다
    await withClock(7 * DAY - 11 * 60_000, () => moderation.runDue());
    expect((await reportsOf(u.code))[0]!.status).toBe('open');
    // 6일 23시간 51분: 파기 여유 10분 안 → 5분 작업이 닫는다(다음 작업이 7일을 넘기 전에 — 처리방침 '최대 7일')
    await withClock(7 * DAY - 9 * 60_000, () => moderation.runDue());
    const [old] = await reportsOf(u.code);
    expect(old).toMatchObject({ status: 'expired', salt: null, distinctReporters: 2 });
    expect(old!.hits).toEqual([]);
    await withClock(7 * DAY, () => reportForm(u.code, freshIp()).expect(303).then(() => undefined));
    const rows = await reportsOf(u.code);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ status: 'open', distinctReporters: 1 });
    expect((await pageOf(u.userId)).page.state).toBe('live');
    // 7일 뒤 신고자 키는 하나(새 창)뿐, 닫힌 창의 키·소금 0
    const [n] = await prisma.$queryRaw<{ keys: number; salts: number }[]>`
      select (select count(*) from app.report_hits h join app.reports r on r.id = h.report_id where r.status <> 'open')::int as keys,
             (select count(*) from app.reports where status <> 'open' and salt is not null)::int as salts`;
    expect(n).toEqual({ keys: 0, salts: 0 });
  });

  it('창 끝 행은 다음 신고가 먼저 닫는다(작업이 늦어도 옛 창의 키로 세지 않는다)', async () => {
    const u = await user();
    await publish(u.d);
    await reportForm(u.code, freshIp()).expect(303);
    await reportForm(u.code, freshIp()).expect(303);
    await withClock(7 * DAY + 1, () => reportForm(u.code, freshIp()).expect(303).then(() => undefined));
    const rows = await reportsOf(u.code);
    expect(rows.map((r) => [r.status, r.distinctReporters, r.hits.length])).toEqual([
      ['expired', 2, 0],
      ['open', 1, 1],
    ]);
  });
});

// ───────────── 자동 숨김 ─────────────

describe('자동 숨김 — 서로 다른 3명이면 즉시 격리 + CDN 무효화, 공개 경로 0', () => {
  it('셋째 신고에서 quarantined: 공개 버킷 0(HTML·OG·snap·포스터·루프), /m 사라진 링크, 소금·키 0, 주인 다시 만들기 409, 알림 로그', async () => {
    const u = await user();
    await publish(u.d);
    const { dir } = await pageOf(u.userId);
    const before = (await viaWeb(http().get(`/m/${u.code}`), freshIp()).expect(200)).text;
    const ogUrl = metaContent(before, 'og:image')!;
    await reportForm(u.code, freshIp()).expect(303);
    await reportForm(u.code, freshIp(), 'hate').expect(303);
    await resetPurge();
    const from = logs.length;
    await reportApp(u.code, freshIp(), { reason: 'sexual' }).expect(204);
    const { page: p } = await pageOf(u.userId);
    expect(p.state).toBe('quarantined');
    const [rep] = await reportsOf(u.code);
    expect(rep).toMatchObject({ status: 'auto_hidden', salt: null, distinctReporters: 3, reasonCounts: { sexual: 2, hate: 1 } });
    expect(rep!.hits).toEqual([]);
    expect(await store.list('public-pages', dir!)).toEqual([]);
    expect(await store.list('quarantine', dir!)).toHaveLength(4);
    for (const f of ['snap.json', 'og.jpg', 'poster.jpg', 'loop.mp4']) expect(await readPublic(`${dir}/${f}`)).toBeNull();
    expect(await readPublic(pathOf(ogUrl).replace('/_local-storage/public/', ''))).toBeNull();
    const after = await viaWeb(http().get(`/m/${u.code}`), freshIp()).expect(200);
    expect(after.text).toContain('data-state="gone"');
    expect(after.text).not.toContain(dir!.split('/')[1]!);
    expect(metaContent(after.text, 'og:image')).toBeUndefined();
    expect(after.text).not.toContain('<form');
    expect(cdn.calls).toBe(1);
    expect(logs.slice(from).some((l) => l.includes('report_auto_hidden'))).toBe(true);
    expect(logs.filter((l) => l.includes(u.code))).toEqual([]);
    expect((await as(u.d, http().put('/api/v1/creature/page')).send({ snapshot: SNAP_OK, nameVisible: false, lang: 'ko', files: { poster: { contentType: 'image/jpeg', bytes: 1 }, og: { contentType: 'image/jpeg', bytes: 1 } } }).expect(409)).body.error.code).toBe('page_blocked');
    expect((await as(u.d, http().get('/api/v1/creature')).expect(200)).body.page.state).toBe('quarantined');
    // 격리 뒤 신고는 세지 않는다(새 행 없음)
    await reportForm(u.code, freshIp()).expect(303);
    expect(await reportsOf(u.code)).toHaveLength(1);
  });

  it('동시에 넷이 신고해도 격리 한 번·숨김 행 하나(행 잠금)', async () => {
    const u = await user();
    await publish(u.d);
    await reportForm(u.code, freshIp()).expect(303);
    await reportForm(u.code, freshIp()).expect(303);
    const rs = await Promise.all([0, 1, 2, 3].map(() => reportForm(u.code, freshIp())));
    expect(rs.map((r) => r.status)).toEqual([303, 303, 303, 303]);
    const rows = await reportsOf(u.code);
    expect(rows.map((r) => r.status)).toEqual(['auto_hidden']);
    expect(rows[0]!.distinctReporters).toBe(3);
    expect(await prisma.storageGc.count({ where: { creatureId: (await pageOf(u.userId)).creature.id, reason: 'quarantine_move' } })).toBe(0);
  });
});

// ───────────── 운영 SQL 스니펫(Studio) ─────────────

describe('운영 스니펫 docs/ops/moderation — 대기 목록·복원·확정·기각·기록', () => {
  it('대기 목록에 숨겨진 것이 결정 기한·사유·격리 경로와 함께 맨 위에 나온다', async () => {
    const u = await user();
    await publish(u.d);
    await hideByReports(u.code);
    const rows = await snippet<{ code: string; status: string; reporters: number; reasons: Record<string, number>; decide_by: Date; files: string }>('01-queue.sql');
    const mine = rows.find((r) => r.code === u.code)!;
    expect(mine).toMatchObject({ status: 'auto_hidden', reporters: 3, reasons: { sexual: 3 } });
    expect(mine.files).toBe(`quarantine/${(await pageOf(u.userId)).dir}`);
    expect(rows.findIndex((r) => r.status === 'open')).not.toBe(0);
    expect(mine.decide_by.getTime()).toBeGreaterThan(Date.now() + 6 * DAY);
  });

  it('복원: 스니펫 → (5분 작업) 격리본이 공개로, live, 같은 판 그대로, CDN 무효화, 신고 restored, 운영 기록', async () => {
    const u = await user();
    await publish(u.d);
    const { dir, page: p0 } = await pageOf(u.userId);
    const html0 = (await viaWeb(http().get(`/m/${u.code}`), freshIp()).expect(200)).text;
    await hideByReports(u.code);
    const [res] = await snippet<{ restore_page: string }>('02-restore.sql', u.code);
    expect(res!.restore_page).toMatch(/^restore_queued/);
    // 작업 전: 아직 격리(공개 0)
    expect((await pageOf(u.userId)).page.state).toBe('quarantined');
    expect(await store.list('public-pages', dir!)).toEqual([]);
    await resetPurge();
    await moderation.runDue();
    const { page: p1 } = await pageOf(u.userId);
    expect(p1).toMatchObject({ state: 'live', ver: p0.ver, pathPrefix: p0.pathPrefix });
    expect(await store.list('quarantine', dir!)).toEqual([]);
    expect(await store.list('public-pages', dir!)).toHaveLength(4);
    expect(await readPublic(`${dir}/poster.jpg`)).not.toBeNull();
    const html1 = (await viaWeb(http().get(`/m/${u.code}`), freshIp()).expect(200)).text;
    expect(html1).toBe(html0);
    expect(cdn.calls).toBe(1);
    expect((await reportsOf(u.code)).map((r) => r.status)).toEqual(['restored']);
    const [log] = await prisma.adminAction.findMany({ where: { targetRef: u.code }, orderBy: { id: 'desc' }, take: 1 });
    expect(log).toMatchObject({ action: 'restore', targetKind: 'link' });
    // 복원 뒤 다시 신고하면 새 창(옛 신고자 키는 없다)
    await reportForm(u.code, freshIp()).expect(303);
    expect((await reportsOf(u.code)).map((r) => r.status)).toEqual(['restored', 'open']);
  });

  it('복원 전에 주인이 링크를 껐으면 되살리지 않는다 — off, 격리본 삭제', async () => {
    const u = await user();
    await publish(u.d);
    const { dir } = await pageOf(u.userId);
    await hideByReports(u.code);
    await as(u.d, http().delete('/api/v1/creature/page')).expect(204);
    const [res] = await snippet<{ restore_page: string }>('02-restore.sql', u.code);
    expect(res!.restore_page).toMatch(/^off/);
    await moderation.runDue();
    expect((await pageOf(u.userId)).page).toMatchObject({ state: 'off', pathPrefix: null, meta: null });
    expect(await store.list('quarantine', dir!)).toEqual([]);
    expect(await store.list('public-pages', dir!)).toEqual([]);
    expect((await viaWeb(http().get(`/m/${u.code}`), freshIp()).expect(200)).text).toContain('data-state="gone"');
  });

  it('확정: removed + 격리본 삭제(작업), 다시 만들기 409, 되돌리기 스니펫(reopen) 뒤에는 다시 켤 수 있다', async () => {
    const u = await user();
    await publish(u.d);
    const { dir } = await pageOf(u.userId);
    await hideByReports(u.code);
    expect((await snippet<{ confirm_hide: string }>('03-confirm.sql', u.code))[0]!.confirm_hide).toBe('removed');
    await moderation.runDue();
    expect((await pageOf(u.userId)).page).toMatchObject({ state: 'removed', pathPrefix: null, meta: null, nameShown: false });
    expect(await store.list('quarantine', dir!)).toEqual([]);
    expect(await store.list('public-pages', dir!)).toEqual([]);
    expect((await reportsOf(u.code)).map((r) => r.status)).toEqual(['confirmed']);
    expect((await as(u.d, http().put('/api/v1/creature/page')).send({ snapshot: SNAP_OK, nameVisible: false, lang: 'ko', files: { poster: { contentType: 'image/jpeg', bytes: 1 }, og: { contentType: 'image/jpeg', bytes: 1 } } }).expect(409)).body.error.code).toBe('page_blocked');
    await snippet('07-reopen.sql', u.code);
    expect((await pageOf(u.userId)).page.state).toBe('off');
    await publish(u.d);
    expect((await pageOf(u.userId)).page.state).toBe('live');
  });

  it('기각: 문턱 전 열린 신고를 닫는다(소금·키 즉시 0). 열린 신고가 없으면 오류', async () => {
    const u = await user();
    await publish(u.d);
    await reportForm(u.code, freshIp()).expect(303);
    await snippet('04-dismiss.sql', u.code);
    const [r] = await reportsOf(u.code);
    expect(r).toMatchObject({ status: 'dismissed', salt: null });
    expect(r!.hits).toEqual([]);
    await expect(snippet('04-dismiss.sql', u.code)).rejects.toThrow(/열린 신고가 없습니다/);
  });

  it('틀린 코드는 오류(아무것도 바꾸지 않음), 사람이 옮겨 적은 코드(소문자·O·I)는 받는다', async () => {
    await expect(snippet('03-confirm.sql', 'ABC-12')).rejects.toThrow(/인장 코드 형식/);
    await expect(snippet('03-confirm.sql', 'UUUUUUUU')).rejects.toThrow(/인장 코드 형식/);
    await expect(snippet('03-confirm.sql', 'ZZZZZZZZ')).rejects.toThrow(/몽망이가 없습니다/);
    const u = await user();
    await publish(u.d);
    await hideByReports(u.code);
    const typed = u.code.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i');
    await snippet('03-confirm.sql', typed);
    expect((await pageOf(u.userId)).page.state).toBe('removed');
  });

  it('격리 30일이 지나도록 결정이 없으면 복원이 기본값(B5 리뷰 H2, 처리방침 5·6절 최대 30일), 기록 auto_restore — 그 뒤 7일 면역', async () => {
    const u = await user();
    await publish(u.d);
    const { dir } = await pageOf(u.userId);
    await hideByReports(u.code);
    await withClock(29 * DAY, () => moderation.runDue());
    expect((await pageOf(u.userId)).page.state).toBe('quarantined');
    await withClock(30 * DAY - 9 * 60_000, () => moderation.runDue());
    expect((await pageOf(u.userId)).page.state).toBe('live');
    expect(await store.list('quarantine', dir!)).toEqual([]);
    expect(await store.list('public-pages', dir!)).toHaveLength(4);
    expect((await reportsOf(u.code)).map((r) => r.status)).toEqual(['restored']);
    expect((await prisma.adminAction.findFirstOrThrow({ where: { targetRef: u.code } })).action).toBe('auto_restore');
  });

  it('SLA 알림: 격리가 6일 넘게 결정을 기다리면 moderation_sla error 로그(개수만, 코드 없음)', async () => {
    const u = await user();
    await publish(u.d);
    await hideByReports(u.code);
    const from = logs.length;
    await withClock(6 * DAY + 60_000, () => moderation.runDue());
    const line = logs.slice(from).find((l) => l.includes('moderation_sla'));
    expect(line).toBeDefined();
    expect(line).not.toContain(u.code);
    await snippet('03-confirm.sql', u.code);
  });

  it('운영 기록 스니펫은 최근 기록을 보여 주고, 1년 지난 기록·닫힌 신고는 지운다(신고 기록 1년)', async () => {
    const u = await user();
    await publish(u.d);
    await reportForm(u.code, freshIp()).expect(303);
    // 앞 시험(시계를 앞당긴 작업)이 남긴 미래 시각 기록은 최근 50건을 밀어낸다 — 같은 DB를 거듭 돌려도 같게
    await prisma.$executeRaw`DELETE FROM app.admin_actions WHERE at > now() + interval '1 minute'`;
    await snippet('04-dismiss.sql', u.code);
    const rows = await snippet<{ action: string; target_ref: string }>('09-audit-log.sql');
    expect(rows.some((r) => r.action === 'dismiss' && r.target_ref === u.code)).toBe(true);
    await withClock(366 * DAY, () => moderation.runDue());
    expect(await reportsOf(u.code)).toEqual([]);
    expect(await prisma.adminAction.count({ where: { targetRef: u.code } })).toBe(0);
  });
});

// ───────────── 이름 가리기 ─────────────

describe('이름 가리기 name_blocked — 문은 name_shown 하나, 주인은 다시 켤 수 없다', () => {
  it('스니펫 즉시: title·og:title·h1에서 이름 0, og:image는 포스터. 작업 뒤: 새 pageKey·이름 없는 snap.json, 옛 판(이름 든 snap·OG) 삭제 — DB·HTML·파일 어디에도 0', async () => {
    const NAME = randomName();
    const u = await user();
    await publish(u.d, { nameVisible: true, name: NAME, og: ogWith(NAME) });
    // 이름 판 1을 지난 판(2시간 유예)으로 만들고 이름 판 2를 올린다 — 유예 중인 판도 지워져야 한다
    await publish(u.d, { nameVisible: true, name: NAME, og: ogWith(NAME) });
    const { dir: oldDir, page: p0 } = await pageOf(u.userId);
    expect((await viaWeb(http().get(`/m/${u.code}`), freshIp()).expect(200)).text).toContain(`<title>${NAME}</title>`);
    expect(filesContaining(NAME).length).toBeGreaterThan(0); // 시험이 실제로 찾는지
    await resetPurge();
    const [res] = await snippet<{ mask_name: string }>('05-mask-name.sql', u.code);
    expect(res!.mask_name).toMatch(/^masked — 이름 뺀 판/);
    // 작업 전에도 HTML에는 이름이 없다(name_shown = false + meta.name 삭제), og:image는 포스터(OG 그림에 이름이 그려져 있다)
    const h = (await viaWeb(http().get(`/m/${u.code}`), freshIp()).expect(200)).text;
    expect(h).not.toContain(NAME);
    expect(metaContent(h, 'og:title')).toBe('몽망이 키우기');
    expect(metaContent(h, 'og:image')).toBe(store.publicUrl(`${oldDir}/poster.jpg`));
    expect(metaContent(h, 'og:image:height')).toBe('1350');
    expect((await pageOf(u.userId)).page).toMatchObject({ nameShown: false });
    expect((await pageOf(u.userId)).page.meta).not.toHaveProperty('name');
    expect((await prisma.cdnPurge.findUniqueOrThrow({ where: { id: 1 } })).requestedAt).not.toBeNull();
    await moderation.runDue();
    const { dir: newDir, page: p1 } = await pageOf(u.userId);
    expect(newDir).not.toBe(oldDir);
    expect(p1).toMatchObject({ state: 'live', ver: p0.ver + 1, nameShown: false });
    expect(await store.list('public-pages', oldDir!)).toEqual([]);
    expect((await store.list('public-pages', newDir!)).map((k) => k.split('/')[2]).sort()).toEqual(['loop.mp4', 'poster.jpg', 'snap.json']);
    const snap = JSON.parse((await readPublic(`${newDir}/snap.json`))!.toString()) as Record<string, unknown>;
    expect(snap).not.toHaveProperty('name');
    expect(snap.ink).toBe(SNAP_OK.ink);
    const h2 = (await viaWeb(http().get(`/m/${u.code}`), freshIp()).expect(200)).text;
    expect(metaContent(h2, 'og:image')).toBe(store.publicUrl(`${newDir}/poster.jpg`));
    expect(await traces([NAME])).toEqual({});
    expect(filesContaining(NAME)).toEqual([]);
    expect(cdn.calls).toBeGreaterThanOrEqual(1);
    expect((await prisma.adminAction.findFirstOrThrow({ where: { targetRef: u.code } })).action).toBe('mask_name');
  });

  it('가린 뒤 주인: GET nameBlocked, PATCH·PUT nameVisible:true는 409 name_blocked, 끈 채 다시 만들기는 이름 없이 200. 해제 스니펫 뒤에는 다시 켤 수 있다', async () => {
    const NAME = randomName();
    const u = await user();
    await publish(u.d, { nameVisible: true, name: NAME });
    await snippet('05-mask-name.sql', u.code);
    const info = (await as(u.d, http().get('/api/v1/creature')).expect(200)).body;
    expect(info).toMatchObject({ nameBlocked: true, nameVisible: false });
    expect((await as(u.d, http().patch('/api/v1/creature')).send({ nameVisible: true }).expect(409)).body.error.code).toBe('name_blocked');
    const put = as(u.d, http().put('/api/v1/creature/page')).send({
      snapshot: SNAP_OK,
      nameVisible: true,
      name: NAME,
      lang: 'ko',
      files: { poster: { contentType: 'image/jpeg', bytes: 1 }, og: { contentType: 'image/jpeg', bytes: 1 } },
    });
    expect((await put.expect(409)).body.error.code).toBe('name_blocked');
    await as(u.d, http().patch('/api/v1/creature')).send({ nameVisible: false }).expect(200);
    const again = await publish(u.d, { nameVisible: false });
    expect(again.body.nameAllowed).toBe(false);
    expect((await viaWeb(http().get(`/m/${u.code}`), freshIp()).expect(200)).text).not.toContain(NAME);
    await snippet('06-unmask-name.sql', u.code);
    expect((await as(u.d, http().patch('/api/v1/creature')).send({ nameVisible: true }).expect(200)).body).toMatchObject({ nameBlocked: false, nameVisible: true });
    await moderation.runDue();
  });

  it('커밋 전 판이 있을 때 가리면 그 판은 버려지고(commit 409) staging·공개 어디에도 이름이 없다', async () => {
    const NAME = randomName();
    const u = await user();
    await publish(u.d);
    const put = await as(u.d, http().put('/api/v1/creature/page'))
      .send({ snapshot: SNAP_OK, nameVisible: true, name: NAME, lang: 'ko', files: { poster: { contentType: 'image/jpeg', bytes: 1 }, og: { contentType: 'image/jpeg', bytes: 1 } } })
      .expect(200);
    expect(put.body.nameAllowed).toBe(true);
    await snippet('05-mask-name.sql', u.code);
    await as(u.d, http().post(`/api/v1/creature/page/${put.body.ver}/commit`)).send().expect(409);
    await moderation.runDue();
    expect(await traces([NAME])).toEqual({});
    expect(filesContaining(NAME)).toEqual([]);
  });

  it('격리 중에 가리면 격리본을 이름 없이 다시 쓰고, 복원하면 이름 없는 판이 돌아온다', async () => {
    const NAME = randomName();
    const u = await user();
    await publish(u.d, { nameVisible: true, name: NAME, og: ogWith(NAME) });
    await hideByReports(u.code);
    await snippet('05-mask-name.sql', u.code);
    await moderation.runDue();
    expect(filesContaining(NAME)).toEqual([]);
    await snippet('02-restore.sql', u.code);
    await moderation.runDue();
    const { dir, page: p } = await pageOf(u.userId);
    expect(p.state).toBe('live');
    expect(await store.list('public-pages', dir!)).toHaveLength(3);
    const h = (await viaWeb(http().get(`/m/${u.code}`), freshIp()).expect(200)).text;
    expect(h).not.toContain(NAME);
    expect(metaContent(h, 'og:image')).toBe(store.publicUrl(`${dir}/poster.jpg`));
    expect(await traces([NAME])).toEqual({});
  });
});

// ───────────── 삭제 요청 ─────────────

describe('운영자 계정 삭제 요청 — 요청 → 72시간 대기(앱 알림·취소) → 실행(B5 리뷰 H1)', () => {
  it('요청 직후·71시간에는 지우지 않고 앱에 대기 시각을 알린다, 08b로 취소, 다시 요청 → 72시간 뒤 DELETE /me와 같은 연쇄, 기록은 근거 유형·운영자만', async () => {
    const u = await user();
    await publish(u.d);
    const { creature } = await pageOf(u.userId);
    await viaWeb(http().post(`/m/${u.code}/seen`), freshIp()).expect(204);
    const [res] = await snippet<{ request_account_deletion: string }>('08-delete-account.sql', u.code);
    expect(res!.request_account_deletion).toMatch(/^scheduled/);
    await expect(snippet('08-delete-account.sql', u.code)).rejects.toThrow(/이미 삭제 대기/);
    expect((await moderation.runDue()).accountsDeleted).toBe(0);
    const info = (await as(u.d, http().get('/api/v1/creature')).expect(200)).body;
    const until = new Date(info.deletionPendingUntil).getTime();
    expect(until - Date.now()).toBeGreaterThan(71 * 3_600_000);
    expect(until - Date.now()).toBeLessThanOrEqual(72 * 3_600_000);
    await withClock(71 * 3_600_000, () => moderation.runDue());
    expect(await prisma.user.count({ where: { id: u.userId } })).toBe(1);
    // 취소
    await snippet('08b-cancel-deletion.sql', u.code);
    expect((await as(u.d, http().get('/api/v1/creature')).expect(200)).body.deletionPendingUntil).toBeNull();
    await expect(snippet('08b-cancel-deletion.sql', u.code)).rejects.toThrow(/삭제 대기 중이 아닙니다/);
    await withClock(80 * 3_600_000, () => moderation.runDue());
    expect(await prisma.user.count({ where: { id: u.userId } })).toBe(1);
    // 다시 요청 → 72시간 뒤 실행
    await snippet('08-delete-account.sql', u.code);
    const r = await withClock(72 * 3_600_000 + 60_000, () => moderation.runDue());
    expect(r.accountsDeleted).toBe(1);
    expect(await traces([u.userId, creature.id, u.code])).toEqual({});
    for (const b of ['public-pages', 'page-staging', 'quarantine'] as const) expect(await store.list(b, creature.page!.storeKey)).toEqual([]);
    const log = await prisma.deletionLog.findFirstOrThrow({ orderBy: { id: 'desc' } });
    expect(log).toMatchObject({ channel: 'email', kind: 'user_request' });
    expect(log.completedAt).not.toBeNull();
    const acts = await prisma.adminAction.findMany({ where: { targetKind: 'account' }, orderBy: { id: 'desc' }, take: 3 });
    expect(acts.map((a) => [a.action, a.targetRef, a.note])).toEqual([
      ['delete_request', null, 'guardian'],
      ['delete_cancel', null, null],
      ['delete_request', null, 'guardian'],
    ]);
    expect(acts.every((a) => a.actor.length > 0)).toBe(true);
    await as(u.d, http().get('/api/v1/creature')).expect(401);
  });

  it('근거 유형은 셋 중 하나만, 메모에 이메일(@)은 들어가지 않는다', async () => {
    const u = await user();
    await expect(prisma.$queryRawUnsafe(`select app.request_account_deletion('${u.code}', '아무 말')`)).rejects.toThrow(/근거 유형/);
    await publish(u.d);
    await reportForm(u.code, freshIp()).expect(303);
    await expect(prisma.$queryRawUnsafe(`select app.dismiss_report('${u.code}', 'a@b.c 님 요청')`)).rejects.toThrow(/admin_actions_note_no_email/);
  });
});

describe('B5 리뷰 H2 — 문턱 우회 막기: 복원 7일 면역·서비스 차단기·자동 숨김 끄기', () => {
  it('복원된 대상은 7일 동안 셋이 신고해도 숨지 않고 대기 목록(held immune)에만, 7일 뒤에는 다시 숨는다', async () => {
    const u = await user();
    await publish(u.d);
    await hideByReports(u.code);
    await snippet('02-restore.sql', u.code);
    await moderation.runDue();
    const from = logs.length;
    await hideByReports(u.code);
    expect((await pageOf(u.userId)).page.state).toBe('live');
    const open = (await reportsOf(u.code)).at(-1)!;
    expect(open).toMatchObject({ status: 'open', held: 'immune', distinctReporters: 3 });
    expect(logs.slice(from).some((l) => l.includes('report_held'))).toBe(true);
    const q = await snippet<{ code: string; held: string | null }>('01-queue.sql');
    expect(q.find((r) => r.code === u.code)?.held).toBe('immune');
    await snippet('04-dismiss.sql', u.code);
    await withClock(7 * DAY + 60_000, async () => {
      for (let i = 0; i < 3; i++) await reportForm(u.code, freshIp()).expect(303);
    });
    expect((await pageOf(u.userId)).page.state).toBe('quarantined');
  });

  it('서비스 전체 최근 1시간 자동 숨김이 상한이면 그다음은 숨기지 않고 held breaker + error 알림', async () => {
    const [h] = await prisma.$queryRaw<{ n: number }[]>`select count(*)::int as n from app.reports where hidden_at > now() - interval '1 hour'`;
    reports.autoHidePerHour = h!.n + 1;
    try {
      const a = await user();
      const b = await user();
      await publish(a.d);
      await publish(b.d);
      await hideByReports(a.code);
      expect((await pageOf(a.userId)).page.state).toBe('quarantined');
      const from = logs.length;
      await hideByReports(b.code);
      expect((await pageOf(b.userId)).page.state).toBe('live');
      expect((await reportsOf(b.code))[0]).toMatchObject({ status: 'open', held: 'breaker' });
      expect(logs.slice(from).some((l) => l.includes('report_auto_hidden_burst') && l.includes('"severity":"ERROR"'))).toBe(true);
    } finally {
      reports.autoHidePerHour = 1000;
    }
  });

  it('자동 숨김이 꺼져 있으면(운영 기본 — B6 XFF 실측 전) 문턱을 넘어도 held disabled', async () => {
    reports.autoHide = false;
    try {
      const u = await user();
      await publish(u.d);
      await hideByReports(u.code);
      expect((await pageOf(u.userId)).page.state).toBe('live');
      expect((await reportsOf(u.code))[0]).toMatchObject({ status: 'open', held: 'disabled' });
    } finally {
      reports.autoHide = true;
    }
  });

  it('격리 실패를 넣으면 신고 문턱 트랜잭션 전체가 되돌려진다(숨김 행만 남지 않음) — 503', async () => {
    const u = await user();
    await publish(u.d);
    await reportForm(u.code, freshIp()).expect(303);
    await reportForm(u.code, freshIp()).expect(303);
    const { PageService } = await import('../src/pages/page.service');
    const spy = vi.spyOn(app.get(PageService), 'markQuarantined').mockRejectedValueOnce(new Error('주입'));
    try {
      await reportForm(u.code, freshIp()).expect(503);
    } finally {
      spy.mockRestore();
    }
    const [r] = await reportsOf(u.code);
    expect(r).toMatchObject({ status: 'open', distinctReporters: 2, hiddenAt: null });
    expect(r!.hits).toHaveLength(2);
    expect((await pageOf(u.userId)).page.state).toBe('live');
  });
});

describe('B5 리뷰 중간 항목', () => {
  it('M1 복원 대기 중에 주인이 링크를 끄면 끄기가 우선 — off, 두 버킷 모두 0', async () => {
    const u = await user();
    await publish(u.d);
    const { dir } = await pageOf(u.userId);
    await hideByReports(u.code);
    expect((await snippet<{ restore_page: string }>('02-restore.sql', u.code))[0]!.restore_page).toMatch(/^restore_queued/);
    await as(u.d, http().delete('/api/v1/creature/page')).expect(204);
    await moderation.runDue();
    expect((await pageOf(u.userId)).page).toMatchObject({ state: 'off', pathPrefix: null, meta: null });
    expect(await store.list('quarantine', dir!)).toEqual([]);
    expect(await store.list('public-pages', dir!)).toEqual([]);
    expect(await prisma.storageGc.count({ where: { prefix: dir!, bucket: { not: 'page-staging' } } })).toBe(0);
  });

  it('M2 격리 중 계정이 지워지면 신고 행은 account_deleted로 닫히고 대기 목록에서 빠지며 1년 뒤 지워진다', async () => {
    const u = await user();
    await publish(u.d);
    await hideByReports(u.code);
    await as(u.d, http().delete('/api/v1/me')).expect(202);
    expect((await reportsOf(u.code)).map((r) => [r.status, r.salt])).toEqual([['account_deleted', null]]);
    expect((await snippet<{ code: string }>('01-queue.sql')).some((r) => r.code === u.code)).toBe(false);
    await withClock(366 * DAY, () => moderation.runDue());
    expect(await reportsOf(u.code)).toEqual([]);
  });

  it('M3 이름 가리기 직후(작업 전) /m HTML에 data-snap이 없다 — 작업 뒤 이름 없는 새 판으로 돌아온다', async () => {
    const NAME = randomName();
    const u = await user();
    await publish(u.d, { nameVisible: true, name: NAME });
    await snippet('05-mask-name.sql', u.code);
    const h = (await viaWeb(http().get(`/m/${u.code}`), freshIp()).expect(200)).text;
    expect(h).not.toContain('data-snap');
    await moderation.runDue();
    const { dir, page: p } = await pageOf(u.userId);
    expect(p.meta).not.toHaveProperty('snapPending');
    const h2 = (await viaWeb(http().get(`/m/${u.code}`), freshIp()).expect(200)).text;
    expect(h2).toContain(`data-snap="${store.publicUrl(`${dir}/snap.json`)}"`);
  });
});

describe('B5 리뷰 낮음 — 함수 굳히기', () => {
  it('L1 app 함수 어디에도 PUBLIC EXECUTE가 없고, 이 롤이 앞으로 만들 함수도 기본 회수(ALTER DEFAULT PRIVILEGES)', async () => {
    const [x] = await prisma.$queryRaw<{ n: number }[]>`
      select count(*)::int as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace,
             aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where s.nspname = 'app' and a.grantee = 0 and a.privilege_type = 'EXECUTE'`;
    expect(x!.n).toBe(0);
    const fresh = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('create function app.b5_probe() returns int language sql as $$ select 1 $$');
      const [r] = await tx.$queryRaw<{ n: number }[]>`
        select count(*)::int as n from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
         where p.proname = 'b5_probe' and a.grantee = 0`;
      throw Object.assign(new Error('rollback'), { n: r!.n });
    }).catch((e: { n?: number }) => e.n);
    expect(fresh).toBe(0);
  });

  it('L2·L3 운영 함수 16개는 search_path(pg_catalog, app)와 timezone UTC를 고정한다', async () => {
    const rows = await prisma.$queryRaw<{ proname: string; cfg: string[] | null }[]>`
      select p.proname, p.proconfig as cfg from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app' and p.proname in ('report_close_hits', 'mod_code', 'mod_creature_id', 'mod_log', 'mod_cdn_purge', 'mod_take_down',
         'restore_page', 'confirm_hide', 'dismiss_report', 'mask_name', 'unmask_name', 'reopen_page', 'request_account_deletion',
         'cancel_account_deletion', 'expire_reports', 'expire_quarantine')`;
    expect(rows).toHaveLength(16);
    for (const r of rows) expect(r.cfg, r.proname).toEqual(expect.arrayContaining(['search_path=pg_catalog, app', 'TimeZone=UTC']));
  });
});

describe('로그', () => {
  it('이 파일의 모든 요청 뒤 로그에 신고 IP·코드가 없다(route는 템플릿)', async () => {
    const codes = (await prisma.report.findMany({ select: { targetRef: true } })).map((r) => r.targetRef);
    for (const c of codes) expect(logs.filter((l) => l.includes(c))).toEqual([]);
    expect(logs.filter((l) => /203\.0\.\d+\.\d+|192\.0\.2\.|2001:db8/.test(l))).toEqual([]);
    expect(purge).toBeDefined();
  });
});
