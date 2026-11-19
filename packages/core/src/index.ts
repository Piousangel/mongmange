// @mong/core — 순수 TS. React·RN import 금지.
// 기하 함수는 UI 스레드 worklet에서도 돌도록 'worklet' 지시어 + 배열 연산만 쓴다(D-13).

export interface CoreState {
  readonly version: 1;
  /** 마지막으로 시뮬레이션한 시각(ms, epoch) */
  readonly lastSimAt: number;
}

/** 결정적 순수 틱. 지금은 시각만 전진시킨다. */
export function tick(state: CoreState, dtMs: number): CoreState {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return state;
  return { ...state, lastSimAt: state.lastSimAt + dtMs };
}

export * from './visual/bodySpec';
export * from './visual/pose';
export * from './visual/selectVisual';
export * from './visual/grammar';
export * from './visual/dreamCard';
export * from './geometry/types';
export * from './geometry/core';
export * from './geometry/simplify';
export * from './geometry/attach';
export * from './geometry/assist';
export * from './geometry/ribbon';
export * from './geometry/comb';
export * from './geometry/eyes';
export * from './save/envelope';
export * from './save/slots';
/** MVP 시뮬레이션(State·Event·tick·reduce·세이브). 기존 이름(tick·Phase 등)과 겹치지 않게 네임스페이스로 낸다 */
export * as sim from './sim/index';
