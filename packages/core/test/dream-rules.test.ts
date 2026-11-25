// 꿈 모티프 25·고르는 규칙(C6) — 그럴듯한 오답 검사(OPERATING 8-1).
// 정본 시뮬(docs/design/content-v1/dreams-sim.mjs, 2-5 사양을 그대로 옮긴 별도 구현)을 **직접 불러** core 구현과 대조한다.
// ① 모티프 표가 같다 ② 같은 기록·같은 난수에서 한 밤씩 같은 장면·같은 완화 규칙을 고른다 ③ core 고르기를 시뮬 회차 틀에 넣어
// 2000회 돌린 표가 문서 2-6 표(문서 파일에서 읽음)와 글자까지 같다 — 구역별 30·90밤 R1~R4 위반 0을 포함한다.
// 둘이 갈리면 실패한다(한쪽만 고치면 잡힌다).
import { describe, expect, it } from 'vitest';
import * as doc from '../../../docs/design/content-v1/dreams-sim.mjs';
import { sim } from '../src/index';

const DOC_MD = Object.values(
  import.meta.glob<string>('../../../docs/design/content-v1/dreams-30days.md', { query: '?raw', import: 'default', eager: true }),
)[0]!;

/** 문서 1-4: 20번 자리는 밤기차(시뮬 기준) 또는 징검다리(core 기본값). 둘 다 다른 가족과 겹치지 않는다 */
const TRAIN = { id: 'far-with.night-train', family: 'train' };
const STONES = { id: 'far-with.stepping-stones', family: 'stones' };

/** 시뮬 표를 core 모양으로(20번 자리를 징검다리로) */
const docAsStones: doc.SimMotif[] = doc.MOTIFS.map((m) => (m.id === TRAIN.id ? { ...m, id: STONES.id, family: STONES.family } : m));
/** core 표를 시뮬 모양으로(20번 자리를 밤기차로) — 문서 2-6 표 재현용 */
const coreAsTrain: sim.Motif[] = sim.MOTIFS.map((m) => (m.id === STONES.id ? { ...m, id: TRAIN.id, family: TRAIN.family } : m));
const famIn = (list: readonly sim.Motif[]) => {
  const fam = new Map(list.map((m) => [m.id, m.family]));
  return (id: string) => (id.startsWith('moon-') ? 'moon' : (fam.get(id) ?? id));
};

/** core 고르기를 시뮬 pick 자리에 넣는 어댑터(난수 한 번 소비 — 시뮬과 같다) */
function corePick(motifs: readonly sim.Motif[]): doc.SimPick {
  const fam = famIn(motifs);
  const pools = new Map<string, sim.Scene[]>();
  return (zone, history, rand, moonWindow) => {
    const u = rand();
    // 풀은 (구역, 카드 수, 보름 창)만의 함수라 2000회 표를 빨리 돌리려고 기억해 둔다
    const k = `${zone}|${Math.min(history.length, 99)}|${moonWindow}`;
    let pool = pools.get(k);
    if (!pool) pools.set(k, (pool = sim.dreamPool(zone as sim.MotifQuadrant, history.length, { moonWindow, motifs })));
    const got = sim.chooseScene(
      pool,
      history.map((h) => ({ motifId: h.motifId, composition: h.comp })),
      u,
      fam,
    )!;
    return { pick: { motifId: got.scene.motifId, comp: got.scene.composition }, relaxed: new Set(got.relaxed) };
  };
}

