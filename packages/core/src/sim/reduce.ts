// MVP 시뮬레이션: createInitial · tick · reduce. 순수 함수, 시계는 인자(now)로만 받는다.
import { coreScale } from '../visual/bodySpec';
import { makeRecord } from '../visual/pose';
import { polylineLength } from '../geometry/simplify';
import { pickCard } from './dream';
import { LEDGER, emptyLedger, ledgerMeasures, measureStroke } from './ledger';
import {
  CHANNELS,
  bandOf,
  daySignals,
  deepenAxis,
  TEMPERAMENT,
  initTemperament,
  lineKind,
  settleTemperament,
  styleFor,
  topContributor,
  zeroAxes,
} from './temperament';
import { TIME, canPutToSleep, dryness, initialLastWake, nextTransition, resolveNow } from './time';
import { AXES, type AxisId, type AxisRecord, type Effect, type Event, type Measures, type MorningLine, type Millis, type Stage, type State, type Step } from './types';

export const SIM_SCHEMA_VERSION = 1;
/** 물로 씻기 허용 시간 */
export const WASH_WINDOW_MS = 5000;
/** MVP 끝 표식 = 7획 '이레' */
export const IRE_STROKES = 7;
/** 아침 결과 채널을 겹치지 않게 기억하는 날 수 */
const CHANNEL_MEMORY = 5;
const MAX_TRANSITIONS_PER_TICK = 64;

export interface InitialOptions {
  bedtimeLocalMin?: number;
  morningLocalMin?: number;
}

/** 설치 세션: 깨어 있고, 앱이 앞에 있다. lastWakeAt = min(설치, 직전 아침)(첫날 예외) */
export function createInitial(now: Millis, tzOffsetMin: number, seed: number, opts: InitialOptions = {}): State {
  const bedtime = opts.bedtimeLocalMin ?? TIME.bedtimeDefaultMin;
  const morning = opts.morningLocalMin ?? TIME.morningDefaultMin;
  return {
    schemaVersion: SIM_SCHEMA_VERSION,
    rng: seed | 0,
    createdAt: now,
    clock: { hwm: now, lastSimAt: now, tzOffsetMin, suspect: null },
    phase: 'awake',
    sleepAt: null,
    lastWakeAt: initialLastWake(now, morning, tzOffsetMin),
    backgroundSince: null,
    dayIndex: 0,
    bedtimeLocalMin: bedtime,
    morningLocalMin: morning,
    born: false,
    temperament: zeroAxes(),
    bornTemperament: zeroAxes(),
    habit: zeroAxes(),
    focusHistory: [],
    strokes: [],
    strokesTotal: 0,
    peakStrokes: 0,
    ledger: emptyLedger(),
    lastCareAt: now,
    pendingCard: null,
    pendingLine: null,
    cards: [],
    recentChannels: [],
    ire7LineShown: false,
  };
}

export function stageOf(strokesTotal: number): Stage {
  if (strokesTotal <= 0) return 'drop';
  if (strokesTotal === 1) return 'firstStroke';
  if (strokesTotal < IRE_STROKES) return 'young';
  return 'ire7';
}

// ── 아침 문장 ──────────────────────────────────────────────

function pickChannel(s: State, axis: AxisId): { channel: string; recent: string[] } {
  const chs = CHANNELS[axis];
  const recent = s.recentChannels;
  const ch = chs.find((c) => !recent.includes(`${axis}.${c}`)) ?? chs[0]!;
  return { channel: ch, recent: [...recent, `${axis}.${ch}`].slice(-CHANNEL_MEMORY) };
}

function causeKey(m: Measures, axis: AxisId): string {
  const c = topContributor(m, axis);
  return c ? `cause.${c.measure}.${c.sign > 0 ? 'plus' : 'minus'}` : 'cause.none';
}

const dirOf = (x: number) => (x >= 0 ? 'plus' : 'minus');

// ── 전이: 잠들기·깨기 ──────────────────────────────────────

