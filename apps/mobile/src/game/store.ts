// 게임 상태 저장소: 모든 상태 변화는 core sim의 reduce/tick을 거친다(앱은 규칙을 갖지 않는다).
// 앱이 더하는 것은 ① 시각(now, 개발 메뉴 시간 가속 오프셋) ② 저장(MMKV 슬롯) ③ 효과(effects) 구독자에게 나눠 주기 ④ 앱 메타(설정).
// 설치됨 = 세이브가 있음, 하나로만 판정한다(메타 플래그와 이원화하지 않음, 리뷰 C7).
// 저장소 예외는 던지지 않는다: 쓰기 실패면 saveError만 세우고 메모리 상태로 계속 간다(리뷰 C4).
import { readSave, sim, writeSave, clearSave, type KV } from '@mong/core';
import { useSyncExternalStore } from 'react';
import { DEFAULT_SOUND_SETTINGS, type SoundSettings } from '../audio/soundMap';
import { kv as defaultKV } from './storage';

type State = sim.State;
type Effect = sim.Effect;
type Event = sim.Event;
/** at을 뺀 이벤트(시각은 저장소가 붙인다) */
export type EventInput = Event extends infer E ? (E extends { at: number } ? Omit<E, 'at'> : never) : never;

/** 앱 메타(게임 규칙 아님): 설정, 개발용 시간 오프셋. 깨져도 기본값으로 떨어질 뿐 몽망이에는 영향이 없다 */
export interface Meta {
  v: 1;
  /** 알림 사전 문구를 이미 보였는가(첫 재우기 뒤 한 번) */
  notifAsked: boolean;
  notifEnabled: boolean;
  sound: SoundSettings;
  /** 접근성: 사물 UI를 평범한 버튼 목록으로(D-08) */
  listView: boolean;
  /** 접근성: 획을 버튼으로 긋기(스크린리더가 켜져 있으면 자동) */
  assistStroke: boolean;
  /** 첫 밤 안심 문구를 보였는가(systems 3.7, 한 번) */
  firstNightShown: boolean;
  /** 개발 메뉴: 소리·햅틱 타이밍 자막(기본 끔) */
  devCaptions: boolean;
  /** 개발 메뉴 시간 가속(ms). 늘기만 한다(되돌리면 sim이 역행으로 본다) */
  devOffsetMs: number;
}

export const HOUR_MS = 3_600_000;
const META_KEY = 'mong.meta';
export const DEFAULT_META: Meta = {
  v: 1,
  notifAsked: false,
  notifEnabled: true,
  sound: DEFAULT_SOUND_SETTINGS,
  listView: false,
  assistStroke: false,
  firstNightShown: false,
  devCaptions: false,
  devOffsetMs: 0,
};

export interface Snapshot {
  state: State | null;
  meta: Meta;
  /** 복원 경로(디버그·리포트용) */
  restoredFrom: 'main' | 'backup' | 'none' | 'fresh';
  /** 세이브가 있었는데 본·백업 모두 못 읽음(복구 안내) */
  lostSave: boolean;
  saveError: string | null;
}

let kv: KV = defaultKV;
let clockFn: () => number = () => Date.now();
let snap: Snapshot = { state: null, meta: DEFAULT_META, restoredFrom: 'none', lostSave: false, saveError: null };
const subs = new Set<() => void>();
type EffectFn = (effects: Effect[], ev: Event | null, state: State) => void;
const effectSubs = new Set<EffectFn>();

/** 테스트: 저장소·시계 바꿔 끼우기 + 상태 초기화 */
export function __configureForTest(opts: { kv: KV; now?: () => number }) {
  kv = opts.kv;
  clockFn = opts.now ?? (() => Date.now());
  snap = { state: null, meta: DEFAULT_META, restoredFrom: 'none', lostSave: false, saveError: null };
  effectSubs.clear();
}

function emit(next: Partial<Snapshot>) {
  snap = { ...snap, ...next };
  subs.forEach((f) => f());
}

export function now(): number {
  return clockFn() + snap.meta.devOffsetMs;
}
/** sim은 동쪽 + 분(서울 540). JS getTimezoneOffset은 반대 부호 */
export function tzOffsetNow(): number {
  return -new Date(now()).getTimezoneOffset();
}

function loadMeta(): Meta {
  try {
    const raw = kv.getString(META_KEY);
    if (!raw) return DEFAULT_META;
    const m = JSON.parse(raw) as Partial<Meta>;
    return { ...DEFAULT_META, ...m, sound: { ...DEFAULT_SOUND_SETTINGS, ...(m.sound ?? {}) } };
  } catch {
    return DEFAULT_META;
  }
}