describe('모티프 25 표(1-3) = 정본 시뮬 표', () => {
  it('id·구역·가족·해금이 같다(20번 자리만 징검다리 — 1-4 기본값)', () => {
    const core = sim.MOTIFS.map((m) => ({ id: m.id, zone: m.zone, family: m.family, unlock: m.unlockAtCards }));
    expect(core).toEqual(docAsStones);
  });

  it('구역마다 5개, 해금은 내 구역 0·0·3·7·12 · 가운데 0·0·5·9·15(점적식)', () => {
    for (const z of ['near-alone', 'near-with', 'far-alone', 'far-with', 'center'] as const) {
      const us = sim.MOTIFS.filter((m) => m.zone === z).map((m) => m.unlockAtCards);
      expect(us, z).toEqual(z === 'center' ? [0, 0, 5, 9, 15] : [0, 0, 3, 7, 12]);
    }
  });

  it('형상(C14b): 빌드 1의 10개 = 마블링 절차 형상(경로 없음), 새 15개 = 붓 경로 → 자리표시 0, 제품 출시 차단 0', () => {
    expect(sim.MOTIFS.filter((m) => m.paths.length === 0).map((m) => m.unlockAtCards)).toEqual(Array(10).fill(0));
    expect(sim.MOTIFS.filter((m) => m.paths.length > 0).every((m) => m.unlockAtCards > 0 && m.seat)).toBe(true);
    expect(sim.MOTIFS.filter((m) => m.placeholder)).toEqual([]);
    expect(sim.MOTIFS.flatMap((m) => sim.motifBlockers(m.id))).toEqual([]);
    for (const m of sim.MOTIFS) {
      expect(sim.motifUsable(m.id, true)).toBe(true);
      expect(sim.motifUsable(m.id, false)).toBe(true);
    }
  });

  it('풀 정렬은 모티프 id 오름차순 → 구도 오름차순(난수 결과가 후보 순서에 의존 — 2-5 순서 1)', () => {
    const pool = sim.dreamPool('far-with', 99).map((s) => `${s.motifId}/${s.composition}`);
    expect(pool).toEqual([...pool].sort());
    expect(pool).toHaveLength(30);
    expect(sim.dreamPool('far-with', 99, { moonWindow: true })).toHaveLength(27);
  });

  it('해금: 현상한 카드 수로 4 → 5(3장) → 6(5장) → 7(7장) → 8(9장) → 9(12장) → 10(15장) 모티프', () => {
    const count = (n: number) => new Set(sim.dreamPool('near-alone', n).map((s) => s.motifId)).size;
    expect([0, 2, 3, 4, 5, 7, 9, 12, 15, 99].map(count)).toEqual([4, 4, 5, 5, 6, 7, 8, 9, 10, 10]);
  });

  it('원격 dreamUnlock은 앞당기기만(늦추는 값·숫자 아닌 값 무시, 2-1)', () => {
    const leaf = sim.motifById('center.leaf')!;
    expect(sim.unlockAt(leaf, { 'center.leaf': 1 })).toBe(1);
    expect(sim.unlockAt(leaf, { 'center.leaf': 40 })).toBe(5);
    expect(sim.unlockAt(leaf, { 'center.leaf': Number.NaN })).toBe(5);
    expect(sim.unlockAt(leaf, {})).toBe(5);
  });
});

describe('한 밤씩 대조 — 같은 기록·같은 난수 → 같은 장면·같은 완화', () => {
  it('구역 5(가운데는 매일 사분면 무작위) × 보름 있음·없음 × 90밤 × 씨앗 40', () => {
    const quads = ['near-alone', 'near-with', 'far-alone', 'far-with'] as const;
    let nights = 0;
    for (const zone of [...quads, 'center*'] as const)
      for (const withMoon of [false, true])
        for (let seed = 1; seed <= 40; seed++) {
          let rng = seed * 104729;
          const next = () => {
            const o = sim.rngNext(rng);
            rng = o.seed;
            return o.value;
          };
          const moonAt = Math.floor(next() * 30);
          const hist: { motifId: string; comp: number }[] = [];
          for (let night = 1; night <= 90; night++) {
            const z = zone === 'center*' ? quads[Math.floor(next() * 4)]! : zone;
            const d = ((night - moonAt) % 30 + 30) % 30;
            const moonWin = withMoon && (d <= 1 || d === 29);
            if (moonWin && hist.length >= sim.MOON_PROTECTED_CARDS) {
              // 실제 id(월마다 다름)를 양쪽 기록에 같이 넣는다 — R3(가족 moon)·R5(처음 꾼 꿈)가 둘 다 같은 기록을 본다
              hist.push({ motifId: `moon-${String((night % 12) + 1).padStart(2, '0')}`, comp: d === 29 ? 0 : d === 0 ? 1 : 2 });
              continue;
            }
            const u = next();
            const a = doc.pick(z, hist, () => u, moonWin, docAsStones);
            const b = corePick(sim.MOTIFS)(z, hist, () => u, moonWin);
            expect(b.pick, `${zone} 씨앗 ${seed} 밤 ${night}`).toEqual(a.pick);
            expect([...b.relaxed].sort()).toEqual([...a.relaxed].sort());
            hist.push(a.pick);
            nights++;
          }
        }
    expect(nights).toBeGreaterThan(30000);
  }, 30000); // 무거운 전수 시험 — 기계가 바쁠 때(다른 작업 병렬) 기본 5초를 넘는 일이 있어 넉넉히(C14b, 바꾸기 전 코드에서도 같게 걸림)
});

