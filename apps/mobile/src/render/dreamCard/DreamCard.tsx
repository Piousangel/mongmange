import {
  BlendColor,
  BlendMode,
  BlurMask,
  Canvas,
  FractalNoise,
  PathOp,
  Circle,
  Fill,
  Group,
  LinearGradient,
  Oval,
  Path,
  RadialGradient,
  Rect,
  Shader,
  Skia,
  Vertices,
  vec,
  type SkImage,
  type SkPath,
  type SkPoint,
} from '@shopify/react-native-skia';
import {
  COMB_REST,
  PALETTE,
  buildDreamScene,
  buildRibbon,
  combStrands,
  coreOutline,
  dreamCardLayout,
  eyeCenters,
  eyeShape,
  blurFloorPt,
  bodyLod,
  GRAMMARS,
  type DreamAspect,
  type DreamLayout,
  type DreamScene,
  type DreamTextItem,
  type DreamVessel,
  type Ribbon,
  type BodyShape,
  type MongLook,
  type StrokeRecord,
  sim,
  sealOutlineOf,
  motifInkLayers,
  MOTIF_INK_MAX,
  MOTIF_NIGHT_INK,
  FRIEND_ADJ,
  COMPANION,
  companionBlob,
  WASH_FACE,
  hexRgb,
  type MotifInkLayer,
} from '@mong/core';
import { Image as SkImageNode } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { PixelRatio, Platform, StyleSheet, Text, View } from 'react-native';
import { useFeature } from '../../features';
import { paperFx } from '../shaders';
import { sealPath } from '../sealPath';
import { dayName, getLocale, t } from '../../i18n';
import { EN_SERIF_SCALE } from '../../ui/type';
import { getMarbleFx, marbleUniforms } from './marble';
import { fitRect, motifRaster, useMotifRasters } from './motifRasters';
import { NIGHT_SUB_TEXT, cardTextColor } from './renderImage.types';

/** 카드 위 글(문장은 앱이 언어별로 만들어 넘긴다 — 시스템 2.6) */
export interface DreamCardLabels {
  /** 이름 줄. 한국어 8자 이하면 세로쓰기("몽망이·이레째"), 영어는 가로 */
  name: string;
  /** 아침 문장 한 줄 */
  line: string;
  /** 작은 보조 줄: 모티프 · 밤 */
  sub: string;
}

export interface DreamCardInput {
  card: sim.DreamCard;
  /** 그 아침까지의 몽망이 획 기록(D-13 정본) */
  strokes: readonly StrokeRecord[];
  labels?: DreamCardLabels;
  /** M1 그 아이(체형·빗 모양 → 카드 속 몸, 몸의 먹 → 마블링 옅은 먹빛). 없으면 기본형(빌드 1 카드 그대로, H3) */
  look?: MongLook;
  /**
   * M2 그 아이의 인장 씨앗(플래그 naming이 켜졌을 때만 넘긴다). 있으면 낙관 판의 가장자리 = 그 아이의 이 빠짐 무늬(core sealOutlineOf,
   * 작으면 LOD로 사각), 없으면 빌드 1 종이 귀 그대로. 인장은 이름이 아니라 공개 설정과 무관하다
   */
  sealSeed?: number;
}

export function defaultLabels(card: sim.DreamCard): DreamCardLabels {
  const n = card.night;
  const day = dayName(Math.max(0, n - 1));
  return { name: t('card.name', { day }), line: t('card.defaultLine'), sub: day };
}

/**
 * 카드 글꼴: 한국어 = 앱 번들 명조(Gowun Batang — 아트 6절의 본명조 자리), 영어 = Cormorant Garamond(이름 줄 Medium, 문장 Italic).
 * 네이티브 공유 이미지(renderImage.tsx)는 이 이름으로 Skia 글꼴 공급자에 등록한다.
 */
export const CARD_FONT = 'GowunBatang';
export const CARD_FONT_EN = 'CormorantGaramond';
export const CARD_FONT_EN_ITALIC = 'CormorantGaramondItalic';
export const SERIF_WEB = 'GowunBatang, "Noto Serif KR", serif';
const SERIF_WEB_EN = 'CormorantGaramond, Garamond, Georgia, serif';
const SERIF_WEB_EN_ITALIC = 'CormorantGaramondItalic, Garamond, Georgia, serif';

/** 글 역할 → 글꼴 이름(locale별). sub(작은 보조 줄)는 영어에서도 바로 선 Medium */
export function cardFontFor(role: DreamTextItem['role'], web: boolean, loc = getLocale()): string {
  if (loc === 'ko') return web ? SERIF_WEB : CARD_FONT;
  const italic = role === 'serifLight';
  return web ? (italic ? SERIF_WEB_EN_ITALIC : SERIF_WEB_EN) : italic ? CARD_FONT_EN_ITALIC : CARD_FONT_EN;
}

/** 영어 명조는 x높이가 작아 키운다(화면 KText와 같은 배율) */
export function cardFontScale(loc = getLocale()): number {
  return loc === 'ko' ? 1 : EN_SERIF_SCALE;
}

// ---------- 정적 그림(오프스크린에서도 같은 요소를 쓴다: 훅·공유값 없음) ----------

export interface DreamArt {
  W: number;
  H: number;
  scene: DreamScene;
  layout: DreamLayout;
  c0: { x: number; y: number };
  sheetPath: SkPath;
  shadowRect: { x: number; y: number; width: number; height: number };
  uniforms: ReturnType<typeof marbleUniforms>;
  vessels: VesselArt[];
  body: BodyGeo;
  /** 곁의 다른 방울. eyes = 눈을 그리나(C14b 붓 형상 카드는 그리지 않는다 — 1-1 '다른 존재의 방울에는 눈을 넣지 않는다') */
  /** blob = 판 1 곁 방울(담묵 붓 방울 — 몽망이와 재질로 가름, 7차). 있으면 몸 기하 대신 이것을 그린다 */
  /** hold = 몸 쪽으로 뻗은 손 한 줌(곁 좌표, 8차 바다 손) */
  friend: { t: object[]; geo: BodyGeo; eyes: boolean; blob: SkPath | null; hold: SkPath | null } | null;
  ringPx: { x: number; y: number; r: number };
  seal: { plate: SkPath; figure: SkPath; combs: Verts; eyes: SkPath };
  /**
   * 제목 안전 여백(블라인드 판정 '제목이 그림에 겹침'): 이름 줄 자리를 한지로 다시 덮는 사각형(픽셀)과 사라지는 방향.
   * 가로 이름 = 위 띠(아래로 사라짐), 세로 이름(한국어) = 오른쪽 기둥(왼쪽으로 사라짐)
   */
  titleSafe: { x: number; y: number; width: number; height: number; fadeFrom: { x: number; y: number }; fadeTo: { x: number; y: number } } | null;
  theme: 'day' | 'night';
  /** 낙관을 그리나(이레 영상 카드 줄은 끔 — 주사는 한 화면 한 곳) */
  showSeal: boolean;
  dots: { x: number; y: number; r: number; kind: 'past' | 'now' | 'future' }[];
  /** 장치 px 하한을 건 블러(그림 단위): 그림자·이불 접힘 그늘 */
  blur: { shadow: number; fold: number };
  /** C14b 붓 형상(경로가 있는 모티프만). 그림 좌표 0..100 리본 → transform으로 카드에 놓고, 인화 번짐과 같은 원으로 흐리게 지운다 */
  motifInk: MotifInkArt | null;
}

/** 담묵 면 한 덩이(같은 경로의 닫힌 모양들을 합친 하나) — 그림 좌표 */
export interface FaceArt {
  path: SkPath;
  tone: number;
  seed: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** 안쪽 젖은 테 폭(그림 단위) */
  rim: number;
}

/** 같은 경로 번호의 면을 합친다(겹친 곳 이음매 없음) */
export function faceGroups(faces: MotifInkLayer['faces']): FaceArt[] {
  const by = new Map<number, MotifInkLayer['faces']>();
  for (const f of faces) by.set(f.group, [...(by.get(f.group) ?? []), f]);
  return [...by.values()].map((fs) => {
    let path = polyPath(fs[0]!.poly);
    for (const f of fs.slice(1)) path = Skia.Path.MakeFromOp(path, polyPath(f.poly), PathOp.Union) ?? path;
    const f0 = fs[0]!;
    const size = Math.max(...fs.map((f) => f.size));
    return { path, tone: f0.tone, seed: f0.seed, from: { x: f0.from[0], y: f0.from[1] }, to: { x: f0.to[0], y: f0.to[1] }, rim: Math.max(0.8, size * WASH_FACE.rim) };
  });
}

