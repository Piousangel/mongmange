// 공통 바텀시트의 순수 계산(UI 스레드 worklet + 시험). RN·Reanimated를 불러오지 않는다.
// 좌표: 위치 = 시트의 translateY. 0 = 가장 높이 펼친 자리, sheetH = 화면 밖으로 닫힌 자리. 아래로 갈수록 큰 값.
// 설계 참고: gorhom/react-native-bottom-sheet v5(snapPoint 투영 0.2초, 과도 당김 sqrt 저항, 스크롤 맨 위에서만 시트가 내려감).
// worklet 규칙(core worklet-defaults·worklet-order 시험과 같은 이유): 기본 인자에 모듈 상수를 쓰지 않고, 부르기 전에 선언한다.

/** 스냅 지점: px 높이, 컨테이너 높이의 %, 'content'(내용 높이 = 시트 높이) */
export type SnapPoint = number | `${number}%` | 'content';

/**
 * 이 속도(px/s) 이상으로 놓으면 '튕김' — 투영 대신 그 방향으로 한 칸.
 * 500 = Material BottomSheetBehavior의 significantVelocityThreshold 기본값. 웹 마우스 튕김(실측 약 600px/s)도 잡힌다.
 */
export const FLING_VELOCITY = 500;
/** 놓은 뒤 위치 투영 시간(초). gorhom snapPoint와 같은 값 */
export const PROJECTION_S = 0.2;
/** 과도 당김 저항 계수(gorhom 기본 2.5) */
export const OVERDRAG_FACTOR = 2.5;
/** 아트 8절 '빠른 반응(100~200ms)'의 아래쪽 — 튕겨도 이보다 빨리 끝나지 않는다 */
export const MIN_SETTLE_MS = 140;

/** 스냅 지점 → 보이는 높이(px), 낮은 것부터. 시트 높이(sheet)를 넘으면 자른다. sheet를 아직 모르면 빈 목록 */
export function resolveDetents(points: readonly SnapPoint[], container: number, sheet: number): number[] {
  'worklet';
  if (!(sheet > 0)) return [];
  const out: number[] = [];
  for (const p of points) {
    let h: number;
    if (p === 'content') h = sheet;
    else if (typeof p === 'string') h = (parseFloat(p) / 100) * container;
    else h = p;
    if (!Number.isFinite(h) || h <= 0) continue;
    h = Math.min(h, sheet);
    if (!out.some((x) => Math.abs(x - h) < 0.5)) out.push(h);
  }
  if (out.length === 0) out.push(sheet);
  return out.sort((a, b) => a - b);
}

/** 보이는 높이 → 위치(translateY), 위쪽(작은 값)부터 */
export function detentPositions(heights: readonly number[], sheet: number): number[] {
  'worklet';
  return heights.map((h) => sheet - h).sort((a, b) => a - b);
}

/** 넘친 거리 → 실제로 움직일 거리(점점 무거워짐) */
export function rubberband(over: number, factor: number): number {
  'worklet';
  if (over <= 0) return 0;
  return (Math.sqrt(1 + over) - 1) * factor;
}

/**
 * 손가락이 원하는 위치(raw) → 화면 위치. top 위로는 overTop이면 저항, 아니면 멈춤.
 * bottom 아래로는 overBottom이면 저항(닫을 수 없는 시트의 가장 낮은 지점), 아니면 멈춤(닫힌 자리).
 */
export function dragPosition(p: { raw: number; top: number; bottom: number; overTop: boolean; overBottom: boolean; factor: number }): number {
  'worklet';
  if (p.raw < p.top) return p.overTop ? p.top - rubberband(p.top - p.raw, p.factor) : p.top;
  if (p.raw > p.bottom) return p.overBottom ? p.bottom + rubberband(p.raw - p.bottom, p.factor) : p.bottom;
  return p.raw;
}

/**
 * 놓았을 때 갈 자리. 후보 = 스냅 위치들(+ 닫을 수 있으면 closed).
 * 느리면 '위치 + 0.2초 × 속도'에 가장 가까운 후보, 튕기면(|v| ≥ FLING_VELOCITY) 그 방향의 바로 다음 후보 한 칸.
 */
