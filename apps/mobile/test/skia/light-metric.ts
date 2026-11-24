// V12a 몸 빛 검사 지표(OPERATING 8-1 '그럴듯한 오답' 검사): 빛 켠 렌더 − 끈 렌더의 픽셀별 OKLab 명도 차(ΔL)를 몸 안에서만 본다.
// 같은 몽망이·같은 프레임이라 종이 결·먹 결·획 칠은 양쪽이 같고, 차이는 빛 한 겹뿐이다.
// ① 확산광 범위 = 몸 안 ΔL 최대 − 최소(≤ 0.08) ② 정반사 = 램버트 모형 적합 잔차(리뷰 H1 — 옛 '국소 급등' 지표는 넓은 로브를 못 잡아 뺐다)
// ③ 방향 = ΔL 평면 맞춤의 기울기.
import { rgbToOklab } from './metric';
import type { Shot } from './render';

export interface LightField {
  width: number;
  height: number;
  /** 몸 안 픽셀만 값, 밖은 NaN */
  dL: Float32Array;
  /** 끈 렌더의 명도(재질 경계 구분용) */
  L0: Float32Array;
  count: number;
  /** 1W 장치 px */
  w: number;
}

function lightness(shot: Shot): Float32Array {
  const out = new Float32Array(shot.width * shot.height);
  for (let i = 0; i < out.length; i++) out[i] = rgbToOklab(shot.rgba[i * 4]!, shot.rgba[i * 4 + 1]!, shot.rgba[i * 4 + 2]!)[0];
  return out;
}

/**
 * 몸 안 영역: 끈 렌더의 명도가 몸·획 범위(낮 L < 0.55, 밤 0.35 < L < 0.75 — 밤 테·수면 제외)인 픽셀을 erodeW만큼 깎고,
 * 눈 자리(eyes: 장치 px 중심, 반지름 eyeR)를 뺀다. 가장자리 번짐·눈 구멍 두께 그림자는 확산광이 아니라서 뺀다.
 */
export function lightField(lit: Shot, unlit: Shot, night: boolean, eyes: { x: number; y: number }[], eyeR: number, erodeW = 0.035): LightField {
  const { width, height } = unlit;
  const L0 = lightness(unlit);
  const L1 = lightness(lit);
  const inside = new Uint8Array(width * height);
  for (let i = 0; i < inside.length; i++) {
    const v = L0[i]!;
    inside[i] = night ? (v > 0.35 && v < 0.75 ? 1 : 0) : v < 0.55 ? 1 : 0;
  }
  const r = Math.max(1, Math.round(erodeW * unlit.w));
  // 정사각 침식(가로 → 세로 두 번)
  const tmp = new Uint8Array(inside.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let ok = 1;
      for (let k = -r; k <= r && ok; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= width || !inside[y * width + xx]) ok = 0;
      }
      tmp[y * width + x] = ok;
    }
  const dL = new Float32Array(inside.length).fill(Number.NaN);
  let count = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let ok = 1;
      for (let k = -r; k <= r && ok; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= height || !tmp[yy * width + x]) ok = 0;
      }
      if (!ok) continue;
      if (eyes.some((e) => (x - e.x) ** 2 + (y - e.y) ** 2 < eyeR * eyeR)) continue;
      const i = y * width + x;
      dL[i] = L1[i]! - L0[i]!;
      count++;
    }
  return { width, height, dL, L0, count, w: unlit.w };
}

/** 몸 안 ΔL 최소·최대·범위 */
export function lightRange(f: LightField): { min: number; max: number; range: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of f.dL) {
    if (Number.isNaN(v)) continue;
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return { min, max, range: max - min };
}

