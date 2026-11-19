import { describe, expect, it } from 'vitest';
import {
  BODY,
  CORE,
  COMB_REST,
  EYE,
  angleOf,
  attachStroke,
  buildRibbon,
  combStrands,
  coreOutline,
  coreScale,
  coreSdf,
  crownRadius,
  day7Records,
  eyeCenters,
  eyeShape,
  isForbidden,
  maxProtrusion,
  placePoints,
  polygonArea,
  protrusionCap,
  simplifyStroke,
  strokeLocal,
  strokeRibbon,
  type RawPoint,
} from '../src/index';

const DEG = Math.PI / 180;

describe('아트 1-1 몸 수치', () => {
  it('폭:높이 1.25(허용 1.15~1.35), 바닥 현 0.7W, 정수리 곡률 ≥ 0.35W', () => {
    const o = coreOutline(1, 720);
    let minX = 9, maxX = -9, minY = 9, maxY = -9;
    for (let i = 0; i < o.length; i += 2) {
      minX = Math.min(minX, o[i]!);
      maxX = Math.max(maxX, o[i]!);
      minY = Math.min(minY, o[i + 1]!);
      maxY = Math.max(maxY, o[i + 1]!);
    }
    const aspect = (maxX - minX) / (maxY - minY);
    expect(aspect).toBeGreaterThanOrEqual(BODY.aspectMin);
    expect(aspect).toBeLessThanOrEqual(BODY.aspectMax);
    expect(Math.abs(maxX - minX - 1)).toBeLessThan(0.03);
    expect(crownRadius()).toBeGreaterThanOrEqual(BODY.crownRadiusMin);
    // 바닥 현: 바닥선에서 0.01W 위 수평 폭(둥근 모서리 감안 ±0.08)
    const yb = CORE.h / 2 - 0.01;
    let xl = 0, xr = 0;
    for (let x = 0; x > -0.6; x -= 0.001) if (coreSdf(x, yb, 1) < 0) xl = x;
    for (let x = 0; x < 0.6; x += 0.001) if (coreSdf(x, yb, 1) < 0) xr = x;
    expect(Math.abs(xr - xl - BODY.bottomChord)).toBeLessThan(0.08);
    // 정수리가 앞(+x)으로 기운다
    let topX = 0, topY = 9;
    for (let i = 0; i < o.length; i += 2) if (o[i + 1]! < topY) { topY = o[i + 1]!; topX = o[i]!; }
    expect(topX).toBeGreaterThan(0.02);
  });

  it('coreScale: 0획 1.00, 7획 1.25(시스템 4.1)', () => {
    expect(coreScale(0)).toBe(1);
    expect(coreScale(7)).toBeCloseTo(1.25, 2);
    expect(coreScale(1e6)).toBeLessThanOrEqual(1.6);
  });

  it('눈 둘: 지름 0.16W, 간격 0.42W, 중심 높이 = 바닥에서 38%', () => {
    const c = eyeCenters();
    expect(c.rx - c.lx).toBeCloseTo(EYE.spacing, 6);
    expect(CORE.h / 2 - c.y).toBeCloseTo(CORE.h * EYE.heightFrac, 6);
    const e = eyeShape('open');
    let w = 0;
    for (let i = 0; i < e.length; i += 2) w = Math.max(w, Math.abs(e[i]!));
    expect(2 * w).toBeCloseTo(EYE.diameter, 3);
    // 두 눈 모두 몸 안
    expect(coreSdf(c.lx, c.y, 1)).toBeLessThan(-0.08);
    expect(coreSdf(c.rx, c.y, 1)).toBeLessThan(-0.08);
  });

  it('E 빗: 뿌리가 몸 안(떠 있는 틱 금지), 길이비 1 : 0.9 : 0.75, 돌출 0.18W → 0.3W', () => {
    for (const [n, prot] of [[0, 0.18], [7, 0.3]] as const) {
      const strands = combStrands(n, coreScale(n), COMB_REST);
      const lens = strands.map((st) => {
        expect(coreSdf(st.pts[0]!.x, st.pts[0]!.y, coreScale(n))).toBeLessThan(-0.02);
        // 돌출 = 가닥 중 실루엣 밖 길이
        let out = 0;
        for (let i = 1; i < st.pts.length; i++) {
          const a = st.pts[i - 1]!, b = st.pts[i]!;
          const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          if (coreSdf(m.x, m.y, coreScale(n)) > 0) out += Math.hypot(b.x - a.x, b.y - a.y);
        }
        expect(maxProtrusion(st.pts, coreScale(n))).toBeGreaterThan(0.03);
        return out;
      });
      expect(lens[0]!).toBeCloseTo(prot, 1);
      expect(lens[1]! / lens[0]!).toBeCloseTo(0.9, 1);
      expect(lens[2]! / lens[0]!).toBeCloseTo(0.75, 1);
    }
  });

  // 알려진 정본 위반(아트 1-1 "빗 자리는 금지 자리", D-12 ① = −25°~+45°): 맨 아래 가닥 뿌리가 약 73°라 실패한다.
  // REPORT 10-1 결정(금지 자리 ①을 빗 기하에서 파생) 뒤 it.fails → it 으로 되돌린다.
  it.fails('E 빗 뿌리가 모두 금지 자리 ①(≤45°) 안 — 알려진 실패, REPORT 10-1', () => {
    for (const n of [0, 7]) {
      const s = coreScale(n);
      for (const st of combStrands(n, s, COMB_REST)) {
        const root = st.pts.find((q) => coreSdf(q.x, q.y, s) > 0)!;
        expect(angleOf(root.x, root.y) * (180 / Math.PI)).toBeLessThanOrEqual(45);
      }
    }
  });
});

