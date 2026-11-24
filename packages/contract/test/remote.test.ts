// B4 원격 문서 계약 시험 — 서명(RS256)·정규 JSON·SHA-256·크래시 루프 탈출 값·사전 팩(lexVer) 항목.
// 그럴듯한 오답 판별(OPERATING 8-1): 값 하나만 바꾼 문서·다른 종류 문서로 옮긴 서명·모르는 키 id·되감은 판은 통과하면 안 된다.
import { describe, expect, it } from 'vitest';
import {
  acceptRemoteVersion,
  canonicalJson,
  contentManifestSchema,
  lexPackHeaderSchema,
  lexPackMatchesEntry,
  pickLexPack,
  REMOTE_ESCAPE_DEFAULT,
  remoteConfigSchema,
  remoteConfigStrictSchema,
  remoteSigningInput,
  sha256Hex,
  utf8Bytes,
  verifyRemoteDoc,
  type ContentManifest,
} from '../src/index';
import { FX_DOC, FX_KEY } from './remote-fixture';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('SHA-256(순수 JS — 앱이 팩 파일 해시를 바로 검사)', () => {
  it('FIPS 180-2 시험 값', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(sha256Hex('a'.repeat(1_000_000))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });
  it('블록 경계(55·56·64바이트)와 바이트 입력', () => {
    // 경계 값은 서버 시험이 node:crypto와 무작위 대조한다. 여기서는 문자열·바이트 입력이 같은지만
    for (const n of [55, 56, 63, 64, 65]) expect(sha256Hex(utf8Bytes('x'.repeat(n)))).toBe(sha256Hex('x'.repeat(n)));
  });
  it('UTF-8: 한글 3바이트, 서로게이트 짝 4바이트', () => {
    expect([...utf8Bytes('몽')]).toEqual([0xeb, 0xaa, 0xbd]);
    expect([...utf8Bytes('😀')]).toEqual([0xf0, 0x9f, 0x98, 0x80]);
  });
});

