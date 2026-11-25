// 세이브 v3 맡겨 두기(V27b, roadmap V27b·V27 리뷰 M2): 올리는 본문·되찾은 본문 읽기·'쌓이기만' 칸 병합.
// 원칙
//  - 올리는 본문은 uploadV3(허용 목록 V3_UPLOAD_FIELDS)로만 만든다. 기기 세이브(serializeV3)를 펼쳐 넣지 않는다.
//    본문 = sim 봉투(serializeState, B2 정본 그대로 — 정 값 relation.jeongDays도 여기) + `v3` 블록(version + 허용 목록).
//    말(words)은 날마다 {attachStroke, sense} 두 필드(heart-grain 9-2 R7). attachStroke = 봉투 strokes에서의 번호(그 말의 붙은 획 —
//    봉투 획이 곧 붙은 획이라 같은 획을 두 벌 싣지 않는다, 리뷰 M-1. 최악 크기에서도 상한의 85% 아래 — 앱 시험 cloud-v3).
//  - 봉투의 획은 모두 어떤 말의 붙은 획이어야 한다(v3는 말 없는 획을 받지 않는다). 아니면 올리지 않는다(닫힌 쪽으로 실패).
//  - 되찾은 본문(서버 본·기기 칸)은 결정적으로 읽는다: 같은 본문 = 같은 상태. 말의 night·intensity·lexVer·source는 올리지 않았으므로
//    고정값(RESTORED_*)으로 채운다 — 화면·sim이 이 셋을 읽지 않고(마음 벡터·꿈·결은 sense만, R5) 같은 상태를 다시 올리면 본문이 같다.
//  - 공방(pantry)과 정(relation.jeongDays)은 '쌓이기만' 한다: 본을 바꿀 때(adoptV3)·이 기기 본을 고를 때(stackV3) 합집합·최댓값.
import { capRaw } from '../geometry/simplify';
import { encodeRaw, isFutureSaveError, SCHEMA_VERSION } from '../save/envelope';
import { parseState, serializeState } from '../sim/save';
import { SIM_SCHEMA_VERSION } from '../sim/reduce';
import type { Millis, State as SimState } from '../sim/types';
import { STORED_SENSES } from './lexicon';
import { MEAL_KINDS, TREAT_KINDS, isPantryItem, likedItemOf, openPantry, type Pantry } from './meal';
import { boundaryProgress, parseV3, uploadV3, LIFE_NIGHTS, V3_UPLOAD_FIELDS, V3_VERSION, type V3Block, type V3State, type Word } from './state';

/** 올리는 v3 블록의 키 = 판 + 허용 목록. 이 밖의 키가 있으면 서버·앱 모두 받지 않는다 */
export const V3_WIRE_KEYS: readonly string[] = ['version', ...V3_UPLOAD_FIELDS];
/** 올리는 말 하나의 키(R7) */
export const V3_WIRE_WORD_KEYS: readonly string[] = ['attachStroke', 'sense'];
/** v3 본문의 맨 위 키(리뷰 M-3: 봉투 + v3 블록 밖의 칸은 받지 않는다) */
export const V3_WIRE_TOP_KEYS: readonly string[] = ['schemaVersion', 'sim', 'strokes', 'v3'];
/** v3 본문 sim 블록의 키 */
export const V3_WIRE_SIM_KEYS: readonly string[] = ['savedAt', 'state', 'strokeMeta', 'version'];
/** 봉투 획 하나의 키(D-13 봉투 그대로 — 붙은 획) */
export const V3_WIRE_STROKE_KEYS: readonly string[] = ['attach', 'drawnAtCoreScale', 'hasP', 'meshVersion', 'raw'];
/** 획 메타 하나의 키(sim strokeMeta) */
export const V3_WIRE_STROKE_META_KEYS: readonly string[] = ['createdAt', 'day', 'grind', 'id', 'pinned', 'style'];
/**
 * v3 본문 sim.state가 가질 수 있는 키(리뷰 M-3). sim State에 칸이 늘면 이 목록·처리방침 3-5 대조를 함께 고쳐야 시험(타입 검사 포함)이 통과한다 —
 * 새 칸이 말없이 서버로 올라가지 않게. nightCtx는 보름·꿈 플래그를 켠 이벤트가 있을 때만 생긴다.
 */
