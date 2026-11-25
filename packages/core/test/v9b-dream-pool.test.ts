// V9b 꿈 풀 규칙(daily-loop v1.1 5-1 '본 꿈은 닫히지 않는 풀 규칙'): 한 번 본 모티프는 해금 값이 늦춰져도 풀에 남는다.
// - 꿈 콘텐츠 꺼짐(판 0) = 빌드 1 `pickCard` 그대로 — 시드 고정 사슬의 sha256이 V9b 이전(main a205346)과 같다.
// - 꿈 콘텐츠 켜짐, 지금 해금 값 = 변화 0 — 같은 사슬의 sha256이 V9b 이전과 같다(부록 B '지금 값으로는 변화 0').
// - 늦춘 해금 표: 본 모티프는 남고, 안 본 모티프는 늦춘 값을 따른다. 구역·보름 창·제품 사용 가능 거름은 그대로.
import { describe, expect, it } from 'vitest';
import { sim, v3 } from '../src/index';
import * as doc from '../../../docs/design/content-v1/dreams-sim.mjs';

const KST = 540;

/** 시드 고정 난수(mulberry32) — 성향·보름 밤 고르기용. 시험 안에서만 */
function rand(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** 한 시드의 40밤 사슬: 매일 현상(긴 잠 없음). 보름 켬·끔이 섞이고 성향이 이레마다 흔들린다 */
function chain(seed: number, dream: sim.DreamContext | undefined, moonOn: boolean): sim.DreamCard[] {
  const r = rand(seed);
  const cards: sim.DreamCard[] = [];
  let rng = (seed * 2654435761) >>> 0;
  let v: sim.AxisRecord = { curiosity: r() * 2 - 1, closeness: r() * 2 - 1, boldness: r() * 2 - 1, tempo: r() * 2 - 1 } as sim.AxisRecord;
  for (let night = 1; night <= 40; night++) {
    if (night % 7 === 0) v = { ...v, curiosity: v.curiosity * 0.3, closeness: -v.closeness };
    const day = 1 + ((seed + night) % 28);
    const nightDate = `2027-01-${String(day).padStart(2, '0')}`;
    const got = sim.pickNightCard({
      v,
      used: cards.map((c) => ({ motifId: c.motifId, composition: c.composition })),
      rng,
      night,
      strokeRef: night % 3 === 0 ? null : `s${night}`,
      nightDate,
      tzOffsetMin: KST,
      developedCards: cards.length,
      ...(moonOn ? { moon: { enabled: true, dev: seed % 2 === 0 } } : {}),
      ...(dream ? { dream } : {}),
      history: cards,
    });
    cards.push(got.card);
    rng = got.rng;
  }
  return cards;
}

const hashOf = (dream: sim.DreamContext | undefined) => {
  const all: sim.DreamCard[][] = [];
  for (let seed = 1; seed <= 80; seed++) all.push(chain(seed, dream, seed % 3 !== 0));
  return v3.sha256Hex(JSON.stringify(all));
};

/** V9b 이전(main a205346) 코드로 같은 사슬을 돌린 값. 바꾸면 안 된다 */
const PRE_V9B = {
  off: '4593042ea5f003f0de908d0a0b7d38200af1e36b5303b61372c2f5937a0f4640',
  offUndefined: '4593042ea5f003f0de908d0a0b7d38200af1e36b5303b61372c2f5937a0f4640',
  onDev: 'b50b066ff441207c0ca68272cd0e50e1e63e00c3fcf65e57355425543fe2d4d7',
  onProd: 'b50b066ff441207c0ca68272cd0e50e1e63e00c3fcf65e57355425543fe2d4d7',
};

describe('판 0(꿈 콘텐츠 꺼짐)은 빌드 1과 바이트 동일 — 시드 80 × 40밤', () => {
  it('dream 꺼짐·없음 모두 V9b 이전 sha256과 같다', () => {
    expect(hashOf({ enabled: false })).toBe(PRE_V9B.off);
    expect(hashOf(undefined)).toBe(PRE_V9B.offUndefined);
  });
  it('꺼짐 카드에는 판 번호(artRev)가 실리지 않는다', () => {
    for (let seed = 1; seed <= 10; seed++) for (const c of chain(seed, { enabled: false }, true)) expect(c.artRev).toBeUndefined();
  });
});

describe('판 1(꿈 콘텐츠 켜짐) — 지금 해금 값이면 변화 0', () => {
  it('개발·제품 빌드 모두 V9b 이전 sha256과 같다', () => {
    expect(hashOf({ enabled: true, dev: true })).toBe(PRE_V9B.onDev);
    expect(hashOf({ enabled: true })).toBe(PRE_V9B.onProd);
  });
  it('사슬이 보름 카드·늦게 열리는 모티프(해금 12·15)까지 지난다(해시가 빈 경우만 보지 않게)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) for (const c of chain(seed, { enabled: true }, seed % 3 !== 0)) seen.add(c.motifId);
    expect([...seen].some((id) => id.startsWith('moon-'))).toBe(true);
    const late = sim.MOTIFS.filter((m) => m.unlockAtCards >= 12).map((m) => m.id);
    expect(late.filter((id) => seen.has(id)).length).toBeGreaterThanOrEqual(4);
  });
});

