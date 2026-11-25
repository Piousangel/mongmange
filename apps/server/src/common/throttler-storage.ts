// 전역 레이트 리밋(@nestjs/throttler) 저장소 — 상한 있는 LRU(B7a, B7-report 4절 B2).
// 기본 저장소(ThrottlerStorageService)는 키 수 상한이 없고 요청마다 만료 시각 배열을 쌓아 키 하나에 약 1.2KB였다 → 서로 다른 IP 약 20만 개
// (`*.run.app` 직접 호출로 XFF 왼쪽을 요청마다 바꾸면 공짜)로 512MiB 인스턴스가 40초 만에 OOM.
//
// - 키 하나 = { 창 시작, 횟수, 막힘 끝 } 숫자 셋 + 키 문자열(`default:` + IP 접두, IPv6 /64는 약 30자). **IP 접두 말고는 아무것도 담지 않는다.**
// - 상한 RATE_LIMIT_MAX_KEYS(기본 10만). 넘으면 **가장 오래 안 쓴 키부터** 상한의 90%까지 한 번에 버린다(Map 삽입 순서 + 쓸 때마다 맨 뒤로).
//   버려진 키는 한도가 새로 시작될 뿐 막히지는 않는다 — 공격자가 키 10만 개를 1분 안에 돌려 남의 카운터를 지울 수는 있지만,
//   그 공격자 자신은 이미 요청마다 새 키라 리밋이 의미가 없는 상태다(근본 대책은 `*.run.app` 직접 호출 차단 — B6, DECISIONS B7a).
// - 메모리 예산: 키 하나 약 170바이트(시험이 잰다) × 10만 = 약 17MB. 512MiB 인스턴스의 정상 피크 200MiB(B7-report 3-4)에 더해도 여유.
// - 만료 정리: 창(60초)이 끝난 키는 SWEEP_EVERY_MS마다 지운다 → IP 접두가 메모리에 남는 시간은 '창 + 최대 10초'(처리방침 3-1 '약 1분').
//   Cloud Run은 요청 밖에서 타이머가 늦을 수 있어 요청 때도 주기가 지났으면 쓴다.
// - 뜻은 기본 저장소와 같게: 창 안 횟수가 limit을 넘는 순간 blockDuration 동안 막힘, 막힘이 끝나면 횟수를 0부터. 창은 첫 요청부터 고정(기본은 미끄럼 창).
import type { OnApplicationShutdown } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';

/** @nestjs/throttler ThrottlerStorageRecord와 같은 모양(패키지 dist 경로를 직접 가져오지 않으려고 여기 둔다) */
export interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

export const THROTTLER_SWEEP_EVERY_MS = 10_000;

interface Entry {
  start: number;
  ttl: number;
  hits: number;
  blockedUntil: number;
}

export class BoundedThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  private readonly map = new Map<string, Entry>();
  private lastSweep = 0;
  private readonly timer: ReturnType<typeof setInterval>;
  /** 상한 때문에 버린 키 수(관찰용 — 키 값은 남기지 않는다) */
  evicted = 0;

  constructor(
    readonly maxKeys: number,
    private readonly now: () => number = Date.now,
  ) {
    this.timer = setInterval(() => this.sweep(this.now()), THROTTLER_SWEEP_EVERY_MS);
    this.timer.unref();
  }

  increment(key: string, ttl: number, limit: number, blockDuration: number): Promise<ThrottlerStorageRecord> {
    const now = this.now();
    if (now - this.lastSweep >= THROTTLER_SWEEP_EVERY_MS) this.sweep(now);
    let e = this.map.get(key);
    if (e) this.map.delete(key); // 맨 뒤(가장 최근)로
    if (!e || (now - e.start >= e.ttl && e.blockedUntil <= now)) e = { start: now, ttl, hits: 0, blockedUntil: 0 };
    if (e.blockedUntil > 0 && e.blockedUntil <= now) {
      // 막힘이 끝났으면 새로 센다(기본 저장소 resetBlockedRequest와 같음)
      e = { start: now, ttl, hits: 0, blockedUntil: 0 };
    }
    const blocked = e.blockedUntil > now;
    if (!blocked) e.hits++;
    if (!blocked && e.hits > limit && blockDuration > 0) e.blockedUntil = now + blockDuration;
    this.map.set(key, e);
    if (this.map.size > this.maxKeys) this.evict();
    const isBlocked = e.blockedUntil > now || (blockDuration <= 0 && e.hits > limit);
    return Promise.resolve({
      totalHits: e.hits,
      timeToExpire: Math.max(0, Math.ceil((e.start + e.ttl - now) / 1000)),
      isBlocked,
      timeToBlockExpire: Math.max(0, Math.ceil((e.blockedUntil - now) / 1000)),
    });
  }

  /**
   * 넘치면 가장 오래 안 쓴 쪽부터 상한의 90%까지 **한 번에** 버린다. 하나씩 버리면(`keys().next()`를 매번) V8 Map이 앞쪽의 지운 자리를
   * 매번 건너뛰어 키 하나당 수십 µs가 들었다(부하 시험에서 처리량 절반 — B7a 재측정). 한 번의 순회로 묶어 버리면 요청당 1µs 미만
   */
  private evict(): void {
    const keep = Math.floor(this.maxKeys * 0.9);
    for (const k of this.map.keys()) {
      if (this.map.size <= keep) break;
      this.map.delete(k);
      this.evicted++;
    }
  }

  /** 창이 끝났고 막혀 있지 않은 키를 지운다 */
  sweep(now: number): void {
    this.lastSweep = now;
    for (const [k, e] of this.map) if (now - e.start >= e.ttl && e.blockedUntil <= now) this.map.delete(k);
  }

  get size(): number {
    return this.map.size;
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }
}
