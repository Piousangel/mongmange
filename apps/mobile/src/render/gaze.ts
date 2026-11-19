import { EYE } from '@mong/core';
import { ease } from './clock';

/** 시선 사건: 마지막 터치 지점을 at+200ms부터 보다가 hold 뒤 400ms에 걸쳐 정면 복귀(아트 2-1·8절) */
export interface Gaze {
  x: number;
  y: number;
  at: number;
  holdMs: number;
}

export const NO_GAZE: Gaze = { x: 0, y: 0, at: -1e9, holdMs: 0 };

/** 눈 이동(W)과 몸 기울기(rad, 최대 6°) */
export function gazeOffset(g: Gaze, t: number, ox: number, oy: number, wpx: number): { gx: number; gy: number; tilt: number } {
  'worklet';
  const dt = t - g.at - 200;
  if (dt < 0) return { gx: 0, gy: 0, tilt: 0 };
  const inK = ease(dt / 220);
  const outK = 1 - ease((dt - g.holdMs) / 400);
  const k = Math.min(inK, outK);
  if (k <= 0) return { gx: 0, gy: 0, tilt: 0 };
  const dx = (g.x - ox) / wpx;
  const dy = (g.y - oy) / wpx;
  const L = Math.hypot(dx, dy) || 1;
  const m = Math.min(L / 1.5, 1) * EYE.gazeMax;
  return { gx: (dx / L) * m * k, gy: (dy / L) * m * k, tilt: Math.max(-1, Math.min(1, dx / 3)) * ((6 * Math.PI) / 180) * k };
}
