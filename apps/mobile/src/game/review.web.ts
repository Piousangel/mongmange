// 웹: 평점 창이 없다(no-op). 캡처·흐름 확인용으로 부른 횟수만 남긴다(window.__mongReviewCalls).
import type { ReviewResult } from './review';

export type { ReviewResult } from './review';

export async function requestReview(): Promise<ReviewResult> {
  const g = globalThis as { __mongReviewCalls?: number };
  g.__mongReviewCalls = (g.__mongReviewCalls ?? 0) + 1;
  return 'unavailable';
}