export const V3_SIM_STATE_KEYS = [
  'schemaVersion', 'rng', 'createdAt', 'clock', 'phase', 'sleepAt', 'lastWakeAt', 'backgroundSince', 'dayIndex', 'bedtimeLocalMin', 'morningLocalMin',
  'born', 'temperament', 'bornTemperament', 'habit', 'focusHistory', 'strokesTotal', 'peakStrokes', 'ledger', 'lastCareAt', 'pendingCard', 'pendingLine',
  'cards', 'recentChannels', 'ire7LineShown', 'birth', 'ink', 'name', 'temperamentLabel', 'relation', 'nightCtx',
] as const satisfies readonly Exclude<keyof SimState, 'strokes'>[];
// 거꾸로(State의 모든 칸이 목록에 있는가)도 타입으로 고정: 빠진 칸이 있으면 아래 줄이 타입 오류
const _allStateKeys: [Exclude<Exclude<keyof SimState, 'strokes'>, (typeof V3_SIM_STATE_KEYS)[number]>] extends [never] ? true : never = true;
void _allStateKeys;
/** v3 본문이 반드시 가지는 sim.state 키(nightCtx만 선택) */
const SIM_STATE_OPTIONAL = new Set<string>(['nightCtx']);
/**
 * 정(relation.jeongDays)의 상식 상한 = 깸 수(dayIndex) + 1 + 이만큼(리뷰 L-3·M-3). 정은 깸마다 최대 1이라 한 갈래에서는 dayIndex + 1을 넘지 않는다.
 * 두 갈래를 모을 때(stackV3) 다른 갈래가 날 수가 더 많을 수 있어 여유를 둔다. 병합은 이 상한에서 멈추므로 앱이 만든 본문은 늘 통과한다.
 */
export const JEONG_SLACK = 7;
export function jeongCapOf(sim: Pick<SimState, 'dayIndex'>): number {
  return sim.dayIndex + 1 + JEONG_SLACK;
}
const LIFE_KEYS = ['final', 'slept', 'snapshots'];
const MEAL_KEYS = ['nudgeOptIn', 'spoons', 'treats'];
const PANTRY_KEYS = ['meal', 'treat'];
const MARK_KEYS = ['at', 'night'];

/** 되찾은 말의 표시: 사전 판 자리에 이 값이 있으면 night·intensity·source는 고정값이다(올리지 않은 값) */
export const RESTORED_LEX_VER = 'restored';
/** 되찾은 말의 세기 — 모든 날 같은 값(R2: 어떤 날도 다른 모양이 되지 않게). 화면·sim이 읽지 않는다 */
export const RESTORED_INTENSITY = 2;

export class UploadShapeError extends Error {}

/**
 * 맡겨 두기 본문(PUT /saves/main·conflicts). savedAt = 그 기기 세이브의 저장 시각(같은 상태 = 같은 본문 = 같은 sha).
 * 말의 attachStroke = 그 말의 붙은 획이 봉투 strokes에서 몇 번째인가(리뷰 M-1: 같은 획을 두 벌 싣지 않는다 — 봉투가 곧 붙은 획이고,
 * i번째 말 = i번째 획만 허용). 붙은 획이 아닌 획이 봉투에 있거나 순서가 다르면 UploadShapeError(올리지 않음).
 */
