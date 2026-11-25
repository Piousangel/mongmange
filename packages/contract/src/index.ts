// @mong/contract — 앱·서버·정적 배포 CI가 **같은 코드로** 읽는 원격 계약(architecture.md v2.1 3-6·3-7·3-10, dreams-30days v1.1 5-2).
// - 한 파일로 둔다: 정적 배포 스크립트(apps/web-static/scripts)가 빌드 없이 `node`(타입 지우기)로 바로 import한다.
//   그래서 상대 import·enum·namespace 같은 '지울 수 없는 TS 문법'을 쓰지 않는다(tsconfig erasableSyntaxOnly).
// - Node·RN·DOM API 금지(core와 같은 계약). 의존성은 zod 하나 — **`zod/mini`**(함수형 API, 트리 셰이킹)로 써서 앱 번들 증가를 줄인다
//   (B0 리뷰 m8: 전체 zod는 앱에 gzip 약 95KB). 서버·CI도 같은 스키마 객체를 쓰므로 판정이 같다.
import * as z from 'zod/mini';

const str = (re: RegExp) => z.string().check(z.regex(re));
const int = (min: number, max?: number) => (max === undefined ? z.int().check(z.minimum(min)) : z.int().check(z.minimum(min), z.maximum(max)));
const num = (min: number, max: number) => z.number().check(z.minimum(min), z.maximum(max));

// ───────────────────────── 공통 ─────────────────────────

