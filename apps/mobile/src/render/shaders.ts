import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';
import { BODY_LIGHT_SKSL } from './bodyLightSrc';
import { strokeInkSksl } from './strokeInkSrc';

// 스파이크 02 셰이더. 스파이크 01의 방울(dropFx: 방사형 가시·외눈)과 획별 농도 셰이더는 폐기했다(BRIEF 0절).
// 해시는 fract 기반 — mediump 줄무늬 위험(R2)은 실기기 측정 항목.
const NOISE = /* sksl */ `
float hash(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1, 0)), u.x),
             mix(hash(i + float2(0, 1)), hash(i + float2(1, 1)), u.x), u.y);
}
float2 rot(float2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return float2(c * p.x - s * p.y, s * p.x + c * p.y);
}
`;

/** 한지(#EFE8DA): 큰 얼룩 + 섬유 2겹 + 입자 + 왼쪽 위 아침 빛. light = 밝기 배율(긋기 모드 1.02) */
const PAPER = /* sksl */ `
uniform float2 res;
uniform float3 base;
uniform float light;
${NOISE}
float fbm4(float2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + float2(17.1, 9.2); a *= 0.5; }
  return v;
}
half4 main(float2 xy) {
  float3 c = base;
  c *= 0.975 + 0.045 * fbm4(xy * 0.005);
  float fib = 0.0;
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float2 q = rot(xy + 5.0 * float2(vnoise(xy * 0.02 + fi), vnoise(xy * 0.02 + fi + 9.0)), fi * 2.1 + 0.4);
    fib += smoothstep(0.82, 0.97, vnoise(q * float2(0.035, 0.5) + fi * 31.0)) * smoothstep(0.6, 0.9, vnoise(q * 0.07 + fi * 7.0));
  }
  c += fib * 0.018;
  c += (hash(floor(xy)) - 0.5) * 0.016;
  float2 uv = xy / res;
  c *= 1.0 + 0.025 * (1.0 - length(uv - float2(0.1, 0.0)));
  float2 v = uv - 0.5;
  c *= 1.0 - dot(v, v) * 0.16;
  c *= light;
  return half4(half3(c), 1.0);
}
`;

/**
 * 몸 속 먹 질감(셰이더). 몸 칠은 이미지 필터 그래프(블러 → 알파 램프 → 색)로 한 번만 하고,
 * 이 셰이더는 안쪽 면에 아주 낮은 대비 얼룩만 준다. (런타임 셰이더 이미지 필터는 RN Skia 웹에 없어 쓰지 않는다.)
 */
const INK_FILL = /* sksl */ `
uniform float3 body;
uniform float amt;
${NOISE}
half4 main(float2 xy) {
  float n = vnoise(xy * 0.16) * 0.6 + vnoise(xy * 0.5 + 3.0) * 0.4;
  return half4(half3(body * (1.0 + (n - 0.5) * amt)), 1.0);
}
`;

/**
 * 몸 SDF(후보 B): 해석적 핵 SDF(core.ts와 같은 식) + 획·빗 캡슐 거리장을 smooth-min으로 합쳐 coverage를 낸다.
 * segs[i] = (x1, y1, x2, y2), rads[i] = (r1, r2) — W 단위, 핵 중심 원점. 칠은 같은 BODY_COLOR.
 */
export const MAX_SEGS = 128;
const BODY_SDF = /* sksl */ `
uniform float2 origin;
uniform float wpx;
uniform float s;
uniform float4 core;
uniform float2 coreK;
uniform float k;
uniform float nseg;
uniform float4 segs[${MAX_SEGS}];
uniform float2 rads[${MAX_SEGS}];
uniform float soft;
float coreSdf1(float2 q) {
  float px = q.x - coreK.x * (core.w * 0.5 - q.y) / core.w;
  float py = q.y - core.z;
  float2 ab = core.xy;
  float k0 = length(float2(px, py) / ab);
  float k1 = length(float2(px, py) / (ab * ab));
  float de = k1 < 1e-6 ? -min(ab.x, ab.y) : k0 * (k0 - 1.0) / k1;
  float db = q.y - core.w * 0.5;
  float hh = max(coreK.y - abs(de - db), 0.0) / coreK.y;
  return max(de, db) + hh * hh * coreK.y * 0.25;
}
float capsule(float2 p, float4 sg, float2 r) {
  float2 a = sg.xy; float2 b = sg.zw;
  float2 pa = p - a; float2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h) - mix(r.x, r.y, h);
}
half4 main(float2 xy) {
  float2 p = (xy - origin) / wpx;
  float d = s * coreSdf1(p / s);
  for (int i = 0; i < ${MAX_SEGS}; i++) {
    if (float(i) >= nseg) break;
    float e = capsule(p, segs[i], rads[i]);
    float h = clamp(0.5 + 0.5 * (e - d) / k, 0.0, 1.0);
    d = mix(e, d, h) - k * h * (1.0 - h);
  }
  float cov = 1.0 - smoothstep(-soft, soft, d * wpx);
  return half4(cov);
}
`;

