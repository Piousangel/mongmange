// 성향 v2 — 최근 습관 추종형(systems-v1 2.2~2.6). 수치·연산 순서는 docs/design/sim/temperament-7day.mjs와 같다(골든 테스트).
import { AXES, type AxisId, type AxisRecord, type LineKind, type Measures, type StrokeStyle } from './types';

export const TEMPERAMENT = {
  BETA: 0.3,
  G: 18,
  VMAX: 0.85,
  A_FOCUS: 0.4,
  A_REST: 0.15,
  EPS: 0.03,
  BUDGET: 0.15,
  FIRST_GAIN: 2,
  FIRST_CAP: 0.25,
  /** 아침 문장: 변화 문턱 */
  CHANGE_MIN: 0.04,
  /** 깊어짐: |v| 문턱, 어제 신호 최소 크기 */
  DEEPEN_V: 0.25,
  DEEPEN_S: 0.01,
  /** 구간 버릇 문턱 */
  BAND: 0.35,
} as const;

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export function zeroAxes(): AxisRecord {
  return { tempo: 0, boldness: 0, closeness: 0, curiosity: 0 };
}

/** 측정값 하나가 축에 주는 기여(이득 × (측정값 − 0.5)). systems 2.2 표 */
export const GAINS: readonly { measure: keyof Measures; axis: AxisId; gain: number }[] = [
  { measure: 'speed', axis: 'tempo', gain: 0.2 },
  { measure: 'grind', axis: 'tempo', gain: -0.04 },
  { measure: 'holdSpeed', axis: 'tempo', gain: 0.04 },
  { measure: 'grind', axis: 'boldness', gain: 0.12 },
  { measure: 'len', axis: 'boldness', gain: 0.08 },
  { measure: 'dist', axis: 'closeness', gain: -0.1 },
  { measure: 'touch', axis: 'closeness', gain: 0.06 },
  { measure: 'novel', axis: 'curiosity', gain: 0.16 },
  { measure: 'tapSpread', axis: 'curiosity', gain: 0.04 },
];

/** 하루 신호(중심화 + 축당 ±0.15 예산). 스크립트 daySignals와 같은 연산 순서 */
export function daySignals(d: Measures): AxisRecord {
  const s = zeroAxes();
  s.tempo += 0.2 * (d.speed - 0.5);
  s.tempo -= 0.04 * (d.grind - 0.5);
  s.tempo += 0.04 * (d.holdSpeed - 0.5);
  s.boldness += 0.12 * (d.grind - 0.5);
  s.boldness += 0.08 * (d.len - 0.5);
  s.closeness += 0.1 * (0.5 - d.dist);
  s.closeness += 0.06 * (d.touch - 0.5);
  s.curiosity += 0.16 * (d.novel - 0.5);
  s.curiosity += 0.04 * (d.tapSpread - 0.5);
  for (const k of AXES) s[k] = clamp(s[k], -TEMPERAMENT.BUDGET, TEMPERAMENT.BUDGET);
  return s;
}

/** 그 축에 가장 크게 기여한 측정값(아침 문장 원인) */
export function topContributor(d: Measures, axis: AxisId): { measure: keyof Measures; sign: 1 | -1 } | null {
  let best: { measure: keyof Measures; sign: 1 | -1 } | null = null;
  let bestAbs = 0;
  for (const g of GAINS) {
    if (g.axis !== axis) continue;
    const c = g.gain * (d[g.measure] - 0.5);
    if (Math.abs(c) > bestAbs) {
      bestAbs = Math.abs(c);
      best = { measure: g.measure, sign: d[g.measure] >= 0.5 ? 1 : -1 };
    }
  }
  return best;
}

/** 첫날(타고난 결): 신호 2배, ±0.25에서 자름. 습관 흔적 초깃값은 신호 그대로 */
export function initTemperament(s0: AxisRecord): { v: AxisRecord; h: AxisRecord } {
  const v = zeroAxes();
  const h = zeroAxes();
  for (const k of AXES) {
    v[k] = clamp(s0[k] * TEMPERAMENT.FIRST_GAIN, -TEMPERAMENT.FIRST_CAP, TEMPERAMENT.FIRST_CAP);
    h[k] = s0[k];
  }
  return { v, h };
}

