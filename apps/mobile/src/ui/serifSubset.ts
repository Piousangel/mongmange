// 이름의 서브셋 밖 한글(C-integrated 2-2·3-3, D-16 개정): 입력은 막지 않고, 그 글자가 들면 늘 한 줄 안내를 띄운다.
// 대체 순서(번들 Gowun Batang → 기기 CJK 세리프 → 기기 기본 고딕)는 글꼴 스택이 한다(웹 SERIF 스택, 네이티브는 OS 대체).
import { SERIF_HANGUL_HEX } from './serifSubsetMap';

let table: Uint8Array | null = null;
function bits(): Uint8Array {
  if (table) return table;
  const t = new Uint8Array(SERIF_HANGUL_HEX.length / 2);
  for (let i = 0; i < t.length; i++) t[i] = parseInt(SERIF_HANGUL_HEX.slice(i * 2, i * 2 + 2), 16);
  table = t;
  return t;
}

/** 한글 완성형 한 글자가 번들 명조 서브셋에 있는가(한글이 아니면 true — 라틴·숫자는 늘 들어 있다) */
export function inSerifSubset(ch: string): boolean {
  const c = ch.normalize('NFC').codePointAt(0)! - 0xac00;
  if (c < 0 || c >= 11172) return true;
  return ((bits()[c >> 3]! >> (c & 7)) & 1) === 1;
}

/** 이름에 서브셋 밖 한글이 하나라도 있는가(안내 한 줄을 띄울 때) */
export function needsFallbackGlyph(text: string): boolean {
  for (const ch of text.normalize('NFC')) if (!inSerifSubset(ch)) return true;
  return false;
}
