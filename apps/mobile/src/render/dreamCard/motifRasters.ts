// C14b 혼합안(C): 꿈 모티프 '사물 한 겹' 래스터(손질본 — scripts/motif-raster.mjs, 원본 docs/creative/c14b-ref, license-ledger 1-1).
// 판(artRev)마다 에셋 폴더 `assets/motifs/r<판>/`: `<id>.webp` = 먹(검정 + 알파, 최대 0.72), `<id>.mask.webp` = 가림 실루엣.
// 색(먹·종이)은 그릴 때 테마 토큰으로 입힌다. 불러오기 전·실패하면 카드는 같은 형상의 코드판(경로)으로 그린다.
// 결정성(D-13): 카드는 받은 때의 판(`card.artRev`)으로 그린다 — 그림을 바꾸면 판을 올리고 이전 판 폴더·목록을 남긴다.
import { sim } from '@mong/core';
import { Skia, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { Image } from 'react-native';

/** 지금 판에서 래스터 사물을 쓰는 모티프 */
export const MOTIF_RASTER_IDS = sim.ART_REV_RASTERS[sim.DREAM_ART_REV]!;

export interface MotifRaster {
  ink: SkImage;
  mask: SkImage | null;
}

/**
 * 번들 에셋(불러올 때만 require — 모듈을 불러오는 것만으로 에셋을 읽지 않게, 시험은 파일 바이트로 넣는다).
 * 판을 올리면 여기에 판을 더한다. 지난 판 줄은 지우지 않는다(시험이 판마다 파일·목록 일치를 본다)
 */
const sources = (): Readonly<Record<number, Readonly<Record<string, readonly [number | string, number | string]>>>> => ({
  1: {
    'near-with.letter': [require('../../../assets/motifs/r1/near-with.letter.webp'), require('../../../assets/motifs/r1/near-with.letter.mask.webp')],
    'far-alone.kite': [require('../../../assets/motifs/r1/far-alone.kite.webp'), require('../../../assets/motifs/r1/far-alone.kite.mask.webp')],
    'near-with.umbrella': [require('../../../assets/motifs/r1/near-with.umbrella.webp'), require('../../../assets/motifs/r1/near-with.umbrella.mask.webp')],
    'far-alone.paper-boat': [require('../../../assets/motifs/r1/far-alone.paper-boat.webp'), require('../../../assets/motifs/r1/far-alone.paper-boat.mask.webp')],
    'near-with.palm': [require('../../../assets/motifs/r1/near-with.palm.webp'), require('../../../assets/motifs/r1/near-with.palm.mask.webp')],
    'near-with.window-hand': [require('../../../assets/motifs/r1/near-with.window-hand.webp'), require('../../../assets/motifs/r1/near-with.window-hand.mask.webp')],
  },
});

const key = (rev: number, id: string) => `${rev}/${id}`;
const cache = new Map<string, MotifRaster>();
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();

/** 시험·오프스크린에서 직접 넣는다(헤드리스는 파일 바이트로 디코드) */
export function setMotifRaster(id: string, r: MotifRaster | null, rev = sim.DREAM_ART_REV): void {
  if (r) cache.set(key(rev, id), r);
  else cache.delete(key(rev, id));
  subs.forEach((f) => f());
}
/** 그 판의 래스터(없으면 null → 코드판) */
export function motifRaster(id: string, rev = sim.DREAM_ART_REV): MotifRaster | null {
  return cache.get(key(rev, id)) ?? null;
}

function uriOf(src: number | string | { uri?: string; default?: string }): string | null {
  if (typeof src === 'string') return src;
  if (typeof src === 'object' && src) return src.uri ?? src.default ?? null;
  return Image.resolveAssetSource?.(src)?.uri ?? null;
}
async function decode(src: number | string): Promise<SkImage | null> {
  const uri = uriOf(src as never);
  return uri ? Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri)) : null;
}

/** 모든 판의 번들 에셋을 한 번 디코드해 둔다(실패한 장은 코드판으로 남는다). 카드 공유 이미지는 그리기 전에 기다린다 */
export function loadMotifRasters(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      for (const [rev, ids] of Object.entries(sources()))
        for (const [id, [inkSrc, maskSrc]] of Object.entries(ids)) {
          try {
            const ink = await decode(inkSrc);
            if (ink) cache.set(key(Number(rev), id), { ink, mask: await decode(maskSrc).catch(() => null) });
          } catch (e) {
            console.warn('[dreamCard] motif raster load failed', rev, id, e);
          }
        }
      subs.forEach((f) => f());
    })();
  }
  return loading;
}

/** 화면 카드: 래스터가 들어오면 다시 그린다(값 = 불러온 수) */
export function useMotifRasters(): number {
  const [n, setN] = useState(cache.size);
  useEffect(() => {
    const f = () => setN(cache.size);
    subs.add(f);
    void loadMotifRasters().then(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return n;
}

/** 래스터를 그림 상자(그림 좌표 x, y, 폭, 높이)에 가운데 맞춰 넣은 사각형 */
export function fitRect(img: SkImage, box: readonly [number, number, number, number]): { x: number; y: number; width: number; height: number } {
  const [bx, by, bw, bh] = box;
  const a = img.width() / img.height();
  const w = Math.min(bw, bh * a);
  const h = w / a;
  return { x: bx + (bw - w) / 2, y: by + (bh - h) / 2, width: w, height: h };
}
