// V27 밥·간식 core(D-27, care-rituals v3.2 2·3절). 순수 규칙만 — 사전·위기 대조·말결을 읽지 않는다.
// - 종류: 1.0 밥 3 · 간식 3(1.x 계절 밥 3·절기 간식 8은 V35, 목록만). 이름 '밥·간식'은 오너의 내부 분류 이름이고 화면 라벨이 아니다(care 3-1).
// - 공방 pantry: 열린 종류. 처음엔 맑은 먹·무늬 먹 조각, 이레 아침·정으로만 열리고 줄지 않는다(결제·뽑기·광고·기간 한정 없음).
//   열림은 깸 경계(아침)에서만 본다 — 진행 입력은 함께 잔 밤 수와 정뿐이고 밥과 무관하다.
// - 좋아하는 것: 타고남 씨앗(birth.seed)만으로 여섯 가지 중 하나. 저장하지 않고 매번 계산한다(D-13, 말결 무관).
// - 몸 크기·비율·성장·정·꿈에는 아무것도 넘기지 않는다(QA-3 R7·R8·R9, 시험 v3-meal '몸 입력 모듈' 정적 검사).

export const MEAL_KINDS = ['clear', 'pine', 'dew'] as const;
export const TREAT_KINDS = ['pattern', 'ribbon', 'dewdrop'] as const;
export type MealItem = (typeof MEAL_KINDS)[number];
export type TreatItem = (typeof TREAT_KINDS)[number];
export type PantryItem = MealItem | TreatItem;

/** 처음부터 열린 것(밥 1 · 간식 1 — 빌드 2 최소선) */
export const MEAL_ITEMS: readonly MealItem[] = ['clear'];
export const TREAT_ITEMS: readonly TreatItem[] = ['pattern'];

export const MEAL_SPOONS_MAX = 2;
export const TREATS_MAX = 3;

export interface Pantry {
  meal: MealItem[];
  treat: TreatItem[];
}

/** 깸 경계에서 보는 진행 입력: 함께 잔 밤 수(life.slept)·정(relation.jeongDays). 밥·간식은 입력이 아니다 */
export interface PantryProgress {
  slept: number;
  jeong: number;
}

/**
 * 열림 규칙(care 3-2 표 + V9b T-2, daily-loop v1.1 5-2): 송화 먹 = 첫 이레 아침(7밤), 이슬 먹 = 11번째 아침(11밤),
 * 늘인 먹 한 가락 = 정 2, 이슬 한 방울 = 18번째 아침(18밤). 처음부터 열린 둘은 문턱 0.
 * T-2는 이레 아침(14)의 몰림을 이레 가운데로 옮긴다. 이슬 한 방울을 정이 아니라 **밤 수**로 여는 까닭: 정이 열림 화폐가 되지 않게
 * (dreams-30days 2-1, QA-3) — 밤은 걸러도 늘고 줄지 않는다.
 * `likedFromStart`: 좋아하는 것(씨앗)이 이 종류면 문턱 없이 처음부터 열려 있다(좋아하는 것 반응이 7번째 아침에 시작되게, 1/6).
 */
export const PANTRY_OPENS: readonly { kind: 'meal' | 'treat'; item: PantryItem; slept?: number; jeong?: number; likedFromStart?: true }[] = [
  { kind: 'meal', item: 'clear' },
  { kind: 'meal', item: 'pine', slept: 7 },
  { kind: 'meal', item: 'dew', slept: 11 },
  { kind: 'treat', item: 'pattern' },
  { kind: 'treat', item: 'ribbon', jeong: 2 },
  { kind: 'treat', item: 'dewdrop', slept: 18, likedFromStart: true },
];

/** 처음 공방: 맑은 먹·무늬 먹 조각 + 좋아하는 것이 `likedFromStart` 종류면 그것(V9b T-2 예외) */
export function startPantry(liked: PantryItem): Pantry {
  return openPantry({ meal: [...MEAL_ITEMS], treat: [...TREAT_ITEMS] }, { slept: 0, jeong: 0 }, liked).pantry;
}

const canon = <T extends string>(order: readonly T[], have: readonly string[]): T[] => order.filter((x) => have.includes(x));

/**
 * 진행에 맞춰 열 것을 더한다(줄이지 않음). 정해진 순서·중복 없음으로 정리한다. 같은 입력이면 같은 결과이고,
 * 결과에 다시 적용해도 그대로다(세이브 이행이 이 함수를 그대로 쓴다 — 멱등).
 */
export function openPantry(
  p: Pantry,
  g: PantryProgress,
  liked: PantryItem,
): { pantry: Pantry; opened: { kind: 'meal' | 'treat'; item: PantryItem }[] } {
  const meal: string[] = [...p.meal];
  const treat: string[] = [...p.treat];
  const opened: { kind: 'meal' | 'treat'; item: PantryItem }[] = [];
  for (const o of PANTRY_OPENS) {
    const list = o.kind === 'meal' ? meal : treat;
    if (list.includes(o.item)) continue;
    // 좋아하는 것 예외(V9b): 처음부터 열린 것과 같은 자리 — 문턱 없음, 열림 효과 없음
    const fromStart = o.likedFromStart === true && liked === o.item;
    if (fromStart || (g.slept >= (o.slept ?? 0) && g.jeong >= (o.jeong ?? 0))) {
      list.push(o.item);
      if (!fromStart && (o.slept !== undefined || o.jeong !== undefined)) opened.push({ kind: o.kind, item: o.item });
    }
  }
  return { pantry: { meal: canon(MEAL_KINDS, meal), treat: canon(TREAT_KINDS, treat) }, opened };
}

export function isPantryItem(kind: 'meal' | 'treat', item: unknown): item is PantryItem {
  return typeof item === 'string' && ((kind === 'meal' ? MEAL_KINDS : TREAT_KINDS) as readonly string[]).includes(item);
}

// ── 좋아하는 것 = 씨앗 ──

export const LIKED_ITEMS: readonly PantryItem[] = [...MEAL_KINDS, ...TREAT_KINDS];
/** 반응이 커지는 때: 첫 이레 아침부터(그 전에는 모두 같게 기뻐함, care 3-3) */
export const LIKED_FROM_SLEPT = 7;

/** 씨앗 → 여섯 가지 중 하나. 다른 씨앗 파생(체형·인장)과 겹치지 않게 고유 소금을 섞고 murmur3 fmix32로 흩는다 */
export function likedItemOf(seed: number): PantryItem {
  let h = (seed ^ 0x6d6f6e67) >>> 0; // 'mong'
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return LIKED_ITEMS[h % LIKED_ITEMS.length]!;
}
