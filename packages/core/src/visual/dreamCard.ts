// 꿈 인화 카드(아침 현상) 장면 문법 v1 — 순수 TS. 렌더러(apps/mobile/src/render/dreamCard)가 이 장면을 셰이더 uniform으로 옮긴다.
//
// 문법: 간밤의 획이 물에 풀려(스미나가시) 한지에 찍힌 한 장.
//  1) 먹·맑은 물을 번갈아 떨어뜨린 동심 고리(먼저 떨군 방울이 가장 바깥). 고리 중심은 몽망이에서 비켜 두고 소용돌이로 감는다
//     — 몽망이를 고리 정중앙에 두면 눈동자·과녁으로 읽힌다(리뷰 2026-11-20 1-2)
//  2) 모티프마다 '물 위에서 할 수 있는 조작'만으로 형상을 만든다(방울 = 달·찻잔 손잡이·별, 빗질 = 창살·이불 주름·빗줄기, 들어올림 = 산)
//  3) 몽망이가 실제로 그은 획(D-13 정본 점열)이 붓대처럼 물을 끌고 지나간 자국
//  4) 성향의 결: tempo = 너울(느긋: 큰 소용돌이) / 잔물결(재빠름: 고리 가장자리의 잔떨림), boldness = 농담·고리 수·굵기,
//     curiosity(모티프 구역 far) = 한쪽으로 뻗음, closeness(-with) = 다른 방울
//  5) 마지막에 몸보다 조금 큰 맑은 물(몽망이가 앉는 자리). 이불·찻잔은 그림(그릇)으로 얹는다. 획 옷은 그리지 않는다(밤새 물에 풀렸다)
// 방울 연산은 넓이를 보존하는 정확한 사상(Jaffer & Lu, "Mathematical Marbling")이라 픽셀마다 역사상으로 되짚어 색을 찾는다.
// 결정성: 같은 카드 + 같은 획 기록 → 같은 시드 → 같은 장면(Math.random·시각 사용 금지).
import { hexRgb, mixHex, type InkLook } from './ink';
import { simplifyStroke } from '../geometry/simplify';
import type { RawPoint, StrokeRecord } from '../geometry/types';
import { MOTIFS } from '../sim/dream';
import { isMoonMotifId, moonMotifUsable } from '../moon/motifs';
import { rngNext } from '../sim/rng';
import type { DreamCard } from '../sim/types';
import { coreScale } from './bodySpec';

export type DreamAspect = '4:5' | '9:16';

/** 물 위 조작 하나. 좌표 = 몽망이 중심(c0) 원점, 단위 = 카드 폭, y 아래 */
export type DreamOp =
  /** 방울: 반경 r, 먹 농도 ink(0 = 맑은 물), gold = 금박 실선, seat = 몽망이 자리(빈 자리) */
  | { k: 'drop'; x: number; y: number; r: number; ink: number; gold?: boolean; seat?: boolean }
  /** 빗질(직선, 정확한 역사상): (x,y)를 지나는 선을 따라 (dx,dy)만큼 끈다. lambda = 번짐 폭, gauss = 가우시안 감쇠, len > 0 = 선 길이 창(근사 — 접힘 주의) */
  | { k: 'tine'; x: number; y: number; dx: number; dy: number; lambda: number; len: number; gauss?: boolean }
  /** 소용돌이: 중심에서 angle 라디안(반경 radius 가우시안) */
  | { k: 'curl'; x: number; y: number; angle: number; radius: number }
  /** 물결: 방향 (dx,dy)로 amp·sin(freq·s + phase), s = 직각 방향 좌표 */
  | { k: 'wave'; dx: number; dy: number; amp: number; freq: number; phase: number }
  /** 누르기·펴기(넓이 보존 아님 — 지층·물띠·김): (x,y) 기준 sx·sy배 */
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

/** 물 위에 그린 그릇·이불(마블링 위에 얹는 형상). 좌표 = c0 기준 */
export interface DreamVessel {
  kind: 'quilt' | 'cup';
  x: number;
  y: number;
  /** 폭·높이(카드 폭 단위) */
  w: number;
  h: number;
  /** 잔 손잡이 방향(1 오른쪽, −1 왼쪽) */
  handle: 1 | -1;
  /** 잔 안에 다른 방울 */
  friend: boolean;
}

