// OTA 게시(퍼블리시 CLI ota-cli.ts가 쓰는 부분, V21 — docs/design/server-v1/ota-self-host.md 7절).
// 흐름: `expo export` 결과 폴더 → 파일마다 SHA-256(명세 hash)·MD5(에셋 key = Metro 에셋 해시, export 파일 이름과 같음) →
// ota-assets 버킷에 원본·br·gz 올리고 **다시 읽어 해시를 맞춘다**(압축 판은 풀어서) → 다음 판 번호(seq)·채널을 metadata에 넣은
// 매니페스트 JSON 원문을 만들고 **그 채널의 개인키**로 서명 → 그 채널의 앱 인증서로 되검증 → ota_releases에 한 행.
// 관리 API는 없다 — CLI가 게시 롤(ota_publisher: SELECT·INSERT만)로 DB에, 저장소에 직접 쓴다.
import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { brotliCompressSync, brotliDecompressSync, constants as zc, gunzipSync, gzipSync } from 'node:zlib';
import { z } from 'zod';
import { BUCKETS, type ObjectStore } from '../storage/object-store';
import { assetHash, CHANNEL_RE, manifestSchema, rollbackDirective, RUNTIME_VERSION_RE, signBody, verifyBody, type Manifest, type ManifestAsset, type OtaPlatform } from './protocol';

/** `expo export`의 metadata.json(version 0, Metro). 모르는 키는 무시 */
const exportMetadataSchema = z.object({
  version: z.literal(0),
  bundler: z.literal('metro'),
  fileMetadata: z.record(
    z.string(),
    z.object({
      bundle: z.string().min(1),
      assets: z.array(z.object({ path: z.string().min(1), ext: z.string() })),
    }),
  ),
});

/** 확장자 → MIME. 우리 앱 에셋(글꼴·소리·그림)만 — 모르는 것은 octet-stream */
const MIME: Record<string, string> = {
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  json: 'application/json',
  wasm: 'application/wasm',
  txt: 'text/plain',
};
export function contentTypeOf(ext: string): string {
  return MIME[ext.toLowerCase()] ?? 'application/octet-stream';
}

export interface PreparedFile extends Omit<ManifestAsset, 'url'> {
  body: Uint8Array;
}

/** 내보내기 폴더 밖을 가리키는 경로 거부(metadata.json이 `../` 를 담는 경우) */
function inside(dir: string, rel: string): string {
  const root = resolve(dir);
  const p = resolve(root, rel);
  if (!p.startsWith(root + sep)) throw new Error(`내보내기 폴더 밖 경로: ${rel}`);
  return p;
}

/** 한 플랫폼의 파일(launchAsset = Hermes 번들, assets = 글꼴·소리 등) */
export async function prepareExport(distDir: string, platform: OtaPlatform): Promise<{ launch: PreparedFile; assets: PreparedFile[] }> {
  const meta = exportMetadataSchema.parse(JSON.parse(await readFile(join(distDir, 'metadata.json'), 'utf8')));
  const fm = meta.fileMetadata[platform];
  if (!fm) throw new Error(`내보내기에 ${platform} 번들이 없다(expo export --platform ${platform})`);
  const file = async (rel: string, ext: string | null): Promise<PreparedFile> => {
    const body = new Uint8Array(await readFile(inside(distDir, rel)));
    return {
      body,
      hash: assetHash(body),
      // Metro 에셋 해시(MD5) = 번들 안 에셋 레지스트리가 찾는 키. expo export 파일 이름(assets/<md5>)과 같다
      key: createHash('md5').update(body).digest('hex'),
      // 명세: launchAsset의 fileExtension·contentType은 클라이언트가 정한다 — fileExtension은 생략, contentType은 관례값
      contentType: ext === null ? 'application/javascript' : contentTypeOf(ext),
      ...(ext === null ? {} : { fileExtension: `.${ext}` }),
    };
  };
  const launch = await file(fm.bundle, null);
  const seen = new Set<string>([launch.key]);
  const assets: PreparedFile[] = [];
  for (const a of fm.assets) {
    const f = await file(a.path, a.ext);
    if (seen.has(f.key)) continue;
    seen.add(f.key);
    assets.push(f);
  }
  return { launch, assets };
}

/** 압축 판을 둘 가치가 있는가(10% 이상 줄 때만) */
function worth(raw: Uint8Array, packed: Uint8Array): boolean {
  return packed.byteLength < raw.byteLength * 0.9;
}

const VARIANTS = [
  { suffix: '.br', unpack: (b: Uint8Array) => brotliDecompressSync(b) },
  { suffix: '.gz', unpack: (b: Uint8Array) => gunzipSync(b) },
] as const;

