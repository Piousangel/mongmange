// OTA 시험 공통: 작은 `expo export` 모양 폴더(metadata.json + Hermes 번들 자리 + 글꼴·소리 에셋)와 시험용 RSA 키쌍.
// 실제 expo export 결과로 하는 스모크는 docs/design/server-v1/ota-self-host.md 10절(로컬 compose).
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const md5 = (b: Uint8Array) => createHash('md5').update(b).digest('hex');

/** platform마다 번들 하나 + 공유 에셋 둘(같은 파일을 두 번 나열 — 중복 제거 확인용) */
export function makeExport(tag = 'a'): string {
  const dir = mkdtempSync(join(tmpdir(), 'mong-ota-export-'));
  const font = Buffer.from(`font-bytes-${tag}-`.repeat(200));
  const wav = Buffer.from(`RIFF....WAVEfmt ${tag}`.repeat(300));
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'assets', md5(font)), font);
  writeFileSync(join(dir, 'assets', md5(wav)), wav);
  const fileMetadata: Record<string, unknown> = {};
  for (const p of ['ios', 'android']) {
    const bundle = Buffer.from(`/* hbc ${p} ${tag} */ ${'var x=1;'.repeat(500)}`);
    const rel = `_expo/static/js/${p}/index-${md5(bundle)}.hbc`;
    mkdirSync(join(dir, `_expo/static/js/${p}`), { recursive: true });
    writeFileSync(join(dir, rel), bundle);
    fileMetadata[p] = {
      bundle: rel,
      assets: [
        { path: `assets/${md5(font)}`, ext: 'ttf' },
        { path: `assets/${md5(wav)}`, ext: 'wav' },
        { path: `assets/${md5(font)}`, ext: 'ttf' },
      ],
    };
  }
  writeFileSync(join(dir, 'metadata.json'), JSON.stringify({ version: 0, bundler: 'metro', fileMetadata }));
  return dir;
}

export function testKeys(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
}

/** 채널별 시험 키(리뷰 M3: 채널마다 키·인증서가 다르다). 같은 채널은 같은 키 */
const channelKeys = new Map<string, ReturnType<typeof testKeys>>();
export function keysFor(channel: string): ReturnType<typeof testKeys> {
  let k = channelKeys.get(channel);
  if (!k) channelKeys.set(channel, (k = testKeys()));
  return k;
}
export function signerFor(channel: string): { privateKeyPem: string; keyId: string; certificatePem: string } {
  const k = keysFor(channel);
  return { privateKeyPem: k.privateKeyPem, keyId: channel, certificatePem: k.publicKeyPem };
}

/** 앱이 보내는 헤더(expo-updates 58 FileDownloader.kt createRequestForRemoteUpdate 그대로 + 채널·서명 기대). 식별·충돌 값은 비밀 표식 */
export const SECRET = {
  clientId: '9f0c3a1e-5b7d-4c2a-8e6f-1a2b3c4d5e6f',
  failedId: '0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6',
  fatal: 'TypeError: SECRET_CRASH_TEXT at GameApp.tsx:42',
  embeddedId: 'e0e0e0e0-1111-4222-8333-444455556666',
  ip: '203.0.113.88',
  ua: 'okhttp/4.12.0 SECRET-UA',
} as const;

export function appHeaders(o: { platform?: string; runtime?: string; channel?: string; current?: string; sign?: boolean; accept?: string } = {}): Record<string, string> {
  const h: Record<string, string> = {
    accept: o.accept ?? 'multipart/mixed,application/expo+json,application/json',
    'expo-platform': o.platform ?? 'android',
    'expo-protocol-version': '1',
    'expo-api-version': '1',
    'expo-updates-environment': 'BARE',
    'expo-json-error': 'true',
    'eas-client-id': SECRET.clientId,
    'expo-runtime-version': o.runtime ?? 'rv1',
    'expo-embedded-update-id': SECRET.embeddedId,
    'expo-recent-failed-update-ids': `"${SECRET.failedId}"`,
    'expo-fatal-error': SECRET.fatal,
    'user-agent': SECRET.ua,
    'x-forwarded-for': SECRET.ip,
  };
  if (o.channel !== '') h['expo-channel-name'] = o.channel ?? 'preview';
  if (o.current) h['expo-current-update-id'] = o.current;
  if (o.sign !== false) h['expo-expect-signature'] = 'sig, keyid="main", alg="rsa-v1_5-sha256"';
  return h;
}

/** multipart/mixed 응답을 명세대로 쪼갠다(시험 쪽 독립 구현 — 서버 함수를 쓰지 않는다) */
export function parseMultipart(contentType: string, body: Buffer): Array<{ headers: Record<string, string>; body: string }> {
  const m = /boundary=([^;]+)/.exec(contentType);
  if (!m) throw new Error('boundary 없음');
  const text = body.toString('utf8');
  const delim = `--${m[1]}`;
  const out: Array<{ headers: Record<string, string>; body: string }> = [];
  const pieces = text.split(delim).slice(1);
  for (const p of pieces) {
    if (p.startsWith('--')) break;
    const [head, ...rest] = p.replace(/^\r\n/, '').split('\r\n\r\n');
    const headers: Record<string, string> = {};
    for (const line of head!.split('\r\n')) {
      const i = line.indexOf(':');
      headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
    out.push({ headers, body: rest.join('\r\n\r\n').replace(/\r\n$/, '') });
  }
  return out;
}

/** expo-signature SFV 사전에서 sig·keyid(시험 쪽 독립 구현) */
export function parseSig(v: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of v.matchAll(/([a-z*][a-z0-9_\-.*]*)="((?:[^"\\]|\\.)*)"/g)) out[m[1]!] = m[2]!.replace(/\\(.)/g, '$1');
  return out;
}
