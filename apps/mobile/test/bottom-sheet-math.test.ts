// 공통 바텀시트(ui/BottomSheet)의 순수 계산: 스냅 높이 해석·과도 당김 저항·속도 기반 스냅·닫힘 판정·안쪽 스크롤과의 소유권.
// 좌표: 위치 = 시트의 translateY(0 = 가장 높이 펼친 자리, sheetH = 화면 밖으로 닫힘). 아래로 갈수록 큰 값.
import { describe, expect, it } from 'vitest';
import {
  EDGE_EPS,
  IDLE_DRAG,
  backdropProgress,
  beginDrag,
  endDrag,
  ownsDrag,
  releaseTarget,
  detentPositions,
  dragPosition,
  FLING_VELOCITY,
  pickSnap,
  resolveDetents,
  rubberband,
  settleDuration,
  shouldClose,
  stepContentDrag,
  stepDetent,
} from '../src/ui/BottomSheet/sheetMath';

describe('resolveDetents — 스냅 지점 해석', () => {
  it('content·%·px를 보이는 높이로 바꾸고 낮은 것부터 정렬한다', () => {
    expect(resolveDetents(['content', '50%', 200], 800, 600)).toEqual([200, 400, 600]);
  });
  it('시트 높이를 넘는 지점은 시트 높이로 자르고 중복은 하나만 남긴다', () => {
    expect(resolveDetents(['90%', 'content'], 800, 500)).toEqual([500]);
  });
  it('0 이하·숫자가 아닌 값은 버린다. 남는 게 없으면 content 하나', () => {
    expect(resolveDetents([0, -10, Number.NaN], 800, 300)).toEqual([300]);
  });
  it('시트 높이를 아직 모르면(0) 빈 목록', () => {
    expect(resolveDetents(['content'], 800, 0)).toEqual([]);
  });
});

describe('detentPositions — 높이 → translateY', () => {
  it('높은 지점일수록 작은 위치, 가장 높은 지점이 0', () => {
    expect(detentPositions([200, 400, 600], 600)).toEqual([0, 200, 400]);
  });
});

describe('rubberband·dragPosition — 과도 당김 저항', () => {
  it('넘친 만큼보다 훨씬 적게 움직이고, 단조 증가한다', () => {
    expect(rubberband(0, 2.5)).toBe(0);
    expect(rubberband(100, 2.5)).toBeLessThan(30);
    expect(rubberband(200, 2.5)).toBeGreaterThan(rubberband(100, 2.5));
  });
  it('범위 안이면 손가락을 그대로 따른다', () => {
    expect(dragPosition({ raw: 120, top: 0, bottom: 400, overTop: true, overBottom: false, factor: 2.5 })).toBe(120);
  });
  it('위로 넘치면 저항, 저항을 끄면 위쪽에 멈춘다', () => {
    const r = dragPosition({ raw: -100, top: 0, bottom: 400, overTop: true, overBottom: false, factor: 2.5 });
    expect(r).toBeLessThan(0);
    expect(r).toBeGreaterThan(-30);
    expect(dragPosition({ raw: -100, top: 0, bottom: 400, overTop: false, overBottom: false, factor: 2.5 })).toBe(0);
  });
  it('닫을 수 있으면 아래는 닫힌 자리에서 멈추고, 닫을 수 없으면 가장 낮은 지점 밑으로 저항', () => {
    expect(dragPosition({ raw: 900, top: 0, bottom: 600, overTop: true, overBottom: false, factor: 2.5 })).toBe(600);
    const r = dragPosition({ raw: 500, top: 0, bottom: 400, overTop: true, overBottom: true, factor: 2.5 });
    expect(r).toBeGreaterThan(400);
    expect(r).toBeLessThan(430);
  });
});

