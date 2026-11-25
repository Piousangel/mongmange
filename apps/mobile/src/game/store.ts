// 게임 상태 저장소: 모든 상태 변화는 core sim의 reduce/tick을 거친다(앱은 규칙을 갖지 않는다).
// 앱이 더하는 것은 ① 시각(now, 개발 메뉴 시간 가속 오프셋) ② 저장(MMKV 슬롯) ③ 효과(effects) 구독자에게 나눠 주기 ④ 앱 메타(설정).
// 설치됨 = 세이브가 있음, 하나로만 판정한다(메타 플래그와 이원화하지 않음, 리뷰 C7).
// 저장소 예외는 던지지 않는다: 쓰기 실패면 saveError만 세우고 메모리 상태로 계속 간다(리뷰 C4).
import { readSave, sim, v3, writeSave, clearSave, type KV } from '@mong/core';
import { useSyncExternalStore } from 'react';
import { DEFAULT_SOUND_SETTINGS, type SoundSettings } from '../audio/soundMap';
import { setLanguagePref, type LanguagePref } from '../i18n';
import { kv as defaultKV } from './storage';
import { entropy32 } from './entropy';
import { ensureNameTimingGroup } from './abGroup';
import { isOn } from '../features';

type State = sim.State;
/** v3 효과는 sim 효과의 상위 집합(새 컨셉이 꺼져 있으면 sim 효과만 온다) */
type Effect = v3.V3Effect;
type Event = v3.V3Event;
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
  /** 공방 노트 언어 고르기(D-17): 기기 따름 / 한국어 / English */
  lang: LanguagePref;
  /** 개발 메뉴 시간 가속(ms). 늘기만 한다(되돌리면 sim이 역행으로 본다) */
  devOffsetMs: number;
  /** 평점 요청(이레 아침 1회)을 이미 했는가. 거절·실패해도 true — 다시 묻지 않는다(D-18 ⑤) */
  reviewAsked: boolean;
  /**
   * M2 이름 공개(architecture 3-5-2 `nameVisible`, 기본 끔). 공유물(꿈 카드 PNG·이레 영상·공개 스냅숏)에 이름을 싣는 유일한 스위치.
   * 켜는 화면은 C11(링크 켜기·이름도 보이기) 몫 — 지금은 늘 끔이라 공유물에 이름이 실리지 않는다
   */
  nameVisible: boolean;
  /** M2 이름 짓기 창을 저절로 연 기록(core namePromptDue) */
  nameAsk: sim.NameAskLog;
  /** '이름을 눌러 불러 보세요' 한 번 안내를 보였는가 */
  callHintShown: boolean;
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
  lang: 'system',
  devOffsetMs: 0,
  reviewAsked: false,
  nameVisible: false,
  nameAsk: sim.EMPTY_NAME_ASK,
  callHintShown: false,
};

export interface Snapshot {
  state: State | null;
  /**
   * 새 컨셉 v3 블록(플래그 conceptV3로 부팅했을 때만). 있으면 세이브는 v3 키에 쓰고 이벤트는 core v3.reduceV3를 거친다.
   * sim 상태(state)는 그대로 두어 기존 화면(밤·아침 카드·획)이 같은 값을 읽는다
   */
  v3: v3.V3Block | null;
  meta: Meta;
  /** 복원 경로(디버그·리포트용) */
  restoredFrom: 'main' | 'backup' | 'none' | 'fresh';
  /** 세이브가 있었는데 본·백업 모두 못 읽음(복구 안내) */
  lostSave: boolean;
  /** 본이 이 앱보다 새 버전(옛 빌드로 내려감) → '업데이트해 주세요' 화면, 설치·저장 안 함 */
  futureSave: boolean;
  saveError: string | null;
}

let kv: KV = defaultKV;
let clockFn: () => number = () => Date.now();
let snap: Snapshot = { state: null, v3: null, meta: DEFAULT_META, restoredFrom: 'none', lostSave: false, futureSave: false, saveError: null };
/** 부팅 때 정한 모드(새 컨셉 v3로 도는가). 바꾸려면 다시 부팅(개발 메뉴) */
let v3Mode = false;
export function isV3Mode(): boolean {
  return v3Mode;
}
const full = (): v3.V3State | null => (snap.state && snap.v3 ? { sim: snap.state, v3: snap.v3 } : null);
const subs = new Set<() => void>();
type EffectFn = (effects: Effect[], ev: Event | null, state: State) => void;
const effectSubs = new Set<EffectFn>();

