// 세이브·sim v3 최소판(V1 최소 · V8 · V9 · V27 최소, D-26·D-27). 새 컨셉 세로 조각용.
// 구조: v3 상태 = 기존 sim 상태(시계·잠·깸·꿈·획·정, 세이브 v2 그대로) + v3 블록(`words`·`life`·`meal`·`pantry`).
// sim 규칙은 그대로 쓰고(reduce를 감쌀 뿐), 이 파일은 v3가 더하는 것만 정한다:
//   ① write = 한 마디(말결만, 글자는 저장 0) + 붓 한 획(C′-키보드 갈래: 몸에 붙는 획은 붓 한 획, D-12 그대로)
//   ② 벼루 = 먹 양 = 그날 쓸 수 있는 글자 수 1~6(V8). 갈기 보상 없음(D-27)
//   ③ 연적 = 재우기·내려놓기. 연적으로 재운 밤만 '함께 잔 밤'으로 센다(D-07, concept-review 3-3: 하루 걸러도 생애가 줄지 않음).
//      획 씻기 없음(V8) — washStroke는 받지 않는다
//   ④ 28밤: 이레(7·14·21·28)마다 스냅숏 자리, 28번째 아침에 완성 → 곁에 남음(성장 = 새 말·새 획만 멈춤)
//   ⑤ 밥 한 숟갈(깸마다 최대 2, 먹을 한 칸 이상 갈았을 때)·작은 것(깸마다 최대 3). 시각·횟수 기록 0(D-27).
//      V27 정식판: 공방 pantry 열림(이레 아침·정, 깸 경계)·좋아하는 것(씨앗)·밥 알림 데이터(nudgeOptIn)·업로드 허용 목록 — 규칙은 meal.ts·nudge.ts
//   ⑥ M4 정·반김·머뭇거림: 정 = sim relation.jeongDays 하나(몸 탭·부르기·한 마디가 그 깸에 한 번 올림), 반김·정 신호는 효과로만 — 규칙은 jeong.ts
// 세이브 = 기존 봉투(schemaVersion 2 + sim 2) + `v3` 블록. 저장 키는 따로라 옛 세이브(v2)는 손대지 않고 보관된다.
import { parseState, serializeState } from '../sim/save';
import { reduce as simReduce, tick as simTick, strokeBlock, SIM_SCHEMA_VERSION } from '../sim/reduce';
import { callReply as simCallReply } from '../sim/naming';
import { createInitial, type InitialOptions } from '../sim/reduce';
import type { Effect as SimEffect, Event as SimEvent, Millis, State as SimState } from '../sim/types';
import { FutureSaveError, isFutureSaveError, SCHEMA_VERSION } from '../save/envelope';
import { SAVE_KEYS, type KV, type WriteOptions, type WriteResult } from '../save/slots';
import type { AttachLevel, RawPoint, StrokeRecord } from '../geometry/types';
import { FAMILIES, STORED_SENSES, WORD_MAX_CHARS, familyOf, type FamilyId, type Intensity } from './lexicon';
import {
  LIKED_FROM_SLEPT,
  MEAL_SPOONS_MAX,
  TREATS_MAX,
  isPantryItem,
  likedItemOf,
  openPantry,
  startPantry,
  type MealItem,
  type Pantry,
  type PantryItem,
  type TreatItem,
} from './meal';
import type { MealNudgeInput } from './nudge';
import { markJeong } from '../sim/pillars';
import { CAPTION_MAX, JEONG_SIGNALS, emptyCaptionsShown, favoriteSpotOf, greetingOf, jeongStageOf, type GreetTier, type JeongSignal, type JeongStage, type Lean } from './jeong';

export const V3_VERSION = 3;
export const LIFE_NIGHTS = 28;
export const IRE_NIGHTS = 7;
/** 먹 한 칸 = 이만큼 간 시간(첫 칸은 갈기 시작과 함께). 6칸에서 멈춘다 */
export const INK_CELL_MS = 1500;

/** 한 마디 기록. 모든 날 같은 필드 집합(heart-grain 9-2 R2) — 위기를 나타내는 플래그·빈칸이 없다 */
export interface Word {
  /** 몇 번째 밤의 말인가(1~28) */
  night: number;
  sense: string;
  intensity: Intensity;
  lexVer: string;
  source: 'keyboard' | 'ink';
  /** 몸에 붙은 붓 한 획(sim strokes의 id) */
  strokeId: string;
}

/** 이레 스냅숏 자리(V10에서 그림을 채운다 — 점열을 그 밤까지 잘라 다시 그리므로 그림은 저장하지 않는다) */
export interface IreMark {
  night: number;
  at: Millis;
}

export interface Life {
  /** 연적으로 함께 잔 밤 수(0~28) */
  slept: number;
  snapshots: (IreMark | null)[];
  final: IreMark | null;
}

/** 밥 칸 = 정확히 이 세 칸(시각·횟수·연속 저장 0 — 모르는 칸이 있으면 손상으로 본다) */
export interface Meal {
  /** 이번 깸에 준 숟갈(깸이 바뀌면 0) */
  spoons: number;
  /** 이번 깸에 준 작은 것(깸이 바뀌면 0) */
  treats: number;
  /** 밥 알림 받기(기본 꺼짐 — 알림은 V29, 여기는 값만) */
  nudgeOptIn: boolean;
}
const MEAL_FIELDS = ['spoons', 'treats', 'nudgeOptIn'] as const;

