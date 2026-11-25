// 꿈 모티프 25와 고르는 규칙(dreams-30days v1.1 1-3·1-7·2-5·3-2, D-25). 순수 데이터 + 순수 함수.
// - 데이터: id·구역·가족·해금(현상한 카드 수). 문구(이름·장면·캡션)는 앱 i18n(`motif.*`·`scene.*`·`caption.*`)에만 둔다(D-25 C6 줄).
// - 규칙: R1 같은 장면 18장·R2 같은 모티프 2장·R3 직전 가족·R4 같은 구도 3연속, 완화 순서 R4 → R3 → R2 → R1, R5 처음 꾼 꿈 가중.
//   docs/design/content-v1/dreams-sim.mjs와 같은 결과를 내야 한다 — test/dream-rules.test.ts가 그 시뮬을 직접 불러 한 밤씩 대조한다.
// - 난수: 한 밤에 균등값 u 하나(세이브 rng에서 뽑아 넘긴다). Math.random·시각 없음.
import type { MotifPathData } from '../moon/motifs';
import type { MotifFieldOp } from '../visual/motifInk';
import { MOTIF_SHAPES } from './dreamMotifShapes';
import { ART_REV_SHAPES_ARCHIVE } from './artRevArchive';
import type { AxisRecord, DreamCard } from './types';

export type MotifZone = 'near-alone' | 'near-with' | 'far-alone' | 'far-with' | 'center';
export type MotifQuadrant = Exclude<MotifZone, 'center'>;

export interface Motif {
  id: string;
  zone: MotifZone;
  /** 비슷해 보이는 묶음(R3). 열린 값 */
  family: string;
  /** 현상한 카드 수(`cards.length`)가 이 값 이상이면 풀에 든다. 0 = 빌드 1부터 있던 10개 */
  unlockAtCards: number;
  /**
   * 형상이 아직 없다. 제품 빌드는 고르지도 그리지도 않고, 개발 빌드만 같은 구역의 기존 형상으로 임시로 그린다
   * (`visual/dreamCard.ts` `dreamMotifShape`). 빌드 1의 10개는 꿈 카드 v1.1의 절차 형상(마블링 조작)이, C6의 15개는 C14b의
   * 붓 형상(`paths`, `dreamMotifShapes.ts`)이 있어 모두 false다. 원격·새 모티프가 형상 없이 들어오면 true로 둔다.
   */
  placeholder: boolean;
  /**
   * 경로 형상(스키마 1 `paths`와 같은 모양, C14b). 있으면 카드가 이 붓 형상을 그리고(`visual/motifInk.ts`), 64px 구별 틀
   * (`test/motif-distinct.test.ts`)의 대상이 된다. 빌드 1의 10개는 빈 배열 — 마블링 조작으로 그린다
   */
  paths: readonly MotifPathData[];
  /** 마블링 장 조작(그림 좌표, C14b v2 — 띠가 형상을 받아들임). `paths`가 있을 때만 */
  field?: readonly MotifFieldOp[];
  /** 몽망이 자리(그림 좌표 0..100). `paths`가 있을 때만 */
  seat?: readonly [number, number];
  /** 곁의 다른 방울 [x, y, 몸 배율](그림 좌표). 눈 없는 방울 — '함께'는 나란함·맞댐으로만 */
  friend?: readonly [number, number, number];
  /** C14b 4차: 사물 한 겹 래스터 자리(`dreamMotifShapes.ts` MotifShape.raster) */
  raster?: { box: readonly [number, number, number, number]; keep: readonly number[]; cover: number; stretch?: true };
  /** 그림 상자 배율(8차, `MotifShape.zoom`) */
  zoom?: number;
  /** 'clear' = 경로를 먹으로 그리지 않는다(소리 없는 눈 — 그림은 `field`의 맑은 방울) */
  water?: 'clear';
  /** 정본에 없어 개발이 쓴 초안 문구 슬롯(i18n 키 기준). 검수로 확정되면 지운다 — `motifBlockers`가 제품 출시를 막는다 */
  draft?: readonly ('ko.title' | 'ko.line' | 'ko.scene' | 'en.title' | 'en.line' | 'en.scene')[];
}

