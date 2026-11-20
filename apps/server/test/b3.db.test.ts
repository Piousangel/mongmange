// B3 공유 링크 — 실제 Postgres + 실제 JWT 경로 + 로컬 파일 저장소(STORAGE_DRIVER=local) e2e.
// architecture.md v2.2 3-5·3-5-1~3-5-3·3-8 삭제 ①~⑥·3-9. 그럴듯한 오답 판별(OPERATING 8-1):
//  - 이름을 가린 뒤 HTML·OG 메타·snap.json·DB·파일 경로(캐시 키) 어디든 이름이 남으면 실패
//  - 숫자 우회 이름(구분자·전각)이 공개되면 실패 / 커밋 검사를 우회한 MP4가 live가 되면 실패
//  - 남의 링크를 끌 수 있으면 실패 / 링크 코드가 로그에 한 번이라도 남으면 실패
//  - 계정 삭제 뒤 공개·커밋 전·지난 판·격리 파일이나 link_daily가 남으면 실패
import 'reflect-metadata';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CdnPurgeQueue, CountingInvalidator } from '../src/cdn/cdn-purge';
import type { Clock } from '../src/common/clock';
import { logSink } from '../src/common/logging';
import type { GcService } from '../src/deletion/gc.service';
import type { PageService } from '../src/pages/page.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { LocalObjectStore } from '../src/storage/local-store';
import { jpeg, mp4, type Mp4Opts } from './media-fixtures';
import { SERVICE_KEY, startFakeSupabase, type FakeSupabase } from './fake-supabase';

let app: NestFastifyApplication;
let prisma: PrismaService;
let sb: FakeSupabase;
let clock: Clock;
let store: LocalObjectStore;
let cdn: CountingInvalidator;
let purge: CdnPurgeQueue;
let pages: PageService;
let gc: GcService;
const logs: string[] = [];
const codesSeen = new Set<string>();
const usedNames: string[] = [];
const BASE = 'http://localhost:9999';
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
    STORAGE_LOCAL_DIR: mkdtempSync(join(tmpdir(), 'mong-b3-')),
    STORAGE_LOCAL_BASE_URL: BASE,
    SITE_ORIGIN: 'https://mongmang.ink',
    APP_STORE_ID: '6739012345',
    LOG_LEVEL: 'info',
    RATE_LIMIT_PER_MIN: '10000',
  });
  const { createApp } = await import('../src/app.factory');
  const { Clock } = await import('../src/common/clock');
  const { PrismaService } = await import('../src/prisma/prisma.service');
  const { CDN_INVALIDATOR, CdnPurgeQueue } = await import('../src/cdn/cdn-purge');
  const { OBJECT_STORE } = await import('../src/storage/object-store');
  const { PageService } = await import('../src/pages/page.service');
  const { GcService } = await import('../src/deletion/gc.service');
  app = await createApp({ bufferLogs: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  prisma = app.get(PrismaService);
  clock = app.get(Clock);
  store = app.get(OBJECT_STORE);
  cdn = app.get(CDN_INVALIDATOR);
  purge = app.get(CdnPurgeQueue);
  pages = app.get(PageService);
  gc = app.get(GcService);
});
afterAll(async () => {
  await app?.close();
  await sb?.close();
  logSink.stream = undefined;
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
  return { sub, token, ip: `10.${100 + ((ipSeq >> 8) & 127)}.${ipSeq & 255}.9` };
}
const as = (d: Device, r: request.Test) => r.set('authorization', `Bearer ${d.token}`).set('x-forwarded-for', d.ip);
/** /m 경로(Firebase 경유 — XFF 셋째 = 엣지) */
const web = (r: request.Test, n = ipSeq) => r.set('x-forwarded-for', `1.1.1.1, 10.200.${n & 255}.1, 35.0.0.1`);

async function user(): Promise<{ d: Device; userId: string; code: string }> {
  const d = await device();
  const r = await as(d, http().post('/api/v1/me/bootstrap')).send({ ageGate: { v: 2, ok: true } }).expect(200);
  codesSeen.add(r.body.creature.code);
  return { d, userId: r.body.userId, code: r.body.creature.code };
}
/** 서명 URL → supertest 경로 */
const pathOf = (u: string) => {
  const x = new URL(u);
  return x.pathname + x.search;
};

interface Files {
  poster?: Buffer;
  og?: Buffer;
  loop?: Buffer | null;
}
const GOOD = { poster: jpeg(1080, 1350), og: jpeg(1200, 630), loop: mp4() };

function putPage(d: Device, o: { nameVisible?: boolean; name?: string; snapshot?: Record<string, unknown>; loop?: boolean } = {}) {
  const files: Record<string, unknown> = {
    poster: { contentType: 'image/jpeg', bytes: 5000 },
    og: { contentType: 'image/jpeg', bytes: 5000 },
    ...(o.loop === false ? {} : { loop: { contentType: 'video/mp4', bytes: 5000 } }),
  };
  return as(d, http().put('/api/v1/creature/page')).send({
    snapshot: o.snapshot ?? SNAP_OK,
    nameVisible: o.nameVisible ?? false,
    ...(o.name !== undefined ? { name: o.name } : {}),
    lang: 'ko',
    files,
  });
}
function upload(slot: { signedUrl: string; contentType: string }, body: Buffer, type = slot.contentType): request.Test {
  return http().put(pathOf(slot.signedUrl)).set('content-type', type).send(body);
}
/** 켜기 전체: PUT → 올림 → commit. 결과 그대로 돌려준다(commit 상태는 부르는 쪽이 본다) */
async function publish(d: Device, o: { nameVisible?: boolean; name?: string; files?: Files; snapshot?: Record<string, unknown> } = {}) {
  const f = { ...GOOD, ...o.files };
  const put = await putPage(d, { ...o, loop: f.loop !== null }).expect(200);
  await upload(put.body.upload.poster, f.poster!).expect(200);
  await upload(put.body.upload.og, f.og!).expect(200);
  if (f.loop) await upload(put.body.upload.loop, f.loop).expect(200);
  const commit = await as(d, http().post(`/api/v1/creature/page/${put.body.ver}/commit`)).send();
  return { put, commit };
}
const page = (code: string) => web(http().get(`/m/${code}`));
/** 페이지 행. pathPrefix·pendingPrefix는 **저장소 판 폴더**(`{storeKey}/{pageKey}`)로 바꿔 돌려준다 — 버킷 목록·공개 주소에 바로 쓰게 */
async function pageRow(userId: string) {
  const c = await prisma.creature.findUniqueOrThrow({ where: { userId }, include: { page: true } });
  const p = c.page!;
  const dir = (k: string | null) => (k ? `${p.storeKey}/${k}` : null);
  return { creature: c, page: { ...p, pageKey: p.pathPrefix, pathPrefix: dir(p.pathPrefix), pendingPrefix: dir(p.pendingPrefix) } };
}
async function appTables(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ t: string }[]>`
    select table_name as t from information_schema.tables where table_schema = 'app' and table_type = 'BASE TABLE' order by 1`;
  return rows.map((r) => r.t);
}
async function traces(needles: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of await appTables()) {
    for (const n of needles) {
      const [r] = await prisma.$queryRawUnsafe<{ n: number }[]>(`select count(*)::int as n from app."${t}" x where x::text ilike $1`, `%${n}%`);
      if (r!.n) out[`${t}:${n}`] = r!.n;
    }
  }
  return out;
}
/** 공개 파일을 공개 주소로 읽는다(없으면 null) */
async function readPublicUrl(u: string): Promise<Buffer | null> {
  const r = await http().get(pathOf(u)).buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  return r.status === 200 ? (r.body as Buffer) : null;
}
const metaContent = (html: string, prop: string) => new RegExp(`<meta property="${prop}" content="([^"]*)">`).exec(html)?.[1];
/** 1분 묶음을 비우고 횟수를 0부터 세게 */
async function resetPurge() {
  await prisma.cdnPurge.update({ where: { id: 1 }, data: { requestedAt: null, releasedAt: null, attempts: 0 } });
  cdn.calls = 0;
  cdn.fail = false;
}

