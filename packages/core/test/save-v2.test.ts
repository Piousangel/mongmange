// 세이브 v2(sim 2): 세 기둥 필드가 기능 없이도 쌓이고, 왕복·옛 세이브(v1) 마이그레이션·미래 버전 거부가 지켜진다.
import { describe, expect, it } from 'vitest';
import { clearSave, readSave, sim, SAVE_KEYS, writeSave, type KV } from '../src/index';
import { H, KST, handStroke, kst, play } from './sim-helpers';

function memKV(init: Record<string, string> = {}): KV & { data: Record<string, string> } {
  const data = { ...init };
  return { data, getString: (k) => data[k], set: (k, v) => void (data[k] = v), remove: (k) => void delete data[k] };
}

const FIRST_TAP: sim.BirthInput = { x: 0.12, y: -0.3, ms: kst(11, 20, 19, 0), installAt: kst(11, 20, 19, 0), entropy: 0xdeadbeef };

/** 7일 플레이(매일 몸 만지기 + 획 + 다음 날 아침 현상) → 이레 */
function playDays(n: number) {
  let s = sim.createInitial(kst(11, 20, 19), KST, 11, { birth: FIRST_TAP });
  const all: sim.Effect[] = [];
  for (let d = 0; d < n; d++) {
    const base = kst(11, 20 + d, 19);
    const r = play(s, [
      { type: 'grind', at: base + 60_000, durationMs: 5000 },
      { type: 'stroke', at: base + 120_000, raw: handStroke(d + 1) },
      // 정수리 앞(+x, 위) 길게 누르기 + 한 번 더 같은 깸에 짧은 탭
      { type: 'tap', at: base + 180_000, target: 'body', holdMs: 1500, x: 0.2, y: -0.5, moveSpeed: 0.05 },
      { type: 'tap', at: base + 185_000, target: 'body', holdMs: 0, x: 0.2, y: -0.5 },
      { type: 'tap', at: base + 190_000, target: 'paper', holdMs: 80, x: 1.2, y: 0.4 },
      { type: 'appBackground', at: base + 600_000 },
      { type: 'appForeground', at: base + 13 * H, tzOffsetMin: KST }, // 다음 날 08:00
      { type: 'developCard', at: base + 13 * H + 60_000 },
    ]);
    s = r.state;
    all.push(...r.effects);
  }
  return { state: s, effects: all };
}

/** HEAD(fccaaf3, sim 1) core가 실제로 쓴 v1 세이브(고정 시각 11-10 19:00 KST 설치, 7일 플레이). 이레 아침 현상 전/후 */
const RAW = import.meta.glob<string>('./fixtures/saves/*.json', { query: '?raw', import: 'default', eager: true });
const FIX = (f: string) => RAW[`./fixtures/saves/${f}`]!;
const V1_PENDING = FIX('v1-ire-morning-pending.json');
const V1_DEVELOPED = FIX('v1-ire-developed.json');

/** v2 세이브 원문을 sim 1 형식(새 필드 없음)으로 되돌린다 = 빌드 1 이전 앱이 쓴 세이브 */
function asV1(json: string): string {
  const o = JSON.parse(json);
  const { birth: _b, ink: _i, name: _n, temperamentLabel: _t, relation: _r, ...rest } = o.sim.state;
  return JSON.stringify({ ...o, sim: { ...o.sim, version: 1, state: { ...rest, schemaVersion: 1 } } });
}

