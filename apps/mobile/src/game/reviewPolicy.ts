// 평점 요청 규칙(D-18 ⑤, number-one ⑤): 이레(7획) 아침 카드를 건져 올린 직후 **딱 한 번**.
// 거절·실패·창이 안 떠도 다시 묻지 않는다 — 묻기 전에 reviewAsked를 먼저 기록한다. 순수 함수(테스트 대상).
import type { sim } from '@mong/core';

/** 카드가 놓인 뒤(물 빠짐 1600 + 카드 800) 한 숨 쉬고 묻는다 — 카드를 먼저 보게 */
export const REVIEW_DELAY_MS = 1600 + 800 + 1800;

export function shouldAskReview(line: sim.MorningLine, opts: { reviewAsked: boolean; featureOn: boolean }): boolean {
  return opts.featureOn && !opts.reviewAsked && line.kind === 'seven-day';
}

export interface ReviewDeps {
  getAsked: () => boolean;
  /** 영구 기록(메타). 요청보다 **먼저** 부른다 */
  markAsked: () => void;
  featureOn: () => boolean;
  /** 앱이 지금 앞에 있는가 */
  isActive: () => boolean;
  request: () => Promise<unknown>;
  setTimer: (fn: () => void, ms: number) => unknown;
}

/**
 * 1회 보장(리뷰 L-6·L-7): 이레 카드 현상 → 먼저 reviewAsked 기록 → 4.2초 뒤 요청.
 * 그 사이 앱이 뒤로 가면 요청을 미뤄 두었다가 다시 앞에 올 때 한 번 부른다(앱이 꺼지면 0회 — 다시 묻지 않음 원칙이 우선).
 * 요청이 실패·거절돼도 다시 부르지 않는다.
 */
export function createReviewAsker(d: ReviewDeps) {
  /** idle → waiting(타이머) → deferred(뒤에 있어 미룸) → done */
  let phase: 'idle' | 'waiting' | 'deferred' | 'done' = 'idle';
  const fire = () => {
    if (phase === 'done') return;
    if (!d.isActive()) {
      phase = 'deferred';
      return;
    }
    phase = 'done';
    void d.request().catch(() => undefined);
  };
  return {
    onCardDeveloped(line: sim.MorningLine) {
      if (phase !== 'idle' || !shouldAskReview(line, { reviewAsked: d.getAsked(), featureOn: d.featureOn() })) return;
      d.markAsked();
      phase = 'waiting';
      d.setTimer(fire, REVIEW_DELAY_MS);
    },
    /** 앱이 다시 앞에 왔을 때 */
    onActive() {
      if (phase === 'deferred') fire();
    },
  };
}