/** 테스트: 저장소·시계 바꿔 끼우기 + 상태 초기화 */
export function __configureForTest(opts: { kv: KV; now?: () => number }) {
  kv = opts.kv;
  clockFn = opts.now ?? (() => Date.now());
  snap = { state: null, v3: null, meta: DEFAULT_META, restoredFrom: 'none', lostSave: false, futureSave: false, saveError: null };
  v3Mode = false;
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
    const lang: LanguagePref = m.lang === 'ko' || m.lang === 'en' ? m.lang : 'system';
    const ask = m.nameAsk;
    const nameAsk = ask && Number.isInteger(ask.count) && Number.isInteger(ask.lastDay) ? { count: ask.count, lastDay: ask.lastDay } : sim.EMPTY_NAME_ASK;
    return { ...DEFAULT_META, ...m, lang, nameAsk, nameVisible: m.nameVisible === true, sound: { ...DEFAULT_SOUND_SETTINGS, ...(m.sound ?? {}) } };
  } catch {
    return DEFAULT_META;
  }
}

export function setMeta(patch: Partial<Meta>) {
  const meta = { ...snap.meta, ...patch };
  if (patch.lang !== undefined) setLanguagePref(meta.lang);
  try {
    kv.set(META_KEY, JSON.stringify(meta));
  } catch (e) {
    console.warn('[meta] 쓰기 실패, 메모리로 계속:', e);
  }
  emit({ meta });
}

function persist(state: State, rotateBackup: boolean, block: v3.V3Block | null = snap.v3) {
  const r = v3Mode && block ? v3.writeSaveV3(kv, { sim: state, v3: block }, now(), { rotateBackup }) : writeSave(kv, state, now(), { rotateBackup });
  if (!r.ok) {
    // 검증·저장소 실패: 본·백업은 그대로 둔다. 화면은 계속 메모리 상태로 돈다
    console.warn('[save] 쓰지 못함:', r.error);
    emit({ saveError: r.error });
  } else if (snap.saveError) emit({ saveError: null });
}

function apply(step: { state: State; effects: Effect[] }, ev: Event | null, save: boolean, block: v3.V3Block | null = snap.v3) {
  emit({ state: step.state, v3: block });
  // 백업 = 어제의 몽망이: 깬 직후(이번 걸음에 woke가 있으면) 직전 본을 백업으로 민다
  if (save) persist(step.state, step.effects.some((e) => e.type === 'woke'), block);
  if (step.effects.length > 0) effectSubs.forEach((f) => f(step.effects, ev, step.state));
}
function applyV3(step: v3.V3Step, ev: Event | null, save: boolean) {
  apply({ state: step.state.sim, effects: step.effects }, ev, save, step.state.v3);
}

/** 콜드 스타트: 메타·세이브 복원 → 있으면 appForeground(그 시각까지 정산). 없으면 state=null(설치 전 = 인트로) */
export function boot() {
  const meta = loadMeta();
  setLanguagePref(meta.lang);
  snap = { ...snap, meta, v3: null };
  v3Mode = isOn('conceptV3');
  if (v3Mode) {
    bootV3();
    return;
  }
  const r = readSave(kv);
  if (r.error) console.warn('[save] 본 세이브 손상 → ', r.source, r.error);
  if (r.futureVersion) {
    emit({ state: null, restoredFrom: 'none', lostSave: false, futureSave: true });
    return;
  }
  if (!r.state) {
    emit({ state: null, restoredFrom: r.source, lostSave: r.hadSave });
    return;
  }
  emit({ restoredFrom: r.source, lostSave: false });
  ensureNameTimingGroup(kv); // 빌드 1에서 설치한 기기(군이 아직 없음) — 이름 A/B 군(B0 리뷰 I7)
  apply(sim.reduce(r.state, { type: 'appForeground', at: now(), tzOffsetMin: tzOffsetNow(), ...nightFields() }), null, true);
}

/** 새 컨셉 v3 부팅: v3 키만 읽는다. 옛 세이브(v2)는 읽지 않고(1일차부터) 보관 키에 한 번 복사해 둔다(core readSaveV3) */
function bootV3() {
  const r = v3.readSaveV3(kv);
  if (r.error) console.warn('[save v3] 본 세이브 손상 → ', r.source, r.error);
  if (r.futureVersion) {
    emit({ state: null, v3: null, restoredFrom: 'none', lostSave: false, futureSave: true });
    return;
  }
  if (!r.state) {
    emit({ state: null, v3: null, restoredFrom: r.source, lostSave: r.hadSave, futureSave: false });
    return;
  }
  emit({ restoredFrom: r.source, lostSave: false, futureSave: false });
  const step = v3.reduceV3(r.state, { type: 'appForeground', at: now(), tzOffsetMin: tzOffsetNow(), ...nightFields() });
  // 콜드 스타트의 반김(M4)은 화면이 효과를 듣기 전에 난다 — 한 번 꺼내 쓰도록 남겨 둔다(takeBootGreeting)
  bootGreeting = step.effects.filter((e) => e.type === 'greeted' || e.type === 'jeongSignal');
  applyV3(step, null, true);
}