/** 잠들기 = 밤 정산. 입력이 없던 날은 축·습관을 움직이지 않는다 */
function doSleep(s: State, at: Millis, effects: Effect[]): State {
  let next: State = { ...s, phase: 'asleep', sleepAt: at };
  effects.push({ type: 'slept', at });
  if (s.ledger.inputs === 0) return next;
  const m = ledgerMeasures(s.ledger);
  const sg = daySignals(m);
  let v: AxisRecord;
  let line: MorningLine;
  if (!s.born) {
    const init = initTemperament(sg);
    v = init.v;
    next = { ...next, born: true, temperament: v, bornTemperament: v, habit: init.h };
    // 타고난 결: 가장 크게 정해진 축을 '변화'로 말한다(focusHistory에는 넣지 않음 — 스크립트와 같게)
    let axis: AxisId | null = null;
    let best: number = TEMPERAMENT.CHANGE_MIN - Number.EPSILON; // 거짓 인과 금지: 변화 문턱 미만이면 관찰
    for (const k of AXES) {
      if (Math.abs(v[k]) > best) {
        best = Math.abs(v[k]);
        axis = k;
      }
    }
    if (axis) {
      const ch = pickChannel(next, axis);
      line = { kind: 'change', axis, keys: [causeKey(m, axis), `effect.${axis}.${dirOf(v[axis])}.${ch.channel}`] };
      next = { ...next, recentChannels: ch.recent };
    } else line = { kind: 'observation', axis: null, keys: [] };
  } else {
    const res = settleTemperament(s.temperament, s.habit, sg, s.focusHistory);
    v = res.next;
    next = { ...next, temperament: v, habit: res.habit, focusHistory: [...s.focusHistory, res.focus] };
    const kind = lineKind(res, sg);
    if (kind === 'change' && res.focus) {
      const ch = pickChannel(next, res.focus);
      line = { kind, axis: res.focus, keys: [causeKey(m, res.focus), `effect.${res.focus}.${dirOf(res.delta)}.${ch.channel}`] };
      next = { ...next, recentChannels: ch.recent };
    } else if (kind === 'deepen') {
      const axis = deepenAxis(v, sg)!;
      const ch = pickChannel(next, axis);
      line = { kind, axis, keys: [causeKey(m, axis), `deepen.${axis}.${dirOf(v[axis])}.${ch.channel}`] };
      next = { ...next, recentChannels: ch.recent };
    } else line = { kind: 'observation', axis: null, keys: [] };
  }
  for (const k of AXES) {
    const b0 = bandOf(s.temperament[k]);
    const b1 = bandOf(v[k]);
    if (b0 !== b1) effects.push({ type: 'bandEntered', axis: k, band: b1 });
  }
  return { ...next, pendingLine: line };
}

/** 깸: 하루 +1, 획 충전(이월 없음), 꿈 카드(밀린 밤은 한 장으로 합침) */
function doWake(s: State, at: Millis, effects: Effect[]): State {
  const dayIndex = s.dayIndex + 1;
  const todays = s.strokes.filter((x) => x.day === s.dayIndex);
  const strokeRef = todays.length > 0 ? todays[todays.length - 1]!.id : null;
  const used = [...s.cards, ...(s.pendingCard ? [s.pendingCard] : [])];
  const picked = pickCard(s.temperament, used, s.rng, dayIndex, strokeRef ?? s.pendingCard?.strokeRef ?? null);
  const card = s.pendingCard ? { ...picked.card, nightsMerged: s.pendingCard.nightsMerged + 1 } : picked.card;
  effects.push({ type: 'woke', at, dayIndex });
  effects.push({ type: 'cardReady', card });
  return {
    ...s,
    phase: 'awake',
    sleepAt: null,
    lastWakeAt: at,
    dayIndex,
    ledger: emptyLedger(),
    rng: picked.rng,
    pendingCard: card,
  };
}

/** 아침 문장 확정(현상할 때): 이레 문장 > 밤 정산 문장 > 꿈 관찰 */
function finalLine(s: State): { line: MorningLine; ire7: boolean } {
  if (!s.ire7LineShown && s.strokesTotal >= IRE_STROKES) {
    const moved = [...AXES].sort((a, b) => Math.abs(s.temperament[b] - s.bornTemperament[b]) - Math.abs(s.temperament[a] - s.bornTemperament[a]));
    const keys = moved.slice(0, 2).map((k) => `ire7.${k}.${dirOf(s.temperament[k] - s.bornTemperament[k])}`);
    return { line: { kind: 'seven-day', axis: moved[0]!, keys: [...keys, 'ire7.firstStroke'] }, ire7: true };
  }
  const l = s.pendingLine;
  if (l && l.kind !== 'observation') return { line: l, ire7: false };
  return { line: { kind: 'observation', axis: null, keys: [`obs.dream.${s.pendingCard?.motifId ?? 'none'}`] }, ire7: false };
}

// ── 시간 전진 ─────────────────────────────────────────────

/** 전이를 정확한 시각에 차례로 적용(지난 전이는 커서 시각에). 그래서 잘게 나눠 돌려도 결과가 같다 */
function advance(s: State, to: Millis, effects: Effect[]): State {
  let st = s;
  for (let i = 0; i < MAX_TRANSITIONS_PER_TICK; i++) {
    const tr = nextTransition(st);
    if (!tr || tr.at > to) break;
    const at = Math.max(tr.at, st.clock.lastSimAt);
    st = { ...st, clock: { ...st.clock, lastSimAt: at } };
    st = tr.kind === 'sleep' ? doSleep(st, at, effects) : doWake(st, at, effects);
  }
  return { ...st, clock: { ...st.clock, lastSimAt: Math.max(st.clock.lastSimAt, to) } };
}