export interface DreamScene {
  seed: number;
  motifId: string;
  /** 순서: pre(고리 + 모티프 방울) → segs(획 빗질) → post(모티프 빗질·성향 결·늦은 방울·빈 자리) */
  pre: DreamOp[];
  segs: DreamSeg[];
  post: DreamOp[];
  /** 몽망이 자리: 인화 영역 중심에서 벗어난 정도(단위 카드 폭) */
  anchor: { x: number; y: number };
  /** 고리 중심(c0 기준). 몽망이는 고리 한가운데에 두지 않는다(눈동자·과녁 금지) */
  ringC: { x: number; y: number };
  /** 몽망이: W(카드 폭 단위), 핵 크기 */
  body: { w: number; s: number };
  /** 몽망이 자리 빈 물의 대표 반경(몸보다 조금 큼) */
  pool: number;
  /** 먹 색(0..1 rgb): inkTone 0 회청 → 1 짙은 흑 */
  ink: [number, number, number];
  vessels: DreamVessel[];
  /** 곁의 다른 방울(몽망이 밖, c0 기준). 그림으로 그린다 */
  friend: { x: number; y: number; r: number } | null;
  /** 상한 때문에 합치거나 뺀 조작 수(0이어야 정상 — 테스트가 지킨다) */
  trimmed: number;
}

/**
 * 셰이더 uniform 상한. 배열 2 vec4씩 × (pre + post + segs) + 스칼라 묶음 6 vec4 = 194 vec4 ≤ 200
 * (저가 Android 프래그먼트 uniform 약 221~224 vec4 대비 여유. 총량은 mobile 테스트가 SkSL 선언을 세어 고정).
 */
