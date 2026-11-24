// 이름 입력 한 줄의 안내 상태(M2 NameSheet). RN을 불러오지 않는 순수 모듈 — 규칙은 core normalizeName·endsWithComposingJamo.
import { sim } from '@mong/core';
import { needsFallbackGlyph } from '../ui/serifSubset';

type ErrKey = 'name.err.empty' | 'name.err.chars' | 'name.err.length' | 'name.err.digits';
export const ERR_KEY: Record<sim.NameRejectReason, ErrKey> = {
  empty: 'name.err.empty',
  chars: 'name.err.chars',
  length: 'name.err.length',
  digits: 'name.err.digits',
};

/** 입력 한 줄의 안내 상태(시험 대상: 조합 중에는 오류를 띄우지 않는다) */
export function nameInputState(raw: string): { ok: boolean; text: string | null; message: ErrKey | null; fallback: boolean } {
  const r = sim.normalizeName(raw);
  if (r.ok) return { ok: true, text: r.text, message: null, fallback: needsFallbackGlyph(r.text) };
  if (raw.trim() === '' || sim.endsWithComposingJamo(raw)) return { ok: false, text: null, message: null, fallback: false };
  return { ok: false, text: null, message: ERR_KEY[r.reason], fallback: false };
}
