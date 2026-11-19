import {
  BlurMask,
  Canvas,
  Circle,
  Fill,
  Group,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  RoundedRect,
  Shader,
  Skia,
  Vertices,
  vec,
  type SkPath,
  type SkPoint,
} from '@shopify/react-native-skia';
import {
  COMB_REST,
  CORE,
  PALETTE,
  buildDreamScene,
  buildRibbon,
  combStrands,
  coreOutline,
  dreamCardLayout,
  eyeCenters,
  eyeShape,
  strokeSpine,
  type DreamAspect,
  type DreamLayout,
  type DreamScene,
  type DreamTextItem,
  type Ribbon,
  type StrokeRecord,
  type sim,
} from '@mong/core';
import { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { paperFx } from '../shaders';
import { marbleFx, marbleUniforms } from './marble';

/** 카드 위 글(문장은 앱이 언어별로 만들어 넘긴다 — 시스템 2.6) */
export interface DreamCardLabels {
  /** 세로쓰기 8자 이하: "몽망이·이레째" */
  name: string;
  /** 아침 문장 한 줄 */
  line: string;
  /** 작은 보조 줄: "둥근 달 · Day 7" */
  sub: string;
}

export interface DreamCardInput {
  card: sim.DreamCard;
  /** 그 아침까지의 몽망이 획 기록(D-13 정본) */
  strokes: readonly StrokeRecord[];
  labels?: DreamCardLabels;
}

export function defaultLabels(card: sim.DreamCard): DreamCardLabels {
  const n = card.night;
  return { name: `몽망이·${n + 1}일째`, line: '간밤의 꿈을 한지에 찍었어요', sub: `Day ${n} · last night's dream` };
}

export const SERIF_WEB = '"AppleMyungjo", "Noto Serif KR", "Nanum Myeongjo", serif';
export const ITALIC_WEB = '"Cormorant Garamond", "Iowan Old Style", "Palatino", Georgia, serif';

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
  coverUniforms: ReturnType<typeof marbleUniforms> | null;
  coverPath: SkPath | null;
  coverEdge: SkPath | null;
  poolClip: SkPath | null;
  body: { core: SkPath; combs: Verts; strokes: Verts; rims: Verts; ground: { x: number; y: number; width: number; height: number } | null; eyes: SkPath };
  seal: { plate: SkPath; figure: SkPath; combs: Verts; eyes: SkPath };
  dots: { x: number; y: number; r: number; kind: 'past' | 'now' | 'future' }[];
}

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

/** 몽망이(감은 눈 — 꿈꾸는 중) 기하. 단위 W, 핵 중심 원점 */
function bodyGeometry(strokes: readonly StrokeRecord[], s: number) {
  const core = polyPath(coreOutline(s, 160));
  const combs = combStrands(strokes.length, s, COMB_REST).map((st) => buildRibbon(st.pts, { widths: st.widths, roundStart: true, roundEnd: true }));
  const rib: Ribbon[] = [];
  const rim: Ribbon[] = [];
  let x0 = 1e9;
  let x1 = -1e9;
  for (const rec of strokes) {
    const sp = strokeSpine(rec, s, 1);
    const rb = buildRibbon(sp.pts, { ...sp.opts, widths: sp.widths });
    if (sp.label === 'base') {
      for (let j = 0; j < rb.positions.length; j += 2) {
        x0 = Math.min(x0, rb.positions[j]!);
        x1 = Math.max(x1, rb.positions[j]!);
      }
    } else {
      rib.push(rb);
      rim.push(buildRibbon(sp.pts, { ...sp.opts, widths: sp.widths.map((w) => w + 0.045) }));
    }
  }
  const gy = (CORE.h / 2) * s;
  const ground = x1 > x0 ? { x: x0, y: gy - 0.09 * 0.35, width: x1 - x0, height: 0.09 } : null;
  const ec = eyeCenters();
  const sh = eyeShape('closed');
  const ep = Skia.PathBuilder.Make();
  for (const cx of [ec.lx * s, ec.rx * s]) {
    ep.moveTo(cx + sh[0]!, ec.y * s + sh[1]!);
    for (let i = 2; i < sh.length; i += 2) ep.lineTo(cx + sh[i]!, ec.y * s + sh[i + 1]!);
    ep.close();
  }
  return { core, combs: toVerts(combs), strokes: toVerts(rib), rims: toVerts(rim), ground, eyes: ep.build() };
}

