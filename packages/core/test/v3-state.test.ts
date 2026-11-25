// 세이브·sim v3 최소판(V1·V8·V9·V27 최소): 1일차 → 벼루(먹 양) → 한 마디 + 붓 한 획 → 연적(밤 세기) → 28밤 → 곁에 남음, 밥 한 숟갈.
// 위기 날 흔적 0(heart-grain 9-2 R1·R2·R7·R11 ①②), 옛 세이브 보관, 결정성.
import { describe, expect, it } from 'vitest';
import { SAVE_KEYS, sim, v3, writeSave, type KV } from '../src/index';
import { H, KST, handStroke, kst } from './sim-helpers';

type S = v3.V3State;
type E = v3.V3Event;

function memKV(init: Record<string, string> = {}): KV & { data: Record<string, string> } {
  const data = { ...init };
  return { data, getString: (k) => data[k], set: (k, v) => void (data[k] = v), remove: (k) => void delete data[k] };
}

const FIRST_TAP: sim.BirthInput = { x: 0.1, y: -0.2, ms: kst(11, 25, 9), installAt: kst(11, 25, 9), entropy: 0x1234 };
const fresh = () => v3.createV3(kst(11, 25, 9), KST, 7, { birth: FIRST_TAP });

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

const word = (text: string, lang: v3.LexLang = 'ko'): v3.WordInput => ({ ...v3.storedWordOf(v3.interpretWord(text, lang)), lexVer: v3.LEX_VER, source: 'keyboard' });

/** d일째(0 = 1일차) 하루: 벼루 → 한 마디 → 연적 → 다음 날 아침(깸) */
function day(s: S, d: number, text = '행복해', opts: { sleep?: boolean; write?: boolean } = {}): { state: S; effects: v3.V3Effect[] } {
  const base = kst(11, 25 + d, 20);
  const ev: E[] = [{ type: 'appForeground', at: base, tzOffsetMin: KST }, { type: 'grind', at: base + 60_000, durationMs: 9000 }];
  if (opts.write !== false) ev.push({ type: 'write', at: base + 120_000, word: word(text), chars: v3.wordChars(text), raw: handStroke(d + 1) });
  if (opts.sleep !== false) ev.push({ type: 'putToSleep', at: base + 2 * H });
  ev.push({ type: 'appBackground', at: base + 2 * H + 60_000 });
  ev.push({ type: 'appForeground', at: base + 12 * H, tzOffsetMin: KST }); // 다음 날 08:00
  return play(s, ev);
}

describe('1일차 시작', () => {
  it('밤 1·이레 1, 먹 0칸 → 붓은 먹을 기다린다', () => {
    const s = fresh();
    expect(v3.nightOf(s)).toBe(1);
    expect(v3.ireOf(s)).toBe(1);
    expect(v3.inkCells(s)).toBe(0);
    expect(v3.writeBlock(s)).toBe('noInk');
    expect(s.v3.words).toEqual([]);
    expect(v3.isComplete(s)).toBe(false);
  });
});

describe('벼루 = 먹 양(글자 수 1~6, V8)', () => {
  it('갈기 시작에 1칸, 1.5초마다 +1, 6칸에서 멈춘다', () => {
    const at = kst(11, 25, 10);
    const cells = (ms: number) => v3.inkCells(v3.reduceV3(fresh(), { type: 'grind', at, durationMs: ms }).state);
    expect(cells(100)).toBe(1);
    expect(cells(1500)).toBe(2);
    expect(cells(4400)).toBe(3);
    expect(cells(60_000)).toBe(6);
  });
  it('먹 양보다 긴 말은 받지 않는다(갈기 보상 없음 — 먹 양은 글자 수만 정한다)', () => {
    const at = kst(11, 25, 10);
    const r = play(fresh(), [
      { type: 'grind', at, durationMs: 100 },
      { type: 'write', at: at + 1000, word: word('행복해'), chars: 3, raw: handStroke(1) },
    ]);
    expect(r.effects).toContainEqual({ type: 'writeRejected', reason: 'tooLong' });
    expect(r.state.v3.words).toHaveLength(0);
    expect(r.state.sim.strokes).toHaveLength(0);
  });
});

