// 정본(StrokeRecord) → 렌더 기하. 세 화면(낮·획·밤)이 이 한 경로와 selectVisual을 함께 쓴다.
import { STROKE, coreScale } from './bodySpec';
import { GRAMMARS, DEFAULT_GRAMMAR, type StrokeGrammar } from './grammar';
import { attachStroke, strokeLocal } from '../geometry/attach';
import { coreSdf } from '../geometry/core';
import { buildRibbon, strokeWidths, type Ribbon, type RibbonOptions } from '../geometry/ribbon';
import { simplifyStroke } from '../geometry/simplify';
import { quantizeRaw } from '../save/envelope';
import { CURRENT_MESH_VERSION } from '../geometry/simplify';
import type { AttachLevel, BodyShape, RawPoint, StrokeRecord } from '../geometry/types';
import { BODY_SHAPES } from '../geometry/shape';

export type StrokeLabel = 'wrap' | 'base' | 'other';

/**
 * 렌더러 분류 라벨(아트 1-3): 바닥 아래에 붙은 획 = 받침(끝 갈라짐 끔, 바닥 담묵 한 띠), 나머지 = 두름.
 * render-03: 받침 띠 160°~200° → 140°~220°(평평한 바닥 현 0.7W를 중심에서 본 각도). 그 사이 짧은 획을 두름으로 띄우면
 * 몸 아래 떠 있는 발·부스러기로 읽혔다.
 */
export function strokeLabel(theta: number, length: number): StrokeLabel {
  'worklet';
  const deg = ((((theta * 180) / Math.PI) % 360) + 360) % 360;
  // 리뷰 반영(11-20): 길이 조건(≤ 0.35W)을 뺐다 — 바닥 띠에 붙은 긴 획을 두름으로 띄우면 몸 아래 받침대·밑줄로 읽혔다
  void length;
  if (deg >= 140 && deg <= 220) return 'base';
  return 'wrap';
}

/**
 * 몸과 획 사이 종이 틈(render-03 획 문법): 앵커(몸에 가장 가까운 점)는 몸에 묻힌 채 두고, 앵커에서 획 길이 ramp만큼
 * 가면 획 안쪽 가장자리가 표면에서 gap만큼 떨어지도록 점을 몸 바깥(광선 방향)으로 민다. 이미 더 멀리 있는 점은 그대로.
 * 몸을 감싼 획이 "윤곽이 두꺼워진 몸"이 아니라 "몸 곁에 얹힌 붓자국"으로 읽히게 하는 규칙. 세이브와 무관한 파생 값.
 */
