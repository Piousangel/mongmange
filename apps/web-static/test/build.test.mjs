// 정적 빌드 검사(B0). 값이 비거나 자리표시자면 배포가 실패하는지, 만들어진 파일이 정본과 맞는지, 링크 코드가 새지 않는지.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build, BuildError, check, readFirebaseJson, readInjected, ROOT } from '../scripts/build.mjs';

const FP1 = Array.from({ length: 32 }, (_, i) => (i * 7 + 16).toString(16).toUpperCase().padStart(2, '0')).join(':');
const FP2 = Array.from({ length: 32 }, (_, i) => (255 - i * 3).toString(16).toUpperCase().padStart(2, '0')).join(':');
const ENV = { APPLE_TEAM_ID: 'A1B2C3D4E5', ANDROID_CERT_SHA256: `${FP1}, ${FP2.toLowerCase()}`, APP_STORE_ID: '6739012345' };

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
  dirs.length = 0;
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

  it('파일 목록: 딥링크 둘·config·content·/m·랜딩·robots (src/.gitkeep 제외)', () => {
    const { r } = out();
    expect(r.files).toEqual([
      '.well-known/apple-app-site-association',
      '.well-known/assetlinks.json',
      'config/v1.json',
      'content/v1.json',
      'index.html',
      'm/index.html',
      'robots.txt',
    ]);
  });

  it('/m 페이지: 한·영 문구, OG, noindex, no-referrer, 스토어 링크(코드 없음), 외부 스크립트 0, CSP 해시가 인라인 스크립트와 맞음', () => {
    const { read } = out();
    const html = read('m/index.html');
    expect(html).toContain('<section lang="ko">');
    expect(html).toContain('<section lang="en">');
    for (const p of ['og:title', 'og:description', 'og:type', 'og:locale']) expect(html).toContain(`property="${p}"`);
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
    expect(html).toContain('https://apps.apple.com/app/id6739012345?ct=m_link');
    expect(html).toMatch(/https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.piousangel\.mongmange&amp;referrer=/);
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/location\.(pathname|href)|document\.URL|sendBeacon|fetch\(/); // 주소(코드)를 읽지도 보내지도 않는다
    const script = /<script>([^<]*)<\/script>/.exec(html)[1];
    const hash = createHash('sha256').update(script).digest('base64');
    expect(html).toContain(`script-src 'sha256-${hash}'`);
    expect(html).toMatch(/default-src 'none'/); // connect-src도 'none' — 페이지에서 어떤 통신도 못 한다
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
  it('/m 페이지에 분석 스크립트·비콘·외부 주소가 들어오면 실패', () => {
    for (const inject of ['<script src="https://www.googletagmanager.com/gtag/js"></script>', '<img src="https://tracker.example/p.gif">', '<!-- navigator.sendBeacon -->']) {
      const d = srcCopy();
      const p = join(d, 'm/index.html');
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
    const v = { team: 'A1B2C3D4E5', origin: 'https://mongmang.ink', iosBundle: app.ios.bundleIdentifier, androidPackage: app.android.package, firebaseJson: readFirebaseJson(join(ROOT, 'firebase.json')) };
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
    expect(breaks(o, v, 'm/index.html', '<meta name="referrer" content="no-referrer">', '')).toMatch(/referrer/);
  });
  it('CSP meta를 빼거나 default-src를 풀면 실패', () => {
    const { o, v } = built();
    expect(breaks(o, v, 'm/index.html', "default-src 'none'", "default-src *")).toMatch(/CSP/);
  });
  it('ping= 속성·작은따옴표·프로토콜 상대 주소로 우회해도 실패', () => {
    for (const inject of [' ping="https://evil.example/p"', " data-x='https://evil.example/x'", ' srcset="//evil.example/a.png 1x"']) {
      const { o, v } = built();
      expect(breaks(o, v, 'm/index.html', '<nav class="stores">', `<nav class="stores"${inject}>`), inject).toMatch(/분석|허용 밖 외부 주소/);
    }
  });
  it('robots.txt가 /m/를 막으면 실패(I6)', () => {
    const { o, v } = built();
    expect(breaks(o, v, 'robots.txt', 'Disallow: /config/', 'Disallow: /m/\nDisallow: /config/')).toMatch(/robots\.txt가 \/m\//);
  });
  it('meta robots noindex를 빼면 실패', () => {
    const { o, v } = built();
    expect(breaks(o, v, 'm/index.html', '<meta name="robots" content="noindex">', '')).toMatch(/noindex/);
  });
  it('firebase.json: /m/** X-Robots-Tag가 없거나 ignore가 점 파일을 빼면 실패', () => {
    const { o, v } = built();
    const fb = structuredClone(v.firebaseJson);
    fb.hosting.headers = fb.hosting.headers.map((h) => (h.source === '/m/**' ? { ...h, headers: h.headers.filter((x) => x.key !== 'X-Robots-Tag') } : h));
    expect(() => check(o, { ...v, firebaseJson: fb })).toThrow(/X-Robots-Tag/);
    const fb2 = structuredClone(v.firebaseJson);
    fb2.hosting.ignore = ['firebase.json', '**/.*'];
    expect(() => check(o, { ...v, firebaseJson: fb2 })).toThrow(/ignore/);
  });
  it('실제 firebase.json: /m/**에 X-Robots-Tag noindex, ignore에 점 파일 패턴 없음, robots.txt는 /m을 막지 않음', () => {
    const fb = readFirebaseJson(join(ROOT, 'firebase.json')).hosting;
    expect(fb.headers.find((h) => h.source === '/m/**').headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex' });
    expect(fb.ignore).toEqual(['**/.DS_Store']);
    expect(readFileSync(join(ROOT, 'src/robots.txt'), 'utf8')).not.toMatch(/^Disallow:\s*\/m/m);
  });
});
