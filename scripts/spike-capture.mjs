// 렌더 스파이크 캡처: 스크린샷 + 연속 프레임 + 영상 + rAF 기반 fps
// 사용: node scripts/spike-capture.mjs [baseUrl] (기본 http://localhost:8099)
import { chromium } from 'playwright';
import { mkdir, writeFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:8099';
const OUT = path.resolve('docs/spike/render-01');
const VIEW = { width: 390, height: 844 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await rm(OUT + '/frames', { recursive: true, force: true });
await mkdir(OUT + '/frames', { recursive: true });
await mkdir(OUT + '/video', { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});

const results = { gpu: null, scenes: {} };

async function measureFps(page, ms = 4000) {
  return page.evaluate(async (dur) => {
    const ts = [];
    await new Promise((res) => {
      const t0 = performance.now();
      const f = (t) => {
        ts.push(t);
        if (t - t0 < dur) requestAnimationFrame(f);
        else res();
      };
      requestAnimationFrame(f);
    });
    const d = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b);
    const q = (p) => d[Math.min(d.length - 1, Math.floor(d.length * p))];
    return { frames: d.length, fps: +(d.length / (dur / 1000)).toFixed(1), p50ms: +q(0.5).toFixed(1), p95ms: +q(0.95).toFixed(1), maxMs: +d[d.length - 1].toFixed(1) };
  }, ms);
}

async function open(name, query) {
  const ctx = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 2,
    recordVideo: { dir: OUT + '/video/tmp-' + name, size: VIEW },
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?${query}&clean=1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await sleep(1200);
  if (!results.gpu) {
    results.gpu = await page.evaluate(() => {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return 'no-webgl';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    });
  }
  return { ctx, page, errors };
}

async function frames(page, prefix, n, gap) {
  for (let i = 0; i < n; i++) {
    await page.screenshot({ path: `${OUT}/frames/${prefix}-${String(i).padStart(2, '0')}.jpg`, quality: 82 });
    await sleep(gap);
  }
}

async function finish(name, ctx, page, errors, extra = {}) {
  const fps = await measureFps(page);
  await ctx.close();
  const dir = OUT + '/video/tmp-' + name;
  const [f] = await readdir(dir);
  if (f) await rename(path.join(dir, f), `${OUT}/video/${name}.webm`);
  await rm(dir, { recursive: true, force: true });
  results.scenes[name] = { fps, errors, ...extra };
}

// 손가락 대신 마우스로 획 긋기(steps 사이 대기로 속도 조절)
async function drag(page, pts, msPerStep) {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const steps = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / 6));
    for (let s = 1; s <= steps; s++) {
      await page.mouse.move(ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps);
      await sleep(msPerStep);
    }
  }
  await page.mouse.up();
}

// (a) 낮: 0일차, 7일차
for (const day of [0, 7]) {
  const name = `a-day${day}`;
  const { ctx, page, errors } = await open(name, `screen=a&day=${day}`);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  // 4.2초 주기 깜빡임(2.6초 지점)을 덮도록 120ms 간격 24장
  await frames(page, name, 24, 60);
  await finish(name, ctx, page, errors);
}