describe('pickSnap — 속도 기반 스냅', () => {
  const pos = [0, 300];
  it('느리게 놓으면 가장 가까운 지점', () => {
    expect(pickSnap(120, 0, pos, null)).toBe(0);
    expect(pickSnap(180, 0, pos, null)).toBe(300);
  });
  it('빠르게 아래로 튕기면 가까운 지점이 위여도 아래로 간다', () => {
    expect(pickSnap(60, 1400, pos, null)).toBe(300);
  });
  it('빠르게 위로 튕기면 위로 간다', () => {
    expect(pickSnap(250, -1400, pos, null)).toBe(0);
  });
  it('닫을 수 있으면 닫힌 자리도 후보', () => {
    expect(pickSnap(520, 0, pos, 600)).toBe(600);
    expect(pickSnap(320, 1600, pos, 600)).toBe(600);
  });
  it('튕김 판정은 한 칸만: 아주 빠른 튕김도 지나치게 건너뛰지 않는다', () => {
    expect(pickSnap(10, 9000, [0, 200, 400], 600)).toBe(200);
  });
  it('튕김 기준은 정확히 500px/s(이상이면 튕김, 499면 투영)', () => {
    expect(FLING_VELOCITY).toBe(500);
    // 위치 10, 후보 [0, 400]: 투영(10 + 0.2×v)은 499에서도 0 쪽이지만, 500이면 아래로 한 칸
    expect(pickSnap(10, 500, [0, 400], null)).toBe(400);
    expect(pickSnap(10, 499, [0, 400], null)).toBe(0);
    expect(pickSnap(390, -500, [0, 400], null)).toBe(0);
    expect(pickSnap(390, -499, [0, 400], null)).toBe(400);
  });
  it('튕김 기준 속도 아래면 투영(위치 + 0.2초 × 속도)만 쓴다', () => {
    expect(pickSnap(100, 400, [0, 400], 800)).toBe(0);
    expect(pickSnap(150, FLING_VELOCITY - 1, [0, 400], 800)).toBe(400);
  });
});

describe('shouldClose — 닫힘 조건', () => {
  it('목적지가 닫힌 자리면 닫는다', () => {
    expect(shouldClose(600, 600)).toBe(true);
    expect(shouldClose(599.8, 600)).toBe(true);
    expect(shouldClose(300, 600)).toBe(false);
  });
  it('닫힘 경계: 닫힌 자리 0.5 안쪽까지만 닫힘, 1px 위 스냅은 열린 자리', () => {
    expect(shouldClose(599.5, 600)).toBe(true);
    expect(shouldClose(599, 600)).toBe(false);
  });
});

describe('stepDetent — 스크린리더 조절(위/아래로 쓸기)', () => {
  it('한 칸씩 오르내리고 끝에서는 멈춘다(닫기는 손잡이 두 번 탭)', () => {
    expect(stepDetent(300, [0, 300], 'up')).toBe(0);
    expect(stepDetent(0, [0, 300], 'up')).toBe(0);
    expect(stepDetent(0, [0, 300], 'down')).toBe(300);
    expect(stepDetent(300, [0, 300], 'down')).toBe(300);
  });
});

describe('stepContentDrag — 안쪽 스크롤과 시트 드래그', () => {
  const base = { top: 0, bottom: 600, scrollable: true };
  it('시트가 덜 펼쳐졌으면 위로 미는 손가락은 시트가 먹는다(스크롤은 묶임)', () => {
    expect(stepContentDrag({ ...base, pos: 300, delta: -50, scrollY: 0 })).toEqual({ pos: 250, sheetOwns: true });
  });
  it('다 펼쳐진 뒤의 위로 미는 손가락은 스크롤 몫', () => {
    expect(stepContentDrag({ ...base, pos: 0, delta: -50, scrollY: 0 })).toEqual({ pos: 0, sheetOwns: false });
  });
  it('위로 밀다 맨 위에 닿으면 넘친 만큼은 버리고 그 자리에서 멈춘다', () => {
    expect(stepContentDrag({ ...base, pos: 20, delta: -50, scrollY: 0 }).pos).toBe(0);
  });
  it('스크롤이 맨 위면 아래로 당기는 손가락은 시트를 내린다', () => {
    expect(stepContentDrag({ ...base, pos: 0, delta: 40, scrollY: 0 })).toEqual({ pos: 40, sheetOwns: true });
  });
  it('스크롤이 내려가 있으면 아래로 당겨도 먼저 스크롤이 올라간다', () => {
    expect(stepContentDrag({ ...base, pos: 0, delta: 40, scrollY: 120 })).toEqual({ pos: 0, sheetOwns: false });
  });
  it('맨 위 스냅이 아니면 스크롤이 내려가 있어도 아래로 끄는 손가락은 시트가 가진다(리뷰 M1 재현: 85%에서 스크롤 → 35%로 내림 → 내용을 아래로)', () => {
    expect(stepContentDrag({ ...base, pos: 300, delta: 40, scrollY: 200 })).toEqual({ pos: 340, sheetOwns: true });
  });
  it('맨 위 판정 경계: scrollY 0.5까지는 맨 위, 1이면 스크롤이 먼저', () => {
    expect(EDGE_EPS).toBe(0.5);
    expect(stepContentDrag({ ...base, pos: 0, delta: 10, scrollY: 0.5 })).toEqual({ pos: 10, sheetOwns: true });
    expect(stepContentDrag({ ...base, pos: 0, delta: 10, scrollY: 1 })).toEqual({ pos: 0, sheetOwns: false });
  });
  it('시트 위치 경계: top + 0.5까지는 맨 위(스크롤 몫), top + 1이면 덜 펼쳐짐(시트 몫)', () => {
    expect(stepContentDrag({ ...base, pos: 0.5, delta: -10, scrollY: 0 })).toEqual({ pos: 0.5, sheetOwns: false });
    expect(stepContentDrag({ ...base, pos: 1, delta: -10, scrollY: 0 })).toEqual({ pos: 0, sheetOwns: true });
  });
  it('맨 위 스냅에서 스크롤이 내려가 있으면 손가락은 어느 방향이든 스크롤 몫(시트는 스크롤을 묶지 않는다)', () => {
    expect(stepContentDrag({ ...base, pos: 0, delta: 30, scrollY: 50 }).sheetOwns).toBe(false);
    expect(stepContentDrag({ ...base, pos: 0, delta: -30, scrollY: 50 }).sheetOwns).toBe(false);
  });
  it('스크롤할 게 없는 내용이면 핸들처럼 위로도 시트가 받는다(저항은 호출 쪽)', () => {
    expect(stepContentDrag({ ...base, scrollable: false, pos: 0, delta: -30, scrollY: 0 })).toEqual({ pos: -30, sheetOwns: true });
  });
});