/** 현지 날짜 `YYYY-MM-DD`. 시각은 받지 않는다(정밀 시각은 식별 단서가 된다, 5-2) */
export const isoDate = str(/^\d{4}-\d{2}-\d{2}$/).check(
  z.superRefine((s, ctx) => {
    const d = new Date(`${s}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) ctx.addIssue({ code: 'custom', message: '없는 날짜' });
  }),
);

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` + n일 → `YYYY-MM-DD`(UTC 달력 산술 — 시간대와 무관한 날짜 계산) */
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** 두 날짜의 차(b − a, 일) */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** ms 시각 + 현지 오프셋(분, 동쪽 +) → 현지 날짜. 앱은 이 값만 보낸다 */
export function localDate(ms: number, tzOffsetMin: number): string {
  return new Date(ms + tzOffsetMin * 60_000).toISOString().slice(0, 10);
}

// ───────────────────────── 집계 핑(3-6) ─────────────────────────

/**
 * 이벤트 화이트리스트 10개(architecture v1 3-6에서 정하고 v2.1이 '늘리지 않는다'로 고정).
 * 늘리면 처리방침 3-1('정해진 게임 사건 10가지')과 스토어 라벨을 함께 고쳐야 한다 — contract 테스트가 개수를 고정한다.
 */
export const PING_EVENTS = [
  'first_tap',
  'first_night',
  'ire7',
  'share_open',
  'share_link',
  'share_image',
  'name_set',
  'ink_chosen',
  'cloud_on',
  'restore_ok',
] as const;
export type PingEvent = (typeof PING_EVENTS)[number];

/** 기기에서 평생 한 번만 보내는 이벤트(개수 비율 = 사람 비율이 되게) */
export const ONCE_EVENTS: readonly PingEvent[] = ['first_tap', 'first_night', 'ire7', 'name_set', 'ink_chosen', 'cloud_on'];

/** '열기' 칸. 하루 첫 실행 때 그날 dayN으로 한 번 — 이벤트 목록 안의 특별 항목으로 실어 보낸다(오프라인이면 아웃박스) */
export const OPEN_EVENT = 'open';
export const METRIC_EVENTS = [OPEN_EVENT, ...PING_EVENTS] as const;
export type MetricEvent = (typeof METRIC_EVENTS)[number];

export const DAY_N_MAX = 400;
/** 아웃박스에서 이만큼(일) 지난 항목은 앱이 버리고, 서버도 받지 않는다 */
export const EVENT_MAX_AGE_DAYS = 7;
/** 핑 하나의 이벤트 수 상한 */
export const PING_MAX_EVENTS = 32;
/** 서버 날짜와 `cohortDay + dayN`의 허용 차(일). 시간대 ±14h + 기기 시계 오차 */
export const PING_DATE_SLACK_DAYS = 2;

const dayN = int(0, DAY_N_MAX);

/**
 * 앱 버전 = **출시 판**(`1.0`). 바이너리 빌드 번호는 싣지 않는다(B0 리뷰 I2: 칸이 잘게 갈라져 한 사람 칸이 생긴다).
 * 서버는 이 형식에 더해 설정의 '알려진 출시 판' 목록에 있는 값만 받는다(I5: 칸 수 폭주 방지).
 */
export const APP_VER_RE = /^\d{1,2}\.\d{1,2}$/;

export const pingDimsSchema = z.strictObject({
  /** 이름 시점 군 — 설치 첫 실행 때 별도 로컬 난수로 정해 늘 보낸다 */
  nt: z.enum(['A', 'B']),
  /** 위젯 — dayN 7 첫 실행 때 한 번 재서 고정. 그 전(또는 잴 수 없는 기기)은 '-' */
  wg: z.enum(['0', '1', '-']),
  /** 그 이벤트가 일어난 현지 날짜가 보름 창인가 */
  moon: z.enum(['0', '1']),
});
export type PingDims = z.infer<typeof pingDimsSchema>;

/**
 * 핑 하나. **모든 객체가 strict** — 모르는 키(기기 id·세이브 씨앗·시각 등)가 하나라도 있으면 통째로 실패한다.
 * 값도 닫혀 있다: 날짜는 일 단위, 차원은 열거, 문자열은 정규식. 자유 문자열 칸이 없다.
 */
export const pingSchema = z
  .strictObject({
    /** 설치일(기기 현지 날짜) */
    cohortDay: isoDate,
    /** 보내는 날의 n일째(= 오늘 − 설치일) */
    dayN,
    platform: z.enum(['ios', 'android']),
    /** 출시 판 `1.0`(빌드 번호 없음) */
    appVer: str(APP_VER_RE),
    lang: z.enum(['ko', 'en']),
    dims: pingDimsSchema,
    events: z.array(z.strictObject({ e: z.enum(METRIC_EVENTS), dayN })).check(z.minLength(1), z.maxLength(PING_MAX_EVENTS)),
  })
  .check(z.superRefine((p, ctx) => {
    for (const [i, ev] of p.events.entries()) {
      if (ev.dayN > p.dayN || ev.dayN < p.dayN - EVENT_MAX_AGE_DAYS) {
        ctx.addIssue({ code: 'custom', path: ['events', i, 'dayN'], message: '보내는 날보다 늦거나 너무 오래됨' });
      }
      // 7일째 전에는 위젯 값이 정해질 수 없다(정해진 뒤 값으로 옛 칸을 더럽히지 않게)
      if (ev.dayN < 7 && p.dims.wg !== '-') {
        ctx.addIssue({ code: 'custom', path: ['dims', 'wg'], message: '7일째 전 이벤트에 위젯 값' });
      }
    }
  }));
export type Ping = z.infer<typeof pingSchema>;

/** 서버 날짜 검사: 보내는 날(`cohortDay + dayN`)이 서버 UTC 날짜 ±2일 안인가 */
export function pingDateOk(p: Pick<Ping, 'cohortDay' | 'dayN'>, serverNowMs: number): boolean {
  const sent = addDays(p.cohortDay, p.dayN);
  const today = new Date(serverNowMs).toISOString().slice(0, 10);
  return Math.abs(daysBetween(today, sent)) <= PING_DATE_SLACK_DAYS;
}

/** 집계 칸 하나 = `metric_daily`의 기본 키. 사람·기기·시각을 가리키는 값이 없다 */
export interface MetricCell {
  /** 그 이벤트가 일어난 현지 날짜(= cohortDay + dayN) */
  day: string;
  event: MetricEvent;
  cohortDay: string;
  dayN: number;
  platform: Ping['platform'];
  appVer: string;
  lang: Ping['lang'];
  nt: PingDims['nt'];
  wg: PingDims['wg'];
  moon: PingDims['moon'];
}
export const METRIC_CELL_KEYS = ['day', 'event', 'cohortDay', 'dayN', 'platform', 'appVer', 'lang', 'nt', 'wg', 'moon'] as const;

/** 검증된 핑 → 칸 목록(이벤트마다 하나, 같은 칸은 여러 번 나올 수 있다) */
export function pingToCells(p: Ping): MetricCell[] {
  return p.events.map((ev) => ({
    day: addDays(p.cohortDay, ev.dayN),
    event: ev.e,
    cohortDay: p.cohortDay,
    dayN: ev.dayN,
    platform: p.platform,
    appVer: p.appVer,
    lang: p.lang,
    nt: p.dims.nt,
    wg: p.dims.wg,
    moon: p.dims.moon,
  }));
}

// ───────────────────────── 원격 문서 무결성(B4 — architecture.md 3-7-2) ─────────────────────────
// config/v1.json·content/v1.json은 Firebase 정적 파일이다. 호스팅 계정·배포 경로가 뚫려도 앱이 남의 문서를 따르지 않게
// **오프라인 개인키(오너 보관, 서버에 없음)로 서명**하고 앱이 번들에 든 공개키로 검사한다(OTA와 같은 원칙, ota-self-host.md 1절).
// - 알고리즘 RS256(RSASSA-PKCS1-v1_5 + SHA-256). 앱(Hermes)에 WebCrypto가 없어 **순수 JS 검사**를 여기 둔다 —
//   RSA 검사는 공개 지수 거듭제곱 한 번 + 기대 바이트열 통째 비교라 파싱이 없고(서명 위조 계열 버그 자리가 없다) 코드가 짧다. Ed25519는 같은 일에 코드가 3배.
// - 서명 원문 = `mong-remote-sig:1\n{종류}\n{sig를 뺀 정규 JSON}` — 종류(config/v1·content/v1)가 묶여 서명을 다른 문서로 옮길 수 없다.
//   정규 JSON은 **받은 그대로의 객체**(zod가 기본값을 채우거나 모르는 키를 지우기 전)에서 만든다.
// - 팩 파일(모티프·사전)은 서명하지 않는다: 서명된 매니페스트의 sha256이 파일을 묶는다(앱은 sha256Hex로 검사).

/** 문자열 → UTF-8 바이트(TextEncoder가 없는 런타임용). 짝 없는 서로게이트는 U+FFFD(Node Buffer와 같음) */
export function utf8Bytes(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d < 0xe000) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c >= 0xd800 && c < 0xe000) c = 0xfffd;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

const SHA256_K = Uint32Array.of(
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
);
const ror = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** SHA-256(FIPS 180-4). 문자열은 UTF-8로 */
export function sha256(data: Uint8Array | string): Uint8Array {
  const msg = typeof data === 'string' ? utf8Bytes(data) : data;
  const len = msg.length;
  const padded = new Uint8Array((((len + 9 + 63) / 64) | 0) * 64);
  padded.set(msg);
  padded[len] = 0x80;
  const bitsHi = Math.floor(len / 0x20000000);
  const bitsLo = (len * 8) >>> 0;
  const end = padded.length;
  padded[end - 8] = bitsHi >>> 24;
  padded[end - 7] = (bitsHi >>> 16) & 255;
  padded[end - 6] = (bitsHi >>> 8) & 255;
  padded[end - 5] = bitsHi & 255;
  padded[end - 4] = bitsLo >>> 24;
  padded[end - 3] = (bitsLo >>> 16) & 255;
  padded[end - 2] = (bitsLo >>> 8) & 255;
  padded[end - 1] = bitsLo & 255;
  const h = Uint32Array.of(0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19);
  const w = new Uint32Array(64);
  for (let off = 0; off < end; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = ((padded[j]! << 24) | (padded[j + 1]! << 16) | (padded[j + 2]! << 8) | padded[j + 3]!) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      const s0 = ror(a, 7) ^ ror(a, 18) ^ (a >>> 3);
      const s1 = ror(b, 17) ^ ror(b, 19) ^ (b >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let a = h[0]!, b = h[1]!, c = h[2]!, d = h[3]!, e = h[4]!, f = h[5]!, g = h[6]!, hh = h[7]!;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + SHA256_K[i]! + w[i]!) >>> 0;
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = h[0]! + a;
    h[1] = h[1]! + b;
    h[2] = h[2]! + c;
    h[3] = h[3]! + d;
    h[4] = h[4]! + e;
    h[5] = h[5]! + f;
    h[6] = h[6]! + g;
    h[7] = h[7]! + hh;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = h[i]! >>> 24;
    out[i * 4 + 1] = (h[i]! >>> 16) & 255;
    out[i * 4 + 2] = (h[i]! >>> 8) & 255;
    out[i * 4 + 3] = h[i]! & 255;
  }
  return out;
}

/** SHA-256 소문자 16진(매니페스트 `sha256` 칸과 같은 꼴) */
export function sha256Hex(data: Uint8Array | string): string {
  let s = '';
  for (const b of sha256(data)) s += (b < 16 ? '0' : '') + b.toString(16);
  return s;
}

/**
 * 정규 JSON: 객체 키를 UTF-16 코드 단위 순으로 정렬, 공백 없음, 배열 순서 그대로, 숫자·문자열은 JSON.stringify.
 * JSON으로 나타낼 수 없는 값(NaN·Infinity·undefined·함수·BigInt)은 던진다 — 서명 원문이 조용히 달라지지 않게.
 */
export function canonicalJson(v: unknown): string {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'boolean':
      return v ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(v)) throw new Error('정규 JSON: 유한하지 않은 수');
      return JSON.stringify(v);
    case 'string':
      return JSON.stringify(v);
    case 'object': {
      if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
      const o = v as Record<string, unknown>;
      return `{${Object.keys(o)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
        .join(',')}}`;
    }
    default:
      throw new Error(`정규 JSON: 나타낼 수 없는 값(${typeof v})`);
  }
}

export const REMOTE_DOC_KINDS = ['config/v1', 'content/v1'] as const;
export type RemoteDocKind = (typeof REMOTE_DOC_KINDS)[number];
export const REMOTE_SIG_PREFIX = 'mong-remote-sig:1';

const base64url = (min: number, max: number) => str(/^[A-Za-z0-9_-]+$/).check(z.minLength(min), z.maxLength(max));
/** 키 id — 앱 번들의 공개키 목록에서 고른다(교체 = 새 키를 OTA·바이너리로 먼저 넣고 그 뒤 새 키로 서명) */
export const REMOTE_KID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** 서명 칸. RSA 2048~4096 → 서명 256~512바이트 = base64url 342~683자 */
export const remoteSigSchema = z.strictObject({ alg: z.literal('RS256'), kid: str(REMOTE_KID_RE), value: base64url(342, 683) });
export type RemoteSig = z.infer<typeof remoteSigSchema>;
/** 앱에 넣는 공개키(JWK의 n·e를 그대로) */
export const remotePublicKeySchema = z.strictObject({ kid: str(REMOTE_KID_RE), n: base64url(342, 683), e: base64url(1, 8) });
export type RemotePublicKey = z.infer<typeof remotePublicKeySchema>;

/**
 * 원격 문서 어디에도(중첩 포함) 있으면 안 되는 키(B4 리뷰 M1). `JSON.parse`는 `"__proto__"`를 **자기 속성**으로 만드는데,
 * 일반 객체에 `body[k] = v`로 옮기면 프로토타입이 바뀌어 그 키가 서명 원문에서 빠진다(서명 뒤 키를 더해도 ok가 되던 우회).
 * 그래서 이 키들은 서명 검사 **전에** 거부하고, 원문 복사는 프로토타입 없는 객체로 한다.
 */
export const REMOTE_FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'] as const;
export function hasForbiddenKey(v: unknown): boolean {
  if (v === null || typeof v !== 'object') return false;
  if (Array.isArray(v)) return v.some(hasForbiddenKey);
  for (const k of Object.keys(v)) {
    if ((REMOTE_FORBIDDEN_KEYS as readonly string[]).includes(k)) return true;
    if (hasForbiddenKey((v as Record<string, unknown>)[k])) return true;
  }
  return false;
}

/** sig를 뺀 본문(프로토타입 없는 객체). 금지 키가 있으면 던진다 — 서명 도구(remote-sign.ts)와 검사기가 같은 함수를 쓴다 */
export function remoteDocBody(doc: Record<string, unknown>): Record<string, unknown> {
  if (hasForbiddenKey(doc)) throw new Error('원격 문서에 금지 키(__proto__·constructor·prototype)가 있다');
  const body = Object.create(null) as Record<string, unknown>;
  for (const k of Object.keys(doc)) if (k !== 'sig') body[k] = doc[k];
  return body;
}

/** 서명 원문(문자열). sig 칸은 빼고 정규 JSON으로. 금지 키가 있으면 던진다 */
export function remoteSigningInput(kind: RemoteDocKind, doc: Record<string, unknown>): string {
  return `${REMOTE_SIG_PREFIX}\n${kind}\n${canonicalJson(remoteDocBody(doc))}`;
}

const B64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function base64UrlDecode(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of s) {
    acc = (acc << 6) | B64URL_ALPHABET.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
    }
    acc &= (1 << bits) - 1;
  }
  return Uint8Array.from(out);
}

const BIG0 = BigInt(0);
const BIG1 = BigInt(1);
const BIG8 = BigInt(8);
const BIG255 = BigInt(255);
function bytesToBig(b: Uint8Array): bigint {
  let x = BIG0;
  for (const v of b) x = (x << BIG8) | BigInt(v);
  return x;
}
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let r = BIG1;
  let b = base % mod;
  let e = exp;
  while (e > BIG0) {
    if ((e & BIG1) === BIG1) r = (r * b) % mod;
    b = (b * b) % mod;
    e >>= BIG1;
  }
  return r;
}
/** DER DigestInfo 머리(SHA-256) — RFC 8017 9.2 주석 1 */
const SHA256_DIGEST_INFO = [0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20];

