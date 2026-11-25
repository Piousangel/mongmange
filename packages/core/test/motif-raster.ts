// 64px 흑백 구별 틀(dreams-30days 1-2)의 기계 쪽 도구 — 시험 전용. 사람 3명 시험(오답 쌍 3쌍 이하)이 관문이고,
// 이 틀은 그 전에 같은 시트를 기계로 한 번 거르는 앞단이다(형상이 들어온 모티프만 대상).
// 형상 = 스키마 1 `paths`(SVG 경로, 그림 좌표 0..100 정사각). 선 굵기 `w`도 같은 좌표 단위.
import { flattenMotifPath, type MotifPathData } from '../src/index';

export const THUMB_PX = 64;
const VIEW = 100;
const LAYER_INK: Record<MotifPathData['layer'], number> = { ink: 1, gold: 0.6, wash: 0.35 };

type Pt = [number, number];

/** SVG 경로 → 꺾은선(카드 붓 렌더와 같은 해석 — core `flattenMotifPath`) */
export const flattenPath = flattenMotifPath;

function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  const t = L > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L)) : 0;
  return Math.hypot(px - (a[0] + dx * t), py - (a[1] + dy * t));
}

/** 64×64 흑백 썸네일(0 = 종이, 1 = 먹). 칸마다 2×2 표본 평균 + 3×3 상자 흐림(작은 크기에서 눈이 보는 해상도) */
export function rasterize(paths: readonly MotifPathData[], px = THUMB_PX): Float64Array {
  const lines = paths.flatMap((p) => flattenPath(p.d).map((pts) => ({ pts, half: Math.max(p.w, 0.6) / 2, ink: LAYER_INK[p.layer] })));
  const g = new Float64Array(px * px);
  const cell = VIEW / px;
  for (let y = 0; y < px; y++)
    for (let x = 0; x < px; x++) {
      let acc = 0;
      for (const [sx, sy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]] as const) {
        const X = (x + sx) * cell;
        const Y = (y + sy) * cell;
        let v = 0;
        for (const l of lines) {
          if (v >= l.ink) continue;
          for (let k = 1; k < l.pts.length; k++) {
            if (segDist(X, Y, l.pts[k - 1]!, l.pts[k]!) <= l.half) {
              v = l.ink;
              break;
            }
          }
        }
        acc += v;
      }
      g[y * px + x] = acc / 4;
    }
  const b = new Float64Array(px * px);
  for (let y = 0; y < px; y++)
    for (let x = 0; x < px; x++) {
      let s = 0;
      let n = 0;
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const X = x + i;
          const Y = y + j;
          if (X < 0 || Y < 0 || X >= px || Y >= px) continue;
          s += g[Y * px + X]!;
          n++;
        }
      b[y * px + x] = s / n;
    }
  return b;
}

/** 두 썸네일의 평균 절대 차(0 = 같음) */
export function thumbDistance(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i]! - b[i]!);
  return s / a.length;
}

/**
 * 기계로 헷갈리는 쌍: 썸네일 거리가 문턱보다 가까운 쌍. 문턱 0.02는 시작값이다 — 사람 3명 시험의 오답 쌍과 맞춰 C14에서 고친다.
 * 통과선은 사람 시험과 같은 '3쌍 이하'.
 */
export const CONFUSABLE_BELOW = 0.02;
export const MAX_CONFUSABLE_PAIRS = 3;

export function confusablePairs(items: readonly { id: string; paths: readonly MotifPathData[] }[], below = CONFUSABLE_BELOW): [string, string, number][] {
  const th = items.map((x) => rasterize(x.paths));
  const out: [string, string, number][] = [];
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const d = thumbDistance(th[i]!, th[j]!);
      if (d < below) out.push([items[i]!.id, items[j]!.id, Number(d.toFixed(4))]);
    }
  return out;
}

/** 사람 시험용 시트(5×5 = 25칸, 보름은 4×3): 칸 순서대로 64px 썸네일을 붙인 흑백 격자 */
export function contactSheet(thumbs: readonly Float64Array[], cols: number, rows: number, px = THUMB_PX): { w: number; h: number; data: Float64Array } {
  const w = cols * px;
  const h = rows * px;
  const data = new Float64Array(w * h);
  thumbs.slice(0, cols * rows).forEach((t, k) => {
    const ox = (k % cols) * px;
    const oy = Math.floor(k / cols) * px;
    for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) data[(oy + y) * w + ox + x] = t[y * px + x]!;
  });
  return { w, h, data };
}
