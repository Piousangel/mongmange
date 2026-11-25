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