describe('붓 = 한 마디 + 붓 한 획', () => {
  it('말결만 저장하고 쓴 글자는 어디에도 없다', () => {
    const at = kst(11, 25, 10);
    const r = play(fresh(), [
      { type: 'grind', at, durationMs: 4000 },
      { type: 'write', at: at + 1000, word: word('행복해'), chars: 3, raw: handStroke(1) },
    ]);
    expect(r.effects.some((e) => e.type === 'wordAccepted')).toBe(true);
    expect(r.state.v3.words).toEqual([{ night: 1, sense: 'bright.in.joy', intensity: 3, lexVer: v3.LEX_VER, source: 'keyboard', strokeId: r.state.sim.strokes[0]!.id }]);
    expect(v3.serializeV3(r.state, at)).not.toContain('행복');
    expect(v3.writeBlock(r.state)).toBe('used');
  });
  it('하루 한 마디: 두 번째는 받지 않는다', () => {
    const at = kst(11, 25, 10);
    const r = play(fresh(), [
      { type: 'grind', at, durationMs: 9000 },
      { type: 'write', at: at + 1000, word: word('비'), chars: 1, raw: handStroke(1) },
      { type: 'write', at: at + 9000, word: word('눈'), chars: 1, raw: handStroke(2) },
    ]);
    expect(r.state.v3.words).toHaveLength(1);
    expect(r.effects).toContainEqual({ type: 'writeRejected', reason: 'used' });
  });
  it('말 없는 획·획 씻기는 v3에서 받지 않는다(V8)', () => {
    const at = kst(11, 25, 10);
    const r = play(fresh(), [
      { type: 'grind', at, durationMs: 4000 },
      { type: 'stroke', at: at + 1000, raw: handStroke(1) },
      { type: 'write', at: at + 2000, word: word('비'), chars: 1, raw: handStroke(1) },
      { type: 'washStroke', at: at + 3000 },
    ]);
    expect(r.effects).toContainEqual({ type: 'writeRejected', reason: 'stroke' });
    expect(r.effects.some((e) => e.type === 'strokeWashed')).toBe(false);
    expect(r.state.sim.strokes).toHaveLength(1);
    expect(r.state.v3.words).toHaveLength(1);
  });
  it('알 수 없는 말결·곁 대답 id는 저장하지 않는다', () => {
    const at = kst(11, 25, 10);
    const bad: v3.WordInput = { sense: 'x.stay', intensity: 1, lexVer: v3.LEX_VER, source: 'keyboard' };
    const r = play(fresh(), [
      { type: 'grind', at, durationMs: 4000 },
      { type: 'write', at: at + 1000, word: bad, chars: 1, raw: handStroke(1) },
    ]);
    expect(r.effects).toContainEqual({ type: 'writeRejected', reason: 'badWord' });
    expect(r.state.sim.strokes).toHaveLength(0);
  });
});

describe('위기 낱말 흔적 0(heart-grain 9-2)', () => {
  const CRISIS = ['죽고싶어', '사라지고싶다', 'kms', 'i want to die'];
  it('위기 날 = 한 획 + 고요, 글자·곁 대답 id·crisis가 세이브에 없다(R1·R11 ①)', () => {
    for (const text of CRISIS) {
      const a = v3.interpretWord(text, /[a-z]/.test(text) ? 'en' : 'ko');
      expect(a.kind, text).toBe('stay');
      const at = kst(11, 25, 10);
      const r = play(fresh(), [
        { type: 'grind', at, durationMs: 60_000 },
        { type: 'write', at: at + 1000, word: { ...v3.storedWordOf(a), lexVer: v3.LEX_VER, source: 'keyboard' }, chars: 1, raw: handStroke(1) },
      ]);
      expect(r.state.v3.words[0]!.sense).toBe('warm.in.still');
      expect(r.state.sim.strokes).toHaveLength(1);
      const json = v3.serializeV3(r.state, at);
      for (const needle of [text, text.normalize('NFD'), 'x.stay', 'crisis', 'stay']) expect(json.includes(needle), `${text}: ${needle}`).toBe(false);
    }
  });
  it('위기 1회 세이브와 같은 획 + 고요 낱말 세이브는 바이트까지 같다(R2·R11 ②)', () => {
    const at = kst(11, 25, 10);
    const run = (text: string) =>
      play(fresh(), [
        { type: 'grind', at, durationMs: 4000 },
        { type: 'write', at: at + 1000, word: word(text), chars: 1, raw: handStroke(3) },
      ]).state;
    const still = v3.interpretWord('고요', 'ko');
    expect(v3.storedWordOf(still).sense).toBe('warm.in.still');
    expect(v3.serializeV3(run('죽고싶어'), at)).toBe(v3.serializeV3(run('고요'), at));
  });
  it('맡겨 두기 업로드 word = 정확히 {attachStroke, sense}, 획 하나(R7·R11 ⓪)', () => {
    let s = fresh();
    s = day(s, 0, '행복해').state;
    s = day(s, 1, '죽고싶어').state;
    const up = v3.uploadWords(s);
    expect(up).toHaveLength(2);
    for (const w of up) {
      expect(Object.keys(w).sort()).toEqual(['attachStroke', 'sense']);
      expect(Object.keys(w.attachStroke).sort()).toEqual(['attach', 'drawnAtCoreScale', 'meshVersion', 'raw']);
    }
    expect(up.map((w) => w.sense)).toEqual(['bright.in.joy', 'warm.in.still']);
  });
});

