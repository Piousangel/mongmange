// Gowun Batang 서브셋(OFL 1.1): 앱 소스에 쓰인 글자 + KS X 1001 완성형 한글 2,350자 + 영문·숫자·문장부호.
// 순수 JS(subset-font = harfbuzzjs wasm). 네이티브 의존성 없음. 결정적: 같은 원본·같은 소스 → 같은 글자 목록.
// 사용: node tools/font/subset.mjs  → apps/mobile/assets/fonts/GowunBatang_400Regular.subset.ttf + .chars.txt
// 글꼴 이름(name 테이블)은 원래 이름 그대로 둔다 — 저작권 줄에 Reserved Font Name 선언이 없어 OFL 3항 제한이 없다(원장 3절).
import subsetFont from 'subset-font';
import { readFile, readdir, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC_FONT = path.join(ROOT, 'node_modules/@expo-google-fonts/gowun-batang/400Regular/GowunBatang_400Regular.ttf');
const OUT_DIR = path.join(ROOT, 'apps/mobile/assets/fonts');
const OUT = path.join(OUT_DIR, 'GowunBatang_400Regular.subset.ttf');
const SCAN = ['apps/mobile/src', 'apps/mobile/App.tsx', 'packages/core/src'];

async function* walk(p) {
  const st = await stat(p);
  if (st.isFile()) {
    if (/\.(ts|tsx|json)$/.test(p)) yield p;
    return;
  }
  for (const e of await readdir(p)) yield* walk(path.join(p, e));
}

const chars = new Set();
// 1) 앱 소스의 모든 글자(주석 포함 — 넉넉하게)
for (const rel of SCAN) for await (const f of walk(path.join(ROOT, rel))) for (const ch of await readFile(f, 'utf8')) chars.add(ch);
// 2) KS X 1001 완성형 한글 2,350자(EUC-KR 0xB0A1..0xC8FE)
const dec = new TextDecoder('euc-kr');
let ks = 0;
for (let hi = 0xb0; hi <= 0xc8; hi++)
  for (let lo = 0xa1; lo <= 0xfe; lo++) {
    const ch = dec.decode(new Uint8Array([hi, lo]));
    if (/[가-힣]/.test(ch)) {
      chars.add(ch);
      ks++;
    }
  }
if (ks !== 2350) throw new Error(`KS X 1001 한글 ${ks}자(2350이어야 함)`);
// 3) 영문·숫자·문장부호(ASCII 인쇄 가능 + Latin-1 부호 + 자주 쓰는 일반 문장부호·한글 자모)
for (let c = 0x20; c <= 0x7e; c++) chars.add(String.fromCharCode(c));
for (const ch of '·…—–‘’“”「」『』〈〉《》、。～〜※★☆○●◎◇◆□■△▲▽▼→←↑↓↔°′″™©®§¶•‥“”ㆍ⁠ ') chars.add(ch);
for (let c = 0x3131; c <= 0x318e; c++) chars.add(String.fromCharCode(c)); // 호환 자모(ㄱ~ㆎ)
for (let c = 0xa0; c <= 0xff; c++) chars.add(String.fromCharCode(c));
// 줄바꿈·제어 문자는 글리프가 아니다
const text = [...chars].filter((ch) => ch.codePointAt(0) >= 0x20 && ch !== '\u007f').sort().join('');

const src = await readFile(SRC_FONT);
const out = await subsetFont(src, text, { targetFormat: 'truetype' });
await mkdir(OUT_DIR, { recursive: true });
await writeFile(OUT, out);
await writeFile(OUT.replace(/\.ttf$/, '.chars.txt'), text);
const hangul = [...text].filter((c) => /[가-힣]/.test(c)).length;
console.log(JSON.stringify({ srcBytes: src.length, outBytes: out.length, chars: [...text].length, hangul, ks }, null, 0));
