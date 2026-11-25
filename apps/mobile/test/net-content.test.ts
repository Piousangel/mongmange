// 원격 콘텐츠 매니페스트·팩 로더(C11 — architecture 3-7-2·3-10, B4 보고 3절 7·8):
// 매니페스트는 verifyRemoteDocStrict만, 팩 파일은 매니페스트의 sha256·bytes(sha256Hex)로, 사전 팩은 머리(lexPackMatchesEntry)와
// (언어, 판) 불변(lexImmutableViolations)으로 검사한다. 해시가 틀리면 cache: 'reload'로 한 번만 다시 받고, 그래도 틀리면 쓰지 않는다.
// 크래시 루프 탈출 중에는 원격 모티프를 새로 넣지 않고, 사전은 매니페스트 escape.lexVer가 고정한 판만.
import { sha256Hex, type MotifFile } from '@mong/contract';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CONTENT_KEYS, createContentPacks } from '../src/net/contentPacks';
import type { FetchLike } from '../src/net/http';
import { isoSec, makeSigner, type Signer } from './support/remoteSign';

function memKV() {
  const m = new Map<string, string>();
  return { getString: (k: string) => m.get(k), set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k), m };
}
const DAY = 86_400_000;

const motif = (id: string): MotifFile => ({
  schema: 1,
  id,
  zone: 'far-alone',
  family: 'sky',
  paths: [{ d: 'M0 0 L10 10', w: 1, layer: 'ink' }],
  shader: { bleed: 0.2, grain: 0.3, tone: 'night' },
  text: { ko: { title: '연', line: '연 하나가 떠 있어요', scene: '높은 하늘에 연 하나' } },
});
const lexText = (lang: 'ko' | 'en', lexVer: number, extra = '') => JSON.stringify({ schema: 1, lang, lexVer, words: { 바다: 'calm' }, extra });
const h8 = (text: string) => sha256Hex(text).slice(0, 8);
const bytes = (text: string) => new TextEncoder().encode(text).length;

let signer: Signer;
beforeAll(() => {
  signer = makeSigner('app-test');
});

let kv: ReturnType<typeof memKV>;
let clock = Date.UTC(2026, 11, 22, 3);
let files: Map<string, string[]>; // 경로 → 차례로 낼 본문(마지막 것은 계속)
let reqs: Array<{ url: string; cache?: string }>;

const fetchFn: FetchLike = async (url, init) => {
  reqs.push({ url, cache: init?.cache });
  const path = url.replace('https://static.test', '');
  const q = files.get(path);
  if (!q) return { ok: false, status: 404, text: async () => '' };
  const text = q.length > 1 ? q.shift()! : q[0]!;
  return { ok: true, status: 200, text: async () => text };
};

function serve(path: string, ...bodies: string[]) {
  files.set(path, bodies);
}

const kiteText = JSON.stringify(motif('kite'));
const kiteEntry = (text = kiteText, over: Record<string, unknown> = {}) => ({
  id: 'kite',
  kind: 'weekly',
  from: '2026-12-21',
  schema: 1,
  minAppBuild: 0,
  url: `/content/motifs/kite.${h8(text)}.json`,
  sha256: sha256Hex(text),
  bytes: bytes(text),
  ...over,
});
const lexEntry = (lang: 'ko' | 'en', lexVer: number, text: string) => ({
  lang,
  lexVer,
  minAppBuild: 0,
  url: `/content/lex/${lang}-${lexVer}.${h8(text)}.json`,
  sha256: sha256Hex(text),
  bytes: bytes(text),
});
const manifest = (over: Record<string, unknown> = {}) =>
  signer.sign('content/v1', { v: 1, seq: 7, motifs: [kiteEntry()], revoked: [], lex: [], expiresAt: isoSec(clock + 14 * DAY), ...over });

let escaping = false;
function make(over: Partial<Parameters<typeof createContentPacks>[0]> = {}) {
  return createContentPacks({
    kv,
    fetch: fetchFn,
    staticBase: 'https://static.test',
    keys: [signer.key],
    appBuild: 14,
    bundledLexVer: { ko: 1, en: 1 },
    now: () => clock,
    escaping: () => escaping,
    ...over,
  });
}

beforeEach(() => {
  kv = memKV();
  clock = Date.UTC(2026, 11, 22, 3);
  files = new Map();
  reqs = [];
  escaping = false;
  serve(kiteEntry().url, kiteText);
});

describe('매니페스트', () => {
  it('서명된 매니페스트 → 모티프 파일을 받아 해시를 맞춘 뒤에만 쓴다', async () => {
    serve('/content/v1.json', JSON.stringify(manifest()));
    const c = make();
    await c.refresh();
    expect(reqs.map((r) => r.url)).toEqual(['https://static.test/content/v1.json', `https://static.test${kiteEntry().url}`]);
    expect(c.motifs().map((m) => m.id)).toEqual(['kite']);
    expect(make().motifs().map((m) => m.id)).toEqual(['kite']); // 다음 실행: 기기에 둔 검사된 파일
  });

  it('서명 없는 매니페스트·만료된 매니페스트는 쓰지 않는다', async () => {
    const { sig: _sig, ...plain } = manifest();
    void _sig;
    for (const m of [plain, manifest({ expiresAt: isoSec(clock - 1) })]) {
      kv = memKV();
      reqs = [];
      serve('/content/v1.json', JSON.stringify(m));
      const c = make();
      await c.refresh();
      expect(c.motifs()).toEqual([]);
      expect(reqs).toHaveLength(1); // 팩 파일을 받으러 가지도 않는다
    }
  });

  it('철회된 모티프·이 빌드보다 높은 minAppBuild는 쓰지 않는다', async () => {
    const yo = JSON.stringify(motif('yoyo'));
    serve(`/content/motifs/yoyo.${h8(yo)}.json`, yo);
    serve(
      '/content/v1.json',
      JSON.stringify(manifest({ motifs: [kiteEntry(), kiteEntry(yo, { id: 'yoyo', url: `/content/motifs/yoyo.${h8(yo)}.json`, minAppBuild: 99 })], revoked: ['kite'] })),
    );
    const c = make();
    await c.refresh();
    expect(c.motifs()).toEqual([]);
  });
});

