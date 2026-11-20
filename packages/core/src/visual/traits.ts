// M1 타고남(C-integrated v1.1 2-1, 아트 1-1 v1.3): 첫 탭 씨앗(birth.seed)에서 결정적으로 뽑는 평생 고정 축.
// 체형 3(폭:높이) × 빗 모양 4(세 가닥 길이비만) — 번짐 고리 폭 3은 후보(아트 11-26 채택 전까지 렌더는 1.3W 고정).
// 먹은 타고남이 아니라 유저가 고른다(D-20 정정). 씨앗 먹(seededInk)은 첫 잠에 정해 두는 기본값일 뿐이다.
// 모든 값은 같은 확률이다(희귀 등급 없음, B 1절·D-05). 순수 TS, worklet 밖(JS에서 한 번 계산해 넘긴다).
import { fnv1a, seededInk, INK_IDS, TRAIT_VERSION, type InkId } from '../sim/pillars';

/** 체형 3단: 폭:높이(아트 1-1 허용 1.15~1.35 끝까지). 아트가 끝값을 거절하면 1.18 / 1.32(TRAIT_VERSION을 올리지 않고 값만 — 축 순서는 그대로) */
export const BODY_ASPECTS = [1.15, 1.25, 1.35] as const;
/** 체형 이름(코드·캡처용, 화면 문구 아님). tall = 높은 콩, base = 기본, wide = 넓은 찹쌀떡 */
export const BODY_IDS = ['tall', 'base', 'wide'] as const;

/** 빗 모양 4: 세 가닥 길이비(위 → 아래). 뿌리 각도·굵기·간격·둥근 끝은 그대로(아트 1-1) */
export const COMB_SHAPES = [
  [1, 0.9, 0.75], // 층진(기본)
  [1, 0.95, 0.9], // 고른(완전 등길이는 글자 E로 읽혀 피함)
  [0.85, 1, 0.8], // 가운데 긴
  [0.75, 0.9, 1], // 끝 긴
] as const;
export const COMB_IDS = ['layered', 'even', 'middle', 'tipLong'] as const;

/** 번짐 고리 폭 후보(W). 채택 전에는 타고남 값으로 계산·저장만 하고 렌더는 RING.width(1.3) */
export const RING_WIDTHS = [1.1, 1.3, 1.5] as const;

export type BodyIndex = 0 | 1 | 2;
export type CombIndex = 0 | 1 | 2 | 3;
export type RingIndex = 0 | 1 | 2;

export interface Traits {
  body: BodyIndex;
  comb: CombIndex;
  /** 후보 축(아트 채택 전) */
  ring: RingIndex;
}

/** 첫 탭 전 방울·인트로·플래그 꺼짐 = 기본형(1.25 · 층진 · 1.3W) */
export const BASE_TRAITS: Traits = { body: 1, comb: 0, ring: 1 };

// 축마다 다른 꼬리표로 한 번 더 섞는다 — 같은 씨앗의 축끼리 독립(분포 테스트가 48칸으로 확인)
const TAG_BODY = 0x626f6479; // 'body'
const TAG_COMB = 0x636f6d62; // 'comb'
const TAG_RING = 0x72696e67; // 'ring'

/**
 * murmur3 fmix32(눈사태 마무리). FNV-1a 결과의 아래 비트는 '씨앗 상태의 아래 비트 + 꼬리표의 아래 비트'로만 정해져,
 * `% 4`를 그대로 쓰면 빗 모양이 씨앗 먹(seededInk, 같은 `% 4`)과 완전히 묶였다(48칸 중 12칸만 나옴 — traits.test 분포 테스트가 잡음).
 * 마무리 섞기로 모든 비트가 아래 비트에 퍼지게 한 뒤 나눈다.
 */
export function mix32(h: number): number {
  let x = h >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

/**
 * 씨앗 → 타고남. version = birth.traitVersion(규칙을 바꾸면 TRAIT_VERSION을 올리고 옛 버전 분기를 남긴다 — 옛 몽망이는 옛 규칙).
 * 지금은 버전 1뿐이다. 모르는 미래 버전은 기본형(세이브 검증이 미래 버전을 거부하므로 정상 경로에서는 오지 않는다).
 */
export function traitsOf(seed: number, version: number = TRAIT_VERSION): Traits {
  if (version !== 1) return BASE_TRAITS;
  const s = seed >>> 0;
  return {
    body: (mix32(fnv1a([s, TAG_BODY])) % 3) as BodyIndex,
    comb: (mix32(fnv1a([s, TAG_COMB])) % 4) as CombIndex,
    ring: (mix32(fnv1a([s, TAG_RING])) % 3) as RingIndex,
  };
}

/** 타고남 12칸 번호(체형 × 4 + 빗 모양) */
export function traitCell(t: Traits): number {
  return t.body * 4 + t.comb;
}

/** 나란히 놓으면 보이는 48칸 번호(타고남 12 × 먹 4). ink = 고른 먹(없으면 씨앗 먹) */
export function lookCell(t: Traits, ink: InkId): number {
  return traitCell(t) * 4 + INK_IDS.indexOf(ink);
}

/** 씨앗만으로 정해지는 기본 48칸(유저가 먹을 고르지 않았을 때) — 분포 테스트·캡처용 */
export function seedCell(seed: number): number {
  return lookCell(traitsOf(seed), seededInk(seed));
}
