// 한 마리를 그릴 때 필요한 '그 아이' 값 묶음(M1): 타고남 → 몸 모양, 고른 먹 → 먹 색.
// 앱은 기능 플래그(birthTraits·inkChoice)를 여기 opts로 넘긴다 — 꺼져 있으면 기본형이라 빌드 1 화면과 같다.
import { BASE_SHAPE, shapeOf } from '../geometry/shape';
import type { BodyShape } from '../geometry/types';
import { BASE_INK_LOOK, inkLook, type InkLook } from './ink';
import { BASE_TRAITS, traitsOf, type Traits } from './traits';
import type { Birth, InkChoice } from '../sim/pillars';

export interface MongLook {
  traits: Traits;
  shape: BodyShape;
  ink: InkLook;
}

export const BASE_LOOK: MongLook = { traits: BASE_TRAITS, shape: BASE_SHAPE, ink: BASE_INK_LOOK };

/** 세이브(birth·ink) + 플래그 → 그릴 값. ink.id가 null(첫 잠 전, 아직 안 고름)이면 기본 먹 */
export function lookOf(birth: Pick<Birth, 'seed' | 'traitVersion'> | null | undefined, ink: Pick<InkChoice, 'id'> | null | undefined, opts: { traits: boolean; ink: boolean }): MongLook {
  const traits = opts.traits && birth ? traitsOf(birth.seed, birth.traitVersion) : BASE_TRAITS;
  return {
    traits,
    shape: opts.traits && birth ? shapeOf(traits) : BASE_SHAPE,
    ink: opts.ink ? inkLook(ink?.id ?? null) : BASE_INK_LOOK,
  };
}