describe('backdropProgress·settleDuration', () => {
  it('배경은 가장 낮은 지점에서 1, 닫힌 자리에서 0', () => {
    expect(backdropProgress(300, 300, 600)).toBe(1);
    expect(backdropProgress(450, 300, 600)).toBe(0.5);
    expect(backdropProgress(600, 300, 600)).toBe(0);
    expect(backdropProgress(-20, 300, 600)).toBe(1);
  });
  it('모션 줄이기면 0ms(즉시 전환)', () => {
    expect(settleDuration(400, 0, true, 320)).toBe(0);
  });
  it('빠르게 튕길수록 짧지만 아트 8절 반응 범위(140ms) 아래로는 내려가지 않는다', () => {
    const slow = settleDuration(400, 0, false, 320);
    const fast = settleDuration(400, 3000, false, 320);
    expect(slow).toBe(320);
    expect(fast).toBeLessThan(slow);
    expect(fast).toBeGreaterThanOrEqual(140);
  });
});

describe('드래그 수명(리뷰 H1 닫히는 중 드래그·L2 두 손가락)', () => {
  const positions = [0, 300];
  it('열려 있고 아무도 안 쥐었으면 시작한다', () => {
    expect(beginDrag(IDLE_DRAG, 'handle', true, 120)).toEqual({ owner: 'handle', start: 120, raw: 120, prevT: 0, moved: false });
  });
  it('닫히는 중(visible=false)에 잡은 손가락은 무시한다 — 시트를 붙잡아 되돌리지 않는다', () => {
    expect(beginDrag(IDLE_DRAG, 'handle', false, 400)).toBeNull();
    expect(beginDrag(IDLE_DRAG, 'content', false, 400)).toBeNull();
  });
  it('드래그 도중 닫힘 요청이 오면 그 뒤 프레임은 버리고, 놓아도 스냅하지 않는다(닫힘 애니메이션이 맡음)', () => {
    const d = { ...beginDrag(IDLE_DRAG, 'handle', true, 0)!, moved: true };
    expect(ownsDrag(d, 'handle', true)).toBe(true);
    expect(ownsDrag(d, 'handle', false)).toBe(false);
    expect(releaseTarget(d, 'handle', false, 120, 0, positions, 600)).toBeNull();
    expect(releaseTarget(d, 'handle', true, 120, 0, positions, 600)).toBe(0);
  });
  it('움직이지 않은 제스처는 놓아도 아무것도 하지 않는다(안쪽 탭·스크롤만 한 경우)', () => {
    const d = beginDrag(IDLE_DRAG, 'content', true, 0)!;
    expect(releaseTarget(d, 'content', true, 0, 900, positions, 600)).toBeNull();
  });
  it('두 손가락: 먼저 잡은 쪽만 주인, 다른 쪽은 시작도 반영도 못 하고 끝나도 주인을 비우지 않는다', () => {
    const d = beginDrag(IDLE_DRAG, 'handle', true, 0)!;
    expect(beginDrag(d, 'content', true, 0)).toBeNull();
    expect(ownsDrag(d, 'content', true)).toBe(false);
    expect(endDrag(d, 'content')).toBe(d);
    expect(endDrag(d, 'handle')).toEqual(IDLE_DRAG);
  });
});
