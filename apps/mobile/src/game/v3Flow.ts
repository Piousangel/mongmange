// 새 컨셉 v3 앱 흐름의 순수 규칙(RN·Expo 모듈 없음 — 앱 시험이 직접 부른다).
// ① 판정 → 대답 신호 ② 스크린리더·목록 보기·벼루 시트의 먹 갈기 ③ 한 마디 시트의 앱 전환 처리(쓴 글자 남기지 않기).
import { v3 } from '@mong/core';
import { CUE, type CueValue } from '../render/answer';

export type V3Cue = Omit<CueValue, 'at'> & { key: number };

/**
 * 판정 → 대답 신호(V7 최소판).
 * - 곁 대답(위기)은 넓은 그물 가라앉음 대답과 **같은 모양**(가라앉음 몸짓 + 곁으로 와서 붙어 앉기, 강도 1)이다. 위기만의 몸짓·숨·알림이 없다(리뷰 M2, heart-grain 8-0 E3).
 * - 배고픔 낱말(사전 표지 hunger: 배고파·꼬르륵·hungry…)은 기쁨 호 없이 제자리에서 유저를 본다(QA-3 R4-3, 리뷰 M1).
 *   음식·맛 낱말(밥·치킨·맛있어·yummy)은 home 결 그대로 기쁨을 유지한다(care-rituals 2-5, 리뷰 2차 L-a).
 */
export function cueOf(a: v3.Interpretation, fromX: number, fromY: number, key: number): V3Cue {
  const base = { intensity: 2, net: false, fromX, fromY, key };
  if (a.kind === 'stay') return { ...base, kind: CUE.low, intensity: 1, net: true };
  if (a.kind === 'call') return { ...base, kind: CUE.call };
  if (a.kind === 'unknown') return { ...base, kind: CUE.unknown };
  if (a.hunger) return { ...base, kind: CUE.look, intensity: a.intensity };
  const fam = v3.familyOf(a.sense);
  return { ...base, kind: fam ? CUE[fam] : CUE.unknown, intensity: a.intensity, net: a.net };
}

/**
 * 스크린리더(두 번 탭)·목록 보기·스크린리더가 켜진 벼루 시트 '먹 갈기'로 가는 양: 한 번에 먹 6칸(그날 쓸 수 있는 글자 수 상한).
 * 길게 누르기를 못 하는 사람도 한 마디까지 갈 수 있어야 한다(리뷰 H1, care-rituals 2-1 '벼루 동작 목록'). 갈기 보상은 없다
 */
export const A11Y_GRIND_MS = v3.INK_CELL_MS * (v3.WORD_MAX_CHARS - 1) + 1;

/**
 * 벼루 시트 '먹 갈기' 방식(리뷰 2차 L-d, DECISIONS v3 절).
 * - 스크린리더: 한 번에 6칸(H1 그대로).
 * - 그 밖: 눌러 시작 → 길게 누르기와 같은 속도로 칸이 차오름 → 다시 누르거나 시트를 닫으면 멈춤(6칸에서 저절로 멈춤).
 *   누르고 있지 않아도 되고(손이 불편해도 됨), 중간에 멈춰도 간 만큼은 남는다(D-03).
 */
export function sheetGrindMode(screenReader: boolean): 'all' | 'flow' {
  return screenReader ? 'all' : 'flow';
}

/** 시트 갈기 한 순간: 이미 간 양(baseMs)에 지난 시간(elapsedMs)을 더한 칸 수, 넘길 갈기 양(6칸 넘는 몫은 버림), 6칸에 닿았는지 */
export function sheetGrindStep(baseMs: number, elapsedMs: number): { cells: number; addMs: number; done: boolean } {
  const room = Math.max(0, A11Y_GRIND_MS - Math.max(0, baseMs));
  const addMs = Math.min(Math.max(0, elapsedMs), room);
  return { cells: v3.inkCellsOfMs(Math.max(0, baseMs) + addMs), addMs, done: addMs >= room };
}

/** 벼루의 접근성 동작: 두 번 탭(activate) = 먹 갈기, 그 밖 = 벼루 시트(한 숟갈·작은 것) */
export type InkstoneA11yAction = 'activate' | 'sheet';
export function inkstoneA11yActions(labels: { grind: string; sheet: string }): { name: InkstoneA11yAction; label: string }[] {
  return [
    { name: 'activate', label: labels.grind },
    { name: 'sheet', label: labels.sheet },
  ];
}

