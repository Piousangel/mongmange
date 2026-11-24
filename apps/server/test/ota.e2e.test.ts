// V21 자체 OTA e2e(실제 Nest 앱 + 로컬 파일 저장소, DB는 메모리 가짜 — 실제 Postgres·롤 권한은 ota.db.test.ts).
// 그럴듯한 오답 판별(OPERATING 8-1):
//  - 응답이 '비슷한' multipart여도 명세 파트 머리·Manifest 꼴·서명 검증 중 하나라도 어긋나면 실패
//  - 다른 런타임·채널의 판을 내보내면 실패 / 이미 실행 중인 판을 다시 내보내면 실패
//  - preview 키로 서명한 판이 production 인증서로 검증되면 실패 / 옛 서명 원문을 새 행에 넣어 다시 내밀 때 내보내면 실패(재생)
//  - 되돌린 번들·에셋이 없는 판을 내보내면 실패 / 에셋을 메모리에 통째로 올리면 실패(스트림)
//  - 설치 id·실패 id·오류 텍스트·IP·UA가 로그(pino·stdout·console) 어디에든 한 번이라도 남으면 실패
//  - XFF 왼쪽 위조로 OTA 레이트 리밋 키를 새로 만들 수 있으면 실패
import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { logSink } from '../src/common/logging';
import { OtaService } from '../src/ota/ota.service';
import { assetHash, manifestSchema, signBody, verifyBody } from '../src/ota/protocol';
import { publishRollback, publishUpdate, republish, type OtaDb } from '../src/ota/publish';
import { PrismaService } from '../src/prisma/prisma.service';
import { BUCKETS, OBJECT_STORE, type ObjectStore } from '../src/storage/object-store';
import { appHeaders, keysFor, makeExport, parseMultipart, parseSig, SECRET, signerFor } from './ota-fixtures';
import { startApp } from './support';

type Row = Parameters<OtaDb['otaRelease']['create']>[0]['data'];
const rows: Row[] = [];
const revoked = new Set<string>();
const latestOf = (w: { channel: string; runtimeVersion: string; platform: string }) =>
  rows.filter((r) => r.channel === w.channel && r.runtimeVersion === w.runtimeVersion && r.platform === w.platform).sort((a, b) => b.seq - a.seq)[0] ?? null;
const db: OtaDb = {
  otaRelease: { findFirst: async (a) => latestOf(a.where), create: async ({ data }) => rows.push({ ...data }) },
  otaRevoked: {
    findUnique: async ({ where }) => (revoked.has(where.launchHash) ? { launchHash: where.launchHash } : null),
    create: async ({ data }) => revoked.add(data.launchHash),
  },
};
const logs: string[] = [];
const stdout: string[] = [];
const storeDir = mkdtempSync(join(tmpdir(), 'mong-ota-store-'));
const BASE = 'https://ota.example/api/v1/ota/assets';
let app: NestFastifyApplication;
let store: ObjectStore;
let svc: OtaService;
let t0 = Date.UTC(2026, 11, 1);
const restore: Array<() => void> = [];

beforeAll(async () => {
  logSink.stream = new Writable({
    write(chunk, _enc, cb) {
      logs.push(...String(chunk).split('\n').filter(Boolean));
      cb();
    },
  });
  // stdout·console로 새는 길도 본다(리뷰 M1: console.log 변이가 살아남았다). stdout 원래 출력은 그대로 흘려보낸다
  const ow = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((c: string | Uint8Array, ...a: unknown[]) => (stdout.push(String(c)), ow(c, ...(a as [])))) as typeof process.stdout.write;
  restore.push(() => (process.stdout.write = ow));
  for (const k of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const o = console[k];
    console[k] = (...a: unknown[]) => void stdout.push(a.map(String).join(' '));
    restore.push(() => (console[k] = o));
  }
  // OTA 그룹 hops는 WEB 값(2 — Firebase 리라이트 → Cloud Run)을 따른다. api는 1
  app = await startApp({ LOG_LEVEL: 'info', STORAGE_DRIVER: 'local', STORAGE_LOCAL_DIR: storeDir, TRUSTED_PROXY_HOPS_API: '1', TRUSTED_PROXY_HOPS_WEB: '2' });
  store = app.get<ObjectStore>(OBJECT_STORE);
  svc = app.get(OtaService);
  // 메모리 가짜 DB: 서비스가 부르는 꼴 그대로
  const prisma = app.get(PrismaService);
  Object.defineProperty(prisma, 'otaRelease', { configurable: true, value: { findFirst: async (a: { where: { channel: string; runtimeVersion: string; platform: string } }) => latestOf(a.where) } });
  Object.defineProperty(prisma, 'otaRevoked', { configurable: true, value: { findUnique: async (a: { where: { launchHash: string } }) => (revoked.has(a.where.launchHash) ? { launchHash: a.where.launchHash } : null) } });
});
afterAll(async () => {
  await app?.close();
  logSink.stream = undefined;
  for (const r of restore) r();
});

