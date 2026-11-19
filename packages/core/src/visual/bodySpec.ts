// 몽망이 몸 수치 — 정본: docs/creative/v1/art-bible-v1.md(v1.1) 1-1·1-2·2-2·4절, 시스템 4.1.
// 모든 길이는 W(0일차 방울 폭) 단위. 좌표: 핵 중심 원점, x = 앞(오른쪽), y = 아래.
// 각도(θ): 0 = 정수리, 시계 방향(+) = 앞. dir(θ) = (sin θ, −cos θ).

export const BODY = {
  /** 폭:높이 (허용 1.15~1.35) */
  aspect: 1.25,
  aspectMin: 1.15,
  aspectMax: 1.35,
  /** 바닥 현 길이 */
  bottomChord: 0.7,
  /** 정수리 곡률 반경 하한(아트 위험 3: 💩·양파 방지). 이 값보다 작아지면 테스트가 실패한다 */
  crownRadiusMin: 0.35,
  /** 정수리를 앞으로 기울이는 양 */
  forwardLean: 0.05,
  /** 바닥 모서리 둥글림(smooth-max 반경) */
  bottomRound: 0.07,
} as const;

export const EYE = {
  diameter: 0.16,
  /** 몸 높이 대비 바닥에서 잰 중심 높이 */
  heightFrac: 0.38,
  spacing: 0.42,
  /** 기쁨 호 두께 */
  joyThickness: 0.035,
  /** 졸림 가로선 길이 */
  sleepyLength: 0.16,
  /** 놀람 배율 */
  surprisedScale: 1.2,
  /** 시선 최대 이동 */
  gazeMax: 0.04,
} as const;

export const COMB = {
  /** 길이비(위 → 아래) */
  ratios: [1, 0.9, 0.75] as const,
  /** 돌출: 0일차 → 이레(7획) */
  protrude0: 0.18,
  protrude7: 0.3,
  /** 가닥 굵기: 0일차 → 이레 */
  thick0: 0.05,
  thick7: 0.066,
  /** 가닥 사이 간격 = 굵기 × 1.2 */
  gapRatio: 1.2,
  /** 휨 반경 하한 */
  bendRadiusMin: 0.5,
  /** 뿌리가 몸 안으로 들어가는 길이(마스크가 이어지도록) */
  rootInset: 0.1,
  /** 맨 위 가닥 뿌리 각도(정수리 오른쪽 1시) */
  topRootTheta: (34 * Math.PI) / 180,
} as const;

export const RING = {
  /** 바닥 번짐 고리 */
  width: 1.3,
  height: 0.18,
  opacity: 0.25,
  /** 첫 획 안내 젖은 자국 */
  hintWidth: 1.6,
  hintOpacity: 0.12,
} as const;

export const EDGE = {
  /** 안쪽 진한 테(pt) */
  rimPx: 2,
  /** 바깥 블러(pt, 2~4) */
  bleedPx: 3,
} as const;

export const STROKE = {
  maxPoints: 512,
  maxMs: 6000,
  /** 파생 단순화 점 상한 */
  simplifiedMax: 64,
  /** 붓 기본 폭(W) */
  baseWidth: 0.075,
  /** 부착 때 몸 안으로 묻는 깊이(W). 테스트 ④의 0.02W 안 */
  anchorInset: -0.015,
} as const;

/** D-12 금지 자리(라디안, θ 규약). ① 정수리 + 빗 뿌리 ② 뒤쪽 아래 꼬리 자리 */
export const FORBIDDEN: readonly (readonly [number, number])[] = [
  [(-25 * Math.PI) / 180, (45 * Math.PI) / 180],
  [(200 * Math.PI) / 180, (250 * Math.PI) / 180],
];

/** 아트 1-2 단계별 획 최대 돌출(L2부터 적용). n = 지금까지 그은 획 수 */
export function protrusionCap(n: number): number {
  'worklet';
  if (n <= 7) return 0.5;
  return Math.min(1.0, 0.5 + (0.5 * (n - 7)) / 23);
}

/** 시스템 4.1 정본 */
export function coreScale(n: number): number {
  'worklet';
  const k = Math.max(0, n);
  return 1 + 0.6 * (1 - Math.exp(-k / 13));
}

/** E 빗 돌출·굵기(n획) */
export function combGrowth(n: number): { protrude: number; thick: number } {
  'worklet';
  const k = Math.min(Math.max(n, 0), 7) / 7;
  return {
    protrude: COMB.protrude0 + (COMB.protrude7 - COMB.protrude0) * k,
    thick: COMB.thick0 + (COMB.thick7 - COMB.thick0) * k,
  };
}

/** 아트 4절 팔레트 — 낮/밤 같은 이름 */
export const PALETTE = {
  day: {
    bg: '#EFE8DA',
    bgShade: '#E3DACA',
    body: '#1B1A18',
    bodyRim: null,
    eye: '#EFE8DA',
    inkMid: '#5B5751',
    inkFaded: '#827D75',
    wash: '#B9B3A8',
    text: '#2A2622',
    textSub: '#6B625A',
    accent: '#C8462C',
  },
  night: {
    bg: '#141A2C',
    bgShade: '#0D1120',
    body: '#7E7973',
    bodyRim: '#E9E2D2',
    eye: '#E9E2D2',
    inkMid: '#6C6862',
    inkFaded: '#4A4846',
    wash: '#2A3148',
    text: '#E9E2D2',
    textSub: '#A8A196',
    accent: '#C8462C',
    gold: '#C9A45C',
  },
} as const;
