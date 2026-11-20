// v1.2 앱 흐름: 금지 자리 ①(정수리·빗 뿌리)에 그은 짧은 획은 가장 가까운 허용 경계 곁에 붙고, 바닥 띠(받침)로 흘러내리지 않는다.
import { describe, expect, it } from 'vitest';
import {
  CURRENT_MESH_VERSION,
  angleOf,
  attachStroke,
  coreScale,
  day7ClumsyRecords,
  isForbiddenNow,
  nearestAllowedNow,
  quantizeRaw,
  shapeOf,
  BASE_SHAPE,
  coreParams,
  deriveForbidden,
  slideOf,
  strokeSpine,
  wrapPi,
  type BodyShape,
  type RawPoint,
} from '../src/index';

const DEG = Math.PI / 180;

function line(deg: number, R: number, L: number, dirOff: number, s: number): RawPoint[] {
  const th = deg * DEG;
  const x0 = Math.sin(th) * R * s;
  const y0 = -Math.cos(th) * R * s;
  const dir = th + dirOff * DEG;
  return Array.from({ length: 12 }, (_, i) => ({ x: x0 + (Math.sin(dir) * L * i) / 11, y: y0 - (Math.cos(dir) * L * i) / 11, t: i * 30 }));
}

function centroid(pts: readonly RawPoint[]): number {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return angleOf(x / pts.length, y / pts.length);
}

/** 금지 자리 ①의 두 허용 경계(정수리 뒤쪽, 앞 옆구리) — 체형마다 */
const edgesOf = (sh?: BodyShape) => [nearestAllowedNow(-20 * DEG, sh), nearestAllowedNow(75 * DEG, sh)];

function altShape(aspect: number): BodyShape {
  const core = coreParams(aspect);
  return { ...BASE_SHAPE, core, aspect, forbidden: deriveForbidden(undefined, core), coreU: [core.a, core.b, core.c, core.h], coreKU: [core.lean, core.round] };
}

/** M1 체형 3단(D-12 개정 ①: 이 파일이 세 체형에서 모두 통과해야 한다). undefined = 기존 기본형 경로 */
const BODIES: [string, BodyShape | undefined][] = [
  ['기본 경로', undefined],
  ['체형 1.15', shapeOf({ body: 0, comb: 0, ring: 1 })],
  // 1.25는 기본 경로와 같다(BASE_SHAPE) → 대신 아트가 끝값을 거절할 때의 대안 1.18·1.32(아트 1-1)
  ['대안 1.18', altShape(1.18)],
  ['대안 1.32', altShape(1.32)],
  ['체형 1.35', shapeOf({ body: 2, comb: 0, ring: 1 })],
];

describe.each(BODIES)('금지 자리에서 미끄러진 짧은 획 — %s', (_name, sh) => {
  const EDGES = edgesOf(sh);
  it('오른쪽 위(25°~80°) 짧은 획은 받침이 되지 않고, 몸통이 허용 경계 곁(±30°)에 남는다', () => {
    let checked = 0;
    for (const sN of [0, 3, 6]) {
      const s = coreScale(sN);
      for (let deg = 30; deg <= 80; deg += 10)
        for (const R of [0.6, 0.9])
          for (const L of [0.15, 0.3])
            for (let dirOff = 0; dirOff < 360; dirOff += 90) {
              const raw = quantizeRaw(line(deg, R, L, dirOff, s));
              const hand = centroid(raw);
              if (!isForbiddenNow(hand, sh)) continue;
              const a = attachStroke(raw, s, 2, sN, sh);
              const sp = strokeSpine({ raw, attach: a, drawnAtCoreScale: s, meshVersion: CURRENT_MESH_VERSION }, s, 1, undefined, undefined, sh);
              expect(sp.label).not.toBe('base');
              const c = centroid(sp.pts);
              // 정수리 쪽 경계와 앞쪽 경계 중 가까운 쪽
              const d = Math.min(...EDGES.map((e) => Math.abs(wrapPi(c - e))));
              expect(d / DEG).toBeLessThan(30);
              checked++;
            }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('7일차 서툰 손 6번(앞 위 지그재그)은 앞 옆구리에 붙고 바닥으로 내려가지 않는다', () => {
    const r = day7ClumsyRecords(2, sh)[5]!;
    const sp = strokeSpine(r, r.drawnAtCoreScale, 1, undefined, undefined, sh);
    expect(sp.label).toBe('wrap');
    expect(centroid(sp.pts) / DEG).toBeLessThan(110);
  });

  it('slideOf: 금지 자리에서 옮겨진 획만 slid, 쪽은 붙은 자리 기준', () => {
    const s = coreScale(1);
    const up = quantizeRaw(line(50, 0.6, 0.2, 90, s));
    const ua = attachStroke(up, s, 2, 1, sh);
    const f = slideOf(up, ua, sh);
    expect(f.slid).toBe(true);
    expect(f.side).toBe(Math.sin(ua.theta) >= 0 ? 1 : -1);
    const side = quantizeRaw(line(110, 0.6, 0.25, 90, s));
    expect(slideOf(side, attachStroke(side, s, 2, 1, sh), sh).slid).toBe(false);
  });
});