/** 형상: 해금 0(빌드 1의 10개) = 마블링 절차 형상, 나머지 = C14b 붓 형상(`MOTIF_SHAPES`). 붓 형상이 없으면 자리표시 */
const m = (id: string, zone: MotifZone, family: string, unlockAtCards: number): Motif => {
  const shape = MOTIF_SHAPES[id];
  if (unlockAtCards === 0 || !shape) return { id, zone, family, unlockAtCards, placeholder: unlockAtCards > 0, paths: [] };
  return { id, zone, family, unlockAtCards, placeholder: false, paths: shape.paths, field: shape.field, seat: shape.seat, ...(shape.friend ? { friend: shape.friend } : {}), ...(shape.water ? { water: shape.water } : {}), ...(shape.raster ? { raster: shape.raster } : {}), ...(shape.zoom ? { zoom: shape.zoom } : {}) };
};

/**
 * 1-3 표 그대로(순서도 표 순서 — 빌드 1의 10개는 서로의 상대 순서가 옛 목록과 같아 `pickCard` 결과가 바뀌지 않는다).
 * 20번 자리는 징검다리다: 밤기차는 1-2 시험 통과 + 오너 확인이 있어야 들어오고(1-4), 그 전 기본값이 징검다리다.
 */
export const MOTIFS: readonly Motif[] = [
  m('near-alone.quilt', 'near-alone', 'bed', 0),
  m('near-alone.teacup', 'near-alone', 'tea', 0),
  m('near-alone.inkstone', 'near-alone', 'desk', 3),
  m('near-alone.washing-line', 'near-alone', 'cloth', 7),
  m('near-alone.sprout', 'near-alone', 'plant', 12),
  m('near-with.window-hand', 'near-with', 'hand', 0),
  m('near-with.teacup-two', 'near-with', 'tea', 0),
  m('near-with.umbrella', 'near-with', 'rain', 3),
  m('near-with.letter', 'near-with', 'paper', 7),
  m('near-with.palm', 'near-with', 'hand', 12),
  m('far-alone.mountain', 'far-alone', 'land', 0),
  m('far-alone.sea', 'far-alone', 'sea', 0),
  m('far-alone.paper-boat', 'far-alone', 'sea', 3),
  m('far-alone.kite', 'far-alone', 'sky', 7),
  m('far-alone.path', 'far-alone', 'land', 12),
  m('far-with.stars-drops', 'far-with', 'stars', 0),
  m('far-with.sea-hand', 'far-with', 'sea', 0),
  m('far-with.geese', 'far-with', 'sky', 3),
  m('far-with.star-bridge', 'far-with', 'stars', 7),
  m('far-with.stepping-stones', 'far-with', 'stones', 12),
  m('center.rain', 'center', 'rain', 0),
  m('center.moon', 'center', 'moon', 0),
  m('center.leaf', 'center', 'plant', 5),
  m('center.snow', 'center', 'snow', 9),
  m('center.wind', 'center', 'wind', 15),
];

const BY_ID = new Map(MOTIFS.map((x) => [x.id, x]));

export function motifById(id: string): Motif | null {
  return BY_ID.get(id) ?? null;
}

/** 가족(R3). 보름 카드는 `moon`, 모르는 id(원격·옛 세이브)는 id 자체(5-2 '가족이 없으면 그 id') */
export function familyOf(id: string): string {
  if (id.startsWith('moon-')) return 'moon';
  return BY_ID.get(id)?.family ?? id;
}

/** 제품에 낼 수 없는 까닭(빈 배열 = 낼 수 있음). 보름 `moonMotifBlockers`와 같은 꼴 */
export function motifBlockers(id: string): string[] {
  const x = motifById(id);
  if (!x) return [];
  const out: string[] = [];
  if (x.placeholder && x.paths.length === 0) out.push(`${x.id}: 형상 자리표시(C14)`);
  for (const d of x.draft ?? []) out.push(`${x.id}: ${d} 초안`);
  return out;
}

/** 이 빌드에서 그 모티프를 고르거나 그릴 수 있는가. 개발 빌드는 자리표시도 허용(확인용) */
export function motifUsable(id: string, dev: boolean): boolean {
  return dev || motifBlockers(id).length === 0;
}

// ── 고르는 규칙(2-5) ──────────────────────────────────────

export const DREAM_RULES = {
  /** R1: 최근 이 장수 안 같은 장면 금지 → 같은 장면은 최소 19장 간격 */
  sceneGap: 18,
  /** R2: 최근 이 장수 안 같은 모티프 금지 */
  motifGap: 2,
  /** R3: 직전 이 장수와 같은 가족 금지 */
  familyGap: 1,
  /** R4: 같은 구도 이 장수 연속 금지 */
  compRun: 3,
  /** R5: 직전 '처음 꾼 꿈'에서 이 장수 안이면 안 나온 모티프 가중을 낮춘다 */
  firstGap: 2,
  firstWeightNear: 0.25,
  firstWeightFar: 2,
} as const;

