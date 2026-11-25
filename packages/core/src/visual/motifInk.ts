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
/**
 * 붓 폭 곡선(아트 리뷰 C14b 1·3절 — 굵기가 한 가지인 선 금지): 돈필(눌러 시작 0.55) → 배(0.4 지점 1.15로 부풂) → 수필(끝 0.25).
 * 곡률이 큰 곳은 얇아진다(curveThin). 끝 tail 구간에는 비백(마른 붓 갈라짐)이 든다
 */
export const BRUSH = { head: 0.55, belly: 1.15, bellyAt: 0.4, tailMin: 0.25, curveThin: 0.35, dryFrom: 0.72, lanes: 5 } as const;
/** 모티프 먹 농도 상한(몸 먹 = 1 대비, 아트 리뷰 2절 — 순흑은 몽망이 몸만). 렌더 층 알파가 이 값을 넘으면 시험이 실패한다 */
export const MOTIF_INK_MAX = 0.72;
/**
 * 래스터 사물(먹 알파)의 밤 색 토큰(6차, 블라인드 판정 4절): 밤 바탕 위에는 곱하기를 쓰지 않고 알파에 이 밝고 차가운 은회색을 입힌다.
 * 따뜻한 회갈색(#7E7973)은 남색 위에서 진흙빛으로 묻혔다. 밤 바탕 대비 7:1 이상(시험)
 */
export const MOTIF_NIGHT_INK = '#BEC5D1';

/**
 * 곁의 존재(곁 방울, 7차 — 2차 블라인드: 바다 손·우산·은하수 다리·별과 물방울·징검다리·찻잔 둘의 '두 번째 몽망이'). 곁은 설계상 필요하지만
 * 몽망이와 **재질로** 가른다: 순흑 대신 담묵(몸 먹의 45~60%) + 젖은 테, 모양은 완전한 원이 아닌 붓 방울(시드 흔들림·가로로 조금 긴 꼴),
 * 눈 없음. fill = 면 알파, total = 테 자리 합성 농도(상한), 판 1에만(판 0 = 빌드 1 그대로)
 */
export const COMPANION = { fill: 0.45, total: 0.6, stretch: 1.38, wobble: 0.18, holdStretch: 1.1 } as const;
/** 몸 이외 덩어리(장면의 맑지 않은 방울·곁 방울)의 먹 농도 상한(몸 = 1) */
export const BLOB_INK_MAX = 0.6;
/** 곁 방울 원형도(4πA/P²) 상한 — 완전한 원(1)이 아니어야 한다 */
export const COMPANION_ROUNDNESS_MAX = 0.94;

/** 곁 방울 붓 방울 꼴(반경 1 기준 꺾은선 [x0,y0,x1,y1,…], 아래가 조금 평평 — 물 위에 앉은 방울). 같은 시드 = 같은 꼴 */
export function companionBlob(seed: number, n = 48, stretch: number = COMPANION.stretch): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const k0 = Math.floor((i / n) * 7);
    const f = (i / n) * 7 - k0;
    const u = f * f * (3 - 2 * f);
    const noise = (hash01(seed, k0 % 7, 3) * (1 - u) + hash01(seed, (k0 + 1) % 7, 3) * u) * 2 - 1;
    const r = 1 + COMPANION.wobble * noise;
    const y = Math.sin(a) * r;
    out.push(Math.cos(a) * r * stretch, y > 0 ? y * 0.78 : y);
  }
  return out;
}

