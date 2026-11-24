// Expo Updates 프로토콜 v1의 순수 부분(V21, docs/design/server-v1/ota-self-host.md 2절).
// 정본: https://docs.expo.dev/technical-specs/expo-updates-1/ (2026-08-12 판), SFV: https://docs.expo.dev/technical-specs/expo-sfv-0/
// 여기 함수는 요청 헤더에서 **고르는 데 필요한 값만** 꺼낸다. 설치 id(EAS-Client-ID)·실패한 업데이트 id·오류 텍스트·현재 업데이트 id는
// 꺼내 돌려주지도, 어디에 쓰지도 않는다(현재·내장 업데이트 id는 '이미 받았나' 비교에만 쓰고 버린다).
import { createHash, createSign, createVerify, randomBytes } from 'node:crypto';
import { z } from 'zod';

export const PLATFORMS = ['ios', 'android'] as const;
export type OtaPlatform = (typeof PLATFORMS)[number];

/** 채널 이름(빌드가 `expo-channel-name` 요청 헤더로 보낸다 — 앱 plugins/withSelfHostedUpdates.js) */
export const CHANNEL_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** 런타임 버전: fingerprint(16진 40자)·appVersion(1.0.0) 모두 들어가는 보수적 모양 */
export const RUNTIME_VERSION_RE = /^[A-Za-z0-9._+()-]{1,128}$/;
/** 에셋 해시 = SHA-256 base64url(패딩 없음, 43자) — 명세 'hash' */
export const ASSET_HASH_RE = /^[A-Za-z0-9_-]{43}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 서명 알고리즘(명세·expo-updates codeSigningMetadata.alg). 앱 app.json과 같은 값 */
export const SIGNING_ALG = 'rsa-v1_5-sha256';

/** 명세 'Manifest body'(TypeScript 정의 그대로). 시험이 응답을 이 꼴로 검사한다 */
export const assetSchema = z.object({
  hash: z.string().regex(ASSET_HASH_RE),
  key: z.string().min(1),
  contentType: z.string().min(1),
  fileExtension: z.string().regex(/^\./).optional(),
  url: z.url({ protocol: /^https?$/ }),
});
export const manifestSchema = z.object({
  id: z.string().regex(UUID_RE),
  createdAt: z.iso.datetime(),
  runtimeVersion: z.string().regex(RUNTIME_VERSION_RE),
  launchAsset: assetSchema,
  assets: z.array(assetSchema),
  metadata: z.record(z.string(), z.string()),
  extra: z.record(z.string(), z.unknown()),
});
export type Manifest = z.infer<typeof manifestSchema>;
export type ManifestAsset = z.infer<typeof assetSchema>;
export const directiveSchema = z.object({
  type: z.string().min(1),
  parameters: z.record(z.string(), z.unknown()).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});
export type Directive = z.infer<typeof directiveSchema>;

/** 명세 hash: SHA-256 → base64url(RFC 4648 5절, 패딩 없음) */
export function assetHash(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('base64url');
}

type Headers = Record<string, string | string[] | undefined>;
function one(h: Headers, name: string): string | undefined {
  const v = h[name];
  return typeof v === 'string' ? v.trim() : undefined;
}

export type ManifestRequest =
  | { ok: true; platform: OtaPlatform; runtimeVersion: string; channel: string | null; currentUpdateId: string | null; embeddedUpdateId: string | null; wantsSignature: boolean; format: ResponseFormat }
  | { ok: false; status: 400 | 406; code: string };

export type ResponseFormat = 'multipart' | 'json';

/**
 * 매니페스트 요청 헤더 판정(명세 'Request'). 고르는 데 쓰는 값만 꺼낸다.
 *  - expo-protocol-version ≠ 1 → 406(명세: 지원하지 않는 프로토콜은 406)
 *  - expo-platform이 ios·android가 아니면 400(명세 SHOULD 400/404)
 *  - expo-runtime-version 없음·모양 밖 → 400
 *  - expo-channel-name 없음·모양 밖 → channel null(고를 판 없음 = 204). 빌드 설정 실수로 앱이 오류를 보지 않게
 *  - accept 협상(명세 '고객은 셋 다 보낸다') → 맞는 게 없으면 406
 */
