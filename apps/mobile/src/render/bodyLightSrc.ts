// V12a 몸 확산광 셰이더 소스(Skia를 불러오지 않는 순수 모듈 — 시험이 소스를 직접 본다, strokeInkSrc.ts와 같은 방식).
// 몸 칠 위에 srcATop으로 얹어 몸 coverage 안에서만 섞인다(새 레이어 없음).
// 법선 = 핵 타원을 납작한 돔으로 본 것(타원 밖 획·빗은 가장자리 법선으로 고정). 램버트 d = dot(n, L) 하나만 쓴다.
// **정반사 금지(아트 1-4 '2.5D 광택')**: pow·exp·reflect·반사·하프 벡터를 쓰지 않고, d를 쓰는 줄은 up·dn 두 줄뿐이다
// (apps/mobile/test/body-light-src.test.ts가 고정, 렌더 쪽은 body-light.test.tsx '램버트 모형 적합 잔차').
// 빛 쪽은 빛 색으로 lift까지(smoothstep), 반대쪽은 검정으로 sink까지(선형) 섞는다. 출력은 premultiplied(rgb = 빛 색 × a).
// 좌표 = 몸 W 단위(핵 중심 원점, 기울기·눌림 밖 — 빛은 화면에 고정).

/** 램프 문턱: d가 이 값보다 크면 밝힘, 작으면 어둡힘. 시험의 모형과 같은 수 */
export const BODY_LIGHT_D0 = 0.35;

export const BODY_LIGHT_SKSL = /* sksl */ `
uniform float2 ctr;
uniform float2 ab;
uniform float3 L;
uniform float flatK;
uniform float lift;
uniform float sink;
uniform float3 lightCol;
half4 main(float2 xy) {
  float2 q = (xy - ctr) / ab;
  float r2 = dot(q, q);
  if (r2 > 0.97) q = q * (0.985 / sqrt(r2));
  float z = sqrt(max(1.0 - dot(q, q), 0.0));
  float3 n = normalize(float3(q, z * flatK));
  float d = dot(n, L);
  float up = clamp((d - 0.35) / 0.65, 0.0, 1.0);
  float dn = clamp((0.35 - d) / 1.1, 0.0, 1.0);
  float a = lift * up * up * (3.0 - 2.0 * up);
  float b = sink * dn;
  return half4(half3(lightCol * a), a + b);
}
`;
