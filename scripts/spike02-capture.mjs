// 렌더 스파이크 02 캡처. 사용: node scripts/spike02-capture.mjs <stills|perf|motion|sheets|all> [이름 필터]
// 웹 서버: apps/mobile에서 `npx expo start --web --port 8082` (8081은 실기기 개발 서버용이라 쓰지 않는다).
// 모션은 가상 시계(?vclock=1)로 한 프레임(1/60초)씩 진행하며 캡처 → ffmpeg 60fps webm. 프레임 드롭 0.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:8082';
const OUT = path.resolve('docs/spike/render-02');
const FRAMES = process.env.FRAMES_DIR ?? path.join(os.tmpdir(), 'mong-render02-frames');
const [mode = 'all', filter = ''] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DT = 1000 / 60;

const SIZES = {
  '390': { viewport: { width: 390, height: 844 }, dpr: 2 },
  '360': { viewport: { width: 360, height: 800 }, dpr: 3 },
};

await mkdir(OUT, { recursive: true });
await mkdir(FRAMES, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const metrics = { base: BASE, gpu: null, stills: {}, perf: {}, motion: {}, contrast: null, seam: null };

async function open(query, size = '390', extra = {}) {
  const s = SIZES[size];
  const ctx = await browser.newContext({ viewport: s.viewport, deviceScaleFactor: extra.dpr ?? s.dpr });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  await page.goto(`${BASE}/?${query}&clean=1`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForSelector('canvas', { timeout: 60000 });
  await sleep(extra.settle ?? 1500);
  if (!metrics.gpu) {
    metrics.gpu = await page.evaluate(() => {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
  }
  return { ctx, page, errors };
}

const want = (name) => !filter || name.includes(filter);

/** 몸 좌표(W 단위, 핵 중심) → 화면 좌표. layout()과 같은 식: W = 폭 18%, 핵 중심 = 세로 62% (핵 크기 s) */
function toScreen(size, s = 1) {
  const { width, height } = SIZES[size].viewport;
  const w = width * 0.18;
  const groundY = height * 0.62 + 0.4 * w;
  const oy = groundY - 0.4 * s * w;
  return (x, y) => [width / 2 + x * w, oy + y * w];
}

// ───────── 정지 화면 ─────────
async function stills() {
  const list = [
    ['day0', 'screen=day&day=0'],
    ['day7', 'screen=day&day=7'],
    ['night', 'screen=night&day=7'],
    ['day7-bodyB', 'screen=day&day=7&body=B'],
  ];
  for (const [name, q] of list) {
    if (!want(name)) continue;
    const { ctx, page, errors } = await open(q + '&rm=1', '390', { settle: name === 'night' ? 1200 : 1500 });
    await page.screenshot({ path: `${OUT}/${name}.png` });
    metrics.stills[name] = { errors };
    await ctx.close();
  }
  // 이음매 2배 확대: DPR 4로 렌더한 7일차의 등(첫 두름이 핵과 겹치는 자리)을 잘라 A·B 나란히
  if (want('seam')) {
    const crops = [];
    for (const body of ['A', 'B']) {
      const { ctx, page } = await open(`screen=day&day=7&rm=1&body=${body}`, '390', { dpr: 4 });
      const to = toScreen('390', 1.25);
      const [x0, y0] = to(-0.78, -0.5);
      const clip = { x: x0, y: y0, width: 0.75 * 70.2, height: 0.95 * 70.2 };
      const file = `${FRAMES}/seam-${body}.png`;
      await page.screenshot({ path: file, clip });
      crops.push(file);
      // 몸 안쪽 가로선 휘도: 잘라 낸 확대 이미지에서 핵 경계를 가로지르는 줄(획이 덮은 등 → 핵 안)
      const prof = await linePixels(file, 0.42);
      const inside = prof.filter((v) => v < 60);
      metrics.seam ??= {};
      // 가장자리 테(안쪽 2pt = DPR4에서 8px)와 블러를 뺀 몸 안쪽만: 앞 14px 제외
      const core = inside.slice(14);
      const mean = core.reduce((a, b) => a + b, 0) / core.length;
      metrics.seam[body] = { insideSamples: inside.length, interiorSamples: core.length, min: +Math.min(...core).toFixed(1), max: +Math.max(...core).toFixed(1), mean: +mean.toFixed(1), rimMin: +Math.min(...inside.slice(0, 14)).toFixed(1) };
      await ctx.close();
    }
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', crops[0], '-i', crops[1], '-filter_complex', '[0][1]hstack=2,pad=iw+0:ih+0', `${OUT}/seam-zoom.png`]);
  }
}

/** PNG 한 가로줄(높이 비율 yf)의 휘도 배열 */
async function linePixels(file, yf) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('file://' + file);
  const out = await page.evaluate(async (yf) => {
    const img = document.querySelector('img');
    await img.decode();
    const c = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const y = Math.round(img.naturalHeight * yf);
    const d = g.getImageData(0, y, img.naturalWidth, 1).data;
    const r = [];
    for (let i = 0; i < d.length; i += 4) r.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    return r;
  }, yf);
  await ctx.close();
  return out;
}

// ───────── 성능(실시간 rAF) ─────────
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
    return { fps: +(d.length / (dur / 1000)).toFixed(1), p50ms: +q(0.5).toFixed(1), p95ms: +q(0.95).toFixed(1), maxMs: +d[d.length - 1].toFixed(1) };
  }, ms);
}

