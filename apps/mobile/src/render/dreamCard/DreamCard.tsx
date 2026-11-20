import {
  BlurMask,
  Canvas,
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
  type sim,
} from '@mong/core';
import { useMemo } from 'react';
import { PixelRatio, Platform, StyleSheet, Text, View } from 'react-native';
import { useFeature } from '../../features';
import { paperFx } from '../shaders';
import { dayName, getLocale, t } from '../../i18n';
import { EN_SERIF_SCALE } from '../../ui/type';
import { getMarbleFx, marbleUniforms } from './marble';

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
  friend: { t: object[]; geo: BodyGeo } | null;
  ringPx: { x: number; y: number; r: number };
  seal: { plate: SkPath; figure: SkPath; combs: Verts; eyes: SkPath };
  /** 낙관을 그리나(이레 영상 카드 줄은 끔 — 주사는 한 화면 한 곳) */
  showSeal: boolean;
  dots: { x: number; y: number; r: number; kind: 'past' | 'now' | 'future' }[];
  /** 장치 px 하한을 건 블러(그림 단위): 그림자·이불 접힘 그늘 */
  blur: { shadow: number; fold: number };
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
  friend: { t: { translateX: number }[] | object[]; geo: BodyGeo } | null;
}
type VesselArt = QuiltArt | CupArt;

/** 반 타원(위 = −1, 아래 = +1) 경로 점 */
function halfEllipse(cx: number, cy: number, rx: number, ry: number, sign: 1 | -1, n = 32): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * (i / n);
    out.push(cx - Math.cos(a) * rx, cy + sign * Math.sin(a) * ry);
  }
  return out;
}

function vesselArt(v: DreamVessel, c0: { x: number; y: number }, W: number, scene: DreamScene, uni: (shift: [number, number]) => ReturnType<typeof marbleUniforms>, wpx: number): VesselArt {
  const u = (x: number) => x * W;
  const cx = c0.x + u(v.x);
  const top = c0.y + u(v.y);
  const w = u(v.w);
  const h = u(v.h);
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
    const k = u(0.034);
    for (let d = -w; d <= w + h; d += k) {
      seams.moveTo(cx - w / 2 + d, top - u(0.02));
      seams.lineTo(cx - w / 2 + d - h * 1.2, top + h * 1.2);
      seams.moveTo(cx - w / 2 + d - h * 1.2, top - u(0.02));
      seams.lineTo(cx - w / 2 + d, top + h * 1.2);
    }
    return { kind: 'quilt', path: pb.build(), seams: seams.build(), fold: polyPath(edge.map((v2, i) => (i % 2 ? v2 + u(0.008) : v2)), false) };
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
    friend = { t: [{ translateX: cx }, { translateY: top + u(0.005) }, { scale: wpx }] as object[], geo: bodyGeometry(0, fs, false) };
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

export function makeDreamArt(input: DreamCardInput, aspect: DreamAspect, widthPx: number, aa: number, opts: DreamArtOpts = {}): DreamArt {
  // 개발 빌드만 미완 모티프(형상 자리표시·보름 초안)를 임시 형상으로 그린다. 제품은 형상 없는 일반 카드(core `dreamMotifShape`)
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
  const fade: [number, number, number] = [u(pr.x), u(pr.y), u(pr.r * 1.18)];
  const lineItem = layout.text.find((t) => t.key === 'line')!;
  const yLim = u(lineItem.y - lineItem.size * 1.9);
  const uniforms = marbleUniforms(scene, [c0.x, c0.y], W, aa, fade, yLim);
  const wpx = scene.body.w * W;
  const vessels = scene.vessels.map((v) => vesselArt(v, c0, W, scene, (sft) => marbleUniforms(scene, [c0.x, c0.y], W, aa, fade, yLim, sft), wpx));
  // 몸 폭(1W)의 pt → LOD. 문법은 카드 몸에 쓰지 않으므로(획은 마블링으로 풀림) 눈·빗 배율만 쓴다
  const L = bodyLod(wpx * (opts.ptPerUnit ?? 1), GRAMMARS.C, opts.lod ?? false);
  const body = bodyGeometry(input.strokes.length, scene.body.s, true, shape, L.eyeScale, L.combScale);
  const friend = scene.friend
    ? { t: [{ translateX: c0.x + u(scene.friend.x) }, { translateY: c0.y + u(scene.friend.y) }, { scale: wpx }] as object[], geo: bodyGeometry(0, scene.friend.r * scene.body.s, false) }
    : null;
  // 낙관: 주사 인면에 몽망이(빗 포함)를 양각으로 새김 — 글꼴 없이 그리는 이 앱만의 인장
  const sl = layout.seal;
  const plate = deckleRect(u(sl.x), u(sl.y), u(sl.size), u(sl.size), u(0.0016), u(0.003), scene.seed & 0xff);
  const fig = bodyGeometry(0, 1.0, true, shape);
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
    dots,
    // 블러 마스크 장치 0.5px 하한(눈 소실 결함과 같은 GPU 문턱). 큰 카드는 입력 그대로
    blur: { shadow: blurFloorPt(W * 0.012, opts.devicePerUnit ?? 1), fold: blurFloorPt(W * 0.003, opts.devicePerUnit ?? 1) },
  };
}

