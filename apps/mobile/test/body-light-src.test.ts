// V12a 정반사 금지 — 몸 빛 셰이더 소스 정적 검사(리뷰 H1 ①, OPERATING 7 '교정은 검사로').
// 렌더 지표(램버트 잔차, skia/body-light.test.tsx)와 함께 두 겹으로 막는다: 소스에 하이라이트를 만들 수단이 아예 없어야 한다.
import { describe, expect, it } from 'vitest';
import { BODY_LIGHT_D0, BODY_LIGHT_SKSL } from '../src/render/bodyLightSrc';

const body = BODY_LIGHT_SKSL.slice(BODY_LIGHT_SKSL.indexOf('half4 main'));
const lines = body.split('\n').map((l) => l.trim());

describe('몸 빛 셰이더 소스 — 정반사 금지', () => {
  it('거듭제곱·지수·반사·하프 벡터·문턱 함수가 없다', () => {
    for (const bad of [/\bpow\s*\(/, /\bexp2?\s*\(/, /\blog2?\s*\(/, /\breflect\s*\(/, /\brefract\s*\(/, /\bstep\s*\(/, /\bsmoothstep\s*\(/, /\bH\b/, /\bhalfV/i, /\bspec/i, /\bgloss/i, /\bshin/i]) {
      expect(BODY_LIGHT_SKSL, String(bad)).not.toMatch(bad);
    }
  });

  it('램버트 d = dot(n, L) 하나, d를 쓰는 줄은 d·up·dn 세 줄뿐이고 L은 그 dot에만 쓴다', () => {
    const dLines = lines.filter((l) => /\bd\b/.test(l));
    expect(dLines).toEqual([
      'float d = dot(n, L);',
      `float up = clamp((d - ${BODY_LIGHT_D0}) / ${(1 - BODY_LIGHT_D0).toFixed(2)}, 0.0, 1.0);`,
      `float dn = clamp((${BODY_LIGHT_D0} - d) / 1.1, 0.0, 1.0);`,
    ]);
    expect(lines.filter((l) => /\bL\b/.test(l))).toEqual(['float d = dot(n, L);']);
  });

  it('섞임은 밝힘 a(lift × smoothstep 다항식) + 어둡힘 b(sink × dn) 두 항뿐이고, 출력은 그 둘만 쓴다', () => {
    expect(lines).toContain('float a = lift * up * up * (3.0 - 2.0 * up);');
    expect(lines).toContain('float b = sink * dn;');
    expect(lines).toContain('return half4(half3(lightCol * a), a + b);');
    expect(lines.filter((l) => l.startsWith('return'))).toHaveLength(1);
    // 셰이더 안 변수는 정해진 것뿐(새 항을 몰래 더하지 못하게)
    const decls = lines.filter((l) => /^(float|float2|float3|half|half3|half4)\s/.test(l) && !l.includes('main(')).map((l) => l.split(/\s+/)[1]);
    expect(decls).toEqual(['q', 'r2', 'z', 'n', 'd', 'up', 'dn', 'a', 'b']);
  });
});
