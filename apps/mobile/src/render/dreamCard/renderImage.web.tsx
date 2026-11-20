import { ImageFormat, drawAsImage, type SkImage } from '@shopify/react-native-skia';
import { PALETTE } from '@mong/core';
import { footerSpot, ireScrollLayout } from '../../share/layout';
import { CARD_TEXT_W, DreamCardArt, cardFontFor, cardTextBoxes, defaultLabels, makeDreamArt, textOf, type DreamCardInput } from './DreamCard';
import { SHARE_INK, type DreamCardImage, type DreamCardImageOptions, type IreScrollInput } from './renderImage.types';

export type { DreamCardImage, DreamCardImageOptions, IreScrollInput } from './renderImage.types';

async function toBitmap(img: SkImage): Promise<ImageBitmap> {
  const png = img.encodeToBytes(ImageFormat.PNG);
  return createImageBitmap(new Blob([png as BlobPart], { type: 'image/png' }));
}

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string };
function text(g: Ctx, s: string, x: number, y: number, size: number, family: string, color: string, align: CanvasTextAlign, spacing = 0, maxW?: number) {
  g.fillStyle = color;
  g.font = `400 ${size}px ${family}`;
  g.letterSpacing = `${spacing}px`;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.fillText(s, x, y, maxW);
}

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
  bmp.close();
  img.dispose();
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
  // 공유 띠: 앱 이름·스토어 문구(인장 코드는 넣지 않는다)
  if (opts.footer) {
    const sh = art.layout.sheet;
    const f = footerSpot(opts.aspect, sh.y + sh.h, art.layout.height);
    const fam = cardFontFor('sub', true);
    await document.fonts.load(`40px ${fam.split(',')[0]}`, opts.footer).catch(() => undefined);
    text(g as Ctx, opts.footer, width / 2, f.y * width, f.size * width, fam, SHARE_INK.onNight, 'center', f.size * width * 0.06, width * 0.9);
  }
  const url = cv.toDataURL('image/png');
  return { width, height, mime: 'image/png', base64: url.slice(url.indexOf(',') + 1) };
}

/** 이레 두루마리(웹): 네이티브와 같은 배치(ireScrollLayout), 카드 그림은 drawAsImage, 글은 2D 캔버스 */
export async function renderIreScrollImage(input: IreScrollInput, width = 1080): Promise<DreamCardImage> {
  const L = ireScrollLayout(input.cards.length, width);
  const cv = document.createElement('canvas');
  cv.width = L.width;
  cv.height = L.height;
  const g = cv.getContext('2d') as Ctx | null;
  if (!g) throw new Error('no 2d context');
  g.fillStyle = PALETTE.day.bg;
  g.fillRect(0, 0, L.width, L.height);
  g.fillStyle = SHARE_INK.rod;
  for (const r of L.rods) {
    g.beginPath();
    g.roundRect(r.x, r.y, r.w, r.h, r.h / 2);
    g.fill();
  }
  if (L.path.length > 1) {
    g.save();
    g.globalAlpha = 0.35;
    g.strokeStyle = SHARE_INK.thread;
    g.lineWidth = 3 * (width / 1080);
    g.beginPath();
    L.path.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
    g.stroke();
    g.restore();
  }
  const serif = cardFontFor('serif', true);
  const sub = cardFontFor('sub', true);
  const all = [input.title, input.subtitle, input.footer, ...input.dayLabels].join('');
  await Promise.all([document.fonts.load(`40px ${serif.split(',')[0]}`, all), document.fonts.load(`40px ${sub.split(',')[0]}`, all)]).catch(() => undefined);
  for (let i = 0; i < L.cards.length; i++) {
    const r = L.cards[i]!;
    const art = makeDreamArt(input.cards[i]!, '4:5', Math.round(r.w * 2), 2);
    const img = await drawAsImage(<DreamCardArt art={art} />, { width: Math.round(art.W), height: Math.round(art.H) });
    if (!img) throw new Error('ire scroll card render failed');
    const bmp = await toBitmap(img);
    g.drawImage(bmp, r.x, r.y, r.w, r.h);
    bmp.close();
    img.dispose();
    const lb = L.labels[i]!;
    text(g, input.dayLabels[i] ?? '', lb.x, lb.y, lb.size, serif, SHARE_INK.onPaperSub, lb.align);
  }
  text(g, input.title, L.title.x, L.title.y, L.title.size, serif, SHARE_INK.onPaper, 'center', L.title.size * 0.08);
  text(g, input.subtitle, L.subtitle.x, L.subtitle.y, L.subtitle.size, sub, SHARE_INK.onPaperSub, 'center');
  text(g, input.footer, L.footer.x, L.footer.y, L.footer.size, sub, SHARE_INK.onPaperSub, 'center', L.footer.size * 0.06);
  const url = cv.toDataURL('image/png');
  return { width: L.width, height: L.height, mime: 'image/png', base64: url.slice(url.indexOf(',') + 1) };
}