let bootGreeting: Effect[] = [];
/** 콜드 스타트 때 난 반김·정 신호(한 번만 돌려주고 비운다). 화면이 효과 구독을 건 직후 부른다 */
export function takeBootGreeting(): Effect[] {
  const out = bootGreeting;
  bootGreeting = [];
  return out;
}

/** 설치(첫 탭 순간). 깨어 있고 앱이 앞에 있다. 첫 탭 좌표(W, 핵 원점)는 타고남 씨앗 재료(C-integrated 2-1) */
export function install(firstTap?: { x: number; y: number }) {
  // 새 버전 세이브가 있는 옛 빌드에서는 설치하지 않는다(본을 덮어쓰지 않음, 리뷰 M-5)
  if (snap.futureSave) return;
  const seed = (Math.random() * 0x7fffffff) | 0;
  const at = now();
  const birth: sim.BirthInput = { x: firstTap?.x ?? 0, y: firstTap?.y ?? 0, ms: at, installAt: at, entropy: entropy32().value };
  const state = sim.createInitial(at, tzOffsetNow(), seed, { birth });
  ensureNameTimingGroup(kv); // 설치 순간 이름 A/B 군을 정한다(통계 켜짐과 무관, B0 리뷰 I7)
  const block = v3Mode ? v3.emptyV3Block(state.birth.seed) : null; // 씨앗 = 좋아하는 것 예외(V9b T-2)로 처음 공방이 갈린다
  emit({ state, v3: block, restoredFrom: 'fresh', lostSave: false });
  persist(state, false, block);
}

/**
 * 맡겨 두기 복원(C12, architecture 3-4 '복원'): 서버 본으로 이어 간다. 지금 기기 본은 백업으로 민 뒤(rotateBackup) 새 본을 쓰고,
 * 그 시각까지 정산해 홈을 다시 그린다. 새 버전 세이브가 있는 옛 빌드·쓰기 실패면 false(기기 본 그대로).
 * 호출 전 기기 본 원문 보존(PRE_RESTORE_KEY)과 서버 conflict 칸 업로드는 cloud/tasks.ts가 먼저 끝낸다.
 */
export function adoptState(state: State): boolean {
  // 새 컨셉(v3)으로 도는 동안 옛 세이브(v2) 키는 보관만 한다 — v3 본은 adoptStateV3로(V27b)
  if (snap.futureSave || v3Mode) return false;
  const r = writeSave(kv, state, now(), { rotateBackup: true });
  if (!r.ok) return false;
  // 정산 저장은 백업을 다시 밀지 않는다: 이 정산에서 깸이 나도(밤 사이 맡긴 본) 백업 칸 = 바꾸기 전 기기 본 그대로(리뷰 H1)
  const step = sim.reduce(state, { type: 'appForeground', at: now(), tzOffsetMin: tzOffsetNow(), ...nightFields() });
  apply(step, null, false);
  persist(step.state, false);
  return true;
}

/**
 * 맡겨 두기 v3 복원(V27b): 새 컨셉으로 도는 기기에서만. 받은 상태(병합은 cloud/localSave.ts — core adoptV3·stackV3)를 v3 키에 쓰고
 * (지금 본은 백업으로 민다) 그 시각까지 정산해 홈을 다시 그린다. 옛 세이브(v2) 키는 건드리지 않는다. 새 버전 세이브·쓰기 실패면 false.
 */
export function adoptStateV3(st: v3.V3State): boolean {
  if (snap.futureSave || !v3Mode) return false;
  const r = v3.writeSaveV3(kv, st, now(), { rotateBackup: true });
  if (!r.ok) return false;
  const step = v3.reduceV3(st, { type: 'appForeground', at: now(), tzOffsetMin: tzOffsetNow(), ...nightFields() });
  applyV3(step, null, false);
  persist(step.state.sim, false, step.state.v3);
  return true;
}

/**
 * 보름·꿈 콘텐츠 플래그 → sim 이벤트 선택 필드(dreams-30days 4-1 ③). 플래그는 State 밖 값이라 reduce가 직접 읽지 않고
 * 재우기·포그라운드 이벤트에 실려 State `nightCtx`에 기록된다(같은 이벤트 열 = 같은 카드). **꺼진 플래그는 필드를 싣지 않는다** —
 * 둘 다 꺼짐이면 이벤트가 빌드 1과 글자까지 같다.
 */
