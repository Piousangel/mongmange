// OS 평점 창(iOS StoreKit / Android In-App Review) — expo-store-review.
// 네이티브 모듈이 없는 옛 빌드에서도 죽지 않게 지연 로드한다(없으면 평점 요청만 꺼짐). 웹은 review.web.ts(no-op).
import { optionalModule } from '../lib/optionalModule';

type StoreReview = typeof import('expo-store-review');
const SR = optionalModule<StoreReview>(() => require('expo-store-review'));

export type ReviewResult = 'requested' | 'unavailable' | 'failed';

/** 한 번 부른다. OS가 창을 띄울지는 OS가 정한다(할당량) — 결과를 알 수 없으므로 다시 부르지 않는다 */
export async function requestReview(): Promise<ReviewResult> {
  if (!SR) return 'unavailable';
  try {
    if (!(await SR.isAvailableAsync())) return 'unavailable';
    await SR.requestReview();
    return 'requested';
  } catch (e) {
    console.warn('[review] 실패:', e);
    return 'failed';
  }
}
