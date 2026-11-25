// V27b 세이브 v3 맡겨 두기 core: 올리는 본문(uploadV3로만)·되찾은 본문 읽기(말 복원 규칙)·'쌓이기만' 병합(공방 합집합·정 최댓값).
import { describe, expect, it } from 'vitest';
import { sim, v3 } from '../src/index';
import { H, KST, handStroke, kst } from './sim-helpers';

type S = v3.V3State;
type E = v3.V3Event;

const FIRST_TAP: sim.BirthInput = { x: 0.1, y: -0.2, ms: kst(11, 25, 9), installAt: kst(11, 25, 9), entropy: 0x1234 };
const fresh = (entropy = 0x1234) => v3.createV3(kst(11, 25, 9), KST, 7, { birth: { ...FIRST_TAP, entropy } });

function play(s: S, events: E[]): S {
  let st = s;
  for (const e of events) st = v3.reduceV3(st, e).state;
  return st;
}
const word = (text: string): v3.WordInput => ({ ...v3.storedWordOf(v3.interpretWord(text, 'ko')), lexVer: v3.LEX_VER, source: 'keyboard' });
const TEXTS = ['행복해', '비', '고마워', '슬퍼'];

/** d일째 하루. o.write=false면 말 없이 연적만, o.touch면 몸 쓰다듬기(정) */
function day(s: S, d: number, o: { write?: boolean; touch?: boolean; text?: string; sleep?: boolean } = {}): S {
  const base = kst(11, 25 + d, 20);
  const ev: E[] = [{ type: 'appForeground', at: base, tzOffsetMin: KST }, { type: 'grind', at: base + 60_000, durationMs: 9000 }];
  if (o.touch) ev.push({ type: 'tap', at: base + 90_000, target: 'body', holdMs: 100, x: 0, y: 0 });
  if (o.write !== false) ev.push({ type: 'write', at: base + 120_000, word: word(o.text ?? TEXTS[d % TEXTS.length]!), chars: 1, raw: handStroke(d + 1) });
  if (o.sleep !== false) ev.push({ type: 'putToSleep', at: base + 2 * H });
  ev.push({ type: 'appBackground', at: base + 2 * H + 60_000 });
  ev.push({ type: 'appForeground', at: base + 12 * H, tzOffsetMin: KST });
  return play(s, ev);
}
function days(n: number, o: Parameters<typeof day>[2] = {}, s = fresh(), from = 0): S {
  let st = s;
  for (let d = from; d < from + n; d++) st = day(st, d, o);
  return st;
}
const SAVED = kst(12, 1, 9);
const body = (s: S) => v3.uploadBodyV3(s, SAVED);
/** 기기 세이브에서 읽은 상태(앱이 맡길 때 보는 것 — 읽기가 backgroundSince를 채운다) */
const loaded = (s: S) => v3.parseV3(v3.serializeV3(s, SAVED));

