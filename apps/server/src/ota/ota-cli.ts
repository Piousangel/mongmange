// OTA 퍼블리시 CLI(V21 — docs/design/server-v1/ota-self-host.md 7절). 관리 API 없이 DB(게시 롤 ota_publisher)·파일 저장소에 직접 쓴다.
//   pnpm --filter server build
//   node apps/server/dist/ota-cli.js publish  --dist <expo export 폴더> --platform android --channel preview
//        --asset-base-url https://ota.mongmang.ink/api/v1/ota/assets --key <저장소 밖 preview 개인키.pem>
//        [--runtime-version <값> — 없으면 apps/mobile에서 그 채널 env로 직접 계산] [--expo-config <expo config --type public --json 결과>]
//        [--server-url <운영 API 주소: 세이브 형식 가드>]
//   node apps/server/dist/ota-cli.js rollback  --platform android --channel preview --runtime-version <값> --key …   (지금 최신 번들은 되돌린 목록에)
//   node apps/server/dist/ota-cli.js republish --from <옛 업데이트 id> --channel production --key <production 키>      (preview → production도 이 길)
//   node apps/server/dist/ota-cli.js list      --channel preview [--runtime-version <값>]
// 환경: OTA_DATABASE_URL — 게시 롤 ota_publisher(SELECT·INSERT만, 세션 풀러·직접 연결). STORAGE_DRIVER=local + STORAGE_LOCAL_DIR(B6 전까지 로컬만).
// 키: 채널마다 따로(keyid = 채널, 리뷰 M3). 인증서 apps/mobile/certs/ota-<채널>.pem이 없으면 게시 거부(리뷰 L2). 저장소 안 경로의 키는 거부(realpath, 리뷰 L1).
// 서명 없이 게시하려면 --unsigned(개발 전용, 운영 서버·서명을 기대하는 앱은 받지 않는다).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { LocalObjectStore } from '../storage/local-store';
import type { ObjectStore } from '../storage/object-store';
import { SAVE_SCHEMA, SIM_SCHEMA } from '../version';
import { PLATFORMS, type OtaPlatform } from './protocol';
import { insideRepo, publishRollback, publishUpdate, republish, type Signer } from './publish';

const HELP = `사용: ota-cli <publish|rollback|republish|list> [옵션] — 머리 주석 참고`;

function fail(msg: string): never {
  process.stderr.write(`ota-cli: ${msg}\n`);
  process.exit(1);
}

/** 저장소 뿌리: **이 CLI 파일 위치**에서 위로(pnpm-workspace.yaml). 어디서 실행해도 같다(리뷰 L1 — cwd 기준이면 저장소 밖 실행 때 검사가 꺼졌다) */
function repoRoot(): string {
  let d = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(d, 'pnpm-workspace.yaml'))) return d;
    const up = dirname(d);
    if (up === d) fail('저장소 뿌리를 찾지 못했다(CLI는 저장소의 apps/server/dist에서 실행한다)');
    d = up;
  }
}

function signer(v: { key?: string; cert?: string; unsigned?: boolean }, channel: string): Signer | null {
  if (v.unsigned) {
    process.stderr.write('ota-cli: 경고 — 서명 없이 게시(운영 서버와 서명을 기대하는 앱은 이 판을 받지 않는다)\n');
    return null;
  }
  const keyPath = v.key ?? process.env.MONG_OTA_PRIVATE_KEY_PATH;
  if (!keyPath) fail('--key(또는 MONG_OTA_PRIVATE_KEY_PATH)가 필요하다. 서명 없이 하려면 --unsigned');
  const root = repoRoot();
  if (insideRepo(keyPath, root)) fail('개인키가 저장소 안에 있다(심볼릭 링크 포함) — 저장소 밖으로 옮겨라(커밋 사고 방지)');
  const certPath = v.cert ?? join(root, `apps/mobile/certs/ota-${channel}.pem`);
  if (!existsSync(certPath)) fail(`앱 인증서가 없다: ${certPath} — 키와 짝을 확인할 수 없어 게시하지 않는다`);
  return { privateKeyPem: readFileSync(keyPath, 'utf8'), keyId: channel, certificatePem: readFileSync(certPath, 'utf8') };
}

function store(): ObjectStore {
  if (process.env.STORAGE_DRIVER !== 'local') fail('STORAGE_DRIVER=local만 지원한다(실제 저장소 드라이버는 B6)');
  return new LocalObjectStore(resolve(process.env.STORAGE_LOCAL_DIR ?? '.storage-local'), 'http://localhost');
}

function db(): PrismaClient {
  const url = process.env.OTA_DATABASE_URL;
  if (!url) fail('OTA_DATABASE_URL(게시 롤 ota_publisher)이 필요하다 — 마이그레이션 롤(DIRECT_URL)은 쓰지 않는다');
  if (/:6543(\/|$|\?)/.test(url)) fail('트랜잭션 풀러(6543)가 아닌 세션 풀러(5432)를 쓴다');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 1 }) });
}

function platformsOf(v: string | undefined): OtaPlatform[] {
  const ps = (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ps.length || ps.some((p) => !(PLATFORMS as readonly string[]).includes(p))) fail('--platform ios|android|ios,android');
  return ps as OtaPlatform[];
}

/**
 * 그 채널 빌드가 보낼 런타임 버전(fingerprint)을 앱 폴더에서 직접 계산한다 — 사람이 값을 손으로 옮기지 않게(리뷰 H1).
 * 채널 env를 빌드 프로필과 같게 준다. fingerprint.config.js가 채널·서명 설정을 계산에서 빼므로 채널이 달라도 값은 같아야 한다
 */
