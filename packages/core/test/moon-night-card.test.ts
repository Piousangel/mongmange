// 보름 카드 고르기와 doWake 연결 설계(C4 리뷰 I1·I2·I3·m4·m5).
// - I1: pickCard 동일성은 **HEAD(f1c2057) 코드로 뽑은 고정 기대값**으로 본다(새 코드끼리 비교하면 둘이 같이 바뀌어도 통과한다).
// - I2: 밤의 날짜 = 그 밤이 시작된 저녁의 현지 날짜(04:00 전 재우기는 전날).
// - I3: 긴 잠 = 밤마다 고르고 mergeNightCard로 접는다 → '합친 밤 중 가장 늦은 보름 밤'과 같다. State 밖 입력은 이벤트 선택 필드.
import { describe, expect, it } from 'vitest';
import { buildDreamScene, dreamMotifShape, latestMoonNight, moonNightOf, nightDateOf, normalizeTzOffset, sim } from '../src/index';
import { H, KST, handStroke, kst, play } from './sim-helpers';

const V: Record<string, sim.AxisRecord> = {
  center: { tempo: 0, boldness: 0, closeness: 0, curiosity: 0 },
  farWith: { tempo: 0.6, boldness: -0.4, closeness: 0.5, curiosity: 0.7 },
  nearAlone: { tempo: -0.9, boldness: 0.9, closeness: -0.3, curiosity: -0.2 },
};
const USED: Record<string, { motifId: string; composition: number }[]> = {
  none: [],
  some: [
    { motifId: 'center.rain', composition: 1 },
    { motifId: 'center.moon', composition: 0 },
    { motifId: 'far-with.sea-hand', composition: 2 },
  ],
  full: ['far-with.stars-drops', 'far-with.sea-hand', 'center.rain', 'center.moon'].flatMap((m) => [0, 1, 2].map((c) => ({ motifId: m, composition: c }))),
};

/**
 * HEAD `git show HEAD:packages/core/src/sim/dream.ts`의 pickCard(v, used, rng, 9, 's1') 결과(11-20 C4 리뷰 반영 때 뽑음).
 * [성향, used, 입력 rng, motifId, composition, flowSeed, 다음 rng]
 */
const HEAD_GOLDEN: readonly [string, string, number, string, number, number, number][] = [
  ['center', 'none', 1, 'center.rain', 1, 5874916, -631835669],
  ['center', 'none', 7, 'far-with.stars-drops', 0, 133054345, -631835663],
  ['center', 'none', 12345, 'center.moon', 2, 658745472, -631823325],
  ['center', 'none', -987654321, 'far-with.sea-hand', 0, 1627099087, -1619489991],
  ['center', 'none', 2147483647, 'far-with.sea-hand', 2, 273020870, 1515647977],
  ['center', 'some', 1, 'center.rain', 0, 5874916, -631835669],
  ['center', 'some', 7, 'far-with.stars-drops', 0, 133054345, -631835663],
  ['center', 'some', 12345, 'center.moon', 2, 658745472, -631823325],
  ['center', 'some', -987654321, 'far-with.stars-drops', 2, 1627099087, -1619489991],
  ['center', 'some', 2147483647, 'far-with.sea-hand', 0, 273020870, 1515647977],
  ['center', 'full', 1, 'far-with.stars-drops', 0, 5874916, -631835669],
  ['center', 'full', 7, 'far-with.stars-drops', 0, 133054345, -631835663],
  ['center', 'full', 12345, 'far-with.stars-drops', 0, 658745472, -631823325],
  ['center', 'full', -987654321, 'far-with.stars-drops', 0, 1627099087, -1619489991],
  ['center', 'full', 2147483647, 'far-with.stars-drops', 0, 273020870, 1515647977],
  ['farWith', 'none', 1, 'center.rain', 1, 5874916, -631835669],
  ['farWith', 'none', 7, 'far-with.stars-drops', 0, 133054345, -631835663],
  ['farWith', 'none', 12345, 'center.moon', 2, 658745472, -631823325],
  ['farWith', 'none', -987654321, 'far-with.sea-hand', 0, 1627099087, -1619489991],
  ['farWith', 'none', 2147483647, 'far-with.sea-hand', 2, 273020870, 1515647977],
  ['farWith', 'some', 1, 'center.rain', 0, 5874916, -631835669],
  ['farWith', 'some', 7, 'far-with.stars-drops', 0, 133054345, -631835663],
  ['farWith', 'some', 12345, 'center.moon', 2, 658745472, -631823325],
  ['farWith', 'some', -987654321, 'far-with.stars-drops', 2, 1627099087, -1619489991],
  ['farWith', 'some', 2147483647, 'far-with.sea-hand', 0, 273020870, 1515647977],
  ['farWith', 'full', 1, 'far-with.stars-drops', 0, 5874916, -631835669],
  ['farWith', 'full', 7, 'far-with.stars-drops', 0, 133054345, -631835663],
  ['farWith', 'full', 12345, 'far-with.stars-drops', 0, 658745472, -631823325],
  ['farWith', 'full', -987654321, 'far-with.stars-drops', 0, 1627099087, -1619489991],
  ['farWith', 'full', 2147483647, 'far-with.stars-drops', 0, 273020870, 1515647977],
  ['nearAlone', 'none', 1, 'center.rain', 1, 5874916, -631835669],
  ['nearAlone', 'none', 7, 'near-alone.quilt', 0, 133054345, -631835663],
  ['nearAlone', 'none', 12345, 'center.moon', 2, 658745472, -631823325],
  ['nearAlone', 'none', -987654321, 'near-alone.teacup', 0, 1627099087, -1619489991],
  ['nearAlone', 'none', 2147483647, 'near-alone.teacup', 2, 273020870, 1515647977],
  ['nearAlone', 'some', 1, 'center.rain', 0, 5874916, -631835669],
  ['nearAlone', 'some', 7, 'near-alone.quilt', 0, 133054345, -631835663],
  ['nearAlone', 'some', 12345, 'center.moon', 2, 658745472, -631823325],
  ['nearAlone', 'some', -987654321, 'near-alone.quilt', 2, 1627099087, -1619489991],
  ['nearAlone', 'some', 2147483647, 'near-alone.teacup', 1, 273020870, 1515647977],
  ['nearAlone', 'full', 1, 'near-alone.teacup', 0, 5874916, -631835669],
  ['nearAlone', 'full', 7, 'near-alone.quilt', 0, 133054345, -631835663],
  ['nearAlone', 'full', 12345, 'near-alone.teacup', 2, 658745472, -631823325],
  ['nearAlone', 'full', -987654321, 'near-alone.quilt', 1, 1627099087, -1619489991],
  ['nearAlone', 'full', 2147483647, 'near-alone.quilt', 2, 273020870, 1515647977],
];