export function uploadBodyV3(s: V3State, savedAt: Millis): string {
  const up = uploadV3(s);
  const index = new Map(s.sim.strokes.map((x, i) => [x.id, i]));
  if (s.v3.words.length !== s.sim.strokes.length || s.v3.words.some((w, i) => index.get(w.strokeId) !== i) || up.words.length !== s.v3.words.length) throw new UploadShapeError('말 없는 획·순서');
  const env = JSON.parse(serializeState(s.sim, savedAt)) as Record<string, unknown>;
  const words = up.words.map((w, i) => ({ attachStroke: i, sense: w.sense }));
  return JSON.stringify({ ...env, v3: { version: V3_VERSION, words, life: up.life, meal: up.meal, pantry: up.pantry, tonightCounted: up.tonightCounted } });
}

export type UploadCheck = { kind: 'ok' } | { kind: 'future' } | { kind: 'invalid'; reason: string };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const sameKeys = (o: Record<string, unknown>, keys: readonly string[]) => {
  const k = Object.keys(o).sort();
  return k.length === keys.length && [...keys].sort().every((x, i) => x === k[i]);
};
const isInt = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi;

/**
 * 올린 본문 검사(서버 inspectSave·가짜 서버·앱 마지막 문이 같이 쓴다). `v3`가 없으면 ok(옛 세이브 v2 — 이 검사의 대상 아님).
 * v3 본문이면 맨 위·sim 블록·sim.state·봉투 획·획 메타의 키가 정해진 목록과 같아야 하고(리뷰 M-3), v3 블록은 허용 목록·기기 형태 말 0·
 * 말 = 봉투 획 하나씩·모르는 말결 0, 정은 상식 상한(jeongCapOf) 안. 블록 판이 더 크면 future(판이 다르면 칸 목록도 다를 수 있어 블록 판만 본다).
 */
