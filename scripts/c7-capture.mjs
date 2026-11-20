// C7 이레 영상 프레임 캡처(웹): 이레 세이브(core 고정물 v1-ire-developed)를 넣고 ?screen=ire 보드가 실제 렌더 경로로 그린 프레임 PNG를 받는다.
// 공유(9:16) 이름 공개 켬/끔 두 벌 + 웹 루프(540×675) 한 벌. 이름 끔 판에서 이름이 빠졌는지는 사람이 PNG로 본다(자동 검사는 core·앱 시험).
// 사용: node scripts/c7-capture.mjs [baseUrl=http://localhost:8131] → docs/app/c7/
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:8131';
const OUT = path.resolve('docs/app/c7');
const SAVE = await readFile(path.resolve('packages/core/test/fixtures/saves/v1-ire-developed.json'), 'utf8');
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const errors = [];
const log = {};

async function board(tag, query) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, locale: 'ko-KR' });
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem('fixed')) return;
    sessionStorage.setItem('fixed', '1');
    localStorage.clear();
    localStorage.setItem('mong.save.main', s);
    localStorage.setItem('mong.meta', JSON.stringify({ v: 1, notifAsked: true, notifEnabled: false, firstNightShown: true, lang: 'ko' }));
  }, SAVE);
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${tag}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${tag}: ${String(e)}`));
  await page.goto(`${BASE}/?screen=ire&${query}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => window.__mongIreFrames, null, { timeout: 300000 });
  const frames = await page.evaluate(() => window.__mongIreFrames);
  if (!Array.isArray(frames)) throw new Error(`${tag}: ${JSON.stringify(frames)}`);
  log[tag] = [];
  for (const f of frames) {
    const file = `${tag}-f${String(f.i).padStart(3, '0')}.png`;
    await writeFile(`${OUT}/${file}`, Buffer.from(f.base64, 'base64'));
    log[tag].push({ file, i: f.i, w: f.w, h: f.h, ms: f.ms, bytes: Math.round((f.base64.length * 3) / 4) });
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${tag}-board.png`, fullPage: true });
  console.log('saved', tag, log[tag].map((x) => `${x.i}:${x.ms}ms`).join(' '));
  await ctx.close();
}

const FF = 'ff=temperamentLabel,inkChoice,naming';
await board('share-name-on', `${FF}&kind=share&w=1080&nm=달무리&name=1&f=0,12,60,120,165,195,215,239`);
await board('share-name-off', `${FF}&kind=share&w=1080&nm=달무리&name=0&f=215,239`);
await board('loop', `kind=webLoop&w=540&f=0,60,120,181,191`);
await writeFile(`${OUT}/capture-log.json`, JSON.stringify({ log, errors }, null, 2));
console.log('errors', errors.length, errors.slice(0, 5));
await browser.close();
