// 글꼴 서브셋 누락 검사(v1.2 리뷰 2번): 앱 소스(subset.mjs와 같은 범위)에 쓰인 글자가 모두 서브셋 글자 목록에 있어야 한다.
// 실패하면 `node tools/font/subset.mjs`로 서브셋을 다시 만든다(KS X 1001 밖 한글·한자가 새로 들어온 경우).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const SCAN = ['apps/mobile/src', 'apps/mobile/App.tsx', 'packages/core/src'];
const CHARS = path.join(ROOT, 'apps/mobile/assets/fonts/GowunBatang_400Regular.subset.chars.txt');

function files(p: string): string[] {
  if (statSync(p).isFile()) return /\.(ts|tsx|json)$/.test(p) ? [p] : [];
  return readdirSync(p).flatMap((e) => files(path.join(p, e)));
}

describe('Gowun Batang 서브셋', () => {
  it('앱 소스의 모든 글자가 서브셋 글자 목록에 있다', () => {
    const have = new Set(readFileSync(CHARS, 'utf8'));
    const missing = new Map<string, string>();
    for (const rel of SCAN)
      for (const f of files(path.join(ROOT, rel)))
        for (const ch of readFileSync(f, 'utf8')) {
          if (ch.codePointAt(0)! < 0x20 || have.has(ch) || missing.has(ch)) continue;
          missing.set(ch, path.relative(ROOT, f));
        }
    expect([...missing].map(([c, f]) => `${c} (U+${c.codePointAt(0)!.toString(16).toUpperCase()}) ${f}`)).toEqual([]);
  });
});

// 영어 명조(Cormorant Garamond 라틴 서브셋, D-17): 영어 문구 파일·이름 상수의 글자가 모두 들어 있어야 한다.
// 실패하면 `node tools/font/subset-latin.mjs`로 다시 만든다(새 문장부호·악센트 글자가 들어온 경우).
describe('Cormorant Garamond 서브셋', () => {
  const LATIN_SCAN = ['apps/mobile/src/i18n/en.ts', 'apps/mobile/src/i18n/brand.ts'];
  const LATIN_CHARS = path.join(ROOT, 'apps/mobile/assets/fonts/CormorantGaramond.subset.chars.txt');
  it('영어 문구의 모든 글자(한글·한자 제외)가 서브셋에 있다', () => {
    const have = new Set(readFileSync(LATIN_CHARS, 'utf8'));
    const missing = new Set<string>();
    for (const rel of LATIN_SCAN)
      for (const ch of readFileSync(path.join(ROOT, rel), 'utf8')) {
        const c = ch.codePointAt(0)!;
        if (c < 0x20 || c >= 0x3000 || have.has(ch)) continue;
        missing.add(`${ch} (U+${c.toString(16).toUpperCase()})`);
      }
    expect([...missing]).toEqual([]);
  });
  it('서브셋 파일 두 벌(제목 Medium, 시 한 줄 Medium Italic)이 작다(각 200KB 이하)', () => {
    for (const f of ['CormorantGaramond_500Medium.subset.ttf', 'CormorantGaramond_500Medium_Italic.subset.ttf'])
      expect(statSync(path.join(ROOT, 'apps/mobile/assets/fonts', f)).size).toBeLessThan(200_000);
  });
});