/** 시트 갈기 사건: 누름(시작·멈춤) / 0.1초 tick(6칸 자동 멈춤) / 시트 숨김 / 앱 상태 */
export type SheetGrindEvent =
  | { type: 'press'; at: number }
  | { type: 'tick'; at: number }
  | { type: 'hide'; at: number }
  | { type: 'appState'; state: string; at: number };

/**
 * 시트 갈기 멈춤 규칙(L 리뷰 N2·N3). startAt = 갈기 시작 시각(null = 멈춤), baseMs = 이 깸에 이미 간 양.
 * 다시 누름·6칸 닿음·시트 숨김·앱 background(알 수 없는 상태 포함)에서 멈추고 그때까지 간 양(commitMs)을 넘긴다 — 그 깸 장부에 남고
 * 다음 깸으로 넘어가지 않는다. inactive(iOS 제어 센터 등)에서는 계속 간다
 */
export function sheetGrindOn(startAt: number | null, ev: SheetGrindEvent, baseMs: number): { startAt: number | null; started: boolean; commitMs: number | null } {
  if (startAt == null) return ev.type === 'press' ? { startAt: ev.at, started: true, commitMs: null } : { startAt: null, started: false, commitMs: null };
  const step = sheetGrindStep(baseMs, ev.at - startAt);
  const keep = (ev.type === 'tick' && !step.done) || (ev.type === 'appState' && (ev.state === 'active' || ev.state === 'inactive'));
  return keep ? { startAt, started: false, commitMs: null } : { startAt: null, started: false, commitMs: step.addMs };
}

/** 한 마디 시트 상태. key가 바뀌면 시트가 새로 그려져 입력칸이 빈다 */
export interface WordSheetState {
  open: boolean;
  key: number;
  /** 앱 전환 스냅숏 가림막(iOS가 앱 전환기 그림을 찍기 전 inactive에서 켠다). 앱 화면과 시트(Modal) 안 두 곳에 씌운다 */
  cover: boolean;
}
export const WORD_SHEET_INITIAL: WordSheetState = { open: false, key: 0, cover: false };

/**
 * 앱 상태 → 한 마디 시트(리뷰 H2, 2차 L-b).
 * - inactive(iOS 제어 센터·알림 끌어내리기·붙여넣기 허용 창, 앱 전환기로 가는 첫 단계): 쓰던 글자는 두고 가림막만 씌운다.
 *   가림막 덕에 앱 전환기 스냅숏에 글자가 찍히지 않는다. 그대로 active로 돌아오면 가림막만 내린다(같은 입력칸).
 * - background(그 밖 알 수 없는 상태 포함, Android는 inactive 없이 바로 온다): 확정하지 않은 글자를 버린다 — 시트를 닫고 입력칸을 새로 만든다.
 *   돌아오면 가림막만 내린다(시트는 닫힌 채)
 */
export function wordSheetOnAppState(cur: WordSheetState, appState: string): WordSheetState {
  if (appState === 'active') return cur.cover ? { ...cur, cover: false } : cur;
  if (appState === 'inactive') return cur.open && !cur.cover ? { ...cur, cover: true } : cur;
  return { open: false, key: cur.key + 1, cover: cur.open || cur.cover };
}

/** 시트를 닫거나 화면이 낮 홈이 아니게 되면(잠·아침) 입력칸을 새로 만든다 */
export function wordSheetClose(cur: WordSheetState): WordSheetState {
  return { ...cur, open: false, key: cur.key + 1 };
}

// ── M4 정·반김·머뭇거림(시스템 3.6·3.8, C-integrated 2-4) ──

/** 반김 몸짓 종류(answer.ts CUE의 반김 칸) */
export type GreetCue = 'glance' | 'joy' | 'wait' | 'big' | 'hesitate';

export interface GreetPlan {
  /** 돌아온 순간의 몸짓 */
  open: GreetCue;
  /** 첫 터치에 이어지는 몸짓(null = 없음). 72h 이상은 큰 반김(기쁨 1.5배 + 이름 가락 2회) */
  firstTouch: GreetCue | null;
}

/**
 * core `greeted` → 화면 몸짓 계획(결정적). 72h 이상(long): 머뭇거림 0.8초 → 첫 터치 → 물 한 방울(sim rehydrated) → 큰 반김.
 * 플래그 hesitation이 꺼져 있으면(비네트 '찔렸다' 미달 때 끄는 스위치) 머뭇거림 대신 기다림 자세만(C 2-4).
 * 정 4 기다림(익숙한 시각)은 72h 미만일 때 여는 몸짓을 기다림 자세로 바꾸고, 첫 터치에 그 단계의 기쁨으로 잇는다.
 * 어떤 단계에도 글·알림·비켜 앉기·몸 돌리기·크기 줄이기가 없다(그 몸짓은 answer.ts가 만들지 않는다).
 */
