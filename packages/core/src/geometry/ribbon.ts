// 가변 폭 리본 기하(파생). 출력은 평평한 숫자 배열 — 앱은 Skia Vertices로만 바꾼다.
// 꺾인 모서리는 Catmull-Rom 스파인 + 이웃 평균 법선으로 큰 반경 조인이 되고(V자 홈 없음),
// 안쪽 겹침은 몸 coverage 마스크 하나로 합치므로 진해지지 않는다(D-13).
import { STROKE } from '../visual/bodySpec';
import type { RawPoint } from './types';

export interface Ribbon {
  /** [x0, y0, x1, y1, ...] W 단위 */
  positions: number[];
  indices: number[];
  /** 정점별 [길이 방향 0..1, 폭 방향 −1..1] — 셰이더 텍스처 좌표 */
  uvs: number[];
}

export interface RibbonOptions {
  /** 기본 폭(W) */
  width?: number;
  /** 끝 테이퍼 보정 0..1(L2+) */
  taper?: number;
  /** 시작 둥근 캡 */
  roundStart?: boolean;
  /** 끝 둥근 캡(받침 라벨: 끝 갈라짐 끔) */
  roundEnd?: boolean;
  /** 고정 폭 배열(빗 가닥 등). 주면 속도·압력 무시 */
  widths?: readonly number[];
  /** 메시 버전(폭 곡선) */
  meshVersion?: number;
}

/** 점별 폭(W). 속도가 빠르면 가늘고, 압력이 있으면 굵다. 시작은 붓을 눌러 살짝 부풀고(돈필) 끝은 빠진다(수필) */
export function strokeWidths(pts: readonly RawPoint[], opts: RibbonOptions): number[] {
  'worklet';
  const n = pts.length;
  const base = opts.width ?? STROKE.baseWidth;
  const v = opts.meshVersion ?? 2;
  const acc: number[] = [0];
  for (let i = 1; i < n; i++) acc.push(acc[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  const L = Math.max(acc[n - 1]!, 1e-6);
  const speed: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(i - 2, 0)]!;
    const b = pts[Math.min(i + 2, n - 1)]!;
    const dt = Math.max(b.t - a.t, 1);
    speed.push((Math.hypot(b.x - a.x, b.y - a.y) / dt) * 1000); // W/s
  }
  const out: number[] = [];
  const tailStart = v >= 2 ? 0.62 : 0.7;
  const tailMin = (v >= 2 ? 0.12 : 0.2) - 0.06 * (opts.taper ?? 0);
  for (let i = 0; i < n; i++) {
    const s = acc[i]! / L;
    const hk = Math.min(s / 0.18, 1);
    const head = v >= 2 ? 0.72 + 0.28 * Math.sin((hk * Math.PI) / 2) : 0.78 + 0.22 * Math.min(s / 0.12, 1);
    const tt = Math.max(0, (s - tailStart) / (1 - tailStart));
    const tail = 1 - (1 - tailMin) * tt * tt * (3 - 2 * tt);
    const sp = Math.min(Math.max(1.18 - 0.07 * speed[i]!, 0.62), 1.18);
    const pr = pts[i]!.p === undefined ? 1 : 0.7 + 0.6 * pts[i]!.p!;
    out.push(base * head * tail * sp * pr);
  }
  return out;
}

/** 스파인 + 폭 → 삼각형 리본(시작·끝 둥근 캡 선택) */
export function buildRibbon(pts: readonly RawPoint[], opts: RibbonOptions = {}): Ribbon {
  'worklet';
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  const n = pts.length;
  if (n === 0) return { positions, indices, uvs };
  const w = opts.widths ? opts.widths.slice() : strokeWidths(pts, opts);
  if (n === 1) {
    // 점 하나: 둥근 방울
    const r = w[0]! / 2;
    positions.push(pts[0]!.x, pts[0]!.y);
    uvs.push(0, 0);
    for (let k = 0; k <= 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      positions.push(pts[0]!.x + Math.cos(a) * r, pts[0]!.y + Math.sin(a) * r);
      uvs.push(0, 1);
      if (k > 0) indices.push(0, k, k + 1);
    }
    return { positions, indices, uvs };
  }
  // 이웃 평균 법선(조인이 둥글게 이어지도록 앞뒤 두 칸 평균)
  const nx: number[] = [];
  const ny: number[] = [];
  for (let i = 0; i < n; i++) {
    let tx = 0;
    let ty = 0;
    for (let k = -2; k <= 2; k++) {
      const a = pts[Math.min(Math.max(i + k, 0), n - 1)]!;
      const b = pts[Math.min(Math.max(i + k + 1, 0), n - 1)]!;
      const lx = b.x - a.x;
      const ly = b.y - a.y;
      const l = Math.hypot(lx, ly);
      if (l > 1e-9) {
        const wk = 3 - Math.abs(k);
        tx += (lx / l) * wk;
        ty += (ly / l) * wk;
      }
    }
    const l = Math.hypot(tx, ty) || 1;
    nx.push(-ty / l);
    ny.push(tx / l);
  }
  const acc: number[] = [0];
  for (let i = 1; i < n; i++) acc.push(acc[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  const L = Math.max(acc[n - 1]!, 1e-6);
  for (let i = 0; i < n; i++) {
    const h = w[i]! / 2;
    const u = acc[i]! / L;
    positions.push(pts[i]!.x + nx[i]! * h, pts[i]!.y + ny[i]! * h, pts[i]!.x - nx[i]! * h, pts[i]!.y - ny[i]! * h);
    uvs.push(u, 1, u, -1);
    if (i > 0) {
      const a = (i - 1) * 2;
      const b = i * 2;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const cap = (idx: number, sign: number) => {
    'worklet';
    const h = w[idx]! / 2;
    const cx = pts[idx]!.x;
    const cy = pts[idx]!.y;
    const center = positions.length / 2;
    positions.push(cx, cy);
    uvs.push(idx === 0 ? 0 : 1, 0);
    const a0 = Math.atan2(ny[idx]!, nx[idx]!);
    const seg = 8;
    for (let k = 0; k <= seg; k++) {
      const a = a0 + sign * (k / seg) * Math.PI;
      positions.push(cx + Math.cos(a) * h, cy + Math.sin(a) * h);
      uvs.push(idx === 0 ? 0 : 1, 1);
      if (k > 0) indices.push(center, center + k, center + k + 1);
    }
  };
  if (opts.roundStart !== false) cap(0, 1);
  if (opts.roundEnd) cap(n - 1, -1);
  return { positions, indices, uvs };
}