export function makeDreamArt(input: DreamCardInput, aspect: DreamAspect, widthPx: number, aa: number): DreamArt {
  const scene = buildDreamScene({ card: input.card, strokes: input.strokes, aspect });
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
  let coverUniforms = null;
  let coverPath = null;
  let coverEdge = null;
  let poolClip: SkPath | null = null;
  if (scene.cover) {
    const cy = c0.y + u(scene.cover.y);
    const bottom = u(layout.print.y + layout.print.r + 0.06);
    const n = jitter(scene.seed + 5);
    const edge: number[] = [];
    for (let x = u(sh.x); x <= u(sh.x + sh.w) + 1; x += u(0.01)) {
      const dx = (x - c0.x) / W;
      edge.push(x, cy + u(scene.cover.wobble) * (Math.sin(dx * 13 + 0.6) * 0.7 + n(dx * 30) * 1.2) + u(0.03) * dx * dx * 4);
    }
    coverEdge = polyPath(edge, false);
    coverPath = polyPath([...edge, u(sh.x + sh.w), bottom, u(sh.x), bottom]);
    // 이불 띠 = 같은 물, 몽망이 자리만 누빈 주름 줄로 채워 아랫몸을 덮는다(자리 밖은 바탕과 같아 이음매가 없다)
    coverUniforms = marbleUniforms(scene, [c0.x, c0.y], W, aa, fade, yLim, [0, 0], 1);
    const pr2 = u(scene.pool) * 1.04;
    const circ = Skia.PathBuilder.Make();
    circ.addCircle(c0.x, c0.y, pr2);
    poolClip = circ.build();
  }
  const body = bodyGeometry(input.strokes, scene.body.s);
  // 낙관: 주사 인면에 몽망이(빗 포함)를 양각으로 새김 — 글꼴 없이 그리는 이 앱만의 인장
  const sl = layout.seal;
  const plate = deckleRect(u(sl.x), u(sl.y), u(sl.size), u(sl.size), u(0.0016), u(0.003), scene.seed & 0xff);
  const fig = bodyGeometry([], 1.0);
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
    coverUniforms,
    coverPath,
    coverEdge,
    poolClip,
    body,
    seal: { plate, figure: fig.core, combs: fig.combs, eyes: fig.eyes },
    dots,
  };
}

const PAPER_BASE = [0xef / 255, 0xe8 / 255, 0xda / 255];

