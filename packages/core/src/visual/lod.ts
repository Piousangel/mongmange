// 썸네일 LOD(D-24, 아트 1-5 v1.4, thumb-identity v1 4-1): 몸 폭 W(화면 pt)가 48 이하일 때만 획·눈·빗·먹을 키우고
// 가장자리 효과(블러·닫힘)를 W 단위로 바꾼다. 48 초과(t = 0)는 정본 값을 **그대로** 돌려준다(같은 객체·같은 수) — 큰 화면 픽셀 불변.
// 단 블러 하한(MIN_BLUR_DEVICE_PX)은 크기가 아니라 장치 px 기준이라 1x·1.5x에서는 48 초과에도 걸린다(의도, 아트 1-5 v1.4).
// 앱 몸 렌더(Mongmangi)·꿈 카드(Drop)·앨범 썸네일이 모두 이 함수 하나를 쓴다. 순수 TS(React·Skia 없음).
import type { StrokeGrammar } from './grammar';
import type { InkLook } from './ink';
import { hexRgb, rgbHex } from './ink';

/** 램프: t = clamp((startPx − W) / (startPx − fullPx), 0, 1). 48px 이상 = 정본, 24px 이하 = 썸네일 값 전부 */
export const LOD_RAMP = { startPx: 48, fullPx: 24 } as const;

/** t = 1(썸네일) 값. 정본(t = 0)은 각 렌더러의 기존 값이다 */
export const LOD_THUMB = {
  /** 획 틈(W). 22px에서 2.2px — 닫힘·블러에 메워지지 않는다 */
  gap: 0.1,
  /** 획 기본 폭(W). 22px에서 3.7px */
  baseWidth: 0.17,
  /** 획 먹: 회색축에서 채도 배율(송연 #4E5E70 → #3A5D85) */
  inkChroma: 2.2,
  /** 번짐 고리: 불투명도 배율, 채도는 이 값 이내 */
  ringOpacity: 1.3,
  ringChromaMax: 1.8,
  /** 눈 지름·빗 굵기 배율(0.16W → 0.21W, 0.074W → 0.096W) */
  eye: 1.3,
  comb: 1.3,
  /** 몸 칠 블러(W). pt 고정 0.8을 대신한다 */
  blurW: 0.004,
  /** 닫힘 반경 ≤ 틈 × 이 값(아트 1-3-1 v1.4) */
  closeOfGap: 1 / 3,
} as const;

/**
 * 마스크·이미지 블러의 장치 px 하한. GPU Skia(CanvasKit WebGL·Ganesh)는 **경로**에 건 블러 마스크 필터의 장치 sigma가
 * 약 0.33px보다 작으면 그 경로를 통째로 그리지 않는다(실측 11-20, scripts/a7-gpu-blur-probe.mjs: 0.32 → 사라짐, 0.34 → 그려짐).
 * 몸 칠·눈 구멍처럼 W 단위로 줄어드는 블러는 이 값 아래로 내려가지 않게 올린다(여유를 두고 0.5).
 */
export const MIN_BLUR_DEVICE_PX = 0.5;

/** 몸 폭(pt) → 램프 t(0 = 정본, 1 = 썸네일) */
export function lodT(bodyPt: number): number {
  'worklet';
  if (!(bodyPt > 0)) return 0;
  const { startPx, fullPx } = LOD_RAMP;
  return Math.min(1, Math.max(0, (startPx - bodyPt) / (startPx - fullPx)));
}

/**
 * W 단위 블러 sigma에 장치 px 하한을 건다(눈 소실 결함 수정, D-24 조사). wpx = 1W의 pt, dpr = pt → 장치 px.
 * 반환값도 W 단위다. 하한에 걸리지 않으면 입력과 같은 수를 돌려준다.
 */
export function maskSigmaW(sigmaW: number, wpx: number, dpr: number): number {
  'worklet';
  const dev = wpx * dpr;
  if (!(dev > 0)) return sigmaW;
  return Math.max(sigmaW, MIN_BLUR_DEVICE_PX / dev);
}

