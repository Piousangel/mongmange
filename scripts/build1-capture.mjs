// 빌드 1 캡처(웹): 아침 꿈 카드 공유(4:5·9:16 PNG), 이레 두루마리 PNG, 평점 요청 흐름(이레 아침 1회), 실패 처리, 영어.
// 세이브 픽스처(sim v2, 이레 아침 직전·사흘째 아침 직전)를 localStorage에 넣고 연다. 웹 공유 = 내려받기 대체, 평점 = no-op(호출 횟수만).
// 사용: node scripts/build1-capture.mjs <fixtures.json> [baseUrl=http://localhost:8095] → docs/app/build1/
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const FIX = JSON.parse(await readFile(process.argv[2], 'utf8'));
const BASE = process.argv[3] ?? 'http://localhost:8095';
const OUT = path.resolve('docs/app/build1');
await mkdir(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const errors = [];
const log = {};

async function open(tag, save, { lang = 'system', query = '' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: lang === 'en' ? 'en-US' : 'ko-KR' });
  await ctx.addInitScript(
    ([s, l]) => {
      if (sessionStorage.getItem('fixed')) return;
      sessionStorage.setItem('fixed', '1');
      localStorage.clear();
      localStorage.setItem('mong.save.main', s);
      localStorage.setItem('mong.meta', JSON.stringify({ v: 1, notifAsked: true, notifEnabled: false, firstNightShown: true, lang: l }));
    },
    [save, lang],
  );
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${tag}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${tag}: ${String(e)}`));
  await page.goto(`${BASE}/${query}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForSelector('[data-testid="dream-sheet"]', { timeout: 120000 });
  await sleep(1200);
  return { ctx, page };
}

async function develop(page) {
  await page.click('[data-testid="develop"]');
  await page.waitForSelector('[data-testid="share-card"]', { timeout: 30000 });
  await sleep(3200);
}

async function share(page, id, file) {
  await page.evaluate(() => (window.__mongLastShare = undefined));
  const t0 = Date.now();
  await page.click(`[data-testid="share-${id}"]`);
  await page.waitForFunction(() => window.__mongLastShare, null, { timeout: 180000 });
  const r = await page.evaluate(() => ({ ...window.__mongLastShare, base64: undefined, b64: window.__mongLastShare.base64 }));
  await writeFile(`${OUT}/${file}`, Buffer.from(r.b64, 'base64'));
  const png = Buffer.from(r.b64, 'base64');
  const dim = { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };
  log[file] = { fileName: r.fileName, via: r.via, bytes: r.bytes, ...dim, ms: Date.now() - t0 };
  console.log('saved', file, log[file]);
}

const ONLY = process.env.ONLY ?? '';
if (!ONLY) {
// ── A. 이레 아침(한국어): 카드 → 평점 1회 → 공유 셋 ──
{
  const { ctx, page } = await open('ire', FIX.ire);
  await page.screenshot({ path: `${OUT}/01-ire-morning-sheet.png` });
  const before = await page.evaluate(() => window.__mongReviewCalls ?? 0);
  await develop(page);
  await page.screenshot({ path: `${OUT}/02-ire-card-share-buttons.png` });
  await sleep(2500); // REVIEW_DELAY_MS 4200 지나도록
  const after = await page.evaluate(() => ({ calls: window.__mongReviewCalls ?? 0, meta: JSON.parse(localStorage.getItem('mong.meta')) }));
  log.review = { before, afterDevelop: after.calls, reviewAsked: after.meta.reviewAsked };
  await share(page, 'card', 'share-ire-card-4x5.ko.png');
  await page.screenshot({ path: `${OUT}/03-after-share-saved-note.png` });
  await share(page, 'story', 'share-ire-card-9x16.ko.png');
  await share(page, 'ire', 'share-ire-scroll-9x16.ko.png');
  // 새로고침해도 다시 묻지 않는다(이미 현상 → 낮 홈, reviewAsked 유지)
  await page.reload({ waitUntil: 'load', timeout: 300000 });
  await sleep(6000);
  log.review.afterReload = await page.evaluate(() => ({ calls: window.__mongReviewCalls ?? 0, reviewAsked: JSON.parse(localStorage.getItem('mong.meta')).reviewAsked }));
  await ctx.close();
}

// ── B. 이레가 아닌 아침(사흘째): 평점 묻지 않음, 두루마리 버튼 없음, 공유 4:5 ──
{
  const { ctx, page } = await open('day3', FIX.day3);
  await develop(page);
  await sleep(2500);
  log.day3 = { reviewCalls: await page.evaluate(() => window.__mongReviewCalls ?? 0), ireButton: (await page.$('[data-testid="share-ire"]')) !== null };
  await page.screenshot({ path: `${OUT}/04-day3-card-share-buttons.png` });
  await share(page, 'card', 'share-day3-card-4x5.ko.png');
  await ctx.close();
}

// ── C. 실패 처리(?shareFail=1) ──
{
  const { ctx, page } = await open('fail', FIX.day3, { query: '?shareFail=1' });
  await develop(page);
  await page.click('[data-testid="share-card"]');
  await page.waitForSelector('[data-testid="share-note"]', { timeout: 30000 });
  log.fail = { note: await page.textContent('[data-testid="share-note"]') };
  await page.screenshot({ path: `${OUT}/05-share-failed-note.png` });
  await ctx.close();
}

// ── D. 영어 ──
{
  const { ctx, page } = await open('en', FIX.ire, { lang: 'en' });
  await develop(page);
  await page.screenshot({ path: `${OUT}/06-ire-card-share-buttons.en.png` });
  await share(page, 'card', 'share-ire-card-4x5.en.png');
  await share(page, 'story', 'share-ire-card-9x16.en.png');
  await share(page, 'ire', 'share-ire-scroll-9x16.en.png');
  await ctx.close();
}

}

// ── E. 옛 빌드로 내려감(세이브가 더 새 버전): 업데이트 안내, 화면을 눌러도 본 세이브 그대로 ──
{
  const o = JSON.parse(FIX.day3);
  const future = JSON.stringify({ ...o, sim: { ...o.sim, version: 3, state: { ...o.sim.state, schemaVersion: 3 } } });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ko-KR' });
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem('fixed')) return;
    sessionStorage.setItem('fixed', '1');
    localStorage.clear();
    localStorage.setItem('mong.save.main', s);
  }, future);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`update: ${String(e)}`));
  await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForSelector('[data-testid="update-required"]', { timeout: 120000 });
  await page.mouse.click(195, 420);
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/07-update-required.png` });
  log.update = { mainUntouched: (await page.evaluate(() => localStorage.getItem('mong.save.main'))) === future, keys: await page.evaluate(() => Object.keys(localStorage)) };
  await ctx.close();
}

log.errors = errors;
await writeFile(`${OUT}/capture-log${ONLY ? `-${ONLY}` : ''}.json`, JSON.stringify(log, null, 2));
console.log(JSON.stringify(log, null, 2));
await browser.close();