/**
 * 에셋 올리기(내용 주소 — 이미 있고 해시가 맞으면 건너뜀). 올린 뒤 **다시 읽어** 원본과 압축 판(풀어서) 해시를 맞춘다.
 * 어긋나면 던진다(게시 중단). 서버는 내보낼 때 해시를 다시 계산하지 않으므로(스트림) 이 검사가 무결성의 관문이다. 돌려주는 값: 새로 올린 수
 */
export async function uploadFiles(store: ObjectStore, files: readonly PreparedFile[]): Promise<number> {
  let uploaded = 0;
  for (const f of files) {
    if (assetHash(f.body) !== f.hash) throw new Error(`에셋 해시 불일치(준비 단계): ${f.key}`);
    const have = await store.read(BUCKETS.ota, f.hash);
    if (have && assetHash(have.body) === f.hash) continue;
    await store.put(BUCKETS.ota, f.hash, f.body, f.contentType);
    const br = brotliCompressSync(f.body, { params: { [zc.BROTLI_PARAM_QUALITY]: 11, [zc.BROTLI_PARAM_SIZE_HINT]: f.body.byteLength } });
    if (worth(f.body, br)) await store.put(BUCKETS.ota, `${f.hash}.br`, br, f.contentType);
    const gz = gzipSync(f.body, { level: 9 });
    if (worth(f.body, gz)) await store.put(BUCKETS.ota, `${f.hash}.gz`, gz, f.contentType);
    uploaded++;
  }
  const bad = await missingOrMismatched(store, files.map((f) => f.hash));
  if (bad.length) throw new Error(`에셋 해시 불일치(올린 뒤 확인): ${bad.join(', ')}`);
  return uploaded;
}

/** 저장소에 없거나 내용 해시가 키와 다른 에셋(압축 판이 있으면 풀어서 같이 본다). 하나라도 있으면 행을 쓰지 않는다 */
export async function missingOrMismatched(store: ObjectStore, hashes: readonly string[]): Promise<string[]> {
  const bad: string[] = [];
  for (const h of hashes) {
    const f = await store.read(BUCKETS.ota, h);
    if (!f || assetHash(f.body) !== h) {
      bad.push(h);
      continue;
    }
    for (const v of VARIANTS) {
      const p = await store.read(BUCKETS.ota, `${h}${v.suffix}`);
      let ok = !p;
      try {
        ok = ok || assetHash(v.unpack(p!.body)) === h;
      } catch {
        ok = false;
      }
      if (!ok) bad.push(`${h}${v.suffix}`);
    }
  }
  return bad;
}

/**
 * 매니페스트 JSON 원문. 이 문자열을 그대로 서명하고 그대로 저장·응답한다(다시 직렬화하면 서명이 깨진다).
 * metadata = 판 번호·채널(서명 안에 묶어 서버가 행과 대조 — 리뷰 M3). extra.expoClient = `expo config --type public`
 */
export function buildManifest(o: {
  id?: string;
  createdAt: Date;
  runtimeVersion: string;
  seq: number;
  channel: string;
  launch: PreparedFile;
  assets: readonly PreparedFile[];
  assetBaseUrl: string;
  expoClient?: Record<string, unknown>;
}): { id: string; body: string; manifest: Manifest } {
  const base = o.assetBaseUrl.replace(/\/+$/, '');
  const asset = (f: PreparedFile): ManifestAsset => ({
    hash: f.hash,
    key: f.key,
    contentType: f.contentType,
    ...(f.fileExtension ? { fileExtension: f.fileExtension } : {}),
    url: `${base}/${f.hash}`,
  });
  const id = o.id ?? randomUUID();
  const manifest: Manifest = {
    id,
    createdAt: o.createdAt.toISOString(),
    runtimeVersion: o.runtimeVersion,
    launchAsset: asset(o.launch),
    assets: o.assets.map(asset),
    metadata: { seq: String(o.seq), channel: o.channel },
    extra: o.expoClient ? { expoClient: o.expoClient } : {},
  };
  manifestSchema.parse(manifest);
  return { id, body: JSON.stringify(manifest), manifest };
}

export interface Signer {
  privateKeyPem: string;
  /** 키 id = 채널 이름(preview·production — 앱 codeSigningMetadata.keyid와 같다, 리뷰 M3) */
  keyId: string;
  /** 그 채널의 앱 인증서(apps/mobile/certs/ota-<채널>.pem). 서명을 이것으로 되검증한다 — 짝이 아니면 게시 중단(리뷰 L2: 없으면 게시 거부) */
  certificatePem: string;
}

