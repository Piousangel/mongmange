// M4 정·손 기억·반김·머뭇거림(D-20 세 기둥, D-26 '그대로', 시스템 3.6·3.8, C-integrated 2-4).
// 정은 쌓이기만(벌 0·연속 기록 0) · 2·4·7에 열림 · 정 사건(몸·부르기·한 마디) · 반김 4단계 · 72h 머뭇거림 자리 ·
// 정 자막 처음 세 번(세이브 captionsShown, 기기 전용) · 공방(V27)과 같은 정 값 · 위기 판정 흔적 0 · 결정적(D-13).
import { describe, expect, it } from 'vitest';
import { v3 } from '../src/index';
import { H, KST, MIN, handStroke, kst } from './sim-helpers';

const CORE = import.meta.glob<string>('../src/**/*.ts', { query: '?raw', import: 'default', eager: true });

type S = v3.V3State;
type E = v3.V3Event;
type Fx = v3.V3Effect;

const fresh = () => v3.createV3(kst(11, 25, 9), KST, 7, { birth: { x: 0.1, y: -0.2, ms: kst(11, 25, 9), installAt: kst(11, 25, 9), entropy: 0x1234 } });

function play(s: S, events: E[]): { state: S; effects: Fx[] } {
  let state = s;
  const effects: Fx[] = [];
  for (const e of events) {
    const r = v3.reduceV3(state, e);
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
}

const word = (text: string): v3.WordInput => ({ ...v3.storedWordOf(v3.interpretWord(text, 'ko')), lexVer: v3.LEX_VER, source: 'keyboard' });

/**
 * d일째 저녁 하루(앱을 열어 둔 채 20시~22시): 돌아옴 → 벼루 → (쓰다듬기) → (한 마디) → (부르기) → 연적 → 앱 닫음.
 * 다음 날 아침 08시에 깸은 다음 day()의 돌아옴(20시)이 정산한다.
 */
function day(s: S, d: number, o: { touch?: boolean; write?: boolean; call?: boolean; text?: string } = {}) {
  const base = kst(11, 25 + d, 20);
  const ev: E[] = [{ type: 'appForeground', at: base, tzOffsetMin: KST }, { type: 'grind', at: base + MIN, durationMs: 9000 }];
  if (o.touch) ev.push({ type: 'tap', at: base + 90_000, target: 'body', holdMs: 100, x: 0.3, y: -0.3 });
  if (o.write) ev.push({ type: 'write', at: base + 2 * MIN, word: word(o.text ?? '비'), chars: 1, raw: handStroke(d + 1) });
  if (o.call) ev.push({ type: 'call', at: base + 3 * MIN, melody: true });
  ev.push({ type: 'putToSleep', at: base + 2 * H });
  ev.push({ type: 'appBackground', at: base + 2 * H + MIN });
  return play(s, ev);
}

function days(s: S, n: number, o: Parameters<typeof day>[2] = {}, from = 0) {
  let st = s;
  const effects: Fx[] = [];
  for (let d = from; d < from + n; d++) {
    const r = day(st, d, o);
    st = r.state;
    effects.push(...r.effects);
  }
  return { state: st, effects };
}

const greetOf = (fx: Fx[]) => fx.filter((e): e is Extract<Fx, { type: 'greeted' }> => e.type === 'greeted');
const signals = (fx: Fx[]) => fx.filter((e): e is Extract<Fx, { type: 'jeongSignal' }> => e.type === 'jeongSignal');

describe('정 = 만진 깸의 수, 쌓이기만 한다(시스템 3.8, D-03)', () => {
  it('몸 탭·한 마디·부르기는 그 깸에 한 번만 정을 올린다. 종이 탭·먹 갈기·밥은 올리지 않는다', () => {
    const at = kst(11, 25, 10);
    const base = play(fresh(), [
      { type: 'grind', at, durationMs: 9000 },
      { type: 'tap', at: at + 1000, target: 'paper', holdMs: 0, x: 2, y: 2 },
      { type: 'offer', at: at + 2000, kind: 'meal', item: 'clear' },
      { type: 'offer', at: at + 3000, kind: 'treat', item: 'pattern' },
    ]).state;
    expect(base.sim.relation.jeongDays).toBe(0);
    for (const ev of [
      { type: 'tap', at: at + 5000, target: 'body', holdMs: 100, x: 0, y: -0.3 },
      { type: 'tap', at: at + 5000, target: 'body', holdMs: 900, x: 0, y: -0.3 },
      { type: 'write', at: at + 5000, word: word('비'), chars: 1, raw: handStroke(1) },
      { type: 'call', at: at + 5000, melody: false },
    ] as E[]) {
      const once = play(base, [ev]).state;
      expect(once.sim.relation.jeongDays, ev.type).toBe(1);
      // 같은 깸에 몇 번을 더 해도 1
      const more = play(once, [
        { type: 'tap', at: at + 6000, target: 'body', holdMs: 100, x: 0, y: 0.3 },
        { type: 'call', at: at + 7000, melody: true },
      ]).state;
      expect(more.sim.relation.jeongDays, ev.type).toBe(1);
    }
  });

  it('자는 동안 부르기·쓰다듬기는 정을 올리지 않는다', () => {
    const at = kst(11, 25, 22, 30);
    const s = play(fresh(), [{ type: 'putToSleep', at }]).state;
    expect(s.sim.phase).toBe('asleep');
    const r = play(s, [
      { type: 'call', at: at + MIN, melody: true },
      { type: 'tap', at: at + 2 * MIN, target: 'body', holdMs: 100, x: 0, y: 0 },
    ]);
    expect(r.state.sim.relation.jeongDays).toBe(0);
    expect(r.effects.filter((e) => e.type === 'called' || e.type === 'jeongSignal')).toEqual([]);
  });

  it('줄지 않는다: 오래 비우고·말 없이 지나고·밥을 안 줘도 정은 그대로(사건마다 단조 증가)', () => {
    let s = fresh();
    let prev = 0;
    const check = (st: S) => {
      expect(st.sim.relation.jeongDays).toBeGreaterThanOrEqual(prev);
      expect(v3.jeongOf(st)).toBeLessThanOrEqual(st.sim.relation.jeongDays);
      prev = st.sim.relation.jeongDays;
    };
    // 정해 둔 사건열: 사흘 만짐 → 열흘 비움 → 말만 → 2주 비움 → 부르기
    const plan: [number, Parameters<typeof day>[2]][] = [
      [0, { touch: true }],
      [1, { touch: true, write: true }],
      [2, { call: true }],
      [12, {}],
      [13, { write: true }],
      [28, { call: true, touch: true }],
    ];
    for (const [d, o] of plan) {
      const r = day(s, d, o);
      s = r.state;
      check(s);
    }
    expect(s.sim.relation.jeongDays).toBe(5);
  });
});

describe('하나의 정 값 — 공방(V27)과 반김이 같은 경계 값을 읽는다', () => {
  it('jeongOf = boundaryProgress().jeong, 늘인 먹 한 가락(정 2)과 알아봄이 같은 아침에 열린다', () => {
    let s = fresh();
    let ribbonDay = -1;
    let recognizeDay = -1;
    for (let d = 0; d < 5; d++) {
      const r = day(s, d, { touch: true });
      s = r.state;
      expect(v3.jeongOf(s)).toBe(v3.boundaryProgress(s.v3, s.sim).jeong);
      if (ribbonDay < 0 && r.effects.some((e) => e.type === 'pantryOpened' && e.item === 'ribbon')) ribbonDay = d;
      if (recognizeDay < 0 && greetOf(r.effects).some((g) => g.recognize)) recognizeDay = d;
    }
    expect(ribbonDay).toBeGreaterThan(0);
    expect(recognizeDay).toBe(ribbonDay);
  });

  it('정을 세는 곳은 sim relation.jeongDays 하나: v3 블록·세이브에 정 칸이 따로 없다', () => {
    const s = days(fresh(), 3, { touch: true }).state;
    const json = JSON.parse(v3.serializeV3(s, kst(12, 1, 9))) as { v3: Record<string, unknown> };
    expect(Object.keys(json.v3).filter((k) => /jeong/i.test(k))).toEqual([]);
    const src = CORE['../src/v3/state.ts']! + CORE['../src/v3/jeong.ts']!;
    // 정을 올리는 길은 sim markJeong 하나(v3 파일에 jeongDays를 직접 더하는 코드 없음)
    expect(src).not.toMatch(/jeongDays\s*[+]|jeongDays:\s*[^,}]*\+/);
  });
});

