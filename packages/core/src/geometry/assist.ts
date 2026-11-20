// 스크린리더용 대체 획 입력(D-08, 리뷰 C10-③): 좌표 없이 '자리 · 방향 · 길이 · 휨'을 골라 한 획을 만든다.
// 스크린리더의 두 번 탭은 요소 가운데 좌표로 가서 '시작점·끝점 누르기'가 같은 점이 된다 → 고르기 방식.
// 결과는 손획과 같은 정본 점열(핵 중심 원점, W 단위, t ms)이라 sim에는 같은 stroke 이벤트로 들어간다(D-13).
// 모양은 고른 사람 것(D-02): 방향·길이·휨이 곧 손의 모양이고, 자리는 몸이 D-12 부착으로 고른다.
import { coreRadius1 } from './core';
import type { BodyShape, RawPoint } from './types';

export interface AssistChoice {
  /** 시작 자리: 몸 둘레 8곳(0 = 위, 시계 방향 45°씩 — 2 = 오른쪽(앞), 4 = 아래, 6 = 왼쪽(등)) */
  place: number;
  /** 긋는 방향: 화면 기준 8방향(0 = 위쪽, 2 = 오른쪽, 4 = 아래쪽, 6 = 왼쪽) */
  dir: number;
  /** 길이 3단: 0 짧게 · 1 보통 · 2 길게 */
  len: 0 | 1 | 2;
  /** 휨 5단: −2(왼쪽으로 크게) .. 0(곧게) .. +2(오른쪽으로 크게). 긋는 방향을 보고 왼쪽·오른쪽 */
  bend: -2 | -1 | 0 | 1 | 2;
}

export const ASSIST = {
  places: 8,
  dirs: 8,
  /** 길이(W). 0.35W는 sim 최소 길이 0.05W보다 넉넉히 길고, 0.9W는 L2 길이 상한(0.7W)을 넘어 축소 경로도 탄다 */
  lens: [0.35, 0.6, 0.9] as const,
  /** 휨 한 단 = 현 길이 대비 처짐 */
  bendStep: 0.16,
  /** 긋는 시간(ms): 짧은 획일수록 빠르게. 성향 측정(speed)이 한쪽으로 쏠리지 않게 보통 손 빠르기 근처 */
  ms: [520, 760, 1000] as const,
  /** 시작점이 몸 표면에서 떨어진 거리(W) */
  startGap: 0.12,
  points: 41,
} as const;

/** 기본 = 오른쪽(앞) 옆구리에서 아래로 짧게, 몸 쪽으로 조금 휨 — 그대로 그어도 앞 옆구리를 감싸는 두름 한 획 */
export const ASSIST_DEFAULT: AssistChoice = { place: 2, dir: 4, len: 0, bend: 1 };

const mod = (v: number, n: number) => ((Math.round(v) % n) + n) % n;

/** 고른 값 정리(범위 밖은 감아 돌거나 묶는다) */
export function clampChoice(c: AssistChoice): AssistChoice {
  'worklet';
  return {
    place: mod(c.place, ASSIST.places),
    dir: mod(c.dir, ASSIST.dirs),
    len: Math.max(0, Math.min(2, Math.round(c.len))) as AssistChoice['len'],
    bend: Math.max(-2, Math.min(2, Math.round(c.bend))) as AssistChoice['bend'],
  };
}

/**
 * 고른 값 → 정본 점열(핵 중심, W 단위). s = 지금 핵 크기(시작점을 지금 몸 둘레에 둔다).
 * 결정적: 같은 고름·같은 s → 같은 점열. 점 41개, 시간은 부드럽게 가속·감속(smoothstep).
 */
export function assistStroke(choice: AssistChoice, s: number, shape?: BodyShape): RawPoint[] {
  'worklet';
  const c = clampChoice(choice);
  const th = (c.place * Math.PI * 2) / ASSIST.places;
  const r = coreRadius1(th, shape ? shape.core : undefined) * s + ASSIST.startGap;
  const ax = Math.sin(th) * r;
  const ay = -Math.cos(th) * r;
  const L = ASSIST.lens[c.len];
  const d = (c.dir * Math.PI * 2) / ASSIST.dirs;
  const ux = Math.sin(d);
  const uy = -Math.cos(d);
  const bx = ax + ux * L;
  const by = ay + uy * L;
  // 휨: 긋는 방향의 오른쪽(화면, ux,uy를 시계 방향 90°) = (−uy, ux)
  const sag = c.bend * ASSIST.bendStep * L * 2;
  const cx = (ax + bx) / 2 - uy * sag;
  const cy = (ay + by) / 2 + ux * sag;
  const ms = ASSIST.ms[c.len];
  const out: RawPoint[] = [];
  const n = ASSIST.points - 1;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = (1 - u) * (1 - u);
    const b = 2 * (1 - u) * u;
    const e = u * u;
    // 시간은 smoothstep의 역으로: 가운데가 빠르고 양 끝이 느린 손 붓질
    const tt = u < 0.5 ? Math.sqrt(u / 2) : 1 - Math.sqrt((1 - u) / 2);
    out.push({ x: a * ax + b * cx + e * bx, y: a * ay + b * cy + e * by, t: Math.round(tt * ms) });
  }
  return out;
}
