// B4 독립 리뷰(docs/team/reviews/2026-11-25-b4-review.md) 반영 시험 — 재현을 먼저 쓰고 고쳤다.
// M1 `__proto__` 서명 우회 / M2 검사기 보안 줄 3개(PS 0xff·s<n·키 길이 하한) / M3·M5 서명 필수·만료·바닥 판 / M4 탈출 = 끄기만 / L5 사전 팩 불변.
import { describe, expect, it } from 'vitest';
import {
  escapeFlags,
  escapeThresholds,
  lexHashIndex,
  lexImmutableViolations,
  REMOTE_BUNDLE_FLOOR,
  REMOTE_ESCAPE_BUNDLED,
  REMOTE_FLAG_KEYS,
  REMOTE_MAX_LIFETIME_DAYS,
  remoteSigningInput,
  rsaPkcs1Sha256Verify,
  sha256,
  utf8Bytes,
  verifyRemoteDoc,
  verifyRemoteDocStrict,
  type ContentManifest,
  type RemoteDocKind,
  type RemoteFlagKey,
} from '../src/index';
import { FX_DOC, FX_KEY, FX_RAW1024, FX_RAW2048, FX_RAW2048E3 } from './remote-fixture';

// ── 순수 BigInt 원시 RSA(시험 전용) ──
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function b64d(s: string): Uint8Array {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of s) {
    acc = (acc << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
    }
    acc &= (1 << bits) - 1;
  }
  return Uint8Array.from(out);
}
function b64e(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    if (i + 1 < b.length) s += B64[(n >> 6) & 63]!;
    if (i + 2 < b.length) s += B64[n & 63]!;
  }
  return s;
}
const big = (b: Uint8Array) => b.reduce((x, v) => (x << 8n) | BigInt(v), 0n);
function bytesOf(x: bigint, k: number): Uint8Array {
  const out = new Uint8Array(k);
  for (let i = k - 1; i >= 0; i--) {
    out[i] = Number(x & 255n);
    x >>= 8n;
  }
  return out;
}
function modPow(b: bigint, e: bigint, m: bigint): bigint {
  let r = 1n;
  b %= m;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}
type RawKey = { n: string; e: string; d: string };
const DI = [0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20];
/** EMSA-PKCS1-v1_5 — `psByte`로 PS 바이트 하나를 틀리게 만들 수 있다 */
function em(input: string, k: number, badPsAt?: number): Uint8Array {
  const t = [...DI, ...sha256(input)];
  const ps = k - 3 - t.length;
  const out = new Uint8Array(k);
  out[1] = 1;
  out.fill(0xff, 2, 2 + ps);
  if (badPsAt !== undefined) out[2 + badPsAt] = 0xfe;
  out.set(t, 3 + ps);
  return out;
}
const kOf = (key: RawKey) => b64d(key.n).length - (b64d(key.n)[0] === 0 ? 1 : 0);
function rawSig(key: RawKey, input: string, badPsAt?: number): bigint {
  const k = kOf(key);
  return modPow(big(em(input, k, badPsAt)), big(b64d(key.d)), big(b64d(key.n)));
}
function signWith(key: RawKey, kid: string, kind: RemoteDocKind, doc: Record<string, unknown>, o: { badPsAt?: number; s?: (s: bigint, n: bigint) => bigint } = {}) {
  const k = kOf(key);
  let s = rawSig(key, remoteSigningInput(kind, doc), o.badPsAt);
  if (o.s) s = o.s(s, big(b64d(key.n)));
  return { ...doc, sig: { alg: 'RS256', kid, value: b64e(bytesOf(s, k)) } };
}
const pub = (key: RawKey, kid: string) => ({ kid, n: key.n, e: key.e });

const NOW = Date.parse('2026-12-25T03:00:00Z');
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const cfg = (v: number, extra: Record<string, unknown> = {}) => ({
  v,
  ttlSec: 3600,
  flags: { cloud: false, link: false, remoteMotifs: false, webLive: false },
  minAppBuild: { ios: 0, android: 0 },
  expiresAt: iso(NOW + 14 * DAY),
  ...extra,
});

