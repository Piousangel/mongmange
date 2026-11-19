// D-08 / 리뷰 C10-③: 스크린리더용 대체 획 입력(자리·방향·길이·휨 고르기)
import { describe, expect, it } from 'vitest';
import { ASSIST, ASSIST_DEFAULT, CURRENT_MESH_VERSION, STROKE, assistStroke, attachStroke, clampChoice, coreScale, maxProtrusion, polylineLength, protrusionCap, quantizeRaw, sim, strokeSpine, type AssistChoice } from '../src/index';
import { KST, kst } from './sim-helpers';

function all(): AssistChoice[] {
  const out: AssistChoice[] = [];
  for (let place = 0; place < ASSIST.places; place++)
    for (let dir = 0; dir < ASSIST.dirs; dir++)
      for (const len of [0, 1, 2] as const) for (const bend of [-2, -1, 0, 1, 2] as const) out.push({ place, dir, len, bend });
  return out;
}

describe('대체 획 입력', () => {
  it('모든 고름(8 × 8 × 3 × 5 = 960)이 정본 제한 안: 점 ≤ 512, 6초 이하, 시간 단조 증가, sim 최소 길이 이상, 부착 값 유한', () => {
    const s = coreScale(3);
    const combos = all();
    expect(combos).toHaveLength(960);
    for (const c of combos) {
      const raw = assistStroke(c, s);
      expect(raw.length).toBeLessThanOrEqual(STROKE.maxPoints);
      expect(raw.at(-1)!.t).toBeLessThanOrEqual(STROKE.maxMs);
      for (let i = 1; i < raw.length; i++) expect(raw[i]!.t).toBeGreaterThanOrEqual(raw[i - 1]!.t);
      expect(polylineLength(raw)).toBeGreaterThan(sim.LEDGER.minStrokeLenW * 4);
      const a = attachStroke(raw, s, 2, 3);
      expect(Number.isFinite(a.theta) && Number.isFinite(a.rot) && Number.isFinite(a.scale)).toBe(true);
    }
  }, 60_000);

  // v1.2 리뷰 3번: 부착 결과의 질 회귀 방지. 바닥 쪽 처짐(핵 바닥 +0.3W 아래, 핵 0에서 33건·6에서 14건)은 고치지 않고 아트 판정 대기
  it('부착 결과: 받침(base) 라벨 ≤ 25%, 돌출 ≤ L2 상한(7획 이하 0.33W)', () => {
    for (const n of [0, 6]) {
      const s = coreScale(n);
      let base = 0;
      let worst = 0;
      const combos = all();
      for (const c of combos) {
        const raw = quantizeRaw(assistStroke(c, s));
        const rec = { raw, attach: attachStroke(raw, s, 2, n), drawnAtCoreScale: s, meshVersion: CURRENT_MESH_VERSION };
        const sp = strokeSpine(rec, s);
        if (sp.label === 'base') base++;
        worst = Math.max(worst, maxProtrusion(sp.pts, s));
      }
      expect(base / combos.length).toBeLessThanOrEqual(0.25);
      expect(worst).toBeLessThanOrEqual(protrusionCap(n + 1) + 1e-3);
    }
  }, 120_000);

  it('결정적이고, 방향·길이·휨이 모양을 바꾼다(손이 모양 — D-02)', () => {
    const s = coreScale(0);
    const key = (c: AssistChoice) => JSON.stringify(assistStroke(c, s));
    expect(key(ASSIST_DEFAULT)).toBe(key({ ...ASSIST_DEFAULT }));
    const keys = new Set(all().map(key));
    expect(keys.size).toBe(960);
    const len = (c: AssistChoice) => polylineLength(assistStroke(c, s));
    expect(len({ ...ASSIST_DEFAULT, len: 0 })).toBeLessThan(len({ ...ASSIST_DEFAULT, len: 2 }));
    expect(len({ ...ASSIST_DEFAULT, bend: 2 })).toBeGreaterThan(len({ ...ASSIST_DEFAULT, bend: 0 }));
  });

  it('범위 밖 값은 감아 돌거나 묶는다', () => {
    expect(clampChoice({ place: -1, dir: 9, len: 5 as never, bend: -7 as never })).toEqual({ place: 7, dir: 1, len: 2, bend: -2 });
  });

  it('sim에는 손획과 같은 stroke 이벤트로 들어가 받아들여진다', () => {
    const s0 = sim.createInitial(kst(11, 20, 9), KST, 1);
    const r = sim.reduce(s0, { type: 'stroke', at: kst(11, 20, 9, 1), raw: assistStroke(ASSIST_DEFAULT, coreScale(0)), level: 2 });
    expect(r.effects.some((e) => e.type === 'strokeAccepted')).toBe(true);
    expect(r.state.strokes).toHaveLength(1);
  });
});