/** 카드 그림(글 제외). Canvas 안에도, drawAsImage(오프스크린)에도 그대로 쓴다 */
export function DreamCardArt({ art }: { art: DreamArt }) {
  const { W, H, c0, layout } = art;
  const wpx = art.scene.body.w * W;
  const s = art.scene.body.s;
  const bodyT = [{ translateX: c0.x }, { translateY: c0.y }, { scale: wpx }];
  const sl = layout.seal;
  const sealC = { x: (sl.x + sl.size / 2) * W, y: (sl.y + sl.size * 0.56) * W };
  const sealT = [{ translateX: sealC.x }, { translateY: sealC.y }, { scale: sl.size * W * 0.66 }];
  const paperU = { res: [W, H], base: PAPER_BASE, light: 1 };
  return (
    <Group>
      {/* 밤 물(건져 올린 자리) */}
      <Rect x={0} y={0} width={W} height={H}>
        <LinearGradient start={vec(0, 0)} end={vec(0, H)} colors={['#1A2137', '#141A2C', '#0C101D']} />
      </Rect>
      <Rect x={0} y={0} width={W} height={H} opacity={0.5}>
        <RadialGradient c={vec(W * 0.5, H * 0.42)} r={H * 0.6} colors={['rgba(201,164,92,0.10)', 'rgba(20,26,44,0)']} />
      </Rect>
      {/* 젖은 한지 그림자 */}
      <Rect rect={art.shadowRect} color="rgba(0,0,0,0.55)">
        <BlurMask blur={W * 0.012} style="normal" />
      </Rect>
      <Group clip={art.sheetPath}>
        <Fill>
          <Shader source={paperFx} uniforms={paperU} />
        </Fill>
        {/* 인화 */}
        <Fill>
          <Shader source={marbleFx} uniforms={art.uniforms} />
        </Fill>
        {/* 몽망이: 번짐 고리 → 획(담묵) → 몸·빗(먹) → 감은 눈(종이) */}
        <Group transform={bodyT}>
          {art.body.ground && (
            <RoundedRect {...art.body.ground} r={0.045} color={PALETTE.day.strokeInk} opacity={0.5}>
              <BlurMask blur={0.02} style="normal" />
            </RoundedRect>
          )}
          {/* 획 = 짙은 테 안의 담묵(게임 몸 합성과 같은 읽힘: 테는 몸 먹, 안은 stroke-ink) */}
          <Vertices vertices={art.body.rims.vertices} indices={art.body.rims.indices} mode="triangles" color={PALETTE.day.body} />
          <Vertices vertices={art.body.strokes.vertices} indices={art.body.strokes.indices} mode="triangles" color={PALETTE.day.strokeInk} />
          <Group>
            <Path path={art.body.core} color={PALETTE.day.body} />
            <Vertices vertices={art.body.combs.vertices} indices={art.body.combs.indices} mode="triangles" color={PALETTE.day.body} />
            <Path path={art.body.eyes} color={PALETTE.day.bg} />
          </Group>
        </Group>
        {/* 이불(모티프): 아랫몸을 덮는 무늬 띠 */}
        {art.coverPath && art.coverUniforms && (
          <Group clip={art.coverPath}>
            <Fill>
              <Shader source={paperFx} uniforms={paperU} />
            </Fill>
            <Fill>
              <Shader source={marbleFx} uniforms={art.coverUniforms} />
            </Fill>
          </Group>
        )}
        {art.coverEdge && art.poolClip && (
          <Group clip={art.poolClip}>
            <Path path={art.coverEdge} style="stroke" strokeWidth={W * 0.0026} color={PALETTE.day.body} opacity={0.6}>
              <BlurMask blur={W * 0.001} style="normal" />
            </Path>
          </Group>
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
        <Group opacity={0.93}>
          <Path path={art.seal.plate} color={PALETTE.day.accent} />
          <Group transform={sealT}>
            <Path path={art.seal.figure} color={PALETTE.day.bg} />
            <Vertices vertices={art.seal.combs.vertices} indices={art.seal.combs.indices} mode="triangles" color={PALETTE.day.bg} />
            <Path path={art.seal.eyes} color={PALETTE.day.accent} />
          </Group>
        </Group>
      </Group>
    </Group>
  );
}

// ---------- 글 ----------

export function textOf(item: DreamTextItem, labels: DreamCardLabels): string {
  return labels[item.key];
}

/** 세로쓰기는 8자 이하만(아트 6절). 길면 가로로 */
export function isVertical(item: DreamTextItem, labels: DreamCardLabels): boolean {
  return item.vertical && [...labels[item.key]].length <= 8;
}

function fontFor(role: DreamTextItem['role']) {
  if (Platform.OS === 'web') return role === 'italic' ? ITALIC_WEB : SERIF_WEB;
  return undefined;
}

/** 화면용 카드: Skia 그림 + RN 글(접근성·글꼴). 공유 이미지는 renderDreamCardImage */
export function DreamCard({
  card,
  strokes,
  labels,
  width,
  aspect = '4:5',
}: DreamCardInput & { width: number; aspect?: DreamAspect }) {
  const art = useMemo(() => makeDreamArt({ card, strokes }, aspect, width, 2), [card, strokes, aspect, width]);
  const lb = labels ?? defaultLabels(card);
  const H = art.H;
  return (
    <View style={{ width, height: H }} accessible accessibilityRole="image" accessibilityLabel={`꿈 인화 카드. ${lb.name}. ${lb.line}`} testID="dream-card-art">
      <Canvas style={{ width, height: H }}>
        <DreamCardArt art={art} />
      </Canvas>
      {art.layout.text.map((it) => {
        const t = textOf(it, lb);
        const size = it.size * width;
        const vert = isVertical(it, lb);
        if (vert) {
          return (
            <Text
              key={it.key}
              style={[styles.t, { left: it.x * width - size, width: size * 2, top: it.y * width, fontSize: size, lineHeight: size * 1.32, textAlign: 'center', color: it.color, fontFamily: fontFor(it.role) }]}
              maxFontSizeMultiplier={1}
            >
              {[...t].join('\n')}
            </Text>
          );
        }
        return (
          <Text
            key={it.key}
            numberOfLines={2}
            style={[
              styles.t,
              {
                left: width * 0.08,
                right: width * 0.08,
                top: it.y * width - size * 1.05,
                fontSize: size,
                lineHeight: size * 1.4,
                textAlign: it.align,
                color: it.color,
                letterSpacing: it.spacing * width,
                fontFamily: fontFor(it.role),
                fontStyle: it.role === 'italic' ? 'italic' : 'normal',
                fontWeight: it.role === 'serifLight' ? '300' : '400',
              },
            ]}
            maxFontSizeMultiplier={1}
          >
            {t}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({ t: { position: 'absolute' } });