/**
 * RSASSA-PKCS1-v1_5 SHA-256 검사(RFC 8017 8.2.2): 기대 EM을 통째로 만들어 바이트 비교(파싱 없음).
 * 키 길이 하한(2048)은 서명 칸 스키마(342자 이상)와 여기 두 겹이다 — 시험이 이 층을 직접 부르려고 내보낸다(앱은 `verifyRemoteDocStrict`만).
 */
export function rsaPkcs1Sha256Verify(nBytes: Uint8Array, eBytes: Uint8Array, msg: Uint8Array, sig: Uint8Array): boolean {
  let start = 0;
  while (start < nBytes.length && nBytes[start] === 0) start++;
  const k = nBytes.length - start;
  if (k < 256 || k > 512 || sig.length !== k) return false;
  const n = bytesToBig(nBytes);
  const e = bytesToBig(eBytes);
  const s = bytesToBig(sig);
  if (e < BigInt(3) || s >= n) return false;
  let m = modPow(s, e, n);
  const em = new Uint8Array(k);
  for (let i = k - 1; i >= 0; i--) {
    em[i] = Number(m & BIG255);
    m >>= BIG8;
  }
  const t = [...SHA256_DIGEST_INFO, ...sha256(msg)];
  const ps = k - 3 - t.length;
  if (ps < 8) return false;
  if (em[0] !== 0 || em[1] !== 1 || em[2 + ps] !== 0) return false;
  for (let i = 0; i < ps; i++) if (em[2 + i] !== 0xff) return false;
  for (let i = 0; i < t.length; i++) if (em[3 + ps + i] !== t[i]) return false;
  return true;
}

/**
 * 받은 원격 문서(JSON.parse 결과 그대로)의 서명 **판정만** 하는 낮은 층(정적 CI·CLI verify용). **앱은 쓰지 않는다** — 앱은 `verifyRemoteDocStrict`. 결과:
 * - `ok` 서명이 맞음 / `unsigned` sig 칸 없음 / `unknown_kid` 앱이 모르는 키 / `bad` 그 밖 전부(모양·값·종류가 틀림)
 * 앱 규칙(3-7-2): 공개키가 번들에 든 빌드는 `ok`만 쓰고 나머지는 '원격 없음'(캐시 → 번들 기본값)으로 본다.
 */
export type RemoteSigCheck = 'ok' | 'unsigned' | 'unknown_kid' | 'bad';
export function verifyRemoteDoc(kind: RemoteDocKind, raw: unknown, keys: readonly RemotePublicKey[]): RemoteSigCheck {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return 'bad';
  const doc = raw as Record<string, unknown>;
  if (hasForbiddenKey(doc)) return 'bad';
  if (!Object.prototype.hasOwnProperty.call(doc, 'sig')) return 'unsigned';
  const sig = remoteSigSchema.safeParse(doc.sig);
  if (!sig.success) return 'bad';
  const key = keys.find((k) => k.kid === sig.data.kid);
  if (!key) return 'unknown_kid';
  let input: string;
  try {
    input = remoteSigningInput(kind, doc);
  } catch {
    return 'bad';
  }
  const n = base64UrlDecode(key.n);
  const e = base64UrlDecode(key.e);
  const s = base64UrlDecode(sig.data.value);
  if (!n || !e || !s) return 'bad';
  return rsaPkcs1Sha256Verify(n, e, utf8Bytes(input), s) ? 'ok' : 'bad';
}

/** 만료 시각 꼴(UTC, 초까지). 서명 안에 든다 */
export const REMOTE_EXPIRES_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
/**
 * 문서 수명(B4 리뷰 M5, PM 결정): 서명할 때 `expiresAt = 지금 + 14일`(기본), 상한 30일.
 * 14일인 까닭: 호스팅을 쥔 쪽이 마지막 정상 판을 계속 내주어 새 킬 스위치를 막는 '동결'의 최대 길이를 두 주로 묶는다.
 * 만료되면 앱은 번들 기본값(서버 스위치는 모두 꺼짐)으로 돌아간다 — 그래서 운영은 **주 1회 다시 서명**하고, 출시 모드 정적 빌드는
 * 만료가 `REMOTE_EXPIRY_WARN_DAYS`일 안이면 실패한다(web-static 후속). 버린 안: 30일(동결이 한 달), 3일(주말·휴가 한 번에 기능이 꺼짐).
 */
export const REMOTE_DEFAULT_LIFETIME_DAYS = 14;
export const REMOTE_MAX_LIFETIME_DAYS = 30;
export const REMOTE_EXPIRY_WARN_DAYS = 7;
/**
 * 앱 번들의 '최소 수용 판 번호' 자리(B4 리뷰 M5): config `v`·매니페스트 `seq`가 이보다 작은 문서는 새 설치·데이터 지움 뒤에도 받지 않는다.
 * 바이너리·OTA를 만들 때 그때 배포본의 판으로 올린다(앱이 이 값을 덮는 상수를 둘 수도 있다 — C11). 0 = 바닥 없음.
 */
export const REMOTE_BUNDLE_FLOOR: Readonly<Record<RemoteDocKind, number>> = Object.freeze({ 'config/v1': 0, 'content/v1': 0 });

export type RemoteStrictResult =
  | { ok: true; version: number; expiresAtMs: number }
  | { ok: false; reason: 'unsigned' | 'unknown_kid' | 'bad' | 'no_expiry' | 'expired' | 'too_long' | 'old' };

/**
 * **앱 로더(C11)가 쓰는 유일한 검사**(B4 리뷰 M3·M5). 서명 필수 + 만료 + 바닥 판을 한 번에 본다. `ok`가 아니면 그 문서는 없는 것으로
 * (캐시 → 번들 기본값). 서명 없는 문서를 받아 주는 길이 계약에 없다 — `verifyRemoteDoc`의 `unsigned`를 앱이 따로 다루지 않게.
 * - floor: 지금 쓰는 판(캐시) 같은 바닥. 실제 바닥 = max(REMOTE_BUNDLE_FLOOR[kind], floor). 같은 판은 받는다(다시 받기).
 * - 판 = config `v` / 매니페스트 `seq`(받은 원문의 값).
 */
export function verifyRemoteDocStrict(
  kind: RemoteDocKind,
  raw: unknown,
  keys: readonly RemotePublicKey[],
  o: { nowMs: number; floor?: number },
): RemoteStrictResult {
  const sig = verifyRemoteDoc(kind, raw, keys);
  if (sig !== 'ok') return { ok: false, reason: sig };
  const doc = raw as Record<string, unknown>;
  const version = kind === 'config/v1' ? doc.v : doc.seq;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) return { ok: false, reason: 'bad' };
  const exp = doc.expiresAt;
  if (exp === undefined) return { ok: false, reason: 'no_expiry' };
  const expMs = typeof exp === 'string' && REMOTE_EXPIRES_RE.test(exp) ? Date.parse(exp) : Number.NaN;
  if (!Number.isFinite(expMs)) return { ok: false, reason: 'bad' };
  if (expMs <= o.nowMs) return { ok: false, reason: 'expired' };
  if (expMs - o.nowMs > REMOTE_MAX_LIFETIME_DAYS * DAY_MS) return { ok: false, reason: 'too_long' };
  if (version < Math.max(REMOTE_BUNDLE_FLOOR[kind], o.floor ?? 0)) return { ok: false, reason: 'old' };
  return { ok: true, version, expiresAtMs: expMs };
}

/** 되감기 막기: 앱은 지금 쓰는 판(config `v`·매니페스트 `seq`)보다 작은 판을 받지 않는다(옛 서명 문서 재생). 되돌리려면 옛 내용을 새 판 번호로 */
export function acceptRemoteVersion(current: number | null, next: number): boolean {
  return current === null || next >= current;
}

// ───────────────────────── 원격 플래그 config/v1.json(3-7) ─────────────────────────

/** 기획 6-2의 5개 + 서버 기능 3개 + 기존 hesitation(3-7). 웹 뷰어만 webLive를 읽는다 */
export const REMOTE_FLAG_KEYS = [
  'cloud',
  'link',
  'remoteMotifs',
  'webLive',
  'nameTiming',
  'jeongCaptions',
  'moonNight',
  'widget',
  'hesitation',
] as const;
export type RemoteFlagKey = (typeof REMOTE_FLAG_KEYS)[number];

/** TTL 상한 1시간(3-7: 6시간 → 1시간). 하한은 CDN 부하 보호 */
export const CONFIG_TTL_MAX_SEC = 3600;

export const motifIdSchema = str(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).check(z.maxLength(40));

