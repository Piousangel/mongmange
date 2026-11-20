(() => {
/* global Proto, Board */
const { M, renderTile, blitTile, rng } = Proto;
const { mk, IND, INKS } = Board;
const DPR = window.devicePixelRatio || 1;
const cv = document.getElementById('c');
const q = new URLSearchParams(location.search);
const scene = q.get('scene') || 'options';
const THUMB = Number(q.get('w') || 22);

function setup(w, h) {
  cv.width = w * DPR; cv.height = h * DPR;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const x = cv.getContext('2d');
  x.scale(DPR, DPR);
  x.fillStyle = '#EFE8DA'; x.fillRect(0, 0, w, h);
  return x;
}
function text(x, s, px, py, size = 12, col = '#6B625A', align = 'left') {
  x.fillStyle = col; x.font = `${size}px -apple-system, 'Apple SD Gothic Neo', sans-serif`; x.textAlign = align;
  s.split('\n').forEach((l, i) => x.fillText(l, px, py + i * (size + 3)));
}

if (scene === 'options') {
  const rows = [
    ['0 현행 M1', 'cur', '같은 손 7획'],
    ['A 실루엣 확대', 'A', '체형 1.08/1.25/1.5\n빗 길이비 ±40%'],
    ['B 썸네일 LOD', 'B', '작을 때만: 틈 0.1W·획 폭 1.36배\n먹 채도 2.2배·눈 1.3배'],
    ['C 먹 테', 'C', '실루엣 바깥 고른 먹 띠'],
    ['D 몸 위 표식', 'D', '몸에 종이 점 하나'],
    ['E 손 획 주연', 'E', '사람마다 다른 손 7획\n(렌더는 현행)'],
    ['E+B 추천', 'EB', '다른 손 + 썸네일 LOD'],
  ];
  const big = 46, cellB = 118, cellT = 58, rowH = 104, left = 150;
  const W = left + cellB * 6 + 30 + cellT * 6 + 20;
  const x = setup(W, 40 + rows.length * rowH);
  text(x, '큰 화면(몸 폭 46px)', left, 22, 13, '#2A2622');
  text(x, `썸네일(몸 폭 ${THUMB}px, 큰 렌더를 축소)`, left + cellB * 6 + 30, 22, 13, '#2A2622');
  rows.forEach(([name, v, note], r) => {
    const y0 = 40 + r * rowH;
    text(x, name, 10, y0 + 30, 14, '#2A2622');
    text(x, note, 10, y0 + 50, 10.5);
    IND.forEach((ind, i) => {
      const o = mk(ind, v);
      blitTile(x, renderTile(o), left + i * cellB + cellB * 0.45, y0 + rowH * 0.5, big);
      blitTile(x, renderTile(o, { lod: true }), left + cellB * 6 + 30 + i * cellT + cellT * 0.45, y0 + rowH * 0.5, THUMB);
    });
    x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(0, y0 + rowH - 1, W, 1);
  });
}

// ── 블라인드 근사: 찾는 그림 1 + 보기 6(같은 개체 9일째·다른 포즈 1 + 방해 5, 반은 같은 체형·빗) ──
function trialSet(seed, mode) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const tgt = { t: { body: Math.floor(r() * 3), comb: Math.floor(r() * 4), ring: 1 }, ink: pick(INKS), seed: 1000 + seed * 13, n: 7 };
  const same = { ...tgt, n: 9, pose: { comb: { angle: 9, spread: 3 }, eyes: 'joy' } };
  const ds = [];
  for (let k = 0; k < 5; k++) {
    let t;
    if (mode === 'control' || k < 3) t = { ...tgt.t };
    else t = { body: Math.floor(r() * 3), comb: Math.floor(r() * 4), ring: 1 };
    const ink = mode === 'control' ? tgt.ink : pick(INKS);
    const fair = q.get('fair') === '1';
    const pz = r() < 0.5;
    ds.push({ t, ink, seed: 5000 + seed * 31 + k * 7, n: fair ? 9 : 7 + Math.floor(r() * 3), pose: fair || pz ? { comb: { angle: 9, spread: 3 }, eyes: 'joy' } : undefined });
  }
  const opts = [same, ...ds];
  // 섞기
  const order = opts.map((_, i) => i).sort(() => r() - 0.5);
  return { tgt, opts: order.map((i) => opts[i]), answer: order.indexOf(0) };
}

if (scene === 'blind') {
  const variant = q.get('v') || 'E';
  const mode = q.get('mode') || 'main';
  const trials = Number(q.get('trials') || 6);
  const cell = Math.max(THUMB * 2.6, 52);
  const W = 30 + cell * 8;
  const x = setup(W, 30 + trials * (cell * 0.95));
  text(x, `블라인드 근사 · ${variant} · ${mode} · 몸 폭 ${THUMB}px · 왼쪽 = 찾는 그림, 오른쪽 6 = 보기`, 10, 18, 12, '#2A2622');
  for (let i = 0; i < trials; i++) {
    const T = trialSet(i + Number(q.get('seed') || 1), mode);
    const y = 30 + i * cell * 0.95 + cell * 0.45;
    blitTile(x, renderTile(mk(T.tgt, variant), { lod: true }), 20 + cell * 0.45, y, THUMB);
    x.fillStyle = 'rgba(0,0,0,0.15)'; x.fillRect(20 + cell, y - cell * 0.35, 1, cell * 0.7);
    T.opts.forEach((o, k) => blitTile(x, renderTile(mk(o, variant), { lod: true }), 20 + cell * (1.6 + k) + cell * 0.45, y, THUMB));
    window.__answers = (window.__answers || []).concat(T.answer + 1);
  }
}

// ── 자동 판별 근사: 썸네일 픽셀(OKLab 근사 = sRGB 거리)로 찾는 그림에 가장 가까운 보기가 정답인가 ──
function thumbPixels(o, Wpx) {
  const tile = renderTile(o, { lod: true });
  const w = Math.round(Wpx * 3), h = Math.round(Wpx * 2.4);
  const c = new OffscreenCanvas(w, h);
  const x = c.getContext('2d');
  // 단계 축소
  let src = tile, sw = tile.width, sh = tile.height;
  while (sw / 2 > w) { const n = new OffscreenCanvas(Math.round(sw / 2), Math.round(sh / 2)); const nx = n.getContext('2d'); nx.imageSmoothingQuality = 'high'; nx.drawImage(src, 0, 0, n.width, n.height); src = n; sw = n.width; sh = n.height; }
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, w, h);
  return x.getImageData(0, 0, w, h).data;
}
function dist(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i += 4) {
    const dr = a[i] - b[i], dg = a[i + 1] - b[i + 1], db = a[i + 2] - b[i + 2];
    d += dr * dr + dg * dg + db * db;
  }
  return d;
}
window.runProxy = (variant, mode, N, Wpx) => {
  let ok = 0;
  for (let i = 0; i < N; i++) {
    const T = trialSet(200 + i, mode);
    const pt = thumbPixels(mk(T.tgt, variant), Wpx);
    const ds = T.opts.map((o) => dist(pt, thumbPixels(mk(o, variant), Wpx)));
    const best = ds.indexOf(Math.min(...ds));
    if (best === T.answer) ok++;
  }
  return ok / N;
};

