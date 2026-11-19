// 속성 기반 테스트(시드 고정 무작위 사례, 외부 라이브러리 없이).
import { describe, expect, it } from 'vitest';
import { sim } from '../src/index';
import { H, KST, MIN, handStroke, kst, play, synthStroke } from './sim-helpers';

// 이 파일의 테스트는 수백 사례를 도는 속성 테스트라 단독 0.2~1.3초, 전체 스위트(무거운 body.test와 병렬)에서는 CPU 경합으로
// Vitest 기본 5초를 가끔 넘었다(11-20 PM 재현 1/5 실패의 실제 원인 = TestTimeoutError, 값은 늘 같았다). 넉넉히 30초를 준다.
const HEAVY_MS = 30_000;

const TZS = [540, -480, 0, 330, -300, 600];

function rnd(seed: number) {
  let s = seed;
  return () => {
    const o = sim.rngNext(s);
    s = o.seed;
    return o.value;
  };
}

/** 무작위 설치 + 첫 세션 입력 + 백그라운드(또는 켜 둔 채) */
function randomStart(r: () => number): sim.State {
  const install = Date.UTC(2026, 10, 20) + Math.floor(r() * 48 * 60) * MIN;
  const tz = TZS[Math.floor(r() * TZS.length)]!;
  let s = sim.createInitial(install, tz, Math.floor(r() * 1e9));
  const ev: sim.Event[] = [];
  if (r() < 0.7) ev.push({ type: 'grind', at: install + MIN, durationMs: r() * 20000 });
  if (r() < 0.8) ev.push({ type: 'stroke', at: install + 2 * MIN, raw: handStroke(1 + Math.floor(r() * 9), 300 + r() * 2000) });
  if (r() < 0.8) ev.push({ type: 'tap', at: install + 3 * MIN, target: 'body', holdMs: r() * 3000, x: 0, y: 0, moveSpeed: r() * 0.3 });
  if (r() < 0.5) ev.push({ type: 'setTimes', at: install + 4 * MIN, bedtimeLocalMin: Math.floor(r() * 1440), morningLocalMin: Math.floor(r() * 1440) });
  if (r() < 0.85) ev.push({ type: 'appBackground', at: install + 5 * MIN });
  s = play(s, ev).state;
  return s;
}

describe('속성: 한 번에 tick == 잘게 나눠 tick', () => {
  it('tick(s, t0 + 72h) 한 번 == 1시간씩 72번 (무작위 200사례)', () => {
    const r = rnd(20261120);
    for (let c = 0; c < 200; c++) {
      const s = randomStart(r);
      const t0 = s.clock.lastSimAt;
      const once = sim.tick(s, t0 + 72 * H);
      let step = s;
      const effects: sim.Effect[] = [];
      for (let i = 1; i <= 72; i++) {
        const o = sim.tick(step, t0 + i * H);
        step = o.state;
        effects.push(...o.effects);
      }
      expect(step).toEqual(once.state);
      expect(effects).toEqual(once.effects);
    }
  }, HEAVY_MS);

  it('임의 분할(불규칙 간격)도 같다', () => {
    const r = rnd(7);
    for (let c = 0; c < 100; c++) {
      const s = randomStart(r);
      const t0 = s.clock.lastSimAt;
      const T = Math.floor(r() * 72 * H);
      const once = sim.tick(s, t0 + T).state;
      let step = s;
      let t = t0;
      while (t < t0 + T) {
        t = Math.min(t0 + T, t + Math.floor(r() * 7 * H));
        step = sim.tick(step, t).state;
      }
      expect(step).toEqual(once);
    }
  }, HEAVY_MS);
});

