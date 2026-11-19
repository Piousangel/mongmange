import type { DreamAspect } from '@mong/core';

export interface DreamCardImageOptions {
  aspect: DreamAspect;
  /** 출력 폭(px). 기본 1080 → 4:5 = 1080×1350, 9:16 = 1080×1920 */
  width?: number;
}

export interface DreamCardImage {
  width: number;
  height: number;
  mime: 'image/png';
  /** PNG base64(접두사 없음) — 공유 시트·파일 저장에 넘긴다 */
  base64: string;
}