describe('연적 = 재우기 → 밤 세기, 28밤 → 곁에 남음', () => {
  it('연적으로 재우면 밤을 센다(자는 동안 n번째 밤, 깨면 n+1)', () => {
    const base = kst(11, 25, 20);
    const r = play(fresh(), [{ type: 'putToSleep', at: base + 2 * H }]);
    expect(r.effects).toContainEqual({ type: 'nightCounted', night: 1 });
    expect(r.state.sim.phase).toBe('asleep');
    expect(v3.nightOf(r.state)).toBe(1);
    const w = v3.tickV3(r.state, kst(11, 26, 8));
    expect(w.state.sim.phase).toBe('awake');
    expect(v3.nightOf(w.state)).toBe(2);
  });
  it('말도 연적도 없던 깸의 잠은 세지 않는다(하루 걸러도 생애가 줄지 않음, D-03·D-07)', () => {
    const r = day(fresh(), 0, '비', { sleep: false, write: false });
    expect(r.state.sim.dayIndex).toBe(1);
    expect(r.state.v3.life.slept).toBe(0);
    expect(v3.nightOf(r.state)).toBe(1);
  });
  it('연적을 잊어도 한 마디를 쓴 깸은 다음 날 잠 하나로 센다(PM 11-25 M6) — 닷새 쓰면 밤 다섯, 말마다 다른 밤', () => {
    let s = fresh();
    for (let d = 0; d < 5; d++) s = day(s, d, '비', { sleep: false }).state;
    expect(s.v3.life.slept).toBe(5);
    expect(s.v3.words.map((w) => w.night)).toEqual([1, 2, 3, 4, 5]);
    expect(v3.nightOf(s)).toBe(6);
  });
  it('연적으로 재우면 말이 없어도 바로 센다, 깸 하나에 밤은 최대 1', () => {
    const r = day(fresh(), 0, '비', { write: false });
    expect(r.state.v3.life.slept).toBe(1);
    // 말 + 연적 = 여전히 1
    const r2 = day(fresh(), 0, '비');
    expect(r2.state.v3.life.slept).toBe(1);
    expect(r2.effects.filter((e) => e.type === 'nightCounted')).toHaveLength(1);
  });
  it('여러 날 비운 뒤 한꺼번에 정산돼도 말을 쓴 깸의 잠만 센다', () => {
    // 1일차에 쓰고 연적 없이 떠남 → 나흘 뒤 돌아옴(72h 상한 안에서 잠·깸이 여러 번)
    const base = kst(11, 25, 20);
    const r = play(fresh(), [
      { type: 'grind', at: base, durationMs: 9000 },
      { type: 'write', at: base + 60_000, word: word('비'), chars: 1, raw: handStroke(1) },
      { type: 'appBackground', at: base + 120_000 },
      { type: 'appForeground', at: base + 4 * 24 * H, tzOffsetMin: KST },
    ]);
    expect(r.state.sim.dayIndex).toBeGreaterThan(1);
    expect(r.state.v3.life.slept).toBe(1);
  });
  it('1일차 → 28밤: 이레 7·14·21·28 자리, 28번째 아침에 완성, 그 뒤 성장만 멈춤', () => {
    let s = fresh();
    const all: v3.V3Effect[] = [];
    const nights: number[] = [];
    for (let d = 0; d < 28; d++) {
      nights.push(v3.nightOf(s));
      const r = day(s, d, ['행복해', '비', '슬퍼', '고마워'][d % 4]!);
      s = r.state;
      all.push(...r.effects);
    }
    expect(nights).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
    expect(all.filter((e) => e.type === 'ireReached')).toEqual([1, 2, 3, 4].map((ire) => ({ type: 'ireReached', ire })));
    expect(s.v3.life.snapshots.map((x) => x?.night)).toEqual([7, 14, 21, 28]);
    expect(all.filter((e) => e.type === 'lifeComplete')).toHaveLength(1);
    expect(v3.isComplete(s)).toBe(true);
    expect(v3.nightOf(s)).toBe(28);
    expect(s.v3.words).toHaveLength(28);
    expect(s.v3.words.map((w) => w.night)).toEqual(nights);
    // 곁에 남음: 새 말은 멈추고, 재우기·밥은 계속(밤은 더 세지 않음)
    const after = day(s, 28, '비');
    expect(after.effects).toContainEqual({ type: 'writeRejected', reason: 'done' });
    expect(after.state.v3.life.slept).toBe(28);
    expect(after.state.sim.phase).toBe('awake');
    const fed = v3.reduceV3(after.state, { type: 'feed', at: kst(12, 23, 9), kind: 'treat', item: 'pattern' });
    expect(fed.effects.some((e) => e.type === 'fed')).toBe(true);
    // 마음 벡터는 저장된 말결로만(R5)
    expect(v3.heartOf(s)).toMatchObject({ bright: 7, low: 7, nature: 7, warm: 7 });
  });
});