/** ΔL ≈ a + gx·x + gy·y 최소제곱(좌표 = W 단위). 반환 = 기울기 방향(화면 좌표, y 아래)과 크기 */
export function lightGradient(f: LightField): { gx: number; gy: number; angleDeg: number } {
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sv = 0;
  for (let y = 0; y < f.height; y++)
    for (let x = 0; x < f.width; x++) {
      const v = f.dL[y * f.width + x]!;
      if (Number.isNaN(v)) continue;
      n++;
      sx += x;
      sy += y;
      sv += v;
    }
  const mx = sx / n;
  const my = sy / n;
  const mv = sv / n;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  let xv = 0;
  let yv = 0;
  for (let y = 0; y < f.height; y++)
    for (let x = 0; x < f.width; x++) {
      const v = f.dL[y * f.width + x]!;
      if (Number.isNaN(v)) continue;
      const dx = (x - mx) / f.w;
      const dy = (y - my) / f.w;
      xx += dx * dx;
      yy += dy * dy;
      xy += dx * dy;
      xv += dx * (v - mv);
      yv += dy * (v - mv);
    }
  const det = xx * yy - xy * xy;
  const gx = (yy * xv - xy * yv) / det;
  const gy = (xx * yv - xy * xv) / det;
  return { gx, gy, angleDeg: (Math.atan2(gy, gx) * 180) / Math.PI };
}

/** 램버트 모형 입력: 렌더와 같은 기하·세기(시험이 셰이더 식을 다시 계산한다) */
export interface LambertModel {
  /** 핵 타원(W, 크기 1): a·b·c */
  core: { a: number; b: number; c: number };
  /** 핵 배율 */
  s: number;
  /** 빛 방향(단위), 돔 납작함, 램프 문턱 */
  L: readonly number[];
  flat: number;
  d0: number;
  /** 그 프레임의 lift·sink(세기·램프 반영), 빛 색(0..1) */
  lift: number;
  sink: number;
  lightCol: readonly number[];
}

/** 픽셀 (x, y)의 램버트 램프 섞임 비율: a = 빛 색 쪽, b = 검정 쪽(bodyLightSrc.ts와 같은 식 — 다른 항이 있으면 렌더와 어긋난다) */
export function lambertMix(m: LambertModel, u: number, v: number): { a: number; b: number; d: number } {
  let qx = u / (m.core.a * m.s);
  let qy = (v - m.core.c * m.s) / (m.core.b * m.s);
  const r2 = qx * qx + qy * qy;
  if (r2 > 0.97) {
    const k = 0.985 / Math.sqrt(r2);
    qx *= k;
    qy *= k;
  }
  const z = Math.sqrt(Math.max(1 - qx * qx - qy * qy, 0)) * m.flat;
  const nl = Math.hypot(qx, qy, z);
  const d = (qx * m.L[0]! + qy * m.L[1]! + z * m.L[2]!) / nl;
  const up = Math.min(1, Math.max(0, (d - m.d0) / (1 - m.d0)));
  const dn = Math.min(1, Math.max(0, (m.d0 - d) / 1.1));
  return { a: m.lift * up * up * (3 - 2 * up), b: m.sink * dn, d };
}

/**
 * 램버트 모형 적합 잔차: 끈 렌더 색에 모형 섞임(빛 색 × a + 원래 색 × (1 − a − b))을 입힌 예상 명도 변화 ΔL̂을 만들고,
 * 실제 ΔL ≈ α + β·ΔL̂로 최소제곱 맞춘 뒤 잔차의 최대 절댓값을 돌려준다. 정반사(pow·exp 로브)·밤 전용 항·셰이더 사각 잘림은
 * 모형과 모양이 달라 잔차로 튄다. 범위(≤ 0.08) 시험과 달리 세기와 상관없이 잡는다(tilt 0·hop 0 렌더만).
 */
