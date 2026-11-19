// 한국어 조사 자동 선택: 앞말 끝 글자의 받침으로 고른다. ICU에서는 {motif, josa, 이/가} 꼴로 쓴다.
// 받침 판정이 안 되는 글자(영문 등)는 "을(를)"처럼 둘 다 적는다 — 틀린 조사보다 낫다.
// 판정 규칙(11-20 리뷰): 끝의 문장부호(. , ! ? …)와 괄호·따옴표 묶음은 건너뛰고 그 앞 글자로 판정한다.
//  - "몽망이(Mongmang)" + 이/가 → "몽망이(Mongmang)가"(괄호 뒤에 붙인다)
//  - "달." + 이/가 → "달이."(조사는 끝 문장부호 앞에 넣는다)
//  - 묶음 앞에 말이 없으면 묶음 안으로 판정: "「먼 산」" + 이/가 → "「먼 산」이"

/** 지원하는 짝: [받침 있을 때, 받침 없을 때]. '으로/로'는 ㄹ 받침이면 '로' */
const PAIRS: Record<string, readonly [string, string]> = {
  '을/를': ['을', '를'],
  '이/가': ['이', '가'],
  '은/는': ['은', '는'],
  '과/와': ['과', '와'],
  '와/과': ['과', '와'],
  '으로/로': ['으로', '로'],
  '(으)로': ['으로', '로'],
  '아/야': ['아', '야'],
  '이에요/예요': ['이에요', '예요'],
};

export function isJosaStyle(style: string): boolean {
  return Object.prototype.hasOwnProperty.call(PAIRS, style);
}

const RIEUL = 8;
/**
 * 숫자를 한자어로 읽을 때의 받침: 0 영, 1 일, 2 이, 3 삼, 4 사, 5 오, 6 육, 7 칠, 8 팔, 9 구.
 * 끝자리 0을 '영'(받침 ㅇ)으로 읽어도 10(십)·100(백)·1000(천)이 모두 받침 있는 소리라 조사 결과는 같다.
 */
const DIGIT_JONG = [21, 8, 0, 16, 0, 0, 1, 8, 8, 0];
const TRAIL_PUNCT = /[.,!?…;:]/;
const CLOSE_TO_OPEN: Record<string, string> = { ')': '(', ']': '[', '}': '{', '」': '「', '』': '『', '”': '“', '’': '‘', '"': '"', "'": "'" };

/** 끝 글자의 받침 번호(0 = 없음), 판정 불가면 null. 끝 문장부호·공백·괄호 묶음은 건너뛴다 */
export function jongseong(word: string): number | null {
  const chars = [...word];
  let i = chars.length - 1;
  while (i >= 0) {
    const ch = chars[i]!;
    const open = CLOSE_TO_OPEN[ch];
    if (open !== undefined) {
      // 짝이 되는 여는 괄호까지 건너뛴다(없으면 닫는 괄호만 건너뜀)
      let j = i - 1;
      while (j >= 0 && chars[j] !== open) j--;
      // 묶음 앞에 판정할 말이 없으면("「먼 산」") 묶음 안 글자로 판정한다
      const before = j > 0 ? chars.slice(0, j).join('').trim() : '';
      i = j >= 0 && before !== '' ? j - 1 : i - 1;
      continue;
    }
    if (/\s/.test(ch) || TRAIL_PUNCT.test(ch) || ch === '·') {
      i--;
      continue;
    }
    const c = ch.codePointAt(0)!;
    if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28;
    if (ch >= '0' && ch <= '9') return DIGIT_JONG[c - 48]!;
    return null;
  }
  return null;
}

export function josa(word: string, pair: string): string {
  const p = PAIRS[pair];
  if (!p) throw new Error(`josa: unsupported style "${pair}"`);
  // 조사는 끝 문장부호 앞에 넣는다
  const m = word.match(/^(.*?)([.,!?…;:]+)$/su);
  const [head, tail] = m ? [m[1]!, m[2]!] : [word, ''];
  const j = jongseong(head);
  let particle: string;
  if (j === null) particle = `${p[0]}(${p[1]})`;
  else if (pair === '으로/로' || pair === '(으)로') particle = j === 0 || j === RIEUL ? p[1] : p[0];
  else particle = j === 0 ? p[1] : p[0];
  return head + particle + tail;
}
