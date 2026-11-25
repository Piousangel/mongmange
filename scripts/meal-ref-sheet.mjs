// V30 선행 밥·간식 탐색: 비교 시트 만들기(Playwright 캔버스, 결과는 PNG).
// 사용:
//   node scripts/meal-ref-sheet.mjs blind <출력 폴더> <매핑 JSON>   — 품목별 후보 시트(A~D 이름, 모델 정보 없음). 매핑 JSON = {품목: {A: 파일이름, ...}}
//   node scripts/meal-ref-sheet.mjs picks <PICKS JSON>              — 고른 안 비교 시트 docs/creative/meal-ref/sheet.png
//        PICKS JSON = [{"item": "clear-ink", "file": "clear-ink-f2", "label": "밥 · 맑은 먹"}, ...]
// 다크 칸은 원본을 곱하지 않고, 손질 1차(가장자리 중앙값 = 종이, 가장 짙은 0.5% = 먹 → 밝기를 알파로, 0.06 미만 0, 최대 0.72)로 뽑은
// 알파를 밤 글자색 #E9E2D2로 칠한다(C14b motif-raster.mjs ①~④와 같은 순서). 밤 바탕은 아트 바이블 4절 `bg` #141A2C.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const [mode, a1, a2] = process.argv.slice(2);
const SRC = path.resolve('docs/creative/meal-ref');
const b64 = (name) => readFileSync(path.join(SRC, `${name}.jpg`)).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<canvas id=c></canvas>');

async function draw(spec) {
  return page.evaluate(async (spec) => {
    const load = async (d) => {
      const img = new Image();
      img.src = `data:image/jpeg;base64,${d}`;
      await img.decode();
      return img;
    };
    // 손질 1차: 알파 캔버스(먹 한 색)
    function alphaCanvas(img, color, cap = 0.72) {
      const W = img.naturalWidth, H = img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, W, H);
      const L = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) L[i] = 0.2126 * d.data[i * 4] + 0.7152 * d.data[i * 4 + 1] + 0.0722 * d.data[i * 4 + 2];
      const edge = [];
      for (let i = 0; i < W; i += 4) edge.push(L[i], L[(H - 1) * W + i]);
      for (let j = 0; j < H; j += 4) edge.push(L[j * W], L[j * W + W - 1]);
      edge.sort((p, q) => p - q);
      const paper = edge[edge.length >> 1];
      const s = Array.from(L).sort((p, q) => p - q);
      const ink = s[Math.floor(s.length * 0.005)];
      const [r, g, b] = color;
      for (let i = 0; i < W * H; i++) {
        let a = Math.min(1, Math.max(0, (paper - L[i]) / Math.max(1, paper - ink)));
        a = a < 0.06 ? 0 : (a - 0.06) / 0.94;
        d.data[i * 4] = r; d.data[i * 4 + 1] = g; d.data[i * 4 + 2] = b; d.data[i * 4 + 3] = Math.round(a * cap * 255);
      }
      x.putImageData(d, 0, 0);
      return c;
    }
    const cv = document.getElementById('c');
    cv.width = spec.W; cv.height = spec.H;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#EFE8DA';
    ctx.fillRect(0, 0, spec.W, spec.H);
    for (const op of spec.ops) {
      if (op.rect) { ctx.fillStyle = op.rect.fill; ctx.fillRect(op.rect.x, op.rect.y, op.rect.w, op.rect.h); continue; }
      if (op.text) { ctx.fillStyle = op.text.fill || '#2A2622'; ctx.font = op.text.font || '20px sans-serif'; ctx.fillText(op.text.s, op.text.x, op.text.y); continue; }
      const img = await load(op.img);
      if (op.alpha) {
        const ac = alphaCanvas(img, op.alpha);
        ctx.drawImage(ac, op.x, op.y, op.s, op.s);
      } else ctx.drawImage(img, op.x, op.y, op.s, op.s);
    }
    return cv.toDataURL('image/png').split(',')[1];
  }, spec);
}

const DARK = '#141A2C';
const NIGHT_INK = [0xe9, 0xe2, 0xd2];

if (mode === 'blind') {
  const outDir = path.resolve(a1);
  mkdirSync(outDir, { recursive: true });
  const map = JSON.parse(readFileSync(a2, 'utf8'));
  for (const [item, letters] of Object.entries(map)) {
    const ks = Object.keys(letters);
    const ops = [];
    ks.forEach((k, i) => {
      const x = 20 + i * 420;
      ops.push({ text: { s: k, x, y: 34, font: 'bold 28px sans-serif' } });
      ops.push({ img: b64(letters[k]), x, y: 50, s: 400 });
      ops.push({ img: b64(letters[k]), x, y: 470, s: 128 });
      ops.push({ img: b64(letters[k]), x: x + 150, y: 470, s: 64 });
      ops.push({ rect: { x: x + 230, y: 470, w: 170, h: 128, fill: DARK } });
      ops.push({ img: b64(letters[k]), alpha: NIGHT_INK, x: x + 238, y: 502, s: 64 });
    });
    const png = await draw({ W: 20 + ks.length * 420, H: 620, ops });
    writeFileSync(path.join(outDir, `${item}.png`), Buffer.from(png, 'base64'));
    console.log('blind', item);
  }
} else if (mode === 'picks') {
  const picks = JSON.parse(readFileSync(a1, 'utf8'));
  const colX = [220, 500, 660, 760, 1040];
  const rowH = 300;
  const ops = [
    { text: { s: '원본(축소)', x: colX[0], y: 30 } },
    { text: { s: '128pt', x: colX[1], y: 30 } },
    { text: { s: '64pt', x: colX[2], y: 30 } },
    { rect: { x: 750, y: 0, w: 520, h: 50 + picks.length * rowH, fill: DARK } },
    { text: { s: '다크 128pt (알파 손질 1차)', x: colX[3], y: 30, fill: '#E9E2D2' } },
    { text: { s: '다크 64pt', x: colX[4] + 40, y: 30, fill: '#E9E2D2' } },
  ];
  picks.forEach((p, r) => {
    const y = 50 + r * rowH;
    const d = b64(p.file);
    ops.push({ text: { s: p.label, x: 16, y: y + 120, font: '22px sans-serif' } });
    ops.push({ text: { s: p.file, x: 16, y: y + 150, font: '16px monospace', fill: '#6B625A' } });
    ops.push({ img: d, x: colX[0], y: y + 10, s: 256 });
    ops.push({ img: d, x: colX[1], y: y + 74, s: 128 });
    ops.push({ img: d, x: colX[2], y: y + 106, s: 64 });
    ops.push({ img: d, alpha: NIGHT_INK, x: colX[3] + 10, y: y + 74, s: 128 });
    ops.push({ img: d, alpha: NIGHT_INK, x: colX[4] + 60, y: y + 106, s: 64 });
  });
  const png = await draw({ W: 1280, H: 60 + picks.length * rowH, ops });
  writeFileSync(path.join(SRC, 'sheet.png'), Buffer.from(png, 'base64'));
  console.log('sheet', path.join(SRC, 'sheet.png'));
}
await browser.close();