if (scene === 'sizes') {
  // LOD 램프: 몸 폭 48px 이상 = 정본 그대로, 24px 이하 = 썸네일 값 전부, 사이는 선형
  const lodAt = (w) => {
    const t = Math.max(0, Math.min(1, (48 - w) / 24));
    const L = Board.LOD;
    return { gap: 0.05 + (L.gap - 0.05) * t, width: 0.125 + (L.width - 0.125) * t, chroma: 1 + (L.chroma - 1) * t, eye: 1 + (L.eye - 1) * t, comb: 1 + (L.comb - 1) * t, blur: 0.012 + (L.blur - 0.012) * t, ringA: 1 + (L.ringA - 1) * t };
  };
  const sizes = [64, 46, 36, 22];
  const rows = [['현행 렌더 + 다른 손', 'E'], ['추천: 다른 손 + LOD 램프', 'EB']];
  const cellW = (w) => Math.max(w * 2.2, 56);
  const left = 190;
  let total = left; sizes.forEach((w) => (total += cellW(w) * 6 + 24));
  const x = setup(total, 60 + rows.length * 150);
  let cx0 = left;
  sizes.forEach((w) => { text(x, `몸 폭 ${w}px`, cx0, 22, 13, '#2A2622'); cx0 += cellW(w) * 6 + 24; });
  rows.forEach(([name, v], r) => {
    const y = 60 + r * 150 + 70;
    text(x, name, 10, y - 4, 12.5, '#2A2622');
    let c0 = left;
    sizes.forEach((w) => {
      IND.forEach((ind, i) => {
        const o = mk(ind, 'E');
        if (v === 'EB') o.lodSmall = lodAt(w);
        Proto.blitTile(x, renderTile(o, { lod: v === 'EB' }), c0 + i * cellW(w) + cellW(w) * 0.45, y, w);
      });
      c0 += cellW(w) * 6 + 24;
    });
  });
}

document.title = 'ready';

})();