async function dragRealtime(page, pts, msPerStep) {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (let i = 1; i < pts.length; i++) {
    await page.mouse.move(pts[i][0], pts[i][1]);
    await sleep(msPerStep);
  }
  await page.mouse.up();
}

async function perf() {
  const cases = [
    ['day7-A', 'screen=day&day=7&body=A'],
    ['day7-B', 'screen=day&day=7&body=B'],
    ['night', 'screen=night&day=7'],
    ['night-oct2', 'screen=night&day=7&oct=2'],
    ['stroke-drawing-A', 'screen=stroke&day=4&body=A'],
  ];
  for (const [cond, dpr, cpu] of [['dpr2-cpu1', 2, 1], ['dpr3-cpu4', 3, 4]]) {
    metrics.perf[cond] = {};
    for (const [name, q] of cases) {
      if (!want(name)) continue;
      const { ctx, page } = await open(q, '390', { dpr });
      const cdp = await ctx.newCDPSession(page);
      if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
      if (name.startsWith('stroke')) {
        const to = toScreen('390', 1.2);
        const pts = [];
        for (let i = 0; i <= 120; i++) {
          const a = (200 + i * 1.2) * (Math.PI / 180);
          const r = 0.7 + 0.25 * Math.sin(i / 20);
          pts.push(to(Math.sin(a) * r, -Math.cos(a) * r));
        }
        const m = measureFps(page, 2400);
        await dragRealtime(page, pts, 16);
        metrics.perf[cond][name] = await m;
      } else {
        metrics.perf[cond][name] = await measureFps(page, 4000);
      }
      await ctx.close();
    }
  }
}

// ───────── 모션(가상 시계) ─────────
async function stepFrame(page) {
  await page.evaluate((dt) => {
    window.__step(dt);
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, DT);
}

async function recordScenario(name, size, query, durationS, script) {
  const dir = path.join(FRAMES, `${name}-${size}`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const { ctx, page, errors } = await open(query + '&vclock=1', size, { settle: 1800 });
  const n = Math.round(durationS * 60);
  const t0 = Date.now();
  for (let f = 0; f < n; f++) {
    await script(page, f, f / 60);
    await stepFrame(page);
    await page.screenshot({ path: path.join(dir, `${String(f).padStart(4, '0')}.jpg`), quality: 88, type: 'jpeg' });
  }
  await ctx.close();
  const file = `${OUT}/${name}-${size}.webm`;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '60', '-i', path.join(dir, '%04d.jpg'), '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-row-mt', '1', '-pix_fmt', 'yuv420p', file]);
  // 연속 프레임 시트: 24장 균등(8×3)
  const step = Math.max(1, Math.floor(n / 24));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '60', '-i', path.join(dir, '%04d.jpg'), '-vf', `select='not(mod(n\\,${step}))',scale=240:-1,tile=8x3:padding=4:margin=4:color=0x222222`, '-frames:v', '1', '-q:v', '3', `${OUT}/sheet-${name}-${size}.jpg`]);
  metrics.motion[`${name}-${size}`] = { frames: n, seconds: durationS, wallSeconds: Math.round((Date.now() - t0) / 1000), errors, sheetEveryNthFrame: step };
}

/** 탭 하나(지정 프레임에서) */
function tapAt(frame, xy) {
  return async (page, f) => {
    if (f === frame) await page.mouse.click(xy[0], xy[1]);
  };
}