/**
 * 시간 정산. 역행이면 경과 0(hwm 유지). 72h를 넘으면 **마지막 72h만** 산다:
 * 그 앞에 밀린 전이는 구간 시작 시각에 한 번 일어나고, 그 뒤로는 실제 현지 시각에 맞춰 돈다(복귀 순간의 상태가 자연스럽다).
 */
export function tick(s: State, now: Millis): Step {
  const effects: Effect[] = [];
  const r = resolveNow(s.clock, now);
  if (r.suspect) effects.push({ type: 'clockSuspect', kind: r.suspect });
  let st: State = { ...s, clock: { ...s.clock, suspect: r.suspect } };
  if (r.suspect === 'reset') return { state: rebase(st, r.simNow), effects };
  if (r.elapsedMs <= 0) return { state: st, effects };
  if (r.capped) st = { ...st, clock: { ...st.clock, lastSimAt: r.simNow - TIME.offlineCapMs } };
  st = advance(st, r.simNow, effects);
  st = { ...st, clock: { ...st.clock, lastSimAt: r.simNow, hwm: Math.max(st.clock.hwm, r.simNow) } };
  return { state: st, effects };
}

/**
 * 시계 보정(12h 넘는 역행, D-03 우선): 몽망이의 시간을 통째로 지금으로 옮긴다. 경과 0, 잠금 없음.
 * 살아 있는 시각(잠든·깬·돌봄·백그라운드·마지막 획)을 같은 폭만큼 당겨서, 앞당겼던 시계 때문에 몇 달 자는 일이 없다.
 */
function rebase(s: State, now: Millis): State {
  const d = now - s.clock.hwm;
  const sh = (t: Millis | null) => (t === null ? null : t + d);
  return {
    ...s,
    clock: { ...s.clock, hwm: now, lastSimAt: now },
    sleepAt: sh(s.sleepAt),
    lastWakeAt: s.lastWakeAt + d,
    lastCareAt: s.lastCareAt + d,
    backgroundSince: sh(s.backgroundSince),
    ledger: { ...s.ledger, lastStrokeAt: sh(s.ledger.lastStrokeAt) },
  };
}

// ── 이벤트 ───────────────────────────────────────────────

/** 돌봄 손길: 마른 뒤 첫 터치면 연적에서 물 한 방울(그 터치의 원래 행동도 그대로 실행) */
function care(s: State, at: Millis, effects: Effect[]): State {
  if (dryness(s, at) > 0) effects.push({ type: 'rehydrated' });
  return { ...s, lastCareAt: at };
}

/** 지금 붓을 들 수 있는가(화면이 긋기 모드에 들어가기 전에 묻는 선택자). null = 그을 수 있음 */
export function strokeBlock(s: State): 'used' | 'asleep' | null {
  if (s.phase === 'asleep') return 'asleep';
  if (s.ledger.strokeUsed) return 'used';
  return null;
}

/** 오늘 간 먹 농도 0..1(벼루 먹물 표시, 획의 grind) */
export function grindLevel(s: State): number {
  return Math.min(1, s.ledger.grindMs / LEDGER.grindFullMs);
}

function applyStroke(s: State, e: Extract<Event, { type: 'stroke' }>, at: Millis, effects: Effect[]): State {
  const block = strokeBlock(s);
  if (block) {
    effects.push({ type: 'strokeRejected', reason: block });
    return s;
  }
  if (e.raw.length < 2 || polylineLength(e.raw) < LEDGER.minStrokeLenW) {
    effects.push({ type: 'strokeRejected', reason: 'tooShort' });
    return s;
  }
  const n = s.strokesTotal;
  const rec = makeRecord(e.raw, n, e.level ?? 2);
  const measure = measureStroke(rec.raw, rec.attach, coreScale(n), s.strokes);
  const id = `s${s.dayIndex}-${at}`;
  const stroke = {
    ...rec,
    id,
    day: s.dayIndex,
    createdAt: at,
    grind: grindLevel(s),
    style: styleFor(s.temperament),
    pinned: n === 0 ? ('first' as const) : null,
  };
  effects.push({ type: 'strokeAccepted', strokeId: id });
  // 씻었다가 다시 그어도 이미 도달한 단계는 다시 내지 않는다
  if (n + 1 > s.peakStrokes && stageOf(n + 1) !== stageOf(s.peakStrokes)) effects.push({ type: 'stageReached', stage: stageOf(n + 1) });
  return {
    ...s,
    strokes: [...s.strokes, stroke],
    strokesTotal: n + 1,
    peakStrokes: Math.max(s.peakStrokes, n + 1),
    ledger: { ...s.ledger, stroke: measure, strokeUsed: true, lastStrokeAt: at, inputs: s.ledger.inputs + 1 },
  };
}

