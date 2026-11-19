// 정본 점열 정리와 파생 단순화(RDP → Catmull-Rom ≤64). worklet 호환: 배열·숫자만.
import { STROKE } from '../visual/bodySpec';
import type { RawPoint } from './types';

/** D-13 상한: 6초에서 자르고, 512점을 넘으면 시간 균등으로 솎는다 */
export function capRaw(raw: readonly RawPoint[]): RawPoint[] {
  'worklet';
  const cut: RawPoint[] = [];
  for (let i = 0; i < raw.length; i++) if (raw[i]!.t <= STROKE.maxMs) cut.push(raw[i]!);
  if (cut.length <= STROKE.maxPoints) return cut;
  const n = STROKE.maxPoints;
  const t0 = cut[0]!.t;
  const t1 = cut[cut.length - 1]!.t;
  const out: RawPoint[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const target = t0 + ((t1 - t0) * i) / (n - 1);
    while (j < cut.length - 1 && cut[j + 1]!.t <= target) j++;
    const a = cut[j]!;
    const b = cut[Math.min(j + 1, cut.length - 1)]!;
    const pick = Math.abs(a.t - target) <= Math.abs(b.t - target) ? a : b;
    if (out.length === 0 || out[out.length - 1] !== pick) out.push(pick);
  }
  return out;
}

/** 화면 px 점열 → 핵 중심·W 단위 정본 점열(t는 첫 점 기준 ms) */
export function normalizeRaw(
  pts: readonly { x: number; y: number; t: number; p?: number }[],
  coreX: number,
  coreY: number,
  wPx: number,
): RawPoint[] {
  'worklet';
  const out: RawPoint[] = [];
  if (pts.length === 0) return out;
  const t0 = pts[0]!.t;
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i]!;
    const r: RawPoint = { x: (q.x - coreX) / wPx, y: (q.y - coreY) / wPx, t: q.t - t0 };
    if (q.p !== undefined) r.p = q.p;
    out.push(r);
  }
  return capRaw(out);
}

/** 떨림 제거: 가중 이동 평균(끝점 고정) */
export function dejitter(raw: readonly RawPoint[], radius: number): RawPoint[] {
  'worklet';
  const n = raw.length;
  const out: RawPoint[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0 || i === n - 1 || radius <= 0) {
      out.push({ ...raw[i]! });
      continue;
    }
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = Math.min(n - 1, Math.max(0, i + k));
      const w = radius + 1 - Math.abs(k);
      sx += raw[j]!.x * w;
      sy += raw[j]!.y * w;
      sw += w;
    }
    out.push({ ...raw[i]!, x: sx / sw, y: sy / sw });
  }
  return out;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  'worklet';
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = ax + vx * t - px;
  const dy = ay + vy * t - py;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Ramer–Douglas–Peucker(반복형, 재귀 없음) */