export function nightFields(): { moon?: sim.MoonContext; dream?: sim.DreamContext } {
  const dev = typeof __DEV__ !== 'undefined' && __DEV__ === true;
  const out: { moon?: sim.MoonContext; dream?: sim.DreamContext } = {};
  if (isOn('moonNight')) out.moon = dev ? { enabled: true, dev } : { enabled: true };
  if (isOn('dreamContent')) out.dream = dev ? { enabled: true, dev } : { enabled: true };
  return out;
}

export function dispatch(input: EventInput): Effect[] {
  const s = snap.state;
  if (!s) return [];
  const night = input.type === 'putToSleep' || input.type === 'appForeground' ? nightFields() : {};
  const ev = { ...input, ...night, at: now() } as Event;
  const f = full();
  if (v3Mode && f) {
    const step = v3.reduceV3(f, ev);
    applyV3(step, ev, true);
    return step.effects;
  }
  if (ev.type === 'write' || ev.type === 'offer' || ev.type === 'mealNudge' || ev.type === 'call' || ev.type === 'jeongCaption') return [];
  const step = sim.reduce(s, ev);
  apply(step, ev, true);
  return step.effects;
}

/** 지금의 v3 전체 상태(새 컨셉으로 돌 때만) */
export function getV3(): v3.V3State | null {
  return v3Mode ? full() : null;
}

/** 앞에 있는 동안의 주기 정산(깸 등). 효과가 있을 때만 저장 */
export function tickNow(): Effect[] {
  const s = snap.state;
  if (!s) return [];
  const f = full();
  if (v3Mode && f) {
    const step = v3.tickV3(f, now());
    applyV3(step, null, step.effects.length > 0);
    return step.effects;
  }
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

/** 개발 메뉴 M4 반김 확인: 앱을 닫은 것으로 보고(appBackground) 시계를 ms만큼 당긴 뒤 돌아온다(appForeground) */
export function devAway(ms: number) {
  if (!snap.state) return;
  if (snap.state.backgroundSince === null) goBackground();
  setMeta({ devOffsetMs: snap.meta.devOffsetMs + ms });
  goForeground();
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

/**
 * 연적으로 재우고 다음 아침까지(개발 메뉴 '밤 건너뛰기'): 졸리지 않으면 재울 수 있는 때까지 시계를 당긴다 → 연적 → 다음 아침 → 꿈 카드 건져 올림.
 * 규칙은 sim이 정한다(canPutToSleep·nextTransition). 한 마디는 쓰지 않는다
 */
export function devSleepCycle() {
  const s = snap.state;
  if (!s) return;
  if (s.phase === 'awake' && !sim.canPutToSleep(s, now())) {
    const need = s.lastWakeAt + sim.TIME.sleepAfterWakeMs + 60_000 - now();
    if (need > 0) setMeta({ devOffsetMs: snap.meta.devOffsetMs + need });
    tickNow();
  }
  if (snap.state?.phase === 'awake') dispatch({ type: 'putToSleep' });
  devNextMorning();
  if (snap.state?.pendingCard) dispatch({ type: 'developCard' });
}

/** 개발 메뉴 '처음부터 다시'(새 컨셉): v3 세이브만 지우고 1일차 인트로로. 옛 세이브(v2)·보관본·설정은 그대로 */
export function devRestartV3() {
  v3.clearSaveV3(kv);
  setMeta({ devOffsetMs: 0, firstNightShown: false });
  emit({ state: null, v3: null, restoredFrom: 'none', lostSave: false, futureSave: false, saveError: null });
}

/** 개발 메뉴: 모드를 바꾼 뒤 다시 부팅(플래그 conceptV3) */
export function devReboot() {
  emit({ state: null, v3: null });
  boot();
}

/** 세이브·메타 초기화 → 설치 전(인트로부터, 설치는 다시 첫 탭에) */
export function devReset() {
  // 새 컨셉으로 돌 때는 v3 세이브만 지운다 — 옛 세이브(v2)는 그대로 둔다(리뷰 L3)
  if (v3Mode) v3.clearSaveV3(kv);
  else clearSave(kv);
  try {
    kv.remove(META_KEY);
  } catch {
    /* 무시 */
  }
  emit({ state: null, v3: null, meta: DEFAULT_META, restoredFrom: 'none', lostSave: false, futureSave: false, saveError: null });
}
