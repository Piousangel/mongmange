// 이레 영상 한 프레임(네이티브). 그림은 IreFrameArt 오프스크린, 글은 번들 글꼴 Paragraph(꿈 카드 공유와 같은 길).
// 인코더로는 원시 RGBA(`renderIreFramePixels`)를 넘긴다 — PNG·base64 왕복은 미리보기·포스터·캡처 전용(C7 리뷰 H-1).
import { AlphaType, ColorType, Skia, drawAsImage, type SkSurface } from '@shopify/react-native-skia';
import { hexRgb, ireFrameAt, ireTextItems } from '@mong/core';
import { cardFontFor } from '../dreamCard/DreamCard';
import { cardFonts, drawText, encodeAndDispose } from '../dreamCard/renderImage';
import { SHARE_INK, type DreamCardImage } from '../dreamCard/renderImage.types';
import { IreFrameArt, ireSize } from './IreFrameArt';
import type { IrePrepared } from './prepare';
import type { IreRawFrame } from './rawFrame';

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

async function drawFrame(p: IrePrepared, i: number): Promise<{ surface: SkSurface; width: number; height: number }> {
  const frame = ireFrameAt(p.src, p.kind, i);
  const { width, height } = ireSize(p.kind, p.input.width);
  const art = await drawAsImage(<IreFrameArt frame={frame} input={p.input} />, { width, height });
  if (!art) throw new Error('ire frame offscreen render failed');
  const surface = Skia.Surface.MakeOffscreen(width, height) ?? Skia.Surface.Make(width, height);
  if (!surface) throw new Error('no surface');
  const canvas = surface.getCanvas();
  canvas.drawImage(art, 0, 0);
  art.dispose();
  const items = ireTextItems(p.src, frame, p.kind, p.strings);
  if (items.length > 0) {
    const fonts = await cardFonts();
    for (const it of items) {
      const size = it.size * width;
      const color = it.role === 'label' ? SHARE_INK.onPaper : SHARE_INK.onPaperSub;
      drawText(canvas, fonts, cardFontFor(it.role === 'label' ? 'serif' : 'sub', false), it.text, it.x * width, it.y * height, size, rgba(color, it.alpha), 'center', width * 0.9, size * 0.06);
    }
  }
  surface.flush();
  return { surface, width, height };
}

/** 미리보기·포스터·캡처용 PNG */
export async function renderIreFrame(p: IrePrepared, i: number): Promise<DreamCardImage> {
  const { surface, width, height } = await drawFrame(p, i);
  return encodeAndDispose(surface, width, height);
}

/** 인코더용 원시 RGBA8888(비곱셈 알파, 행 우선, stride = width × 4). 스냅숏·표면은 바로 놓는다 */
export async function renderIreFramePixels(p: IrePrepared, i: number): Promise<IreRawFrame> {
  const { surface, width, height } = await drawFrame(p, i);
  const snap = surface.makeImageSnapshot();
  try {
    const px = snap.readPixels(0, 0, { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
    if (!(px instanceof Uint8Array)) throw new Error('ire frame readPixels failed');
    return { width, height, pixels: px };
  } finally {
    snap.dispose();
    surface.dispose();
  }
}
