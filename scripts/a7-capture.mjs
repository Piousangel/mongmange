// A7 썸네일 정체성 캡처(웹): 36·22pt 비교 그리드(현행 / LOD), 눈 소실 수정 전후 보드, 앨범 썸네일 카드.
// 사용: node scripts/a7-capture.mjs [baseUrl=http://localhost:8137] → docs/app/a7/
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:8137';
const OUT = path.resolve('docs/app/a7');
await mkdir(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const errors = [];

async function board(file, query, vp, clip) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, locale: 'ko-KR' });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${file}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${file}: ${String(e)}`));
  await page.goto(`${BASE}/?screen=m1&${query}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForSelector('[data-testid="m1-board"]', { timeout: 120000 });
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/${file}`, ...(clip ? { clip } : {}) });
  console.log('saved', file);
  await ctx.close();
}

// 1) 36·22pt 비교: 같은 열 = 같은 몽망이(다른 손 12마리), 행 = 36 현행 / 36 LOD / 22 현행 / 22 LOD
await board('compare-36-22.png', 'view=a7&night=0', { width: 1280, height: 560 });
// 2) 눈 소실 수정 뒤 M1 썸네일 보드(수정 전: docs/app/m1/thumb48-day.png)
await board('thumb48-day-fixed.png', 'view=thumb&night=0&n=7', { width: 640, height: 300 });
await board('thumb48-day-fixed-zoom.png', 'view=thumb&night=0&n=7', { width: 640, height: 300 }, { x: 140, y: 120, width: 220, height: 80 });
// 3) LOD를 켠 M1 썸네일 보드(같은 손 7획 — 먹·눈·빗 차이만)
await board('thumb48-day-lod.png', 'view=thumb&night=0&n=7&ff=thumbLod', { width: 640, height: 300 });

await writeFile(`${OUT}/errors.json`, JSON.stringify(errors, null, 1));
console.log('errors', errors.length);
await browser.close();
