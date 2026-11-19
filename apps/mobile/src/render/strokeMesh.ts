// 붓 획 기하: 입력 점열 → (다듬기) → 속도·압력 기반 가변 폭 리본 삼각형.
// React·Skia에 의존하지 않는 순수 함수. 획 데이터(점열)가 곧 세이브 데이터다.

export interface InputPoint {
  x: number;
  y: number;
  /** ms */
  t: number;
  /** 0..1, 없으면 0.5 (마우스·압력 미지원 기기) */
  p?: number;
}

export interface Vec {
  x: number;
  y: number;
}

export interface StrokeMesh {
  vertices: Vec[];
  textures: Vec[];
  indices: number[];
  halo: { vertices: Vec[]; textures: Vec[] };
  /** 획 길이(px) */
  len: number;
  /** 0..1, 빠르고 가볍게 그을수록 큼 */
  dry: number;
  /** 샘플 중심선(몸에 붙이기 판정에 쓴다) */
  spine: Vec[];
  /** 평균 속도 px/ms, 평균 압력 */
  speed: number;
  pressure: number;
}

const STEP = 2.5;

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 너무 가까운 점 제거 */
function dedupe(pts: InputPoint[], min = 1.5): InputPoint[] {
  const out: InputPoint[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || dist(last, p) >= min) out.push(p);
  }
  return out;
}

/** Chaikin 모서리 깎기: 손 떨림을 지우는 '다듬기' */
export function chaikin(pts: InputPoint[], iterations: number): InputPoint[] {
  let cur = pts;
  for (let k = 0; k < iterations; k++) {
    if (cur.length < 3) return cur;
    const next: InputPoint[] = [cur[0]!];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i]!;
      const b = cur[i + 1]!;
      next.push(lerpPt(a, b, 0.25), lerpPt(a, b, 0.75));
    }
    next.push(cur[cur.length - 1]!);
    cur = next;
  }
  return cur;
}

function lerpPt(a: InputPoint, b: InputPoint, k: number): InputPoint {
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    t: a.t + (b.t - a.t) * k,
    p: (a.p ?? 0.5) + ((b.p ?? 0.5) - (a.p ?? 0.5)) * k,
  };
}

interface Sample extends Vec {
  s: number; // 누적 길이
  speed: number;
  p: number;
}

/** 일정 간격 재표본 + 점마다 속도 */
function resample(pts: InputPoint[]): Sample[] {
  if (pts.length === 0) return [];
  // 원본 점마다 속도(px/ms), EMA로 부드럽게
  const speeds: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const v = dist(a, b) / Math.max(b.t - a.t, 4);
    speeds.push(speeds[i - 1]! * 0.6 + v * 0.4);
  }
  if (pts.length > 1) speeds[0] = speeds[1]!;

  const out: Sample[] = [{ x: pts[0]!.x, y: pts[0]!.y, s: 0, speed: speeds[0]!, p: pts[0]!.p ?? 0.5 }];
  let acc = 0;
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = dist(a, b);
    let d = STEP - carry;
    while (d <= seg) {
      const k = d / seg;
      out.push({
        x: a.x + (b.x - a.x) * k,
        y: a.y + (b.y - a.y) * k,
        s: acc + d,
        speed: speeds[i - 1]! + (speeds[i]! - speeds[i - 1]!) * k,
        p: (a.p ?? 0.5) + ((b.p ?? 0.5) - (a.p ?? 0.5)) * k,
      });
      d += STEP;
    }
    carry = seg - (d - STEP);
    acc += seg;
  }
  const last = pts[pts.length - 1]!;
  const tail = out[out.length - 1]!;
  if (dist(tail, last) > 0.5) {
    out.push({ x: last.x, y: last.y, s: acc, speed: speeds[speeds.length - 1]!, p: last.p ?? 0.5 });
  }
  return out;
}

export interface MeshOptions {
  /** 기준 반폭(px) */
  width: number;
  /** 다듬기 강도(Chaikin 반복). 그리는 중 1, 손을 뗀 뒤 3 */
  smooth?: number;
}