describe('M2 검사기 보안 줄 — 결정적 벡터', () => {
  it('시험 장치 대조: 바르게 만든 EM을 원시 서명하면 ok', () => {
    expect(verifyRemoteDoc('config/v1', signWith(FX_RAW2048, 'raw', 'config/v1', cfg(1)), [pub(FX_RAW2048, 'raw')])).toBe('ok');
  });
  it('PS 한 바이트만 0xfe(다이제스트는 맞음) → bad (앞·가운데·끝)', () => {
    for (const at of [0, 100, 201]) {
      expect(verifyRemoteDoc('config/v1', signWith(FX_RAW2048, 'raw', 'config/v1', cfg(1), { badPsAt: at }), [pub(FX_RAW2048, 'raw')]), `at ${at}`).toBe('bad');
    }
  });
  it('e=3 키: 바른 서명은 ok, PS가 틀린 서명은 bad(낮은 지수 위조 자리)', () => {
    const p = [pub(FX_RAW2048E3, 'e3')];
    expect(verifyRemoteDoc('config/v1', signWith(FX_RAW2048E3, 'e3', 'config/v1', cfg(2)), p)).toBe('ok');
    expect(verifyRemoteDoc('config/v1', signWith(FX_RAW2048E3, 'e3', 'config/v1', cfg(2), { badPsAt: 50 }), p)).toBe('bad');
  });
  it('s + n(같은 나머지, 같은 길이) → bad, s = n → bad', () => {
    const k = kOf(FX_RAW2048);
    const limit = 1n << BigInt(8 * k);
    const n = big(b64d(FX_RAW2048.n));
    let found = 0;
    for (let v = 1; v <= 60 && found < 2; v++) {
      const s = rawSig(FX_RAW2048, remoteSigningInput('config/v1', cfg(v)));
      if (s + n >= limit) continue;
      found++;
      expect(verifyRemoteDoc('config/v1', signWith(FX_RAW2048, 'raw', 'config/v1', cfg(v), { s: (x, nn) => x + nn }), [pub(FX_RAW2048, 'raw')])).toBe('bad');
    }
    expect(found).toBeGreaterThan(0);
    expect(verifyRemoteDoc('config/v1', signWith(FX_RAW2048, 'raw', 'config/v1', cfg(1), { s: (_x, nn) => nn }), [pub(FX_RAW2048, 'raw')])).toBe('bad');
  });
  it('1024비트 키: 검사 층에서도 바른 서명을 거부(스키마 342자 하한과 두 겹)', () => {
    const input = 'mong-remote-sig:1\nconfig/v1\n{}';
    const k = kOf(FX_RAW1024);
    const s = bytesOf(rawSig(FX_RAW1024, input), k);
    expect(rsaPkcs1Sha256Verify(b64d(FX_RAW1024.n), b64d(FX_RAW1024.e), utf8Bytes(input), s)).toBe(false);
    // 대조: 같은 방법으로 2048비트 키는 통과(장치가 맞다)
    const s2 = bytesOf(rawSig(FX_RAW2048, input), kOf(FX_RAW2048));
    expect(rsaPkcs1Sha256Verify(b64d(FX_RAW2048.n), b64d(FX_RAW2048.e), utf8Bytes(input), s2)).toBe(true);
  });
  it('1024비트 키로 바르게 만든 서명 → bad(키 길이 하한 2048)', () => {
    // 1024비트 n은 base64url 171자라 공개키 스키마 밖 — 검사기 하한 자체를 보려고 스키마를 거치지 않고 넣는다
    expect(verifyRemoteDoc('config/v1', signWith(FX_RAW1024, 'short', 'config/v1', cfg(1)), [pub(FX_RAW1024, 'short')])).toBe('bad');
  });
});

describe('M1 `__proto__`·constructor·prototype 키', () => {
  const inject = (where: 'top' | 'nested', key: string) => {
    const text = JSON.stringify(FX_DOC);
    const payload = `"${key}":{"flags":{"cloud":true}},`;
    return JSON.parse(where === 'top' ? `{${payload}${text.slice(1)}` : text.replace('"flags":{', `"flags":{${payload}`)) as unknown;
  };
  it('재현: 서명 뒤 맨 위에 __proto__를 더한 문서 → bad', () => {
    const d = inject('top', '__proto__');
    expect(Object.prototype.hasOwnProperty.call(d, '__proto__')).toBe(true); // JSON.parse는 자기 속성으로 만든다
    expect(verifyRemoteDoc('config/v1', d, [FX_KEY])).toBe('bad');
  });
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    for (const where of ['top', 'nested'] as const) {
      it(`거부: ${where} ${key}`, () => {
        expect(verifyRemoteDoc('config/v1', inject(where, key), [FX_KEY])).toBe('bad');
      });
    }
  }
  it('서명 원문 만들기도 그런 키가 있으면 던진다(서명 도구가 같은 함수를 쓴다)', () => {
    expect(() => remoteSigningInput('config/v1', JSON.parse('{"a":1,"__proto__":{"x":1}}') as Record<string, unknown>)).toThrow();
    expect(() => remoteSigningInput('config/v1', { a: [{ constructor: 1 }] })).toThrow();
  });
});

