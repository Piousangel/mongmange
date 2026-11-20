// 실제 Mongmangi 렌더(헤드리스 CanvasKit CPU) 회귀:
// ① 눈 소실 결함 — 회귀 가드는 MakeBlur sigma 검사 하나다(W 단위 블러 마스크의 장치 sigma ≥ 0.5px, GPU 문턱 약 0.33px 위).
//    결함은 GPU에서만 나고 이 테스트는 CPU 래스터라, 픽셀로는 결함을 재현하지 못한다(눈 밝기 검사는 참고용).
// ② 썸네일 LOD(D-24) — 플래그 꺼짐·몸 폭 48pt 초과·2x 이상(그리고 1x 120pt)에서 A7 이전 렌더와 픽셀 동일(golden).
//    저밀도(1x·1.5x)에서는 블러 하한이 48pt 초과에도 걸려 달라지는 것이 맞다(floorCases). 켜면 작은 크기만 달라진다
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('react-native-reanimated', async () => (await import('./mocks')).reanimatedMock());
vi.mock('@shopify/react-native-skia', async () => (await import('./mocks')).skiaMock());
vi.mock('react-native', async () => (await import('./mocks')).reactNativeMock());

type R = typeof import('./render');
type C = typeof import('./cases');
let R: R;
let C: C;
let core: typeof import('@mong/core');
let Skia: typeof import('@shopify/react-native-skia').Skia;
beforeAll(async () => {
  R = await import('./render');
  C = await import('./cases');
  core = await import('@mong/core');
  Skia = (await import('@shopify/react-native-skia')).Skia;
}, 120000);

/** A7 이전(HEAD de90b3d) Mongmangi로 같은 사례를 그린 픽셀 해시. 렌더를 일부러 바꾸면 이유를 적고 갱신한다 */
const GOLDEN: Record<string, string> = {
  'base-49@2': 'dc1e7748',
  'm1-49@2': '2a88cf07',
  'base-64@2': '8604c893',
  'm1-64@2': 'da9038ac',
  'base-96@3': '587a72d8',
  'm1-96@3': 'e34e91cc',
  'base-120@1': 'e67231b0',
  'm1-120@1': '3974ceee',
};

describe('눈 소실 결함(블러 마스크 장치 sigma 하한)', () => {
  it('몸 폭 22·36pt × 밀도 1·2·3: 몸 좌표(W) 블러 마스크가 모두 장치 0.5px 이상', async () => {
    const sigmas: number[] = [];
    const orig = Skia.MaskFilter.MakeBlur.bind(Skia.MaskFilter);
    const spy = vi.spyOn(Skia.MaskFilter, 'MakeBlur').mockImplementation((style, sigma, ctm) => {
      sigmas.push(sigma);
      return orig(style, sigma, ctm);
    });
    try {
      for (const wpx of [22, 36]) {
        for (const dpr of [1, 2, 3]) {
          sigmas.length = 0;
          await R.shootMong({ wpx, dpr, records: core.day7Records(2) });
          // 몸 그룹(scale = wpx) 안의 블러는 W 단위(< 0.1), 그 밖(고리·안내)은 pt 단위
          const inBody = sigmas.filter((s) => s < 0.1);
          expect(inBody.length).toBeGreaterThanOrEqual(2); // 눈 구멍 + 받침 띠
          for (const s of inBody) expect(s * wpx * dpr).toBeGreaterThanOrEqual(0.5 - 1e-9);
        }
      }
    } finally {
      spy.mockRestore();
    }
  }, 200000);

  // 참고용: CPU 래스터는 하한이 없어도 눈을 그리므로 결함 회귀를 잡지 못한다(리뷰 M-2). LOD·하한이 눈을 망가뜨리지 않는지만 본다
  it('참고용 — 작은 크기에서 눈 자리가 밝다(CPU 표본, 몸 22pt·2x, 결함 재현 아님)', async () => {
    const shot = await R.shootMong({ wpx: 22, dpr: 2, records: core.day7Records(2) });
    const s = core.coreScale(7);
    const ec = core.eyeCenters();
    const lum = (x: number, y: number) => {
      const i = (Math.round(y) * shot.width + Math.round(x)) * 4;
      return (shot.rgba[i]! + shot.rgba[i + 1]! + shot.rgba[i + 2]!) / 3;
    };
    for (const ex of [ec.lx, ec.rx]) expect(lum(shot.cx + ex * s * shot.w, shot.cy + ec.y * s * shot.w)).toBeGreaterThan(150);
    expect(lum(shot.cx, shot.cy + 0.3 * shot.w)).toBeLessThan(60); // 몸
  }, 200000);
});

describe('썸네일 LOD 픽셀 불변', () => {
  it('플래그 꺼짐 = A7 이전 렌더와 픽셀 동일(하한이 안 걸리는 사례: 48pt 초과 2x·3x, 1x는 120pt)', async () => {
    const got: Record<string, string> = {};
    for (const c of C.identityCases()) got[c.id] = R.hashRgba((await R.shootMong({ wpx: c.wpx, dpr: c.dpr, look: c.look, records: c.records })).rgba);
    expect(got).toEqual(GOLDEN);
  }, 300000);

  it('저밀도 블러 하한 = 의도된 변화: 64pt@1x는 A7 이전과 다르다(하한이 0.38px → 0.5px로 올림)', async () => {
    for (const c of C.floorCases()) {
      const h = R.hashRgba((await R.shootMong({ wpx: c.wpx, dpr: c.dpr, look: c.look, records: c.records })).rgba);
      expect(h, c.id).not.toBe(c.before);
    }
  }, 200000);

  it('플래그 켬 + 48pt 초과 = 꺼짐과 픽셀 동일', async () => {
    for (const c of C.identityCases().filter((x) => x.dpr !== 3)) {
      const on = await R.shootMong({ wpx: c.wpx, dpr: c.dpr, look: c.look, records: c.records, lod: true });
      expect(R.hashRgba(on.rgba), c.id).toBe(GOLDEN[c.id]);
    }
  }, 300000);

  it('플래그 켬 + 36·22pt = 달라진다(램프가 실제로 걸림)', async () => {
    const tr = { body: 1, comb: 0, ring: 1 } as const;
    const look = { traits: tr, shape: core.shapeOf(tr), ink: core.inkLook('songyeon') };
    for (const wpx of [36, 22]) {
      const recs = core.handRecords(9, 7, look.shape);
      const off = await R.shootMong({ wpx, dpr: 2, look, records: recs });
      const on = await R.shootMong({ wpx, dpr: 2, look, records: recs, lod: true });
      expect(R.hashRgba(on.rgba)).not.toBe(R.hashRgba(off.rgba));
    }
  }, 200000);
});