describe('올리는 본문 = sim 봉투 + v3 허용 목록(V27b, R7)', () => {
  it('키 집합: 맨 위 = 봉투 + v3, v3 = version + V3_UPLOAD_FIELDS, 말 = {attachStroke, sense}', () => {
    const s = days(4, { touch: true });
    const o = JSON.parse(body(s)) as { v3: Record<string, unknown> & { words: Record<string, unknown>[] } };
    expect(Object.keys(o).sort()).toEqual(['schemaVersion', 'sim', 'strokes', 'v3']);
    expect(Object.keys(o.v3).sort()).toEqual(['version', ...v3.V3_UPLOAD_FIELDS].sort());
    expect(o.v3.words).toHaveLength(4);
    o.v3.words.forEach((w, i) => {
      expect(Object.keys(w).sort()).toEqual(['attachStroke', 'sense']);
      expect(w.attachStroke).toBe(i); // 봉투 i번째 획 = 이 말의 붙은 획(한 벌만)
    });
    expect(v3.checkUploadBodyV3(body(s))).toEqual({ kind: 'ok' });
  });
  it('기기 전용 칸(walk·captionsShown)과 말의 세기·사전 판·입력 방식·strokeId는 본문 바이트에 0', () => {
    let s = days(3, { touch: true });
    s = play(s, [{ type: 'jeongCaption', at: kst(11, 28, 10), signal: 'recognize' }]);
    expect(s.v3.captionsShown).toBeDefined();
    const withWalk = { ...s, v3: { ...s.v3, walk: { day: true } } as v3.V3Block };
    const b = body(withWalk);
    const block = JSON.stringify((JSON.parse(b) as { v3: unknown }).v3);
    for (const ban of ['captionsShown', 'walk', 'intensity', 'lexVer', 'strokeId', v3.LEX_VER]) expect(b, ban).not.toContain(ban);
    expect(block).not.toContain('source'); // (sim 봉투의 birth.source는 B2 정본 — 말의 입력 방식만 본다)
  });
  it('위기 말을 쓴 날과 고요한 말을 쓴 날의 본문이 바이트까지 같다(R11 ②)', () => {
    const a = days(2, {}, fresh());
    const run = (text: string) => body(day(a, 2, { text }));
    expect(run('죽고싶어')).toBe(run('고요'));
  });
  it('붙은 획은 봉투에 한 벌만(리뷰 M-1): 봉투 획 수 = 말 수, 봉투 획 = sim 붙은 획 그대로', () => {
    const s = days(3);
    const o = JSON.parse(body(s)) as { strokes: { raw: string }[]; v3: { words: { attachStroke: number }[] } };
    expect(o.strokes).toHaveLength(o.v3.words.length);
    expect(JSON.parse(sim.serializeState(s.sim, SAVED)).strokes).toEqual(o.strokes);
  });
  it('봉투 획 순서와 말 순서가 다르면 만들지 않는다(닫힌 쪽 실패)', () => {
    const s = days(2);
    const swapped = { ...s, v3: { ...s.v3, words: [s.v3.words[1]!, s.v3.words[0]!] } };
    expect(() => body(swapped)).toThrow(v3.UploadShapeError);
  });
  it('말 없는 획이 봉투에 있으면 만들지 않는다(닫힌 쪽 실패 — 나머지 글씨 점열 0)', () => {
    const s = days(2);
    const extra = { ...s, sim: { ...s.sim, strokes: [...s.sim.strokes, { ...s.sim.strokes[0]!, id: 'x-extra' }] } };
    expect(() => body(extra)).toThrow(v3.UploadShapeError);
  });
  it('같은 상태 = 같은 본문(결정적), 저장 시각만 다르면 sim.savedAt만 다르다', () => {
    const s = days(3);
    expect(body(s)).toBe(body(s));
    expect(v3.uploadBodyV3(s, SAVED + 1)).not.toBe(body(s));
  });
});

