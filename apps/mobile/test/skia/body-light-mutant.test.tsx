// V12a 정반사 음성 대조(리뷰 H1 ③): **실제 셰이더 소스에 정반사 항을 넣은 변이**로 Mongmangi를 그려, 렌더 지표(램버트 모형 잔차)가
// 잡는지 고정한다. 합성 하이라이트 방울(옛 withFakeGloss)은 넓은 Phong 로브를 대표하지 못해 뺐다.
// 변이 A = 리뷰 V1c(lift·0.3·pow(d, 40), 낮·밤 공통) — 범위 상한(0.08)에는 여유 0.002로만 걸리던 것
// 변이 B = 밤 전용 정반사(lift > 0.08일 때만, 세기 1에서 밤만 해당) — 범위 지표에는 전혀 안 걸리던 꼴
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('react-native-reanimated', async () => (await import('./mocks')).reanimatedMock());
vi.mock('@shopify/react-native-skia', async () => (await import('./mocks')).skiaMock());
vi.mock('react-native', async () => (await import('./mocks')).reactNativeMock());

const MUT: Record<string, string> = {
  A: ' + lift * 0.3 * pow(max(d, 0.0), 40.0)',
  B: ' + step(0.08, lift) * lift * 0.3 * pow(max(d, 0.0), 40.0)',
};
const g = globalThis as { __v12aMut?: string };
vi.mock('../../src/render/bodyLightSrc', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/render/bodyLightSrc')>();
  const line = 'float a = lift * up * up * (3.0 - 2.0 * up);';
  if (!orig.BODY_LIGHT_SKSL.includes(line)) throw new Error('변이 자리(밝힘 a 줄)가 바뀌었다 — 이 시험의 변이를 새 소스에 맞출 것');
  return {
    ...orig,
    get BODY_LIGHT_SKSL() {
      const m = g.__v12aMut ? MUT[g.__v12aMut]! : '';
      return orig.BODY_LIGHT_SKSL.replace(line, line.replace(';', `${m};`));
    },
  };
});

/** 원본 셰이더 렌더 잔차 상한(body-light.test.tsx와 같은 값) */
const MAX_RESIDUAL = 0.003;
const MAX_HOT_BIAS = 0.001;

async function residual(mut: string, night: number) {
  g.__v12aMut = mut;
  vi.resetModules();
  const LC = await import('./light-case');
  const r = (await LC.residualOf({ body: 1, seed: 3, night, level: 1, wpx: 96 })).res;
  if (process.env.LIGHT_LOG) console.log(`[v12a mutant] ${mut || '-'} night=${night} max=${r.maxAbs.toFixed(4)} hot=${r.hotBias.toFixed(4)} beta=${r.beta.toFixed(3)}`);
  return r;
}

beforeAll(async () => {
  await import('./mocks');
}, 120000);

describe('정반사 변이 — 램버트 잔차가 잡는다', () => {
  it('변이 A(리뷰 V1c, 낮): 잔차 최대·정면 쪽 치우침이 문턱을 넘는다', async () => {
    const r = await residual('A', 0);
    expect(r.maxAbs).toBeGreaterThan(MAX_RESIDUAL * 2);
    expect(r.hotBias).toBeGreaterThan(MAX_HOT_BIAS * 2);
  }, 600000);

  it('변이 B(밤 전용 정반사): 낮은 원본처럼 통과하지만 밤은 문턱을 넘는다', async () => {
    const day = await residual('B', 0);
    expect(day.maxAbs).toBeLessThanOrEqual(MAX_RESIDUAL);
    expect(day.hotBias).toBeLessThanOrEqual(MAX_HOT_BIAS);
    const night = await residual('B', 1);
    expect(night.maxAbs).toBeGreaterThan(MAX_RESIDUAL);
    expect(night.hotBias).toBeGreaterThan(MAX_HOT_BIAS * 2);
  }, 600000);

  it('대조: 변이 없음(같은 경로) = 문턱 안', async () => {
    for (const night of [0, 1]) {
      const r = await residual('', night);
      expect(r.maxAbs).toBeLessThanOrEqual(MAX_RESIDUAL);
      expect(Math.abs(r.hotBias)).toBeLessThanOrEqual(MAX_HOT_BIAS);
    }
  }, 600000);
});
