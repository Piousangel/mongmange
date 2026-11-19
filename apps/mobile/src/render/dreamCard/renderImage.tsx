import { Skia, TextAlign, drawAsImage, type SkCanvas, type SkTypefaceFontProvider } from '@shopify/react-native-skia';
import { Image } from 'react-native';
import { FONT_FILES } from '../../ui/type';
import { CARD_FONT, DreamCardArt, defaultLabels, isVertical, makeDreamArt, textOf, type DreamCardInput } from './DreamCard';
import type { DreamCardImage, DreamCardImageOptions } from './renderImage.types';

export type { DreamCardImage, DreamCardImageOptions } from './renderImage.types';

let provider: Promise<SkTypefaceFontProvider | null> | null = null;
/** 앱 번들 Gowun Batang을 Skia 글꼴 공급자에 한 번 등록. 실패하면 null(시스템 글꼴로 계속) */
function cardFonts(): Promise<SkTypefaceFontProvider | null> {
  if (!provider) {
    provider = (async () => {
      try {
        const src = Image.resolveAssetSource(FONT_FILES.GowunBatang);
        if (!src) return null;
        const data = await Skia.Data.fromURI(src.uri);
        const tf = Skia.Typeface.MakeFreeTypeFaceFromData(data);
        if (!tf) return null;
        const p = Skia.TypefaceFontProvider.Make();
        p.registerFont(tf, CARD_FONT);
        return p;
      } catch (e) {
        console.warn('[dreamCard] font load failed', e);
        return null;
      }
    })();
  }
  return provider;
}

function drawText(canvas: SkCanvas, fonts: SkTypefaceFontProvider | null, text: string, x: number, y: number, size: number, color: string, align: 'left' | 'center' | 'right', width: number, spacing: number) {
  const pb = Skia.ParagraphBuilder.Make({ textAlign: align === 'center' ? TextAlign.Center : align === 'right' ? TextAlign.Right : TextAlign.Left }, fonts ?? undefined);
  pb.pushStyle({ color: Skia.Color(color), fontSize: size, fontFamilies: [CARD_FONT, 'serif'], letterSpacing: spacing });
  pb.addText(text);
  const p = pb.build();
  p.layout(width);
  const left = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  // 기준선 y → 문단 위쪽(웹 fillText 기준선과 같은 자리)
  p.paint(canvas, left, y - (p.getLineMetrics()[0]?.baseline ?? size));
}

/**
 * 공유용 고해상도 인화 카드(네이티브). 그림은 화면과 같은 DreamCardArt를 오프스크린 표면에 그리고(표본 4),
 * 글은 번들 글꼴 Paragraph로 같은 배치(dreamCardLayout)에 얹는다. 같은 기기·같은 빌드에서 장면은 결정적이다.
 */
export async function renderDreamCardImage(input: DreamCardInput, opts: DreamCardImageOptions): Promise<DreamCardImage> {
  const width = opts.width ?? 1080;
  const art = makeDreamArt(input, opts.aspect, width, 4);
  const height = Math.round(art.H);
  const fonts = await cardFonts();
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
      [...t].forEach((ch, i) => drawText(canvas, fonts, ch, it.x * width, it.y * width + size * (0.95 + i * 1.32), size, it.color, 'center', size * 2, 0));
    } else {
      drawText(canvas, fonts, t, it.x * width, it.y * width, size, it.color, it.align, width * 0.84, it.spacing * width);
    }
  }
  surface.flush();
  const snap = surface.makeImageSnapshot();
  return { width, height, mime: 'image/png', base64: snap.encodeToBase64() };
}