export function pickSnap(pos: number, velocity: number, positions: readonly number[], closed: number | null): number {
  'worklet';
  const c = closed === null ? positions.slice() : [...positions, closed];
  c.sort((a, b) => a - b);
  if (c.length === 0) return pos;
  if (Math.abs(velocity) >= FLING_VELOCITY) {
    if (velocity > 0) {
      for (const x of c) if (x > pos + 0.5) return x;
      return c[c.length - 1]!;
    }
    for (let i = c.length - 1; i >= 0; i--) if (c[i]! < pos - 0.5) return c[i]!;
    return c[0]!;
  }
  const proj = pos + PROJECTION_S * velocity;
  let best = c[0]!;
  for (const x of c) if (Math.abs(x - proj) < Math.abs(best - proj)) best = x;
  return best;
}

/** 목적지가 닫힌 자리면 닫는다 */
export function shouldClose(target: number, closed: number): boolean {
  'worklet';
  return target >= closed - 0.5;
}

/** 스크린리더 조절 동작(위로 쓸기 = 더 펼침): 한 칸 이동, 끝에서는 그대로 */
export function stepDetent(pos: number, positions: readonly number[], dir: 'up' | 'down'): number {
  'worklet';
  const c = positions.slice().sort((a, b) => a - b);
  if (dir === 'up') {
    for (let i = c.length - 1; i >= 0; i--) if (c[i]! < pos - 0.5) return c[i]!;
    return c[0] ?? pos;
  }
  for (const x of c) if (x > pos + 0.5) return x;
  return c[c.length - 1] ?? pos;
}

/**
 * 안쪽 스크롤 위에서 손가락이 delta만큼 움직였을 때 시트 raw 위치(한 프레임).
 * - 위로(delta < 0): 시트가 덜 펼쳐졌으면 시트가 먹고 top에서 멈춘다. 다 펼쳐졌으면 스크롤 몫.
 * - 아래로(delta > 0): 스크롤이 맨 위(scrollY ≤ 0)일 때만 시트가 내려간다. 아니면 스크롤이 먼저 올라간다.
 * - 스크롤할 게 없는 내용(scrollable=false)은 손잡이처럼 그대로 받는다(저항은 dragPosition).
 * sheetOwns = 이 프레임에 시트가 움직였거나 덜 펼쳐져 있다 → 호출 쪽은 스크롤 위치를 묶는다.
 */
export function stepContentDrag(p: { pos: number; delta: number; scrollY: number; top: number; bottom: number; scrollable: boolean }): { pos: number; sheetOwns: boolean } {
  'worklet';
  if (!p.scrollable) return { pos: p.pos + p.delta, sheetOwns: true };
  if (p.delta < 0) {
    if (p.pos > p.top + 0.5) return { pos: Math.max(p.top, p.pos + p.delta), sheetOwns: true };
    return { pos: p.pos, sheetOwns: false };
  }
  if (p.delta > 0 && p.scrollY <= 0.5) return { pos: p.pos + p.delta, sheetOwns: true };
  return { pos: p.pos, sheetOwns: p.pos > p.top + 0.5 };
}

/** 배경 진하기 비율: 가장 낮은 스냅 지점까지 1, 닫힌 자리에서 0 */
export function backdropProgress(pos: number, lowest: number, closed: number): number {
  'worklet';
  if (closed - lowest < 1) return pos >= closed ? 0 : 1;
  const k = 1 - (pos - lowest) / (closed - lowest);
  return Math.min(1, Math.max(0, k));
}

/** 자리 잡는 시간(ms): 모션 줄이기면 0, 아니면 남은 거리 ÷ 놓은 속도(빠를수록 짧게), MIN_SETTLE_MS ~ base */
export function settleDuration(distance: number, velocity: number, reduceMotion: boolean, base: number): number {
  'worklet';
  if (reduceMotion) return 0;
  const v = Math.abs(velocity);
  if (v < 1) return base;
  return Math.min(base, Math.max(MIN_SETTLE_MS, (Math.abs(distance) / v) * 1000));
}