// ───────────── 켜기·커밋·페이지 ─────────────

describe('링크 켜기 → 커밋 → /m (3-5·3-5-3)', () => {
  it('PUT은 snap.json을 비공개 staging에만 쓰고 서명 URL을 준다 — 커밋 전에는 공개 주소가 없다', async () => {
    const u = await user();
    const r = await putPage(u.d).expect(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body).toMatchObject({ ver: 1, nameAllowed: false, url: `https://mongmang.ink/m/${u.code}` });
    expect(Object.keys(r.body.upload).sort()).toEqual(['loop', 'og', 'poster']);
    const { page: p } = await pageRow(u.userId);
    expect(p).toMatchObject({ state: 'off', pendingVer: 1, pathPrefix: null });
    const key = p.pendingPrefix!;
    expect(key).toMatch(/^[0-9a-f]{32}\/[A-Za-z0-9_-]{22}$/);
    expect(key).not.toContain(u.code);
    expect(await store.list('page-staging', key)).toEqual([`${key}/snap.json`]);
    expect(await readPublicUrl(store.publicUrl(`${key}/snap.json`))).toBeNull();
    // 커밋 전 /m은 사라진 링크
    const g = await page(u.code).expect(200);
    expect(g.headers['cache-control']).toBe('public, max-age=60, s-maxage=60');
    expect(g.headers['content-security-policy']).toMatch(/^default-src 'none'; img-src [^;]+; style-src 'unsafe-inline'; script-src 'sha256-/); // 리뷰 L1
    expect(g.headers['content-security-policy']).not.toContain('media-src');
    expect(g.headers['x-robots-tag']).toBe('noindex');
    expect(g.text).toContain('data-state="gone"');
  });

  it('정상 커밋 → live: /m은 s-maxage 5분·CSP·noindex, OG·포스터·루프는 공개 버킷, staging은 비고 대기열의 6시간 항목도 없다', async () => {
    const u = await user();
    const { put, commit } = await publish(u.d);
    expect(commit.status).toBe(200);
    expect(commit.body).toEqual({ ver: 1, state: 'live' });
    const { page: p, creature } = await pageRow(u.userId);
    expect(p).toMatchObject({ state: 'live', ver: 1, hasLoop: true, nameShown: false, pendingVer: null, pendingPrefix: null, pendingMeta: null });
    expect(creature.linkEnabled).toBe(true);
    const key = p.pathPrefix!;
    expect(await store.list('public-pages', key)).toEqual(['loop.mp4', 'og.jpg', 'poster.jpg', 'snap.json'].map((f) => `${key}/${f}`));
    expect(await store.list('page-staging', key)).toEqual([]);
    // 의도 기록 확정(리뷰 I1·M4): 공개 쪽 6시간 행은 지워지고, staging 행만 서명 URL 최대 수명(2시간) 뒤로 남는다
    const rows = await prisma.storageGc.findMany({ where: { creatureId: creature.id } });
    expect(rows.map((r) => [r.bucket, r.reason, r.prefix])).toEqual([['page-staging', 'uncommitted', key]]);
    expect(Math.abs(rows[0]!.notBefore.getTime() - (Date.now() + 2 * 3_600_000))).toBeLessThan(60_000);

    const h = await page(u.code).expect(200);
    expect(h.headers['cache-control']).toBe('public, max-age=60, s-maxage=300');
    expect(h.headers['x-robots-tag']).toBe('noindex');
    expect(h.headers['content-type']).toMatch(/^text\/html/);
    expect(h.headers['content-security-policy']).toMatch(/^default-src 'none'; img-src http:\/\/localhost:9999 data:; media-src http:\/\/localhost:9999;/);
    expect(metaContent(h.text, 'og:image')).toBe(store.publicUrl(`${key}/og.jpg`));
    expect(metaContent(h.text, 'og:title')).toBe('몽망이 키우기');
    expect(h.text).toContain('송연먹 · 느긋결 몽망이를 보셨군요');
    expect(h.text).toContain(`<video id="loop" src="${store.publicUrl(`${key}/loop.mp4`)}"`);
    expect(await readPublicUrl(store.publicUrl(`${key}/og.jpg`))).toEqual(GOOD.og);
    // 앱 안 표시(즉시)
    expect((await as(u.d, http().get('/api/v1/creature')).expect(200)).body).toEqual({ code: u.code, linkEnabled: true, nameVisible: false, page: { ver: 1, state: 'live' } });
    expect(put.body.upload.poster.contentType).toBe('image/jpeg');
  });

  it('루프 없이도 live(웹은 포스터만으로 완결), 커밋 전에 새 PUT이 오면 앞 판의 staging은 바로 지운다', async () => {
    const u = await user();
    const first = await putPage(u.d).expect(200);
    const firstKey = (await pageRow(u.userId)).page.pendingPrefix!;
    const { put, commit } = await publish(u.d, { files: { loop: null } });
    expect(put.body.ver).toBe(2);
    expect(put.body.upload.loop).toBeUndefined();
    expect(commit.status).toBe(200);
    expect(await store.list('page-staging', firstKey)).toEqual([]);
    expect((await page(u.code).expect(200)).text).not.toContain('<video');
    // 옛 판 번호로 커밋 → 409
    await as(u.d, http().post(`/api/v1/creature/page/${first.body.ver}/commit`)).send().expect(409);
  });

  it('스냅숏 검증: 모르는 키(사생활 값)·점 65개는 422, 32KB 넘으면 413 — 앱이 스냅숏에 넣은 이름은 버린다', async () => {
    const u = await user();
    const bad = await putPage(u.d, { snapshot: { ...SNAP_OK, relation: { hour: 7 } } }).expect(422);
    expect(bad.body.error).toMatchObject({ code: 'snapshot', details: { reason: 'unknown_key', path: 'relation' } });
    const age = JSON.parse(readFileSync(join(__dirname, '../../../packages/core/test/fixtures/snap/age-key.json'), 'utf8'));
    expect((await putPage(u.d, { snapshot: age }).expect(422)).body.error.details.path).toBe('strokes.0.age');
    await putPage(u.d, { snapshot: { ...SNAP_OK, pad: 'x'.repeat(33 * 1024) } }).expect(413);
    // 이름 공개 꺼짐 + 스냅숏 안의 이름 → snap.json에 이름 없음
    const { commit } = await publish(u.d, { snapshot: { ...SNAP_OK, name: '숨은이름' } });
    expect(commit.status).toBe(200);
    const key = (await pageRow(u.userId)).page.pathPrefix!;
    const snap = (await readPublicUrl(store.publicUrl(`${key}/snap.json`)))!.toString('utf8');
    expect(snap).not.toContain('숨은이름');
    expect(JSON.parse(snap)).not.toHaveProperty('name');
  });
});

// ───────────── 이름 공개(3-5-2) ─────────────

describe('이름 공개 nameVisibility — 켤 때만, normalizeName, 가리면 어디에도 0', () => {
  it('켜면 title·og:title·snap.json에 이름, 끄고 다시 만들면 HTML·OG 메타·JSON·DB·파일 경로 어디에도 0(옛 판도 즉시 삭제), CDN 무효화', async () => {
    await resetPurge();
    // 실행마다 다른 이름(앞 실행이 남긴 행과 섞이지 않게) — 한글 완성형 세 글자
    const NAME = Array.from({ length: 3 }, () => String.fromCharCode(0xac00 + Math.floor(Math.random() * 11172))).join('');
    usedNames.push(NAME);
    const u = await user();
    const on = await publish(u.d, { nameVisible: true, name: NAME });
    expect(on.put.body.nameAllowed).toBe(true);
    const keyOn = (await pageRow(u.userId)).page.pathPrefix!;
    const h1 = (await page(u.code).expect(200)).text;
    expect(h1).toContain(`<title>${NAME}</title>`);
    expect(metaContent(h1, 'og:title')).toBe(NAME);
    expect(JSON.parse((await readPublicUrl(store.publicUrl(`${keyOn}/snap.json`)))!.toString()).name).toBe(NAME);
    expect(Object.keys(await traces([NAME])).length).toBeGreaterThan(0); // 시험이 실제로 찾는지

    await as(u.d, http().patch('/api/v1/creature')).send({ nameVisible: false }).expect(200);
    await resetPurge();
    const off = await publish(u.d, { nameVisible: false });
    expect(off.put.body.nameAllowed).toBe(false);
    expect(off.commit.status).toBe(200);
    const keyOff = (await pageRow(u.userId)).page.pathPrefix!;
    const h2 = (await page(u.code).expect(200)).text;
    expect(h2).not.toContain(NAME);
    expect(metaContent(h2, 'og:title')).toBe('몽망이 키우기');
    expect((await readPublicUrl(store.publicUrl(`${keyOff}/snap.json`)))!.toString()).not.toContain(NAME);
    // 이름이 실렸던 옛 판은 2시간 유예 없이 바로 지운다(옛 snap.json·OG에 이름이 있다)
    expect(await store.list('public-pages', keyOn)).toEqual([]);
    expect(await readPublicUrl(store.publicUrl(`${keyOn}/snap.json`))).toBeNull();
    expect(await traces([NAME])).toEqual({});
    // 캐시 키(공개 URL·페이지 주소)에 이름 없음
    expect(`${keyOff}/m/${u.code}`).not.toContain(NAME);
    expect(cdn.calls).toBe(1);
  });

  it.each([
    ['구분자 전화번호', '010·1234·5678'],
    ['공백 전화번호', '010 1234 5678'],
    ['전각 숫자', '０１０１２３４５６７８'],
    ['글자 + 이어진 숫자', 'ab01012345'],
    ['HTML 글자', '<b>몽'],
    ['정규화로 바뀌는 값(앞뒤 공백)', ' 몽이 '],
    ['폭 없는 문자', '몽​이'],
  ])('%s(%s)는 공개 거부 — nameAllowed false, 어디에도 없음', async (_n, name) => {
    const u = await user();
    const { put, commit } = await publish(u.d, { nameVisible: true, name, files: { loop: null } });
    expect(put.body.nameAllowed).toBe(false);
    expect(commit.status).toBe(200);
    const { page: p } = await pageRow(u.userId);
    expect(p.nameShown).toBe(false);
    expect(p.meta).not.toHaveProperty('name');
    const h = (await page(u.code).expect(200)).text;
    expect(metaContent(h, 'og:title')).toBe('몽망이 키우기');
    const digits = name.replace(/\D/g, '');
    if (digits.length >= 7) expect(h).not.toContain(digits);
    expect((await readPublicUrl(store.publicUrl(`${p.pathPrefix}/snap.json`)))!.toString()).not.toContain('"name"');
  });
});

// ───────────── 커밋 검사 우회(3-5-3 ③) ─────────────

describe('commit 검사 — 우회 파일은 live가 되지 않는다', () => {
  it.each<[string, Files, string, string]>([
    ['moov가 뒤쪽', { loop: mp4({ moovLast: true }) }, 'loop', 'not_faststart'],
    ['9초', { loop: mp4({ seconds: 9 }) }, 'loop', 'duration'],
    ['소리 트랙', { loop: mp4({ tracks: ['vide', 'soun'] }) }, 'loop', 'audio'],
    ['루프 해상도', { loop: mp4({ width: 1080, height: 1350 } as Mp4Opts) }, 'loop', 'dimensions'],
    ['PNG를 jpeg로', { poster: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(100)]) }, 'poster', 'signature'],
    ['OG 해상도', { og: jpeg(1080, 1350) }, 'og', 'dimensions'],
  ])('%s → 422 {%s, %s}, /m은 사라진 링크 그대로, 공개 버킷 0', async (_n, files, file, reason) => {
    const u = await user();
    const { commit } = await publish(u.d, { files });
    expect(commit.status).toBe(422);
    expect(commit.body.error).toMatchObject({ code: 'commit_check', details: { file, reason } });
    expect((await pageRow(u.userId)).page.state).toBe('off');
    expect((await page(u.code).expect(200)).text).toContain('data-state="gone"');
    const key = (await pageRow(u.userId)).page.pendingPrefix!;
    expect(await store.list('public-pages', key)).toEqual([]);
  });
  it('선언한 루프를 안 올리면 missing, 상한 넘는 파일·다른 유형은 서명 URL이 받지 않는다', async () => {
    const u = await user();
    const put = await putPage(u.d).expect(200);
    await upload(put.body.upload.poster, GOOD.poster).expect(200);
    await upload(put.body.upload.og, GOOD.og).expect(200);
    const c = await as(u.d, http().post(`/api/v1/creature/page/${put.body.ver}/commit`)).send().expect(422);
    expect(c.body.error.details).toEqual({ file: 'loop', reason: 'missing' });
    await upload(put.body.upload.loop, Buffer.alloc(600 * 1024 + 1)).expect(413);
    await upload(put.body.upload.loop, GOOD.loop, 'image/jpeg').expect(415);
    await upload(put.body.upload.loop, GOOD.loop).expect(200);
    await upload(put.body.upload.loop, GOOD.loop).expect(403); // 1회
  });
});

