// C14b 4차 혼합안(C): Gemini 사물 원본 → 앱 에셋 '사물 한 겹' 손질 파이프라인(재현 가능, 아트 리뷰 3차 3-3 ①~⑤).
//  ① 배경(한지) 제거: 가장자리 픽셀의 중앙값 = 종이 밝기, 가장 짙은 0.5% = 먹 밝기
//  ② 밝기 → 알파(먹 한 색). 색은 앱이 테마 토큰으로 입힌다(곱하기 합성이 아니라 알파라 다크 모드에서도 깨지지 않음)
//  ③ 종이 결 지우기: 알파 0.06 아래는 0(한지 섬유·얼룩), 그 위는 다시 0..1로 펴기 — 종이 결은 앱이 공통 한 장을 얹는다
//  ④ 최대 농도 = 0.72(MOTIF_INK_MAX): 알파 × 0.72
//  ⑥ 가림 마스크(5차): 사물 실루엣(속 빈 곳 채움)을 같은 크기 알파 WebP로 — 앱이 종이색 토큰 × 가림 농도로 사물 밑에 깐다
//  ⑤ 사물 경계 상자로 자르고(여백 3%) 긴 변 640px로 줄여 WebP(품질 0.8, 알파 포함 — 번들 예산: 먹 장당 200KB·가림 24KB·판당 760KB·전체 2MB, 시험이 고정)로 저장
// 출력: apps/mobile/assets/motifs/r<판>/ (ART_REV, 기본 1). **지난 판 폴더는 덮지 않는다** — 그림을 바꾸면 ART_REV를 올린다(이미 받은 카드는 그 판으로 그려진다).
// 바이트 재현은 같은 playwright·Chromium 판에서만 보장된다(WebP 인코딩·리샘플을 Chromium canvas가 한다) — 판을 gen.json `tool`에 적는다
// 사용: node scripts/motif-raster.mjs   (원본 docs/creative/c14b-ref/<이름>.jpg → apps/mobile/assets/motifs/<모티프 id>.webp + motifRasters.gen.json)
// 원본은 Gemini 2048px PNG를 1536px JPG(품질 92)로 줄여 저장소에 둔다 — 이 스크립트는 저장소의 JPG만 읽어 같은 결과를 낸다
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/** 고른 원본(아트 판단 — DECISIONS C14b v4 절에 이유) */
export const PICKS = {
  'near-with.letter': 'letter-o2',
  'far-alone.kite': 'kite-o3',
  'near-with.umbrella': 'umbrella-o1',
  'far-alone.paper-boat': 'boat-o1',
  'near-with.palm': 'palm-o1', // 6차: o3(넓은 V)가 부메랑으로 읽혀 가는 U로
  'near-with.window-hand': 'window-o3',
};
const picks = { ...PICKS, ...(process.env.PICKS ? JSON.parse(process.env.PICKS) : {}) };
/**
 * 장마다 손질 옵션(5차, 4차 아트 리뷰): rotate = 원본을 돌려 넣기(도, 시계 방향 +) — 편지를 덜 기울여 64pt에서 연과 갈리게,
 * clipBottom = 사물 경계 아래쪽 이 비율을 지움 — 종이배 밑 장식 물결(물살은 코드 장이 맡는다)
 */
