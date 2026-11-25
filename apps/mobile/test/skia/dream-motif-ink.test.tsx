// C14b 꿈 모티프 붓 형상 15를 실제 렌더 컴포넌트(MotifInkArtView·DreamCardArt)로 헤드리스 CanvasKit(CPU)에 그린다.
// 기본(빠름): 붓 층만 64pt(2x) — ① 같은 입력 = 같은 픽셀(결정성 D-13) ② 15장 픽셀 해시 고정(렌더 스냅숏) ③ 모두 먹이 찍힌다
// ④ 64pt에서 서로 다른 그림(모든 쌍의 평균 차가 문턱 위).
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
      const vertices: { x: number; y: number }[] = [];
      const indices: number[] = [];
      for (const rb of l.ribbons) {
        const base = vertices.length;
        for (let i = 0; i < rb.positions.length; i += 2) vertices.push({ x: rb.positions[i]!, y: rb.positions[i + 1]! });
        for (const k of rb.indices) indices.push(k + base);
      }
      return { layer: l.layer, verts: { vertices, indices } };
    }),
    fade: { cx: px / 2, cy: px / 2, r: px * 4 },
    yLim: px,
    bleed: core.blurFloorPt(px * 0.006, 1),
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
  it('같은 입력 = 같은 픽셀, 15장 픽셀 해시 고정, 모두 먹이 찍히고(면적 1% 이상) 모든 쌍이 서로 다르다', async () => {
    const ids = core.sim.MOTIFS.filter((m) => m.paths.length > 0).map((m) => m.id);
    expect(ids).toHaveLength(15);
    const shots: Awaited<ReturnType<typeof shootInk>>[] = [];
    for (const id of ids) {
      const a = await shootInk(id);
      const b = await shootInk(id);
      expect(hashRgba(b.rgba), id).toBe(hashRgba(a.rgba));
      expect(inked(a.rgba), id).toBeGreaterThan(0.01);
      shots.push(a);
      if (DUMP) {
        mkdirSync(DUMP, { recursive: true });
        writeFileSync(path.join(DUMP, `ink-${id}.png`), a.png());
      }
    }
    let minD = Infinity;
    for (let i = 0; i < shots.length; i++) for (let j = i + 1; j < shots.length; j++) minD = Math.min(minD, lumaDist(shots[i]!.rgba, shots[j]!.rgba));
    expect(minD).toBeGreaterThan(0.02);
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
  'near-alone.inkstone': '9b537fa9',
  'near-alone.washing-line': 'c36cfc6d',
  'near-alone.sprout': 'e1645a09',
  'near-with.umbrella': '7a5791ed',
  'near-with.letter': 'a9a8f2ad',
  'near-with.palm': '8e7b5b52',
  'far-alone.paper-boat': '955ffc91',
  'far-alone.kite': '64a1919e',
  'far-alone.path': '0023ead2',
  'far-with.geese': '6dfc8481',
  'far-with.star-bridge': '87e59489',
  'far-with.stepping-stones': 'b0fab2ea',
  'center.leaf': '07c5f112',
  'center.snow': '81a766c2',
  'center.wind': '69fcb82e',
};
