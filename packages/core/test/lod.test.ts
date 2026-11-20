// 썸네일 LOD(D-24)·블러 하한(눈 소실 결함) 순수 함수
import { describe, expect, it } from 'vitest';
import {
  BASE_INK_LOOK,
  GRAMMARS,
  LOD_THUMB,
  MIN_BLUR_DEVICE_PX,
  blurFloorPt,
  bodyEdgePt,
  bodyLod,
  chromaHex,
  dreamCardLayout,
  buildDreamScene,
  coreScale,
  handRecords,
  inkLook,
  lodIdentity,
  lodInkLook,
  lodT,
  maskSigmaW,
  sim,
} from '../src/index';

const C = GRAMMARS.C;

describe('램프', () => {
  it('48 이상 = 0, 24 이하 = 1, 그 사이 선형', () => {
    expect(lodT(200)).toBe(0);
    expect(lodT(48)).toBe(0);
    expect(lodT(36)).toBeCloseTo(0.5, 10);
    expect(lodT(24)).toBe(1);
    expect(lodT(10)).toBe(1);
    expect(lodT(0)).toBe(0);
    expect(lodT(Number.NaN)).toBe(0);
  });
  it('플래그 꺼짐 또는 48 초과 = 정본 그대로(같은 문법 객체, 배율 1)', () => {
    for (const px of [22, 36, 48]) expect(bodyLod(px, C, false)).toEqual(lodIdentity(C));
    for (const px of [48.0001, 64, 120]) {
      const l = bodyLod(px, C, true);
      expect(l).toEqual(lodIdentity(C));
      expect(l.grammar).toBe(C);
    }
    const sy = inkLook('songyeon');
    expect(lodInkLook(sy, lodIdentity(C))).toBe(sy);
    expect(bodyEdgePt(0.8, 0.6, 64, lodIdentity(C), 2)).toEqual({ blurPt: 0.8, closePt: 0.6 });
  });
  it('24px 이하 = 썸네일 값 전부(틈 0.10W, 폭 0.17W, 눈·빗 ×1.3, 비백·결 끔)', () => {
    const l = bodyLod(22, C, true);
    expect(l.t).toBe(1);
    expect(l.grammar.gap).toBeCloseTo(LOD_THUMB.gap, 10);
    expect(l.grammar.baseWidth).toBeCloseTo(LOD_THUMB.baseWidth, 10);
    expect(l.grammar.dry).toBe(0);
    expect(l.eyeScale).toBeCloseTo(1.3, 10);
    expect(l.combScale).toBeCloseTo(1.3, 10);
    expect(l.grain).toBe(0);
    // 원본 문법은 바꾸지 않는다
    expect(C.gap).toBe(0.05);
  });
  it('36px = 중간값', () => {
    const l = bodyLod(36, C, true);
    expect(l.grammar.gap).toBeCloseTo(0.075, 10);
    expect(l.grammar.baseWidth).toBeCloseTo(0.1475, 10);
    expect(l.inkChroma).toBeCloseTo(1.6, 10);
  });
});

describe('썸네일 먹(아트 4-1 v1.4 stroke-ink-thumb)', () => {
  it('채도 2.2배 = 문서 hex 네 값', () => {
    expect(sim.INK_IDS.map((id) => chromaHex(inkLook(id).strokeDay, 2.2))).toEqual(['#3A5D85', '#7D5A32', '#754766', '#46704D']);
  });
  it('기본 먹(회색)은 채도를 키워도 회색, 고리 불투명도는 1을 넘지 않는다', () => {
    const l = bodyLod(22, C, true);
    const base = lodInkLook(BASE_INK_LOOK, l);
    expect(base.ringOpacity).toBeCloseTo(0.25 * 1.3, 10);
    expect(lodInkLook(inkLook('yuyeon'), l).ringOpacity).toBe(1);
    expect(base.dayBody).toBe(BASE_INK_LOOK.dayBody);
  });
});

