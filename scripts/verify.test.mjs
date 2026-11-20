// pnpm verify 인자·판정 시험(A6 리뷰 M1): 오타·빈 --only가 '0단계 통과'로 끝나지 않는다. 실행: node --test scripts/verify.test.mjs
// 잘못된 인자는 단계를 하나도 돌리기 전에 끝나므로 실제 프로세스로 확인한다(빠름).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { STEP_NAMES, parseArgs, verdict } from './verify.mjs';

const VERIFY = fileURLToPath(new URL('./verify.mjs', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [VERIFY, ...args], { encoding: 'utf8', timeout: 10_000 });

describe('verify 인자', () => {
  it('정상: --only 두 꼴, --heavy', () => {
    assert.deepEqual([...parseArgs(['--only', 'lint,test']).only], ['lint', 'test']);
    assert.deepEqual([...parseArgs(['--only=lint']).only], ['lint']);
    assert.equal(parseArgs(['--heavy']).heavy, true);
    assert.equal(parseArgs([]).only, null);
  });
  it('모르는 단계·빈 값·모르는 인자는 오류', () => {
    assert.match(parseArgs(['--only', 'lnt']).error, /모르는 단계: lnt/);
    assert.match(parseArgs(['--only']).error, /이름이 없다/);
    assert.match(parseArgs(['--only=']).error, /이름이 없다/);
    assert.match(parseArgs(['--only', '--heavy']).error, /이름이 없다/);
    assert.match(parseArgs(['--onyl', 'lint']).error, /모르는 인자/);
  });
  for (const args of [['--only', 'lnt'], ['--only'], ['--only='], ['--bogus']]) {
    it(`CLI ${args.join(' ')} → 종료 코드 2 + 단계 목록, 아무 단계도 돌지 않음`, () => {
      const r = cli(...args);
      assert.equal(r.status, 2);
      assert.match(r.stderr, new RegExp(STEP_NAMES.join(', ')));
      assert.doesNotMatch(r.stdout, /▶|verify 통과/);
    });
  }
});

describe('verify 판정', () => {
  it('돈 단계가 0개면 실패', () => {
    assert.equal(verdict([]).ok, false);
  });
  it('하나라도 실패면 실패, 모두 통과면 통과', () => {
    assert.equal(verdict([{ ok: true }, { ok: false, name: 'lint' }]).ok, false);
    assert.equal(verdict([{ ok: true }]).ok, true);
  });
});