const flagKey = z.enum(REMOTE_FLAG_KEYS);
const buildNo = int(0, 1_000_000);

const configFields = {
  v: int(1),
  ttlSec: int(60, CONFIG_TTL_MAX_SEC),
  /** 꿈 모티프 해금 앞당기기(dreams-30days 2-1): { 모티프 id: 카드 수 } — 앱은 min(번들, 이 값)만 쓴다 */
  dreamUnlock: z._default(z.record(motifIdSchema, int(0, 1000)), {}),
  /** 만료(UTC, 서명 안). 스키마에서는 선택 — 앱은 `verifyRemoteDocStrict`로 요구한다(B4 리뷰 M5) */
  expiresAt: z.optional(str(REMOTE_EXPIRES_RE)),
  /** 서명(3-7-2). 스키마에서는 선택 — 앱은 `verifyRemoteDocStrict`로 요구한다(정적 CI는 출시 모드에서 요구 — web-static 후속) */
  sig: z.optional(remoteSigSchema),
};

/**
 * 크래시 루프 탈출 값(3-7-2, B4 리뷰 M4 반영). 앱은 원격 값을 적용한 뒤 `withinSec` 안에 죽은 실행이 연달아 `afterCrashes`번이면 **탈출 모드**:
 * 키마다 `escapeFlags` = 번들 값 AND (원격이 끈 키는 끈 채) AND NOT off — **어느 키도 켜지지 않는다**(원격이 꺼 둔 킬 스위치가 다시 켜지지 않음).
 * 원격 팩은 매니페스트 `escape`가 고정한 판만 쓴다. 탈출은 `v`가 더 큰 설정을 받을 때 풀린다.
 * 감지 문턱은 **번들 상수**(REMOTE_ESCAPE_BUNDLED)이고, 원격은 범위 안에서 더 민감하게만 바꾼다(`escapeThresholds`) —
 * 죽게 만든 그 문서가 감지를 둔하게 만들지 못하게.
 */
export const REMOTE_ESCAPE_BUNDLED: { readonly afterCrashes: number; readonly withinSec: number } = Object.freeze({ afterCrashes: 2, withinSec: 10 });
export function escapeThresholds(remote: { afterCrashes: number; withinSec: number } | null): { afterCrashes: number; withinSec: number } {
  if (!remote) return { ...REMOTE_ESCAPE_BUNDLED };
  return { afterCrashes: Math.min(remote.afterCrashes, REMOTE_ESCAPE_BUNDLED.afterCrashes), withinSec: Math.max(remote.withinSec, REMOTE_ESCAPE_BUNDLED.withinSec) };
}
/**
 * 탈출 중 키 값. bundled = 앱 번들 기본값, lastRemote = 마지막으로 적용했던 원격의 **실효 값**(rollout·minBundle을 거친 뒤, 없으면 null).
 * 빠진 키는 꺼짐으로 본다(원격 키의 번들 기본값은 꺼짐이 원칙).
 */
export function escapeFlags(
  bundled: Partial<Record<RemoteFlagKey, boolean>>,
  lastRemote: Partial<Record<RemoteFlagKey, boolean>> | null,
  off: readonly RemoteFlagKey[],
): Record<RemoteFlagKey, boolean> {
  const out = {} as Record<RemoteFlagKey, boolean>;
  for (const k of REMOTE_FLAG_KEYS) out[k] = bundled[k] === true && lastRemote?.[k] !== false && !off.includes(k);
  return out;
}
export const REMOTE_ESCAPE_DEFAULT: { readonly afterCrashes: number; readonly withinSec: number; readonly off: readonly RemoteFlagKey[] } = Object.freeze({
  afterCrashes: 2,
  withinSec: 10,
  off: Object.freeze([]) as readonly RemoteFlagKey[],
});
const escapeDefault = () => ({ afterCrashes: REMOTE_ESCAPE_DEFAULT.afterCrashes, withinSec: REMOTE_ESCAPE_DEFAULT.withinSec, off: [] as RemoteFlagKey[] });
/** 범위 = 번들 문턱보다 둔해질 수 없는 값만(afterCrashes ≤ 2, withinSec ≥ 10) */
const escapeCommon = { afterCrashes: int(1, 2), withinSec: int(10, 60) };
const isFlagKey = (k: string): k is RemoteFlagKey => (REMOTE_FLAG_KEYS as readonly string[]).includes(k);

/**
 * 앱이 읽는 모양(lenient): 새 플래그 키가 생겨도 옛 앱이 설정 전체를 버리지 않게 모르는 키는 지운다.
 * - flags: 켬/끔. rollout: 기기 로컬 난수 < 값이면 켬(서버로 안 감). minBundle: 앱 JS의 BUNDLE_SEQ가 이보다 작으면 끈 것으로 본다.
 * - minAppBuild: 바이너리 빌드 번호가 이보다 작으면 원격 값을 통째로 무시하고 번들 기본값을 쓴다.
 */
export const remoteConfigSchema = z.object({
  ...configFields,
  flags: z.record(z.string(), z.boolean()),
  rollout: z._default(z.record(z.string(), num(0, 1)), {}),
  minBundle: z._default(z.record(z.string(), int(0)), {}),
  minAppBuild: z.object({ ios: buildNo, android: buildNo }),
  /** 모르는 키는 지우고 읽는다(새 앱이 더한 키를 옛 앱이 몰라도 설정 전체를 버리지 않게) */
  escape: z._default(
    z.object({ ...escapeCommon, off: z.pipe(z.array(z.string()), z.transform((a: string[]): RemoteFlagKey[] => a.filter(isFlagKey))) }),
    escapeDefault,
  ),
});
export type RemoteConfig = z.infer<typeof remoteConfigSchema>;

/**
 * CI가 배포 전에 거는 모양(strict): 모르는 키·플래그 오타 = 실패.
 * 플래그를 **빼는 것**은 허용한다 — 빠진 키는 '원격이 말하지 않음'이라 앱이 번들 기본값(FEATURE_DEFAULTS)을 쓴다.
 * 서버 기능 스위치(cloud·link·remoteMotifs·webLive)만은 늘 명시해야 한다(끄는 손잡이가 파일에 보이게).
 */
export const SERVER_FLAG_KEYS: readonly RemoteFlagKey[] = ['cloud', 'link', 'remoteMotifs', 'webLive'];
export const remoteConfigStrictSchema = z
  .strictObject({
    ...configFields,
    flags: z.partialRecord(flagKey, z.boolean()),
    rollout: z._default(z.partialRecord(flagKey, num(0, 1)), {}),
    minBundle: z._default(z.partialRecord(flagKey, int(0)), {}),
    minAppBuild: z.strictObject({ ios: buildNo, android: buildNo }),
    escape: z._default(z.strictObject({ ...escapeCommon, off: z.array(flagKey) }), escapeDefault),
  })
  .check(
    z.superRefine((c, ctx) => {
      if (new Set(c.escape.off).size !== c.escape.off.length) ctx.addIssue({ code: 'custom', path: ['escape', 'off'], message: '같은 키 두 번' });
      for (const k of SERVER_FLAG_KEYS) if (!(k in c.flags)) ctx.addIssue({ code: 'custom', path: ['flags', k], message: '서버 기능 스위치는 명시해야 한다' });
    }),
  );

// ───────────────────────── 원격 꿈 모티프(3-10 + dreams-30days v1.1 5-2 스키마 1) ─────────────────────────

const sha256HexStr = str(/^[0-9a-f]{64}$/);
const motifFileUrl = str(/^\/content\/motifs\/[a-z0-9]+(?:-[a-z0-9]+)*\.[0-9a-f]{8}\.json$/);
const entryCommon = {
  schema: z.literal(1),
  minAppBuild: buildNo,
  url: motifFileUrl,
  sha256: sha256HexStr,
  bytes: int(1, 64 * 1024),
};