/** 내 구역 해금 3·7·12 → 3·7·16, 가운데 5·9·15 → 5·11·21 (보류된 T-1 표 — 늦춤 OTA의 예) */
const DELAYED: readonly sim.Motif[] = sim.MOTIFS.map((m) => {
  const to: Record<number, number> = m.zone === 'center' ? { 9: 11, 15: 21 } : { 12: 16 };
  return { ...m, unlockAtCards: to[m.unlockAtCards] ?? m.unlockAtCards };
});
const ids = (p: readonly sim.Scene[]) => [...new Set(p.map((s) => s.motifId))];

describe('본 꿈은 닫히지 않는다(5-1 풀 규칙)', () => {
  it('늦춘 표에서 본 모티프는 해금 값과 상관없이 풀에 남고, 안 본 것은 늦춘 값을 따른다', () => {
    const q = 'near-alone' as const;
    const twelve = sim.MOTIFS.find((m) => m.zone === q && m.unlockAtCards === 12)!.id;
    const nine = sim.MOTIFS.find((m) => m.zone === 'center' && m.unlockAtCards === 9)!.id;
    // 카드 13장: 지금 표로 연 둘을 이미 봤다 → 늦춘 표(16·11)여도 남는다
    const kept = ids(sim.dreamPool(q, 13, { motifs: DELAYED, seen: [twelve, nine] }));
    expect(kept).toContain(twelve);
    expect(kept).toContain(nine);
    // 안 봤으면 늦춘 값대로 빠진다
    const plain = ids(sim.dreamPool(q, 10, { motifs: DELAYED }));
    expect(plain).not.toContain(twelve);
    expect(plain).not.toContain(nine);
    // 구도 3개 모두 풀에 든다(모티프 단위)
    expect(sim.dreamPool(q, 10, { motifs: DELAYED, seen: [twelve] }).filter((s) => s.motifId === twelve).map((s) => s.composition)).toEqual([0, 1, 2]);
  });
  it('다른 거름은 그대로: 다른 구역 모티프·보름 창의 center.moon·제품에서 못 쓰는 모티프는 봤어도 빠진다', () => {
    const other = sim.MOTIFS.find((m) => m.zone === 'far-with' && m.unlockAtCards === 0)!.id;
    expect(ids(sim.dreamPool('near-alone', 30, { seen: [other] }))).not.toContain(other);
    expect(ids(sim.dreamPool('near-alone', 30, { seen: ['center.moon'], moonWindow: true }))).not.toContain('center.moon');
    const twelve = sim.MOTIFS.find((m) => m.zone === 'near-alone' && m.unlockAtCards === 12)!.id;
    expect(ids(sim.dreamPool('near-alone', 0, { seen: [twelve], usable: (id) => id !== twelve }))).not.toContain(twelve);
    // 표에 없는 id(보름 카드·지운 모티프)는 아무것도 더하지 않는다
    expect(sim.dreamPool('near-alone', 0, { seen: ['moon-01', 'gone.motif'] })).toEqual(sim.dreamPool('near-alone', 0));
  });
  it('순서는 그대로 모티프 id 오름차순 → 구도 오름차순(결정성 D-13)', () => {
    const twelve = sim.MOTIFS.find((m) => m.zone === 'near-alone' && m.unlockAtCards === 12)!.id;
    const p = sim.dreamPool('near-alone', 2, { motifs: DELAYED, seen: [twelve] });
    const keys = p.map((s) => `${s.motifId}/${s.composition}`);
    expect(keys).toEqual([...keys].sort());
  });
  it('pickNightCard는 기록(history)의 모티프를 본 꿈으로 넘긴다 — 풀을 수동으로 만든 값과 같다', () => {
    const v = { curiosity: -0.6, closeness: -0.5, boldness: 0.1, tempo: 0.2 } as sim.AxisRecord;
    const twelve = sim.MOTIFS.find((m) => m.zone === 'near-alone' && m.unlockAtCards === 12)!.id;
    // 해금 12인 모티프를 본 기록이 있는데 카드 수는 6(늦춤 이행과 같은 모양): 그 모티프가 풀에 있어야 한다
    const hist: sim.DreamCard[] = [twelve, 'near-alone.quilt', 'center.moon', 'near-alone.teacup', 'center.moon', 'near-alone.quilt'].map((id, i) => ({
      night: i + 1, motifId: id, composition: (i % 3) as 0 | 1 | 2, inkTone: 0.5, flow: 0, flowSeed: i, strokeRef: null, nightsMerged: 1,
    }));
    let diff = 0;
    for (let rng = 1; rng <= 300; rng++) {
      const got = sim.pickNightCard({ v, used: hist, rng, night: 7, strokeRef: null, nightDate: null, tzOffsetMin: KST, developedCards: 6, dream: { enabled: true, dev: true }, history: hist });
      const u = sim.rngNext(rng);
      const pool = sim.dreamPool('near-alone', 6, { seen: hist.map((h) => h.motifId), usable: (id) => sim.motifUsable(id, true) });
      const want = sim.chooseScene(pool, hist, u.value)!.scene;
      expect({ m: got.card.motifId, c: got.card.composition }).toEqual({ m: want.motifId, c: want.composition });
      const noSeen = sim.chooseScene(sim.dreamPool('near-alone', 6, { usable: (id) => sim.motifUsable(id, true) }), hist, u.value)!.scene;
      if (noSeen.motifId !== want.motifId || noSeen.composition !== want.composition) diff++;
    }
    expect(diff).toBeGreaterThan(0);
  });
});

