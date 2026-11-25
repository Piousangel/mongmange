// C14b 꿈 모티프 붓 형상 15를 실제 렌더 컴포넌트(MotifInkArtView·DreamCardArt)로 헤드리스 CanvasKit(CPU)에 그린다.
// 기본(빠름): 붓 층(② 면·③ 획)만 64pt(2x) — ① 같은 입력 = 같은 픽셀(결정성 D-13, 비백 무늬 포함) ② 15장 픽셀 해시 고정(렌더 스냅숏)
// ③ 먹으로 그리는 모티프는 먹이 찍힌다. v2부터 형상의 큰 몫은 ① 장 변형(마블링 셰이더)이라 붓 층만으로는 구별을 재지 않는다 —
// 구별은 아래 카드 전체 시험(RENDER_HEAVY)과 core 64px 틀이 본다.
// RENDER_HEAVY=1: 카드 전체(마블링·몽망이·글 제외)를 64pt로 그려, 마블링 결(flowSeed)만 바꾼 같은 꿈이 기존 10 + 새 15 = 25장 중
// 자기 꿈에 가장 가까운지(정답률) 본다 — 한 화면에 섞인 썸네일에서 새 꿈이 기존 꿈·서로와 갈리는지의 회귀 가드(사람 3명 시험이 관문).
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('react-native-reanimated', async () => (await import('./mocks')).reanimatedMock());
// 헤드리스 모듈에는 vec(점 만들기 도우미)가 없다 — 카드 그림이 그라디언트 점에 쓴다
vi.mock('@shopify/react-native-skia', async () => ({ ...(await (await import('./mocks')).skiaMock()), vec: (x = 0, y?: number) => ({ x, y: y ?? x }) }));
vi.mock('react-native', async () => ({
  ...(await import('./mocks')).reactNativeMock(),
  StyleSheet: { create: <T,>(x: T) => x },
  Text: () => null,
  View: () => null,
}));
// 카드 글꼴(expo-font)은 글 배치에만 쓴다 — 그림만 그리는 이 시험에는 배율 상수 하나면 된다
vi.mock('../../src/ui/type', () => ({ EN_SERIF_SCALE: 1.16 }));

type Core = typeof import('@mong/core');
let core: Core;
let DC: typeof import('../../src/render/dreamCard/DreamCard');
let Sk: typeof import('@shopify/react-native-skia');
let hashRgba: (a: Uint8Array) => string;
beforeAll(async () => {
  core = await import('@mong/core');
  DC = await import('../../src/render/dreamCard/DreamCard');
  Sk = await import('@shopify/react-native-skia');
  hashRgba = (await import('./render')).hashRgba;
}, 120000);

const headless = () =>
  Sk as unknown as {
    makeOffscreenSurface(w: number, h: number): import('@shopify/react-native-skia').SkSurface;
    drawOffscreen(surface: import('@shopify/react-native-skia').SkSurface, el: React.ReactElement): Promise<import('@shopify/react-native-skia').SkImage>;
  };

const PT = 64;
const DPR = 2;
const DUMP = process.env.C14B_DUMP;

