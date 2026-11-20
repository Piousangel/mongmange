// 타고남 → 몸 기하(BodyShape). 체형은 핵(SDF)과 금지 자리 ①(빗 뿌리에서 파생)을, 빗 모양은 가닥 길이비만 바꾼다.
// 12가지(체형 3 × 빗 모양 4)를 모듈 로드 때 한 번 만들어 둔다 — 화면은 같은 객체를 받아 worklet으로 넘긴다.
import { RING } from '../visual/bodySpec';
import { BASE_TRAITS, BODY_ASPECTS, COMB_SHAPES, type Traits } from '../visual/traits';
import { deriveForbidden } from './comb';
import { coreParams } from './core';
import type { BodyShape } from './types';

/** 체형별 금지 자리(빗 뿌리 파생은 bisection이 많아 한 번만) */
const FORBIDDEN_BY_BODY = BODY_ASPECTS.map((a) => deriveForbidden(undefined, coreParams(a)));

function build(body: number, comb: number): BodyShape {
  const aspect = BODY_ASPECTS[body]!;
  const r = COMB_SHAPES[comb]!;
  const core = coreParams(aspect);
  return {
    body: body as 0 | 1 | 2,
    core,
    coreU: [core.a, core.b, core.c, core.h],
    coreKU: [core.lean, core.round],
    combRatios: [r[0], r[1], r[2]],
    forbidden: FORBIDDEN_BY_BODY[body]!,
    // 번짐 고리 폭은 후보 축(아트 11-26 채택 전) — 렌더는 기본값 고정. 채택되면 RING_WIDTHS[t.ring]으로 바꾼다
    ringWidth: RING.width,
    aspect,
  };
}

/** [체형][빗 모양] */
const TABLE: BodyShape[][] = BODY_ASPECTS.map((_, b) => COMB_SHAPES.map((__, c) => build(b, c)));

/** 기본형(1.25 · 층진). 기존 기본 기하(CORE·COMB.ratios·FORBIDDEN_ZONES)와 같은 값이다 */
export const BASE_SHAPE: BodyShape = TABLE[BASE_TRAITS.body]![BASE_TRAITS.comb]!;

/** 체형별 대표 몸(층진 빗) — 획을 부착 당시 체형(Attach.body)의 핵에 놓을 때 쓴다(핵만 쓰므로 빗 모양 무관) */
export const BODY_SHAPES: readonly BodyShape[] = TABLE.map((row) => row[0]!);

/** 타고남 → 몸 모양. null = 기본형(첫 탭 전·플래그 꺼짐) */
export function shapeOf(t: Traits | null | undefined): BodyShape {
  if (!t) return BASE_SHAPE;
  return TABLE[t.body]?.[t.comb] ?? BASE_SHAPE;
}