// ── 원격 사전 팩(D-26 `lexVer`, V5d) ── 낱말 → 말결 사전의 추가분. 사전 본문 모양은 core(V5d) 몫이고, 여기는 배포 봉투만 정한다.
// 결정성(같은 말 = 같은 결): 세이브는 그 말을 읽은 `lexVer`와 결과 `sense`를 함께 남기고 다시 계산하지 않는다(heart-grain 9-2).
// 그래서 팩은 **판마다 새 파일**(내용 해시 이름)이고, 한 번 낸 (언어, 판)의 내용은 바꾸지 않는다 — 고치려면 판을 올린다.
export const LEX_LANGS = ['ko', 'en'] as const;
export type LexLang = (typeof LEX_LANGS)[number];
export const LEX_VER_MAX = 1_000_000;
/** 팩 하나 상한(ko 5천 낱말 [팀 추정] 수백 KB — 넘으면 판을 나누지 말고 형식을 줄인다) */
export const LEX_PACK_MAX_BYTES = 1024 * 1024;
export const lexPackEntrySchema = z.strictObject({
  lang: z.enum(LEX_LANGS),
  lexVer: int(1, LEX_VER_MAX),
  minAppBuild: buildNo,
  url: str(/^\/content\/lex\/(?:ko|en)-[1-9]\d{0,6}\.[0-9a-f]{8}\.json$/),
  sha256: sha256HexStr,
  bytes: int(1, LEX_PACK_MAX_BYTES),
});
export type LexPackEntry = z.infer<typeof lexPackEntrySchema>;
/** 팩 파일 머리(본문 칸은 V5d가 정한다 — 그래서 loose). 앱은 매니페스트 항목과 언어·판이 같은지 본다 */
export const lexPackHeaderSchema = z.looseObject({ schema: z.literal(1), lang: z.enum(LEX_LANGS), lexVer: int(1, LEX_VER_MAX) });
export type LexPackHeader = z.infer<typeof lexPackHeaderSchema>;
export function lexPackMatchesEntry(h: Pick<LexPackHeader, 'lang' | 'lexVer'>, e: Pick<LexPackEntry, 'lang' | 'lexVer'>): boolean {
  return h.lang === e.lang && h.lexVer === e.lexVer;
}

export const contentManifestSchema = z
  .strictObject({
    v: z.literal(1),
    /** 바뀌었을 때만 앱이 새 파일을 받는다 */
    seq: int(0),
    motifs: z.array(
      z.discriminatedUnion('kind', [
        z.strictObject({ id: motifIdSchema, kind: z.literal('weekly'), from: isoDate, ...entryCommon }),
        z.strictObject({
          id: str(/^moon-(0[1-9]|1[0-2])$/),
          kind: z.literal('moon'),
          month: int(1, 12),
          ...entryCommon,
        }),
      ]),
    ),
    /** 새 카드에서만 뽑지 않는다(이미 현상한 카드는 그대로) */
    revoked: z.array(motifIdSchema),
    /** 원격 사전 팩(D-26, V5d — 같은 매니페스트를 다시 쓴다). 빠지면 [] */
    lex: z._default(z.array(lexPackEntrySchema), () => []),
    /** 크래시 루프 탈출 때 쓸 사전 판(언어별). 0 또는 빠짐 = 번들 사전. 값은 이 매니페스트의 lex 항목이어야 한다 */
    escape: z._default(z.strictObject({ lexVer: z.partialRecord(z.enum(LEX_LANGS), int(0, LEX_VER_MAX)) }), () => ({ lexVer: {} })),
    expiresAt: z.optional(str(REMOTE_EXPIRES_RE)),
    sig: z.optional(remoteSigSchema),
  })
  .check(z.superRefine((m, ctx) => {
    const lexSeen = new Set<string>();
    for (const [i, e] of m.lex.entries()) {
      const k = `${e.lang}-${e.lexVer}`;
      if (lexSeen.has(k)) ctx.addIssue({ code: 'custom', path: ['lex', i, 'lexVer'], message: '같은 언어·판 두 번' });
      lexSeen.add(k);
      if (!e.url.startsWith(`/content/lex/${k}.`)) ctx.addIssue({ code: 'custom', path: ['lex', i, 'url'], message: 'url이 언어·판과 다르다' });
    }
    for (const [lang, v] of Object.entries(m.escape.lexVer)) {
      if (v && !lexSeen.has(`${lang}-${v}`)) ctx.addIssue({ code: 'custom', path: ['escape', 'lexVer', lang], message: '고정 판이 lex에 없다' });
    }
    const seen = new Set<string>();
    for (const [i, e] of m.motifs.entries()) {
      if (seen.has(e.id)) ctx.addIssue({ code: 'custom', path: ['motifs', i, 'id'], message: '같은 id 두 번' });
      seen.add(e.id);
      if (e.kind === 'moon' && e.id !== `moon-${String(e.month).padStart(2, '0')}`) {
        ctx.addIssue({ code: 'custom', path: ['motifs', i, 'month'], message: 'id와 month가 다르다' });
      }
      // 파일 이름의 id 부분이 항목 id와 같아야 한다(다른 모티프 파일을 가리키는 실수)
      if (!e.url.startsWith(`/content/motifs/${e.id}.`)) ctx.addIssue({ code: 'custom', path: ['motifs', i, 'url'], message: 'url이 id와 다르다' });
    }
  }));
export type ContentManifest = z.infer<typeof contentManifestSchema>;

/**
 * 사전 팩 (언어, 판) 불변(B4 리뷰 L5): 한 번 낸 `lang-lexVer`의 sha256은 바뀌지 않는다. 앱은 본 적 있는 값을 기억해 두고(lexHashIndex),
 * 정적 CI·`remote-cli sign --prev`는 직전 배포 매니페스트와 대조한다. 위반 목록(`ko-3` 꼴)이 비어 있지 않으면 그 매니페스트를 쓰지 않는다.
 */
export function lexHashIndex(m: Pick<ContentManifest, 'lex'>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of m.lex) out[`${e.lang}-${e.lexVer}`] = e.sha256;
  return out;
}
export function lexImmutableViolations(known: Readonly<Record<string, string>>, m: Pick<ContentManifest, 'lex'>): string[] {
  const bad: string[] = [];
  for (const e of m.lex) {
    const k = `${e.lang}-${e.lexVer}`;
    if (Object.prototype.hasOwnProperty.call(known, k) && known[k] !== e.sha256) bad.push(k);
  }
  return bad;
}

/**
 * 이 기기가 쓸 원격 사전 팩. null = 번들 사전.
 * - 평소: 이 언어에서 `minAppBuild ≤ 앱 빌드`이고 `lexVer > 번들 판`인 것 중 가장 큰 판.
 * - 크래시 루프 탈출 중(`escaping`): 매니페스트 `escape.lexVer`가 고정한 판만(같은 조건), 없으면 번들.
 */
export function pickLexPack(
  m: Pick<ContentManifest, 'lex' | 'escape'>,
  lang: LexLang,
  o: { appBuild: number; bundledLexVer: number; escaping?: boolean },
): LexPackEntry | null {
  const usable = (e: LexPackEntry) => e.lang === lang && e.minAppBuild <= o.appBuild && e.lexVer > o.bundledLexVer;
  if (o.escaping) {
    const pin = m.escape.lexVer[lang];
    return (pin && m.lex.find((e) => e.lexVer === pin && usable(e))) || null;
  }
  let best: LexPackEntry | null = null;
  for (const e of m.lex) if (usable(e) && (!best || e.lexVer > best.lexVer)) best = e;
  return best;
}

export const MOTIF_ZONES = ['near-alone', 'near-with', 'far-alone', 'far-with', 'center', 'moon'] as const;

/** 언어별 글자 수 상한(dreams-30days 5-2·3-6 산식). 글자 = 코드 포인트 */
export const MOTIF_TEXT_LIMITS = {
  ko: { title: 12, line: 22, scene: 45 },
  en: { title: 32, line: 45, scene: 100 },
} as const;

/**
 * 문구 금지어(dreams-30days 3-7 작가 점검표 → CI). 느낌표·말줄임표·숫자·광고체·외로움·FOMO·발 동사.
 * 영어는 같은 뜻의 대표 낱말만 막는다(원어민 검수가 따로 있다).
 */