const card = (motifId: string, over: Partial<import('@mong/core').sim.DreamCard> = {}): import('@mong/core').sim.DreamCard => ({
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

/** 붓 층만: 64pt 정사각에 그림 상자를 꽉 채워(한지 바탕) */
async function shootInk(id: string) {
  const { makeOffscreenSurface, drawOffscreen } = headless();
  const { createElement } = await import('react');
  const m = core.sim.motifById(id)!;
  const px = PT * DPR;
  const ink = {
    t: [{ scale: px / 100 }],
    layers: core.motifInkLayers(m.paths).map((l) => {
      const verts = (rs: import('@mong/core').Ribbon[]) => {
        const vertices: { x: number; y: number }[] = [];
        const indices: number[] = [];
        for (const rb of rs) {
          const base = vertices.length;
          for (let i = 0; i < rb.positions.length; i += 2) vertices.push({ x: rb.positions[i]!, y: rb.positions[i + 1]! });
          for (const k of rb.indices) indices.push(k + base);
        }
        return { vertices, indices };
      };
      const faces = l.faces.map((f) => {
        const b = Sk.Skia.PathBuilder.Make();
        b.moveTo(f.poly[0]!, f.poly[1]!);
        for (let i = 2; i < f.poly.length; i += 2) b.lineTo(f.poly[i]!, f.poly[i + 1]!);
        b.close();
        return { path: b.build(), rim: verts([f.rim]) };
      });
      return { layer: l.layer, verts: verts(l.ribbons), bleed: verts(l.bleed), faces };
    }),
    fade: { cx: px / 2, cy: px / 2, r: px * 4 },
    yLim: px,
    bleed: core.blurFloorPt(px * 0.006, 1),
    unit: px / 100,
  };
  const surf = makeOffscreenSurface(px, px);
  surf.getCanvas().clear(Sk.Skia.Color(core.PALETTE.day.bg));
  const img = await drawOffscreen(surf, createElement(DC.MotifInkArtView, { ink: ink as never, W: px }));
  const rgba = img.readPixels(0, 0, { width: px, height: px, colorType: 4, alphaType: 3 }) as Uint8Array;
  return { rgba, png: () => img.encodeToBytes() };
}

/** 카드 그림 전체(글 제외)를 폭 PT로 */
async function shootCard(c: import('@mong/core').sim.DreamCard) {
  const { makeOffscreenSurface, drawOffscreen } = headless();
  const { createElement } = await import('react');
  const w = PT * DPR;
  const art = DC.makeDreamArt({ card: c, strokes: core.day7Records() }, '4:5', w, 1, { devicePerUnit: 1, ptPerUnit: 1 / DPR });
  const h = Math.round(art.H);
  const surf = makeOffscreenSurface(w, h);
  const img = await drawOffscreen(surf, createElement(DC.DreamCardArt, { art }));
  return { w, h, rgba: img.readPixels(0, 0, { width: w, height: h, colorType: 4, alphaType: 3 }) as Uint8Array, png: () => img.encodeToBytes() };
}

/** 휘도 평균 절대 차(0..1) */
function lumaDist(a: Uint8Array, b: Uint8Array): number {
  let s = 0;
  for (let p = 0; p < a.length; p += 4) s += Math.abs(0.299 * (a[p]! - b[p]!) + 0.587 * (a[p + 1]! - b[p + 1]!) + 0.114 * (a[p + 2]! - b[p + 2]!));
  return s / (a.length / 4) / 255;
}
function inked(rgba: Uint8Array): number {
  const [r, g, b] = core.hexRgb(core.PALETTE.day.bg);
  let n = 0;
  for (let p = 0; p < rgba.length; p += 4) if (Math.abs(rgba[p]! - r) + Math.abs(rgba[p + 1]! - g) + Math.abs(rgba[p + 2]! - b) > 30) n++;
  return n / (rgba.length / 4);
}

describe('붓 층 64pt(2x) 렌더', () => {
  it('아트 바이블 7-6 ②: 렌더 먹 층 불투명도 ≤ 모티프 먹 상한(몸 먹의 0.72) < 몸(1), 담묵 < 먹, 번짐 한 겹은 아주 옅게', () => {
    expect(DC.INK_LAYER.ink.alpha).toBeLessThanOrEqual(core.MOTIF_INK_MAX);
    expect(DC.INK_LAYER.ink.color).toBe(core.PALETTE.day.body);
    expect(DC.INK_LAYER.wash.alpha).toBeLessThan(DC.INK_LAYER.ink.alpha);
    expect(DC.WASH_FACE.fill + DC.WASH_FACE.rim).toBeLessThanOrEqual(core.MOTIF_INK_MAX);
    expect(DC.INK_BLEED).toBeLessThanOrEqual(0.15);
  });

  it('같은 입력 = 같은 픽셀, 15장 픽셀 해시 고정, 먹으로 그리는 모티프는 먹이 찍힌다(면적 0.3% 이상)', async () => {
    const ids = core.sim.MOTIFS.filter((m) => m.paths.length > 0).map((m) => m.id);
    expect(ids).toHaveLength(15);
    const shots: Awaited<ReturnType<typeof shootInk>>[] = [];
    for (const id of ids) {
      const a = await shootInk(id);
      const b = await shootInk(id);
      expect(hashRgba(b.rgba), id).toBe(hashRgba(a.rgba));
      if (core.sim.motifById(id)!.water !== 'clear') expect(inked(a.rgba), id).toBeGreaterThan(0.003);
      shots.push(a);
      if (DUMP) {
        mkdirSync(DUMP, { recursive: true });
        writeFileSync(path.join(DUMP, `ink-${id}.png`), a.png());
      }
    }
    expect(Object.fromEntries(ids.map((id, i) => [id, hashRgba(shots[i]!.rgba)]))).toEqual(INK_SNAPSHOT);
  }, 120000);
});

describe.skipIf(!process.env.RENDER_HEAVY)('카드 64pt — 기존 10 + 새 15가 한 화면에서 갈린다(회귀 가드)', () => {
  it('마블링 결만 바꾼 같은 꿈의 최근접은 늘 자기 꿈(새 15개 정답률 100%)', async () => {
    const ids = core.sim.MOTIFS.map((m) => m.id);
    const gallery: Uint8Array[] = [];
    for (const id of ids) gallery.push((await shootCard(card(id))).rgba);
    const miss: string[] = [];
    for (const m of core.sim.MOTIFS.filter((x) => x.paths.length > 0)) {
      const q = await shootCard(card(m.id, { flowSeed: 777 }));
      if (DUMP) writeFileSync(path.join(DUMP, `card64-${m.id}.png`), q.png());
      const d = gallery.map((g) => lumaDist(q.rgba, g));
      const best = d.indexOf(Math.min(...d));
      if (ids[best] !== m.id) miss.push(`${m.id} → ${ids[best]}`);
    }
    expect(miss).toEqual([]);
  }, 600000);
});

// 붓 리본·층 색·번짐이 바뀌면 실패: 의도한 변경이면 값을 갱신하고 docs/app/c14b 시트를 다시 본다(C14B_DUMP=<폴더>로 PNG)
const INK_SNAPSHOT: Record<string, string> = {
  'near-alone.inkstone': '55a92814',
  'near-alone.washing-line': 'fc631e0c',
  'near-alone.sprout': 'e44140c2',
  'near-with.umbrella': '5f7db697',
  'near-with.letter': '3b316582',
  'near-with.palm': 'ffc4a4cf',
  'far-alone.paper-boat': 'a619ec04',
  'far-alone.kite': '58845c0d',
  'far-alone.path': '53d33a41',
  'far-with.geese': '132a1f31',
  'far-with.star-bridge': 'ca411275',
  'far-with.stepping-stones': '2ae698a5',
  'center.leaf': '28f8216b',
  'center.snow': '8fa12078',
  'center.wind': '0fae2924',
};