export interface MotifInkArt {
  t: object[];
  layers: { layer: MotifInkLayer['layer']; verts: Verts; bleed: Verts; faces: FaceArt[] }[];
  /** 인화 번짐(셰이더 fade와 같은 원: 반경 0.9 → 1.12배에서 사라짐) */
  fade: { cx: number; cy: number; r: number };
  /** 글 줄 위 경계(이 아래로는 그리지 않는다) */
  yLim: number;
  /** 번짐 블러(px — 상자 변의 0.6%, 장치 0.5px 하한) */
  bleed: number;
  /** 그림 1단위 = px(transform 배율). 블러는 transform 안에서 그리므로 px 값을 이 값으로 나눠 넘긴다 */
  unit: number;
  /** 4차 혼합안: 사물 한 겹 래스터(그림 좌표 사각형). 있으면 keep 밖 경로는 그리지 않았다 */
  raster: { image: SkImage; mask: SkImage | null; cover: number; rect: { x: number; y: number; width: number; height: number }; seed: number } | null;
}

/** 카드 그림 단위와 화면의 관계(썸네일 LOD·블러 하한). 기본 = 화면 Canvas(그림 단위 = pt) */
export interface DreamArtOpts {
  /** 썸네일 LOD(D-24, 플래그 thumbLod) */
  lod?: boolean;
  /** 그림 1단위 = 몇 pt(오프스크린 썸네일은 px로 그리므로 1/배율) */
  ptPerUnit?: number;
  /** 그림 1단위 = 몇 장치 px(화면 Canvas = 화면 밀도, 오프스크린 = 1) */
  devicePerUnit?: number;
  /** 낙관(주사) 그리기, 기본 켬. 끄는 곳: 이레 영상 카드 칸(큰 인장 하나만, C7 리뷰 M-4) */
  seal?: boolean;
  /**
   * 밤 판(7차 — 2차 블라인드 '실제 밤 카드로 몽망이·마블링 대비 검증'). 지금 앱 카드는 늘 한지(낮)라 화면·공유에는 쓰지 않고,
   * 확인판(`?night=1`)·시험만 쓴다. 바탕 = 밤 물, 마블링·사물 먹 = 밝은 은회색 MOTIF_NIGHT_INK(곱하기 대신 '밝게'·'스크린'),
   * 몽망이 = 밤 몸 + 밝은 테(아트 바이블 4절 밤 토큰), 가림 = 밤 바탕
   */
  theme?: 'day' | 'night';
}

const GOLD_HEX = '#C9A45C';

interface Verts {
  vertices: SkPoint[];
  indices: number[];
}

function toVerts(rs: Ribbon[]): Verts {
  const vertices: SkPoint[] = [];
  const indices: number[] = [];
  for (const rb of rs) {
    const base = vertices.length;
    for (let i = 0; i < rb.positions.length; i += 2) vertices.push({ x: rb.positions[i]!, y: rb.positions[i + 1]! });
    for (let i = 0; i < rb.indices.length; i++) indices.push(rb.indices[i]! + base);
  }
  if (vertices.length === 0) {
    vertices.push({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 });
    indices.push(0, 1, 2);
  }
  return { vertices, indices };
}

function polyPath(flat: readonly number[], close = true): SkPath {
  const p = Skia.PathBuilder.Make();
  p.moveTo(flat[0]!, flat[1]!);
  for (let i = 2; i < flat.length; i += 2) p.lineTo(flat[i]!, flat[i + 1]!);
  if (close) p.close();
  return p.build();
}

/** 결정적 1차원 잡음(시드) — 종이 귀(deckle)·낙관 테두리 */
function jitter(seed: number): (t: number) => number {
  const h = (i: number) => {
    let x = (i * 374761393 + seed * 668265263) | 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296 - 0.5;
  };
  return (t: number) => {
    const i = Math.floor(t);
    const f = t - i;
    const u = f * f * (3 - 2 * f);
    return h(i) * (1 - u) + h(i + 1) * u;
  };
}

/** 손으로 뜬 한지 귀: 가장자리가 섬유처럼 들쭉날쭉한 사각형 */
function deckleRect(x: number, y: number, w: number, h: number, amp: number, step: number, seed: number): SkPath {
  const n1 = jitter(seed);
  const n2 = jitter(seed + 17);
  const pts: number[] = [];
  const edge = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number, off: number) => {
    const L = Math.hypot(bx - ax, by - ay);
    const m = Math.max(2, Math.round(L / step));
    for (let i = 0; i < m; i++) {
      const t = i / m;
      const d = (n1((off + t * L) / (step * 5)) * 0.7 + n2((off + t * L) / step) * 0.45) * amp;
      pts.push(ax + (bx - ax) * t + nx * d, ay + (by - ay) * t + ny * d);
    }
  };
  edge(x, y, x + w, y, 0, -1, 0);
  edge(x + w, y, x + w, y + h, 1, 0, w);
  edge(x + w, y + h, x, y + h, 0, 1, w + h);
  edge(x, y + h, x, y, -1, 0, 2 * w + h);
  return polyPath(pts);
}

/** 몽망이(감은 눈 — 꿈꾸는 중) 기하. 단위 W, 핵 중심 원점. 획 옷은 그리지 않는다 — 밤새 물에 풀려 마블링(획 빗질)이 됐다 */
function bodyGeometry(nStrokes: number, s: number, comb = true, shape?: BodyShape, eyeScale = 1, combScale = 1) {
  const core = polyPath(coreOutline(s, 160, shape?.core));
  // 썸네일 LOD(D-24): 빗 굵기·감은 눈 ×1.3까지(작은 카드에서 눈 호 두께 0.03W가 1px 아래로 내려가 사라지지 않게). 정본은 배율 1
  const combs = comb
    ? combStrands(nStrokes, s, COMB_REST, shape).map((st) => buildRibbon(st.pts, { widths: combScale === 1 ? st.widths : st.widths.map((w) => w * combScale), roundStart: true, roundEnd: true }))
    : [];
  const ec = eyeCenters(shape?.core);
  const sh0 = eyeShape('closed');
  const sh = eyeScale === 1 ? sh0 : sh0.map((v) => v * eyeScale);
  const ep = Skia.PathBuilder.Make();
  for (const cx of [ec.lx * s, ec.rx * s]) {
    ep.moveTo(cx + sh[0]!, ec.y * s + sh[1]!);
    for (let i = 2; i < sh.length; i += 2) ep.lineTo(cx + sh[i]!, ec.y * s + sh[i + 1]!);
    ep.close();
  }
  return { core, combs: toVerts(combs), eyes: ep.build() };
}

type BodyGeo = ReturnType<typeof bodyGeometry>;

interface QuiltArt {
  kind: 'quilt';
  path: SkPath;
  seams: SkPath;
  fold: SkPath;
  /** 판 1(C14b) 박음질 땀·번진 가장자리. 판 0 = 빌드 1 격자 빗금·먹 테 */
  v1: boolean;
}
interface CupArt {
  kind: 'cup';
  opening: { x: number; y: number; width: number; height: number };
  backRim: SkPath;
  front: SkPath;
  frontRim: SkPath;
  band: SkPath;
  handle: SkPath;
  saucer: { x: number; y: number; width: number; height: number };
  glaze: ReturnType<typeof marbleUniforms>;
  friend: { t: { translateX: number }[] | object[]; geo: BodyGeo; blob: SkPath | null } | null;
}
interface WindowArt {
  kind: 'window';
  /** 담묵 면 창 한 장(가장자리 손으로 뜬 결) */
  pane: SkPath;
  /** 밝은 바탕 틈 두 줄(굵기·기울기가 다름 — 같은 격자 금지, 3차 아트 리뷰) */
  gaps: { path: SkPath; w: number }[];
  /** 4차 혼합안: 창호지 + 손 그림자 래스터(불러왔을 때). 있으면 판·틈 대신 이것을 그린다 */
  raster: { image: SkImage; mask: SkImage | null; rect: { x: number; y: number; width: number; height: number } } | null;
}
/**
 * 8차(오너 충전 뒤 판 1에 바로): 이불·찻잔·찻잔 둘의 손질 래스터 사물(선화·벡터 그릇 대신). 몽망이 **앞**에 얹어 아랫몸을 덮는다 —
 * 가림 마스크는 clipY(그릇 입술) 아래에만(김 줄기가 몸 위에 종이색 줄을 긋지 않게). 찻잔 둘의 곁 잔은 래스터 없이 곁 방울만
 */
interface RasterVesselArt {
  kind: 'rvessel';
  raster: { image: SkImage; mask: SkImage | null; rect: { x: number; y: number; width: number; height: number }; clipY: number; flip: boolean; cover: number } | null;
  friend: CupArt['friend'];
}
type VesselArt = QuiltArt | CupArt | WindowArt | RasterVesselArt;
/** 래스터 그릇 자리(래스터 높이 비율): 입술(rim) = 몽망이 몸이 들어가는 선, 폭 배율 = 그릇 폭 대비 */
export const VESSEL_RASTER: Readonly<Record<string, { widthK: number; rim: number; cover: number }>> = {
  'near-alone.quilt': { widthK: 1.55, rim: -0.12, cover: 0.9 },
  'near-alone.teacup': { widthK: 1.3, rim: 0.42, cover: 0.9 },
  'near-with.teacup-two': { widthK: 1.15, rim: 0.68, cover: 0.9 },
};
/** 찻잔 둘 래스터 안 두 잔 자리(래스터 폭·높이 비율 — teacuptwo-o2 손질본에서 잼) */
const TEACUP_TWO_RASTER = { frontX: 0.31, frontRim: 0.68, frontW: 0.61, backX: 0.74, backRim: 0.31 } as const;

