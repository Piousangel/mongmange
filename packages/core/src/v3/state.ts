// 세이브·sim v3 최소판(V1 최소 · V8 · V9 · V27 최소, D-26·D-27). 새 컨셉 세로 조각용.
// 구조: v3 상태 = 기존 sim 상태(시계·잠·깸·꿈·획·정, 세이브 v2 그대로) + v3 블록(`words`·`life`·`meal`·`pantry`).
// sim 규칙은 그대로 쓰고(reduce를 감쌀 뿐), 이 파일은 v3가 더하는 것만 정한다:
//   ① write = 한 마디(말결만, 글자는 저장 0) + 붓 한 획(C′-키보드 갈래: 몸에 붙는 획은 붓 한 획, D-12 그대로)
//   ② 벼루 = 먹 양 = 그날 쓸 수 있는 글자 수 1~6(V8). 갈기 보상 없음(D-27)
//   ③ 연적 = 재우기·내려놓기. 연적으로 재운 밤만 '함께 잔 밤'으로 센다(D-07, concept-review 3-3: 하루 걸러도 생애가 줄지 않음).
//      획 씻기 없음(V8) — washStroke는 받지 않는다
//   ④ 28밤: 이레(7·14·21·28)마다 스냅숏 자리, 28번째 아침에 완성 → 곁에 남음(성장 = 새 말·새 획만 멈춤)
//   ⑤ 밥 한 숟갈(깸마다 최대 2, 먹을 한 칸 이상 갈았을 때)·작은 것(깸마다 최대 3). 시각·횟수 기록 0(D-27)
// 세이브 = 기존 봉투(schemaVersion 2 + sim 2) + `v3` 블록. 저장 키는 따로라 옛 세이브(v2)는 손대지 않고 보관된다.
import { parseState, serializeState } from '../sim/save';
import { reduce as simReduce, tick as simTick, strokeBlock, SIM_SCHEMA_VERSION } from '../sim/reduce';
import { createInitial, type InitialOptions } from '../sim/reduce';
import type { Effect as SimEffect, Event as SimEvent, Millis, State as SimState } from '../sim/types';
import { FutureSaveError, isFutureSaveError, SCHEMA_VERSION } from '../save/envelope';
import { SAVE_KEYS, type KV, type WriteOptions, type WriteResult } from '../save/slots';
import type { AttachLevel, RawPoint, StrokeRecord } from '../geometry/types';
import { FAMILIES, STORED_SENSES, WORD_MAX_CHARS, familyOf, type FamilyId, type Intensity } from './lexicon';

export const V3_VERSION = 3;
export const LIFE_NIGHTS = 28;
export const IRE_NIGHTS = 7;
/** 먹 한 칸 = 이만큼 간 시간(첫 칸은 갈기 시작과 함께). 6칸에서 멈춘다 */
export const INK_CELL_MS = 1500;
export const MEAL_SPOONS_MAX = 2;
export const TREATS_MAX = 3;

/** 밥 3·간식 3 중 1.0 최소판(D-27 자르는 순서 최소선): 밥 1 + 간식 1. 나머지는 이름만 자리 */
export const MEAL_ITEMS = ['clear'] as const;
export const TREAT_ITEMS = ['pattern'] as const;
export type MealItem = 'clear' | 'pine' | 'dew';
export type TreatItem = 'pattern' | 'ribbon' | 'dewdrop';

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

export interface Meal {
  /** 이번 깸에 준 숟갈(깸이 바뀌면 0) */
  spoons: number;
  /** 이번 깸에 준 작은 것(깸이 바뀌면 0) */
  treats: number;
  /** 밥 알림 받기(기본 꺼짐 — 알림은 이번 범위 밖) */
  nudgeOptIn: boolean;
}

