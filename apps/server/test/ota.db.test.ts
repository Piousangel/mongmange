// V21 자체 OTA — 실제 Postgres + 로컬 파일 저장소. 게시는 게시 롤(ota_publisher)로, 받기는 서버 런타임 롤로.
// 그럴듯한 오답 판별(OPERATING 8-1): 설치 id·실패 업데이트 id·오류 텍스트·IP·UA가 DB 어느 표에든(로그에든) 한 번이라도 있으면 실패,
// ota_releases에 설치·요청 값을 담을 칸이 생기면 실패, 해시가 틀린 에셋을 가리키는 판이 목록에 들어가면 실패,
// 서버 롤이 OTA 표에 쓰거나 게시 롤이 고치기·지우기·다른 표 읽기를 할 수 있으면 실패(리뷰 M4 — DB가 강제), 되돌린 번들이 다시 나가면 실패.
import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { logSink } from '../src/common/logging';
import { PrismaClient } from '../src/generated/prisma/client';
import { OtaService } from '../src/ota/ota.service';
import { manifestSchema, verifyBody } from '../src/ota/protocol';
import { buildManifest, insertUpdate, prepareExport, publishRollback, publishUpdate, republish, sign, uploadFiles } from '../src/ota/publish';
import { PrismaService } from '../src/prisma/prisma.service';
import { OBJECT_STORE, type ObjectStore } from '../src/storage/object-store';
import { appHeaders, keysFor, makeExport, parseMultipart, parseSig, SECRET, signerFor } from './ota-fixtures';

const CH = `t-${randomBytes(4).toString('hex')}`;
const storeDir = mkdtempSync(join(tmpdir(), 'mong-ota-db-store-'));
const BASE = 'https://ota.example/api/v1/ota/assets';
const logs: string[] = [];
let app: NestFastifyApplication;
let prisma: PrismaService;
let pub: PrismaClient;
let store: ObjectStore;
let svc: OtaService;

/** 게시 롤 접속(prisma/local/00-roles.sql — 로컬·CI 고정 비밀번호) */
function publisherUrl(): string {
  const u = new URL(process.env.DATABASE_URL!);
  u.username = 'ota_publisher';
  u.password = 'ota-publisher-local';
  return u.toString();
}