/** 획 일정: [{ startS, pts(W, 핵 중심), durS }] → 프레임마다 한 점(60Hz 입력) */
function strokesScript(size, strokes) {
  const plans = strokes.map((st) => {
    const frames = Math.max(2, Math.round(st.durS * 60));
    const start = Math.round(st.startS * 60);
    return { start, frames, st };
  });
  return async (page, f) => {
    for (const p of plans) {
      const k = f - p.start;
      if (k < 0 || k > p.frames) continue;
      // 그 순간의 핵 크기 기준(획 수가 늘수록 커진다)
      const to = toScreen(size, p.st.s);
      const u = k / p.frames;
      const e = u * u * (3 - 2 * u);
      const [x, y] = to(...sample(p.st.pts, e));
      if (k === 0) {
        await page.mouse.move(x, y);
        await page.mouse.down();
      } else {
        await page.mouse.move(x, y);
        if (k === p.frames) await page.mouse.up();
      }
    }
  };
}

function sample(pts, u) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const target = L[L.length - 1] * u;
  let i = 1;
  while (i < L.length - 1 && L[i] < target) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const t = (target - L[i - 1]) / Math.max(L[i] - L[i - 1], 1e-9);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

const polar = (deg, r) => [Math.sin((deg * Math.PI) / 180) * r, -Math.cos((deg * Math.PI) / 180) * r];
/** 연구 자극물 획 3개(곡선·꺾임·긴 감기). 곡선은 꼬리 자리(200~250°), 꺾임은 정수리(금지)에 긋는다 */
const STUDY = [
  { name: '곡선(꼬리 자리)', startS: 0.8, durS: 0.9, s: 1.0, pts: Array.from({ length: 24 }, (_, i) => polar(212 + i * 2.6, 0.62 + 0.14 * Math.sin((i / 23) * Math.PI))) },
  { name: '꺾임(정수리)', startS: 5.2, durS: 0.7, s: 1.045, pts: [[-0.3, -0.56], [-0.02, -0.8], [0.06, -0.8], [0.28, -0.58]] },
  { name: '긴 감기', startS: 9.4, durS: 1.6, s: 1.088, pts: Array.from({ length: 40 }, (_, i) => polar(70 + i * 3.4, 0.64 + 0.22 * (i / 39) + 0.03 * Math.sin(i / 3))) },
];

async function motion() {
  for (const size of ['390', '360']) {
    const to = toScreen(size, 1);
    const { width, height } = SIZES[size].viewport;
    if (want('motion-01-eye-main')) await recordScenario('motion-01-eye', size, 'screen=intro', 16, tapAt(9 * 60, to(0.05, 0.05)));
    if (want('motion-01-eye-interrupt'))
      await recordScenario('motion-01-eye-interrupt', size, 'screen=intro', 9, tapAt(60, [width * 0.62, height * 0.5]));
    if (want('motion-01-eye-rm')) await recordScenario('motion-01-eye-rm', size, 'screen=intro&rm=1', 16, tapAt(9 * 60, to(0.05, 0.05)));
    for (const L of [1, 2, 3]) {
      if (want(`motion-02-attach-L${L}`)) await recordScenario(`motion-02-attach-L${L}`, size, `screen=stroke&day=0&attach=${L}&study=attach`, 15, strokesScript(size, STUDY));
    }
    if (want('motion-02-attach-rm')) await recordScenario('motion-02-attach-rm', size, 'screen=stroke&day=0&attach=2&study=attach&rm=1', 15, strokesScript(size, STUDY));
  }
}

