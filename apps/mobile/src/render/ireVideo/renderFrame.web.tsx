// 이레 영상 한 프레임(웹 대체): 그림은 drawAsImage, 글은 2D 캔버스(CanvasKit에는 한글 시스템 글꼴이 없다 — 꿈 카드 웹과 같은 길).
// 웹에는 인코더가 없어 공유는 늘 이미지판이다. 원시 픽셀 함수는 네이티브와 모양을 맞추려고만 둔다(캡처·시험용).
import { ImageFormat, drawAsImage } from '@shopify/react-native-skia';
import { ireFrameAt, ireTextItems } from '@mong/core';
import { cardFontFor } from '../dreamCard/DreamCard';
import { SHARE_INK, type DreamCardImage } from '../dreamCard/renderImage.types';
import { IreFrameArt, ireSize } from './IreFrameArt';
import type { IrePrepared } from './prepare';
import type { IreRawFrame } from './rawFrame';

async function drawFrame(p: IrePrepared, i: number): Promise<HTMLCanvasElement> {
  const frame = ireFrameAt(p.src, p.kind, i);
  const { width, height } = ireSize(p.kind, p.input.width);
  const art = await drawAsImage(<IreFrameArt frame={frame} input={p.input} />, { width, height });
  if (!art) throw new Error('ire frame offscreen render failed');
  const png = art.encodeToBytes(ImageFormat.PNG);
  art.dispose();
  const bmp = await createImageBitmap(new Blob([png as BlobPart], { type: 'image/png' }));
  const cv = document.createElement('canvas');
  cv.width = width;
  cv.height = height;
  const g = cv.getContext('2d') as (CanvasRenderingContext2D & { letterSpacing?: string }) | null;
  if (!g) throw new Error('no 2d context');
  g.drawImage(bmp, 0, 0);
  bmp.close();
  const items = ireTextItems(p.src, frame, p.kind, p.strings);
  for (const it of items) {
    const size = it.size * width;
    const fam = cardFontFor(it.role === 'label' ? 'serif' : 'sub', true);
    await document.fonts.load(`40px ${fam.split(',')[0]}`, it.text).catch(() => undefined);
    g.save();
    g.globalAlpha = it.alpha;
    g.fillStyle = it.role === 'label' ? SHARE_INK.onPaper : SHARE_INK.onPaperSub;
    g.font = `400 ${size}px ${fam}`;
    g.letterSpacing = `${size * 0.06}px`;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillText(it.text, it.x * width, it.y * height, width * 0.9);
    g.restore();
  }
  return cv;
}

export async function renderIreFrame(p: IrePrepared, i: number): Promise<DreamCardImage> {
  const cv = await drawFrame(p, i);
  const url = cv.toDataURL('image/png');
  return { width: cv.width, height: cv.height, mime: 'image/png', base64: url.slice(url.indexOf(',') + 1) };
}

export async function renderIreFramePixels(p: IrePrepared, i: number): Promise<IreRawFrame> {
  const cv = await drawFrame(p, i);
  const data = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
  return { width: cv.width, height: cv.height, pixels: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
}