export function setMeta(patch: Partial<Meta>) {
  const meta = { ...snap.meta, ...patch };
  try {
    kv.set(META_KEY, JSON.stringify(meta));
  } catch (e) {
    console.warn('[meta] 쓰기 실패, 메모리로 계속:', e);
  }
  emit({ meta });
}

function persist(state: State, rotateBackup: boolean) {
  const r = writeSave(kv, state, now(), { rotateBackup });
  if (!r.ok) {
    // 검증·저장소 실패: 본·백업은 그대로 둔다. 화면은 계속 메모리 상태로 돈다
    console.warn('[save] 쓰지 못함:', r.error);
    emit({ saveError: r.error });
  } else if (snap.saveError) emit({ saveError: null });
}

function apply(step: sim.Step, ev: Event | null, save: boolean) {
  emit({ state: step.state });
  // 백업 = 어제의 몽망이: 깬 직후(이번 걸음에 woke가 있으면) 직전 본을 백업으로 민다
  if (save) persist(step.state, step.effects.some((e) => e.type === 'woke'));
  if (step.effects.length > 0) effectSubs.forEach((f) => f(step.effects, ev, step.state));
}

/** 콜드 스타트: 메타·세이브 복원 → 있으면 appForeground(그 시각까지 정산). 없으면 state=null(설치 전 = 인트로) */
export function boot() {
  const meta = loadMeta();
  snap = { ...snap, meta };
  const r = readSave(kv);
  if (r.error) console.warn('[save] 본 세이브 손상 → ', r.source, r.error);
  if (!r.state) {
    emit({ state: null, restoredFrom: r.source, lostSave: r.hadSave });
    return;
  }
  emit({ restoredFrom: r.source, lostSave: false });
  apply(sim.reduce(r.state, { type: 'appForeground', at: now(), tzOffsetMin: tzOffsetNow() }), null, true);
}

/** 설치(첫 탭 순간). 깨어 있고 앱이 앞에 있다 */
export function install() {
  const seed = (Math.random() * 0x7fffffff) | 0;
  const state = sim.createInitial(now(), tzOffsetNow(), seed);
  emit({ state, restoredFrom: 'fresh', lostSave: false });
  persist(state, false);
}

export function dispatch(input: EventInput): Effect[] {
  const s = snap.state;
  if (!s) return [];
  const ev = { ...input, at: now() } as Event;
  const step = sim.reduce(s, ev);
  apply(step, ev, true);
  return step.effects;
}

/** 앞에 있는 동안의 주기 정산(깸 등). 효과가 있을 때만 저장 */
export function tickNow(): Effect[] {
  const s = snap.state;
  if (!s) return [];
  const step = sim.tick(s, now());
  apply(step, null, step.effects.length > 0);
  return step.effects;
}

/** 백그라운드: sim에 알린 **뒤에** 저장한다(sim-impl 리뷰 1-2) */
export function goBackground() {
  dispatch({ type: 'appBackground' });
}
export function goForeground() {
  dispatch({ type: 'appForeground', tzOffsetMin: tzOffsetNow() });
}

export function onEffects(fn: EffectFn): () => void {
  effectSubs.add(fn);
  return () => effectSubs.delete(fn);
}

export function getSnapshot(): Snapshot {
  return snap;
}
function subscribe(f: () => void) {
  subs.add(f);
  return () => subs.delete(f);
}
export function useGame(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ── 개발 메뉴 ─────────────────────────────────────────────

/** 시계를 앞으로 ms만큼(오프셋 증가) → sim.tick */
export function devAdvance(ms: number) {
  setMeta({ devOffsetMs: snap.meta.devOffsetMs + ms });
  tickNow();
}

/**
 * 다음 아침까지: 앱을 닫은 것으로 보고(appBackground) sim의 다음 전이 시각으로 차례로 뛰어 깸이 나올 때까지.
 * 규칙은 sim의 nextTransition이 정한다(앱이 시각을 계산하지 않는다).
 */
export function devNextMorning() {
  if (!snap.state) return;
  if (snap.state.backgroundSince === null) goBackground();
  for (let i = 0; i < 6; i++) {
    const s = snap.state!;
    const tr = sim.nextTransition(s);
    if (!tr) break;
    const jump = Math.max(0, tr.at - now()) + 60_000;
    setMeta({ devOffsetMs: snap.meta.devOffsetMs + jump });
    const eff = tickNow();
    if (eff.some((e) => e.type === 'woke')) break;
  }
  goForeground();
}

/** 세이브·메타 초기화 → 설치 전(인트로부터, 설치는 다시 첫 탭에) */
export function devReset() {
  clearSave(kv);
  try {
    kv.remove(META_KEY);
  } catch {
    /* 무시 */
  }
  emit({ state: null, meta: DEFAULT_META, restoredFrom: 'none', lostSave: false, saveError: null });
}