export function checkUploadBodyV3(json: string): UploadCheck {
  let o: unknown;
  try {
    o = JSON.parse(json);
  } catch {
    return { kind: 'invalid', reason: 'not_json' };
  }
  if (!isObj(o)) return { kind: 'invalid', reason: 'not_object' };
  if (o.v3 === undefined) return { kind: 'ok' };
  const b = o.v3;
  if (!isObj(b) || typeof b.version !== 'number') return { kind: 'invalid', reason: 'v3_version' };
  if (b.version > V3_VERSION) return { kind: 'future' };
  if (b.version !== V3_VERSION) return { kind: 'invalid', reason: 'v3_version' };
  if (!sameKeys(b, V3_WIRE_KEYS)) return { kind: 'invalid', reason: 'v3_keys' };
  // 맨 위·sim 블록·sim.state(리뷰 M-3)
  if (!sameKeys(o, V3_WIRE_TOP_KEYS)) return { kind: 'invalid', reason: 'v3_top' };
  const simB = o.sim;
  if (!isObj(simB) || !sameKeys(simB, V3_WIRE_SIM_KEYS) || !isObj(simB.state) || !Array.isArray(simB.strokeMeta)) return { kind: 'invalid', reason: 'v3_sim' };
  const st = simB.state;
  const allowed = new Set<string>(V3_SIM_STATE_KEYS);
  if (Object.keys(st).some((k) => !allowed.has(k)) || V3_SIM_STATE_KEYS.some((k) => !SIM_STATE_OPTIONAL.has(k) && !(k in st))) return { kind: 'invalid', reason: 'v3_state' };
  const rel = st.relation;
  if (!isInt(st.dayIndex, 0, 1_000_000) || !isObj(rel) || !isInt(rel.jeongDays, 0, jeongCapOf({ dayIndex: st.dayIndex as number }))) return { kind: 'invalid', reason: 'v3_jeong' };
  const life = b.life;
  if (!isObj(life) || !sameKeys(life, LIFE_KEYS) || !isInt(life.slept, 0, LIFE_NIGHTS) || !Array.isArray(life.snapshots) || life.snapshots.length !== 4) return { kind: 'invalid', reason: 'v3_life' };
  const markOk = (m: unknown) => m === null || (isObj(m) && sameKeys(m, MARK_KEYS) && isInt(m.night, 1, LIFE_NIGHTS) && typeof m.at === 'number' && Number.isFinite(m.at));
  if (!life.snapshots.every(markOk) || !markOk(life.final)) return { kind: 'invalid', reason: 'v3_life' };
  const meal = b.meal;
  if (!isObj(meal) || !sameKeys(meal, MEAL_KEYS) || !isInt(meal.spoons, 0, 99) || !isInt(meal.treats, 0, 99) || typeof meal.nudgeOptIn !== 'boolean') return { kind: 'invalid', reason: 'v3_meal' };
  const pantry = b.pantry;
  if (!isObj(pantry) || !sameKeys(pantry, PANTRY_KEYS) || !Array.isArray(pantry.meal) || !Array.isArray(pantry.treat)) return { kind: 'invalid', reason: 'v3_pantry' };
  if (!pantry.meal.every((x) => isPantryItem('meal', x)) || !pantry.treat.every((x) => isPantryItem('treat', x))) return { kind: 'invalid', reason: 'v3_pantry' };
  if (typeof b.tonightCounted !== 'boolean') return { kind: 'invalid', reason: 'v3_tonight' };
  if (!Array.isArray(b.words) || b.words.length > LIFE_NIGHTS) return { kind: 'invalid', reason: 'v3_words' };
  for (let i = 0; i < b.words.length; i++) {
    const w = b.words[i] as unknown;
    if (!isObj(w) || !sameKeys(w, V3_WIRE_WORD_KEYS) || typeof w.sense !== 'string' || !STORED_SENSES.includes(w.sense)) return { kind: 'invalid', reason: 'v3_word' };
    // i번째 말 = 봉투 i번째 획(한 획에 한 말)
    if (w.attachStroke !== i) return { kind: 'invalid', reason: 'v3_word' };
  }
  // 봉투의 획 = 말의 붙은 획(하나씩). 남는 획(말 없는 글씨)이 있으면 받지 않는다(R7 '나머지 글씨 점열은 올리지 않는다')
  const env = Array.isArray(o.strokes) ? (o.strokes as unknown[]) : null;
  if (!env || env.length !== b.words.length || simB.strokeMeta.length !== env.length) return { kind: 'invalid', reason: 'v3_strokes' };
  if (!env.every((e) => isObj(e) && sameKeys(e, V3_WIRE_STROKE_KEYS) && typeof e.raw === 'string' && typeof e.hasP === 'boolean')) return { kind: 'invalid', reason: 'v3_strokes' };
  if (!simB.strokeMeta.every((m) => isObj(m) && sameKeys(m, V3_WIRE_STROKE_META_KEYS))) return { kind: 'invalid', reason: 'v3_strokes' };
  return { kind: 'ok' };
}

/** 본문의 형태: v2 = v3 블록 없는 옛 세이브, v3 = 기기 형태든 올린 형태든 v3 블록, future = 이 앱보다 새 판, bad = 읽을 수 없음 */
export type SaveForm = 'v2' | 'v3' | 'future' | 'bad';
export function saveFormOf(json: string | null): SaveForm {
  if (json === null) return 'bad';
  let o: { schemaVersion?: unknown; sim?: { version?: unknown }; v3?: { version?: unknown } };
  try {
    o = JSON.parse(json) as typeof o;
  } catch {
    return 'bad';
  }
  if (!isObj(o)) return 'bad';
  const n = (x: unknown) => (typeof x === 'number' ? x : 0);
  if (n(o.schemaVersion) > SCHEMA_VERSION || n(o.sim?.version) > SIM_SCHEMA_VERSION || (o.v3 !== undefined && n(o.v3?.version) > V3_VERSION)) return 'future';
  return o.v3 === undefined ? 'v2' : 'v3';
}

