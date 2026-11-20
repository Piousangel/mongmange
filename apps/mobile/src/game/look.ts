// M1: 세이브의 birth·ink + 기능 플래그 → 그릴 '그 아이' 값(core lookOf). 플래그가 꺼져 있으면 기본형(빌드 1 화면 그대로).
import { BASE_LOOK, lookOf, sim as coreSim, type MongLook, type sim } from '@mong/core';
import { useMemo } from 'react';
import { useFeature } from '../features';

export function useMongLook(state: sim.State | null | undefined): MongLook {
  const traits = useFeature('birthTraits');
  const ink = useFeature('inkChoice');
  const seed = state?.birth.seed;
  const ver = state?.birth.traitVersion;
  const inkId = state?.ink.id ?? null;
  return useMemo(
    () => (seed === undefined ? BASE_LOOK : lookOf({ seed, traitVersion: ver ?? 1 }, { id: inkId }, { traits, ink })),
    [seed, ver, inkId, traits, ink],
  );
}

/** 획마다 먹(첫 밤 뒤 '먹 바꾸기'는 새 획에만, H2). 먹 고르기 플래그가 꺼져 있으면 undefined = 모두 몸의 먹(빌드 1) */
export function useStrokeInks(state: sim.State | null | undefined): (sim.InkId | null)[] | undefined {
  const on = useFeature('inkChoice');
  const strokes = state?.strokes;
  const ink = state?.ink;
  return useMemo(() => (on && strokes && ink ? strokes.map((st) => coreSim.inkOfStroke(ink, st.createdAt)) : undefined), [on, strokes, ink]);
}

/**
 * 먹 네 자루를 벼루 옆에 놓을까(H2, C-integrated 2-1·D-05 팀 결정 11-20):
 * 첫날 깨어 있는 동안(첫 밤 전) 아직 안 골랐거나 씨앗 먹이면 '고르기', 그 뒤에는 공방 노트 '먹 바꾸기'로 연 때만.
 */
export function inkPickerOpen(state: Pick<sim.State, 'dayIndex' | 'phase' | 'ink'>, opts: { flag: boolean; changing: boolean }): boolean {
  if (!opts.flag || state.phase !== 'awake') return false;
  if (opts.changing) return state.ink.id !== null;
  return state.dayIndex === 0 && (state.ink.id === null || state.ink.seeded);
}

/** 공방 노트 '먹 바꾸기' 줄을 보일까: 첫 밤을 지나 몸의 먹이 정해진 뒤에만 */
export function inkChangeAvailable(state: Pick<sim.State, 'dayIndex' | 'ink'>, flag: boolean): boolean {
  return flag && state.dayIndex >= 1 && state.ink.id !== null;
}
