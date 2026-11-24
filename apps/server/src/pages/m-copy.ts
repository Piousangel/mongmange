// /m 보조 줄 문구(먹·결 이름). 앱 문구(apps/mobile/src/i18n ko·en 'ink.name'·'temper.name')와 같은 이름 — 문장 틀은 작가 몫(3-5-2 표 '보조 줄').
// 이름은 넣지 않는다(3-5-2: 보조 줄에는 이름이 없다). 시험이 앱 문구 파일과 이름이 같은지 대조한다.
import type { PublicSnapshot, TextureId } from '@mong/core';

type InkId = PublicSnapshot['ink'];

export const INK_NAMES: Record<InkId, { ko: string; en: string }> = {
  songyeon: { ko: '송연먹', en: 'Pine-soot ink' },
  yuyeon: { ko: '유연먹', en: 'Oil-soot ink' },
  jayeon: { ko: '자연먹', en: 'Plum-smoke ink' },
  songhwa: { ko: '송화먹', en: 'Pine-pollen ink' },
};
export const TEXTURE_NAMES: Record<TextureId, { ko: string; en: string }> = {
  tempoNeg: { ko: '느긋결', en: 'Slow-spread' },
  tempoPos: { ko: '날랜결', en: 'Quick-breath' },
  boldnessNeg: { ko: '여린결', en: 'Fine-tip' },
  boldnessPos: { ko: '굳센결', en: 'Firm-stroke' },
  closenessNeg: { ko: '홀로결', en: 'Own-pace' },
  closenessPos: { ko: '곁결', en: 'Close-by' },
  curiosityNeg: { ko: '아늑결', en: 'Homebody' },
  curiosityPos: { ko: '먼눈결', en: 'Far-gazer' },
};

/** "송연먹 · 느긋결 몽망이를 보셨군요" / "You met a Pine-soot ink · Slow-spread Mongmangi" — 결은 이레 뒤에만 */
export function auxLine(ink: InkId, texture: TextureId | undefined): { ko: string; en: string } {
  const i = INK_NAMES[ink];
  const t = texture ? TEXTURE_NAMES[texture] : null;
  return {
    ko: `${t ? `${i.ko} · ${t.ko}` : i.ko} 몽망이를 보셨군요`,
    en: `You met a ${t ? `${i.en} · ${t.en}` : i.en} Mongmangi`,
  };
}

// 공개 이름 금칙어는 name-blocklist.ts(B5 — 목록 형식·정규화·로더)
