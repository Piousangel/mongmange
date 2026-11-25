#!/usr/bin/env node
// mongmang.ink 출시 전 판 캡처(마케팅 P0, SE-2). 정적 빌드(가짜 주입 값) → 임시 서버(firebase.json rewrite 흉내, 포트 4517) →
// Playwright로 / · /press · /facts · /privacy 한·영을 320·430 폭, 그리고 320 폭 200% 글자로 찍는다. 끝나면 서버·브라우저를 끈다.
// 함께 재는 것: 가로 넘침, 자기 도메인 밖 요청 수, 콘솔 오류, 그림 alt, 제목 순서, 접근성 트리(ARIA 스냅숏).
// 사용: node scripts/web-prelaunch-capture.mjs [출력 폴더 = docs/app/web-prelaunch]
//       node scripts/web-prelaunch-capture.mjs --build-only  — 빌드만 하고 끝(브라우저·서버 없음, web-static 시험이 회귀를 본다)
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../apps/web-static/scripts/build.mjs';

const PORT = 4517; // 8081은 앱 개발 서버 자리 — 쓰지 않는다
const BUILD_ONLY = process.argv.includes('--build-only');
const OUT = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'docs/app/web-prelaunch');
const FP = Array.from({ length: 32 }, (_, i) => (i * 7 + 16).toString(16).toUpperCase().padStart(2, '0')).join(':');
const ENV = { APPLE_TEAM_ID: 'A1B2C3D4E5', ANDROID_CERT_SHA256: FP, APP_STORE_ID: '6739012345', API_ORIGIN: 'https://mong-api-abc123-du.a.run.app', SITE_ORIGIN: 'https://mongmang.ink',
  // 테스터판 보호책임자 칸(W7) — 캡처용 가짜 값. 실제 배포 값은 오너가 배포 환경에 넣는다
  PRIVACY_OFFICER: '캡처용 상호' };

const tmp = mkdtempSync(path.join(tmpdir(), 'web-prelaunch-'));
const pub = path.join(tmp, 'public');
const { warnings } = build({ env: ENV, outDir: pub });
if (BUILD_ONLY) {
  rmSync(tmp, { recursive: true, force: true });
  console.log('캡처용 빌드 통과(--build-only)');
  process.exit(0);
}
const { chromium } = await import('playwright');
const fb = JSON.parse(readFileSync('apps/web-static/firebase.json', 'utf8')).hosting;
const routes = new Map(fb.rewrites.filter((r) => r.destination).map((r) => [r.source, r.destination]));
const TYPES = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let p = decodeURI(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  else if (routes.has(p)) p = routes.get(p);
  const f = path.join(pub, p);
  if (!f.startsWith(pub) || !existsSync(f) || !statSync(f).isFile()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const base = `http://127.0.0.1:${PORT}`;

const PAGES = [
  ['home', '/', '/en'],
  ['press', '/press', '/en/press'],
  ['facts', '/facts', '/en/facts'],
  ['privacy', '/privacy', '/en/privacy'], // 빌드 2 테스터판 방침(SITE_MODE 기본 prelaunch)
];
const SHOTS = [
  { w: 320, fs: 100 },
  { w: 430, fs: 100 },
  { w: 320, fs: 200 },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const log = { builtWith: 'fake injected values (not deploy values)', warnings, port: PORT, shots: [] };
try {
  for (const [name, ko, en] of PAGES) {
    for (const [lang, url] of [['ko', ko], ['en', en]]) {
      for (const { w, fs } of SHOTS) {
        // 200% 글자는 폭 320에서만(가장 좁은 경우)
        const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: fs === 100 ? 2 : 1, locale: lang === 'ko' ? 'ko-KR' : 'en-US' });
        const page = await ctx.newPage();
        const external = [];
        const errors = [];
        page.on('request', (r) => {
          if (!r.url().startsWith(base)) external.push(r.url());
        });
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.goto(base + url, { waitUntil: 'networkidle' });
        // 200% 글자: 브라우저 글자 크기 설정과 같은 효과(사이트는 rem 단위)
        if (fs !== 100) await page.addStyleTag({ content: `html{font-size:${fs}%}` }).catch(() => {});
        const m = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          lang: document.documentElement.lang,
          h: [...document.querySelectorAll('h1,h2,h3')].map((h) => `${h.tagName}:${h.textContent.trim().slice(0, 30)}`),
          imgs: [...document.images].map((i) => ({ src: i.getAttribute('src'), alt: i.alt.length, loaded: i.complete && i.naturalWidth > 0 })),
          ld: [...document.querySelectorAll('script[type="application/ld+json"]')].length,
        }));
        // 지연 로딩 그림을 모두 불러온 뒤 찍는다
        await page.evaluate(async () => {
          for (const i of document.images) i.loading = 'eager';
          await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)))));
        });
        const file = `${name}-${lang}-w${w}${fs !== 100 ? `-fs${fs}` : ''}.png`;
        await page.screenshot({ path: path.join(OUT, file), fullPage: true });
        const aria = w === 430 && fs === 100 ? await page.locator('body').ariaSnapshot() : undefined;
        if (aria) writeFileSync(path.join(OUT, `${name}-${lang}.aria.yml`), aria);
        log.shots.push({ file, url, width: w, fontScale: fs, overflowX: m.scrollWidth > m.clientWidth, ...m, externalRequests: external, consoleErrors: errors });
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  rmSync(tmp, { recursive: true, force: true });
}
writeFileSync(path.join(OUT, 'capture-log.json'), JSON.stringify(log, null, 2) + '\n');
const bad = log.shots.filter((s) => s.overflowX || s.externalRequests.length || s.consoleErrors.length || s.imgs.some((i) => !i.alt || !i.loaded));
console.log(`캡처 ${log.shots.length}장 → ${path.relative(process.cwd(), OUT)}/ · 문제 ${bad.length}건`);
for (const b of bad) console.log(`- ${b.file}: 넘침 ${b.overflowX} 외부 ${b.externalRequests.length} 오류 ${b.consoleErrors.length}`);
process.exit(bad.length ? 1 : 0);
