// 공유 이미지 배치·고르기(순수 함수, 테스트 대상). 그리기는 render/dreamCard/renderImage(.web).tsx.
// 규격(C-integrated v1.1, D-18 개정): 꿈 카드 4:5(1080×1350)·9:16(1080×1920), 이레 두루마리는 9:16 정적 PNG(영상은 빌드 2 이후).
// 인장 코드는 이미지에 넣지 않는다(2-2). 아래 띠에 앱 이름·스토어 문구(i18n)만.
import type { DreamAspect, sim } from '@mong/core';

export const SHARE_WIDTH = 1080;
/** 이레 두루마리에 놓는 카드 수 */
export const SCROLL_CARDS = 7;

/** 꿈 카드 공유 이미지의 아래 띠 문구 자리(폭 단위). 한지 아래 바깥 여백의 가운데 */
export function footerSpot(aspect: DreamAspect, sheetBottom: number, height: number): { y: number; size: number } {
  const band = height - sheetBottom;
  const size = aspect === '9:16' ? 0.024 : Math.min(0.018, band * 0.42);
  return { y: sheetBottom + band / 2 + size * 0.36, size };
}

/**
 * 이레 두루마리에 놓을 카드: 획이 있던 밤의 카드(몸이 자란 과정)를 앞에서부터 7장. 모자라면 남은 카드로 채운다.
 * 순서는 시간 순.
 */
export function pickScrollCards(cards: readonly sim.DreamCard[]): sim.DreamCard[] {
  const withStroke = cards.filter((c) => c.strokeRef !== null).slice(0, SCROLL_CARDS);
  if (withStroke.length >= SCROLL_CARDS) return withStroke;
  const rest = cards.filter((c) => !withStroke.includes(c));
  return [...withStroke, ...rest.slice(0, SCROLL_CARDS - withStroke.length)].sort((a, b) => a.night - b.night);
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ScrollLayout {
  width: number;
  height: number;
  title: { x: number; y: number; size: number };
  subtitle: { x: number; y: number; size: number };
  cards: Rect[];
  /** 날 이름: 카드 안쪽 옆(두 줄 사이 틈), 카드 아래쪽 기준선 */
  labels: { x: number; y: number; size: number; align: 'left' | 'right' }[];
  /** 카드 가운데를 잇는 먹선(지그재그) */
  path: { x: number; y: number }[];
  /** 위·아래 두루마리 축 */
  rods: Rect[];
  footer: { x: number; y: number; size: number };
}

/** 9:16 1080×1920 두루마리: 두 줄 지그재그(왼·오른)로 카드 n장(≤7), 아래로 내려가며 하루씩 */
export function ireScrollLayout(n: number, width = SHARE_WIDTH): ScrollLayout {
  const k = width / 1080;
  const height = Math.round(width * (16 / 9));
  const cw = 288 * k;
  const ch = cw * 1.25;
  const step = 190 * k;
  const top = 250 * k;
  const xs = [156 * k, 636 * k];
  const cards: Rect[] = [];
  const labels: ScrollLayout['labels'] = [];
  const path: ScrollLayout['path'] = [];
  for (let i = 0; i < Math.min(n, SCROLL_CARDS); i++) {
    const r = { x: xs[i % 2]!, y: top + i * step, w: cw, h: ch };
    cards.push(r);
    const left = i % 2 === 0;
    labels.push({ x: left ? r.x + cw + 18 * k : r.x - 18 * k, y: r.y + ch - 8 * k, size: 24 * k, align: left ? 'left' : 'right' });
    path.push({ x: r.x + cw / 2, y: r.y + ch / 2 });
  }
  return {
    width,
    height,
    title: { x: width / 2, y: 132 * k, size: 58 * k },
    subtitle: { x: width / 2, y: 192 * k, size: 26 * k },
    cards,
    labels,
    path,
    rods: [
      { x: 40 * k, y: 28 * k, w: width - 80 * k, h: 14 * k },
      { x: 40 * k, y: height - 42 * k, w: width - 80 * k, h: 14 * k },
    ],
    footer: { x: width / 2, y: height - 74 * k, size: 22 * k },
  };
}

/** 공유 파일 이름(영문·숫자만 — 일부 앱이 한글 파일 이름을 깨뜨린다) */
export function shareFileName(kind: 'card' | 'ire', night: number, aspect: DreamAspect): string {
  return `mongmangi-${kind}-${night}-${aspect === '9:16' ? '9x16' : '4x5'}.png`;
}