/** 꺾은선의 원형도 4πA/P²(원 = 1) */
export function roundness(poly: readonly number[]): number {
  let A = 0;
  let P = 0;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = poly[2 * i]!;
    const y0 = poly[2 * i + 1]!;
    const x1 = poly[2 * j]!;
    const y1 = poly[2 * j + 1]!;
    A += x0 * y1 - x1 * y0;
    P += Math.hypot(x1 - x0, y1 - y0);
  }
  return (4 * Math.PI * Math.abs(A / 2)) / (P * P);
}
/**
 * 담묵 면(2차 아트 리뷰 2-1): 가장자리는 흐리지 않고 또렷하게 두고, 안쪽 `rim`(면 크기의 비율) 폭을 `rimDark`배 짙게(먹이 마르며 고인 테),
 * 바깥으로 `bleedOut`만 불규칙하게 번진다. 곧은 변은 경로 해시 시드로 `wobble`(그림 단위)만큼 흔든다(자로 그은 직선 없음).
 * 면 농담 = 닫힌 경로의 굵기 w(1..4 → 알파 `toneBase + toneStep·w`), 붓이 처음 닿은 꼭짓점 쪽이 짙다(`slope`).
 * 같은 경로(한 `P`)의 닫힌 모양들은 하나로 합쳐 한 번에 칠한다 — 겹친 곳에 이음매 없음. 다른 경로끼리는 겹치지 않게 그린다
 */
// 8차(블라인드 3회 '사물이 옅어 사라짐'): 면 농담을 한 단계(toneStep) 올리고 젖은 테 배율을 낮춰 최댓값은 MOTIF_INK_MAX 안
export const WASH_FACE = { toneBase: 0.36, toneStep: 0.06, rim: 0.035, rimDark: 1.19, bleedOut: 0.005, wobble: 0.7, slope: 0.7, grain: 0.2 } as const;

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

/** 붓 폭 배율(0..1 길이 위치) — 곡률 보정 전 */
export function brushProfile(s: number): number {
  const B = BRUSH;
  if (s <= B.bellyAt) {
    const t = s / B.bellyAt;
    return B.head + (B.belly - B.head) * Math.sin((t * Math.PI) / 2);
  }
  const t = (s - B.bellyAt) / (1 - B.bellyAt);
  return B.belly - (B.belly - B.tailMin) * t * t * (3 - 2 * t);
}

/** 경로 해시(FNV-1a) — 비백 무늬의 시드. 같은 경로 = 같은 갈라짐(D-13) */
export function pathSeed(d: string, w: number): number {
  let h = 2166136261;
  const str = `${d}|${w}`;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}
const hash01 = (seed: number, a: number, b: number) => {
  let x = (seed ^ Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca77)) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39) >>> 0;
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
};

function normals(pts: readonly Pt[]): Pt[] {
  return pts.map((_, i) => {
    const a = pts[Math.max(0, i - 2)]!;
    const b = pts[Math.min(pts.length - 1, i + 2)]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l] as Pt;
  });
}

/** 점별 폭: 붓 곡선 × 곡률 얇아짐 */
function strokeWidthsOf(pts: readonly Pt[], w: number, wash: boolean): number[] {
  const n = pts.length;
  return pts.map((p, k) => {
    const s = k / (n - 1);
    const a = pts[Math.max(0, k - 3)]!;
    const b = pts[Math.min(n - 1, k + 3)]!;
    const t1 = Math.atan2(p[1] - a[1], p[0] - a[0]);
    const t2 = Math.atan2(b[1] - p[1], b[0] - p[0]);
    let turn = Math.abs(t2 - t1);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    const curve = 1 - BRUSH.curveThin * Math.min(1, turn / 1.2);
    const prof = brushProfile(s);
    return w * (wash ? 0.6 + 0.4 * prof : prof) * curve;
  });
}

const raw = (pts: readonly Pt[]): RawPoint[] => pts.map(([x, y], k) => ({ x, y, t: k }));

/**
 * 비백: 획을 `lanes` 가닥으로 나눠, `dryFrom` 뒤에서 가닥마다(경로 해시 시드) 끊기고 일찍 끝나게 한다. 가운데 가닥은 끝까지 간다.
 * 가닥은 서로 25% 겹쳐 앞부분은 한 획으로 보인다
 */