// ───────────── 끄기·남의 링크·격리 ─────────────

describe('링크 끄기·권한·격리(3-9)', () => {
  it('끄기: 204 → /m 사라진 링크, 공개 파일 즉시 삭제, CDN 무효화, 앱 표시 off', async () => {
    await resetPurge();
    const u = await user();
    await publish(u.d);
    const key = (await pageRow(u.userId)).page.pathPrefix!;
    await resetPurge();
    await as(u.d, http().delete('/api/v1/creature/page')).expect(204);
    expect(await store.list('public-pages', key)).toEqual([]);
    expect((await page(u.code).expect(200)).text).toContain('data-state="gone"');
    expect(cdn.calls).toBe(1);
    expect((await as(u.d, http().get('/api/v1/creature')).expect(200)).body).toMatchObject({ linkEnabled: false, page: { state: 'off' } });
    // 다시 켜면 같은 코드로 새 판
    expect((await publish(u.d)).commit.status).toBe(200);
    expect((await page(u.code).expect(200)).text).toContain('data-state="live"');
  });

  it('남의 링크는 끌 수 없다: B의 DELETE·commit은 B 자신에게만 — A의 페이지는 그대로 live, 토큰 없으면 401', async () => {
    const a = await user();
    const b = await user();
    const pa = await publish(a.d);
    await as(b.d, http().delete('/api/v1/creature/page')).expect(204);
    await as(b.d, http().post(`/api/v1/creature/page/${pa.put.body.ver}/commit`)).send().expect(409);
    await http().delete('/api/v1/creature/page').set('x-forwarded-for', '10.9.9.9').expect(401);
    expect((await pageRow(a.userId)).page.state).toBe('live');
    expect((await page(a.code).expect(200)).text).toContain('data-state="live"');
  });

  it('격리: 공개 파일이 quarantine 버킷으로, /m 사라진 링크, 다시 만들기 409, 끄기는 link_enabled만', async () => {
    await resetPurge();
    const u = await user();
    await publish(u.d);
    const { page: p, creature } = await pageRow(u.userId);
    await resetPurge();
    await pages.quarantine(creature.id);
    expect(await store.list('public-pages', p.pathPrefix!)).toEqual([]);
    expect((await store.list('quarantine', p.pathPrefix!)).length).toBe(4);
    expect((await page(u.code).expect(200)).text).toContain('data-state="gone"');
    expect(cdn.calls).toBe(1);
    expect((await putPage(u.d).expect(409)).body.error.code).toBe('page_blocked');
    await as(u.d, http().delete('/api/v1/creature/page')).expect(204);
    expect((await pageRow(u.userId)).page.state).toBe('quarantined');
    expect((await store.list('quarantine', p.pathPrefix!)).length).toBe(4);
  });
});

