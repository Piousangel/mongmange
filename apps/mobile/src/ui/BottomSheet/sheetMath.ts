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
/** 경계 판정 여유(px): 맨 위 스냅·스크롤 맨 위·닫힌 자리를 이만큼 안쪽까지 같은 자리로 본다(소수점 레이아웃 오차) */
export const EDGE_EPS = 0.5;
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
  return target >= closed - EDGE_EPS;
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
 * 안쪽 스크롤 위에서 손가락이 delta만큼 움직였을 때 시트 raw 위치(한 프레임). gorhom과 같은 소유권:
 * - 시트가 맨 위 스냅이 아니면(pos > top) **스크롤 위치와 상관없이** 시트가 손가락을 가진다. 위로 밀면 top에서 멈춘다.
 *   (리뷰 M1: 낮은 스냅 + 스크롤이 내려간 채로 아래로 끌면 시트도 스크롤도 안 움직이던 구멍)
 * - 맨 위 스냅에서: 위로(delta < 0)는 스크롤 몫. 아래로(delta > 0)는 스크롤이 맨 위(scrollY ≤ EDGE_EPS)일 때만 시트가 내려가고,
 *   아니면 스크롤이 먼저 올라간다.
 * - 스크롤할 게 없는 내용(scrollable=false)은 손잡이처럼 그대로 받는다(저항은 dragPosition).
 * sheetOwns = 이 프레임에 시트가 손가락을 가진다 → 호출 쪽은 스크롤 위치를 묶는다.
 */
export function stepContentDrag(p: { pos: number; delta: number; scrollY: number; top: number; bottom: number; scrollable: boolean }): { pos: number; sheetOwns: boolean } {
  'worklet';
  if (!p.scrollable) return { pos: p.pos + p.delta, sheetOwns: true };
  if (p.pos > p.top + EDGE_EPS) return { pos: p.delta < 0 ? Math.max(p.top, p.pos + p.delta) : p.pos + p.delta, sheetOwns: true };
  if (p.delta > 0 && p.scrollY <= EDGE_EPS) return { pos: p.pos + p.delta, sheetOwns: true };
  return { pos: p.pos, sheetOwns: false };
}

/** 드래그를 받는 손가락: 손잡이·머리 줄 또는 안쪽 내용 */
export type DragSource = 'handle' | 'content';
/** 한 제스처의 상태. owner = 지금 시트를 쥔 쪽(두 손가락이 손잡이와 내용을 동시에 잡아도 먼저 잡은 쪽만, 리뷰 L2) */
export type DragState = { owner: DragSource | null; start: number; raw: number; prevT: number; moved: boolean };
export const IDLE_DRAG: DragState = { owner: null, start: 0, raw: 0, prevT: 0, moved: false };

/**
 * 드래그 시작. 열려 있고(visible) 아무도 쥐고 있지 않을 때만 받는다. 아니면 null = 이 제스처는 무시한다.
 * 닫히는 중(visible=false, 닫힘 애니메이션 진행)에 잡은 손가락을 무시하는 까닭(리뷰 H1): 부모는 이미 닫힘 상태라
 * 시트를 붙잡아 되돌리면 다시 닫을 길이 없다. 사용자는 이미 닫기를 골랐으니 닫힘을 끝까지 보낸다.
 */
export function beginDrag(d: DragState, source: DragSource, open: boolean, pos: number): DragState | null {
  'worklet';
  if (!open || d.owner !== null) return null;
  return { owner: source, start: pos, raw: pos, prevT: 0, moved: false };
}

/** 이 프레임을 시트에 반영하나: 열려 있고 이 손가락이 주인일 때만(드래그 도중 닫힘 요청이 오면 그 뒤 프레임은 버린다) */
export function ownsDrag(d: DragState, source: DragSource, open: boolean): boolean {
  'worklet';
  return open && d.owner === source;
}

/**
 * 놓을 때 갈 자리. null = 아무것도 하지 않음 — 주인이 아니거나, 움직이지 않았거나, 드래그 도중 닫힘 요청이 와서(open=false)
 * 닫힘 애니메이션이 이미 시트를 맡은 경우.
 */
export function releaseTarget(d: DragState, source: DragSource, open: boolean, pos: number, velocity: number, positions: readonly number[], closed: number | null): number | null {
  'worklet';
  if (!ownsDrag(d, source, open) || !d.moved) return null;
  return pickSnap(pos, velocity, positions, closed);
}

/** 제스처가 끝났다(활성 여부와 상관없이): 주인이면 비운다 */
export function endDrag(d: DragState, source: DragSource): DragState {
  'worklet';
  return d.owner === source ? IDLE_DRAG : d;
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
