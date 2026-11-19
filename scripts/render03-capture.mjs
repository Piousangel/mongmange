// 렌더 스파이크 03(획 문법) 캡처. 사용: node scripts/render03-capture.mjs
// `sheets` 인자를 주면 캡처 없이 비교 시트만 다시 만든다.
// 웹 서버: apps/mobile에서 `npx expo start --web --port 8082` (8081은 실기기 개발 서버용이라 쓰지 않는다).
// 산출: docs/spike/render-03-grammar/ — 문법 A·B·C × 포즈(기준·서툰 손) 전체 화면 + 확대 크롭, 0일차 전후, 밤, 비교 시트 3장.
import { chromium } from 'playwright';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = process.env.BASE ?? 'http://localhost:8082';
const OUT = path.resolve('docs/spike/render-03-grammar');
const IMG = path.resolve('docs/creative/v1/img');
const PREV = path.resolve('docs/spike/render-02');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEW = { width: 390, height: 844 };

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = {};

/** layout()과 같은 식: W = 폭 18%, 바닥 = 세로 62% + 0.4W. 핵 크기 s의 몸 둘레 크롭(pt) */
function cropFor(s, padW = 1.0) {
  const w = VIEW.width * 0.18;
  const groundY = VIEW.height * 0.62 + 0.4 * w;
  const oy = groundY - 0.4 * s * w;
  const half = padW * s * w;
  return { x: VIEW.width / 2 - half, y: oy - half * 0.78, width: half * 2, height: half * 1.5 };
}

async function shot(name, query, s) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 300)));
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  await page.goto(`${BASE}/?${query}&rm=1&clean=1`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForSelector('canvas', { timeout: 60000 });
  await sleep(1800);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await ctx.close();
  // 확대 크롭은 DPR 4로 다시(판정용, 리뷰 1-4: 기준 이미지와 같은 크기로)
  const ctx4 = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 4 });
  const p4 = await ctx4.newPage();
  await p4.goto(`${BASE}/?${query}&rm=1&clean=1`, { waitUntil: 'load', timeout: 120000 });
  await p4.waitForSelector('canvas', { timeout: 60000 });
  await sleep(1800);
  await p4.screenshot({ path: `${OUT}/zoom-${name}.png`, clip: cropFor(s) });
  await ctx4.close();
  errors[name] = errs;
}

const G = ['A', 'B', 'C'];
const SHEETS_ONLY = process.argv[2] === 'sheets';
if (!SHEETS_ONLY) for (const g of G) {
  await shot(`day7-${g}`, `screen=day&day=7&grammar=${g}`, 1.25);
  await shot(`day7-clumsy-${g}`, `screen=day&day=7&pose=clumsy&grammar=${g}`, 1.25);
}
if (!SHEETS_ONLY) {
  await shot('day0', 'screen=day&day=0', 1);
  await shot('night-C', 'screen=night&day=7&grammar=C', 1.25);
  await shot('night-clumsy-C', 'screen=night&day=7&pose=clumsy&grammar=C', 1.25);
  await shot('day7-L3-C', 'screen=day&day=7&attach=3&grammar=C', 1.25);
  await shot('day7-clumsy-L3-C', 'screen=day&day=7&pose=clumsy&attach=3&grammar=C', 1.25);
}