describe('밥 한 숟갈·작은 것(D-27 최소판)', () => {
  it('한 숟갈은 먹을 한 칸 이상 갈았을 때, 깸마다 2숟갈 — 두 번째에 만족(full)', () => {
    const at = kst(11, 25, 10);
    let r = play(fresh(), [{ type: 'feed', at, kind: 'meal', item: 'clear' }]);
    expect(r.effects).toContainEqual({ type: 'feedRejected', reason: 'noInk' });
    r = play(r.state, [
      { type: 'grind', at: at + 1000, durationMs: 800 },
      { type: 'feed', at: at + 2000, kind: 'meal', item: 'clear' },
      { type: 'feed', at: at + 3000, kind: 'meal', item: 'clear' },
      { type: 'feed', at: at + 4000, kind: 'meal', item: 'clear' },
    ]);
    expect(r.effects.filter((e) => e.type === 'fed')).toEqual([
      { type: 'fed', kind: 'meal', item: 'clear', full: false },
      { type: 'fed', kind: 'meal', item: 'clear', full: true },
    ]);
    expect(r.effects).toContainEqual({ type: 'feedRejected', reason: 'cap' });
    // 밥은 글자 수를 줄이지 않는다
    expect(v3.inkCells(r.state)).toBe(1);
  });
  it('작은 것은 먹 없이도, 깸마다 3', () => {
    const at = kst(11, 25, 10);
    const ev: E[] = [0, 1, 2, 3].map((i) => ({ type: 'feed', at: at + i * 1000, kind: 'treat', item: 'pattern' }));
    const r = play(fresh(), ev);
    expect(r.effects.filter((e) => e.type === 'fed')).toHaveLength(3);
    expect(r.effects).toContainEqual({ type: 'feedRejected', reason: 'cap' });
  });
  it('열리지 않은 종류는 받지 않는다(1.0 최소판 = 맑은 먹·무늬 먹 조각)', () => {
    const at = kst(11, 25, 10);
    const r = play(fresh(), [
      { type: 'grind', at, durationMs: 800 },
      { type: 'feed', at: at + 1000, kind: 'meal', item: 'pine' },
    ]);
    expect(r.effects).toContainEqual({ type: 'feedRejected', reason: 'locked' });
  });
  it('깸이 바뀌면 0으로, 밥을 안 줘도 몸·밤·말은 같다', () => {
    const at = kst(11, 25, 10);
    let s = play(fresh(), [
      { type: 'grind', at, durationMs: 800 },
      { type: 'feed', at: at + 1000, kind: 'meal', item: 'clear' },
      { type: 'feed', at: at + 2000, kind: 'treat', item: 'pattern' },
    ]).state;
    expect(s.v3.meal).toMatchObject({ spoons: 1, treats: 1 });
    const fedDay = day(s, 0);
    s = fedDay.state;
    expect(s.v3.meal).toMatchObject({ spoons: 0, treats: 0 });
    const unfed = day(fresh(), 0);
    expect(unfed.state.sim.strokes.map((x) => x.attach)).toEqual(s.sim.strokes.map((x) => x.attach));
    expect(unfed.state.v3.life).toEqual(s.v3.life);
  });
});

