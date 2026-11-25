// 꿈 조합 v2 시제품용 '원본 → 알파 조각' 손질(탐색 전용, 앱 에셋 아님).
// scripts/motif-raster.mjs의 ①~④(종이 제거·밝기→알파·종이 결 지우기·최대 농도 0.72)를 같은 식으로 따른다.
// 실행: node docs/design/dream/2026-11-25-dream-compose-v2/prototype/tools/pieces.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '../../../../../..');
const OUT = path.resolve(DIR, '../pieces');
const SRC = {
  'x.path': 'docs/creative/c14b-ref/path-f3.jpg', // 굽은 길(나들이) — C14b 판에 안 들어간 원본
  'x.dewdrop': 'docs/creative/meal-ref/dewdrop-p1.jpg', // 연적 물방울 — 간식 장식 층(먹는 그림 아님)
};
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [id, rel] of Object.entries(SRC)) {
  const b64 = readFileSync(path.join(ROOT, rel)).toString('base64');
  const png = await page.evaluate(async ({ b64 }) => {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${b64}`;
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = new OffscreenCanvas(W, H);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H);
    const lum = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) lum[i] = 0.299 * d.data[i * 4] + 0.587 * d.data[i * 4 + 1] + 0.114 * d.data[i * 4 + 2];
    const border = [];
    const bw = Math.round(W * 0.02);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < bw || y < bw || x >= W - bw || y >= H - bw) border.push(lum[y * W + x]);
    border.sort((a, b) => a - b);
    const paper = border[border.length >> 1];
    const sorted = Array.from(lum).sort((a, b) => a - b);
    const ink = sorted[Math.floor(sorted.length * 0.005)];
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    const a = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      let v = Math.min(1, Math.max(0, (paper - lum[i]) / (paper - ink)));
      v = v < 0.06 ? 0 : (v - 0.06) / 0.94;
      a[i] = v * 0.72;
      if (v > 0.05) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    const pad = Math.round(Math.max(W, H) * 0.03);
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const out = new OffscreenCanvas(cw, ch);
    const og = out.getContext('2d');
    const od = og.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const o = (y * cw + x) * 4;
      od.data[o] = 0; od.data[o + 1] = 0; od.data[o + 2] = 0;
      od.data[o + 3] = Math.round(a[(y + y0) * W + (x + x0)] * 255);
    }
    og.putImageData(od, 0, 0);
    const s = 448 / Math.max(cw, ch);
    const fin = new OffscreenCanvas(Math.round(cw * s), Math.round(ch * s));
    fin.getContext('2d').drawImage(out, 0, 0, fin.width, fin.height);
    const blob = await fin.convertToBlob({ type: 'image/webp', quality: 0.8 });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (const b of buf) bin += String.fromCharCode(b);
    return btoa(bin);
  }, { b64 });
  writeFileSync(path.join(OUT, `${id}.webp`), Buffer.from(png, 'base64'));
  console.log('saved', id);
}
await browser.close();