export interface V3Block {
  version: number;
  words: Word[];
  life: Life;
  meal: Meal;
  /** 공방 단위로 열린 종류(새 먹 방울에도 이어짐, 줄지 않음). 정해진 순서·중복 없음 */
  pantry: Pantry;
  /** 지금 자는 잠이 연적으로 재워 센 밤인가(깨면 false). 시각은 저장하지 않는다 */
  tonightCounted: boolean;
  /**
   * M4 정 자막을 보인 횟수(JEONG_SIGNALS 순서: 알아봄·기다림·내밂·이름 대답), 각 0~3에서 멈춘다(처음 세 번만).
   * 시각·날짜·연속은 저장하지 않는다. 기기 전용(업로드 안 함 — 되찾은 기기에서 자막이 다시 세 번 나와도 해가 없다)
   */
  captionsShown: number[];
}

export interface V3State {
  sim: SimState;
  v3: V3Block;
}

export interface WordInput {
  sense: string;
  intensity: Intensity;
  lexVer: string;
  source: 'keyboard' | 'ink';
}

export type V3Event =
  | SimEvent
  /** 한 마디 + 붓 한 획. 판정(사전·위기 대조)은 앱이 끝낸 뒤 말결만 싣는다 — 쓴 글자는 이벤트에도 없다(R1·R8) */
  | { type: 'write'; at: Millis; word: WordInput; chars: number; raw: RawPoint[]; level?: AttachLevel; birthShape?: boolean }
  /** 벼루 시트에서 밥(한 숟갈)·간식(작은 것) 건네기 */
  | { type: 'offer'; at: Millis; kind: 'meal'; item: MealItem }
  | { type: 'offer'; at: Millis; kind: 'treat'; item: TreatItem }
  /** 밥 알림 받기 켜고 끄기(D-15 첫 재우기 밤 화면·공방 노트, V29). 자는 동안도 받는다 */
  | { type: 'mealNudge'; at: Millis; on: boolean }
  /** M4 부르기(세로 이름 탭). melody = 이름 가락 플래그(nameMelody) 값을 이벤트가 싣는다(같은 이벤트 열 = 같은 대답) */
  | { type: 'call'; at: Millis; melody: boolean }
  /** M4 정 자막을 화면에 보였다(앱이 플래그 jeong·jeongCaptions가 켜져 있을 때만 보낸다) — 그 신호의 횟수 +1(3에서 멈춤) */
  | { type: 'jeongCaption'; at: Millis; signal: JeongSignal };

export type WriteBlock = 'asleep' | 'done' | 'used' | 'noInk';

export type V3Effect =
  | SimEffect
  | { type: 'wordAccepted'; night: number; sense: string; strokeId: string }
  | { type: 'writeRejected'; reason: WriteBlock | 'tooLong' | 'badWord' | 'tooShort' | 'stroke' }
  /** 연적으로 재운 밤을 셌다 */
  | { type: 'nightCounted'; night: number }
  /** 이레 밤(7·14·21·28) — 스냅숏 자리 */
  | { type: 'ireReached'; ire: number }
  /** 28번째 아침: 완성(곁에 남음) */
  | { type: 'lifeComplete' }
  /**
   * 받았다. bow = 그 깸의 마지막 숟갈 뒤 꾸벅(만족 몸짓, 배와 무관 — 반응 크기는 숟갈 수와 무관, QA-3 R7). 간식은 늘 false.
   * liked = 좋아하는 것(씨앗)이고 첫 이레 아침이 지났다 — 반응만 조금 커진다(care 3-3)
   */
  | { type: 'received'; kind: 'meal' | 'treat'; item: PantryItem; bow: boolean; liked: boolean }
  | { type: 'offerRejected'; reason: 'asleep' | 'noInk' | 'cap' | 'locked' }
  /** 깸 경계에서 공방에 새 종류가 열렸다(이레 아침·정) */
  | { type: 'pantryOpened'; kind: 'meal' | 'treat'; item: PantryItem }
  /**
   * M4 돌아온 순간의 반김(깨어 있을 때만, 1분 넘게 비웠을 때). tier long = 72h 이상(머뭇거림 자리 — 플래그 hesitation이 꺼져 있으면 앱이 기다림 자세로).
   * 비운 시간 숫자는 싣지 않는다(화면·문구가 '며칠 만'을 말하지 않게)
   */
  | { type: 'greeted'; tier: GreetTier; lean: Lean; stage: JeongStage; recognize: boolean; waiting: boolean }
  /** M4 정 신호. caption = 아직 세 번을 다 보이지 않았다(앱이 자막을 보이면 jeongCaption을 보낸다). spot = 내밂의 좋아하는 자리 0..5 */
  | { type: 'jeongSignal'; signal: JeongSignal; caption: boolean; spot?: number }
  /** M4 부르기 대답: turn = 고개 돌림 '응?', melody = 가락 + 빗 튕김. near = 정 7부터(closeness ≥ 0이면 다가옴 true, 아니면 빗만 크게 false), 그 전 null */
  | { type: 'called'; reply: 'turn' | 'melody'; near: boolean | null };

