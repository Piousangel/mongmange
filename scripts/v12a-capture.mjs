// V12a 2.5D 몸 빛 캡처(웹): 낮·밤 × 체형 3 × 몸 폭 120·64·36pt 비교 그리드(행 = 빛 끔 + 확산 세기 후보 3), 120pt 확대 띠,
// 그리고 성능 비교(120pt 몽망이 N마리를 매 프레임 흔들어 다시 그릴 때 빛 끔·켬 프레임 간격).
// 사용: node scripts/v12a-capture.mjs [baseUrl=http://localhost:8147] [--no-perf] → docs/app/v12a/
// 웹 캡처는 질감 판정에 쓰지 않는다(D-04) — 실기기(S25·중급 Android) 판정은 V20.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const BASE = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:8147';
const PERF = !args.includes('--no-perf');
const OUT = path.resolve('docs/app/v12a');
await mkdir(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const errors = [];
const VP = { width: 1360, height: 820 };

async function open(query, vp = VP, scale = 2) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: scale, locale: 'ko-KR' });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${query}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${query}: ${String(e)}`));
  await page.goto(`${BASE}/?screen=m1&${query}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForSelector('[data-testid="m1-board"]', { timeout: 120000 });
  await sleep(2500);
  return { ctx, page };
}

// 1) 비교 그리드 + 120pt 확대 띠(체형마다 120pt 칸 하나 × 행 4). 칸 폭 = 몸 폭 × unit(보드와 같은 식)
const sizes = [120, 64, 36];
const unit = (VP.width - 90 - 8) / (3 * sizes.reduce((a, b) => a + b, 0));
const group = sizes.reduce((a, b) => a + b, 0) * unit;
for (const [night, tag] of [[0, 'day'], [1, 'night']]) {
  const { ctx, page } = await open(`view=v12a&night=${night}`);
  await page.screenshot({ path: `${OUT}/grid-${tag}.png` });
  for (let b = 0; b < 3; b++) {
    await page.screenshot({ path: `${OUT}/zoom120-${tag}-body${b}.png`, clip: { x: 90 + b * group, y: 0, width: 120 * unit, height: VP.height } });
  }
  console.log('saved', tag);
  await ctx.close();
}

// 2) 성능: 같은 보드를 빛 끔·켬으로 번갈아 3번씩, 워밍업 3초 뒤 6초 동안 rAF 간격(ms)
async function frameStats(light, cells) {
  const { ctx, page } = await open(`view=v12aperf&light=${light}&cells=${cells}`, { width: 1280, height: 800 }, 2);
  await sleep(3000);
  const ints = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const out = [];
        let last = performance.now();
        const end = last + 6000;
        const step = (t) => {
          out.push(t - last);
          last = t;
          if (t < end) requestAnimationFrame(step);
          else resolve(out);
        };
        requestAnimationFrame(step);
      }),
  );
  await ctx.close();
  const s = [...ints].sort((a, b) => a - b);
  const mean = ints.reduce((a, b) => a + b, 0) / ints.length;
  return { light, cells, frames: ints.length, meanMs: +mean.toFixed(2), p50: +s[s.length >> 1].toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2) };
}
const perf = [];
for (const cells of PERF ? [12, 36] : []) {
  for (let k = 0; k < 3; k++) {
    for (const light of [0, 1]) {
      const r = await frameStats(light, cells);
      perf.push(r);
      console.log('perf', JSON.stringify(r));
    }
  }
}

if (PERF) await writeFile(`${OUT}/perf.json`, JSON.stringify({ note: '웹 Chromium(headless, ANGLE) rAF 간격 — 기기 GPU 시간이 아니다. 끔·켬을 번갈아 3번', viewport: '1280x800@2x', perf }, null, 1));
await writeFile(`${OUT}/errors.json`, JSON.stringify(errors, null, 1));
console.log('errors', errors.length);
await browser.close();