/** 반 타원(위 = −1, 아래 = +1) 경로 점 */
function halfEllipse(cx: number, cy: number, rx: number, ry: number, sign: 1 | -1, n = 32): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * (i / n);
    out.push(cx - Math.cos(a) * rx, cy + sign * Math.sin(a) * ry);
  }
  return out;
}

function vesselArt(v: DreamVessel, c0: { x: number; y: number }, W: number, scene: DreamScene, uni: (shift: [number, number]) => ReturnType<typeof marbleUniforms>, wpx: number, rev: number): VesselArt {
  const u = (x: number) => x * W;
  const cx = c0.x + u(v.x);
  const top = c0.y + u(v.y);
  const w = u(v.w);
  const h = u(v.h);
  if (v.kind === 'window') {
    const pane = deckleRect(cx - w / 2, top, w, h, u(0.0024), u(0.004), scene.seed & 0xffff);
    const j = jitter(scene.seed + 5);
    const line = (x0: number, y0: number, x1: number, y1: number) => {
      const b = Skia.PathBuilder.Make();
      b.moveTo(x0, y0);
      b.quadTo((x0 + x1) / 2 + u(0.003) * j(1), (y0 + y1) / 2 + u(0.003) * j(2), x1, y1);
      return b.build();
    };
    // 틈 두 줄은 모두 세로로, 서로 다른 굵기·기울기·자리(가운데를 비켜) — 십자·2×2 격자로 읽히지 않게(3차 아트 리뷰)
    const gaps = [
      { path: line(cx - w * 0.2, top - u(0.004), cx - w * 0.12, top + h + u(0.004)), w: w * 0.04 },
      { path: line(cx + w * 0.2, top - u(0.004), cx + w * 0.15, top + h + u(0.004)), w: w * 0.022 },
    ];
    const r = motifRaster('near-with.window-hand', rev);
    // 래스터는 창 자리보다 크게(5차: 4차의 1.5배 — 64pt에서 회색 네모로 보이지 않게, 창 너머 손 그림자까지) — 창 가운데에 맞춘다
    // 8차: 판 1 창 래스터는 손 없는 창살 창(windowsill) — 창 자리에 맞춘다
    const raster = r ? { image: r.ink, mask: r.mask, rect: fitRect(r.ink, [cx - w * 0.7, top - h * 0.25, w * 1.4, h * 1.4]) } : null;
    return { kind: 'window', pane, gaps, raster };
  }
  const vr = rev >= 1 ? VESSEL_RASTER[scene.motifId] : undefined;
  const rr = vr ? motifRaster(scene.motifId, rev) : null;
  if (vr && rr) {
    // 찻잔 둘의 곁 잔: 래스터 한 장이 두 잔을 함께 가지므로 이 자리는 그리지 않는다(곁 방울은 몽망이 잔 쪽에서 뒤 잔에 앉힌다)
    if (v.friend) return { kind: 'rvessel', raster: null, friend: null };
    const a = rr.ink.width() / rr.ink.height();
    const other = scene.vessels.find((o) => o.friend);
    if (other) {
      // 찻잔 둘(teacuptwo-o2 손질본, 비율은 래스터 기준): 앞·아래 큰 잔(가운데 x 0.31, 입술 y 0.68, 폭 0.61) = 몽망이 잔,
      // 뒤·위 작은 잔(가운데 x 0.74, 입술 y 0.31) = 곁 방울 잔. 곁 잔이 왼쪽이면 좌우 뒤집는다
      const T = TEACUP_TWO_RASTER;
      const flip = other.x < v.x;
      const wr = (w * vr.widthK) / T.frontW;
      const hr = wr / a;
      const x0 = flip ? cx - (1 - T.frontX) * wr : cx - T.frontX * wr;
      const y0 = top - T.frontRim * hr;
      const fx = flip ? x0 + (1 - T.backX) * wr : x0 + T.backX * wr;
      const fs = 0.55 * scene.body.s;
      return {
        kind: 'rvessel',
        raster: { image: rr.ink, mask: rr.mask, rect: { x: x0, y: y0, width: wr, height: hr }, clipY: top + u(0.012), flip, cover: vr.cover },
        friend: { t: [{ translateX: fx }, { translateY: y0 + T.backRim * hr + u(0.004) }, { scale: wpx }] as object[], geo: bodyGeometry(0, fs, false), blob: blobPath(fs, scene.seed + 7) },
      };
    }
    const wr = w * vr.widthK;
    const hr = wr / a;
    // 입술 자리(rim < 0 = 래스터 윗변이 그릇 자리보다 아래 — 이불은 눈 아래로 내려 덮는다)
    const y0 = top - vr.rim * hr;
    return { kind: 'rvessel', raster: { image: rr.ink, mask: rr.mask, rect: { x: cx - wr / 2, y: y0, width: wr, height: hr }, clipY: Math.max(top + u(0.012), y0), flip: false, cover: vr.cover }, friend: null };
  }
  if (v.kind === 'quilt') {
    // 누빔 이불: 물결진 윗단 + 둥근 아랫단, 마름모 바늘땀, 윗단 접힌 그늘
    const n = jitter(scene.seed + 9);
    const edge: number[] = [];
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = cx - w / 2 + w * t;
      edge.push(x, top + u(0.006) * Math.sin(t * 9 + 0.5) + u(0.004) * n(t * 7) + u(0.045) * (2 * t - 1) * (2 * t - 1) * (2 * t - 1) * (2 * t - 1));
    }
    const pb = Skia.PathBuilder.Make();
    pb.moveTo(edge[0]!, edge[1]!);
    for (let i = 2; i < edge.length; i += 2) pb.lineTo(edge[i]!, edge[i + 1]!);
    const ey = edge[edge.length - 1]!;
    pb.cubicTo(cx + w * 0.58, ey + h * 0.3, cx + w * 0.46, top + h * 0.95, cx + w * 0.1, top + h);
    pb.cubicTo(cx - w * 0.1, top + h * 1.04, cx - w * 0.46, top + h * 0.95, cx - w * 0.56, edge[1]! + h * 0.3);
    pb.cubicTo(cx - w * 0.58, edge[1]! + h * 0.12, cx - w * 0.52, edge[1]!, edge[0]!, edge[1]!);
    pb.close();
    const seams = Skia.PathBuilder.Make();
    if (rev >= 1) {
      // 누빔 박음질: 비스듬한 두 방향 줄을 따라 짧은 땀(길이·간격·어긋남이 시드로 흔들림) — 격자 빗금은 라켓·그물로 읽혔다(C14b 아트 리뷰 16)
      const k = u(0.056);
      const sj = jitter(scene.seed + 31);
      let st = 0;
      for (let d = -w; d <= w + h; d += k) {
        for (const dir of [1, -1] as const) {
          const x0 = dir === 1 ? cx - w / 2 + d : cx - w / 2 + d - h * 1.2;
          const y0 = top - u(0.02);
          const x1 = dir === 1 ? cx - w / 2 + d - h * 1.2 : cx - w / 2 + d;
          const y1 = top + h * 1.2;
          const L = Math.hypot(x1 - x0, y1 - y0);
          for (let t = (0.5 + sj(st++)) * u(0.012); t < L; ) {
            const len = u(0.007) * (1 + 0.6 * sj(st++));
            const off = u(0.0016) * sj(st++ * 3);
            const ax = x0 + ((x1 - x0) * t) / L + off;
            const ay = y0 + ((y1 - y0) * t) / L;
            seams.moveTo(ax, ay);
            seams.lineTo(ax + ((x1 - x0) * len) / L, ay + ((y1 - y0) * len) / L);
            t += len + u(0.012) * (1 + 0.8 * Math.abs(sj(st++)));
          }
        }
      }

    } else {
      // 판 0(빌드 1): 격자 빗금
      const k = u(0.034);
      for (let d = -w; d <= w + h; d += k) {
        seams.moveTo(cx - w / 2 + d, top - u(0.02));
        seams.lineTo(cx - w / 2 + d - h * 1.2, top + h * 1.2);
        seams.moveTo(cx - w / 2 + d - h * 1.2, top - u(0.02));
        seams.lineTo(cx - w / 2 + d, top + h * 1.2);
      }
    }
    return { kind: 'quilt', path: pb.build(), seams: seams.build(), fold: polyPath(edge.map((v2, i) => (i % 2 ? v2 + u(0.008) : v2)), false), v1: rev >= 1 };
  }
  // 옆에서 본 찻잔: 입술 타원 + 사발 + 굽 + 받침. 유약은 같은 물의 다른 자리(마블링)
  const rx = w / 2;
  const ry = h * 0.17;
  const bottom = top + h;
  const front = Skia.PathBuilder.Make();
  const lower = halfEllipse(cx, top, rx, ry, 1);
  front.moveTo(lower[0]!, lower[1]!);
  for (let i = 2; i < lower.length; i += 2) front.lineTo(lower[i]!, lower[i + 1]!);
  // lower는 왼→오가 아니라 a=0(왼)..π(오)
  front.cubicTo(cx + rx * 0.98, top + h * 0.55, cx + rx * 0.6, bottom, cx + rx * 0.32, bottom);
  front.lineTo(cx - rx * 0.32, bottom);
  front.cubicTo(cx - rx * 0.6, bottom, cx - rx * 0.98, top + h * 0.55, lower[0]!, lower[1]!);
  front.close();
  const band = polyPath(halfEllipse(cx, top + h * 0.42, rx * 0.9, ry * 0.9, 1), false);
  const hd = v.handle;
  const handle = Skia.PathBuilder.Make();
  const hx = cx + hd * rx * 0.93;
  handle.moveTo(hx, top + h * 0.2);
  handle.cubicTo(hx + hd * u(0.06), top + h * 0.12, hx + hd * u(0.06), top + h * 0.68, hx - hd * u(0.01), top + h * 0.62);
  // 유약 = 같은 물의 다른 자리(몽망이 자리 빈 물을 피해 옆 고리를 빌려 온다)
  const glazeShift: [number, number] = [0.27 - v.x, scene.ringC.y * 0.5 - v.y];
  let friend: CupArt['friend'] = null;
  if (v.friend) {
    const fs = 0.55 * scene.body.s;
    friend = { t: [{ translateX: cx }, { translateY: top + u(0.005) }, { scale: wpx }] as object[], geo: bodyGeometry(0, fs, false), blob: rev >= 1 ? blobPath(fs, scene.seed + 7) : null };
  }
  return {
    kind: 'cup',
    opening: { x: cx - rx * 0.96, y: top - ry * 0.96, width: rx * 1.92, height: ry * 1.92 },
    backRim: polyPath(halfEllipse(cx, top, rx, ry, -1), false),
    front: front.build(),
    frontRim: polyPath(lower, false),
    band,
    handle: handle.build(),
    saucer: { x: cx - rx * 1.45, y: bottom - u(0.012), width: rx * 2.9, height: u(0.03) },
    glaze: uni(glazeShift),
    friend,
  };
}