export interface V3Step {
  state: V3State;
  effects: V3Effect[];
}

export function emptyV3Block(): V3Block {
  return {
    version: V3_VERSION,
    words: [],
    life: { slept: 0, snapshots: [null, null, null, null], final: null },
    meal: { spoons: 0, treats: 0, nudgeOptIn: false },
    pantry: startPantry(),
    tonightCounted: false,
    captionsShown: emptyCaptionsShown(),
  };
}

/** 1일차(첫 밤 전)에서 시작 */
export function createV3(now: Millis, tzOffsetMin: number, seed: number, opts: InitialOptions = {}): V3State {
  return { sim: createInitial(now, tzOffsetMin, seed, opts), v3: emptyV3Block() };
}

// ── 선택자 ──

export function isComplete(s: V3State): boolean {
  return s.v3.life.final !== null;
}

/** 화면의 'n번째 밤'(1~28): 깨어 있으면 오늘 밤, 연적으로 재운 뒤 자는 동안은 그 밤 */
export function nightOf(s: V3State): number {
  const { slept } = s.v3.life;
  if (isComplete(s)) return LIFE_NIGHTS;
  const n = s.sim.phase === 'asleep' && s.v3.tonightCounted ? slept : slept + 1;
  return Math.max(1, Math.min(LIFE_NIGHTS, n));
}

/** 이레(1~4) */
export function ireOf(s: V3State): number {
  return Math.ceil(nightOf(s) / IRE_NIGHTS);
}

/** 먹 양 = 그날 쓸 수 있는 글자 수(0 = 아직 안 갊, 1~6) */
export function inkCells(s: V3State): number {
  return inkCellsOfMs(s.sim.ledger.grindMs);
}

/** 간 시간(ms) → 먹 칸 수: 갈기 시작에 1칸, INK_CELL_MS마다 +1, 상한 6. 앱의 시트 갈기 진행 표시도 이 식을 쓴다 */
export function inkCellsOfMs(ms: number): number {
  if (!(ms > 0)) return 0;
  return Math.min(WORD_MAX_CHARS, 1 + Math.floor(ms / INK_CELL_MS));
}

/** 오늘 한 마디를 쓸 수 있는가(null = 쓸 수 있음) */
export function writeBlock(s: V3State): WriteBlock | null {
  if (s.sim.phase === 'asleep') return 'asleep';
  if (isComplete(s)) return 'done';
  if (strokeBlock(s.sim) === 'used') return 'used';
  if (inkCells(s) === 0) return 'noInk';
  return null;
}

/** 이번 깸에 쓴 한 마디(없으면 null) */
export function todaysWord(s: V3State): Word | null {
  const today = new Set(s.sim.strokes.filter((x) => x.day === s.sim.dayIndex).map((x) => x.id));
  return s.v3.words.find((w) => today.has(w.strokeId)) ?? null;
}

export interface MealSheet {
  spoon: 'ok' | 'noInk' | 'cap';
  treat: 'ok' | 'cap';
  /** 공방에 열린 종류(시트 줄 순서 그대로) */
  meals: MealItem[];
  treats: TreatItem[];
}

/** 벼루 하위 시트 상태. 숟갈 수·상한 숫자는 내보내지 않는다(R7 — 화면에 1/2·게이지 없음) */
export function mealSheet(s: V3State): MealSheet {
  const spoon = s.v3.meal.spoons >= MEAL_SPOONS_MAX ? 'cap' : inkCells(s) === 0 ? 'noInk' : 'ok';
  return { spoon, treat: s.v3.meal.treats >= TREATS_MAX ? 'cap' : 'ok', meals: [...s.v3.pantry.meal], treats: [...s.v3.pantry.treat] };
}

/** 좋아하는 것(씨앗만, 저장 0). 이름표 '좋아하는 것' 칸(정 4)도 이 값을 쓴다 */
export function likedItem(s: V3State): PantryItem {
  return likedItemOf(s.sim.birth.seed);
}

/** 좋아하는 것에 반응이 커지는가: 첫 이레 아침부터 */
export function likedShown(s: V3State): boolean {
  return s.v3.life.slept >= LIKED_FROM_SLEPT;
}

/** 밥 알림 후보 입력(V29 예약 모듈로 넘기는 값). 말결·위기 판정은 싣지 않는다 — 쓴 말이 있는가 하나뿐(QA-3 R2 ①-a) */
export function mealNudgeInput(s: V3State): MealNudgeInput {
  return { hasWord: todaysWord(s) !== null, nudgeOptIn: s.v3.meal.nudgeOptIn };
}

/** 마음 벡터 heart[8](저장된 말결로만 계산, R5). 화면에 숫자로 보이지 않는다 */
export function heartOf(s: V3State): Record<FamilyId, number> {
  const out = Object.fromEntries(FAMILIES.map((f) => [f, 0])) as Record<FamilyId, number>;
  for (const w of s.v3.words) {
    const f = familyOf(w.sense);
    if (f) out[f] += 1;
  }
  return out;
}

// ── 리듀서 ──

function validWord(w: WordInput): boolean {
  return (
    !!w &&
    STORED_SENSES.includes(w.sense) &&
    (w.intensity === 1 || w.intensity === 2 || w.intensity === 3) &&
    typeof w.lexVer === 'string' &&
    w.lexVer.length > 0 &&
    (w.source === 'keyboard' || w.source === 'ink')
  );
}