export interface V3Block {
  version: number;
  words: Word[];
  life: Life;
  meal: Meal;
  /** 공방 단위로 열린 종류(새 먹 방울에도 이어짐) */
  pantry: { meal: MealItem[]; treat: TreatItem[] };
  /** 지금 자는 잠이 연적으로 재워 센 밤인가(깨면 false). 시각은 저장하지 않는다 */
  tonightCounted: boolean;
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
  | { type: 'feed'; at: Millis; kind: 'meal'; item: MealItem }
  | { type: 'feed'; at: Millis; kind: 'treat'; item: TreatItem };

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
  | { type: 'fed'; kind: 'meal' | 'treat'; item: string; full: boolean }
  | { type: 'feedRejected'; reason: 'asleep' | 'noInk' | 'cap' | 'locked' };

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
    pantry: { meal: [...MEAL_ITEMS], treat: [...TREAT_ITEMS] },
    tonightCounted: false,
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
  const ms = s.sim.ledger.grindMs;
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

/** 벼루 하위 시트 상태 */
export function mealSheet(s: V3State): { spoon: 'ok' | 'noInk' | 'cap'; treat: 'ok' | 'cap' } {
  const spoon = s.v3.meal.spoons >= MEAL_SPOONS_MAX ? 'cap' : inkCells(s) === 0 ? 'noInk' : 'ok';
  return { spoon, treat: s.v3.meal.treats >= TREATS_MAX ? 'cap' : 'ok' };
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

/** sim 효과를 보고 v3 블록을 고친다: 깸 = 밥 칸 비움·28번째 아침 완성, 연적 잠 = 밤 세기 */
function follow(s: V3State, simEffects: SimEffect[], ev: V3Event, out: V3Effect[]): V3State {
  let v3 = s.v3;
  for (const e of simEffects) {
    if (e.type === 'woke') {
      v3 = { ...v3, meal: { ...v3.meal, spoons: 0, treats: 0 }, tonightCounted: false };
      if (v3.life.slept >= LIFE_NIGHTS && v3.life.final === null) {
        v3 = { ...v3, life: { ...v3.life, final: { night: LIFE_NIGHTS, at: e.at } } };
        out.push({ type: 'lifeComplete' });
      }
    } else if (e.type === 'slept' && ev.type === 'putToSleep' && v3.life.final === null && v3.life.slept < LIFE_NIGHTS) {
      const night = v3.life.slept + 1;
      const snapshots = [...v3.life.snapshots];
      if (night % IRE_NIGHTS === 0) {
        snapshots[night / IRE_NIGHTS - 1] = { night, at: e.at };
        out.push({ type: 'ireReached', ire: night / IRE_NIGHTS });
      }
      v3 = { ...v3, life: { ...v3.life, slept: night, snapshots }, tonightCounted: true };
      out.push({ type: 'nightCounted', night });
    }
  }
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
      const word: Word = { night, sense: e.word.sense, intensity: e.word.intensity, lexVer: e.word.lexVer, source: e.word.source, strokeId: acc.strokeId };
      st = { sim: r.state, v3: { ...st.v3, words: [...st.v3.words, word] } };
      out.push({ type: 'wordAccepted', night, sense: word.sense, strokeId: word.strokeId });
      return { state: st, effects: out };
    }
    case 'feed': {
      const t = tickV3(s, e.at);
      let st = t.state;
      out.push(...t.effects);
      if (st.sim.phase === 'asleep') {
        out.push({ type: 'feedRejected', reason: 'asleep' });
        return { state: st, effects: out };
      }
      const m = mealSheet(st);
      if (e.kind === 'meal') {
        if (!(st.v3.pantry.meal as string[]).includes(e.item)) out.push({ type: 'feedRejected', reason: 'locked' });
        else if (m.spoon !== 'ok') out.push({ type: 'feedRejected', reason: m.spoon });
        else {
          const spoons = st.v3.meal.spoons + 1;
          st = { ...st, v3: { ...st.v3, meal: { ...st.v3.meal, spoons } } };
          out.push({ type: 'fed', kind: 'meal', item: e.item, full: spoons >= MEAL_SPOONS_MAX });
        }
      } else if (!(st.v3.pantry.treat as string[]).includes(e.item)) out.push({ type: 'feedRejected', reason: 'locked' });
      else if (m.treat !== 'ok') out.push({ type: 'feedRejected', reason: 'cap' });
      else {
        const treats = st.v3.meal.treats + 1;
        st = { ...st, v3: { ...st.v3, meal: { ...st.v3.meal, treats } } };
        out.push({ type: 'fed', kind: 'treat', item: e.item, full: treats >= TREATS_MAX });
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

// ── 세이브 ──

export function serializeV3(s: V3State, savedAt: Millis): string {
  const base = JSON.parse(serializeState(s.sim, savedAt)) as Record<string, unknown>;
  return JSON.stringify({ ...base, v3: s.v3 });
}

const isInt = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi;

/** v3 블록 검증(손상 원문이 그대로 들어오지 않게). 미래 버전은 FutureSaveError */
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
  const pantry = v.pantry as Record<string, unknown> | undefined;
  if (!pantry || !Array.isArray(pantry.meal) || !Array.isArray(pantry.treat)) bad('pantry');
  if (!Array.isArray(v.words)) bad('words');
  if (typeof v.tonightCounted !== 'boolean') bad('tonightCounted');
  const ids = new Set(sim.strokes.map((x) => x.id));
  for (const w of v.words as Record<string, unknown>[]) {
    if (!w || !isInt(w.night, 1, LIFE_NIGHTS) || !STORED_SENSES.includes(w.sense as string) || !isInt(w.intensity, 1, 3)) bad('word');
    if (typeof w.lexVer !== 'string' || (w.source !== 'keyboard' && w.source !== 'ink') || !ids.has(w.strokeId as string)) bad('word');
  }
  return v as unknown as V3Block;
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
