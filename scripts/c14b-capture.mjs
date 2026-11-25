// C14b 꿈 모티프 붓 형상 15 캡처(웹): 공유 이미지 함수(renderDreamCardImage) 결과 PNG를 모아 시트로 남긴다.
//  - sheet-15.png    새 15개(구도 a, 성향 b) 5×3 — 한 장에 모아 보기
//  - sheet-comp.png  새 15개 × 구도 a·b·c(성향 a·b·c를 번갈아) — 자리·뒤집기·잘림 확인
//  - sheet-mixed.png 기존 10 + 새 15 = 25장(5×5) — 한 화면에 섞였을 때
// 사용: node scripts/c14b-capture.mjs [baseUrl=http://localhost:8147] [outDir=docs/app/c14b]
// 개발 서버(expo start --web)는 metro 감시가 멈추는 일이 있어 캡처 전에 `-c`로 새로 띄운다(11-25 확인: 고친 파일이 번들에 안 들어감).
import { chromium } from 'playwright';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:8147';
const OUT = path.resolve(process.argv[3] ?? 'docs/app/c14b');
const TMP = path.join(OUT, '.cards');
const OLD = ['near-alone.quilt', 'near-alone.teacup', 'near-with.window-hand', 'near-with.teacup-two', 'far-alone.mountain', 'far-alone.sea', 'far-with.stars-drops', 'far-with.sea-hand', 'center.rain', 'center.moon'];
const NEW = [
  'near-alone.inkstone',
  'near-alone.washing-line',
  'near-alone.sprout',
  'near-with.umbrella',
  'near-with.letter',
  'near-with.palm',
  'far-alone.paper-boat',
  'far-alone.kite',
  'far-alone.path',
  'far-with.geese',
  'far-with.star-bridge',
  'far-with.stepping-stones',
  'center.leaf',
  'center.snow',
  'center.wind',
];
await mkdir(TMP, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

async function grab(motif, t, comp) {
  const file = `${motif}__${t}${comp}.png`;
  await page.goto(`${BASE}/?screen=card&export=1&motif=${motif}&t=${t}&seed=7&comp=${comp}`, { waitUntil: 'networkidle', timeout: 300000 });
  await page.waitForFunction(() => window.__dreamPng, null, { timeout: 180000 });
  const b64 = await page.evaluate(() => window.__dreamPng);
  await writeFile(path.join(TMP, file), Buffer.from(b64, 'base64'));
  console.log('saved', file);
  return file;
}

async function sheet(name, cells, cols, w) {
  const html = `<html><body style="margin:0;background:#141A2C;color:#E9E2D2;font:13px -apple-system,sans-serif">
<div style="display:grid;grid-template-columns:repeat(${cols},${w}px);gap:10px;padding:14px">
${cells.map(([f, label]) => `<div><img src="file://${path.join(TMP, f)}" style="width:${w}px;display:block;border-radius:2px"><div style="padding:4px 0 2px">${label}</div></div>`).join('')}
</div></body></html>`;
  const htmlPath = path.join(TMP, `${name}.html`);
  await writeFile(htmlPath, html);
  const p = await ctx.newPage();
  await p.setViewportSize({ width: cols * (w + 10) + 28, height: 800 });
  await p.goto(`file://${htmlPath}`);
  await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  await p.close();
}

const a = [];
for (const m of NEW) a.push([await grab(m, 'b', 0), m]);
await sheet('sheet-15', a, 5, 300);

const comp = [];
for (const [i, m] of NEW.entries()) for (const c of [0, 1, 2]) comp.push([await grab(m, ['a', 'b', 'c'][(i + c) % 3], c), `${m} · ${'abc'[c]}`]);
await sheet('sheet-comp', comp, 6, 220);

const olds = [];
for (const m of OLD) olds.push([await grab(m, 'b', 0), `${m} (기존)`]);
// 한 화면에 섞인 모습: 줄마다 기존 2 + 새 3, 자리를 줄마다 밀어 섞는다
const news = [...a];
const mixed = Array.from({ length: 25 }, (_, i) => ((i + Math.floor(i / 5) * 2) % 5 < 2 ? olds : news).shift());
await sheet('sheet-mixed', mixed, 5, 220);

console.log('errors', errors.slice(0, 5));
await browser.close();
await rm(TMP, { recursive: true, force: true });
