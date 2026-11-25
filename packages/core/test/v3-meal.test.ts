// V27 밥·간식 core(D-27, care-rituals v3.2 2·3절): meal{spoons, treats, nudgeOptIn}·공방 pantry·깸 경계 초기화·좋아하는 것 = 씨앗·
// v3 이행(세로 조각 세이브 그대로 이어짐, 멱등)·업로드 허용 목록(walk 제외, 핑 0)·몸 크기 변화 0·금지 표현 0.
import { describe, expect, it } from 'vitest';
import { sim, v3, type KV } from '../src/index';
import { H, KST, handStroke, kst } from './sim-helpers';

const CORE = import.meta.glob<string>('../src/**/*.ts', { query: '?raw', import: 'default', eager: true });

type S = v3.V3State;
type E = v3.V3Event;

const FIRST_TAP: sim.BirthInput = { x: 0.1, y: -0.2, ms: kst(11, 25, 9), installAt: kst(11, 25, 9), entropy: 0x1234 };
/** entropy = 첫 탭 보안 난수 — 타고남 씨앗(birth.seed)이 이것으로 갈린다 */
const fresh = (entropy = 0x1234) => v3.createV3(kst(11, 25, 9), KST, 7, { birth: { ...FIRST_TAP, entropy } });

function memKV(init: Record<string, string> = {}): KV & { data: Record<string, string> } {
  const data = { ...init };
  return { data, getString: (k) => data[k], set: (k, v) => void (data[k] = v), remove: (k) => void delete data[k] };
}