/** 제목 안전 여백(카드 폭 단위 → 픽셀). 시험이 이 영역에 그림 먹이 남지 않는지 픽셀로 본다 */
export function titleSafeArea(layout: DreamLayout, labels: DreamCardLabels, W: number): NonNullable<DreamArt['titleSafe']> {
  const it = layout.text.find((t) => t.key === 'name')!;
  const sh = layout.sheet;
  if (isVertical(it, labels)) {
    const n = [...labels.name].length;
    const x0 = it.x - it.size * 1.6;
    const y1 = it.y + n * it.size * 1.32 + it.size * 0.8;
    return { x: x0 * W, y: sh.y * W, width: (sh.x + sh.w - x0) * W, height: (y1 - sh.y) * W, fadeFrom: { x: (it.x - it.size * 0.7) * W, y: 0 }, fadeTo: { x: x0 * W, y: 0 } };
  }
  const y1 = it.y + it.size * 1.9;
  return { x: sh.x * W, y: sh.y * W, width: sh.w * W, height: (y1 - sh.y) * W, fadeFrom: { x: 0, y: (it.y + it.size * 0.5) * W }, fadeTo: { x: 0, y: y1 * W } };
}

export function makeDreamArt(input: DreamCardInput, aspect: DreamAspect, widthPx: number, aa: number, opts: DreamArtOpts = {}): DreamArt {
  // 개발 빌드만 미완 모티프(보름 번들 자리표시·초안)를 임시 형상으로 그린다. 제품은 형상 없는 일반 카드(core `dreamMotifShape`).
  // 꿈 모티프 25는 C14b 뒤 모두 형상이 있다(10 = 마블링 조작, 15 = 붓 경로 `scene.motifInk`)
  const scene = buildDreamScene({ card: input.card, strokes: input.strokes, aspect, ink: input.look?.ink, dev: typeof __DEV__ !== 'undefined' && __DEV__ === true });
  const shape = input.look?.shape;
  const layout = dreamCardLayout(aspect);
  const W = widthPx;
  const H = widthPx * layout.height;
  const u = (v: number) => v * W;
  const sh = layout.sheet;
  const c0 = { x: u(layout.print.x + scene.anchor.x), y: u(layout.print.y + scene.anchor.y) };
  const sheetPath = deckleRect(u(sh.x), u(sh.y), u(sh.w), u(sh.h), u(0.0035), u(0.0045), scene.seed & 0xffff);
  const pr = layout.print;
  // 인화 번짐 반경: 1.18R이면 바깥 감쇠가 한지 옆 가장자리(0.955)에 닿아 마블링이 네모로 잘려 보였다(블라인드 판정 '사각 페더') — 1.04R
  // 9:16은 인화가 넓어 한지 옆 가장자리 안(여백 1.2%)으로 한 번 더 줄인다
  const artRev = sim.dreamArtRevOf(input.card);
  const v1 = artRev >= 1;
  const fade: [number, number, number] = [u(pr.x), u(pr.y), v1 ? u(Math.min(pr.r * 1.04, (pr.x - sh.x - 0.012) / 1.12)) : u(pr.r * 1.18)];
  const lineItem = layout.text.find((t) => t.key === 'line')!;
  const yLim = u(lineItem.y - lineItem.size * 1.9);
  const uniforms = marbleUniforms(scene, [c0.x, c0.y], W, aa, fade, yLim, [0, 0], v1 ? 1 : 0);
  if (opts.theme === 'night') uniforms.inkC4 = [...hexRgb(MOTIF_NIGHT_INK).map((c) => c / 255), 1];
  const wpx = scene.body.w * W;
  const vessels = scene.vessels.map((v) => vesselArt(v, c0, W, scene, (sft) => marbleUniforms(scene, [c0.x, c0.y], W, aa, fade, yLim, sft, v1 ? 1 : 0), wpx, artRev));
  // 몸 폭(1W)의 pt → LOD. 문법은 카드 몸에 쓰지 않으므로(획은 마블링으로 풀림) 눈·빗 배율만 쓴다
  const L = bodyLod(wpx * (opts.ptPerUnit ?? 1), GRAMMARS.C, opts.lod ?? false);
  const body = bodyGeometry(input.strokes.length, scene.body.s, true, shape, L.eyeScale, L.combScale);
  const friend = scene.friend
    ? { t: [{ translateX: c0.x + u(scene.friend.x) }, { translateY: c0.y + u(scene.friend.y) }, { scale: wpx }] as object[], geo: bodyGeometry(0, scene.friend.r * scene.body.s, v1 && scene.friend.hold === true), eyes: v1 ? !scene.motifInk && Math.hypot(scene.friend.x, scene.friend.y) <= FRIEND_ADJ : !scene.motifInk, blob: v1 ? blobPath(scene.friend.r * scene.body.s, scene.seed, scene.friend.hold ? COMPANION.holdStretch : undefined) : null, hold: v1 && scene.friend.hold ? holdPath(scene.friend, scene.body.w, scene.friend.r * scene.body.s) : null }
    : null;
  // 낙관: 주사 인면에 몽망이(빗 포함)를 양각으로 새김 — 글꼴 없이 그리는 이 앱만의 인장
  const sl = layout.seal;
  const plate =
    input.sealSeed !== undefined
      ? sealPath(sealOutlineOf(input.sealSeed, u(sl.size) * (opts.ptPerUnit ?? 1)), u(sl.size), u(sl.x), u(sl.y))
      : deckleRect(u(sl.x), u(sl.y), u(sl.size), u(sl.size), u(0.0016), u(0.003), scene.seed & 0xff);
  const fig = bodyGeometry(0, 1.0, true, shape);
  const mi = scene.motifInk;
  // 사물 한 겹 래스터(불러왔을 때만 — 아니면 같은 형상의 경로 코드판)
  const rr = mi?.raster ? motifRaster(scene.motifId, artRev) : null;
  const rasterImg = rr?.ink ?? null;
  const motifInk: MotifInkArt | null = mi
    ? {
        t: [{ translateX: c0.x + u(mi.x) }, { translateY: c0.y + u(mi.y) }, { scale: u(mi.size) / 100 }, ...(mi.flip ? [{ translateX: 100 }, { scaleX: -1 }] : [])],
        layers: motifInkLayers(rasterImg && mi.raster ? mi.paths.filter((_, i) => mi.raster!.keep.includes(i)) : mi.paths).map((l) => ({
          layer: l.layer,
          verts: toVerts(l.ribbons),
          bleed: toVerts(l.bleed),
          faces: faceGroups(l.faces),
        })),
        fade: { cx: fade[0], cy: fade[1], r: fade[2] * 1.12 },
        yLim,
        bleed: blurFloorPt(u(mi.size) * 0.006, opts.devicePerUnit ?? 1),
        unit: u(mi.size) / 100,
        raster: rr && mi.raster ? { image: rr.ink, mask: rr.mask, cover: mi.raster.cover, rect: mi.raster.stretch ? { x: mi.raster.box[0], y: mi.raster.box[1], width: mi.raster.box[2], height: mi.raster.box[3] } : fitRect(rr.ink, mi.raster.box), seed: scene.seed % 997 } : null,
      }
    : null;
  const night = Math.max(1, input.card.night);
  const idx = (night - 1) % 7;
  const d = layout.dots;
  const dots = Array.from({ length: 7 }, (_, i) => ({
    x: u(d.x + (i - 3) * d.gap),
    y: u(d.y),
    r: u(d.r) * (i === idx ? 1.25 : 1),
    kind: (i < idx ? 'past' : i === idx ? 'now' : 'future') as 'past' | 'now' | 'future',
  }));
  return {
    W,
    H,
    scene,
    layout,
    c0,
    sheetPath,
    shadowRect: { x: u(sh.x) + u(0.004), y: u(sh.y) + u(0.012), width: u(sh.w), height: u(sh.h) },
    uniforms,
    vessels,
    body,
    friend,
    ringPx: { x: c0.x + u(scene.ringC.x), y: c0.y + u(scene.ringC.y), r: u(pr.r) },
    seal: { plate, figure: fig.core, combs: fig.combs, eyes: fig.eyes },
    showSeal: opts.seal ?? true,
    theme: opts.theme ?? 'day',
    titleSafe: v1 ? titleSafeArea(layout, input.labels ?? defaultLabels(input.card), W) : null,
    dots,
    // 블러 마스크 장치 0.5px 하한(눈 소실 결함과 같은 GPU 문턱). 큰 카드는 입력 그대로
    blur: { shadow: blurFloorPt(W * 0.012, opts.devicePerUnit ?? 1), fold: blurFloorPt(W * 0.003, opts.devicePerUnit ?? 1) },
    motifInk,
  };
}