describe('M3·M5 verifyRemoteDocStrict — 서명 필수·만료·바닥 판', () => {
  const keys = [pub(FX_RAW2048, 'raw')];
  const sign = (d: Record<string, unknown>, kind: RemoteDocKind = 'config/v1') => signWith(FX_RAW2048, 'raw', kind, d);
  it('서명·만료·판이 맞으면 ok, 판과 만료 시각을 돌려준다', () => {
    expect(verifyRemoteDocStrict('config/v1', sign(cfg(5)), keys, { nowMs: NOW })).toEqual({ ok: true, version: 5, expiresAtMs: NOW + 14 * DAY });
    const man = { v: 1, seq: 9, motifs: [], revoked: [], expiresAt: iso(NOW + DAY) };
    expect(verifyRemoteDocStrict('content/v1', sign(man, 'content/v1'), keys, { nowMs: NOW })).toMatchObject({ ok: true, version: 9 });
  });
  const CASES: Array<[string, unknown, string, number?]> = [
    ['서명 없음(다운그레이드)', cfg(5), 'unsigned'],
    ['모르는 키', { ...sign(cfg(5)), sig: { ...(sign(cfg(5)).sig as object), kid: 'zz' } }, 'unknown_kid'],
    ['값 하나 바꿈', { ...sign(cfg(5)), ttlSec: 60 }, 'bad'],
    ['만료 칸 없음', sign(Object.fromEntries(Object.entries(cfg(5)).filter(([k]) => k !== 'expiresAt'))), 'no_expiry'],
    ['만료 지남', sign(cfg(5, { expiresAt: iso(NOW - 1000) })), 'expired'],
    ['만료가 너무 멂(31일 넘음 — 영구 문서 금지)', sign(cfg(5, { expiresAt: iso(NOW + (REMOTE_MAX_LIFETIME_DAYS + 1) * DAY) })), 'too_long'],
    ['바닥 판보다 작음(옛 서명 문서 재생)', sign(cfg(5)), 'old', 6],
    ['판 칸이 정수가 아님', sign(cfg(5, { v: '5' })), 'bad'],
  ];
  for (const [name, doc, reason, floor] of CASES) {
    it(`거부: ${name} → ${reason}`, () => {
      const clean = JSON.parse(JSON.stringify(doc)) as unknown; // 실제 수신과 같게 JSON을 한 번 거친다
      expect(verifyRemoteDocStrict('config/v1', clean, keys, { nowMs: NOW, floor })).toEqual({ ok: false, reason });
    });
  }
  it('바닥 판 = max(번들 바닥, 넘긴 값) — 번들 바닥 자리는 종류마다 있다', () => {
    expect(Object.keys(REMOTE_BUNDLE_FLOOR).sort()).toEqual(['config/v1', 'content/v1']);
    expect(verifyRemoteDocStrict('config/v1', sign(cfg(5)), keys, { nowMs: NOW, floor: 5 })).toMatchObject({ ok: true });
  });
});

describe('M4 크래시 루프 탈출 — 끄기만, 감지는 더 민감하게만', () => {
  it('감지 문턱: afterCrashes = min(원격, 번들), withinSec = max(원격, 번들)', () => {
    expect(REMOTE_ESCAPE_BUNDLED).toEqual({ afterCrashes: 2, withinSec: 10 });
    expect(escapeThresholds({ afterCrashes: 5, withinSec: 5 })).toEqual({ afterCrashes: 2, withinSec: 10 });
    expect(escapeThresholds({ afterCrashes: 1, withinSec: 60 })).toEqual({ afterCrashes: 1, withinSec: 60 });
    expect(escapeThresholds(null)).toEqual({ afterCrashes: 2, withinSec: 10 });
  });
  it('전수: 어느 키도 번들 값·원격 값보다 켜지지 않고, off는 늘 꺼짐', () => {
    const vals = [true, false, undefined] as const;
    for (const b of vals)
      for (const r of vals)
        for (const off of [true, false]) {
          for (const k of REMOTE_FLAG_KEYS) {
            const bundled: Partial<Record<RemoteFlagKey, boolean>> = b === undefined ? {} : { [k]: b };
            const remote: Partial<Record<RemoteFlagKey, boolean>> = r === undefined ? {} : { [k]: r };
            const got = escapeFlags(bundled, remote, off ? [k] : [])[k];
            const label = `${k} b=${String(b)} r=${String(r)} off=${off}`;
            if (b !== true) expect(got, label).toBe(false);
            if (r === false) expect(got, label).toBe(false);
            if (off) expect(got, label).toBe(false);
            if (b === true && r !== false && !off) expect(got, label).toBe(true);
          }
        }
  });
  it('원격 문서가 없어도(null) 번들 값 − off', () => {
    expect(escapeFlags({ hesitation: true }, null, [])).toMatchObject({ hesitation: true, cloud: false });
  });
});

describe('L5 사전 팩 (언어, 판) 불변', () => {
  const H = (c: string) => c.repeat(64);
  const m = (sha: string) =>
    ({ lex: [{ lang: 'ko', lexVer: 3, minAppBuild: 0, url: '/content/lex/ko-3.aaaaaaaa.json', sha256: sha, bytes: 10 }] }) as unknown as Pick<ContentManifest, 'lex'>;
  it('같은 (ko, 3)에 다른 sha256 → 위반, 같으면 없음, 새 판은 자유', () => {
    const known = lexHashIndex(m(H('a')));
    expect(lexImmutableViolations(known, m(H('a')))).toEqual([]);
    expect(lexImmutableViolations(known, m(H('b')))).toEqual(['ko-3']);
    expect(lexImmutableViolations({}, m(H('b')))).toEqual([]);
  });
});
