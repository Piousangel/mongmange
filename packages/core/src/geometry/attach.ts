// D-12 "모양은 손, 자리는 몸": 회전 + 이동(+L2 균일 축소, L3 둘레 휨)만으로 획을 핵 표면에 붙인다.
// 결정적: 같은 raw·같은 핵 크기·같은 단계 → 같은 Attach. worklet 호환(배열·숫자만).
import { STROKE, protrusionCap } from '../visual/bodySpec';
import { CORE, angleOf, coreRadius1, coreSdf, isForbidden, nearestAllowed, wrapPi } from './core';
import { simplifyStroke } from './simplify';
import type { Attach, AttachLevel, RawPoint } from './types';

export const ATTACH_VERSION = 1;
/** 부착 판정은 메시 버전과 무관하게 고정된 단순화(v1)로 한다 — 메시를 고쳐도 자리가 바뀌지 않게 */
const ATTACH_SIMPLIFY_VERSION = 1;
const DEG = Math.PI / 180;
/** 크기 1 핵 정수리 높이(−y) */
const CORE_TOP = CORE.h / 2;

export interface PolarPoint {
  theta: number;
  /** 핵 표면에서 바깥쪽 거리(그을 때 W 단위), 광선 기준 */
  d: number;
  /** 크기 1 핵의 그 방향 반지름(캐시) */
  r1: number;
  t: number;
  p?: number;
}

/** 크기 s 핵 표면 위 θ 점 */
export function surfaceX(theta: number, s: number): number {
  'worklet';
  return Math.sin(theta) * coreRadius1(theta) * s;
}
export function surfaceY(theta: number, s: number): number {
  'worklet';
  return -Math.cos(theta) * coreRadius1(theta) * s;
}

/** θ에서 표면 접선(θ가 커지는 쪽 = 시계 방향) 각도(화면 atan2(y, x)) */
function tangentAngle(theta: number, s: number): number {
  'worklet';
  const h = 0.5 * DEG;
  const x0 = surfaceX(theta - h, s);
  const y0 = surfaceY(theta - h, s);
  const x1 = surfaceX(theta + h, s);
  const y1 = surfaceY(theta + h, s);
  return Math.atan2(y1 - y0, x1 - x0);
}

/** 변환 k(0..1, 애니메이션 진행)를 적용한 점. 행렬 보간: 이동·회전·축소를 각각 선형 보간 */
export function placePoints(pts: readonly RawPoint[], a: Attach, s: number, k: number): RawPoint[] {
  'worklet';
  const tx = surfaceX(a.theta, s) + Math.sin(a.theta) * STROKE.anchorInset;
  const ty = surfaceY(a.theta, s) - Math.cos(a.theta) * STROKE.anchorInset;
  const ox = a.ax + (tx - a.ax) * k;
  const oy = a.ay + (ty - a.ay) * k;
  const r = a.rot * k;
  const sc = 1 + (a.scale - 1) * k;
  const c = Math.cos(r);
  const sn = Math.sin(r);
  const out: RawPoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const dx = (p.x - a.ax) * sc;
    const dy = (p.y - a.ay) * sc;
    const q: RawPoint = { x: ox + c * dx - sn * dy, y: oy + sn * dx + c * dy, t: p.t };
    if (p.p !== undefined) q.p = p.p;
    out.push(q);
  }
  return out;
}

/** 놓인 점 → 핵 극좌표. bendK = 실제로 적용할 둘레 휨(0..0.3) */
export function polarOf(pts: readonly RawPoint[], s: number, bendK: number, anchorIndex: number): PolarPoint[] {
  'worklet';
  const out: PolarPoint[] = [];
  // 앵커에서 잰 호 길이 비율(휨 가중치)
  const acc: number[] = new Array(pts.length).fill(0);
  for (let i = anchorIndex + 1; i < pts.length; i++) acc[i] = acc[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  for (let i = anchorIndex - 1; i >= 0; i--) acc[i] = acc[i + 1]! + Math.hypot(pts[i]!.x - pts[i + 1]!.x, pts[i]!.y - pts[i + 1]!.y);
  let maxAcc = 1e-6;
  for (let i = 0; i < acc.length; i++) maxAcc = Math.max(maxAcc, acc[i]!);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const th = angleOf(p.x, p.y);
    const r1 = coreRadius1(th);
    let d = Math.hypot(p.x, p.y) - r1 * s;
    if (d > 0 && bendK > 0) d *= 1 - bendK * (acc[i]! / maxAcc);
    const q: PolarPoint = { theta: th, d, r1, t: p.t };
    if (p.p !== undefined) q.p = p.p;
    out.push(q);
  }
  return out;
}