export const MOTIF_FORBIDDEN: readonly RegExp[] = [
  /[!！]/,
  /…|\.\.\./,
  /[0-9０-９]/,
  /\bNEW\b/i,
  /외로|쓸쓸히|혼자 남아/,
  /기다렸어요|보고 싶었어요|돌아보더니|찾더니/,
  /좋아하더니|싶어 하더니/,
  /놓치지|이번 달만|한정/,
  /새로운|드디어|특별한/,
  /걸었어요|뛰었어요|따라갔어요/,
  /\b(lonely|alone again|missed you|waited for you|don't miss|limited|special|finally|walked|ran)\b/i,
];

const motifText = (lim: { title: number; line: number; scene: number }) =>
  z.strictObject({
    title: z.string().check(z.minLength(1)),
    line: z.string().check(z.minLength(1)),
    scene: z.string().check(z.minLength(1)),
  }).check(
    z.superRefine((t, ctx) => {
      for (const k of ['title', 'line', 'scene'] as const) {
        if ([...t[k]].length > lim[k]) ctx.addIssue({ code: 'custom', path: [k], message: `${lim[k]}자 초과` });
        for (const re of MOTIF_FORBIDDEN) if (re.test(t[k])) ctx.addIssue({ code: 'custom', path: [k], message: `금지 표현 ${re}` });
      }
    }),
  );

/** SVG 경로 데이터: 명령 글자·숫자·구분자만(실행 코드 0 — 3-10) */
const pathData = str(/^[MLHVCSQTAZmlhvcsqtaz0-9eE.,\s-]+$/).check(z.maxLength(4000));

/** 모티프 파일 스키마 1(dreams-30days v1.1 5-2). zone·family 정식, scene 필수, line ko 22·en 45 */
export const motifFileSchema = z
  .strictObject({
    schema: z.literal(1),
    id: motifIdSchema,
    zone: z.enum(MOTIF_ZONES),
    family: str(/^[a-z]+(?:-[a-z]+)*$/).check(z.maxLength(16)),
    paths: z.array(z.strictObject({ d: pathData, w: num(0.1, 8), layer: z.enum(['ink', 'gold', 'wash']) })).check(z.minLength(1), z.maxLength(64)),
    /** 앱에 있는 셰이더의 파라미터만(새 셰이더 소스 금지) */
    shader: z.strictObject({ bleed: num(0, 1), grain: num(0, 1), tone: z.enum(['day', 'night']) }),
    /** 언어가 없으면 그 언어에서 풀 제외(기계 번역 금지, D-17) — 최소 한 언어 */
    text: z.strictObject({ ko: z.optional(motifText(MOTIF_TEXT_LIMITS.ko)), en: z.optional(motifText(MOTIF_TEXT_LIMITS.en)) }).check(
      z.superRefine((t, ctx) => {
        if (!t.ko && !t.en) ctx.addIssue({ code: 'custom', message: '언어가 하나도 없다' });
      }),
    ),
    tags: z.optional(z.array(z.string().check(z.maxLength(24))).check(z.maxLength(8))),
  })
  .check(
    z.superRefine((m, ctx) => {
      const isMoon = m.id.startsWith('moon-');
      if (isMoon !== (m.zone === 'moon')) ctx.addIssue({ code: 'custom', path: ['zone'], message: '보름 모티프만 zone moon' });
    }),
  );
export type MotifFile = z.infer<typeof motifFileSchema>;

// ───────────────────────── 맡겨 두기·계정·삭제(B2 — architecture.md v2.2 3-2·3-3·3-4·3-4-1·3-8) ─────────────────────────
// 요청은 서버가 이 스키마로 읽고(strict — 모르는 키는 400), 응답은 앱이 이 스키마로 읽는다(C11·C12).
// 개인정보 최소(5-2): 요청에 기기 값·이름·이메일·태어난 해·달이 들어갈 칸이 없다 — 계약 시험이 고정한다.

/** 연령 확인 판(3-3 ③ '중립형 — 태어난 해·달, 기기에서 판정'). 서버는 판 번호와 통과만 받는다 */
export const AGE_GATE_VERSION = 2;
/** `{v, ok:true}` — 미달(ok:false)은 기기 밖으로 나가지 않으므로 받을 칸 자체가 없다(서버에 under14가 존재할 수 없음) */
export const ageGateSchema = z.strictObject({ v: int(1, 999), ok: z.literal(true) });
export type AgeGate = z.infer<typeof ageGateSchema>;

/** 인장 코드(= 링크 키) 8자, Crockford base32(서버 난수 40비트) */
export const CREATURE_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/;
/** 사람이 옮겨 적은 인장 코드 → 정규 8자(글귀와 같은 Crockford 읽기: 대소문자·공백·하이픈 무시, I·L → 1, O → 0). 틀리면 null */
export function normalizeCreatureCode(raw: string): string | null {
  if (raw.length > 16) return null;
  const s = raw.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  return CREATURE_CODE_RE.test(s) ? s : null;
}

export const bootstrapRequestSchema = z.strictObject({ ageGate: ageGateSchema });
export type BootstrapRequest = z.infer<typeof bootstrapRequestSchema>;
export const bootstrapResponseSchema = z.object({ userId: z.string(), creature: z.object({ code: str(CREATURE_CODE_RE) }) });
export type BootstrapResponse = z.infer<typeof bootstrapResponseSchema>;

/** 세이브 본문 상한(3-4-1 '남용 상한'): 압축 전 UTF-8 512KB, gzip 뒤 256KB → 넘으면 413 */
export const SAVE_MAX_BYTES = 512 * 1024;
export const SAVE_MAX_GZIP_BYTES = 256 * 1024;
/** 몽망이당 하루(UTC) 새로 쓰는 본문 바이트(압축 뒤) → 넘으면 429 save_quota */
export const SAVE_DAILY_GZIP_BYTES = 4 * 1024 * 1024;
/** 이력 칸별 개수 상한(3-4-1, weekly 4 = '주 1벌 최대 4주'). 기간 상한 28일·30일은 PUT 안 + pg_cron 두 겹 */
export const SAVE_VERSION_KEEP = { overwritten: 3, weekly: 4, conflict: 3, pre_restore: 3 } as const;
/** 이력 기간 상한(일) — 처리방침 6절 '최대 4주'·'충돌·복원 전 본 30일' */
export const SAVE_VERSION_MAX_DAYS = { overwritten: 28, weekly: 28, conflict: 30, pre_restore: 30 } as const;
export const SAVE_VERSION_REASONS = ['overwritten', 'weekly', 'conflict', 'pre_restore'] as const;
export type SaveVersionReason = (typeof SAVE_VERSION_REASONS)[number];

/** ISO 8601 시각(UTC `Z` 또는 오프셋). 표시용 — 서버는 판단에 쓰지 않는다(3-4 '시계') */
export const isoDateTime = str(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/).check(
  z.refine((s) => {
    const t = Date.parse(s);
    return Number.isFinite(t) && t >= Date.UTC(2025, 0, 1) && t < Date.UTC(2100, 0, 1);
  }, '시각 범위 밖'),
);

/**
 * `PUT /saves/main`(헤더 `If-Match: <rev>` 또는 처음은 `If-None-Match: *`).
 * body = core `serializeState` 문자열 그대로. 크기는 스키마가 아니라 서버가 바이트로 재서 413을 낸다.
 * resolve `keep_mine` = 409 뒤 '이 기기 몽망이'를 골랐을 때 — 덮이는 서버 본은 conflict 칸(30일)으로 간다.
 */
export const saveUploadSchema = z.strictObject({
  body: z.string().check(z.minLength(2)),
  clientSavedAt: isoDateTime,
  resolve: z.optional(z.literal('keep_mine')),
});
export type SaveUpload = z.infer<typeof saveUploadSchema>;
/** `POST /saves/main/conflicts` — 서버 본을 골랐을 때 이 기기의 진 본을 30일 맡긴다 */
export const conflictUploadSchema = z.strictObject({ body: z.string().check(z.minLength(2)), clientSavedAt: isoDateTime });
export type ConflictUpload = z.infer<typeof conflictUploadSchema>;

/** sha = 본문(UTF-8) SHA-256 소문자 16진. 앱은 자기 본의 sha와 비교해 빨리 감기·반쯤 성공을 판단한다(3-4) */
export const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
export const saveMetaSchema = z.object({
  rev: int(1),
  sha: str(SHA256_HEX_RE),
  clientSavedAt: z.string(),
  /** 미래 판 본(validated=false)은 서버가 못 읽어 null */
  dayIndex: z.nullable(int(0)),
  strokesTotal: z.nullable(int(0)),
  envelopeVer: int(0),
  simVer: int(0),
  validated: z.boolean(),
});
export type SaveMeta = z.infer<typeof saveMetaSchema>;
export const saveWithBodySchema = z.extend(saveMetaSchema, { body: z.string() });
export type SaveWithBody = z.infer<typeof saveWithBodySchema>;
export const saveWriteResponseSchema = z.object({ rev: int(1), sha: str(SHA256_HEX_RE) });
export type SaveWriteResponse = z.infer<typeof saveWriteResponseSchema>;
/** 409의 `error.details` — 서버 사본을 잃었으면(백업 복원 등) server = null → 앱은 If-None-Match: *로 다시 */
export const saveConflictDetailsSchema = z.object({ server: z.nullable(saveMetaSchema) });
export type SaveConflictDetails = z.infer<typeof saveConflictDetailsSchema>;

/** 이력 한 행. id = 행의 uuid(public_id) — 순번은 내보내지 않는다(3-4-1) */
export const saveVersionSchema = z.object({
  id: z.string(),
  reason: z.enum(SAVE_VERSION_REASONS),
  rev: int(1),
  clientSavedAt: z.string(),
  dayIndex: z.nullable(int(0)),
  strokesTotal: z.nullable(int(0)),
  validated: z.boolean(),
  createdAt: z.string(),
});
export type SaveVersion = z.infer<typeof saveVersionSchema>;
export const saveVersionWithBodySchema = z.extend(saveVersionSchema, { body: z.string() });
export type SaveVersionWithBody = z.infer<typeof saveVersionWithBodySchema>;

/**
 * 되찾기 글귀(3-3 ⑤): 80비트 보안 난수 = Crockford base32 16자, `XXXX-XXXX-XXXX-XXXX`로 보여 준다.
 * 사람이 옮겨 적으므로 읽을 때는 대소문자·하이픈·공백을 무시하고 I·L → 1, O → 0으로 읽는다(Crockford 규칙).
 */
export const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RECOVERY_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}$/;
/** 사람이 넣은 글귀 → 정규 16자(틀린 글자·길이면 null). 서버 해시·앱 입력 칸이 같은 함수를 쓴다 */
export function normalizeRecoveryCode(raw: string): string | null {
  if (raw.length > 64) return null;
  const s = raw.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(s) ? s : null;
}
/** 정규 16자 → 보여 줄 꼴 */
export function formatRecoveryCode(code16: string): string {
  return code16.match(/.{4}/g)!.join('-');
}
export const recoveryCodeResponseSchema = z.object({ code: str(RECOVERY_CODE_RE) });
export type RecoveryCodeResponse = z.infer<typeof recoveryCodeResponseSchema>;