export function parseManifestRequest(h: Headers): ManifestRequest {
  if (one(h, 'expo-protocol-version') !== '1') return { ok: false, status: 406, code: 'protocol_version' };
  const platform = one(h, 'expo-platform');
  if (platform !== 'ios' && platform !== 'android') return { ok: false, status: 400, code: 'platform' };
  const runtimeVersion = one(h, 'expo-runtime-version');
  if (!runtimeVersion || !RUNTIME_VERSION_RE.test(runtimeVersion)) return { ok: false, status: 400, code: 'runtime_version' };
  const format = negotiate(one(h, 'accept'));
  if (!format) return { ok: false, status: 406, code: 'accept' };
  const channel = one(h, 'expo-channel-name');
  const cur = one(h, 'expo-current-update-id');
  const emb = one(h, 'expo-embedded-update-id');
  return {
    ok: true,
    platform,
    runtimeVersion,
    channel: channel && CHANNEL_RE.test(channel) ? channel : null,
    currentUpdateId: cur && UUID_RE.test(cur) ? cur.toLowerCase() : null,
    embeddedUpdateId: emb && UUID_RE.test(emb) ? emb.toLowerCase() : null,
    wantsSignature: one(h, 'expo-expect-signature') !== undefined,
    format,
  };
}

/**
 * accept 사전 협상(RFC 7231 5.3.2, q 기본 1). 같은 q면 multipart를 고른다(지시를 실을 수 있는 유일한 꼴).
 * accept가 없으면 multipart(expo-updates는 늘 보낸다 — 없을 때는 관대하게)
 */
export function negotiate(accept: string | undefined): ResponseFormat | null {
  if (!accept) return 'multipart';
  let best: { f: ResponseFormat; q: number } | null = null;
  for (const raw of accept.split(',')) {
    const [type, ...params] = raw.split(';').map((s) => s.trim().toLowerCase());
    const qp = params.find((p) => p.startsWith('q='));
    const q = qp ? Number(qp.slice(2)) : 1;
    if (!Number.isFinite(q) || q <= 0) continue;
    const f: ResponseFormat | null =
      type === 'multipart/mixed' || type === '*/*' || type === 'multipart/*' ? 'multipart' : type === 'application/expo+json' || type === 'application/json' || type === 'application/*' ? 'json' : null;
    if (!f) continue;
    if (!best || q > best.q || (q === best.q && f === 'multipart')) best = { f, q };
  }
  return best?.f ?? null;
}

