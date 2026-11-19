import { ImageFormat, drawAsImage } from '@shopify/react-native-skia';
import { DreamCardArt, SERIF_WEB, defaultLabels, isVertical, makeDreamArt, textOf, type DreamCardInput } from './DreamCard';
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
  // 번들 글꼴(Gowun Batang, expo-font가 FontFace로 등록)이 준비될 때까지 기다린다. 없으면 대체 글꼴
  try {
    await document.fonts.load(`40px GowunBatang`, '몽망이');
  } catch {
    /* 대체 글꼴 */
  }
  g.textBaseline = 'alphabetic';
  for (const it of art.layout.text) {
    const t = textOf(it, lb);
    const size = it.size * width;
    g.fillStyle = it.color;
    g.font = `400 ${size}px ${SERIF_WEB}`;
    const gs = g as CanvasRenderingContext2D & { letterSpacing?: string };
    if (isVertical(it, lb)) {
      gs.letterSpacing = '0px';
      g.textAlign = 'center';
      [...t].forEach((ch, i) => g.fillText(ch, it.x * width, it.y * width + size * (0.95 + i * 1.32)));
    } else {
      gs.letterSpacing = `${it.spacing * width}px`;
      g.textAlign = it.align;
      g.fillText(t, it.x * width, it.y * width, width * 0.84);
    }
  }
  const url = cv.toDataURL('image/png');
  return { width, height, mime: 'image/png', base64: url.slice(url.indexOf(',') + 1) };
}
