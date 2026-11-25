// 운영 경로의 수단어 해시 표 배선(v3 리뷰 2차 L-c). 시험 전용 표를 넘기지 않은 기본 경로가
// rules-v0 `hashPepper`·`meansHashes.strong`·`meansHashes.soft`를 실제로 쓰는지 본다.
// 평문 수단어는 쓰지 않는다: SHA-256을 감싸 무의미 낱말 두 개만 운영 표의 해시 한 칸으로 돌려준다(그 밖은 진짜 SHA-256).
import { describe, expect, it, vi } from 'vitest';
import RULES from '../src/v3/data/rules-v0.json';

const H = vi.hoisted(() => ({ calls: [] as string[], fake: new Map<string, string>() }));
vi.mock('../src/v3/sha256', async (orig) => {
  const real = await orig<typeof import('../src/v3/sha256')>();
  return {
    ...real,
    sha256Hex: (s: string) => {
      H.calls.push(s);
      return H.fake.get(s) ?? real.sha256Hex(s);
    },
  };
});
const { v3 } = await import('../src/index');

const P = RULES.crisis.hashPepper;
const STRONG = RULES.crisis.meansHashes.strong;
const SOFT = RULES.crisis.meansHashes.soft;
/** 운영 표의 한 칸(앞 16자)을 돌려주는 가짜 SHA-256 값 */
const as = (h16: string) => h16 + '0'.repeat(48);

describe('운영 수단어 해시 표가 기본 경로에 물려 있다(L-c)', () => {
  it('운영 표는 비어 있지 않고 16자 16진수', () => {
    expect(P.length).toBeGreaterThan(8);
    expect(STRONG.length).toBeGreaterThan(0);
    expect(SOFT.length).toBeGreaterThan(0);
    for (const h of [...STRONG, ...SOFT]) expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
  it('기본 경로는 운영 고추가루로 해시한다', () => {
    H.calls.length = 0;
    v3.crisisMatch('qzvx');
    expect(H.calls.length).toBeGreaterThan(0);
    expect(H.calls.every((c) => c.startsWith(P))).toBe(true);
    expect(H.calls).toContain(P + 'qzvx');
  });
  it('운영 strong 표의 칸 → strong, soft 표의 칸 → soft (표를 넘기지 않은 crisisMatch·interpretWord)', () => {
    H.fake.set(P + 'qzvx', as(STRONG[0]!));
    H.fake.set(P + '뷁퓌', as(SOFT[0]!));
    try {
      expect(v3.crisisMatch('qzvx').level).toBe('strong');
      expect(v3.crisisMatch('뷁퓌').level).toBe('soft');
      expect(v3.interpretWord('qzvx', 'en')).toEqual({ kind: 'stay', level: 'strong' });
      expect(v3.interpretWord('뷁퓌', 'ko')).toEqual({ kind: 'stay', level: 'soft' });
      // 마지막 칸까지 표 전체가 실린다(앞 몇 칸만 싣는 잘림 방지)
      H.fake.set(P + 'qzvx', as(STRONG[STRONG.length - 1]!));
      H.fake.set(P + '뷁퓌', as(SOFT[SOFT.length - 1]!));
      expect(v3.crisisMatch('qzvx').level).toBe('strong');
      expect(v3.crisisMatch('뷁퓌').level).toBe('soft');
    } finally {
      H.fake.clear();
    }
    // 가짜를 걷으면 다시 걸리지 않는다(무의미 낱말이 진짜로 표에 있는 것이 아님)
    expect(v3.crisisMatch('qzvx').level).toBe('none');
    expect(v3.crisisMatch('뷁퓌').level).toBe('none');
  });
  it('다른 고추가루로 만든 같은 낱말은 운영 경로에서 걸리지 않는다', () => {
    H.fake.set('wrong-pepper:' + 'qzvx', as(STRONG[0]!));
    try {
      expect(v3.crisisMatch('qzvx').level).toBe('none');
    } finally {
      H.fake.clear();
    }
  });
});
