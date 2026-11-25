// Supabase Storage 드라이버 계약 시험(B6a) — 실제 Supabase에 붙지 않고 로컬 가짜 Storage 서버(fake-storage.ts, 포트 8181)로.
// ① 같은 계약 묶음을 local·supabase 두 드라이버에 똑같이 돌린다(삭제 완전성·옮기기·목록·Range·없음 처리가 같은 뜻인지)
// ② Supabase만의 것: 버킷 권한 대조, 서명 업로드(버킷 상한·1회·2시간 만료), 공개 주소의 Cache-Control, 재시도·제한 시간, 오류 분류,
//    옛 오류 꼴(400 + statusCode), 1000개 넘는 접두 지우기, 오류·요청에 키·URL·서비스 키가 새지 않음.
// 그럴듯한 오답: 'move = Storage move 한 번' — 그러면 앱이 서명 업로드 때 붙인 Cache-Control이 공개 파일에 그대로 남는다(공개 캐시 1시간 약속 깨짐).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { LocalObjectStore } from '../src/storage/local-store';
import { BUCKET_POLICY, PUBLIC_FILE_CACHE, type Bucket, type ObjectStore } from '../src/storage/object-store';
import { StorageError, SupabaseObjectStore } from '../src/storage/supabase-store';
import { startFakeStorage, STORAGE_SERVICE_KEY, type FakeBucket, type FakeStorage } from './fake-storage';

const PORT = 8181;
const STORE = '0123456789abcdef0123456789abcdef';
const OTHER = 'fedcba9876543210fedcba9876543210';
const PAGE = 'AbCdEfGhIjKlMnOpQrStUv';
const DIR = `${STORE}/${PAGE}`;
const OTA = 'A'.repeat(43);
const enc = (s: string) => new TextEncoder().encode(s);
const policy = (b: Bucket): FakeBucket => ({
  public: BUCKET_POLICY[b].public,
  file_size_limit: BUCKET_POLICY[b].fileSizeLimit,
  allowed_mime_types: BUCKET_POLICY[b].allowedMimeTypes ? [...BUCKET_POLICY[b].allowedMimeTypes] : null,
});
const goodBuckets = () => Object.fromEntries((['page-staging', 'public-pages', 'quarantine', 'ota-assets'] as Bucket[]).map((b) => [b, policy(b)]));

let fake: FakeStorage;
const sleeps: number[] = [];
function sb(o: { timeoutMs?: number; retries?: number; key?: string } = {}) {
  return new SupabaseObjectStore({
    url: fake.url,
    serviceKey: o.key ?? STORAGE_SERVICE_KEY,
    timeoutMs: o.timeoutMs ?? 2000,
    retries: o.retries,
    sleep: async (ms) => void sleeps.push(ms),
  });
}

beforeAll(async () => {
  fake = await startFakeStorage(PORT, goodBuckets());
});
afterAll(async () => {
  await fake?.close();
});
afterEach(() => {
  fake.objects.clear();
  fake.faults.length = 0;
  fake.requests.length = 0;
  fake.legacyErrors = false;
  fake.listPageMax = 1000;
  sleeps.length = 0;
  for (const [k, v] of Object.entries(goodBuckets())) fake.buckets.set(k, v);
});