describe('세 기둥 필드: 기능이 꺼져 있어도 값이 쌓인다', () => {
  it('타고남 씨앗 = 첫 탭 + 설치 시각 + 보안 난수의 FNV-1a, 인장 씨앗·코드는 그 씨앗에서', () => {
    const s = sim.createInitial(kst(11, 20, 19), KST, 11, { birth: FIRST_TAP });
    expect(s.schemaVersion).toBe(2);
    expect(s.birth).toEqual({ seed: sim.birthSeedOf(FIRST_TAP), sealSeed: sim.sealSeedOf(sim.birthSeedOf(FIRST_TAP)), at: kst(11, 20, 19), traitVersion: sim.TRAIT_VERSION, source: 'tap' });
    expect(sim.birthSeedOf({ ...FIRST_TAP, entropy: 1 })).not.toBe(s.birth.seed);
    expect(sim.birthSeedOf({ ...FIRST_TAP, x: 0.13 })).not.toBe(s.birth.seed);
    expect(sim.sealDisplayCode(s.birth.sealSeed)).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(sim.sealNotches(s.birth.sealSeed)).toHaveLength(16);
    expect(sim.sealNotches(s.birth.sealSeed).every((v) => v >= 0 && v <= 2)).toBe(true);
    // 빌드 1: 먹(첫 잠 전)·이름·결은 아직 없음
    expect(s.ink).toEqual({ id: null, chosenAt: null, seeded: false });
    expect(s.name).toBeNull();
    expect(s.temperamentLabel).toBeNull();
    // 설치도 방문: 19시 칸
    expect(s.relation.todayHour[19]).toBe(1);
  });

  it('정 = 만진 깸의 수(같은 깸에 여러 번 만져도 1), 자리·시각은 깰 때 지수 평균으로 접힌다', () => {
    const r = playDays(3);
    const rel = r.state.relation;
    expect(rel.jeongDays).toBe(3);
    // 정수리 앞(0번 자리)만 만졌다 → 평균이 그 자리로만 쌓인다(하루 α 0.25, 3일)
    expect(sim.spotOf(0.2, -0.5)).toBe(0);
    expect(rel.spot[0]).toBeCloseTo(1 - 0.75 ** 3, 6);
    expect(rel.spot.slice(1).every((v) => v === 0)).toBe(true);
    // 19시(설치·저녁 방문)와 08시(아침 복귀) 칸이 오른다
    expect(rel.hour[19]).toBeGreaterThan(0);
    expect(rel.hour[8]).toBeGreaterThan(0);
    expect(rel.hour[3]).toBe(0);
    // 오늘 몫: 3일째 아침(깬 뒤)에 08시 방문 표시만
    expect(rel.todayHour[8]).toBe(1);
    // 감정 상태 입력: 직전 부재 = 19:10 → 08:00
    expect(rel.lastAbsenceMs).toBe(13 * H - 600_000);
    expect(rel.longestAbsenceMs).toBe(13 * H - 600_000);
    expect(rel.lastSeenAt).toBe(kst(11, 22, 19) + 13 * H + 60_000);
  });

  it('자는 중 만짐·종이 탭은 정을 올리지 않는다', () => {
    const s0 = sim.createInitial(kst(11, 20, 19), KST, 3);
    const r = play(s0, [
      { type: 'tap', at: kst(11, 20, 19, 1), target: 'paper', holdMs: 0, x: 1, y: 1 },
      { type: 'putToSleep', at: kst(11, 20, 23) },
      { type: 'tap', at: kst(11, 20, 23, 5), target: 'body', holdMs: 0, x: 0, y: -0.5 },
    ]);
    expect(r.state.phase).toBe('asleep');
    expect(r.state.relation.jeongDays).toBe(0);
  });

  it('결 이름은 이레 아침 현상 때 처음 정한다(σ 보정 argmax)', () => {
    const six = playDays(6);
    expect(six.state.temperamentLabel).toBeNull();
    const r = playDays(7);
    const tl = r.state.temperamentLabel!;
    expect(tl).not.toBeNull();
    expect({ axis: tl.axis, sign: tl.sign }).toEqual(sim.labelOf(r.state.temperament));
    expect(tl.since).toBe(kst(11, 26, 19) + 13 * H + 60_000);
  });

  it('첫 잠에 씨앗이 먹을 정해 두고, 먹 고르기(빌드 2)는 그 위에 바꾼다', () => {
    const s0 = sim.createInitial(kst(11, 20, 19), KST, 3);
    const slept = play(s0, [{ type: 'putToSleep', at: kst(11, 20, 23) }]).state;
    expect(slept.ink).toEqual({ id: sim.seededInk(s0.birth.seed), chosenAt: kst(11, 20, 23), seeded: true });
    // 다음 잠에는 다시 정하지 않는다
    const next = sim.tick(slept, kst(11, 22, 1)).state;
    expect(next.ink).toEqual(slept.ink);
    const changed = play(slept, [
      { type: 'appForeground', at: kst(11, 21, 9), tzOffsetMin: KST },
      { type: 'chooseInk', at: kst(11, 21, 9, 1), ink: 'jayeon' },
      { type: 'chooseInk', at: kst(11, 21, 9, 2), ink: 'songhwa' },
    ]).state;
    expect(changed.ink).toEqual({ id: 'songhwa', chosenAt: kst(11, 21, 9, 2), seeded: false });
  });

  it('이름(빌드 2 이벤트): 검사를 통과한 것만', () => {
    const s0 = sim.createInitial(kst(11, 20, 19), KST, 3);
    const r = play(s0, [
      { type: 'setName', at: kst(11, 20, 19, 1), text: '😀' },
      { type: 'setName', at: kst(11, 20, 19, 2), text: '  먹  보 ' },
    ]);
    expect(r.state.name).toEqual({ text: '먹 보', at: kst(11, 20, 19, 2) });
    expect(sim.normalizeName('몽망이일곱자다')).toEqual({ ok: false, reason: 'length' });
    expect(sim.normalizeName('Mongmangi Jr')).toEqual({ ok: true, text: 'Mongmangi Jr' });
    expect(sim.normalizeName('Mongmangi Jr.')).toEqual({ ok: false, reason: 'chars' });
    expect(sim.INK_IDS).toContain(sim.seededInk(12345));
  });
});