describe('속성: 불변식', () => {
  it('무작위 30일 이벤트 열(역행·점프·setTimes·씻기 포함): 하루 획 ≤ 1, 잠·깸 번갈아, lastSimAt = hwm, 한 번에 +4일 이하, 첫 7장 장면 중복 없음, 마름 ≤ 0.6, 깸 간격 ≥ 12h, 같은 결 3밤 연속 없음', () => {
    const r = rnd(42);
    for (let c = 0; c < 40; c++) {
      let s = randomStart(r);
      let t = s.clock.lastSimAt;
      let hwm = s.clock.hwm;
      const wakes: number[] = [];
      let lastFlip: string | null = null;
      let netStrokes = 0;
      for (let i = 0; i < 80; i++) {
        // 가끔 시계를 되돌리거나 크게 건너뛴다
        const jump = r() < 0.05 ? -Math.floor(r() * 5 * H) : r() < 0.05 ? Math.floor(r() * 100 * H) : Math.floor(r() * 10 * H);
        t += jump;
        const pick = r();
        const e: sim.Event =
          pick < 0.25
            ? { type: 'appForeground', at: t, tzOffsetMin: TZS[Math.floor(r() * TZS.length)]! }
            : pick < 0.45
              ? { type: 'appBackground', at: t }
              : pick < 0.6
                ? { type: 'stroke', at: t, raw: handStroke(1 + Math.floor(r() * 9), 200 + r() * 3000) }
                : pick < 0.7
                  ? { type: 'grind', at: t, durationMs: r() * 30000 }
                  : pick < 0.76
                    ? { type: 'tap', at: t, target: r() < 0.5 ? 'body' : 'paper', holdMs: r() * 4000, x: r() * 2 - 1, y: r() * 2 - 1, moveSpeed: r() }
                    : pick < 0.82
                      ? { type: 'putToSleep', at: t }
                      : pick < 0.9
                        ? { type: 'developCard', at: t }
                        : pick < 0.95
                          ? { type: 'washStroke', at: t + Math.floor(r() * 6000) }
                          : { type: 'setTimes', at: t, bedtimeLocalMin: Math.floor(r() * 1440), morningLocalMin: Math.floor(r() * 1440) };
        const before = s.dayIndex;
        const o = sim.reduce(s, e);
        s = o.state;
        for (const ef of o.effects) {
          if (ef.type === 'woke') {
            wakes.push(ef.at);
            netStrokes = 0;
          }
          if (ef.type === 'slept' || ef.type === 'woke') {
            expect(ef.type).not.toBe(lastFlip);
            lastFlip = ef.type;
          }
          if (ef.type === 'strokeAccepted') netStrokes++;
          if (ef.type === 'strokeWashed') netStrokes--;
          expect(netStrokes).toBeLessThanOrEqual(1);
        }
        expect(s.dayIndex - before).toBeLessThanOrEqual(4);
        expect(s.clock.lastSimAt).toBe(s.clock.hwm);
        const first7 = [...s.cards, ...(s.pendingCard ? [s.pendingCard] : [])].slice(0, 7).map((c) => `${c.motifId}/${c.composition}`);
        expect(new Set(first7).size).toBe(first7.length);
        expect(s.clock.hwm).toBeGreaterThanOrEqual(hwm);
        hwm = s.clock.hwm;
        for (const k of sim.AXES) expect(Math.abs(s.temperament[k])).toBeLessThan(0.85);
        expect(sim.dryness(s, s.clock.lastSimAt)).toBeLessThanOrEqual(0.6);
        const h = s.focusHistory;
        for (let j = 2; j < h.length; j++) if (h[j]) expect(h[j] === h[j - 1] && h[j] === h[j - 2]).toBe(false);
      }
      for (let j = 1; j < wakes.length; j++) expect(wakes[j]! - wakes[j - 1]!).toBeGreaterThanOrEqual(12 * H);
    }
  }, HEAVY_MS);

  // 허용 오차의 근거(11-20):
  // - 입력은 고정 시드(rnd(9000), 유저 i = createInitial 시드 i)라 같은 소스면 늘 같은 값이 나온다(간헐 실패의 원인은 시간 초과, 파일 머리 주석).
  // - 예전 고정 오차(하루 0.07·전체 0.03·성향 0.05)는 표본오차 끝에 붙어 있었다(dist 하루 평균 최대 편차 0.068 ≈ 2.9SE).
  //   그래서 geometry(부착·coreSdf)를 조금만 고쳐도 측정값이 움직여 결과가 뒤집힐 수 있었다.
  // - 이제 오차 = Z × 표본 표준오차(표본 표준편차 / √n)이고 Z = 4다. 비교가 36개(측정 4 × (7일 + 전체) + 성향 4)라,
  //   본페로니로 하면 오탐 확률은 비교당 6e-5, 전체 약 0.2%다. 그러면서도 잡아야 할 구조적 쏠림
  //   (옛 novel·dist 최솟값 방식 → curiosity 약 −0.5, 리뷰 1-5)은 SE(≈0.01~0.02)의 수십 배라 확실히 걸린다.
  // - 200명 기준 SE: 측정 하루 0.010~0.024, 성향 0.006~0.018(11-20 실측).
  it('편향(장부 경로): 무작위 손획·먹 갈기·탭을 reduce에 넣은 200명 7일 — 측정값 평균이 날짜가 가도 0.5 근처, 성향 평균 0 근처(각 4SE 안)', () => {
    const r = rnd(9000);
    const N = 200;
    const finals: Record<sim.AxisId, number[]> = { tempo: [], boldness: [], closeness: [], curiosity: [] };
    const perDay: Record<string, number[][]> = { speed: [], len: [], dist: [], novel: [] };
    for (let i = 0; i < N; i++) {
      let s = sim.createInitial(kst(11, 20, 19), KST, i);
      for (let d = 0; d < 7; d++) {
        const base = kst(11, 20 + d, 19);
        const ev: sim.Event[] = [
          { type: 'grind', at: base + MIN, durationMs: r() * 20000 },
          { type: 'stroke', at: base + 2 * MIN, raw: synthStroke(r) },
          { type: 'tap', at: base + 3 * MIN, target: 'body', holdMs: r() * 17600, x: 0, y: 0, moveSpeed: r() * 0.4 },
        ];
        const pets = Math.floor(r() * 5);
        for (let k = 0; k < pets; k++) ev.push({ type: 'tap', at: base + 4 * MIN + k, target: 'body', holdMs: 100, x: 0, y: 0 });
        for (let k = 0; k < 3; k++) ev.push({ type: 'tap', at: base + 5 * MIN + k, target: 'paper', holdMs: 60, x: (r() - 0.5) * 2.4, y: (r() - 0.5) * 2.4 });
        s = play(s, ev).state;
        const m = s.ledger.stroke!;
        for (const k of ['speed', 'len', 'dist', 'novel'] as const) (perDay[k]![d] ??= []).push(m[k]);
        s = play(s, [
          { type: 'appBackground', at: base + 10 * MIN },
          { type: 'appForeground', at: base + 13 * H, tzOffsetMin: KST },
        ]).state;
      }
      for (const k of sim.AXES) finals[k].push(s.temperament[k]);
    }
    // 획이 쌓여도 측정값이 한쪽으로 흐르지 않는다(옛 novel·dist = 최솟값 방식은 획이 쌓일수록 한쪽으로 흘렀다, 리뷰 1-5)
    const Z = 4;
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const se = (a: number[]) => {
      const m = mean(a);
      return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1) / a.length);
    };
    const within = (a: number[], target: number, label: string) => {
      const m = mean(a);
      const tol = Z * se(a);
      expect(Math.abs(m - target), `${label} 평균 ${m.toFixed(3)}, 허용 ${tol.toFixed(3)}(4SE)`).toBeLessThanOrEqual(tol); // 분산 0(0일차 novel = 늘 0.5)이면 정확히 같아야 한다
    };
    for (const k of ['speed', 'len', 'dist', 'novel'] as const) {
      for (let d = 0; d < 7; d++) within(perDay[k]![d]!, 0.5, `${k} ${d}일`);
      within(perDay[k]!.flat(), 0.5, `${k} 전체`);
    }
    for (const k of sim.AXES) within(finals[k]!, 0, `성향 ${k}`);
  }, HEAVY_MS);
});