/**
 * 공방 열림의 진행 입력 = **마지막 깸 경계 시점** 값(V27 리뷰 H1). 지금 깸 안에서 오른 몫은 빼고 다음 깸 경계로 미룬다:
 * - 밤: 지금 잠을 이미 셌으면(tonightCounted) 그 밤은 다음 아침 몫
 * - 정: 이번 깸(dayIndex)에 만져서 오른 정은 다음 아침 몫(같은 이벤트에서 깸 뒤 바로 만진 경우도 같다)
 * 깸 경계(follow의 woke)와 세이브 이행(validateV3)이 같은 함수를 써서, 앱을 다시 켜도 공방이 깸 가운데에 열리지 않는다.
 */
export function boundaryProgress(b: Pick<V3Block, 'life' | 'tonightCounted'>, sim: SimState): { slept: number; jeong: number } {
  const r = sim.relation;
  return {
    slept: Math.max(0, b.life.slept - (b.tonightCounted ? 1 : 0)),
    jeong: Math.max(0, r.jeongDays - (r.jeongDay === sim.dayIndex ? 1 : 0)),
  };
}

/**
 * M4가 읽는 정 = 공방(V27)과 **같은 값**(마지막 깸 경계 시점). 이번 깸에 만져 오른 몫은 다음 아침부터 보인다 —
 * 그래서 정 2 아침에 늘인 먹 한 가락과 '알아봄'이 함께 열린다. 정을 따로 세는 곳은 없다(sim relation.jeongDays 하나)
 */
export function jeongOf(s: V3State): number {
  return boundaryProgress(s.v3, s.sim).jeong;
}

/** 이 신호의 정 자막을 아직 보일 수 있는가(처음 세 번만) */
export function captionDue(s: V3State, signal: JeongSignal): boolean {
  return (s.v3.captionsShown[JEONG_SIGNALS.indexOf(signal)] ?? CAPTION_MAX) < CAPTION_MAX;
}

/**
 * sim 효과를 보고 v3 블록을 고친다: 깸 = 밥 칸 비움·28번째 아침 완성, 잠 = 밤 세기.
 * 밤 세기(PM 11-25 M6 판정): ① 연적으로 재운 잠은 바로 센다 ② 연적을 잊고 앱을 떠나 저절로 잔 잠도 **그 깸에 한 마디를 썼으면** 센다
 * ③ 말도 연적도 없던 깸의 잠은 세지 않는다(하루 걸러도 생애가 줄지 않음) ④ 깸 하나에 밤은 최대 1.
 */
function follow(s: V3State, simEffects: SimEffect[], ev: V3Event, out: V3Effect[]): V3State {
  let v3 = s.v3;
  const dayOfStroke = new Map(s.sim.strokes.map((x) => [x.id, x.day]));
  const lastSlept = simEffects.map((e) => e.type).lastIndexOf('slept');
  simEffects.forEach((e, i) => {
    if (e.type === 'woke') {
      // 깸 경계: 이번 깸 칸만 비운다(nudgeOptIn·pantry는 그대로). 공방 열림은 이 순간에만 본다(진행 = 밤·정, 밥과 무관)
      const o = openPantry(v3.pantry, boundaryProgress({ life: v3.life, tonightCounted: false }, s.sim)); // 깸 = 경계: 셌던 밤은 이제 지난 몫
      v3 = { ...v3, meal: { ...v3.meal, spoons: 0, treats: 0 }, pantry: o.opened.length ? o.pantry : v3.pantry, tonightCounted: false };
      for (const x of o.opened) out.push({ type: 'pantryOpened', kind: x.kind, item: x.item });
      if (v3.life.slept >= LIFE_NIGHTS && v3.life.final === null) {
        v3 = { ...v3, life: { ...v3.life, final: { night: LIFE_NIGHTS, at: e.at } } };
        out.push({ type: 'lifeComplete' });
      }
      return;
    }
    if (e.type !== 'slept' || v3.tonightCounted || v3.life.final !== null || v3.life.slept >= LIFE_NIGHTS) return;
    const wokeAfter = simEffects.slice(i + 1).filter((x) => x.type === 'woke').length;
    const dropper = ev.type === 'putToSleep' && i === lastSlept && wokeAfter === 0;
    const dayAtSleep = s.sim.dayIndex - wokeAfter;
    const wrote = v3.words.some((w) => dayOfStroke.get(w.strokeId) === dayAtSleep);
    if (!dropper && !wrote) return;
    const night = v3.life.slept + 1;
    const snapshots = [...v3.life.snapshots];
    if (night % IRE_NIGHTS === 0) {
      snapshots[night / IRE_NIGHTS - 1] = { night, at: e.at };
      out.push({ type: 'ireReached', ire: night / IRE_NIGHTS });
    }
    v3 = { ...v3, life: { ...v3.life, slept: night, snapshots }, tonightCounted: true };
    out.push({ type: 'nightCounted', night });
  });
  return v3 === s.v3 ? s : { ...s, v3 };
}

