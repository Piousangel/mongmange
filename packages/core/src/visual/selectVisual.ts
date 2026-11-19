// 시스템 7절 selectVisual: 낮·획·밤 화면이 각자 포즈 상수를 부르지 않고 이것 하나를 공유한다.
// 스파이크 02 범위의 최소판(성향·바램·꿈 카드는 범위 밖).
import { PALETTE, coreScale, combGrowth } from './bodySpec';
import type { StrokeRecord } from '../geometry/types';

export type Phase = 'awake' | 'asleep';

export interface VisualInput {
  phase: Phase;
  strokes: readonly StrokeRecord[];
  /** 획별 나이(깸 수). 없으면 모두 0 */
  ages?: readonly number[];
}

export type StrokeTone = 'body' | 'mid' | 'faded';

export interface VisualState {
  phase: Phase;
  coreScale: number;
  strokesTotal: number;
  comb: { protrude: number; thick: number };
  palette: (typeof PALETTE)['day'] | (typeof PALETTE)['night'];
  /** 밤 눈은 감은 호만(아트 1-4) */
  eyeMode: 'holes' | 'closedArc';
  breathPeriodS: number;
  strokes: { rec: StrokeRecord; tone: StrokeTone }[];
}

/** 시스템 4.3: 0~7 짙은 먹(몸과 같은 coverage), 8~20 ink-mid, 그 뒤 ink-faded */
export function toneForAge(age: number): StrokeTone {
  if (age <= 7) return 'body';
  if (age <= 20) return 'mid';
  return 'faded';
}

export function selectVisual(input: VisualInput): VisualState {
  const n = input.strokes.length;
  return {
    phase: input.phase,
    coreScale: coreScale(n),
    strokesTotal: n,
    comb: combGrowth(n),
    palette: input.phase === 'awake' ? PALETTE.day : PALETTE.night,
    eyeMode: input.phase === 'awake' ? 'holes' : 'closedArc',
    breathPeriodS: input.phase === 'awake' ? 3.2 : 4.4,
    strokes: input.strokes.map((rec, i) => ({ rec, tone: toneForAge(input.ages?.[i] ?? 0) })),
  };
}
