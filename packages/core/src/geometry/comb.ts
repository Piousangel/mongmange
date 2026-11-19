// E 빗(종 표식, 시스템 전용): 정수리 오른쪽 1시 뿌리에서 몸에 붙어 돋는 가로획 세 가닥.
// 뿌리는 몸 안으로 묻혀 몸 마스크와 한 덩어리가 된다(떠 있는 틱 금지, 아트 1-4).
import { COMB, FORBIDDEN, coreScale, combGrowth } from '../visual/bodySpec';
import { angleOf, coreRadius1, coreSdf, isForbidden, nearestAllowed } from './core';
import type { RawPoint } from './types';

export interface CombPose {
  /** 기본 각도(도, + = 위). 기쁨 +20, 졸림 −25 */
  angle: number;
  /** 가닥 사이 부채꼴 벌어짐(도). 놀람 때 크게 */
  spread: number;
  /** 돋는 진행 0..1(첫 30초 3.2~3.8초) */
  grow: number;
  /** 가닥별 추가 흔들림(도) */
  wobble0: number;
  wobble1: number;
  wobble2: number;
}

// render-03: 위 가닥을 수평에 더 가깝게(±15° 안에서 0~5°) — 부채꼴로 벌어지면 불꽃·털 뭉치로 읽힌다
export const COMB_REST: CombPose = { angle: 1, spread: 2, grow: 1, wobble0: 0, wobble1: 0, wobble2: 0 };

/** 오른쪽 표면에서 y가 target인 점의 θ(0..150°) */
function thetaAtY(targetY: number, s: number): number {
  'worklet';
  let lo = 0;
  let hi = (150 * Math.PI) / 180;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const y = -Math.cos(mid) * coreRadius1(mid) * s;
    if (y < targetY) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 가닥 세 개의 스파인 점열(W, 핵 중심)과 점별 폭. n = 획 수, s = 핵 크기 */
export function combStrands(n: number, s: number, pose: CombPose): { pts: RawPoint[]; widths: number[] }[] {
  'worklet';
  const g = combGrowth(n);
  const thick = g.thick * Math.max(pose.grow, 0.001);
  const th0 = COMB.topRootTheta;
  const yTop = -Math.cos(th0) * coreRadius1(th0) * s;
  void thetaAtY;
  const pitch = g.thick * (1 + COMB.gapRatio);
  const out: { pts: RawPoint[]; widths: number[] }[] = [];
  const wob = [pose.wobble0, pose.wobble1, pose.wobble2];
  for (let k = 0; k < 3; k++) {
    const yk = yTop + k * pitch;
    const ang0 = ((pose.angle + (1 - k) * pose.spread + wob[k]!) * Math.PI) / 180;
    // 가닥 방향 광선이 몸을 빠져나가는 점(E) — 돌출 길이가 정확히 len이 되도록
    const ux = Math.cos(ang0);
    const uy = -Math.sin(ang0);
    // 몸 안 출발점: 그 높이의 몸 가운데(앞 기울기 쪽)
    const x0 = 0.04 * s;
    let lo = 0;
    let hi = 1.2;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (coreSdf(x0 + ux * mid, yk + uy * mid, s) < 0) lo = mid;
      else hi = mid;
    }
    const ex = x0 + ux * lo;
    const ey = yk + uy * lo;
    const len = g.protrude * COMB.ratios[k]! * pose.grow;
    // 끝이 살짝 위로 휨(아트: 휨 반경 ≥ 0.5W). render-03: 휨을 0.5 → 0.2로 줄여 `01e`처럼 곧은 세 획에 가깝게(휜 가닥 셋 = 불꽃·손가락)
    const bendR = 1.1;
    const bendK = 0.2;
    const seg = 10;
    const pts: RawPoint[] = [];
    const widths: number[] = [];
    // 뿌리: 표면 점에서 핵 중심 쪽으로 rootInset만큼 묻는다(정수리 쪽으로 새어 나가지 않게)
    const cl = Math.hypot(ex, ey) || 1;
    pts.push({ x: ex - (ex / cl) * COMB.rootInset, y: ey - (ey / cl) * COMB.rootInset, t: 0 });
    widths.push(thick * 1.1);
    for (let i = 0; i <= seg; i++) {
      const along = (len * i) / seg;
      const a = ang0 + (along / bendR) * bendK;
      pts.push({ x: ex + Math.cos(a) * along, y: ey - Math.sin(a) * along, t: 10 + i * 10 });
      const tip = along / Math.max(len, 1e-4);
      // render-03: 실 테이퍼(끝 38%) 대신 붓을 뗀 둥근 끝 — 끝 폭은 뿌리의 COMB.tipRatio 이상(털·불꽃 금지).
      // 짧은 비백은 렌더러의 칠(문법 셰이더)이 끝 18%에만 얹는다.
      widths.push(thick * (1 - (1 - COMB.tipRatio) * tip * tip));
    }
    out.push({ pts, widths });
  }
  return out;
}

/** 빗 가닥이 몸을 빠져나가는 뿌리 각도(θ, 라디안) 세 개 */
export function combRootThetas(n: number, s: number, poseIn?: CombPose): number[] {
  'worklet';
  const pose = poseIn ?? COMB_REST;
  const st = combStrands(n, s, pose);
  const out: number[] = [];
  for (let k = 0; k < st.length; k++) out.push(angleOf(st[k]!.pts[1]!.x, st[k]!.pts[1]!.y));
  return out;
}

/**
 * D-12 금지 자리 ①을 빗 기하에서 파생(render-03, 리뷰 1-3 결정 1): 상한 = 0~7획 쉬는 빗의 맨 아래 가닥 뿌리 각 중 최대 + 여유.
 * 빗 길이·각도가 바뀌면 금지 자리도 따라간다. 하한(−25°)과 꼬리 자리 ②는 bodySpec 값 그대로.
 */
export function deriveForbidden(marginIn?: number): (readonly [number, number])[] {
  'worklet';
  const margin = marginIn ?? COMB.forbiddenMargin;
  let hi = FORBIDDEN[0]![1];
  for (let n = 0; n <= 7; n++) {
    const th = combRootThetas(n, coreScale(n));
    for (let k = 0; k < th.length; k++) hi = Math.max(hi, th[k]! + margin);
  }
  const out: (readonly [number, number])[] = [[FORBIDDEN[0]![0], hi]];
  for (let i = 1; i < FORBIDDEN.length; i++) out.push(FORBIDDEN[i]!);
  return out;
}

/** 지금 쓰는 금지 자리(빗에서 파생) */
export const FORBIDDEN_ZONES: readonly (readonly [number, number])[] = deriveForbidden();

/** 파생 금지 자리 안인가(점 단위 판정에도 쓴다) */
export function isForbiddenNow(theta: number): boolean {
  'worklet';
  return isForbidden(theta, FORBIDDEN_ZONES);
}

/** 파생 금지 자리면 가장 가까운 허용 경계로 */
export function nearestAllowedNow(theta: number): number {
  'worklet';
  return nearestAllowed(theta, undefined, FORBIDDEN_ZONES);
}
