// 시드 RNG(mulberry32). 상태에 정수 하나만 보관한다. docs/design/sim/temperament-7day.mjs의 rng()와 같은 수열.

export function rngNext(seed: number): { value: number; seed: number } {
  let s = seed | 0;
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: s };
}

/** 0..n-1 정수 */
export function rngInt(seed: number, n: number): { value: number; seed: number } {
  const o = rngNext(seed);
  return { value: Math.min(n - 1, Math.floor(o.value * n)), seed: o.seed };
}