const http = () => request(app.getHttpServer());
const binary = (r: request.Test) => r.buffer(true).parse((res, cb) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
});
/** 에셋은 Fastify inject로(supertest는 br·gzip을 몰래 풀어 버린다 — 받은 그대로의 바이트를 봐야 한다) */
async function inject(url: string, acceptEncoding: string) {
  return app.getHttpAdapter().getInstance().inject({ method: 'GET', url, headers: { 'accept-encoding': acceptEncoding, 'x-forwarded-for': SECRET.ip, 'eas-client-id': SECRET.clientId } });
}
function manifestReq(h: Record<string, string>) {
  svc.clearCache();
  return binary(http().get('/api/v1/ota/manifest').set(h));
}
const partOf = (r: request.Response) => parseMultipart(r.headers['content-type']!, r.body as Buffer)[0]!;
async function publish(o: { channel?: string; runtime?: string; platform?: 'ios' | 'android'; tag?: string; signed?: boolean } = {}) {
  t0 += 60_000;
  const channel = o.channel ?? 'preview';
  return publishUpdate(db, store, {
    distDir: makeExport(o.tag ?? 'a'),
    platform: o.platform ?? 'android',
    channel,
    runtimeVersion: o.runtime ?? 'rv1',
    assetBaseUrl: BASE,
    signer: o.signed === false ? null : signerFor(channel),
    now: new Date(t0),
  });
}

describe('매니페스트(명세 Response)', () => {
  it('200 multipart: 공통 헤더·파트 머리·Manifest 꼴·서명이 그 채널 인증서로 검증된다(keyid = 채널, metadata = 판 번호·채널)', async () => {
    const pub = await publish();
    const r = await manifestReq(appHeaders()).expect(200);
    expect(r.headers['expo-protocol-version']).toBe('1');
    expect(r.headers['expo-sfv-version']).toBe('0');
    expect(r.headers['cache-control']).toBe('private, max-age=0');
    expect(r.headers['expo-server-defined-headers']).toBeUndefined();
    expect(r.headers['expo-manifest-filters']).toBeUndefined();
    const parts = parseMultipart(r.headers['content-type']!, r.body as Buffer);
    expect(parts).toHaveLength(1);
    const [p] = parts;
    expect(p!.headers['content-disposition']).toBe('form-data; name="manifest"');
    expect(p!.headers['content-type']).toMatch(/^application\/json/);
    const m = manifestSchema.parse(JSON.parse(p!.body));
    expect(m.id).toBe(pub.id);
    expect(m.metadata).toEqual({ seq: '1', channel: 'preview' });
    expect(m.assets).toHaveLength(2);
    const sig = parseSig(p!.headers['expo-signature']!);
    expect(sig.keyid).toBe('preview');
    expect(verifyBody(p!.body, sig.sig!, keysFor('preview').publicKeyPem)).toBe(true);
  });
  it('accept가 JSON뿐이면 본문 = 매니페스트, expo-signature는 응답 헤더', async () => {
    const r = await manifestReq(appHeaders({ accept: 'application/expo+json' })).expect(200);
    expect(r.headers['content-type']).toMatch(/^application\/expo\+json/);
    const body = (r.body as Buffer).toString('utf8');
    expect(manifestSchema.safeParse(JSON.parse(body)).success).toBe(true);
    expect(verifyBody(body, parseSig(r.headers['expo-signature']!).sig!, keysFor('preview').publicKeyPem)).toBe(true);
  });
  it('잘못된 런타임·다른 채널·다른 플랫폼·채널 없음 → 204(본문·content-type 없음, 공통 헤더는 있음)', async () => {
    for (const h of [appHeaders({ runtime: 'rv-other' }), appHeaders({ channel: 'production' }), appHeaders({ platform: 'ios' }), appHeaders({ channel: '' })]) {
      const r = await manifestReq(h).expect(204);
      expect(r.headers['content-type']).toBeUndefined();
      expect(r.headers['expo-protocol-version']).toBe('1');
      expect(r.headers['cache-control']).toBe('private, max-age=0');
    }
  });
  it('이미 그 판을 실행 중이면 204, 더 새 판이 나오면 그 판', async () => {
    const a = await publish({ tag: 'b' });
    await manifestReq(appHeaders({ current: a.id })).expect(204);
    const b = await publish({ tag: 'c' });
    const r = await manifestReq(appHeaders({ current: a.id })).expect(200);
    expect(JSON.parse(partOf(r).body).id).toBe(b.id);
  });
  it('형식 오류: 플랫폼 web → 400, 프로토콜 0 → 406, accept text/html → 406', async () => {
    await manifestReq(appHeaders({ platform: 'web' })).expect(400);
    await manifestReq({ ...appHeaders(), 'expo-protocol-version': '0' }).expect(406);
    await manifestReq(appHeaders({ accept: 'text/html' })).expect(406);
  });
  it('서명 없는 판은 운영 기본값에서 내보내지 않는다(204). 개발 허용이어도 앱이 서명을 기대하면 204', async () => {
    await publish({ channel: 'dev', signed: false });
    await manifestReq(appHeaders({ channel: 'dev', sign: false })).expect(204);
    (svc as unknown as { allowUnsigned: boolean }).allowUnsigned = true;
    try {
      await manifestReq(appHeaders({ channel: 'dev' })).expect(204);
      const r = await manifestReq(appHeaders({ channel: 'dev', sign: false })).expect(200);
      expect(partOf(r).headers['expo-signature']).toBeUndefined();
    } finally {
      (svc as unknown as { allowUnsigned: boolean }).allowUnsigned = false;
    }
  });
});

