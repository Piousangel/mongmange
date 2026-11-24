// M2 이름·인장·이름표 캡처(웹, ?ff=naming,nameMelody): 이레 세이브(core 고정물 v1-ire-developed)를 넣고
// 공방 노트 → 이름 짓기 → (빈 칸·조합 중·오류·확정) → 홈 세로 이름 → 이름표. 한·영, 폭 320/390/430, 글자 200%.
// 사용: Expo 웹을 띄운 뒤 node scripts/m2-capture.mjs [baseUrl=http://localhost:8137] → docs/app/m2/
// 웹은 소리가 없다(백엔드 no-op) — 가락·'탁'은 엔진 시험(apps/mobile/test/m2.test.ts)이 본다.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:8137';
const OUT = path.resolve('docs/app/m2');
const SAVE = await readFile(path.resolve('packages/core/test/fixtures/saves/v1-ire-developed.json'), 'utf8');
await mkdir(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const errors = [];
const log = {};

async function open(tag, { lang = 'ko', width = 390, fs = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, locale: lang === 'en' ? 'en-US' : 'ko-KR' });
  await ctx.addInitScript(
    ([s, l]) => {
      if (sessionStorage.getItem('fixed')) return;
      sessionStorage.setItem('fixed', '1');
      localStorage.clear();
      localStorage.setItem('mong.save.main', s);
      localStorage.setItem('mong.meta', JSON.stringify({ v: 1, notifAsked: true, notifEnabled: false, firstNightShown: true, lang: l, reviewAsked: true }));
    },
    [SAVE, lang],
  );
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${tag}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${tag}: ${String(e)}`));
  await page.goto(`${BASE}/?ff=naming,nameMelody&fs=${fs}`, { waitUntil: 'load', timeout: 300000 });
  // 고정물 시각에 따라 아침 화면이면 건져 올리고 닫는다
  for (let i = 0; i < 3; i++) {
    if (await page.locator('[data-testid="game-home"]').count()) break;
    if (await page.locator('[data-testid="develop"]').count()) await page.click('[data-testid="develop"]');
    await sleep(3500);
    if (await page.locator('[data-testid="card-done"]').count()) await page.click('[data-testid="card-done"]');
    await sleep(1500);
  }
  await page.waitForSelector('[data-testid="game-home"]', { timeout: 120000 });
  await sleep(3000);
  return { ctx, page };
}
const shot = async (page, f) => {
  await page.screenshot({ path: `${OUT}/${f}` });
  console.log('saved', f);
};

async function flow(tag, opts, name, full) {
  const { ctx, page } = await open(tag, opts);
  const L = (log[tag] = {});
  if (full) await shot(page, `${tag}-0-home-unnamed.png`);
  await page.click('[data-testid="seal"]');
  await page.waitForSelector('[data-testid="note-name"]', { timeout: 30000 });
  await sleep(900);
  if (full) await shot(page, `${tag}-1-note.png`);
  await page.click('[data-testid="note-name"]');
  await page.waitForSelector('[data-testid="name-sheet"]', { timeout: 30000 });
  await sleep(700);
  await shot(page, `${tag}-2-sheet-empty.png`);
  if (full) {
    await page.fill('[data-testid="name-input"]', '몽ㅅ');
    await sleep(300);
    L.composingNote = await page.locator('[data-testid="name-note"]').innerText();
    await shot(page, `${tag}-3-composing.png`);
    await page.fill('[data-testid="name-input"]', '01012345678');
    await sleep(300);
    L.digitsNote = await page.locator('[data-testid="name-note"]').innerText();
    await shot(page, `${tag}-4-err-digits.png`);
    await page.fill('[data-testid="name-input"]', '똠이');
    await sleep(300);
    L.fallbackShown = (await page.locator('[data-testid="name-fallback"]').count()) === 1;
    await shot(page, `${tag}-5-fallback-glyph.png`);
  }
  await page.fill('[data-testid="name-input"]', name);
  await sleep(300);
  await shot(page, `${tag}-6-typed.png`);
  await page.click('[data-testid="name-confirm"]');
  await sleep(120);
  if (full) await shot(page, `${tag}-7-stamp.png`);
  await page.waitForSelector('[data-testid="name-sheet"]', { state: 'detached', timeout: 10000 });
  await sleep(1500);
  await shot(page, `${tag}-8-home-named.png`);
  L.titleA11y = await page.locator('[data-testid="name-title"]').getAttribute('aria-label');
  await page.click('[data-testid="name-title"]');
  await sleep(700);
  if (full) await shot(page, `${tag}-9-call.png`);
  await page.click('[data-testid="seal"]');
  await page.waitForSelector('[data-testid="note-tag"]', { timeout: 30000 });
  await sleep(700);
  await page.click('[data-testid="note-tag"]');
  await page.waitForSelector('[data-testid="name-tag"]', { timeout: 30000 });
  await sleep(1500);
  await shot(page, `${tag}-10-name-tag.png`);
  await ctx.close();
}

await flow('ko-390', { lang: 'ko', width: 390 }, '몽실이', true);
await flow('en-390', { lang: 'en', width: 390 }, 'Momo', true);
await flow('ko-320', { lang: 'ko', width: 320 }, '가나다라마바', false);
await flow('ko-430', { lang: 'ko', width: 430 }, '먹보', false);
await flow('ko-390-fs200', { lang: 'ko', width: 390, fs: 2 }, '몽실이', false);
await flow('en-320-fs200', { lang: 'en', width: 320, fs: 2 }, 'Juniper Ash', false);

await writeFile(`${OUT}/log.json`, JSON.stringify(log, null, 2));
await writeFile(`${OUT}/errors.json`, JSON.stringify(errors, null, 2));
console.log('errors', errors.length);
await browser.close();