export function buildStrokeMesh(input: InputPoint[], opts: MeshOptions): StrokeMesh | null {
  const pts = chaikin(dedupe(input), opts.smooth ?? 1);
  const samples = resample(pts);
  if (samples.length < 2) return null;
  const len = samples[samples.length - 1]!.s;

  // 폭: 압력↑ 굵게, 속도↑ 가늘게. EMA로 떨림 제거.
  const widths: number[] = [];
  let w = 0;
  samples.forEach((sm, i) => {
    const pressure = 0.7 + 0.6 * sm.p;
    const speed = Math.min(Math.max(1.2 - 0.32 * sm.speed, 0.45), 1.2);
    const target = opts.width * pressure * speed;
    w = i === 0 ? target : w * 0.85 + target * 0.15;
    widths.push(w);
  });
  // 윤곽: 둥근 시작(붓을 누른 자리) + 끝 테이퍼
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!.s;
    const w0 = widths[i]!;
    const cap = Math.min(w0 * 0.9, len * 0.3);
    let k = 1;
    if (s < cap) {
      const x = (cap - s) / cap;
      k = Math.sqrt(Math.max(1 - x * x, 0)) * 0.85 + 0.15;
    }
    const sn = s / len;
    if (sn > 0.55) k *= 1 - ((sn - 0.55) / 0.45) ** 1.6 * 0.75;
    widths[i] = w0 * k;
  }

  const vertices: Vec[] = [];
  const textures: Vec[] = [];
  const hv: Vec[] = [];
  const ht: Vec[] = [];
  const indices: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    const a = samples[Math.max(i - 1, 0)]!;
    const b = samples[Math.min(i + 1, samples.length - 1)]!;
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const tl = Math.hypot(tx, ty) || 1;
    const nx = -ty / tl;
    const ny = tx / tl;
    const c = samples[i]!;
    const wi = widths[i]!;
    vertices.push({ x: c.x + nx * wi, y: c.y + ny * wi }, { x: c.x - nx * wi, y: c.y - ny * wi });
    textures.push({ x: c.s, y: -1 }, { x: c.s, y: 1 });
    const hw = wi * 1.6 + 1.5;
    hv.push({ x: c.x + nx * hw, y: c.y + ny * hw }, { x: c.x - nx * hw, y: c.y - ny * hw });
    ht.push({ x: c.s, y: -1 }, { x: c.s, y: 1 });
    if (i > 0) {
      const o = (i - 1) * 2;
      indices.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
  }

  const speed = samples.reduce((acc, s) => acc + s.speed, 0) / samples.length;
  const pressure = samples.reduce((acc, s) => acc + s.p, 0) / samples.length;
  const dry = Math.min(Math.max(speed * 0.32 - 0.08 + (0.5 - pressure) * 0.3, 0), 0.85);

  return {
    vertices,
    textures,
    indices,
    halo: { vertices: hv, textures: ht },
    len,
    dry,
    spine: samples.map(({ x, y }) => ({ x, y })),
    speed,
    pressure,
  };
}

/** 미리 정한 제어점으로 가짜 입력 만들기(속도 px/ms, 압력 일정) */
export function synthStroke(ctrl: Vec[], speed: number, pressure = 0.5, t0 = 0): InputPoint[] {
  const out: InputPoint[] = [];
  let t = t0;
  ctrl.forEach((c, i) => {
    if (i > 0) t += dist(ctrl[i - 1]!, c) / speed;
    out.push({ x: c.x, y: c.y, t, p: pressure });
  });
  // Catmull-Rom처럼 보이도록 미리 한 번 촘촘하게
  return chaikin(out, 2);
}

/** 점에서 몸(방울 원 + 기존 획 중심선)까지 가장 가까운 점 */
export function nearestOnBody(p: Vec, dropR: number, spines: Vec[][]): { point: Vec; d: number } {
  const dl = Math.hypot(p.x, p.y) || 1;
  let best = { point: { x: (p.x / dl) * dropR * 0.8, y: (p.y / dl) * dropR * 0.8 }, d: Math.max(dl - dropR, 0) };
  for (const sp of spines) {
    for (const q of sp) {
      const d = dist(p, q);
      if (d < best.d) best = { point: q, d };
    }
  }
  return best;
}
