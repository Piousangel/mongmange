// 눈 = 몸 마스크에서 빼는 두 구멍(낮). 표정은 같은 32점 구조의 다각형 사이 보간이라 경로 보간이 매끄럽다.
// 점 순서: 앞 16점 = 위 가장자리(왼→오), 뒤 16점 = 아래 가장자리(오→왼).
import { EYE } from '../visual/bodySpec';
import { CORE, type CoreParams } from './core';

export type EyeKind = 'open' | 'joy' | 'sleepy' | 'surprised' | 'closed';
export const EYE_POINTS = 32;
const HALF = 16;

function arcEdge(out: number[], cx: number, cy: number, r: number, a0: number, a1: number) {
  'worklet';
  for (let i = 0; i < HALF; i++) {
    const a = a0 + ((a1 - a0) * i) / (HALF - 1);
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
}

/** 표정 하나의 눈 다각형(눈 중심 기준, W) */
export function eyeShape(kind: EyeKind): number[] {
  'worklet';
  const r = EYE.diameter / 2;
  const out: number[] = [];
  if (kind === 'open' || kind === 'surprised') {
    const rr = kind === 'open' ? r : r * EYE.surprisedScale;
    arcEdge(out, 0, 0, rr, Math.PI, Math.PI * 2); // 위 반원(왼→오)
    arcEdge(out, 0, 0, rr, 0, Math.PI); // 아래 반원(오→왼)
    return out;
  }
  if (kind === 'joy') {
    // 위로 볼록한 호(^), 두께 0.035W
    const R = r * 0.95;
    const t = EYE.joyThickness;
    const cy = R * 0.55;
    arcEdge(out, 0, cy, R + t / 2, Math.PI * 1.08, Math.PI * 1.92);
    arcEdge(out, 0, cy, R - t / 2, Math.PI * 1.92, Math.PI * 1.08);
    return out;
  }
  if (kind === 'closed') {
    // 아래로 볼록한 감은 호(‿) — 밤
    const R = r * 0.95;
    const t = EYE.joyThickness * 0.9;
    const cy = -R * 0.45;
    arcEdge(out, 0, cy, R - t / 2, Math.PI * 0.92, Math.PI * 0.08);
    arcEdge(out, 0, cy, R + t / 2, Math.PI * 0.08, Math.PI * 0.92);
    // 앞 16점이 위 가장자리(왼→오)가 되도록: 0.92π(왼쪽) → 0.08π(오른쪽)
    return out;
  }
  // sleepy: 가로선(길이 0.16W), 둥근 끝
  const L = EYE.sleepyLength / 2;
  const t = 0.028 / 2;
  for (let i = 0; i < HALF; i++) {
    const u = i / (HALF - 1);
    const x = -L + 2 * L * u;
    const e = Math.min(u, 1 - u) * 2 * L;
    const yy = e < t ? Math.sqrt(Math.max(t * t - (t - e) * (t - e), 0)) : t;
    out.push(x, -yy);
  }
  for (let i = 0; i < HALF; i++) {
    const u = i / (HALF - 1);
    const x = L - 2 * L * u;
    const e = Math.min(u, 1 - u) * 2 * L;
    const yy = e < t ? Math.sqrt(Math.max(t * t - (t - e) * (t - e), 0)) : t;
    out.push(x, yy);
  }
  return out;
}

const SHAPES: Record<EyeKind, number[]> = {
  open: eyeShape('open'),
  joy: eyeShape('joy'),
  sleepy: eyeShape('sleepy'),
  surprised: eyeShape('surprised'),
  closed: eyeShape('closed'),
};

export function eyeShapeCached(kind: EyeKind): number[] {
  'worklet';
  return SHAPES[kind];
}

/** a → b 보간 후 깜빡임(먹이 위에서 흘러내려 덮음: 위 가장자리가 내려와 아래와 만난다) */
export function eyeMix(a: readonly number[], b: readonly number[], t: number, blink: number): number[] {
  'worklet';
  const out: number[] = new Array(a.length);
  let top = 1e9;
  let bot = -1e9;
  for (let i = 0; i < a.length; i += 2) {
    const x = a[i]! + (b[i]! - a[i]!) * t;
    const y = a[i + 1]! + (b[i + 1]! - a[i + 1]!) * t;
    out[i] = x;
    out[i + 1] = y;
    top = Math.min(top, y);
    bot = Math.max(bot, y);
  }
  if (blink > 0) {
    const edge = top + (bot - top) * Math.min(blink, 1);
    for (let i = 1; i < out.length; i += 2) out[i] = Math.max(out[i]!, edge);
  }
  return out;
}

/** 두 눈 중심(크기 1 핵, W). 중심 높이 = 바닥에서 몸 높이의 38%, 간격 0.42W, 앞 기울기만큼 x 보정 */
export function eyeCenters(pIn?: CoreParams): { lx: number; rx: number; y: number } {
  'worklet';
  // M1 체형: 눈 높이는 그 개체의 몸 높이 38%(간격 0.42W는 타고남에 넣지 않는다 — 아트 1-1)
  const p = pIn ?? CORE;
  const y = p.h / 2 - p.h * EYE.heightFrac;
  const leanAtY = (p.lean * (p.h / 2 - y)) / p.h;
  return { lx: -EYE.spacing / 2 + leanAtY, rx: EYE.spacing / 2 + leanAtY, y };
}