export function greetPlan(g: { tier: v3.GreetTier; waiting: boolean }, o: { hesitation: boolean }): GreetPlan {
  if (g.tier === 'long') return { open: o.hesitation ? 'hesitate' : 'wait', firstTouch: 'big' };
  if (g.tier === 'wait') return { open: 'wait', firstTouch: 'joy' };
  if (g.waiting) return { open: 'wait', firstTouch: g.tier === 'joy' ? 'joy' : 'glance' };
  return { open: g.tier === 'joy' ? 'joy' : 'glance', firstTouch: null };
}

/** closeness 구간 → 대답 강도 칸(near 3 · mid 2 · alone 1). 반김 몸짓은 강도 칸으로 구간 버릇을 받는다 */
export function leanIntensity(lean: v3.Lean): 1 | 2 | 3 {
  return lean === 'near' ? 3 : lean === 'alone' ? 1 : 2;
}

/** 정 자막 문구 키(관찰자 3인칭 한 줄, 시스템 3.8). 머뭇거림에는 문구가 없다 */
export const JEONG_CAPTION_KEYS = {
  recognize: 'v3.jeong.recognize',
  wait: 'v3.jeong.wait',
  offer: 'v3.jeong.offer',
  reply: 'v3.jeong.reply',
} as const satisfies Record<v3.JeongSignal, string>;

/** 정 자막을 보일까: 플래그 jeong·jeongCaptions 둘 다 켜짐 + core가 아직 세 번을 다 보이지 않았다고 함 */
export function captionShown(sig: { caption: boolean }, flags: { jeong: boolean; jeongCaptions: boolean }): boolean {
  return flags.jeong && flags.jeongCaptions && sig.caption;
}

/** 정 자막 띠: 1.6초 뒤 흐려지기 시작해 0.6초에 걸쳐 사라진다(아트 7-5 '흐려짐') */
export const CAPTION_HOLD_MS = 1600;
export const CAPTION_FADE_MS = 600;

// ── M4 리뷰 H1: 머뭇거림부터 첫 터치 뒤 큰 반김이 끝날 때까지 글 0(자막·안내 한 줄·스크린리더 알림) ──

/** 큰 반김 길이(answer.ts GREET_MS[greetBig]와 같아야 한다 — 시험) */
export const BIG_GREET_MS = 3000;

/**
 * 반김이 시작될 때 조용한 구간의 끝(ms, Date.now 기준). 72h 이상(첫 터치 = 큰 반김)이면 첫 터치 전까지 끝이 없다(Infinity).
 * 머뭇거림 스위치가 꺼져 기다림 자세로 열어도 같다. 그 밖의 반김은 구간을 바꾸지 않는다(null)
 */
export function quietOnGreet(plan: GreetPlan): number | null {
  return plan.firstTouch === 'big' ? Number.POSITIVE_INFINITY : null;
}

/** 첫 터치: 큰 반김은 머뭇거림이 끝난 뒤(notBefore) 시작해 BIG_GREET_MS 동안 — 그때까지 조용하다 */
export function quietOnFirstTouch(now: number, notBefore: number): number {
  return Math.max(now, notBefore) + BIG_GREET_MS;
}

/** 지금 글(자막·안내 한 줄·스크린리더 알림)을 내도 되는가 */
export function textAllowed(now: number, quietUntil: number): boolean {
  return now >= quietUntil;
}

/** 낮 홈이 아닐 때 미뤄 둔 반김: 반김은 마지막 한 번만, 자막 신호는 그 반김 뒤에 난 것만(중복 없이) — 리뷰 L2 */
export interface GreetQueue<F> {
  greet: F | null;
  captions: v3.JeongSignal[];
}
export function emptyGreetQueue<F>(): GreetQueue<F> {
  return { greet: null, captions: [] };
}
export function queueGreet<F>(q: GreetQueue<F>, greet: F): GreetQueue<F> {
  return { greet, captions: [] };
}
export function queueCaption<F>(q: GreetQueue<F>, signal: v3.JeongSignal): GreetQueue<F> {
  return q.captions.includes(signal) ? q : { ...q, captions: [...q.captions, signal] };
}
