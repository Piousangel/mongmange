// D-07 시간 규칙(systems-v1 3절) 시나리오 표.
import { describe, expect, it } from 'vitest';
import { sim } from '../src/index';
import { H, KST, MIN, PST, handStroke, kst, play, tickTo, times } from './sim-helpers';

describe('D-07 첫날 예외·깨는 시각', () => {
  it('21:00 설치 → 21:10 닫음 → 23:00 자동 잠 → 06:00 깸 → 08:00 열면 아침 현상', () => {
    const s0 = sim.createInitial(kst(11, 20, 21), KST, 7);
    expect(s0.phase).toBe('awake');
    expect(s0.lastWakeAt).toBe(kst(11, 20, 6)); // min(설치, 직전 아침)
    const r = play(s0, [
      { type: 'appBackground', at: kst(11, 20, 21, 10) },
      { type: 'appForeground', at: kst(11, 21, 8), tzOffsetMin: KST },
    ]);
    expect(times(r.effects, 'slept')).toEqual([kst(11, 20, 23)]);
    expect(times(r.effects, 'woke')).toEqual([kst(11, 21, 6)]);
    expect(r.state.phase).toBe('awake');
    expect(r.state.dayIndex).toBe(1);
    expect(r.state.pendingCard).not.toBeNull();
    const dev = sim.reduce(r.state, { type: 'developCard', at: kst(11, 21, 8, 1) });
    expect(dev.effects.some((e) => e.type === 'cardDeveloped')).toBe(true);
    expect(dev.state.pendingCard).toBeNull();
    expect(dev.state.cards).toHaveLength(1);
  });

  it('01:00 설치 → 01:30 닫음 → 01:30 잠 → 07:30부터 깸', () => {
    const s0 = sim.createInitial(kst(11, 21, 1), KST, 7);
    expect(s0.lastWakeAt).toBe(kst(11, 20, 6));
    const r = play(s0, [
      { type: 'appBackground', at: kst(11, 21, 1, 30) },
      { type: 'appForeground', at: kst(11, 21, 8), tzOffsetMin: KST },
    ]);
    expect(times(r.effects, 'slept')).toEqual([kst(11, 21, 1, 30)]);
    expect(times(r.effects, 'woke')).toEqual([kst(11, 21, 7, 30)]);
  });

  for (const [label, install, close] of [
    ['05:50 설치 → 06:10 닫음', kst(11, 21, 5, 50), kst(11, 21, 6, 10)],
    ['03:00 설치 → 07:00 닫음', kst(11, 21, 3), kst(11, 21, 7)],
  ] as const) {
    it(`${label}: 이미 끝난 밤에 바로 자지 않는다 → 12:00에 깨어 있고 23:00 잠, 다음 날 06:00 깸(리뷰 1-1)`, () => {
      const r = play(sim.createInitial(install, KST, 2), [
        { type: 'appBackground', at: close },
        { type: 'appForeground', at: kst(11, 21, 12), tzOffsetMin: KST },
      ]);
      expect(times(r.effects, 'slept')).toEqual([]);
      expect(r.state.phase).toBe('awake');
      const next = play(r.state, [
        { type: 'appBackground', at: kst(11, 21, 12, 10) },
        { type: 'appForeground', at: kst(11, 22, 7), tzOffsetMin: KST },
      ]);
      expect(times(next.effects, 'slept')).toEqual([kst(11, 21, 23)]);
      expect(times(next.effects, 'woke')).toEqual([kst(11, 22, 6)]);
    });
  }

  it('재우기 가능 경계: 깬 지 8h 전이면 [잠 −2h, 아침) 창 안에서만', () => {
    const s = { ...sim.createInitial(kst(11, 20, 14), KST, 1), lastWakeAt: kst(11, 20, 14) };
    expect(sim.canPutToSleep(s, kst(11, 20, 20, 59))).toBe(false);
    expect(sim.canPutToSleep(s, kst(11, 20, 21))).toBe(true);
    expect(sim.inLocalWindow(kst(11, 21, 5, 59), 21 * 60, 6 * 60, KST)).toBe(true);
    expect(sim.inLocalWindow(kst(11, 21, 6), 21 * 60, 6 * 60, KST)).toBe(false);
  });

  it('setTimes 잘못된 값(범위 밖·소수)은 무시한다', () => {
    const s0 = sim.createInitial(kst(11, 20, 9), KST, 1);
    for (const [b, m] of [
      [1440, 360],
      [-1, 360],
      [600.5, 360],
      [1380, 2000],
    ]) {
      const r = sim.reduce(s0, { type: 'setTimes', at: kst(11, 20, 9, 1), bedtimeLocalMin: b!, morningLocalMin: m! });
      expect([r.state.bedtimeLocalMin, r.state.morningLocalMin]).toEqual([23 * 60, 6 * 60]);
    }
  });

  it('09:00 설치, 저녁에 닫음 → 23:00 잠, 다음 날 07:30 열면 아침', () => {
    const r = play(sim.createInitial(kst(11, 20, 9), KST, 1), [
      { type: 'appBackground', at: kst(11, 20, 20) },
      { type: 'appForeground', at: kst(11, 21, 7, 30), tzOffsetMin: KST },
    ]);
    expect(times(r.effects, 'slept')).toEqual([kst(11, 20, 23)]);
    expect(times(r.effects, 'woke')).toEqual([kst(11, 21, 6)]);
    expect(r.state.pendingCard).not.toBeNull();
  });

  it('앱이 켜져 있으면 잠 시각이 지나도 자동으로 자지 않는다(하품만)', () => {
    const r = tickTo(sim.createInitial(kst(11, 20, 9), KST, 1), kst(11, 21, 1));
    expect(r.state.phase).toBe('awake');
  });

  it('05:30에 늦게 재움 → 08:00 열면 아직 잠, 11:30부터 깸', () => {
    const s0 = sim.createInitial(kst(11, 20, 9), KST, 1);
    const r = play(s0, [
      { type: 'putToSleep', at: kst(11, 21, 5, 30) },
      { type: 'appBackground', at: kst(11, 21, 5, 31) },
      { type: 'appForeground', at: kst(11, 21, 8), tzOffsetMin: KST },
    ]);
    expect(r.state.phase).toBe('asleep');
    expect(sim.wakeableAt(r.state)).toBe(kst(11, 21, 11, 30));
    expect(times(tickTo(r.state, kst(11, 21, 11, 31)).effects, 'woke')).toEqual([kst(11, 21, 11, 30)]);
  });

  it('14:00 낮에 재우기(깬 뒤 8h) → 20:00이 아니라 다음 날 06:00 깸', () => {
    // 전날 밤 자고 06:00에 깬 상태를 만든다
    const day1 = play(sim.createInitial(kst(11, 20, 20), KST, 1), [
      { type: 'appBackground', at: kst(11, 20, 20, 30) },
      { type: 'appForeground', at: kst(11, 21, 9), tzOffsetMin: KST },
    ]).state;
    expect(day1.lastWakeAt).toBe(kst(11, 21, 6));
    // 13:00은 깬 지 7h, 잠 시각 −2h 전 → 거절
    const early = sim.reduce(day1, { type: 'putToSleep', at: kst(11, 21, 13) });
    expect(early.state.phase).toBe('awake');
    expect(early.effects.some((e) => e.type === 'notSleepy')).toBe(true);
    const r = play(early.state, [
      { type: 'putToSleep', at: kst(11, 21, 14) },
      { type: 'appBackground', at: kst(11, 21, 14, 1) },
      { type: 'appForeground', at: kst(11, 22, 7), tzOffsetMin: KST },
    ]);
    expect(times(r.effects, 'slept')).toEqual([kst(11, 21, 14)]);
    expect(times(r.effects, 'woke')).toEqual([kst(11, 22, 6)]);
  });

  it('야간 근무(잠 08:00, 아침 16:00) → 08:00 잠, 16:00 이후 아침', () => {
    const s0 = sim.createInitial(kst(11, 20, 17), KST, 1);
    const r = play(s0, [
      { type: 'setTimes', at: kst(11, 20, 17, 1), bedtimeLocalMin: 8 * 60, morningLocalMin: 16 * 60 },
      { type: 'appBackground', at: kst(11, 20, 17, 5) },
      { type: 'appForeground', at: kst(11, 21, 17), tzOffsetMin: KST },
    ]);
    expect(times(r.effects, 'slept')).toEqual([kst(11, 21, 8)]);
    expect(times(r.effects, 'woke')).toEqual([kst(11, 21, 16)]);
  });
});