const OPTS = { 'near-with.letter': { rotate: -28 }, 'far-alone.paper-boat': { clipBottom: 0.25 } };
/** 판(artRev, D-13): 그림을 바꾸면 판을 올리고 이전 판 폴더는 지우지 않는다(시험이 고정) */
const REV = Number(process.env.ART_REV ?? 1);
const SRC = path.resolve('docs/creative/c14b-ref');
const OUT = path.resolve(`apps/mobile/assets/motifs/r${process.env.ART_REV ?? 1}`);
const CAP = 0.72;
const LONG = 640;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
const meta = {};
for (const [id, name] of Object.entries(picks)) {
  const b64 = readFileSync(path.join(SRC, `${name}.jpg`)).toString('base64');
  const opt = OPTS[id] ?? {};
  const r = await page.evaluate(
    async ({ b64, CAP, LONG, opt }) => {
      const img = new Image();
      img.src = `data:image/jpeg;base64,${b64}`;
      await img.decode();
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const c = new OffscreenCanvas(W, H);
      const g = c.getContext('2d');
      // 돌릴 때 비는 모서리는 원본 왼쪽 위 종이색으로 채운다(종이로 판정되어 지워진다)
      if (opt.rotate) {
        g.drawImage(img, 0, 0);
        const p0 = g.getImageData(4, 4, 1, 1).data;
        g.fillStyle = `rgb(${p0[0]},${p0[1]},${p0[2]})`;
        g.fillRect(0, 0, W, H);
        g.translate(W / 2, H / 2);
        g.rotate((opt.rotate * Math.PI) / 180);
        g.drawImage(img, -W / 2, -H / 2);
        g.setTransform(1, 0, 0, 1, 0, 0);
      } else g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, W, H).data;
      const lum = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      // ① 종이 = 테두리 2% 띠의 중앙값, 먹 = 가장 짙은 0.5%
      const border = [];
      const bw = Math.round(W * 0.02);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < bw || y < bw || x >= W - bw || y >= H - bw) border.push(lum[y * W + x]);
      border.sort((a, b) => a - b);
      const paper = border[Math.floor(border.length / 2)];
      const sorted = Float32Array.from(lum).sort();
      const ink = sorted[Math.floor(sorted.length * 0.005)];
      // ②③④ 알파
      const a = new Float32Array(W * H);
      const rows = new Uint32Array(H);
      const cols = new Uint32Array(W);
      for (let i = 0; i < W * H; i++) {
        let v = Math.min(1, Math.max(0, (paper - lum[i]) / Math.max(1, paper - ink)));
        v = v < 0.06 ? 0 : Math.pow((v - 0.06) / 0.94, 0.8); // 중간 농담을 조금 올림(곱하기 합성에서 묽어 보이지 않게)
        a[i] = v * CAP;
        if (v > 0.1) {
          rows[(i / W) | 0]++;
          cols[i % W]++;
        }
      }
      // 사물 경계: 먹이 든 픽셀이 줄마다 일정 수 이상인 범위(멀리 떨어진 종이 얼룩·티끌은 버림) — 범위 밖 알파는 0
      const minR = Math.max(3, W * 0.004);
      const minC = Math.max(3, H * 0.004);
      let y0 = 0, y1 = H - 1, x0 = 0, x1 = W - 1;
      while (y0 < H && rows[y0] < minR) y0++;
      while (y1 > y0 && rows[y1] < minR) y1--;
      while (x0 < W && cols[x0] < minC) x0++;
      while (x1 > x0 && cols[x1] < minC) x1--;
      // ⑤ 자르기 + 줄이기
      if (opt.clipBottom) y1 = Math.round(y1 - (y1 - y0) * opt.clipBottom);
      // 가림 마스크(5차): 먹이 든 픽셀(raw > 0.05)을 벽으로 보고 바깥 테두리에서 종이를 채워 나간다 → 닿지 않은 곳 = 사물 실루엣(속 빈 곳까지 채움)
      const wall = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) wall[i] = a[i] > 0.05 * CAP ? 1 : 0;
      const seen = new Uint8Array(W * H);
      const q = new Int32Array(W * H);
      let qh = 0, qt = 0;
      const push = (i) => {
        if (!seen[i] && !wall[i]) {
          seen[i] = 1;
          q[qt++] = i;
        }
      };
      for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
      for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
      while (qh < qt) {
        const i = q[qh++];
        const x = i % W;
        if (x > 0) push(i - 1);
        if (x < W - 1) push(i + 1);
        if (i >= W) push(i - W);
        if (i < W * (H - 1)) push(i + W);
      }
      const m = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
      const [bx0, by0, bx1, by1] = [x0, y0, x1, y1];
      x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(W - 1, x1 + m); y1 = Math.min(H - 1, y1 + m);
      const cw = x1 - x0 + 1;
      const ch = y1 - y0 + 1;
      const k = Math.min(1, LONG / Math.max(cw, ch));
      const tw = Math.round(cw * k);
      const th = Math.round(ch * k);
      const encode = async (alphaAt) => {
        const full = new OffscreenCanvas(cw, ch);
        const fg = full.getContext('2d');
        const out = fg.createImageData(cw, ch);
        for (let y = 0; y < ch; y++)
          for (let x = 0; x < cw; x++) {
            const o = (y * cw + x) * 4;
            const X = x + x0;
            const Y = y + y0;
            const inside = X >= bx0 && X <= bx1 && Y >= by0 && Y <= by1;
            out.data[o + 3] = inside ? alphaAt(Y * W + X) : 0;
          }
        fg.putImageData(out, 0, 0);
        const sm = new OffscreenCanvas(tw, th);
        const sg = sm.getContext('2d');
        sg.imageSmoothingQuality = 'high';
        sg.drawImage(full, 0, 0, tw, th);
        const blob = await sm.convertToBlob({ type: 'image/webp', quality: 0.8 });
        const buf = new Uint8Array(await blob.arrayBuffer());
        let s = '';
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return btoa(s);
      };
      const webp = await encode((i) => Math.round(a[i] * 255));
      const mask = await encode((i) => (seen[i] ? 0 : 255));
      return { webp, mask, w: tw, h: th, paper, ink };
    },
    { b64, CAP, LONG, opt },
  );
  const file = path.join(OUT, `${id}.webp`);
  writeFileSync(file, Buffer.from(r.webp, 'base64'));
  writeFileSync(path.join(OUT, `${id}.mask.webp`), Buffer.from(r.mask, 'base64'));
  meta[id] = { rev: REV, ...opt, src: name, w: r.w, h: r.h, aspect: Number((r.w / r.h).toFixed(4)), paper: Math.round(r.paper), ink: Math.round(r.ink) };
  console.log(id, '←', name, `${r.w}×${r.h}`, `${Math.round(Buffer.from(r.webp, 'base64').length / 1024)}KB + 가림 ${Math.round(Buffer.from(r.mask, 'base64').length / 1024)}KB`);
}
writeFileSync(path.join(OUT, 'motifRasters.gen.json'), JSON.stringify({ tool: { playwright: JSON.parse(readFileSync(path.resolve('node_modules/playwright/package.json'), 'utf8')).version, chromium: browser.version() }, ...meta }, null, 2) + '\n');
await browser.close();
