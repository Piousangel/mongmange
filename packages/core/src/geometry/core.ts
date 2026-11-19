// 핵(먹 방울) 모양 — 해석적 SDF 하나로 CPU(부착·극좌표)와 GPU(셰이더 후보 B)가 같은 몸을 쓴다.
// 순수 함수·배열 연산만(worklet 호환). 단위 W, 핵 중심 원점, y 아래.
import { BODY, FORBIDDEN } from '../visual/bodySpec';

export interface CoreParams {
  /** 반폭 a, 타원 세로 반축 b, 타원 중심 y(c), 몸 높이 h, 앞 기울기, 바닥 둥글림 */
  a: number;
  b: number;
  c: number;
  h: number;
  lean: number;
  round: number;
}

/** 아트 1-1 수치(폭 1, 폭:높이, 바닥 현)에서 타원 + 평평한 바닥을 푼다 */
export function coreParams(aspectIn?: number): CoreParams {
  'worklet';
  const aspect = aspectIn ?? BODY.aspect;
  const a = 0.5;
  const h = 1 / aspect;
  const half = BODY.bottomChord / 2;
  const q = Math.sqrt(1 - (half / a) * (half / a));
  const b = h / (1 + q);
  const c = b - h / 2;
  return { a, b, c, h, lean: BODY.forwardLean, round: BODY.bottomRound };
}

export const CORE: CoreParams = coreParams();

/** 정수리(타원 꼭대기) 곡률 반경 = a²/b */
export function crownRadius(pIn?: CoreParams): number {
  'worklet';
  const p = pIn ?? CORE;
  return (p.a * p.a) / p.b;
}

/** 크기 1 핵의 부호 거리(안쪽 음수). 타원 근사 거리 + 바닥 평면을 smooth-max로 합친다 */
export function coreSdf1(x: number, y: number, pIn?: CoreParams): number {
  'worklet';
  const p = pIn ?? CORE;
  const px = x - (p.lean * (p.h / 2 - y)) / p.h;
  const py = y - p.c;
  const k0 = Math.sqrt((px / p.a) * (px / p.a) + (py / p.b) * (py / p.b));
  const k1 = Math.sqrt((px / (p.a * p.a)) * (px / (p.a * p.a)) + (py / (p.b * p.b)) * (py / (p.b * p.b)));
  const de = k1 < 1e-6 ? -Math.min(p.a, p.b) : (k0 * (k0 - 1)) / k1;
  const db = y - p.h / 2;
  const k = p.round;
  const hh = Math.max(k - Math.abs(de - db), 0) / k;
  return Math.max(de, db) + (hh * hh * k) / 4;
}

/** 크기 s 핵의 부호 거리 */
export function coreSdf(x: number, y: number, s: number, pIn?: CoreParams): number {
  'worklet';
  const p = pIn ?? CORE;
  return s * coreSdf1(x / s, y / s, p);
}

/** θ 방향 단위 벡터(0 = 위, 시계 방향 = 앞) */
export function dirX(theta: number): number {
  'worklet';
  return Math.sin(theta);
}
export function dirY(theta: number): number {
  'worklet';
  return -Math.cos(theta);
}

/** 점의 핵 각도 θ(−π..π] */
export function angleOf(x: number, y: number): number {
  'worklet';
  return Math.atan2(x, -y);
}

/** 크기 1 핵에서 중심 → θ 방향 광선이 표면과 만나는 거리 */
export function coreRadius1(theta: number, pIn?: CoreParams): number {
  'worklet';
  const p = pIn ?? CORE;
  const dx = Math.sin(theta);
  const dy = -Math.cos(theta);
  let lo = 0;
  let hi = 1.2;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) * 0.5;
    if (coreSdf1(dx * mid, dy * mid, p) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 0.5;
}

/** 각도를 [0, 2π)로 */
export function wrap2pi(a: number): number {
  'worklet';
  const t = Math.PI * 2;
  return ((a % t) + t) % t;
}

/** 각도를 (−π, π]로 */
export function wrapPi(a: number): number {
  'worklet';
  const t = Math.PI * 2;
  let r = ((a % t) + t) % t;
  if (r > Math.PI) r -= t;
  return r;
}

/** D-12 금지 자리 안인가 */
export function isForbidden(theta: number, zonesIn?: readonly (readonly [number, number])[]): boolean {
  'worklet';
  const zones = zonesIn ?? FORBIDDEN;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i]!;
    const lo = z[0];
    const hi = z[1];
    const t = lo < 0 ? wrapPi(theta) : wrap2pi(theta);
    if (t >= lo && t <= hi) return true;
  }
  return false;
}

/** 금지 자리면 가장 가까운 허용 경계(+여유)로 미끄러뜨린다 */
export function nearestAllowed(
  theta: number,
  margin: number = (6 * Math.PI) / 180,
  zonesIn?: readonly (readonly [number, number])[],
): number {
  'worklet';
  const zones = zonesIn ?? FORBIDDEN;
  if (!isForbidden(theta, zones)) return wrapPi(theta);
  let best = theta;
  let bestD = 1e9;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i]!;
    const cands = [z[0] - margin, z[1] + margin];
    for (let j = 0; j < 2; j++) {
      const c = cands[j]!;
      const d = Math.abs(wrapPi(c - theta));
      if (d < bestD && !isForbidden(c, zones)) {
        bestD = d;
        best = c;
      }
    }
  }
  return wrapPi(best);
}

/** 핵 윤곽 다각형(크기 s). [x0, y0, x1, y1, ...] — 렌더 경로·마스크용 */
export function coreOutline(s: number, n: number = 144, pIn?: CoreParams): number[] {
  'worklet';
  const p = pIn ?? CORE;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const r = coreRadius1(th, p) * s;
    out.push(Math.sin(th) * r, -Math.cos(th) * r);
  }
  return out;
}

/** 다각형 넓이(신발끈) */
export function polygonArea(flat: readonly number[]): number {
  'worklet';
  let a = 0;
  const n = flat.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += flat[i * 2]! * flat[j * 2 + 1]! - flat[j * 2]! * flat[i * 2 + 1]!;
  }
  return Math.abs(a) / 2;
}