/** 문서 2-6 표(구역 | 밤 | 보름 | R1 | R2 | R3 | R4 | 재등장 | 공백)를 문서 파일에서 읽는다 */
function docTable(): doc.SimRow[] {
  const sec = DOC_MD.slice(DOC_MD.indexOf('### 2-6.'), DOC_MD.indexOf('## 3.'));
  const rows: doc.SimRow[] = [];
  for (const line of sec.split('\n')) {
    const c = line.split('|').map((x) => x.trim());
    if (c.length < 11 || !/^(near|far|가운데)/.test(c[1]!)) continue;
    rows.push({
      zone: c[1] === '가운데(최악)' ? 'center*' : c[1]!,
      nights: Number(c[2]),
      moon: c[3] === '있음',
      R1: Number(c[4]),
      R2: Number(c[5]),
      R3: Number(c[6]),
      R4: Number(c[7]),
      repeat30: c[8]!,
      gap: c[9]!,
    });
  }
  return rows;
}

describe('표 대조(2-6) — core 고르기를 시뮬 회차 틀에 넣어도 같은 표', () => {
  it('기본: 200회 × 구역 5 × 보름 있음·없음 × 30밤 — 시뮬 자신의 고르기와 표가 같다(90밤은 위 한 밤씩 대조가 덮는다)', () => {
    const docPick: doc.SimPick = (z, h, r, mw) => doc.pick(z, h, r, mw);
    const got = doc.table(200, undefined, corePick(coreAsTrain), [30]);
    expect(got).toEqual(doc.table(200, undefined, docPick, [30]));
    for (const r of got) expect([r.R1, r.R2, r.R3, r.R4], `${r.zone} ${r.moon}`).toEqual([0, 0, 0, 0]);
  }, 60_000);
});

// 무거운 대조(RENDER_HEAVY=1 또는 pnpm verify --heavy, 약 25초): 문서 2-6 표 2000회를 글자까지, 징검다리 500회 위반 0
describe.skipIf(!process.env.RENDER_HEAVY)('2000회 표(2-6) — core 고르기로 돌려도 문서 표와 같다(heavy)', () => {
  it('구역별 30·90밤 × 보름 있음·없음: R1~R4 위반 0, 재등장·처음 꾼 꿈 공백까지 문서 값 그대로', () => {
    const want = docTable();
    expect(want).toHaveLength(20);
    const got = doc.table(2000, undefined, corePick(coreAsTrain));
    expect(got).toEqual(want);
    for (const r of got) expect([r.R1, r.R2, r.R3, r.R4], `${r.zone} ${r.nights}`).toEqual([0, 0, 0, 0]);
  }, 120_000);

  it('징검다리(core 기본값)로도 500회 R1~R4 위반 0(1-4 "결과가 같다")', () => {
    for (const r of doc.table(500, undefined, corePick(sim.MOTIFS))) expect([r.R1, r.R2, r.R3, r.R4], `${r.zone} ${r.nights} ${r.moon}`).toEqual([0, 0, 0, 0]);
  }, 120_000);
});

