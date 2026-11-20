// 먹 토큰 v1.1(아트 4-1 v1.3, C-integrated 2-1, D-20): 유저가 고른 먹 4가 평생 보이는 자리 = 번짐 고리·담묵 획·밤 몸·밤 획.
// 값의 정본은 `node docs/design/pillars-v1/C-ink-tokens.mjs`(OKLab 명도 고정·C 0.035)이고, 여기 hex는 그 출력을 옮긴 것이다
// (ink-tokens.test.ts가 OKLab 거리·대비를 다시 계산해 고정한다).
// 낮 몸은 고른 먹과 상관없이 같은 검정(#1B1A18)으로 그린다 — C 0.008 토큰의 차이(OKLab 0.010~0.017)는 지각 문턱 아래라
// 그리는 의미가 없고, 몸이 늘 같은 먹이어야 '핵 = 몸'이 산다(D-20, 이번 구현 결정). 토큰 표에는 기록으로 남긴다.
import { PALETTE } from './bodySpec';
import type { StrokeGrammar } from './grammar';
import { INK_IDS, type InkId } from '../sim/pillars';

export interface InkTokens {
  day: {
    /** 번짐 고리(장식) */
    wash: string;
    /** 새 획 안쪽(나이 0~7) */
    strokeInk: string;
    /** 기록용(C 0.008) — 렌더는 PALETTE.day.body */
    body: string;
  };
  night: {
    /** 밤 몸(풀린 먹) — 바탕 3:1·눈 3:1 이상 */
    body: string;
    strokeInk: string;
  };
}

export const INK_TOKENS: Record<InkId, InkTokens> = {
  songyeon: { day: { wash: '#A4B6CA', strokeInk: '#4E5E70', body: '#171B1E' }, night: { body: '#6B7C8E', strokeInk: '#4A5A6C' } },
  yuyeon: { day: { wash: '#C3B09C', strokeInk: '#695947', body: '#1D1A16' }, night: { body: '#887764', strokeInk: '#665543' } },
  jayeon: { day: { wash: '#C4ACBB', strokeInk: '#6A5563', body: '#1D191B' }, night: { body: '#897280', strokeInk: '#66515F' } },
  songhwa: { day: { wash: '#A5BAA8', strokeInk: '#4F6252', body: '#181B18' }, night: { body: '#6C806F', strokeInk: '#4B5E4E' } },
};

/** 먹을 고르기 전 기본형(아트 4절 단일 값) */
export const BASE_INK_TOKENS: InkTokens = {
  day: { wash: PALETTE.day.wash, strokeInk: PALETTE.day.strokeInk, body: PALETTE.day.body },
  night: { body: PALETTE.night.body, strokeInk: PALETTE.night.strokeInk },
};

/** 몽망이 한 마리를 그릴 먹 색(렌더러가 쓰는 값만). worklet으로 넘길 수 있게 문자열만 */
export interface InkLook {
  id: InkId | null;
  /** 낮 몸(늘 같은 검정) */
  dayBody: string;
  nightBody: string;
  /** 번짐 고리 색(낮). 기본형은 몸 먹(#1B1A18)을 25%로 깔던 기존 렌더와 같게 둔다 */
  ring: string;
  /** 번짐 고리 불투명도(기본형 0.25 = 아트 1-1. 고른 먹은 wash 토큰 자체가 옅어 더 진하게 깐다) */
  ringOpacity: number;
  /** 낮 담묵 계열(갓 그은 번짐·젖은 자국) */
  wash: string;
  /** 채택안(C) 새 획 안쪽: 낮·밤 */
  strokeDay: string;
  strokeNight: string;
}

export const BASE_INK_LOOK: InkLook = {
  id: null,
  dayBody: PALETTE.day.body,
  nightBody: PALETTE.night.body,
  ring: PALETTE.day.body,
  ringOpacity: 0.25,
  wash: PALETTE.day.wash,
  strokeDay: PALETTE.day.strokeInk,
  strokeNight: PALETTE.night.strokeInk,
};

/**
 * 고른 먹 고리 = wash 토큰을 그대로(불투명도 1) 깐다. 토큰의 바탕 대비 1.69~1.73과 OKLab 거리 0.045~0.070은 바탕 위에 그 색이
 * 그대로 놓였을 때의 값이다 — 25%로 깔면 채도가 1/4로 줄어 네 먹이 구별되지 않는다. 기본형 고리(몸 먹 25%, 바탕 위 실효 약 #B8B1A5)와
 * 명도가 비슷해 무게는 그대로다.
 */
export const INK_RING_OPACITY = 1;

/** 먹 id → 렌더 색. null(고르기 전·플래그 꺼짐) = 기본형 */
export function inkLook(id: InkId | null | undefined): InkLook {
  if (!id || !INK_IDS.includes(id)) return BASE_INK_LOOK;
  const t = INK_TOKENS[id];
  return {
    id,
    dayBody: PALETTE.day.body,
    nightBody: t.night.body,
    ring: t.day.wash,
    ringOpacity: INK_RING_OPACITY,
    wash: t.day.wash,
    strokeDay: t.day.strokeInk,
    strokeNight: t.night.strokeInk,
  };
}

// ── 색 계산(sRGB 0..255, 토큰과 같은 공간) ──

export function hexRgb(h: string): [number, number, number] {
  const v = parseInt(h.slice(1, 7), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
export function rgbHex(c: readonly number[]): string {
  return '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}
/** a → b로 t만큼(sRGB 선형 보간 — 토큰 'body → bg 32%'와 같은 규칙) */
export function mixHex(a: string, b: string, t: number): string {
  const x = hexRgb(a);
  const y = hexRgb(b);
  return rgbHex(x.map((v, i) => v + (y[i]! - v) * t));
}

/** 채택안 C의 농도(stroke-ink 토큰이 정의된 자리): 낮 몸 → 바탕 32%, 밤 몸 → 밤 바탕 35%(아트 4절) */
const TOKEN_TONE = { day: 0.32, night: 0.35 } as const;

/**
 * 문법 g의 새 획 안쪽 색(획 칠 셰이더의 stroke 색). 토큰은 채택안 C 농도에서 정의되므로, 다른 농도(스파이크 A·B)는
 * 토큰에서 바탕 쪽(더 옅게) 또는 몸 쪽(더 진하게)으로 같은 비율만큼 옮긴다. 채택안 C + 기본형이면 PALETTE 토큰 그대로.
 */
export function strokeInkOf(g: StrokeGrammar, look: InkLook, night: boolean): string {
  const tone = night ? g.toneNight : g.tone;
  const t0 = night ? TOKEN_TONE.night : TOKEN_TONE.day;
  const tok = night ? look.strokeNight : look.strokeDay;
  const paper = night ? PALETTE.night.bg : PALETTE.day.bg;
  const body = night ? look.nightBody : look.dayBody;
  if (Math.abs(tone - t0) < 1e-6) return tok;
  if (tone > t0) return mixHex(tok, paper, (tone - t0) / (1 - t0));
  return mixHex(tok, body, (t0 - tone) / t0);
}