describe('세이브 v3', () => {
  it('왕복: 같은 상태로 돌아온다', () => {
    let s = fresh();
    s = day(s, 0).state;
    s = day(s, 1, '죽고싶어').state;
    const json = v3.serializeV3(s, kst(11, 27, 9));
    const back = v3.parseV3(json);
    expect(back.v3).toEqual(s.v3);
    expect(back.sim.strokes.length).toBe(s.sim.strokes.length);
    // 다시 쓰면 같은 v3 블록(콜드 스타트 규칙으로 sim의 backgroundSince만 채워질 수 있다)
    expect(JSON.parse(v3.serializeV3(back, kst(11, 27, 9))).v3).toEqual(JSON.parse(json).v3);
  });
  it('미래 버전은 읽지도 덮어쓰지도 않는다', () => {
    const s = fresh();
    const json = v3.serializeV3(s, kst(11, 25, 9));
    const future = json.replace('"version":3', '"version":4');
    const kv = memKV({ [v3.V3_KEYS.main]: future });
    expect(v3.readSaveV3(kv).futureVersion).toBe(true);
    expect(v3.writeSaveV3(kv, s, kst(11, 25, 10)).ok).toBe(false);
    expect(kv.data[v3.V3_KEYS.main]).toBe(future);
  });
  it('옛 세이브(v2)가 있으면 1일차부터 새로 시작하고, 옛 것은 지우지 않고 보관한다', () => {
    const kv = memKV();
    const old = sim.createInitial(kst(11, 1, 9), KST, 3);
    expect(writeSave(kv, old, kst(11, 1, 10)).ok).toBe(true);
    const v2raw = kv.data[SAVE_KEYS.main]!;
    const r = v3.readSaveV3(kv);
    expect(r.state).toBeNull();
    expect(r.hasV2).toBe(true);
    expect(kv.data[v3.V3_KEYS.archiveV2]).toBe(v2raw);
    // 새 컨셉 쓰기·처음부터 다시가 옛 세이브를 건드리지 않는다
    expect(v3.writeSaveV3(kv, fresh(), kst(11, 25, 9)).ok).toBe(true);
    expect(v3.readSaveV3(kv).state).not.toBeNull();
    v3.clearSaveV3(kv);
    expect(v3.readSaveV3(kv).state).toBeNull();
    expect(kv.data[SAVE_KEYS.main]).toBe(v2raw);
    expect(kv.data[v3.V3_KEYS.archiveV2]).toBe(v2raw);
  });
  it('보관은 한 번만: 이미 보관한 v2 원문을 덮지 않는다(멱등)', () => {
    const kv = memKV();
    writeSave(kv, sim.createInitial(kst(11, 1, 9), KST, 3), kst(11, 1, 10));
    const first = kv.data[SAVE_KEYS.main]!;
    expect(v3.archiveV2(kv)).toBe(true);
    // v2 본이 바뀌어도(옛 빌드로 더 놀았다 등) 보관본은 처음 것 그대로
    writeSave(kv, sim.createInitial(kst(11, 2, 9), KST, 4), kst(11, 2, 10));
    expect(kv.data[SAVE_KEYS.main]).not.toBe(first);
    expect(v3.archiveV2(kv)).toBe(false);
    v3.readSaveV3(kv);
    expect(kv.data[v3.V3_KEYS.archiveV2]).toBe(first);
    // v2가 없으면 보관하지 않는다
    expect(v3.archiveV2(memKV())).toBe(false);
  });
  it('말이 가리키는 획이 없으면 손상으로 본다(strokeId 검증)', () => {
    const s = day(fresh(), 0).state;
    const json = v3.serializeV3(s, kst(11, 26, 9));
    const id = s.v3.words[0]!.strokeId;
    const broken = json.replace(`"strokeId":"${id}"`, '"strokeId":"s99-0"');
    expect(broken).not.toBe(json);
    expect(() => v3.parseV3(broken)).toThrow(/word/);
  });
  it('손상된 본 → 백업으로', () => {
    const kv = memKV();
    const s0 = fresh();
    v3.writeSaveV3(kv, s0, kst(11, 25, 9));
    const s1 = day(s0, 0).state;
    v3.writeSaveV3(kv, s1, kst(11, 26, 9), { rotateBackup: true });
    kv.data[v3.V3_KEYS.main] = kv.data[v3.V3_KEYS.main]!.replace('"slept":1', '"slept":99');
    const r = v3.readSaveV3(kv);
    expect(r.source).toBe('backup');
    expect(r.state!.v3.life.slept).toBe(0);
  });
  it('결정성: 같은 이벤트 열 = 같은 세이브 문자열', () => {
    const run = () => {
      let s = fresh();
      for (let d = 0; d < 9; d++) s = day(s, d, ['비', '행복해', '고마워'][d % 3]!).state;
      return v3.serializeV3(s, kst(12, 5, 9));
    };
    expect(run()).toBe(run());
  });
});