function applySim(s: V3State, ev: SimEvent, out: V3Effect[]): V3State {
  const r = simReduce(s.sim, ev);
  out.push(...r.effects);
  return follow({ ...s, sim: r.state }, r.effects, ev, out);
}

/** 이벤트 하나(먼저 그 시각까지 정산 — sim.reduce가 한다) */
export function reduceV3(s: V3State, e: V3Event): V3Step {
  const out: V3Effect[] = [];
  switch (e.type) {
    case 'washStroke':
      // V8: 획 씻기 없음. 시각 정산만 한다
      return tickV3(s, e.at);
    case 'stroke':
      // v3의 획은 늘 한 마디와 함께(write)만 붙는다(모든 획에 word가 있다)
      return { state: tickV3(s, e.at).state, effects: [{ type: 'writeRejected', reason: 'stroke' }] };
    case 'write': {
      const t = tickV3(s, e.at);
      let st = t.state;
      out.push(...t.effects);
      const block = writeBlock(st);
      if (block) {
        out.push({ type: 'writeRejected', reason: block });
        return { state: st, effects: out };
      }
      if (!validWord(e.word)) {
        out.push({ type: 'writeRejected', reason: 'badWord' });
        return { state: st, effects: out };
      }
      if (!Number.isInteger(e.chars) || e.chars < 1 || e.chars > inkCells(st)) {
        out.push({ type: 'writeRejected', reason: 'tooLong' });
        return { state: st, effects: out };
      }
      const night = nightOf(st);
      const r = simReduce(st.sim, { type: 'stroke', at: e.at, raw: e.raw, level: e.level, birthShape: e.birthShape });
      const acc = r.effects.find((x) => x.type === 'strokeAccepted');
      if (!acc || acc.type !== 'strokeAccepted') {
        out.push(...r.effects.filter((x) => x.type !== 'strokeRejected'));
        out.push({ type: 'writeRejected', reason: 'tooShort' });
        return { state: { ...st, sim: r.state }, effects: out };
      }
      out.push(...r.effects);
      // 한 마디의 붓 획도 '만짐'이다(시스템 3.8 정 정의: 탭·길게 누르기·부르기·획) — 그 깸에 한 번
      const simAfter: SimState = { ...r.state, relation: markJeong(r.state.relation, r.state.dayIndex) };
      const word: Word = { night, sense: e.word.sense, intensity: e.word.intensity, lexVer: e.word.lexVer, source: e.word.source, strokeId: acc.strokeId };
      st = { sim: simAfter, v3: { ...st.v3, words: [...st.v3.words, word] } };
      out.push({ type: 'wordAccepted', night, sense: word.sense, strokeId: word.strokeId });
      return { state: st, effects: out };
    }
    case 'call': {
      // 부르기: 대답은 sim callReply 규칙(M2) 그대로, 정은 공방과 같은 경계 값으로 본다. 부르기도 그 깸의 정 한 칸
      const t = tickV3(s, e.at);
      let st = t.state;
      out.push(...t.effects);
      if (st.sim.phase === 'asleep') return { state: st, effects: out };
      const jeong = jeongOf(st);
      const reply = simCallReply({ ...st.sim, relation: { ...st.sim.relation, jeongDays: jeong } }, { melody: e.melody });
      const near = jeongStageOf(jeong) >= 7 ? st.sim.temperament.closeness >= 0 : null;
      st = { ...st, sim: { ...st.sim, relation: markJeong(st.sim.relation, st.sim.dayIndex) } };
      out.push({ type: 'called', reply, near });
      if (reply === 'melody') out.push({ type: 'jeongSignal', signal: 'reply', caption: captionDue(st, 'reply') });
      return { state: st, effects: out };
    }
    case 'jeongCaption': {
      const t = tickV3(s, e.at);
      const i = JEONG_SIGNALS.indexOf(e.signal);
      const cur = t.state.v3.captionsShown;
      if (i < 0 || (cur[i] ?? CAPTION_MAX) >= CAPTION_MAX) return t;
      const captionsShown = cur.map((n, k) => (k === i ? n + 1 : n));
      return { state: { ...t.state, v3: { ...t.state.v3, captionsShown } }, effects: t.effects };
    }
    case 'tap': {
      // 몸을 이 깸에 처음 만지는 순간, 정 4부터 좋아하는 자리를 손가락 쪽으로 내민다(내밂)
      if (e.target !== 'body') return { state: applySim(s, e, out), effects: out };
      const t = tickV3(s, e.at);
      out.push(...t.effects);
      const before = t.state;
      const firstTouch = before.sim.phase === 'awake' && before.sim.relation.todaySpotMs.every((x) => x === 0);
      const spot = favoriteSpotOf(before.sim.relation.spot);
      const st = applySim(before, e, out);
      if (firstTouch && spot !== null && jeongStageOf(jeongOf(before)) >= 4) out.push({ type: 'jeongSignal', signal: 'offer', caption: captionDue(st, 'offer'), spot });
      return { state: st, effects: out };
    }
    case 'appForeground': {
      // 돌아옴: 비운 시간 × closeness → 반김 4단계(72h 이상 = 머뭇거림 자리). 깨어 있을 때만, 1분 넘게 비웠을 때만
      const away = s.sim.backgroundSince;
      const st = applySim(s, e, out);
      if (away === null || st.sim.phase !== 'awake') return { state: st, effects: out };
      const g = greetingOf({
        awayMs: st.sim.relation.lastAbsenceMs,
        closeness: st.sim.temperament.closeness,
        jeong: jeongOf(st),
        hour: st.sim.relation.hour,
        at: st.sim.clock.lastSimAt,
        tzOffsetMin: e.tzOffsetMin,
      });
      if (!g) return { state: st, effects: out };
      out.push({ type: 'greeted', ...g });
      if (g.recognize) out.push({ type: 'jeongSignal', signal: 'recognize', caption: captionDue(st, 'recognize') });
      if (g.waiting) out.push({ type: 'jeongSignal', signal: 'wait', caption: captionDue(st, 'wait') });
      return { state: st, effects: out };
    }
    case 'mealNudge': {
      const t = tickV3(s, e.at);
      const st = t.state;
      if (st.v3.meal.nudgeOptIn === e.on) return t;
      return { state: { ...st, v3: { ...st.v3, meal: { ...st.v3.meal, nudgeOptIn: e.on } } }, effects: t.effects };
    }
    case 'offer': {
      // 밥·간식은 v3.meal 칸만 바꾼다 — sim(몸·획·정·꿈·성향)에는 아무것도 넘기지 않는다(QA-3 R7·R8, 시험 v3-meal)
      const t = tickV3(s, e.at);
      let st = t.state;
      out.push(...t.effects);
      if (st.sim.phase === 'asleep') {
        out.push({ type: 'offerRejected', reason: 'asleep' });
        return { state: st, effects: out };
      }
      const m = mealSheet(st);
      const open = isPantryItem(e.kind, e.item) && (st.v3.pantry[e.kind] as string[]).includes(e.item);
      const liked = likedShown(st) && likedItem(st) === e.item;
      if (!open) out.push({ type: 'offerRejected', reason: 'locked' });
      else if (e.kind === 'meal') {
        if (m.spoon !== 'ok') out.push({ type: 'offerRejected', reason: m.spoon });
        else {
          const spoons = st.v3.meal.spoons + 1;
          st = { ...st, v3: { ...st.v3, meal: { ...st.v3.meal, spoons } } };
          out.push({ type: 'received', kind: 'meal', item: e.item, bow: spoons >= MEAL_SPOONS_MAX, liked });
        }
      } else if (m.treat !== 'ok') out.push({ type: 'offerRejected', reason: 'cap' });
      else {
        const treats = st.v3.meal.treats + 1;
        st = { ...st, v3: { ...st.v3, meal: { ...st.v3.meal, treats } } };
        out.push({ type: 'received', kind: 'treat', item: e.item, bow: false, liked });
      }
      return { state: st, effects: out };
    }
    default:
      return { state: applySim(s, e, out), effects: out };
  }
}

