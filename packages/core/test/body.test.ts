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
  day7ClumsyRecords,
  eyeCenters,
  FORBIDDEN_ZONES,
  GRAMMARS,
  coreRadius1,
  PALETTE,
  ATTACH_VERSION,
  polarOf,
  polarToLocal,
  strokeSpine,
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

  // render-03: 금지 자리 ①은 빗 기하에서 파생한다(맨 아래 가닥 뿌리 + 6°). 이전 it.fails(≤45° 고정)는 이 규칙으로 고쳐져 정상 테스트가 됐다.
  it('E 빗 뿌리가 모두 금지 자리 ①(빗에서 파생) 안, ① 상한은 45°~85°(어깨를 다 먹지 않음)', () => {
    const hi = FORBIDDEN_ZONES[0]![1] / DEG;
    console.info(`[금지 ①] −25° ~ ${hi.toFixed(1)}°`);
    expect(hi).toBeGreaterThanOrEqual(45);
    expect(hi).toBeLessThanOrEqual(85);
    // 독립 기준(리뷰 6번: 파생식과 같은 함수로 확인하면 동어반복): 빗 리본 삼각형이 덮는 표면 바로 바깥(0.01W) 점은 모두 금지 자리 ①
    for (const n of [0, 3, 7]) {
      const s = coreScale(n);
      const tris: number[][] = [];
      for (const st of combStrands(n, s, COMB_REST)) {
        const r = buildRibbon(st.pts, { widths: st.widths, roundStart: true, roundEnd: true });
        for (let i = 0; i < r.indices.length; i += 3) {
          const t: number[] = [];
          for (let k = 0; k < 3; k++) t.push(r.positions[r.indices[i + k]! * 2]!, r.positions[r.indices[i + k]! * 2 + 1]!);
          tris.push(t);
        }
      }
      const inTri = (px: number, py: number) =>
        tris.some(([ax, ay, bx, by, cx, cy]) => {
          const d1 = (px - bx!) * (ay! - by!) - (ax! - bx!) * (py - by!);
          const d2 = (px - cx!) * (by! - cy!) - (bx! - cx!) * (py - cy!);
          const d3 = (px - ax!) * (cy! - ay!) - (cx! - ax!) * (py - ay!);
          return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
        });
      let covered = 0;
      for (let deg = -30; deg <= 180; deg += 0.5) {
        const th = deg * DEG;
        const r = coreRadius1(th) * s + 0.01;
        if (!inTri(Math.sin(th) * r, -Math.cos(th) * r)) continue;
        covered++;
        expect(isForbidden(th, FORBIDDEN_ZONES)).toBe(true);
      }
      expect(covered).toBeGreaterThan(10); // 빗이 실제로 표면을 덮고 있다(검사가 비어 있지 않음)
    }
  });

  it('E 빗 끝은 붓을 뗀 둥근 끝: 끝 폭 ≥ 뿌리 폭 75%, 시작 굵기 ≥ 0.06W, 위 가닥 기울기 0~5°', () => {
    for (const n of [0, 7]) {
      const st = combStrands(n, coreScale(n), COMB_REST);
      for (const k of st) {
        expect(k.widths[k.widths.length - 1]! / k.widths[1]!).toBeGreaterThanOrEqual(0.75);
        expect(k.widths[1]!).toBeGreaterThanOrEqual(0.059);
      }
      const top = st[0]!.pts;
      const a = Math.atan2(-(top[3]!.y - top[1]!.y), top[3]!.x - top[1]!.x) / DEG;
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(5);
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

describe('render-03 획 문법', () => {
  const s7 = coreScale(7);
  const sets = { 기준: day7Records, 서툰손: day7ClumsyRecords } as const;

  it('L2 돌출 상한: 7획 이하 0.33W, 30획 1.0W', () => {
    expect(protrusionCap(1)).toBeCloseTo(0.33, 6);
    expect(protrusionCap(7)).toBeCloseTo(0.33, 6);
    expect(protrusionCap(30)).toBeCloseTo(1.0, 6);
  });

  it('금지 자리 점 단위: 몸 가까이(0.3W 안) 획 점 중 금지 자리 ①·②에 든 비율이 획마다 15% 이하', () => {
    for (const [name, make] of Object.entries(sets)) {
      for (const level of [1, 2, 3] as const) {
        const recs = make(level);
        recs.forEach((rec, i) => {
          const pts = simplifyStroke(rec.raw);
          const local = strokeLocal(pts, rec.attach, rec.drawnAtCoreScale, rec.drawnAtCoreScale, 1);
          let near = 0;
          let bad = 0;
          for (const p of local) {
            if (coreSdf(p.x, p.y, rec.drawnAtCoreScale) > 0.3) continue;
            near++;
            if (isForbidden(angleOf(p.x, p.y), FORBIDDEN_ZONES)) bad++;
          }
          const r = near ? bad / near : 0;
          if (r > 0) console.info(`[금지 점] ${name} L${level} #${i}: ${(r * 100).toFixed(0)}%`);
          expect(r).toBeLessThanOrEqual(0.15);
        });
      }
    }
  });

  it('틈: 문법 B·C에서 몸에 붙은 구간(안쪽 가장자리가 몸에서 틈보다 가까운 곳)은 획마다 한 덩이, 길이 ≤ 0.3W', () => {
    // 앵커를 다시 찾지 않는 독립 기준: "틈 없이 몸에 닿은 점들"이 이어진 짧은 뿌리 하나뿐이어야 한다
    for (const id of ['B', 'C'] as const) {
      const g = GRAMMARS[id];
      for (const make of Object.values(sets)) {
        for (const rec of make(2)) {
          const sp = strokeSpine(rec, s7, 1, undefined, g);
          if (sp.label === 'base') continue; // 받침은 띄우지 않고 바닥 담묵으로 그린다
          const touch = sp.pts.map((p, i) => coreSdf(p.x, p.y, s7) - sp.widths[i]! / 2 < g.gap - 0.012);
          let runs = 0;
          let len = 0;
          for (let i = 0; i < touch.length; i++) {
            if (touch[i] && (i === 0 || !touch[i - 1])) runs++;
            if (i > 0 && touch[i] && touch[i - 1]) len += Math.hypot(sp.pts[i]!.x - sp.pts[i - 1]!.x, sp.pts[i]!.y - sp.pts[i - 1]!.y);
          }
          expect(runs).toBeLessThanOrEqual(1);
          // 앵커 양쪽 gapRamp 0.1W + 단순화 점 간격(긴 획은 0.09W 안팎)
          expect(len).toBeLessThanOrEqual(0.5);
        }
      }
    }
    // 판별력 확인: 틈을 끈 문법(스파이크 02와 같은 '붙은 획')에서는 같은 기준이 깨진다
    const noGap = { ...GRAMMARS.C, gap: 0 };
    let worst = 0;
    for (const rec of day7Records(2)) {
      const sp = strokeSpine(rec, s7, 1, undefined, noGap);
      if (sp.label === 'base') continue;
      let len = 0;
      for (let i = 1; i < sp.pts.length; i++) {
        const a = coreSdf(sp.pts[i]!.x, sp.pts[i]!.y, s7) - sp.widths[i]! / 2 < GRAMMARS.C.gap - 0.012;
        const b = coreSdf(sp.pts[i - 1]!.x, sp.pts[i - 1]!.y, s7) - sp.widths[i - 1]! / 2 < GRAMMARS.C.gap - 0.012;
        if (a && b) len += Math.hypot(sp.pts[i]!.x - sp.pts[i - 1]!.x, sp.pts[i]!.y - sp.pts[i - 1]!.y);
      }
      worst = Math.max(worst, len);
    }
    expect(worst).toBeGreaterThan(0.5);
  });

  /** 7일차 실루엣(핵 + 받침 아닌 획 + 빗)의 삼각형들 */
  function silhouetteTris(recs: ReturnType<typeof day7Records>, g: (typeof GRAMMARS)['C']): number[][] {
    const tris: number[][] = [];
    const push = (r: { positions: number[]; indices: number[] }) => {
      for (let i = 0; i < r.indices.length; i += 3) {
        const t: number[] = [];
        for (let k = 0; k < 3; k++) t.push(r.positions[r.indices[i + k]! * 2]!, r.positions[r.indices[i + k]! * 2 + 1]!);
        tris.push(t);
      }
    };
    for (const rec of recs) {
      const sp = strokeSpine(rec, s7, 1, undefined, g);
      if (sp.label === 'base') continue; // 받침은 몸 마스크 밖(바닥 담묵) — 실루엣에 안 들어간다
      push(buildRibbon(sp.pts, { ...sp.opts, widths: sp.widths }));
    }
    for (const st of combStrands(7, s7, COMB_REST)) push(buildRibbon(st.pts, { widths: st.widths }));
    return tris;
  }

  /** 실루엣을 격자(셀 0.004W, ±1.6W)에 칠한다 */
  function rasterize(tris: number[][]): { grid: Uint8Array; n: number; cell: number; span: number } {
    const span = 1.6;
    const cell = 0.005;
    const n = Math.round((span * 2) / cell);
    const grid = new Uint8Array(n * n);
    const toI = (v: number) => Math.floor((v + span) / cell);
    for (const t of tris) {
      const [ax, ay, bx, by, cx, cy] = t as [number, number, number, number, number, number];
      for (let j = Math.max(0, toI(Math.min(ay, by, cy))); j <= Math.min(n - 1, toI(Math.max(ay, by, cy))); j++)
        for (let i = Math.max(0, toI(Math.min(ax, bx, cx))); i <= Math.min(n - 1, toI(Math.max(ax, bx, cx))); i++) {
          const px = -span + (i + 0.5) * cell;
          const py = -span + (j + 0.5) * cell;
          const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
          const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
          const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
          if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) grid[j * n + i] = 1;
        }
    }
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) if (coreSdf(-span + (i + 0.5) * cell, -span + (j + 0.5) * cell, s7) < 0) grid[j * n + i] = 1;
    return { grid, n, cell, span };
  }

  /**
   * 톱니 수(리뷰 1-2 ⑦ '7일차 지표', 구현과 독립): 핵 중심에서 1° 간격 광선마다 실루엣의 가장 바깥 반지름 r(θ)를 재고,
   * 좌우 4° 안쪽보다 0.03W 이상 튀어나온 뾰족한 봉우리(폭 8° 미만)를 센다. 실처럼 빠진 가닥·털 끝일수록 많다.
   */
  function spikeCount(tris: number[][]): number {
    const { grid, n, cell, span } = rasterize(tris);
    const at = (x: number, y: number) => {
      const i = Math.floor((x + span) / cell);
      const j = Math.floor((y + span) / cell);
      return i >= 0 && j >= 0 && i < n && j < n && grid[j * n + i] === 1;
    };
    const r: number[] = [];
    for (let deg = 0; deg < 360; deg++) {
      const dx = Math.sin(deg * DEG);
      const dy = -Math.cos(deg * DEG);
      let out = 0;
      for (let q = 0; q <= 1.55; q += 0.003) if (at(dx * q, dy * q)) out = q;
      r.push(out);
    }
    let spikes = 0;
    for (let i = 0; i < 360; i++) {
      const v = r[i]!;
      let isMax = true;
      for (let k = -3; k <= 3; k++) if (k !== 0 && r[(i + k + 360) % 360]! > v) isMax = false;
      if (!isMax) continue;
      const side = Math.max(r[(i + 4) % 360]!, r[(i - 4 + 360) % 360]!);
      if (v - side >= 0.03) spikes++;
    }
    return spikes;
  }

  it('7일차 지표: 윤곽 톱니 = 빗 세 가닥뿐(스파이크 02식 가는 획은 더 많다), 핵 면적 — C는 서툰 손에서도 ≥ 78%(짙은 먹 ≥ 82%)', () => {
    for (const g of Object.values(GRAMMARS)) {
      for (const [name, make] of Object.entries(sets)) {
        const tris = silhouetteTris(make(2), g);
        const { union, core } = rasterArea(tris, 0.006, (x, y) => coreSdf(x, y, s7) < 0);
        // 짙은 먹 비율(리뷰 6번: 렌더 기준) = 핵 / (핵 + 획 바깥 면적 × 획 먹 농도). 담묵 획은 그 농도만큼만 '몸 덩어리'에 더해진다
        const ink = core / (core + (union - core) * (1 - g.tone));
        const tr = spikeCount(tris);
        console.info(`[7일차 ${g.id} ${name}] 핵 면적 ${((core / union) * 100).toFixed(1)}%, 짙은 먹 ${(ink * 100).toFixed(1)}%, 톱니 ${tr}`);
        expect(tr).toBeLessThanOrEqual(3); // 빗 세 가닥 끝만 뾰족하다
        // 채택안 C는 서툰 손에서도 마진: 기하 핵 면적 ≥ 78%(아트 75% + 3), 짙은 먹 ≥ 82%. 버린 안은 아트 하한만
        expect(core / union).toBeGreaterThanOrEqual(g.id === 'C' ? 0.78 : 0.75);
        if (g.id === 'C') expect(ink).toBeGreaterThanOrEqual(0.82);
      }
    }
    // 판별력: 스파이크 02의 가는 획(폭 0.075W, 끝 12%, 틈 0)을 같은 기준에 넣으면 실 가닥이 늘어난다
    const v02 = { ...GRAMMARS.C, baseWidth: 0.075, tailMin: 0.12, tailStart: 0.62, gap: 0 };
    const t02 = spikeCount(silhouetteTris(day7ClumsyRecords(2), v02));
    const tC = spikeCount(silhouetteTris(day7ClumsyRecords(2), GRAMMARS.C));
    console.info(`[톱니] 스파이크 02식 ${t02} vs C ${tC}`);
    expect(t02).toBeGreaterThan(tC);
  });

  it('L3 진짜 감기(50%): 몸 옆에 접선으로 그은 곧은 획이 L1보다 몸을 따라간다(최대 돌출 ≤ L1의 65%)', () => {
    const straight: RawPoint[] = Array.from({ length: 50 }, (_, i) => {
      const u = i / 49;
      return { x: -0.66, y: -0.3 + u * 0.8, t: u * 500 };
    });
    const pts = simplifyStroke(straight);
    const far = (level: 1 | 3) => {
      const a = attachStroke(straight, 1, level, 0);
      return maxProtrusion(strokeLocal(pts, a, 1, 1, 1), 1);
    };
    const f1 = far(1);
    const f3 = far(3);
    console.info(`[감기] L1 최대 돌출 ${f1.toFixed(3)}W → L3 ${f3.toFixed(3)}W`);
    expect(f3).toBeLessThanOrEqual(f1 * 0.65);
  });
});

describe('render-03 리뷰 반영: 바램 톤 단조성·하위 호환', () => {
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (h: string) => {
    const c = hex(h).map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };

  it('획의 나이가 많을수록 바탕 쪽으로 옅어진다: 몸 → 새 획(stroke-ink) → ink-mid → ink-faded → 바탕 (낮은 밝아짐, 밤은 어두워짐)', () => {
    const d = PALETTE.day;
    const seqD = [d.body, d.strokeInk, d.inkMid, d.inkFaded, d.bg].map(lum);
    for (let i = 1; i < seqD.length; i++) expect(seqD[i]!).toBeGreaterThan(seqD[i - 1]!);
    const n = PALETTE.night;
    const seqN = [n.body, n.strokeInk, n.inkMid, n.inkFaded, n.bg].map(lum);
    for (let i = 1; i < seqN.length; i++) expect(seqN[i]!).toBeLessThan(seqN[i - 1]!);
    // 밤 새 획은 몸과 1.5:1 이상 떨어진다(1.30:1이면 획이 몸의 부속물로 붙어 보였다)
    const cr = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    expect(cr(n.strokeInk, n.body)).toBeGreaterThanOrEqual(1.5);
  });

  it('채택안 C의 칠 농도가 stroke-ink 토큰과 같다(셰이더 mix(body, bg, tone) ±2/255)', () => {
    const g = GRAMMARS.C;
    for (const [pal, t] of [[PALETTE.day, g.tone], [PALETTE.night, g.toneNight]] as const) {
      const b = hex(pal.body);
      const bg = hex(pal.bg);
      const want = hex(pal.strokeInk);
      for (let i = 0; i < 3; i++) expect(Math.abs(b[i]! + (bg[i]! - b[i]!) * t - want[i]!)).toBeLessThanOrEqual(2);
    }
  });

  it('attachVersion 1 기록은 옛 L3(반경 압축 bend)로 그린다 — 새 감기와 다르고 옛 경로와 같다', () => {
    expect(ATTACH_VERSION).toBe(2);
    const raw: RawPoint[] = Array.from({ length: 50 }, (_, i) => {
      const u = i / 49;
      return { x: -0.66, y: -0.3 + u * 0.8, t: u * 500 };
    });
    const pts = simplifyStroke(raw);
    const a2 = attachStroke(raw, 1, 3, 0);
    const a1 = { ...a2, attachVersion: 1, bend: 0.3 };
    // 옛 경로를 손으로: 강체 배치 → polarOf(bend 반경 압축) → polarToLocal
    const placed = placePoints(pts, a1, 1, 1);
    let ai = 0;
    let bd = 9;
    pts.forEach((p, i) => {
      const d = Math.hypot(p.x - a1.ax, p.y - a1.ay);
      if (d < bd) { bd = d; ai = i; }
    });
    const want = polarToLocal(polarOf(placed, 1, 0.3, ai), 1);
    const got1 = strokeLocal(pts, a1, 1, 1, 1);
    got1.forEach((p, i) => {
      expect(p.x).toBeCloseTo(want[i]!.x, 9);
      expect(p.y).toBeCloseTo(want[i]!.y, 9);
    });
    const got2 = strokeLocal(pts, a2, 1, 1, 1);
    let diff = 0;
    got2.forEach((p, i) => (diff = Math.max(diff, Math.hypot(p.x - got1[i]!.x, p.y - got1[i]!.y))));
    expect(diff).toBeGreaterThan(0.01);
  });
});
