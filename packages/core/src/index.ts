// @mong/core — 순수 TS. React·RN import 금지.
// 스파이크 단계: 틱 함수 자리만 잡아 둔다. 실제 상태 모델은 SPEC 확정 후.

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