export function sign(body: string, signer: Signer | null): { signature: string | null; keyId: string | null } {
  if (!signer) return { signature: null, keyId: null };
  const signature = signBody(body, signer.privateKeyPem);
  if (!verifyBody(body, signature, signer.certificatePem)) {
    throw new Error('개인키와 앱 인증서가 짝이 아니다(이 서명은 앱이 거부한다) — 게시 중단');
  }
  return { signature, keyId: signer.keyId };
}

type ReleaseRow = { id: string; channel: string; runtimeVersion: string; platform: string; seq: number; kind: 'update' | 'rollback'; createdAt: Date; body: string; signature: string | null; keyId: string | null; assetHashes: string[] };

/** 쓰기에 필요한 Prisma 부분(시험이 메모리 가짜·실제 클라이언트를 넘긴다). 수정·삭제는 없다 — 게시 롤에 그 권한이 없다 */
export interface OtaDb {
  otaRelease: {
    findFirst(a: { where: { channel: string; runtimeVersion: string; platform: string }; orderBy: { seq: 'desc' }; select: { seq: true; createdAt: true; kind: true; assetHashes: true } }): Promise<{ seq: number; createdAt: Date; kind: 'update' | 'rollback'; assetHashes: string[] } | null>;
    create(a: { data: ReleaseRow }): Promise<unknown>;
  };
  otaRevoked: {
    findUnique(a: { where: { launchHash: string } }): Promise<{ launchHash: string } | null>;
    create(a: { data: { launchHash: string; reason: string | null } }): Promise<unknown>;
  };
}

function checkTarget(channel: string, runtimeVersion: string, signer: Signer | null): void {
  if (!CHANNEL_RE.test(channel)) throw new Error(`채널 모양이 아니다: ${channel}`);
  if (!RUNTIME_VERSION_RE.test(runtimeVersion)) throw new Error(`런타임 버전 모양이 아니다: ${runtimeVersion}`);
  if (signer && signer.keyId !== channel) throw new Error(`채널 ${channel}에는 그 채널의 키(keyid ${channel})로만 서명한다 — 지금 ${signer.keyId}`);
}

/** 다음 판 번호와 시각(앞 판보다 늘 늦게 — 앱은 createdAt·commitTime으로 고른다) */
async function nextSlot(db: OtaDb, channel: string, runtimeVersion: string, platform: string, now: Date) {
  const prev = await db.otaRelease.findFirst({ where: { channel, runtimeVersion, platform }, orderBy: { seq: 'desc' }, select: { seq: true, createdAt: true, kind: true, assetHashes: true } });
  const at = prev && now.getTime() <= prev.createdAt.getTime() ? new Date(prev.createdAt.getTime() + 1) : now;
  return { seq: (prev?.seq ?? 0) + 1, at, prev };
}

async function assertNotRevoked(db: OtaDb, launchHash: string): Promise<void> {
  if (await db.otaRevoked.findUnique({ where: { launchHash } })) throw new Error(`되돌린 번들이다(ota_revoked ${launchHash}) — 다시 게시할 수 없다. 고친 번들로 새로 게시`);
}

/** 업데이트 게시 한 플랫폼: 에셋 올리기 → 다음 판 번호 → 매니페스트 → 서명·되검증 → 저장소 재검사 → 행 */
export async function publishUpdate(
  db: OtaDb,
  store: ObjectStore,
  o: { distDir: string; platform: OtaPlatform; channel: string; runtimeVersion: string; assetBaseUrl: string; signer: Signer | null; expoClient?: Record<string, unknown>; now?: Date },
): Promise<{ id: string; seq: number; uploaded: number; files: number; manifest: Manifest }> {
  checkTarget(o.channel, o.runtimeVersion, o.signer);
  const { launch, assets } = await prepareExport(o.distDir, o.platform);
  await assertNotRevoked(db, launch.hash);
  const uploaded = await uploadFiles(store, [launch, ...assets]);
  const { seq, at } = await nextSlot(db, o.channel, o.runtimeVersion, o.platform, o.now ?? new Date());
  const { id, body, manifest } = buildManifest({ createdAt: at, runtimeVersion: o.runtimeVersion, seq, channel: o.channel, launch, assets, assetBaseUrl: o.assetBaseUrl, expoClient: o.expoClient });
  await insertUpdate(db, store, { id, channel: o.channel, runtimeVersion: o.runtimeVersion, platform: o.platform, seq, createdAt: at, body, ...sign(body, o.signer), assetHashes: [launch.hash, ...assets.map((a) => a.hash)] });
  return { id, seq, uploaded, files: assets.length + 1, manifest };
}

/**
 * 업데이트 행 쓰기의 마지막 관문: 매니페스트가 명세 꼴이고, 서명 원문의 seq·channel·런타임 = 행 값, 해시 목록 = assetHashes,
 * 번들이 되돌린 목록에 없고, 저장소의 모든 에셋(압축 판 포함)이 해시와 맞을 때만
 */