describe('채널 결속·재생 막기(리뷰 M3)', () => {
  it('preview 키 서명은 production 인증서로 검증되지 않고, production 채널에 preview 키로는 게시할 수 없다', async () => {
    const pv = await publish({ channel: 'preview', tag: 'm3' });
    const pr = await manifestReq(appHeaders({ channel: 'preview' })).expect(200);
    const sig = parseSig(partOf(pr).headers['expo-signature']!).sig!;
    expect(verifyBody(partOf(pr).body, sig, keysFor('preview').publicKeyPem)).toBe(true);
    expect(verifyBody(partOf(pr).body, sig, keysFor('production').publicKeyPem)).toBe(false);
    await expect(publishUpdate(db, store, { distDir: makeExport('m3'), platform: 'android', channel: 'production', runtimeVersion: 'rv1', assetBaseUrl: BASE, signer: signerFor('preview') })).rejects.toThrow(/그 채널의 키/);
    // 같은 판을 production으로 내는 길 = production 키로 다시 서명(republish)
    const from = rows.find((r) => r.id === pv.id)!;
    const again = await republish(db, store, { from, channel: 'production', signer: signerFor('production') });
    const prod = await manifestReq(appHeaders({ channel: 'production' })).expect(200);
    const pm = manifestSchema.parse(JSON.parse(partOf(prod).body));
    expect(pm.id).toBe(again.id);
    expect(pm.metadata).toEqual({ seq: '1', channel: 'production' });
    expect(verifyBody(partOf(prod).body, parseSig(partOf(prod).headers['expo-signature']!).sig!, keysFor('production').publicKeyPem)).toBe(true);
  });
  it('옛 판의 서명 원문을 더 큰 판 번호 행에 넣어 다시 내밀면 내보내지 않는다(204)', async () => {
    const old = await publish({ channel: 'replay', tag: 'r1' });
    await publish({ channel: 'replay', tag: 'r2' });
    const oldRow = rows.find((r) => r.id === old.id)!;
    rows.push({ ...oldRow, id: randomUUID(), seq: 3 });
    await manifestReq(appHeaders({ channel: 'replay' })).expect(204);
    // 다른 채널 원문을 넣어도
    const pv = rows.find((r) => r.channel === 'preview')!;
    rows.push({ ...pv, id: randomUUID(), channel: 'replay', seq: 4 });
    await manifestReq(appHeaders({ channel: 'replay' })).expect(204);
  });
});

