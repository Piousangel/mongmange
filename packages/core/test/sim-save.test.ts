// 세이브: State 전체 직렬화(D-13 점열 정본은 기존 봉투 형식 그대로) + 마이그레이션 + 미래 버전 거부.
import { describe, expect, it } from 'vitest';
import { parseSave, quantizeRaw, sim } from '../src/index';
import { H, KST, handStroke, kst, play } from './sim-helpers';

function grown(): sim.State {
  let s = sim.createInitial(kst(11, 20, 19), KST, 77);
  for (let d = 0; d < 3; d++) {
    const base = kst(11, 20 + d, 19);
    s = play(s, [
      { type: 'grind', at: base + 60_000, durationMs: 9000 },
      { type: 'stroke', at: base + 120_000, raw: handStroke(d + 2) },
      { type: 'tap', at: base + 130_000, target: 'paper', holdMs: 50, x: 0.9, y: -0.4 },
      { type: 'appBackground', at: base + 600_000 },
      { type: 'appForeground', at: base + 13 * H, tzOffsetMin: KST },
    ]).state;
  }
  return s;
}

describe('sim 세이브', () => {
  it('왕복: serialize → parse 가 State 전체를 그대로 돌려주고, 이어서 돌려도 같다', () => {
    const s = grown();
    expect(s.backgroundSince).toBeNull(); // 앱이 앞에 있는 채로 저장
    const json = sim.serializeState(s, kst(11, 23, 9));
    const back = sim.parseState(json);
    // 콜드 스타트 규칙 하나만 다르고 나머지는 그대로
    expect(back).toEqual({ ...s, backgroundSince: kst(11, 23, 9) });
    const bg = play(s, [{ type: 'appBackground', at: kst(11, 23, 9) }]).state;
    expect(sim.parseState(sim.serializeState(bg, kst(11, 23, 9)))).toEqual(bg);
    const ev: sim.Event[] = [
      { type: 'stroke', at: kst(11, 23, 10), raw: handStroke(9) },
      { type: 'appBackground', at: kst(11, 23, 10, 5) },
    ];
    const a = play(s, ev);
    const b = play({ ...back, backgroundSince: null }, ev);
    expect(b.state).toEqual(a.state);
    expect(sim.tick(b.state, kst(11, 25, 9)).state).toEqual(sim.tick(a.state, kst(11, 25, 9)).state);
  });

  it('콜드 스타트(리뷰 1-2): 앱이 켜진 채 죽어도 저장 시각을 백그라운드로 보고 다음 날 아침이 온다', () => {
    const s = play(sim.createInitial(kst(11, 20, 9), KST, 4), [{ type: 'stroke', at: kst(11, 20, 19), raw: handStroke(1) }]).state;
    const loaded = sim.parseState(sim.serializeState(s, kst(11, 20, 19, 5)));
    expect(loaded.backgroundSince).toBe(kst(11, 20, 19, 5));
    const r = play(loaded, [{ type: 'appForeground', at: kst(11, 21, 8), tzOffsetMin: KST }]);
    expect(r.state.phase).toBe('awake');
    expect(r.state.dayIndex).toBe(1);
    expect(r.state.pendingCard).not.toBeNull();
  });

  it('손상 세이브 거부: 획 수 불일치, 필수 필드 없음, 블록·state 버전 불일치', () => {
    const json = JSON.parse(sim.serializeState(grown(), kst(11, 23, 9)));
    expect(() => sim.parseState(JSON.stringify({ ...json, sim: { ...json.sim, strokeMeta: json.sim.strokeMeta.slice(1) } }))).toThrow(/획 수/);
    const { lastWakeAt: _x, ...noWake } = json.sim.state;
    expect(() => sim.parseState(JSON.stringify({ ...json, sim: { ...json.sim, state: noWake } }))).toThrow(/lastWakeAt/);
    expect(() => sim.parseState(JSON.stringify({ ...json, sim: { ...json.sim, state: { ...json.sim.state, phase: 'dead' } } }))).toThrow(/phase/);
    expect(() => sim.parseState(JSON.stringify({ ...json, sim: { ...json.sim, state: { ...json.sim.state, temperament: { tempo: 0 } } } }))).toThrow(/temperament/);
    expect(() => sim.parseState(JSON.stringify({ ...json, sim: { ...json.sim, state: { ...json.sim.state, schemaVersion: sim.SIM_SCHEMA_VERSION + 1 } } }))).toThrow(/버전 불일치/);
  });

  it('기존 봉투와 통합: 새 세이브를 기존 parseSave로 읽으면 같은 정본 점열이 나온다', () => {
    const s = grown();
    const env = parseSave(sim.serializeState(s, kst(11, 23, 9)));
    expect(env.strokes).toHaveLength(s.strokes.length);
    env.strokes.forEach((rec, i) => expect(rec.raw).toEqual(s.strokes[i]!.raw));
  });

  it('마이그레이션: 스파이크 시절 봉투(schema v1, 획만) → State(획 보존, 첫 획 고정)', () => {
    const raw = quantizeRaw(handStroke(4));
    const legacy = JSON.stringify({
      schemaVersion: 1,
      strokes: [
        {
          raw: raw.map((p) => [p.x, p.y, p.t]),
          attach: { level: 2, attachVersion: 1, ax: 0.5, ay: 0.1, theta: 1.6, rot: 0.1, scale: 1, bend: 0 },
          drawnAtCoreScale: 1,
          meshVersion: 1,
        },
      ],
    });
    const st = sim.parseState(legacy, { now: kst(11, 20, 9), tzOffsetMin: KST, seed: 3 });
    expect(st.schemaVersion).toBe(sim.SIM_SCHEMA_VERSION);
    expect(st.strokesTotal).toBe(1);
    expect(st.strokes[0]!.raw).toEqual(raw);
    expect(st.strokes[0]!.pinned).toBe('first');
    expect(st.strokes[0]!.attach.taper).toBe(1); // 봉투 v1 → v2 체인(기존 migrate 재사용)
    // 다시 저장하면 현재 형식
    expect(sim.parseState(sim.serializeState(st, kst(11, 20, 9)))).toEqual({ ...st, backgroundSince: kst(11, 20, 9) });
  });

  it('획만 있는 봉투는 시각 정보 없이 읽지 않는다', () => {
    expect(() => sim.parseState(JSON.stringify({ schemaVersion: 2, strokes: [] }))).toThrow();
  });

  it('미래 버전 거부: sim 블록 버전, 봉투 버전 모두', () => {
    const json = JSON.parse(sim.serializeState(grown(), kst(11, 23, 9)));
    expect(() => sim.parseState(JSON.stringify({ ...json, sim: { ...json.sim, version: sim.SIM_SCHEMA_VERSION + 1 } }))).toThrow(/버전/);
    expect(() => sim.parseState(JSON.stringify({ ...json, schemaVersion: 99 }))).toThrow(/버전/);
  });
});