/** 획 칠(render-03 획 문법, D-11 비백 셰이더 복원 + M1 먹 슬롯). 소스·uniform은 strokeInkSrc.ts(빌드 1 식 고정 테스트) */
const STROKE_INK = strokeInkSksl(NOISE);

/** V12a 몸 확산광 — 소스는 bodyLightSrc.ts(Skia 없는 순수 모듈, 정반사 금지 정적 시험이 직접 읽는다) */
const BODY_LIGHT = BODY_LIGHT_SKSL;

/** 밤 수면(#141A2C). 1/4 해상도 별도 캔버스(D-11). octaves는 uniform(실기기에서 줄임). 대비 낮은 결로 무섭지 않게 */
const NIGHT = /* sksl */ `
uniform float2 res;
uniform float time;
uniform float2 center;
uniform float octaves;
${NOISE}
float fbmN(float2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= octaves) break;
    v += a * vnoise(p); p = p * 2.03 + float2(17.1, 9.2); a *= 0.5;
  }
  return v;
}
half4 main(float2 xy) {
  float2 uv = xy / res.y;
  float2 q = float2(fbmN(uv * 3.0 + float2(0.0, time * 0.02)), fbmN(uv * 3.0 + float2(5.2, 1.3) - time * 0.015));
  float f = fbmN(uv * 2.4 + 2.2 * q + float2(time * 0.01, 0.0));
  float3 bg = float3(0.0784, 0.1020, 0.1725);
  float3 c = bg * (0.90 + 0.2 * f);
  float band = 1.0 - smoothstep(0.0, 0.012, abs(f - 0.52));
  c += float3(0.10, 0.12, 0.17) * band * 0.12;
  float dc = length((xy - center) / res.y);
  c += float3(0.03, 0.035, 0.05) * exp(-dc * 5.0);
  float2 v = xy / res - 0.5;
  c *= 1.0 - dot(v, v) * 0.3;
  return half4(half3(c), 1.0);
}
`;

/** 조수 경계: 아래에서 위로 오르는 노이즈 경계. 알파 1 = 아직 한지(물이 안 찬 곳) */
const TIDE = /* sksl */ `
uniform float2 res;
uniform float level;
uniform float time;
${NOISE}
half4 main(float2 xy) {
  float e = res.y * (1.08 - level * 1.2);
  float n = vnoise(float2(xy.x * 0.018, time * 0.6)) * 0.6 + vnoise(float2(xy.x * 0.05, time * 0.9 + 4.0)) * 0.4;
  e += (n - 0.5) * 46.0;
  float paper = 1.0 - smoothstep(e - 5.0, e + 5.0, xy.y);
  return half4(paper);
}
`;

function make(src: string, name: string): SkRuntimeEffect {
  const fx = Skia.RuntimeEffect.Make(src);
  if (!fx) throw new Error(`셰이더 컴파일 실패: ${name}`);
  return fx;
}

export const paperFx = make(PAPER, 'paper');
export const inkFillFx = make(INK_FILL, 'inkFill');
export const bodySdfFx = make(BODY_SDF, 'bodySdf');
export const strokeInkFx = make(STROKE_INK, 'strokeInk');
export const bodyLightFx = make(BODY_LIGHT, 'bodyLight');
export const nightFx = make(NIGHT, 'night');
export const tideFx = make(TIDE, 'tide');

export function hexToRgb(hex: string): [number, number, number] {
  'worklet';
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}