/** 극좌표 → 지금 핵 크기의 로컬 좌표. 핵이 자라도 표면에 붙은 점은 표면에 남는다(시스템 4.2) */
export function polarToLocal(polar: readonly PolarPoint[], sNow: number): RawPoint[] {
  'worklet';
  const out: RawPoint[] = [];
  for (let i = 0; i < polar.length; i++) {
    const q = polar[i]!;
    const rr = Math.max(q.r1 * sNow + q.d, 0.001);
    const p: RawPoint = { x: Math.sin(q.theta) * rr, y: -Math.cos(q.theta) * rr, t: q.t };
    if (q.p !== undefined) p.p = q.p;
    out.push(p);
  }
  return out;
}

function nearestIndex(pts: readonly RawPoint[], a: Attach): number {
  'worklet';
  let best = 0;
  let bd = 1e9;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i]!.x - a.ax, pts[i]!.y - a.ay);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/**
 * 단순화 점열을 부착 진행 k로 놓고 지금 핵 크기에 맞춘 로컬 점열.
 * sThen = 그을 때 핵 크기, sNow = 지금 핵 크기.
 */
export function strokeLocal(pts: readonly RawPoint[], a: Attach, sThen: number, sNow: number, k: number): RawPoint[] {
  'worklet';
  const placed = placePoints(pts, a, sThen, k);
  if (k === 0 && sNow === sThen) return placed;
  const polar = polarOf(placed, sThen, a.bend * k, nearestIndex(pts, a));
  return polarToLocal(polar, sNow);
}

/** 정본 → 극좌표(시스템 7 스케치 시그니처) */
export function toCorePolar(raw: readonly RawPoint[], a: Attach, coreScaleThen: number, meshVersion?: number): PolarPoint[] {
  'worklet';
  const pts = simplifyStroke(raw, STROKE.simplifiedMax, meshVersion);
  const placed = placePoints(pts, a, coreScaleThen, 1);
  return polarOf(placed, coreScaleThen, a.bend, nearestIndex(pts, a));
}

interface Score {
  cost: number;
  theta: number;
  rot: number;
}

/**
 * D-12 부착. n = 이 획 전에 그은 획 수(돌출 상한 단계용).
 * 회전 중심 = 몸에 가장 가까운 점. 자리 후보(θ ± 48°)·접선 두 방향·회전 여유(±24°)를 결정적으로 훑어
 * 몸을 감싸고(안으로 묻히지 않고, 멀리 뜨지 않고) 금지 자리를 피하며 손이 그은 자리·방향에서 덜 움직이는 것을 고른다.
 */