describe('반김 4단계 = 비운 시간 × closeness(시스템 3.8 표)', () => {
  it('단계 경계: 1분 미만 없음 · 6h 미만 glance · 6~30h joy · 30~72h wait · 72h 이상 long', () => {
    const T = v3.greetTierOf;
    expect(T(59_999)).toBeNull();
    expect(T(60_000)).toBe('glance');
    expect(T(6 * H - 1)).toBe('glance');
    expect(T(6 * H)).toBe('joy');
    expect(T(30 * H - 1)).toBe('joy');
    expect(T(30 * H)).toBe('wait');
    expect(T(72 * H - 1)).toBe('wait');
    expect(T(72 * H)).toBe('long');
    expect(T(900 * H)).toBe('long');
    expect(T(Number.NaN)).toBeNull();
  });
  it('closeness 구간: ≥ +0.35 near, ≤ −0.35 alone, 그 사이 mid', () => {
    expect(v3.leanOf(0.35)).toBe('near');
    expect(v3.leanOf(0.3499)).toBe('mid');
    expect(v3.leanOf(-0.3499)).toBe('mid');
    expect(v3.leanOf(-0.35)).toBe('alone');
  });

  it('돌아온 순간(깨어 있음)에만 반김이 난다 — 비운 시간에 따라 단계가 갈리고, 숫자(비운 시간)는 효과에 없다', () => {
    const s0 = play(fresh(), [{ type: 'appBackground', at: kst(11, 25, 10) }]).state;
    for (const [hours, tier] of [
      [0.5, 'glance'],
      [10, 'joy'],
      [40, 'wait'],
      [80, 'long'],
    ] as const) {
      const at = kst(11, 25, 10) + hours * H;
      const r = play(s0, [{ type: 'appForeground', at, tzOffsetMin: KST }]);
      if (r.state.sim.phase !== 'awake') continue;
      const g = greetOf(r.effects);
      expect(g, `${hours}h`).toHaveLength(1);
      expect(g[0]!.tier).toBe(tier);
      expect(Object.keys(g[0]!).sort()).toEqual(['lean', 'recognize', 'stage', 'tier', 'type', 'waiting']);
    }
  });

  it('잠든 채 돌아오면(밤) 반김 없음. 앱 전환처럼 아주 짧게 비워도 없음', () => {
    const at = kst(11, 25, 22, 30);
    const s = play(fresh(), [{ type: 'putToSleep', at }, { type: 'appBackground', at: at + MIN }]).state;
    expect(greetOf(play(s, [{ type: 'appForeground', at: at + 30 * MIN, tzOffsetMin: KST }]).effects)).toEqual([]);
    const a = play(fresh(), [{ type: 'appBackground', at: kst(11, 25, 10) }, { type: 'appForeground', at: kst(11, 25, 10) + 20_000, tzOffsetMin: KST }]);
    expect(greetOf(a.effects)).toEqual([]);
  });

  it('72h 넘게 비우면 tier long(머뭇거림 자리). 크게 비울수록 같은 long — 더 나무라는 단계가 없다', () => {
    let s = days(fresh(), 3, { touch: true, write: true }).state;
    const tiers = [80, 200, 2000].map((h) => {
      const at = kst(11, 28, 22) + h * H;
      const morning = kst(11, 28, 22) + Math.ceil(h / 24) * 24 * H + 12 * H; // 그 뒤 아침 10시
      const r = play(s, [{ type: 'appForeground', at: Math.max(at, morning), tzOffsetMin: KST }]);
      return greetOf(r.effects).map((g) => g.tier);
    });
    expect(tiers).toEqual([['long'], ['long'], ['long']]);
    s = play(s, [{ type: 'appForeground', at: kst(12, 30, 10), tzOffsetMin: KST }]).state;
    expect(s.sim.relation.jeongDays).toBe(3); // 비웠다고 줄지 않는다
  });
});