function resolveRuntime(platform: OtaPlatform, channel: string): string {
  const app = join(repoRoot(), 'apps/mobile');
  const out = execFileSync('npx', ['expo-updates', 'runtimeversion:resolve', '--platform', platform], { cwd: app, env: { ...process.env, MONG_OTA_CHANNEL: channel }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const rv = (JSON.parse(out) as { runtimeVersion?: string }).runtimeVersion;
  if (!rv) fail(`런타임 버전을 계산하지 못했다(${platform})`);
  return rv;
}

/** architecture 3-11 '세이브 형식을 바꾸는 OTA는 서버를 먼저': 운영 /healthz의 형식 버전이 이 번들(core)보다 낮으면 중단 */
async function schemaGuard(serverUrl: string): Promise<void> {
  const r = await fetch(`${serverUrl.replace(/\/+$/, '')}/healthz`);
  if (!r.ok) fail(`/healthz ${r.status}`);
  const h = (await r.json()) as { saveSchema?: number; simSchema?: number };
  if (typeof h.saveSchema !== 'number' || typeof h.simSchema !== 'number') fail('/healthz에 saveSchema·simSchema가 없다');
  if (h.saveSchema < SAVE_SCHEMA || h.simSchema < SIM_SCHEMA) {
    fail(`서버가 이 번들의 세이브 형식을 모른다(서버 save ${h.saveSchema}·sim ${h.simSchema} < 번들 save ${SAVE_SCHEMA}·sim ${SIM_SCHEMA}) — 서버를 먼저 배포`);
  }
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const { values: v } = parseArgs({
    args: rest,
    options: {
      dist: { type: 'string' },
      platform: { type: 'string' },
      channel: { type: 'string' },
      'runtime-version': { type: 'string' },
      'asset-base-url': { type: 'string' },
      key: { type: 'string' },
      cert: { type: 'string' },
      'expo-config': { type: 'string' },
      'server-url': { type: 'string' },
      from: { type: 'string' },
      reason: { type: 'string' },
      unsigned: { type: 'boolean' },
    },
  });
  if (cmd !== 'list' && !v.channel) fail('--channel이 필요하다');
  const channel = v.channel ?? '';
  const prisma = db();
  try {
    if (cmd === 'publish') {
      if (!v.dist || !v['asset-base-url']) fail('--dist·--asset-base-url이 필요하다');
      if (!/^https:\/\//.test(v['asset-base-url']) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(v['asset-base-url'])) fail('--asset-base-url은 https(로컬만 http)');
      if (v['server-url']) await schemaGuard(v['server-url']);
      else process.stderr.write('ota-cli: 경고 — --server-url 없이 세이브 형식 가드를 건너뜀(운영 게시에서는 꼭 준다)\n');
      const s = signer(v, channel);
      const expoClient = v['expo-config'] ? (JSON.parse(readFileSync(v['expo-config'], 'utf8')) as Record<string, unknown>) : undefined;
      const st = store();
      for (const platform of platformsOf(v.platform)) {
        const rv = v['runtime-version'] ?? resolveRuntime(platform, channel);
        const r = await publishUpdate(prisma, st, { distDir: v.dist, platform, channel, runtimeVersion: rv, assetBaseUrl: v['asset-base-url'], signer: s, expoClient });
        process.stdout.write(`게시: ${platform} ${channel} rv=${rv} seq=${r.seq} id=${r.id} 파일 ${r.files}개(새로 올림 ${r.uploaded}) 서명=${s ? s.keyId : 'X'}\n`);
      }
    } else if (cmd === 'rollback') {
      if (!v['runtime-version']) fail('--runtime-version이 필요하다');
      const s = signer(v, channel);
      for (const platform of platformsOf(v.platform)) {
        const r = await publishRollback(prisma, { platform, channel, runtimeVersion: v['runtime-version'], signer: s, reason: v.reason });
        process.stdout.write(`롤백 지시: ${platform} ${channel} rv=${v['runtime-version']} seq=${r.seq} id=${r.id} 되돌린 번들=${r.revoked ?? '없음'}\n`);
      }
    } else if (cmd === 'republish') {
      if (!v.from) fail('--from <업데이트 id>가 필요하다');
      const old = await prisma.otaRelease.findUnique({ where: { id: v.from } });
      if (!old || old.kind !== 'update') fail('그런 업데이트가 없다');
      const r = await republish(prisma, store(), { from: old, channel, signer: signer(v, channel) });
      process.stdout.write(`다시 게시: ${old.platform} ${old.channel} → ${channel} rv=${old.runtimeVersion} ${v.from} → ${r.id} seq=${r.seq}\n`);
    } else if (cmd === 'list') {
      const rows = await prisma.otaRelease.findMany({
        where: { ...(v.channel ? { channel: v.channel } : {}), ...(v['runtime-version'] ? { runtimeVersion: v['runtime-version'] } : {}) },
        orderBy: [{ channel: 'asc' }, { seq: 'desc' }],
        take: 30,
        select: { id: true, seq: true, kind: true, channel: true, platform: true, runtimeVersion: true, createdAt: true, keyId: true },
      });
      for (const r of rows) process.stdout.write(`${r.channel} seq=${r.seq} ${r.createdAt.toISOString()} ${r.kind.padEnd(8)} ${r.platform.padEnd(7)} rv=${r.runtimeVersion} ${r.id} 키=${r.keyId ?? 'X'}\n`);
    } else {
      fail(HELP);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
