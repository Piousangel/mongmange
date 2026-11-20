// 경로 안에서 쓰는 고정 창 카운터(B2, architecture.md 3-8 '레이트 리밋' 표 중 사용자·글귀·하루 단위 한도).
// 전역 IP 분당 한도는 throttler.guard.ts. 여기는 키가 IP가 아니거나(사용자·글귀 해시) 창이 분보다 긴 것.
// 인스턴스 메모리라 콜드 스타트마다 비고 인스턴스 수만큼 샌다(3-8 한계 S7 — 소프트런칭에서 감수). 키에 평문 글귀·IP를 두지 않는다:
// 호출하는 쪽이 IP 접두(rateLimitKey)·해시만 넘긴다.
import { Injectable } from '@nestjs/common';
import { Clock } from './clock';

export interface LimitRule {
  /** 한도 이름(로그·오류에 쓰는 값 — 키는 싣지 않는다) */
  name: string;
  key: string;
  limit: number;
  windowMs: number;
}

/**
 * 창 수 상한. 닿으면 하루 지난 창을 쓸고, 그래도 많으면 가장 먼저 만든 창부터 80%까지 버린다
 * (IPv6 /64를 대량으로 가진 쪽이 Map을 키우지 못하게, B2 리뷰 m5). 한 번에 많이 쓸어 다음 쓸기까지 여유를 둔다
 */
export const MAX_WINDOWS = 50_000;
const KEEP_AFTER_SWEEP = Math.floor(MAX_WINDOWS * 0.8);

@Injectable()
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(private readonly clock: Clock) {}

  /**
   * 규칙 전부를 함께 본다: 하나라도 넘치면 아무것도 세지 않고 그 규칙을 돌려준다(시간 한도에 막힌 시도가 일 한도를 먹지 않게).
   * 통과면 전부 1씩 센다.
   */
  take(rules: readonly LimitRule[]): LimitRule | null {
    const now = this.clock.now();
    if (this.windows.size >= MAX_WINDOWS) this.sweep(now);
    const slots = rules.map((r) => {
      const k = `${r.name}|${r.key}`;
      const w = this.windows.get(k);
      return { r, k, w: w && now - w.start < r.windowMs ? w : { start: now, count: 0 } };
    });
    const over = slots.find((s) => s.w.count >= s.r.limit);
    if (over) return over.r;
    for (const s of slots) {
      s.w.count++;
      this.windows.set(s.k, s.w);
    }
    return null;
  }

  private sweep(now: number): void {
    // 창 길이를 모르므로 가장 긴 창(하루) 기준으로 지난 것만 지운다
    for (const [k, w] of this.windows) if (now - w.start >= 86_400_000) this.windows.delete(k);
    // 그래도 넘치면 오래된 것부터(Map은 넣은 순서) — 버려진 키는 한도가 새로 시작될 뿐 막히지는 않는다
    for (const k of this.windows.keys()) {
      if (this.windows.size <= KEEP_AFTER_SWEEP) break;
      this.windows.delete(k);
    }
  }

  /** 시험용: 지금 들고 있는 창 수 */
  get size(): number {
    return this.windows.size;
  }
}
