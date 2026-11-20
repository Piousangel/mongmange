// C7 이레 영상 프레임 그림(IreFrameArt)을 헤드리스 CanvasKit(CPU)으로 실제로 그려 본다.
// ① 웹 루프 이음: 첫 프레임 = 빈 한지, 끝 프레임 ≈ 빈 한지(서버 루프는 무한 반복) ② 획이 붙을수록 먹 픽셀이 늘어난다
// ③ 같은 프레임 = 같은 픽셀(결정성) ④ 규격 크기. 기본은 270px 폭으로 빠르게. RENDER_HEAVY=1 또는 IRE_DUMP=<폴더>면 1080×1920을
// 그려 PNG를 남기고 프레임당 CPU 렌더 시간을 찍는다(참고값 — 기기 GPU 시간이 아니다).
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('react-native-reanimated', async () => (await import('./mocks')).reanimatedMock());
vi.mock('@shopify/react-native-skia', async () => (await import('./mocks')).skiaMock());
vi.mock('react-native', async () => (await import('./mocks')).reactNativeMock());

type Core = typeof import('@mong/core');
let core: Core;
let Art: typeof import('../../src/render/ireVideo/IreFrameArt');
let Sk: typeof import('@shopify/react-native-skia');
beforeAll(async () => {
  core = await import('@mong/core');
  Art = await import('../../src/render/ireVideo/IreFrameArt');
  Sk = await import('@shopify/react-native-skia');
}, 120000);

const headless = () =>
  Sk as unknown as {
    makeOffscreenSurface(w: number, h: number): import('@shopify/react-native-skia').SkSurface;
    drawOffscreen(surface: import('@shopify/react-native-skia').SkSurface, el: React.ReactElement): Promise<import('@shopify/react-native-skia').SkImage>;
  };

function source(n: number): import('@mong/core').IreShareSource {
  return {
    slots: Array.from({ length: n }, (_, k) => ({ index: k, strokeIndex: k, strokeId: `s${k}`, day: k, cardIndex: null, longSleep: false, moon: false })),
    ink: null,
    label: null,
  };
}

async function shoot(kind: 'share' | 'webLoop', i: number, width: number, n = 7) {
  const { makeOffscreenSurface, drawOffscreen } = headless();
  const records = core.day7Records(2).slice(0, n);
  const input = { kind, width, records, cardImages: [] };
  const { width: w, height: h } = Art.ireSize(kind, width);
  const frame = core.ireFrameAt(source(n), kind, i);
  const { createElement } = await import('react');
  const surf = makeOffscreenSurface(w, h);
  const t0 = performance.now();
  const img = await drawOffscreen(surf, createElement(Art.IreFrameArt, { frame, input }));
  const ms = performance.now() - t0;
  const rgba = img.readPixels(0, 0, { width: w, height: h, colorType: 4, alphaType: 3 }) as Uint8Array;
  return { w, h, rgba, ms, png: () => img.encodeToBytes() };
}

/** 한지 색에서 눈에 띄게(채널 합 30 넘게) 벗어난 픽셀 수 */
function inked(rgba: Uint8Array): number {
  const [r, g, b] = core.hexRgb(core.PALETTE.day.bg);
  let n = 0;
  for (let p = 0; p < rgba.length; p += 4) if (Math.abs(rgba[p]! - r) + Math.abs(rgba[p + 1]! - g) + Math.abs(rgba[p + 2]! - b) > 30) n++;
  return n;
}

const DUMP = process.env.IRE_DUMP;

describe('이레 영상 프레임 그림(헤드리스)', () => {
  it('규격 크기: 공유 1080×1920, 웹 루프 540×675', () => {
    expect(Art.ireSize('share')).toEqual({ width: 1080, height: 1920 });
    expect(Art.ireSize('webLoop')).toEqual({ width: 540, height: 675 });
    expect(Art.ireSize('share', 270)).toEqual({ width: 270, height: 480 });
  });

  it('웹 루프 이음: 첫 프레임은 빈 한지, 끝 프레임도 거의 빈 한지, 포스터 프레임은 먹이 있다', async () => {
    const first = await shoot('webLoop', 0, 270);
    expect(inked(first.rgba)).toBe(0);
    const last = await shoot('webLoop', core.IRE_OUTPUTS.webLoop.frames - 1, 270);
    const poster = await shoot('webLoop', core.irePosterFrame('webLoop'), 270);
    expect(inked(poster.rgba)).toBeGreaterThan(500);
    expect(inked(last.rgba)).toBeLessThan(inked(poster.rgba) * 0.05);
  }, 120000);

  it('획이 붙을수록 먹 픽셀이 늘고, 같은 프레임은 같은 픽셀', async () => {
    const counts: number[] = [];
    for (const i of [18, 36, 78, 120, 165]) counts.push(inked((await shoot('share', i, 270)).rgba));
    for (let k = 1; k < counts.length; k++) expect(counts[k]!).toBeGreaterThan(counts[k - 1]!);
    const a = await shoot('share', 120, 270);
    const b = await shoot('share', 120, 270);
    expect(Buffer.from(a.rgba).equals(Buffer.from(b.rgba))).toBe(true);
  }, 120000);

  // 1080×1920 CPU 래스터는 프레임당 수 초라 무거운 검증(RENDER_HEAVY=1, `pnpm verify --heavy`)에서만 돈다
  it.skipIf(!process.env.RENDER_HEAVY && !DUMP)('규격 해상도 프레임(참고: CPU 렌더 시간, IRE_DUMP면 PNG 저장)', async () => {
    const list = [0, 12, 30, 60, 120, 165, 200, 239];
    const times: number[] = [];
    for (const i of list) {
      const s = await shoot('share', i, 1080);
      expect([s.w, s.h]).toEqual([1080, 1920]);
      times.push(Math.round(s.ms));
      if (DUMP) {
        mkdirSync(DUMP, { recursive: true });
        writeFileSync(path.join(DUMP, `share-f${String(i).padStart(3, '0')}.png`), s.png());
      }
    }
    if (DUMP) {
      for (const i of [0, 60, core.irePosterFrame('webLoop'), 191]) writeFileSync(path.join(DUMP, `loop-f${String(i).padStart(3, '0')}.png`), (await shoot('webLoop', i, 540)).png());
    }
    console.log('[ire] 1080×1920 CPU 프레임 ms', times.join(','));
  }, 240000);
});
