import { describe, expect, it } from 'vitest';
import { DREAM_LIMITS, DREAM_TEMPERS, buildDreamScene, day7ClumsyRecords, day7Records, dreamCardSeed, sim } from '../src/index';

const card = (motifId: string, over: Partial<sim.DreamCard> = {}): sim.DreamCard => ({
  night: 7,
  motifId,
  composition: 0,
  inkTone: 0.5,
  flow: 0,
  flowSeed: 12345,
  strokeRef: null,
  nightsMerged: 1,
  ...over,
});

describe('꿈 인화 카드 장면(결정성)', () => {
  it('같은 카드 + 같은 획 기록이면 시드와 장면이 같다', () => {
    const a = buildDreamScene({ card: card('center.moon'), strokes: day7Records() });
    const b = buildDreamScene({ card: card('center.moon'), strokes: day7Records() });
    expect(a.seed).toBe(b.seed);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('세이브 내용이 바뀌면 시드가 바뀐다(획 기록·날·성향)', () => {
    const base = dreamCardSeed(card('center.moon'), day7Records());
    expect(dreamCardSeed(card('center.moon'), day7ClumsyRecords())).not.toBe(base);
    expect(dreamCardSeed(card('center.moon', { night: 8 }), day7Records())).not.toBe(base);
    expect(dreamCardSeed(card('center.moon', { inkTone: 0.51 }), day7Records())).not.toBe(base);
  });

  it('모티프 10개 × 성향 3종 모두 uniform 상한 안이고 모티프마다 장면이 다르다', () => {
    const sigs = new Set<string>();
    for (const m of sim.MOTIFS) {
      for (const t of Object.values(DREAM_TEMPERS)) {
        const sc = buildDreamScene({ card: card(m.id, t), strokes: day7Records(), aspect: '9:16' });
        expect(sc.pre.length).toBeLessThanOrEqual(DREAM_LIMITS.pre);
        expect(sc.post.length).toBeLessThanOrEqual(DREAM_LIMITS.post);
        expect(sc.segs.length).toBeLessThanOrEqual(DREAM_LIMITS.segs);
        expect(sc.segs.length).toBeGreaterThan(0);
      }
      const sc = buildDreamScene({ card: card(m.id), strokes: day7Records() });
      sigs.add(sc.pre.concat(sc.post).map((o) => o.k).join(','));
    }
    expect(sigs.size).toBeGreaterThanOrEqual(9);
  });
});