describe('팩 파일 무결성(sha256Hex)', () => {
  it('해시가 틀리면 cache: "reload"로 한 번 다시 받고, 맞으면 쓴다', async () => {
    serve('/content/v1.json', JSON.stringify(manifest()));
    serve(kiteEntry().url, kiteText.replace('연 하나', '연 둘이'), kiteText);
    const c = make();
    await c.refresh();
    expect(reqs.slice(1).map((r) => r.cache)).toEqual([undefined, 'reload']);
    expect(c.motifs().map((m) => m.id)).toEqual(['kite']);
  });

  it('다시 받아도 틀리면(내용·길이) 쓰지 않는다 — 세 번째 요청은 없다', async () => {
    for (const bad of [kiteText.replace('연 하나', '연 둘이'), `${kiteText} `]) {
      kv = memKV();
      reqs = [];
      serve('/content/v1.json', JSON.stringify(manifest()));
      serve(kiteEntry().url, bad);
      const c = make();
      await c.refresh();
      expect(reqs).toHaveLength(3);
      expect(c.motifs()).toEqual([]);
    }
  });

  it('해시가 맞아도 모티프 스키마가 틀린 파일은 쓰지 않는다', async () => {
    const bad = JSON.stringify({ ...motif('kite'), text: { ko: { title: '새로운 연!', line: 'a', scene: 'b' } } });
    serve('/content/v1.json', JSON.stringify(manifest({ motifs: [kiteEntry(bad)] })));
    serve(kiteEntry(bad).url, bad);
    const c = make();
    await c.refresh();
    expect(c.motifs()).toEqual([]);
  });
});

describe('사전 팩(lexVer)', () => {
  const ko2 = lexText('ko', 2);
  const ko3 = lexText('ko', 3);
  beforeEach(() => {
    serve(lexEntry('ko', 2, ko2).url, ko2);
    serve(lexEntry('ko', 3, ko3).url, ko3);
  });

  it('평소: 번들보다 큰 판 중 가장 큰 것. 머리의 언어·판이 항목과 다르면 쓰지 않는다', async () => {
    serve('/content/v1.json', JSON.stringify(manifest({ motifs: [], lex: [lexEntry('ko', 2, ko2), lexEntry('ko', 3, ko3)] })));
    const c = make();
    await c.refresh();
    expect(c.lexPack('ko')?.entry.lexVer).toBe(3);
    expect(c.lexPack('ko')?.text).toBe(ko3);
    expect(c.lexPack('en')).toBeNull();

    kv = memKV();
    const liar = lexText('ko', 2); // 판 3 자리에 판 2 머리
    serve('/content/v1.json', JSON.stringify(manifest({ motifs: [], lex: [{ ...lexEntry('ko', 3, liar), url: `/content/lex/ko-3.${h8(liar)}.json` }] })));
    serve(`/content/lex/ko-3.${h8(liar)}.json`, liar);
    const d = make();
    await d.refresh();
    expect(d.lexPack('ko')).toBeNull();
  });

  it('(언어, 판) 불변: 본 적 있는 ko-3의 해시가 바뀐 매니페스트는 통째로 쓰지 않는다(앞 매니페스트 유지)', async () => {
    serve('/content/v1.json', JSON.stringify(manifest({ motifs: [], lex: [lexEntry('ko', 3, ko3)] })));
    const c = make();
    await c.refresh();
    const ko3b = lexText('ko', 3, 'changed');
    serve(lexEntry('ko', 3, ko3b).url, ko3b);
    serve('/content/v1.json', JSON.stringify(manifest({ seq: 8, motifs: [kiteEntry()], lex: [lexEntry('ko', 3, ko3b)] })));
    await c.refresh({ force: true });
    expect(c.lexPack('ko')?.text).toBe(ko3);
    expect(c.motifs()).toEqual([]); // 새 매니페스트의 모티프도 들어오지 않았다
    expect(JSON.parse(kv.getString(CONTENT_KEYS.lexSeen)!)).toEqual({ 'ko-3': sha256Hex(ko3) });
  });

  it('크래시 루프 탈출 중: 원격 모티프는 없고, 사전은 escape.lexVer 고정 판만(없으면 번들)', async () => {
    serve(
      '/content/v1.json',
      JSON.stringify(manifest({ lex: [lexEntry('ko', 2, ko2), lexEntry('ko', 3, ko3)], escape: { lexVer: { ko: 2 } } })),
    );
    const c = make();
    await c.refresh();
    expect(c.motifs()).toHaveLength(1);
    escaping = true;
    expect(c.motifs()).toEqual([]);
    expect(c.lexPack('ko')?.entry.lexVer).toBe(2);
    expect(c.lexPack('en')).toBeNull();
  });
});
