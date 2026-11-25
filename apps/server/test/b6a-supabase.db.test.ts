// B6a — 앱 전체를 STORAGE_DRIVER=supabase로 띄워 실제 Postgres + 가짜 Supabase(Storage 8184 → Auth 8185로 넘김)에서
// 공유 링크 켜기(서명 업로드 → commit 검사 → 공개 버킷)·격리·계정 삭제 연쇄가 local 드라이버와 같은 뜻인지 본다.
// 그럴듯한 오답: '계정 삭제는 DB만 지우면 끝' — 공개·지난 판·커밋 전·격리 네 곳 어디든 파일이 남으면 실패(흔적 0).
// 실제 Supabase에는 붙지 않는다.
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { logSink } from '../src/common/logging';
import type { Clock } from '../src/common/clock';
import type { CdnPurgeQueue, CountingInvalidator } from '../src/cdn/cdn-purge';
import type { GcService } from '../src/deletion/gc.service';
import type { PageService } from '../src/pages/page.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { BUCKET_POLICY, PUBLIC_FILE_CACHE, type Bucket } from '../src/storage/object-store';
import { SupabaseObjectStore } from '../src/storage/supabase-store';
import { CdnPurgeError } from '../src/cdn/firebase-invalidator';
import { SERVICE_KEY, startFakeSupabase, type FakeSupabase } from './fake-supabase';
import { startFakeStorage, type FakeStorage } from './fake-storage';
import { jpeg, mp4 } from './media-fixtures';

let app: NestFastifyApplication;
let prisma: PrismaService;
let auth: FakeSupabase;
let fake: FakeStorage;
let clock: Clock;
let pages: PageService;
let gc: GcService;
let cdn: CountingInvalidator;
let purge: CdnPurgeQueue;
const logs: string[] = [];
const SNAP_OK = JSON.parse(readFileSync(join(__dirname, '../../../packages/core/test/fixtures/snap/ok.json'), 'utf8')) as Record<string, unknown>;
const BUCKETS: Bucket[] = ['page-staging', 'public-pages', 'quarantine', 'ota-assets'];