// 골든값(리뷰 H-2): 해시·파생 규칙이 바뀌면 이미 태어난 몽망이의 타고남·인장·먹이 조용히 바뀐다.
// 여기가 실패하면 규칙을 되돌리거나, 정말 바꿔야 하면 TRAIT_VERSION을 올리고 옛 규칙을 남긴다.
describe('골든값: 씨앗·인장·씨앗 먹(평생 고정)', () => {
  it('FNV-1a 표준 벡터', () => {
    expect(sim.fnv1a([])).toBe(0x811c9dc5);
    expect(sim.fnv1a([0])).toBe(0x4b95f515); // "\0\0\0\0"
  });
  it('첫 탭 씨앗 두 벌', () => {
    const a = sim.birthSeedOf(FIRST_TAP);
    expect(a).toBe(2058981084);
    expect(sim.sealSeedOf(a)).toBe(1423012703);
    expect(sim.sealDisplayCode(1423012703)).toBe('946C-XCL2');
    expect(sim.sealNotches(1423012703).join('')).toBe('0212122112111001');
    expect(sim.seededInk(a)).toBe('songyeon');
    const b = sim.birthSeedOf({ x: -0.5, y: 0.25, ms: 1795000000123, installAt: 1795000000000, entropy: 1 });
    expect(b).toBe(3577644221);
    expect(sim.sealSeedOf(b)).toBe(2142596514);
    expect(sim.sealDisplayCode(2142596514)).toBe('CP5L-V6GD');
    expect(sim.sealNotches(2142596514).join('')).toBe('0212100221110000');
    expect(sim.seededInk(b)).toBe('yuyeon');
  });
  it('마이그레이션 씨앗(생일 11-10 19:00 KST)', () => {
    const m = sim.migratedBirthSeed(kst(11, 10, 19));
    expect(m).toBe(1540301811);
    expect(sim.sealSeedOf(m)).toBe(231173150);
    expect(sim.seededInk(m)).toBe('yuyeon');
  });
});

