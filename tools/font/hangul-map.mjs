// 이름 글꼴 대체 판정용 표(C-integrated 2-2 '글꼴 대체', 아트 6절 v1.3): Gowun Batang 서브셋에 든 한글 완성형을 11,172비트 표(16진수)로 적는다.
// 앱은 이 표로 '이 글자는 카드에 다른 글씨로 찍혀요'를 띄운다. 서브셋을 다시 만들면(node tools/font/subset.mjs) 이것도 다시 돌린다 —
// 어긋나면 apps/mobile/test/m2.test.ts가 잡는다. 사용: node tools/font/hangul-map.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHARS = path.join(ROOT, 'apps/mobile/assets/fonts/GowunBatang_400Regular.subset.chars.txt');
const OUT = path.join(ROOT, 'apps/mobile/src/ui/serifSubsetMap.ts');

export function hangulBitmapHex(text) {
  const bytes = new Uint8Array(Math.ceil(11172 / 8));
  for (const ch of text) {
    const c = ch.codePointAt(0) - 0xac00;
    if (c >= 0 && c < 11172) bytes[c >> 3] |= 1 << (c & 7);
  }
  return Buffer.from(bytes).toString('hex');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const hex = hangulBitmapHex(readFileSync(CHARS, 'utf8'));
  const body = `// 생성 파일 — 손으로 고치지 않는다. 만든 곳: tools/font/hangul-map.mjs(원본: GowunBatang 서브셋 글자 목록)\n// 한글 완성형 11,172자(가 = 0번 비트) 중 번들 명조 서브셋에 든 글자 = 1. 바이트마다 낮은 비트부터.\nexport const SERIF_HANGUL_HEX =\n  '${hex}';\n`;
  writeFileSync(OUT, body);
  console.log(`wrote ${path.relative(ROOT, OUT)} (${hex.length} hex)`);
}