describe('완화 순서·31밤 이후·결정성', () => {
  const H = (xs: [string, number][]) => xs.map(([motifId, composition]) => ({ motifId, composition }));

  it('후보가 없으면 R4 → R3 → R2 → R1 순서로 푼다', () => {
    const pool = [{ motifId: 'center.rain', composition: 0 as const }];
    expect(sim.chooseScene(pool, H([['center.rain', 0]]), 0.5)!.relaxed).toEqual(['R4', 'R3', 'R2', 'R1']);
    expect(sim.chooseScene(pool, H([['center.snow', 0], ['center.snow', 0]]), 0.5)!.relaxed).toEqual(['R4']);
    // R3을 풀려면 앞 순서(R4)도 함께 푼다 — 시뮬의 '위반' 세기와 같다
    expect(sim.chooseScene(pool, H([['near-with.umbrella', 1]]), 0.5)!.relaxed).toEqual(['R4', 'R3']);
  });

  it('R1까지 풀면 가장 오래전에 나온 장면', () => {
    const pool = [
      { motifId: 'center.rain', composition: 0 as const },
      { motifId: 'center.rain', composition: 1 as const },
    ];
    const got = sim.chooseScene(pool, H([['center.rain', 1], ['center.rain', 0]]), 0.99)!;
    expect(got.scene).toEqual({ motifId: 'center.rain', composition: 1 });
  });

  it('31밤 이후(풀 고정): 같은 장면은 늘 19장 이상 떨어지고, 30장면을 고정 순서로 되풀이하지 않는다', () => {
    for (const zone of ['near-alone', 'far-with'] as const) {
      let rng = 99;
      const hist: sim.SceneRef[] = [];
      for (let night = 1; night <= 200; night++) {
        const o = sim.rngNext(rng);
        rng = o.seed;
        const got = sim.chooseScene(sim.dreamPool(zone, hist.length), hist, o.value)!;
        expect(got.relaxed, `${zone} 밤 ${night}`).toEqual([]);
        hist.push(got.scene);
      }
      const key = (s: sim.SceneRef) => `${s.motifId}/${s.composition}`;
      const lastAt = new Map<string, number>();
      hist.forEach((s, i) => {
        const prev = lastAt.get(key(s));
        if (prev !== undefined) expect(i - prev).toBeGreaterThanOrEqual(19);
        lastAt.set(key(s), i);
      });
      expect(hist.slice(30, 60).map(key)).not.toEqual(hist.slice(60, 90).map(key));
    }
  });
});

describe('처음 꾼 꿈(1-7)·캡션 원인(3-2·3-3)', () => {
  it('처음 꾼 꿈 = 그 모티프의 첫 카드(다음 해 같은 보름 모티프는 아님)', () => {
    const cards = ['center.rain', 'center.moon', 'center.rain', 'moon-12', 'moon-12'].map((motifId) => ({ motifId }));
    expect(cards.map((_, i) => sim.isFirstDream(cards, i))).toEqual([true, true, false, true, false]);
    expect(sim.isFirstDream(cards, 9)).toBe(false);
  });

  const v = (curiosity: number, closeness: number): sim.AxisRecord => ({ tempo: 0, boldness: 0, curiosity, closeness });

  it('원인 말씨 문턱: 사분면 두 축 ≥0.15 → 1·3, ≥0.35 → 1·2·3, 한 축만 약하면 결과만', () => {
    expect(sim.causeVariants(v(0.2, -0.2), 'far-alone')).toEqual([1, 3]);
    expect(sim.causeVariants(v(0.4, 0.5), 'far-with')).toEqual([1, 2, 3]);
    expect(sim.causeVariants(v(0.4, 0.1), 'far-with')).toEqual([]);
    expect(sim.causeVariants(v(-0.36, 0.2), 'near-with')).toEqual([1, 3]);
  });

  it('가운데: 두 축 <0.15 → 1·3, <0.08 → 1·2·3', () => {
    expect(sim.causeVariants(v(0.1, -0.1), 'center')).toEqual([1, 3]);
    expect(sim.causeVariants(v(0.05, 0.07), 'center')).toEqual([1, 2, 3]);
  });

  it('직전 카드와 같은 말씨는 쓰지 않는다(그것뿐이면 결과만), 물결 씨앗으로 고른다(난수 추가 소비 없음)', () => {
    const strong = v(0.5, 0.5);
    for (let seed = 0; seed < 30; seed++) {
      const c = sim.pickCause(strong, 'far-with', { cause: 'far-with.2' }, seed);
      expect(c).not.toBe('far-with.2');
      expect(c).toMatch(/^far-with\.[13]$/);
    }
    expect(sim.pickCause(v(0.2, 0.2), 'far-with', null, 0)).toBe('far-with.1');
    expect(sim.pickCause(v(0.2, 0.2), 'far-with', null, 1)).toBe('far-with.3');
    expect(sim.pickCause(v(0.4, 0.1), 'far-with', null, 1)).toBeNull();
  });
});
