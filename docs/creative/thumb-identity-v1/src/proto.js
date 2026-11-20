(() => {
// 썸네일 정체성 시안 렌더러(Canvas 2D). 기하는 @mong/core 번들(Mong)을 그대로 쓴다: 핵 윤곽·빗 가닥·획 부착(D-12)·획 문법 C.
// 칠은 앱(Skia)의 근사: 단일 coverage 몸 + 획 안쪽 stroke-ink(srcATop, 핵 안 클립) + 종이 눈 + 바닥 고리 + 받침 띠.
/* global Mong */
const M = Mong;
const BG = '#EFE8DA';
const BODY = '#1B1A18';

// ── 시드 난수 ──
function rng(seed) {
  let x = (seed * 2654435761) >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}
const lerp = (a, b, t) => a + (b - a) * t;

function arcRaw(th0, th1, r0, r1, ms, wobble, seed) {
  const out = [];
  const n = Math.max(12, Math.round(ms / 8));
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const e = u * u * (3 - 2 * u);
    const th = ((th0 + (th1 - th0) * e) * Math.PI) / 180;
    const r = r0 + (r1 - r0) * e + Math.sin(u * 17 + seed) * wobble;
    out.push({ x: Math.sin(th) * r, y: -Math.cos(th) * r, t: Math.round(u * ms) });
  }
  return out;
}
function lineRaw(x0, y0, x1, y1, ms) {
  const out = [];
  const n = Math.max(8, Math.round(ms / 8));
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    out.push({ x: lerp(x0, x1, u), y: lerp(y0, y1, u) + Math.sin(u * 3.1) * 0.01, t: Math.round(u * ms) });
  }
  return out;
}

/** 한 사람의 손: 시드마다 다른 7(+extra)획. 유형 비율도 사람마다 다르다(등 감기 좋아함/앞 짧게/받침 많이 등) */
function handRaws(seed, count) {
  const r = rng(seed);
  const pref = [r(), r(), r(), r()]; // 등 두름 / 앞 두름 / 받침 / 긴 쓸기 선호
  const sum = pref.reduce((a, b) => a + b, 0);
  const raws = [];
  for (let i = 0; i < count; i++) {
    let u = r() * sum;
    let kind = 0;
    while (u > pref[kind]) { u -= pref[kind]; kind++; }
    kind = Math.min(kind, 3);
    if (kind === 0) {
      const a = lerp(258, 330, r());
      raws.push(arcRaw(a, a - lerp(22, 70, r()), lerp(0.56, 0.72, r()), lerp(0.55, 0.7, r()), 600, 0.004, i));
    } else if (kind === 1) {
      const a = lerp(92, 150, r());
      raws.push(arcRaw(a, a + (r() < 0.5 ? -1 : 1) * lerp(14, 40, r()), lerp(0.58, 0.68, r()), lerp(0.56, 0.66, r()), 380, 0.003, i));
    } else if (kind === 2) {
      const x = lerp(-0.25, 0.15, r());
      raws.push(lineRaw(x, 0.45, x + lerp(0.08, 0.2, r()), 0.445, 220));
    } else {
      const a = lerp(200, 300, r());
      raws.push(arcRaw(a, a + lerp(40, 90, r()), lerp(0.62, 0.78, r()), lerp(0.6, 0.74, r()), 900, 0.012, i + 3));
    }
  }
  return raws;
}
function handRecords(seed, count, shape) {
  return handRaws(seed, count).map((raw, i) => M.makeRecord(raw, i, 2, shape));
}

/** 타고남 → BodyShape. custom = {aspect, ratios, ring} 이면 범위 밖 값(시안 A) */
function shapeFor(t, custom) {
  if (!custom) return M.shapeOf(t);
  const core = M.coreParams(custom.aspect);
  return { core, combRatios: custom.ratios, forbidden: M.deriveForbidden(undefined, core), ringWidth: custom.ring ?? 1.3, aspect: custom.aspect };
}

