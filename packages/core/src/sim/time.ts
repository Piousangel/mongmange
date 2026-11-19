// D-07 시간 규칙(systems-v1 3절). 계산은 UTC ms, 현지는 잠·아침 시각을 풀 때만 쓴다.
import type { ClockState, Millis, State } from './types';

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export const TIME = {
  bedtimeDefaultMin: 23 * 60,
  morningDefaultMin: 6 * 60,
  minSleepMs: 6 * HOUR,
  minWakeGapMs: 12 * HOUR,
  sleepAfterWakeMs: 8 * HOUR,
  sleepWindowBeforeBedMin: 120,
  offlineCapMs: 72 * HOUR,
  rewindSuspectMs: HOUR,
  /** 이보다 크게 되돌아가면 시계 보정(hwm 재설정) */
  rewindResetMs: 12 * HOUR,
} as const;

/** t 이후(초과) 처음 오는 현지 hh:mm */
export function nextLocalAfter(t: Millis, localMin: number, tzOffsetMin: number): Millis {
  const off = tzOffsetMin * MIN;
  const lt = t + off;
  let cand = Math.floor(lt / DAY) * DAY + localMin * MIN;
  if (cand <= lt) cand += DAY;
  return cand - off;
}

/** t 이전(이하) 마지막 현지 hh:mm */
export function lastLocalAtOrBefore(t: Millis, localMin: number, tzOffsetMin: number): Millis {
  const off = tzOffsetMin * MIN;
  const lt = t + off;
  let cand = Math.floor(lt / DAY) * DAY + localMin * MIN;
  if (cand > lt) cand -= DAY;
  return cand - off;
}

/** 현지 시각이 [startMin, endMin) 구간(자정 넘김 허용) 안인가 */
export function inLocalWindow(t: Millis, startMin: number, endMin: number, tzOffsetMin: number): boolean {
  return lastLocalAtOrBefore(t, startMin, tzOffsetMin) > lastLocalAtOrBefore(t, endMin, tzOffsetMin);
}

/** 첫날 예외(C3): lastWakeAt = min(설치 시각, 직전에 지나간 아침 시각) */
export function initialLastWake(installAt: Millis, morningLocalMin: number, tzOffsetMin: number): Millis {
  return Math.min(installAt, lastLocalAtOrBefore(installAt, morningLocalMin, tzOffsetMin));
}

/** max(잠든 시각 + 6h, 잠든 뒤 처음 오는 아침, 지난 깸 + 12h) */
export function wakeableAt(s: State): Millis {
  const sleepAt = s.sleepAt ?? s.clock.lastSimAt;
  return Math.max(
    sleepAt + TIME.minSleepMs,
    nextLocalAfter(sleepAt, s.morningLocalMin, s.clock.tzOffsetMin),
    s.lastWakeAt + TIME.minWakeGapMs,
  );
}

/** 백그라운드일 때 자동 잠 시각: 깬 뒤 처음 오는 잠 시각(이미 지났으면 백그라운드 전환 시각) */
export function autoSleepAt(s: State): Millis | null {
  if (s.phase !== 'awake' || s.backgroundSince === null) return null;
  const tz = s.clock.tzOffsetMin;
  let bed = nextLocalAfter(s.lastWakeAt, s.bedtimeLocalMin, tz);
  // 그 밤이 이미 끝났으면(잠 시각 다음 아침이 백그라운드 전환보다 앞) 다음 잠 시각으로 넘긴다(리뷰 1-1: 아침 전 설치)
  while (nextLocalAfter(bed, s.morningLocalMin, tz) <= s.backgroundSince) bed = nextLocalAfter(bed, s.bedtimeLocalMin, tz);
  return Math.max(bed, s.backgroundSince);
}

/** 재우기 가능: 깬 지 ≥ 8h 또는 현지 시각이 [잠 시각 − 2h, 아침 시각) */
export function canPutToSleep(s: State, now: Millis): boolean {
  if (s.phase !== 'awake') return false;
  if (now - s.lastWakeAt >= TIME.sleepAfterWakeMs) return true;
  const start = (s.bedtimeLocalMin - TIME.sleepWindowBeforeBedMin + 1440) % 1440;
  return inLocalWindow(now, start, s.morningLocalMin, s.clock.tzOffsetMin);
}

export type TransitionKind = 'sleep' | 'wake';

/** 다음 상태 전이. 마름은 lastCareAt의 연속 함수라 전이가 필요 없다 */
export function nextTransition(s: State): { at: Millis; kind: TransitionKind } | null {
  if (s.phase === 'asleep') return { at: wakeableAt(s), kind: 'wake' };
  const a = autoSleepAt(s);
  return a === null ? null : { at: a, kind: 'sleep' };
}

/** 마름(systems 3.5): 0~12h 0 · 24h 0.15 · 48h 0.4 · 72h~ 0.6 상한. 구간 사이는 선형 */
const DRY_KNOTS: readonly (readonly [number, number])[] = [
  [12, 0],
  [24, 0.15],
  [48, 0.4],
  [72, 0.6],
];
export const DRYNESS_CAP = 0.6;

export function drynessAfter(elapsedMs: number): number {
  const h = elapsedMs / HOUR;
  if (h <= DRY_KNOTS[0]![0]) return 0;
  for (let i = 1; i < DRY_KNOTS.length; i++) {
    const [h1, v1] = DRY_KNOTS[i]!;
    if (h <= h1) {
      const [h0, v0] = DRY_KNOTS[i - 1]!;
      return v0 + ((v1 - v0) * (h - h0)) / (h1 - h0);
    }
  }
  return DRYNESS_CAP;
}

export function dryness(s: State, now: Millis): number {
  return drynessAfter(Math.max(0, now - s.lastCareAt));
}

export interface ResolvedNow {
  simNow: Millis;
  elapsedMs: number;
  capped: boolean;
  suspect: ClockState['suspect'];
}

/** 시계 판정(systems 3.4): 역행 = 경과 0·hwm 유지(12h 넘으면 시계 보정 = hwm 재설정), 앞으로 72h 초과 = 자름 */
export function resolveNow(clock: ClockState, wallNow: Millis): ResolvedNow {
  if (wallNow < clock.hwm) {
    if (clock.hwm - wallNow > TIME.rewindResetMs) return { simNow: wallNow, elapsedMs: 0, capped: false, suspect: 'reset' };
    return {
      simNow: clock.hwm,
      elapsedMs: 0,
      capped: false,
      suspect: clock.hwm - wallNow > TIME.rewindSuspectMs ? 'rewind' : null,
    };
  }
  const elapsedMs = wallNow - clock.lastSimAt;
  const capped = elapsedMs > TIME.offlineCapMs;
  return { simNow: wallNow, elapsedMs, capped, suspect: capped ? 'jump' : null };
}
