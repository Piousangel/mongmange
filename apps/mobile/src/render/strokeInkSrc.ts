// 획 칠 셰이더 소스와 uniform(Skia를 불러오지 않는 순수 모듈 — 테스트가 소스·uniform을 직접 본다).
// 몸 칠(단일 coverage) 위에 srcATop으로 얹어 **안쪽 농도·비백만** 바꾼다. Vertices 텍스처 좌표:
// x = u + 2·번호(u = 획 길이 방향 0..1, 붓을 뗀 쪽이 1), y = 폭 방향 −1..1.
// 번호 = 슬롯 × 100 + 획 번호(0..39), 획 번호 ≥ 40 = E 빗(늘 슬롯 0). 슬롯 0 = 몸의 먹, 1..4 = 먹 바꾸기로 그은 획(INK_IDS 순서).
//
// H1(M1 코드 리뷰): useStroke = 0이면(기본 먹 — 플래그 꺼짐·먹 고르기 전) **빌드 1 식 그대로**다. 아래 LEGACY 줄은 빌드 1 소스에서
// 한 글자도 바꾸지 않았고(strokeInk.test.ts가 고정), 슬롯 0에서는 번호도 같다.
// useStroke = 1이면 같은 k(바탕 쪽 비율, 몸 먹 기준)를 '획 토큰 기준'으로 환산해 칠한다: kk = (k − tone) / (1 − tone).
// 토큰은 몸 먹 → 바탕 tone 지점이므로 mix(token, paper, kk)의 바탕 비율 = tone + (1 − tone)·kk = k — 농담 결 진폭·비백 목표(0.8)가 빌드 1과 같다.

export const STROKE_INK_UNIFORMS = /* sksl */ `
uniform float3 ink;
uniform float3 paper;
uniform float tone;
uniform float dry;
uniform float useStroke;
uniform float3 stroke0;
uniform float3 stroke1;
uniform float3 stroke2;
uniform float3 stroke3;
uniform float3 stroke4;
`;

/** 빌드 1 획 칠 식(HEAD 11-20 기준 그대로). 슬롯을 떼어 낸 번호 id를 쓴다 */
export const STROKE_INK_LEGACY = /* sksl */ `
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
`;

export const STROKE_INK_LEGACY_RETURN = 'return half4(half3(mix(ink, paper, clamp(k, 0.0, 1.0))), 1.0);';

/** NOISE(vnoise) 소스를 받아 전체 셰이더를 만든다 */
export function strokeInkSksl(noise: string): string {
  return `${STROKE_INK_UNIFORMS}
${noise}
half4 main(float2 t) {
  float id = floor(t.x * 0.5);
  float u = t.x - id * 2.0;
  float slot = floor(id / 100.0);
  id = id - slot * 100.0;
${STROKE_INK_LEGACY}
  if (useStroke < 0.5 || comb) {
    ${STROKE_INK_LEGACY_RETURN}
  }
  float3 base = slot < 0.5 ? stroke0 : slot < 1.5 ? stroke1 : slot < 2.5 ? stroke2 : slot < 3.5 ? stroke3 : stroke4;
  float kk = (k - tone) / max(1.0 - tone, 0.001);
  return half4(half3(mix(base, paper, clamp(kk, -1.0, 1.0))), 1.0);
}
`;
}

/** 획 번호 → 텍스처 번호(슬롯 인코딩). 슬롯 0 = 몸의 먹 */
export function strokeTexId(i: number, slot: number): number {
  'worklet';
  return slot * 100 + i;
}

type Rgb = readonly number[];

/** 프레임별 uniform. 빌드 1 식: ink·paper·tone을 각각 낮↔밤 보간(useStroke = 0). 고른 먹: 슬롯 색도 낮↔밤 보간 */
export function strokeInkUniforms(
  night: number,
  bodyDay: Rgb,
  bodyNight: Rgb,
  paperDay: Rgb,
  paperNight: Rgb,
  tone: number,
  toneNight: number,
  dry: number,
  useStroke: boolean,
  slotsDay: readonly Rgb[],
  slotsNight: readonly Rgb[],
) {
  'worklet';
  const n = night;
  const lerp = (a: Rgb, b: Rgb) => [0, 1, 2].map((i) => a[i]! + (b[i]! - a[i]!) * n);
  const sl = [0, 1, 2, 3, 4].map((i) => (slotsDay[i] && slotsNight[i] ? lerp(slotsDay[i]!, slotsNight[i]!) : [0, 0, 0]));
  return {
    ink: lerp(bodyDay, bodyNight),
    paper: lerp(paperDay, paperNight),
    tone: tone + (toneNight - tone) * n,
    dry: dry * (1 - n),
    useStroke: useStroke ? 1 : 0,
    stroke0: sl[0]!,
    stroke1: sl[1]!,
    stroke2: sl[2]!,
    stroke3: sl[3]!,
    stroke4: sl[4]!,
  };
}