describe('실제 v1 세이브 픽스처(HEAD fccaaf3) → v2', () => {
  it('이레 아침 직전: 획·성향·카드 보존, 씨앗 골든값, 첫 밤을 지났으니 씨앗 먹, 결 이름은 아직', () => {
    expect(JSON.parse(V1_PENDING).sim.version).toBe(1);
    const st = sim.parseState(V1_PENDING);
    expect(st.schemaVersion).toBe(2);
    expect(st.strokesTotal).toBe(7);
    expect(st.cards).toHaveLength(6);
    expect(st.pendingCard).not.toBeNull();
    expect(st.temperament.boldness).toBeCloseTo(-0.2416215961905053, 12);
    expect(st.birth).toEqual({ seed: 1540301811, sealSeed: 231173150, at: kst(11, 10, 19), traitVersion: 1, source: 'migrated' });
    expect(st.ink).toEqual({ id: 'yuyeon', chosenAt: kst(11, 17, 8, 1), seeded: true });
    expect(st.temperamentLabel).toBeNull();
    // 이어서 이레 아침을 현상하면 결 이름이 정해진다
    const dev = play(st, [{ type: 'developCard', at: kst(11, 17, 8, 5) }]).state;
    expect(dev.temperamentLabel).toEqual({ axis: 'boldness', sign: -1, since: kst(11, 17, 8, 5) });
  });
  it('이레 현상 뒤: 결 이름을 저장 시각으로 정하고, 같은 원문은 늘 같은 몽망이', () => {
    const a = sim.parseState(V1_DEVELOPED);
    expect(a).toEqual(sim.parseState(V1_DEVELOPED));
    expect(a.cards).toHaveLength(7);
    expect(a.temperamentLabel).toEqual({ axis: 'boldness', sign: -1, since: kst(11, 17, 8, 2) });
    expect(a.birth.seed).toBe(1540301811);
  });
  it('슬롯으로 읽으면 pre-v2.1 원문 보존 → v2로 써도 백업은 v1 원문(백업 복원 시 같은 몽망이)', () => {
    const kv = memKV({ [SAVE_KEYS.main]: V1_PENDING });
    const r = readSave(kv);
    expect(kv.data[`${SAVE_KEYS.preMigration}2.1`]).toBe(V1_PENDING);
    expect(writeSave(kv, r.state!, kst(11, 17, 9)).ok).toBe(true);
    expect(sim.parseState(kv.data[SAVE_KEYS.backup]!).birth).toEqual(r.state!.birth);
    // 개발 초기화는 pre-v 키까지 지운다(리뷰 L-8)
    clearSave(kv);
    expect(Object.keys(kv.data)).toEqual([]);
  });
});