export const DREAM_LIMITS = { pre: 36, post: 26, segs: 32 } as const;

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
  role: 'serif' | 'serifLight' | 'sub';
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
  const print = tall ? { x: 0.5, y: 0.69, r: 0.43 } : { x: 0.5, y: 0.46, r: 0.34 };
  const lineY = tall ? 1.255 : 0.98;
  const text: DreamTextItem[] = [
    { key: 'name', x: sheet.x + sheet.w - 0.062, y: sheet.y + 0.07, size: 0.033, align: 'center', vertical: true, role: 'serif', color: '#2A2622', spacing: 0.012 },
    { key: 'line', x: 0.5, y: lineY, size: 0.03, align: 'center', vertical: false, role: 'serifLight', color: '#2A2622', spacing: 0.0012 },
    { key: 'sub', x: 0.5, y: lineY + 0.052, size: 0.021, align: 'center', vertical: false, role: 'sub', color: '#6B625A', spacing: 0.0016 },
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

/** 몽망이 자리 방울(마지막)이 밀어낸 뒤의 자리 → 그 전 자리(넓이 보존 사상의 역) */
function prePos(x: number, y: number, pool: number): { x: number; y: number } {
  const d = Math.hypot(x, y);
  if (d <= pool) return { x: 0, y: 0 };
  const k = Math.sqrt(1 - (pool * pool) / (d * d));
  return { x: x * k, y: y * k };
}

/** 동심 방울 묶음(먼저 = 바깥). [농도, 반경, 금박] */
function rings(out: DreamOp[], x: number, y: number, list: readonly (readonly [number, number, boolean?])[]) {
  for (const [ink, r, gold] of list) out.push({ k: 'drop', x, y, r, ink, gold: gold || undefined });
}

export interface DreamSceneInput {
  card: DreamCard;
  strokes: readonly StrokeRecord[];
  aspect?: DreamAspect;
  /** 테스트용(상한 동작 확인). 기본 DREAM_LIMITS */
  limits?: { pre: number; post: number; segs: number };
  /** M1 몸의 먹(카드 마블링의 옅은 쪽 먹빛). 없거나 기본 먹이면 빌드 1 카드 그대로 */
  ink?: InkLook;
  /**
   * 개발 빌드인가(앱은 `__DEV__`). 보름 모티프 중 자리표시·초안이 남은 것(`moonMotifBlockers`)은 개발 빌드에서만
   * 임시 형상(center.moon)으로 그리고, 제품 빌드에서는 모티프 형상 없는 **일반 카드**(고리·결·몽망이 자리)로 그린다.
   * 없으면 제품 빌드로 본다(안전한 쪽).
   */
  dev?: boolean;
}

/** 카드가 그릴 모티프 형상 id. 모르는 id는 기존대로 center.moon, 제품 빌드의 미완 보름 모티프는 'plain'(형상 없음) */
export function dreamMotifShape(motifId: string, dev: boolean): string {
  const known = MOTIFS.find((m) => m.id === motifId);
  if (known) return known.id;
  if (isMoonMotifId(motifId) && !moonMotifUsable(motifId, dev)) return 'plain';
  return 'center.moon';
}

/** 뒤 조작 우선순위: 낮은 것부터 뺀다(빈 자리·달·창 같은 형상은 끝까지 남김) */
type Prio = 0 | 1 | 2 | 3 | 4;

export function buildDreamScene({ card, strokes, aspect = '4:5', limits = DREAM_LIMITS, ink: inkIn, dev }: DreamSceneInput): DreamScene {
  const seed = dreamCardSeed(card, strokes);
  const rnd = makeRng(seed ^ 0x9e3779b9);
  const lay = dreamCardLayout(aspect);
  const motif = dreamMotifShape(card.motifId, dev === true);
  const B = clamp(card.inkTone, 0, 1);
  const T = clamp(card.flow, -1, 1);
  const n = strokes.length;
  const s = coreScale(n);
  const W = 0.128;
  // 몽망이 자리 = 몸보다 조금 큰 맑은 물 두 방울(몸 + 빗 끝). 몸보다 훨씬 큰 흰 원은 '홍채'가 된다
  const pool = 0.6 * s * W;
  const side = card.composition === 1 ? -1 : 1;
  const tall = aspect === '9:16';
  const R = lay.print.r;
  const motifPre: DreamOp[] = [];
  const post: { op: DreamOp; p: Prio }[] = [];
  const late: DreamOp[] = [];
  const final: DreamOp[] = [];
  const vessels: DreamVessel[] = [];
  let friend: DreamScene['friend'] = null;
  let ringShare = 1;
  let ringCount = (8 + 1.1 * Math.min(n, 8)) * (1.25 - 0.4 * B);
  // 고리 중심은 몽망이에서 비켜 둔다(몽망이를 정중앙에 감싸면 눈동자·과녁)
  const ringC = { x: side * 0.13, y: -0.11 };
  const anchor = { x: 0, y: 0 };
  let calm = 1;
  let curlK = 1;

  switch (motif) {
    case 'near-alone.quilt':
      // 고리 중심을 인화 밖 위로 빼서 호만 지나가게(잘린 고리 — 과녁 금지)
      ringC.x = -side * 0.2;
      ringC.y = -0.42;
      ringShare = 1.9;
      anchor.y = 0.1;
      break;
    case 'near-alone.teacup':
      ringC.x = 0;
      ringC.y = tall ? -0.3 : -0.24;
      ringShare = 0.5;
      anchor.y = tall ? 0.16 : 0.13;
      break;
    case 'near-with.teacup-two':
      ringC.x = side * 0.13;
      ringC.y = tall ? -0.3 : -0.24;
      ringShare = 0.5;
      anchor.x = -side * 0.12;
      anchor.y = tall ? 0.16 : 0.13;
      break;
    case 'far-alone.mountain':
      ringC.x = 0;
      ringC.y = -0.07;
      anchor.y = tall ? 0.2 : 0.12;
      ringShare = 0.92;
      break;
    case 'far-alone.sea':
      ringC.x = side * 0.14;
      ringC.y = 0.03;
      anchor.x = -side * 0.14;
      anchor.y = tall ? -0.14 : -0.1;
      ringShare = 0.95;
      break;
    case 'far-with.sea-hand':
      ringC.x = side * 0.06;
      ringC.y = 0.03;
      anchor.x = -side * 0.07;
      anchor.y = tall ? -0.14 : -0.1;
      ringShare = 0.95;
      break;
    case 'far-with.stars-drops':
      ringC.x = -side * 0.12;
      ringC.y = -0.1;
      ringCount *= 0.6;
      ringShare = 0.6;
      curlK = 1.4;
      break;
    case 'center.moon':
      ringC.x = -side * 0.06;
      ringC.y = -0.2;
      ringShare = 0.82;
      anchor.x = -side * 0.1;
      anchor.y = tall ? 0.12 : 0.08;
      break;
    case 'center.rain':
      // 비구름: 고리 중심을 인화 위 밖에 두고 아래로 늘어진 호에 빗질
      ringC.x = side * 0.12;
      ringC.y = -0.46;
      ringShare = 1.7;
      anchor.y = 0.12;
      break;
    default:
      break;
  }
  if (anchor.x === 0 && anchor.y === 0) {
    anchor.x = -ringC.x * 0.8;
    anchor.y = -ringC.y * 0.7;
  }
  const P = (x: number, y: number) => prePos(x, y, pool);
  const rc = P(ringC.x, ringC.y);

  // 1) 고리(먼저 = 바깥)
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
    const fade = i < N * 0.28 ? 0.3 + (0.7 * i) / (N * 0.28) : 1;
    kinds.push(clear ? 0 : levels[lv]! * fade);
    const u = rnd();
    weights.push(clear ? 0.3 + 0.9 * u : 0.35 + (1.2 + 2.2 * B) * u * u);
  }
  // 소용돌이 한가운데는 옅게(짙은 점이 생기면 빈 과녁이 된다)
  for (let i = Math.max(0, N - 3); i < N; i++) kinds[i] = Math.min(kinds[i]!, levels[0]! * 0.7);
  const ringArea = R * R * ringShare;
  const wsum = weights.reduce((a, b) => a + b, 0);
  const ringList: DreamOp[] = [];
  const goldAt = new Set([Math.round(N * 0.42), Math.round(N * 0.78)]);
  let tail = 0;
  const finalR: number[] = new Array(N);
  for (let i = N - 1; i >= 0; i--) {
    tail += (ringArea * weights[i]!) / wsum;
    finalR[i] = Math.sqrt(tail);
  }
  for (let i = 0; i < N; i++) {
    if (goldAt.has(i)) ringList.push({ k: 'drop', x: rc.x, y: rc.y, r: Math.sqrt(2 * finalR[i]! * 0.0024), ink: 1, gold: true });
    ringList.push({ k: 'drop', x: rc.x, y: rc.y, r: Math.sqrt((ringArea * weights[i]!) / wsum), ink: kinds[i]! });
  }

  // 2) 모티프 형상(motifPre = 고리 뒤 방울, post p2 = 결 앞 빗질, late = 결 뒤, final = 몽망이 자리 뒤)
  switch (motif) {
    case 'near-alone.quilt': {
      // 포근한 이불: 몽망이 아랫몸을 덮은 누빔 이불(그림) — 물결은 이불 아래로 흐른다
      vessels.push({ kind: 'quilt', x: side * 0.02, y: 0.004, w: 0.37, h: 0.15, handle: 1, friend: false });
      calm = 0.7;
      break;
    }
    case 'near-alone.teacup':
    case 'near-with.teacup-two': {
      // 찻잔: 옆에서 본 잔(그림, 유약은 같은 마블링) 안에 몽망이. 마블링은 잔에서 오르는 김(세로로 편 소용돌이)
      const two = motif === 'near-with.teacup-two';
      vessels.push({ kind: 'cup', x: 0, y: 0.022 * s, w: 0.28, h: 0.14, handle: two ? (-side as 1 | -1) : (side as 1 | -1), friend: false });
      post.push({ op: { k: 'scale', x: ringC.x, y: ringC.y, sx: 0.62, sy: 1.5 }, p: 3 });
      // 김은 몸을 비틀며 오른다: 세로로 편 고리를 좌우로 흔들고(가로 물결) 위쪽을 감는다 — 세운 과녁이 되지 않게
      late.push({ k: 'wave', dx: 1, dy: 0, amp: 0.034, freq: 13, phase: rnd() * 6.28 });
      late.push({ k: 'curl', x: ringC.x, y: ringC.y - 0.06, angle: side * 2.2, radius: 0.11 });
      if (two) {
        const fx = side * 0.27;
        vessels.push({ kind: 'cup', x: fx, y: 0.05, w: 0.2, h: 0.1, handle: side as 1 | -1, friend: true });
        // 두 잔의 김이 꼬여 하나로(서로 반대 방향 소용돌이)
        post.push({ op: { k: 'curl', x: ringC.x - side * 0.08, y: ringC.y + 0.06, angle: side * 1.6, radius: 0.1 }, p: 2 });
        post.push({ op: { k: 'curl', x: ringC.x + side * 0.08, y: ringC.y - 0.02, angle: -side * 1.6, radius: 0.1 }, p: 2 });
      }
      calm = 0.45;
      break;
    }
    case 'near-with.window-hand': {
      // 창가의 손: 짙은 테 맑은 방울 넷을 맞대 창살, 아래에서 들어오는 담묵 손(네 가닥 끌림)
      const hx = side * 0.27;
      const hy = 0.25;
      const h = P(hx, hy);
      rings(motifPre, h.x, h.y, [[0.14, 0.1], [0.05, 0.06], [0.24, 0.035]]);
      const d = Math.hypot(hx, hy);
      for (let k = 0; k < 4; k++) {
        const o = (k - 1.5) * 0.028;
        post.push({ op: { k: 'tine', x: hx * 0.7 + (-hy / d) * o, y: hy * 0.7 + (hx / d) * o, dx: (-hx / d) * 0.04, dy: (-hy / d) * 0.04, lambda: 0.01, len: 0.09 }, p: 2 });
      }
      const wx = -side * 0.14;
      const wy = -0.19;
      for (let k = 0; k < 4; k++) {
        const x = wx + (k % 2 ? 0.047 : -0.047);
        const y = wy + (k < 2 ? -0.047 : 0.047);
        final.push({ k: 'drop', x, y, r: 0.016, ink: 0.8 });
        final.push({ k: 'drop', x, y, r: 0.044, ink: 0 });
      }
      calm = 0.6;
      break;
    }
    case 'far-alone.mountain': {
      // 먼 산: 고리를 납작하게 눌러 지층 → 세 곳을 들어올린 능선. 몽망이는 산 앞 들판에
      late.push({ k: 'scale', x: ringC.x, y: ringC.y, sx: 1.25, sy: 0.55 });
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
      // 바다: 고리를 가로로 펴 물띠 → 몽망이 아래로 내림 + 너울(가로 빗질은 넓게 — 좁으면 찢긴 화면처럼 보임)
      late.push({ k: 'scale', x: ringC.x, y: ringC.y, sx: 1.55, sy: 0.48 });
      late.push({ k: 'tine', x: 0, y: 0, dx: 0, dy: 0.085 * (tall ? 1.2 : 1), lambda: 40, len: 0, gauss: true });
      for (let k = 0; k < 3; k++) late.push({ k: 'tine', x: 0, y: 0.11 + k * 0.06, dx: (k % 2 ? -1 : 1) * 0.045, dy: 0, lambda: 0.028, len: 0 });
      late.push({ k: 'wave', dx: 0, dy: 1, amp: 0.011, freq: 15, phase: rnd() * 6.28 });
      if (motif === 'far-with.sea-hand') {
        // 손잡고 본 바다: 곁에 작은 방울 하나, 두 자리가 맞닿아 한 웅덩이
        friend = { x: side * 0.135, y: 0.022, r: 0.6 };
        final.push({ k: 'drop', x: side * 0.135, y: 0.02, r: pool * 0.66, ink: 0 });
        final.push({ k: 'drop', x: side * 0.07, y: 0.04, r: 0.03, ink: 0 });
      } else {
        // 혼자 보는 바다: 수평선 끝의 금빛 해 한 점
        final.push({ k: 'drop', x: side * 0.36, y: -0.02, r: 0.0035, ink: 1, gold: true });
        final.push({ k: 'drop', x: side * 0.36, y: -0.02, r: 0.017, ink: 0.06 });
      }
      calm = 0.3;
      break;
    }
    case 'far-with.stars-drops': {
      // 별과 물방울: 은하처럼 감긴 물 + 작은 먹점·금점 + 멀리 다른 방울 하나
      for (let k = 0; k < 10; k++) {
        const a = rnd() * 6.28;
        const d = R * (0.45 + 0.6 * rnd());
        const p = P(ringC.x + Math.cos(a) * d, ringC.y + Math.sin(a) * d);
        late.push({ k: 'drop', x: p.x, y: p.y, r: 0.0032 + 0.005 * rnd() * rnd(), ink: 0.85, gold: k % 3 === 0 || undefined });
      }
      friend = { x: -side * 0.3, y: -0.26, r: 0.5 };
      final.push({ k: 'drop', x: -side * 0.3, y: -0.262, r: pool * 0.55, ink: 0 });
      break;
    }
    case 'center.rain': {
      // 빗소리: 같은 방향으로 곧게 그은 가는 빗질 여러 줄 = 빗줄기(정확한 전단이라 접히지 않음) + 몽망이 앞 물무늬 한 겹
      const slant = 0.32 * side + 0.15 * T;
      for (let k = 0; k < 9; k++) {
        const x = ringC.x + (k - 4) * 0.072 + (rnd() - 0.5) * 0.02;
        const dy = 0.035 + 0.012 * rnd();
        late.push({ k: 'tine', x, y: 0, dx: dy * slant, dy, lambda: 0.0065, len: 0 });
      }
      calm = 0.6;
      break;
    }
    case 'center.moon':
    default: {
      // 둥근 달: 결 뒤 큰 맑은 방울 + 금박 테. 고리가 달을 감아 돈다
      const m = P(side * 0.2, tall ? -0.27 : -0.225);
      rings(late, m.x, m.y, [[0, 0.03], [1, 0.016, true], [0.035, 0.1]]);
      break;
    }
  }

  // 3) 획 빗질: 몽망이 둘레에서, 간밤 획이 가장 세게. 끄는 세기는 번짐 폭 이하(그보다 세면 물이 접혀 조각이 튄다)
  const segs: DreamSeg[] = [];
  const recent = strokes.slice(-8);
  const K = [2.35, 2.15, 2.55][card.composition] ?? 2.35;
  const phi = [0, 0.45, -0.45][card.composition]! + (rnd() - 0.5) * 0.3;
  const cph = Math.cos(phi);
  const sph = Math.sin(phi);
  const lambda = 0.04 - 0.015 * T;
  const perStroke = Math.max(2, Math.floor(limits.segs / Math.max(1, recent.length)));
  recent.forEach((rec, si) => {
    const pts: RawPoint[] = simplifyStroke(rec.raw);
    if (pts.length < 2) return;
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    const dur = Math.max(80, (rec.raw[rec.raw.length - 1]?.t ?? 0) - (rec.raw[0]?.t ?? 0));
    const speed = clamp(((L / dur) * 1000) / 2.2, 0, 1);
    const newest = si === recent.length - 1;
    const z = Math.min(lambda * 1.1, (0.03 + 0.03 * speed) * (newest ? 1.4 : 0.8));
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

  // 4) 성향의 결: 숨(넓은 가우시안 빗질 = 정확한 전단) + 고리 중심의 소용돌이(동심원 → 나선)
  const dir = (card.flowSeed & 1) === 0 ? 1 : -1;
  const blows = 2 + (card.flowSeed % 2);
  for (let k = 0; k < blows; k++) {
    const a = rnd() * 6.28;
    const off = (rnd() - 0.5) * R * 1.1;
    const z = (0.05 + 0.05 * rnd()) * (1.15 - 0.35 * T) * calm;
    post.push({ op: { k: 'tine', x: ringC.x - Math.sin(a) * off, y: ringC.y + Math.cos(a) * off, dx: Math.cos(a) * z, dy: Math.sin(a) * z, lambda: R * (0.32 - 0.12 * T), len: 0, gauss: true }, p: 1 });
  }
  post.push({ op: { k: 'curl', x: ringC.x, y: ringC.y, angle: dir * (T < 0 ? 1.6 + 1.6 * -T : 1.3 - 0.5 * T) * calm * curlK, radius: R * (0.6 - 0.1 * T) }, p: 3 });
  if (T > 0.05) {
    // 재빠름 = 잔물결. 주파수를 낮춰 계단·찢김으로 보이지 않게
    const ph = ((card.flowSeed >>> 3) % 628) / 100;
    post.push({ op: { k: 'wave', dx: 1, dy: 0, amp: 0.0012 + 0.0022 * T, freq: 46, phase: ph }, p: 1 });
    post.push({ op: { k: 'wave', dx: 0, dy: 1, amp: 0.0012 + 0.0022 * T, freq: 39, phase: ph * 1.7 }, p: 0 });
  } else {
    post.push({ op: { k: 'wave', dx: 0, dy: 1, amp: 0.006 + 0.008 * -T, freq: 9, phase: rnd() * 6.28 }, p: 1 });
  }
  if (motif.startsWith('far')) {
    const a = ((card.flowSeed >>> 5) % 360) * (Math.PI / 180);
    post.push({ op: { k: 'tine', x: ringC.x, y: ringC.y, dx: Math.cos(a) * 0.05, dy: Math.sin(a) * 0.02, lambda: 0.2, len: 0, gauss: true }, p: 0 });
  }
  for (const op of late) post.push({ op, p: 3 });
  // 5) 몽망이 자리: 몸 + 빗 끝 두 방울(완전한 원이 아니게)
  post.push({ op: { k: 'drop', x: 0, y: 0.008, r: pool, ink: 0, seat: true }, p: 4 });
  for (const op of final) post.push({ op, p: 3 });
  post.push({ op: { k: 'wave', dx: 1, dy: 0, amp: 0.004, freq: 13, phase: rnd() * 6.28 }, p: 0 });

  // 상한: 고리는 안쪽 둘을 합쳐 줄이고(가장 바깥 고리는 그대로), 뒤 조작은 우선순위 낮은 것부터 뺀다
  let trimmed = 0;
  while (ringList.length + motifPre.length > limits.pre) {
    let j = ringList.length - 1;
    while (j > 0 && ((ringList[j] as { gold?: boolean }).gold || (ringList[j - 1] as { gold?: boolean }).gold)) j--;
    if (j <= 0) {
      ringList.pop();
    } else {
      const a = ringList[j - 1] as Extract<DreamOp, { k: 'drop' }>;
      const b = ringList[j] as Extract<DreamOp, { k: 'drop' }>;
      ringList.splice(j - 1, 2, { ...a, r: Math.hypot(a.r, b.r), ink: a.r >= b.r ? a.ink : b.ink });
    }
    trimmed++;
  }
  for (let pr = 0; pr <= 4 && post.length > limits.post; pr++) {
    for (let i = post.length - 1; i >= 0 && post.length > limits.post; i--) {
      if (post[i]!.p === pr) {
        post.splice(i, 1);
        trimmed++;
      }
    }
  }
  if (segs.length > limits.segs) trimmed += segs.length - limits.segs;

  // 옅은 먹(inkTone 0) = 회청 #3A4252. 고른 먹이 있으면 그 먹의 담묵 획 토큰을 몸 먹 쪽으로 35% 당긴 색(명도가 #3A4252와 비슷 — 카드 농담 범위 유지)
  const c0 = inkIn && inkIn.id ? hexRgb(mixHex(inkIn.strokeDay, inkIn.dayBody, 0.35)) : [0x3a, 0x42, 0x52];
  const c1 = [0x1b, 0x1a, 0x18];
  const ink = [0, 1, 2].map((i) => (c0[i]! + (c1[i]! - c0[i]!) * B) / 255) as [number, number, number];

  return {
    seed,
    motifId: motif,
    pre: [...ringList, ...motifPre],
    segs: segs.slice(0, limits.segs),
    post: post.map((x) => x.op),
    anchor,
    ringC,
    body: { w: W, s },
    pool,
    ink,
    vessels,
    friend,
    trimmed,
  };
}
