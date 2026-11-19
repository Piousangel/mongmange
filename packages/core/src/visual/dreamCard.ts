// 꿈 인화 카드(아침 현상) 장면 문법 v1 — 순수 TS. 렌더러(apps/mobile/src/render/dreamCard)가 이 장면을 셰이더 uniform으로 옮긴다.
//
// 문법: 간밤의 획이 물에 풀려(스미나가시) 한지에 찍힌 한 장.
//  1) 몽망이 자리(c0)에 먹·맑은 물을 번갈아 떨어뜨린 동심 고리(실제 스미나가시: 먼저 떨군 방울이 가장 바깥 고리가 된다)
//  2) 모티프마다 '물 위에서 할 수 있는 조작'만으로 형상을 만든다(방울 = 달·찻잔 손잡이·별, 빗질 = 창살·이불 주름·빗줄기, 들어올림 = 산)
//  3) 몽망이가 실제로 그은 획(D-13 정본 점열)이 붓대처럼 물을 끌고 지나간 자국
//  4) 성향의 결: tempo = 너울(느긋: 큰 소용돌이) / 잔물결(재빠름: 고리 가장자리의 잔떨림), boldness = 농담·고리 수·굵기,
//     curiosity(모티프 구역 far) = 한쪽으로 뻗음, closeness(-with) = 다른 방울
//  5) 마지막에 몽망이 둘레 맑은 물 한 방울(몽망이가 앉는 빈 자리)
// 방울 연산은 넓이를 보존하는 정확한 사상(Jaffer & Lu, "Mathematical Marbling")이라 픽셀마다 역사상으로 되짚어 색을 찾는다.
// 결정성: 같은 카드 + 같은 획 기록 → 같은 시드 → 같은 장면(Math.random·시각 사용 금지).
import { simplifyStroke } from '../geometry/simplify';
import type { RawPoint, StrokeRecord } from '../geometry/types';
import { MOTIFS } from '../sim/dream';
import { rngNext } from '../sim/rng';
import type { DreamCard } from '../sim/types';
import { coreScale } from './bodySpec';

export type DreamAspect = '4:5' | '9:16';

/** 물 위 조작 하나. 좌표 = 몽망이 중심(c0) 원점, 단위 = 카드 폭, y 아래 */
export type DreamOp =
  /** 방울: 반경 r, 먹 농도 ink(0 = 맑은 물), gold = 금박 실선 */
  | { k: 'drop'; x: number; y: number; r: number; ink: number; gold?: boolean }
  /** 빗질(직선): (x,y)를 지나는 선을 따라 (dx,dy)만큼 끈다. lambda = 번짐 폭, len > 0이면 선 길이 창(가우시안), gauss = 가우시안 감쇠 */
  | { k: 'tine'; x: number; y: number; dx: number; dy: number; lambda: number; len: number; gauss?: boolean }
  /** 소용돌이: 중심에서 angle 라디안(반경 radius 가우시안) */
  | { k: 'curl'; x: number; y: number; angle: number; radius: number }
  /** 물결: 방향 (dx,dy)로 amp·sin(freq·s + phase), s = 직각 방향 좌표 */
  | { k: 'wave'; dx: number; dy: number; amp: number; freq: number; phase: number }
  /** 누르기·펴기(넓이 보존 아님 — 지층·물띠용): (x,y) 기준 sx·sy배 */
  | { k: 'scale'; x: number; y: number; sx: number; sy: number };

/** 획 빗질 선분. stroke = 획 번호(같은 획 안에서는 가장 가까운 선분 하나만 끈다) */
export interface DreamSeg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  z: number;
  lambda: number;
  stroke: number;
}

export interface DreamScene {
  seed: number;
  motifId: string;
  /** 순서: pre(고리 + 모티프 방울) → segs(획 빗질) → post(모티프 빗질·성향 결·빈 자리) */
  pre: DreamOp[];
  segs: DreamSeg[];
  post: DreamOp[];
  /** 몽망이 자리: 인화 영역 중심에서 벗어난 정도(단위 카드 폭) */
  anchor: { x: number; y: number };
  /** 몽망이: W(카드 폭 단위), 핵 크기 */
  body: { w: number; s: number };
  /** 몽망이 둘레 빈 자리 반경 */
  pool: number;
  /** 먹 색(0..1 rgb): inkTone 0 회청 → 1 짙은 흑 */
  ink: [number, number, number];
  /** 이불: 몽망이 아랫몸을 덮는 무늬 띠(c0 기준 윗선 y, 무늬를 끌어올 거리) */
  cover: { y: number; shift: number; wobble: number } | null;
}

