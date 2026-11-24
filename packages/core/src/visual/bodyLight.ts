// V12a 2.5D 몸 빛(D-26 아트: 몸은 2D 수묵 + 빛 한 방향·그림자·두께, 정반사 없음 — docs/creative/3d-vs-2d/review.md 3-2).
// 몸 칠(단일 coverage) 위에 확산광 한 겹 + 바닥 그림자 둘(빛 방향 그림자·접촉 그림자) + 눈 구멍 위쪽 안 그림자.
// 규칙: ① 빛은 **화면에 고정된 왼쪽 위 한 방향**(시드·체형·기울기와 무관) ② 몸 안 확산광 명도 차 ≤ 0.08(OKLab L) — 세기 상한을
// 여기서 자른다(clamp) ③ 정반사·밝은 점 없음(셰이더에 거듭제곱 하이라이트 항이 없다) ④ 몸 폭 48pt 이하에서는 끔(D-24 LOD와 겹치지 않게),
// 48→60pt 선형으로 켜짐 ⑤ 정적 — 모션 줄이기와 무관. 플래그 `bodyLight`(기본 꺼짐). 꺼짐 = 렌더 노드 자체를 넣지 않음(픽셀 동일).
// 순수 TS(React·Skia 없음). 값은 후보이고 아트 판정(docs/app/v12a/README.md) 뒤 확정한다.

/** 몸 빛이 켜지기 시작하는 몸 폭(pt, 이하 = 끔)과 다 켜지는 몸 폭 */
export const BODY_LIGHT_RAMP = { offAtOrBelowPt: 48, fullPt: 60 } as const;

/** 확산 세기 후보(아트 판정용). 1 = 상한(명도 차 ≤ 0.08을 시험으로 고정한 값) */
export const BODY_LIGHT_LEVELS = { low: 0.5, mid: 0.75, high: 1 } as const;
export type BodyLightLevel = keyof typeof BODY_LIGHT_LEVELS;
/** 낮·밤 세기 한 쌍. 렌더러는 night(0..1)로 **연속 보간**한다(전환 중 튀지 않게) */
export interface BodyLightPair {
  day: number;
  night: number;
}
/**
 * [PM 11-25 아트 판정, 잠정 — 실기기 V20에서 확정] 기본 = mid 0.75, 낮만 high 1(낮 몸이 거의 검어 효과가 묻힘).
 * 둘 다 상한 1 안이라 확산 ≤ 8% 시험(세기 1)이 덮는다
 */
export const BODY_LIGHT_DEFAULT: BodyLightPair = { day: BODY_LIGHT_LEVELS.high, night: BODY_LIGHT_LEVELS.mid };

export const BODY_LIGHT = {
  /** 빛을 향하는 단위 벡터(화면 좌표 x 오른쪽·y 아래·z 화면 밖). 왼쪽 위 앞 — 한지 셰이더 아침 빛 uv(0.1, 0)과 같은 쪽 */
  dir: [-0.5, -0.62, 0.6] as const,
  /** 돔 납작함: 먹 막은 얇다 — 법선 z를 키울수록 면 가운데가 평평하고 기울기는 가장자리에 모인다 */
  flat: 1.6,
  /** 세기 1에서 밝힘(빛 쪽, 빛 색으로 섞는 비율)·어둡힘(반대쪽, 검정으로 섞는 비율) 상한. 낮·밤 */
  lift: { day: 0.065, night: 0.09 },
  sink: { day: 0.04, night: 0.075 },
  /** 빛 색: 낮 = 한지 빛, 밤 = 몸 테 빛(새 색을 만들지 않는다) */
  lightDay: '#EFE8DA',
  lightNight: '#E9E2D2',
  /** 빛 방향 그림자(오른쪽 아래로 기운 흐린 타원). W 단위, 바닥 중심 기준. 색·불투명도 모두 night로 연속 보간 */
  cast: { dx: 0.16, dy: 0.035, rx: 0.58, ry: 0.075, skewDeg: -28, sigmaW: 0.06, day: 0.26, night: 0.55, colorDay: '#5A4A36', colorNight: '#05070D' },
  /** 접촉 그림자(바닥에 닿은 곳). 몸 아래에 깔려 가장자리에서만 보인다 */
  contact: { dx: 0.02, dy: 0.004, rx: 0.36, ry: 0.022, sigmaW: 0.015, day: 0.55, night: 0.6, color: '#000000' },
  /** 눈 구멍 두께: 구멍 위쪽 안의 담묵 그림자(구멍을 위로 shift × 눈 지름만큼 민 사본과 겹친 띠). 낮만(밤 눈은 감은 호) */
  eye: { shift: 0.7, dx: 0.012, sigmaW: 0.012, opacity: 0.5, color: '#6B5F4E' },
} as const;

/** 확산 세기 후보 이름 또는 수 → 0..1(상한 1에서 자른다: 명도 차 8% 상한을 넘는 값은 만들 수 없다) */
export function bodyLightLevel(level: BodyLightLevel | number | null | undefined): number {
  if (level === null || level === undefined) return 0;
  const v = typeof level === 'number' ? level : BODY_LIGHT_LEVELS[level];
  if (!(v > 0)) return 0;
  return Math.min(1, v);
}

/** 세기 입력(후보 이름·수·낮밤 쌍) → 낮밤 쌍(각각 0..1에서 자름). 수·이름은 낮밤 같은 값 */
export function bodyLightPair(level: BodyLightLevel | number | BodyLightPair | null | undefined): BodyLightPair {
  if (level !== null && typeof level === 'object') return { day: bodyLightLevel(level.day), night: bodyLightLevel(level.night) };
  const v = bodyLightLevel(level);
  return { day: v, night: v };
}

/** 그 프레임의 세기: 낮밤 쌍을 night(0..1)로 선형 보간 */
export function bodyLightLevelAt(day: number, nightLv: number, night: number): number {
  'worklet';
  const n = Math.min(1, Math.max(0, night));
  return day + (nightLv - day) * n;
}

/** 몸 폭(pt) → 빛 램프(0 = 끔). 48 이하 0, 60 이상 1 */
export function bodyLightT(bodyPt: number): number {
  'worklet';
  if (!(bodyPt > 48)) return 0;
  return Math.min(1, (bodyPt - 48) / 12);
}

/** 빛 방향 단위 벡터(렌더러 uniform) */
export function bodyLightDir(): [number, number, number] {
  const [x, y, z] = BODY_LIGHT.dir;
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
}