function dryLanes(pts: readonly Pt[], widths: readonly number[], seed: number): Ribbon[] {
  const L = BRUSH.lanes;
  const nm = normals(pts);
  const n = pts.length;
  const out: Ribbon[] = [];
  for (let j = 0; j < L; j++) {
    const c = -1 + (2 * (j + 0.5)) / L;
    const centre = j === (L - 1) / 2;
    const end = centre ? 1 : BRUSH.dryFrom + (1 - BRUSH.dryFrom) * (0.25 + 0.75 * hash01(seed, j, 0));
    const gapAt = BRUSH.dryFrom + (end - BRUSH.dryFrom) * hash01(seed, j, 1);
    const gapLen = centre ? 0 : 0.05 + 0.08 * hash01(seed, j, 2);
    let cur: Pt[] = [];
    let cw: number[] = [];
    const flush = () => {
      if (cur.length >= 2) out.push(buildRibbon(raw(cur), { widths: cw, roundStart: true, roundEnd: true }));
      cur = [];
      cw = [];
    };
    for (let k = 0; k < n; k++) {
      const s = k / (n - 1);
      if (s > end) break;
      if (s > gapAt && s < gapAt + gapLen) {
        flush();
        continue;
      }
      const half = widths[k]! / 2;
      cur.push([pts[k]![0] + nm[k]![0] * c * half, pts[k]![1] + nm[k]![1] * c * half]);
      cw.push((widths[k]! / L) * 1.5);
    }
    flush();
  }
  return out;
}

/** 닫힌 경로인가(끝점이 시작점과 만남) — 닫힌 담묵 경로 = 면 */
export function isClosedLine(line: readonly Pt[]): boolean {
  const a = line[0]!;
  const b = line[line.length - 1]!;
  return line.length > 3 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5;
}

export interface MotifInkLayer {
  layer: MotifPathData['layer'];
  /** 그림 좌표(0..100) 리본 묶음 — 한 층은 한 번에 그린다(겹친 곳이 진해지지 않게) */
  ribbons: Ribbon[];
  /** 번짐 한 겹(같은 획 폭 1.6배, 아주 옅게 깐다 — 먹이 젖은 종이에 퍼짐) */
  bleed: Ribbon[];
  /**
   * 담묵 면(닫힌 wash 경로). group = 같은 경로 번호(렌더가 합쳐 한 번에 칠함), tone = 면 알파, seed = 종이 결·흔들림 시드,
   * from·to = 농담 기울기(붓이 처음 닿은 꼭짓점 → 가장 먼 점), size = 면 크기(경계 상자 짧은 변 — 젖은 테 폭 기준)
   */
  faces: { poly: number[]; group: number; tone: number; seed: number; from: [number, number]; to: [number, number]; size: number }[];
}

/** 경로 → 층별 붓 리본·담묵 면(층 순서 = 담묵 → 먹 → 금, 아래부터 칠한다) */
export function motifInkLayers(paths: readonly MotifPathData[]): MotifInkLayer[] {
  const order: MotifPathData['layer'][] = ['wash', 'ink', 'gold'];
  const out: MotifInkLayer[] = [];
  for (const layer of order) {
    const ribbons: Ribbon[] = [];
    const bleed: Ribbon[] = [];
    const faces: MotifInkLayer['faces'] = [];
    for (const [pi, p] of paths.entries()) {
      if (p.layer !== layer) continue;
      const seed = pathSeed(p.d, p.w);
      for (const line of flattenMotifPath(p.d)) {
        if (layer === 'wash' && isClosedLine(line)) {
          faces.push(washFace(line, pi, p.w, seed));
          continue;
        }
        const { pts } = resample(line);
        if (pts.length === 1) {
          ribbons.push(buildRibbon(raw(pts), { widths: [p.w] }));
          continue;
        }
        const widths = strokeWidthsOf(pts, p.w, layer === 'wash');
        if (layer === 'gold') {
          ribbons.push(buildRibbon(raw(pts), { widths, roundStart: true, roundEnd: true }));
          continue;
        }
        bleed.push(buildRibbon(raw(pts), { widths: widths.map((x) => x * 1.6), roundStart: true, roundEnd: true }));
        // 먹 획만 비백(담묵은 젖은 획이라 갈라지지 않는다)
        if (layer === 'ink' && pts.length >= 8) ribbons.push(...dryLanes(pts, widths, seed));
        else ribbons.push(buildRibbon(raw(pts), { widths, roundStart: true, roundEnd: true }));
      }
    }
    if (ribbons.length + faces.length > 0) out.push({ layer, ribbons, bleed, faces });
  }
  return out;
}

