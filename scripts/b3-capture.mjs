// B3 /m 캡처·첫 페인트 측정(웹). 실제 서버(dist) + 로컬 파일 저장소 + Firebase 흉내 프록시(정적 public/ + /m/**·저장소를 서버로)로
// 한·영 살아 있는 링크, 이름 공개 판, 사라진 링크, webLive 켬(CanvasKit 살아 있는 몸)을 찍고 FCP·LCP를 잰다.
// 사용(저장소 루트, 로컬 compose db가 떠 있을 때):
//   pnpm --filter server build && DATABASE_URL=postgresql://prisma:prisma-local@localhost:54329/mong node scripts/b3-capture.mjs
// 포트: API 8093, 프록시 8094(8081은 쓰지 않는다). 끝나면 둘 다 끄고 심은 행·파일을 지운다. 산출: docs/app/b3/
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { chromium } from 'playwright';
import { build } from '../apps/web-static/scripts/build.mjs';

const API_PORT = 8093;
const WEB_PORT = 8094;
const WEB = `http://localhost:${WEB_PORT}`;
const OUT = path.resolve('docs/app/b3');
const DB = process.env.DATABASE_URL;
if (!DB) throw new Error('DATABASE_URL이 필요하다(로컬 compose db)');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const work = mkdtempSync(path.join(tmpdir(), 'mong-b3-capture-'));
const storeDir = path.join(work, 'store');
const pubDir = path.join(work, 'public');

// ① 정적 사이트(가짜 주입 값 — 캡처 전용) + webLive 켠 설정 사본
const FP = Array.from({ length: 32 }, (_, i) => (i * 7 + 16).toString(16).toUpperCase().padStart(2, '0')).join(':');
const built = build({ env: { APPLE_TEAM_ID: 'A1B2C3D4E5', ANDROID_CERT_SHA256: FP, APP_STORE_ID: '6739012345', API_ORIGIN: 'https://mong-api-abc123-du.a.run.app' }, outDir: pubDir });
const cfgPath = path.join(pubDir, 'config/v1.json');
const cfgOff = readFileSync(cfgPath, 'utf8');
const cfgOn = JSON.stringify({ ...JSON.parse(cfgOff), flags: { ...JSON.parse(cfgOff).flags, webLive: true } });
let webLive = false;

// ② 서버(dist)
const api = spawn(process.execPath, ['apps/server/dist/main.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(API_PORT),
    DATABASE_URL: DB,
    LOG_LEVEL: 'warn',
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_DIR: storeDir,
    STORAGE_LOCAL_BASE_URL: WEB,
    SITE_ORIGIN: WEB,
    APP_STORE_ID: '6739012345',
    TRUSTED_PROXY_HOPS_WEB: '0',
  },
  // 출력을 물려받으면 이 스크립트가 죽어도 파이프가 열려 남는다 — 버린다(실패는 아래 대기·응답 코드로 드러난다)
  stdio: 'ignore',
});
process.on('exit', () => api.kill('SIGTERM'));

// ③ Firebase 흉내: /m/**·/_local-storage/** → 서버, 나머지는 public/
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.wasm': 'application/wasm' };
const proxy = http.createServer((req, res) => {
  const url = new URL(req.url, WEB);
  if (url.pathname.startsWith('/m/') || url.pathname.startsWith('/_local-storage/')) {
    const up = http.request({ host: '127.0.0.1', port: API_PORT, path: req.url, method: req.method, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    up.on('error', () => res.writeHead(502).end());
    req.pipe(up);
    return;
  }
  if (url.pathname === '/config/v1.json') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(webLive ? cfgOn : cfgOff);
    return;
  }
  const f = path.join(pubDir, url.pathname);
  if (!f.startsWith(pubDir) || !existsSync(f) || statSync(f).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
  createReadStream(f).pipe(res);
});
await new Promise((ok) => proxy.listen(WEB_PORT, ok));

const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });

// ④ 포스터·OG 그림(캡처 전용 자리 그림 — 실제 그림은 앱이 올린다, C11)
async function jpegOf(w, h, label) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(`<body style="margin:0;background:#EFE8DA"><svg width="${w}" height="${h}" viewBox="0 0 100 ${(100 * h) / w}">
    <path d="M38 ${(62 * h) / w} q-14 -26 12 -34 q26 8 12 34 z" fill="#1B1A18"/>
    <path d="M28 ${(40 * h) / w} q18 -14 40 -2" stroke="#5F5C56" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <circle cx="45" cy="${(52 * h) / w}" r="1.6" fill="#EFE8DA"/><circle cx="55" cy="${(52 * h) / w}" r="1.6" fill="#EFE8DA"/>
    <text x="4" y="${(100 * h) / w - 4}" font-size="3" fill="#6B655B">${label}</text></svg></body>`);
  const b = await page.screenshot({ type: 'jpeg', quality: 70 });
  await ctx.close();
  return b;
}
const poster = await jpegOf(1080, 1350, 'poster 1080×1350 (capture placeholder)');
const og = await jpegOf(1200, 630, 'og 1200×630 (capture placeholder)');
const snap = JSON.parse(readFileSync('packages/core/test/fixtures/snap/ok.json', 'utf8'));

