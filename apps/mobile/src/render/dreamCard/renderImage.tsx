import { PaintStyle, Skia, TextAlign, drawAsImage, type SkCanvas, type SkSurface, type SkTypefaceFontProvider } from '@shopify/react-native-skia';
import { PALETTE } from '@mong/core';
import { footerSpot, ireScrollLayout } from '../../share/layout';
import { Image } from 'react-native';
import { FONT_FILES } from '../../ui/type';
import { CARD_FONT, CARD_FONT_EN, CARD_FONT_EN_ITALIC, CARD_TEXT_W, DreamCardArt, cardFontFor, cardTextBoxes, defaultLabels, makeDreamArt, type DreamCardInput } from './DreamCard';
import { ensureMotifRasters } from './motifRasters';
import { SHARE_INK, type DreamCardImage, type DreamCardImageOptions, type IreScrollInput } from './renderImage.types';

export type { DreamCardImage, DreamCardImageOptions, IreScrollInput } from './renderImage.types';

let provider: Promise<SkTypefaceFontProvider | null> | null = null;
/** 앱 번들 명조(한국어 Gowun Batang, 영어 Cormorant 두 벌)를 Skia 글꼴 공급자에 한 번 등록. 실패하면 null(시스템 글꼴로 계속) */
export function cardFonts(): Promise<SkTypefaceFontProvider | null> {
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

export function drawText(canvas: SkCanvas, fonts: SkTypefaceFontProvider | null, family: string, text: string, x: number, y: number, size: number, color: string, align: 'left' | 'center' | 'right', width: number, spacing: number) {
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
  // 사물 한 겹 래스터 — 공유 이미지는 그 카드 판의 래스터를 기다린다(없으면 한 번 더 시도, 끝내 없으면 기록하고 코드판)
  if (!(await ensureMotifRasters(input.card))) console.warn('[dreamCard] share: motif raster missing, code fallback', input.card.motifId);
  const art = makeDreamArt(input, opts.aspect, width, 4);
  const height = Math.round(art.H);
  const fonts = await cardFonts();
  const img = await drawAsImage(<DreamCardArt art={art} />, { width, height });
  if (!img) throw new Error('dream card offscreen render failed');
  const surface = Skia.Surface.MakeOffscreen(width, height) ?? Skia.Surface.Make(width, height);
  if (!surface) throw new Error('no surface');
  const canvas = surface.getCanvas();
  canvas.drawImage(img, 0, 0);
  img.dispose(); // 오프스크린 이미지는 바로 놓는다(저사양 Android 연속 공유 메모리, 리뷰 L-4)
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
  // 공유 띠: 앱 이름·스토어 문구(인장 코드는 넣지 않는다, C-integrated 2-2)
  if (opts.footer) {
    const sh = art.layout.sheet;
    const f = footerSpot(opts.aspect, sh.y + sh.h, art.layout.height);
    drawText(canvas, fonts, cardFontFor('sub', false), opts.footer, width / 2, f.y * width, f.size * width, SHARE_INK.onNight, 'center', width * 0.9, f.size * width * 0.06);
  }
  surface.flush();
  return encodeAndDispose(surface, width, height);
}

/**
 * 이레 두루마리(9:16 정적 PNG, 빌드 1 — 영상은 빌드 2 이후): 한지 한 폭 위에 7장의 꿈 카드를 지그재그로 붙이고 먹선으로 잇는다.
 * 카드 그림은 화면과 같은 DreamCardArt(글 없이), 글은 번들 글꼴 Paragraph.
 */
export async function renderIreScrollImage(input: IreScrollInput, width = 1080): Promise<DreamCardImage> {
  const L = ireScrollLayout(input.cards.length, width);
  const fonts = await cardFonts();
  const surface = Skia.Surface.MakeOffscreen(L.width, L.height) ?? Skia.Surface.Make(L.width, L.height);
  if (!surface) throw new Error('no surface');
  const canvas = surface.getCanvas();
  canvas.drawColor(Skia.Color(PALETTE.day.bg));
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(SHARE_INK.rod));
  for (const r of L.rods) canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(r.x, r.y, r.w, r.h), r.h / 2, r.h / 2), paint);
  // 카드를 잇는 먹선(담묵)
  if (L.path.length > 1) {
    const pb = Skia.PathBuilder.Make();
    L.path.forEach((p, i) => (i === 0 ? pb.moveTo(p.x, p.y) : pb.lineTo(p.x, p.y)));
    const line = pb.build();
    const lp = Skia.Paint();
    lp.setAntiAlias(true);
    lp.setStyle(PaintStyle.Stroke);
    lp.setStrokeWidth(3 * (width / 1080));
    lp.setColor(Skia.Color(SHARE_INK.thread));
    lp.setAlphaf(0.35);
    canvas.drawPath(line, lp);
  }
  for (let i = 0; i < L.cards.length; i++) {
    const r = L.cards[i]!;
    const art = makeDreamArt(input.cards[i]!, '4:5', Math.round(r.w * 2), 2);
    const img = await drawAsImage(<DreamCardArt art={art} />, { width: Math.round(art.W), height: Math.round(art.H) });
    if (!img) throw new Error('ire scroll card render failed');
    canvas.drawImageRect(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(r.x, r.y, r.w, r.h), Skia.Paint());
    img.dispose();
    const lb = L.labels[i]!;
    const lw = width * 0.2;
    drawText(canvas, fonts, cardFontFor('serif', false), input.dayLabels[i] ?? '', lb.x, lb.y, lb.size, SHARE_INK.onPaperSub, lb.align, lw, 0);
  }
  drawText(canvas, fonts, cardFontFor('serif', false), input.title, L.title.x, L.title.y, L.title.size, SHARE_INK.onPaper, 'center', width * 0.9, L.title.size * 0.08);
  drawText(canvas, fonts, cardFontFor('sub', false), input.subtitle, L.subtitle.x, L.subtitle.y, L.subtitle.size, SHARE_INK.onPaperSub, 'center', width * 0.9, 0);
  drawText(canvas, fonts, cardFontFor('sub', false), input.footer, L.footer.x, L.footer.y, L.footer.size, SHARE_INK.onPaperSub, 'center', width * 0.9, L.footer.size * 0.06);
  surface.flush();
  return encodeAndDispose(surface, L.width, L.height);
}

/** surface → PNG base64, 그리고 스냅숏·surface를 바로 놓는다(GC에 맡기지 않음) */
export function encodeAndDispose(surface: SkSurface, width: number, height: number): DreamCardImage {
  const snap = surface.makeImageSnapshot();
  try {
    return { width, height, mime: 'image/png', base64: snap.encodeToBase64() };
  } finally {
    snap.dispose();
    surface.dispose();
  }
}
