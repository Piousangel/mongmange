// M2 이름·인장·가락(C-integrated v1.1 2-2, 로드맵 C1) — 그럴듯한 오답 판별 검사(OPERATING 8-1).
// 그럴듯하지만 틀린 결과와 그것을 떨어뜨리는 시험:
//  ① 가락이 길이만 따른다(두 글자 이름이 다 같은 가락) → 같은 길이 이름 100개가 윤곽 8을 고르게 쓴다
//  ② 가락이 몇 개에 몰린다 → 서로 다른 이름 100개: 닿을 수 있는 칸의 85% 이상 쓰임, 한 가락 ≤ 12개, (가락·속도)까지 같은 쌍 ≤ 1%
//  ③ 인장이 이름에서 나온다(같은 이름 = 같은 인장) → 같은 이름 두 아이의 인장이 다르고, 이름을 바꿔도 인장은 그대로
//  ④ 인장이 몇 무늬에 몰린다 → 서로 다른 아이 100의 최소 쌍 거리 ≥ 3, 윤곽 점열도 모두 다르다
//  ⑤ 입력 경계: NFD·공백·대소문자는 같은 가락, 이모지·폭 없는 문자·조합 중 자모는 이름이 못 된다, 숫자 규칙 우회 막힘
//  ⑥ 플래그 꺼짐(앱이 setName을 보내지 않음) = 빌드 1과 같다 — **HEAD(73f3204) 코드로 뽑은 고정 기대값**(새 코드끼리 비교하지 않음)
//  ⑦ 이름 미공개면 공유물 재료(이레 영상 재료·공개 스냅숏 직렬화)에 이름 0
import { describe, expect, it } from 'vitest';
import { SEAL, ireShareSourceOf, parsePublicSnapshot, sealDistance, sealOutline, sealOutlineOf, serializePublicSnapshot, sim, type PublicSnapshot } from '../src/index';
import { H, KST, handStroke, kst } from './sim-helpers';
import namedSnap from './fixtures/snap/named.json';