// ───────────── CDN 무효화 1분 묶음(3-9) ─────────────

describe('CDN 무효화 — 1분 묶음, 실패하면 되돌림', () => {
  it('1분 안의 요청 셋은 한 번, 1분 뒤 flush가 남은 하나를 낸다. 실패하면 대기로 돌아간다', async () => {
    await resetPurge();
    const real = clock.now.bind(clock);
    const t0 = real();
    try {
      clock.now = () => t0;
      expect(await purge.request()).toBe('released');
      clock.now = () => t0 + 10_000;
      expect(await purge.request()).toBe('waiting');
      clock.now = () => t0 + 20_000;
      expect(await purge.request()).toBe('waiting');
      expect(cdn.calls).toBe(1);
      clock.now = () => t0 + 61_000;
      expect(await purge.flush()).toBe('released');
      expect(cdn.calls).toBe(2);
      expect(await purge.flush()).toBe('idle');
      cdn.fail = true;
      clock.now = () => t0 + 130_000;
      expect(await purge.request()).toBe('failed');
      expect((await prisma.cdnPurge.findUniqueOrThrow({ where: { id: 1 } })).requestedAt).not.toBeNull();
      cdn.fail = false;
      clock.now = () => t0 + 200_000;
      expect(await purge.flush()).toBe('released');
      // 대기열 행에는 코드·경로 칸이 없다(삭제 뒤 흔적 0의 근거)
      expect(Object.keys(await prisma.cdnPurge.findUniqueOrThrow({ where: { id: 1 } })).sort()).toEqual(['attempts', 'id', 'releasedAt', 'requestedAt']);
    } finally {
      clock.now = real;
    }
  });
});