describe('정 2·4·7에 열리는 것', () => {
  it('정 0~1: 알아봄 없음 / 정 2: 앱을 열면 먼저 정면(recognize) / 정 4: 익숙한 시각이면 기다림(waiting)', () => {
    let s = fresh();
    const seen: { jeong: number; recognize: boolean; waiting: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const r = day(s, d, { touch: true });
      s = r.state;
      for (const g of greetOf(r.effects)) seen.push({ jeong: v3.jeongOf(s), recognize: g.recognize, waiting: g.waiting });
    }
    expect(seen.length).toBeGreaterThan(4);
    for (const x of seen) {
      expect(x.recognize).toBe(x.jeong >= 2);
      if (x.jeong < 4) expect(x.waiting).toBe(false);
    }
    // 날마다 20시에 왔으니 정 4부터는 20시가 익숙한 시각
    expect(seen.filter((x) => x.jeong >= 4).every((x) => x.waiting)).toBe(true);
  });

  it('정 4라도 익숙하지 않은 시각(±45분 밖)이면 기다림 자세가 아니다', () => {
    const s = days(fresh(), 5, { touch: true }).state;
    expect(v3.jeongOf(s)).toBeGreaterThanOrEqual(4);
    const r = play(s, [{ type: 'appForeground', at: kst(11, 30, 13), tzOffsetMin: KST }]);
    const g = greetOf(r.effects);
    expect(g).toHaveLength(1);
    expect(g[0]!.waiting).toBe(false);
    expect(v3.familiarAt(s.sim.relation.hour, kst(11, 30, 20, 40), KST)).toBe(true);
    expect(v3.familiarAt(s.sim.relation.hour, kst(11, 30, 18, 0), KST)).toBe(false);
  });

  it('내밂: 정 4부터 그 깸에 몸을 처음 만질 때 좋아하는 자리를 내민다(두 번째 손길엔 없음)', () => {
    const s = days(fresh(), 5, { touch: true }).state;
    const at = kst(11, 30, 21);
    const r = play(s, [
      { type: 'appForeground', at, tzOffsetMin: KST },
      { type: 'tap', at: at + 1000, target: 'body', holdMs: 100, x: -0.3, y: 0.3 },
      { type: 'tap', at: at + 2000, target: 'body', holdMs: 100, x: -0.3, y: 0.3 },
    ]);
    const offers = signals(r.effects).filter((x) => x.signal === 'offer');
    expect(offers).toHaveLength(1);
    expect(offers[0]!.spot).toBe(v3.favoriteSpotOf(s.sim.relation.spot));
    // 정 3까지는 내밂 없음
    const early = days(fresh(), 3, { touch: true });
    expect(signals(early.effects).filter((x) => x.signal === 'offer')).toEqual([]);
  });

  it('이름 대답: 정 2부터 가락(가락 플래그가 켜져 있을 때), 정 7부터 closeness ≥ 0이면 다가옴', () => {
    let s = fresh();
    const replies: { jeong: number; reply: string; near: boolean | null }[] = [];
    for (let d = 0; d < 9; d++) {
      const r = day(s, d, { touch: true, call: true });
      // 부르기 순간의 정 = 그날 깸 경계 값(같은 깸 안이라 하루 끝 상태에서 읽어도 같다)
      for (const c of r.effects) if (c.type === 'called') replies.push({ jeong: v3.jeongOf(r.state), reply: c.reply, near: c.near });
      s = r.state;
    }
    for (const x of replies) {
      expect(x.reply).toBe(x.jeong >= 2 ? 'melody' : 'turn');
      expect(x.near === null).toBe(x.jeong < 7);
    }
    expect(replies.some((x) => x.near !== null)).toBe(true);
    // 가락 플래그가 꺼져 있으면 늘 고개 돌림(신호·자막 없음)
    const off = play(s, [{ type: 'call', at: kst(12, 4, 21), melody: false }]);
    expect(off.effects.find((e) => e.type === 'called')).toMatchObject({ reply: 'turn' });
    expect(signals(off.effects)).toEqual([]);
  });
});