// ───────── 비교 시트(HTML → 스크린샷) ─────────
const u = (p) => pathToFileURL(p).href;
/** 기준 이미지 크롭: (x, y, w, h)를 너비 W px 칸에 맞춤 */
function refCrop(file, x, y, w, h, W = 320) {
  const k = W / w;
  return `<div class="cell" style="width:${W}px;height:${Math.round(h * k)}px;background:url('${u(file)}') no-repeat;background-size:${1536 * k}px ${1024 * k}px;background-position:-${x * k}px -${y * k}px"></div>`;
}
/** 390×844 전체 화면 캡처(어느 DPR이든)를 cropFor(s)와 같은 영역으로 잘라 W px 칸에 */
function prevCrop(file, s, W = 320) {
  const c = cropFor(s);
  const k = W / c.width;
  return `<div class="cell" style="width:${W}px;height:${Math.round(c.height * k)}px;background:url('${u(file)}') no-repeat;background-size:${VIEW.width * k}px ${VIEW.height * k}px;background-position:-${c.x * k}px -${c.y * k}px"></div>`;
}
function img(file, W = 320) {
  return `<img class="cell" src="${u(file)}" style="width:${W}px">`;
}
function sheet(title, rows) {
  return `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;padding:18px;background:#d9d2c4;font:13px/1.4 -apple-system,"Apple SD Gothic Neo",sans-serif;color:#2a2622}
  h1{font-size:16px;margin:0 0 10px} .row{display:flex;gap:10px;margin-bottom:14px;align-items:flex-start}
  figure{margin:0} figcaption{margin-top:4px;color:#6b625a} .cell{display:block;border-radius:6px;background-color:#efe8da}
  </style><h1>${title}</h1>${rows
    .map((r) => `<div class="row">${r.map(([html, cap]) => `<figure>${html}<figcaption>${cap}</figcaption></figure>`).join('')}</div>`)
    .join('')}`;
}
async function renderSheet(name, html) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  // setContent(about:blank)에서는 file:// 이미지가 막힌다 → 파일로 써서 연다
  const f = path.join(OUT, `.${name}.html`);
  await writeFile(f, html);
  await page.goto(pathToFileURL(f).href, { waitUntil: 'load' });
  await sleep(300);
  await page.screenshot({ path: `${OUT}/${name}.jpg`, fullPage: true, type: 'jpeg', quality: 88 });
  await ctx.close();
  await rm(f);
}

const ref02a = refCrop(`${IMG}/02a-growth-orbit-strokes.png`, 560, 360, 300, 330);
const ref06c = refCrop(`${IMG}/06c-in-engine-target-final.png`, 170, 400, 400, 280);
await renderSheet(
  'compare-day7',
  sheet('7일차 — v1 기준(02a 가운데·06c 낮) vs 스파이크 02 vs 문법 A·B·C (L2, 확대)', [
    [
      [ref02a, '기준 02a 가운데'],
      [ref06c, '기준 06c 낮'],
      [prevCrop(`${PREV}/day7.png`, 1.25), '스파이크 02 (전)'],
    ],
    G.map((g) => [img(`${OUT}/zoom-day7-${g}.png`), `문법 ${g} · 기준 포즈`]),
    G.map((g) => [img(`${OUT}/zoom-day7-clumsy-${g}.png`), `문법 ${g} · 서툰 손 7획`]),
  ]),
);
await renderSheet(
  'compare-day0',
  sheet('0일차 빗 — 수정 전후 vs 기준 01e', [
    [
      [refCrop(`${IMG}/01e-day0-expressions-final.png`, 130, 190, 300, 210), '기준 01e 1번'],
      [prevCrop(`${PREV}/day0.png`, 1), '전 (스파이크 02)'],
      [img(`${OUT}/zoom-day0.png`), '후 (render-03)'],
    ],
  ]),
);
await renderSheet(
  'compare-extra',
  sheet('채택안 C — L3 진짜 감기, 밤', [
    [
      [img(`${OUT}/zoom-day7-L3-C.png`), 'C · 기준 포즈 · L3'],
      [img(`${OUT}/zoom-day7-clumsy-L3-C.png`), 'C · 서툰 손 · L3'],
    ],
    [
      [img(`${OUT}/zoom-night-C.png`), 'C · 밤 · 기준 포즈'],
      [img(`${OUT}/zoom-night-clumsy-C.png`), 'C · 밤 · 서툰 손'],
    ],
  ]),
);

await browser.close();
const bad = Object.entries(errors).filter(([, e]) => e.length);
console.log(bad.length ? `콘솔 에러: ${JSON.stringify(bad, null, 1)}` : '콘솔 에러 0');
