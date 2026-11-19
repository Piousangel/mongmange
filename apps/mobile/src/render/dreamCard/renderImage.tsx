import { Skia, TextAlign, drawAsImage, type SkCanvas } from '@shopify/react-native-skia';
import { DreamCardArt, defaultLabels, isVertical, makeDreamArt, textOf, type DreamCardInput } from './DreamCard';
import type { DreamCardImage, DreamCardImageOptions } from './renderImage.types';

export type { DreamCardImage, DreamCardImageOptions } from './renderImage.types';

/** 한 덩이 글을 Paragraph(시스템 글꼴 + 한글 대체 글꼴)로 그린다 */
function drawText(canvas: SkCanvas, text: string, x: number, y: number, size: number, color: string, align: 'left' | 'center' | 'right', width: number, italic: boolean, spacing: number) {
  const pb = Skia.ParagraphBuilder.Make({ textAlign: align === 'center' ? TextAlign.Center : align === 'right' ? TextAlign.Right : TextAlign.Left });
  pb.pushStyle({ color: Skia.Color(color), fontSize: size, fontFamilies: ['Noto Serif KR', 'AppleMyungjo', 'serif'], letterSpacing: spacing, fontStyle: italic ? { slant: 1 } : undefined });
  pb.addText(text);
  const p = pb.build();
  p.layout(width);
  const left = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  p.paint(canvas, left, y - size * 1.05);
}

/**
 * 공유용 고해상도 인화 카드(네이티브). 그림은 화면과 같은 DreamCardArt 요소를 오프스크린 표면에 그리고(표본 4),
 * 글은 Skia Paragraph로 같은 배치(dreamCardLayout)에 얹는다. 결정적: 같은 입력 → 같은 PNG.
 */
export async function renderDreamCardImage(input: DreamCardInput, opts: DreamCardImageOptions): Promise<DreamCardImage> {
  const width = opts.width ?? 1080;
  const art = makeDreamArt(input, opts.aspect, width, 4);
  const height = Math.round(art.H);
  const img = await drawAsImage(<DreamCardArt art={art} />, { width, height });
  if (!img) throw new Error('dream card offscreen render failed');
  const surface = Skia.Surface.MakeOffscreen(width, height) ?? Skia.Surface.Make(width, height);
  if (!surface) throw new Error('no surface');
  const canvas = surface.getCanvas();
  canvas.drawImage(img, 0, 0);
  const lb = input.labels ?? defaultLabels(input.card);
  for (const it of art.layout.text) {
    const t = textOf(it, lb);
    const size = it.size * width;
    if (isVertical(it, lb)) {
      [...t].forEach((ch, i) => drawText(canvas, ch, it.x * width, it.y * width + size * (1 + i * 1.32), size, it.color, 'center', size * 2, false, 0));
    } else {
      drawText(canvas, t, it.x * width, it.y * width, size, it.color, it.align, width * 0.84, it.role === 'italic', it.spacing * width);
    }
  }
  surface.flush();
  const snap = surface.makeImageSnapshot();
  return { width, height, mime: 'image/png', base64: snap.encodeToBase64() };
}