describe('D-12 부착: 회전 + 이동, 금지 자리', () => {
  const crownStroke: RawPoint[] = Array.from({ length: 60 }, (_, i) => {
    const u = i / 59;
    return { x: -0.15 + u * 0.3, y: -0.62 - Math.sin(u * Math.PI) * 0.12, t: u * 600 };
  });
  const tailStroke: RawPoint[] = Array.from({ length: 60 }, (_, i) => {
    const u = i / 59;
    const th = (225 + u * 10) * DEG;
    const r = 0.58 + u * 0.3;
    return { x: Math.sin(th) * r, y: -Math.cos(th) * r, t: u * 600 };
  });

  it('정수리·꼬리 자리에 그은 획은 가장 가까운 허용 자리로 미끄러진다', () => {
    for (const raw of [crownStroke, tailStroke]) {
      for (const level of [1, 2, 3] as const) {
        const a = attachStroke(raw, 1, level, 0);
        expect(isForbidden(a.theta)).toBe(false);
      }
    }
  });

  it('모양은 손 것: L1은 회전·이동만(점 사이 거리 보존)', () => {
    const pts = simplifyStroke(tailStroke);
    const a = attachStroke(tailStroke, 1, 1, 0);
    expect(a.scale).toBe(1);
    expect(a.bend).toBe(0);
    const q = placePoints(pts, a, 1, 1);
    for (let i = 1; i < pts.length; i++) {
      const d0 = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
      const d1 = Math.hypot(q[i]!.x - q[i - 1]!.x, q[i]!.y - q[i - 1]!.y);
      expect(Math.abs(d0 - d1)).toBeLessThan(1e-9);
    }
  });

  it('L2: 돌출 상한(7일 0.5W)을 넘으면 균일 축소', () => {
    const long: RawPoint[] = Array.from({ length: 100 }, (_, i) => {
      const u = i / 99;
      return { x: 0.5 + u * 1.2, y: 0.1 + u * 0.4, t: u * 800 };
    });
    const a1 = attachStroke(long, 1, 1, 3);
    const a2 = attachStroke(long, 1, 2, 3);
    const pts = simplifyStroke(long);
    expect(maxProtrusion(strokeLocal(pts, a2, 1, 1, 1), 1)).toBeLessThanOrEqual(protrusionCap(4) + 0.01);
    expect(maxProtrusion(strokeLocal(pts, a1, 1, 1, 1), 1)).toBeGreaterThan(protrusionCap(4));
    expect(a2.scale).toBeLessThan(1);
    expect(a2.taper).toBe(1);
  });

  it('붙은 앵커는 몸 표면(0.02W 이내)에 있다', () => {
    const a = attachStroke(tailStroke, 1, 2, 0);
    const pts = simplifyStroke(tailStroke);
    const local = strokeLocal(pts, a, 1, 1, 1);
    let best = 9;
    for (const p of local) best = Math.min(best, Math.abs(coreSdf(p.x, p.y, 1)));
    expect(best).toBeLessThan(0.02);
  });
});

