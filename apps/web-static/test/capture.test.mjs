// 리뷰 R2: 루트 scripts/web-prelaunch-capture.mjs가 빌드 조건(W7 보호책임자 칸 등)이 바뀌어도 계속 도는지 — 브라우저 없이 빌드만 돌린다
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ROOT } from '../scripts/build.mjs';

it('web-prelaunch-capture --build-only가 종료 0으로 끝난다', () => {
  const repo = join(ROOT, '../..');
  const r = spawnSync(process.execPath, ['scripts/web-prelaunch-capture.mjs', '--build-only'], { cwd: repo, encoding: 'utf8', timeout: 60_000 });
  expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
  expect(r.stdout).toContain('캡처용 빌드 통과');
});
