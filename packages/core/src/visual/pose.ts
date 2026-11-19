// 정본(StrokeRecord) → 렌더 기하. 세 화면(낮·획·밤)이 이 한 경로와 selectVisual을 함께 쓴다.
import { STROKE, coreScale } from './bodySpec';
import { attachStroke, strokeLocal } from '../geometry/attach';
import { buildRibbon, strokeWidths, type Ribbon, type RibbonOptions } from '../geometry/ribbon';
import { simplifyStroke } from '../geometry/simplify';
import { quantizeRaw } from '../save/envelope';
import { CURRENT_MESH_VERSION } from '../geometry/simplify';
import type { AttachLevel, RawPoint, StrokeRecord } from '../geometry/types';

export type StrokeLabel = 'wrap' | 'base' | 'other';

/** 렌더러 분류 라벨(아트 1-3): 바닥 아래(160°~200°)의 짧은 획 = 받침(끝 갈라짐 끔), 나머지 = 두름 */
export function strokeLabel(theta: number, length: number): StrokeLabel {
  'worklet';
  const deg = ((((theta * 180) / Math.PI) % 360) + 360) % 360;
  if (deg >= 160 && deg <= 200 && length <= 0.35) return 'base';
  return 'wrap';
}

/** 한 획의 스파인과 점별 폭(W). k = 부착 진행(0 = 손이 그은 자리, 1 = 붙음), sNow = 지금 핵 크기 */
export function strokeSpine(
  rec: StrokeRecord,
  sNow: number,
  k: number = 1,
  simplified?: readonly RawPoint[],
): { pts: RawPoint[]; widths: number[]; label: StrokeLabel; opts: RibbonOptions } {
  'worklet';
  // raw는 불변이라 단순화 결과는 획마다 한 번만 만들어 넘겨도 된다(렌더러 캐시)
  const pts = simplified ?? simplifyStroke(rec.raw, STROKE.simplifiedMax, rec.meshVersion);
  const local = strokeLocal(pts, rec.attach, rec.drawnAtCoreScale, sNow, k);
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  const label = strokeLabel(rec.attach.theta, L * rec.attach.scale);
  const opts: RibbonOptions = {
    width: STROKE.baseWidth,
    taper: rec.attach.taper * k,
    roundStart: true,
    roundEnd: label === 'base',
    meshVersion: rec.meshVersion,
  };
  return { pts: local, widths: strokeWidths(local, opts), label, opts };
}

/** 한 획의 리본 */
export function strokeRibbon(rec: StrokeRecord, sNow: number, k: number = 1, simplified?: readonly RawPoint[]): Ribbon {
  'worklet';
  const sp = strokeSpine(rec, sNow, k, simplified);
  return buildRibbon(sp.pts, { ...sp.opts, widths: sp.widths });
}

/** 손가락 정본 점열을 붙여 기록 하나를 만든다. n = 이 획 전 획 수 */
export function makeRecord(raw: readonly RawPoint[], n: number, level: AttachLevel): StrokeRecord {
  const q = quantizeRaw(raw);
  const s = coreScale(n);
  return { raw: q, attach: attachStroke(q, s, level, n), drawnAtCoreScale: s, meshVersion: CURRENT_MESH_VERSION };
}

/** 합성 손획(테스트 자극물·7일차 포즈용). 극좌표 호를 사람 손처럼 시간·떨림을 넣어 점열로 */
function arcRaw(th0: number, th1: number, r0: number, r1: number, ms: number, wobble: number, seed: number): RawPoint[] {
  const out: RawPoint[] = [];
  const n = Math.max(12, Math.round(ms / 8));
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const e = u * u * (3 - 2 * u); // 붓은 느리게 시작해 빨라졌다가 느려진다
    const th = ((th0 + (th1 - th0) * e) * Math.PI) / 180;
    const r = r0 + (r1 - r0) * e + Math.sin(u * 17 + seed) * wobble;
    out.push({ x: Math.sin(th) * r, y: -Math.cos(th) * r, t: Math.round(u * ms) });
  }
  return out;
}

function lineRaw(x0: number, y0: number, x1: number, y1: number, ms: number): RawPoint[] {
  const out: RawPoint[] = [];
  const n = Math.max(8, Math.round(ms / 8));
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    out.push({ x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u + Math.sin(u * 3.1) * 0.01, t: Math.round(u * ms) });
  }
  return out;
}

/**
 * 7일차 기준 포즈(아트 1-2, `02a` 가운데): 두름 1(등) + 받침 2 + 짧은 두름 3 + 두름 1 = 7획, 핵 1.25W, 빗 완성.
 * 모두 실제 부착 경로(attachStroke, 기본 L2)를 거친다.
 */
export function day7Records(level: AttachLevel = 2): StrokeRecord[] {
  // 등 쪽 허용 띠는 250°~335°(꼬리 자리 200~250°, 정수리 −25~45°는 금지)
  const raws: RawPoint[][] = [
    arcRaw(312, 252, 0.6, 0.57, 900, 0.004, 1), // 두름 1(첫 두름, 등을 감쌈)
    lineRaw(-0.17, 0.445, -0.03, 0.45, 220), // 받침(왼, 짧게)
    lineRaw(0.05, 0.45, 0.19, 0.445, 220), // 받침(오른)
    arcRaw(96, 138, 0.62, 0.58, 420, 0.003, 2), // 짧은 두름(앞 아래)
    arcRaw(304, 262, 0.7, 0.66, 600, 0.004, 5), // 두름 2(등 바깥)
    arcRaw(142, 162, 0.6, 0.58, 300, 0.003, 4), // 짧은 두름(앞, 작게)
    arcRaw(292, 266, 0.63, 0.6, 380, 0.003, 3), // 짧은 두름(등 아래)
  ];
  return raws.map((r, i) => makeRecord(r, i, level));
}
