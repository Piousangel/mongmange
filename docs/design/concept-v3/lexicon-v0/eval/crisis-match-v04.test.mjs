// 평가기 v0.4 결함 고정 시험(QA-3 R4-0, 2026-11-25). node --test 로 돈다(pnpm verify 'tools' 단계가 집어 감).
// 결함: 예외 낱말(그만살쪄·자살골·suicidesquad)을 지우면 빈 문자열이 남고, 빈 문자열이 이모티콘 ':('(문장부호를 걷으면 빈 문자열)과
// 맞아 '슬픔'(넓은 그물)으로 갔다. 고친 뒤: 빈 문자열·공백만 남은 입력은 어떤 규칙에도 맞지 않는다. 이모티콘은 입력 전체가 그 이모티콘일 때만 맞는다.
// 수단어 평문은 이 파일에 쓰지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fullPipeline, crisisMatch, sideAnswer } from './crisis-match-v04.mjs';

const noMatch = (raw, lang) => {
  const r = fullPipeline(raw, lang);
  assert.equal(r.level, 'none', `${JSON.stringify(raw)} level`);
  assert.equal(r.sense, undefined, `${JSON.stringify(raw)} 결이 붙으면 안 된다(받은 결 ${r.sense})`);
  assert.equal(sideAnswer(r), null, `${JSON.stringify(raw)} 곁 대답이 나오면 안 된다`);
};

test('예외 제거 뒤 빈 입력 = 무매치(슬픔으로 가지 않는다)', () => {
  noMatch('그만살쪄', 'ko');
  noMatch('자살골', 'ko');
  noMatch('suicidesquad', 'en');
  noMatch('Suicide Squad', 'en');
  // 예외로 지워졌다는 표시는 남는다(분리 규칙을 건너뛰는 근거)
  assert.equal(crisisMatch('그만살쪄').hadException, true);
});

test('빈 문자열·공백만 있는 입력 = 무매치', () => {
  for (const raw of ['', ' ', '   ', '\t\n', '　']) {
    noMatch(raw, 'ko');
    noMatch(raw, 'en');
  }
});

test('이모티콘이 아닌 문장부호만 있는 입력 = 무매치', () => {
  for (const raw of ['...', '!!', '?', '~~', '()', ':', '((']) noMatch(raw, 'en');
});

test('이모티콘 규칙은 경계가 있다: 입력 전체가 이모티콘일 때만 슬픔', () => {
  for (const raw of [':(', ':-(', ');', ' :( ']) {
    const r = fullPipeline(raw, 'en');
    assert.equal(r.sense, 'low.in.sad', `${JSON.stringify(raw)}`);
    assert.equal(r.level, 'none');
    assert.equal(sideAnswer(r), 'soft-net');
  }
  // 다른 글자와 섞이면 이모티콘 규칙이 아니다(문장부호를 걷은 나머지로만 판정)
  assert.notEqual(fullPipeline(':((', 'en').sense, 'low.in.sad');
});
