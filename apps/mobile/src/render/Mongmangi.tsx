import {
  BlendMode,
  BlurMask,
  Group,
  Oval,
  Path,
  Rect,
  Shader,
  Skia,
  TileMode,
  Vertices,
  type SkImageFilter,
  type SkPaint,
  type SkPoint,
} from '@shopify/react-native-skia';
import {
  COMB_REST,
  CORE,
  EDGE,
  PALETTE,
  RING,
  buildRibbon,
  combStrands,
  coreOutline,
  eyeCenters,
  eyeMix,
  eyeShapeCached,
  STROKE,
  simplifyStroke,
  strokeSpine,
  type CombPose,
  type StrokeGrammar,
  type EyeKind,
  type Ribbon,
  type StrokeRecord,
} from '@mong/core';
import { useMemo, useState } from 'react';
import { runOnJS, useAnimatedReaction, useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { MAX_SEGS, bodySdfFx, hexToRgb, inkFillFx, strokeInkFx } from './shaders';

/** 한 프레임의 몸 상태(화면이 시계에서 계산해 넘긴다) */
export interface BodyFrame {
  /** 핵 중심(px) */
  ox: number;
  oy: number;
  /** 1W = px */
  wpx: number;
  /** 지금 핵 크기 */
  s: number;
  /** 빗 성장 단계(획 수) */
  combN: number;
  comb: CombPose;
  tilt: number;
  sx: number;
  sy: number;
  /** 바닥에서 뜬 높이(W) */
  hop: number;
  eyeA: EyeKind;
  eyeB: EyeKind;
  eyeMix: number;
  /** 0 뜸 .. 1 덮임 */
  blink: number;
  gx: number;
  gy: number;
  /** 몸 먹 농도(나타남·페이드) */
  ink: number;
  bleed: number;
  night: number;
  ringScale: number;
  ringAlpha: number;
  hint: number;
  /** 기록별 부착 진행(0..1), 길이는 records와 같다. 음수면 아직 안 보임 */
  attachK: number[];
  /** 기록별 갓 그은 번짐(0..1) */
  fresh: number[];
}

export const REST_FRAME: Omit<BodyFrame, 'ox' | 'oy' | 'wpx'> = {
  s: 1,
  combN: 0,
  comb: COMB_REST,
  tilt: 0,
  sx: 1,
  sy: 1,
  hop: 0,
  eyeA: 'open',
  eyeB: 'open',
  eyeMix: 0,
  blink: 0,
  gx: 0,
  gy: 0,
  ink: 1,
  bleed: 1,
  night: 0,
  ringScale: 1,
  ringAlpha: 1,
  hint: 0,
  attachK: [],
  fresh: [],
};

interface Props {
  frame: SharedValue<BodyFrame>;
  records: StrokeRecord[];
  /** 그리는 중인 획(화면 px, t ms) */
  live?: SharedValue<{ x: number; y: number; t: number }[]>;
  mode: 'A' | 'B';
  /** render-03 획 문법(폭·틈·담묵·비백) */
  grammar: StrokeGrammar;
}

/** 획 칠 덧칠 리본을 몸 마스크보다 이만큼(pt) 넓힌다 — 0이면 닫힘·블러로 넓어진 몸 마스크의 검은 띠가 겹친 획 사이에 등고선처럼 남는다 */
const OVERLAY_PAD_PT = 1.6;
/** 빗 가닥의 텍스처 획 번호 시작(셰이더: ≥ 40 = 빗) */
const COMB_TEX_ID = 40;

const EYE_C = eyeCenters();
/** 후보 B를 쓰지 않을 때 넘기는 고정 uniform(매 프레임 768칸 배열을 채우지 않음) */
const SDF_IDLE = {
  origin: [0, 0],
  wpx: 1,
  s: 1,
  core: [CORE.a, CORE.b, CORE.c, CORE.h],
  coreK: [CORE.lean, CORE.round],
  k: 0.03,
  nseg: 0,
  segs: new Array(MAX_SEGS * 4).fill(0),
  rads: new Array(MAX_SEGS * 2).fill(0),
  soft: 1.6,
};
const CORE_PATH = (() => {
  const o = coreOutline(1, 160);
  const p = Skia.PathBuilder.Make();
  p.moveTo(o[0]!, o[1]!);
  for (let i = 2; i < o.length; i += 2) p.lineTo(o[i]!, o[i + 1]!);
  p.close();
  return p.build();
})();

function ribbonsToVerts(rs: Ribbon[], ids?: number[]): { vertices: SkPoint[]; indices: number[]; textures: SkPoint[] } {
  'worklet';
  const vertices: SkPoint[] = [];
  const indices: number[] = [];
  const textures: SkPoint[] = [];
  for (let r = 0; r < rs.length; r++) {
    const rb = rs[r]!;
    const base = vertices.length;
    const id = ids ? ids[r]! : r;
    for (let i = 0; i < rb.positions.length; i += 2) {
      vertices.push({ x: rb.positions[i]!, y: rb.positions[i + 1]! });
      if (ids) textures.push({ x: rb.uvs[i]! + 2 * id, y: rb.uvs[i + 1]! });
    }
    for (let i = 0; i < rb.indices.length; i++) indices.push(rb.indices[i]! + base);
  }
  if (vertices.length === 0) {
    vertices.push({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 });
    indices.push(0, 1, 2);
    if (ids) textures.push({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 });
  }
  return { vertices, indices, textures };
}

function eyePath(pts: number[], cxs: number[], cy: number) {
  'worklet';
  const p = Skia.PathBuilder.Make();
  for (let e = 0; e < cxs.length; e++) {
    const cx = cxs[e]!;
    p.moveTo(cx + pts[0]!, cy + pts[1]!);
    for (let i = 2; i < pts.length; i += 2) p.lineTo(cx + pts[i]!, cy + pts[i + 1]!);
    p.close();
  }
  return p.build();
}

/** 알파 램프 색 행렬: rgb = 1, a' = clamp(k·a + b) */
function ramp(k: number, b: number) {
  return Skia.ColorFilter.MakeMatrix([0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, k, b]);
}
function tint(hex: string | number[], input: SkImageFilter) {
  const c = typeof hex === 'string' ? Skia.Color(hex) : Float32Array.of(hex[0]!, hex[1]!, hex[2]!, 1);
  return Skia.ImageFilter.MakeColorFilter(Skia.ColorFilter.MakeBlend(c, BlendMode.SrcIn), input);
}

/**
 * 칠 레이어 페인트(D-13 단일 coverage): 레이어 안의 흰 마스크(핵 + 획 + 빗, 겹치면 1에서 포화)를
 * 블러 → 알파 램프로 가장자리·안쪽 테·바깥 번짐을 **한 번만** 만든다. 웹·네이티브 공통 필터만 쓴다.
 */
function makeBodyPaint(night: number, bleed: number, ink: number, blurPt: number, closePt: number): SkPaint {
  const b = hexToRgb(PALETTE.day.body);
  const nb = hexToRgb(PALETTE.night.body);
  const body = [0, 1, 2].map((i) => b[i]! + (nb[i]! - b[i]!) * night);
  // 닫힘(팽창 → 침식): 획과 몸 사이 작은 틈이 종이 점(셋째 눈처럼 읽힘)으로 남지 않게 메운다.
  // render-03: 반경은 획 문법이 정한다 — 일부러 연 틈(0.03W 안팎)보다 작아야 틈이 산다
  const closed = Skia.ImageFilter.MakeErode(closePt, closePt, Skia.ImageFilter.MakeDilate(closePt, closePt, null));
  const m = Skia.ImageFilter.MakeBlur(blurPt, blurPt, TileMode.Decal, closed);
  const edge = Skia.ImageFilter.MakeColorFilter(ramp(5, -2), m); // c 0.4→0.6
  const inner = Skia.ImageFilter.MakeColorFilter(ramp(6, -4.6), m); // c 0.77→0.93: 안쪽 면
  const fill = Skia.ImageFilter.MakeShader(inkFillFx.makeShader([...body, 0.1 * (1 - night)]));
  const innerCol = Skia.ImageFilter.MakeBlend(BlendMode.SrcIn, inner, fill);
  // 낮: 바깥(테) = 더 진한 먹, 안쪽 = 질감 먹. 밤: 테 = #E9E2D2 밝은 선, 안쪽 = 풀린 먹 #7E7973
  const rimHex = night > 0.5 ? PALETTE.night.bodyRim : body.map((v) => v * 0.5);
  const rimCol = tint(rimHex, edge);
  let col = Skia.ImageFilter.MakeBlend(BlendMode.SrcOver, rimCol, innerCol);
  if (night > 0.5) {
    const innerN = Skia.ImageFilter.MakeColorFilter(ramp(5, -2.75), m); // 테 1.5~2pt만 남김
    col = Skia.ImageFilter.MakeBlend(BlendMode.SrcOver, rimCol, Skia.ImageFilter.MakeBlend(BlendMode.SrcIn, innerN, fill));
  }
  // 바깥 번짐 2~4pt(블러 꼬리, 34%)
  const feather = tint(body, Skia.ImageFilter.MakeColorFilter(ramp(0.8 * bleed, 0), m));
  const all = Skia.ImageFilter.MakeBlend(BlendMode.SrcOver, feather, col);
  const paint = Skia.Paint();
  paint.setImageFilter(all);
  paint.setAlphaf(ink);
  return paint;
}

/** 몽망이 = 핵 + 빗 + 획을 하나의 coverage 마스크로 합친 뒤 한 번 칠하고, 눈을 뺀다(D-13·아트 12절) */
export function Mongmangi({ frame, records, live, mode, grammar }: Props) {
  // 칠 페인트는 값이 바뀔 때만 다시 만든다(양자화 키, JS 스레드)
  const [key, setKey] = useState('0|10|20');
  useAnimatedReaction(
    () => {
      const f = frame.value;
      return `${Math.round(f.night * 20)}|${Math.round(f.bleed * 10)}|${Math.round(f.ink * 20)}`;
    },
    (k, prev) => {
      if (k !== prev) runOnJS(setKey)(k);
    },
  );
  const paint = useMemo(() => {
    const [n, b, i] = key.split('|').map(Number) as [number, number, number];
    return makeBodyPaint(n / 20, b / 10, i / 20, mode === 'A' ? EDGE.bleedPx * 0.4 : 0.8, grammar.closePt);
  }, [key, mode, grammar]);

  const base = useDerivedValue(() => {
    const f = frame.value;
    return [{ translateX: f.ox }, { translateY: f.oy }, { scale: f.wpx }];
  });
  // 몸 애니메이션: 바닥 중심을 축으로 기울기·눌림, hop만큼 뜸
  const anim = useDerivedValue(() => {
    const f = frame.value;
    const pivot = (CORE.h / 2) * f.s;
    return [
      { translateY: pivot - f.hop },
      { rotate: f.tilt },
      { scaleX: f.sx },
      { scaleY: f.sy },
      { translateY: -pivot },
    ];
  });
  const coreT = useDerivedValue(() => [{ scale: frame.value.s }]);

  // 획별 캐시(리뷰 2-5): 단순화 점열은 raw가 불변이라 기록당 한 번(JS), 리본은 그 획의 (핵 크기, 부착 진행)이
  // 바뀔 때만 다시 만든다 → 한 획이 정착하는 동안 나머지 획은 다시 계산하지 않는다.
  const simplified = useMemo(() => records.map((r) => simplifyStroke(r.raw, STROKE.simplifiedMax, r.meshVersion)), [records]);
  // base = 받침 라벨(render-03): 몸 마스크에 넣지 않고 바닥에 번진 담묵으로 몸 아래에 그린다(평평한 바닥 유지, 발·부스러기 금지)
  const strokeCache = useSharedValue<{ key: string; rb: Ribbon | null; ov: Ribbon | null; base: boolean }[]>([]);
  const strokeRibbons = useDerivedValue(() => {
    const f = frame.value;
    const prev = strokeCache.value;
    const out: { key: string; rb: Ribbon | null; ov: Ribbon | null; base: boolean }[] = [];
    const pad = (2 * OVERLAY_PAD_PT) / f.wpx;
    let changed = prev.length !== records.length;
    for (let i = 0; i < records.length; i++) {
      const k = f.attachK[i] ?? 1;
      const key = `${grammar.id}|${f.s.toFixed(5)}|${k.toFixed(4)}`;
      const old = prev[i];
      if (old && old.key === key) {
        out.push(old);
        continue;
      }
      changed = true;
      if (k < 0) {
        out.push({ key, rb: null, ov: null, base: false });
        continue;
      }
      const sp = strokeSpine(records[i]!, f.s, k, simplified[i], grammar);
      const wide: number[] = [];
      for (let j = 0; j < sp.widths.length; j++) wide.push(sp.widths[j]! + pad);
      out.push({
        key,
        rb: buildRibbon(sp.pts, { ...sp.opts, widths: sp.widths }),
        ov: buildRibbon(sp.pts, { ...sp.opts, widths: wide }),
        base: sp.label === 'base',
      });
    }
    if (changed) strokeCache.value = out;
    return out;
  });
  // 빗은 프레임당 한 번만(리뷰 7번): 자세 키가 같으면 지난 프레임 것을 쓰고, 마스크 리본·덧칠 리본을 함께 만든다
  const combCache = useSharedValue<{ key: string; mask: Ribbon[]; ink: Ribbon[] }>({ key: '', mask: [], ink: [] });
  const combRibbons = useDerivedValue(() => {
    const f = frame.value;
    const c = f.comb;
    const key = `${f.combN}|${f.s.toFixed(5)}|${f.wpx}|${c.angle.toFixed(3)}|${c.spread.toFixed(3)}|${c.grow.toFixed(4)}|${c.wobble0.toFixed(3)}|${c.wobble1.toFixed(3)}|${c.wobble2.toFixed(3)}`;
    const prev = combCache.value;
    if (prev.key === key) return prev;
    const mask: Ribbon[] = [];
    const ink: Ribbon[] = [];
    if (c.grow > 0.001) {
      const strands = combStrands(f.combN, f.s, c);
      const pad = (2 * OVERLAY_PAD_PT) / f.wpx;
      for (let i = 0; i < strands.length; i++) {
        // render-03: 빗 끝도 붓을 뗀 둥근 끝(실 테이퍼 금지)
        mask.push(buildRibbon(strands[i]!.pts, { widths: strands[i]!.widths, roundStart: true, roundEnd: true }));
        const w: number[] = [];
        for (let j = 0; j < strands[i]!.widths.length; j++) w.push(strands[i]!.widths[j]! + pad);
        ink.push(buildRibbon(strands[i]!.pts, { widths: w, roundStart: true, roundEnd: true }));
      }
    }
    const out = { key, mask, ink };
    combCache.value = out;
    return out;
  });
  const ribbons = useDerivedValue(() => {
    const all: Ribbon[] = [];
    const sr = strokeRibbons.value;
    for (let i = 0; i < sr.length; i++) if (sr[i]!.rb && !sr[i]!.base) all.push(sr[i]!.rb!);
    const cr = combRibbons.value.mask;
    for (let i = 0; i < cr.length; i++) all.push(cr[i]!);
    return all;
  });
  const maskVerts = useDerivedValue(() => ribbonsToVerts(ribbons.value));
  const vtx = useDerivedValue(() => maskVerts.value.vertices);
  const idx = useDerivedValue(() => maskVerts.value.indices);
  // 획 칠 덧칠(render-03): 유저 획 = 문법 농도·비백, 빗 = 몸 먹 + 끝 비백. 몸 칠 위에 srcATop, 핵 밖에서만
  const inkVerts = useDerivedValue(() => {
    const rs: Ribbon[] = [];
    const ids: number[] = [];
    const sr = strokeRibbons.value;
    for (let i = 0; i < sr.length; i++) {
      if (!sr[i]!.ov || sr[i]!.base) continue;
      rs.push(sr[i]!.ov!);
      ids.push(i);
    }
    const ci = combRibbons.value.ink;
    for (let i = 0; i < ci.length; i++) {
      rs.push(ci[i]!);
      ids.push(COMB_TEX_ID + i);
    }
    return ribbonsToVerts(rs, ids);
  });
  const inkV = useDerivedValue(() => inkVerts.value.vertices);
  const inkI = useDerivedValue(() => inkVerts.value.indices);
  const inkT = useDerivedValue(() => inkVerts.value.textures);
  const inkU = useDerivedValue(() => {
    const f = frame.value;
    const b = hexToRgb(PALETTE.day.body);
    const nb = hexToRgb(PALETTE.night.body);
    const pd = hexToRgb(PALETTE.day.bg);
    const pn = hexToRgb(PALETTE.night.bg);
    const n = f.night;
    return {
      ink: [0, 1, 2].map((i) => b[i]! + (nb[i]! - b[i]!) * n),
      paper: [0, 1, 2].map((i) => pd[i]! + (pn[i]! - pd[i]!) * n),
      // 밤 농도는 문법의 toneNight(밤 몸과 1.5:1 이상 떨어지게, 아트 4절 stroke-ink 밤)
      tone: grammar.tone + (grammar.toneNight - grammar.tone) * n,
      dry: grammar.dry * (1 - n),
    };
  });
  const invS = useDerivedValue(() => [{ scale: 1 / frame.value.s }]);
  // 받침 = 바닥 담묵 한 띠(리뷰 2-①-1): 받침 획들의 가로 범위를 하나로 합친 낮은 타원. 획별 구슬 금지, 밤에도 남는다
  const groundRect = useDerivedValue(() => {
    const f = frame.value;
    const sr = strokeRibbons.value;
    let x0 = 1e9;
    let x1 = -1e9;
    for (let i = 0; i < sr.length; i++) {
      const rb = sr[i]!.rb;
      if (!rb || !sr[i]!.base) continue;
      for (let j = 0; j < rb.positions.length; j += 2) {
        x0 = Math.min(x0, rb.positions[j]!);
        x1 = Math.max(x1, rb.positions[j]!);
      }
    }
    if (x1 < x0) return { x: 0, y: 0, width: 0, height: 0 };
    const gy = (CORE.h / 2) * f.s;
    const h = 0.09;
    return { x: x0, y: gy - h * 0.35, width: x1 - x0, height: h };
  });
  const groundOpacity = useDerivedValue(() => (0.5 + 0.35 * frame.value.night) * frame.value.ink);
  const groundColor = useDerivedValue(() => (frame.value.night > 0.5 ? PALETTE.night.strokeInk : PALETTE.day.strokeInk));

  // 갓 그은 획 번짐(1200ms): 넓힌 리본을 담묵으로 몸 아래에
  const freshVerts = useDerivedValue(() => {
    const f = frame.value;
    const rs: Ribbon[] = [];
    for (let i = 0; i < records.length; i++) {
      const fr = f.fresh[i] ?? 0;
      const k = f.attachK[i] ?? 1;
      const r = strokeRibbons.value[i]?.rb;
      if (fr <= 0.01 || k < 0 || !r) continue;
      // 중심에서 바깥으로 1.9배
      const c = r.positions;
      let mx = 0;
      let my = 0;
      for (let j = 0; j < c.length; j += 2) {
        mx += c[j]!;
        my += c[j + 1]!;
      }
      mx /= c.length / 2;
      my /= c.length / 2;
      const pos: number[] = [];
      for (let j = 0; j < c.length; j += 2) pos.push(mx + (c[j]! - mx) * (1 + 0.25 * fr), my + (c[j + 1]! - my) * (1 + 0.25 * fr));
      rs.push({ positions: pos, indices: r.indices, uvs: r.uvs });
    }
    return ribbonsToVerts(rs);
  });
  const freshV = useDerivedValue(() => freshVerts.value.vertices);
  const freshI = useDerivedValue(() => freshVerts.value.indices);
  const freshOpacity = useDerivedValue(() => {
    let m = 0;
    for (let i = 0; i < frame.value.fresh.length; i++) m = Math.max(m, frame.value.fresh[i]!);
    return m * 0.35;
  });

  const liveVerts = useDerivedValue(() => {
    const f = frame.value;
    const pts = live?.value ?? [];
    if (pts.length === 0) return ribbonsToVerts([]);
    // 그리는 중 리본은 최대 160점으로 솎는다(마지막 점은 늘 포함 → 손가락 0ms 추종). 정본 raw는 그대로 다 저장
    const step = Math.max(1, Math.ceil(pts.length / 160));
    const local: { x: number; y: number; t: number }[] = [];
    for (let i = 0; i < pts.length; i += step) local.push({ x: (pts[i]!.x - f.ox) / f.wpx, y: (pts[i]!.y - f.oy) / f.wpx, t: pts[i]!.t });
    const last = pts[pts.length - 1]!;
    if ((pts.length - 1) % step !== 0) local.push({ x: (last.x - f.ox) / f.wpx, y: (last.y - f.oy) / f.wpx, t: last.t });
    return ribbonsToVerts([buildRibbon(local, { roundStart: true, roundEnd: true, width: grammar.baseWidth })]);
  });
  const liveV = useDerivedValue(() => liveVerts.value.vertices);
  const liveI = useDerivedValue(() => liveVerts.value.indices);

  const eyes = useDerivedValue(() => {
    const f = frame.value;
    const sh = eyeMix(eyeShapeCached(f.eyeA), eyeShapeCached(f.eyeB), f.eyeMix, f.blink);
    const ey = EYE_C.y * f.s + f.gy;
    return eyePath(sh, [EYE_C.lx * f.s + f.gx, EYE_C.rx * f.s + f.gx], ey);
  });
  const eyeHoleOpacity = useDerivedValue(() => 1 - frame.value.night);
  const eyeNightOpacity = useDerivedValue(() => frame.value.night);

  // 번짐 고리(바닥 아래 담묵 타원 1.3W × 0.18W @25%), 첫 획 안내 젖은 자국(1.6W, 12%)
  const ringRect = useDerivedValue(() => {
    const f = frame.value;
    const w = RING.width * f.s * f.wpx * f.ringScale;
    const h = RING.height * f.wpx * (0.6 + 0.4 * f.ringScale);
    const gy = f.oy + (CORE.h / 2) * f.s * f.wpx;
    return { x: f.ox - w / 2, y: gy - h / 2, width: w, height: h };
  });
  const ringOpacity = useDerivedValue(() => RING.opacity * frame.value.ringAlpha * (1 - frame.value.night));
  const hintRect = useDerivedValue(() => {
    const f = frame.value;
    const w = RING.hintWidth * f.s * f.wpx;
    const h = w * 0.62;
    return { x: f.ox - w / 2, y: f.oy - h / 2 + 0.05 * f.wpx, width: w, height: h };
  });
  const hintOpacity = useDerivedValue(() => RING.hintOpacity * frame.value.hint);
  const blurRing = useDerivedValue(() => frame.value.wpx * 0.05);

  // 후보 B: SDF 셰이더 uniforms(획·빗 스파인 → 캡슐)
  const sdfU = useDerivedValue(() => {
    const f = frame.value;
    if (mode !== 'B') return SDF_IDLE;
    const segs: number[] = [];
    const rads: number[] = [];
    let n = 0;
    const addLine = (pts: { x: number; y: number }[], ws: number[]) => {
      const step = Math.max(1, Math.ceil(pts.length / 14));
      for (let i = 0; i + step < pts.length + step - 1 && n < MAX_SEGS; i += step) {
        const j = Math.min(i + step, pts.length - 1);
        if (j === i) break;
        segs.push(pts[i]!.x, pts[i]!.y, pts[j]!.x, pts[j]!.y);
        rads.push(ws[i]! / 2, ws[j]! / 2);
        n++;
      }
    };
    if (mode === 'B') {
      for (let i = 0; i < records.length; i++) {
        const k = f.attachK[i] ?? 1;
        if (k < 0) continue;
        const sp = strokeSpine(records[i]!, f.s, k, simplified[i]);
        addLine(sp.pts, sp.widths);
      }
      const strands = combStrands(f.combN, f.s, f.comb);
      for (let i = 0; i < strands.length; i++) addLine(strands[i]!.pts, strands[i]!.widths);
    }
    while (segs.length < MAX_SEGS * 4) segs.push(0, 0, 0, 0);
    while (rads.length < MAX_SEGS * 2) rads.push(0, 0);
    return {
      origin: [f.ox, f.oy],
      wpx: f.wpx,
      s: f.s,
      core: [CORE.a, CORE.b, CORE.c, CORE.h],
      coreK: [CORE.lean, CORE.round],
      k: 0.03,
      nseg: n,
      segs,
      rads,
      soft: 1.6,
    };
  });
  const sdfRect = useDerivedValue(() => {
    const f = frame.value;
    const R = 1.4 * f.s * f.wpx;
    return { x: f.ox - R, y: f.oy - R, width: R * 2, height: R * 2 };
  });

  return (
    <Group>
      <Oval rect={hintRect} color={PALETTE.day.wash} opacity={hintOpacity}>
        <BlurMask blur={8} style="normal" />
      </Oval>
      <Oval rect={ringRect} color={PALETTE.day.body} opacity={ringOpacity}>
        <BlurMask blur={blurRing} style="normal" />
      </Oval>
      <Group transform={base} opacity={freshOpacity}>
        <Group transform={anim}>
          <Vertices vertices={freshV} indices={freshI} mode="triangles" color={PALETTE.day.wash}>
            <BlurMask blur={0.05} style="normal" />
          </Vertices>
        </Group>
      </Group>
      {/* 받침 획 = 바닥에 번진 담묵 한 띠(몸 마스크 밖, 몸 아래, 밤에도) */}
      <Group transform={base} opacity={groundOpacity}>
        <Group transform={anim}>
          <Oval rect={groundRect} color={groundColor}>
            <BlurMask blur={0.02} style="normal" />
          </Oval>
        </Group>
      </Group>
      {/* 바깥 레이어: 눈 구멍(dstOut)을 칠한 몸에서만 빼기 위해 분리 */}
      <Group layer>
        <Group layer={paint}>
          {mode === 'A' ? (
            <Group transform={base}>
              <Group transform={anim}>
                <Group transform={coreT}>
                  <Path path={CORE_PATH} color="white" />
                </Group>
                <Vertices vertices={vtx} indices={idx} mode="triangles" color="white" />
              </Group>
              <Vertices vertices={liveV} indices={liveI} mode="triangles" color="white" />
            </Group>
          ) : (
            <>
              <Rect rect={sdfRect}>
                <Shader source={bodySdfFx} uniforms={sdfU} />
              </Rect>
              <Group transform={base}>
                <Vertices vertices={liveV} indices={liveI} mode="triangles" color="white" />
              </Group>
            </>
          )}
        </Group>
        {mode === 'A' && (
          <Group transform={base}>
            <Group transform={anim}>
              <Group transform={coreT} clip={CORE_PATH} invertClip>
                <Group transform={invS}>
                  <Vertices vertices={inkV} indices={inkI} textures={inkT} mode="triangles" blendMode="srcATop">
                    <Shader source={strokeInkFx} uniforms={inkU} />
                  </Vertices>
                </Group>
              </Group>
            </Group>
          </Group>
        )}
        <Group transform={base}>
          <Group transform={anim}>
            <Path path={eyes} color="black" blendMode="dstOut" opacity={eyeHoleOpacity}>
              <BlurMask blur={0.006} style="normal" />
            </Path>
            <Path path={eyes} color={PALETTE.night.eye} opacity={eyeNightOpacity} />
          </Group>
        </Group>
      </Group>
    </Group>
  );
}
