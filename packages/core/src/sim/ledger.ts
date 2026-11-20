// 하루 입력 장부 → 측정값(0..1). systems 2.2 표. 정규화 상수는 전부 [팀 추정] 초기값(스파이크·플레이테스트로 보정).
import { coreSdf } from '../geometry/core';
import { polylineLength } from '../geometry/simplify';
import type { Attach, BodyShape, RawPoint } from '../geometry/types';
import type { DayLedger, Measures, Stroke, StrokeMeasure } from './types';

export const LEDGER = {
  /** 획 속도는 로그 척도: 이 속도(W/s)가 0.5, 한 옥타브(2배)마다 1/speedOctaves씩. 빠르기 분포는 비율이라 선형이면 평균이 중앙값보다 커진다 */
  speedMidWs: 0.67,
  speedOctaves: 4,
  /** 획 길이가 핵 폭 × 이 값이면 1 */
  lenFullCore: 1.6,
  /** 부착 전 몸 표면에서 이 거리(W)면 종이 끝 = 1 */
  distFullW: 0.91,
  /** 하루 먹 갈기 20초 이상 = 1 */
  grindFullMs: 20_000,
  /** 쓰다듬기 한 번 = 이 시간만큼 접촉 */
  petMs: 600,
  /** 하루 접촉 20초 = 1 */
  touchFullMs: 20_000,
  /** 문지르기 기준(이 이상 누르면 길게 누르기) */
  holdMinMs: 500,
  /** 길게 누르기 미세 이동 W/s가 이 값이면 1 */
  holdMoveFullWs: 0.4,
  /** 탭 위치 표준 반경(W)이 이 값이면 1 */
  spreadFullW: 1.26,
  /** 하루 탭 위치 기억 수 */
  maxTaps: 64,
  /** 새로움: 비교할 최근 획 수 */
  novelRecent: 3,
  /** 이보다 짧은 획은 거절 */
  minStrokeLenW: 0.05,
} as const;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function emptyLedger(): DayLedger {
  return { stroke: null, grindMs: 0, petCount: 0, holdMs: 0, holdMoveMs: 0, taps: [], strokeUsed: false, washUsed: false, lastStrokeAt: null, inputs: 0 };
}

function angDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

function heading(raw: readonly RawPoint[]): number {
  const a = raw[0]!;
  const b = raw[raw.length - 1]!;
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** 획 측정: 속도·길이·몸과의 평균 거리·새로움(최근 획들과 붙는 각도·방향 차이의 평균) */
/** shape = 그 개체의 체형(M1, 부착과 같은 몸). 없으면 기본형 — 체형이 '몸과의 거리'를 통해 결(성향)로 새지 않게(리뷰 M1) */
export function measureStroke(raw: readonly RawPoint[], attach: Attach, coreScaleNow: number, prev: readonly Stroke[], shape?: BodyShape): StrokeMeasure {
  const L = polylineLength(raw);
  const durMs = Math.max(1, raw[raw.length - 1]!.t - raw[0]!.t);
  // 거리 = 점들이 몸 표면에서 떨어진 평균(몸 안쪽은 0). 최솟값은 몸에 대고 긋는 획을 모두 0으로 만들어 쏠린다(리뷰 1-5)
  let sumD = 0;
  for (const p of raw) sumD += Math.max(0, coreSdf(p.x, p.y, coreScaleNow, shape?.core));
  const meanD = sumD / raw.length;
  // 새로움 = 최근 획 몇 개와의 차이 '평균'. 전체 최솟값은 획이 쌓일수록 0으로 흘러 curiosity가 음으로 쏠린다(리뷰 1-5)
  let novel = 0.5;
  const recent = prev.slice(-LEDGER.novelRecent);
  if (recent.length > 0) {
    const h = heading(raw);
    let sum = 0;
    for (const s of recent) sum += 0.5 * (angDiff(attach.theta, s.attach.theta) / Math.PI) + 0.5 * (angDiff(h, heading(s.raw)) / Math.PI);
    novel = sum / recent.length;
  }
  return {
    speed: clamp01(0.5 + Math.log2(Math.max(1e-6, L / (durMs / 1000)) / LEDGER.speedMidWs) / LEDGER.speedOctaves),
    len: clamp01(L / (LEDGER.lenFullCore * coreScaleNow)),
    dist: clamp01(meanD / LEDGER.distFullW),
    novel: clamp01(novel),
  };
}

/** 장부 → 측정값. 그날 하지 않은 입력은 중앙값 0.5(신호 0), 먹 갈기·접촉량은 '안 함 = 0'이 측정값이다 */
export function ledgerMeasures(l: DayLedger): Measures {
  const st = l.stroke;
  let spread = 0.5;
  if (l.taps.length >= 2) {
    let mx = 0;
    let my = 0;
    for (const t of l.taps) {
      mx += t.x;
      my += t.y;
    }
    mx /= l.taps.length;
    my /= l.taps.length;
    let v = 0;
    for (const t of l.taps) v += (t.x - mx) ** 2 + (t.y - my) ** 2;
    spread = clamp01(Math.sqrt(v / l.taps.length) / LEDGER.spreadFullW);
  }
  return {
    speed: st ? st.speed : 0.5,
    len: st ? st.len : 0.5,
    dist: st ? st.dist : 0.5,
    novel: st ? st.novel : 0.5,
    grind: clamp01(l.grindMs / LEDGER.grindFullMs),
    touch: clamp01((l.petCount * LEDGER.petMs + l.holdMs) / LEDGER.touchFullMs),
    holdSpeed: l.holdMs > 0 ? clamp01(l.holdMoveMs / l.holdMs / LEDGER.holdMoveFullWs) : 0.5,
    tapSpread: spread,
  };
}
