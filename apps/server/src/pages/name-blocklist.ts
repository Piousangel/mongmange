// 공개 이름 금칙어(architecture.md v2.2 3-5-2 '금칙어 통과'). **목록은 비어 있다** — 단어 선정은 작가·PM 몫(결정 대기). 여기는 형식·로더·판정만.
//
// 목록 형식(한 줄 = 한 항목, NAME_BLOCKLIST_SOURCE):
//   단어        — 이름 안 어디에든 들어 있으면 거부(부분 일치)
//   =단어       — 이름 전체가 그 단어일 때만 거부(짧은 말이 다른 이름 속에 섞여 걸리는 오탐 막기)
//   # 설명      — 주석. 빈 줄은 무시
// 정규화: 항목과 이름을 **같은 길**로 접는다 — core normalizeName(NFC·허용 문자·공백 하나) 통과값 → 소문자 → 공백·가운뎃점 제거.
//   그래서 'ab c'·'A·BC'·'abc'는 같은 항목이고, 이름 'A B C'도 같은 키로 비교된다. 이름은 이미 normalizeName을 통과한 값만 온다(judgeName).
//   항목이 normalizeName을 통과하지 못하면(허용 밖 문자·길이 초과) 서버가 **기동 때** 실패한다 — 이름으로 나올 수 없는 항목은 영영 걸리지 않아
//   목록을 고친 사람이 모르고 지나가기 때문이다. 길이 상한은 이름과 같다(한글 6·라틴 12) — 더 긴 항목은 어떤 이름에도 들어갈 수 없다.
// 한계(B5 리뷰 L4): 숫자·라틴을 끼워 넣거나('시1발'·'si발') 발음을 바꾸면 부분 일치를 피한다. normalizeName이 자모·전각·동형 문자는
//   이미 거부하므로 남은 우회는 이것뿐이다. 목록이 생기면 '숫자를 지운 느슨한 키'를 더할지 그때 정한다(오탐은 `=` 항목으로 조절).
import { sim } from '@mong/core';

/** 작가·PM이 채울 목록. 비어 있음(결정 대기 — DECISIONS 'B3 구현 결정' 결정 대기·'B5' 절) */
export const NAME_BLOCKLIST_SOURCE: readonly string[] = [];

export interface NameBlocklist {
  readonly size: number;
  blocks(normalizedName: string): boolean;
}

/** 비교 키: normalizeName 통과값을 소문자로, 공백·가운뎃점을 지운다 */
export function foldName(normalized: string): string {
  return normalized.toLowerCase().replace(/[\s·]/g, '');
}

/** 목록 → 판정기. 잘못된 항목이 하나라도 있으면 던진다(줄 번호와 이유 — 항목 원문은 싣지 않는다: 로그에 금칙어가 퍼지지 않게) */
export function compileNameBlocklist(lines: readonly string[]): NameBlocklist {
  const part = new Set<string>();
  const whole = new Set<string>();
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const exact = line.startsWith('=');
    const n = sim.normalizeName(exact ? line.slice(1) : line);
    if (!n.ok) throw new Error(`금칙어 목록 ${i + 1}번째 줄: normalizeName 실패(${n.reason}) — 이름으로 나올 수 없는 항목`);
    const key = foldName(n.text);
    if (!key) throw new Error(`금칙어 목록 ${i + 1}번째 줄: 비교 키가 비었다`);
    (exact ? whole : part).add(key);
  });
  const parts = [...part];
  return {
    size: part.size + whole.size,
    blocks(normalizedName: string): boolean {
      const k = foldName(normalizedName);
      return whole.has(k) || parts.some((w) => k.includes(w));
    },
  };
}

/** 서버가 쓰는 판정기(모듈을 읽을 때 한 번 — 항목이 틀리면 기동 실패) */
export const NAME_BLOCKLIST = compileNameBlocklist(NAME_BLOCKLIST_SOURCE);
export const nameBlocked = (normalizedName: string): boolean => NAME_BLOCKLIST.blocks(normalizedName);
