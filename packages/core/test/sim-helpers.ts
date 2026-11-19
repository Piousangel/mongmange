// sim 테스트 공용 도우미(테스트 전용). Date.UTC는 고정 시각을 만드는 데만 쓴다(Date.now 금지).
import { sim, type RawPoint } from '../src/index';

export const H = 3_600_000;
export const MIN = 60_000;
export const KST = 540;
export const PST = -480;

/** 한국 현지 시각 → UTC ms */
export function kst(m: number, d: number, h: number, min = 0): number {
  return Date.UTC(2026, m - 1, d, h, min) - KST * MIN;
}

/** 몸 오른쪽에서 바깥으로 휘는 결정적 손획(W 단위, 핵 중심 원점) */
export function handStroke(seed = 1, ms = 900, n = 90): RawPoint[] {
  const out: RawPoint[] = [];
  const a0 = 1.4 + (seed % 5) * 0.5;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const th = a0 + u * 1.2;
    const r = 0.56 + u * 0.2 + Math.sin(u * 9 + seed) * 0.004;
    out.push({ x: Math.sin(th) * r, y: -Math.cos(th) * r, t: Math.round(u * ms) });
  }
  return out;
}

export type Run = { state: sim.State; effects: sim.Effect[] };

/** 이벤트 열을 차례로 적용하고 모든 효과를 모은다 */
export function play(s: sim.State, events: sim.Event[]): Run {
  let state = s;
  const effects: sim.Effect[] = [];
  for (const e of events) {
    const r = sim.reduce(state, e);
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
}

export function tickTo(s: sim.State, now: number): Run {
  return sim.tick(s, now);
}

export function times(effects: sim.Effect[], type: 'slept' | 'woke'): number[] {
  return effects.filter((e) => e.type === type).map((e) => (e as { at: number }).at);
}

/**
 * 합성 손획 분포(편향 테스트용, [팀 추정]): 몸 둘레 0.4~1.4W 어디서든 시작, 방향 무작위, 길이 0.2~1.6W, 0.2~2.5초, 약한 휨.
 * 실제 손 데이터(스파이크 02)가 오면 이 분포를 교체하고 LEDGER 상수를 다시 맞춘다.
 */
export function synthStroke(r: () => number): RawPoint[] {
  const a = r() * 2 * Math.PI;
  const r0 = 0.4 + r() * 1.0;
  const dir = r() * 2 * Math.PI;
  const L = 0.2 + r() * 1.4;
  const ms = 200 + r() * 2300;
  const bend = (r() - 0.5) * 1.2;
  const n = 40;
  const out: RawPoint[] = [];
  let x = Math.sin(a) * r0;
  let y = -Math.cos(a) * r0;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const th = dir + bend * u;
    if (i > 0) {
      x += (Math.cos(th) * L) / (n - 1);
      y += (Math.sin(th) * L) / (n - 1);
    }
    out.push({ x, y, t: Math.round(u * ms) });
  }
  return out;
}