describe('본문 검사(서버·가짜 서버·앱 마지막 문이 같이 씀)', () => {
  const s = () => days(3, { touch: true });
  const mutate = (f: (o: Record<string, any>) => void) => {
    const o = JSON.parse(body(s())) as Record<string, any>;
    f(o);
    return v3.checkUploadBodyV3(JSON.stringify(o));
  };
  it.each([
    ['v3에 기기 전용 칸', (o: Record<string, any>) => (o.v3.captionsShown = [0, 0, 0, 0]), 'v3_keys'],
    ['v3에 마실 날', (o: Record<string, any>) => (o.v3.walk = { day: true }), 'v3_keys'],
    ['말에 세기', (o: Record<string, any>) => (o.v3.words[0].intensity = 2), 'v3_word'],
    ['기기 형태 말(strokeId)', (o: Record<string, any>) => (o.v3.words[0] = { sense: o.v3.words[0].sense, strokeId: 's1' }), 'v3_word'],
    ['모르는 말결(위기 표지 등)', (o: Record<string, any>) => (o.v3.words[0].sense = 'x.stay'), 'v3_word'],
    ['밥 칸에 시각', (o: Record<string, any>) => (o.v3.meal.lastAt = 1), 'v3_meal'],
    ['이레 표지에 다른 칸', (o: Record<string, any>) => (o.v3.life.snapshots[0] = { night: 7, at: 1, word: 'x' }), 'v3_life'],
    ['말 없는 봉투 획', (o: Record<string, any>) => o.strokes.push(o.strokes[0]), 'v3_strokes'],
    ['붙은 획 번호가 순서와 다름', (o: Record<string, any>) => (o.v3.words[0].attachStroke = 1), 'v3_word'],
    ['맨 위에 낯선 칸(리뷰 M-3)', (o: Record<string, any>) => (o.extra = { text: '행복해' }), 'v3_top'],
    ['sim 블록에 낯선 칸', (o: Record<string, any>) => (o.sim.note = 'x'), 'v3_sim'],
    ['sim.state에 낯선 칸', (o: Record<string, any>) => (o.sim.state.secret = 'x'), 'v3_state'],
    ['sim.state에서 칸 빠짐', (o: Record<string, any>) => delete o.sim.state.relation, 'v3_state'],
    ['획 메타에 낯선 칸', (o: Record<string, any>) => (o.sim.strokeMeta[0].text = 'x'), 'v3_strokes'],
    ['봉투 획에 낯선 칸', (o: Record<string, any>) => (o.strokes[0].word = 'x'), 'v3_strokes'],
    ['정이 상식 상한 밖(1e12)', (o: Record<string, any>) => (o.sim.state.relation.jeongDays = 1e12), 'v3_jeong'],
    ['정이 깸 수 + 1 + 여유를 넘음', (o: Record<string, any>) => (o.sim.state.relation.jeongDays = o.sim.state.dayIndex + 2 + v3.JEONG_SLACK), 'v3_jeong'],
    ['완성 표지 밤이 범위 밖(리뷰 L-4)', (o: Record<string, any>) => (o.v3.life.final = { night: 29, at: 1 }), 'v3_life'],
    ['완성 표지에 다른 칸', (o: Record<string, any>) => (o.v3.life.final = { night: 28, at: 1, word: 'x' }), 'v3_life'],
    ['모르는 공방 종류', (o: Record<string, any>) => o.v3.pantry.meal.push('cake'), 'v3_pantry'],
  ])('%s → invalid', (_n, f, reason) => {
    expect(mutate(f)).toEqual({ kind: 'invalid', reason });
  });
  it('sim.state 키 목록 고정(새 칸은 이 목록·처리방침 3-5 대조를 함께 고쳐야 올라간다), nightCtx만 선택', () => {
    const o = JSON.parse(body(days(2))) as { sim: { state: Record<string, unknown> } };
    expect(Object.keys(o.sim.state).sort()).toEqual([...v3.V3_SIM_STATE_KEYS].filter((k) => k !== 'nightCtx').sort());
    expect(v3.checkUploadBodyV3(JSON.stringify({ ...o, sim: { ...o.sim, state: { ...o.sim.state, nightCtx: { moon: null } } } })).kind).not.toBe('invalid');
  });
  it('정이 상한 끝값(dayIndex + 1 + 여유)이면 받고, 완성 표지가 맞으면(28밤) 받는다', () => {
    const o = JSON.parse(body(days(3))) as Record<string, any>;
    o.sim.state.relation.jeongDays = o.sim.state.dayIndex + 1 + v3.JEONG_SLACK;
    o.v3.life.final = { night: 28, at: 5 };
    expect(v3.checkUploadBodyV3(JSON.stringify(o))).toEqual({ kind: 'ok' });
  });
  it('블록 판이 더 크면 future, v3 블록 없는 옛 본(v2)은 이 검사의 대상이 아님(ok)', () => {
    expect(mutate((o) => (o.v3.version = v3.V3_VERSION + 1))).toEqual({ kind: 'future' });
    expect(v3.checkUploadBodyV3(sim.serializeState(fresh().sim, SAVED))).toEqual({ kind: 'ok' });
  });
  it('형태: v2·v3·future·bad', () => {
    expect(v3.saveFormOf(sim.serializeState(fresh().sim, SAVED))).toBe('v2');
    expect(v3.saveFormOf(body(fresh()))).toBe('v3');
    expect(v3.saveFormOf(v3.serializeV3(fresh(), SAVED))).toBe('v3');
    expect(v3.saveFormOf(mutate.length ? JSON.stringify({ ...JSON.parse(body(fresh())), v3: { version: 9 } }) : '')).toBe('future');
    expect(v3.saveFormOf('{')).toBe('bad');
    expect(v3.saveFormOf(null)).toBe('bad');
  });
});

