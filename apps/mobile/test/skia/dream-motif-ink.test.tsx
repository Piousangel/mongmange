// C14b 꿈 모티프 붓 형상 15를 실제 렌더 컴포넌트(MotifInkArtView·DreamCardArt)로 헤드리스 CanvasKit(CPU)에 그린다.
// 기본(빠름): 붓 층(② 면·③ 획)만 64pt(2x) — ① 같은 입력 = 같은 픽셀(결정성 D-13, 비백 무늬 포함) ② 15장 픽셀 해시 고정(렌더 스냅숏)
// ③ 먹으로 그리는 모티프는 먹이 찍힌다. v2부터 형상의 큰 몫은 ① 장 변형(마블링 셰이더)이라 붓 층만으로는 구별을 재지 않는다 —
// 구별은 아래 카드 전체 시험(RENDER_HEAVY)과 core 64px 틀이 본다.
// RENDER_HEAVY=1: 카드 전체(마블링·몽망이·글 제외)를 64pt로 그려, 마블링 결(flowSeed)만 바꾼 같은 꿈이 기존 10 + 새 15 = 25장 중
// 자기 꿈에 가장 가까운지(정답률) 본다 — 한 화면에 섞인 썸네일에서 새 꿈이 기존 꿈·서로와 갈리는지의 회귀 가드(사람 3명 시험이 관문).
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('react-native-reanimated', async () => (await import('./mocks')).reanimatedMock());
// 헤드리스 모듈에는 vec(점 만들기 도우미)가 없다 — 카드 그림이 그라디언트 점에 쓴다
vi.mock('@shopify/react-native-skia', async () => ({ ...(await (await import('./mocks')).skiaMock()), vec: (x = 0, y?: number) => ({ x, y: y ?? x }) }));
vi.mock('react-native', async () => ({
  ...(await import('./mocks')).reactNativeMock(),
  StyleSheet: { create: <T,>(x: T) => x },
  Text: () => null,
  View: () => null,
  Image: { resolveAssetSource: () => null },
}));
// 카드 글꼴(expo-font)은 글 배치에만 쓴다 — 그림만 그리는 이 시험에는 배율 상수 하나면 된다
vi.mock('../../src/ui/type', () => ({ EN_SERIF_SCALE: 1.16 }));