/** Expo SFV 0 사전(문자열 값만). 명세 expo-sfv-0 = RFC 8941 부분집합. 따옴표·역슬래시를 이스케이프 */
export function sfvDictionary(entries: Record<string, string>): string {
  return Object.entries(entries)
    .map(([k, v]) => {
      if (!/^[a-z*][a-z0-9_\-.*]*$/.test(k)) throw new Error('SFV 키 모양이 아니다');
      if (!/^[\x20-\x7e]*$/.test(v)) throw new Error('SFV 문자열은 출력 가능한 ASCII만');
      return `${k}="${v.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
    })
    .join(', ');
}

/** `expo-signature` 헤더 값(명세 'Other response headers': sig 필수, keyid 선택) */
export function signatureHeader(sig: string, keyId: string | null): string {
  return sfvDictionary(keyId ? { sig, keyid: keyId } : { sig });
}

/**
 * 서명: RSA-SHA256(PKCS#1 v1.5), 본문 UTF-8 바이트 그대로, base64(표준). expo-updates 클라이언트와 공식 예시 서버가 쓰는 방식
 * (custom-expo-updates-server common/helpers.ts signRSASHA256). **퍼블리시 CLI에서만 부른다 — 서버 프로세스에는 개인키가 없다.**
 */
export function signBody(body: string, privateKeyPem: string): string {
  const s = createSign('RSA-SHA256');
  s.update(body, 'utf8');
  s.end();
  return s.sign(privateKeyPem, 'base64');
}

/** 검증(시험·CLI 자체 확인). 공개키 PEM 또는 인증서 PEM */
export function verifyBody(body: string, sig: string, publicKeyOrCertPem: string): boolean {
  const v = createVerify('RSA-SHA256');
  v.update(body, 'utf8');
  v.end();
  return v.verify(publicKeyOrCertPem, sig, 'base64');
}

export interface Part {
  name: 'manifest' | 'directive';
  body: string;
  signature?: string | null;
}

/**
 * multipart/mixed 본문(명세 'Multipart response', RFC 2046 5.1). 파트 머리: content-disposition(name)·content-type·(서명 시) expo-signature.
 * 경계는 무작위 — 본문(JSON)에 같은 줄이 나올 수 없게 충분히 길게
 */
export function multipart(parts: readonly Part[]): { contentType: string; body: Buffer } {
  const boundary = `mong-ota-${randomBytes(18).toString('hex')}`;
  const chunks: string[] = [];
  for (const p of parts) {
    if (p.body.includes(`--${boundary}`)) throw new Error('경계 충돌');
    chunks.push(`--${boundary}\r\n`);
    chunks.push(`content-disposition: form-data; name="${p.name}"\r\n`);
    chunks.push('content-type: application/json; charset=utf-8\r\n');
    if (p.signature) chunks.push(`expo-signature: ${p.signature}\r\n`);
    chunks.push(`\r\n${p.body}\r\n`);
  }
  chunks.push(`--${boundary}--\r\n`);
  return { contentType: `multipart/mixed; boundary=${boundary}`, body: Buffer.from(chunks.join(''), 'utf8') };
}

/** 매니페스트 응답의 공통 헤더(명세 'Common response headers'). expo-server-defined-headers·expo-manifest-filters는 **보내지 않는다** — 9절 */
export const COMMON_HEADERS: Readonly<Record<string, string>> = {
  'expo-protocol-version': '1',
  'expo-sfv-version': '0',
  // 명세 권장값. 매 요청 최신 판을 본다(CDN·프록시 캐시 금지)
  'cache-control': 'private, max-age=0',
};

/** 에셋 캐시(명세 'Asset response headers' 권장값 — 내용 주소라 영원히 같다) */
export const ASSET_CACHE = 'public, max-age=31536000, immutable';

/**
 * 롤백 지시 본문(명세 Directive + expo-updates rollBackToEmbedded: commitTime이 지금 실행 판보다 늦으면 내장 번들로).
 * extra에 판 번호·채널을 실어 서명 안에 묶는다(리뷰 M3 — 서버가 행과 대조)
 */
export function rollbackDirective(commitTime: Date, binding: Binding): string {
  return JSON.stringify({ type: 'rollBackToEmbedded', parameters: { commitTime: commitTime.toISOString() }, extra: { seq: String(binding.seq), channel: binding.channel } });
}

/** 서명 안에 묶는 판 번호·채널(매니페스트는 metadata, 지시는 extra — 명세상 둘 다 문자열 사전 자리) */
export interface Binding {
  seq: number;
  channel: string;
}

/**
 * 서명된 원문이 그 행의 (판 번호·채널)과 같은가. 다르면 옛 판의 서명 원문을 새 행(더 큰 seq)에 넣어 다시 내미는 재생이거나 다른 채널 판이다.
 * 매니페스트 = metadata.seq·metadata.channel, 지시 = extra.seq·extra.channel
 */
export function bodyBinding(body: string, kind: 'update' | 'rollback'): Binding | null {
  try {
    const o = JSON.parse(body) as { metadata?: Record<string, unknown>; extra?: Record<string, unknown> };
    const b = kind === 'update' ? o.metadata : o.extra;
    const seq = Number(b?.seq);
    return typeof b?.seq === 'string' && Number.isInteger(seq) && seq > 0 && typeof b.channel === 'string' ? { seq, channel: b.channel } : null;
  } catch {
    return null;
  }
}

/** accept-encoding에서 고를 압축(br > gzip > 원본). q=0은 거부 */
export function pickEncoding(acceptEncoding: string | undefined): 'br' | 'gzip' | null {
  if (!acceptEncoding) return null;
  const ok = new Set<string>();
  for (const raw of acceptEncoding.split(',')) {
    const [name, ...params] = raw.split(';').map((s) => s.trim().toLowerCase());
    const qp = params.find((p) => p.startsWith('q='));
    if (qp && !(Number(qp.slice(2)) > 0)) continue;
    if (name) ok.add(name);
  }
  if (ok.has('br')) return 'br';
  if (ok.has('gzip')) return 'gzip';
  return null;
}