// ── 색 ──
function hex2rgb(h) { return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); }
function rgb2hex(c) { return '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
/** 회색축에서 멀어지게(채도 k배) — 썸네일 LOD에서만 */
function chroma(h, k, dl = 0) {
  const c = hex2rgb(h);
  const g = (c[0] + c[1] + c[2]) / 3;
  return rgb2hex(c.map((v) => g + (v - g) * k + dl));
}

// ── 경로 ──
function triPath(ribbon, W, cx, cy, path) {
  const p = ribbon.positions;
  const I = ribbon.indices;
  for (let i = 0; i < I.length; i += 3) {
    let a = I[i], b = I[i + 1], c = I[i + 2];
    const ax = p[a * 2], ay = p[a * 2 + 1], bx = p[b * 2], by = p[b * 2 + 1], qx = p[c * 2], qy = p[c * 2 + 1];
    const cr = (bx - ax) * (qy - ay) - (by - ay) * (qx - ax);
    if (cr < 0) { const t = b; b = c; c = t; }
    path.moveTo(cx + p[a * 2] * W, cy + p[a * 2 + 1] * W);
    path.lineTo(cx + p[b * 2] * W, cy + p[b * 2 + 1] * W);
    path.lineTo(cx + p[c * 2] * W, cy + p[c * 2 + 1] * W);
    path.closePath();
  }
}
function polyPath(flat, W, cx, cy, path) {
  for (let i = 0; i < flat.length; i += 2) {
    const x = cx + flat[i] * W, y = cy + flat[i + 1] * W;
    if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
  }
  path.closePath();
}

/**
 * 한 마리를 ctx(cx, cy = 핵 중심, W = 방울 폭 px)에 그린다.
 * o: { shape, look, recs, pose:{comb, eyes:'open'|'joy'}, lod:{gap,width,chroma,eye,comb,rim,blur}, rim:{color,w}, mark }
 */
function drawMong(ctx, cx, cy, W, o) {
  const sh = o.shape;
  const n = o.recs.length;
  const s = M.coreScale(n);
  const L = o.lod || {};
  const g = { ...M.GRAMMARS.C, gap: L.gap ?? M.GRAMMARS.C.gap, baseWidth: L.width ?? M.GRAMMARS.C.baseWidth };
  const look = o.look;
  const strokeCol = L.chroma ? chroma(look.strokeDay, L.chroma, L.lift ?? 0) : look.strokeDay;
  const ringCol = L.chroma ? chroma(look.ring, Math.min(L.chroma, 1.8)) : look.ring;
  const bottom = cy + (sh.core.h / 2) * s * W;

  // 바닥 번짐 고리
  ctx.save();
  ctx.filter = `blur(${0.035 * W}px)`;
  ctx.globalAlpha = look.ringOpacity * (L.ringA ?? 1);
  ctx.fillStyle = ringCol;
  ctx.beginPath();
  ctx.ellipse(cx, bottom, (sh.ringWidth * W * s) / 2, (0.18 * W * s) / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 획 분류
  const spines = o.recs.map((r) => M.strokeSpine(r, s, 1, undefined, g, sh));
  const base = spines.filter((sp) => sp.label === 'base');
  const other = o.recs.map((r, i) => [r, spines[i]]).filter(([, sp]) => sp.label !== 'base');
  const ribbons = other.map(([, sp]) => M.buildRibbon(sp.pts, { ...sp.opts, width: g.baseWidth, widths: M.strokeWidths(sp.pts, { ...sp.opts, width: g.baseWidth }) }));

  // 받침 띠
  if (base.length) {
    let x0 = 1e9, x1 = -1e9;
    base.forEach((sp) => sp.pts.forEach((p) => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); }));
    ctx.save();
    ctx.filter = `blur(${0.02 * W}px)`;
    ctx.globalAlpha = 0.5 * (L.baseA ?? 1);
    ctx.fillStyle = strokeCol;
    const h = 0.09 * W;
    ctx.beginPath();
    ctx.roundRect(cx + x0 * W, bottom - h * 0.25, (x1 - x0) * W, h, h / 2);
    ctx.fill();
    ctx.restore();
  }

  // 몸 coverage (핵 + 빗 + 획)
  const combPose = { ...M.COMB_REST, ...(o.pose?.comb || {}) };
  const strands = M.combStrands(n, s, combPose, sh);
  const off = new OffscreenCanvas(ctx.canvas.width, ctx.canvas.height);
  const m = off.getContext('2d');
  const body = new Path2D();
  polyPath(M.coreOutline(s, 144, sh.core), W, cx, cy, body);
  const combP = new Path2D();
  strands.forEach((st) => {
    const widths = L.comb ? st.widths.map((w) => w * L.comb) : st.widths;
    triPath(M.buildRibbon(st.pts, { widths, roundStart: true, roundEnd: true }), W, cx, cy, combP);
  });
  const strokeP = new Path2D();
  ribbons.forEach((rb) => triPath(rb, W, cx, cy, strokeP));

  // 먹 테(시안 C): 실루엣 바깥 고른 먹 색 띠
  if (o.rim) {
    const rimC = new OffscreenCanvas(ctx.canvas.width, ctx.canvas.height);
    const rc = rimC.getContext('2d');
    rc.fillStyle = o.rim.color;
    rc.strokeStyle = o.rim.color;
    rc.lineJoin = 'round';
    rc.lineWidth = o.rim.w * W * 2;
    [body, combP, strokeP].forEach((p) => { rc.fill(p); rc.stroke(p); });
    // 눈 자리는 종이로 남긴다(테가 눈 구멍으로 비치지 않게)
    const ec0 = M.eyeCenters(sh.core);
    rc.globalCompositeOperation = 'destination-out';
    [ec0.lx, ec0.rx].forEach((ex) => { rc.beginPath(); rc.arc(cx + ex * s * W, cy + ec0.y * s * W, (0.16 / 2) * s * W * (L.eye ?? 1) * 1.05, 0, Math.PI * 2); rc.fill(); });
    ctx.save();
    ctx.filter = `blur(${0.012 * W}px)`;
    ctx.drawImage(rimC, 0, 0);
    ctx.restore();
  }

  m.fillStyle = BODY;
  m.fill(body);
  m.fill(combP);
  m.fill(strokeP);
  // 획 안쪽 담묵(핵 안 제외)
  const t = new OffscreenCanvas(ctx.canvas.width, ctx.canvas.height);
  const tc = t.getContext('2d');
  tc.fillStyle = strokeCol;
  tc.fill(strokeP);
  tc.globalCompositeOperation = 'destination-out';
  tc.fill(body);
  m.globalCompositeOperation = 'source-atop';
  // 획 리본 가장자리는 몸 먹 테(안쪽 2px)를 남기려 살짝 안쪽만 덧칠: 근사로 그대로 덮는다
  m.drawImage(t, 0, 0);
  m.globalCompositeOperation = 'source-over';
  // 눈 = 종이 빈자리
  const ec = M.eyeCenters(sh.core);
  const er = (0.16 / 2) * s * W * (L.eye ?? 1);
  m.globalCompositeOperation = 'destination-out';
  if ((o.pose?.eyes ?? 'open') === 'joy') {
    m.lineWidth = 0.05 * W * s * (L.eye ?? 1);
    m.lineCap = 'round';
    [ec.lx, ec.rx].forEach((ex) => {
      m.beginPath();
      m.arc(cx + ex * s * W, cy + ec.y * s * W + er * 0.4, er * 0.9, Math.PI * 1.15, Math.PI * 1.85);
      m.stroke();
    });
  } else {
    [ec.lx, ec.rx].forEach((ex) => { m.beginPath(); m.arc(cx + ex * s * W, cy + ec.y * s * W, er, 0, Math.PI * 2); m.fill(); });
  }
  m.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.filter = `blur(${(L.blur ?? 0.012) * W}px)`;
  ctx.drawImage(off, 0, 0);
  ctx.restore();

  // 고정 표식(시안 D): 몸 위 한 점 — 금지표 검증용
  if (o.mark) {
    ctx.save();
    ctx.fillStyle = o.mark.color;
    ctx.beginPath();
    ctx.arc(cx + o.mark.x * s * W, cy + o.mark.y * s * W, o.mark.r * s * W, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** 큰 렌더 → 작은 칸. 썸네일은 플랫폼 축소를 흉내 낸다(고품질 다운샘플). lodSmall이면 작은 크기 전용 값으로 다시 그린다 */
const BIG = 220;
function renderTile(o, opts = {}) {
  const c = new OffscreenCanvas(BIG * 3, BIG * 2.4);
  const x = c.getContext('2d');
  x.fillStyle = BG;
  x.fillRect(0, 0, c.width, c.height);
  drawMong(x, c.width * 0.45, c.height * 0.5, BIG, { ...o, lod: opts.lod ? o.lodSmall : o.lod, rim: opts.lod && o.rimSmall ? o.rimSmall : o.rim, mark: opts.lod && o.markSmall ? o.markSmall : o.mark });
  return c;
}
/** dst에 W px 몸 폭으로 축소해 찍는다(단계적 축소 = 브라우저·SNS 리사이저 근사) */
function blitTile(dst, tile, cx, cy, Wpx) {
  let src = tile;
  let w = tile.width, h = tile.height;
  const target = (Wpx / BIG) * tile.width;
  while (w / 2 > target) {
    const nc = new OffscreenCanvas(Math.round(w / 2), Math.round(h / 2));
    const nx = nc.getContext('2d');
    nx.imageSmoothingQuality = 'high';
    nx.drawImage(src, 0, 0, nc.width, nc.height);
    src = nc; w = nc.width; h = nc.height;
  }
  const tw = target, th = (target / tile.width) * tile.height;
  dst.imageSmoothingQuality = 'high';
  dst.drawImage(src, cx - tw * 0.45, cy - th * 0.5, tw, th);
}

window.Proto = { M, rng, handRecords, shapeFor, drawMong, renderTile, blitTile, chroma, BG };

})();
