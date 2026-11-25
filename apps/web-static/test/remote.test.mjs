// B4 후속(docs/design/server-v1/B4-report.md 3절 web-static 1~3): 캐시 머리글, 원격 문서 서명·만료 빌드 차단, 사전 팩 파일 검사.
// 출시 모드(SITE_MODE=launch) 또는 공개키 목록이 있는 빌드는 config/v1.json·content/v1.json이 verifyRemoteDocStrict ok이고
// 만료까지 REMOTE_EXPIRY_WARN_DAYS(7일)보다 많이 남아야 통과한다. 키가 없는 출시 전 모드는 경고만.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build, BuildError, check, readFirebaseJson, ROOT } from '../scripts/build.mjs';
import { cleanDocs, filledDocs, keysFile, signedSrc, testKey } from './helpers.mjs';

const FP = Array.from({ length: 32 }, (_, i) => (i * 7 + 16).toString(16).toUpperCase().padStart(2, '0')).join(':');
const API = 'https://mong-api-abc123-du.a.run.app';
const ENV = { APPLE_TEAM_ID: 'A1B2C3D4E5', ANDROID_CERT_SHA256: FP, APP_STORE_ID: '6739012345', API_ORIGIN: API };
const LAUNCH = { ...ENV, SITE_MODE: 'launch' };
const DAY = 86_400_000;

const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'web-remote-'));
  dirs.push(d);
  return d;
};
const emptyKeys = () => keysFile(tmp(), []);
// 앱 번들 공개키 목록(apps/mobile/src/net/remote-public-keys.json, C11)이 생긴 뒤로 빌드는 늘 두 목록을 대조한다 —
// 시험이 임시 공개키 목록을 쓸 때는 앱 목록도 같은 파일로 둔다(저장소가 두 곳을 맞춰 둔 상태). 대조 실패는 아래 시험이 따로 본다.
function run({ env = ENV, srcDir = join(ROOT, 'src'), remoteKeysPath = emptyKeys(), appKeysPath = remoteKeysPath, docsDir, now } = {}) {
  const outDir = join(tmp(), 'out');
  const docs = docsDir ?? (env.SITE_MODE === 'launch' ? cleanDocs(tmp()) : filledDocs(tmp()));
  return { outDir, ...build({ env, srcDir, outDir, docsDir: docs, remoteKeysPath, appKeysPath, ...(now && { now }) }) };
}
function fails(o) {
  try {
    run(o);
  } catch (e) {
    expect(e).toBeInstanceOf(BuildError);
    return e.problems.join('\n');
  }
  throw new Error('빌드가 통과했다');
}

