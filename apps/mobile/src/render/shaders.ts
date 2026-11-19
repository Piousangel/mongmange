import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

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

/**
 * 획 칠(render-03 획 문법, D-11 비백 셰이더 복원): 몸 칠(단일 coverage) 위에 srcATop으로 얹어 **안쪽 농도·비백만** 바꾼다.
 * 가장자리 모양(블러·번짐)은 몸 마스크가 이미 정했으므로 여기서는 색만 낸다. Vertices 텍스처 좌표:
 * x = u + 2·획 번호(u = 획 길이 방향 0..1, 붓을 뗀 쪽이 1), y = 폭 방향 −1..1. 획 번호 ≥ 40 = E 빗(농도 0, 끝 비백만).
 */
const STROKE_INK = /* sksl */ `
uniform float3 ink;
uniform float3 paper;
uniform float tone;
uniform float dry;
${NOISE}
half4 main(float2 t) {
  float id = floor(t.x * 0.5);
  float u = t.x - id * 2.0;
  float v = clamp(t.y, -1.0, 1.0);
  float av = abs(v);
  bool comb = id >= 40.0;
  float k = comb ? 0.0 : tone;
  // 농담 결: 길이 방향으로만 아주 낮게 흔들린다(폭 방향 노이즈는 등고선처럼 보여서 뺐다)
  k *= 0.92 + 0.16 * vnoise(float2(u * 3.0 + id * 7.7, id * 1.3));
  // 비백: 붓털 자국 = 폭 방향으로 촘촘하고 길이 방향으로 길게 늘인 노이즈. 붓을 뗀 쪽(u → 1)에서만 열린다.
  // 가장자리(|v| > 0.75)는 비우지 않아 실루엣은 매끈하게 남는다(털·톱니 금지)
  // 붓털 한 올 = 폭 방향 1차원 노이즈(길이 방향으로는 곧게), 끊김 = 길이 방향 노이즈. 2차원 노이즈 문턱은 등고선처럼 굽어 보였다
  float hair = vnoise(float2(v * 7.0 + id * 17.3, id * 2.9));
  float brk = vnoise(float2(u * 5.0 + id * 5.1, v * 1.5));
  // 둥근 캡(u = 0·1 고정, v = 방사)에서는 비백을 끈다 — 켜면 동심원 결이 생겨 끝이 구슬처럼 빛난다
  float cap = 1.0 - smoothstep(0.985, 0.998, u);
  // 리뷰 반영: 비백은 획 끝 30%에만(획 몸통에 물결 결이 생기면 물얼룩·지문으로 읽혔다)
  float tail = comb ? smoothstep(0.72, 0.95, u) * 0.6 : smoothstep(0.7, 0.97, u);
  float streak = smoothstep(0.64, 0.74, hair) * smoothstep(0.35, 0.55, brk + u * 0.3) * (1.0 - smoothstep(0.55, 0.75, av)) * tail * cap * dry;
  k = k + (0.8 - k) * streak;
  // 먹이 고인 테는 여기서 그리지 않는다 — 몸 마스크의 단일 테가 실루엣에만 생기고, 획끼리 겹친 안쪽에는 선이 안 생긴다
  return half4(half3(mix(ink, paper, clamp(k, 0.0, 1.0))), 1.0);
}
`;

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
export const nightFx = make(NIGHT, 'night');
export const tideFx = make(TIDE, 'tide');

export function hexToRgb(hex: string): [number, number, number] {
  'worklet';
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}