describe('D-07 시간대 이동', () => {
  it('서울 23:00에 잠 → LA 08:00에 열면 새 현지 아침(LA 다음 날 06:00)에 깬다', () => {
    const s0 = sim.createInitial(kst(11, 20, 20), KST, 1);
    const r = play(s0, [
      { type: 'appBackground', at: kst(11, 20, 20, 10) },
      { type: 'appForeground', at: Date.UTC(2026, 10, 20, 16), tzOffsetMin: PST }, // LA 11-20 08:00
    ]);
    expect(times(r.effects, 'slept')).toEqual([kst(11, 20, 23)]);
    expect(r.state.phase).toBe('asleep');
    expect(sim.wakeableAt(r.state)).toBe(Date.UTC(2026, 10, 21, 14)); // LA 11-21 06:00
  });

  /** 서쪽(서울→LA)·동쪽(LA→서울) 모두: 깸 사이 ≥ 12h, 잠 한 번에 깸 한 번 */
  function journey(fromTz: number, toTz: number) {
    const local = (tz: number, utcBase: number) => utcBase - tz * MIN;
    const start = local(fromTz, Date.UTC(2026, 10, 20, 20));
    const events: sim.Event[] = [
      { type: 'appBackground', at: start + 10 * MIN },
      { type: 'appForeground', at: start + 11 * H, tzOffsetMin: fromTz }, // 다음 날 07:00 현지
      { type: 'appBackground', at: start + 13 * H }, // 출발
      { type: 'appForeground', at: start + 24 * H, tzOffsetMin: toTz }, // 도착
      { type: 'appBackground', at: start + 24 * H + 30 * MIN },
    ];
    for (let d = 1; d <= 4; d++) {
      events.push({ type: 'appForeground', at: start + (24 + 12 * d) * H, tzOffsetMin: toTz });
      events.push({ type: 'appBackground', at: start + (24 + 12 * d) * H + 20 * MIN });
    }
    return play(sim.createInitial(start, fromTz, 3), events);
  }
  for (const [name, a, b] of [
    ['서울 → LA', KST, PST],
    ['LA → 서울', PST, KST],
  ] as const) {
    it(`${name}: 하루가 두 번 오지 않는다`, () => {
      const r = journey(a, b);
      const wakes = times(r.effects, 'woke');
      const sleeps = times(r.effects, 'slept');
      expect(wakes.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < wakes.length; i++) expect(wakes[i]! - wakes[i - 1]!).toBeGreaterThanOrEqual(12 * H);
      // 잠과 깸이 번갈아 온다
      const seq = r.effects.filter((e) => e.type === 'slept' || e.type === 'woke').map((e) => e.type);
      for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
      expect(sleeps.length - wakes.length).toBeGreaterThanOrEqual(0);
      expect(r.state.clock.tzOffsetMin).toBe(b);
    });
  }
});