export type DreamRule = 'R1' | 'R2' | 'R3' | 'R4';
/** 후보가 0이면 이 순서로 하나씩 푼다(구도 반복이 가장 덜 거슬리고, 같은 장면이 가장 거슬린다) */
export const RELAX_ORDER: readonly DreamRule[] = ['R4', 'R3', 'R2', 'R1'];

export interface SceneRef {
  motifId: string;
  composition: number;
}
export interface Scene {
  motifId: string;
  composition: 0 | 1 | 2;
}

export interface DreamPoolOptions {
  /** 보름 창이면 `center.moon`을 뺀다(4-1) */
  moonWindow?: boolean;
  /** 원격 `dreamUnlock`(앞당기기만 — `min(번들, 원격)`, 2-1) */
  unlock?: Readonly<Record<string, number>>;
  /** 이 빌드에서 쓸 수 있는 모티프만(제품 = `motifUsable(id, false)`). 없으면 전부 */
  usable?: (id: string) => boolean;
  /** 시험용 모티프 표(기본 `MOTIFS`) */
  motifs?: readonly Motif[];
}

/** 해금 값: 원격 값은 번들보다 작을 때만 쓴다(늦추는 값·숫자 아닌 값 무시) */
export function unlockAt(x: Motif, unlock?: Readonly<Record<string, number>>): number {
  const r = unlock?.[x.id];
  return typeof r === 'number' && Number.isFinite(r) && r < x.unlockAtCards ? Math.max(0, r) : x.unlockAtCards;
}

/** 가운데 유저의 이웃 사분면 = 부호가 가리키는 가장 가까운 사분면(리뷰 1-4) */
export function quadrantOf(v: AxisRecord): MotifQuadrant {
  return `${v.curiosity >= 0 ? 'far' : 'near'}-${v.closeness >= 0 ? 'with' : 'alone'}`;
}