const pick = (r: { card: sim.DreamCard; rng: number }) => [r.card.motifId, r.card.composition, r.card.flowSeed, r.rng];

describe('I1 — HEAD 고정 기대값 대조(난수 소비 포함)', () => {
  it.each(HEAD_GOLDEN)('pickCard %s/%s rng %i', (vk, uk, rng, motifId, comp, flowSeed, next) => {
    expect(pick(sim.pickCard(V[vk]!, USED[uk]!, rng, 9, 's1'))).toEqual([motifId, comp, flowSeed, next]);
  });

  it('pickNightCard: 보름 끔·플래그 꺼짐·창 밖이면 HEAD 값 그대로', () => {
    for (const [vk, uk, rng, motifId, comp, flowSeed, next] of HEAD_GOLDEN) {
      const base = { v: V[vk]!, used: USED[uk]!, rng, night: 9, strokeRef: 's1', tzOffsetMin: KST, developedCards: 9 };
      const want = [motifId, comp, flowSeed, next];
      expect(pick(sim.pickNightCard({ ...base, nightDate: '2027-01-22' }))).toEqual(want);
      expect(pick(sim.pickNightCard({ ...base, nightDate: '2027-01-22', moon: { enabled: false, dev: true } }))).toEqual(want);
      expect(pick(sim.pickNightCard({ ...base, nightDate: '2027-01-10', moon: { enabled: true, dev: true } }))).toEqual(want);
    }
  });

  // 기대값 = HEAD rng.ts의 rngNext(7) 한 번(flowSeed 25135766, 다음 rng 1831565820)
  it('보름 카드도 고정 값(난수는 물결 씨앗 한 번만 소비)', () => {
    const r = sim.pickNightCard({ v: V.center!, used: [], rng: 7, night: 9, strokeRef: 's1', nightDate: '2027-01-22', tzOffsetMin: KST, developedCards: 3, moon: { enabled: true, dev: true } });
    expect([...pick(r), r.moon?.phase]).toEqual(['moon-01', 1, 25135766, 1831565820, 'full']);
  });
});