describe('롤백(rollBackToEmbedded)·되돌린 번들', () => {
  it('롤백 지시 → 서명된 directive(판 번호·채널 결속), 되돌린 번들은 republish·재게시 거부, 서버도 내보내지 않는다', async () => {
    const bad = await publish({ channel: 'rb', tag: 'd' });
    t0 += 60_000;
    const rb = await publishRollback(db, { platform: 'android', channel: 'rb', runtimeVersion: 'rv1', signer: signerFor('rb'), now: new Date(t0) });
    expect(rb.revoked).toBe(bad.manifest.launchAsset.hash);
    const r = await manifestReq(appHeaders({ channel: 'rb', current: bad.id })).expect(200);
    const p = partOf(r);
    expect(p.headers['content-disposition']).toBe('form-data; name="directive"');
    expect(JSON.parse(p.body)).toEqual({ type: 'rollBackToEmbedded', parameters: { commitTime: new Date(t0).toISOString() }, extra: { seq: '2', channel: 'rb' } });
    expect(verifyBody(p.body, parseSig(p.headers['expo-signature']!).sig!, keysFor('rb').publicKeyPem)).toBe(true);
    await manifestReq(appHeaders({ channel: 'rb', current: SECRET.embeddedId })).expect(204);
    await manifestReq(appHeaders({ channel: 'rb', accept: 'application/json' })).expect(406);
    // 나쁜 번들을 다시 내밀기: CLI 경로 둘 다 거부
    const badRow = rows.find((x) => x.id === bad.id)!;
    await expect(republish(db, store, { from: badRow, channel: 'rb', signer: signerFor('rb') })).rejects.toThrow(/되돌린 번들/);
    await expect(publish({ channel: 'rb', tag: 'd' })).rejects.toThrow(/되돌린 번들/);
    // 키를 쥔 쪽이 CLI를 거치지 않고 올바르게 서명한 새 판 번호 행을 넣어도 서버가 거른다
    const forgedId = randomUUID();
    const body = JSON.stringify({ ...(JSON.parse(badRow.body) as object), id: forgedId, metadata: { seq: '3', channel: 'rb' } });
    rows.push({ ...badRow, id: forgedId, seq: 3, body, signature: signBody(body, keysFor('rb').privateKeyPem) });
    await manifestReq(appHeaders({ channel: 'rb' })).expect(204);
    rows.pop();
    // 고친 번들은 판 번호가 더 커서 이긴다
    const fixed = await publish({ channel: 'rb', tag: 'e' });
    const r2 = await manifestReq(appHeaders({ channel: 'rb', current: SECRET.embeddedId })).expect(200);
    expect(JSON.parse(partOf(r2).body).id).toBe(fixed.id);
  });
});