type Core = typeof import('@mong/core');
let core: Core;
let DC: typeof import('../../src/render/dreamCard/DreamCard');
let MR: typeof import('../../src/render/dreamCard/motifRasters');
const ASSETS = path.resolve(__dirname, '../../assets/motifs/r1');
/** 래스터 에셋을 파일 바이트로 디코드해 앱과 같은 캐시에 넣는다(헤드리스에는 번들 로더가 없다) */
function loadRasters(on = true) {
  for (const id of MR.MOTIF_RASTER_IDS) {
    if (!on) {
      MR.setMotifRaster(id, null);
      continue;
    }
    const dec = (f: string) => Sk.Skia.Image.MakeImageFromEncoded(Sk.Skia.Data.fromBytes(new Uint8Array(readFileSync(path.join(ASSETS, f)))));
    MR.setMotifRaster(id, { ink: dec(`${id}.webp`)!, mask: dec(`${id}.mask.webp`) });
  }
}
let Sk: typeof import('@shopify/react-native-skia');
let hashRgba: (a: Uint8Array) => string;
beforeAll(async () => {
  core = await import('@mong/core');
  DC = await import('../../src/render/dreamCard/DreamCard');
  MR = await import('../../src/render/dreamCard/motifRasters');
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
      const faces = DC.faceGroups(l.faces);
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
async function shootCard(c: import('@mong/core').sim.DreamCard, o: { width?: number; labels?: import('../../src/render/dreamCard/DreamCard').DreamCardLabels; theme?: 'day' | 'night' } = {}) {
  const { makeOffscreenSurface, drawOffscreen } = headless();
  const { createElement } = await import('react');
  const w = o.width ?? PT * DPR;
  const art = DC.makeDreamArt({ card: c, strokes: core.day7Records(), labels: o.labels }, '4:5', w, 1, { devicePerUnit: 1, ptPerUnit: 1 / DPR, theme: o.theme });
  const h = Math.round(art.H);
  const surf = makeOffscreenSurface(w, h);
  const img = await drawOffscreen(surf, createElement(DC.DreamCardArt, { art }));
  return { w, h, art, rgba: img.readPixels(0, 0, { width: w, height: h, colorType: 4, alphaType: 3 }) as Uint8Array, png: () => img.encodeToBytes() };
}

/** 제목 안전 여백 안(사라지는 가장자리 빼고)에서 한지보다 가장 짙은 정도(휘도 차, 0..255) */
async function titleInk(id: string, labels: import('../../src/render/dreamCard/DreamCard').DreamCardLabels) {
  // 제목 안전 여백은 판 1(꿈 콘텐츠) 카드 규칙 — 판 0(빌드 1)은 바이트 그대로
  const shot = await shootCard(card(id, { artRev: 1 }), { width: 200, labels });
  const t = shot.art.titleSafe!;
  const vertical = t.fadeFrom.y === 0;
  // 덮개가 완전히 불투명한 안쪽만: 가로 = 위 띠의 위 60%, 세로 = 기둥의 오른쪽 55%
  const x0 = Math.ceil(vertical ? t.x + t.width * 0.45 : t.x + 4);
  const x1 = Math.floor(t.x + t.width - 4);
  const y0 = Math.ceil(t.y + 3);
  const y1 = Math.floor(vertical ? t.y + t.height - 4 : t.fadeFrom.y);
  const [pr, pg, pb] = core.hexRgb(core.PALETTE.day.bg);
  const paper = 0.299 * pr + 0.587 * pg + 0.114 * pb;
  let worst = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const p = (y * shot.w + x) * 4;
      worst = Math.max(worst, paper - (0.299 * shot.rgba[p]! + 0.587 * shot.rgba[p + 1]! + 0.114 * shot.rgba[p + 2]!));
    }
  return worst;
}
const EN_LABELS = { name: 'Mongmangi · Day 7', line: 'x', sub: 'x' };
const KO_LABELS = { name: '몽망이·이레째', line: 'x', sub: 'x' };

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
    // 담묵 면: 가장 짙은 면(w 4)의 젖은 테도 상한 아래
    expect((core.WASH_FACE.toneBase + 4 * core.WASH_FACE.toneStep) * core.WASH_FACE.rimDark).toBeLessThanOrEqual(core.MOTIF_INK_MAX);
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

describe('우산 막대 농도(2차 아트 리뷰 6 — 눈으로는 몸과 같은 검정)', () => {
  it('붓 층에서 가장 짙은 픽셀도 몸 먹(순흑)보다 확실히 밝다 — 휘도가 한지와 몸 사이 상한(0.72) 합성값 근처 이상', async () => {
    const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
    const [br, bg, bb] = core.hexRgb(core.PALETTE.day.body);
    const [pr, pg, pb] = core.hexRgb(core.PALETTE.day.bg);
    const body = lum(br, bg, bb);
    const paper = lum(pr, pg, pb);
    // 층 안은 '어둡게'로 겹치므로 겹친 곳도 가장 짙은 칠(먹 상한) 하나 — 한지 위 먹 환산 0.75 이하(상한 0.72 + 곱하기 합성 여유)
    const floor = body + (paper - body) * (1 - 0.75) - 2;
    for (const id of ['near-with.umbrella', 'far-alone.kite', 'near-alone.washing-line', 'center.leaf']) {
      const { rgba } = await shootInk(id);
      let min = 255;
      for (let p = 0; p < rgba.length; p += 4) min = Math.min(min, lum(rgba[p]!, rgba[p + 1]!, rgba[p + 2]!));
      expect(min, id).toBeGreaterThanOrEqual(floor);
      expect(min, id).toBeGreaterThan(body + 20);
    }
  }, 120000);
});

describe('4차 혼합안 — 사물 한 겹 래스터 에셋(번들 예산·먹 상한·결정성)', () => {
  const decodeFile = (f: string) => Sk.Skia.Image.MakeImageFromEncoded(Sk.Skia.Data.fromBytes(new Uint8Array(readFileSync(f))))!;
  const pixels = (img: ReturnType<typeof decodeFile>) => img.readPixels(0, 0, { width: img.width(), height: img.height(), colorType: 4, alphaType: 3 }) as Uint8Array;
  const ROOT = path.resolve(__dirname, '../../assets/motifs');

  it('판(artRev) 규칙: 지금 판까지 모든 판의 폴더가 남아 있고, 폴더 파일 = 그 판 목록(먹 + 가림 + 손질 기록)', () => {
    for (let rev = 1; rev <= core.sim.DREAM_ART_REV; rev++) {
      const ids = core.sim.ART_REV_RASTERS[rev]!;
      const want = [...ids.flatMap((id) => [`${id}.webp`, `${id}.mask.webp`]), 'motifRasters.gen.json'].sort();
      expect(readdirSync(path.join(ROOT, `r${rev}`)).sort(), `r${rev}`).toEqual(want);
    }
  });

  it('번들 예산: 먹 장당 ≤ 200KB·가림 장당 ≤ 24KB·판당 합계 ≤ 760KB·모든 판 합계 ≤ 2MB, 긴 변 ≤ 640px, 먹 = 검정 + 알파 최대 ≤ 0.72', () => {
    let all = 0;
    for (let rev = 1; rev <= core.sim.DREAM_ART_REV; rev++) {
      let total = 0;
      for (const id of core.sim.ART_REV_RASTERS[rev]!) {
        const f = path.join(ROOT, `r${rev}`, `${id}.webp`);
        const m = path.join(ROOT, `r${rev}`, `${id}.mask.webp`);
        const bytes = statSync(f).size;
        total += bytes + statSync(m).size;
        expect(bytes, id).toBeLessThanOrEqual(200 * 1024);
        expect(statSync(m).size, id).toBeLessThanOrEqual(24 * 1024);
        const img = decodeFile(f);
        expect(Math.max(img.width(), img.height()), id).toBeLessThanOrEqual(640);
        const mask = decodeFile(m);
        expect([mask.width(), mask.height()], id).toEqual([img.width(), img.height()]);
        const px = pixels(img);
        let maxA = 0;
        let maxRgb = 0;
        for (let p = 0; p < px.length; p += 4) {
          maxA = Math.max(maxA, px[p + 3]!);
          if (px[p + 3]! > 32) maxRgb = Math.max(maxRgb, (px[p]! * 255) / px[p + 3]!);
        }
        expect(maxA / 255, id).toBeLessThanOrEqual(core.MOTIF_INK_MAX + 1 / 255);
        expect(maxA / 255, id).toBeGreaterThan(0.5);
        expect(maxRgb, id).toBeLessThan(24); // 먹 한 색(검정) — 색은 그릴 때 토큰으로
        // 가림 마스크는 먹이 짙은 곳(알파 ≥ 0.3)을 98% 넘게 덮는다(실루엣 속까지 채움)
        const mp = pixels(mask);
        let ink = 0;
        let covered = 0;
        for (let p = 0; p < px.length; p += 4)
          if (px[p + 3]! >= 0.3 * 255) {
            ink++;
            if (mp[p + 3]! >= 128) covered++;
          }
        expect(covered / ink, id).toBeGreaterThan(0.98);
      }
      expect(total, `r${rev}`).toBeLessThanOrEqual(760 * 1024);
      all += total;
    }
    expect(all).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  it('가림 농도: 불투명 사물(편지·종이배·창·벼루·징검다리·한지) 0.85, 비치는 사물(연·우산) 0.3~0.5, 손 그림자 0.3, 래스터 그릇(이불·찻잔) 0.9', () => {
    const cover = Object.fromEntries(core.sim.MOTIFS.filter((m) => m.raster).map((m) => [m.id, m.raster!.cover]));
    expect(cover).toEqual({
      'near-with.letter': 0.85,
      'near-with.palm': 0.3,
      'near-with.umbrella': 0.45,
      'far-alone.paper-boat': 0.85,
      'far-alone.kite': 0.4,
      'near-alone.inkstone': 0.85,
      'far-with.stepping-stones': 0.85,
      'near-alone.washing-line': 0.85,
    });
    for (const v of Object.values(DC.VESSEL_RASTER)) expect(v.cover).toBe(0.9);
    expect(DC.WINDOW_COVER).toBe(0.85);
    expect(DC.COVER_PAPER).toBe(core.PALETTE.day.bg);
  });

  it('불러오기 실패는 고정되지 않는다(코드 리뷰 M-1): 첫 시도에 디코드가 실패한 장은 다음 부름에서 다시 시도해 들어온다', async () => {
    const real = (rev: number, id: string) => {
      const dec = (f: string) => Sk.Skia.Image.MakeImageFromEncoded(Sk.Skia.Data.fromBytes(new Uint8Array(readFileSync(path.join(ROOT, `r${rev}`, f)))));
      return { ink: dec(`${id}.webp`)!, mask: dec(`${id}.mask.webp`) };
    };
    let failKite = true;
    MR.setMotifRasterLoader(async (rev, id) => {
      if (id === 'far-alone.kite' && failKite) {
        failKite = false;
        throw new Error('일시 디코드 실패');
      }
      return real(rev, id);
    });
    const kite = { motifId: 'far-alone.kite' };
    expect(await MR.ensureMotifRasters(kite)).toBe(true); // 첫 시도 실패 → 같은 부름 안에서 한 번 더
    expect(MR.motifRaster('far-alone.kite', 1)).not.toBeNull();
    // 빌드 1 카드(판 0)는 래스터를 기다릴 것이 없다
    expect(await MR.ensureMotifRasters({ motifId: 'near-with.window-hand' })).toBe(true);
    // 끝내 없으면 false(호출부가 기록하고 코드판)
    MR.setMotifRasterLoader(async () => null);
    expect(await MR.ensureMotifRasters(kite)).toBe(false);
    MR.setMotifRasterLoader(null);
    loadRasters(true);
  }, 120000);

  it('카드는 받은 판으로 그린다: 판 2 래스터만 바꿔 넣어도 판 1 카드(artRev 없음·1)는 그대로', async () => {
    loadRasters(true);
    const id = 'far-alone.kite';
    const before = hashRgba((await shootCard(card(id))).rgba);
    // 가짜 판 2(편지 그림)를 넣는다 — 판 1 카드는 영향 없음, 판 2 카드는 그 그림
    MR.setMotifRaster(id, MR.motifRaster('near-with.letter'), 2);
    expect(hashRgba((await shootCard(card(id))).rgba)).toBe(before);
    expect(hashRgba((await shootCard(card(id, { artRev: 1 }))).rgba)).toBe(before);
    expect(hashRgba((await shootCard(card(id, { artRev: 2 }))).rgba)).not.toBe(before);
    MR.setMotifRaster(id, null, 2);
  }, 120000);

  it('래스터가 있으면 카드가 그것으로 그려지고(코드판과 픽셀이 다름), 같은 입력 = 같은 픽셀', async () => {
    for (const id of MR.MOTIF_RASTER_IDS) {
      loadRasters(true);
      const a = await shootCard(card(id, { artRev: 1 }));
      const b = await shootCard(card(id, { artRev: 1 }));
      expect(hashRgba(b.rgba), id).toBe(hashRgba(a.rgba));
      loadRasters(false);
      const code = await shootCard(card(id, { artRev: 1 }));
      expect(hashRgba(code.rgba), id).not.toBe(hashRgba(a.rgba));
    }
    loadRasters(true);
  }, 300000);
});

/**
 * 판 0(꿈 콘텐츠 꺼짐 — 판 번호 없는 빌드 1 카드) 픽셀 해시(코드 리뷰 H1): main(3c6ca98)의 렌더러로 같은 조건에서 그린 값과 같다
 * (11-25 main 사본을 같은 헤드리스로 그려 30장 모두 바이트 일치 확인). 빌드 1 그림이 바뀌면 실패한다. 폭 160px, 한국어 이름
 */
const REV0_PIXELS: Record<string, string> = {
  'near-alone.quilt/0': 'a6e2724e',
  'near-alone.quilt/1': '9cb9fa79',
  'near-alone.quilt/2': 'eb36cb40',
  'near-alone.teacup/0': '3e309bd1',
  'near-alone.teacup/1': '73a8ce39',
  'near-alone.teacup/2': '06104593',
  'near-with.window-hand/0': 'c55b8963',
  'near-with.window-hand/1': 'd4c2f5f2',
  'near-with.window-hand/2': 'd2b670f0',
  'near-with.teacup-two/0': '5724f32e',
  'near-with.teacup-two/1': '0e54162c',
  'near-with.teacup-two/2': 'ed3e3d48',
  'far-alone.mountain/0': '003e589a',
  'far-alone.mountain/1': '397b2c4a',
  'far-alone.mountain/2': 'c5b8aa91',
  'far-alone.sea/0': 'a81bfc83',
  'far-alone.sea/1': '87ac4948',
  'far-alone.sea/2': '72273409',
  'far-with.stars-drops/0': 'd1bde805',
  'far-with.stars-drops/1': 'cc966bb2',
  'far-with.stars-drops/2': '19ed59fb',
  'far-with.sea-hand/0': '91ff37c4',
  'far-with.sea-hand/1': 'd79415d5',
  'far-with.sea-hand/2': 'c3af1ed8',
  'center.rain/0': '8b7f0700',
  'center.rain/1': '1bab0ceb',
  'center.rain/2': 'f67f29bc',
  'center.moon/0': '9c583c9b',
  'center.moon/1': '49758a09',
  'center.moon/2': 'd4fd9e0f',
};
async function shootRev0(id: string, comp: number) {
  const shot = await shootCard({ ...card(id), composition: comp as 0 | 1 | 2 }, { width: 160, labels: { name: '몽망이·이레째', line: 'x', sub: 'x' } });
  return hashRgba(shot.rgba);
}

describe('판 0 = 빌드 1 그림 그대로(코드 리뷰 H1)', () => {
  it('대표 3장(이불·창가 손·별과 물방울, 구도 a): main과 픽셀이 같다 — 래스터를 불러와 둬도 판 0 카드는 쓰지 않는다', async () => {
    loadRasters(true);
    for (const id of ['near-alone.quilt', 'near-with.window-hand', 'far-with.stars-drops']) expect(await shootRev0(id, 0), id).toBe(REV0_PIXELS[`${id}/0`]);
  }, 300000);
});

describe.skipIf(!process.env.RENDER_HEAVY)('판 0 = 빌드 1 그림 그대로 — 10모티프 × 구도 3', () => {
  it('30장 main과 같은 픽셀', async () => {
    loadRasters(true);
    for (const k of Object.keys(REV0_PIXELS)) {
      const [id, comp] = k.split('/');
      expect(await shootRev0(id!, Number(comp)), k).toBe(REV0_PIXELS[k]);
    }
  }, 900000);
});

describe('밤 판(7차 — 2차 블라인드: 실제 밤 카드에서 몽망이·사물 대비)', () => {
  it('밤 카드(8차 — 3차 블라인드: 몸이 베이지로 뒤집혀 정체성이 깨짐): 래스터 사물 12장 모두 몸은 검은 먹(밤 바탕보다 어둡게), 둘레에 달빛 테(밤 바탕보다 확실히 밝음), 사물 자리에 밝은 먹', async () => {
    loadRasters(true);
    const lum = (a: Uint8Array, p: number) => 0.299 * a[p]! + 0.587 * a[p + 1]! + 0.114 * a[p + 2]!;
    const bg = (() => {
      const [r, g, b] = core.hexRgb(core.PALETTE.night.bg);
      return 0.299 * r + 0.587 * g + 0.114 * b;
    })();
    for (const id of MR.MOTIF_RASTER_IDS) {
      const shot = await shootCard(card(id, { artRev: 1 }), { width: 200, theme: 'night' });
      const { art } = shot;
      // 몸 윗부분(눈 위 — 이불·찻잔 래스터는 몸 아래를 덮는다) = 검은 먹
      const p = (Math.round(art.c0.y - art.scene.body.w * art.W * 0.28) * shot.w + Math.round(art.c0.x)) * 4;
      expect(lum(shot.rgba, p), `${id} 몸`).toBeLessThan(bg);
      // 달빛 테: 몸 가장자리 둘레(몸 폭의 0.4~0.62 반경 고리)에서 가장 밝은 픽셀이 밤 바탕보다 60 이상 밝다
      const wpx = art.scene.body.w * art.W;
      let rim = 0;
      for (let y = Math.floor(art.c0.y - wpx); y <= art.c0.y + wpx; y++)
        for (let x = Math.floor(art.c0.x - wpx); x <= art.c0.x + wpx; x++) {
          const d = Math.hypot(x - art.c0.x, y - art.c0.y) / wpx;
          if (d >= 0.4 && d <= 0.62 && x >= 0 && y >= 0 && x < shot.w) rim = Math.max(rim, lum(shot.rgba, (y * shot.w + x) * 4));
        }
      expect(rim - bg, `${id} 달빛 테`).toBeGreaterThan(60);
      // 사물이 있는 판 1 자리(창가 손은 그릇 래스터, 나머지는 붓 층 래스터)에서 가장 밝은 픽셀이 밤 바탕보다 확실히 밝다
      let max = 0;
      for (let q = 0; q < shot.rgba.length; q += 4) max = Math.max(max, lum(shot.rgba, q));
      expect(max - bg, `${id} 밝은 먹`).toBeGreaterThan(80);
    }
  }, 300000);
});

describe('제목 안전 여백(블라인드 판정: 제목이 그림에 겹침)', () => {
  it('가로(영어)·세로(한국어) 이름 자리에는 마블링·모티프 먹이 남지 않는다 — 대표 4장', async () => {
    loadRasters(true);
    for (const id of ['near-with.letter', 'far-alone.kite', 'center.moon', 'near-alone.washing-line'])
      for (const lb of [EN_LABELS, KO_LABELS]) expect(await titleInk(id, lb), `${id} ${lb.name}`).toBeLessThan(28);
  }, 300000);
});

describe.skipIf(!process.env.RENDER_HEAVY)('제목 안전 여백 — 25장 전부', () => {
  it('25모티프 × 가로·세로 이름', async () => {
    loadRasters(true);
    for (const m of core.sim.MOTIFS) for (const lb of [EN_LABELS, KO_LABELS]) expect(await titleInk(m.id, lb), `${m.id} ${lb.name}`).toBeLessThan(28);
  }, 900000);
});

describe.skipIf(!process.env.RENDER_HEAVY)('카드 64pt — 기존 10 + 새 15가 한 화면에서 갈린다(회귀 가드)', () => {
  it('마블링 결만 바꾼 같은 꿈의 최근접은 늘 자기 꿈(새 15개 정답률 100%) — 사물형은 래스터판', async () => {
    loadRasters(true);
    const ids = core.sim.MOTIFS.map((m) => m.id);
    const gallery: Uint8Array[] = [];
    // 꿈 콘텐츠가 켜진 판(1)의 그림끼리 — 판 0(빌드 1) 그림은 위 시험이 main과 같음을 본다
    for (const id of ids) gallery.push((await shootCard(card(id, { artRev: 1 }))).rgba);
    const miss: string[] = [];
    for (const m of core.sim.MOTIFS.filter((x) => x.paths.length > 0)) {
      const q = await shootCard(card(m.id, { flowSeed: 777, artRev: 1 }));
      if (DUMP) writeFileSync(path.join(DUMP, `card64-${m.id}.png`), q.png());
      const d = gallery.map((g) => lumaDist(q.rgba, g));
      const best = d.indexOf(Math.min(...d));
      if (ids[best] !== m.id) miss.push(`${m.id} → ${ids[best]}`);
    }
    expect(miss).toEqual([]);
    // 블라인드 판정(11-25)이 64px에서 헷갈린다고 한 쌍: 서로의 거리가 같은 꿈을 결만 바꿨을 때의 거리보다 멀다
    const PAIRS: [string, string][] = [
      ['far-alone.sea', 'far-with.sea-hand'],
      ['near-alone.teacup', 'near-with.teacup-two'],
      ['near-alone.inkstone', 'far-with.stepping-stones'],
      ['near-alone.inkstone', 'far-alone.path'],
      ['far-with.stepping-stones', 'far-alone.path'],
      ['far-with.stepping-stones', 'far-with.star-bridge'],
      ['center.rain', 'near-with.palm'],
      // 2차 블라인드(7차)
      ['center.wind', 'center.leaf'],
      ['center.leaf', 'far-alone.path'],
      ['center.wind', 'far-alone.path'],
      ['far-with.star-bridge', 'far-alone.mountain'],
    ];
    const g = new Map(ids.map((id, i) => [id, gallery[i]!]));
    for (const [a, b] of PAIRS) {
      const qa = (await shootCard(card(a, { flowSeed: 777, artRev: 1 }))).rgba;
      const qb = (await shootCard(card(b, { flowSeed: 777, artRev: 1 }))).rgba;
      const self = Math.max(lumaDist(qa, g.get(a)!), lumaDist(qb, g.get(b)!));
      expect(lumaDist(g.get(a)!, g.get(b)!), `${a} ↔ ${b}`).toBeGreaterThan(self);
    }
  }, 900000);
});

// 붓 리본·층 색·번짐이 바뀌면 실패: 의도한 변경이면 값을 갱신하고 docs/app/c14b 시트를 다시 본다(C14B_DUMP=<폴더>로 PNG)
const INK_SNAPSHOT: Record<string, string> = {
  'near-alone.inkstone': '19085c9c',
  'near-alone.washing-line': '618b9403',
  'near-alone.sprout': '101af2b0',
  'near-with.umbrella': '665266a2',
  'near-with.letter': '297a6a9d',
  'near-with.palm': 'c3cfffe9',
  'far-alone.paper-boat': '15e778f2',
  'far-alone.kite': '74a02ddd',
  'far-alone.path': '550c6729',
  'far-with.geese': '8877454d',
  'far-with.star-bridge': '30de01db',
  'far-with.stepping-stones': 'e20afb81',
  'center.leaf': '0d01b385',
  'center.snow': '48fcba9a',
  'center.wind': '62fc72e3',
};
