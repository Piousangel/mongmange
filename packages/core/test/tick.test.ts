import { describe, expect, it } from 'vitest';
import { tick, type CoreState } from '../src/index';

describe('tick', () => {
  const s0: CoreState = { version: 1, lastSimAt: 1_000 };

  it('dt만큼 시각을 전진시키고 입력을 바꾸지 않는다', () => {
    const s1 = tick(s0, 500);
    expect(s1.lastSimAt).toBe(1_500);
    expect(s0.lastSimAt).toBe(1_000);
  });

  it('0 이하·비정상 dt는 무시한다', () => {
    expect(tick(s0, 0)).toBe(s0);
    expect(tick(s0, -1)).toBe(s0);
    expect(tick(s0, Number.NaN)).toBe(s0);
  });
});