/** 가림 층 종이 토큰(카드 한지). 밤 화면에 사물을 얹을 때는 밤 바탕 토큰을 넘긴다 */
export const COVER_PAPER = PALETTE.day.bg;
/** 창가 손 가림 농도(창호지 — 불투명) */
export const WINDOW_COVER = 0.85;
/** 밤 카드 몽망이 달빛 테(8차): 몸은 검은 먹 그대로, 테(몸 폭 단위 선 굵기)·후광은 밝은 은회색 */
export const NIGHT_MOON_RIM = { color: MOTIF_NIGHT_INK, width: 0.045, halo: 0.16, haloAlpha: 0.35 } as const;

/**
 * 붓 층 색·불투명도(아트 바이블 7-6 ②): 모티프 먹은 몸 먹의 MOTIF_INK_MAX(0.72) 이하 — 순흑은 몽망이 몸만. 담묵은 새 획 먹을 옅게,
 * 금은 머리카락 금점. face = 담묵 면 칠(면마다 따로 칠해 겹친 곳이 짙다 = 접힌 그늘), rim = 젖은 테(면의 1.3배)
 */
export const INK_LAYER: Record<MotifInkLayer['layer'], { color: string; alpha: number }> = {
  ink: { color: PALETTE.day.body, alpha: MOTIF_INK_MAX },
  // 8차: 담묵 획 한 단계 진하게(0.34 → 0.42, 먹 상한 안)
  wash: { color: PALETTE.day.strokeInk, alpha: 0.42 },
  gold: { color: GOLD_HEX, alpha: 0.95 },
};
/** 번짐 한 겹(폭 1.6배 리본) 불투명도 */
export const INK_BLEED = 0.12;
/** 흰 바탕과 섞은 불투명 색(먹 a만큼) — 모티프 층 안에서는 불투명하게 칠하고 '어둡게(darken)'로 겹쳐 겹친 곳이 짙어지지 않게 한다 */
function pm(hex: string, a: number, base = 255): string {
  const [r, g, b] = hexRgb(hex);
  const m = (c: number) => Math.round(c * a + base * (1 - a));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
const blendPaints = new Map<string, ReturnType<typeof Skia.Paint>>();
function blendPaint(mode: 'darken' | 'multiply' | 'lighten' | 'screen') {
  let p = blendPaints.get(mode);
  if (!p) {
    p = Skia.Paint();
    p.setBlendMode(mode === 'darken' ? BlendMode.Darken : mode === 'multiply' ? BlendMode.Multiply : mode === 'lighten' ? BlendMode.Lighten : BlendMode.Screen);
    blendPaints.set(mode, p);
  }
  return p;
}

/**
 * C14b 붓 형상(② 면·③ 획 — ① 장 변형은 마블링 셰이더가 그린다). 모든 칠은 흰 바탕과 섞은 **불투명 색**으로 '어둡게' 겹친다 —
 * 겹친 곳은 둘 중 짙은 쪽일 뿐 더 짙어지지 않아 이음매가 없고, 어떤 겹침도 먹 상한(MOTIF_INK_MAX)을 넘지 않는다(2차 아트 리뷰:
 * 우산 막대가 몸처럼 검었다). 층 전체는 '곱하기'로 마블링 위에 얹어 물에 스민 먹처럼 아래 띠가 비친다.
 * 담묵 면 = 또렷한 가장자리 + 안쪽 젖은 테 + 한쪽으로 짙은 농담 + 종이 결 + 바깥 0.5% 번짐(2차 리뷰 2-1).
 * 인화 바깥은 셰이더와 같은 원으로 지우고 글 줄 위에서 자른다
 */
export function MotifInkArtView({ ink, W, paper = COVER_PAPER, night = false }: { ink: MotifInkArt; W: number; /** 가림 층 색(종이 토큰) */ paper?: string; /** 밤 판: 밝은 먹을 '밝게'로 겹치고 '스크린'으로 얹는다(곱하기 없음) */ night?: boolean }) {
  const { fade } = ink;
  const bl = (k: number) => (ink.bleed * k) / ink.unit;
  const dk = blendPaint(night ? 'lighten' : 'darken');
  // 밤: 먹 색 = 밝은 은회색, 섞는 바탕 = 검정(낮의 흰 바탕과 거꾸로)
  const col = (c: string) => (night ? MOTIF_NIGHT_INK : c);
  const base = night ? 0 : 255;
  const fadeFill = (
    <Fill blendMode="dstIn">
      <RadialGradient c={vec(fade.cx, fade.cy)} r={fade.r} colors={['#000000', '#000000', 'rgba(0,0,0,0)']} positions={[0, 0.9 / 1.12, 1]} />
    </Fill>
  );
  return (
    <Group clip={{ x: 0, y: 0, width: W, height: ink.yLim }}>
      {/* 가림 층(5차): 래스터 사물 실루엣을 종이 토큰으로 cover만큼 덮어 사물 너머 띠가 비치지 않게 — 먹 층 아래 */}
      {ink.raster?.mask && (
        <Group layer>
          <Group transform={ink.t as never} opacity={ink.raster.cover}>
            <SkImageNode image={ink.raster.mask} rect={ink.raster.rect} fit="fill">
              <BlendColor color={paper} mode="srcIn" />
            </SkImageNode>
          </Group>
          {fadeFill}
        </Group>
      )}
      <Group layer={blendPaint(night ? 'screen' : 'multiply')}>
        {ink.raster && (
          <Group layer={dk}>
            <Group transform={ink.t as never}>
              {/* 손질한 먹 한 겹: 알파(≤ 0.72)에 테마 먹 색을 입힌다 + 공통 종이 결 */}
              <Group layer>
                <SkImageNode image={ink.raster.image} rect={ink.raster.rect} fit="fill">
                  <BlendColor color={night ? MOTIF_NIGHT_INK : INK_LAYER.ink.color} mode="srcIn" />
                </SkImageNode>
                <Fill blendMode="srcATop" opacity={WASH_FACE.grain}>
                  <FractalNoise freqX={0.9} freqY={0.6} octaves={2} seed={ink.raster.seed} />
                </Fill>
              </Group>
            </Group>
          </Group>
        )}
        {ink.layers.map(({ layer, verts, bleed, faces }) => {
          const st = INK_LAYER[layer];
          return (
            <Group key={layer}>
              {faces.map((f, k) => (
                <Group key={`f${k}`} layer={dk}>
                  <Group transform={ink.t as never}>
                    {/* 바깥으로 아주 조금 번짐 */}
                    <Path path={f.path} color={pm(col(st.color), f.tone * 0.35, base)}>
                      <BlurMask blur={bl(0.8)} style="outer" />
                    </Path>
                    <Group clip={f.path}>
                      {/* 면: 가장자리는 또렷하게, 붓이 처음 닿은 쪽이 짙다 */}
                      <Path path={f.path}>
                        <LinearGradient start={vec(f.from.x, f.from.y)} end={vec(f.to.x, f.to.y)} colors={[pm(col(st.color), f.tone, base), pm(col(st.color), f.tone * WASH_FACE.slope, base)]} />
                      </Path>
                      {/* 젖은 테: 안쪽 띠가 rimDark배 */}
                      <Path path={f.path} style="stroke" strokeWidth={f.rim * 2} strokeJoin="round" color={pm(col(st.color), f.tone * WASH_FACE.rimDark, base)} />
                      {/* 종이 결(시드 결정, base) */}
                      <Fill blendMode="multiply" opacity={WASH_FACE.grain}>
                        <FractalNoise freqX={0.9} freqY={0.6} octaves={2} seed={f.seed % 997} />
                      </Fill>
                    </Group>
                  </Group>
                </Group>
              ))}
              {layer !== 'gold' && (
                <Group layer={dk}>
                  <Group transform={ink.t as never}>
                    <Vertices vertices={bleed.vertices} indices={bleed.indices} mode="triangles" color={pm(col(st.color), INK_BLEED, base)}>
                      <BlurMask blur={bl(2)} style="normal" />
                    </Vertices>
                  </Group>
                </Group>
              )}
              <Group layer={dk}>
                <Group transform={ink.t as never}>
                  <Vertices vertices={verts.vertices} indices={verts.indices} mode="triangles" color={pm(col(st.color), st.alpha, base)}>
                    {layer !== 'gold' && <BlurMask blur={bl(0.35)} style="normal" />}
                  </Vertices>
                </Group>
              </Group>
            </Group>
          );
        })}
        <Fill blendMode="dstIn">
          <RadialGradient c={vec(fade.cx, fade.cy)} r={fade.r} colors={['#000000', '#000000', 'rgba(0,0,0,0)']} positions={[0, 0.9 / 1.12, 1]} />
        </Fill>
      </Group>
    </Group>
  );
}

const PAPER_BASE = [0xef / 255, 0xe8 / 255, 0xda / 255];

/** 래스터 그릇 한 쪽(8차): back = 입술 위(김 — 몸 뒤), front = 입술 아래(그릇 — 몸 앞, 가림 마스크 포함) */
function RasterVessel({ r, part, night, W, H, seed }: { r: NonNullable<RasterVesselArt['raster']>; part: 'back' | 'front'; night: boolean; W: number; H: number; seed: number }) {
  const clip = part === 'front' ? { x: -W, y: r.clipY, width: W * 3, height: H } : { x: -W, y: -H, width: W * 3, height: H + r.clipY };
  return (
    <Group clip={clip}>
      <Group transform={r.flip ? [{ translateX: r.rect.x * 2 + r.rect.width }, { scaleX: -1 }] : []}>
        {part === 'front' && r.mask && (
          <Group opacity={r.cover}>
            <SkImageNode image={r.mask} rect={r.rect} fit="fill">
              <BlendColor color={night ? PALETTE.night.bg : COVER_PAPER} mode="srcIn" />
            </SkImageNode>
          </Group>
        )}
        <Group layer>
          <SkImageNode image={r.image} rect={r.rect} fit="fill">
            <BlendColor color={night ? MOTIF_NIGHT_INK : PALETTE.day.body} mode="srcIn" />
          </SkImageNode>
          <Fill blendMode="srcATop" opacity={WASH_FACE.grain}>
            <FractalNoise freqX={0.9} freqY={0.6} octaves={2} seed={seed % 997} />
          </Fill>
        </Group>
      </Group>
    </Group>
  );
}

/** 판 1 곁 방울 꼴(몸 폭 W 단위, 몸 핵 크기 s의 반경). 몸과 같은 자리 변환(t)으로 그린다 */
function blobPath(s: number, seed: number, stretch?: number): SkPath {
  const r = 0.46 * s;
  return polyPath(companionBlob(seed, 48, stretch).map((v) => v * r));
}

/** 손잡음(8차): 곁 방울 아래쪽에서 몸 쪽으로 뻗어 몸 가장자리에 닿는 짧은 붓 한 줌(곁 좌표 — 몸 폭 단위) */
function holdPath(f: { x: number; y: number }, bw: number, s: number): SkPath {
  const bx = -f.x / bw;
  const by = -f.y / bw;
  const d = Math.hypot(bx, by) || 1;
  const b = Skia.PathBuilder.Make();
  const y0 = 0.12 * s;
  b.moveTo((bx / d) * 0.3 * s, y0);
  b.quadTo((bx / d) * 0.55, y0 + 0.08, bx * 0.55, by + 0.16);
  return b.build();
}

/** 판 1 곁 방울: 담묵 면 + 젖은 테(합쳐 COMPANION.total 이하), 눈 없음 — 몽망이(순흑·흰 눈)와 재질로 갈린다 */
function Companion({ t, blob, hold = null, combs = null, night = false }: { t: object[]; blob: SkPath; hold?: SkPath | null; /** 손잡은 곁의 빗(8차 — 돌이 아니라 살아 있는 방울로) */ combs?: BodyGeo['combs'] | null; night?: boolean }) {
  const rim = 1 - (1 - COMPANION.total) / (1 - COMPANION.fill);
  const c = night ? MOTIF_NIGHT_INK : PALETTE.day.body;
  return (
    <Group transform={t as never}>
      {hold && <Path path={hold} style="stroke" strokeWidth={0.2} strokeCap="round" color={c} opacity={COMPANION.total} />}
      {combs && <Vertices vertices={combs.vertices} indices={combs.indices} mode="triangles" color={c} opacity={COMPANION.total} />}
      <Path path={blob} color={c} opacity={COMPANION.fill} />
      <Path path={blob} style="stroke" strokeWidth={0.06} color={c} opacity={rim} />
    </Group>
  );
}

function Drop({ t, geo, color = PALETTE.day.body, eyes = true, night = false }: { t: object[]; geo: BodyGeo; color?: string; eyes?: boolean; night?: boolean }) {
  if (night) {
    // 밤 카드 몸(8차, 3차 블라인드: 베이지로 뒤집힌 몸이 감자·콩으로 읽혀 '검은 먹 방울' 정체성이 깨짐): 몸은 낮과 같은 검은 먹, 둘레에
    // 가는 은회색 달빛 테 + 옅은 흰 후광으로 남색 바탕·밝은 띠에서 떼어 낸다. 눈은 종이색
    return (
      <Group transform={t as never}>
        <Path path={geo.core} style="stroke" strokeWidth={NIGHT_MOON_RIM.halo} color={NIGHT_MOON_RIM.color} opacity={NIGHT_MOON_RIM.haloAlpha}>
          <BlurMask blur={NIGHT_MOON_RIM.halo * 0.6} style="normal" />
        </Path>
        <Path path={geo.core} style="stroke" strokeWidth={NIGHT_MOON_RIM.width} color={NIGHT_MOON_RIM.color} />
        <Vertices vertices={geo.combs.vertices} indices={geo.combs.indices} mode="triangles" color={NIGHT_MOON_RIM.color} opacity={0.9} />
        <Path path={geo.core} color={color} />
        <Vertices vertices={geo.combs.vertices} indices={geo.combs.indices} mode="triangles" color={color} />
        {eyes && <Path path={geo.eyes} color={PALETTE.day.bg} />}
      </Group>
    );
  }
  return (
    <Group transform={t as never}>
      <Path path={geo.core} color={color} />
      <Vertices vertices={geo.combs.vertices} indices={geo.combs.indices} mode="triangles" color={color} />
      {eyes && <Path path={geo.eyes} color={PALETTE.day.bg} />}
    </Group>
  );
}

/** 카드 그림(글 제외). Canvas 안에도, drawAsImage(오프스크린)에도 그대로 쓴다. 셰이더가 없으면 평평한 먹 층 */
export function DreamCardArt({ art }: { art: DreamArt }) {
  const { W, H, c0, layout } = art;
  const fx = getMarbleFx();
  const wpx = art.scene.body.w * W;
  const bodyT = [{ translateX: c0.x }, { translateY: c0.y }, { scale: wpx }];
  const sl = layout.seal;
  const sealC = { x: (sl.x + sl.size / 2) * W, y: (sl.y + sl.size * 0.56) * W };
  const sealT = [{ translateX: sealC.x }, { translateY: sealC.y }, { scale: sl.size * W * 0.66 }];
  const nightArt = art.theme === 'night';
  const paperU = { res: [W, H], base: nightArt ? hexRgb(PALETTE.night.bg).map((c) => c / 255) : PAPER_BASE, light: nightArt ? 0.6 : 1 };
  const lw = W * 0.0024;
  return (
    <Group>
      {/* 밤 물(건져 올린 자리) */}
      <Rect x={0} y={0} width={W} height={H}>
        <LinearGradient start={vec(0, 0)} end={vec(0, H)} colors={['#1A2137', '#141A2C', '#0C101D']} />
      </Rect>
      <Rect x={0} y={0} width={W} height={H} opacity={0.5}>
        <RadialGradient c={vec(W * 0.5, H * 0.42)} r={H * 0.6} colors={['rgba(201,164,92,0.10)', 'rgba(20,26,44,0)']} />
      </Rect>
      <Rect rect={art.shadowRect} color="rgba(0,0,0,0.55)">
        <BlurMask blur={art.blur.shadow} style="normal" />
      </Rect>
      <Group clip={art.sheetPath}>
        <Fill>
          <Shader source={paperFx} uniforms={paperU} />
        </Fill>
        {fx ? (
          <Fill>
            <Shader source={fx} uniforms={art.uniforms} />
          </Fill>
        ) : (
          // 폴백: 셰이더 컴파일 실패 기기 — 고리 중심에 번진 담묵 한 층(앱은 계속 간다)
          <Circle cx={art.ringPx.x} cy={art.ringPx.y} r={art.ringPx.r}>
            <RadialGradient c={vec(art.ringPx.x, art.ringPx.y)} r={art.ringPx.r} colors={['rgba(95,92,86,0.32)', 'rgba(95,92,86,0.18)', 'rgba(95,92,86,0)']} />
          </Circle>
        )}
        {/* 그릇 뒤쪽(찻물·뒷입술·받침) */}
        {/* 창가 손 래스터(5차): 몽망이보다 먼저 — 창이 커져도 몸을 덮지 않게 */}
        {art.vessels.map((v, i) =>
          v.kind === 'window' && v.raster ? (
            <Group key={`w${i}`}>
              {v.raster.mask && (
                <Group opacity={WINDOW_COVER}>
                  <SkImageNode image={v.raster.mask} rect={v.raster.rect} fit="fill">
                    <BlendColor color={nightArt ? PALETTE.night.bg : COVER_PAPER} mode="srcIn" />
                  </SkImageNode>
                </Group>
              )}
              <Group layer>
                <SkImageNode image={v.raster.image} rect={v.raster.rect} fit="fill">
                  <BlendColor color={nightArt ? MOTIF_NIGHT_INK : PALETTE.day.body} mode="srcIn" />
                </SkImageNode>
              </Group>
            </Group>
          ) : null,
        )}
        {art.vessels.map((v, i) =>
          v.kind === 'cup' ? (
            <Group key={`b${i}`}>
              <Oval rect={v.saucer} color={PALETTE.day.wash} opacity={0.55} />
              <Oval rect={v.opening} color={PALETTE.day.strokeInk} opacity={0.32} />
              <Path path={v.backRim} style="stroke" strokeWidth={lw} color={PALETTE.day.body} opacity={0.75} />
            </Group>
          ) : null,
        )}
        {art.vessels.map((v, i) => (v.kind === 'rvessel' && v.raster ? <RasterVessel key={`rb${i}`} r={v.raster} part="back" night={nightArt} W={W} H={H} seed={art.scene.seed} /> : null))}
        {art.motifInk && <MotifInkArtView ink={art.motifInk} W={W} night={nightArt} paper={nightArt ? PALETTE.night.bg : COVER_PAPER} />}
        {art.friend && (art.friend.blob ? <Companion t={art.friend.t} blob={art.friend.blob} hold={art.friend.hold} combs={art.friend.hold ? art.friend.geo.combs : null} night={nightArt} /> : <Drop t={art.friend.t} geo={art.friend.geo} eyes={art.friend.eyes} night={nightArt} />)}
        {art.vessels.map((v, i) => ((v.kind === 'cup' || v.kind === 'rvessel') && v.friend ? v.friend.blob ? <Companion key={`f${i}`} t={v.friend.t} blob={v.friend.blob} /> : <Drop key={`f${i}`} t={v.friend.t} geo={v.friend.geo} /> : null))}
        {/* 몽망이 */}
        <Drop t={bodyT} geo={art.body} night={nightArt} />
        {/* 그릇 앞쪽(사발·이불) — 몸 아래를 덮는다 */}
        {/* 래스터 그릇(8차): 입술 아래는 몸 앞 — 입술 아래만 종이 토큰으로 가리고 먹 한 겹을 얹는다(입술 위 김은 몸 뒤에 먼저 그렸다) */}
        {art.vessels.map((v, i) => (v.kind === 'rvessel' && v.raster ? <RasterVessel key={`r${i}`} r={v.raster} part="front" night={nightArt} W={W} H={H} seed={art.scene.seed} /> : null))}
        {art.vessels.map((v, i) =>
          v.kind === 'cup' ? (
            <Group key={`c${i}`}>
              <Path path={v.front} color="#EDE6D8" />
              {fx && (
                <Group clip={v.front} opacity={0.9}>
                  <Fill>
                    <Shader source={fx} uniforms={v.glaze} />
                  </Fill>
                </Group>
              )}
              <Path path={v.band} style="stroke" strokeWidth={W * 0.0016} color={GOLD_HEX} opacity={0.9} />
              <Path path={v.front} style="stroke" strokeWidth={lw} color={PALETTE.day.body} opacity={0.75} />
              <Path path={v.frontRim} style="stroke" strokeWidth={lw * 1.3} color={PALETTE.day.body} opacity={0.85} />
              <Path path={v.handle} style="stroke" strokeWidth={W * 0.007} strokeCap="round" color={PALETTE.day.body} opacity={0.8} />
            </Group>
          ) : v.kind === 'rvessel' || (v.kind === 'window' && v.raster) ? null : v.kind === 'window' ? (
            <Group key={`w${i}`}>
              <Group clip={v.pane}>
                <Path path={v.pane} color={PALETTE.day.strokeInk} opacity={0.34} />
                {/* 젖은 테(안쪽 가장자리가 짙다) */}
                <Path path={v.pane} style="stroke" strokeWidth={W * 0.008} color={PALETTE.day.strokeInk} opacity={0.25} />
                {v.gaps.map((g, k) => (
                  <Path key={k} path={g.path} style="stroke" strokeWidth={g.w} strokeCap="butt" color="#EFE8DA" opacity={0.92} />
                ))}
              </Group>
            </Group>
          ) : (
            <Group key={`q${i}`}>
              <Path path={v.path} color="#EAE1CF" />
              <Group clip={v.path}>
                {v.v1 ? (
                  <Path path={v.seams} style="stroke" strokeWidth={W * 0.0013} strokeCap="round" color={PALETTE.day.wash} opacity={0.75} />
                ) : (
                  <Path path={v.seams} style="stroke" strokeWidth={W * 0.0014} color={PALETTE.day.inkFaded} opacity={0.85} />
                )}
                <Path path={v.fold} style="stroke" strokeWidth={W * 0.006} color={PALETTE.day.wash} opacity={0.6}>
                  <BlurMask blur={art.blur.fold} style="normal" />
                </Path>
              </Group>
              {/* 판 1: 이불 가장자리는 짙은 테가 아니라 번진 담묵 — 마블링 띠로 이어진다. 판 0 = 빌드 1 먹 테 */}
              {v.v1 ? (
                <Path path={v.path} style="stroke" strokeWidth={lw * 1.6} color={PALETTE.day.strokeInk} opacity={0.4}>
                  <BlurMask blur={art.blur.fold} style="normal" />
                </Path>
              ) : (
                <Path path={v.path} style="stroke" strokeWidth={lw} color={PALETTE.day.body} opacity={0.7} />
              )}
            </Group>
          ),
        )}
        {/* 제목 안전 여백: 이름 줄 자리를 한지로 다시 덮어 마블링·모티프가 글과 겹치지 않게(가장자리는 부드럽게 사라짐) */}
        {art.titleSafe && (
        <Group layer>
          <Rect rect={{ x: art.titleSafe!.x, y: art.titleSafe!.y, width: art.titleSafe!.width, height: art.titleSafe!.height }}>
            <Shader source={paperFx} uniforms={paperU} />
          </Rect>
          <Rect rect={{ x: art.titleSafe!.x, y: art.titleSafe!.y, width: art.titleSafe!.width, height: art.titleSafe!.height }} blendMode="dstIn">
            <LinearGradient start={vec(art.titleSafe!.fadeFrom.x, art.titleSafe!.fadeFrom.y)} end={vec(art.titleSafe!.fadeTo.x, art.titleSafe!.fadeTo.y)} colors={['#000000', 'rgba(0,0,0,0)']} />
          </Rect>
        </Group>
        )}
        {/* 일곱 날 점 줄(05b에서 가져온 장치) */}
        {art.dots.map((d, i) =>
          d.kind === 'future' ? (
            <Circle key={i} cx={d.x} cy={d.y} r={d.r} style="stroke" strokeWidth={W * 0.0012} color={nightArt ? NIGHT_SUB_TEXT : PALETTE.day.inkFaded} />
          ) : (
            // 밤 판(8차): 날 점도 보조 줄과 같은 밝은 토큰(지난 날 = 보조 줄 색, 오늘 = 본문 밤 글 색)
            <Circle key={i} cx={d.x} cy={d.y} r={d.r} color={nightArt ? (d.kind === 'now' ? PALETTE.night.text : NIGHT_SUB_TEXT) : d.kind === 'now' ? PALETTE.day.body : PALETTE.day.inkFaded} />
          ),
        )}
        {/* 낙관(주사, 한 화면 한 곳) */}
        {art.showSeal && (
          <Group opacity={0.93}>
            <Path path={art.seal.plate} color={PALETTE.day.accent} />
            <Group transform={sealT}>
              <Path path={art.seal.figure} color={PALETTE.day.bg} />
              <Vertices vertices={art.seal.combs.vertices} indices={art.seal.combs.indices} mode="triangles" color={PALETTE.day.bg} />
              <Path path={art.seal.eyes} color={PALETTE.day.accent} />
            </Group>
          </Group>
        )}
      </Group>
    </Group>
  );
}

// ---------- 글 ----------

export function textOf(item: DreamTextItem, labels: DreamCardLabels): string {
  return labels[item.key];
}

/** 세로쓰기는 한글이 든 8자 이하만(아트 6절). 길거나 라틴 글자면 가로로 */
export function isVertical(item: DreamTextItem, labels: DreamCardLabels): boolean {
  const s = labels[item.key];
  return item.vertical && [...s].length <= 8 && /[\uAC00-\uD7A3]/.test(s) && !/[A-Za-z]/.test(s);
}

function fontFor(role: DreamTextItem['role']) {
  return cardFontFor(role, Platform.OS === 'web');
}

/** 카드 위 글 한 덩이(폭 = 1 단위). 가로 글은 줄로 나눈 결과와 줄마다의 기준선을 갖는다 — 화면·웹 PNG·네이티브 PNG가 같은 배치를 쓴다 */
export interface CardTextBox {
  item: DreamTextItem;
  vertical: boolean;
  /** 세로면 글자 하나씩, 가로면 줄 */
  lines: string[];
  /** 기준 x(폭 단위). 세로 이름이 가로로 바뀌면 카드 가운데(0.5)로 옮긴다 */
  x: number;
  /** 가로: 줄마다 기준선 y(폭 단위). 세로: 첫 글자 위쪽 y */
  ys: number[];
  size: number;
  spacing: number;
}

/** 글자 폭 어림(em). 줄 나눔 판단용이라 조금 넉넉하게 잡는다 */
function advance(ch: string, loc: 'ko' | 'en'): number {
  if (/[\uAC00-\uD7A3]/.test(ch)) return 0.95;
  if (ch === ' ') return loc === 'en' ? 0.25 : 0.3;
  if (/[A-Z]/.test(ch)) return 0.66;
  if (/[mwMW—]/.test(ch)) return 0.78;
  if (/[il.,\u0027\u2019·:;!|]/.test(ch)) return 0.26;
  return loc === 'en' ? 0.45 : 0.55;
}
export function textWidth(s: string, size: number, spacing: number, loc: 'ko' | 'en'): number {
  let w = 0;
  for (const ch of s) w += advance(ch, loc) * size + spacing;
  return w;
}

/** 공백에서 줄을 나눈다(최대 maxLines). 넘치면 null */
function wrapWords(s: string, maxW: number, size: number, spacing: number, loc: 'ko' | 'en', maxLines: number): string[] | null {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (textWidth(next, size, spacing, loc) <= maxW || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines || lines.some((l) => textWidth(l, size, spacing, loc) > maxW)) return null;
  return lines;
}

/** 글 너비 한도(폭의 84%, 가운데 정렬) */
export const CARD_TEXT_W = 0.84;

/**
 * 카드 글 배치(D-17): 한국어 이름은 세로, 영어 이름은 가로(자간 좁게). 문장은 한 줄을 넘으면 두 줄로 나누고 글자를 조금 줄이며,
 * 보조 줄은 문장 마지막 줄 아래로 따라 내려간다(일곱 날 점 줄 위에서 멈춘다).
 */
export function cardTextBoxes(items: readonly DreamTextItem[], labels: DreamCardLabels, loc = getLocale()): CardTextBox[] {
  const k = cardFontScale(loc);
  const out: CardTextBox[] = [];
  let lastBase = 0;
  let lineCount = 1;
  for (const it of items) {
    const text = labels[it.key];
    if (isVertical(it, labels)) {
      out.push({ item: it, vertical: true, lines: [...text], x: it.x, ys: [it.y], size: it.size, spacing: 0 });
      continue;
    }
    let size = it.size * k;
    const spacing = it.key === 'name' && loc === 'en' ? 0.002 : it.spacing;
    if (it.key === 'line') {
      let lines = wrapWords(text, CARD_TEXT_W, size, spacing, loc, 1);
      if (!lines) {
        size = it.size * (loc === 'en' ? 1 : 0.93);
        for (let i = 0; i < 6 && !(lines = wrapWords(text, CARD_TEXT_W, size, spacing, loc, 2)); i++) size *= 0.92;
      }
      lines ??= [text];
      const ys = lines.map((_, i) => it.y + i * size * 1.26);
      lastBase = ys[ys.length - 1]!;
      lineCount = lines.length;
      out.push({ item: it, vertical: false, lines, x: it.x, ys, size, spacing });
      continue;
    }
    // 보조 줄: 문장이 두 줄이면 마지막 줄 아래로(간격은 조금 좁힌다)
    const y = it.key === 'sub' && lineCount > 1 ? lastBase + 0.039 : it.y;
    let lines = wrapWords(text, CARD_TEXT_W, size, spacing, loc, 1);
    for (let i = 0; i < 6 && !lines; i++) {
      size *= 0.92;
      lines = wrapWords(text, CARD_TEXT_W, size, spacing, loc, 1);
    }
    out.push({ item: it, vertical: false, lines: lines ?? [text], x: it.vertical ? 0.5 : it.x, ys: [y], size, spacing });
  }
  return out;
}

/** 화면용 카드: Skia 그림 + RN 글(접근성·글꼴). 공유 이미지는 renderDreamCardImage */
export function DreamCard({
  card,
  strokes,
  labels,
  width,
  aspect = '4:5',
  a11yLabel,
  look,
  sealSeed,
  theme = 'day',
}: DreamCardInput & {
  width: number;
  aspect?: DreamAspect;
  /** 스크린리더 설명(모티프·아침 문장). 없으면 이름·문장 */ a11yLabel?: string;
  /** 밤 판(밤 화면에 카드를 얹는 곳 — 사물·마블링 먹은 MOTIF_NIGHT_INK, 곱하기 없음). 기본 낮 */
  theme?: 'day' | 'night';
}) {
  const lod = useFeature('thumbLod');
  const rasters = useMotifRasters();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- rasters는 래스터 사물을 불러온 뒤 다시 그리라는 신호(makeDreamArt가 캐시를 읽는다)
  const art = useMemo(() => makeDreamArt({ card, strokes, look, sealSeed }, aspect, width, 2, { lod, devicePerUnit: PixelRatio.get(), theme }), [card, strokes, aspect, width, look, lod, sealSeed, rasters, theme]);
  const lb = labels ?? defaultLabels(card);
  const H = art.H;
  return (
    <View style={{ width, height: H }} accessible accessibilityRole="image" accessibilityLabel={a11yLabel ?? t('card.a11y.fallback', { name: lb.name, line: lb.line })} testID="dream-card-art">
      {/* 카드 위 글은 그림의 일부(설명은 위 accessibilityLabel 하나로) */}
      <Canvas style={{ width, height: H }}>
        <DreamCardArt art={art} />
      </Canvas>
      {cardTextBoxes(art.layout.text, lb).map(({ item: it, vertical, lines, ys, size: sz, spacing }) => {
        const size = sz * width;
        if (vertical) {
          return (
            <Text
              key={it.key}
              style={[styles.t, { left: it.x * width - size, width: size * 2, top: ys[0]! * width, fontSize: size, lineHeight: size * 1.32, textAlign: 'center', color: cardTextColor(it.color, theme), fontFamily: fontFor(it.role) }]}
              maxFontSizeMultiplier={1}
              importantForAccessibility="no"
            >
              {lines.join('\n')}
            </Text>
          );
        }
        return lines.map((ln, i) => (
          <Text
            key={`${it.key}${i}`}
            numberOfLines={1}
            style={[
              styles.t,
              {
                left: width * ((1 - CARD_TEXT_W) / 2 - 0.02),
                right: width * ((1 - CARD_TEXT_W) / 2 - 0.02),
                top: ys[i]! * width - size * 1.05,
                fontSize: size,
                lineHeight: size * 1.4,
                textAlign: it.align,
                color: cardTextColor(it.color, theme),
                letterSpacing: spacing * width,
                fontFamily: fontFor(it.role),
              },
            ]}
            maxFontSizeMultiplier={1}
          >
            {ln}
          </Text>
        ));
      })}
    </View>
  );
}

const styles = StyleSheet.create({ t: { position: 'absolute' } });
