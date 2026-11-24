import { describe, expect, it } from 'vitest';

// TDZ 가드(리뷰 2-2): worklets 바벨 플러그인은 `function f() { 'worklet' }`를 `const f = ...`로 바꾸고
// 정의 시점에 클로저를 잡는다 → 같은 파일에서 **아래에 선언된** 최상위 이름을 worklet이 참조하면
// 웹·네이티브에서만 "Cannot access before initialization"이 난다(Vitest는 플러그인 없이 돌아 못 잡음).
// 이 테스트는 core와 앱(apps/mobile/src, .tsx 포함 — 11-24 바텀시트 리뷰 W) 소스를 정적으로 읽어 그 순서를 강제한다.
// worklet 판정 = 최상위 선언의 **본문 첫 문장**이 'worklet'(중괄호 깊이 0의 함수 본문). 컴포넌트 안에 중첩된 worklet은
// 렌더할 때 만들어지므로 TDZ 대상이 아니다 — 예전 판정('본문 어딘가에 worklet')은 컴포넌트 전체를 worklet으로 봐 오탐 5건을 냈다.
const CORE = import.meta.glob<string>('../src/**/*.ts', { query: '?raw', import: 'default', eager: true });
const APP = import.meta.glob<string>('../../../apps/mobile/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
const SOURCES = { ...CORE, ...APP };

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
    return { ...h, end, worklet: isTopLevelWorklet(src.slice(h.start, end)) };
  });
}

const MARK = '__WORKLET_DIRECTIVE__';

/** 선언 본문(중괄호 깊이 0에서 열린 첫 블록)의 첫 문장이 'worklet'인가. 매개변수·반환 타입의 { }는 깊이를 맞춰 지나간다 */
export function isTopLevelWorklet(decl: string): boolean {
  const code = stripNoise(decl.replace(/(['"])worklet\1\s*;?/g, MARK));
  let depth = 0;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') {
      if (depth === 0) {
        // 깊이 0의 '{' 중 바로 앞이 ')'·'=>'·반환 타입 끝인 것만 함수 본문 후보 — 그 뒤 첫 토큰이 표시인지 본다
        const after = code.slice(i + 1).trimStart();
        if (after.startsWith(MARK)) return true;
      }
      depth++;
    } else if (ch === '}') depth--;
  }
  return false;
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
  it('core·앱 소스를 읽었다(.tsx 포함)', () => {
    expect(Object.keys(CORE).length).toBeGreaterThanOrEqual(10);
    expect(Object.keys(APP).filter((f) => f.endsWith('.tsx')).length).toBeGreaterThanOrEqual(10);
  });
  it('판정: 본문 첫 문장만 worklet으로 본다(중첩 worklet·매개변수 타입의 중괄호는 아님)', () => {
    expect(isTopLevelWorklet("function f(p: { a: number; b: number }): { x: number } {\n  'worklet';\n  return { x: p.a };\n}")).toBe(true);
    expect(isTopLevelWorklet("const g = (a: number) => {\n  'worklet';\n  return a;\n};")).toBe(true);
    expect(isTopLevelWorklet("export function C() {\n  const s = useAnimatedStyle(() => {\n    'worklet';\n    return {};\n  });\n  return null;\n}")).toBe(false);
    expect(isTopLevelWorklet("const styles = StyleSheet.create({ a: { flex: 1 } });")).toBe(false);
  });
  for (const [file, src] of files) {
    it(`${file.replace(/^(\.\.\/)+/, '')}: worklet이 아래에 선언된 최상위 이름을 참조하지 않는다`, () => {
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