beforeAll(async () => {
  logSink.stream = new Writable({
    write(chunk, _enc, cb) {
      logs.push(...String(chunk).split('\n').filter(Boolean));
      cb();
    },
  });
  Object.assign(process.env, { LOG_LEVEL: 'info', STORAGE_DRIVER: 'local', STORAGE_LOCAL_DIR: storeDir, TRUSTED_PROXY_HOPS_API: '1', TRUSTED_PROXY_HOPS_WEB: '2' });
  const { createApp } = await import('../src/app.factory');
  app = await createApp({ bufferLogs: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  prisma = app.get(PrismaService);
  store = app.get<ObjectStore>(OBJECT_STORE);
  svc = app.get(OtaService);
  pub = new PrismaClient({ adapter: new PrismaPg({ connectionString: publisherUrl(), max: 1 }) });
});
afterAll(async () => {
  // 행은 지울 수 없다(수정·삭제 정책 없음 — 그게 이 시험의 요점). 채널 이름·번들 내용(CH를 넣음)이 실행마다 달라 서로 섞이지 않는다(되돌린 번들 목록은 전역)
  await pub?.$disconnect();
  await app?.close();
  logSink.stream = undefined;
});

const http = () => request(app.getHttpServer());
const raw = (r: request.Test) => r.buffer(true).parse((res, cb) => {
  const c: Buffer[] = [];
  res.on('data', (d: Buffer) => c.push(d));
  res.on('end', () => cb(null, Buffer.concat(c)));
});
function getManifest(h: Record<string, string>) {
  svc.clearCache();
  return raw(http().get('/api/v1/ota/manifest').set(h));
}
const part = (r: request.Response) => parseMultipart(r.headers['content-type']!, r.body as Buffer)[0]!;

describe('게시 → 받기(실제 DB, 게시 롤)', () => {
  let first = '';
  it('게시 롤이 쓴 행을 서버가 고르고, 서명이 그 채널 인증서로 검증되며, 다른 런타임은 204', async () => {
    const p = await publishUpdate(pub, store, { distDir: makeExport(`${CH}-1`), platform: 'android', channel: CH, runtimeVersion: 'rvA', assetBaseUrl: BASE, signer: signerFor(CH) });
    first = p.id;
    expect(p.seq).toBe(1);
    const r = await getManifest(appHeaders({ channel: CH, runtime: 'rvA' })).expect(200);
    const pt = part(r);
    expect(manifestSchema.parse(JSON.parse(pt.body)).id).toBe(p.id);
    expect(verifyBody(pt.body, parseSig(pt.headers['expo-signature']!).sig!, keysFor(CH).publicKeyPem)).toBe(true);
    await getManifest(appHeaders({ channel: CH, runtime: 'rvB' })).expect(204);
    await getManifest(appHeaders({ channel: CH, runtime: 'rvA', platform: 'ios' })).expect(204);
  });

  it('롤백 지시 → directive + 번들 되돌림, republish 거부, 고친 번들 게시는 판 번호가 커서 이긴다', async () => {
    const rb = await publishRollback(pub, { platform: 'android', channel: CH, runtimeVersion: 'rvA', signer: signerFor(CH), reason: 'db test' });
    expect(rb.seq).toBe(2);
    const r = await getManifest(appHeaders({ channel: CH, runtime: 'rvA', current: first })).expect(200);
    expect(part(r).headers['content-disposition']).toContain('name="directive"');
    expect(await pub.otaRevoked.count({ where: { launchHash: rb.revoked! } })).toBe(1);
    const old = await pub.otaRelease.findUniqueOrThrow({ where: { id: first } });
    await expect(republish(pub, store, { from: old, channel: CH, signer: signerFor(CH) })).rejects.toThrow(/되돌린 번들/);
    const fixed = await publishUpdate(pub, store, { distDir: makeExport(`${CH}-2`), platform: 'android', channel: CH, runtimeVersion: 'rvA', assetBaseUrl: BASE, signer: signerFor(CH) });
    expect(fixed.seq).toBe(3);
    const r2 = await getManifest(appHeaders({ channel: CH, runtime: 'rvA', current: SECRET.embeddedId })).expect(200);
    expect(manifestSchema.parse(JSON.parse(part(r2).body)).id).toBe(fixed.id);
  });

  it('같은 판 번호 두 번은 DB가 거부(UNIQUE)', async () => {
    const row = await pub.otaRelease.findFirstOrThrow({ where: { channel: CH }, orderBy: { seq: 'desc' } });
    await expect(pub.otaRelease.create({ data: { ...row, id: randomUUID() } })).rejects.toThrow();
  });

  it('저장소 에셋 해시가 틀리면 게시 거부 — 행이 생기지 않는다', async () => {
    const { launch, assets } = await prepareExport(makeExport(`${CH}-bad`), 'android');
    await uploadFiles(store, [launch, ...assets]);
    writeFileSync(join(storeDir, 'ota-assets', assets[0]!.hash), Buffer.from('bit rot'));
    const ch = `${CH}-bad`;
    const { id, body, manifest } = buildManifest({ createdAt: new Date(), runtimeVersion: 'rvA', seq: 1, channel: ch, launch, assets, assetBaseUrl: BASE });
    await expect(
      insertUpdate(pub, store, { id, channel: ch, runtimeVersion: 'rvA', platform: 'android', seq: 1, createdAt: new Date(manifest.createdAt), body, ...sign(body, signerFor(ch)), assetHashes: [launch.hash, ...assets.map((a) => a.hash)] }),
    ).rejects.toThrow(/에셋 해시 불일치/);
    expect(await prisma.otaRelease.count({ where: { channel: ch } })).toBe(0);
  });
});

describe('롤 권한(리뷰 M4 — DB가 강제)', () => {
  it('서버 런타임 롤: OTA 표 읽기만 — 넣기는 RLS 거부, 고치기·지우기는 0행', async () => {
    const row = await prisma.otaRelease.findFirstOrThrow({ where: { channel: CH } });
    await expect(prisma.otaRelease.create({ data: { ...row, id: randomUUID(), seq: 99 } })).rejects.toThrow(/row-level security|policy/i);
    await expect(prisma.otaRevoked.create({ data: { launchHash: 'x'.repeat(43) } })).rejects.toThrow(/row-level security|policy/i);
    expect(await prisma.$executeRawUnsafe(`update app.ota_releases set body = '{}' where channel = $1`, CH)).toBe(0);
    expect(await prisma.$executeRawUnsafe(`delete from app.ota_releases where channel = $1`, CH)).toBe(0);
    expect(await prisma.$executeRawUnsafe(`delete from app.ota_revoked`)).toBe(0);
    expect(await prisma.otaRelease.count({ where: { channel: CH } })).toBe(3);
  });
  it('게시 롤: 고치기·지우기 권한 없음, 다른 표는 읽지도 못한다', async () => {
    await expect(pub.$executeRawUnsafe(`update app.ota_releases set body = '{}' where channel = $1`, CH)).rejects.toThrow(/permission denied/i);
    await expect(pub.$executeRawUnsafe(`delete from app.ota_releases where channel = $1`, CH)).rejects.toThrow(/permission denied/i);
    await expect(pub.$executeRawUnsafe(`delete from app.ota_revoked`)).rejects.toThrow(/permission denied/i);
    await expect(pub.$queryRawUnsafe('select count(*) from app.users')).rejects.toThrow(/permission denied/i);
    await expect(pub.$queryRawUnsafe('select count(*) from app.saves')).rejects.toThrow(/permission denied/i);
  });
  it('서버 롤은 게시 롤의 멤버가 아니다(SET ROLE로 게시 권한을 빌릴 수 없다)', async () => {
    const [m] = await prisma.$queryRaw<{ n: bigint }[]>`select count(*) as n from pg_auth_members a join pg_roles g on g.oid = a.roleid join pg_roles u on u.oid = a.member where g.rolname = 'ota_publisher' and u.rolname = current_user`;
    expect(Number(m!.n)).toBe(0);
  });
});

describe('설치 id 저장 0(DB·로그)', () => {
  it('ota_releases·ota_revoked 열은 게시 값뿐(설치·요청 값 칸 없음)', async () => {
    const cols = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      select table_name, column_name from information_schema.columns where table_schema = 'app' and table_name in ('ota_releases', 'ota_revoked') order by table_name, ordinal_position`;
    expect(cols.map((c) => `${c.table_name}.${c.column_name}`)).toEqual([
      ...['id', 'channel', 'runtime_version', 'platform', 'seq', 'kind', 'created_at', 'body', 'signature', 'key_id', 'asset_hashes', 'published_at'].map((c) => `ota_releases.${c}`),
      ...['launch_hash', 'revoked_at', 'reason'].map((c) => `ota_revoked.${c}`),
    ]);
  });

  it('식별 헤더를 실은 요청 뒤 app 스키마 모든 표의 모든 행·로그 어디에도 설치 id·실패 id·오류 텍스트·IP·UA가 없다', async () => {
    for (let i = 0; i < 3; i++) await getManifest(appHeaders({ channel: CH, runtime: 'rvA' }));
    await raw(http().get(`/api/v1/ota/assets/${'A'.repeat(43)}`).set(appHeaders()));
    const tables = await prisma.$queryRaw<{ t: string }[]>`select tablename as t from pg_tables where schemaname = 'app'`;
    expect(tables.length).toBeGreaterThan(10);
    let dump = '';
    for (const { t } of tables) {
      const rows = await prisma.$queryRawUnsafe<{ j: string }[]>(`select row_to_json(x)::text as j from app."${t.replace(/"/g, '')}" x`);
      dump += rows.map((r) => r.j).join('\n');
    }
    expect(dump).toContain(CH);
    await new Promise((r) => setTimeout(r, 50));
    const all = logs.join('\n');
    for (const [name, v] of Object.entries(SECRET)) {
      expect(dump, `DB에 ${name}`).not.toContain(v);
      expect(all, `로그에 ${name}`).not.toContain(v);
    }
  });
});