export function attachStroke(raw: readonly RawPoint[], s: number, level: AttachLevel, n: number = 0): Attach {
  'worklet';
  const pts = simplifyStroke(raw, STROKE.simplifiedMax, ATTACH_SIMPLIFY_VERSION);
  const base: Attach = { level, attachVersion: ATTACH_VERSION, ax: 0, ay: 0, theta: 0, rot: 0, scale: 1, bend: 0, taper: 0 };
  if (pts.length === 0) return base;
  let ai = 0;
  let best = 1e9;
  for (let i = 0; i < pts.length; i++) {
    const d = coreSdf(pts[i]!.x, pts[i]!.y, s);
    if (d < best) {
      best = d;
      ai = i;
    }
  }
  const A = pts[ai]!;
  base.ax = A.x;
  base.ay = A.y;
  const theta0 = angleOf(A.x, A.y);
  // 획 몸 방향: 앵커 → 무게 중심(앵커가 끝점이 아니어도 동작)
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    cx += pts[i]!.x;
    cy += pts[i]!.y;
  }
  cx /= pts.length;
  cy /= pts.length;
  let dirA = Math.atan2(cy - A.y, cx - A.x);
  if (Math.hypot(cx - A.x, cy - A.y) < 0.01) {
    const L = pts[pts.length - 1]!;
    const F = pts[0]!;
    dirA = Math.atan2(L.y - F.y, L.x - F.x);
  }

  let pick: Score = { cost: 1e9, theta: nearestAllowed(theta0), rot: 0 };
  const probe: Attach = { ...base };
  for (let kt = -6; kt <= 6; kt++) {
    const thRaw = theta0 + kt * 8 * DEG;
    const th = nearestAllowed(thRaw);
    if (kt !== 0 && Math.abs(wrapPi(th - thRaw)) > 1e-6) continue; // 금지 자리 후보는 경계 하나로만 대표
    const tan = tangentAngle(th, s);
    // 회전 후보: 접선 정렬(두 방향) ± 여유, 그리고 손이 그은 방향 그대로(0) 근처
    const rots: number[] = [];
    for (let o = 0; o < 2; o++) {
      const r0 = wrapPi(tan + (o === 0 ? 0 : Math.PI) - dirA);
      for (let kr = -4; kr <= 4; kr++) rots.push(r0 + kr * 6 * DEG);
    }
    for (let kr = -3; kr <= 3; kr++) rots.push(kr * 12 * DEG);
    for (let ri = 0; ri < rots.length; ri++) {
      const rot = rots[ri]!;
      probe.theta = th;
      probe.rot = rot;
      const q = placePoints(pts, probe, s, 1);
      let inside = 0;
      let far = 0;
      let forb = 0;
      let crown = 0;
      let farMax = 0;
      for (let i = 0; i < q.length; i++) {
        const sd = coreSdf(q[i]!.x, q[i]!.y, s);
        // 몸을 감싸는 자리 = 리본 안쪽 가장자리가 표면에 닿는 거리(+0.04W)
        const e = sd - 0.04;
        inside += Math.max(0, -e);
        far += Math.max(0, e);
        farMax = Math.max(farMax, e);
        const ang = angleOf(q[i]!.x, q[i]!.y);
        if (sd < 0.6 && isForbidden(ang)) forb += 1;
        // 정수리보다 위로 솟는 점(귀·볏·꼬리로 읽힘)
        crown += Math.max(0, -(q[i]!.y + (CORE_TOP + 0.02) * s));
      }
      inside /= q.length;
      far /= q.length;
      forb /= q.length;
      crown /= q.length;
      const move = Math.abs(wrapPi(th - theta0)) * 0.3 + Math.abs(wrapPi(rot)) * 0.08;
      const cost = inside * 5 + far * 2.5 + farMax * 0.8 + forb * 2 + crown * 8 + move;
      if (cost < pick.cost - 1e-12) pick = { cost, theta: th, rot };
    }
  }
  const out: Attach = { ...base, theta: pick.theta, rot: wrapPi(pick.rot) };
  if (level >= 2) {
    const cap = protrusionCap(n + 1);
    for (let it = 0; it < 4; it++) {
      const q = placePoints(pts, out, s, 1);
      let prot = 0;
      for (let i = 0; i < q.length; i++) prot = Math.max(prot, coreSdf(q[i]!.x, q[i]!.y, s));
      if (prot <= cap * 1.001) break;
      out.scale = out.scale * (cap / prot);
      out.taper = 1;
    }
  }
  if (level >= 3) out.bend = 0.3;
  return out;
}

/** 놓인 획의 최대 돌출(W) — 검증·디버그용 */
export function maxProtrusion(local: readonly RawPoint[], s: number): number {
  'worklet';
  let m = -1e9;
  for (let i = 0; i < local.length; i++) m = Math.max(m, coreSdf(local[i]!.x, local[i]!.y, s));
  return m;
}