export function openGap(pts: readonly RawPoint[], widths: readonly number[], s: number, gap: number, ramp: number, shape?: BodyShape): RawPoint[] {
  'worklet';
  const cp = shape ? shape.core : undefined;
  const n = pts.length;
  if (n === 0 || gap <= 0) return pts.slice();
  let ai = 0;
  let best = 1e9;
  for (let i = 0; i < n; i++) {
    const d = coreSdf(pts[i]!.x, pts[i]!.y, s, cp);
    if (d < best) {
      best = d;
      ai = i;
    }
  }
  const acc: number[] = new Array(n).fill(0);
  for (let i = ai + 1; i < n; i++) acc[i] = acc[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  for (let i = ai - 1; i >= 0; i--) acc[i] = acc[i + 1]! + Math.hypot(pts[i]!.x - pts[i + 1]!.x, pts[i]!.y - pts[i + 1]!.y);
  const out: RawPoint[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const u = Math.min(acc[i]! / Math.max(ramp, 1e-6), 1);
    const g = u * u * (3 - 2 * u);
    const target = widths[i]! / 2 + gap;
    // 광선 방향으로 밀면 평평한 바닥처럼 표면이 기운 곳에서 덜 떨어진다 → 세 번 다시 재며 민다
    let x = p.x;
    let y = p.y;
    for (let it = 0; it < 3; it++) {
      const sd = coreSdf(x, y, s, cp);
      const want = sd + Math.max(0, target - sd) * g;
      const push = want - sd;
      if (push <= 1e-5) break;
      const r = Math.hypot(x, y) || 1;
      x += (x / r) * push;
      y += (y / r) * push;
      // 다음 반복은 원래 sd 기준 목표를 유지(g 배율을 두 번 먹지 않게)
      if (g < 1) break;
    }
    const q: RawPoint = { x, y, t: p.t };
    if (p.p !== undefined) q.p = p.p;
    out.push(q);
  }
  return out;
}

/**
 * 한 획의 스파인과 점별 폭(W). k = 부착 진행(0 = 손이 그은 자리, 1 = 붙음), sNow = 지금 핵 크기.
 * g = 획 문법(render-03: 폭·끝 최소 폭·몸과의 틈). 주지 않으면 채택안. shape = 그 개체의 몸(M1 체형), 없으면 기본형.
 */
export function strokeSpine(
  rec: StrokeRecord,
  sNow: number,
  k: number = 1,
  simplified?: readonly RawPoint[],
  gIn?: StrokeGrammar,
  shape?: BodyShape,
): { pts: RawPoint[]; widths: number[]; label: StrokeLabel; opts: RibbonOptions } {
  'worklet';
  const g = gIn ?? GRAMMARS[DEFAULT_GRAMMAR];
  // raw는 불변이라 단순화 결과는 획마다 한 번만 만들어 넘겨도 된다(렌더러 캐시)
  const pts = simplified ?? simplifyStroke(rec.raw, STROKE.simplifiedMax, rec.meshVersion);
  // 획은 부착 당시 체형의 핵 표면에 놓는다(Attach.body, 리뷰 M2). 기록이 없으면(빌드 1·플래그 꺼짐 부착) 지금 그리는 몸에
  const b = rec.attach.body;
  const placeShape = b === 0 || b === 1 || b === 2 ? BODY_SHAPES[b] : shape;
  const placed = strokeLocal(pts, rec.attach, rec.drawnAtCoreScale, sNow, k, placeShape);
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  const label = strokeLabel(rec.attach.theta, L * rec.attach.scale);
  const opts: RibbonOptions = {
    width: g.baseWidth,
    taper: rec.attach.taper * k,
    roundStart: true,
    roundEnd: label === 'base',
    meshVersion: rec.meshVersion,
    tailStart: g.tailStart,
    tailMin: g.tailMin,
  };
  const w0 = strokeWidths(placed, opts);
  // 받침(바닥 아래 짧은 획)은 띄우지 않는다 — 띄우면 몸 아래 떠 있는 발·부스러기로 읽힌다
  const local = label === 'base' ? placed : openGap(placed, w0, sNow, g.gap * k, g.gapRamp, shape);
  return { pts: local, widths: strokeWidths(local, opts), label, opts };
}

/** 한 획의 리본 */
export function strokeRibbon(
  rec: StrokeRecord,
  sNow: number,
  k: number = 1,
  simplified?: readonly RawPoint[],
  gIn?: StrokeGrammar,
  shape?: BodyShape,
): Ribbon {
  'worklet';
  const g = gIn ?? GRAMMARS[DEFAULT_GRAMMAR];
  const sp = strokeSpine(rec, sNow, k, simplified, g, shape);
  return buildRibbon(sp.pts, { ...sp.opts, widths: sp.widths });
}

/** 손가락 정본 점열을 붙여 기록 하나를 만든다. n = 이 획 전 획 수, shape = 그 개체의 몸(M1, 없으면 기본형) */
export function makeRecord(raw: readonly RawPoint[], n: number, level: AttachLevel, shape?: BodyShape): StrokeRecord {
  const q = quantizeRaw(raw);
  const s = coreScale(n);
  const attach = attachStroke(q, s, level, n, shape);
  if (shape) attach.body = shape.body;
  return { raw: q, attach, drawnAtCoreScale: s, meshVersion: CURRENT_MESH_VERSION };
}

/** 합성 손획(테스트 자극물·7일차 포즈용). 극좌표 호를 사람 손처럼 시간·떨림을 넣어 점열로 */
function arcRaw(th0: number, th1: number, r0: number, r1: number, ms: number, wobble: number, seed: number): RawPoint[] {
  const out: RawPoint[] = [];
  const n = Math.max(12, Math.round(ms / 8));
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const e = u * u * (3 - 2 * u); // 붓은 느리게 시작해 빨라졌다가 느려진다
    const th = ((th0 + (th1 - th0) * e) * Math.PI) / 180;
    const r = r0 + (r1 - r0) * e + Math.sin(u * 17 + seed) * wobble;
    out.push({ x: Math.sin(th) * r, y: -Math.cos(th) * r, t: Math.round(u * ms) });
  }
  return out;
}

