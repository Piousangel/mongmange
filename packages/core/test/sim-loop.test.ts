// 하루 루프(systems-v1 1절)·성장(4.1)·꿈 카드(5절)·아침 문장(2.6).
import { describe, expect, it } from 'vitest';
import { sim } from '../src/index';
import { H, KST, handStroke, kst, play } from './sim-helpers';

/** n일 동안 매일: 먹 갈기 → 한 획 → 탭 → 저녁에 닫기 → 다음 날 아침 열고 현상 */
function playDays(n: number, seed = 11) {
  let s = sim.createInitial(kst(11, 20, 19), KST, seed);
  const all: sim.Effect[] = [];
  for (let d = 0; d < n; d++) {
    const base = kst(11, 20 + d, 19);
    const r = play(s, [
      { type: 'grind', at: base + 60_000, durationMs: 4000 + d * 2000 },
      { type: 'stroke', at: base + 120_000, raw: handStroke(d + 1, 700 + d * 150) },
      { type: 'tap', at: base + 180_000, target: 'body', holdMs: 1500, x: 0.1, y: 0, moveSpeed: 0.05 },
      { type: 'tap', at: base + 190_000, target: 'paper', holdMs: 80, x: 1.2 * Math.cos(d), y: 0.8 * Math.sin(d) },
      { type: 'appBackground', at: base + 600_000 },
      { type: 'appForeground', at: base + 13 * H, tzOffsetMin: KST }, // 다음 날 08:00
      { type: 'developCard', at: base + 13 * H + 60_000 },
    ]);
    s = r.state;
    all.push(...r.effects);
  }
  return { state: s, effects: all };
}

describe('긋기(붓)', () => {
  it('하루 한 획: 두 번째 획은 used로 거절, 자는 중엔 asleep, 너무 짧으면 tooShort', () => {
    const s0 = sim.createInitial(kst(11, 20, 9), KST, 1);
    const r = play(s0, [
      { type: 'stroke', at: kst(11, 20, 9, 1), raw: [{ x: 0.6, y: 0, t: 0 }, { x: 0.6001, y: 0, t: 10 }] },
      { type: 'stroke', at: kst(11, 20, 9, 2), raw: handStroke(1) },
      { type: 'stroke', at: kst(11, 20, 9, 3), raw: handStroke(2) },
    ]);
    const kinds = r.effects.filter((e) => e.type === 'strokeAccepted' || e.type === 'strokeRejected');
    expect(kinds.map((e) => (e.type === 'strokeRejected' ? e.reason : 'ok'))).toEqual(['tooShort', 'ok', 'used']);
    expect(r.state.strokes).toHaveLength(1);
    expect(r.state.strokes[0]!.pinned).toBe('first');
    expect(r.state.strokes[0]!.raw.length).toBeLessThanOrEqual(512);
    const asleep = play(r.state, [{ type: 'putToSleep', at: kst(11, 20, 22) }]).state;
    const rej = sim.reduce(asleep, { type: 'stroke', at: kst(11, 20, 22, 5), raw: handStroke(3) });
    expect(rej.effects).toContainEqual({ type: 'strokeRejected', reason: 'asleep' });
  });

  it('물로 씻기: 5초 안 1회만, 그날 획을 다시 긋는다', () => {
    const s0 = sim.createInitial(kst(11, 20, 9), KST, 1);
    const t = kst(11, 20, 9, 1);
    const r = play(s0, [
      { type: 'stroke', at: t, raw: handStroke(1) },
      { type: 'washStroke', at: t + 4000 },
    ]);
    expect(r.state.strokes).toHaveLength(0);
    expect(r.state.strokesTotal).toBe(0);
    const again = play(r.state, [
      { type: 'stroke', at: t + 10_000, raw: handStroke(2) },
      { type: 'washStroke', at: t + 12_000 }, // 두 번째 씻기는 안 됨
    ]);
    expect(again.state.strokes).toHaveLength(1);
    const late = play(sim.createInitial(kst(11, 20, 9), KST, 1), [
      { type: 'stroke', at: t, raw: handStroke(1) },
      { type: 'washStroke', at: t + 6000 },
    ]);
    expect(late.state.strokes).toHaveLength(1);
  });

  it('씻었다가 다시 그어도 stageReached(firstStroke)는 한 번만', () => {
    const t = kst(11, 20, 9, 1);
    const r = play(sim.createInitial(kst(11, 20, 9), KST, 1), [
      { type: 'stroke', at: t, raw: handStroke(1) },
      { type: 'washStroke', at: t + 3000 },
      { type: 'stroke', at: t + 9000, raw: handStroke(2) },
    ]);
    expect(r.effects.filter((e) => e.type === 'stageReached')).toEqual([{ type: 'stageReached', stage: 'firstStroke' }]);
    expect(r.state.peakStrokes).toBe(1);
  });

  it('획의 칠은 그을 때 성향으로 고정된다', () => {
    const r = playDays(3);
    const styles = r.state.strokes.map((s) => s.style);
    expect(styles[0]).toEqual(sim.styleFor({ tempo: 0, boldness: 0, closeness: 0, curiosity: 0 }));
    expect(styles[2]).not.toEqual(styles[0]);
  });
});