/** 시간 정산만(앞에 있는 동안의 주기 정산). 깸이 나면 밥 칸을 비우고 28번째 아침을 본다 */
export function tickV3(s: V3State, now: Millis): V3Step {
  const r = simTick(s.sim, now);
  const out: V3Effect[] = [...r.effects];
  const st = follow({ ...s, sim: r.state }, r.effects, { type: 'appBackground', at: now }, out);
  return { state: st, effects: out };
}

// ── 맡겨 두기 업로드 투영(PM V22 ①, heart-grain 9-2 R7): 날마다 {attachStroke, sense} 두 필드뿐 ──

export interface UploadWord {
  attachStroke: StrokeRecord;
  sense: string;
}
/** 아직 맡겨 두기에 연결하지 않았다. 모양만 고정(시험) */
export function uploadWords(s: V3State): UploadWord[] {
  const byId = new Map(s.sim.strokes.map((x) => [x.id, x]));
  const out: UploadWord[] = [];
  for (const w of s.v3.words) {
    const st = byId.get(w.strokeId);
    if (!st) continue;
    out.push({ attachStroke: { raw: st.raw, attach: st.attach, drawnAtCoreScale: st.drawnAtCoreScale, meshVersion: st.meshVersion }, sense: w.sense });
  }
  return out;
}

/**
 * 맡겨 두기 업로드 허용 목록(V27, care 2-2·4-1·M6, heart-grain 9-2 R7). 업로드는 **이 목록으로만** 만든다(블록을 펼쳐 넣지 않는다).
 * - meal·pantry는 올린다: 시각·횟수·연속이 없는 세이브 칸이고(처리방침 3-5 '생활 리듬' 늘지 않음, 법률 F-3 질문),
 *   공방 열림은 되찾은 기기에서도 이어져야 한다(care 2-4 '공방 단위').
 * - walk(마실 날, V31)는 기기 전용 — 다음 아침 연출 뒤 지우고 올리지 않는다(M6).
 * - 집계 핑에는 밥·간식·공방·마실 신호를 싣지 않는다(care 2-3 '위젯·집계') — 핑 사건 목록(@mong/contract PING_EVENTS)은 앱 시험이 고정한다.
 */
export const V3_UPLOAD_FIELDS = ['words', 'life', 'meal', 'pantry', 'tonightCounted'] as const;
/** 기기에만 두는 v3 칸(블록에 생겨도 업로드에 들어가지 않는다) */
export const V3_DEVICE_ONLY_FIELDS = ['walk', 'captionsShown'] as const;