/** 닫힌 담묵 경로 → 흔든 다각형 + 농담·결 메타 */
function washFace(line: readonly Pt[], group: number, w: number, seed: number): MotifInkLayer['faces'][number] {
  const { pts } = resample(line);
  const ring = pts.slice(0, -1); // 닫는 점(= 첫 점) 빼기
  const nm = normals([...ring, ring[0]!, ring[1]!]);
  const W = WASH_FACE.wobble;
  // 저주파 흔들림: 4점마다 시드 값, 사이는 부드럽게 잇는다(곧은 변이 살짝 굽고 떨림)
  const knot = (k: number) => hash01(seed, k, 9) * 2 - 1;
  const poly: number[] = [];
  ring.forEach(([x, y], i) => {
    const t = i / 4;
    const k0 = Math.floor(t);
    const f = t - k0;
    const u = f * f * (3 - 2 * f);
    const d = W * (knot(k0) * (1 - u) + knot(k0 + 1) * u);
    poly.push(x + nm[i]![0] * d, y + nm[i]![1] * d);
  });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const from = line[0]! as Pt;
  let to: Pt = from;
  for (const q of ring) if (Math.hypot(q[0] - from[0], q[1] - from[1]) > Math.hypot(to[0] - from[0], to[1] - from[1])) to = q;
  const tone = WASH_FACE.toneBase + WASH_FACE.toneStep * Math.min(4, Math.max(1, w));
  return { poly, group, tone, seed, from: [from[0], from[1]], to: [to[0], to[1]], size: Math.min(x1 - x0, y1 - y0) };
}

// ---------- 장 변형(마블링이 형상을 받아들이는 조작, 아트 리뷰 3절 ①) ----------

/**
 * 모티프가 마블링 장에 거는 조작(그림 좌표 0..100, 길이도 그림 단위). 카드 장면의 `late`(결 뒤·몽망이 자리 앞)에 들어간다.
 * - drop: ink > 0 = 담묵 면 방울(띠가 밀려 둘레가 휜다), ink 0 = 비움(맑은 물, '남긴 흰 길'·눈)
 * - tine: 끌기·빗질(직선 (x,y)를 따라 (dx,dy)만큼, lambda = 번짐 폭, len > 0 = 선 길이 창, gauss = 들어올림·누름)
 * - curl: 한 점으로 감아 빨아들임
 */
export type MotifFieldOp =
  | { k: 'drop'; x: number; y: number; r: number; ink: number }
  | { k: 'tine'; x: number; y: number; dx: number; dy: number; lambda: number; len?: number; gauss?: boolean }
  | { k: 'curl'; x: number; y: number; angle: number; radius: number };

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
  /** 사물 한 겹 래스터(4차 혼합안) — 렌더가 모티프 id의 에셋을 이 상자(그림 좌표)에 넣고, keep 밖의 경로는 그리지 않는다 */
  raster?: { box: readonly [number, number, number, number]; keep: readonly number[]; cover: number; stretch?: true };
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
  /** 그림 상자 배율(8차 `MotifShape.zoom`, 기본 1) */
  zoom = 1,
): { anchor: { x: number; y: number }; box: { x: number; y: number; size: number }; flip: boolean } {
  const c = MOTIF_INK_COMPOSITION[composition] ?? MOTIF_INK_COMPOSITION[0];
  const flip = composition === 1;
  const size = c.size * R * zoom;
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