function play(s: S, events: E[]): { state: S; effects: v3.V3Effect[] } {
  let state = s;
  const effects: v3.V3Effect[] = [];
  for (const e of events) {
    const r = v3.reduceV3(state, e);
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
}

const word = (text: string): v3.WordInput => ({ ...v3.storedWordOf(v3.interpretWord(text, 'ko')), lexVer: v3.LEX_VER, source: 'keyboard' });

/** d일째 하루: 벼루 → (쓰다듬기) → (한 마디) → (밥·간식) → 연적 → 다음 날 아침. offers = 그날 줄 것 */
function day(s: S, d: number, o: { touch?: boolean; write?: boolean; offers?: { kind: 'meal' | 'treat'; item: string }[] } = {}) {
  const base = kst(11, 25 + d, 20);
  const ev: E[] = [{ type: 'appForeground', at: base, tzOffsetMin: KST }, { type: 'grind', at: base + 60_000, durationMs: 9000 }];
  if (o.touch) ev.push({ type: 'tap', at: base + 90_000, target: 'body', holdMs: 100, x: 0, y: 0 });
  if (o.write !== false) ev.push({ type: 'write', at: base + 120_000, word: word(['행복해', '비', '고마워'][d % 3]!), chars: 2, raw: handStroke(d + 1) });
  (o.offers ?? []).forEach((f, i) => ev.push({ type: 'offer', at: base + 180_000 + i * 1000, kind: f.kind, item: f.item } as E));
  ev.push({ type: 'putToSleep', at: base + 2 * H });
  ev.push({ type: 'appBackground', at: base + 2 * H + 60_000 });
  ev.push({ type: 'appForeground', at: base + 12 * H, tzOffsetMin: KST });
  return play(s, ev);
}

function days(s: S, n: number, o: Parameters<typeof day>[2] = {}, from = 0) {
  let st = s;
  const effects: v3.V3Effect[] = [];
  for (let d = from; d < from + n; d++) {
    const r = day(st, d, o);
    st = r.state;
    effects.push(...r.effects);
  }
  return { state: st, effects };
}

const MEAL_EFFECTS = new Set(['received', 'offerRejected', 'pantryOpened']);

describe('밥·간식 받기(D-27 2-2)', () => {
  it('한 숟갈은 먹을 한 칸 이상 갈았을 때, 깸마다 2숟갈 — 두 번째에만 꾸벅(bow), 반응 크기는 같다(R7)', () => {
    const at = kst(11, 25, 10);
    let r = play(fresh(), [{ type: 'offer', at, kind: 'meal', item: 'clear' }]);
    expect(r.effects).toContainEqual({ type: 'offerRejected', reason: 'noInk' });
    r = play(r.state, [
      { type: 'grind', at: at + 1000, durationMs: 800 },
      { type: 'offer', at: at + 2000, kind: 'meal', item: 'clear' },
      { type: 'offer', at: at + 3000, kind: 'meal', item: 'clear' },
      { type: 'offer', at: at + 4000, kind: 'meal', item: 'clear' },
    ]);
    expect(r.effects.filter((e) => e.type === 'received')).toEqual([
      { type: 'received', kind: 'meal', item: 'clear', bow: false, liked: false },
      { type: 'received', kind: 'meal', item: 'clear', bow: true, liked: false },
    ]);
    expect(r.effects).toContainEqual({ type: 'offerRejected', reason: 'cap' });
    expect(v3.inkCells(r.state)).toBe(1); // 밥은 글자 수를 줄이지 않는다
  });
  it('작은 것은 먹 없이도, 깸마다 3. 꾸벅은 없다(간식은 주면 기뻐할 뿐)', () => {
    const at = kst(11, 25, 10);
    const r = play(fresh(), [0, 1, 2, 3].map((i) => ({ type: 'offer', at: at + i * 1000, kind: 'treat', item: 'pattern' }) as E));
    const got = r.effects.filter((e) => e.type === 'received');
    expect(got).toHaveLength(3);
    expect(got.every((e) => e.type === 'received' && !e.bow)).toBe(true);
    expect(r.effects).toContainEqual({ type: 'offerRejected', reason: 'cap' });
  });
  it('자는 동안·열리지 않은 종류·모르는 종류는 받지 않는다', () => {
    const at = kst(11, 25, 10);
    const r = play(fresh(), [
      { type: 'grind', at, durationMs: 800 },
      { type: 'offer', at: at + 1000, kind: 'meal', item: 'pine' },
      { type: 'offer', at: at + 2000, kind: 'treat', item: 'dewdrop' },
      { type: 'offer', at: at + 3000, kind: 'meal', item: 'pattern' } as unknown as E,
      { type: 'putToSleep', at: kst(11, 25, 22) },
      { type: 'offer', at: kst(11, 25, 22) + 1000, kind: 'treat', item: 'pattern' },
    ]);
    expect(r.effects.filter((e) => e.type === 'offerRejected').map((e) => e.type === 'offerRejected' && e.reason)).toEqual(['locked', 'locked', 'locked', 'asleep']);
    expect(r.state.v3.meal).toMatchObject({ spoons: 0, treats: 0 });
  });
});

describe('깸 경계 초기화', () => {
  it('깸이 바뀌면 spoons·treats만 0, nudgeOptIn·pantry는 그대로', () => {
    const at = kst(11, 25, 10);
    let s = play(fresh(), [
      { type: 'mealNudge', at, on: true },
      { type: 'grind', at: at + 500, durationMs: 800 },
      { type: 'offer', at: at + 1000, kind: 'meal', item: 'clear' },
      { type: 'offer', at: at + 2000, kind: 'treat', item: 'pattern' },
    ]).state;
    expect(s.v3.meal).toEqual({ spoons: 1, treats: 1, nudgeOptIn: true });
    const pantry = s.v3.pantry;
    s = day(s, 0).state;
    expect(s.v3.meal).toEqual({ spoons: 0, treats: 0, nudgeOptIn: true });
    expect(s.v3.pantry).toEqual(pantry);
  });
  it('여러 날 비운 뒤 한꺼번에 정산돼도 밀린 밥이 쌓이지 않는다(다음 깸도 2숟갈)', () => {
    const at = kst(11, 25, 10);
    let s = play(fresh(), [
      { type: 'grind', at, durationMs: 800 },
      { type: 'offer', at: at + 1000, kind: 'meal', item: 'clear' },
      { type: 'offer', at: at + 2000, kind: 'meal', item: 'clear' },
      { type: 'appBackground', at: at + 3000 },
      { type: 'appForeground', at: kst(12, 2, 9), tzOffsetMin: KST },
    ]).state;
    expect(s.v3.meal.spoons).toBe(0);
    s = play(s, [
      { type: 'grind', at: kst(12, 2, 10), durationMs: 800 },
      { type: 'offer', at: kst(12, 2, 10) + 1000, kind: 'meal', item: 'clear' },
      { type: 'offer', at: kst(12, 2, 10) + 2000, kind: 'meal', item: 'clear' },
      { type: 'offer', at: kst(12, 2, 10) + 3000, kind: 'meal', item: 'clear' },
    ]).state;
    expect(s.v3.meal.spoons).toBe(2);
  });
});

describe('밥을 안 줘도 나빠지지 않는다 · 몸 크기·비율 변화 0(D-03, QA-3 R7·R8·R9)', () => {
  it('밥·간식을 날마다 다 줘도, 하나도 안 줘도 sim(몸·획·정·꿈·성향) 전체가 같다', () => {
    const all = [
      { kind: 'meal' as const, item: 'clear' },
      { kind: 'meal' as const, item: 'clear' },
      { kind: 'treat' as const, item: 'pattern' },
      { kind: 'treat' as const, item: 'pattern' },
      { kind: 'treat' as const, item: 'pattern' },
    ];
    const fed = days(fresh(), 16, { touch: true, offers: all }).state;
    const none = days(fresh(), 16, { touch: true }).state;
    expect(fed.sim).toEqual(none.sim);
    expect(fed.v3.life).toEqual(none.v3.life);
    expect(fed.v3.words).toEqual(none.v3.words);
    expect(fed.v3.pantry).toEqual(none.v3.pantry);
  });
  it('몸 입력 모듈(geometry·visual·sim·snap)은 v3·meal·pantry를 읽지 않는다(정적 검사, R8 ③)', () => {
    const files = Object.keys(CORE).filter((p) => /^\.\.\/src\/(geometry|visual|sim|snap)\//.test(p));
    expect(files.length).toBeGreaterThan(10);
    const hits = files.filter((p) => {
      const src = CORE[p]!;
      return /from\s+['"][^'"]*\/v3(\/|['"])/.test(src) || /\b(pantry|spoons|nudgeOptIn)\b/.test(src);
    });
    expect(hits).toEqual([]);
  });
});

describe('공방 pantry — 열림 = 이레 아침·정(care 3-2), 줄지 않음', () => {
  it('처음엔 맑은 먹·무늬 먹 조각만', () => {
    expect(fresh().v3.pantry).toEqual({ meal: ['clear'], treat: ['pattern'] });
  });
  it('송화 먹 = 첫 이레 아침(7밤 뒤 깸), 이슬 먹 = 둘째 이레 아침(14밤 뒤 깸)', () => {
    let r = days(fresh(), 6);
    expect(r.state.v3.pantry.meal).toEqual(['clear']);
    r = day(r.state, 6);
    expect(r.state.v3.life.slept).toBe(7);
    expect(r.state.v3.pantry.meal).toEqual(['clear', 'pine']);
    expect(r.effects).toContainEqual({ type: 'pantryOpened', kind: 'meal', item: 'pine' });
    r = days(r.state, 6, {}, 7);
    expect(r.state.v3.pantry.meal).toEqual(['clear', 'pine']);
    r = day(r.state, 13);
    expect(r.state.v3.life.slept).toBe(14);
    expect(r.state.v3.pantry.meal).toEqual(['clear', 'pine', 'dew']);
  });
  it('늘인 먹 한 가락 = 정 2, 이슬 한 방울 = 정 4 — 그다음 깸 경계에서 열린다', () => {
    let r = day(fresh(), 0, { touch: true });
    expect(r.state.sim.relation.jeongDays).toBe(1);
    expect(r.state.v3.pantry.treat).toEqual(['pattern']);
    r = day(r.state, 1, { touch: true });
    expect(r.state.sim.relation.jeongDays).toBe(2);
    expect(r.state.v3.pantry.treat).toEqual(['pattern', 'ribbon']);
    expect(r.effects).toContainEqual({ type: 'pantryOpened', kind: 'treat', item: 'ribbon' });
    r = days(r.state, 2, { touch: true }, 2);
    expect(r.state.v3.pantry.treat).toEqual(['pattern', 'ribbon', 'dewdrop']);
  });
  it('열린 종류는 바로 줄 수 있다', () => {
    const s = days(fresh(), 2, { touch: true }).state;
    const at = kst(11, 27, 10);
    const r = play(s, [{ type: 'offer', at, kind: 'treat', item: 'ribbon' }]);
    expect(r.effects.some((e) => e.type === 'received' && e.item === 'ribbon')).toBe(true);
  });
  it('쓰지 않고 연적만 · 만지지 않은 날은 열리지 않는다(진행 = 밤·정뿐, 밥과 무관)', () => {
    const r = days(fresh(), 8, { write: false });
    expect(r.state.v3.life.slept).toBe(8);
    expect(r.state.v3.pantry).toEqual({ meal: ['clear', 'pine'], treat: ['pattern'] });
  });
});

describe('좋아하는 것 = 타고남 씨앗만(care 3-3, D-13)', () => {
  it('씨앗 하나 → 여섯 가지 중 하나, 같은 씨앗 = 같은 것', () => {
    const a = v3.likedItemOf(fresh().sim.birth.seed);
    expect(v3.LIKED_ITEMS).toContain(a);
    expect(v3.likedItemOf(fresh().sim.birth.seed)).toBe(a);
  });
  it('씨앗만 본다: 쓴 말결·밥·정이 달라도 같다', () => {
    const s0 = fresh();
    const s1 = days(s0, 9, { touch: true, offers: [{ kind: 'treat', item: 'pattern' }] }).state;
    expect(v3.likedItem(s1)).toBe(v3.likedItem(s0));
    expect(v3.likedItem(s1)).toBe(v3.likedItemOf(s0.sim.birth.seed));
  });
  it('여섯 가지가 고르게 나온다(씨앗 6000개, 각 1/6 ± 20%)', () => {
    const n: Record<string, number> = {};
    for (let i = 0; i < 6000; i++) {
      const k = v3.likedItemOf((Math.imul(i, 2654435761) >>> 0) ^ 0x5bd1e995);
      n[k] = (n[k] ?? 0) + 1;
    }
    expect(Object.keys(n).sort()).toEqual([...v3.LIKED_ITEMS].sort());
    for (const v of Object.values(n)) expect(Math.abs(v - 1000)).toBeLessThan(200);
  });
  it('첫 이레 아침 전에는 모두 같게 기뻐하고(liked false), 그 뒤 좋아하는 것만 liked', () => {
    // 좋아하는 것이 '무늬 먹 조각'인 씨앗을 찾는다(처음부터 열려 있어 바로 줄 수 있다)
    let seed = 1;
    while (v3.likedItemOf(fresh(seed).sim.birth.seed) !== 'pattern') seed++;
    const at = kst(11, 25, 10);
    const before = play(fresh(seed), [{ type: 'offer', at, kind: 'treat', item: 'pattern' }]);
    expect(before.effects).toContainEqual({ type: 'received', kind: 'treat', item: 'pattern', bow: false, liked: false });
    const s7 = days(fresh(seed), 7).state;
    expect(s7.v3.life.slept).toBe(7);
    const after = play(s7, [
      { type: 'grind', at: kst(12, 2, 10), durationMs: 800 },
      { type: 'offer', at: kst(12, 2, 10) + 1000, kind: 'treat', item: 'pattern' },
      { type: 'offer', at: kst(12, 2, 10) + 2000, kind: 'meal', item: 'clear' },
    ]);
    const got = after.effects.filter((e) => e.type === 'received');
    expect(got).toEqual([
      { type: 'received', kind: 'treat', item: 'pattern', bow: false, liked: true },
      { type: 'received', kind: 'meal', item: 'clear', bow: false, liked: false },
    ]);
  });
  it('좋아하는 것은 세이브에 없다(씨앗에서 매번 계산)', () => {
    const json = v3.serializeV3(days(fresh(), 8).state, kst(12, 3, 9));
    expect(json).not.toMatch(/liked|favorite/i);
  });
});

describe('밥 알림 데이터(V29는 알림, 여기는 데이터만)', () => {
  it('nudgeOptIn 기본 꺼짐, mealNudge 이벤트로 켜고 끈다(자는 동안도)', () => {
    let s = fresh();
    expect(s.v3.meal.nudgeOptIn).toBe(false);
    s = play(s, [{ type: 'putToSleep', at: kst(11, 25, 22) }, { type: 'mealNudge', at: kst(11, 25, 22) + 1000, on: true }]).state;
    expect(s.v3.meal.nudgeOptIn).toBe(true);
    s = play(s, [{ type: 'mealNudge', at: kst(11, 25, 23), on: false }]).state;
    expect(s.v3.meal.nudgeOptIn).toBe(false);
  });
  it('알림 후보 = 쓴 깸 → 다음다음 깸, 안 쓴 깸 → 다음 깸(D-27). 입력은 hasWord·nudgeOptIn 두 불값뿐', () => {
    const s0 = play(fresh(), [{ type: 'mealNudge', at: kst(11, 25, 9) + 1, on: true }]).state;
    const input0 = v3.mealNudgeInput(s0);
    expect(input0).toEqual({ hasWord: false, nudgeOptIn: true });
    expect(v3.nudgeWakesAhead(input0)).toBe(1);
    const s1 = play(s0, [
      { type: 'grind', at: kst(11, 25, 10), durationMs: 9000 },
      { type: 'write', at: kst(11, 25, 10) + 1000, word: word('죽고싶어'), chars: 2, raw: handStroke(1) },
    ]).state;
    const s2 = play(s0, [
      { type: 'grind', at: kst(11, 25, 10), durationMs: 9000 },
      { type: 'write', at: kst(11, 25, 10) + 1000, word: word('비'), chars: 1, raw: handStroke(1) },
    ]).state;
    // 위기 말이든 고요 말이든 같은 입력(흔적 0)
    expect(v3.mealNudgeInput(s1)).toEqual({ hasWord: true, nudgeOptIn: true });
    expect(v3.mealNudgeInput(s2)).toEqual(v3.mealNudgeInput(s1));
    expect(v3.nudgeWakesAhead(v3.mealNudgeInput(s1))).toBe(2);
    expect(v3.nudgeWakesAhead({ hasWord: true, nudgeOptIn: false })).toBeNull();
  });
  it('밥 알림 모듈은 사전·위기 대조·말결을 import하지 않는다(QA-3 R2 ①-a 정적 검사)', () => {
    const src = CORE['../src/v3/nudge.ts']!;
    expect(src).toMatch(/nudgeWakesAhead/);
    expect(src).not.toMatch(/^\s*import\b/m);
    expect(src).not.toMatch(/lexicon|crisis|sense|interpret/);
  });
});

describe('세이브 v3 이행 — 세로 조각 세이브가 유실 없이 이어진다(멱등)', () => {
  /** main(세로 조각, 4ada3ca)이 쓰던 블록 모양 그대로: 열린 종류는 늘 ['clear'] / ['pattern'] */
  function sliceJson(s: S, savedAt: number): string {
    const o = JSON.parse(v3.serializeV3(s, savedAt)) as { v3: v3.V3Block };
    o.v3 = { ...o.v3, pantry: { meal: ['clear'], treat: ['pattern'] } };
    return JSON.stringify(o);
  }
  it('세로 조각 세이브(9밤·정 3)를 읽으면 말·밤·밥 칸은 그대로, 이미 지난 이레·정의 열림만 채운다', () => {
    let s = days(fresh(), 3, { touch: true }).state;
    s = days(s, 6, {}, 3).state;
    s = { ...s, v3: { ...s.v3, meal: { ...s.v3.meal, nudgeOptIn: true } } };
    const old = sliceJson(s, kst(12, 4, 9));
    const back = v3.parseV3(old);
    expect(back.v3.words).toEqual(s.v3.words);
    expect(back.v3.life).toEqual(s.v3.life);
    expect(back.v3.meal).toEqual(s.v3.meal);
    expect(back.v3.tonightCounted).toBe(s.v3.tonightCounted);
    expect(back.v3.version).toBe(3);
    expect(back.v3.pantry).toEqual({ meal: ['clear', 'pine'], treat: ['pattern', 'ribbon'] });
    expect(back.sim).toEqual(v3.parseV3(v3.serializeV3(s, kst(12, 4, 9))).sim);
  });
  it('이행은 멱등: 한 번 읽고 쓴 것을 다시 읽고 써도 같은 바이트', () => {
    const s = days(fresh(), 15, { touch: true }).state;
    const old = sliceJson(s, kst(12, 11, 9));
    const once = v3.serializeV3(v3.parseV3(old), kst(12, 11, 9));
    const twice = v3.serializeV3(v3.parseV3(once), kst(12, 11, 9));
    expect(twice).toBe(once);
    expect(v3.parseV3(once).v3.pantry).toEqual({ meal: ['clear', 'pine', 'dew'], treat: ['pattern', 'ribbon', 'dewdrop'] });
  });
  it('저장 키·읽기 경로 그대로: 세로 조각 본을 readSaveV3가 main에서 읽고, 다시 써도 옛 빌드가 읽을 수 있는 같은 판(3)', () => {
    const s = days(fresh(), 3, { touch: true }).state;
    const kv = memKV({ [v3.V3_KEYS.main]: sliceJson(s, kst(11, 29, 9)) });
    const r = v3.readSaveV3(kv);
    expect(r.source).toBe('main');
    expect(r.state!.v3.words).toEqual(s.v3.words);
    expect(v3.writeSaveV3(kv, r.state!, kst(11, 29, 10)).ok).toBe(true);
    const o = JSON.parse(kv.data[v3.V3_KEYS.main]!) as { v3: { version: number; pantry: unknown } };
    expect(o.v3.version).toBe(3);
    expect(o.v3.pantry).toEqual({ meal: ['clear'], treat: ['pattern', 'ribbon'] });
  });
  it('열린 종류는 정해진 순서·중복 없이 저장되고, 모르는 종류는 손상으로 본다', () => {
    const s = fresh();
    const o = JSON.parse(v3.serializeV3(s, kst(11, 25, 9))) as { v3: v3.V3Block };
    o.v3.pantry = { meal: ['clear', 'clear'], treat: ['pattern'] };
    expect(v3.parseV3(JSON.stringify(o)).v3.pantry).toEqual({ meal: ['clear'], treat: ['pattern'] });
    o.v3.pantry = { meal: ['pine', 'clear'], treat: ['pattern'] };
    expect(v3.parseV3(JSON.stringify(o)).v3.pantry.meal).toEqual(['clear', 'pine']);
    o.v3.pantry = { meal: ['clear', 'cake'] as never, treat: ['pattern'] };
    expect(() => v3.parseV3(JSON.stringify(o))).toThrow(/pantry/);
    o.v3.pantry = { meal: [], treat: [] };
    // 처음부터 열린 것이 빠져 있으면 채운다(공방에서 줄지 않음)
    expect(v3.parseV3(JSON.stringify(o)).v3.pantry).toEqual({ meal: ['clear'], treat: ['pattern'] });
  });
  it('밥 칸에 시각·횟수 같은 모르는 칸이 있으면 손상으로 본다(저장 0 고정)', () => {
    const o = JSON.parse(v3.serializeV3(fresh(), kst(11, 25, 9))) as { v3: { meal: Record<string, unknown> } };
    o.v3.meal.lastAt = 1;
    expect(() => v3.parseV3(JSON.stringify(o))).toThrow(/meal/);
  });
});

describe('업로드 허용 목록 — 맡겨 두기·핑(care 2-3·4-1, M6)', () => {
  it('맡겨 두기 = words(획 + 말결)·life·meal·pantry·tonightCounted. walk는 넣지 않는다', () => {
    expect([...v3.V3_UPLOAD_FIELDS].sort()).toEqual(['life', 'meal', 'pantry', 'tonightCounted', 'words']);
    expect(v3.V3_DEVICE_ONLY_FIELDS).toContain('walk');
    expect(v3.V3_UPLOAD_FIELDS as readonly string[]).not.toContain('walk');
  });
  it('기기에만 있는 칸(walk)을 블록에 넣어도 업로드에는 없다 — 업로드는 허용 목록으로만 만든다', () => {
    const s = days(fresh(), 2, { touch: true }).state;
    const withWalk = { ...s, v3: { ...s.v3, walk: { day: true } } as v3.V3Block };
    const up = v3.uploadV3(withWalk);
    expect(Object.keys(up).sort()).toEqual([...v3.V3_UPLOAD_FIELDS].sort());
    expect(JSON.stringify(up)).not.toMatch(/walk/);
    expect(up.meal).toEqual(s.v3.meal);
    expect(up.pantry).toEqual(s.v3.pantry);
    for (const w of up.words) expect(Object.keys(w).sort()).toEqual(['attachStroke', 'sense']);
  });
  it('블록의 모든 칸은 업로드 또는 기기 전용 중 하나로 정해져 있다(새 칸이 말없이 올라가지 않게)', () => {
    const known = new Set<string>(['version', ...v3.V3_UPLOAD_FIELDS, ...v3.V3_DEVICE_ONLY_FIELDS]);
    expect(Object.keys(v3.emptyV3Block()).filter((k) => !known.has(k))).toEqual([]);
  });
});

describe('섭식 안전 — 데이터·이벤트 이름에도 금지 표현 0(QA-3 R4·R7·R8·R9)', () => {
  const BAN = /full|hungr|starv|skip|miss|streak|lastat|count|enough|overfe|weight|\bfat|slim|diet|belly|portion|crav|empty|배불|그만|충분|다 먹|많이 먹|허기|배고|굶/i;
  it('밥 경로의 효과·세이브 칸·밥 모듈 이름에 포만·배고픔·몸·횟수·연속 낱말이 없다', () => {
    const all = [
      { kind: 'meal' as const, item: 'clear' },
      { kind: 'meal' as const, item: 'clear' },
      { kind: 'meal' as const, item: 'clear' },
      { kind: 'treat' as const, item: 'pattern' },
      { kind: 'treat' as const, item: 'ribbon' },
      { kind: 'treat' as const, item: 'pine' },
    ];
    const r = days(fresh(), 8, { touch: true, offers: all });
    const mealFx = r.effects.filter((e) => MEAL_EFFECTS.has(e.type));
    expect(mealFx.length).toBeGreaterThan(10);
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
    collect(mealFx);
    collect({ meal: r.state.v3.meal, pantry: r.state.v3.pantry });
    Object.keys(v3).filter((k) => /meal|treat|pantry|nudge|liked|offer|upload/i.test(k)).forEach((k) => names.add(k));
    collect([...v3.MEAL_KINDS, ...v3.TREAT_KINDS]);
    expect([...names].filter((n) => BAN.test(n))).toEqual([]);
  });
});