describe('되찾은 본문 읽기 = 말 복원 규칙(결정적)', () => {
  it('sim·생애·밥·공방·오늘 셈은 그대로, 말은 sense·strokeId 그대로 + night = 몇 번째 말·고정값', () => {
    const s = days(5, { touch: true });
    const r = v3.parseUploadV3(body(s));
    expect(r.sim).toEqual(sim.parseState(sim.serializeState(s.sim, SAVED)));
    expect(r.v3.life).toEqual(s.v3.life);
    expect(r.v3.meal).toEqual(s.v3.meal);
    expect(r.v3.pantry).toEqual(s.v3.pantry);
    expect(r.v3.tonightCounted).toBe(s.v3.tonightCounted);
    expect(r.v3.words.map((w) => [w.sense, w.strokeId])).toEqual(s.v3.words.map((w) => [w.sense, w.strokeId]));
    expect(r.v3.words.map((w) => w.night)).toEqual([1, 2, 3, 4, 5]);
    for (const w of r.v3.words) expect([w.intensity, w.lexVer, w.source]).toEqual([v3.RESTORED_INTENSITY, v3.RESTORED_LEX_VER, 'keyboard']);
    expect(r.v3.captionsShown).toBeUndefined();
    expect(v3.heartOf(r)).toEqual(v3.heartOf(s));
  });
  it('되찾은 상태를 다시 올리면 본문이 같다(빨리 감기 — 되찾은 뒤 거짓 충돌 0)', () => {
    const s = loaded(days(6, { touch: true }));
    expect(body(v3.parseUploadV3(body(s)))).toBe(body(s));
  });
  it('되찾은 상태는 기기 세이브로 저장·다시 읽어도 그대로(parseV3 통과 — 세로 조각 빌드도 읽는다)', () => {
    const r = v3.parseUploadV3(body(days(4)));
    expect(v3.parseV3(v3.serializeV3(r, SAVED))).toEqual(r);
  });
  it('속성: 되찾은 뒤 같은 날들을 더 살면 원본과 몸·밤·공방·정·본문이 같다(시드 12)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const n = 2 + (seed % 9);
      const o = { touch: seed % 2 === 0, write: seed % 3 !== 0 };
      const s = loaded(days(n, o, fresh(seed)));
      let a = s;
      let b = v3.parseUploadV3(v3.uploadBodyV3(s, SAVED));
      for (let d = n; d < n + 4; d++) {
        a = day(a, d, { touch: d % 2 === 0 });
        b = day(b, d, { touch: d % 2 === 0 });
      }
      expect(b.sim, `seed ${seed}`).toEqual(a.sim);
      expect(b.v3.life).toEqual(a.v3.life);
      expect(b.v3.pantry).toEqual(a.v3.pantry);
      expect(v3.jeongOf(b)).toBe(v3.jeongOf(a));
      expect(body(b)).toBe(body(a));
    }
  });
  it('v2 본문·손상 본문은 v3로 읽지 않는다, 새 판은 FutureV3Error', () => {
    expect(() => v3.parseUploadV3(sim.serializeState(fresh().sim, SAVED))).toThrow(/옛 세이브/);
    const o = JSON.parse(body(fresh())) as Record<string, any>;
    o.v3.version = 4;
    expect(() => v3.parseUploadV3(JSON.stringify(o))).toThrow(v3.FutureV3Error);
    o.v3.version = 3;
    o.v3.meal.spoons = 'x';
    expect(() => v3.parseUploadV3(JSON.stringify(o))).toThrow(/손상/);
  });
  it('readAnyV3: 기기 형태와 올린 형태를 모두 읽는다', () => {
    const s = days(2);
    expect(v3.readAnyV3(v3.serializeV3(s, SAVED)).v3.words).toEqual(s.v3.words);
    expect(v3.readAnyV3(body(s)).v3.words[0]!.lexVer).toBe(v3.RESTORED_LEX_VER);
  });
});