export function rdp(pts: readonly RawPoint[], eps: number): RawPoint[] {
  'worklet';
  const n = pts.length;
  if (n <= 2) return pts.map((p) => ({ ...p }));
  const keep: boolean[] = new Array(n).fill(false);
  keep[0] = true;
  keep[n - 1] = true;
  const stack: number[] = [0, n - 1];
  while (stack.length > 0) {
    const hi = stack.pop()!;
    const lo = stack.pop()!;
    let best = -1;
    let bestD = eps;
    const a = pts[lo]!;
    const b = pts[hi]!;
    for (let i = lo + 1; i < hi; i++) {
      const d = segDist(pts[i]!.x, pts[i]!.y, a.x, a.y, b.x, b.y);
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = true;
      stack.push(lo, best, best, hi);
    }
  }
  const out: RawPoint[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push({ ...pts[i]! });
  return out;
}

/** centripetal Catmull-Rom 위 한 점 */
function crPoint(p0: RawPoint, p1: RawPoint, p2: RawPoint, p3: RawPoint, u: number): RawPoint {
  'worklet';
  const d01 = Math.max(Math.pow(Math.hypot(p1.x - p0.x, p1.y - p0.y), 0.5), 1e-4);
  const d12 = Math.max(Math.pow(Math.hypot(p2.x - p1.x, p2.y - p1.y), 0.5), 1e-4);
  const d23 = Math.max(Math.pow(Math.hypot(p3.x - p2.x, p3.y - p2.y), 0.5), 1e-4);
  // 탄젠트(Barry–Goldman 형식을 Hermite로)
  const m1x = (p2.x - p1.x + d12 * ((p1.x - p0.x) / d01 - (p2.x - p0.x) / (d01 + d12))) * 1;
  const m1y = (p2.y - p1.y + d12 * ((p1.y - p0.y) / d01 - (p2.y - p0.y) / (d01 + d12))) * 1;
  const m2x = p2.x - p1.x + d12 * ((p3.x - p2.x) / d23 - (p3.x - p1.x) / (d12 + d23));
  const m2y = p2.y - p1.y + d12 * ((p3.y - p2.y) / d23 - (p3.y - p1.y) / (d12 + d23));
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  const pa = p1.p ?? 0.5;
  const pb = p2.p ?? 0.5;
  const r: RawPoint = {
    x: h00 * p1.x + h10 * m1x + h01 * p2.x + h11 * m2x,
    y: h00 * p1.y + h10 * m1y + h01 * p2.y + h11 * m2y,
    t: p1.t + (p2.t - p1.t) * u,
  };
  if (p1.p !== undefined || p2.p !== undefined) r.p = pa + (pb - pa) * u;
  return r;
}

/** 조밀하게 Catmull-Rom을 따라간 뒤 호 길이 균등으로 n점 재표본 */
export function catmullResample(ctrl: readonly RawPoint[], n: number, sub: number): RawPoint[] {
  'worklet';
  if (ctrl.length < 2) return ctrl.map((p) => ({ ...p }));
  const dense: RawPoint[] = [];
  const m = ctrl.length;
  for (let i = 0; i < m - 1; i++) {
    const p0 = ctrl[Math.max(i - 1, 0)]!;
    const p1 = ctrl[i]!;
    const p2 = ctrl[i + 1]!;
    const p3 = ctrl[Math.min(i + 2, m - 1)]!;
    // 끝 구간 가상 점: 반사해서 끝 곡률이 튀지 않게
    const q0 = i === 0 ? { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y, t: p1.t } : p0;
    const q3 = i + 2 > m - 1 ? { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y, t: p2.t } : p3;
    for (let s = 0; s < sub; s++) dense.push(crPoint(q0, p1, p2, q3, s / sub));
  }
  dense.push({ ...ctrl[m - 1]! });
  const acc: number[] = [0];
  for (let i = 1; i < dense.length; i++) {
    acc.push(acc[i - 1]! + Math.hypot(dense[i]!.x - dense[i - 1]!.x, dense[i]!.y - dense[i - 1]!.y));
  }
  const total = acc[acc.length - 1]!;
  if (total <= 1e-6) return [{ ...dense[0]! }];
  const out: RawPoint[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (j < dense.length - 2 && acc[j + 1]! < target) j++;
    const seg = acc[j + 1]! - acc[j]!;
    const u = seg > 0 ? (target - acc[j]!) / seg : 0;
    const a = dense[j]!;
    const b = dense[j + 1]!;
    const r: RawPoint = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, t: a.t + (b.t - a.t) * u };
    if (a.p !== undefined && b.p !== undefined) r.p = a.p + (b.p - a.p) * u;
    out.push(r);
  }
  return out;
}

export function polylineLength(pts: readonly { x: number; y: number }[]): number {
  'worklet';
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return L;
}

/** 메시 버전별 단순화 설정. 옛 버전은 마이그레이션 테스트용으로 남긴다(D-13) */
export const SIMPLIFY_VERSIONS: Record<number, { jitter: number; eps: number; spacing: number; sub: number }> = {
  1: { jitter: 1, eps: 0.006, spacing: 0.03, sub: 6 },
  2: { jitter: 2, eps: 0.004, spacing: 0.024, sub: 8 },
};
export const CURRENT_MESH_VERSION = 2;

/** 파생 단순화 점열(≤max). 같은 raw + 같은 버전 → 같은 결과 */
export function simplifyStroke(raw: readonly RawPoint[], max: number = STROKE.simplifiedMax, meshVersion: number = CURRENT_MESH_VERSION): RawPoint[] {
  'worklet';
  if (raw.length === 0) return [];
  const cfg = SIMPLIFY_VERSIONS[meshVersion] ?? SIMPLIFY_VERSIONS[CURRENT_MESH_VERSION]!;
  // 같은 자리에 겹친 점 제거
  const uniq: RawPoint[] = [raw[0]!];
  for (let i = 1; i < raw.length; i++) {
    const q = uniq[uniq.length - 1]!;
    if (Math.hypot(raw[i]!.x - q.x, raw[i]!.y - q.y) > 1e-4) uniq.push(raw[i]!);
  }
  if (uniq.length === 1) return [{ ...uniq[0]! }];
  const smooth = dejitter(uniq, cfg.jitter);
  let eps = cfg.eps;
  let ctrl = rdp(smooth, eps);
  while (ctrl.length > max) {
    eps *= 1.5;
    ctrl = rdp(smooth, eps);
  }
  const L = polylineLength(smooth);
  const n = Math.max(2, Math.min(max, Math.ceil(L / cfg.spacing) + 1));
  return catmullResample(ctrl, n, cfg.sub);
}