/** 셰이더 uniform 상한(모바일 GPU 프래그먼트 uniform 256 vec4 안쪽) */
export const DREAM_LIMITS = { pre: 40, post: 28, segs: 40 } as const;

/** 미리보기·테스트용 성향 3종(느긋·섬세 / 가운데 / 재빠름·대담) */
export const DREAM_TEMPERS = {
  a: { inkTone: 0.15, flow: -0.85 },
  b: { inkTone: 0.5, flow: 0 },
  c: { inkTone: 0.9, flow: 0.85 },
} as const;

// ---------- 시드 ----------

function fnv(h: number, v: number): number {
  let x = h ^ (v & 0xff);
  x = Math.imul(x, 16777619);
  x ^= (v >>> 8) & 0xff;
  x = Math.imul(x, 16777619);
  x ^= (v >>> 16) & 0xff;
  x = Math.imul(x, 16777619);
  x ^= (v >>> 24) & 0xff;
  return Math.imul(x, 16777619) >>> 0;
}

/** 시드 = 세이브 내용(카드 필드 + 획 정본 점열·부착)의 FNV-1a. 같은 날 같은 몽망이 → 같은 카드 */
export function dreamCardSeed(card: DreamCard, strokes: readonly StrokeRecord[]): number {
  let h = 2166136261;
  const q = (v: number) => Math.round(v * 1000) | 0;
  h = fnv(h, card.night);
  for (let i = 0; i < card.motifId.length; i++) h = fnv(h, card.motifId.charCodeAt(i));
  h = fnv(h, card.composition);
  h = fnv(h, q(card.inkTone));
  h = fnv(h, q(card.flow));
  h = fnv(h, card.flowSeed | 0);
  h = fnv(h, card.nightsMerged);
  for (const s of strokes) {
    h = fnv(h, s.raw.length);
    for (const p of s.raw) {
      h = fnv(h, q(p.x));
      h = fnv(h, q(p.y));
      h = fnv(h, p.t | 0);
    }
    h = fnv(h, q(s.attach.theta));
    h = fnv(h, q(s.attach.rot));
  }
  return h >>> 0;
}

// ---------- 배치 ----------

export interface DreamTextItem {
  key: 'name' | 'line' | 'sub';
  x: number;
  y: number;
  size: number;
  align: 'left' | 'center' | 'right';
  vertical: boolean;
  role: 'serif' | 'serifLight' | 'italic';
  color: string;
  spacing: number;
}

export interface DreamLayout {
  aspect: DreamAspect;
  /** 카드 높이(폭 = 1) */
  height: number;
  sheet: { x: number; y: number; w: number; h: number };
  /** 인화(마블링) 영역 중심·반경 예산 */
  print: { x: number; y: number; r: number };
  text: DreamTextItem[];
  seal: { x: number; y: number; size: number };
  dots: { x: number; y: number; gap: number; r: number };
}

