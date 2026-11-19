import { Skia, TextAlign, drawAsImage, type SkCanvas, type SkTypefaceFontProvider } from '@shopify/react-native-skia';
import { Image } from 'react-native';
import { FONT_FILES } from '../../ui/type';
import { CARD_FONT, CARD_FONT_EN, CARD_FONT_EN_ITALIC, CARD_TEXT_W, DreamCardArt, cardFontFor, cardTextBoxes, defaultLabels, makeDreamArt, type DreamCardInput } from './DreamCard';
import type { DreamCardImage, DreamCardImageOptions } from './renderImage.types';

export type { DreamCardImage, DreamCardImageOptions } from './renderImage.types';

let provider: Promise<SkTypefaceFontProvider | null> | null = null;
/** 앱 번들 명조(한국어 Gowun Batang, 영어 Cormorant 두 벌)를 Skia 글꼴 공급자에 한 번 등록. 실패하면 null(시스템 글꼴로 계속) */
function cardFonts(): Promise<SkTypefaceFontProvider | null> {
  if (!provider) {
    provider = (async () => {
      try {
        const p = Skia.TypefaceFontProvider.Make();
        let any = false;
        for (const [file, name] of [
          [FONT_FILES.GowunBatang, CARD_FONT],
          [FONT_FILES.CormorantGaramond, CARD_FONT_EN],
          [FONT_FILES.CormorantGaramondItalic, CARD_FONT_EN_ITALIC],
        ] as const) {
          const src = Image.resolveAssetSource(file);
          if (!src) continue;
          const tf = Skia.Typeface.MakeFreeTypeFaceFromData(await Skia.Data.fromURI(src.uri));
          if (!tf) continue;
          p.registerFont(tf, name);
          any = true;
        }
        return any ? p : null;
      } catch (e) {
        console.warn('[dreamCard] font load failed', e);
        return null;
      }
    })();
  }
  return provider;
}

function drawText(canvas: SkCanvas, fonts: SkTypefaceFontProvider | null, family: string, text: string, x: number, y: number, size: number, color: string, align: 'left' | 'center' | 'right', width: number, spacing: number) {
  const pb = Skia.ParagraphBuilder.Make({ textAlign: align === 'center' ? TextAlign.Center : align === 'right' ? TextAlign.Right : TextAlign.Left }, fonts ?? undefined);
  pb.pushStyle({ color: Skia.Color(color), fontSize: size, fontFamilies: [family, CARD_FONT, 'serif'], letterSpacing: spacing });
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
  for (const { item: it, vertical, lines, x, ys, size: sz, spacing } of cardTextBoxes(art.layout.text, lb)) {
    const size = sz * width;
    const family = cardFontFor(it.role, false);
    if (vertical) {
      lines.forEach((ch, i) => drawText(canvas, fonts, family, ch, it.x * width, ys[0]! * width + size * (0.95 + i * 1.32), size, it.color, 'center', size * 2, 0));
    } else {
      lines.forEach((ln, i) => drawText(canvas, fonts, family, ln, x * width, ys[i]! * width, size, it.color, it.align, width * CARD_TEXT_W, spacing * width));
    }
  }
  surface.flush();
  const snap = surface.makeImageSnapshot();
  return { width, height, mime: 'image/png', base64: snap.encodeToBase64() };
}
