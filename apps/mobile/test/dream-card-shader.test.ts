// 꿈 인화 카드 셰이더: uniform 총량(스칼라 포함) 고정 + 지연 생성·실패 폴백(앱이 죽지 않게)
import { describe, expect, it, vi } from 'vitest';
import { lazyOnce } from '../src/render/dreamCard/lazyEffect';
import { MARBLE_SKSL, MARBLE_UNIFORM_BUDGET, countUniformVec4 } from '../src/render/dreamCard/marbleSrc';

describe('스미나가시 셰이더 uniform 총량', () => {
  it('스칼라·색까지 모두 세어 200 vec4 이하(지금 194)', () => {
    const n = countUniformVec4(MARBLE_SKSL);
    expect(n).toBeLessThanOrEqual(MARBLE_UNIFORM_BUDGET);
    expect(n).toBe(194);
  });
  it('세는 함수가 배열·스칼라를 다 센다', () => {
    expect(countUniformVec4('uniform float a; uniform float2 b; uniform float4 c[3]; uniform float3x3 m;')).toBe(1 + 1 + 3 + 3);
  });
});

describe('셰이더 지연 생성', () => {
  it('컴파일이 null을 주면 던지지 않고 null, 한 번만 시도한다', () => {
    const make = vi.fn(() => null);
    const fail = vi.fn();
    const get = lazyOnce(make, fail);
    expect(get()).toBeNull();
    expect(get()).toBeNull();
    expect(make).toHaveBeenCalledTimes(1);
    expect(fail).toHaveBeenCalledTimes(1);
  });
  it('컴파일이 예외를 던져도 null(호출 쪽은 평평한 먹 층으로 그린다)', () => {
    const get = lazyOnce(() => {
      throw new Error('uniform limit exceeded');
    });
    expect(() => get()).not.toThrow();
    expect(get()).toBeNull();
  });
  it('모듈을 불러오는 것만으로는 만들지 않는다', () => {
    const make = vi.fn(() => ({ ok: true }));
    lazyOnce(make);
    expect(make).not.toHaveBeenCalled();
  });
});
