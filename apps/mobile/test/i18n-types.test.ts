// 타입 안전 키·변수(D-17): 아래 @ts-expect-error가 '오류 없음'이 되면 pnpm typecheck가 실패한다.
// en.ts에서 키를 하나 빼거나 더해도 typecheck가 실패한다(Messages = ko의 키 전부).
import { describe, expect, it } from 'vitest';
import { t } from '../src/i18n';
import type { Messages } from '../src/i18n/types';

function typeChecks() {
  t('obj.brush');
  t('day.name', { n: 3 });
  t('night.name', { n: 1, day: '첫날' });
  // @ts-expect-error 없는 키
  t('obj.nope');
  // @ts-expect-error 변수가 필요한 키에 변수 없음
  t('day.name');
  // @ts-expect-error 변수 이름 틀림
  t('day.name', { x: 3 });
  // @ts-expect-error 변수 없는 키에 변수
  t('obj.brush', { n: 1 });
  // @ts-expect-error 키가 빠진 표
  const partial: Messages = { 'obj.brush': 'x' };
  return partial;
}

describe('i18n 타입', () => {
  it('타입 검사는 typecheck가 한다(이 파일은 컴파일만 되면 된다)', () => {
    expect(typeof typeChecks).toBe('function');
  });
});
