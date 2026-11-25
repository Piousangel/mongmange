// 꿈 모티프 붓 형상(C14b) — 스키마 1 `paths`(SVG 경로, 그림 좌표 0..100)를 붓 리본으로 바꾸고, 카드 위 자리를 정한다. 순수 TS.
// 렌더러(apps/mobile DreamCardArt)는 이 리본을 Skia Vertices로만 옮긴다. 결정성(D-13): 같은 경로 → 같은 리본(난수·시각 없음).
// 붓 문법(아트 바이블 1-3-1과 같은 말): 붓을 눌러 시작(돈필, 폭 0.72 → 1)하고 끝은 빠진다(수필, 끝 폭 0.38). 점(길이 0에 가까운 획)은 둥근 방울.
import { buildRibbon, type Ribbon } from '../geometry/ribbon';
import type { RawPoint } from '../geometry/types';
import type { MotifPathData } from '../moon/motifs';

type Pt = [number, number];

/** SVG 경로 → 꺾은선 목록(M·L·H·V·C·S·Q·T·Z, 대소문자). A(호)는 끝점으로 곧게 잇는다 — 64px 구별 틀과 같은 해석 */
export function flattenMotifPath(d: string, steps = 16): Pt[][] {
  const tok = d.match(/[MLHVCSQTAZmlhvcsqtaz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  let p: Pt = [0, 0];
  let start: Pt = [0, 0];
  let ctrl: Pt | null = null;
  let cmd = '';
  let i = 0;
  const num = () => Number(tok[i++]);
  const bez = (pts: Pt[]) => {
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      let q = pts.map((x) => [...x] as Pt);
      while (q.length > 1) q = q.slice(1).map((b, j) => [q[j]![0] + (b[0] - q[j]![0]) * t, q[j]![1] + (b[1] - q[j]![1]) * t] as Pt);
      cur.push(q[0]!);
    }
  };
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i]!)) cmd = tok[i++]!;
    const rel = cmd === cmd.toLowerCase();
    const o: Pt = rel ? p : [0, 0];
    const C = cmd.toUpperCase();
    if (C === 'Z') {
      cur.push(start);
      p = start;
      ctrl = null;
      continue;
    }
    if (C === 'M') {
      if (cur.length > 1) out.push(cur);
      p = [o[0] + num(), o[1] + num()];
      start = p;
      cur = [p];
      cmd = rel ? 'l' : 'L';
      ctrl = null;
    } else if (C === 'L') {
      p = [o[0] + num(), o[1] + num()];
      cur.push(p);
      ctrl = null;
    } else if (C === 'H') {
      p = [(rel ? p[0] : 0) + num(), p[1]];
      cur.push(p);
      ctrl = null;
    } else if (C === 'V') {
      p = [p[0], (rel ? p[1] : 0) + num()];
      cur.push(p);
      ctrl = null;
    } else if (C === 'C' || C === 'S') {
      const c1: Pt = C === 'C' ? [o[0] + num(), o[1] + num()] : ctrl ? [2 * p[0] - ctrl[0], 2 * p[1] - ctrl[1]] : p;
      const c2: Pt = [o[0] + num(), o[1] + num()];
      const e: Pt = [o[0] + num(), o[1] + num()];
      bez([p, c1, c2, e]);
      ctrl = c2;
      p = e;
    } else if (C === 'Q' || C === 'T') {
      const c1: Pt = C === 'Q' ? [o[0] + num(), o[1] + num()] : ctrl ? [2 * p[0] - ctrl[0], 2 * p[1] - ctrl[1]] : p;
      const e: Pt = [o[0] + num(), o[1] + num()];
      bez([p, c1, e]);
      ctrl = c1;
      p = e;
    } else if (C === 'A') {
      i += 5;
      p = [o[0] + num(), o[1] + num()];
      cur.push(p);
      ctrl = null;
    } else i++;
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/** 리본 점 간격(그림 좌표). 꺾인 모서리가 둥근 조인으로 이어질 만큼 촘촘하게 */
const STEP = 0.9;
/** 이 길이보다 짧은 획은 점(둥근 방울) */
const DOT_LEN = 0.6;
/** 붓 폭 곡선: 돈필(시작 눌림) → 몸 → 수필(끝 빠짐) */
export const BRUSH = { head: 0.72, headLen: 0.16, tailStart: 0.7, tailMin: 0.38 } as const;