// ───────────── 퍼널(3-6) ─────────────

describe('링크 퍼널 — 비콘·스토어 이동, 30일 뒤 코드 없는 합계', () => {
  it('seen → view, get → 302(코드 없는 스토어 주소) + store_*, 사라진 코드는 세지 않음', async () => {
    const u = await user();
    await publish(u.d, { files: { loop: null } });
    const s = await web(http().post(`/m/${u.code}/seen`)).expect(204);
    expect(s.headers['cache-control']).toBe('no-store');
    const g = await web(http().get(`/m/${u.code}/get?p=ios`)).expect(302);
    expect(g.headers.location).toBe('https://apps.apple.com/app/id6739012345?ct=m_link');
    const ga = await web(http().get(`/m/${u.code}/get?p=android`)).expect(302);
    expect(ga.headers.location).not.toContain(u.code);
    const rows = await prisma.linkDaily.findMany({ where: { code: u.code }, orderBy: { event: 'asc' } });
    expect(rows.map((r) => [r.event, r.count])).toEqual([
      ['view', 1],
      ['store_ios', 1],
      ['store_android', 1],
    ]);
    const other = await user();
    await web(http().post(`/m/${other.code}/seen`)).expect(204);
    expect(await prisma.linkDaily.count({ where: { code: other.code } })).toBe(0);
  });
  it('rollup_link_daily: 30일 지난 행은 코드 없이 link_funnel_daily로 옮기고 지운다', async () => {
    await prisma.$executeRaw`INSERT INTO app.link_daily VALUES ('2025-01-01', 'ZZZZ0001', 'view', 3), ('2025-01-01', 'ZZZZ0002', 'view', 2)
      ON CONFLICT DO NOTHING`;
    const [r] = await prisma.$queryRaw<{ n: number }[]>`select app.rollup_link_daily('2025-03-01'::date) as n`;
    expect(r!.n).toBeGreaterThanOrEqual(2);
    expect(await prisma.linkDaily.count({ where: { code: { in: ['ZZZZ0001', 'ZZZZ0002'] } } })).toBe(0);
    const f = await prisma.linkFunnelDaily.findUniqueOrThrow({ where: { day_event: { day: new Date('2025-01-01'), event: 'view' } } });
    expect(f.count).toBeGreaterThanOrEqual(5);
  });
});

// ───────────── 삭제 연쇄 ①~⑥(3-8) ─────────────