describe('정규 JSON(서명 원문)', () => {
  it('키 순서와 무관, 배열 순서는 그대로, 공백 없음', () => {
    expect(canonicalJson({ b: 1, a: [3, 1, { d: true, c: null }] })).toBe('{"a":[3,1,{"c":null,"d":true}],"b":1}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });
  it('JSON으로 나타낼 수 없는 값은 던진다(서명과 다른 바이트를 만들지 않게)', () => {
    for (const bad of [Number.NaN, Infinity, undefined, () => 1, { a: undefined }, [undefined], 1n]) {
      expect(() => canonicalJson(bad as unknown), String(bad)).toThrow();
    }
  });
});

describe('원격 문서 서명 검사(RS256)', () => {
  const keys = [FX_KEY];
  it('독립으로 만든 서명이 통과한다(키 순서를 바꿔도)', () => {
    expect(verifyRemoteDoc('config/v1', FX_DOC, keys)).toBe('ok');
    const shuffled = Object.fromEntries(Object.entries(clone(FX_DOC)).reverse());
    expect(verifyRemoteDoc('config/v1', shuffled, keys)).toBe('ok');
  });

  const TAMPER: Array<[string, (d: Record<string, unknown>) => void]> = [
    ['플래그 하나 켬', (d) => ((d.flags as Record<string, boolean>).cloud = true)],
    ['판 번호 올림', (d) => (d.v = 4)],
    ['키 하나 더함', (d) => (d.extra = 1)],
    ['키 하나 뺌', (d) => delete d.dreamUnlock],
    ['서명 값 한 글자', (d) => {
      const s = d.sig as { value: string };
      s.value = (s.value[0] === 'A' ? 'B' : 'A') + s.value.slice(1);
    }],
    ['서명 값 잘림', (d) => ((d.sig as { value: string }).value = (d.sig as { value: string }).value.slice(0, 100))],
    ['서명 값이 base64url이 아님', (d) => ((d.sig as { value: string }).value = '!!!')],
    ['알고리즘 바꿈', (d) => ((d.sig as { alg: string }).alg = 'none')],
  ];
  for (const [name, f] of TAMPER) {
    it(`거부: ${name}`, () => {
      const d = clone(FX_DOC) as unknown as Record<string, unknown>;
      f(d);
      expect(verifyRemoteDoc('config/v1', d, keys)).toBe('bad');
    });
  }

  it('같은 서명을 다른 종류 문서(content/v1)로 내밀면 거부(종류가 서명 원문에 묶임)', () => {
    expect(remoteSigningInput('config/v1', { a: 1 })).not.toBe(remoteSigningInput('content/v1', { a: 1 }));
    expect(verifyRemoteDoc('content/v1', FX_DOC, keys)).toBe('bad');
  });
  it('모르는 키 id → unknown_kid, 서명 없음 → unsigned, 다른 키로 검사 → bad', () => {
    expect(verifyRemoteDoc('config/v1', FX_DOC, [{ ...FX_KEY, kid: 'other' }])).toBe('unknown_kid');
    const { sig: _sig, ...unsigned } = clone(FX_DOC);
    expect(verifyRemoteDoc('config/v1', unsigned, keys)).toBe('unsigned');
    const otherN = FX_KEY.n.slice(0, -2) + (FX_KEY.n.endsWith('AA') ? 'AQ' : 'AA');
    expect(verifyRemoteDoc('config/v1', FX_DOC, [{ ...FX_KEY, n: otherN }])).toBe('bad');
    expect(verifyRemoteDoc('config/v1', FX_DOC, [{ ...FX_KEY, e: 'Aw' }])).toBe('bad');
  });
  it('문서가 객체가 아니면 bad', () => {
    for (const raw of [null, 1, 'x', [FX_DOC]]) expect(verifyRemoteDoc('config/v1', raw, keys)).toBe('bad');
  });
  it('서명 원문 = 도메인 머리 + 종류 + sig를 뺀 정규 JSON', () => {
    const { sig: _sig, ...body } = clone(FX_DOC);
    expect(remoteSigningInput('config/v1', FX_DOC as unknown as Record<string, unknown>)).toBe(`mong-remote-sig:1\nconfig/v1\n${canonicalJson(body)}`);
  });
});

describe('되감기 막기(판 번호)', () => {
  it('처음은 받고, 같은 판·큰 판은 받고, 작은 판은 거부', () => {
    expect(acceptRemoteVersion(null, 1)).toBe(true);
    expect(acceptRemoteVersion(5, 5)).toBe(true);
    expect(acceptRemoteVersion(5, 6)).toBe(true);
    expect(acceptRemoteVersion(5, 4)).toBe(false);
  });
});

describe('config/v1 크래시 루프 탈출 값(escape)', () => {
  const base = { v: 2, ttlSec: 3600, flags: { cloud: false, link: false, remoteMotifs: false, webLive: false }, minAppBuild: { ios: 0, android: 0 } };
  it('빠지면 기본값(2번·10초, 강제 끔 없음) — B0 배포본도 그대로 통과', () => {
    const r = remoteConfigStrictSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.success && r.data.escape).toEqual(REMOTE_ESCAPE_DEFAULT);
    expect(REMOTE_ESCAPE_DEFAULT).toEqual({ afterCrashes: 2, withinSec: 10, off: [] });
  });
  it('off는 원격 키만(CI strict), 앱은 모르는 키를 지우고 읽는다', () => {
    expect(remoteConfigStrictSchema.safeParse({ ...base, escape: { afterCrashes: 1, withinSec: 10, off: ['cloud', 'link'] } }).success).toBe(true);
    expect(remoteConfigStrictSchema.safeParse({ ...base, escape: { afterCrashes: 2, withinSec: 10, off: ['clowd'] } }).success).toBe(false);
    const lenient = remoteConfigSchema.safeParse({ ...base, escape: { afterCrashes: 2, withinSec: 10, off: ['cloud', 'futureKey'] } });
    expect(lenient.success && lenient.data.escape.off).toEqual(['cloud']);
  });
  it('범위: afterCrashes 1~2, withinSec 10~60(번들 문턱보다 둔해질 수 없음, 리뷰 M4), off 중복 금지(strict)', () => {
    for (const escape of [
      { afterCrashes: 0, withinSec: 10, off: [] },
      { afterCrashes: 3, withinSec: 10, off: [] },
      { afterCrashes: 2, withinSec: 9, off: [] },
      { afterCrashes: 6, withinSec: 10, off: [] },
      { afterCrashes: 2, withinSec: 4, off: [] },
      { afterCrashes: 2, withinSec: 61, off: [] },
      { afterCrashes: 2, withinSec: 10, off: ['cloud', 'cloud'] },
    ]) {
      expect(remoteConfigStrictSchema.safeParse({ ...base, escape }).success, JSON.stringify(escape)).toBe(false);
    }
  });
  it('sig 칸: 두 스키마 모두 받는다, 모양이 틀리면 strict 실패', () => {
    expect(remoteConfigStrictSchema.safeParse(FX_DOC).success).toBe(true);
    expect(remoteConfigSchema.safeParse(FX_DOC).success).toBe(true);
    expect(remoteConfigStrictSchema.safeParse({ ...FX_DOC, sig: { alg: 'RS256', kid: 'test-1' } }).success).toBe(false);
  });
});

describe('content/v1 매니페스트 — 원격 사전 팩(lexVer)', () => {
  const H = 'a'.repeat(64);
  const lexKo3 = { lang: 'ko', lexVer: 3, minAppBuild: 14, url: '/content/lex/ko-3.aaaaaaaa.json', sha256: H, bytes: 120_000 };
  const lexKo4 = { ...lexKo3, lexVer: 4, minAppBuild: 20, url: '/content/lex/ko-4.bbbbbbbb.json' };
  const lexEn2 = { ...lexKo3, lang: 'en', lexVer: 2, url: '/content/lex/en-2.cccccccc.json' };
  const man = { v: 1, seq: 7, motifs: [], revoked: [], lex: [lexKo3, lexKo4, lexEn2] };

  it('B0 빈 매니페스트도 그대로 통과(lex·escape 기본값)', () => {
    const r = contentManifestSchema.safeParse({ v: 1, seq: 0, motifs: [], revoked: [] });
    expect(r.success).toBe(true);
    expect(r.success && [r.data.lex, r.data.escape]).toEqual([[], { lexVer: {} }]);
  });
  it('정상 사전 팩 항목', () => {
    expect(contentManifestSchema.safeParse(man).success).toBe(true);
  });
  const BAD: Array<[string, unknown]> = [
    ['url의 언어가 항목과 다름', { ...man, lex: [{ ...lexKo3, url: '/content/lex/en-3.aaaaaaaa.json' }] }],
    ['url의 판이 항목과 다름', { ...man, lex: [{ ...lexKo3, url: '/content/lex/ko-9.aaaaaaaa.json' }] }],
    ['같은 언어·판 두 번', { ...man, lex: [lexKo3, { ...lexKo3, sha256: 'b'.repeat(64) }] }],
    ['모티프 폴더를 가리킴', { ...man, lex: [{ ...lexKo3, url: '/content/motifs/ko-3.aaaaaaaa.json' }] }],
    ['바이트 상한 넘음', { ...man, lex: [{ ...lexKo3, bytes: 2 * 1024 * 1024 }] }],
    ['lexVer 0', { ...man, lex: [{ ...lexKo3, lexVer: 0, url: '/content/lex/ko-0.aaaaaaaa.json' }] }],
    ['모르는 언어', { ...man, lex: [{ ...lexKo3, lang: 'ja', url: '/content/lex/ja-3.aaaaaaaa.json' }] }],
    ['항목에 모르는 키', { ...man, lex: [{ ...lexKo3, note: 'x' }] }],
    ['탈출 고정 판이 매니페스트에 없음', { ...man, escape: { lexVer: { ko: 9 } } }],
  ];
  for (const [name, m] of BAD) {
    it(`거부: ${name}`, () => {
      expect(contentManifestSchema.safeParse(m).success).toBe(false);
    });
  }

  const parsed = (m: unknown) => contentManifestSchema.parse(m) as ContentManifest;
  it('고르기: 앱 빌드가 받는 가장 큰 판, 번들보다 크지 않으면 번들(null)', () => {
    const m = parsed(man);
    expect(pickLexPack(m, 'ko', { appBuild: 20, bundledLexVer: 1 })?.lexVer).toBe(4);
    expect(pickLexPack(m, 'ko', { appBuild: 19, bundledLexVer: 1 })?.lexVer).toBe(3);
    expect(pickLexPack(m, 'ko', { appBuild: 13, bundledLexVer: 1 })).toBeNull();
    expect(pickLexPack(m, 'ko', { appBuild: 20, bundledLexVer: 4 })).toBeNull();
    expect(pickLexPack(m, 'en', { appBuild: 99, bundledLexVer: 1 })?.lexVer).toBe(2);
  });
  it('크래시 루프 탈출 중: 고정 판(escape.lexVer)만, 없거나 0이면 번들', () => {
    const pinned = parsed({ ...man, escape: { lexVer: { ko: 3, en: 0 } } });
    expect(pickLexPack(pinned, 'ko', { appBuild: 20, bundledLexVer: 1, escaping: true })?.lexVer).toBe(3);
    expect(pickLexPack(pinned, 'en', { appBuild: 20, bundledLexVer: 1, escaping: true })).toBeNull();
    expect(pickLexPack(parsed(man), 'ko', { appBuild: 20, bundledLexVer: 1, escaping: true })).toBeNull();
    // 고정 판이라도 이 빌드가 못 받으면 번들
    expect(pickLexPack(parsed({ ...man, escape: { lexVer: { ko: 4 } } }), 'ko', { appBuild: 14, bundledLexVer: 1, escaping: true })).toBeNull();
  });
  it('팩 파일 머리: 언어·판이 매니페스트 항목과 같아야 한다(다른 팩 끼워 넣기 막기)', () => {
    const h = lexPackHeaderSchema.parse({ schema: 1, lang: 'ko', lexVer: 3, entries: [] });
    expect(lexPackMatchesEntry(h, lexKo3 as never)).toBe(true);
    expect(lexPackMatchesEntry({ ...h, lexVer: 4 }, lexKo3 as never)).toBe(false);
    expect(lexPackMatchesEntry({ ...h, lang: 'en' }, lexKo3 as never)).toBe(false);
    expect(lexPackHeaderSchema.safeParse({ schema: 2, lang: 'ko', lexVer: 3 }).success).toBe(false);
  });
});