describe('정 자막 — 신호마다 처음 세 번만(세이브 captionsShown, D-20 개정 줄)', () => {
  it('자막을 보인 횟수가 3이 되면 caption = false, 넷째부터 몸짓만. 신호끼리 따로 센다', () => {
    let s = days(fresh(), 3, { touch: true }).state;
    const caps: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      const at = kst(11, 28, 10) + i * 20 * MIN;
      const r = play(s, [
        { type: 'appBackground', at },
        { type: 'appForeground', at: at + 10 * MIN, tzOffsetMin: KST },
      ]);
      const rec = signals(r.effects).find((x) => x.signal === 'recognize')!;
      caps.push(rec.caption);
      s = r.state;
      if (rec.caption) s = play(s, [{ type: 'jeongCaption', at: at + 11 * MIN, signal: 'recognize' }]).state;
    }
    expect(caps).toEqual([true, true, true, false, false]);
    expect(s.v3.captionsShown).toEqual([3, 0, 0, 0]);
    expect(v3.captionDue(s, 'reply')).toBe(true);
    // 3에서 멈춘다(더 보내도 늘지 않음)
    s = play(s, [{ type: 'jeongCaption', at: kst(11, 28, 12), signal: 'recognize' }]).state;
    expect(s.v3.captionsShown).toEqual([3, 0, 0, 0]);
  });

  it('jeongCaption을 보내지 않으면(플래그 꺼짐) 횟수는 그대로 — 나중에 켜도 처음 세 번이 남아 있다', () => {
    const s = days(fresh(), 6, { touch: true, call: true }).state;
    expect(s.v3.captionsShown).toEqual([0, 0, 0, 0]);
    expect(v3.JEONG_SIGNALS.every((x) => v3.captionDue(s, x))).toBe(true);
  });
});