describe('B4 캐시 머리글(firebase.json)', () => {
  const hdr = (fb, src) => fb.hosting.headers.find((h) => h.source === src)?.headers ?? [];
  it('config 300 · 매니페스트 300 · /content/lex/** immutable · 모티프 immutable', () => {
    const fb = readFirebaseJson(join(ROOT, 'firebase.json'));
    expect(hdr(fb, '/config/v1.json')).toEqual([{ key: 'Cache-Control', value: 'public, max-age=300' }]);
    expect(hdr(fb, '/content/v1.json')).toEqual([{ key: 'Cache-Control', value: 'public, max-age=300' }]);
    expect(hdr(fb, '/content/lex/**')).toEqual([{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]);
    expect(hdr(fb, '/content/motifs/**')).toEqual([{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]);
  });
  it('check(): 매니페스트가 3600으로 돌아가거나 lex immutable이 빠지거나 config 캐시가 길어지면 실패', () => {
    const { outDir } = run();
    const app = JSON.parse(readFileSync(join(ROOT, '../mobile/app.json'), 'utf8')).expo;
    const v = { team: 'A1B2C3D4E5', origin: 'https://mongmang.ink', apiOrigin: API, iosBundle: app.ios.bundleIdentifier, androidPackage: app.android.package, firebaseJson: readFirebaseJson(join(ROOT, 'firebase.json')) };
    expect(() => check(outDir, v)).not.toThrow();
    const set = (src, value) => {
      const fb = structuredClone(v.firebaseJson);
      fb.hosting.headers = fb.hosting.headers.map((h) => (h.source === src ? { ...h, headers: [{ key: 'Cache-Control', value }] } : h));
      return { ...v, firebaseJson: fb };
    };
    expect(() => check(outDir, set('/content/v1.json', 'public, max-age=3600'))).toThrow(/\/content\/v1\.json 캐시는 public, max-age=300/);
    expect(() => check(outDir, set('/config/v1.json', 'public, max-age=3600'))).toThrow(/\/config\/v1\.json 캐시는 public, max-age=300/);
    expect(() => check(outDir, set('/content/lex/**', 'public, max-age=300'))).toThrow(/\/content\/lex\/\*\* 캐시는 public, max-age=31536000, immutable/);
  });
});

describe('B4 원격 문서 서명·만료(출시 모드 빌드 차단, 리뷰 M3·M5)', () => {
  it('출시 전 모드 + 공개키 없음 + 서명 없음(지금 저장소): 통과, 경고만', () => {
    const r = run();
    expect(r.warnings.join('\n')).toMatch(/config\/v1\.json: 서명이 없다 — 출시 모드.*실패/);
    expect(r.warnings.join('\n')).toMatch(/content\/v1\.json: 서명이 없다/);
  });
  it('저장소의 공개키 자리(remote-public-keys.json)는 지금 비어 있고 모양이 맞다', () => {
    const f = JSON.parse(readFileSync(join(ROOT, 'remote-public-keys.json'), 'utf8'));
    expect(f.keys).toEqual([]);
  });
  it('출시 모드 + 서명 없음: 실패(공개키 목록이 비어 있다는 것도 알린다)', () => {
    const msg = fails({ env: LAUNCH });
    expect(msg).toMatch(/config\/v1\.json: 원격 문서 검사 unsigned/);
    expect(msg).toMatch(/content\/v1\.json: 원격 문서 검사 unsigned/);
    expect(msg).toMatch(/공개키 목록\(remote-public-keys\.json\)이 비어 있다/);
  });
  it('출시 모드 + 서명·만료 14일 + 공개키: 통과', () => {
    const r = run({ env: LAUNCH, srcDir: signedSrc(tmp()), remoteKeysPath: keysFile(tmp()) });
    expect(r.warnings.join('\n')).not.toMatch(/서명/);
    expect(JSON.parse(readFileSync(join(r.outDir, 'config/v1.json'), 'utf8')).sig.kid).toBe('test-1');
  });
  it('만료까지 7일 이하면 실패, 7일 넘게 남으면 통과(경계)', () => {
    const now = Date.UTC(2026, 11, 1);
    const keys = keysFile(tmp());
    expect(fails({ env: LAUNCH, srcDir: signedSrc(tmp(), { now, days: 7 }), remoteKeysPath: keys, now })).toMatch(/config\/v1\.json: expiresAt까지 7일 안/);
    expect(() => run({ env: LAUNCH, srcDir: signedSrc(tmp(), { now, days: 7 }), remoteKeysPath: keys, now: now - 60_000 })).not.toThrow();
    expect(fails({ env: LAUNCH, srcDir: signedSrc(tmp(), { now, days: 2 }), remoteKeysPath: keys, now: now + 3 * DAY })).toMatch(/expired/);
  });
  it('서명 뒤 값을 바꾸거나(킬 스위치 켜기), 모르는 키로 서명하거나, expiresAt 없이 서명하면 실패', () => {
    const keys = keysFile(tmp());
    const src = signedSrc(tmp());
    const p = join(src, 'config/v1.json');
    const doc = JSON.parse(readFileSync(p, 'utf8'));
    doc.flags.cloud = true;
    writeFileSync(p, JSON.stringify(doc));
    expect(fails({ env: LAUNCH, srcDir: src, remoteKeysPath: keys })).toMatch(/config\/v1\.json: 원격 문서 검사 bad/);
    const other = keysFile(tmp(), [{ ...testKey().pub, kid: 'other-1' }]);
    expect(fails({ env: LAUNCH, srcDir: signedSrc(tmp()), remoteKeysPath: other })).toMatch(/unknown_kid/);
    expect(fails({ env: LAUNCH, srcDir: signedSrc(tmp(), { days: null }), remoteKeysPath: keys })).toMatch(/content\/v1\.json: 원격 문서 검사 no_expiry/);
  });
  it('출시 전 모드라도 공개키 목록이 있으면(키가 든 앱 빌드 준비) 서명이 없을 때 실패', () => {
    expect(fails({ srcDir: join(ROOT, 'src'), remoteKeysPath: keysFile(tmp()) })).toMatch(/config\/v1\.json: 원격 문서 검사 unsigned/);
  });
  it('출시 전 모드 + 키 없음 + 서명이 있는 문서: 통과하되 검사할 키가 없다고 경고', () => {
    const r = run({ srcDir: signedSrc(tmp()) });
    expect(r.warnings.join('\n')).toMatch(/config\/v1\.json: 서명이 있지만 공개키 목록이 비어/);
  });
  it('공개키 목록 파일의 모양이 틀리면 실패', () => {
    const d = tmp();
    const p = join(d, 'k.json');
    writeFileSync(p, JSON.stringify({ keys: [{ kid: 'BAD KID', n: 'x', e: 'AQAB' }] }));
    expect(fails({ remoteKeysPath: p })).toMatch(/remote-public-keys\.json 1번째 키/);
    writeFileSync(p, JSON.stringify({ keys: [testKey().pub, testKey().pub] }));
    expect(fails({ remoteKeysPath: p })).toMatch(/같은 kid/);
  });
});

describe('R3 앱 번들 공개키 목록과 대조', () => {
  const appKeys = (keys) => keysFile(tmp(), keys);
  it('앱 목록이 있으면 remote-public-keys.json과 같아야 한다(다르면 실패, 같으면 통과)', () => {
    const k = testKey().pub;
    expect(() => run({ srcDir: signedSrc(tmp()), remoteKeysPath: keysFile(tmp()), appKeysPath: appKeys([k]) })).not.toThrow();
    expect(fails({ srcDir: signedSrc(tmp()), remoteKeysPath: keysFile(tmp()), appKeysPath: appKeys([{ ...k, kid: 'other-1' }]) })).toMatch(/앱 번들 공개키 목록.*다르다/);
    expect(fails({ remoteKeysPath: emptyKeys(), appKeysPath: appKeys([k]) })).toMatch(/다르다/);
  });
  it('앱 목록이 없고 공개키를 넣었으면 대조하지 못했다고 경고, 둘 다 없으면 경고 없음', () => {
    const r = run({ srcDir: signedSrc(tmp()), remoteKeysPath: keysFile(tmp()), appKeysPath: join(tmp(), 'none.json') });
    expect(r.warnings.join('\n')).toMatch(/대조하지 못했다\(C11\)/);
    expect(run({ appKeysPath: join(tmp(), 'none.json') }).warnings.join('\n')).not.toMatch(/대조/);
  });
});

describe('B4 사전 팩 파일 검사(content/lex)', () => {
  const pack = (o = {}) => Buffer.from(JSON.stringify({ schema: 1, lang: 'ko', lexVer: 3, words: { 바다: 'calm' }, ...o }) + '\n');
  /** 사전 팩 하나를 넣은 src 사본. tweak(entry, buf)로 매니페스트 항목·파일을 고장 낼 수 있다 */
  function lexSrc({ body = pack(), tweak } = {}) {
    const d = tmp();
    cpSync(join(ROOT, 'src'), d, { recursive: true });
    const hex = createHash('sha256').update(body).digest('hex');
    const url = `/content/lex/ko-3.${hex.slice(0, 8)}.json`;
    const entry = { lang: 'ko', lexVer: 3, minAppBuild: 0, url, sha256: hex, bytes: body.length };
    let file = body;
    if (tweak) {
      const t = tweak(entry, body); // undefined = 파일은 그대로, null = 파일을 두지 않음
      if (t !== undefined) file = t;
    }
    mkdirSync(join(d, 'content/lex'), { recursive: true });
    if (file !== null) writeFileSync(join(d, entry.url.slice(1)), file);
    const p = join(d, 'content/v1.json');
    writeFileSync(p, JSON.stringify({ ...JSON.parse(readFileSync(p, 'utf8')), lex: [entry] }));
    return d;
  }
  it('바른 팩은 통과하고 public/content/lex에 그대로 실린다', () => {
    const r = run({ srcDir: lexSrc() });
    expect(r.files.some((f) => /^content\/lex\/ko-3\.[0-9a-f]{8}\.json$/.test(f))).toBe(true);
  });
  it('파일 없음 · 바이트 다름 · sha256 다름 · 이름 해시 다름 · JSON 아님 · 머리 스키마 틀림 · 머리 언어·판이 항목과 다름이면 실패', () => {
    const cases = [
      [(e) => { e.url = e.url.replace(/\.[0-9a-f]{8}\.json$/, '.00000000.json'); }, /ko-3: 파일 이름의 해시가 내용과 다르다|ko-3: 파일 .* 없다/],
      [(e) => { e.bytes += 1; }, /ko-3: bytes/],
      [(e) => { e.sha256 = 'f'.repeat(64); }, /ko-3: sha256이 다르다/],
      [() => null, /ko-3: 파일 \/content\/lex\/ko-3\.[0-9a-f]{8}\.json이 없다/],
    ];
    for (const [tweak, re] of cases) expect(fails({ srcDir: lexSrc({ tweak }) }), String(re)).toMatch(re);
    expect(fails({ srcDir: lexSrc({ body: Buffer.from('not json') }) })).toMatch(/ko-3: 사전 팩 파일이 JSON이 아니다/);
    expect(fails({ srcDir: lexSrc({ body: pack({ schema: 2 }) }) })).toMatch(/ko-3: 사전 팩 머리/);
    expect(fails({ srcDir: lexSrc({ body: pack({ lexVer: 4 }) }) })).toMatch(/ko-3: 팩 머리\(ko-4\)가 매니페스트 항목과 다르다/);
    expect(fails({ srcDir: lexSrc({ body: pack({ lang: 'en' }) }) })).toMatch(/ko-3: 팩 머리\(en-3\)가 매니페스트 항목과 다르다/);
  });
  it('매니페스트에 없는 사전 팩 파일이 public/content/lex에 있으면 실패(immutable 캐시에 고아 파일이 남지 않게)', () => {
    const d = lexSrc();
    writeFileSync(join(d, 'content/lex/en-1.12345678.json'), pack({ lang: 'en', lexVer: 1 }));
    expect(fails({ srcDir: d })).toMatch(/content\/lex\/en-1\.12345678\.json: 매니페스트에 없는 사전 팩/);
    expect(existsSync(join(d, 'content/lex/en-1.12345678.json'))).toBe(true);
  });
  it('R6: 매니페스트에 없는 모티프 파일이 content/motifs에 있어도 실패', () => {
    const d = tmp();
    cpSync(join(ROOT, 'src'), d, { recursive: true });
    mkdirSync(join(d, 'content/motifs'), { recursive: true });
    writeFileSync(join(d, 'content/motifs/moon-01.12345678.json'), '{}');
    expect(fails({ srcDir: d })).toMatch(/content\/motifs\/moon-01\.12345678\.json: 매니페스트에 없는 모티프 파일/);
  });
});
