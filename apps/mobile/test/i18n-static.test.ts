// 하드코딩 0(D-17): 사용자 문구는 src/i18n의 언어 파일에만 있다. 앱 코드의 문자열·JSX 글에 한글이 있으면 실패한다.
// 주석은 보지 않는다. 예외(개발자용):
//  - console.* / new Error( 가 있는 줄(로그·예외 메시지 — 사용자에게 보이지 않음)
//  - 같은 줄에 `i18n-ignore` 표시(개발 자막·스파이크 계측처럼 __DEV__·스파이크 화면에서만 보이는 글)
//  - 파일 첫 줄의 `i18n-ignore-file` 표시(DevPanel처럼 파일 전체가 개발 전용)
//  - 셰이더 소스 문자열 안의 // 주석
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = path.resolve(__dirname, '..');
const SCAN = ['src', 'App.tsx'];
const LANG_DIR = path.join(APP, 'src/i18n');
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;

function files(p: string): string[] {
  if (statSync(p).isFile()) return /\.(ts|tsx)$/.test(p) ? [p] : [];
  return readdirSync(p).flatMap((e) => files(path.join(p, e)));
}

/** 주석을 공백으로 바꾼 소스(줄 번호 유지). 문자열·템플릿 안의 // 는 건드리지 않는다 */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let q: string | null = null;
  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];
    if (q) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i += 2;
        continue;
      }
      // 정규식 리터럴 안의 따옴표에 끌려가지 않게: ' " 문자열은 줄을 넘지 않는다
      if (c === q || (c === '\n' && q !== '`')) q = null;
      i++;
      continue;
    }
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      out += '  ';
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      i += 2;
      out += '  ';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') q = c;
    out += c;
    i++;
  }
  return out;
}

function offenders(): string[] {
  const bad: string[] = [];
  for (const rel of SCAN)
    for (const f of files(path.join(APP, rel))) {
      if (f.startsWith(LANG_DIR + path.sep)) continue;
      const src = readFileSync(f, 'utf8');
      if (/^\/\/ i18n-ignore-file:/.test(src)) continue;
      const raw = src.split('\n');
      stripComments(src)
        .split('\n')
        .forEach((line, i) => {
          // 셰이더(SkSL) 소스 문자열 안의 // 주석도 사용자 글이 아니다
          if (!HANGUL.test(line.replace(/\/\/.*$/, ''))) return;
          if (/i18n-ignore/.test(raw[i]!) || /console\.\w+\(|new Error\(/.test(line)) return;
          bad.push(`${path.relative(APP, f)}:${i + 1}: ${line.trim().slice(0, 80)}`);
        });
    }
  return bad;
}

/** 접근성·표시 속성의 문자열 리터럴(라틴 포함) — 영어 하드코딩도 막는다(리뷰 P2) */
const ATTR_LITERAL = /\b(accessibilityLabel|accessibilityHint|placeholder|title)=(\{\s*)?["'`][^"'`]*[A-Za-z\uAC00-\uD7A3]/;
/** 같은 줄의 JSX 글자(>Close<) 또는 JSX 안의 글자만 있는 줄(대문자로 시작하는 문장) */
const JSX_TEXT_INLINE = /(?<![=-])>\s*[A-Za-z][^<>{}=;()]*<\//;
const JSX_TEXT_LINE = /^\s*[A-Z][A-Za-z’']*( [A-Za-z’',.!?…·-]+)+\s*$/;
/** 파일 통째 예외를 허용하는 파일(개발 빌드 전용) */
const IGNORE_FILE_ALLOW = ['src/game/DevPanel.tsx', 'src/screens/StrokeDevBar.tsx'];

function latinOffenders(): string[] {
  const bad: string[] = [];
  for (const rel of SCAN)
    for (const f of files(path.join(APP, rel))) {
      if (!f.endsWith('.tsx') || f.startsWith(LANG_DIR + path.sep)) continue;
      const src = readFileSync(f, 'utf8');
      if (/^\/\/ i18n-ignore-file:/.test(src)) continue;
      const raw = src.split('\n');
      stripComments(src)
        .split('\n')
        .forEach((line, i) => {
          if (/i18n-ignore/.test(raw[i]!)) return;
          if (ATTR_LITERAL.test(line) || JSX_TEXT_INLINE.test(line) || JSX_TEXT_LINE.test(line)) bad.push(`${path.relative(APP, f)}:${i + 1}: ${line.trim().slice(0, 80)}`);
        });
    }
  return bad;
}

describe('문자열 외부화', () => {
  it('영어(라틴) 하드코딩도 없다: 접근성 속성 리터럴·JSX 글자', () => {
    expect(latinOffenders()).toEqual([]);
  });
  it('검사기 자체: 영어 하드코딩을 잡는다', () => {
    expect(ATTR_LITERAL.test('accessibilityLabel="Back"')).toBe(true);
    expect(ATTR_LITERAL.test("accessibilityLabel={'Back'}")).toBe(true);
    expect(ATTR_LITERAL.test("accessibilityLabel={t('x')}")).toBe(false);
    expect(JSX_TEXT_INLINE.test('<Text>Close</Text>')).toBe(true);
    expect(JSX_TEXT_INLINE.test('<Text>{t("a")}</Text>')).toBe(false);
    expect(JSX_TEXT_LINE.test('          Touch it?')).toBe(true);
  });
  it('파일 통째 예외(i18n-ignore-file)는 허용 목록 파일에만', () => {
    const used = SCAN.flatMap((rel) => files(path.join(APP, rel)))
      .filter((f) => /^\/\/ i18n-ignore-file:/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(APP, f));
    expect(used).toEqual(IGNORE_FILE_ALLOW);
  });
  it('주석 제거기: 문자열 안의 // 는 남기고 주석만 지운다', () => {
    const out = stripComments("const a = 'x // y'; // 한글\n/* 한글 */ b");
    expect(out.split('\n').map((l) => l.trim())).toEqual(["const a = 'x // y';", 'b']);
  });
  it('앱 코드(언어 파일 밖)에 한글 문자열·JSX 글이 없다', () => {
    expect(offenders()).toEqual([]);
  });
  it('개발 예외 표시는 개발 전용 파일·줄에만 쓴다(사용자 화면 파일의 예외 수 상한)', () => {
    // 늘어나면 리뷰: 사용자에게 보이는 글을 예외로 숨기지 않았는지 확인한다
    const count = SCAN.flatMap((rel) => files(path.join(APP, rel))).reduce((n, f) => n + (readFileSync(f, 'utf8').match(/i18n-ignore(?!-file)/g)?.length ?? 0), 0);
    expect(count).toBeLessThanOrEqual(16);
  });
});