describe('세이브 v3 — captionsShown 이행(멱등)·기기 전용', () => {
  it('칸이 없는 옛 v3 세이브(세로 조각·V27)는 0 넷으로 읽고, 다시 쓰고 읽어도 같은 바이트', () => {
    const s = days(fresh(), 4, { touch: true, write: true }).state;
    const o = JSON.parse(v3.serializeV3(s, kst(12, 1, 9))) as { v3: Record<string, unknown> };
    delete o.v3.captionsShown;
    const back = v3.parseV3(JSON.stringify(o));
    expect(back.v3.captionsShown).toEqual([0, 0, 0, 0]);
    const once = v3.serializeV3(back, kst(12, 1, 9));
    const twice = v3.serializeV3(v3.parseV3(once), kst(12, 1, 9));
    expect(twice).toBe(once);
    expect(back.sim).toEqual(s.sim);
    expect(back.v3.words).toEqual(s.v3.words);
  });
  it('모양이 틀리면 손상(길이·범위·정수)', () => {
    const s = fresh();
    for (const bad of [[0, 0, 0], [0, 0, 0, 4], [0, -1, 0, 0], [0.5, 0, 0, 0], 'x']) {
      const o = JSON.parse(v3.serializeV3(s, kst(11, 25, 9))) as { v3: Record<string, unknown> };
      o.v3.captionsShown = bad;
      expect(() => v3.parseV3(JSON.stringify(o)), JSON.stringify(bad)).toThrow(/captionsShown/);
    }
  });
  it('맡겨 두기 업로드에 들어가지 않는다(V3_DEVICE_ONLY_FIELDS) — 정 값은 sim relation과 함께 간다', () => {
    let s = days(fresh(), 3, { touch: true }).state;
    s = play(s, [{ type: 'jeongCaption', at: kst(11, 28, 10), signal: 'wait' }]).state;
    expect(s.v3.captionsShown).toEqual([0, 1, 0, 0]);
    expect(v3.V3_DEVICE_ONLY_FIELDS).toContain('captionsShown');
    expect(Object.keys(v3.uploadV3(s))).not.toContain('captionsShown');
  });
});