describe('계정 삭제 — 공개·커밋 전·지난 판·격리 파일과 link_daily까지 흔적 0', () => {
  it('DELETE /me: 지난 판(2시간 유예 중)·커밋 전 판·공개 판·퍼널 행이 모두 사라지고 영수증 done, CDN 무효화', async () => {
    await resetPurge();
    const u = await user();
    await publish(u.d); // 판 1
    const old = (await pageRow(u.userId)).page.pathPrefix!;
    await publish(u.d); // 판 2 — 판 1은 2시간 유예 대기
    const live = (await pageRow(u.userId)).page.pathPrefix!;
    await putPage(u.d).expect(200); // 판 3 커밋 전(staging)
    const pending = (await pageRow(u.userId)).page.pendingPrefix!;
    await web(http().post(`/m/${u.code}/seen`)).expect(204);
    const c = (await pageRow(u.userId)).creature;
    expect(await store.list('public-pages', old)).not.toEqual([]);
    const before = await traces([u.code, c.id, old, live, pending]);
    expect(Object.keys(before).length).toBeGreaterThanOrEqual(4);

    await resetPurge();
    const r = await as(u.d, http().delete('/api/v1/me')).expect(202);
    expect(await traces([u.code, c.id, old, live, pending, u.userId, u.d.sub])).toEqual({});
    for (const k of [old, live, pending]) {
      expect(await store.list('public-pages', k)).toEqual([]);
      expect(await store.list('page-staging', k)).toEqual([]);
    }
    expect((await http().get(`/api/v1/deletion/${r.body.receipt}`).set('x-forwarded-for', u.d.ip).expect(200)).body).toEqual({ state: 'done' });
    expect((await page(u.code).expect(200)).text).toContain('data-state="gone"');
    expect(cdn.calls).toBe(1);
  });

  it('격리 중 계정 삭제: quarantine 버킷 파일도 지운다', async () => {
    const u = await user();
    await publish(u.d);
    const { page: p, creature } = await pageRow(u.userId);
    await pages.quarantine(creature.id);
    await as(u.d, http().delete('/api/v1/me')).expect(202);
    expect(await store.list('quarantine', p.pathPrefix!)).toEqual([]);
    expect(await traces([u.code, creature.id, p.pathPrefix!, p.storeKey])).toEqual({});
  });

  it('웹 /delete(코드 + 글귀)도 같은 연쇄 — 공개 파일·link_daily 0', async () => {
    const u = await user();
    await publish(u.d, { files: { loop: null } });
    await web(http().post(`/m/${u.code}/seen`)).expect(204);
    const key = (await pageRow(u.userId)).page.pathPrefix!;
    const phrase = (await as(u.d, http().post('/api/v1/recovery-code')).expect(200)).body.code as string;
    await http().post('/api/v1/deletion/web').set('x-forwarded-for', '10.77.0.1').send({ code: u.code, phrase }).expect(202);
    expect(await store.list('public-pages', key)).toEqual([]);
    expect(await traces([u.code, key])).toEqual({});
  });

  it('Storage가 잠시 실패해도 대기열이 남았다가 Scheduler 재시도로 지운다(영수증 pending → done)', async () => {
    const u = await user();
    await publish(u.d, { files: { loop: null } });
    const key = (await pageRow(u.userId)).page.pathPrefix!;
    const orig = store.removePrefix.bind(store);
    store.removePrefix = () => Promise.reject(new Error('잠깐 실패'));
    let receipt: string;
    try {
      receipt = (await as(u.d, http().delete('/api/v1/me')).expect(202)).body.receipt;
      expect((await http().get(`/api/v1/deletion/${receipt}`).set('x-forwarded-for', u.d.ip).expect(200)).body.state).toBe('pending');
      expect(await store.list('public-pages', key)).not.toEqual([]);
    } finally {
      store.removePrefix = orig;
    }
    const real = clock.now.bind(clock);
    clock.now = () => real() + 2 * 3_600_000;
    try {
      await gc.runDue();
    } finally {
      clock.now = real;
    }
    expect(await store.list('public-pages', key)).toEqual([]);
    expect((await http().get(`/api/v1/deletion/${receipt}`).set('x-forwarded-for', u.d.ip).expect(200)).body.state).toBe('done');
  });
});

// ───────────── 리뷰 반영(2026-11-20-b3-review.md) ─────────────

/** 이 몽망이 접두 아래 세 버킷의 파일 전부 */
async function filesUnder(storeKey: string): Promise<string[]> {
  return [
    ...(await store.list('public-pages', storeKey)).map((k) => `public:${k}`),
    ...(await store.list('page-staging', storeKey)).map((k) => `staging:${k}`),
    ...(await store.list('quarantine', storeKey)).map((k) => `quarantine:${k}`),
  ];
}
/** 서명 URL 셋에 올리기만(commit 없음) */
async function uploadAll(put: request.Response) {
  await upload(put.body.upload.poster, GOOD.poster).expect(200);
  await upload(put.body.upload.og, GOOD.og).expect(200);
  if (put.body.upload.loop) await upload(put.body.upload.loop, GOOD.loop).expect(200);
}