/**
 * 올린 본문 → v3 상태(되찾기·나란히 고르기·기기 칸). 결정적: 같은 본문 = 같은 상태.
 * 말 복원 규칙(R7): i번째 말 = 봉투 i번째 획(검사가 같은 글자임을 확인) → strokeId는 그 획의 id, sense는 그대로,
 * night = i + 1(말 하나 = 밤 하나의 하한 — 말 없이 연적으로 잔 밤은 알 수 없다), intensity·source·lexVer = 고정값.
 * 공방은 기기 세이브 읽기와 같이 마지막 깸 경계 진행만큼 연다(parseV3 이행 그대로).
 */
export function parseUploadV3(json: string): V3State {
  const c = checkUploadBodyV3(json);
  if (c.kind === 'future') throw new FutureV3Error();
  if (c.kind !== 'ok') throw new Error(`v3 본문 손상: ${c.reason}`);
  const o = JSON.parse(json) as Record<string, unknown> & { v3?: Record<string, unknown> };
  if (!o.v3) throw new Error('v3 블록이 없다(옛 세이브)');
  const sim = parseState(json);
  const wire = o.v3 as { words: { sense: string }[]; life: unknown; meal: unknown; pantry: unknown; tonightCounted: unknown };
  const words: Word[] = wire.words.map((w, i) => ({ night: Math.min(LIFE_NIGHTS, i + 1), sense: w.sense, intensity: RESTORED_INTENSITY, lexVer: RESTORED_LEX_VER, source: 'keyboard', strokeId: sim.strokes[i]!.id }));
  const block = { version: V3_VERSION, words, life: wire.life, meal: wire.meal, pantry: wire.pantry, tonightCounted: wire.tonightCounted };
  // 검증·이행은 기기 세이브와 같은 길(parseV3)로 — 규칙이 둘로 갈리지 않게
  return parseV3(JSON.stringify({ ...o, v3: block }));
}

export class FutureV3Error extends Error {
  constructor() {
    super('v3 본문: 이 앱보다 새 판');
  }
}
export function isFutureV3Error(e: unknown): boolean {
  return e instanceof FutureV3Error || isFutureSaveError(e);
}

/** 기기 형태(parseV3)든 올린 형태(parseUploadV3)든 읽는다. v2·손상이면 던진다 */
export function readAnyV3(json: string): V3State {
  try {
    return parseV3(json);
  } catch (e) {
    if (isFutureSaveError(e)) throw e;
    return parseUploadV3(json);
  }
}

/** 같은 몽망이인가(타고남 씨앗과 태어난 시각) */
export function sameCreatureV3(a: V3State, b: V3State): boolean {
  return a.sim.birth.seed === b.sim.birth.seed && a.sim.birth.at === b.sim.birth.at && a.sim.createdAt === b.sim.createdAt;
}

const canon = <T extends string>(order: readonly T[], have: readonly string[]): T[] => order.filter((x) => have.includes(x));

/** 공방 합집합(정해진 순서·중복 없음) — 교환·결합·멱등 */
export function unionPantry(a: Pantry, b: Pantry): Pantry {
  return { meal: canon(MEAL_KINDS, [...a.meal, ...b.meal]), treat: canon(TREAT_KINDS, [...a.treat, ...b.treat]) };
}

const samePantry = (a: Pantry, b: Pantry) => a.meal.join() === b.meal.join() && a.treat.join() === b.treat.join();

/**
 * '쌓이기만' 하는 칸을 other에서 target으로 모은다(결정적, 다시 적용해도 그대로):
 *  - 공방(pantry, 공방 단위 — 몽망이가 달라도 이어짐) = 합집합, 그 뒤 target의 깸 경계 진행으로 열 것은 연다(V27 이행과 같은 규칙)
 *  - 정(relation.jeongDays, 몽망이마다) = 같은 몽망이일 때만 최댓값. jeongDay(이번 깸에 올렸는가)는 target 것 그대로 — 그래서 늘어난 정은
 *    공방·M4와 같이 다음 깸 경계 값에서 보이고, 이번 깸에 한 번 더 오를 수 있는지는 target 기기의 이 깸 기록이 정한다
 *  - 정 자막 횟수(captionsShown, 기기 전용)는 같은 몽망이일 때 칸마다 최댓값(이 기기에서 이미 보인 횟수가 줄지 않게)
 * 바뀐 것이 없으면 target을 그대로 돌려준다(같은 참조).
 */