describe('시뮬(dreams-sim.mjs pick)도 같은 풀 규칙', () => {
  it('늦춘 표 + 본 모티프 기록이면 시뮬 풀에도 남는다', () => {
    const twelve = sim.MOTIFS.find((m) => m.zone === 'near-alone' && m.unlockAtCards === 12)!.id;
    const motifs = DELAYED.map((m) => ({ id: m.id, zone: m.zone, family: m.family, unlock: m.unlockAtCards }));
    const hist = [{ motifId: twelve, comp: 0 }, ...Array.from({ length: 12 }, (_, i) => ({ motifId: 'near-alone.quilt', comp: i % 3 }))];
    // 고른 결과 중 하나라도 twelve면 풀에 있었다는 뜻. 기록이 quilt뿐이라 R2·R3이 quilt를 막아 다른 모티프가 나온다
    const picks = new Set<string>();
    for (let s = 1; s <= 200; s++) {
      const r = rand(s);
      picks.add(doc.pick('near-alone', hist, r, false, motifs).pick.motifId);
    }
    expect(picks.has(twelve)).toBe(true);
  });
  it('늦춘 표에서 core(풀 + chooseScene)와 시뮬이 한 밤씩 같은 장면을 고른다 — 구역 4 × 시드 25 × 40밤', () => {
    const motifs = DELAYED.map((m) => ({ id: m.id, zone: m.zone, family: m.family, unlock: m.unlockAtCards }));
    const now = sim.MOTIFS.map((m) => ({ id: m.id, zone: m.zone, family: m.family, unlock: m.unlockAtCards }));
    const fam = new Map(DELAYED.map((m) => [m.id, m.family]));
    const famOf = (id: string) => fam.get(id) ?? id;
    for (const zone of ['near-alone', 'near-with', 'far-alone', 'far-with'] as const) {
      for (let s = 1; s <= 25; s++) {
        // 판 중간 이행: 처음 14장은 지금 표로 고른 기록(본 꿈 포함), 그 뒤는 늦춘 표
        const hist: { motifId: string; comp: number }[] = [];
        const r0 = rand(s * 31);
        for (let n = 0; n < 14; n++) hist.push(doc.pick(zone, hist, r0, false, now).pick);
        const rd = rand(s);
        const rc = rand(s);
        for (let n = 0; n < 26; n++) {
          const d = doc.pick(zone, hist, rd, false, motifs).pick;
          const pool = sim.dreamPool(zone, hist.length, { motifs: DELAYED, seen: hist.map((h) => h.motifId) });
          const c = sim.chooseScene(pool, hist.map((h) => ({ motifId: h.motifId, composition: h.comp as 0 | 1 | 2 })), rc(), famOf)!.scene;
          expect({ m: c.motifId, c: c.composition }, `${zone} ${s} ${n}`).toEqual({ m: d.motifId, c: d.comp });
          hist.push(d);
        }
      }
    }
  });
});