function lineRaw(x0: number, y0: number, x1: number, y1: number, ms: number): RawPoint[] {
  const out: RawPoint[] = [];
  const n = Math.max(8, Math.round(ms / 8));
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    out.push({ x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u + Math.sin(u * 3.1) * 0.01, t: Math.round(u * ms) });
  }
  return out;
}

/**
 * 7일차 기준 포즈(아트 1-2, `02a` 가운데): 두름 1(등) + 받침 2 + 짧은 두름 3 + 두름 1 = 7획, 핵 1.25W, 빗 완성.
 * 모두 실제 부착 경로(attachStroke, 기본 L2)를 거친다.
 */
export function day7Records(level: AttachLevel = 2, shape?: BodyShape): StrokeRecord[] {
  // 등 쪽 허용 띠는 250°~335°(꼬리 자리 200~250°, 정수리 −25~45°는 금지)
  const raws: RawPoint[][] = [
    arcRaw(312, 252, 0.6, 0.57, 900, 0.004, 1), // 두름 1(첫 두름, 등을 감쌈)
    lineRaw(-0.17, 0.445, -0.03, 0.45, 220), // 받침(왼, 짧게)
    lineRaw(0.05, 0.45, 0.19, 0.445, 220), // 받침(오른)
    arcRaw(96, 138, 0.62, 0.58, 420, 0.003, 2), // 짧은 두름(앞 아래)
    arcRaw(304, 262, 0.7, 0.66, 600, 0.004, 5), // 두름 2(등 바깥)
    arcRaw(142, 162, 0.6, 0.58, 300, 0.003, 4), // 짧은 두름(앞, 작게)
    arcRaw(292, 266, 0.63, 0.6, 380, 0.003, 3), // 짧은 두름(등 아래)
  ];
  return raws.map((r, i) => makeRecord(r, i, level, shape));
}