// (b) 획 긋기
{
  const name = 'b-stroke';
  const { ctx, page, errors } = await open(name, 'screen=b');
  await page.screenshot({ path: `${OUT}/${name}-before.png` });
  const cx = 390 * 0.52;
  const cy = 844 * 0.41;
  // 1) 몸 왼쪽에서 천천히, 꾹(느림 = 굵고 촉촉)
  await drag(page, [[cx - 50, cy + 120], [cx - 95, cy + 150], [cx - 120, cy + 200]], 28);
  await sleep(500);
  await page.screenshot({ path: `${OUT}/frames/b-stroke-00.jpg`, quality: 82 });
  // 2) 빠르게 휙(빠름 = 가늘고 비백)
  await drag(page, [[cx - 30, cy + 40], [cx - 90, cy + 20], [cx - 150, cy - 10]], 4);
  await sleep(150);
  await page.screenshot({ path: `${OUT}/frames/b-stroke-01.jpg`, quality: 82 });
  // 3) 몸에서 떨어진 곳에서 시작 → 몸으로 끌려와 붙는다(붙는 과정 연속 캡처)
  await drag(page, [[cx + 110, cy + 260], [cx + 140, cy + 230], [cx + 150, cy + 190]], 14);
  await frames(page, 'b-stroke-snap', 6, 30);
  await sleep(800);
  await page.screenshot({ path: `${OUT}/b-stroke-after.png` });
  // 그리는 도중 fps: 긋는 동안 rAF 간격
  const during = page.evaluate(async () => {
    const ts = [];
    const t0 = performance.now();
    await new Promise((res) => {
      const f = (t) => { ts.push(t); if (t - t0 < 2500) requestAnimationFrame(f); else res(); };
      requestAnimationFrame(f);
    });
    const d = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b);
    return { fps: +(d.length / 2.5).toFixed(1), p95ms: +d[Math.floor(d.length * 0.95)].toFixed(1) };
  });
  await drag(page, [[cx - 20, cy + 230], [cx - 100, cy + 280], [cx - 160, cy + 250], [cx - 170, cy + 200], [cx - 140, cy + 180]], 8);
  const drawingFps = await during;
  await sleep(600);
  await page.screenshot({ path: `${OUT}/frames/b-stroke-02.jpg`, quality: 82 });
  await finish(name, ctx, page, errors, { drawingFps });
}

// (c) 밤 수면
{
  const name = 'c-night';
  const { ctx, page, errors } = await open(name, 'screen=c');
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await frames(page, name, 8, 250);
  await page.mouse.click(140, 600);
  await frames(page, 'c-night-touch', 8, 120);
  await page.mouse.click(260, 300);
  await sleep(500);
  await page.screenshot({ path: `${OUT}/${name}-touch.png` });
  await finish(name, ctx, page, errors);
}

// 부하 조건: CPU 4배 느리게(중급 Android JS 흉내) + DPR 3(고해상도 폰 픽셀 수)
{
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const stress = {};
  for (const [name, q] of [['a-day7', 'screen=a&day=7'], ['c-night', 'screen=c'], ['b-stroke', 'screen=b']]) {
    await page.goto(`${BASE}/?${q}&clean=1`, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas');
    await sleep(1500);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    if (name === 'b-stroke') {
      const cx = 390 * 0.52;
      const cy = 844 * 0.41;
      const m = measureFps(page, 2500);
      await drag(page, [[cx - 20, cy + 230], [cx - 100, cy + 280], [cx - 160, cy + 250], [cx - 170, cy + 200], [cx - 140, cy + 180]], 8);
      stress[name + '-drawing'] = await m;
    } else {
      stress[name] = await measureFps(page, 3000);
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  results.stress_dpr3_cpu4x = stress;
  await ctx.close();
}

// 연속 프레임 콘택트 시트(Read로 한 번에 보기 위함)
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const all = (await readdir(OUT + '/frames')).filter((f) => f.endsWith('.jpg')).sort();
  const groups = {};
  for (const f of all) {
    const key = f.replace(/-\d\d\.jpg$/, '');
    (groups[key] ??= []).push(f);
  }
  for (const [key, files] of Object.entries(groups)) {
    const cols = Math.min(files.length, 8);
    const html = `<html><body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px">${files
      .map((f) => `<div style="position:relative"><img src="file://${OUT}/frames/${f}" style="width:100%;display:block"><span style="position:absolute;top:2px;left:4px;color:#f0f;font:12px monospace">${f.match(/(\d\d)\.jpg$/)[1]}</span></div>`)
      .join('')}</body></html>`;
    const tmp = `${OUT}/frames/_${key}.html`;
    await writeFile(tmp, html);
    await page.goto('file://' + tmp);
    await sleep(300);
    await page.screenshot({ path: `${OUT}/sheet-${key}.jpg`, fullPage: true, quality: 85 });
    await rm(tmp);
  }
  await ctx.close();
}

await browser.close();
await writeFile(`${OUT}/metrics.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
