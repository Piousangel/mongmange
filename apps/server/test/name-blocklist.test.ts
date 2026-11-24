// 이름 금칙어 로더(B5, architecture 3-5-2 '금칙어 통과'). 목록은 비어 있다(작가·PM 몫) — 형식·정규화·판정만 고정한다.
import { describe, expect, it } from 'vitest';
import { sim } from '@mong/core';
import { judgeName } from '../src/pages/page.service';
import { compileNameBlocklist, foldName, NAME_BLOCKLIST, NAME_BLOCKLIST_SOURCE } from '../src/pages/name-blocklist';

const norm = (s: string) => {
  const n = sim.normalizeName(s);
  if (!n.ok) throw new Error(n.reason);
  return n.text;
};

describe('금칙어 목록 형식', () => {
  it('제품 목록은 비어 있다(결정 대기) — 채우면 이 시험을 결정 기록과 함께 고친다', () => {
    expect(NAME_BLOCKLIST_SOURCE).toEqual([]);
    expect(NAME_BLOCKLIST.size).toBe(0);
    expect(judgeName(true, '몽이')).toBe('몽이');
  });
  it('주석·빈 줄은 건너뛰고, 부분 일치(기본)와 전체 일치(=)를 나눈다', () => {
    const b = compileNameBlocklist(['# 설명', '', '나쁜말', '=bad']);
    expect(b.size).toBe(2);
    expect(b.blocks(norm('아주나쁜말이'))).toBe(true);
    expect(b.blocks(norm('bad'))).toBe(true);
    expect(b.blocks(norm('badger'))).toBe(false);
    expect(b.blocks(norm('몽이'))).toBe(false);
  });
  it('정규화: 항목과 이름을 같은 길로 접는다(NFC·대소문자·공백·가운뎃점) — 띄어 쓰거나 점을 찍어 피할 수 없다', () => {
    const b = compileNameBlocklist(['bad word', '나쁜·말']);
    expect(foldName(norm('Bad Word'))).toBe('badword');
    expect(b.blocks(norm('BAD·WORD'))).toBe(true);
    expect(b.blocks(norm('나쁜 말'))).toBe(true);
    expect(b.blocks(norm('나쁜말'.normalize('NFD')))).toBe(true);
  });
  it('이름으로 나올 수 없는 항목(허용 밖 문자·길이 초과·숫자 7개)은 기동 때 실패 — 줄 번호만, 항목 원문은 싣지 않는다', () => {
    expect(() => compileNameBlocklist(['ok', 'a@b'])).toThrow(/2번째 줄/);
    expect(() => compileNameBlocklist(['가나다라마바사'])).toThrow(/1번째 줄/);
    expect(() => compileNameBlocklist(['0101234567'])).toThrow(/digits/);
    try {
      compileNameBlocklist(['a@b']);
    } catch (e) {
      expect(String(e)).not.toContain('a@b');
    }
  });
});