// ① 같은 계약 — 두 드라이버
const drivers: Array<[string, () => ObjectStore]> = [
  ['local', () => new LocalObjectStore(mkdtempSync(join(tmpdir(), 'mong-b6a-')), 'http://localhost:9999')],
  ['supabase', () => sb()],
];
describe.each(drivers)('ObjectStore 계약 — %s', (_name, make) => {
  it('put → stat·read·readHead·openRead, 없는 파일은 null(readHead는 던짐)', async () => {
    const s = make();
    await s.put('page-staging', `${DIR}/snap.json`, enc('{"a":1}'), 'application/json');
    expect(await s.stat('page-staging', `${DIR}/snap.json`)).toEqual({ size: 7, contentType: 'application/json' });
    expect(new TextDecoder().decode((await s.read('page-staging', `${DIR}/snap.json`))!.body)).toBe('{"a":1}');
    expect(new TextDecoder().decode(await s.readHead('page-staging', `${DIR}/snap.json`, 3))).toBe('{"a');
    expect((await s.readHead('page-staging', `${DIR}/snap.json`, 100)).length).toBe(7); // 짧으면 있는 만큼
    const o = await s.openRead('page-staging', `${DIR}/snap.json`);
    const chunks: Buffer[] = [];
    for await (const c of o!.stream) chunks.push(Buffer.from(c as Uint8Array));
    expect([Buffer.concat(chunks).toString(), o!.size, o!.contentType]).toEqual(['{"a":1}', 7, 'application/json']);
    expect(await s.stat('page-staging', `${DIR}/og.jpg`)).toBeNull();
    expect(await s.read('page-staging', `${DIR}/og.jpg`)).toBeNull();
    expect(await s.openRead('page-staging', `${DIR}/og.jpg`)).toBeNull();
    await expect(s.readHead('page-staging', `${DIR}/og.jpg`, 4)).rejects.toThrow();
  });
  it('put은 덮어쓴다(같은 키 두 번)', async () => {
    const s = make();
    await s.put('ota-assets', OTA, enc('one'), 'application/javascript');
    await s.put('ota-assets', OTA, enc('second'), 'application/javascript');
    expect((await s.stat('ota-assets', OTA))?.size).toBe(6);
  });
  it('move: 원본 없음·대상 있음, 다시 불러도 성공, 둘 다 없으면 던짐', async () => {
    const s = make();
    await s.put('page-staging', `${DIR}/snap.json`, enc('{}'), 'application/json');
    await s.move('page-staging', 'public-pages', `${DIR}/snap.json`);
    expect(await s.list('page-staging', '')).toEqual([]);
    expect(await s.list('public-pages', '')).toEqual([`${DIR}/snap.json`]);
    expect((await s.stat('public-pages', `${DIR}/snap.json`))?.contentType).toBe('application/json');
    if (_name === 'supabase') await s.move('page-staging', 'public-pages', `${DIR}/snap.json`); // 재시도 안전(local rename은 해당 없음)
    await expect(s.move('page-staging', 'public-pages', `${DIR}/og.jpg`)).rejects.toThrow();
  });
  it('removePrefix: 판 폴더·몽망이 접두를 통째로, 다른 몽망이는 그대로, 없어도 성공', async () => {
    const s = make();
    const keys = [`${DIR}/og.jpg`, `${STORE}/BBBBBBBBBBBBBBBBBBBBBB/poster.jpg`, `${OTHER}/${PAGE}/og.jpg`];
    for (const k of keys) await s.put('public-pages', k, new Uint8Array(3), 'image/jpeg');
    expect(await s.list('public-pages', STORE)).toEqual([`${DIR}/og.jpg`, `${STORE}/BBBBBBBBBBBBBBBBBBBBBB/poster.jpg`]);
    expect(await s.list('public-pages', DIR)).toEqual([`${DIR}/og.jpg`]);
    await s.removePrefix('public-pages', DIR);
    expect(await s.list('public-pages', STORE)).toEqual([`${STORE}/BBBBBBBBBBBBBBBBBBBBBB/poster.jpg`]);
    await s.removePrefix('public-pages', STORE);
    expect(await s.list('public-pages', '')).toEqual([`${OTHER}/${PAGE}/og.jpg`]);
    await s.removePrefix('public-pages', STORE); // 이미 없음
  });
  it('키·접두 모양 밖은 거부(경로 조작)', async () => {
    const s = make();
    await expect(s.put('page-staging', '../../etc/passwd', enc('x'), 'image/jpeg')).rejects.toThrow();
    await expect(s.signUpload('page-staging', `${DIR}/x.html`, { contentType: 'image/jpeg', maxBytes: 1, ttlSec: 1 })).rejects.toThrow();
    await expect(s.removePrefix('public-pages', '')).rejects.toThrow(); // 버킷 통째 지우기 금지
    await expect(s.removePrefix('public-pages', PAGE)).rejects.toThrow();
    await expect(s.list('public-pages', '../x')).rejects.toThrow();
  });
});