/**
 * 인증 실패 갈래(B2b). 응답 본문 `error.code`로 가른다.
 *  - unauthorized(401): 토큰이 없거나 서명·발급자·대상·만료가 틀림 → 토큰을 새로 받아 다시. **이 경우 서버는 DB를 보지 않는다**
 *    (sub가 있든 없든 같은 본문 — 서명이 맞지 않는 토큰으로 계정 유무를 떠볼 수 없다).
 *  - noAccount(401 `no_account`): 토큰은 유효하게 서명됐지만 서버에 그 로그인(sub)에 붙은 사용자가 없다(지움·Auth 삭제 대기·맡긴 적 없음).
 *    토큰을 새로 받아도 같다 → 세션·기기 기록을 비우고 새로 시작. 알 수 있는 것은 '토큰 주인 자신의 로그인'뿐이다.
 *  - alreadyGone(410 `no_account`): DELETE /me 전용 — 지울 것이 없다(이미 지워짐으로 본다).
 *  - moved(410 `moved`): 되찾기로 다른 기기로 옮겨 감.
 */
export const AUTH_ERROR = {
  unauthorized: { status: 401, code: 'unauthorized' },
  noAccount: { status: 401, code: 'no_account' },
  alreadyGone: { status: 410, code: 'no_account' },
  moved: { status: 410, code: 'moved' },
} as const;
/** `POST /recover` — 새 기기는 bootstrap 없이 이것만 부른다(3-3 ⑤). 연령 확인은 새 기기에서 다시 한다 */
export const recoverRequestSchema = z.strictObject({ code: z.string().check(z.maxLength(64)), ageGate: ageGateSchema });
export type RecoverRequest = z.infer<typeof recoverRequestSchema>;
/**
 * 200 응답. **멱등(B2b)**: 커밋 뒤 응답이 끊겨 **같은 기기 로그인**이 **같은 글귀**로 다시 부르면 409가 아니라 200 + `replay: true`.
 * 그때 creature.code는 그 몽망이의 인장 코드, newCode는 첫 응답과 같은 글귀(글귀를 다시 바꾸지 않는다), save는 지금 메타다.
 * 재시도는 첫 되찾기 뒤 **24시간 안**에만 받는다(그 뒤·다른 몽망이의 글귀면 지금처럼 409 has_creature).
 * 앱은 기존 기록을 덮지 않고, 기록의 creature와 creature.code를 확인한 뒤에만 반영한다(DECISIONS B2b '앱이 맞출 것').
 */
export const recoverResponseSchema = z.object({
  creature: z.object({ code: str(CREATURE_CODE_RE) }),
  save: z.nullable(saveMetaSchema),
  newCode: str(RECOVERY_CODE_RE),
  replay: z.optional(z.literal(true)),
});
export type RecoverResponse = z.infer<typeof recoverResponseSchema>;

/**
 * `GET /me/data` — '맡긴 것 보기'(C12f, 처리방침 12절 열람 요구). 인증 필수, 본인 것만, no-store.
 * **메타만** 내려 준다: 세이브·이력 본문, 이름(링크 메타의 name 포함), 글귀(해시 포함), sub·userId·IP, sha는 칸 자체가 없다(strict —
 * 서버가 칸을 더 붙이면 앱이 읽지 못해 'server' 실패로 드러난다). 크기 bytes = 서버에 보관된 압축(gzip) 본문 바이트.
 * creatures = 이 계정의 몽망이 수(0·1). lastSavedAt = 서버가 마지막으로 받은 때(서버 시각), clientSavedAt = 기기가 저장한 때(표시용).
 */
const isoMonth = str(/^\d{4}-\d{2}$/);
const isoDay = str(/^\d{4}-\d{2}-\d{2}$/);
/** 사용자당 시간 한도(전역 IP 분당 한도와 별개) — 화면을 여닫는 정도로는 닿지 않는 값 */
export const MY_DATA_PER_HOUR = 30;
export const myDataSchema = z.strictObject({
  account: z.strictObject({
    createdAt: z.string(),
    lastActiveMonth: z.nullable(isoMonth),
    ageGateVersion: z.nullable(int(1, 999)),
    ageConfirmedOn: z.nullable(isoDay),
    /** 이 계정에 붙은 로그인 수(지금 쓰는 것) / 되찾기로 옮겨 가 끊긴 로그인 수 */
    logins: int(0),
    movedLogins: int(0),
    deletionPendingUntil: z.nullable(z.string()),
  }),
  creatures: int(0, 1),
  creature: z.nullable(
    z.strictObject({
      code: str(CREATURE_CODE_RE),
      createdAt: z.string(),
      recoveryCodeSet: z.boolean(),
      link: z.strictObject({
        enabled: z.boolean(),
        nameVisible: z.boolean(),
        /** 지금 공개 페이지에 이름이 실려 있나(이름 글자는 내려 주지 않는다) */
        nameShown: z.boolean(),
        pageState: z.nullable(z.enum(['live', 'off', 'quarantined', 'removed'])),
        publishedAt: z.nullable(z.string()),
      }),
    }),
  ),
  save: z.nullable(
    z.strictObject({
      rev: int(1),
      clientSavedAt: z.string(),
      lastSavedAt: z.string(),
      dayIndex: z.nullable(int(0)),
      strokesTotal: z.nullable(int(0)),
      validated: z.boolean(),
      bytes: int(0),
    }),
  ),
  versions: z.array(
    z.strictObject({
      reason: z.enum(SAVE_VERSION_REASONS),
      createdAt: z.string(),
      clientSavedAt: z.string(),
      dayIndex: z.nullable(int(0)),
      strokesTotal: z.nullable(int(0)),
      bytes: int(0),
    }),
  ),
});
export type MyData = z.infer<typeof myDataSchema>;

/** 삭제 영수증(3-8): 128비트 난수 base64url 22자. 서버는 해시만, 24시간 */
export const DELETION_RECEIPT_RE = /^[A-Za-z0-9_-]{22}$/;
export const DELETION_RECEIPT_TTL_HOURS = 24;
/**
 * `DELETE /me` 202 `{receipt}`. **멱등(B2b)**: 유효하게 서명된 토큰인데 그 로그인에 붙은 사용자가 서버에 없으면(이미 지움·Auth 삭제 대기·
 * 맡긴 적 없음) **410 `no_account`** — 지울 것이 없다. 202가 아닌 까닭: 202는 영수증을 약속하는데, 지운 계정의 영수증을 다시 내려면
 * 지운 사용자를 알아보는 흔적이 필요하다(삭제 뒤 흔적 0). 서버는 토큰의 sub에 user_auth 행이 없다는 사실만 본다.
 */
export const deleteMeResponseSchema = z.object({ receipt: str(DELETION_RECEIPT_RE) });
export type DeleteMeResponse = z.infer<typeof deleteMeResponseSchema>;
export const deletionStatusSchema = z.object({ state: z.enum(['pending', 'done']) });
export type DeletionStatus = z.infer<typeof deletionStatusSchema>;
/**
 * 웹 `/delete`(3-8 ② — 앱 없이 지우기): 인장 코드와 되찾기 글귀가 **둘 다** 같은 몽망이를 가리킬 때만 처리한다.
 * 코드는 링크 주소에 공개된 값이라 그것만으로는 본인 확인이 안 된다(A4 리뷰 I5).
 */
export const webDeletionRequestSchema = z.strictObject({ code: z.string().check(z.maxLength(16)), phrase: z.string().check(z.maxLength(64)) });
export type WebDeletionRequest = z.infer<typeof webDeletionRequestSchema>;

// ───────────────────────── 공유 링크·웹 뷰어(B3 — architecture.md v2.2 3-2 링크 행·3-5·3-5-1~3-5-3·3-9) ─────────────────────────

/**
 * 공개 파일 셋(3-5 표): 포스터·OG·루프는 앱이 만들어 **비공개 page-staging**에 서명 URL로 올리고, snap.json은 서버가 쓴다.
 * 콘텐츠 유형은 파일마다 하나로 고정(버킷 allowed_mime_types와 같음). 해상도·길이는 commit 검사 값.
 */