// ───────── 대비(WCAG) ─────────
async function contrast() {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 1700 } });
  const page = await ctx.newPage();
  await page.goto('file://' + `${OUT}/night.png`);
  const to = toScreen('390', 1.25);
  const pick = (x, y) => [x * 2, y * 2];
  const pts = {
    body: pick(...to(0.0, 0.25)),
    body2: pick(...to(-0.25, -0.15)),
    eyeL: pick(...to(-0.21 + 0.0, 0.096 * 1.25 + 0.025)),
    bg: pick(...to(1.6, -0.8)),
  };
  const res = await page.evaluate(async (pts) => {
    const img = document.querySelector('img');
    await img.decode();
    const c = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const lin = (v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const L = (d) => 0.2126 * lin(d[0]) + 0.7152 * lin(d[1]) + 0.0722 * lin(d[2]);
    const out = {};
    for (const [k, [x, y]] of Object.entries(pts)) {
      const d = g.getImageData(Math.round(x) - 2, Math.round(y) - 2, 5, 5).data;
      const acc = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) for (let j = 0; j < 3; j++) acc[j] += d[i + j] / 25;
      out[k] = { rgb: acc.map(Math.round), L: L(acc) };
    }
    // 눈: 왼눈 주변 12×8 상자에서 가장 밝은 픽셀
    const [ex, ey] = pts.eyeL;
    const e = g.getImageData(Math.round(ex) - 14, Math.round(ey) - 12, 28, 24).data;
    let best = null;
    for (let i = 0; i < e.length; i += 4) {
      const p = [e[i], e[i + 1], e[i + 2]];
      if (!best || L(p) > L(best)) best = p;
    }
    out.eye = { rgb: best, L: L(best) };
    const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    out.ratios = { bodyVsBg: ratio(out.body.L, out.bg.L), eyeVsBody: ratio(out.eye.L, out.body.L) };
    return out;
  }, pts);
  metrics.contrast = res;
  await ctx.close();
}

// ───────── 비교 시트(좌: 기준, 우: 렌더) ─────────
async function sheets() {
  const IMG = path.resolve('docs/creative/v1/img');
  const rows = [
    ['day0', '0일차 낮', ['01e-day0-expressions-final.png', '06c-in-engine-target-final.png'], ['day0.png'], '비율·가장자리·눈·빗'],
    ['day7', '7일차 낮', ['06c-in-engine-target-final.png', '02a-growth-orbit-strokes.png'], ['day7.png', 'seam-zoom.png'], '획이 몸을 감싸는가, 핵 면적 75% 이상'],
    ['layout', '화면 구성', ['03a-home-day-margin.png', '06a-in-engine-flat-vector.png'], ['day7.png'], '여백 60%, 몽망이 세로 58~66%, 사물 3개 하단 22%'],
    ['night', '밤', ['04a-home-night-water.png', '06c-in-engine-target-final.png'], ['night.png'], '대비, 감은 눈, 무섭지 않음'],
  ];
  const ctx = await browser.newContext({ viewport: { width: 1800, height: 1000 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const [key, title, refs, mine, q] of rows) {
    if (!want(key)) continue;
    const cell = (src, label) => `<figure><img src="file://${src}"><figcaption>${label}</figcaption></figure>`;
    const html = `<html><body style="margin:0;background:#2b2a28;color:#eee;font:15px -apple-system,'Apple SD Gothic Neo',sans-serif">
      <div style="padding:14px 20px;font-size:20px">${title} — 같은 생물인가 / 무엇이 다른가 / 금지표(아트 1-4)에 걸리는 것이 있는가 · 볼 것: ${q}</div>
      <div style="display:flex;gap:18px;padding:0 20px 20px;align-items:flex-start">
        <section style="flex:1"><h3 style="margin:4px 0 8px;color:#bbb">기준(v1 채택 이미지)</h3><div style="display:flex;gap:10px">${refs.map((r) => cell(`${IMG}/${r}`, r)).join('')}</div></section>
        <section style="flex:1"><h3 style="margin:4px 0 8px;color:#bbb">렌더(스파이크 02, 웹 CanvasKit)</h3><div style="display:flex;gap:10px">${mine.map((r) => cell(`${OUT}/${r}`, r)).join('')}</div></section>
      </div>
      <style>figure{margin:0;flex:1}img{width:100%;max-height:820px;object-fit:contain;background:#111;display:block}figcaption{color:#999;font-size:12px;margin-top:4px}</style></body></html>`;
    const tmp = path.join(FRAMES, `_cmp-${key}.html`);
    await writeFile(tmp, html);
    await page.goto('file://' + tmp);
    await sleep(400);
    await page.screenshot({ path: `${OUT}/compare-${key}.jpg`, fullPage: true, quality: 86, type: 'jpeg' });
  }
  await ctx.close();
}

if (mode === 'stills' || mode === 'all') await stills();
if (mode === 'contrast' || mode === 'stills' || mode === 'all') await contrast();
if (mode === 'perf' || mode === 'all') await perf();
if (mode === 'motion' || mode === 'all') await motion();
if (mode === 'sheets' || mode === 'all') await sheets();
await browser.close();

const mfile = `${OUT}/metrics-${mode}${filter ? '-' + filter : ''}.json`;
await writeFile(mfile, JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 2));
void readdir;