beforeAll(async () => {
  logSink.stream = new Writable({
    write(chunk, _e, cb) {
      logs.push(...String(chunk).split('\n').filter(Boolean));
      cb();
    },
  });
  auth = await startFakeSupabase(8185);
  fake = await startFakeStorage(
    8184,
    Object.fromEntries(BUCKETS.map((b) => [b, { public: BUCKET_POLICY[b].public, file_size_limit: BUCKET_POLICY[b].fileSizeLimit, allowed_mime_types: BUCKET_POLICY[b].allowedMimeTypes ? [...BUCKET_POLICY[b].allowedMimeTypes] : null }])),
    auth.url,
    SERVICE_KEY,
  );
  Object.assign(process.env, {
    // Storage·Auth가 한 주소(실제 Supabase와 같다). 서비스 키도 하나
    SUPABASE_URL: fake.url,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    TRUSTED_PROXY_HOPS_API: '1',
    TRUSTED_PROXY_HOPS_WEB: '2',
    STORAGE_DRIVER: 'supabase',
    SITE_ORIGIN: 'https://mongmang.ink',
    LOG_LEVEL: 'info',
    RATE_LIMIT_PER_MIN: '10000',
  });
  const { createApp } = await import('../src/app.factory');
  const { Clock } = await import('../src/common/clock');
  const { PrismaService } = await import('../src/prisma/prisma.service');
  const { PageService } = await import('../src/pages/page.service');
  const { GcService } = await import('../src/deletion/gc.service');
  const { OBJECT_STORE } = await import('../src/storage/object-store');
  const { CDN_INVALIDATOR, CdnPurgeQueue } = await import('../src/cdn/cdn-purge');
  app = await createApp({ bufferLogs: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  prisma = app.get(PrismaService);
  clock = app.get(Clock);
  pages = app.get(PageService);
  gc = app.get(GcService);
  cdn = app.get(CDN_INVALIDATOR);
  purge = app.get(CdnPurgeQueue);
  expect(app.get(OBJECT_STORE)).toBeInstanceOf(SupabaseObjectStore);
});
afterAll(async () => {
  await app?.close();
  await fake?.close();
  await auth?.close();
  logSink.stream = undefined;
});

const http = () => request(app.getHttpServer());
let ipSeq = 0;
/** 이 시험의 SUPABASE_URL(가짜 Storage 주소)을 iss로 쓰는 익명 로그인 */
async function user() {
  const sub = crypto.randomUUID();
  auth.users.add(sub);
  const token = await auth.token({}, { sub, iss: `${fake.url}/auth/v1` });
  const ip = `10.${150 + ((++ipSeq >> 8) & 63)}.${ipSeq & 255}.7`;
  const as = (r: request.Test) => r.set('authorization', `Bearer ${token}`).set('x-forwarded-for', ip);
  const r = await as(http().post('/api/v1/me/bootstrap')).send({ ageGate: { v: 2, ok: true } }).expect(200);
  return { as, sub, userId: r.body.userId as string, code: r.body.creature.code as string };
}
type U = Awaited<ReturnType<typeof user>>;
const putPage = (u: U) =>
  u.as(http().put('/api/v1/creature/page')).send({
    snapshot: SNAP_OK,
    nameVisible: false,
    lang: 'ko',
    files: { poster: { contentType: 'image/jpeg', bytes: 5000 }, og: { contentType: 'image/jpeg', bytes: 5000 }, loop: { contentType: 'video/mp4', bytes: 5000 } },
  });
/** 앱이 하듯 서명 URL로 직접 PUT(서버를 거치지 않는다) */
const upload = (slot: { signedUrl: string; contentType: string }, body: Buffer, cacheControl?: string) =>
  fetch(slot.signedUrl, { method: 'PUT', headers: { 'content-type': slot.contentType, ...(cacheControl ? { 'cache-control': cacheControl } : {}) }, body });
async function publish(u: U) {
  const put = await putPage(u).expect(200);
  for (const [k, body] of [['poster', jpeg(1080, 1350)], ['og', jpeg(1200, 630)], ['loop', mp4()]] as const) {
    expect((await upload(put.body.upload[k], body, 'max-age=31536000, immutable')).status).toBe(200);
  }
  return u.as(http().post(`/api/v1/creature/page/${put.body.ver}/commit`)).send();
}
async function dirOf(userId: string) {
  const c = await prisma.creature.findUniqueOrThrow({ where: { userId }, include: { page: true } });
  return { creatureId: c.id, storeKey: c.page!.storeKey, live: c.page!.pathPrefix ? `${c.page!.storeKey}/${c.page!.pathPrefix}` : null, pending: c.page!.pendingPrefix ? `${c.page!.storeKey}/${c.page!.pendingPrefix}` : null };
}
/** 모든 버킷에서 이 접두 아래 파일 */
const filesUnder = (prefix: string) => BUCKETS.flatMap((b) => fake.keys(b).filter((k) => k.startsWith(`${prefix}/`)).map((k) => `${b}/${k}`));

describe('B6a Supabase 드라이버 — 앱 전체', () => {
  it('켜기: 서명 업로드 → commit 검사 → 공개 버킷, /m의 og:image는 Supabase 공개 주소이고 캐시는 local과 같은 1시간', async () => {
    const u = await user();
    expect((await publish(u)).status).toBe(200);
    const d = await dirOf(u.userId);
    expect(fake.keys('page-staging').filter((k) => k.startsWith(d.live!))).toEqual([]);
    expect(filesUnder(d.live!).sort()).toEqual(['loop.mp4', 'og.jpg', 'poster.jpg', 'snap.json'].map((f) => `public-pages/${d.live}/${f}`));
    const html = (await http().get(`/m/${u.code}`).set('x-forwarded-for', '1.1.1.1, 10.200.0.1, 35.0.0.1').expect(200)).text;
    const og = /property="og:image" content="([^"]+)"/.exec(html)?.[1];
    expect(og).toBe(`${fake.url}/storage/v1/object/public/public-pages/${d.live}/og.jpg`);
    const r = await fetch(og!);
    expect([r.status, r.headers.get('cache-control'), r.headers.get('content-type')]).toEqual([200, PUBLIC_FILE_CACHE, 'image/jpeg']);
  });

  it('JPEG 자리에 다른 내용을 올리면 commit이 막는다(버킷 상한이 json을 허용해도)', async () => {
    const u = await user();
    const put = await putPage(u).expect(200);
    await upload(put.body.upload.poster, jpeg(1080, 1350));
    // 유형 머리글을 속여 JSON을 og 자리에
    expect((await fetch(put.body.upload.og.signedUrl, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"x":1}' })).status).toBe(200);
    await upload(put.body.upload.loop, mp4());
    expect((await u.as(http().post(`/api/v1/creature/page/${put.body.ver}/commit`)).send()).status).toBe(422);
    expect(fake.keys('public-pages').filter((k) => k.startsWith((put.body.upload.og.signedUrl as string).split('/page-staging/')[1]!.split('/og.jpg')[0]!))).toEqual([]);
  });

  it('계정 삭제: 공개·지난 판(유예)·커밋 전·격리 — 모든 버킷에서 그 몽망이 접두 아래 0', async () => {
    const u = await user();
    expect((await publish(u)).status).toBe(200);
    const first = (await dirOf(u.userId)).live!;
    expect((await publish(u)).status).toBe(200);
    await putPage(u).expect(200);
    const d = await dirOf(u.userId);
    expect(filesUnder(first).length).toBeGreaterThan(0); // 지난 판은 2시간 유예 중
    expect(filesUnder(d.pending!).length).toBeGreaterThan(0); // 커밋 전 snap.json
    await u.as(http().delete('/api/v1/me')).expect(202);
    expect(filesUnder(d.storeKey)).toEqual([]);

    const q = await user();
    expect((await publish(q)).status).toBe(200);
    const qd = await dirOf(q.userId);
    await pages.quarantine(qd.creatureId);
    expect(filesUnder(qd.storeKey).every((k) => k.startsWith('quarantine/'))).toBe(true);
    expect((await fetch(`${fake.url}/storage/v1/object/public/public-pages/${qd.live}/og.jpg`)).status).not.toBe(200);
    await q.as(http().delete('/api/v1/me')).expect(202);
    expect(filesUnder(qd.storeKey)).toEqual([]);
  });

  it('Storage가 계정 삭제 중 죽어도 대기열이 남고, 살아난 뒤 cron이 마저 지워 0', async () => {
    const u = await user();
    expect((await publish(u)).status).toBe(200);
    const d = await dirOf(u.userId);
    for (let i = 0; i < 200; i++) fake.faults.push({ fault: 503, match: /^(POST|DELETE) \/storage\/v1\/object\/(list-v2\/|public-pages|page-staging|quarantine)/ });
    await u.as(http().delete('/api/v1/me')).expect(202);
    expect(filesUnder(d.storeKey).length).toBeGreaterThan(0);
    expect(await prisma.storageGc.count({ where: { prefix: { startsWith: d.storeKey } } })).toBeGreaterThan(0);
    fake.faults.length = 0;
    const now = clock.now;
    clock.now = () => now.call(clock) + 3 * 3600_000; // 재시도 시각을 지나
    try {
      await gc.runDue();
    } finally {
      clock.now = now;
    }
    expect(filesUnder(d.storeKey)).toEqual([]);
    expect(await prisma.storageGc.count({ where: { prefix: { startsWith: d.storeKey } } })).toBe(0);
  });

  // 리뷰 H1: 서명 업로드 URL(2시간)이 계정 삭제·새 PUT·끄기보다 오래 산다 — 그 뒤 옛 URL로 올린 파일이 영구히 남으면 안 된다
  async function afterHours(h: number, fn: () => Promise<unknown>) {
    const now = clock.now;
    clock.now = () => now.call(clock) + h * 3600_000;
    try {
      return await fn();
    } finally {
      clock.now = now;
    }
  }
  const tailRows = (dir: string) => prisma.storageGc.count({ where: { prefix: dir } });
  it.each([
    ['계정 삭제(DELETE /me)', (u: U) => u.as(http().delete('/api/v1/me')).expect(202)],
    ['커밋 전 새 PUT(버리기)', (u: U) => putPage(u).expect(200)],
    ['링크 끄기(DELETE /creature/page)', (u: U) => u.as(http().delete('/api/v1/creature/page')).expect(204)],
  ])('H1 %s 뒤 옛 서명 URL로 올린 파일도 꼬리 행이 2시간 15분 뒤 지운다(흔적 0)', async (_name, act) => {
    const u = await user();
    const put = await putPage(u).expect(200);
    const dir = (await dirOf(u.userId)).pending!;
    await act(u);
    expect(filesUnder(dir)).toEqual([]);
    // 늦게 도착한 업로드(다른 기기·느린 회선): URL은 아직 살아 있다
    expect((await upload(put.body.upload.og, jpeg(1200, 630))).status).toBe(200);
    expect(filesUnder(dir)).toEqual([`page-staging/${dir}/og.jpg`]);
    expect(await prisma.storageGc.count({ where: { prefix: dir, reason: 'upload_tail', creatureId: null, deletionId: null } })).toBe(1);
    await afterHours(2, () => gc.runDue()); // 아직 만료 전 — 그대로
    expect(filesUnder(dir).length).toBe(1);
    await afterHours(2.3, () => gc.runDue());
    expect(filesUnder(dir)).toEqual([]);
    expect(await tailRows(dir)).toBe(0);
  });
  it('H1 꼬리 행은 아직 커밋 대기 중인 판은 지우지 않는다(URL만 만료 — 6시간 안 commit은 된다)', async () => {
    const u = await user();
    const put = await putPage(u).expect(200);
    for (const [k, body] of [['poster', jpeg(1080, 1350)], ['og', jpeg(1200, 630)], ['loop', mp4()]] as const) await upload(put.body.upload[k], body);
    const dir = (await dirOf(u.userId)).pending!;
    await afterHours(2.5, () => gc.runDue());
    expect(filesUnder(dir).length).toBe(4);
    expect(await prisma.storageGc.count({ where: { prefix: dir, reason: 'upload_tail' } })).toBe(0);
    expect((await afterHours(2.5, () => u.as(http().post(`/api/v1/creature/page/${put.body.ver}/commit`)).send())) as { status: number }).toMatchObject({ status: 200 });
  });

  it('리뷰 M3: CDN 무효화가 느려도 링크 끄기 응답은 기다리지 않고, 무효화는 뒤에서 한 번 나간다', async () => {
    const u = await user();
    expect((await publish(u)).status).toBe(200);
    await purge.settle();
    await prisma.cdnPurge.update({ where: { id: 1 }, data: { requestedAt: null, releasedAt: null } });
    cdn.calls = 0;
    cdn.delayMs = 2500;
    try {
      const t = Date.now();
      await u.as(http().delete('/api/v1/creature/page')).expect(204);
      expect(Date.now() - t).toBeLessThan(1500);
      await purge.settle();
      expect(cdn.calls).toBe(1);
    } finally {
      cdn.delayMs = 0;
    }
  });

  it('리뷰 L1: CDN 무효화 실패 로그에 단계·상태가 실린다(403 release = 권한 부족)', async () => {
    await purge.settle();
    await prisma.cdnPurge.update({ where: { id: 1 }, data: { requestedAt: null, releasedAt: null } });
    const orig = cdn.purgeSite.bind(cdn);
    cdn.purgeSite = () => Promise.reject(new CdnPurgeError('release', 403));
    try {
      expect(await purge.request()).toBe('failed');
    } finally {
      cdn.purgeSite = orig;
    }
    const line = logs.filter((l) => l.includes('"cdn_purge_failed"')).at(-1)!;
    expect(JSON.parse(line)).toMatchObject({ type: 'CdnPurgeError', step: 'release', status: 403 });
  });

  it('로그에 Storage 주소·서비스 키·저장소 키가 없다', () => {
    const text = logs.join('\n');
    expect(text).not.toContain(SERVICE_KEY);
    expect(text).not.toContain('/storage/v1');
    expect(text).not.toMatch(/[0-9a-f]{32}\/[A-Za-z0-9_-]{22}/);
  });
});