export interface V3Upload {
  words: UploadWord[];
  life: Life;
  meal: Meal;
  pantry: Pantry;
  tonightCounted: boolean;
}

export function uploadV3(s: V3State): V3Upload {
  const b = s.v3;
  return {
    words: uploadWords(s),
    life: { slept: b.life.slept, snapshots: b.life.snapshots.map((x) => (x ? { night: x.night, at: x.at } : null)), final: b.life.final ? { night: b.life.final.night, at: b.life.final.at } : null },
    meal: { spoons: b.meal.spoons, treats: b.meal.treats, nudgeOptIn: b.meal.nudgeOptIn },
    pantry: { meal: [...b.pantry.meal], treat: [...b.pantry.treat] },
    tonightCounted: b.tonightCounted,
  };
}

// ── 세이브 ──

export function serializeV3(s: V3State, savedAt: Millis): string {
  const base = JSON.parse(serializeState(s.sim, savedAt)) as Record<string, unknown>;
  return JSON.stringify({ ...base, v3: s.v3 });
}

const isInt = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi;

/**
 * v3 블록 검증(손상 원문이 그대로 들어오지 않게) + **v3 이행**(V27). 미래 버전은 FutureSaveError.
 * 이행: 세로 조각(main 4ada3ca까지)이 쓴 블록은 모양이 같고 열린 종류가 늘 ['clear']/['pattern']이었다. 읽을 때
 * **마지막 깸 경계 시점 진행(boundaryProgress)**만큼 공방을 채우고 순서·중복을 정리한다. 정식 세이브는 그 경계에서 이미 열었으므로
 * 아무것도 바뀌지 않는다(리뷰 H1 — 재시작 여부·시점과 무관하게 같은 사건열 = 같은 상태·효과, 속성 시험). 다시 적용해도 그대로(멱등).
 * 밥 목록에 간식 종류(또는 그 반대)가 섞이면 모르는 종류와 같게 손상으로 본다(리뷰 L2).
 * 판(3)·저장 키는 그대로라 세로 조각 빌드도 이 세이브를 읽는다. 말·밤·밥 칸은 건드리지 않는다.
 */
function validateV3(b: unknown, sim: SimState): V3Block {
  const bad = (k: string): never => {
    throw new Error(`v3 세이브 손상: ${k}`);
  };
  if (!b || typeof b !== 'object') bad('v3');
  const v = b as Record<string, unknown>;
  if (typeof v.version !== 'number') bad('version');
  if ((v.version as number) > V3_VERSION) throw new FutureSaveError('v3 세이브', v.version as number);
  if (v.version !== V3_VERSION) bad(`알 수 없는 버전 ${String(v.version)}`);
  const life = v.life as Record<string, unknown> | undefined;
  if (!life || !isInt(life.slept, 0, LIFE_NIGHTS) || !Array.isArray(life.snapshots) || life.snapshots.length !== 4) bad('life');
  const meal = v.meal as Record<string, unknown> | undefined;
  if (!meal || !isInt(meal.spoons, 0, MEAL_SPOONS_MAX) || !isInt(meal.treats, 0, TREATS_MAX) || typeof meal.nudgeOptIn !== 'boolean') bad('meal');
  if (Object.keys(meal!).some((k) => !(MEAL_FIELDS as readonly string[]).includes(k))) bad('meal');
  const pantry = v.pantry as Record<string, unknown> | undefined;
  if (!pantry || !Array.isArray(pantry.meal) || !Array.isArray(pantry.treat)) bad('pantry');
  if (!(pantry!.meal as unknown[]).every((x) => isPantryItem('meal', x)) || !(pantry!.treat as unknown[]).every((x) => isPantryItem('treat', x))) bad('pantry');
  if (!Array.isArray(v.words)) bad('words');
  if (typeof v.tonightCounted !== 'boolean') bad('tonightCounted');
  // M4 이행: 칸이 없는 세이브(세로 조각·V27)는 0 넷으로 채운다. 있으면 모양만 본다(다시 적용해도 그대로 — 멱등)
  if (v.captionsShown !== undefined && !(Array.isArray(v.captionsShown) && v.captionsShown.length === JEONG_SIGNALS.length && v.captionsShown.every((n) => isInt(n, 0, CAPTION_MAX))))
    bad('captionsShown');
  const ids = new Set(sim.strokes.map((x) => x.id));
  for (const w of v.words as Record<string, unknown>[]) {
    if (!w || !isInt(w.night, 1, LIFE_NIGHTS) || !STORED_SENSES.includes(w.sense as string) || !isInt(w.intensity, 1, 3)) bad('word');
    if (typeof w.lexVer !== 'string' || (w.source !== 'keyboard' && w.source !== 'ink') || !ids.has(w.strokeId as string)) bad('word');
  }
  const block = v as unknown as V3Block;
  const { pantry: opened } = openPantry(block.pantry, boundaryProgress(block, sim));
  return { ...block, pantry: opened, captionsShown: v.captionsShown === undefined ? emptyCaptionsShown() : [...block.captionsShown] };
}

export function parseV3(json: string): V3State {
  const obj = JSON.parse(json) as { v3?: unknown };
  if (obj.v3 === undefined) throw new Error('v3 블록이 없다(옛 세이브)');
  const sim = parseState(json);
  return { sim, v3: validateV3(obj.v3, sim) };
}

