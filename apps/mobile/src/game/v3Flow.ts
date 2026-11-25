// 새 컨셉 v3 앱 흐름의 순수 규칙(RN·Expo 모듈 없음 — 앱 시험이 직접 부른다).
// ① 판정 → 대답 신호 ② 스크린리더·목록 보기의 먹 갈기 ③ 한 마디 시트의 앱 전환 처리(쓴 글자 남기지 않기).
import { v3 } from '@mong/core';
import { CUE, type CueValue } from '../render/answer';

export type V3Cue = Omit<CueValue, 'at'> & { key: number };

/**
 * 판정 → 대답 신호(V7 최소판).
 * - 곁 대답(위기)은 넓은 그물 가라앉음 대답과 **같은 모양**(가라앉음 몸짓 + 곁으로 와서 붙어 앉기, 강도 1)이다. 위기만의 몸짓·숨·알림이 없다(리뷰 M2, heart-grain 8-0 E3).
 * - 배고픔 낱말(home.in.meal)은 기쁨 호 없이 제자리에서 유저를 본다(QA-3 R4-3, 리뷰 M1).
 */
export function cueOf(a: v3.Interpretation, fromX: number, fromY: number, key: number): V3Cue {
  const base = { intensity: 2, net: false, fromX, fromY, key };
  if (a.kind === 'stay') return { ...base, kind: CUE.low, intensity: 1, net: true };
  if (a.kind === 'call') return { ...base, kind: CUE.call };
  if (a.kind === 'unknown') return { ...base, kind: CUE.unknown };
  if (a.sense === 'home.in.meal') return { ...base, kind: CUE.look, intensity: a.intensity };
  const fam = v3.familyOf(a.sense);
  return { ...base, kind: fam ? CUE[fam] : CUE.unknown, intensity: a.intensity, net: a.net };
}

/**
 * 스크린리더(두 번 탭)·목록 보기·벼루 시트 '먹 갈기'로 가는 양: 한 번에 먹 6칸(그날 쓸 수 있는 글자 수 상한).
 * 길게 누르기를 못 하는 사람도 한 마디까지 갈 수 있어야 한다(리뷰 H1, care-rituals 2-1 '벼루 동작 목록'). 갈기 보상은 없다
 */
export const A11Y_GRIND_MS = v3.INK_CELL_MS * (v3.WORD_MAX_CHARS - 1) + 1;

/** 벼루의 접근성 동작: 두 번 탭(activate) = 먹 갈기, 그 밖 = 벼루 시트(한 숟갈·작은 것) */
export type InkstoneA11yAction = 'activate' | 'sheet';
export function inkstoneA11yActions(labels: { grind: string; sheet: string }): { name: InkstoneA11yAction; label: string }[] {
  return [
    { name: 'activate', label: labels.grind },
    { name: 'sheet', label: labels.sheet },
  ];
}

/** 한 마디 시트 상태. key가 바뀌면 시트가 새로 그려져 입력칸이 빈다 */
export interface WordSheetState {
  open: boolean;
  key: number;
  /** 앱 전환 스냅숏 가림막(iOS가 앱 전환기 그림을 찍기 전 inactive에서 켠다) */
  cover: boolean;
}
export const WORD_SHEET_INITIAL: WordSheetState = { open: false, key: 0, cover: false };

/**
 * 앱이 앞에서 벗어나면(inactive·background) 확정하지 않은 글자를 바로 버린다: 시트를 닫고 입력칸을 새로 만든다.
 * 시트가 열려 있었으면 가림막을 켜 앱 전환기 스냅숏에 글자가 찍히지 않게 한다(리뷰 H2). 돌아오면 가림막만 내린다(시트는 닫힌 채)
 */
export function wordSheetOnAppState(cur: WordSheetState, appState: string): WordSheetState {
  if (appState === 'active') return cur.cover ? { ...cur, cover: false } : cur;
  return { open: false, key: cur.key + 1, cover: cur.open || cur.cover };
}

/** 시트를 닫거나 화면이 낮 홈이 아니게 되면(잠·아침) 입력칸을 새로 만든다 */
export function wordSheetClose(cur: WordSheetState): WordSheetState {
  return { ...cur, open: false, key: cur.key + 1 };
}