const PAPER_BASE = [0xef / 255, 0xe8 / 255, 0xda / 255];

function Drop({ t, geo, color = PALETTE.day.body }: { t: object[]; geo: BodyGeo; color?: string }) {
  return (
    <Group transform={t as never}>
      <Path path={geo.core} color={color} />
      <Vertices vertices={geo.combs.vertices} indices={geo.combs.indices} mode="triangles" color={color} />
      <Path path={geo.eyes} color={PALETTE.day.bg} />
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
  const paperU = { res: [W, H], base: PAPER_BASE, light: 1 };
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
        {art.vessels.map((v, i) =>
          v.kind === 'cup' ? (
            <Group key={`b${i}`}>
              <Oval rect={v.saucer} color={PALETTE.day.wash} opacity={0.55} />
              <Oval rect={v.opening} color={PALETTE.day.strokeInk} opacity={0.32} />
              <Path path={v.backRim} style="stroke" strokeWidth={lw} color={PALETTE.day.body} opacity={0.75} />
            </Group>
          ) : null,
        )}
        {art.friend && <Drop t={art.friend.t} geo={art.friend.geo} />}
        {art.vessels.map((v, i) => (v.kind === 'cup' && v.friend ? <Drop key={`f${i}`} t={v.friend.t} geo={v.friend.geo} /> : null))}
        {/* 몽망이 */}
        <Drop t={bodyT} geo={art.body} />
        {/* 그릇 앞쪽(사발·이불) — 몸 아래를 덮는다 */}
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
          ) : (
            <Group key={`q${i}`}>
              <Path path={v.path} color="#EAE1CF" />
              <Group clip={v.path}>
                <Path path={v.seams} style="stroke" strokeWidth={W * 0.0014} color={PALETTE.day.inkFaded} opacity={0.85} />
                <Path path={v.fold} style="stroke" strokeWidth={W * 0.006} color={PALETTE.day.wash} opacity={0.6}>
                  <BlurMask blur={art.blur.fold} style="normal" />
                </Path>
              </Group>
              <Path path={v.path} style="stroke" strokeWidth={lw} color={PALETTE.day.body} opacity={0.7} />
            </Group>
          ),
        )}
        {/* 일곱 날 점 줄(05b에서 가져온 장치) */}
        {art.dots.map((d, i) =>
          d.kind === 'future' ? (
            <Circle key={i} cx={d.x} cy={d.y} r={d.r} style="stroke" strokeWidth={W * 0.0012} color={PALETTE.day.inkFaded} />
          ) : (
            <Circle key={i} cx={d.x} cy={d.y} r={d.r} color={d.kind === 'now' ? PALETTE.day.body : PALETTE.day.inkFaded} />
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
}: DreamCardInput & { width: number; aspect?: DreamAspect; /** 스크린리더 설명(모티프·아침 문장). 없으면 이름·문장 */ a11yLabel?: string }) {
  const lod = useFeature('thumbLod');
  const art = useMemo(() => makeDreamArt({ card, strokes, look }, aspect, width, 2, { lod, devicePerUnit: PixelRatio.get() }), [card, strokes, aspect, width, look, lod]);
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
              style={[styles.t, { left: it.x * width - size, width: size * 2, top: ys[0]! * width, fontSize: size, lineHeight: size * 1.32, textAlign: 'center', color: it.color, fontFamily: fontFor(it.role) }]}
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
                color: it.color,
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