describe('가장자리 효과 W 단위(아트 12절 v1.4)', () => {
  it('22px: 블러는 장치 0.5px 하한, 닫힘은 틈의 1/3 이하', () => {
    const l = bodyLod(22, C, true);
    const e = bodyEdgePt(0.8, 0.6, 22, l, 2);
    expect(e.blurPt).toBeCloseTo(0.25, 10); // 0.004W × 22 = 0.088pt < 하한 0.5px/2
    expect(e.closePt).toBeLessThanOrEqual((l.grammar.gap * 22) / 3 + 1e-9);
  });
  it('블러 하한: 장치 px 0.5 아래로 내려가지 않는다', () => {
    for (const dpr of [1, 2, 3]) for (const pt of [0.01, 0.1, 0.3, 0.8]) expect(blurFloorPt(pt, dpr) * dpr).toBeGreaterThanOrEqual(MIN_BLUR_DEVICE_PX - 1e-12);
  });
});

describe('마스크 블러 하한(눈 소실 결함 회귀)', () => {
  it('눈 구멍 블러 0.006W: 고정 수치 표(손 계산 = 0.5px ÷ (몸 폭 pt × 밀도), 0.006보다 작으면 0.006)', () => {
    // [몸 폭 pt, 밀도, 기대 sigma(W)] — 하한이 걸리는 구간: 1x < 83.3pt, 1.5x < 55.6pt, 2x < 41.7pt, 3x < 27.8pt
    const table: [number, number, number][] = [
      [22, 2, 0.0113636364], // 0.264px → 0.5px(A7 결함 사례)
      [36, 2, 0.0069444444],
      [48, 2, 0.006],
      [22, 3, 0.0075757576],
      [30, 3, 0.006],
      [49, 1.5, 0.0068027211],
      [64, 1, 0.0078125], // 48pt 초과지만 1x라 하한이 걸린다(의도, 아트 1-5 v1.4)
      [100, 1, 0.006],
    ];
    for (const [wpx, dpr, want] of table) expect(maskSigmaW(0.006, wpx, dpr), `${wpx}@${dpr}`).toBeCloseTo(want, 9);
    expect(MIN_BLUR_DEVICE_PX).toBe(0.5);
  });
  it('하한에 걸리지 않으면 입력 그대로(큰 화면 픽셀 불변): dpr ≥ 2에서 몸 폭 48pt 초과', () => {
    for (const dpr of [2, 3]) for (const wpx of [48.5, 64, 96, 160]) expect(maskSigmaW(0.006, wpx, dpr)).toBe(0.006);
  });
});

describe('공유 카드 구도(D-24·아트 v1.4 9): 몸 폭 ≥ 카드 폭 10%', () => {
  const card = (night: number, motifId: string): sim.DreamCard => ({ night, motifId, composition: 0, inkTone: 0.5, flow: 0, flowSeed: 12345, strokeRef: null, nightsMerged: 1 });
  it('4:5·9:16 × 모티프 × 첫날~열흘(획 0~9): 몸 폭(1W × 핵 크기)이 카드 폭의 10% 이상 → 360px 미리보기에서 36px 이상', () => {
    let checked = 0;
    for (const aspect of ['4:5', '9:16'] as const) {
      for (const motif of ['center.moon', 'near-alone.quilt', 'center.rain']) {
        for (let n = 0; n <= 9; n++) {
          const scene = buildDreamScene({ card: card(Math.max(1, n), motif), strokes: handRecords(3, n), aspect });
          const frac = scene.body.w * scene.body.s;
          expect(frac).toBeGreaterThanOrEqual(0.1);
          expect(frac * 360).toBeGreaterThanOrEqual(36);
          expect(scene.body.s).toBeCloseTo(coreScale(n), 6);
          checked++;
        }
      }
    }
    expect(checked).toBe(60);
    expect(dreamCardLayout('4:5').height).toBeGreaterThan(1);
  });
});

describe('사람마다 다른 손', () => {
  it('결정적이고, 시드가 다르면 획이 다르다', () => {
    const a = handRecords(5, 7);
    expect(handRecords(5, 7)).toEqual(a);
    expect(a).toHaveLength(7);
    expect(handRecords(6, 7)).not.toEqual(a);
  });
});