/** 풀(2-5 순서 1): 내 사분면 + 가운데 중 해금된 것 × 구도 3, **모티프 id 오름차순 → 구도 오름차순** */
export function dreamPool(quadrant: MotifQuadrant, developed: number, opts: DreamPoolOptions = {}): Scene[] {
  const list = (opts.motifs ?? MOTIFS)
    .filter((x) => (x.zone === quadrant || x.zone === 'center') && unlockAt(x, opts.unlock) <= developed)
    .filter((x) => !(opts.moonWindow && x.id === 'center.moon'))
    .filter((x) => !opts.usable || opts.usable(x.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const out: Scene[] = [];
  for (const x of list) for (const c of [0, 1, 2] as const) out.push({ motifId: x.id, composition: c });
  return out;
}

/**
 * 한 밤의 장면 고르기(2-5 순서 2~6). history = 현상한 카드(오래된 것 → 최근), u = [0,1) 균등값 하나.
 * 반환 `relaxed` = 후보를 만들려고 푼 규칙(시뮬의 '위반'). 풀이 비면 null.
 */
export function chooseScene(
  pool: readonly Scene[],
  history: readonly SceneRef[],
  u: number,
  family: (id: string) => string = familyOf,
): { scene: Scene; relaxed: DreamRule[] } | null {
  if (pool.length === 0) return null;
  const n = history.length;
  const R = DREAM_RULES;
  // 모티프 id → 구도별 마지막으로 나온 자리(문자열 이어 붙이기 없이 — 시험이 2000회 × 20 조건을 돈다)
  const last = new Map<string, number[]>();
  const seen = new Set<string>();
  let lastFirst = -99;
  for (let i = 0; i < n; i++) {
    const h = history[i]!;
    let slot = last.get(h.motifId);
    if (!slot) {
      slot = [-1, -1, -1];
      last.set(h.motifId, slot);
    }
    if (h.composition >= 0 && h.composition <= 2) slot[h.composition] = i;
    if (!seen.has(h.motifId)) {
      seen.add(h.motifId);
      lastFirst = i;
    }
  }
  const lastIdx = (s: Scene) => last.get(s.motifId)?.[s.composition] ?? -1;
  const recentMotifs = new Set<string>();
  for (let i = Math.max(0, n - R.motifGap); i < n; i++) recentMotifs.add(history[i]!.motifId);
  const recentFamilies = new Set<string>();
  for (let i = Math.max(0, n - R.familyGap); i < n; i++) recentFamilies.add(family(history[i]!.motifId));
  const runComps = n >= R.compRun - 1 ? history.slice(n - (R.compRun - 1)).map((h) => h.composition) : null;
  const rule: Record<DreamRule, (s: Scene) => boolean> = {
    R1: (s) => {
      const j = lastIdx(s);
      return j < 0 || j < n - R.sceneGap;
    },
    R2: (s) => !recentMotifs.has(s.motifId),
    R3: (s) => !recentFamilies.has(family(s.motifId)),
    R4: (s) => !(runComps !== null && runComps.every((c) => c === s.composition)),
  };
  const active = [...RELAX_ORDER];
  const relaxed: DreamRule[] = [];
  let cands: Scene[];
  for (;;) {
    cands = pool.filter((s) => active.every((r) => rule[r](s)));
    if (cands.length > 0 || active.length === 0) break;
    relaxed.push(active.shift()!);
  }
  if (cands.length === 0) cands = [...pool];
  if (relaxed.includes('R1')) {
    // R1까지 풀었으면 마지막으로 나온 때가 가장 이른 장면들만(가장 오래된 것)
    const oldest = Math.min(...cands.map(lastIdx));
    cands = cands.filter((s) => lastIdx(s) === oldest);
  } else {
    // 우선: 남은 후보 중 아직 안 나온 장면이 있으면 그것들만
    const unseen = cands.filter((s) => lastIdx(s) === -1);
    if (unseen.length > 0) cands = unseen;
  }
  // R5: 직전 '처음 꾼 꿈'에서 2장 안이면 안 나온 모티프 가중 0.25, 아니면 2. 나온 모티프는 1
  const wNew = n - lastFirst <= R.firstGap ? R.firstWeightNear : R.firstWeightFar;
  const weights = cands.map((s) => (seen.has(s.motifId) ? 1 : wNew));
  let t = u * weights.reduce((a, b) => a + b, 0);
  let i = 0;
  for (; i < cands.length - 1; i++) {
    t -= weights[i]!;
    if (t < 0) break;
  }
  return { scene: cands[i]!, relaxed };
}

// ── 처음 꾼 꿈(1-7) ──────────────────────────────────────

/** 그 카드가 이 몽망이에게 그 모티프의 첫 카드인가(같은 id가 앞에 없음 — 다음 해 같은 보름 모티프도 아님) */
export function isFirstDream(cards: readonly Pick<DreamCard, 'motifId'>[], index: number): boolean {
  const c = cards[index];
  if (!c) return false;
  for (let i = 0; i < index; i++) if (cards[i]!.motifId === c.motifId) return false;
  return true;
}

// ── 캡션 원인(3-2·3-3) ────────────────────────────────────

export type CauseVariant = 1 | 2 | 3;
export type DreamCause = `${MotifZone}.${CauseVariant}`;

/** 원인을 붙이는 문턱: 말씨 1·3 = 두 축 |v| ≥ 0.15, 말씨 2 = ≥ 0.35. 가운데는 반대로 < 0.15·< 0.08 */
export const CAUSE_THRESHOLDS = { zone: 0.15, zoneStrong: 0.35, center: 0.15, centerStrong: 0.08 } as const;

/** 성향이 몸짓으로 보이는 만큼 쓸 수 있는 원인 말씨(번호 오름차순). 빈 배열 = 결과만 */
export function causeVariants(v: AxisRecord, zone: MotifZone): CauseVariant[] {
  const a = Math.abs(v.curiosity);
  const b = Math.abs(v.closeness);
  const T = CAUSE_THRESHOLDS;
  if (zone === 'center') {
    if (!(a < T.center && b < T.center)) return [];
    return a < T.centerStrong && b < T.centerStrong ? [1, 2, 3] : [1, 3];
  }
  if (!(a >= T.zone && b >= T.zone)) return [];
  return a >= T.zoneStrong && b >= T.zoneStrong ? [1, 2, 3] : [1, 3];
}

/**
 * 이 카드의 원인 말씨(키 `caption.cause.{zone}.{n}`) 또는 null(결과만). zone = 그 꿈이 골라진 유저 구역.
 * 직전 카드와 같은 말씨는 쓰지 않는다(그것뿐이면 null). 고르기는 물결 씨앗(이미 뽑은 값)으로 — 난수를 더 쓰지 않는다.
 */
export function pickCause(v: AxisRecord, zone: MotifZone, prev: Pick<DreamCard, 'cause'> | null, flowSeed: number): DreamCause | null {
  const prevCause = prev?.cause ?? null;
  const ok = causeVariants(v, zone).filter((n) => `${zone}.${n}` !== prevCause);
  if (ok.length === 0) return null;
  return `${zone}.${ok[Math.abs(flowSeed) % ok.length]!}`;
}

// ── 그림 판(artRev, C14b 5차) ─────────────────────────────

/**
 * 지금 그림 판. 새 꿈 카드는 이 번호를 싣는다. **그림(래스터 에셋·형상 데이터)을 바꾸면 판을 올리고, 이전 판의 래스터 폴더
 * (`apps/mobile/assets/motifs/r<판>`)는 지우지 않는다** — 이미 받은 카드가 그 판으로 그려져야 한다(시험이 판마다 에셋·예산을 고정).
 */
export const DREAM_ART_REV = 1;
/**
 * 아직 고정되지 않은 판(코드 리뷰 2차 낮음 ①). 운영에서 받은 카드가 없어 값을 다시 매길 수 있는 판 — `dreamContent`를 운영에서
 * 처음 켜는 빌드에서 null로 바꾼다(앱 시험이 '운영 기본 켜짐인데 열린 판이 있으면 실패'로 지킨다). 닫힌 판은 형상 보관
 * (`ART_REV_SHAPES_ARCHIVE`)과 장면·형상 해시가 바뀌면 시험이 실패한다
 */
export const OPEN_ART_REV: number | null = 1;

/** 그 판의 모티프(형상): 지금 판 = `MOTIFS`, 지난 판 = 보관 데이터로 덮은 것. 판 1 카드는 판 2가 생겨도 판 1 형상으로 그린다 */
export function motifForRev(id: string, rev: number): Motif | null {
  const base = motifById(id);
  if (!base || rev >= DREAM_ART_REV) return base;
  const sh = ART_REV_SHAPES_ARCHIVE[rev]?.[id];
  if (!sh) return base;
  return { ...base, paths: sh.paths, field: sh.field, seat: sh.seat, friend: sh.friend, water: sh.water, raster: sh.raster, zoom: sh.zoom };
}
/** 판마다 래스터 사물을 쓰는 모티프(앱 에셋 `r<판>/<id>.webp` + `.mask.webp`) */
export const ART_REV_RASTERS: Readonly<Record<number, readonly string[]>> = {
  // 8차(오너 충전 → 열린 판 1에 바로): 이불·찻잔·찻잔 둘·벼루·징검다리·빨랫줄 래스터를 더하고 창가 손은 손 없는 창살 창으로 바꿨다
  1: [
    'near-with.letter',
    'far-alone.kite',
    'near-with.umbrella',
    'far-alone.paper-boat',
    'near-with.window-hand',
    'near-alone.quilt',
    'near-alone.teacup',
    'near-with.teacup-two',
    'near-alone.inkstone',
    'far-with.stepping-stones',
    'near-alone.washing-line',
  ],
};
/**
 * 카드의 그림 판. 판 0 = 빌드 1 그림(꿈 콘텐츠가 꺼진 밤의 카드 — 판 번호 없음, 코드 리뷰 H1). 새 모티프(C6) 카드는 판 번호가 없어도
 * 1(판 번호가 생기기 전 개발 빌드 카드 — 세이브 이행 `withArtRev`와 같은 규칙). 렌더·장면은 이 값으로 그 판의 형상·래스터를 고른다
 */
export function dreamArtRevOf(c: Pick<DreamCard, 'artRev' | 'motifId'>): number {
  if (typeof c.artRev === 'number' && c.artRev >= 1) return Math.floor(c.artRev);
  return (motifById(c.motifId)?.unlockAtCards ?? 0) > 0 ? 1 : 0;
}
/**
 * 세이브 이행(멱등): 판 번호가 없는 C6 새 모티프 카드에 1을 적는다. 빌드 1 모티프·보름 카드는 건드리지 않아 세이브 문자열이 같고,
 * 두 번 돌려도 결과가 같다
 */
export function withArtRev(cards: readonly DreamCard[]): DreamCard[] {
  return cards.map((c) => (c.artRev === undefined && (motifById(c.motifId)?.unlockAtCards ?? 0) > 0 ? { ...c, artRev: 1 } : c));
}