function resample(pts: readonly Pt[]): { pts: Pt[]; len: number } {
  const acc: number[] = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const L = acc[acc.length - 1]!;
  if (L < DOT_LEN) return { pts: [pts[0]!], len: L };
  const n = Math.max(2, Math.ceil(L / STEP) + 1);
  const out: Pt[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const s = (L * k) / (n - 1);
    while (j < acc.length - 1 && acc[j]! < s) j++;
    const a = pts[j - 1]!;
    const b = pts[j]!;
    const seg = acc[j]! - acc[j - 1]!;
    const t = seg > 1e-9 ? (s - acc[j - 1]!) / seg : 0;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return { pts: out, len: L };
}

/** 붓 폭 배율(0..1 길이 위치) */
export function brushProfile(s: number): number {
  const hk = Math.min(s / BRUSH.headLen, 1);
  const head = BRUSH.head + (1 - BRUSH.head) * Math.sin((hk * Math.PI) / 2);
  const tt = Math.max(0, (s - BRUSH.tailStart) / (1 - BRUSH.tailStart));
  const tail = 1 - (1 - BRUSH.tailMin) * tt * tt * (3 - 2 * tt);
  return head * tail;
}

export interface MotifInkLayer {
  layer: MotifPathData['layer'];
  /** 그림 좌표(0..100) 리본 묶음 — 한 층은 한 번에 그린다(겹친 곳이 진해지지 않게) */
  ribbons: Ribbon[];
}

/** 경로 → 층별 붓 리본(층 순서 = 담묵 → 먹 → 금, 아래부터 칠한다) */
export function motifInkLayers(paths: readonly MotifPathData[]): MotifInkLayer[] {
  const order: MotifPathData['layer'][] = ['wash', 'ink', 'gold'];
  const out: MotifInkLayer[] = [];
  for (const layer of order) {
    const ribbons: Ribbon[] = [];
    for (const p of paths) {
      if (p.layer !== layer) continue;
      for (const line of flattenMotifPath(p.d)) {
        const { pts } = resample(line);
        if (pts.length === 1) {
          ribbons.push(buildRibbon([{ x: pts[0]![0], y: pts[0]![1], t: 0 }], { widths: [p.w] }));
          continue;
        }
        const raw: RawPoint[] = pts.map(([x, y], k) => ({ x, y, t: k }));
        // 담묵은 번진 먹이라 수필이 짧다(끝이 덜 빠진다)
        const widths = pts.map((_, k) => {
          const s = k / (pts.length - 1);
          return p.w * (layer === 'wash' ? 0.55 + 0.45 * brushProfile(s) : brushProfile(s));
        });
        ribbons.push(buildRibbon(raw, { widths, roundStart: true, roundEnd: true }));
      }
    }
    if (ribbons.length > 0) out.push({ layer, ribbons });
  }
  return out;
}

// ---------- 카드 위 자리 ----------

/** 카드 위 붓 형상의 자리. 좌표 = 몽망이 중심(c0) 원점, 단위 = 카드 폭 */
export interface DreamMotifInk {
  /** 그림 상자 왼쪽 위(c0 기준)와 한 변 */
  x: number;
  y: number;
  size: number;
  /** 좌우 뒤집기(구도 b) — 상자 안에서 x → 100 − x */
  flip: boolean;
  paths: readonly MotifPathData[];
}

/**
 * 구도 3(1-1 표): a = 크게(인화 지름에 가깝게), b = 한 단계 작게·좌우 뒤집어 나란히, c = 더 크게 놓고 몽망이를 가운데로 당겨
 * 그림 바깥쪽이 인화 테 밖으로 잘린다(핵심 형상은 상자 가운데에 있어 남는다). 단위 = 인화 반경 R
 */
export const MOTIF_INK_COMPOSITION = [
  { size: 1.8, pull: 0 },
  { size: 1.45, pull: 0 },
  { size: 2.15, pull: 0.38 },
] as const;
/** 몽망이 중심이 인화 중심에서 벗어날 수 있는 최대 거리(R 배) — 몸이 인화 번짐 테에 걸리지 않게 */
export const SEAT_MAX = 0.6;

/**
 * 붓 형상 자리: 그림의 `seat`가 몽망이 중심에 오고, 그림 상자 중심이 인화 중심 근처에 온다.
 * 반환 anchor = 인화 중심에서 몽망이 중심까지(카드 폭 단위, `DreamScene.anchor`와 같은 뜻).
 */
export function motifInkPlacement(
  seat: readonly [number, number],
  composition: number,
  R: number,
): { anchor: { x: number; y: number }; box: { x: number; y: number; size: number }; flip: boolean } {
  const c = MOTIF_INK_COMPOSITION[composition] ?? MOTIF_INK_COMPOSITION[0];
  const flip = composition === 1;
  const size = c.size * R;
  const sx = (flip ? 100 - seat[0] : seat[0]) / 100;
  const sy = seat[1] / 100;
  // 상자 중심 = 인화 중심일 때 몽망이 자리, c는 그만큼 가운데로 당긴다(상자가 반대쪽으로 밀려 바깥쪽이 잘림)
  let ax = (sx - 0.5) * size * (1 - c.pull);
  let ay = (sy - 0.5) * size * (1 - c.pull);
  const d = Math.hypot(ax, ay);
  const lim = SEAT_MAX * R;
  if (d > lim) {
    ax *= lim / d;
    ay *= lim / d;
  }
  return { anchor: { x: ax, y: ay }, box: { x: -sx * size, y: -sy * size, size }, flip };
}

/** 그림 좌표 → c0 기준 카드 좌표 */
export function motifInkPoint(ink: Pick<DreamMotifInk, 'x' | 'y' | 'size' | 'flip'>, px: number, py: number): { x: number; y: number } {
  return { x: ink.x + ((ink.flip ? 100 - px : px) / 100) * ink.size, y: ink.y + (py / 100) * ink.size };
}
