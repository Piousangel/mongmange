import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

// 공통 노이즈. 해시는 fract 기반이라 mediump GPU에서 깨질 수 있다(REPORT 위험 목록 참고).
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
float fbm(float2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + float2(17.1, 9.2);
    a *= 0.5;
  }
  return v;
}
float2 rot(float2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return float2(c * p.x - s * p.y, s * p.x + c * p.y);
}
`;

/** 한지: 큰 얼룩 + 방향이 다른 섬유 3겹 + 짙은 섬유 + 미세 입자 + 비네트 */
const PAPER = /* sksl */ `
uniform float2 res;
uniform float3 base;
${NOISE}
half4 main(float2 xy) {
  float3 c = base;
  float blot = fbm(xy * 0.0045);
  c *= 0.965 + 0.06 * blot;

  // 섬유: 짧고 살짝 휜 가닥이 드문드문. 방향 3겹.
  float light = 0.0;
  float dark = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float2 w = xy + 6.0 * float2(vnoise(xy * 0.02 + fi), vnoise(xy * 0.02 + fi + 9.0));
    float2 q = rot(w, fi * 2.1 + 0.4);
    float n = vnoise(q * float2(0.035, 0.55) + fi * 31.0);
    float br = vnoise(q * float2(0.06, 0.08) + fi * 7.0);
    light += smoothstep(0.80, 0.97, n) * smoothstep(0.62, 0.9, br);
    float m = vnoise(rot(w, fi * 1.3 + 2.0) * float2(0.05, 0.9) + fi * 13.0);
    float mb = vnoise(w * 0.03 + fi * 5.0);
    dark += smoothstep(0.94, 0.995, m) * smoothstep(0.78, 0.95, mb);
  }
  c += light * 0.022;
  c -= dark * float3(0.06, 0.06, 0.045);
  // 종이 결(아주 낮은 대비의 구름 무늬)
  c *= 0.985 + 0.03 * fbm(xy * 0.03 + 2.0);

  float g = hash(floor(xy)) - 0.5;
  c += g * 0.022;

  float2 uv = xy / res - 0.5;
  c *= 1.0 - dot(uv, uv) * 0.22;
  return half4(half3(c), 1.0);
}
`;

/**
 * 먹 방울(로컬 좌표, 중심 0). 가장자리는 섬유결을 따라 번지고, 눈은 칠하지 않은 종이 빈자리.
 * sleep=1이면 눈이 감긴 선으로 바뀐다.
 */
const DROP = /* sksl */ `
uniform float r;
uniform float blink;
uniform float2 eye;
uniform float eyeR;
uniform float3 ink;
uniform float bleed;
${NOISE}
half4 main(float2 p) {
  // 아래가 살짝 무거운 방울
  float2 q = p;
  q.y -= 0.07 * r * smoothstep(-r, r, p.y);
  q.x *= 1.0 + 0.04 * smoothstep(0.0, r, p.y);
  float d = length(q) - r;

  float n1 = fbm(p * 0.09 + 3.1);
  float n2 = vnoise(rot(p, 0.4) * float2(0.06, 0.55));
  float de = d - (n1 - 0.5) * 3.0 - (n2 - 0.5) * 0.6;
  float body = 1.0 - smoothstep(-1.4, 1.4, de);

  float outD = max(d, 0.0);
  // 번짐: 방향마다 길이가 다른 가시(섬유로 스민 먹) + 옅은 테
  float ang = atan(p.y, p.x);
  float spikes = vnoise(float2(ang * 9.0, 3.0)) * 0.6 + vnoise(float2(ang * 23.0, 8.0)) * 0.4;
  float reach = 2.0 + 7.0 * spikes * spikes * bleed;
  float halo = exp(-outD / reach) * 0.42 * bleed;
  halo *= 0.55 + 0.45 * fbm(p * 0.12 + 7.0);
  // 섬유를 타고 번지는 가는 가닥
  float fiber = 0.0;
  for (int i = 0; i < 2; i++) {
    float2 fq = rot(p, float(i) * 1.7 + 0.4) * float2(0.08, 0.8);
    fiber += smoothstep(0.75, 0.97, vnoise(fq + float(i) * 9.0));
  }
  float feather = fiber * exp(-outD / (2.0 + 2.0 * bleed)) * 0.12 * bleed;

  // 가장자리가 진하고 가운데는 아주 미세하게 얼룩진 농담
  float ring = smoothstep(-6.0, 0.0, d) * 0.05;
  float mottled = (fbm(p * 0.06 + 1.7) - 0.5) * 0.08;
  float dens = clamp(0.93 + ring + mottled, 0.0, 1.0);
  float a = max(body * dens, (halo + feather) * (1.0 - body));
  a = clamp(a, 0.0, 1.0);

  // 눈 = 종이 빈자리. blink 1이면 거의 닫힌 틈.
  float2 e = p - eye;
  float ry = eyeR * max(1.0 - blink, 0.10);
  float ed = (length(e / float2(eyeR, ry)) - 1.0) * min(eyeR, ry);
  ed += (vnoise(e * 0.7 + 4.0) - 0.5) * 0.7;
  float hole = 1.0 - smoothstep(-0.7, 0.7, ed);
  a *= 1.0 - hole * body;

  return half4(half3(ink) * a, a);
}
`;

/**
 * 붓 획(텍스처 좌표: x=획 길이 방향 px, y=폭 방향 -1..1).
 * dry: 획 전체 건조도(속도가 빠를수록 큼). 끝으로 갈수록 먹이 말라 비백이 생긴다.
 * fresh: 0..1, 막 그어진 순간 번짐(1초 애니메이션).
 */
const STROKE = /* sksl */ `
uniform float len;
uniform float dry;
uniform float seed;
uniform float3 ink;
uniform float density;
uniform float fresh;
${NOISE}
half4 main(float2 t) {
  float u = t.x;
  float v = t.y;
  float s = clamp(u / max(len, 1.0), 0.0, 1.0);
  float av = abs(v);

  // 붓털: 폭 방향 고주파, 길이 방향 저주파
  float bristle = vnoise(float2(u * 0.014 + seed, v * 10.0 + seed * 3.0)) * 0.55
                + vnoise(float2(u * 0.05 + seed * 2.0, v * 27.0)) * 0.35
                + vnoise(float2(u * 0.2, v * 60.0)) * 0.10;

  // 건조도: 기본 + 끝으로 갈수록 먹이 마름, 가장자리일수록 더 마름
  float runout = smoothstep(0.45, 1.0, s) * 1.15;
  float dk = clamp(dry * 0.6 + runout * (0.35 + dry * 0.6) + av * 0.25 * runout, 0.0, 1.0);
  float gap = smoothstep(dk - 0.08, dk + 0.08, bristle + 0.25 * (1.0 - dk));

  // 경계: 노이즈로 흔들리는 가장자리, 막 그은 획은 더 퍼짐
  float en = vnoise(float2(u * 0.12 + seed, v * 2.0));
  float edge = 1.0 - smoothstep(0.80 - 0.18 * en, 1.0 + 0.05 * fresh, av);

  // 농담: 시작이 진하고(붓을 누름), 마를수록 회색
  float pool = 1.0 - smoothstep(0.0, 0.3, s) * 0.04;
  float cover = edge * mix(1.0, gap, smoothstep(0.05, 0.4, dk));
  // 마른 자리는 회색(먹이 덜 묻음), 젖은 자리는 거의 불투명
  float wet = 1.0 - 0.45 * smoothstep(0.3, 0.9, dk);
  float a = cover * density * pool * wet;
  a *= 0.95 + 0.05 * fbm(float2(u * 0.05, v * 1.5) + seed);
  a = clamp(a, 0.0, 1.0);
  return half4(half3(ink) * a, a);
}
`;

/** 번짐 halo: 획의 넓은 복제본에 쓰는 옅은 셰이더 */
const STROKE_HALO = /* sksl */ `
uniform float seed;
uniform float3 ink;
uniform float amount;
${NOISE}
half4 main(float2 t) {
  float av = abs(t.y);
  float n = fbm(float2(t.x * 0.04 + seed, t.y * 2.5));
  float a = (1.0 - smoothstep(0.2, 1.0, av)) * amount * (0.4 + 0.6 * n);
  return half4(half3(ink) * a, a);
}
`;

/**
 * 밤 수면: 도메인 워핑으로 먹이 물에 풀리고, 가운데서 몽망이가 잔다.
 * 파문 4개(xy=위치, z=시작 시각, w=세기), 터치하면 먹 흐름이 손가락 쪽으로 밀린다.
 */
const NIGHT = /* sksl */ `
uniform float2 res;
uniform float time;
uniform float2 center;
uniform float r;
uniform float breath;
uniform float4 rp0;
uniform float4 rp1;
uniform float4 rp2;
uniform float4 rp3;
uniform float2 touch;
uniform float touchAmt;
${NOISE}