/** 삼각형들을 격자에 칠해 넓이를 잰다 */
function rasterArea(tris: number[][], cell: number, extra: (x: number, y: number) => boolean): { union: number; core: number } {
  const span = 2.4;
  const n = Math.round((span * 2) / cell);
  const grid = new Uint8Array(n * n);
  const toI = (v: number) => Math.floor((v + span) / cell);
  for (const t of tris) {
    const [ax, ay, bx, by, cx, cy] = t as [number, number, number, number, number, number];
    const x0 = Math.max(0, toI(Math.min(ax, bx, cx)));
    const x1 = Math.min(n - 1, toI(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, toI(Math.min(ay, by, cy)));
    const y1 = Math.min(n - 1, toI(Math.max(ay, by, cy)));
    for (let j = y0; j <= y1; j++)
      for (let i = x0; i <= x1; i++) {
        const px = -span + (i + 0.5) * cell;
        const py = -span + (j + 0.5) * cell;
        const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
        const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
        const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
        const neg = d1 < 0 || d2 < 0 || d3 < 0;
        const pos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(neg && pos)) grid[j * n + i] = 1;
      }
  }
  let union = 0;
  let core = 0;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const px = -span + (i + 0.5) * cell;
      const py = -span + (j + 0.5) * cell;
      const inCore = extra(px, py);
      if (inCore) core++;
      if (inCore || grid[j * n + i]) union++;
    }
  return { union: union * cell * cell, core: core * cell * cell };
}

describe('7일차 포즈(아트 1-2)', () => {
  it('핵 1.25W, 7획, 핵 면적 ≥ 실루엣 75%, 금지 자리 비움, 받침 길이 ≤ 0.2W', () => {
    const recs = day7Records(2);
    expect(recs.length).toBe(7);
    const s = coreScale(7);
    expect(s).toBeCloseTo(1.25, 2);
    const tris: number[][] = [];
    const push = (r: { positions: number[]; indices: number[] }) => {
      for (let i = 0; i < r.indices.length; i += 3) {
        const t: number[] = [];
        for (let k = 0; k < 3; k++) t.push(r.positions[r.indices[i + k]! * 2]!, r.positions[r.indices[i + k]! * 2 + 1]!);
        tris.push(t);
      }
    };
    for (const rec of recs) {
      expect(isForbidden(rec.attach.theta)).toBe(false);
      push(strokeRibbon(rec, s));
    }
    for (const st of combStrands(7, s, COMB_REST)) push(buildRibbon(st.pts, { widths: st.widths }));
    const { union, core } = rasterArea(tris, 0.005, (x, y) => coreSdf(x, y, s) < 0);
    const ratio = core / union;
    console.info(`[7일차] 핵 면적 비율 = ${(ratio * 100).toFixed(1)}%`);
    expect(ratio).toBeGreaterThanOrEqual(0.75);
    expect(Math.abs(core - polygonArea(coreOutline(s, 360))) / core).toBeLessThan(0.02);
    // 받침(바닥 160~200°) 획은 짧다
    for (const rec of recs.slice(1, 3)) {
      const pts = simplifyStroke(rec.raw);
      let L = 0;
      for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
      expect(L * rec.attach.scale).toBeLessThanOrEqual(0.2);
    }
  });
});