export const V3_KEYS = {
  main: 'mong.v3.save.main',
  backup: 'mong.v3.save.backup',
  corrupt: 'mong.v3.save.corrupt',
  /** 새 컨셉으로 처음 시작할 때 옛 세이브(v2) 본 원문을 한 번 복사해 둔다(지우지 않음 — 원래 키도 그대로) */
  archiveV2: 'mong.v3.archive.v2',
} as const;

const safeGet = (kv: KV, k: string): string | undefined => {
  try {
    return kv.getString(k);
  } catch {
    return undefined;
  }
};

export function isFutureV3(json: string): boolean {
  try {
    const o = JSON.parse(json) as { schemaVersion?: unknown; sim?: { version?: unknown }; v3?: { version?: unknown } };
    const n = (x: unknown) => (typeof x === 'number' ? x : 0);
    return n(o.schemaVersion) > SCHEMA_VERSION || n(o.sim?.version) > SIM_SCHEMA_VERSION || n(o.v3?.version) > V3_VERSION;
  } catch {
    return false;
  }
}

/** 검증 → (깸 직후 한 번) 직전 본을 백업으로 → 새 본. 어떤 실패도 던지지 않는다(slots.writeSave와 같은 규칙) */
export function writeSaveV3(kv: KV, s: V3State, savedAt: Millis, opts: WriteOptions = {}): WriteResult {
  const cur = safeGet(kv, V3_KEYS.main);
  if (cur !== undefined && isFutureV3(cur)) return { ok: false, error: 'future: 새 버전 세이브를 덮어쓰지 않는다' };
  let json: string;
  try {
    json = serializeV3(s, savedAt);
    parseV3(json);
  } catch (e) {
    return { ok: false, error: `검증: ${String((e as Error)?.message ?? e)}` };
  }
  let rotated = false;
  try {
    if (opts.rotateBackup || safeGet(kv, V3_KEYS.backup) === undefined) {
      const prev = safeGet(kv, V3_KEYS.main);
      if (prev !== undefined && prev !== json && readable(prev)) {
        kv.set(V3_KEYS.backup, prev);
        rotated = true;
      }
    }
    kv.set(V3_KEYS.main, json);
  } catch (e) {
    return { ok: false, error: `io: ${String((e as Error)?.message ?? e)}` };
  }
  return { ok: true, bytes: json.length, rotated };
}

function readable(json: string): boolean {
  try {
    parseV3(json);
    return true;
  } catch {
    return false;
  }
}

export interface ReadV3Result {
  state: V3State | null;
  source: 'main' | 'backup' | 'none';
  error?: string;
  hadSave: boolean;
  futureVersion?: boolean;
  /** 옛 세이브(v2)가 이 기기에 있다(새 컨셉은 1일차부터, 옛 것은 그대로 보관) */
  hasV2: boolean;
}

/** 본 → 백업. v2 세이브는 읽지 않는다(새 컨셉은 1일차부터) — 있으면 archiveV2로 복사만 해 둔다 */
export function readSaveV3(kv: KV): ReadV3Result {
  const hasV2 = safeGet(kv, SAVE_KEYS.main) !== undefined;
  archiveV2(kv);
  const main = safeGet(kv, V3_KEYS.main);
  const backup = safeGet(kv, V3_KEYS.backup);
  const hadSave = main !== undefined || backup !== undefined;
  let error: string | undefined;
  if (main !== undefined) {
    if (isFutureV3(main)) return { state: null, source: 'none', error: 'future', hadSave, futureVersion: true, hasV2 };
    try {
      return { state: parseV3(main), source: 'main', hadSave, hasV2 };
    } catch (e) {
      if (isFutureSaveError(e)) return { state: null, source: 'none', error: String((e as Error).message), hadSave, futureVersion: true, hasV2 };
      error = String((e as Error)?.message ?? e);
      try {
        kv.set(V3_KEYS.corrupt, main);
      } catch {
        /* 보존 실패는 읽기를 막지 않는다 */
      }
    }
  }
  if (backup !== undefined) {
    try {
      return { state: parseV3(backup), source: 'backup', error, hadSave, hasV2 };
    } catch {
      /* 백업도 깨짐 */
    }
  }
  return { state: null, source: 'none', error, hadSave, hasV2 };
}

/** 옛 세이브(v2) 본 원문을 보관 키로 한 번 복사한다(원래 키는 지우지 않는다). 이미 있으면 덮지 않는다 */
export function archiveV2(kv: KV): boolean {
  const v2 = safeGet(kv, SAVE_KEYS.main);
  if (v2 === undefined || safeGet(kv, V3_KEYS.archiveV2) !== undefined) return false;
  try {
    kv.set(V3_KEYS.archiveV2, v2);
    return true;
  } catch {
    return false;
  }
}

/** 개발 메뉴 '처음부터 다시': v3 세이브만 지운다(옛 세이브 v2·보관본은 그대로) */
export function clearSaveV3(kv: KV): void {
  for (const k of [V3_KEYS.main, V3_KEYS.backup, V3_KEYS.corrupt]) {
    try {
      kv.remove(k);
    } catch {
      /* 무시 */
    }
  }
}