function hash(t: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

const SYL = ['몽', '먹', '보', '솜', '달', '별', '구', '름', '하', '늘', '찰', '떡', '콩', '밤', '단', '비', '누', '리', '도', '토'];
/** 서로 다른 한글 두 글자 이름 100개(결정적) */
const KO2 = Array.from({ length: 100 }, (_, i) => {
  const j = (i * 37) % 400; // 20×20 쌍에서 겹치지 않게 100개
  return SYL[Math.floor(j / 20)]! + SYL[j % 20]!;
});
const LATIN = ['Momo', 'Ink', 'Bean', 'Luna', 'Nori', 'Pip', 'Sumi', 'Toto', 'Mochi', 'Kiki', 'Dot', 'Boba', 'Coco', 'Yuzu', 'Miso', 'Tofu', 'Pebble', 'Olive', 'Juniper', 'Ash'];
/** 서로 다른 이름 100개: 한 글자·두 글자·세 글자·라틴 섞음 */
const NAMES_100 = [...SYL, ...KO2.slice(0, 40), ...SYL.slice(0, 20).map((a, i) => a + SYL[(i + 5) % 20]! + SYL[(i + 11) % 20]!), ...LATIN].slice(0, 100);

describe('이름 가락 — 결정성', () => {
  it('같은 이름 → 같은 가락, NFD·공백·가운뎃점·라틴 대소문자는 같은 소리', () => {
    const a = sim.nameMelodyOf('몽실', 1);
    expect(sim.nameMelodyOf('몽실', 999)).toEqual(a); // 이름이 있으면 씨앗과 무관
    expect(sim.nameMelodyOf('몽실'.normalize('NFD'), 1)).toEqual(a);
    expect(sim.nameMelodyOf(' 몽 실 ', 1)).toEqual(a);
    expect(sim.nameMelodyOf('몽·실', 1)).toEqual(a);
    expect(sim.nameMelodyOf('MOMO', 1)).toEqual(sim.nameMelodyOf('momo', 1));
  });
  it('음 개수 = 음절 수(1~4), 다섯 음절 이상은 4', () => {
    expect(sim.nameMelodyOf('몽', 0).notes).toBe(1);
    expect(sim.nameMelodyOf('몽실이', 0).notes).toBe(3);
    expect(sim.nameMelodyOf('가나다라마바', 0).notes).toBe(4);
    expect(sim.syllableCount('Juniper')).toBe(3);
    expect(sim.syllableCount('Ink')).toBe(1);
    expect(sim.syllableCount('먹보2')).toBe(3);
  });
  it('id = (음 개수 − 1) × 8 + 윤곽, 0..31, 속도 0.92..1.08', () => {
    for (const n of NAMES_100) {
      const m = sim.nameMelodyOf(n, 0);
      expect(m.id).toBe((m.notes - 1) * 8 + m.contour);
      expect(m.id).toBeGreaterThanOrEqual(0);
      expect(m.id).toBeLessThan(sim.NAME_MELODY.count);
      expect(m.rate).toBeGreaterThanOrEqual(0.92);
      expect(m.rate).toBeLessThanOrEqual(1.08);
    }
  });
  it('이름이 없으면 씨앗 가락: 같은 씨앗 → 같은 가락, 이름 없는 아이 100이 32 중 24개 이상', () => {
    expect(sim.nameMelodyOf(null, 42)).toEqual(sim.nameMelodyOf(null, 42));
    expect(sim.nameMelodyOf('', 42).from).toBe('seed');
    const ids = new Set(Array.from({ length: 100 }, (_, i) => sim.nameMelodyOf(null, sim.fnv1a([i, 7])).id));
    expect(ids.size).toBeGreaterThanOrEqual(24);
  });
});

describe('그럴듯한 오답 ①② — 서로 다른 이름의 가락이 충분히 다른가', () => {
  it('같은 길이(두 글자) 이름 100개: 윤곽 8을 모두 쓰고, 한 윤곽이 25%를 넘지 않는다', () => {
    expect(KO2.length).toBe(100);
    const counts = new Array(8).fill(0);
    for (const n of KO2) counts[sim.nameMelodyOf(n, 0).contour]++;
    expect(counts.every((c) => c > 0)).toBe(true);
    expect(Math.max(...counts)).toBeLessThanOrEqual(25);
  });
  it('서로 다른 이름 100개: 닿을 수 있는 가락 칸의 대부분을 쓰고, 한 가락에 몰리지 않고, 가락·속도까지 같은 쌍은 드물다', () => {
    // 가락은 정본대로 32칸(음 개수 4 × 윤곽 8)뿐이라 100개 중 겹침은 피할 수 없다. 이 시험은 '몰림'과 '길이만 따름'을 떨어뜨린다.
    // 이 이름들의 음 개수는 1~3(다섯 글자 이상 한글·긴 라틴이 없다) → 닿을 수 있는 칸 24. 11-20 값: 23칸·최빈 12·같은 쌍 35/4950·조합 75·평균 2.30
    expect(new Set(NAMES_100).size).toBe(100);
    const ms = NAMES_100.map((n) => sim.nameMelodyOf(n, 0));
    const byId = new Map<number, number>();
    for (const m of ms) byId.set(m.id, (byId.get(m.id) ?? 0) + 1);
    const reachable = new Set(ms.map((m) => m.notes)).size * 8;
    expect(byId.size).toBeGreaterThanOrEqual(Math.ceil(reachable * 0.85));
    expect(Math.max(...byId.values())).toBeLessThanOrEqual(12);
    expect(new Set(ms.map((m) => `${m.id}|${m.rate}`)).size).toBeGreaterThanOrEqual(70);
    let same = 0;
    let pairs = 0;
    let sum = 0;
    for (let i = 0; i < ms.length; i++)
      for (let j = i + 1; j < ms.length; j++) {
        pairs++;
        const d = sim.melodyDistance(ms[i]!, ms[j]!);
        sum += d;
        if (d === 0) same++;
      }
    expect(same / pairs).toBeLessThanOrEqual(0.01);
    expect(sum / pairs).toBeGreaterThanOrEqual(2);
  });
});

describe('인장 — 결정성과 그럴듯한 오답 ③④', () => {
  const seeds = Array.from({ length: 100 }, (_, i) => sim.makeBirth(sim.fnv1a([i, 0x5eed]), 0, 'tap'));
  it('같은 인장 씨앗 → 같은 무늬·윤곽', () => {
    expect(sim.sealNotches(seeds[0]!.sealSeed)).toEqual(sim.sealNotches(seeds[0]!.sealSeed));
    expect(sealOutlineOf(seeds[0]!.sealSeed)).toEqual(sealOutlineOf(seeds[0]!.sealSeed));
  });
  it('서로 다른 아이 100: 무늬 최소 쌍 거리 ≥ 3, 윤곽 점열도 모두 다르다', () => {
    const pats = seeds.map((b) => sim.sealNotches(b.sealSeed));
    let min = Infinity;
    for (let i = 0; i < pats.length; i++) for (let j = i + 1; j < pats.length; j++) min = Math.min(min, sealDistance(pats[i]!, pats[j]!));
    expect(min).toBeGreaterThanOrEqual(3);
    expect(new Set(seeds.map((b) => sealOutlineOf(b.sealSeed).map((v) => v.toFixed(4)).join(','))).size).toBe(100);
  });
  it('세 깊이를 다 쓴다(한 단계에 몰리지 않음): 1600칸 중 각 깊이 25~42%', () => {
    const c = [0, 0, 0];
    for (const b of seeds) for (const v of sim.sealNotches(b.sealSeed)) c[v]!++;
    for (const v of c) {
      expect(v / 1600).toBeGreaterThan(0.25);
      expect(v / 1600).toBeLessThan(0.42);
    }
  });
  it('인장은 이름과 무관: 같은 이름을 지은 두 아이는 인장이 다르고, 이름을 바꿔도 인장은 그대로', () => {
    const a0 = sim.createInitial(kst(12, 1, 10), KST, 1);
    const b0 = sim.createInitial(kst(12, 1, 10), KST, 2);
    const a = sim.reduce(a0, { type: 'setName', at: kst(12, 1, 11), text: '몽실' }).state;
    const b = sim.reduce(b0, { type: 'setName', at: kst(12, 1, 11), text: '몽실' }).state;
    expect(sim.sealNotches(a.birth.sealSeed)).not.toEqual(sim.sealNotches(b.birth.sealSeed));
    const a2 = sim.reduce(a, { type: 'setName', at: kst(12, 1, 12), text: '먹보' }).state;
    expect(a2.birth).toEqual(a.birth);
  });
  it('윤곽: 모서리 네 점은 늘 온전, 모든 점이 0..1 안, 깊음 칸은 한 변의 10%까지 들어간다', () => {
    const o = sealOutline(new Array(16).fill(2));
    for (let i = 0; i < o.length; i++) {
      expect(o[i]).toBeGreaterThanOrEqual(-1e-9);
      expect(o[i]).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(o.slice(0, 2)).toEqual([0, 0]);
    let inward = 0;
    for (let i = 0; i < o.length; i += 2) inward = Math.max(inward, Math.min(o[i]!, 1 - o[i]!, o[i + 1]!, 1 - o[i + 1]!));
    expect(inward).toBeCloseTo(SEAL.depth[2], 6);
  });
  it('LOD: 한 변이 문턱(14pt)보다 작으면 이 빠짐 없이 사각 네 점', () => {
    const seed = seeds[3]!.sealSeed;
    expect(sealOutlineOf(seed, SEAL.lodMinPt - 1)).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
    expect(sealOutlineOf(seed, SEAL.lodMinPt).length).toBeGreaterThan(8);
  });
});

describe('입력 경계 ⑤', () => {
  // 보이지 않는 글자는 소스에 그대로 두지 않고 \u 이스케이프로만 쓴다
  it('NFD 한글은 NFC로 정리돼 통과, 같은 이름으로 저장된다', () => {
    const r = sim.normalizeName('몽실'.normalize('NFD'));
    expect(r).toEqual({ ok: true, text: '몽실' });
  });
  it('조합 중 자모·이모지·폭 없는 문자·양방향 제어·줄 구분자·전각 라틴은 거부(chars)', () => {
    for (const bad of ['몽\u3145', '\u3141', '몽\u{1F43E}', '몽\u200d실', '몽\u200b실', '\u202e몽실', '\uff2d\uff4f\uff4d\uff4f']) {
      const r = sim.normalizeName(bad);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
    }
  });
  it('조합 중 판정: 끝 글자가 자모일 때만 true(확정 시 거부는 그대로)', () => {
    expect(sim.endsWithComposingJamo('몽\u3145')).toBe(true);
    expect(sim.endsWithComposingJamo('몽\u1109')).toBe(true);
    expect(sim.endsWithComposingJamo('몽실')).toBe(false);
    expect(sim.endsWithComposingJamo('')).toBe(false);
    expect(sim.endsWithComposingJamo('몽\u{1F43E}')).toBe(false);
  });
  it('공백: 앞뒤·겹공백 정리, 공백만은 empty, 전각 공백도 공백', () => {
    expect(sim.normalizeName('  먹   보 ')).toEqual({ ok: true, text: '먹 보' });
    expect(sim.normalizeName('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(sim.normalizeName('몽\u3000실')).toEqual({ ok: true, text: '몽 실' });
  });
  it('길이: 한글이 하나라도 들면 6자, 라틴만이면 12자', () => {
    expect(sim.normalizeName('가나다라마바').ok).toBe(true);
    expect(sim.normalizeName('가나다라마바사')).toEqual({ ok: false, reason: 'length' });
    expect(sim.normalizeName('몽abcde').ok).toBe(true);
    expect(sim.normalizeName('몽abcdef')).toEqual({ ok: false, reason: 'length' });
    expect(sim.normalizeName('abcdefghijkl').ok).toBe(true);
  });
  it('숫자 규칙 우회 차단: 폭 없는 문자·수학 굵은 숫자·단어 잇개를 끼워도 digits, 자모를 끼우면 글자 검사가 막는다', () => {
    expect(sim.normalizeName('010\u31611234\u31615678').ok).toBe(false);
    for (const n of ['010\u200b1234\u200b5678', '\u{1D7CE}\u{1D7CF}\u{1D7CE}\u{1D7CF}\u{1D7D0}\u{1D7D1}\u{1D7D2}', '1\u20602\u20603\u20604\u20605\u20606\u20607']) {
      expect(sim.normalizeName(n), JSON.stringify(n)).toEqual({ ok: false, reason: 'digits' });
    }
  });
});

describe('세이브·이벤트', () => {
  const T = kst(12, 1, 10);
  it('setName: 처음 = named(first), 바꾸기 = named(!first), 같은 이름(정리 후)은 아무 일도 없다, 거부된 이름은 그대로', () => {
    const s0 = sim.createInitial(T, KST, 5);
    const r1 = sim.reduce(s0, { type: 'setName', at: T + 1000, text: ' 먹  보' });
    expect(r1.state.name).toEqual({ text: '먹 보', at: T + 1000 });
    expect(r1.effects).toContainEqual({ type: 'named', first: true });
    const r2 = sim.reduce(r1.state, { type: 'setName', at: T + 2000, text: '먹 보' });
    expect(r2.state.name).toEqual(r1.state.name);
    expect(r2.effects.some((e) => e.type === 'named')).toBe(false);
    const r3 = sim.reduce(r1.state, { type: 'setName', at: T + 3000, text: '몽🐾' });
    expect(r3.state.name).toEqual(r1.state.name);
    const r4 = sim.reduce(r1.state, { type: 'setName', at: T + 4000, text: 'Momo' });
    expect(r4.effects).toContainEqual({ type: 'named', first: false });
    // 바꾸면 처음 지은 시각을 firstAt에 남긴다(집계 핑 name_set은 처음 시각으로 한 번만 — 리뷰 L-3)
    expect(r4.state.name).toEqual({ text: 'Momo', at: T + 4000, firstAt: T + 1000 });
    const r5 = sim.reduce(r4.state, { type: 'setName', at: T + 5000, text: '몽' });
    expect(r5.state.name).toEqual({ text: '몽', at: T + 5000, firstAt: T + 1000 });
    expect(sim.firstNamedAt(r1.state)).toBe(T + 1000);
    expect(sim.firstNamedAt(r5.state)).toBe(T + 1000);
    expect(sim.firstNamedAt({ name: null })).toBeNull();
    const back = sim.parseState(sim.serializeState(r5.state, T + 6000));
    expect(back.name).toEqual(r5.state.name);
    expect(() => sim.parseState(sim.serializeState({ ...r5.state, name: { text: '몽', at: 1, firstAt: 'x' as unknown as number } }, T))).toThrow();
  });
  it('이름이 든 세이브 왕복: 이름·인장·가락이 그대로(옛 세이브 = name null도 열림)', () => {
    const s = sim.reduce(sim.createInitial(T, KST, 5), { type: 'setName', at: T + 1, text: '몽실이' }).state;
    const back = sim.parseState(sim.serializeState(s, T + 2));
    expect(back.name).toEqual(s.name);
    expect(sim.melodyOfState(back)).toEqual(sim.melodyOfState(s));
    expect(sim.sealNotches(back.birth.sealSeed)).toEqual(sim.sealNotches(s.birth.sealSeed));
    const none = sim.parseState(sim.serializeState(sim.createInitial(T, KST, 5), T + 2));
    expect(none.name).toBeNull();
    expect(sim.melodyOfState(none).from).toBe('seed');
  });
});

describe('부르기 대답(callReply)', () => {
  const base = (jeong: number, name: { text: string; at: number } | null, lastWakeAt: number) =>
    ({ relation: { jeongDays: jeong }, name, lastWakeAt, phase: 'awake' }) as Parameters<typeof sim.callReply>[0];
  it('정 0~1 = 고개 돌림, 정 2부터 가락(이름 없는 아이 = 씨앗 가락)', () => {
    expect(sim.callReply(base(1, null, 100), { melody: true })).toBe('turn');
    expect(sim.callReply(base(2, null, 100), { melody: true })).toBe('melody');
  });
  it('이름을 지은 날 밤을 지나야 가락으로 대답한다(이름 시각 < 마지막 깸)', () => {
    expect(sim.callReply(base(5, { text: '몽', at: 200 }, 100), { melody: true })).toBe('turn');
    expect(sim.callReply(base(5, { text: '몽', at: 50 }, 100), { melody: true })).toBe('melody');
  });
  it('가락 플래그가 꺼졌거나 자는 중이면 늘 고개 돌림', () => {
    expect(sim.callReply(base(5, null, 100), { melody: false })).toBe('turn');
    expect(sim.callReply({ ...base(5, null, 100), phase: 'asleep' }, { melody: true })).toBe('turn');
  });
});

describe('이름 묻는 때(namePromptDue) — C2가 군·플래그를 바꾸는 자리', () => {
  const st = (dayIndex: number, named = false) => ({ name: named ? { text: '몽', at: 0 } : null, dayIndex });
  it('A: 첫 재우기 → 건너뛰면 다음 아침 한 번 더 → 그 뒤로는 묻지 않음', () => {
    let log = sim.EMPTY_NAME_ASK;
    expect(sim.namePromptDue(st(0), 'morning', 'A', log)).toBe(false);
    expect(sim.namePromptDue(st(0), 'sleep', 'A', log)).toBe(true);
    log = sim.recordNameAsk(log, 0);
    expect(sim.namePromptDue(st(0), 'sleep', 'A', log)).toBe(false);
    expect(sim.namePromptDue(st(0), 'morning', 'A', log)).toBe(false);
    expect(sim.namePromptDue(st(1), 'morning', 'A', log)).toBe(true);
    log = sim.recordNameAsk(log, 1);
    expect(sim.namePromptDue(st(2), 'morning', 'A', log)).toBe(false);
    expect(sim.namePromptDue(st(2), 'sleep', 'A', log)).toBe(false);
  });
  it('B: 둘째 날 아침부터 한 번, 이름이 있으면 어느 군도 묻지 않음', () => {
    expect(sim.namePromptDue(st(0), 'morning', 'B', sim.EMPTY_NAME_ASK)).toBe(false);
    expect(sim.namePromptDue(st(0), 'sleep', 'B', sim.EMPTY_NAME_ASK)).toBe(false);
    expect(sim.namePromptDue(st(1), 'morning', 'B', sim.EMPTY_NAME_ASK)).toBe(true);
    expect(sim.namePromptDue(st(1), 'morning', 'B', sim.recordNameAsk(sim.EMPTY_NAME_ASK, 1))).toBe(false);
    expect(sim.namePromptDue(st(0, true), 'sleep', 'A', sim.EMPTY_NAME_ASK)).toBe(false);
  });
});

describe('그럴듯한 오답 ⑦ — 이름 미공개면 공유물 재료에 이름 0', () => {
  const s = sim.reduce(sim.createInitial(kst(12, 1, 10), KST, 5), { type: 'setName', at: kst(12, 1, 11), text: '몽실' }).state;
  it('sharedNameOf: 공개 끔 → null, 켬 → 이름, 이름 없음 → null', () => {
    expect(sim.sharedNameOf(s, false)).toBeNull();
    expect(sim.sharedNameOf(s, true)).toBe('몽실');
    expect(sim.sharedNameOf({ name: null }, true)).toBeNull();
  });
  it('이레 영상 재료: 공개 끔이면 name 키 자체가 없다(켜면 있다)', () => {
    expect('name' in ireShareSourceOf(s, { nameVisible: false })).toBe(false);
    expect(JSON.stringify(ireShareSourceOf(s, { nameVisible: false }))).not.toContain('몽실');
    expect(ireShareSourceOf(s, { nameVisible: true }).name).toBe('몽실');
  });
  it('공개 스냅숏 직렬화: 문을 거친 이름(null)이면 name 키 없음', () => {
    const parsed = parsePublicSnapshot(namedSnap);
    if (!parsed.ok) throw new Error('fixture');
    const snap: PublicSnapshot = parsed.snap;
    expect(serializePublicSnapshot(snap, sim.sharedNameOf(s, false))).not.toContain('"name"');
    expect(serializePublicSnapshot(snap, sim.sharedNameOf(s, true))).toContain('몽실');
  });
});

/**
 * ⑥ 플래그 꺼짐 = 빌드 1. 아래 값은 **M2 착수 전 HEAD(73f3204 — core/src는 d097aa3까지 차이 0, 리뷰 독립 재계산으로 확인)** 코드로 같은 이벤트 열을 돌려 뽑았다.
 * - 이름 없는 열: 세이브 문자열·효과 열·난수가 HEAD와 비트 단위로 같다.
 * - 이름을 짓는 열(빌드 1에도 있던 setName): 효과 열은 새 'named'를 빼면 HEAD와 같다. 세이브는 바꾼 이름에 새로 붙는
 *   `name.firstAt`(리뷰 L-3) 하나만 다르다 — 그 칸을 뺀 세이브가 HEAD와 같다. 빌드 1 앱은 setName을 보내지 않는다.
 */
const HEAD_M2 = [
  { seed: 11, named: false, save: 'a316be03', eff: '6454c7e3', n: 55, rng: -759718053 },
  { seed: 11, named: true, save: 'bc8ce63f', eff: '6454c7e3', n: 55, rng: -759718053 },
  { seed: 4242, named: false, save: '279710f0', eff: '36fcd13d', n: 55, rng: -759713822 },
  { seed: 4242, named: true, save: '29924040', eff: '36fcd13d', n: 55, rng: -759713822 },
];

function scenario(seed: number, named: boolean) {
  let s = sim.createInitial(kst(12, 10, 19), KST, seed, { birth: { x: 0.1, y: -0.2, ms: kst(12, 10, 19), installAt: kst(12, 10, 19), entropy: seed * 7919 } });
  const effects: sim.Effect[] = [];
  const apply = (e: sim.Event) => {
    const r = sim.reduce(s, e);
    s = r.state;
    effects.push(...r.effects);
  };
  for (let d = 0; d < 9; d++) {
    const base = kst(12, 10 + d, 19);
    apply({ type: 'appForeground', at: base, tzOffsetMin: KST });
    if (d > 0) apply({ type: 'developCard', at: base + 60_000 });
    apply({ type: 'stroke', at: base + 120_000, raw: handStroke(d + 3) });
    apply({ type: 'tap', at: base + 130_000, target: 'body', holdMs: 0, x: 0.1 * (d % 3), y: -0.3 });
    if (named && d === 1) apply({ type: 'setName', at: base + 140_000, text: '  먹 보 ' });
    if (named && d === 4) apply({ type: 'setName', at: base + 140_000, text: 'Momo' });
    apply({ type: 'putToSleep', at: base + 4 * H });
    apply({ type: 'appBackground', at: base + 4 * H + 60_000 });
  }
  return { s, effects };
}

describe('⑥ 플래그 꺼짐 = 빌드 1(HEAD 고정 기대값)', () => {
  it.each(HEAD_M2)('씨앗 $seed 이름 $named: 세이브·효과·난수가 HEAD 값 그대로', ({ seed, named, save, eff, n, rng }) => {
    const { s, effects } = scenario(seed, named);
    const asHead = s.name ? { ...s, name: { text: s.name.text, at: s.name.at } } : s;
    expect(hash(sim.serializeState(asHead, kst(12, 20, 9)))).toBe(save);
    if (named) expect(s.name!.firstAt).toBe(kst(12, 11, 19) + 140_000);
    const old = effects.filter((e) => e.type !== 'named');
    expect(old.length).toBe(n);
    expect(hash(JSON.stringify(old))).toBe(eff);
    expect(s.rng).toBe(rng);
    expect(effects.filter((e) => e.type === 'named').length).toBe(named ? 2 : 0);
  });
});
