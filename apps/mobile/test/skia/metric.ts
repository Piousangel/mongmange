// 썸네일 구별 지표(OPERATING 8-1 '그럴듯한 오답' 검사): 몸 좌표(W)로 정규화한 격자에서 OKLab 평균 색 거리.
// 격자 한 칸 ≈ 화면 1pt(작은 크기에서 사람이 실제로 보는 해상도), 칸 값 = 그 칸 안 장치 픽셀의 면적 평균.
import type { Shot } from './render';

export interface Grid {
  n: number;
  /** OKLab(L, a, b) × n² */
  lab: Float64Array;
}

function srgbToLin(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLin(r);
  const G = srgbToLin(g);
  const B = srgbToLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/**
 * 핵 중심 기준 [−half, +half]W 정사각을 n×n 칸으로 나눠 칸마다 면적 평균(칸당 sub×sub 표본, 이중선형)을 OKLab로 둔다.
 * 크기만 다른 같은 몽망이는 같은 격자 자리에 같은 몸 부분이 온다.
 */
export function gridOf(shot: Shot, n: number, half = 1.3, sub = 4): Grid {
  const lab = new Float64Array(n * n * 3);
  const px = (x: number, y: number, ch: number) => {
    const xi = Math.min(shot.width - 1, Math.max(0, x));
    const yi = Math.min(shot.height - 1, Math.max(0, y));
    return shot.rgba[(yi * shot.width + xi) * 4 + ch]!;
  };
  const bil = (x: number, y: number, ch: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    return (px(x0, y0, ch) * (1 - fx) + px(x0 + 1, y0, ch) * fx) * (1 - fy) + (px(x0, y0 + 1, ch) * (1 - fx) + px(x0 + 1, y0 + 1, ch) * fx) * fy;
  };
  const cell = (2 * half) / n;
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < sub; sy++) {
        for (let sx = 0; sx < sub; sx++) {
          const u = -half + (gx + (sx + 0.5) / sub) * cell;
          const v = -half + (gy + (sy + 0.5) / sub) * cell;
          const x = shot.cx + u * shot.w - 0.5;
          const y = shot.cy + v * shot.w - 0.5;
          r += bil(x, y, 0);
          g += bil(x, y, 1);
          b += bil(x, y, 2);
        }
      }
      const k = sub * sub;
      const o = rgbToOklab(r / k, g / k, b / k);
      lab.set(o, (gy * n + gx) * 3);
    }
  }
  return { n, lab };
}

/** OKLab 색 차 지각 문턱(JND, 약 0.02) */
export const JND_OK = 0.02;

/**
 * 두 격자의 지각 거리: 칸마다 ΔE_OK에서 문턱(JND)을 뺀 값(음수면 0)의 평균 = '눈에 보이는 색 차가 난 면적'의 가중 합.
 * 문턱 아래 차이(가장자리 안티앨리어싱 흔들림 등)는 세지 않는다. jnd = 0이면 평균 ΔE_OK.
 */
export function distance(a: Grid, b: Grid, jnd = JND_OK): number {
  if (a.n !== b.n) throw new Error('grid size');
  let sum = 0;
  const N = a.n * a.n;
  for (let i = 0; i < N; i++) {
    const dl = a.lab[i * 3]! - b.lab[i * 3]!;
    const da = a.lab[i * 3 + 1]! - b.lab[i * 3 + 1]!;
    const db = a.lab[i * 3 + 2]! - b.lab[i * 3 + 2]!;
    sum += Math.max(0, Math.sqrt(dl * dl + da * da + db * db) - jnd);
  }
  return sum / N;
}

export interface Separation {
  /** 같은 몽망이 크기만 다름(질의 ↔ 정답) 거리 */
  same: number[];
  /** 질의 ↔ 가장 가까운 다른 몽망이 거리 */
  nearestOther: number[];
  /** 갤러리 안 다른 몽망이 쌍 거리 전부 */
  pairs: number[];
  /** 질의의 최근접이 정답인 비율 */
  accuracy: number;
  /** 질의마다 nearestOther / same 의 중앙값(1보다 클수록 잘 갈림) */
  marginMedian: number;
}

const median = (v: number[]) => {
  const s = [...v].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** gallery[i]와 query[i]는 같은 몽망이(크기만 다름) */
export function separation(gallery: Grid[], query: Grid[], jnd = JND_OK): Separation {
  const same: number[] = [];
  const nearestOther: number[] = [];
  const pairs: number[] = [];
  const margins: number[] = [];
  let hit = 0;
  for (let i = 0; i < gallery.length; i++) {
    const d0 = distance(query[i]!, gallery[i]!, jnd);
    let best = Infinity;
    for (let j = 0; j < gallery.length; j++) if (j !== i) best = Math.min(best, distance(query[i]!, gallery[j]!, jnd));
    same.push(d0);
    nearestOther.push(best);
    margins.push(best / Math.max(d0, 1e-9));
    if (d0 < best) hit++;
    for (let j = i + 1; j < gallery.length; j++) pairs.push(distance(gallery[i]!, gallery[j]!, jnd));
  }
  return { same, nearestOther, pairs, accuracy: hit / gallery.length, marginMedian: median(margins) };
}

export function summary(v: number[]) {
  const s = [...v].sort((x, y) => x - y);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]!;
  return { min: s[0]!, p10: q(0.1), median: median(v), max: s[s.length - 1]! };
}