export const PAGE_FILES = {
  poster: { name: 'poster.jpg', contentType: 'image/jpeg', maxBytes: 250 * 1024, width: 1080, height: 1350 },
  og: { name: 'og.jpg', contentType: 'image/jpeg', maxBytes: 150 * 1024, width: 1200, height: 630 },
  loop: { name: 'loop.mp4', contentType: 'video/mp4', maxBytes: 600 * 1024, width: 540, height: 676 },
} as const;
export type PageFileKind = keyof typeof PAGE_FILES;
/** 루프 540×676(PM 11-20 개정: 540×675 → 676 — H.264 4:2:0은 홀수 높이를 못 만든다). 길이 허용 범위(초) — 3-5-3 ③ */
export const LOOP_SECONDS = { min: 7.5, max: 8.5 } as const;
/** 서명 업로드 URL 수명(초) — 3-8 '서명 URL 1회·5분' */
export const UPLOAD_URL_TTL_SEC = 300;
/** 사용자당 하루 PUT page 상한(3-8) */
export const PAGE_PUT_PER_DAY = 20;
/** 공개 스냅숏 본문 상한(3-5-1 ①, 넘으면 413). core SNAP_LIMITS.bytes와 같은 값 */
export const SNAP_MAX_BYTES = 32 * 1024;

const fileDecl = <K extends PageFileKind>(k: K) =>
  z.strictObject({ contentType: z.literal(PAGE_FILES[k].contentType), bytes: int(1, PAGE_FILES[k].maxBytes) });

/**
 * `PUT /creature/page` — 링크 켜기·다시 만들기. snapshot은 여기서 모양만(객체) 보고, 내용은 서버가 core parsePublicSnapshot으로 본다
 * (core가 정본, contract에 형식을 두 벌 두지 않는다). name은 nameVisible일 때만 보낸다(3-5-2)
 */
export const pagePutRequestSchema = z.strictObject({
  snapshot: z.record(z.string(), z.unknown()),
  nameVisible: z.boolean(),
  name: z.optional(z.string().check(z.maxLength(64))),
  lang: z.enum(['ko', 'en']),
  files: z.strictObject({ poster: fileDecl('poster'), og: fileDecl('og'), loop: z.optional(fileDecl('loop')) }),
});
export type PagePutRequest = z.infer<typeof pagePutRequestSchema>;
export const uploadSlotSchema = z.object({ signedUrl: z.string(), token: z.string(), contentType: z.string(), maxBytes: z.number() });
export type UploadSlot = z.infer<typeof uploadSlotSchema>;
export const pagePutResponseSchema = z.object({
  ver: int(1),
  nameAllowed: z.boolean(),
  url: z.string(),
  upload: z.object({ poster: uploadSlotSchema, og: uploadSlotSchema, loop: z.optional(uploadSlotSchema) }),
});
export type PagePutResponse = z.infer<typeof pagePutResponseSchema>;

export const PAGE_STATES = ['live', 'off', 'quarantined', 'removed'] as const;
export type PageState = (typeof PAGE_STATES)[number];
/** `GET /creature`·`PATCH /creature` 응답 — 앱 안 표시는 이 값(즉시, no-store) */
export const creatureInfoSchema = z.object({
  code: str(CREATURE_CODE_RE),
  linkEnabled: z.boolean(),
  nameVisible: z.boolean(),
  page: z.nullable(z.object({ ver: int(0), state: z.enum(PAGE_STATES) })),
  /** 운영자가 이름을 가렸다(B5, 3-5-2 '이름 가리기') — 앱은 이름 공개 켜기를 막고 NAME_BLOCKED_NOTICE_KEY 문구를 보인다. 해제는 운영자만 */
  nameBlocked: z.boolean(),
  /**
   * 운영자 계정 삭제 대기(B5 리뷰 H1): 이 시각(ISO)에 서버에 맡긴 것이 지워진다. 앱은 ACCOUNT_DELETION_NOTICE_KEY 문구로 알린다. 대기 아니면 null
   */
  deletionPendingUntil: z.nullable(z.string()),
});
export type CreatureInfo = z.infer<typeof creatureInfoSchema>;
export const creaturePatchSchema = z.strictObject({ nameVisible: z.boolean() });
export type CreaturePatch = z.infer<typeof creaturePatchSchema>;
/** commit 실패 `422 {file, reason}`의 이유 */
export const COMMIT_REJECT_REASONS = [
  'missing',
  'too_big',
  'signature',
  'dimensions',
  'not_faststart',
  'duration',
  'tracks',
  'audio',
  'box',
] as const;
export type CommitRejectReason = (typeof COMMIT_REJECT_REASONS)[number];

// ───────────────────────── 안전 장치(B5 — architecture.md v2.2 3-8 '신고 → 자동 숨김'·3-9·3-12·3-5-2 '이름 가리기') ─────────────────────────

/**
 * 신고 사유 코드. **자유 글은 받지 않는다**(D-21 P3 '사람끼리 글을 주고받지 않음' — 신고에도 글 칸이 없다). 순서 = 폼 순서.
 * sexual 성적인 모양 / hate 혐오·괴롭힘 / personal 실명·연락처 같은 개인정보(이름 가리기 판단) / other 그 밖
 */
export const REPORT_REASONS = ['sexual', 'hate', 'personal', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
/** `POST /m/{code}/report` 앱 본문(JSON). 웹 폼은 같은 이름의 `reason` 한 칸(x-www-form-urlencoded) */
export const reportRequestSchema = z.strictObject({ reason: z.enum(REPORT_REASONS) });
export type ReportRequest = z.infer<typeof reportRequestSchema>;
/** 판정 창 = 대상별 소금 수명(3-8 ④, 처리방침 3-6 '신고 대상별 최대 7일') */
export const REPORT_WINDOW_DAYS = 7;
/**
 * 창 안 서로 다른 신고자 수가 이만큼이면 즉시 격리(3-8 ③, 처리방침 5절 '서로 다른 3명'). 신고자 = IP 접두 — IPv4 /32·**IPv6 /48**
 * (B5 리뷰 H2: 흔한 VPS가 /48을 주므로 /64 셋을 얻는 비용이 0이다. 레이트 리밋 키는 /64 그대로)
 */
export const REPORT_HIDE_THRESHOLD = 3;
/** 신고 요청 한도(3-8 표 `/m/*\/report` IP 접두당 5/시간) */
export const REPORT_PER_HOUR = 5;
/** 운영자 확인 SLA(3-8 ⑤)와 격리 최대 보관(처리방침 5·6절 '최대 30일' — 넘으면 **복원**이 기본값, B5 리뷰 H2) */
export const MODERATION_SLA_DAYS = 7;
export const QUARANTINE_MAX_DAYS = 30;
/**
 * 이름을 운영자가 가렸을 때 주인 앱 안내 문구 키(자리만 — **문구·노출 여부는 결정 대기**: architecture 0-4 'name_blocked 해제 뒤 주인 앱 안내 문구', PM·작가).
 * 앱 문구 파일에는 C11이 이 키로 넣는다. 서버는 `PATCH /creature {nameVisible:true}`·`PUT page {nameVisible:true}`에 409 `name_blocked`를 준다
 */
export const NAME_BLOCKED_NOTICE_KEY = 'link.nameBlocked';
/** 복원된 대상은 이 기간 자동 숨김 면역 — 문턱을 넘어도 운영자 대기 목록에만(B5 리뷰 H2: 복원 직후 같은 공격으로 바로 다시 숨기지 못하게) */
export const REPORT_IMMUNITY_DAYS = 7;
/**
 * 서비스 전체 자동 숨김 차단기: 최근 1시간 자동 숨김이 이만큼이면 그다음부터는 숨기지 않고 대기 목록에만 + error 알림(B5 리뷰 H2).
 * 5의 근거 [팀 추정]: 소프트런칭 링크 수백~수천 개에서 자동 숨김은 하루 0~1건 수준으로 본다 — 한 시간에 5건은 평소의 100배 넘는 이상치다
 * (조직적 신고 또는 프록시 남용). 한 시간 5건은 오너 혼자 그날 안에 판단할 수 있는 양이고, 그 뒤 실제로 나쁜 페이지가 늦게 숨는 비용보다
 * 정상 페이지가 대량으로 숨는 비용이 크다(공개는 주인이 켠 링크뿐 — 피드가 없다)
 */
export const REPORT_AUTO_HIDE_PER_HOUR = 5;
/** 운영자 계정 삭제 대기(B5 리뷰 H1) — 요청 뒤 이만큼 지나야 실행, 그 사이 주인 앱 알림·운영자 취소 */
export const ACCOUNT_DELETION_WAIT_HOURS = 72;
/** 삭제 대기 중 주인 앱 안내 문구 키(자리만 — 문구는 작가·PM, 앱 연결은 C11) */
export const ACCOUNT_DELETION_NOTICE_KEY = 'account.deletionPending';