describe('I2 — 밤의 날짜(그 밤이 시작된 저녁, 04:00 경계)', () => {
  const seoul = (d: number, h: number, m: number) => Date.UTC(2027, 0, d, h, m) - KST * 60_000;
  it.each([
    [22, 23, 59, '2027-01-22'],
    [23, 0, 30, '2027-01-22'],
    [23, 3, 59, '2027-01-22'],
    [23, 4, 0, '2027-01-23'],
  ])('서울 01-%i %i:%i 재우기 → %s', (d, h, m, want) => {
    expect(nightDateOf(seoul(d, h, m), KST)).toBe(want);
  });

  it('자정 넘어 재워도 보름 당일 밤은 당일 밤(달력 날짜로 쓰면 다음 날로 밀린다)', () => {
    // 서울 보름 당일 = 2027-01-22. 01-23 00:30 재우기 = 01-22 밤 = 가득(b)
    expect(moonNightOf(nightDateOf(seoul(23, 0, 30), KST)!, KST)?.phase).toBe('full');
    expect(moonNightOf('2027-01-23', KST)?.phase).toBe('after'); // 달력 날짜를 그대로 쓴 오답
    // 다음 날 밤(01-23)을 01-24 02:00에 재워도 창 안
    expect(moonNightOf(nightDateOf(seoul(24, 2, 0), KST)!, KST)?.phase).toBe('after');
  });

  it('뉴욕 오프셋에서도 같은 경계', () => {
    const ny = (d: number, h: number, m: number) => Date.UTC(2027, 0, d, h, m) + 300 * 60_000;
    expect(nightDateOf(ny(23, 3, 59), -300)).toBe('2027-01-22');
    expect(nightDateOf(ny(23, 4, 0), -300)).toBe('2027-01-23');
  });

  it('오프셋 범위 밖은 clamp(−720~840), 숫자가 아니면 판정 안 함', () => {
    expect(normalizeTzOffset(900)).toBe(840);
    expect(normalizeTzOffset(-100000)).toBe(-720);
    expect(normalizeTzOffset(Number.NaN)).toBeNull();
    expect(moonNightOf('2027-01-23', 100000)).toEqual(moonNightOf('2027-01-23', 840));
    expect(nightDateOf(seoul(23, 4, 0), Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('I3 — 긴 잠 접기(doWake 증분) = 가장 늦은 보름 밤', () => {
  const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  /** doWake가 밤마다 하듯: 고르고 → 접고 → rng 이어 쓰기 */
  function sleepThrough(dates: string[], developedCards = 5, rng0 = 99) {
    let pending: sim.DreamCard | null = null;
    let rng = rng0;
    for (const [i, nightDate] of dates.entries()) {
      const r = sim.pickNightCard({ v: V.center!, used: [], rng, night: 10 + i, strokeRef: null, nightDate, tzOffsetMin: KST, developedCards, moon: { enabled: true, dev: true } });
      rng = r.rng;
      pending = sim.mergeNightCard(pending, r.card);
    }
    return pending!;
  }

  it('보름 당일 → 창 밖 이틀: 보름 카드(b)가 남는다', () => {
    const c = sleepThrough(['2027-01-22', '2027-01-24', '2027-01-25']);
    expect([c.motifId, c.composition, c.nightsMerged, sim.moonPhaseOfCard(c)]).toEqual(['moon-01', 1, 3, 'full']);
  });

  it('창 안에서 이어지면 더 늦은 보름 밤이 이긴다', () => {
    const c = sleepThrough(['2027-01-21', '2027-01-22', '2027-01-23', '2027-01-24']);
    expect([c.motifId, c.composition, sim.moonPhaseOfCard(c)]).toEqual(['moon-01', 2, 'after']);
  });

  it('창 밖만이면 기존과 같다(마지막 밤의 일반 카드, 보름 위상 없음)', () => {
    const c = sleepThrough(['2027-01-10', '2027-01-11']);
    expect(c.motifId.startsWith('moon-')).toBe(false);
    expect(sim.moonPhaseOfCard(c)).toBeNull();
  });

  it('전수: 2027-01-01부터 시작하는 1~3밤 긴 잠 모두 latestMoonNight와 같다', () => {
    for (let start = 0; start < 60; start++) {
      for (let len = 1; len <= 3; len++) {
        const dates = Array.from({ length: len }, (_, i) => shift('2027-01-01', start + i));
        const c = sleepThrough(dates);
        const want = latestMoonNight(dates, KST);
        expect([sim.moonPhaseOfCard(c), c.nightsMerged], dates.join()).toEqual([want?.phase ?? null, len]);
      }
    }
  });

  it('긴 잠의 나머지 값(먹 톤·물결·획)은 최신 밤 것', () => {
    const moonCard = { night: 10, motifId: 'moon-01', composition: 1 as const, inkTone: 0.1, flow: 0.1, flowSeed: 1, strokeRef: 'a', nightsMerged: 1 };
    const later = { night: 11, motifId: 'center.rain', composition: 2 as const, inkTone: 0.9, flow: -0.5, flowSeed: 2, strokeRef: 'b', nightsMerged: 1 };
    expect(sim.mergeNightCard(moonCard, later)).toEqual({ ...later, motifId: 'moon-01', composition: 1, nightsMerged: 2 });
  });
});

describe('창 안 일반 카드·자리표시 방지(m4·m5)', () => {
  it('scenePool: 보름 창이면 center.moon 세 장면이 빠진다(나머지 순서 그대로)', () => {
    const all = sim.scenePool(V.center!).map((x) => `${x.motifId}/${x.composition}`);
    const win = sim.scenePool(V.center!, { moonWindow: true }).map((x) => `${x.motifId}/${x.composition}`);
    expect(all.filter((k) => !k.startsWith('center.moon/'))).toEqual(win);
    expect(all.length - win.length).toBe(3);
  });

  it('처음 3장 보호: 현상 0~2장이면 일반 카드, 3장부터 보름', () => {
    const base = { v: V.center!, used: [], rng: 7, night: 9, strokeRef: null, nightDate: '2027-01-23', tzOffsetMin: KST, moon: { enabled: true, dev: true } };
    for (const n of [0, 1, 2]) expect(sim.pickNightCard({ ...base, developedCards: n }).card.motifId.startsWith('moon-')).toBe(false);
    expect(sim.pickNightCard({ ...base, developedCards: 3 }).card).toMatchObject({ motifId: 'moon-01', composition: 2 });
  });

  it('제품 빌드(dev 없음): 자리표시 번들 보름은 고르지 않고 일반 카드(center.moon 없이)', () => {
    const base = { v: V.center!, used: [], night: 9, strokeRef: null, nightDate: '2027-01-22', tzOffsetMin: KST, developedCards: 5, moon: { enabled: true } };
    for (let r = 1; r <= 200; r++) {
      const g = sim.pickNightCard({ ...base, rng: r });
      expect(g.moon).toBeNull();
      expect(g.card.motifId).not.toBe('center.moon');
      expect(g.card.motifId.startsWith('moon-')).toBe(false);
    }
    // 검증을 통과해 받아 둔 원격 보름(3월)은 제품에서도 고른다
    expect(sim.pickNightCard({ ...base, rng: 1, nightDate: '2027-03-22', moon: { enabled: true, remoteMoon: ['moon-03'] } }).card.motifId).toBe('moon-03');
  });

  it('렌더: 미완 보름 모티프는 개발 빌드에서만 임시 형상, 제품은 형상 없는 일반 카드', () => {
    expect(dreamMotifShape('moon-01', true)).toBe('center.moon');
    expect(dreamMotifShape('moon-01', false)).toBe('plain');
    expect(dreamMotifShape('center.rain', false)).toBe('center.rain');
    expect(dreamMotifShape('unknown-id', false)).toBe('center.moon'); // 모르는 id는 기존 동작 그대로
    const card: sim.DreamCard = { night: 9, motifId: 'moon-01', composition: 1, inkTone: 0.5, flow: 0, flowSeed: 3, strokeRef: null, nightsMerged: 1 };
    const prod = buildDreamScene({ card, strokes: [] });
    const dev = buildDreamScene({ card, strokes: [], dev: true });
    expect(prod).not.toEqual(dev);
    expect(prod).toEqual(buildDreamScene({ card, strokes: [], dev: false }));
  });
});

describe('MoonContext 이벤트 선택 필드 — 꺼짐 값은 재생 결과를 바꾸지 않는다(연결 뒤 시험은 dream-wake.test.ts)', () => {
  function days(withMoon: boolean) {
    const moon = withMoon ? { moon: { enabled: false, remoteMoon: ['moon-03'], dev: true } } : {};
    let s = sim.createInitial(kst(11, 20, 19), KST, 77);
    const all: sim.Effect[] = [];
    for (let d = 0; d < 5; d++) {
      const base = kst(11, 20 + d, 19);
      const r = play(s, [
        { type: 'stroke', at: base + 120_000, raw: handStroke(d + 2) },
        { type: 'putToSleep', at: base + 4 * H, ...moon },
        { type: 'appBackground', at: base + 4 * H + 60_000 },
        { type: 'appForeground', at: base + 13 * H, tzOffsetMin: KST, ...moon },
        { type: 'developCard', at: base + 13 * H + 60_000 },
      ]);
      s = r.state;
      all.push(...r.effects);
    }
    return { s, all };
  }

  it('같은 이벤트 열에 꺼진 moon 필드를 더해도 효과·카드·난수가 같다(State에는 마지막 값만 기록)', () => {
    const a = days(false);
    const b = days(true);
    const { nightCtx, ...rest } = b.s;
    expect(rest).toEqual(a.s);
    expect(nightCtx).toEqual({ moon: { enabled: false, remoteMoon: ['moon-03'], dev: true } });
    expect(b.all).toEqual(a.all);
    expect(a.s.cards.length).toBeGreaterThan(0);
  });
});