describe('성장(획 수 기준)·이레', () => {
  it('0획 방울 → 1획 첫 두름 → 2~6 새끼 → 7획 이레', () => {
    expect([0, 1, 2, 6, 7, 30].map(sim.stageOf)).toEqual(['drop', 'firstStroke', 'young', 'young', 'ire7', 'ire7']);
    const r = playDays(7);
    const stages = r.effects.filter((e) => e.type === 'stageReached').map((e) => (e as { stage: string }).stage);
    expect(stages).toEqual(['firstStroke', 'young', 'ire7']);
    expect(r.state.strokesTotal).toBe(7);
  });

  it('7일: 꿈 카드 7장이 모두 다른 장면(모티프 + 구도), 이레 아침 문장은 seven-day', () => {
    const r = playDays(7);
    expect(r.state.cards).toHaveLength(7);
    const scenes = r.state.cards.map((c) => `${c.motifId}/${c.composition}`);
    expect(new Set(scenes).size).toBe(7);
    for (const c of r.state.cards) {
      expect(sim.MOTIFS.some((m) => m.id === c.motifId)).toBe(true);
      expect(c.nightsMerged).toBe(1);
      expect(c.strokeRef).not.toBeNull();
    }
    const lines = r.effects.filter((e) => e.type === 'cardDeveloped').map((e) => (e as { line: sim.MorningLine }).line);
    expect(lines).toHaveLength(7);
    expect(lines[6]!.kind).toBe('seven-day');
    expect(lines.slice(0, 6).every((l) => l.kind !== 'seven-day')).toBe(true);
  });

  it('아침 문장 = 원인 1 + 결과 1 키, 숫자·축 이름 없이 키만', () => {
    const r = playDays(5);
    const lines = r.effects.filter((e) => e.type === 'cardDeveloped').map((e) => (e as { line: sim.MorningLine }).line);
    for (const l of lines) {
      if (l.kind === 'change' || l.kind === 'deepen') {
        expect(l.keys).toHaveLength(2);
        expect(l.keys[0]).toMatch(/^cause\./);
        expect(l.keys[1]).toMatch(/^(effect|deepen)\./);
      }
    }
    // 같은 축의 결과 채널은 5일 안에 겹치지 않는다
    const effects = lines.filter((l) => l.kind === 'change').map((l) => l.keys[1]!.split('.').slice(1).join('.'));
    const byAxis = new Map<string, string[]>();
    for (const e of effects) {
      const [axis, , ch] = e.split('.');
      byAxis.set(axis!, [...(byAxis.get(axis!) ?? []), ch!]);
    }
    for (const chs of byAxis.values()) expect(new Set(chs).size).toBe(chs.length);
  });

  it('시드가 다르면 카드가 달라진다(난수는 상태 안 시드에서만 나온다)', () => {
    expect(playDays(4, 99).state.cards).not.toEqual(playDays(4, 100).state.cards);
  });

  it('첫 밤 무입력 → 결이 정해지지 않고 아침 문장은 관찰', () => {
    const r = play(sim.createInitial(kst(11, 20, 19), KST, 1), [
      { type: 'appBackground', at: kst(11, 20, 19, 5) },
      { type: 'appForeground', at: kst(11, 21, 8), tzOffsetMin: KST },
      { type: 'developCard', at: kst(11, 21, 8, 1) },
    ]);
    expect(r.state.born).toBe(false);
    const dev = r.effects.find((e) => e.type === 'cardDeveloped') as { line: sim.MorningLine };
    expect(dev.line.kind).toBe('observation');
    expect(dev.line.keys[0]).toMatch(/^obs\.dream\./);
  });

  it('가운데 구역(무입력·약한 입력) 유저 100명씩: 7밤 카드 장면 반복 0(리뷰 1-4)', () => {
    for (const weak of [false, true]) {
      for (let seed = 0; seed < 100; seed++) {
        let s = sim.createInitial(kst(11, 20, 19), KST, seed);
        for (let d = 0; d < 7; d++) {
          const base = kst(11, 20 + d, 19);
          const ev: sim.Event[] = weak ? [{ type: 'tap', at: base + 60_000, target: 'paper', holdMs: 60, x: 0.2, y: 0.1 }] : [];
          s = play(s, [
            ...ev,
            { type: 'appBackground', at: base + 600_000 },
            { type: 'appForeground', at: base + 13 * H, tzOffsetMin: KST },
            { type: 'developCard', at: base + 13 * H + 60_000 },
          ]).state;
        }
        const scenes = s.cards.map((c) => `${c.motifId}/${c.composition}`);
        expect(scenes).toHaveLength(7);
        expect(new Set(scenes).size).toBe(7);
      }
    }
  });
});
