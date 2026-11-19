import { DREAM_LIMITS } from '@mong/core';

// 스미나가시 SkSL 원문(Skia를 불러오지 않는 순수 모듈 — 테스트가 uniform 총량을 센다).
// 픽셀마다 물 위 조작을 거꾸로 되짚어(역사상) 그 점이 어느 방울에서 왔는지 찾는다.
const NP = DREAM_LIMITS.pre;
const NQ = DREAM_LIMITS.post;
const NS = DREAM_LIMITS.segs;

export const MARBLE_SKSL = /* sksl */ `
// 스칼라 묶음 4 vec4 + 색 2 vec4: u0 = (origin.xy, unit, aa), u1 = (shift.xy, grain, yLim), u2 = (fade.xyz, -), u3 = (npre, npost, nseg, -)
uniform float4 u0;
uniform float4 u1;
uniform float4 u2;
uniform float4 u3;
uniform float4 preA[${NP}];
uniform float4 preB[${NP}];
uniform float4 postA[${NQ}];
uniform float4 postB[${NQ}];
uniform float4 segA[${NS}];
uniform float4 segB[${NS}];
uniform float4 inkC4;
uniform float4 goldC4;

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
    if (float(k) >= u3.z) break;
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
    if (float(${NQ - 1} - i) >= u3.y) continue;
    p = undoOp(p, postA[${NQ - 1} - i], postB[${NQ - 1} - i], res);
    if (res.x > 0.5) return res;
  }
  float2 d1 = segDisp(p);
  p -= segDisp(p - d1 * 0.5);
  for (int i = 0; i < ${NP}; i++) {
    if (float(${NP - 1} - i) >= u3.x) continue;
    p = undoOp(p, preA[${NP - 1} - i], preB[${NP - 1} - i], res);
    if (res.x > 0.5) return res;
  }
  return res;
}

half4 main(float2 xy) {
  float2 origin = u0.xy; float unit = u0.z; float aa = u0.w;
  float2 shift = u1.xy; float grain = u1.z; float yLim = u1.w;
  float3 fade = u2.xyz; float3 inkC = inkC4.rgb; float3 goldC = goldC4.rgb;
  float4 acc = float4(0.0);
  float cnt = 0.0;
  for (int s = 0; s < 4; s++) {
    if (float(s) >= aa) break;
    float2 o = s == 0 ? float2(0.125, -0.375) : s == 1 ? float2(-0.375, -0.125) : s == 2 ? float2(0.375, 0.125) : float2(-0.125, 0.375);
    float2 q = xy + (aa > 1.0 ? o : float2(0.0));
    // 한지 섬유를 따라 먹이 스민 가장자리(픽셀 크기 지터)
    q += (float2(vnoise(q * 0.22), vnoise(q * 0.22 + 7.3)) - 0.5) * grain * 1.6 + (float2(vnoise(q * 0.9), vnoise(q * 0.9 + 2.1)) - 0.5) * grain * 0.5;
    float2 p = (q - origin) / unit + shift;
    // 물의 숨: 아주 낮은 주파수 흔들림(완벽한 원 금지)
    p += (float2(vnoise(p * 7.0 + 3.1), vnoise(p * 7.0 + 11.7)) - 0.5) * 0.007;
    float4 r = evalAt(p);
    float a = 0.0;
    float3 col = inkC;
    if (r.x > 0.5 && r.z > 1.5) {
      // 몽망이 자리 = 맑은 물
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

/** SkSL uniform 선언의 vec4 슬롯 수(스칼라·float2·float3도 한 슬롯로 센다 — 패킹이 없다고 보는 보수 계산) */
export function countUniformVec4(src: string): number {
  let total = 0;
  const re = /uniform\s+(float|float2|float3|float4|half|half2|half3|half4|float2x2|float3x3|float4x4)\s+(\w+)(?:\[(\d+)\])?\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const per = m[1] === 'float3x3' ? 3 : m[1] === 'float4x4' ? 4 : m[1] === 'float2x2' ? 2 : 1;
    total += per * (m[3] ? Number(m[3]) : 1);
  }
  return total;
}

/** 이 셰이더가 쓰는 uniform 상한(vec4). 저가 Android 프래그먼트 한도(약 221~224) 아래로 */
export const MARBLE_UNIFORM_BUDGET = 200;