// ⑤ 심기: 사용자·몽망이·live 페이지(한 = 이름 공개, 영 = 이름 없음)를 DB에, 파일을 로컬 저장소 형식으로
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const code = () => Array.from(randomBytes(8), (b) => ALPHA[b & 31]).join('');
const db = new pg.Client({ connectionString: DB });
await db.connect();
const seeded = [];
async function seed({ lang, name }) {
  const userId = randomUUID();
  const cid = randomUUID();
  const c = code();
  const key = randomBytes(16).toString('base64url');
  const meta = { snap: 1, ...(name ? { name } : {}), ink: 'songyeon', texture: 'tempoNeg', bornDate: '2026-12-22', dayAtPublish: 9, lang };
  await db.query(`INSERT INTO app.users (id, age_gate_v, age_confirmed_on) VALUES ($1, 2, current_date)`, [userId]);
  await db.query(`INSERT INTO app.creatures (id, user_id, code, link_enabled) VALUES ($1, $2, $3, true)`, [cid, userId, c]);
  const { rows } = await db.query(
    `INSERT INTO app.public_pages (creature_id, ver, state, meta, name_shown, path_prefix, has_loop, published_at) VALUES ($1, 1, 'live', $2, $3, $4, false, now()) RETURNING store_key`,
    [cid, meta, !!name, key],
  );
  // 저장소 키 = {store_key}/{pageKey}/파일(로컬 저장소 형식: 파일 + .type)
  const dir = path.join(storeDir, 'public-pages', rows[0].store_key, key);
  mkdirSync(dir, { recursive: true });
  const put = (f, body, type) => {
    writeFileSync(path.join(dir, f), body);
    writeFileSync(path.join(dir, `${f}.type`), type);
  };
  put('poster.jpg', poster, 'image/jpeg');
  put('og.jpg', og, 'image/jpeg');
  put('snap.json', JSON.stringify({ ...snap, lang, ...(name ? { name } : {}) }), 'application/json');
  seeded.push(userId);
  return c;
}

const errors = [];
const metrics = {};
try {
  for (let i = 0; i < 60 && !(await fetch(`${WEB}/m/XXXXXXXX`).then((r) => r.ok).catch(() => false)); i++) await sleep(250);
  const ko = await seed({ lang: 'ko', name: '달이' });
  const en = await seed({ lang: 'en', name: null });

  async function shot(file, url, { locale = 'ko-KR', wait = 600, measure = null } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && errors.push(`${file}: ${m.text()}`));
    page.on('pageerror', (e) => errors.push(`${file}: ${String(e)}`));
    if (process.env.B3_DEBUG) {
      page.on('console', (m) => console.log(`[console ${m.type()}] ${m.text()}`));
      page.on('request', (r) => console.log(`[req] ${r.url()}`));
      page.on('requestfailed', (r) => console.log(`[fail] ${r.url()} ${r.failure()?.errorText}`));
    }
    if (measure) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', { offline: false, ...measure.net });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: measure.cpu });
    }
    await page.addInitScript(() => {
      window.__lcp = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__lcp = e.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    await page.goto(url, { waitUntil: 'load' });
    await sleep(wait);
    if (process.env.B3_DEBUG) console.log('[dom]', await page.evaluate(() => `canvas=${document.querySelectorAll('canvas').length} ck=${typeof window.CanvasKitInit}`));
    const m = await page.evaluate(() => ({
      fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      lcp: window.__lcp,
      htmlBytes: performance.getEntriesByType('navigation')[0]?.transferSize ?? null,
      canvas: !!document.querySelector('.stage canvas.on'),
    }));
    if (file) await page.screenshot({ path: path.join(OUT, file) });
    await ctx.close();
    return m;
  }

  await shot('m-live-ko-named.png', `${WEB}/m/${ko}`);
  await shot('m-live-en.png', `${WEB}/m/${en}`, { locale: 'en-US' });
  await shot('m-live-ko-viewer-en.png', `${WEB}/m/${ko}`, { locale: 'en-US' });
  await shot('m-gone-ko.png', `${WEB}/m/ZZZZZZZZ`);
  await shot('m-gone-en.png', `${WEB}/m/ZZZZZZZZ`, { locale: 'en-US' });
  webLive = true;
  metrics.webLiveOn = await shot('m-live-weblive-ko.png', `${WEB}/m/${ko}`, { wait: 6000 });
  webLive = false;

  // 첫 페인트(FCP·LCP, 중앙값 5회): 제한 없음 / 느린 4G(RTT 150ms·1.6Mbps 내려받기)·CPU 4배 느림
  const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  for (const [label, measure] of [
    ['none', { net: { latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, cpu: 1 }],
    ['slow4g_cpu4x', { net: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 }, cpu: 4 }],
  ]) {
    const runs = [];
    for (let i = 0; i < 5; i++) runs.push(await shot(null, `${WEB}/m/${ko}`, { wait: 300, measure }));
    metrics[label] = { fcpMs: Math.round(median(runs.map((r) => r.fcp))), lcpMs: Math.round(median(runs.map((r) => r.lcp))), htmlTransferBytes: runs[0].htmlBytes };
  }
  metrics.bundle = built.live;
  metrics.errors = errors;
  writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
  console.log(JSON.stringify(metrics, null, 2));
} finally {
  for (const id of seeded) await db.query('DELETE FROM app.users WHERE id = $1', [id]);
  await db.end();
  await browser.close();
  proxy.close();
  api.kill('SIGTERM');
  rmSync(work, { recursive: true, force: true });
}
