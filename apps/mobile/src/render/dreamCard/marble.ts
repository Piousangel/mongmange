import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';
import type { DreamOp, DreamScene } from '@mong/core';
import { DREAM_LIMITS } from '@mong/core';
import { lazyOnce } from './lazyEffect';
import { MARBLE_SKSL } from './marbleSrc';

const NP = DREAM_LIMITS.pre;
const NQ = DREAM_LIMITS.post;
const NS = DREAM_LIMITS.segs;

/** 처음 쓸 때 컴파일. 실패하면 null(카드는 평평한 먹 층으로 그린다 — DreamCardArt) */
export const getMarbleFx: () => SkRuntimeEffect | null = lazyOnce(
  () => Skia.RuntimeEffect.Make(MARBLE_SKSL),
  (e) => console.warn('[dreamCard] marble shader unavailable, flat fallback', e),
);

function pack(ops: readonly DreamOp[], n: number): { A: number[]; B: number[] } {
  const A: number[] = [];
  const B: number[] = [];
  for (let i = 0; i < n; i++) {
    const o = ops[i];
    if (!o) {
      A.push(0, 0, 0, 0);
      B.push(0, 0, 0, 3);
      continue;
    }
    switch (o.k) {
      case 'drop':
        A.push(o.x, o.y, o.r, o.ink);
        B.push(o.gold ? 1 : 0, o.seat ? 1 : 0, 0, 0);
        break;
      case 'tine':
        A.push(o.x, o.y, o.dx, o.dy);
        B.push(o.lambda, o.len, o.gauss ? 1 : 0, 1);
        break;
      case 'curl':
        A.push(o.x, o.y, o.angle, o.radius);
        B.push(0, 0, 0, 2);
        break;
      case 'wave':
        A.push(o.dx, o.dy, o.amp, o.freq);
        B.push(o.phase, 0, 0, 3);
        break;
      case 'scale':
        A.push(o.x, o.y, o.sx, o.sy);
        B.push(0, 0, 0, 4);
        break;
    }
  }
  return { A, B };
}

const GOLD = [0xc9 / 255, 0xa4 / 255, 0x5c / 255];

/** 장면 → uniform. origin = 몽망이 중심(px), unit = 카드 폭(px). aa = 표본 수(화면 2, 내보내기 4) */
export function marbleUniforms(
  scene: DreamScene,
  origin: [number, number],
  unit: number,
  aa: number,
  fade: [number, number, number],
  yLim: number,
  shift: [number, number] = [0, 0],
) {
  const pre = pack(scene.pre, NP);
  const post = pack(scene.post, NQ);
  const segA: number[] = [];
  const segB: number[] = [];
  for (let i = 0; i < NS; i++) {
    const s = scene.segs[i];
    if (s) {
      segA.push(s.x1, s.y1, s.x2, s.y2);
      segB.push(s.z, s.lambda, s.stroke, 0);
    } else {
      segA.push(0, 0, 0, 0);
      segB.push(0, 1, -2, 0);
    }
  }
  return {
    u0: [origin[0], origin[1], unit, aa],
    u1: [shift[0], shift[1], Math.max(0.8, unit / 700), yLim],
    u2: [fade[0], fade[1], fade[2], 0],
    u3: [scene.pre.length, scene.post.length, scene.segs.length, 0],
    preA: pre.A,
    preB: pre.B,
    postA: post.A,
    postB: post.B,
    segA,
    segB,
    inkC4: [...scene.ink, 1],
    goldC4: [...GOLD, 1],
  };
}
