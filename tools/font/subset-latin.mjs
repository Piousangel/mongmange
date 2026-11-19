// Cormorant Garamond 서브셋(OFL 1.1, 영어판 명조 — 아트 6절: 제목 Medium, 시 한 줄 Italic).
// 영어 문구 파일의 글자 + ASCII·Latin-1·자주 쓰는 문장부호만 남긴다. 한글은 넣지 않는다(한국어는 Gowun Batang).
// 사용: node tools/font/subset-latin.mjs → apps/mobile/assets/fonts/CormorantGaramond_500Medium{,_Italic}.subset.ttf + .chars.txt
// 글꼴 이름은 원래 이름 그대로 — 저작권 줄에 Reserved Font Name 선언이 없다(원장 3절).
import subsetFont from 'subset-font';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PKG = path.join(ROOT, 'node_modules/@expo-google-fonts/cormorant-garamond');
const OUT_DIR = path.join(ROOT, 'apps/mobile/assets/fonts');
const FACES = ['500Medium', '500Medium_Italic'];
/** 영어 화면에 나올 수 있는 글자의 출처(누락 검사 font-subset.test.ts와 같은 범위) */
export const LATIN_SCAN = ['apps/mobile/src/i18n/en.ts', 'apps/mobile/src/i18n/brand.ts'];

const chars = new Set();
for (const rel of LATIN_SCAN) for (const ch of await readFile(path.join(ROOT, rel), 'utf8')) if (ch.codePointAt(0) < 0x3000) chars.add(ch);
for (let c = 0x20; c <= 0x7e; c++) chars.add(String.fromCharCode(c));
for (let c = 0xa0; c <= 0xff; c++) chars.add(String.fromCharCode(c));
for (const ch of '·…—–‘’“”•′″№') chars.add(ch);
const text = [...chars].filter((ch) => ch.codePointAt(0) >= 0x20 && ch !== '\u007f').sort().join('');

await mkdir(OUT_DIR, { recursive: true });
const report = {};
for (const face of FACES) {
  const src = await readFile(path.join(PKG, face, `CormorantGaramond_${face}.ttf`));
  const out = await subsetFont(src, text, { targetFormat: 'truetype' });
  const file = path.join(OUT_DIR, `CormorantGaramond_${face}.subset.ttf`);
  await writeFile(file, out);
  report[face] = { srcBytes: src.length, outBytes: out.length };
}
await writeFile(path.join(OUT_DIR, 'CormorantGaramond.subset.chars.txt'), text);
console.log(JSON.stringify({ chars: [...text].length, ...report }));