/** 공유 비율 두 가지. 9:16은 인스타 스토리 위 14%·아래 18% UI 띠를 바탕(밤 물)으로 비워 둔다 */
export function dreamCardLayout(aspect: DreamAspect): DreamLayout {
  const tall = aspect === '9:16';
  const H = tall ? 16 / 9 : 1.25;
  const sheet = tall ? { x: 0.055, y: 0.2, w: 0.89, h: 1.32 } : { x: 0.045, y: 0.045, w: 0.91, h: 1.16 };
  const print = tall ? { x: 0.5, y: 0.7, r: 0.38 } : { x: 0.5, y: 0.46, r: 0.34 };
  const lineY = tall ? 1.255 : 0.98;
  const text: DreamTextItem[] = [
    { key: 'name', x: sheet.x + sheet.w - 0.062, y: sheet.y + 0.07, size: 0.033, align: 'center', vertical: true, role: 'serif', color: '#2A2622', spacing: 0.012 },
    { key: 'line', x: 0.5, y: lineY, size: 0.03, align: 'center', vertical: false, role: 'serifLight', color: '#2A2622', spacing: 0.0012 },
    { key: 'sub', x: 0.5, y: lineY + 0.052, size: 0.021, align: 'center', vertical: false, role: 'italic', color: '#6B625A', spacing: 0.0016 },
  ];
  return {
    aspect,
    height: H,
    sheet,
    print,
    text,
    seal: { x: sheet.x + sheet.w - 0.105, y: sheet.y + sheet.h - 0.105, size: 0.056 },
    dots: { x: 0.5, y: lineY + 0.1, gap: 0.03, r: 0.0055 },
  };
}

// ---------- 장면 ----------