describe('D-07 시계 조작·오프라인 정산', () => {
  it('시계 역행: 경과 0, hwm 유지, 1시간 넘으면 rewind 표시', () => {
    const s0 = sim.createInitial(kst(11, 20, 9), KST, 1);
    const a = tickTo(s0, kst(11, 20, 12)).state;
    const back = sim.reduce(a, { type: 'tap', at: kst(11, 20, 9), target: 'body', holdMs: 100, x: 0, y: 0 });
    expect(back.state.clock.hwm).toBe(kst(11, 20, 12));
    expect(back.state.clock.lastSimAt).toBe(kst(11, 20, 12));
    expect(back.state.clock.suspect).toBe('rewind');
    expect(back.effects.some((e) => e.type === 'clockSuspect' && e.kind === 'rewind')).toBe(true);
    // 역행한 시각의 이벤트는 hwm 시각에 일어난 것으로 친다
    expect(back.state.lastCareAt).toBe(kst(11, 20, 12));
    // 다시 앞으로 가면 정상
    expect(tickTo(back.state, kst(11, 20, 13)).state.clock.lastSimAt).toBe(kst(11, 20, 13));
  });

  it('시계 보정: 12h 넘게 되돌아가면 hwm을 지금으로 재설정(경과 0, 잠금 없음) — 1년 앞당겼다 바로잡아도 다음 날 아침이 온다', () => {
    const s0 = play(sim.createInitial(kst(11, 20, 20), KST, 1), [{ type: 'appBackground', at: kst(11, 20, 20, 10) }]).state;
    const future = sim.tick(s0, kst(11, 20, 20, 30) + 365 * 24 * H).state;
    const fixed = sim.reduce(future, { type: 'appForeground', at: kst(11, 20, 20, 40), tzOffsetMin: KST });
    expect(fixed.effects).toContainEqual({ type: 'clockSuspect', kind: 'reset' });
    expect(fixed.state.clock.hwm).toBe(kst(11, 20, 20, 40));
    expect(fixed.state.clock.lastSimAt).toBe(kst(11, 20, 20, 40));
    const dayBefore = future.dayIndex;
    expect(fixed.state.dayIndex).toBe(dayBefore); // 경과 0
    // 실제로 사흘 지나면 보통처럼 산다
    const later = play(fixed.state, [
      { type: 'appBackground', at: kst(11, 20, 20, 50) },
      { type: 'appForeground', at: kst(11, 23, 9), tzOffsetMin: KST },
    ]).state;
    expect(later.phase).toBe('awake');
    expect(later.dayIndex - dayBefore).toBeGreaterThanOrEqual(2);
    // 12h 이하 역행은 보정하지 않는다
    const small = sim.reduce(later, { type: 'appForeground', at: kst(11, 23, 9) - 11 * H, tzOffsetMin: KST });
    expect(small.state.clock.hwm).toBe(kst(11, 23, 9));
  });

  it('72h 경계: 정확히 72h는 그대로 정산, 72h + 1ms부터 자름(jump)', () => {
    const s0 = play(sim.createInitial(kst(11, 20, 20), KST, 1), [{ type: 'appBackground', at: kst(11, 20, 20, 10) }]).state;
    const t0 = s0.clock.lastSimAt;
    expect(sim.tick(s0, t0 + 72 * H).effects.some((e) => e.type === 'clockSuspect')).toBe(false);
    expect(sim.tick(s0, t0 + 72 * H + 1).effects).toContainEqual({ type: 'clockSuspect', kind: 'jump' });
  });

  it('5일 방치: 마지막 72h 구간 시작이 아침 직후에 걸리면 +4(밀린 깸 1 + 구간 안 아침 3)', () => {
    const s0 = play(sim.createInitial(kst(11, 20, 21), KST, 5), [{ type: 'appBackground', at: kst(11, 20, 21, 10) }]).state;
    const asleep = sim.tick(s0, kst(11, 20, 23, 30)).state;
    expect(asleep.phase).toBe('asleep');
    const back = sim.tick(asleep, kst(11, 25, 7)).state; // 구간 시작 = 22일 07:00
    expect(back.dayIndex).toBe(4);
  });

  it('5일 방치 후 복귀: 72h에서 자름, 꿈 카드 1장(긴 잠), 마름 0.6, 성향 그대로', () => {
    const s0 = sim.createInitial(kst(11, 20, 21), KST, 5);
    const day0 = play(s0, [
      { type: 'grind', at: kst(11, 20, 21, 1), durationMs: 8000 },
      { type: 'stroke', at: kst(11, 20, 21, 2), raw: handStroke(2) },
      { type: 'appBackground', at: kst(11, 20, 21, 10) },
    ]).state;
    const back = sim.reduce(day0, { type: 'appForeground', at: kst(11, 25, 21, 10), tzOffsetMin: KST });
    const st = back.state;
    expect(back.effects.some((e) => e.type === 'clockSuspect' && e.kind === 'jump')).toBe(true);
    expect(st.dayIndex).toBe(3); // 보통 +3: 23·24·25일 아침(마지막 72h 구간)
    expect(st.phase).toBe('awake'); // 복귀 순간에 갑자기 재우지 않는다
    expect(st.pendingCard).not.toBeNull();
    expect(st.pendingCard!.nightsMerged).toBe(st.dayIndex);
    expect(st.cards).toHaveLength(0);
    expect(sim.dryness(st, st.clock.lastSimAt)).toBe(0.6);
    // 첫날 밤에 타고난 결이 정해지고 그 뒤 방치한 밤은 축을 움직이지 않는다
    const firstNight = sim.tick(day0, kst(11, 21, 0)).state;
    expect(st.temperament).toEqual(firstNight.temperament);
    // 첫 터치 → 물 한 방울(rehydrated), 마름 0
    const touch = sim.reduce(st, { type: 'tap', at: kst(11, 25, 21, 11), target: 'body', holdMs: 120, x: 0, y: 0 });
    expect(touch.effects.some((e) => e.type === 'rehydrated')).toBe(true);
    expect(sim.dryness(touch.state, kst(11, 25, 21, 11))).toBe(0);
  });

  it('마름 시각표: 12h 0 · 24h 0.15 · 48h 0.4 · 72h 이후 0.6 상한', () => {
    const s = sim.createInitial(kst(11, 20, 9), KST, 1);
    const at = (h: number) => sim.dryness(s, s.lastCareAt + h * H);
    expect(at(12)).toBe(0);
    expect(at(24)).toBeCloseTo(0.15, 12);
    expect(at(48)).toBeCloseTo(0.4, 12);
    expect(at(72)).toBeCloseTo(0.6, 12);
    expect(at(24 * 30)).toBe(0.6);
  });
});
