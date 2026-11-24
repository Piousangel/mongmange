// 회귀 방지(2026-11-20 S25 실기기 'Property CORE doesn't exist', core.ts:72 coreRadius1):
// Worklets 플러그인은 매개변수 기본값에 쓴 모듈 상수를 UI 스레드 클로저로 캡처하지 않는다.
// 웹(JS 스레드)에서는 드러나지 않으므로 정적 검사로 막는다.
// 규칙: 'worklet' 함수의 매개변수 기본값에는 리터럴과 전역(Math·Number·Infinity 등)만 쓴다.
//       모듈 상수가 필요하면 `pIn?: T` + 본문에서 `const p = pIn ?? CONST`.
import { describe, expect, it } from 'vitest';

// 범위: core + 앱(apps/mobile/src, .tsx 포함 — 11-24 바텀시트 리뷰 W). 함수 선언 worklet과 화살표 worklet(`(a = X) => { 'worklet'`) 모두 본다.
const SOURCES = {
  ...import.meta.glob<string>('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob<string>('../../../apps/mobile/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
};
const GLOBALS = new Set(['Math', 'Number', 'Infinity', 'NaN', 'undefined', 'true', 'false', 'null']);

/** i가 '(' 위치일 때 짝이 맞는 ')' 위치 */
function matchParen(code: string, i: number): number {
  let depth = 0;
  for (let k = i; k < code.length; k++) {
    const ch = code[k];
    if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return k;
  }
  return -1;
}

/** 최상위 쉼표로 나눈다(괄호·대괄호·중괄호·꺾쇠 안의 쉼표는 무시) */
function splitTop(params: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of params) {
    if ('([{<'.includes(ch)) depth++;
    else if (')]}>'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/** i가 ')' 위치일 때 짝이 맞는 '(' 위치 */
function matchParenBack(code: string, i: number): number {
  let depth = 0;
  for (let k = i; k >= 0; k--) {
    const ch = code[k];
    if (ch === ')') depth++;
    else if (ch === '(' && --depth === 0) return k;
  }
  return -1;
}

/** 화살표 worklet: `(…)[: 반환형] => { 'worklet'` 의 매개변수 */
function arrowWorkletParams(code: string): { name: string; params: string[] }[] {
  const out: { name: string; params: string[] }[] = [];
  const re = /=>\s*\{\s*'worklet'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const head = code.slice(0, m.index);
    const close = head.search(/\)\s*(?::[^()=]*)?\s*$/);
    if (close < 0) continue;
    const open = matchParenBack(code, close);
    if (open < 0) continue;
    const line = code.slice(code.lastIndexOf('\n', open) + 1, open).trim();
    out.push({ name: `화살표(${line.slice(-30)})`, params: splitTop(code.slice(open + 1, close)) });
  }
  return out;
}

function workletParams(code: string): { name: string; params: string[] }[] {
  const out: { name: string; params: string[] }[] = [];
  const re = /function\s+(\w+)\s*(?:<[^>]*>)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(code, open);
    if (close < 0) continue;
    const brace = code.indexOf('{', close);
    if (brace < 0 || !/^\{\s*'worklet'/.test(code.slice(brace))) continue;
    out.push({ name: m[1] ?? '', params: splitTop(code.slice(open + 1, close)) });
  }
  return [...out, ...arrowWorkletParams(code)];
}

describe('worklet 매개변수 기본값', () => {
  it('앱 .tsx까지 읽는다', () => {
    expect(Object.keys(SOURCES).filter((f) => f.endsWith('.tsx')).length).toBeGreaterThanOrEqual(10);
  });
  it('판정 시험: 화살표 worklet의 모듈 상수 기본값을 잡는다', () => {
    const found = workletParams("const f = (a = LIMIT, b = 2): number => {\n  'worklet';\n  return a + b;\n};");
    expect(found.map((w) => w.params.map((p) => p.trim()))).toEqual([['a = LIMIT', 'b = 2']]);
  });
  it('모듈 상수 등 식별자를 기본값으로 쓰지 않는다(리터럴·전역만)', () => {
    const bad: string[] = [];
    for (const [file, code] of Object.entries(SOURCES)) {
      for (const { name, params } of workletParams(code)) {
        for (const p of params) {
          const eq = p.indexOf('=');
          if (eq < 0 || p[eq + 1] === '>') continue; // 기본값 없음, 또는 화살표 타입
          const expr = p.slice(eq + 1).replace(/'[^']*'|"[^"]*"/g, '');
          const ids = expr.match(/[A-Za-z_$][\w$]*/g) ?? [];
          const free = ids.filter((id, k) => !GLOBALS.has(id) && !(k > 0 && expr.includes(`.${id}`)));
          if (free.length) bad.push(`${file} ${name}: ${p.trim()}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