/** 결정적 의사 난수(시드 고정) — 서툰 손 자극물용 */
function rng(seed: number): () => number {
  let x = seed * 2654435761 >>> 0;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

/**
 * 서툰 손 획 하나: 제어점을 지나는 손가락 경로 + 손 떨림(저주파 흔들림 + 고주파 지글) + 머뭇거림(속도 고르지 않음) + 끝 갈고리.
 * pts = W 단위(그을 때 핵 중심) 제어점, ms = 긋는 시간.
 */
function clumsyRaw(ctrl: readonly (readonly [number, number])[], ms: number, seed: number, shake: number = 0.012, hook: number = 0): RawPoint[] {
  const r = rng(seed);
  const n = Math.max(16, Math.round(ms / 9));
  const out: RawPoint[] = [];
  const ph1 = r() * 6.28;
  const ph2 = r() * 6.28;
  const segs = ctrl.length - 1;
  for (let i = 0; i < n; i++) {
    // 시간 → 진행: 머뭇거리다 빨라지는 손(단조 증가, 고르지 않음)
    const u0 = i / (n - 1);
    const u = Math.min(1, Math.max(0, u0 + 0.06 * Math.sin(u0 * 9 + ph1) * u0 * (1 - u0) * 4));
    const f = u * segs;
    const j = Math.min(Math.floor(f), segs - 1);
    const e = f - j;
    const a = ctrl[Math.max(j - 1, 0)]!;
    const b = ctrl[j]!;
    const c = ctrl[j + 1]!;
    const d = ctrl[Math.min(j + 2, segs)]!;
    // Catmull-Rom
    const e2 = e * e;
    const e3 = e2 * e;
    const cr = (p0: number, p1: number, p2: number, p3: number) =>
      0.5 * (2 * p1 + (-p0 + p2) * e + (2 * p0 - 5 * p1 + 4 * p2 - p3) * e2 + (-p0 + 3 * p1 - 3 * p2 + p3) * e3);
    let x = cr(a[0], b[0], c[0], d[0]);
    let y = cr(a[1], b[1], c[1], d[1]);
    x += Math.sin(u * 11 + ph1) * shake + (r() - 0.5) * shake * 0.5;
    y += Math.cos(u * 13 + ph2) * shake + (r() - 0.5) * shake * 0.5;
    out.push({ x, y, t: Math.round(u0 * ms) });
  }
  if (hook !== 0) {
    // 손을 떼며 짧게 꺾이는 갈고리(서툰 손의 흔한 끝)
    const L = out[out.length - 1]!;
    const P = out[out.length - 4]!;
    const ang = Math.atan2(L.y - P.y, L.x - P.x) + hook;
    for (let k = 1; k <= 5; k++) out.push({ x: L.x + Math.cos(ang) * 0.018 * k, y: L.y + Math.sin(ang) * 0.018 * k, t: L.t + k * 10 });
  }
  return out;
}

/**
 * 서툰 손 7일차 세트(render-03): 실제 유저처럼 떨리고, 길이·자리가 제멋대로이고, 정수리·꼬리 자리·몸 한가운데에도 긋는다.
 * 그을 때 핵 크기는 획 순서대로 coreScale(i). 모두 같은 부착 경로(attachStroke)를 거친다.
 */
export function day7ClumsyRecords(level: AttachLevel = 2, shape?: BodyShape): StrokeRecord[] {
  const raws: RawPoint[][] = [
    clumsyRaw([[-0.62, -0.1], [-0.68, 0.12], [-0.55, 0.34], [-0.3, 0.46]], 1100, 11, 0.014, 0.9), // 왼쪽을 크게 쓸고 바닥에서 꺾임
    clumsyRaw([[-0.1, -0.62], [0.12, -0.66], [0.3, -0.58]], 520, 12, 0.01), // 정수리 위에 가로로(금지 자리 ①)
    clumsyRaw([[0.55, 0.05], [0.62, 0.2], [0.5, 0.38]], 420, 13, 0.012, -1.2), // 앞쪽 짧은 갈고리
    clumsyRaw([[-0.2, 0.0], [0.05, 0.08], [0.25, 0.02]], 380, 14, 0.008), // 몸 한가운데를 가로지름
    clumsyRaw([[-0.5, 0.42], [-0.75, 0.62], [-0.95, 0.66]], 600, 15, 0.016), // 뒤쪽 아래로 길게(꼬리 자리 ②)
    clumsyRaw([[0.62, -0.32], [0.78, -0.3], [0.66, -0.18], [0.82, -0.12], [0.7, -0.02]], 900, 16, 0.01), // 앞 위 지그재그 낙서
    clumsyRaw([[-0.66, -0.36], [-0.5, -0.56], [-0.22, -0.66], [0.02, -0.64]], 800, 17, 0.013), // 등에서 정수리까지 길게
  ];
  return raws.map((r, i) => makeRecord(r, i, level, shape));
}

/**
 * 사람마다 다른 손(thumb-identity v1 시안 `handRaws`를 옮김): 시드마다 획 유형 선호(등 두름·앞 두름·받침·긴 쓸기)가 다르고
 * 자리·길이도 다르다. 썸네일 구별 검사(OPERATING 8-1)와 블라인드 자극물의 '다른 사람 손'에 쓴다. 실제 사람 손은 아니다.
 */
export function handRecords(seed: number, count: number, shape?: BodyShape, level: AttachLevel = 2): StrokeRecord[] {
  const r = rng(seed + 1);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const pref = [r(), r(), r(), r()];
  const sum = pref.reduce((a, b) => a + b, 0);
  const raws: RawPoint[][] = [];
  for (let i = 0; i < count; i++) {
    let u = r() * sum;
    let kind = 0;
    while (kind < 3 && u > pref[kind]!) {
      u -= pref[kind]!;
      kind++;
    }
    if (kind === 0) {
      const a = lerp(258, 330, r());
      raws.push(arcRaw(a, a - lerp(22, 70, r()), lerp(0.56, 0.72, r()), lerp(0.55, 0.7, r()), 600, 0.004, i));
    } else if (kind === 1) {
      const a = lerp(92, 150, r());
      raws.push(arcRaw(a, a + (r() < 0.5 ? -1 : 1) * lerp(14, 40, r()), lerp(0.58, 0.68, r()), lerp(0.56, 0.66, r()), 380, 0.003, i));
    } else if (kind === 2) {
      const x = lerp(-0.25, 0.15, r());
      raws.push(lineRaw(x, 0.45, x + lerp(0.08, 0.2, r()), 0.445, 220));
    } else {
      const a = lerp(200, 300, r());
      raws.push(arcRaw(a, a + lerp(40, 90, r()), lerp(0.62, 0.78, r()), lerp(0.6, 0.74, r()), 900, 0.012, i + 3));
    }
  }
  return raws.map((raw, i) => makeRecord(raw, i, level, shape));
}