describe('위기 판정 흔적 0 · 결정적(D-13)', () => {
  it('같은 날 위기 말을 썼든 고요한 말을 썼든 정·반김·정 신호가 같다', () => {
    const run = (text: string) => {
      let s = fresh();
      const fx: Fx[] = [];
      for (let d = 0; d < 6; d++) {
        const r = day(s, d, { touch: true, write: true, call: true, text: d === 2 ? text : '비' });
        s = r.state;
        fx.push(...r.effects.filter((e) => e.type === 'greeted' || e.type === 'jeongSignal' || e.type === 'called'));
      }
      return { fx, jeong: s.sim.relation.jeongDays, rel: s.sim.relation };
    };
    const a = run('죽고싶어');
    const b = run('고마워');
    expect(a.fx.length).toBeGreaterThan(5);
    expect(a.fx).toEqual(b.fx);
    expect(a.jeong).toBe(b.jeong);
  });

  it('정 모듈은 사전·위기 대조·말결·밥을 import하지 않는다(정적)', () => {
    const src = CORE['../src/v3/jeong.ts']!;
    const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
    expect(imports).toEqual(['../sim/pillars']);
    expect(src).not.toMatch(/lexicon|crisis|sense|interpret|words|meal|pantry/);
  });

  it('몸 입력 모듈(geometry·visual·snap)은 정 신호·자막·반김을 읽지 않는다(몸 크기 변화 0)', () => {
    const bodyFiles = Object.entries(CORE).filter(([p]) => /\/src\/(geometry|visual|snap)\//.test(p));
    expect(bodyFiles.length).toBeGreaterThan(5);
    for (const [p, src] of bodyFiles) expect(src, p).not.toMatch(/captionsShown|greet|jeongSignal|jeongOf|hesitat/);
  });

  it('반김이 있든 없든 몸(획·성장·꿈)은 같다 — 돌아옴·자막은 몸 상태를 바꾸지 않는다', () => {
    const s = days(fresh(), 4, { touch: true, write: true }).state;
    const at = kst(11, 29, 21);
    const a = play(s, [{ type: 'appForeground', at, tzOffsetMin: KST }]).state;
    const b = play(s, [
      { type: 'appForeground', at, tzOffsetMin: KST },
      { type: 'jeongCaption', at: at + 1000, signal: 'recognize' },
      { type: 'jeongCaption', at: at + 1000, signal: 'wait' },
    ]).state;
    const body = (x: S) => ({ strokes: x.sim.strokes, total: x.sim.strokesTotal, t: x.sim.temperament, cards: x.sim.cards, pending: x.sim.pendingCard });
    expect(body(b)).toEqual(body(a));
  });

  it('앱을 닫은 사이마다 세이브를 갈아 끼워도 반김·정 신호·정이 끊지 않은 경우와 같다(시드 20)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let rng = seed * 2654435761;
      const rand = () => ((rng = (Math.imul(rng ^ (rng >>> 15), 2246822507) + 0x6d2b79f5) >>> 0) / 2 ** 32);
      const ev: E[] = [];
      let t = kst(11, 25, 10);
      for (let i = 0; i < 40; i++) {
        t += Math.floor(rand() * (rand() < 0.15 ? 90 : 14) * H) + MIN;
        ev.push({ type: 'appForeground', at: t, tzOffsetMin: KST });
        if (rand() < 0.6) ev.push({ type: 'tap', at: t + MIN, target: 'body', holdMs: 100, x: rand() - 0.5, y: rand() - 0.5 });
        if (rand() < 0.3) ev.push({ type: 'call', at: t + 2 * MIN, melody: rand() < 0.5 });
        if (rand() < 0.3) ev.push({ type: 'jeongCaption', at: t + 3 * MIN, signal: v3.JEONG_SIGNALS[Math.floor(rand() * 4)]! });
        if (rand() < 0.5) ev.push({ type: 'putToSleep', at: t + 4 * MIN });
        ev.push({ type: 'appBackground', at: t + 5 * MIN });
      }
      const pick = (fx: Fx[]) => fx.filter((e) => e.type === 'greeted' || e.type === 'jeongSignal' || e.type === 'called');
      const straight = play(fresh(), ev);
      let s = fresh();
      const fx: Fx[] = [];
      for (const e of ev) {
        // 앱을 닫은 동안(백그라운드 뒤)에 세이브를 갈아 끼운다 — 콜드 스타트는 '닫힌 앱'으로 읽으므로(save.ts) 앞에 있는 동안은 갈지 않는다
        if (rand() < 0.5 && s.sim.backgroundSince !== null) s = v3.parseV3(v3.serializeV3(s, s.sim.backgroundSince));
        const r = v3.reduceV3(s, e);
        s = r.state;
        fx.push(...r.effects);
      }
      expect(pick(fx), `seed ${seed}`).toEqual(pick(straight.effects));
      expect(s.sim.relation.jeongDays).toBe(straight.state.sim.relation.jeongDays);
      expect(s.v3.captionsShown).toEqual(straight.state.v3.captionsShown);
    }
  });

  it('정 경로의 효과·세이브 칸·이름에 벌·연속·그리움·죄책 낱말이 없다', () => {
    const BAN = /streak|penal|punish|miss|lonel|guilt|sad|sorry|forg[eo]t|abandon|decay|lose|lost|neglect|absen|서운|그리|외로|미안|벌|연속|잊/i;
    const r = days(fresh(), 8, { touch: true, call: true });
    const names = new Set<string>();
    const collect = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(collect);
      else if (x && typeof x === 'object')
        for (const [k, v] of Object.entries(x)) {
          names.add(k);
          collect(v);
        }
      else if (typeof x === 'string') names.add(x);
    };
    collect(r.effects.filter((e) => e.type === 'greeted' || e.type === 'jeongSignal' || e.type === 'called'));
    collect({ captionsShown: r.state.v3.captionsShown });
    Object.keys(v3).filter((k) => /jeong|greet|caption|lean|familiar|favorite|call/i.test(k)).forEach((k) => names.add(k));
    collect([...v3.JEONG_SIGNALS]);
    expect(names.size).toBeGreaterThan(10);
    expect([...names].filter((n) => BAN.test(n))).toEqual([]);
  });
});
