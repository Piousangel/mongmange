// check-directives(ESLint 밖 주석 규율 검사)의 시험 — A6 리뷰 M3 우회 탐침을 고정한다.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkSource } from './check-directives.mjs';

const kinds = (code, file) => checkSource(code, file).map((v) => v.kind);

describe('check-directives', () => {
  it('규율 규칙 자신을 끄는 인라인 설정도 잡는다(ESLint 안에서는 0건인 꼴)', () => {
    assert.deepEqual(kinds('/* eslint mong/eslint-comment-discipline: "off", mong/no-floating-timer: "off" */\nsetTimeout(f, 1);'), ['inlineConfig']);
  });
  it('규칙 이름 없는 파일 전체 disable을 잡는다', () => {
    assert.deepEqual(kinds('/* eslint-disable */\nx();'), ['blanket']);
    assert.deepEqual(kinds('/* eslint-disable -- 이유 */\nx();'), ['blanket']);
  });
  it('/* global */ 로 전역을 여는 꼴을 잡는다', () => {
    assert.deepEqual(kinds('/* global secret */\nsecret();'), ['inlineConfig']);
  });
  it('이유를 단 줄 단위 disable과 일반 주석은 통과', () => {
    assert.deepEqual(kinds('// eslint-disable-next-line no-console -- 개발 로그\nconsole.log(1);\n// eslint 설정은 config에 있다'), []);
  });
  it('문자열 안의 주석 모양은 보지 않는다', () => {
    assert.deepEqual(kinds("const probe = '/* eslint no-console: \"off\" */';"), []);
  });
  it('TSX도 읽는다', () => {
    assert.deepEqual(kinds('/* eslint react-hooks/exhaustive-deps: "off" */\nexport const A = () => <p>{x}</p>;', 'a.tsx'), ['inlineConfig']);
  });
});