function applyWash(s: State, at: Millis, effects: Effect[]): State {
  const l = s.ledger;
  if (s.phase !== 'awake' || l.washUsed || l.lastStrokeAt === null || at - l.lastStrokeAt > WASH_WINDOW_MS) return s;
  const last = s.strokes[s.strokes.length - 1];
  if (!last || last.createdAt !== l.lastStrokeAt) return s;
  effects.push({ type: 'strokeWashed', strokeId: last.id });
  return {
    ...s,
    strokes: s.strokes.slice(0, -1),
    strokesTotal: s.strokesTotal - 1,
    ledger: { ...l, stroke: null, strokeUsed: false, washUsed: true, lastStrokeAt: null, inputs: Math.max(0, l.inputs - 1) },
  };
}

function applyTap(s: State, e: Extract<Event, { type: 'tap' }>): State {
  if (s.phase === 'asleep') return s; // 수면을 건드리면 잔물결만
  const l = s.ledger;
  const taps = [...l.taps, { x: e.x, y: e.y }].slice(-LEDGER.maxTaps);
  if (e.target === 'body' && e.holdMs >= LEDGER.holdMinMs) {
    const hold = e.holdMs;
    return { ...s, ledger: { ...l, taps, holdMs: l.holdMs + hold, holdMoveMs: l.holdMoveMs + (e.moveSpeed ?? 0) * hold, inputs: l.inputs + 1 } };
  }
  return { ...s, ledger: { ...l, taps, petCount: l.petCount + (e.target === 'body' ? 1 : 0), inputs: l.inputs + 1 } };
}

/** 이벤트 하나. 먼저 그 시각까지 tick 한 뒤 적용한다(역행이면 hwm 시각에 일어난 것으로 본다) */
export function reduce(state: State, e: Event): Step {
  const t = tick(state, e.at);
  const effects = t.effects;
  let s = t.state;
  const at = s.clock.lastSimAt;
  switch (e.type) {
    case 'stroke':
      s = applyStroke(care(s, at, effects), e, at, effects);
      break;
    case 'washStroke':
      s = applyWash(s, at, effects);
      break;
    case 'grind':
      s = care(s, at, effects);
      if (s.phase === 'awake' && e.durationMs > 0) s = { ...s, ledger: { ...s.ledger, grindMs: s.ledger.grindMs + e.durationMs, inputs: s.ledger.inputs + 1 } };
      break;
    case 'tap':
      s = applyTap(care(s, at, effects), e);
      break;
    case 'putToSleep':
      if (canPutToSleep(s, at)) s = doSleep(care(s, at, effects), at, effects);
      else if (s.phase === 'awake') effects.push({ type: 'notSleepy' });
      break;
    case 'developCard': {
      if (s.phase !== 'awake' || !s.pendingCard) break;
      s = care(s, at, effects);
      const { line, ire7 } = finalLine(s);
      effects.push({ type: 'cardDeveloped', card: s.pendingCard!, line });
      s = { ...s, cards: [...s.cards, s.pendingCard!], pendingCard: null, pendingLine: null, ire7LineShown: s.ire7LineShown || ire7 };
      break;
    }
    case 'setTimes': {
      const ok = (m: number) => Number.isInteger(m) && m >= 0 && m < 1440;
      if (!ok(e.bedtimeLocalMin) || !ok(e.morningLocalMin)) break;
      s = { ...s, bedtimeLocalMin: e.bedtimeLocalMin, morningLocalMin: e.morningLocalMin };
      // 첫날(해질녘에 묻는 자리)에 바꾸면 첫날 예외를 새 아침 시각 기준으로 다시 잡는다(야간 근무자의 첫날)
      if (s.dayIndex === 0 && s.phase === 'awake') s = { ...s, lastWakeAt: initialLastWake(s.createdAt, e.morningLocalMin, s.clock.tzOffsetMin) };
      break;
    }
    case 'appForeground':
      s = { ...s, backgroundSince: null, clock: { ...s.clock, tzOffsetMin: e.tzOffsetMin } };
      break;
    case 'appBackground':
      if (s.backgroundSince === null) s = advance({ ...s, backgroundSince: at }, at, effects);
      break;
  }
  return { state: s, effects };
}
