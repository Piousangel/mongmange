// 꿈 인화 카드 v1 캡처(웹): 공유 이미지 함수(renderDreamCardImage) 결과 PNG를 그대로 저장 + 비교 시트.
// 사용: node scripts/dream-card-capture.mjs [baseUrl=http://localhost:8084] [only=motif-id]
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:8084';
const ONLY = process.argv[3] ?? '';
const OUT = path.resolve('docs/creative/dream-card-v1');
const MOTIFS = ['near-alone.quilt', 'near-alone.teacup', 'near-with.window-hand', 'near-with.teacup-two', 'far-alone.mountain', 'far-alone.sea', 'far-with.stars-drops', 'far-with.sea-hand', 'center.rain', 'center.moon'];
const TEMPERS = ['a', 'b', 'c'];
await mkdir(`${OUT}/cards`, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

async function grab(q, file) {
  await page.goto(`${BASE}/?screen=card&export=1&${q}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__dreamPng, null, { timeout: 120000 });
  const b64 = await page.evaluate(() => window.__dreamPng);
  await writeFile(`${OUT}/cards/${file}.png`, Buffer.from(b64, 'base64'));
  console.log('saved', file);
}

const list = ONLY ? MOTIFS.filter((m) => m.includes(ONLY)) : MOTIFS;
for (const m of list) for (const t of TEMPERS) await grab(`motif=${m}&t=${t}&seed=7&comp=0`, `${m}__${t}`);
if (!ONLY) {
  for (const m of ['center.moon', 'far-alone.mountain', 'near-alone.quilt', 'center.rain']) await grab(`motif=${m}&t=b&seed=7&comp=0&aspect=916`, `${m}__b__916`);
  // 결정성: 같은 쿼리 두 번 → 같은 바이트
  await grab(`motif=center.moon&t=b&seed=7&comp=0`, `_det1`);
  await grab(`motif=center.moon&t=b&seed=7&comp=0`, `_det2`);
  const a = await readFile(`${OUT}/cards/_det1.png`);
  const b = await readFile(`${OUT}/cards/_det2.png`);
  console.log('deterministic png:', a.equals(b));
  // 화면 컴포넌트(RN 글) 한 장
  await page.setViewportSize({ width: 432, height: 540 });
  await page.goto(`${BASE}/?screen=card&motif=center.moon&t=b&seed=7&comp=0`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__cardReady, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/screen-component-moon.png` });
}

// 비교 시트(10 × 3 + 기준 05a)
const rel = (f) => `file://${OUT}/cards/${f}.png`;
const ref = `file://${path.resolve('docs/creative/v1/img/05a-morning-card-marbling.png')}`;
const cell = (m, t) => `<div class="c"><img src="${rel(`${m}__${t}`)}"><span>${m} · ${t}</span></div>`;
const html = `<html><body style="margin:0;background:#222;font:12px sans-serif;color:#ccc">
<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;padding:8px">
<div class="c"><img src="${ref}"><span>기준 05a(채택)</span></div>
${MOTIFS.map((m) => TEMPERS.map((t) => cell(m, t)).join('') + '').join('')}
</div><style>.c img{width:100%;display:block}.c span{display:block;padding:2px 0 6px}</style></body></html>`;
await writeFile(`${OUT}/sheet.html`, html);
const sheet = await ctx.newPage();
await sheet.setViewportSize({ width: 1750, height: 1200 });
await sheet.goto(`file://${OUT}/sheet.html`);
await sheet.waitForTimeout(800);
await sheet.screenshot({ path: `${OUT}/grid-10x3.png`, fullPage: true });
console.log('errors', errors.slice(0, 5));
await browser.close();
