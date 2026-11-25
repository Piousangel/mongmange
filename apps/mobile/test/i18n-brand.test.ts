// 앱 이름 글자 고정 금지(C11c): 영어 이름은 12-05 판정(D-06 R5)에 따라 바뀔 수 있어, i18n 문구는 brand.ts `MONG_EN`(en.ts의 `${M}`)만 쓴다.
// 문구 파일 소스(주석 줄 제외)를 읽어 브랜드 글자가 직접 박혔는지 본다 — 값(en 객체)에는 상수가 끼워진 뒤라 소스를 본다.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LINK_PAGE_APP_TITLES, MONG_EN } from '../src/i18n/brand';

const DIR = path.resolve(__dirname, '../src/i18n');
const KO_NAME = '몽망이';

/**
 * 예외 목록 — 여기 적힌 파일·글자만 브랜드 글자를 직접 쓸 수 있다. 늘릴 때는 이유를 같이 적는다.
 * - brand.ts: 이름을 정의하는 자리(상수 자체).
 * - ko.ts의 '몽망이': 한국어 이름은 바뀌지 않고(D-06은 영어 이름만 판정), 문장마다 조사('몽망이가'·'몽망이를')가 글자로 붙어 있어
 *   상수로 빼면 조사 처리({x, josa})를 92곳에 새로 넣어야 한다. 한국어 이름이 바뀌는 결정이 생기면 이 예외를 지우고 상수로 옮긴다.
 */
const ALLOWED: Record<string, readonly string[]> = {
  'brand.ts': [MONG_EN, KO_NAME, ...LINK_PAGE_APP_TITLES],
  'ko.ts': [KO_NAME],
};

/** 지금 영어 이름 + 후보·옛 표기. 상수 값이 바뀌어도 옛 이름이 글자로 남지 않게 함께 막는다(en-copy-review 7절 후보) */
const BANNED = [...new Set([MONG_EN, 'Mongmangi', 'Mong-mangE', 'mongmangE', KO_NAME])];

/** 줄 주석·블록 주석을 뺀 소스(문구 값 안의 'https://' 같은 글자는 줄 머리가 아니라 남는다) */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

function brandHits(file: string, src: string): string[] {
  const allowed = ALLOWED[file] ?? [];
  const body = code(src);
  const hits: string[] = [];
  body.split('\n').forEach((line, i) => {
    for (const b of BANNED) {
      if (allowed.includes(b)) continue;
      if (line.toLowerCase().includes(b.toLowerCase())) hits.push(`${file}:${i + 1} '${b}' — ${line.trim().slice(0, 80)}`);
    }
  });
  return hits;
}

describe('i18n 문구에 앱 이름 글자 직접 금지(C11c)', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.ts'));
  it('문구 파일 전체를 본다(en·ko 포함)', () => {
    expect(files).toEqual(expect.arrayContaining(['en.ts', 'ko.ts', 'brand.ts']));
  });
  it.each(files)('%s', (f) => {
    expect(brandHits(f, readFileSync(path.join(DIR, f), 'utf8'))).toEqual([]);
  });
  it('en.ts는 이름을 brand.ts 상수로 받는다', () => {
    const src = readFileSync(path.join(DIR, 'en.ts'), 'utf8');
    expect(src).toMatch(/import \{ MONG_EN as M \} from '\.\/brand'/);
    expect((src.match(/\$\{M\}/g) ?? []).length).toBeGreaterThanOrEqual(50);
  });
  it('검사기 자체: 글자로 박은 이름·대소문자 바꾼 이름을 잡고, 주석·상수는 지나간다', () => {
    expect(brandHits('en.ts', "  'x': 'Your Mongmangi sleeps',")).toHaveLength(1);
    expect(brandHits('en.ts', "  'x': 'your MONGMANGI',")).toHaveLength(1);
    expect(brandHits('en.ts', "  'x': '몽망이',")).toHaveLength(1);
    expect(brandHits('ko.ts', "  'x': 'Mongmangi가',")).toHaveLength(1);
    expect(brandHits('ko.ts', "  'x': '몽망이가',")).toEqual([]);
    expect(brandHits('en.ts', '  // Mongmangi from a link\n  \'x\': `Your ${M}`,')).toEqual([]);
  });
});