export async function insertUpdate(db: OtaDb, store: ObjectStore, r: Omit<ReleaseRow, 'kind' | 'platform'> & { platform: OtaPlatform }): Promise<void> {
  if (!CHANNEL_RE.test(r.channel) || !RUNTIME_VERSION_RE.test(r.runtimeVersion)) throw new Error('채널·런타임 모양이 아니다');
  const m = manifestSchema.parse(JSON.parse(r.body));
  const listed = [m.launchAsset, ...m.assets].map((a) => a.hash);
  if (m.id !== r.id || m.runtimeVersion !== r.runtimeVersion || m.metadata.seq !== String(r.seq) || m.metadata.channel !== r.channel || listed.join() !== r.assetHashes.join()) {
    throw new Error('매니페스트와 행 값이 다르다');
  }
  await assertNotRevoked(db, m.launchAsset.hash);
  const bad = await missingOrMismatched(store, r.assetHashes);
  if (bad.length) throw new Error(`에셋 해시 불일치 또는 없음 — 게시 거부: ${bad.join(', ')}`);
  await db.otaRelease.create({ data: { ...r, kind: 'update' } });
}

/**
 * 롤백 지시 게시: 이 (채널·런타임·플랫폼)의 앱은 내장 번들로 돌아간다. 지금 최신 판이 업데이트면 그 번들을 되돌린 목록에 넣어
 * (리뷰 M3) 다시 게시·republish·재생을 막는다. 다시 업데이트를 게시하면(다른 번들) 그쪽이 판 번호가 커서 이긴다
 */
export async function publishRollback(
  db: OtaDb,
  o: { platform: OtaPlatform; channel: string; runtimeVersion: string; signer: Signer | null; reason?: string; now?: Date },
): Promise<{ id: string; seq: number; body: string; revoked: string | null }> {
  checkTarget(o.channel, o.runtimeVersion, o.signer);
  const { seq, at, prev } = await nextSlot(db, o.channel, o.runtimeVersion, o.platform, o.now ?? new Date());
  const bad = prev?.kind === 'update' ? (prev.assetHashes[0] ?? null) : null;
  if (bad && !(await db.otaRevoked.findUnique({ where: { launchHash: bad } }))) await db.otaRevoked.create({ data: { launchHash: bad, reason: o.reason?.slice(0, 200) ?? null } });
  const body = rollbackDirective(at, { seq, channel: o.channel });
  const id = randomUUID();
  await db.otaRelease.create({ data: { id, channel: o.channel, runtimeVersion: o.runtimeVersion, platform: o.platform, seq, kind: 'rollback', createdAt: at, body, ...sign(body, o.signer), assetHashes: [] } });
  return { id, seq, body, revoked: bad };
}

/**
 * 예전 업데이트를 (같은 또는 다른 채널에) 다시 게시 — preview에서 확인한 판을 production 키로 다시 서명해 내는 길이기도 하다.
 * 같은 에셋, 새 id·새 판 번호·새 createdAt·그 채널 metadata로 새로 서명. 되돌린 번들은 거부
 */
export async function republish(
  db: OtaDb,
  store: ObjectStore,
  o: { from: { body: string; platform: string; runtimeVersion: string }; channel: string; signer: Signer | null; now?: Date },
): Promise<{ id: string; seq: number }> {
  checkTarget(o.channel, o.from.runtimeVersion, o.signer);
  const old = manifestSchema.parse(JSON.parse(o.from.body));
  const platform: OtaPlatform = o.from.platform === 'ios' ? 'ios' : 'android';
  await assertNotRevoked(db, old.launchAsset.hash);
  const { seq, at } = await nextSlot(db, o.channel, o.from.runtimeVersion, platform, o.now ?? new Date());
  const id = randomUUID();
  const next: Manifest = { ...old, id, createdAt: at.toISOString(), metadata: { seq: String(seq), channel: o.channel } };
  const body = JSON.stringify(next);
  await insertUpdate(db, store, { id, channel: o.channel, runtimeVersion: o.from.runtimeVersion, platform, seq, createdAt: at, body, ...sign(body, o.signer), assetHashes: [next.launchAsset, ...next.assets].map((a) => a.hash) });
  return { id, seq };
}

/**
 * 개인키 경로가 저장소 안이면 true(커밋 사고 방지 — CLI가 거부한다, 리뷰 L1). 심볼릭 링크를 풀어(realpath) 비교한다.
 * root는 CLI 파일 위치에서 찾은 저장소 뿌리(cwd와 무관)
 */
export function insideRepo(path: string, root: string): boolean {
  const real = (p: string) => {
    try {
      return realpathSync(p);
    } catch {
      return resolve(p);
    }
  };
  const rel = relative(real(root), real(path));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