describe("'쌓이기만' 병합 — 공방 합집합·정 최댓값(V27b)", () => {
  const withPantry = (s: S, meal: v3.MealItem[], treat: v3.TreatItem[]): S => ({ ...s, v3: { ...s.v3, pantry: { meal, treat } } });
  const withJeong = (s: S, n: number): S => ({ ...s, sim: { ...s.sim, relation: { ...s.sim.relation, jeongDays: n } } });
  it('공방 합집합은 교환·멱등, 정해진 순서', () => {
    const a = { meal: ['clear', 'dew'] as v3.MealItem[], treat: ['pattern'] as v3.TreatItem[] };
    const b = { meal: ['pine', 'clear'] as v3.MealItem[], treat: ['ribbon', 'pattern'] as v3.TreatItem[] };
    expect(v3.unionPantry(a, b)).toEqual({ meal: ['clear', 'pine', 'dew'], treat: ['pattern', 'ribbon'] });
    expect(v3.unionPantry(a, b)).toEqual(v3.unionPantry(b, a));
    expect(v3.unionPantry(v3.unionPantry(a, b), b)).toEqual(v3.unionPantry(a, b));
  });
  it('같은 몽망이: 정은 큰 쪽, 공방은 합집합. 다른 몽망이: 공방만(공방 단위), 정은 그대로', () => {
    const base = days(2);
    const local = withJeong(withPantry(base, ['clear', 'pine'], ['pattern']), 5);
    const server = withJeong(withPantry(base, ['clear'], ['pattern', 'ribbon']), 3);
    const m = v3.stackV3(server, local);
    expect(m.sim.relation.jeongDays).toBe(5);
    // 상한: 다른 갈래 정이 아무리 커도 받는 쪽 jeongCapOf에서 멈춘다(받는 쪽 자기 값 아래로는 내려가지 않음)
    const huge = v3.stackV3(server, withJeong(local, 1e9));
    expect(huge.sim.relation.jeongDays).toBe(v3.jeongCapOf(server.sim));
    expect(v3.checkUploadBodyV3(v3.uploadBodyV3(huge, SAVED))).toEqual({ kind: 'ok' });
    expect(v3.stackV3(withJeong(server, 3), withJeong(server, 0)).sim.relation.jeongDays).toBe(3);
    expect(m.v3.pantry).toEqual({ meal: ['clear', 'pine'], treat: ['pattern', 'ribbon'] }); // 합집합(이슬 한 방울은 V9b부터 18밤 — 정으로는 열리지 않음)
    const other = withJeong(withPantry(days(2, {}, fresh(0x9999)), ['clear'], ['pattern']), 1);
    expect(v3.sameCreatureV3(other, local)).toBe(false);
    const m2 = v3.stackV3(other, local);
    expect(m2.sim.relation.jeongDays).toBe(1);
    expect(m2.v3.pantry.meal).toEqual(['clear', 'pine']);
  });
  it('바뀔 것이 없으면 같은 참조, 다시 적용해도 그대로(멱등)', () => {
    const s = days(3, { touch: true });
    expect(v3.stackV3(s, s)).toBe(s);
    expect(v3.stackV3(s, null)).toBe(s);
    const m = v3.stackV3(withPantry(s, ['clear'], ['pattern']), withPantry(s, ['clear', 'dew'], ['pattern']));
    expect(v3.stackV3(m, withPantry(s, ['clear', 'dew'], ['pattern']))).toBe(m);
  });
  it('속성: 어떤 순서로 바꿔 끼워도 공방·정은 줄지 않는다(시드 40)', () => {
    const order = ['clear', 'pine', 'dew'] as const;
    const torder = ['pattern', 'ribbon', 'dewdrop'] as const;
    for (let seed = 1; seed <= 40; seed++) {
      let x = seed * 2654435761;
      const r = () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296);
      const base = days(1);
      let cur = base;
      for (let i = 0; i < 12; i++) {
        const meal = order.filter((_, k) => k === 0 || r() < 0.4);
        const treat = torder.filter((_, k) => k === 0 || r() < 0.4);
        const other = withJeong(withPantry(r() < 0.3 ? days(1, {}, fresh(seed + 99)) : base, [...meal], [...treat]), Math.floor(r() * 8));
        const next = v3.adoptV3(other, cur);
        for (const k of cur.v3.pantry.meal) expect(next.v3.pantry.meal, `seed ${seed}`).toContain(k);
        for (const k of cur.v3.pantry.treat) expect(next.v3.pantry.treat).toContain(k);
        if (v3.sameCreatureV3(next, cur)) expect(next.sim.relation.jeongDays).toBeGreaterThanOrEqual(cur.sim.relation.jeongDays);
        expect(v3.adoptV3(other, cur)).toEqual(next); // 결정적
        cur = next;
      }
    }
  });
  it('정 자막 횟수(기기 전용)는 같은 몽망이일 때 칸마다 큰 쪽 — 이 기기에서 보인 횟수가 줄지 않음', () => {
    const s = days(2);
    const local = { ...s, v3: { ...s.v3, captionsShown: [3, 0, 1, 0] } };
    const incoming = v3.parseUploadV3(body(s));
    expect(v3.adoptV3(incoming, local).v3.captionsShown).toEqual([3, 0, 1, 0]);
    expect(v3.adoptV3(incoming, null).v3.captionsShown).toBeUndefined();
  });
});