describe('Supabase 드라이버 — 서명 업로드', () => {
  it('앱이 서명 URL로 한 번 PUT, 두 번째는 409(1회), 버킷 상한(600KB·jpeg/mp4)이 서명 업로드에도', async () => {
    const s = sb();
    const up = await s.signUpload('page-staging', `${DIR}/og.jpg`, { contentType: 'image/jpeg', maxBytes: 100, ttlSec: 300 });
    expect(up.signedUrl.startsWith(`${fake.url}/storage/v1/object/upload/sign/page-staging/${DIR}/og.jpg?token=`)).toBe(true);
    expect(up.token.length).toBeGreaterThan(10);
    const put = (url: string, type: string, n: number) => fetch(url, { method: 'PUT', headers: { 'content-type': type }, body: new Uint8Array(n) });
    expect((await put(up.signedUrl, 'image/jpeg', 50)).status).toBe(200);
    expect((await put(up.signedUrl, 'image/jpeg', 50)).status).toBe(409);
    // 앱이 PUT에 x-upsert를 붙여도 덮어쓸 수 없다(upsert는 발급 때 토큰에 묶임 — 드라이버는 발급에 x-upsert를 주지 않는다, 리뷰 L2)
    expect((await fetch(up.signedUrl, { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-upsert': 'true' }, body: new Uint8Array(9) })).status).toBe(409);
    expect(fake.objects.get(`page-staging/${DIR}/og.jpg`)?.body.length).toBe(50);
    const big = await s.signUpload('page-staging', `${DIR}/loop.mp4`, { contentType: 'video/mp4', maxBytes: 10_000_000, ttlSec: 300 });
    expect((await put(big.signedUrl, 'video/mp4', 600 * 1024 + 1)).status).toBe(413);
    expect((await put(big.signedUrl, 'text/html', 10)).status).toBe(415);
    // 만료는 Supabase 2시간 고정(ttlSec를 지킬 수 없음 — DECISIONS B6a): 2시간 뒤에는 거부
    const late = await s.signUpload('page-staging', `${DIR}/poster.jpg`, { contentType: 'image/jpeg', maxBytes: 100, ttlSec: 300 });
    fake.setNow(Date.now() + 2 * 3600_000 + 1000);
    expect((await put(late.signedUrl, 'image/jpeg', 10)).status).toBe(400);
    fake.setNow(Date.now());
    expect(fake.keys('page-staging')).toEqual([`${DIR}/og.jpg`]);
  });
});

describe('Supabase 드라이버 — 공개 링크 캐시와 버킷 권한', () => {
  it('공개 파일 Cache-Control은 local과 같은 값 — 앱이 붙인 머리글이 아니라 옮길 때 서버가 정한다', async () => {
    const s = sb();
    const up = await s.signUpload('page-staging', `${DIR}/og.jpg`, { contentType: 'image/jpeg', maxBytes: 100, ttlSec: 300 });
    await fetch(up.signedUrl, { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'cache-control': 'max-age=31536000, immutable' }, body: new Uint8Array(5) });
    expect((await fetch(`${fake.url}/storage/v1/object/public/page-staging/${DIR}/og.jpg`)).status).not.toBe(200); // 커밋 전 공개 주소 없음
    await s.move('page-staging', 'public-pages', `${DIR}/og.jpg`);
    await s.put('public-pages', `${DIR}/snap.json`, enc('{}'), 'application/json');
    for (const f of ['og.jpg', 'snap.json']) {
      const url = s.publicUrl(`${DIR}/${f}`);
      expect(url).toBe(`${fake.url}/storage/v1/object/public/public-pages/${DIR}/${f}`);
      const r = await fetch(url);
      expect([r.status, r.headers.get('cache-control')]).toEqual([200, PUBLIC_FILE_CACHE]);
    }
    expect(s.publicOrigin).toBe(fake.url);
    expect(() => s.publicUrl('../x')).toThrow(); // 공개 주소도 키 모양만(local은 부르는 쪽 pageDir 검사에 기댐)
    // 격리로 옮기면 공개 주소에서 사라지고 비공개 캐시 값
    await s.move('public-pages', 'quarantine', `${DIR}/og.jpg`);
    expect((await fetch(s.publicUrl(`${DIR}/og.jpg`))).status).not.toBe(200);
    expect(fake.objects.get(`quarantine/${DIR}/og.jpg`)?.cacheControl).toBe('private, no-store');
    expect(fake.objects.get(`quarantine/${DIR}/og.jpg`)?.contentType).toBe('image/jpeg');
  });
  it('checkBuckets: 정본대로면 빈 목록, 공개 여부·상한·없음은 이름과 항목만', async () => {
    expect(await sb().checkBuckets()).toEqual([]);
    fake.buckets.set('quarantine', { public: true, file_size_limit: null, allowed_mime_types: null });
    fake.buckets.set('page-staging', { public: false, file_size_limit: null, allowed_mime_types: ['application/json', 'image/jpeg', 'video/mp4'] });
    fake.buckets.delete('ota-assets');
    expect(await sb().checkBuckets()).toEqual(['page-staging: file_size_limit은 614400이어야 함', 'quarantine: public은 false여야 함', 'ota-assets: 없음']);
  });
  it('서비스 키가 틀리면 unauthorized(재시도 안 함)', async () => {
    const e = await sb({ key: 'wrong-key-0000000000000000' }).stat('page-staging', `${DIR}/og.jpg`).catch((x: unknown) => x);
    // HEAD 403 → 분류 unauthorized
    expect(e).toBeInstanceOf(StorageError);
    expect((e as StorageError).code).toBe('unauthorized');
    expect(sleeps).toEqual([]);
  });
});

describe('Supabase 드라이버 — 재시도·제한 시간·오류 분류', () => {
  it('5xx·429·연결 끊김은 다시 시도(지수 백오프), 횟수를 넘으면 unavailable', async () => {
    const s = sb();
    fake.faults.push({ fault: 503 }, { fault: 'reset' });
    await s.put('public-pages', `${DIR}/snap.json`, enc('{}'), 'application/json');
    expect(sleeps).toEqual([200, 400]);
    sleeps.length = 0;
    fake.faults.push({ fault: 429 }, { fault: 500 }, { fault: 502 });
    const e = await s.list('public-pages', STORE).catch((x: unknown) => x);
    expect([(e as StorageError).code, (e as StorageError).status, sleeps]).toEqual(['unavailable', 502, [200, 400]]);
  });
  it('응답이 멈추면 제한 시간 뒤 timeout(재시도 포함)', async () => {
    const s = sb({ timeoutMs: 150, retries: 1 });
    fake.faults.push({ fault: 'hang' }, { fault: 'hang' });
    const t = Date.now();
    const e = await s.stat('page-staging', `${DIR}/og.jpg`).catch((x: unknown) => x);
    expect((e as StorageError).code).toBe('timeout');
    expect(Date.now() - t).toBeLessThan(2000);
  });
  it('4xx는 다시 시도하지 않는다(409·413·415·400)', async () => {
    const s = sb();
    fake.buckets.set('page-staging', { public: false, file_size_limit: 10, allowed_mime_types: ['image/jpeg'] });
    const big = await s.put('page-staging', `${DIR}/og.jpg`, new Uint8Array(11), 'image/jpeg').catch((x: unknown) => x);
    const type = await s.put('page-staging', `${DIR}/og.jpg`, new Uint8Array(1), 'text/html').catch((x: unknown) => x);
    expect([(big as StorageError).code, (type as StorageError).code]).toEqual(['too_large', 'unsupported_type']);
    expect(sleeps).toEqual([]);
  });
  it('옛 오류 꼴(HTTP 400 + statusCode "404")도 없음으로 본다', async () => {
    const s = sb();
    fake.legacyErrors = true;
    expect(await s.stat('page-staging', `${DIR}/og.jpg`)).toBeNull();
    expect(await s.read('page-staging', `${DIR}/og.jpg`)).toBeNull();
    expect(await s.openRead('ota-assets', OTA)).toBeNull();
    const e = await s.readHead('page-staging', `${DIR}/og.jpg`, 4).catch((x: unknown) => x);
    expect((e as StorageError).code).toBe('not_found');
    await s.removePrefix('public-pages', DIR);
  });
  it('빈 파일의 readHead는 0바이트(416)', async () => {
    const s = sb();
    await s.put('public-pages', `${DIR}/snap.json`, new Uint8Array(), 'application/json');
    expect((await s.readHead('public-pages', `${DIR}/snap.json`, 8)).length).toBe(0);
  });
});

describe('Supabase 드라이버 — 삭제 완전성(흔적 0)', () => {
  it('목록이 여러 쪽이고 1000개가 넘어도 접두 아래를 모두 지운다', async () => {
    const s = sb();
    fake.listPageMax = 7;
    for (let i = 0; i < 1203; i++) {
      const page = `P${String(i).padStart(21, '0')}`;
      fake.objects.set(`public-pages/${STORE}/${page}/og.jpg`, { body: Buffer.alloc(1), contentType: 'image/jpeg', cacheControl: PUBLIC_FILE_CACHE });
    }
    fake.objects.set(`public-pages/${OTHER}/${PAGE}/og.jpg`, { body: Buffer.alloc(1), contentType: 'image/jpeg', cacheControl: PUBLIC_FILE_CACHE });
    expect((await s.list('public-pages', STORE)).length).toBe(1203);
    await s.removePrefix('public-pages', STORE);
    expect(fake.keys('public-pages')).toEqual([`${OTHER}/${PAGE}/og.jpg`]);
    expect(fake.requests.filter((r) => r.startsWith('DELETE')).length).toBe(2); // 1000 + 203
  });
  it('지우는 중 실패하면 던지고(대기열이 다시), 다시 부르면 남은 것까지 0', async () => {
    const s = sb({ retries: 0 });
    for (const f of ['og.jpg', 'poster.jpg', 'snap.json']) await s.put('public-pages', `${DIR}/${f}`, new Uint8Array(1), 'image/jpeg');
    fake.faults.push({ fault: 500, match: /^DELETE / });
    await expect(s.removePrefix('public-pages', DIR)).rejects.toBeInstanceOf(StorageError);
    expect(fake.keys('public-pages').length).toBe(3);
    await s.removePrefix('public-pages', DIR);
    expect(fake.keys('public-pages')).toEqual([]);
  });
  it('지우기가 200을 주고 실제로 안 지우면(조용한 실패) 성공으로 넘기지 않는다(리뷰 L3)', async () => {
    const s = sb();
    await s.put('public-pages', `${DIR}/og.jpg`, new Uint8Array(1), 'image/jpeg');
    for (let i = 0; i < 10; i++) fake.faults.push({ fault: 'ghost', match: /^DELETE / });
    await expect(s.removePrefix('public-pages', DIR)).rejects.toMatchObject({ code: 'unavailable', op: 'removePrefix' });
    expect(fake.keys('public-pages')).toEqual([`${DIR}/og.jpg`]);
  });
  it('move가 복사 뒤 원본 지우기에서 실패해도 다시 부르면 원본 0·대상 1', async () => {
    const s = sb({ retries: 0 });
    await s.put('page-staging', `${DIR}/snap.json`, enc('{}'), 'application/json');
    fake.faults.push({ fault: 503, match: /^DELETE / });
    await expect(s.move('page-staging', 'public-pages', `${DIR}/snap.json`)).rejects.toBeInstanceOf(StorageError);
    await s.move('page-staging', 'public-pages', `${DIR}/snap.json`);
    expect([fake.keys('page-staging'), fake.keys('public-pages')]).toEqual([[], [`${DIR}/snap.json`]]);
  });
});

describe('Supabase 드라이버 — 새는 것 없음', () => {
  it('오류 메시지·이름에 키·storeKey·pageKey·주소·서비스 키가 없다', async () => {
    const s = sb({ retries: 0 });
    const errs: unknown[] = [];
    fake.faults.push({ fault: 500 }, { fault: 'reset' });
    errs.push(await s.put('public-pages', `${DIR}/og.jpg`, enc('x'), 'image/jpeg').catch((x: unknown) => x));
    errs.push(await s.list('public-pages', STORE).catch((x: unknown) => x));
    errs.push(await s.move('page-staging', 'public-pages', `${DIR}/og.jpg`).catch((x: unknown) => x));
    errs.push(await s.put('public-pages', '../x', enc('x'), 'image/jpeg').catch((x: unknown) => x));
    errs.push(await sb({ key: 'bad-service-key-000000000000' }).read('page-staging', `${DIR}/og.jpg`).catch((x: unknown) => x));
    for (const e of errs) {
      expect(e).toBeInstanceOf(StorageError);
      const text = `${String(e)} ${(e as Error).stack ?? ''} ${JSON.stringify(e)}`;
      for (const secret of [STORE, PAGE, fake.url, '127.0.0.1', STORAGE_SERVICE_KEY, 'bad-service-key', 'og.jpg']) expect(text).not.toContain(secret);
    }
  });
  it('서비스 키는 머리글로만 간다(요청 경로·질의에 없음)', async () => {
    await sb().put('public-pages', `${DIR}/og.jpg`, enc('x'), 'image/jpeg');
    expect(fake.requests.join('\n')).not.toContain(STORAGE_SERVICE_KEY);
  });
});
