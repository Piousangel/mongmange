import { Skia } from '@shopify/react-native-skia';
import { DREAM_LIMITS, type DreamOp, type DreamScene } from '@mong/core';

// 스미나가시 셰이더: 픽셀마다 물 위 조작을 거꾸로 되짚어(역사상) 그 점이 어느 방울에서 왔는지 찾는다.
// 런타임 셰이더는 Shader로만 쓴다(RN Skia 웹에 ImageFilter.MakeRuntimeShader 없음).
const NP = DREAM_LIMITS.pre;
const NQ = DREAM_LIMITS.post;
const NS = DREAM_LIMITS.segs;

const SRC = /* sksl */ `
uniform float2 origin;
uniform float unit;
uniform float2 shift;
uniform float npre;
uniform float npost;
uniform float nseg;
uniform float4 preA[${NP}];
uniform float4 preB[${NP}];
uniform float4 postA[${NQ}];
uniform float4 postB[${NQ}];
uniform float4 segA[${NS}];
uniform float4 segB[${NS}];
uniform float3 inkC;
uniform float3 goldC;
uniform float aa;
uniform float grain;
uniform float3 fade;
uniform float yLim;
uniform float poolFill;

float hash(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1, 0)), u.x), mix(hash(i + float2(0, 1)), hash(i + float2(1, 1)), u.x), u.y);
}

// res = (맞음, 농도, 금박, (d/r)^2)
float2 undoOp(float2 p, float4 A, float4 B, inout float4 res) {
  float ty = B.w;
  if (ty < 0.5) {
    float2 d = p - A.xy;
    float l2 = dot(d, d);
    float r2 = A.z * A.z;
    if (l2 < r2) { res = float4(1.0, A.w, B.x + 2.0 * B.y, l2 / r2); return p; }
    return A.xy + d * sqrt(1.0 - r2 / l2);
  } else if (ty < 1.5) {
    float2 m = A.zw;
    float ml = max(length(m), 1e-6);
    float2 mh = m / ml;
    float2 nn = float2(-mh.y, mh.x);
    float dist = abs(dot(p - A.xy, nn));
    float f = B.z > 0.5 ? exp(-(dist * dist) / (B.x * B.x)) : B.x / (dist + B.x);
    if (B.y > 0.0) { float al = dot(p - A.xy, mh); f *= exp(-(al * al) / (B.y * B.y)); }
    return p - m * f;
  } else if (ty < 2.5) {
    float2 d = p - A.xy;
    float l2 = dot(d, d);
    float a = -A.z * exp(-l2 / (A.w * A.w));
    float c = cos(a);
    float s = sin(a);
    return A.xy + float2(c * d.x - s * d.y, s * d.x + c * d.y);
  }
  if (ty < 3.5) {
    float2 nn = float2(-A.y, A.x);
    return p - A.xy * A.z * sin(A.w * dot(p, nn) + B.x);
  }
  return A.xy + (p - A.xy) / A.zw;
}

float2 segDisp(float2 p) {
  float2 total = float2(0.0);
  float cur = -1.0;
  float bestD = 1e9;
  float2 bestV = float2(0.0);
  for (int k = 0; k < ${NS}; k++) {
    if (float(k) >= nseg) break;
    float4 S = segA[k];
    float4 Q = segB[k];
    if (Q.z != cur) { total += bestV; bestD = 1e9; bestV = float2(0.0); cur = Q.z; }
    float2 a = S.xy;
    float2 ba = S.zw - S.xy;
    float bb = max(dot(ba, ba), 1e-8);
    float h = clamp(dot(p - a, ba) / bb, 0.0, 1.0);
    float d = length(p - a - ba * h);
    if (d < bestD) { bestD = d; bestV = (ba / sqrt(bb)) * Q.x * Q.y / (d + Q.y); }
  }
  return total + bestV;
}

float4 evalAt(float2 p) {
  float4 res = float4(0.0);
  for (int i = 0; i < ${NQ}; i++) {
    if (float(${NQ - 1} - i) >= npost) continue;
    p = undoOp(p, postA[${NQ - 1} - i], postB[${NQ - 1} - i], res);
    if (res.x > 0.5) return res;
  }
  float2 d1 = segDisp(p);
  p -= segDisp(p - d1 * 0.5);
  for (int i = 0; i < ${NP}; i++) {
    if (float(${NP - 1} - i) >= npre) continue;
    p = undoOp(p, preA[${NP - 1} - i], preB[${NP - 1} - i], res);
    if (res.x > 0.5) return res;
  }
  return res;
}

half4 main(float2 xy) {
  float4 acc = float4(0.0);
  float cnt = 0.0;
  for (int s = 0; s < 4; s++) {
    if (float(s) >= aa) break;
    float2 o = s == 0 ? float2(0.125, -0.375) : s == 1 ? float2(-0.375, -0.125) : s == 2 ? float2(0.375, 0.125) : float2(-0.125, 0.375);
    float2 q = xy + (aa > 1.0 ? o : float2(0.0));
    // 한지 섬유를 따라 먹이 스민 가장자리(픽셀 크기 지터)
    q += (float2(vnoise(q * 0.7), vnoise(q * 0.7 + 7.3)) - 0.5) * grain;
    float2 p = (q - origin) / unit + shift;
    // 물의 숨: 아주 낮은 주파수 흔들림(완벽한 원 금지)
    p += (float2(vnoise(p * 7.0 + 3.1), vnoise(p * 7.0 + 11.7)) - 0.5) * 0.007;
    float4 r = evalAt(p);
    float a = 0.0;
    float3 col = inkC;
    if (r.x > 0.5 && r.z > 1.5) {
      // 빈 자리(몽망이 자리). 이불 띠에서는 누빈 주름 줄로 채운다
      if (poolFill > 0.5) {
        // 누빔: 마름모 두 방향 바늘땀 + 아래로 처진 주름
        float k = 115.0;
        float sag = 0.012 * sin(p.x * 30.0);
        float d1 = abs(sin((p.x + p.y + sag) * k * 0.5));
        float d2 = abs(sin((p.x - p.y - sag) * k * 0.5));
        float seam = max(smoothstep(0.93, 1.0, 1.0 - d1), smoothstep(0.93, 1.0, 1.0 - d2));
        a = (0.13 + 0.07 * vnoise(p * 40.0) + 0.38 * seam) * (0.92 + 0.16 * vnoise(p * 120.0));
      }
    } else if (r.x > 0.5) {
      if (r.z > 0.5) {
        col = goldC * (0.9 + 0.2 * vnoise(q * 0.3));
        a = 0.92;
      } else {
        float t2 = r.w;
        float edge = smoothstep(0.8, 1.0, t2) + 0.55 * smoothstep(0.12, 0.0, t2);
        float dens = r.y * (1.0 + 0.32 * edge);
        dens *= 0.9 + 0.1 * vnoise(p * 140.0) + 0.12 * (vnoise(p * 18.0) - 0.5);
        // 찍을 때 먹이 덜 묻은 작은 반점(탁본 결)
        float hole = smoothstep(0.7, 0.95, vnoise(p * 260.0 + 3.1)) * 0.22 * smoothstep(0.3, 0.8, r.y);
        dens *= 1.0 - hole;
        col = mix(inkC + float3(0.03, 0.04, 0.07), inkC, smoothstep(0.1, 0.6, r.y));
        a = clamp(dens, 0.0, 0.96);
      }
    }
    acc += float4(col * a, a);
    cnt += 1.0;
  }
  acc /= max(cnt, 1.0);
  // 인화 가장자리: 종이에 덜 묻은 바깥(둥근 감쇠) + 글 줄 위에서 끊김
  float fd = length(xy - fade.xy);
  float edgeN = vnoise(xy * 0.012) - 0.5;
  acc *= 1.0 - smoothstep(fade.z * 0.9, fade.z * 1.12, fd + edgeN * fade.z * 0.12);
  acc *= 1.0 - smoothstep(yLim - unit * 0.035, yLim, xy.y + edgeN * unit * 0.02);
  return half4(acc);
}
`;

export const marbleFx = (() => {
  const fx = Skia.RuntimeEffect.Make(SRC);
  if (!fx) throw new Error('marble shader compile failed');
  return fx;
})();

function pack(ops: readonly DreamOp[], n: number, pool = -1): { A: number[]; B: number[] } {
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
        B.push(o.gold ? 1 : 0, o.r === pool && o.x === 0 && o.y === 0 ? 1 : 0, 0, 0);
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
  poolFill = 0,
) {
  const pre = pack(scene.pre, NP);
  const post = pack(scene.post, NQ, scene.pool);
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
    origin,
    unit,
    shift,
    npre: scene.pre.length,
    npost: scene.post.length,
    nseg: scene.segs.length,
    preA: pre.A,
    preB: pre.B,
    postA: post.A,
    postB: post.B,
    segA,
    segB,
    inkC: scene.ink,
    goldC: GOLD,
    aa,
    grain: Math.max(0.8, unit / 700),
    fade,
    yLim,
    poolFill,
  };
}