export function lambertResidual(f: LightField, unlit: Shot, m: LambertModel, cx: number, cy: number): { alpha: number; beta: number; maxAbs: number; rms: number; hotBias: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  const ds: number[] = [];
  const idx: number[] = [];
  for (let y = 0; y < f.height; y++)
    for (let x = 0; x < f.width; x++) {
      const i = y * f.width + x;
      const v = f.dL[i]!;
      if (Number.isNaN(v)) continue;
      const { a, b, d } = lambertMix(m, (x + 0.5 - cx) / f.w, (y + 0.5 - cy) / f.w);
      ds.push(d);
      idx.push(i);
      const p = i * 4;
      const c = [0, 1, 2].map((k) => {
        const o = unlit.rgba[p + k]!;
        return Math.min(255, Math.max(0, o * (1 - a - b) + m.lightCol[k]! * 255 * a));
      });
      xs.push(rgbToOklab(c[0]!, c[1]!, c[2]!)[0] - f.L0[i]!);
      ys.push(v);
    }
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const beta = sxx > 0 ? sxy / sxx : 0;
  const alpha = my - beta * mx;
  // 잔차 지도 → 반경 0.03W 상자 평균의 최대 절댓값. 정반사 로브(수십 도 폭)는 상자보다 넓어 남고,
  // 재질·가장자리 한두 픽셀(반투명 테·획 끝)의 튐은 평균에서 사라진다(밤 시드 11에서 단일 픽셀 0.011 실측)
  const W1 = f.width + 1;
  const sum = new Float64Array(W1 * (f.height + 1));
  const cnt = new Float64Array(W1 * (f.height + 1));
  const res = new Float64Array(f.width * f.height);
  const has = new Uint8Array(f.width * f.height);
  let ss = 0;
  for (let k = 0; k < n; k++) {
    const r = ys[k]! - (alpha + beta * xs[k]!);
    res[idx[k]!] = r;
    has[idx[k]!] = 1;
    ss += r * r;
  }
  for (let y = 0; y < f.height; y++)
    for (let x = 0; x < f.width; x++) {
      const i = y * f.width + x;
      const j = (y + 1) * W1 + x + 1;
      sum[j] = res[i]! + sum[j - 1]! + sum[j - W1]! - sum[j - W1 - 1]!;
      cnt[j] = has[i]! + cnt[j - 1]! + cnt[j - W1]! - cnt[j - W1 - 1]!;
    }
  const rad = Math.max(1, Math.round(0.03 * f.w));
  const box = (a: Float64Array, x0: number, y0: number, x1: number, y1: number) => a[y1 * W1 + x1]! - a[y0 * W1 + x1]! - a[y1 * W1 + x0]! + a[y0 * W1 + x0]!;
  let maxAbs = 0;
  for (let k = 0; k < n; k++) {
    const i = idx[k]!;
    const x = i % f.width;
    const y = (i - x) / f.width;
    const x0 = Math.max(0, x - rad);
    const y0 = Math.max(0, y - rad);
    const x1 = Math.min(f.width, x + rad + 1);
    const y1 = Math.min(f.height, y + rad + 1);
    const c = box(cnt, x0, y0, x1, y1);
    if (c < rad * rad) continue;
    maxAbs = Math.max(maxAbs, Math.abs(box(sum, x0, y0, x1, y1) / c));
  }
  // 빛을 가장 정면으로 받는 쪽(d 상위 3%)의 **맞추지 않은** 잔차(ΔL − ΔL̂, α 0·β 1) 평균: 정반사 로브는 바로 거기에 한쪽으로 쌓이고
  // (α·β 맞춤이 일부를 흡수하지 못하게 모형 그대로 비교), 양자화 잡음은 평균에서 사라진다
  const cut = [...ds].sort((p, q) => p - q)[Math.floor(n * 0.97)]!;
  let hs = 0;
  let hn = 0;
  for (let i = 0; i < n; i++)
    if (ds[i]! >= cut) {
      hs += ys[i]! - xs[i]!;
      hn++;
    }
  return { alpha, beta, maxAbs, rms: Math.sqrt(ss / n), hotBias: hn ? hs / hn : 0 };
}

/** RGBA 배열 i번째 픽셀의 OKLab 명도 */
export function rgbL(rgba: Uint8Array, i: number): number {
  return rgbToOklab(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!)[0];
}