/** pt 단위 블러 sigma 하한(장치 px 0.5) */
export function blurFloorPt(sigmaPt: number, dpr: number): number {
  'worklet';
  return dpr > 0 ? Math.max(sigmaPt, MIN_BLUR_DEVICE_PX / dpr) : sigmaPt;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 회색축(RGB 평균)에서 채도 k배. 썸네일 획 먹(thumb-identity 4-1 표의 hex와 같은 식) */
export function chromaHex(hex: string, k: number): string {
  if (k === 1) return hex;
  const c = hexRgb(hex);
  const g = (c[0] + c[1] + c[2]) / 3;
  return rgbHex(c.map((v) => g + (v - g) * k));
}

/** 한 마리를 그 크기로 그릴 때의 값 묶음. t = 0이면 모든 값이 정본(입력 그대로) */
export interface BodyLod {
  t: number;
  /** 획 틈·폭·비백이 바뀐 문법(t = 0이면 입력 객체 그대로) */
  grammar: StrokeGrammar;
  eyeScale: number;
  combScale: number;
  /** 획 먹 채도 배율 */
  inkChroma: number;
  /** 고리 채도·불투명도 배율 */
  ringChroma: number;
  ringOpacity: number;
  /** 몸 칠 결(종이 결) 세기 배율 — 1px 미만 노이즈라 썸네일에서 끈다 */
  grain: number;
}

/** LOD를 쓰지 않을 때(플래그 꺼짐·큰 화면) */
export function lodIdentity(g: StrokeGrammar): BodyLod {
  return { t: 0, grammar: g, eyeScale: 1, combScale: 1, inkChroma: 1, ringChroma: 1, ringOpacity: 1, grain: 1 };
}

/** 몸 폭 bodyPt(pt)에서의 LOD. on = 기능 플래그(thumbLod). 꺼져 있거나 48px 이상이면 lodIdentity와 같다 */
export function bodyLod(bodyPt: number, g: StrokeGrammar, on: boolean): BodyLod {
  const t = on ? lodT(bodyPt) : 0;
  if (t === 0) return lodIdentity(g);
  const L = LOD_THUMB;
  return {
    t,
    grammar: { ...g, gap: lerp(g.gap, L.gap, t), baseWidth: lerp(g.baseWidth, L.baseWidth, t), dry: g.dry * (1 - t) },
    eyeScale: lerp(1, L.eye, t),
    combScale: lerp(1, L.comb, t),
    inkChroma: lerp(1, L.inkChroma, t),
    ringChroma: lerp(1, Math.min(L.inkChroma, L.ringChromaMax), t),
    ringOpacity: lerp(1, L.ringOpacity, t),
    grain: 1 - t,
  };
}

/** 획 먹·고리에 LOD 채도를 입힌 InkLook(t = 0이면 입력 그대로). 낮 몸(검정)·밤 몸은 바꾸지 않는다 */
export function lodInkLook(look: InkLook, lod: BodyLod): InkLook {
  if (lod.t === 0) return look;
  return {
    ...look,
    strokeDay: chromaHex(look.strokeDay, lod.inkChroma),
    strokeNight: chromaHex(look.strokeNight, lod.inkChroma),
    ring: chromaHex(look.ring, lod.ringChroma),
    ringOpacity: Math.min(1, look.ringOpacity * lod.ringOpacity),
  };
}

/**
 * 몸 칠 가장자리(pt): 정본은 화면 pt 고정(블러 0.8·닫힘 0.6)이라 몸이 작을수록 형상을 더 먹는다(thumb-identity 1-2).
 * LOD에서는 W 단위로 옮긴다 — 블러 = 0.004W, 닫힘 ≤ 틈/3. 둘 다 장치 px 0.5 하한(블러). t = 0이면 입력 그대로.
 */
export function bodyEdgePt(blurPt: number, closePt: number, bodyPt: number, lod: BodyLod, dpr: number): { blurPt: number; closePt: number } {
  if (lod.t === 0) return { blurPt, closePt };
  const t = lod.t;
  const blur = blurFloorPt(lerp(blurPt, LOD_THUMB.blurW * bodyPt, t), dpr);
  const close = lerp(closePt, Math.min(closePt, lod.grammar.gap * bodyPt * LOD_THUMB.closeOfGap), t);
  return { blurPt: blur, closePt: close };
}