describe('에셋(명세 Asset response)', () => {
  it('원본·br·gzip: content-type·content-length·immutable 캐시·vary, 받은 바이트의 SHA-256 = 매니페스트 hash', async () => {
    await publish({ channel: 'as', tag: 'f' });
    const r = await manifestReq(appHeaders({ channel: 'as' })).expect(200);
    const m = manifestSchema.parse(JSON.parse(partOf(r).body));
    for (const a of [m.launchAsset, ...m.assets]) {
      const path = new URL(a.url).pathname;
      const raw = await inject(path, 'identity');
      expect(raw.statusCode).toBe(200);
      expect(raw.headers['content-type']).toBe(a.contentType);
      expect(raw.headers['content-length']).toBe(String(raw.rawPayload.length));
      expect(raw.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(raw.headers['content-encoding']).toBeUndefined();
      expect(assetHash(raw.rawPayload)).toBe(a.hash);
      const br = await inject(path, 'br, gzip');
      expect(br.headers['content-encoding']).toBe('br');
      expect(br.headers.vary).toBe('accept-encoding');
      expect(assetHash(brotliDecompressSync(br.rawPayload))).toBe(a.hash);
      const gz = await inject(path, 'gzip');
      expect(gz.headers['content-encoding']).toBe('gzip');
      expect(assetHash(gunzipSync(gz.rawPayload))).toBe(a.hash);
    }
  });
  it('큰 파일(32MB)은 스트림으로 — 서버는 파일 전체 읽기(read)를 부르지 않는다', async () => {
    const big = randomBytes(32 * 1024 * 1024);
    const h = assetHash(big);
    await store.put(BUCKETS.ota, h, big, 'application/octet-stream');
    const orig = store.read.bind(store);
    let fullReads = 0;
    store.read = async (...a) => (fullReads++, orig(...a));
    try {
      const res = await inject(`/api/v1/ota/assets/${h}`, 'identity');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-length']).toBe(String(big.length));
      expect(assetHash(res.rawPayload)).toBe(h);
      expect(fullReads).toBe(0);
    } finally {
      store.read = orig;
    }
  });
  it('압축 판이 깨져 있으면 게시 관문이 거부한다(서버는 내보낼 때 다시 해시하지 않으므로 게시가 관문)', async () => {
    const pub = await publish({ channel: 'tamper', tag: 'g' });
    writeFileSync(join(storeDir, 'ota-assets', `${pub.manifest.launchAsset.hash}.br`), Buffer.from('garbage'));
    await expect(republish(db, store, { from: rows.find((x) => x.id === pub.id)!, channel: 'tamper', signer: signerFor('tamper') })).rejects.toThrow(/에셋 해시 불일치/);
  });
  it('저장소에 에셋이 없는 판은 매니페스트도 내보내지 않는다(리뷰 L4)', async () => {
    const pub = await publish({ channel: 'gone', tag: 'h' });
    await manifestReq(appHeaders({ channel: 'gone' })).expect(200);
    rmSync(join(storeDir, 'ota-assets', pub.manifest.assets[1]!.hash));
    await manifestReq(appHeaders({ channel: 'gone' })).expect(204);
  });
  it('모양 밖 해시·없는 해시 → 404', async () => {
    await http().get('/api/v1/ota/assets/..%2F..%2Fetc').expect(404);
    await http().get(`/api/v1/ota/assets/${'A'.repeat(43)}`).expect(404);
  });
});

describe('레이트 리밋(OTA 그룹 — Firebase 리라이트 hops)', () => {
  it('매니페스트는 IP 접두당 분당 60. XFF 왼쪽을 바꿔도(위조) 같은 키, 다른 실제 클라이언트는 따로', async () => {
    const h = (spoof: string, client: string) => ({ ...appHeaders({ channel: 'rl' }), 'x-forwarded-for': `${spoof}, ${client}, 35.191.0.9` });
    for (let i = 0; i < 60; i++) await manifestReq(h(`10.0.${i}.1`, '198.51.100.7')).expect(204);
    await manifestReq(h('10.9.9.9', '198.51.100.7')).expect(429);
    await manifestReq(h('10.9.9.9', '198.51.100.8')).expect(204);
  });
});

describe('로그에 남지 않는 것(설치 id 0)', () => {
  it('위 모든 요청 뒤: pino 로그·stdout·console 어디에도 설치 id·실패 id·오류 텍스트·내장 id·IP·UA 0건, OTA 요청 로그는 화이트리스트 키와 경로 템플릿뿐', async () => {
    await new Promise((r) => setTimeout(r, 50));
    const all = [...logs, ...stdout].join('\n');
    expect(logs.length).toBeGreaterThan(20);
    for (const [name, v] of Object.entries(SECRET)) expect(all, `${name}가 로그에 있음`).not.toContain(v);
    expect(all).not.toMatch(/eas-client-id|expo-fatal-error|expo-recent-failed|expo-current-update-id|user-agent|x-forwarded-for/i);
    const otaReqs = logs.map((l) => JSON.parse(l) as Record<string, unknown>).filter((o) => String((o.req as { route?: string } | undefined)?.route ?? '').startsWith('/api/v1/ota'));
    expect(otaReqs.length).toBeGreaterThan(10);
    for (const o of otaReqs) {
      expect(Object.keys(o.req as object).sort()).toEqual(['id', 'method', 'route']);
      expect(['/api/v1/ota/manifest', '/api/v1/ota/assets/:hash']).toContain((o.req as { route: string }).route);
    }
  });
});