describe('말 기록 되붙이기(같은 몽망이일 때만)', () => {
  it('이 기기 본에 같은 말(같은 붙은 획·말결)이 있으면 night·세기·사전 판·입력 방식을 되붙인다', () => {
    const s = loaded(days(4));
    const incoming = v3.parseUploadV3(body(s));
    const h = v3.adoptV3(incoming, s);
    expect(h.v3.words).toEqual(s.v3.words);
    // 되붙여도 다시 올리면 본문은 같다
    expect(body(h)).toBe(body(s));
  });
  it('기기 본이 앞서간 갈래(말이 더 있음)여도 겹치는 말만 되붙인다', () => {
    const s = days(3);
    const ahead = day(s, 3);
    const h = v3.adoptV3(v3.parseUploadV3(body(s)), ahead);
    expect(h.v3.words).toEqual(s.v3.words);
  });
  it('다른 몽망이·말결이 다르면 되붙이지 않는다', () => {
    const s = days(3);
    const incoming = v3.parseUploadV3(body(s));
    expect(v3.hydrateWordsV3(incoming, days(3, {}, fresh(0x4321)))).toBe(incoming);
    const changed = { ...s, v3: { ...s.v3, words: s.v3.words.map((w) => ({ ...w, sense: 'warm.in.still' })) } };
    expect(v3.hydrateWordsV3(incoming, changed).v3.words.every((w) => w.lexVer === v3.RESTORED_LEX_VER)).toBe(true);
  });
});