describe('세이브 v2 왕복·마이그레이션·미래 버전', () => {
  it('왕복: 세 기둥 필드까지 그대로(이름·먹·결·관계 모두 채운 상태)', () => {
    let s = playDays(7).state;
    s = play(s, [
      { type: 'chooseInk', at: kst(11, 27, 9), ink: 'jayeon', seeded: true },
      { type: 'setName', at: kst(11, 27, 9, 1), text: '먹이' },
      { type: 'appBackground', at: kst(11, 27, 9, 2) },
    ]).state;
    const back = sim.parseState(sim.serializeState(s, kst(11, 27, 9, 2)));
    expect(back).toEqual(s);
    expect(back.ink.seeded).toBe(true);
    expect(back.name?.text).toBe('먹이');
  });

  it('합성 v1(현재 코드 v2에서 새 필드를 뺀 것) → v2: 획·성향·카드는 그대로, 새 필드는 결정적으로 채움', () => {
    const s = playDays(7).state;
    const v1 = asV1(sim.serializeState(s, kst(11, 27, 9)));
    expect(JSON.parse(v1).sim.version).toBe(1);
    const a = sim.parseState(v1);
    const b = sim.parseState(v1);
    expect(a).toEqual(b); // 같은 원문 → 같은 몽망이(씨앗 결정적)
    expect(a.schemaVersion).toBe(2);
    expect(a.strokes).toEqual(s.strokes);
    expect(a.temperament).toEqual(s.temperament);
    expect(a.cards).toEqual(s.cards);
    expect(a.birth.source).toBe('migrated');
    expect(a.birth.at).toBe(s.createdAt);
    expect(a.birth.sealSeed).toBe(sim.sealSeedOf(a.birth.seed));
    expect(a.birth.seed).toBe(sim.migratedBirthSeed(s.createdAt));
    // 첫 밤을 지난 몽망이 → 씨앗 먹(저장 시각)
    expect(a.ink).toEqual({ id: sim.seededInk(a.birth.seed), chosenAt: kst(11, 27, 9), seeded: true });
    expect(a.name).toBeNull();
    // 이레를 이미 지났으므로 결 이름을 지금 성향으로
    expect(a.temperamentLabel).toEqual({ ...sim.labelOf(s.temperament), since: kst(11, 27, 9) });
    // 관계 기록은 지어내지 않는다(0에서 시작), 마지막으로 본 시각 = 저장 시각
    expect(a.relation.jeongDays).toBe(0);
    expect(a.relation.lastSeenAt).toBe(kst(11, 27, 9));
    // 다시 저장하면 v2, 그대로 읽힌다
    const again = JSON.parse(sim.serializeState(a, kst(11, 27, 10)));
    expect(again.sim.version).toBe(2);
    expect(sim.parseState(JSON.stringify(again))).toEqual({ ...a, backgroundSince: a.backgroundSince ?? kst(11, 27, 10) });
    // 이레 전 옛 세이브는 결 이름 없음
    const young = sim.parseState(asV1(sim.serializeState(playDays(2).state, kst(11, 22, 9))));
    expect(young.temperamentLabel).toBeNull();
  });

  it('슬롯: 옛 본을 읽으면 마이그레이션 전 원문을 pre-v2.1 키에 한 번 남기고, 이어서 v2로 쓴다', () => {
    const s = playDays(2).state;
    const v1 = asV1(sim.serializeState(s, kst(11, 22, 9)));
    const kv = memKV({ [SAVE_KEYS.main]: v1 });
    const r = readSave(kv);
    expect(r.source).toBe('main');
    expect(r.state!.schemaVersion).toBe(2);
    expect(kv.data[`${SAVE_KEYS.preMigration}2.1`]).toBe(v1);
    const w = writeSave(kv, r.state!, kst(11, 22, 10));
    expect(w.ok).toBe(true);
    expect(JSON.parse(kv.data[SAVE_KEYS.main]!).sim.version).toBe(2);
    // 백업도 v1 원문이었던 본(읽을 수 있으면 민다)
    expect(kv.data[SAVE_KEYS.backup]).toBe(v1);
  });

  it('미래 버전(옛 빌드로 내려감): 본·백업 모두 읽지 않고 futureVersion, 쓰기도 거부해 본을 절대 덮어쓰지 않는다', () => {
    const s = playDays(2).state;
    const good = sim.serializeState(s, kst(11, 22, 9));
    const o = JSON.parse(good);
    const future = JSON.stringify({ ...o, sim: { ...o.sim, version: 3, state: { ...o.sim.state, schemaVersion: 3 } } });
    expect(() => sim.parseState(future)).toThrow(/버전 3/);
    expect(() => sim.parseState(JSON.stringify({ ...o, schemaVersion: 9 }))).toThrow(/새 버전/);
    const kv = memKV({ [SAVE_KEYS.main]: future, [SAVE_KEYS.backup]: good });
    const r = readSave(kv);
    expect(r).toMatchObject({ state: null, futureVersion: true, hadSave: true });
    // 깨진 본으로 취급하지 않는다(corrupt·pre-v로 옮기지 않음)
    expect(kv.data[SAVE_KEYS.corrupt]).toBeUndefined();
    expect(Object.keys(kv.data).some((k) => k.startsWith(SAVE_KEYS.preMigration))).toBe(false);
    // 새 몽망이로 쓰려 해도 거부
    const w = writeSave(kv, sim.createInitial(kst(11, 22, 10), KST, 1), kst(11, 22, 10));
    expect(w.ok).toBe(false);
    expect(kv.data[SAVE_KEYS.main]).toBe(future);
    expect(kv.data[SAVE_KEYS.backup]).toBe(good);
  });

  it('v1 블록인데 state 버전이 다르면 손상으로 거부(리뷰 L-2)', () => {
    const o = JSON.parse(V1_PENDING);
    expect(() => sim.parseState(JSON.stringify({ ...o, sim: { ...o.sim, state: { ...o.sim.state, schemaVersion: 2 } } }))).toThrow(/버전 불일치/);
  });

  it('손상된 세 기둥 필드는 거부한다', () => {
    const o = JSON.parse(sim.serializeState(playDays(1).state, kst(11, 21, 9)));
    const bad = (patch: Record<string, unknown>) => JSON.stringify({ ...o, sim: { ...o.sim, state: { ...o.sim.state, ...patch } } });
    expect(() => sim.parseState(bad({ birth: { ...o.sim.state.birth, seed: 'x' } }))).toThrow(/birth/);
    expect(() => sim.parseState(bad({ ink: { id: 'gold', chosenAt: null, seeded: false } }))).toThrow(/ink/);
    expect(() => sim.parseState(bad({ name: undefined }))).toThrow(/name/);
    expect(() => sim.parseState(bad({ name: { text: '몽망이일곱자다', at: 1 } }))).toThrow(/name/);
    expect(() => sim.parseState(bad({ birth: { ...o.sim.state.birth, seed: -1 } }))).toThrow(/birth/);
    expect(() => sim.parseState(bad({ temperamentLabel: { axis: 'luck', sign: 1, since: 0 } }))).toThrow(/temperamentLabel/);
    expect(() => sim.parseState(bad({ relation: { ...o.sim.state.relation, hour: [1, 2] } }))).toThrow(/relation/);
  });
});
