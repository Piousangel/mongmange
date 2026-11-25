// 경로 안에서 쓰는 고정 창 카운터(B2, architecture.md 3-8 '레이트 리밋' 표 중 사용자·글귀·하루 단위 한도).
// 전역 IP 분당 한도는 throttler.guard.ts. 여기는 키가 IP가 아니거나(사용자·글귀 해시) 창이 분보다 긴 것.
// 인스턴스 메모리라 콜드 스타트마다 비고 인스턴스 수만큼 샌다(3-8 한계 S7 — 소프트런칭에서 감수). 키에 평문 글귀·IP를 두지 않는다:
// 호출하는 쪽이 IP 접두(rateLimitKey)·해시만 넘긴다.
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Clock } from './clock';

export interface LimitRule {
  /** 한도 이름(로그·오류에 쓰는 값 — 키는 싣지 않는다) */
  name: string;
  key: string;
  limit: number;
  windowMs: number;
}

/**
 * **한도 이름(규칙)마다** 창 수 상한. 닿으면 하루 지난 창을 쓸고, 그래도 많으면 그 규칙 안에서 가장 먼저 만든 창부터 80%까지 버린다
 * (IPv6 /64를 대량으로 가진 쪽이 Map을 키우지 못하게, B2 리뷰 m5). 한 번에 많이 쓸어 다음 쓸기까지 여유를 둔다.
 * 규칙마다 따로 두는 까닭(B7a 리뷰 M3): 한 Map이면 위조 XFF로 싼 경로(`m_get` 분 창)를 수만 번 불러 **다른 규칙의 긴 창**
 * (`account_ip_day` 하루·`m_report` 1시간)까지 밀어낼 수 있었다. 이제 넘침은 그 규칙 안에서만 일어난다.
 * 메모리: 창 하나 약 150바이트 × 2만 × 규칙 약 12개 ≈ 최악 36MB(평소는 수천 칸)
 */
export const MAX_WINDOWS = 20_000;
/**
 * 만료 정리 주기(B5 리뷰 M5): 창이 끝난 키(IP 접두·해시)를 **그 창 자신의 길이** 기준으로 지운다. 그래서 IP 접두가 메모리에 남는 시간은
 * '창 길이 + 최대 10초'다 — 분 단위 한도는 약 1분, 신고는 최대 1시간, 계정 생성·웹 삭제는 하루(처리방침 3-1·3-4·3-6과 같은 값)
 */
export const SWEEP_EVERY_MS = 10_000;
const KEEP_AFTER_SWEEP = Math.floor(MAX_WINDOWS * 0.8);

@Injectable()
export class RateLimiter implements OnModuleDestroy {
  /** 규칙 이름 → (키 → 창) */
  private readonly rules = new Map<string, Map<string, { start: number; count: number; ms: number }>>();
  private lastSweep = 0;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(private readonly clock: Clock) {
    // 요청이 끊겨도 만료 키가 남지 않게 주기 정리(프로세스 종료를 막지 않는다)
    this.timer = setInterval(() => this.sweepExpired(this.clock.now()), SWEEP_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /**
   * 규칙 전부를 함께 본다: 하나라도 넘치면 아무것도 세지 않고 그 규칙을 돌려준다(시간 한도에 막힌 시도가 일 한도를 먹지 않게).
   * 통과면 전부 1씩 센다.
   */
  take(rules: readonly LimitRule[]): LimitRule | null {
    const now = this.clock.now();
    if (now - this.lastSweep >= SWEEP_EVERY_MS) this.sweepExpired(now);
    const slots = rules.map((r) => {
      let m = this.rules.get(r.name);
      if (!m) this.rules.set(r.name, (m = new Map()));
      if (m.size >= MAX_WINDOWS) this.sweep(m, now);
      const w = m.get(r.key);
      return { r, m, w: w && now - w.start < r.windowMs ? w : { start: now, count: 0, ms: r.windowMs } };
    });
    const over = slots.find((s) => s.w.count >= s.r.limit);
    if (over) return over.r;
    for (const s of slots) {
      s.w.count++;
      s.m.set(s.r.key, s.w);
    }
    return null;
  }

  /** 창이 끝난 키를 지운다(각 창의 길이 기준) */
  sweepExpired(now: number): void {
    this.lastSweep = now;
    for (const m of this.rules.values()) for (const [k, w] of m) if (now - w.start >= w.ms) m.delete(k);
  }

  /** 한 규칙의 Map이 넘쳤을 때: 끝난 창 → 그래도 많으면 그 규칙 안에서 오래된 것부터 80%까지 */
  private sweep(m: Map<string, { start: number; count: number; ms: number }>, now: number): void {
    for (const [k, w] of m) if (now - w.start >= w.ms) m.delete(k);
    // Map은 넣은 순서 — 버려진 키는 한도가 새로 시작될 뿐 막히지는 않는다
    for (const k of m.keys()) {
      if (m.size <= KEEP_AFTER_SWEEP) break;
      m.delete(k);
    }
  }

  /** 시험용: 지금 들고 있는 창 수 */
  get size(): number {
    let n = 0;
    for (const m of this.rules.values()) n += m.size;
    return n;
  }
}
