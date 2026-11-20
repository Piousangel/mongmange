// M1 타고남 + 먹 캡처(웹): 48칸 그리드(낮·밤), 먹 4 비교, 썸네일 크기(블라인드), 타고남 12 실루엣, 먹 고르기 화면(앱 흐름).
// 사용: node scripts/m1-capture.mjs [baseUrl=http://localhost:8113] → docs/app/m1/
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:8113';
const OUT = path.resolve('docs/app/m1');
await mkdir(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const errors = [];

async function board(file, query, vp) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, locale: 'ko-KR' });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${file}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${file}: ${String(e)}`));
  await page.goto(`${BASE}/?screen=m1&${query}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForSelector('[data-testid="m1-board"]', { timeout: 120000 });
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/${file}` });
  console.log('saved', file);
  await ctx.close();
}

const ONLY = process.env.ONLY ?? '';
if (!ONLY || ONLY === 'board') {
  await board('grid48-day.png', 'view=grid&night=0&n=7', { width: 1280, height: 720 });
  await board('grid48-night.png', 'view=grid&night=1&n=7', { width: 1280, height: 720 });
  await board('grid48-day-n0.png', 'view=grid&night=0&n=0', { width: 1280, height: 720 });
  await board('ink4-day-night.png', 'view=ink&n=7', { width: 900, height: 640 });
  await board('thumb48-day.png', 'view=thumb&night=0&n=7', { width: 640, height: 300 });
  await board('thumb48-night.png', 'view=thumb&night=1&n=7', { width: 640, height: 300 });
  await board('traits12-n0.png', 'view=traits&n=0', { width: 900, height: 720 });
  await board('traits12-n7.png', 'view=traits&n=7', { width: 900, height: 720 });
}

// 앱 흐름(?ff=m1). 세이브 픽스처: M1_DAY0 = 첫날 첫 획 뒤(먹 안 고름), M1_DAY1 = 이튿날 낮(첫 밤에 씨앗 먹)
import { readFileSync } from 'node:fs';
async function app(tag, save, { lang = 'ko', listView = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: lang === 'en' ? 'en-US' : 'ko-KR' });
  await ctx.addInitScript(
    ([s, l, lv]) => {
      if (sessionStorage.getItem('fixed')) return;
      sessionStorage.setItem('fixed', '1');
      localStorage.clear();
      localStorage.setItem('mong.save.main', s);
      localStorage.setItem('mong.meta', JSON.stringify({ v: 1, notifAsked: true, notifEnabled: false, firstNightShown: true, lang: l, listView: lv }));
    },
    [readFileSync(save, 'utf8'), lang, listView],
  );
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${tag}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${tag}: ${String(e)}`));
  await page.goto(`${BASE}/?ff=m1`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForSelector('[data-testid="game-home"]', { timeout: 120000 });
  return { ctx, page };
}
const shot = async (page, f) => {
  await page.screenshot({ path: `${OUT}/${f}` });
  console.log('saved', f);
};
const log = {};
if (!ONLY || ONLY === 'flow') {
  const day0 = process.env.M1_DAY0;
  const day1 = process.env.M1_DAY1;
  if (day0) {
    for (const lang of ['ko', 'en']) {
      const { ctx, page } = await app(`day0-${lang}`, day0, { lang });
      await page.waitForSelector('[data-testid="ink-sticks"]', { timeout: 60000 });
      await sleep(3500);
      await shot(page, `flow-pick-${lang}.png`);
      if (lang === 'ko') {
        const box = await page.locator('[data-testid="ink-jayeon"]').boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await sleep(700);
        await page.mouse.up();
        await sleep(400);
        await shot(page, 'flow-name-ko.png');
        await sleep(2600);
      }
      await page.click('[data-testid="ink-songyeon"]');
      await sleep(350);
      if (lang === 'ko') await shot(page, 'flow-soak-ko.png'); // 다시 스밈 번짐(1200ms) 한가운데
      await page.waitForSelector('[data-testid="ink-kept"]', { timeout: 30000 });
      await sleep(1500);
      await shot(page, `flow-chosen-${lang}.png`);
      log[`day0-${lang}`] = { sticksGone: (await page.locator('[data-testid="ink-sticks"]').count()) === 0 };
      await ctx.close();
    }
    const { ctx, page } = await app('day0-list', day0, { listView: true });
    await page.waitForSelector('[data-testid="ink-list-songyeon"]', { timeout: 60000 });
    await sleep(2500);
    await shot(page, 'flow-list-ko.png');
    await ctx.close();
  }
  if (day1) {
    const { ctx, page } = await app('day1', day1);
    await sleep(4000);
    log.day1NoSticks = (await page.locator('[data-testid="ink-sticks"]').count()) === 0;
    await shot(page, 'day1-home-seeded.png');
    // 공방 노트 → 먹 바꾸기
    await page.click('[data-testid="seal"]');
    await page.waitForSelector('[data-testid="note-ink-change"]', { timeout: 30000 });
    await sleep(900);
    await shot(page, 'day1-note-change.png');
    await page.click('[data-testid="note-ink-change"]');
    await page.waitForSelector('[data-testid="ink-sticks"]', { timeout: 30000 });
    await sleep(2000);
    await shot(page, 'day1-change-pick.png');
    await page.click('[data-testid="ink-jayeon"]');
    await page.waitForSelector('[data-testid="ink-kept"]', { timeout: 30000 });
    await sleep(1500);
    await shot(page, 'day1-change-chosen.png'); // 지난 획·고리는 씨앗 먹 그대로여야
    // 새 획 긋기: 붓 → 몸 오른쪽 아래를 따라 끌기 → 붓 내려놓기
    await page.click('[data-testid="obj-brush"]');
    await sleep(1500);
    const vp = page.viewportSize();
    const cx = vp.width * 0.5;
    const cy = vp.height * 0.62;
    const R = vp.width * 0.18 * 0.62;
    await page.mouse.move(cx + R * Math.sin(1.9), cy - R * Math.cos(1.9));
    await page.mouse.down();
    for (let i = 1; i <= 24; i++) {
      const th = 1.9 + (i / 24) * 0.9;
      await page.mouse.move(cx + R * Math.sin(th), cy - R * Math.cos(th), { steps: 2 });
      await sleep(16);
    }
    await page.mouse.up();
    await sleep(3000);
    await shot(page, 'day1-new-stroke.png'); // 새 획 = 자연먹, 첫 두름 = 씨앗 먹
    await ctx.close();
    // 카드: 공방 노트 앨범 → 크게 보기(그 아이의 체형·먹)
    const c2 = await app('day1-card', day1);
    await sleep(2500);
    await c2.page.click('[data-testid="seal"]');
    await c2.page.waitForSelector('[data-testid="album-0"]', { timeout: 30000 });
    await sleep(2500);
    await c2.page.click('[data-testid="album-0"]');
    await c2.page.waitForSelector('[data-testid="card-viewer"]', { timeout: 30000 });
    await sleep(4000);
    await shot(c2.page, 'day1-card-look.png');
    await c2.ctx.close();
  }
}
console.log('log', JSON.stringify(log));
await writeFile(`${OUT}/flow-log.json`, JSON.stringify(log, null, 2));

await writeFile(`${OUT}/errors.json`, JSON.stringify(errors, null, 2));
console.log('errors', errors.length);
await browser.close();
