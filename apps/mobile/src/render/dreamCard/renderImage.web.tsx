import { ImageFormat, drawAsImage } from '@shopify/react-native-skia';
import { CARD_TEXT_W, DreamCardArt, cardFontFor, cardTextBoxes, defaultLabels, makeDreamArt, textOf, type DreamCardInput } from './DreamCard';
import type { DreamCardImage, DreamCardImageOptions } from './renderImage.types';

export type { DreamCardImage, DreamCardImageOptions } from './renderImage.types';

/**
 * 웹 대체: CanvasKit에는 시스템 글꼴이 없어 Paragraph로 한글을 못 그린다.
 * 그림은 drawAsImage(OffscreenCanvas WebGL, 없으면 CPU 표면)로 만들고, 글은 2D 캔버스 fillText로 같은 배치에 얹는다.
 */
export async function renderDreamCardImage(input: DreamCardInput, opts: DreamCardImageOptions): Promise<DreamCardImage> {
  const width = opts.width ?? 1080;
  const art = makeDreamArt(input, opts.aspect, width, 4);
  const height = Math.round(art.H);
  const img = await drawAsImage(<DreamCardArt art={art} />, { width, height });
  if (!img) throw new Error('dream card offscreen render failed');
  const png = img.encodeToBytes(ImageFormat.PNG);
  const bmp = await createImageBitmap(new Blob([png as BlobPart], { type: 'image/png' }));
  const cv = document.createElement('canvas');
  cv.width = width;
  cv.height = height;
  const g = cv.getContext('2d');
  if (!g) throw new Error('no 2d context');
  g.drawImage(bmp, 0, 0);
  const lb = input.labels ?? defaultLabels(input.card);
  // 번들 글꼴(expo-font가 FontFace로 등록)이 준비될 때까지 기다린다. 없으면 대체 글꼴
  try {
    await Promise.all(art.layout.text.map((it) => document.fonts.load(`40px ${cardFontFor(it.role, true).split(',')[0]}`, textOf(it, lb))));
  } catch {
    /* 대체 글꼴 */
  }
  g.textBaseline = 'alphabetic';
  for (const { item: it, vertical, lines, x, ys, size: sz, spacing } of cardTextBoxes(art.layout.text, lb)) {
    const size = sz * width;
    g.fillStyle = it.color;
    g.font = `400 ${size}px ${cardFontFor(it.role, true)}`;
    const gs = g as CanvasRenderingContext2D & { letterSpacing?: string };
    if (vertical) {
      gs.letterSpacing = '0px';
      g.textAlign = 'center';
      lines.forEach((ch, i) => g.fillText(ch, it.x * width, ys[0]! * width + size * (0.95 + i * 1.32)));
    } else {
      gs.letterSpacing = `${spacing * width}px`;
      g.textAlign = it.align;
      lines.forEach((ln, i) => g.fillText(ln, x * width, ys[i]! * width, width * CARD_TEXT_W));
    }
  }
  const url = cv.toDataURL('image/png');
  return { width, height, mime: 'image/png', base64: url.slice(url.indexOf(',') + 1) };
}