describe('사전 판 lexVer 고정(v3 L 리뷰 N1 — 배고픔 표지로 사전 patch 0.1.0 → 0.1.1)', () => {
  const OLD = 'ko0.1.0+en0.1.0+r0.4.0';
  it('지금 판은 ko·en 0.1.1(표지 변경 = patch)', () => {
    expect(v3.LEX_VER).toBe('ko0.1.1+en0.1.1+r0.4.0');
    expect(v3.LEX_VER).not.toBe(OLD);
  });
  it('옛 판으로 쓴 말은 세이브를 다시 읽어도 판·결·강도가 그대로, 새 말만 새 판(지난 말 재해석 없음, D-13)', () => {
    // 옛 빌드(0.1.0)에서 '배고파'를 쓴 날 — 결·강도는 판과 무관하게 같았다
    const d1 = play(fresh(), [
      { type: 'grind', at: kst(11, 25, 10), durationMs: 9000 },
      { type: 'write', at: kst(11, 25, 10) + 1000, word: { ...v3.storedWordOf(v3.interpretWord('배고파', 'ko')), lexVer: OLD, source: 'keyboard' }, chars: 3, raw: handStroke(1) },
      { type: 'putToSleep', at: kst(11, 25, 22) },
      { type: 'appBackground', at: kst(11, 25, 22) + 60_000 },
    ]).state;
    const json = v3.serializeV3(d1, kst(11, 25, 23));
    const back = v3.parseV3(json);
    expect(back.v3.words).toEqual(d1.v3.words);
    expect(back.v3.words[0]).toMatchObject({ sense: 'home.in.meal', intensity: 2, lexVer: OLD });
    // 새 빌드에서 다음 깸에 쓴 말은 새 판
    const d2 = play(back, [
      { type: 'appForeground', at: kst(11, 26, 9), tzOffsetMin: KST },
      { type: 'grind', at: kst(11, 26, 10), durationMs: 9000 },
      { type: 'write', at: kst(11, 26, 10) + 1000, word: word('맛있어'), chars: 3, raw: handStroke(2) },
    ]).state;
    expect(d2.v3.words.map((w) => w.lexVer)).toEqual([OLD, v3.LEX_VER]);
    expect(d2.v3.words[0]).toEqual(back.v3.words[0]);
    expect(v3.parseV3(v3.serializeV3(d2, kst(11, 26, 11))).v3.words).toEqual(d2.v3.words);
  });
});
