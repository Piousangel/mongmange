// doWake 연결(C6, dreams-30days 4-1 ①~⑤): 밤마다 pickNightCard + mergeNightCard, 플래그 값은 이벤트 선택 필드 → State nightCtx.
// - 고정 기대값: 아래 HEAD_REPLAY는 **연결 전 코드(0c74b6e)**로 같은 이벤트 열을 돌려 뽑은 값이다(카드·난수·세이브 문자열 해시).
//   필드 없는 이벤트 열(= 옛 세이브·플래그 꺼짐)은 연결 뒤에도 이 값과 같아야 한다 — 새 코드끼리 비교하지 않는다(C4 리뷰 I1).
import { describe, expect, it } from 'vitest';
import { sim } from '../src/index';
import { H, KST, handStroke, kst } from './sim-helpers';

function hash(t: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

/**
 * 12-10부터 20일: 매일 포그라운드 → 현상 → 획 → 쓰다듬기 → 재우기 → 백그라운드. 12-19~21은 앱을 열지 않는다(긴 잠 4밤).
 * 2026-12-24 01:28Z 보름 = 한국 12-24 → 보름 창 = 12-23·24·25 밤. extra = 재우기·포그라운드 이벤트에 실을 선택 필드.
 */
type Extra = { moon?: sim.MoonContext; dream?: sim.DreamContext };
function scenario(seed: number, extraIn: Extra | ((d: number) => Extra), skip: readonly number[] = [9, 10, 11]) {
  const extraOf = typeof extraIn === 'function' ? extraIn : () => extraIn;
  let s = sim.createInitial(kst(12, 10, 19), KST, seed);
  const effects: sim.Effect[] = [];
  const apply = (e: sim.Event) => {
    const r = sim.reduce(s, e);
    s = r.state;
    effects.push(...r.effects);
  };
  for (let d = 0; d < 20; d++) {
    const base = kst(12, 10 + d, 19);
    if (skip.includes(d)) continue;
    const extra = extraOf(d);
    apply({ type: 'appForeground', at: base, tzOffsetMin: KST, ...extra });
    if (d > 0) apply({ type: 'developCard', at: base + 60_000 });
    apply({ type: 'stroke', at: base + 120_000, raw: handStroke(d + 2) });
    apply({ type: 'tap', at: base + 130_000, target: 'body', holdMs: 0, x: 0.1 * (d % 3), y: 0 });
    apply({ type: 'putToSleep', at: base + 4 * H, ...extra });
    apply({ type: 'appBackground', at: base + 4 * H + 60_000 });
  }
  apply({ type: 'appForeground', at: kst(12, 30, 19), tzOffsetMin: KST, ...extraOf(20) });
  apply({ type: 'developCard', at: kst(12, 30, 19) + 60_000 });
  return { s, effects };
}

const row = (c: sim.DreamCard) => [c.motifId, c.composition, c.flowSeed, c.nightsMerged];

/** 연결 전 코드(0c74b6e)의 결과 — [motifId, composition, flowSeed, nightsMerged] */
const HEAD_REPLAY = [
  {
    seed: 77,
    rng: 248188565,
    save: '48663205',
    cards: [
      ['far-alone.sea', 2, 90666239, 1],
      ['center.rain', 2, 1043458502, 1],
      ['near-alone.quilt', 1, 1774053820, 1],
      ['center.moon', 1, 1683616766, 1],
      ['near-with.window-hand', 0, 388150972, 1],
      ['center.moon', 2, 1253955138, 1],
      ['near-with.teacup-two', 1, 1480401031, 1],
      ['near-with.teacup-two', 0, 115296572, 1],
      ['near-with.window-hand', 2, 535741255, 4],
      ['near-with.window-hand', 1, 446331433, 1],
      ['near-with.teacup-two', 2, 17733493, 1],
      ['center.moon', 0, 1118998146, 1],
      ['center.rain', 0, 1301484694, 1],
      ['center.rain', 1, 556333123, 1],
      ['center.rain', 2, 592281115, 1],
      ['center.moon', 1, 952709607, 1],
      ['near-with.window-hand', 0, 1263762092, 1],
    ],
  },
  {
    seed: 3,
    rng: 248188491,
    save: 'e13b1d4',
    cards: [
      ['center.rain', 2, 83026357, 1],
      ['near-alone.teacup', 2, 160906675, 1],
      ['center.moon', 0, 1033327079, 1],
      ['near-with.teacup-two', 1, 347464071, 1],
      ['near-with.window-hand', 2, 1186714978, 1],
      ['near-with.window-hand', 1, 179514346, 1],
      ['center.rain', 1, 1023765667, 1],
      ['center.moon', 1, 1889298833, 1],
      ['near-with.teacup-two', 2, 24923590, 4],
      ['center.moon', 2, 666572507, 1],
      ['center.rain', 0, 1652207840, 1],
      ['near-with.window-hand', 0, 1534772378, 1],
      ['near-with.teacup-two', 0, 790109240, 1],
      ['center.rain', 2, 3093653, 1],
      ['center.moon', 0, 1027161177, 1],
      ['near-with.teacup-two', 1, 1294871691, 1],
      ['near-with.window-hand', 2, 1688593641, 1],
    ],
  },
  {
    seed: 123456,
    rng: 248311944,
    save: 'f595ae3a',
    cards: [
      ['far-alone.sea', 1, 1712109057, 1],
      ['center.moon', 2, 343622476, 1],
      ['near-alone.quilt', 2, 500013860, 1],
      ['near-with.teacup-two', 2, 1305669683, 1],
      ['near-with.teacup-two', 0, 1410016371, 1],
      ['near-with.window-hand', 2, 390050562, 1],
      ['near-with.teacup-two', 1, 1830900171, 1],
      ['center.moon', 0, 2065116457, 1],
      ['center.rain', 2, 1125110289, 4],
      ['center.moon', 1, 554774430, 1],
      ['center.rain', 1, 979208381, 1],
      ['near-with.window-hand', 0, 742325143, 1],
      ['center.rain', 0, 814628492, 1],
      ['near-with.window-hand', 1, 503837209, 1],
      ['center.moon', 2, 367396100, 1],
      ['near-with.teacup-two', 2, 840997940, 1],
      ['near-with.teacup-two', 0, 572049928, 1],
    ],
  },
];

describe('옛 세이브·플래그 꺼짐 = 연결 전과 같다(고정 기대값)', () => {
  it.each(HEAD_REPLAY)('씨앗 $seed: 필드 없는 이벤트 열 → 카드·난수·세이브 문자열이 연결 전 값 그대로', ({ seed, rng, save, cards }) => {
    const { s } = scenario(seed, {});
    expect(s.cards.map(row)).toEqual(cards);
    expect(s.rng).toBe(rng);
    expect(hash(sim.serializeState(s, kst(12, 31, 9)))).toBe(save);
    expect(s.nightCtx).toBeUndefined();
    expect(s.cards.some((c) => 'cause' in c)).toBe(false);
  });

  it.each(HEAD_REPLAY)('씨앗 $seed: 꺼짐 값을 실어도(moon·dream enabled false) 카드·난수는 같다(기록만 남는다)', ({ seed, rng, cards }) => {
    const { s } = scenario(seed, { moon: { enabled: false }, dream: { enabled: false } });
    expect(s.cards.map(row)).toEqual(cards);
    expect(s.rng).toBe(rng);
    expect(s.nightCtx).toEqual({ moon: { enabled: false }, dream: { enabled: false } });
  });
});

describe('꿈 콘텐츠 켜짐(dreamContent)', () => {
  const dev = { dream: { enabled: true, dev: true } };

  it('25개 풀·점적 해금: 3장 전에는 해금 0 모티프만, 기록 규칙 R2(같은 모티프 2장)·R3(직전 가족)을 지킨다, 카드마다 원인 필드', () => {
    for (const seed of [77, 3, 123456]) {
      const { s } = scenario(seed, dev);
      expect(s.cards).toHaveLength(17);
      s.cards.forEach((c, i) => {
        const m = sim.motifById(c.motifId)!;
        expect(m, c.motifId).not.toBeNull();
        expect(m.unlockAtCards, `${seed} ${i} ${c.motifId}`).toBeLessThanOrEqual(i);
        expect('cause' in c).toBe(true);
        if (i >= 1) expect(c.motifId).not.toBe(s.cards[i - 1]!.motifId);
        if (i >= 1) expect(sim.familyOf(c.motifId)).not.toBe(sim.familyOf(s.cards[i - 1]!.motifId));
      });
      // 같은 이벤트 열 = 같은 카드
      expect(scenario(seed, dev).s.cards).toEqual(s.cards);
    }
  });

  it('제품 빌드(dev 없음): 형상 자리표시 15개는 고르지 않는다', () => {
    for (const seed of [77, 3, 123456]) {
      const { s } = scenario(seed, { dream: { enabled: true } });
      for (const c of s.cards) expect(sim.motifUsable(c.motifId, false), c.motifId).toBe(true);
    }
  });

  it('긴 잠 카드(4밤)는 한 장 — 마지막 밤에 고른 장면', () => {
    const { s } = scenario(77, dev);
    expect(s.cards.filter((c) => c.nightsMerged > 1).map((c) => c.nightsMerged)).toEqual([4]);
  });
});

describe('보름 연결(moonNight, 4-1 ①~⑤)', () => {
  const moonDev = { moon: { enabled: true, dev: true }, dream: { enabled: true, dev: true } };

  it('12-23·24·25 밤 = moon-12 구도 a·b·c(전날·당일·다음 날), 그 사흘 일반 풀에서 center.moon 없음', () => {
    const { s } = scenario(77, moonDev);
    const moon = s.cards.filter((c) => c.motifId.startsWith('moon-'));
    expect(moon.map((c) => [c.motifId, c.composition, sim.moonPhaseOfCard(c)])).toEqual([
      ['moon-12', 0, 'before'],
      ['moon-12', 1, 'full'],
      ['moon-12', 2, 'after'],
    ]);
    // 보름 다음 날 일반 카드는 R3(가족 moon)에 걸려 center.moon이 아니다
    const i = s.cards.indexOf(moon[2]!);
    expect(s.cards[i + 1]!.motifId).not.toBe('center.moon');
  });

  it('제품 빌드: 자리표시 번들 보름은 고르지 않는다(일반 카드, ⑤)', () => {
    const { s } = scenario(77, { moon: { enabled: true }, dream: { enabled: true } });
    expect(s.cards.some((c) => c.motifId.startsWith('moon-'))).toBe(false);
  });

  it('긴 잠이 보름 밤을 품으면 보름 카드로 현상, 원인은 합친 밤 중 가장 늦은 보름 밤(②, 3-5)', () => {
    // 12-24 밤에 재우고 25·26일을 비운다(68시간 — 72시간 상한 안) → 24(당일)·25(다음 날)·26(창 밖) 밤이 한 장.
    // 마지막 밤(26)은 일반 카드지만 보름 모티프·구도를 지켜 '다음 날 c'로 현상된다
    const { s } = scenario(77, moonDev, [15, 16]);
    const long = s.cards.filter((c) => c.nightsMerged > 1);
    expect(long.map((c) => [c.motifId, c.composition, sim.moonPhaseOfCard(c), c.nightsMerged])).toEqual([['moon-12', 2, 'after', 3]]);
    // 마지막(일반) 밤의 원인 말씨는 남기지 않는다 — 다음 밤 '직전 말씨' 판정 왜곡 방지(리뷰 m1)
    expect('cause' in long[0]!).toBe(false);
    const i = s.cards.indexOf(long[0]!);
    expect(sim.pickCause({ tempo: 0, boldness: 0, curiosity: 0.5, closeness: 0.5 }, 'far-with', s.cards[i]!, 0)).toBe('far-with.1');
  });

  it('재우기·포그라운드는 실어 온 값으로 통째로 바꾼다 — 빠진 키는 지우고, 둘 다 없으면 nightCtx 자체를 지운다(리뷰 I1)', () => {
    let s = sim.createInitial(kst(12, 10, 19), KST, 1);
    s = sim.reduce(s, { type: 'appForeground', at: kst(12, 10, 20), tzOffsetMin: KST, moon: { enabled: true, dev: true }, dream: { enabled: true, dev: true } }).state;
    expect(s.nightCtx).toEqual({ moon: { enabled: true, dev: true }, dream: { enabled: true, dev: true } });
    s = sim.reduce(s, { type: 'putToSleep', at: kst(12, 10, 23), dream: { enabled: true } }).state;
    expect(s.nightCtx).toEqual({ dream: { enabled: true } }); // moon·dev 잔존 없음
    s = sim.reduce(s, { type: 'appForeground', at: kst(12, 11, 9), tzOffsetMin: KST }).state;
    expect('nightCtx' in s).toBe(false);
  });
});

describe('켬 → 끔 = 빌드 1로 복귀(리뷰 I1 킬 스위치)', () => {
  it('8일째부터 플래그를 끄면 그 밤부터 빌드 1 규칙(모티프 10·원인 없음), 세이브에 nightCtx가 남지 않는다', () => {
    for (const seed of [77, 3, 123456]) {
      const { s } = scenario(seed, (d) => (d < 8 ? { moon: { enabled: true, dev: true }, dream: { enabled: true, dev: true } } : {}));
      expect('nightCtx' in s).toBe(false);
      const after = s.cards.slice(8);
      expect(after.length).toBeGreaterThan(5);
      for (const c of after) {
        expect(sim.motifById(c.motifId)?.unlockAtCards, c.motifId).toBe(0);
        expect('cause' in c).toBe(false);
      }
      expect(sim.serializeState(s, kst(12, 31, 9))).not.toContain('nightCtx');
    }
  });

  it('끈 뒤의 한 밤 = 빌드 1 pickCard 그대로(같은 State에서 직접 부른 값과 같다)', () => {
    const on = { moon: { enabled: true, dev: true }, dream: { enabled: true, dev: true } };
    let s = scenario(77, on).s;
    s = sim.reduce(s, { type: 'putToSleep', at: kst(12, 30, 23) }).state; // 필드 없음 = 끔
    const used = [...s.cards, ...(s.pendingCard ? [s.pendingCard] : [])];
    const want = sim.pickCard(s.temperament, used, s.rng, s.dayIndex + 1, null);
    const woke = sim.tick(s, kst(12, 31, 9)).state;
    expect(woke.pendingCard).toEqual(want.card);
    expect(woke.rng).toBe(want.rng);
  });
});

describe('해금은 doWake가 넘기는 현상 카드 수로 정해진다(변이 독립 검사)', () => {
  /** 현상한 카드를 n장 가진 State에서 한 밤 재워 깨운다 — 씨앗 200개 동안 나온 모티프의 최대 해금 값 */
  function maxUnlockAfter(n: number): number {
    let worst = -1;
    for (let r = 1; r <= 200; r++) {
      let s = sim.createInitial(kst(12, 10, 19), KST, r);
      const filler: sim.DreamCard[] = ['center.rain', 'center.moon', 'center.rain', 'center.moon', 'center.rain'].slice(0, n).map((motifId, i) => ({ night: i + 1, motifId, composition: (i % 3) as 0 | 1 | 2, inkTone: 0.5, flow: 0, flowSeed: i, strokeRef: null, nightsMerged: 1 }));
      s = { ...s, cards: filler };
      s = sim.reduce(s, { type: 'putToSleep', at: kst(12, 10, 23), dream: { enabled: true, dev: true } }).state;
      const c = sim.tick(s, kst(12, 11, 9)).state.pendingCard!;
      worst = Math.max(worst, sim.motifById(c.motifId)!.unlockAtCards);
    }
    return worst;
  }
  it('2장이면 해금 0만, 3장이면 3장째 모티프가 나오고, 5장이면 가운데 5장째도 나온다', () => {
    expect(maxUnlockAfter(2)).toBe(0);
    expect(maxUnlockAfter(3)).toBe(3);
    expect(maxUnlockAfter(5)).toBe(5);
  });
});
