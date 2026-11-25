import type { DreamAspect } from '@mong/core';
import type { DreamCardInput } from './DreamCard';

export interface DreamCardImageOptions {
  aspect: DreamAspect;
  /** 출력 폭(px). 기본 1080 → 4:5 = 1080×1350, 9:16 = 1080×1920 */
  width?: number;
  /** 공유 이미지 아래 띠 문구(앱 이름·스토어, i18n). 없으면 띠 없음(화면 미리보기·앨범) */
  footer?: string;
  /** 밤 판(확인판 전용 — 지금 앱 공유는 늘 낮). 글 색도 밤 토큰으로 */
  theme?: 'day' | 'night';
}

/** 밤 판 글 색: 낮 글 토큰 → 밤 글 토큰(아트 바이블 4절) */
export function cardTextColor(c: string, theme: 'day' | 'night' = 'day'): string {
  if (theme === 'day') return c;
  return c === '#6B625A' ? '#A8A196' : '#E9E2D2';
}

export interface DreamCardImage {
  width: number;
  height: number;
  mime: 'image/png';
  /** PNG base64(접두사 없음) — 공유 시트·파일 저장에 넘긴다 */
  base64: string;
}

/** 이레 두루마리(9:16 정적 PNG). 카드 글은 그리지 않고, 카드마다 날 이름을 옆에 쓴다 */
export interface IreScrollInput {
  cards: DreamCardInput[];
  /** 카드마다 날 이름(첫날…) */
  dayLabels: string[];
  title: string;
  subtitle: string;
  footer: string;
}

/** 공유 띠·두루마리 글 색(한지 밖 밤 물 위 / 한지 위) */
export const SHARE_INK = { onNight: '#B9B0A0', onPaper: '#2A2622', onPaperSub: '#6B625A', rod: '#3A332C', thread: '#2A2622' } as const;
