// 64px 흑백 구별 틀(dreams-30days 1-2)의 기계 쪽 도구 — 시험 전용. 사람 3명 시험(오답 쌍 3쌍 이하)이 관문이고,
// 이 틀은 그 전에 같은 시트를 기계로 한 번 거르는 앞단이다(형상이 들어온 모티프만 대상).
// 형상 = 스키마 1 `paths`(SVG 경로, 그림 좌표 0..100 정사각). 선 굵기 `w`도 같은 좌표 단위.
import { flattenMotifPath, isClosedLine, type MotifFieldOp, type MotifPathData } from '../src/index';

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
/** 점이 닫힌 꺾은선 안인가(짝홀 규칙) */
function inside(X: number, Y: number, poly: readonly Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > Y !== yj > Y && X < ((xj - xi) * (Y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * 64px 흑백 썸네일. C14b v2: 닫힌 담묵 경로 = 칠한 면(카드 렌더와 같음), 장 조작의 먹 방울 = 그 농도로 칠한 원,
 * 맑은 방울(비움) = 둘레에 밀려난 띠(담묵 테), 끌기·빗질 = 끌린 띠 한 줄(담묵 — 들어올림·누름은 혹 모양, 선 창은 그 길이만큼,
 * 창 없는 빗질은 그림을 가로지르는 줄). 장 조작은 띠가 있어야 보이므로 '그 자리를 지나는 띠 하나'로 기록한다
 */
export function rasterize(paths: readonly MotifPathData[], px = THUMB_PX, field: readonly MotifFieldOp[] = []): Float64Array {
  const lines = paths.flatMap((p) => flattenPath(p.d).map((pts) => ({ pts, half: Math.max(p.w, 0.6) / 2, ink: LAYER_INK[p.layer], fill: p.layer === 'wash' && isClosedLine(pts) })));
  for (const f of field) {
    if (f.k !== 'drop') continue;
    const ring: Pt[] = Array.from({ length: 33 }, (_, i) => [f.x + Math.cos((i / 32) * 2 * Math.PI) * f.r, f.y + Math.sin((i / 32) * 2 * Math.PI) * f.r] as Pt);
    lines.push(f.ink > 0 ? { pts: ring, half: 0.3, ink: Math.min(1, f.ink * 1.4), fill: true } : { pts: ring, half: 0.8, ink: LAYER_INK.wash, fill: false });
  }
  for (const f of field) {
    if (f.k !== 'tine') continue;
    const L = Math.hypot(f.dx, f.dy) || 1;
    const ux = f.dx / L;
    const uy = f.dy / L;
    let pts: Pt[];
    if (f.gauss) {
      pts = Array.from({ length: 25 }, (_, i) => {
        const t = -2.5 * f.lambda + (5 * f.lambda * i) / 24;
        const g = Math.exp(-(t * t) / (2 * f.lambda * f.lambda));
        return [f.x - uy * t + f.dx * g, f.y + ux * t + f.dy * g] as Pt;
      });
    } else {
      const h = f.len ? f.len / 2 : 60;
      pts = [[f.x - ux * h, f.y - uy * h], [f.x + ux * h + f.dx, f.y + uy * h + f.dy]];
    }
    lines.push({ pts, half: 0.9, ink: LAYER_INK.wash, fill: false });
  }
  // 상자 미리 거르기(빠르게): 선마다 굵기만큼 넓힌 경계 상자
  const boxes = lines.map((l) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of l.pts) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return [x0 - l.half, y0 - l.half, x1 + l.half, y1 + l.half] as const;
  });
  const g = new Float64Array(px * px);
  const cell = VIEW / px;
  for (let y = 0; y < px; y++)
    for (let x = 0; x < px; x++) {
      let acc = 0;
      for (const [sx, sy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]] as const) {
        const X = (x + sx) * cell;
        const Y = (y + sy) * cell;
        let v = 0;
        for (let li = 0; li < lines.length; li++) {
          const l = lines[li]!;
          if (v >= l.ink) continue;
          const bx = boxes[li]!;
          if (X < bx[0] || X > bx[2] || Y < bx[1] || Y > bx[3]) continue;
          if (l.fill && inside(X, Y, l.pts)) {
            v = l.ink;
            continue;
          }
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

export function confusablePairs(items: readonly { id: string; paths: readonly MotifPathData[]; field?: readonly MotifFieldOp[] }[], below = CONFUSABLE_BELOW): [string, string, number][] {
  const th = items.map((x) => rasterize(x.paths, THUMB_PX, x.field));
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