float ripple(float2 xy, float4 rp, float t) {
  float age = t - rp.z;
  if (age < 0.0 || rp.w <= 0.0) return 0.0;
  float d = length(xy - rp.xy);
  float front = age * 150.0;
  float env = exp(-abs(d - front) / 28.0) * exp(-age * 0.9) * rp.w;
  return sin((d - front) * 0.11) * env;
}

half4 main(float2 xy) {
  float t = time;
  // 파문 → 굴절 오프셋
  float w = ripple(xy, rp0, t) + ripple(xy, rp1, t) + ripple(xy, rp2, t) + ripple(xy, rp3, t);
  float2 xyR = xy + float2(w * 6.0, w * 6.0);

  float2 rel = xyR - center;
  float dist = length(rel);
  // 몽망이 주변 소용돌이: 가까울수록 더 돈다
  float swirl = 2.2 * exp(-dist / (r * 3.2)) + 0.35;
  float2 sw = rot(rel, swirl + t * 0.05) + center;

  // 터치하면 그 근처 흐름이 밀린다
  float2 tv = xyR - touch;
  float tw = touchAmt * exp(-dot(tv, tv) / 9000.0);
  sw += normalize(tv + 0.001) * tw * 40.0;

  float2 p = sw / res.y * 3.0;
  float2 q1 = float2(fbm(p + float2(0.0, t * 0.03)), fbm(p + float2(5.2, 1.3) - t * 0.02));
  float2 q2 = float2(fbm(p + 4.0 * q1 + float2(1.7, 9.2) + t * 0.04),
                     fbm(p + 4.0 * q1 + float2(8.3, 2.8) - t * 0.03));
  float f = fbm(p + 4.0 * q2);

  // 물빛: 위가 조금 밝은 남색
  float3 water = mix(float3(0.035, 0.06, 0.13), float3(0.06, 0.10, 0.20), 1.0 - xy.y / res.y);
  // 먹 구름: 몽망이 둘레 고리에 몰린다
  float ringMask = exp(-pow((dist - r * 3.3) / (r * 1.9), 2.0));
  float inkAmt = smoothstep(0.42, 0.78, f) * (0.35 + 0.65 * ringMask);
  float3 c = mix(water, float3(0.015, 0.02, 0.04), inkAmt * 0.85);
  // 구름 가장자리의 금빛 결
  float vein = 1.0 - smoothstep(0.0, 0.008, abs(f - 0.6));
  vein *= smoothstep(0.4, 0.95, length(q2)) * ringMask;
  c += float3(0.78, 0.60, 0.30) * vein * 0.7;
  // 물결 하이라이트
  c += float3(0.10, 0.13, 0.18) * max(w, 0.0) * 0.8;
  // 몽망이 숨결로 번지는 동심원 물결(얇은 선)
  float ringW = sin(dist * 0.085 - t * 0.9);
  float ringLine = smoothstep(0.96, 1.0, ringW) * smoothstep(r * 1.6, r * 2.6, dist) * exp(-dist / (r * 3.5));
  ringLine *= 0.5 + 0.5 * vnoise(float2(atan(rel.y, rel.x) * 3.0, dist * 0.01));
  c += float3(0.16, 0.19, 0.26) * ringLine * 0.35;
  c += float3(0.02, 0.03, 0.05) * (1.0 - smoothstep(0.0, r * 5.0, dist));

  // 잠든 몽망이: 물에 반쯤 풀린 먹 방울
  float2 bp = (xy - center) / (1.0 + 0.03 * breath);
  float n1 = fbm(bp * 0.06 + t * 0.15);
  float bd = length(bp * float2(1.0, 1.05)) - r + (n1 - 0.5) * 7.0;
  float body = 1.0 - smoothstep(-2.0, 2.5, bd);
  float tail = exp(-max(bd, 0.0) / 14.0) * smoothstep(0.45, 0.75, f) * 0.6;
  float a = max(body, tail);
  float3 inkC = float3(0.01, 0.012, 0.02);
  c = mix(c, inkC, a);
  // 수면 반사 테두리
  c += float3(0.12, 0.15, 0.22) * exp(-abs(bd) / 2.5) * 0.35;
  // 감은 눈: 아래로 휜 짧은 선 두 개(빈자리 대신 은빛 틈)
  for (int i = 0; i < 2; i++) {
    float2 ec = float2((float(i) - 0.5) * r * 0.62, -r * 0.18);
    float2 e = bp - ec;
    float arc = abs(length(e - float2(0.0, -r * 0.16)) - r * 0.16);
    float lid = (1.0 - smoothstep(0.6, 1.6, arc)) * step(-r * 0.04, e.y) * step(abs(e.x), r * 0.17);
    c = mix(c, float3(0.80, 0.78, 0.70), lid * 0.85);
  }
  return half4(half3(c), 1.0);
}
`;

/** 밤: 획을 물결처럼 흔드는 변위 맵(r,g = x,y 변위 0..1, 0.5가 정지) */
const WARP = /* sksl */ `
uniform float time;
uniform float amt;
${NOISE}
half4 main(float2 xy) {
  float2 p = xy * 0.012;
  float2 q = float2(fbm(p + float2(0.0, time * 0.12)), fbm(p + float2(5.2, 1.3) - time * 0.1));
  float x = fbm(p + 2.5 * q + time * 0.05);
  float y = fbm(p + 2.5 * q + float2(3.1, 7.7) - time * 0.05);
  return half4(half(0.5 + (x - 0.5) * amt), half(0.5 + (y - 0.5) * amt), 0.0, 1.0);
}
`;

function make(src: string, name: string): SkRuntimeEffect {
  const fx = Skia.RuntimeEffect.Make(src);
  if (!fx) throw new Error(`셰이더 컴파일 실패: ${name}`);
  return fx;
}

export const paperFx = make(PAPER, 'paper');
export const dropFx = make(DROP, 'drop');
export const strokeFx = make(STROKE, 'stroke');
export const strokeHaloFx = make(STROKE_HALO, 'strokeHalo');
export const nightFx = make(NIGHT, 'night');
export const warpFx = make(WARP, 'warp');

export const INK = [0.07, 0.065, 0.07] as const;
export const VERMILION = [0.84, 0.30, 0.16] as const;
export const PAPER_BASE = [0.925, 0.893, 0.835] as const;
