import { describe, expect, it } from 'vitest';

// TDZ 가드(리뷰 2-2): worklets 바벨 플러그인은 `function f() { 'worklet' }`를 `const f = ...`로 바꾸고
// 정의 시점에 클로저를 잡는다 → 같은 파일에서 **아래에 선언된** 최상위 이름을 worklet이 참조하면
// 웹·네이티브에서만 "Cannot access before initialization"이 난다(Vitest는 플러그인 없이 돌아 못 잡음).
// 이 테스트는 core 소스를 정적으로 읽어 그 순서를 강제한다.
const SOURCES = import.meta.glob<string>('../src/**/*.ts', { query: '?raw', import: 'default', eager: true });

interface Decl {
  name: string;
  start: number;
  end: number;
  worklet: boolean;
}

function topLevelDecls(src: string): Decl[] {
  const re = /^(?:export\s+)?(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let)\s+([A-Za-z_$][\w$]*))/gm;
  const hits: { name: string; start: number }[] = [];
  for (let m = re.exec(src); m; m = re.exec(src)) hits.push({ name: (m[1] ?? m[2])!, start: m.index });
  return hits.map((h, i) => {
    const end = i + 1 < hits.length ? hits[i + 1]!.start : src.length;
    const body = src.slice(h.start, end);
    return { ...h, end, worklet: /^\s*'worklet';/m.test(body) };
  });
}

/** 주석·문자열을 지워 오탐을 줄인다 */
function stripNoise(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

describe('core worklet 선언 순서(TDZ 가드)', () => {
  const files = Object.entries(SOURCES);
  it('core 소스를 읽었다', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });
  for (const [file, src] of files) {
    it(`${file.replace('../src/', '')}: worklet이 아래에 선언된 최상위 이름을 참조하지 않는다`, () => {
      const decls = topLevelDecls(src);
      const bad: string[] = [];
      decls.forEach((d, i) => {
        if (!d.worklet) return;
        const body = stripNoise(src.slice(d.start, d.end));
        for (const later of decls.slice(i + 1)) {
          if (later.name === d.name) continue;
          if (new RegExp(`(?<![\\w$.])${later.name.replace(/\$/g, '\\$')}(?![\\w$])`).test(body)) bad.push(`${d.name} → ${later.name}`);
        }
      });
      expect(bad).toEqual([]);
    });
  }
});