type Rng = () => number;
function makeRng(seed: number): Rng {
  let s = seed | 0;
  return () => {
    const o = rngNext(s);
    s = o.seed;
    return o.value;
  };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** 빈 자리 방울(마지막)이 밀어낸 뒤의 자리 → 그 전 자리(넓이 보존 사상의 역) */
function prePos(x: number, y: number, pool: number): { x: number; y: number } {
  const d = Math.hypot(x, y);
  if (d <= pool) return { x: 0, y: 0 };
  const k = Math.sqrt(1 - (pool * pool) / (d * d));
  return { x: x * k, y: y * k };
}

/** 동심 방울 묶음(먼저 = 바깥). [농도, 반경] */
function rings(out: DreamOp[], x: number, y: number, list: readonly (readonly [number, number, boolean?])[]) {
  for (const [ink, r, gold] of list) out.push({ k: 'drop', x, y, r, ink, gold: gold || undefined });
}

export interface DreamSceneInput {
  card: DreamCard;
  strokes: readonly StrokeRecord[];
  aspect?: DreamAspect;
}

export function buildDreamScene({ card, strokes, aspect = '4:5' }: DreamSceneInput): DreamScene {
  const seed = dreamCardSeed(card, strokes);
  const rnd = makeRng(seed ^ 0x9e3779b9);
  const lay = dreamCardLayout(aspect);
  const motif = MOTIFS.find((m) => m.id === card.motifId)?.id ?? 'center.moon';
  const B = clamp(card.inkTone, 0, 1);
  const T = clamp(card.flow, -1, 1);
  const n = strokes.length;
  const s = coreScale(n);
  const W = 0.128;
  const pool = 0.86 * s * W;
  const side = card.composition === 1 ? -1 : 1;
  const tall = aspect === '9:16';
  const R = lay.print.r;
  const pre: DreamOp[] = [];
  const post: DreamOp[] = [];
  /** 모든 결이 지나간 뒤 떨군 방울(둥글게 남아야 하는 달·별·다른 방울·빗방울 무늬) */
  const late: DreamOp[] = [];
  /** 빈 자리 뒤(창처럼 자리가 정확해야 하는 것) */
  const final: DreamOp[] = [];
  let ringShare = 1;
  let ringCount = (8 + 1.1 * Math.min(n, 8)) * (1.25 - 0.4 * B);
  let outerFade = 0.28;
  const anchor = { x: card.composition === 0 ? 0 : side * 0.035, y: 0 };
  let cover: DreamScene['cover'] = null;

  // 모티프별 고리 예산·자리
  switch (motif) {
    case 'near-alone.teacup':
      ringCount *= 0.8;
      outerFade = 0.45;
      ringShare = 0.86;
      break;
    case 'near-with.teacup-two':
      ringCount *= 0.7;
      ringShare = 0.72;
      anchor.x = -side * 0.09;
      break;
    case 'far-alone.mountain':
      anchor.y = tall ? 0.2 : 0.12;
      ringShare = 0.92;
      break;
    case 'far-alone.sea':
    case 'far-with.sea-hand':
      anchor.y = tall ? -0.16 : -0.12;
      ringShare = 0.95;
      break;
    case 'far-with.stars-drops':
      ringCount *= 0.6;
      ringShare = 0.62;
      break;
    case 'center.moon':
      ringShare = 0.82;
      anchor.x = -side * 0.06;
      anchor.y = tall ? 0.1 : 0.05;
      break;
    case 'center.rain':
      ringShare = 0.92;
      break;
    default:
      break;
  }

  // 1) 동심 고리 — 먼저 떨군 방울이 가장 바깥
  const N = Math.round(clamp(ringCount, 7, 26));
  const levels = [0.14 + 0.1 * B, 0.3 + 0.22 * B, 0.52 + 0.3 * B];
  const clearP = 0.42 - 0.18 * B;
  const kinds: number[] = [];
  const weights: number[] = [];
  let lastClear = true;
  for (let i = 0; i < N; i++) {
    const clear: boolean = !lastClear && i > 0 && rnd() < clearP;
    lastClear = clear;
    const pick = rnd();
    const lv = pick < 0.34 - 0.2 * B ? 0 : pick < 0.72 - 0.15 * B ? 1 : 2;
    const fade = i < N * outerFade ? 0.3 + (0.7 * i) / (N * outerFade) : 1;
    kinds.push(clear ? 0 : levels[lv]! * fade);
    // 섬세 = 고른 가는 고리, 대담 = 들쭉날쭉 굵은 띠
    const u = rnd();
    weights.push(clear ? 0.3 + 0.9 * u : 0.35 + (1.2 + 2.2 * B) * u * u);
  }
  // 빈 자리 바로 바깥은 옅게(짙은 고리가 빈 자리를 감싸면 과녁·눈동자로 읽힌다)
  for (let i = Math.max(0, N - 2); i < N; i++) kinds[i] = Math.min(kinds[i]!, levels[0]!);
  const ringArea = Math.max(R * R * ringShare - pool * pool, 0.02);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const ringR2 = weights.map((w) => (ringArea * w) / wsum);
  // 금박 실선 2줄: 최종 반지름에서 두께 0.0022가 되게
  const goldAt = new Set([Math.round(N * 0.42), Math.round(N * 0.78)]);
  let tail = pool * pool;
  const finalR: number[] = new Array(N);
  for (let i = N - 1; i >= 0; i--) {
    tail += ringR2[i]!;
    finalR[i] = Math.sqrt(tail);
  }
  for (let i = 0; i < N; i++) {
    if (goldAt.has(i)) pre.push({ k: 'drop', x: 0, y: 0, r: Math.sqrt(2 * finalR[i]! * 0.0022), ink: 1, gold: true });
    pre.push({ k: 'drop', x: 0, y: 0, r: Math.sqrt(ringR2[i]!), ink: kinds[i]! });
  }

  // 2) 모티프 형상 — late = 모든 결이 지나간 뒤(곧게·둥글게 남아야 읽히는 것)
  const P = (x: number, y: number) => prePos(x, y, pool);
  let calm = 1;
  switch (motif) {
    case 'near-alone.quilt': {
      // 포근한 이불: 몽망이 아랫몸을 덮은 무늬 띠(빈 자리 없이 고리가 이어짐) + 앞뒤로 빗질한 주름
      for (let k = 0; k < 5; k++) late.push({ k: 'tine', x: 0, y: 0.03 + k * 0.05, dx: (k % 2 ? -1 : 1) * (0.06 + 0.012 * rnd()), dy: 0, lambda: 0.012, len: 0 });
      late.push({ k: 'wave', dx: 0, dy: 1, amp: 0.01, freq: 19, phase: rnd() * 6.28 });
      cover = { y: 0.006 * s, shift: 0, wobble: 0.006 };
      calm = 0.7;
      break;
    }
    case 'near-alone.teacup': {
      // 찻잔 하나(위에서 본 찻잔): 빈 자리 바로 바깥 짙은 테 + 금박 = 찻잔 입술, 옆 고리 = 손잡이, 잔잔한 찻물
      const rim = pool + 0.02;
      late.push({ k: 'drop', x: 0, y: 0, r: Math.sqrt(2 * rim * 0.02), ink: 0.85 });
      late.push({ k: 'drop', x: 0, y: 0, r: Math.sqrt(2 * rim * 0.003), ink: 1, gold: true });
      late.push({ k: 'drop', x: 0, y: 0, r: Math.sqrt(2 * rim * 0.016), ink: 0 });
      const h = P(side * (pool + 0.115), 0.01);
      rings(late, h.x, h.y, [[0.8, 0.052], [0, 0.04]]);
      calm = 0.35;
      break;
    }
    case 'near-with.window-hand': {
      // 창가의 손: 곧은 빗질 격자 = 창살(결 뒤에 그어 곧게), 아래에서 들어오는 옅은 담묵 덩이 + 네 가닥 끌림 = 다가오는 손
      const hx = side * 0.27;
      const hy = 0.25;
      const h = P(hx, hy);
      rings(pre, h.x, h.y, [[0.14, 0.1], [0.05, 0.06], [0.24, 0.035]]);
      const d = Math.hypot(hx, hy);
      for (let k = 0; k < 4; k++) {
        const o = (k - 1.5) * 0.028;
        post.push({ k: 'tine', x: hx * 0.7 + (-hy / d) * o, y: hy * 0.7 + (hx / d) * o, dx: (-hx / d) * 0.06, dy: (-hy / d) * 0.06, lambda: 0.007, len: 0.07 + 0.015 * (k % 2) });
      }
      // 창: 빈 자리를 놓은 뒤, 짙은 테를 두른 맑은 방울 넷을 맞대어 떨군다 → 맞닿은 테가 눌려 곧은 창살(십자)이 된다
      const wx = -side * 0.13;
      const wy = -0.185;
      for (let k = 0; k < 4; k++) {
        const x = wx + (k % 2 ? 0.047 : -0.047);
        const y = wy + (k < 2 ? -0.047 : 0.047);
        final.push({ k: 'drop', x, y, r: 0.016, ink: 0.8 });
        final.push({ k: 'drop', x, y, r: 0.044, ink: 0 });
      }
      calm = 0.6;
      break;
    }
    case 'near-with.teacup-two': {
      // 찻잔 둘: 옆에 작은 찻잔 고리 + 그 가운데 다른 방울, 두 잔 사이를 잇는 저은 물길
      const c1 = { x: side * 0.27, y: 0.1 };
      const p1 = P(c1.x, c1.y);
      post.push({ k: 'curl', x: c1.x * 0.5, y: c1.y * 0.5, angle: side * 0.9, radius: 0.11 });
      rings(late, p1.x, p1.y, [[0.7, 0.05], [1, 0.012, true], [0, 0.04], [0.92, 0.024]]);
      calm = 0.5;
      break;
    }
    case 'far-alone.mountain': {
      // 먼 산: 고리를 납작하게 눌러 지층처럼 겹친 띠 → 세 곳을 들어올린 능선(원산), 위로 갈수록 옅은 안개
      late.push({ k: 'scale', x: 0, y: -0.02, sx: 1.25, sy: 0.55 });
      const peaks: [number, number, number][] = [
        [-0.17, 0.12, 0.07],
        [0.08, 0.2, 0.085],
        [0.27, 0.09, 0.055],
      ];
      for (const [x, hgt, w] of peaks) late.push({ k: 'tine', x: side * x, y: 0, dx: 0, dy: -hgt * (tall ? 1.25 : 1), lambda: w, len: 0, gauss: true });
      calm = 0.35;
      break;
    }
    case 'far-alone.sea':
    case 'far-with.sea-hand': {
      // 바다: 고리를 가로로 길게 눌러 편 물띠 + 좌우 빗질 + 너울. 손잡고 본 바다 = 곁의 다른 방울
      late.push({ k: 'scale', x: 0, y: 0.06, sx: 1.5, sy: 0.5 });
      // 물띠 전체를 몽망이 아래로 내린다(몽망이는 수면 위에 앉는다 — 가운데 두면 눈동자로 읽힘)
      late.push({ k: 'tine', x: 0, y: 0, dx: 0, dy: 0.088 * (tall ? 1.2 : 1), lambda: 40, len: 0, gauss: true });
      for (let k = 0; k < 4; k++) late.push({ k: 'tine', x: 0, y: 0.1 + k * 0.05 * (tall ? 1.2 : 1), dx: (k % 2 ? -1 : 1) * (0.08 + 0.03 * rnd()), dy: 0, lambda: 0.012, len: 0 });
      late.push({ k: 'wave', dx: 0, dy: 1, amp: 0.012, freq: 17, phase: rnd() * 6.28 });
      if (motif === 'far-with.sea-hand') {
        const f = P(side * 0.205, 0.035);
        rings(late, f.x, f.y, [[0.3, 0.036], [0, 0.03], [0.92, 0.03]]);
      }
      calm = 0.3;
      break;
    }
    case 'far-with.stars-drops': {
      // 별과 물방울: 작은 먹점·금점(별) + 먼 곳의 다른 방울 하나, 은하처럼 크게 감긴 물
      for (let k = 0; k < 11; k++) {
        const a = rnd() * 6.28;
        const d = R * (0.5 + 0.55 * rnd());
        const p = P(Math.cos(a) * d, Math.sin(a) * d);
        const r = 0.0032 + 0.005 * rnd() * rnd();
        late.push({ k: 'drop', x: p.x, y: p.y, r, ink: 0.85, gold: k % 3 === 0 || undefined });
      }
      const f = P(-side * 0.24, -0.17);
      rings(late, f.x, f.y, [[0.25, 0.034], [0, 0.028], [0.94, 0.026]]);
      post.push({ k: 'curl', x: 0, y: 0, angle: side * 0.8, radius: R * 1.05 });
      break;
    }
    case 'center.rain': {
      // 빗소리: 곧은 세로 빗질 = 빗줄기(결 뒤), 아래쪽 가는 동그라미 = 빗방울이 떨어진 물무늬
      // 먹 한 점을 떨구고 바로 아래로 끌면 빗방울 모양 줄이 된다(결 뒤)
      for (let k = 0; k < 8; k++) {
        const p = P((k / 7 - 0.5) * R * 1.7 + (rnd() - 0.5) * 0.04, (rnd() - 0.7) * R * 1.3);
        const len = 0.09 + 0.06 * rnd();
        late.push({ k: 'drop', x: p.x, y: p.y, r: 0.009 + 0.004 * rnd(), ink: 0.62 });
        late.push({ k: 'tine', x: p.x, y: p.y + len * 0.45, dx: len * 0.22 * side, dy: len, lambda: 0.005, len: len * 0.55 });
      }
      const rp = P(side * R * 0.35, R * 0.7);
      rings(late, rp.x, rp.y, [[0.45, 0.04], [0, 0.037]]);
      calm = 0.6;
      break;
    }
    case 'center.moon':
    default: {
      // 둥근 달: 결이 지나간 뒤 떨군 큰 맑은 방울이 고리를 밀어낸 둥근 빈자리 + 금박 테 + 아주 옅은 달빛
      const m = P(side * 0.19, tall ? -0.26 : -0.215);
      rings(late, m.x, m.y, [[0, 0.03], [1, 0.016, true], [0.035, 0.1]]);
      break;
    }
  }

  // 3) 획 빗질: 그은 순서대로, 마지막(간밤) 획이 가장 세게
  const segs: DreamSeg[] = [];
  const recent = strokes.slice(-8);
  const K = [2.35, 2.15, 2.55][card.composition] ?? 2.35;
  const phi = [0, 0.45, -0.45][card.composition]! + (rnd() - 0.5) * 0.3;
  const cph = Math.cos(phi);
  const sph = Math.sin(phi);
  const lambda = 0.03 - 0.015 * T;
  const perStroke = Math.max(3, Math.floor(DREAM_LIMITS.segs / Math.max(1, recent.length)));
  recent.forEach((rec, si) => {
    const pts: RawPoint[] = simplifyStroke(rec.raw);
    if (pts.length < 2) return;
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    const dur = Math.max(80, (rec.raw[rec.raw.length - 1]?.t ?? 0) - (rec.raw[0]?.t ?? 0));
    const speed = clamp(((L / dur) * 1000) / 2.2, 0, 1);
    const newest = si === recent.length - 1;
    const z = (0.045 + 0.05 * speed) * (newest ? 1.6 : 0.8 + 0.2 * (si / Math.max(1, recent.length - 1)));
    const m = Math.min(perStroke, pts.length - 1);
    const map = (p: RawPoint) => {
      const x = p.x * W * K;
      const y = p.y * W * K;
      return { x: x * cph - y * sph, y: x * sph + y * cph };
    };
    for (let j = 0; j < m; j++) {
      const a = map(pts[Math.round((j * (pts.length - 1)) / m)]!);
      const b = map(pts[Math.round(((j + 1) * (pts.length - 1)) / m)]!);
      const env = Math.sin((Math.PI * (j + 0.5)) / m) * 0.75 + 0.25;
      segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, z: z * env, lambda, stroke: si });
    }
  });

  // 4) 성향의 결
  const dir = (card.flowSeed & 1) === 0 ? 1 : -1;
  // 물을 부는 숨 2~3번(큰 결): 05a의 크게 휜 띠. 느긋할수록 넓고 길게, 재빠를수록 짧고 촘촘하게
  const blows = 2 + (card.flowSeed % 2);
  for (let k = 0; k < blows; k++) {
    const a = rnd() * 6.28;
    const off = (rnd() - 0.5) * R * 1.1;
    const z = (0.05 + 0.05 * rnd()) * (1.15 - 0.35 * T) * calm;
    post.push({ k: 'tine', x: -Math.sin(a) * off, y: Math.cos(a) * off, dx: Math.cos(a) * z, dy: Math.sin(a) * z, lambda: R * (0.32 - 0.12 * T), len: 0, gauss: true });
  }
  post.push({ k: 'curl', x: 0, y: 0, angle: dir * (T < 0 ? 1.3 + 1.5 * -T : 1.0 - 0.4 * T) * calm, radius: R * (0.62 - 0.12 * T) });
  if (T > 0.05) {
    const ph = ((card.flowSeed >>> 3) % 628) / 100;
    post.push({ k: 'wave', dx: 1, dy: 0, amp: 0.0009 + 0.0016 * T, freq: 120, phase: ph });
    post.push({ k: 'wave', dx: 0, dy: 1, amp: 0.0009 + 0.0016 * T, freq: 104, phase: ph * 1.7 });
  } else {
    post.push({ k: 'wave', dx: 0, dy: 1, amp: 0.006 + 0.008 * -T, freq: 9, phase: rnd() * 6.28 });
  }
  if (motif.startsWith('far')) {
    const a = ((card.flowSeed >>> 5) % 360) * (Math.PI / 180);
    post.push({ k: 'tine', x: 0, y: 0, dx: Math.cos(a) * 0.05, dy: Math.sin(a) * 0.05 * 0.4, lambda: 0.2, len: 0, gauss: true });
  }

  post.push(...late);
  // 5) 몽망이가 앉는 빈 자리
  post.push({ k: 'drop', x: 0, y: 0, r: pool, ink: 0 });
  post.push(...final);
  // 빈 자리 가장자리도 완벽한 원이 아니게(눈동자·과녁으로 읽히지 않게)
  post.push({ k: 'wave', dx: 1, dy: 0, amp: 0.006, freq: 13, phase: rnd() * 6.28 });
  post.push({ k: 'wave', dx: 0, dy: 1, amp: 0.005, freq: 11, phase: rnd() * 6.28 });

  // uniform 상한: 고리(앞쪽 = 바깥)부터가 아니라 가장 안 보이는 바깥 옅은 고리부터 자른다
  while (pre.length > DREAM_LIMITS.pre) pre.splice(0, 1);
  while (post.length > DREAM_LIMITS.post) post.splice(0, 1);
  const segsCapped = segs.slice(-DREAM_LIMITS.segs);

  // 먹 색: 회청(#3A4252) → 짙은 흑(#1B1A18)
  const c0 = [0x3a, 0x42, 0x52];
  const c1 = [0x1b, 0x1a, 0x18];
  const ink = [0, 1, 2].map((i) => (c0[i]! + (c1[i]! - c0[i]!) * B) / 255) as [number, number, number];

  return { seed, motifId: motif, pre, segs: segsCapped, post, anchor, body: { w: W, s }, pool, ink, cover };
}