export interface SettleResult {
  next: AxisRecord;
  habit: AxisRecord;
  focus: AxisId | null;
  delta: number;
}

/** 밤의 스밈(systems 2.3). 같은 축 3밤 연속 금지, 최대 간격 < EPS면 결 없음 */
export function settleTemperament(v: AxisRecord, h: AxisRecord, s: AxisRecord, hist: readonly (AxisId | null)[]): SettleResult {
  const P = TEMPERAMENT;
  const h2 = zeroAxes();
  const T = zeroAxes();
  for (const k of AXES) {
    h2[k] = h[k] + P.BETA * (s[k] - h[k]);
    T[k] = P.VMAX * Math.tanh(P.G * h2[k]);
  }
  const last = hist.length > 0 ? hist[hist.length - 1]! : null;
  const banned = hist.length >= 2 && hist[hist.length - 2] === last ? last : null;
  let focus: AxisId | null = null;
  let best: number = P.EPS;
  for (const k of AXES) {
    if (k === banned) continue;
    const g = Math.abs(T[k] - v[k]);
    if (g > best) {
      best = g;
      focus = k;
    }
  }
  const next = zeroAxes();
  for (const k of AXES) next[k] = v[k] + (k === focus ? P.A_FOCUS : P.A_REST) * (T[k] - v[k]);
  return { next, habit: h2, focus, delta: focus ? next[focus] - v[focus] : 0 };
}

/** 아침 문장 종류: 변화 > 깊어짐 > 관찰(스크립트 run()의 판정과 같음) */
export function lineKind(res: SettleResult, s: AxisRecord): Exclude<LineKind, 'seven-day'> {
  if (res.focus && Math.abs(res.delta) >= TEMPERAMENT.CHANGE_MIN) return 'change';
  return deepenAxis(res.next, s) ? 'deepen' : 'observation';
}

/** 어제 신호가 현재 성향과 같은 방향이고 |v| ≥ 0.25인 첫 축 */
export function deepenAxis(v: AxisRecord, s: AxisRecord): AxisId | null {
  for (const k of AXES) {
    if (Math.abs(v[k]) >= TEMPERAMENT.DEEPEN_V && Math.sign(s[k]) === Math.sign(v[k]) && Math.abs(s[k]) >= TEMPERAMENT.DEEPEN_S) return k;
  }
  return null;
}

export function bandOf(x: number): -1 | 0 | 1 {
  if (x >= TEMPERAMENT.BAND) return 1;
  if (x <= -TEMPERAMENT.BAND) return -1;
  return 0;
}

/** 축 → 획의 칠(systems 2.5 표). [팀 추정] 선형 대응 */
export function styleFor(v: AxisRecord): StrokeStyle {
  const u = (x: number) => (clamp(x, -TEMPERAMENT.VMAX, TEMPERAMENT.VMAX) + TEMPERAMENT.VMAX) / (2 * TEMPERAMENT.VMAX); // 0..1
  const fast = u(v.tempo);
  const bold = u(v.boldness);
  return {
    bleedPx: 5 - 3.5 * fast, // 느긋 5px ~ 재빠름 1.5px
    bleedMs: 1600 - 1200 * fast, // 1.6초 ~ 0.4초
    dryBrush: bold,
    endCap: v.boldness > 0 ? 'square' : 'taper',
    tone: bold, // 0 회청 ~ 1 짙은 흑
    spreadDir: u(v.curiosity), // 0 둥글게 ~ 1 한쪽으로 뻗음
  };
}

/** 결과 채널(systems 2.5 표의 표현 채널). 5일 안에 겹치지 않게 돌린다 */
export const CHANNELS: Record<AxisId, readonly string[]> = {
  tempo: ['bleed', 'breath', 'hum', 'ripple'],
  boldness: ['drybrush', 'gesture', 'voice', 'dreamscale'],
  closeness: ['attach', 'gaze', 'reply', 'dreamothers'],
  curiosity: ['spread', 'glance', 'humend', 'dreamfar'],
};
