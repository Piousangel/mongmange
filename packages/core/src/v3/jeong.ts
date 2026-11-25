// M4 정·손 기억·반김·머뭇거림(D-20 세 기둥, D-26 '그대로', 시스템 3.6·3.8, C-integrated 2-4). 순수 규칙만.
// - 정 = 몽망이를 만진 깸의 수(몸 탭·길게 누르기·부르기·한 마디의 붓 획). 쌓이기만 하고 줄지 않는다(벌 0·연속 기록 0, D-03).
//   값은 하나 — sim `relation.jeongDays`. 공방(V27)과 반김이 **같은 경계 값**(state.ts `boundaryProgress().jeong` = `jeongOf`)을 읽는다.
// - 정 2(알아봄)·4(기다림·내밂)·7(이름 대답에 다가옴)에 열린다. 15·30은 1.x.
// - 반김 4단계 = 비운 시간 × closeness 구간. 72h 이상 = 머뭇거림(0.8초, 시선은 유저 쪽, 글·알림 없음) → 첫 터치 → 큰 반김.
// - 이 모듈은 말결·사전·위기 대조·밥을 읽지 않는다(위기 판정 흔적 0, 시험 정적 검사). 몸 크기·비율에 아무것도 넘기지 않는다.
import { localHour } from '../sim/pillars';

/** 정이 새로 여는 문턱(시스템 3.8 표). 15·30은 1.x */
export const JEONG_STAGES = [2, 4, 7] as const;
export type JeongStage = 0 | 2 | 4 | 7;

export function jeongStageOf(jeong: number): JeongStage {
  if (jeong >= 7) return 7;
  if (jeong >= 4) return 4;
  if (jeong >= 2) return 2;
  return 0;
}

export const GREET = {
  /** 이보다 짧게 비우면(앱 전환·알림 끌어내림) 반김 없음 [추정 — 실기기 체감으로 조정] */
  minAwayMs: 60_000,
  /** 반김 단계 경계: 6h · 30h · 72h(시스템 3.8 표) */
  shortMs: 6 * 3_600_000,
  dayMs: 30 * 3_600_000,
  longMs: 72 * 3_600_000,
  /** closeness 구간(다가옴 ≥ +0.35, 혼자 ≤ −0.35) */
  lean: 0.35,
  /** 익숙한 시각: 그 시각 칸 지수 평균이 이 값 이상(하루 알파 0.2 → 최근 그 시각에 두 번 오면 0.36) */
  familiarMin: 0.35,
  /** 익숙한 시각 창 ±45분(시스템 3.8 '정 4') */
  familiarWindowMin: 45,
  /** 머뭇거림 길이(ms) — 시스템 3.8 */
  hesitateMs: 800,
} as const;

/** glance = 6h 미만 · joy = 6~30h · wait = 30~72h · long = 72h 이상(머뭇거림 자리) */
export type GreetTier = 'glance' | 'joy' | 'wait' | 'long';
export type Lean = 'near' | 'mid' | 'alone';

export function greetTierOf(awayMs: number): GreetTier | null {
  if (!(awayMs >= GREET.minAwayMs)) return null;
  if (awayMs < GREET.shortMs) return 'glance';
  if (awayMs < GREET.dayMs) return 'joy';
  if (awayMs < GREET.longMs) return 'wait';
  return 'long';
}

export function leanOf(closeness: number): Lean {
  if (closeness >= GREET.lean) return 'near';
  if (closeness <= -GREET.lean) return 'alone';
  return 'mid';
}

/** 지금 시각 ±45분이 걸치는 시각 칸 중 하나라도 익숙한가(지난 깸까지 접힌 평균만 — 오늘 방문은 보지 않는다) */
export function familiarAt(hour: readonly number[], at: number, tzOffsetMin: number): boolean {
  const w = GREET.familiarWindowMin * 60_000;
  const hs = new Set([localHour(at - w, tzOffsetMin), localHour(at, tzOffsetMin), localHour(at + w, tzOffsetMin)]);
  for (const h of hs) if ((hour[h] ?? 0) >= GREET.familiarMin) return true;
  return false;
}

export interface Greeting {
  tier: GreetTier;
  lean: Lean;
  stage: JeongStage;
  /** 정 2 알아봄: 앱을 열면 먼저 정면을 본다 */
  recognize: boolean;
  /** 정 4 기다림: 익숙한 시각에 열면 기다림 자세 */
  waiting: boolean;
}

export interface GreetInput {
  awayMs: number;
  closeness: number;
  jeong: number;
  hour: readonly number[];
  at: number;
  tzOffsetMin: number;
}

/** 돌아온 순간의 반김(결정적, D-13). null = 반김 없음(아주 짧게 비움) */
export function greetingOf(g: GreetInput): Greeting | null {
  const tier = greetTierOf(g.awayMs);
  if (!tier) return null;
  const stage = jeongStageOf(g.jeong);
  return {
    tier,
    lean: leanOf(g.closeness),
    stage,
    recognize: stage >= 2,
    waiting: stage >= 4 && familiarAt(g.hour, g.at, g.tzOffsetMin),
  };
}

/** 좋아하는 자리(몸 둘레 6칸 중 가장 많이 만진 곳). 아직 모은 값이 없으면 null(내밂 없음) */
export function favoriteSpotOf(spot: readonly number[]): number | null {
  let best = -1;
  let at: number | null = null;
  spot.forEach((v, i) => {
    if (v > best && v > 0) {
      best = v;
      at = i;
    }
  });
  return at;
}

/** 정 신호 넷(시스템 3.8 '정 자막'): 알아봄·기다림·내밂·이름 대답. 순서 = 세이브 `captionsShown` 칸 순서 */
export const JEONG_SIGNALS = ['recognize', 'wait', 'offer', 'reply'] as const;
export type JeongSignal = (typeof JEONG_SIGNALS)[number];
/** 정 자막은 신호마다 처음 세 번만(넷째부터 몸짓만) */
export const CAPTION_MAX = 3;

export function emptyCaptionsShown(): number[] {
  return JEONG_SIGNALS.map(() => 0);
}