export function stackV3(target: V3State, other: V3State | null): V3State {
  if (!other) return target;
  const same = sameCreatureV3(target, other);
  const r = target.sim.relation;
  // 같은 몽망이면 큰 쪽, 단 받는 쪽 상식 상한(jeongCapOf)에서 멈춘다 — 받는 쪽 자기 값보다 내려가지는 않는다
  const jeongDays = same ? Math.max(r.jeongDays, Math.min(other.sim.relation.jeongDays, jeongCapOf(target.sim))) : r.jeongDays;
  const sim = jeongDays === r.jeongDays ? target.sim : { ...target.sim, relation: { ...r, jeongDays } };
  const united = unionPantry(target.v3.pantry, other.v3.pantry);
  const pantry = openPantry(united, boundaryProgress(target.v3, sim), likedItemOf(target.sim.birth.seed)).pantry;
  let captionsShown = target.v3.captionsShown;
  if (same && other.v3.captionsShown) {
    const a = target.v3.captionsShown ?? other.v3.captionsShown.map(() => 0);
    captionsShown = a.map((n, i) => Math.max(n, other.v3.captionsShown![i] ?? 0));
  }
  const capSame = (captionsShown ?? []).join() === (target.v3.captionsShown ?? []).join() && (captionsShown === undefined) === (target.v3.captionsShown === undefined);
  if (sim === target.sim && samePantry(pantry, target.v3.pantry) && capSame) return target;
  const v3: V3Block = { ...target.v3, pantry };
  if (captionsShown !== undefined) v3.captionsShown = captionsShown;
  return { sim, v3 };
}

/**
 * 되찾은 말에 이 기기 본의 같은 말 기록을 되붙인다(같은 몽망이·같은 붙은 획·같은 말결일 때만). 서버에 올리지 않은 night·세기·사전 판·입력
 * 방식은 이 기기에 남아 있으면 그대로 쓰고, 없으면 고정값 그대로 둔다. 결정적이다.
 */
export function hydrateWordsV3(incoming: V3State, local: V3State | null): V3State {
  if (!local || !sameCreatureV3(incoming, local) || !incoming.v3.words.some((w) => w.lexVer === RESTORED_LEX_VER)) return incoming;
  const enc = (s: V3State, id: string) => {
    const st = s.sim.strokes.find((x) => x.id === id);
    return st ? JSON.stringify([encodeRaw(capRaw(st.raw)).data, st.attach, st.drawnAtCoreScale, st.meshVersion]) : null;
  };
  const used = new Set<number>();
  let changed = false;
  const words = incoming.v3.words.map((w) => {
    if (w.lexVer !== RESTORED_LEX_VER) return w;
    const key = enc(incoming, w.strokeId);
    const j = local.v3.words.findIndex((lw, k) => !used.has(k) && lw.lexVer !== RESTORED_LEX_VER && lw.sense === w.sense && enc(local, lw.strokeId) === key);
    if (j < 0) return w;
    used.add(j);
    changed = true;
    const lw = local.v3.words[j]!;
    return { ...w, night: lw.night, intensity: lw.intensity, lexVer: lw.lexVer, source: lw.source };
  });
  return changed ? { ...incoming, v3: { ...incoming.v3, words } } : incoming;
}

/**
 * 이 기기 본을 incoming으로 바꿀 때(서버 본 고르기·parked 칸 맞바꾸기·되돌리기)의 결과 상태:
 * 말 기록 되붙이기 → 쌓이기만 하는 칸 모으기(current에서). current가 없으면 incoming 그대로.
 */
export function adoptV3(incoming: V3State, current: V3State | null): V3State {
  return stackV3(hydrateWordsV3(incoming, current), current);
}
