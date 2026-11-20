// eslint 주석 규율을 ESLint 밖에서 한 번 더 본다(A6 리뷰 M3). 인라인 설정 주석은 규율 규칙(mong/eslint-comment-discipline) 자신까지
// 끌 수 있어서, 린트가 0건이어도 우회가 남는다. 이 검사는 ESLint 설정·주석의 영향을 받지 않는다.
// 판정 함수는 규칙과 같은 classifyComment 하나. 대상은 ESLint가 보는 파일(eslint.config.mjs ignores를 그대로 따름).
// 실행: node tools/eslint/check-directives.mjs  (pnpm verify의 directives 단계)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { classifyComment } from './mong-plugin.mjs';

const EXT = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const LABEL = { reason: 'eslint-disable에 `-- 이유`가 없다', blanket: '규칙 이름 없는 eslint-disable', inlineConfig: '인라인 설정 주석(/* eslint … */·/* global … */)' };

/** 소스 하나의 위반 목록 [{ line, kind }] — 진짜 주석만 본다(문자열 안의 '/* eslint …' 은 해당 없음) */
export function checkSource(code, file = 'x.tsx') {
  const { ast } = tseslint.parser.parseForESLint(code, { comment: true, loc: true, range: true, jsx: /x$/.test(file), filePath: file });
  const out = [];
  for (const c of ast.comments ?? []) {
    const kind = classifyComment(c.value, c.type);
    if (kind) out.push({ line: c.loc.start.line, kind });
  }
  return out;
}

async function main() {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const listed = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\n').filter((f) => EXT.test(f));
  const eslint = new ESLint({ cwd: root });
  const bad = [];
  let n = 0;
  for (const f of listed) {
    let code;
    try {
      code = readFileSync(root + f, 'utf8');
    } catch {
      continue; // 지워졌지만 아직 색인에 있는 파일
    }
    if (await eslint.isPathIgnored(root + f)) continue;
    n++;
    for (const v of checkSource(code, f)) bad.push(`${f}:${v.line} ${LABEL[v.kind]}`);
  }
  if (bad.length) {
    for (const b of bad) console.error(`error ${b}`);
    console.error(`✖ eslint 주석 규율 위반 ${bad.length}건 — 설정은 eslint.config.mjs, 예외는 \`// eslint-disable-next-line <규칙> -- <이유>\``);
    process.exit(1);
  }
  console.log(`eslint 주석 규율 통과: ${n}개 파일`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
