// OPERATING 8-1 그럴듯한 오답 검사의 **회귀 가드**(리뷰 I-2로 지위를 낮춤): 시드·손·타고남·먹이 다른 N마리를 몸 폭 36·22pt(2x)로
// 그리고, 같은 몽망이를 크기만 10% 줄여 다시 그린 것을 질의로 둔다. 단언 = 현행·LOD 모두 ① 질의의 최근접이 늘 자기 자신(정답률 100%)
// ② 크기만 다른 같은 몽망이가 다른 쌍 거리 하위 10%보다 가깝다. **이 테스트는 구별 개선을 증명하지 않는다** — LOD는 대비를 키워
// 다른 개체 사이 거리와 같은 개체의 크기 차 거리를 함께 늘린다(정규화 여유 비는 오히려 줄었다). 구별 판정은 12-05 블라인드에 맡긴다.
// V12a: 64pt에서 몸 빛(세기 상한)을 켠 현행이 구별 지표를 나쁘게 하지 않는지도 본다. 무거워서(약 3~6분) RENDER_HEAVY=1일 때만 돈다. A7_REPORT=<경로>면 숫자를 JSON으로 남긴다(docs/app/a7/metric.json).
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('react-native-reanimated', async () => (await import('./mocks')).reanimatedMock());
vi.mock('@shopify/react-native-skia', async () => (await import('./mocks')).skiaMock());
vi.mock('react-native', async () => (await import('./mocks')).reactNativeMock());

let R: typeof import('./render');
let M: typeof import('./metric');
let core: typeof import('@mong/core');
beforeAll(async () => {
  R = await import('./render');
  M = await import('./metric');
  core = await import('@mong/core');
}, 120000);

const N = 16;
const DPR = 2;
const SHRINK = 0.9;

type Scenario = 'mixed' | 'handOnly';
/** mixed = 타고남·먹·손 모두 다름(실제 분포에 가까움), handOnly = 타고남·먹 같고 손만 다름(가장 어려운 대조 조건) */
function individual(i: number, sc: Scenario) {
  const tr = sc === 'mixed' ? ({ body: i % 3, comb: (i * 7) % 4, ring: 1 } as const) : ({ body: 1, comb: 0, ring: 1 } as const);
  const shape = core.shapeOf(tr as never);
  const ink = sc === 'mixed' ? core.sim.INK_IDS[(i * 3 + Math.floor(i / 4)) % 4]! : 'songyeon';
  return { look: { traits: tr as never, shape, ink: core.inkLook(ink) }, records: core.handRecords(i + 1, 7, shape) };
}

async function measure(sc: Scenario, size: number, lod: boolean, light = 0) {
  const n = Math.round(2.6 * size); // 칸 ≈ 1pt
  const gallery = [];
  const query = [];
  for (let i = 0; i < N; i++) {
    const ind = individual(i, sc);
    gallery.push(M.gridOf(await R.shootMong({ ...ind, wpx: size, dpr: DPR, lod, light }), n));
    query.push(M.gridOf(await R.shootMong({ ...ind, wpx: size * SHRINK, dpr: DPR, lod, light }), n));
  }
  const pack = (s: ReturnType<typeof M.separation>) => ({ accuracy: s.accuracy, marginMedian: s.marginMedian, same: M.summary(s.same), nearestOther: M.summary(s.nearestOther), pairs: M.summary(s.pairs) });
  // 주 지표 = 지각 거리(JND 0.02 문턱), 참고 = 문턱 없는 평균 ΔE_OK
  return { ...pack(M.separation(gallery, query)), raw: pack(M.separation(gallery, query, 0)) };
}

const results: Record<string, Awaited<ReturnType<typeof measure>>> = {};

describe.skipIf(!process.env.RENDER_HEAVY)('썸네일 구별 회귀 가드(다른 손 16마리, 2x)', () => {
  for (const sc of ['mixed', 'handOnly'] as const) {
    for (const size of [36, 22]) {
      it(`${sc} ${size}pt: 현행·LOD 모두 정답률 100%, 크기만 다른 같은 몽망이는 가깝다`, async () => {
        const cur = await measure(sc, size, false);
        const lod = await measure(sc, size, true);
        results[`${sc}-${size}-current`] = cur;
        results[`${sc}-${size}-lod`] = lod;
        for (const r of [cur, lod]) {
          expect(r.accuracy).toBe(1);
          expect(r.same.median).toBeLessThan(r.pairs.p10);
        }
        // 정규화 여유 비(최근접 다른 / 크기만 다른 같은)는 기록만 한다(metric.json marginMedian) — 단언하지 않는다
      }, 600000);
    }
  }
  // V12a 몸 빛: 48pt 이하는 빛이 꺼져 같은 픽셀(body-light ②가 해시로 고정) — 여기서는 빛이 켜지는 64pt에서 구별 지표가 나빠지지 않는지 본다(리뷰 L3)
  it('mixed 64pt: 몸 빛(세기 상한)을 켜도 정답률 100%·여유 비 유지', async () => {
    const cur = await measure('mixed', 64, false);
    const lit = await measure('mixed', 64, false, 1);
    results['mixed-64-current'] = cur;
    results['mixed-64-light'] = lit;
    expect(lit.accuracy).toBe(1);
    expect(lit.accuracy).toBeGreaterThanOrEqual(cur.accuracy);
    expect(lit.same.median).toBeLessThan(lit.pairs.p10);
    expect(lit.marginMedian).toBeGreaterThanOrEqual(cur.marginMedian * 0.95);
  }, 900000);

  it('기록', async () => {
    const out = process.env.A7_REPORT;
    if (out)
      (await import('node:fs')).writeFileSync(
        out,
        JSON.stringify({ n: N, dpr: DPR, shrink: SHRINK, gridCellPt: 1 / 2.6, note: '회귀 가드. 구별 개선 증명 아님 — 판정은 블라인드(12-05)', results }, null, 1),
      );
    expect(Object.keys(results)).toHaveLength(10);
  });
});