describe('I1 — 이동 중 고아 파일: 의도 기록 + 행 잠금 + 접두 소거', () => {
  it('R1 이동이 일부만 되면 503 storage_unavailable, 공개 쪽에 옮겨진 파일은 대기 행이 추적하고 계정 삭제가 모두 지운다', async () => {
    const u = await user();
    const put = await putPage(u.d, { loop: false }).expect(200);
    await uploadAll(put);
    const { page: p } = await pageRow(u.userId);
    const orig = store.move.bind(store);
    store.move = (from, to, key) => (key.endsWith('snap.json') ? Promise.reject(new Error('이동 실패(시험)')) : orig(from, to, key));
    try {
      const c = await as(u.d, http().post(`/api/v1/creature/page/${put.body.ver}/commit`)).send().expect(503);
      expect(c.body.error.code).toBe('storage_unavailable');
    } finally {
      store.move = orig;
    }
    expect(await store.list('public-pages', p.pendingPrefix!)).toEqual([`${p.pendingPrefix}/og.jpg`, `${p.pendingPrefix}/poster.jpg`]);
    const pub = await prisma.storageGc.findMany({ where: { bucket: 'public-pages', prefix: p.pendingPrefix! } });
    expect(pub.map((r) => r.reason)).toEqual(['uncommitted']); // 공개 쪽 고아를 대기열이 안다
    expect((await pageRow(u.userId)).page.state).toBe('off'); // DB는 되돌려졌다
    await as(u.d, http().delete('/api/v1/me')).expect(202);
    expect(await filesUnder(p.storeKey)).toEqual([]);
    expect(await traces([u.code, p.storeKey, p.pendingPrefix!])).toEqual({});
  });

  it('R2 이동 도중 같은 사용자가 계정을 지워도(삭제는 페이지 행 잠금을 기다림) 세 버킷 모두 0, 대기열 0', async () => {
    const u = await user();
    const put = await putPage(u.d, { nameVisible: true, name: '겹침이' }).expect(200);
    await uploadAll(put);
    const { page: p } = await pageRow(u.userId);
    const orig = store.move.bind(store);
    let del: Promise<request.Response> | null = null;
    store.move = async (from, to, key) => {
      await orig(from, to, key);
      // 첫 파일을 옮긴 직후 삭제 요청을 띄운다(기다리지 않음 — 삭제는 commit의 행 잠금 뒤로 줄을 선다)
      if (!del) del = as(u.d, http().delete('/api/v1/me')).then((r) => r);
      await new Promise((r) => setTimeout(r, 30));
    };
    let commitStatus: number;
    try {
      commitStatus = (await as(u.d, http().post(`/api/v1/creature/page/${put.body.ver}/commit`)).send()).status;
    } finally {
      store.move = orig;
    }
    expect((await del!).status).toBe(202);
    expect([200, 404]).toContain(commitStatus);
    expect(await filesUnder(p.storeKey)).toEqual([]);
    expect(await traces([u.code, p.storeKey, '겹침이'])).toEqual({});
  });

  it('같은 판 commit 둘이 동시에 오면 하나만 live(200)·하나는 409 — 행 잠금 안 재확인(살아남은 변이 M13)', async () => {
    const u = await user();
    const put = await putPage(u.d, { loop: false }).expect(200);
    await uploadAll(put);
    const go = () => as(u.d, http().post(`/api/v1/creature/page/${put.body.ver}/commit`)).send();
    const rs = await Promise.all([go(), go()]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    const { page: p } = await pageRow(u.userId);
    expect(await store.list('public-pages', p.pathPrefix!)).toHaveLength(3);
  });

  it('commit 사이에 새 PUT이 오면 옛 판 번호의 commit은 409, 옛 판 파일은 두 버킷에서 바로 지운다', async () => {
    const u = await user();
    const first = await putPage(u.d, { loop: false }).expect(200);
    await uploadAll(first);
    const firstDir = (await pageRow(u.userId)).page.pendingPrefix!;
    await putPage(u.d, { loop: false }).expect(200);
    await as(u.d, http().post(`/api/v1/creature/page/${first.body.ver}/commit`)).send().expect(409);
    expect(await store.list('page-staging', firstDir)).toEqual([]);
    expect(await store.list('public-pages', firstDir)).toEqual([]);
  });
});

describe('I2 — 이름을 가리면 유예 중인 옛 판까지 모두 즉시 삭제', () => {
  it('R4 이름 판 1 → 이름 판 2(판 1 유예) → 이름 없는 판 3: 판 1·2의 snap.json이 공개 주소로 읽히지 않고 이름 0', async () => {
    const NAME = Array.from({ length: 3 }, () => String.fromCharCode(0xac00 + Math.floor(Math.random() * 11172))).join('');
    usedNames.push(NAME);
    const u = await user();
    await publish(u.d, { nameVisible: true, name: NAME, files: { loop: null } });
    const v1 = (await pageRow(u.userId)).page.pathPrefix!;
    await publish(u.d, { nameVisible: true, name: NAME, files: { loop: null } });
    const v2 = (await pageRow(u.userId)).page.pathPrefix!;
    expect(await readPublicUrl(store.publicUrl(`${v1}/snap.json`))).not.toBeNull(); // 판 1은 2시간 유예 중
    await publish(u.d, { nameVisible: false, files: { loop: null } });
    for (const v of [v1, v2]) {
      expect(await readPublicUrl(store.publicUrl(`${v}/snap.json`))).toBeNull();
      expect(await store.list('public-pages', v)).toEqual([]);
    }
    expect(await traces([NAME])).toEqual({});
    const { page: p } = await pageRow(u.userId);
    for (const k of await store.list('public-pages', p.storeKey)) expect((await readPublicUrl(store.publicUrl(k)))!.toString('latin1')).not.toContain(Buffer.from(NAME).toString('latin1'));
  });
});

describe('M2 — 이름의 문은 name_shown 하나', () => {
  it('meta에 이름이 있어도 name_shown=false면 title·og:title·h1·description 어디에도 이름 0(살아남은 title 변이)', async () => {
    const u = await user();
    await publish(u.d, { files: { loop: null } });
    const NAME = '문지기';
    await prisma.$executeRaw`UPDATE app.public_pages SET meta = meta || ${JSON.stringify({ name: NAME })}::jsonb, name_shown = false
      WHERE creature_id = (SELECT id FROM app.creatures WHERE user_id = ${u.userId}::uuid)`;
    const h = (await page(u.code).expect(200)).text;
    expect(h).not.toContain(NAME);
    expect(h).toContain('<title>몽망이 키우기</title>');
    expect(metaContent(h, 'og:title')).toBe('몽망이 키우기');
    // 같은 행에서 name_shown만 켜면 이름이 보인다(시험이 실제로 문을 보고 있다)
    await prisma.$executeRaw`UPDATE app.public_pages SET name_shown = true WHERE creature_id = (SELECT id FROM app.creatures WHERE user_id = ${u.userId}::uuid)`;
    expect((await page(u.code).expect(200)).text).toContain(`<title>${NAME}</title>`);
    await prisma.$executeRaw`UPDATE app.public_pages SET meta = meta - 'name', name_shown = false WHERE creature_id = (SELECT id FROM app.creatures WHERE user_id = ${u.userId}::uuid)`;
  });
});

describe('M1 — /m·/get·/seen 리밋(DB 조회 앞)', () => {
  const ipN = (n: number) => `1.1.1.1, 10.231.${n}.1, 35.0.0.1`;
  it('페이지 60/분: 61번째 429 no-store — 넘친 요청은 DB를 치지 않는다', async () => {
    const u = await user();
    await publish(u.d, { files: { loop: null } });
    for (let i = 0; i < 60; i++) await http().get(`/m/${u.code}`).set('x-forwarded-for', ipN(1)).expect(200);
    const spy = vi.spyOn(prisma, '$queryRaw');
    try {
      const r = await http().get(`/m/${u.code}`).set('x-forwarded-for', ipN(1)).expect(429);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
  it('사라진 링크 30/분: 31번째 429(살아남은 변이 m_gone)', async () => {
    for (let i = 0; i < 30; i++) await http().get('/m/ZZZZZZZ1').set('x-forwarded-for', ipN(2)).expect(200);
    expect((await http().get('/m/ZZZZZZZ1').set('x-forwarded-for', ipN(2)).expect(429)).headers['cache-control']).toBe('no-store');
  });
  it('비콘 30/분: 넘친 비콘은 204지만 세지 않는다(살아남은 변이 m_seen)', async () => {
    const u = await user();
    await publish(u.d, { files: { loop: null } });
    for (let i = 0; i < 35; i++) await http().post(`/m/${u.code}/seen`).set('x-forwarded-for', ipN(3)).expect(204);
    expect((await prisma.linkDaily.findFirstOrThrow({ where: { code: u.code, event: 'view' } })).count).toBe(30);
  });
  it('스토어 이동 30/분: 31번째 429, 센 값은 30', async () => {
    const u = await user();
    await publish(u.d, { files: { loop: null } });
    for (let i = 0; i < 30; i++) await http().get(`/m/${u.code}/get?p=ios`).set('x-forwarded-for', ipN(4)).expect(302);
    await http().get(`/m/${u.code}/get?p=ios`).set('x-forwarded-for', ipN(4)).expect(429);
    expect((await prisma.linkDaily.findFirstOrThrow({ where: { code: u.code, event: 'store_ios' } })).count).toBe(30);
  });
});

describe('M3·M4·M5·L9', () => {
  it('M3 공개 파일 캐시는 1시간 이하(처리방침 웹 캐시 최대 1시간)', async () => {
    const u = await user();
    await publish(u.d, { files: { loop: null } });
    const { page: p } = await pageRow(u.userId);
    const r = await http().get(pathOf(store.publicUrl(`${p.pathPrefix}/og.jpg`))).expect(200);
    expect(r.headers['cache-control']).toBe('public, max-age=3600');
  });
  it('M4 staging 경로는 commit으로 한 번만: 같은 판 다시 commit 409, 쓴 토큰 재사용 403, 남은 staging 행이 재업로드를 청소', async () => {
    const u = await user();
    const { put } = await publish(u.d, { files: { loop: null } });
    await as(u.d, http().post(`/api/v1/creature/page/${put.body.ver}/commit`)).send().expect(409);
    await upload(put.body.upload.og, GOOD.og).expect(403);
    const { page: p } = await pageRow(u.userId);
    // (Supabase 토큰이 재사용된다고 가정) staging에 다시 생긴 파일도 2시간 뒤 대기열이 지운다
    await store.put('page-staging', `${p.pathPrefix}/og.jpg`, GOOD.og, 'image/jpeg');
    const real = clock.now.bind(clock);
    clock.now = () => real() + 2 * 3_600_000 + 60_000;
    try {
      await gc.runDue();
    } finally {
      clock.now = real;
    }
    expect(await store.list('page-staging', p.pathPrefix!)).toEqual([]);
    expect(await store.list('public-pages', p.pathPrefix!)).toHaveLength(3); // 공개 판은 그대로
  });
  it('M5 격리 이동이 일부만 되면 대기 행이 남고, 재시도가 나머지를 옮긴다(공개 버킷 0)', async () => {
    const u = await user();
    await publish(u.d, { files: { loop: null } });
    const { page: p, creature } = await pageRow(u.userId);
    const orig = store.move.bind(store);
    store.move = (from, to, key) => (key.endsWith('poster.jpg') ? Promise.reject(new Error('이동 실패(시험)')) : orig(from, to, key));
    try {
      await pages.quarantine(creature.id);
    } finally {
      store.move = orig;
    }
    // og는 옮겨졌고 poster에서 멈춤 → 공개에 poster·snap이 남은 '일부만' 상태
    expect(await store.list('quarantine', p.pathPrefix!)).toEqual([`${p.pathPrefix}/og.jpg`]);
    expect(await store.list('public-pages', p.pathPrefix!)).toEqual([`${p.pathPrefix}/poster.jpg`, `${p.pathPrefix}/snap.json`]);
    expect((await prisma.storageGc.findMany({ where: { creatureId: creature.id, reason: 'quarantine_move' } })).length).toBe(1);
    const real = clock.now.bind(clock);
    clock.now = () => real() + 2 * 3_600_000;
    try {
      await gc.runDue();
    } finally {
      clock.now = real;
    }
    expect(await store.list('public-pages', p.pathPrefix!)).toEqual([]);
    expect(await store.list('quarantine', p.pathPrefix!)).toHaveLength(3);
    expect(await prisma.storageGc.count({ where: { creatureId: creature.id, reason: 'quarantine_move' } })).toBe(0);
  });
  it('L9 커밋하지 않은 판이 6시간 뒤 지워지면 pending 칸(이름 포함)도 비운다', async () => {
    const u = await user();
    await putPage(u.d, { nameVisible: true, name: '대기이' }).expect(200);
    const real = clock.now.bind(clock);
    clock.now = () => real() + 7 * 3_600_000;
    try {
      await gc.runDue();
    } finally {
      clock.now = real;
    }
    const { page: p } = await pageRow(u.userId);
    expect(p).toMatchObject({ pendingVer: null, pendingPrefix: null, pendingMeta: null });
    expect(await filesUnder(p.storeKey)).toEqual([]);
    expect(await traces(['대기이'])).toEqual({});
  });
});

// ───────────── 링크 코드 로그 0(PM 조건 ③) ─────────────

describe('로그 — 링크 코드·이름·pageKey 0', () => {
  it('이 파일의 모든 요청 뒤 로그 어디에도 인장 코드가 없다(route는 템플릿)', async () => {
    await new Promise((r) => setTimeout(r, 50));
    const all = logs.join('\n');
    expect(logs.length).toBeGreaterThan(20); // 로그를 실제로 받았는지
    expect(codesSeen.size).toBeGreaterThan(10);
    for (const c of codesSeen) expect(all, `코드 ${c}`).not.toContain(c);
    for (const n of [...usedNames, '숨은이름']) expect(all).not.toContain(n);
    const routes = new Set(logs.map((l) => (JSON.parse(l) as { req?: { route?: string } }).req?.route).filter(Boolean));
    expect([...routes]).toEqual(expect.arrayContaining(['/m/:code', '/m/:code/seen', '/m/:code/get', '/api/v1/creature/page']));
  });
});
