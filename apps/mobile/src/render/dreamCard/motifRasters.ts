// C14b 4차 혼합안(C): 꿈 모티프 '사물 한 겹' 래스터(손질본 — scripts/motif-raster.mjs, 원본 docs/creative/c14b-ref, license-ledger).
// 에셋은 검정 + 알파(먹 한 색, 최대 0.72). 색은 그릴 때 테마 토큰으로 입힌다. 불러오기 전·실패하면 카드는 같은 형상의 코드판(경로)으로 그린다.
// 결정성(D-13): 그림은 고정 에셋이고, 자리·크기·뒤집기는 core 장면(구도 a·b·c)이 정한다.
import { Skia, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { Image } from 'react-native';

/** 래스터 사물을 쓰는 모티프(6) */
export const MOTIF_RASTER_IDS = ['near-with.letter', 'far-alone.kite', 'near-with.umbrella', 'far-alone.paper-boat', 'near-with.palm', 'near-with.window-hand'] as const;

/** 번들 에셋(불러올 때만 require — 모듈을 불러오는 것만으로 에셋을 읽지 않게, 시험은 파일 바이트로 넣는다) */
const sources = (): Readonly<Record<string, number | string>> => ({
  'near-with.letter': require('../../../assets/motifs/near-with.letter.webp'),
  'far-alone.kite': require('../../../assets/motifs/far-alone.kite.webp'),
  'near-with.umbrella': require('../../../assets/motifs/near-with.umbrella.webp'),
  'far-alone.paper-boat': require('../../../assets/motifs/far-alone.paper-boat.webp'),
  'near-with.palm': require('../../../assets/motifs/near-with.palm.webp'),
  'near-with.window-hand': require('../../../assets/motifs/near-with.window-hand.webp'),
});

const cache = new Map<string, SkImage>();
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();

/** 시험·오프스크린에서 직접 넣는다(헤드리스는 파일 바이트로 디코드) */
export function setMotifRaster(id: string, img: SkImage | null): void {
  if (img) cache.set(id, img);
  else cache.delete(id);
  subs.forEach((f) => f());
}
export function motifRaster(id: string): SkImage | null {
  return cache.get(id) ?? null;
}

function uriOf(src: number | string | { uri?: string; default?: string }): string | null {
  if (typeof src === 'string') return src;
  if (typeof src === 'object' && src) return src.uri ?? src.default ?? null;
  return Image.resolveAssetSource?.(src)?.uri ?? null;
}

/** 번들 에셋을 한 번 디코드해 둔다(실패한 장은 코드판으로 남는다). 카드 공유 이미지는 그리기 전에 기다린다 */
export function loadMotifRasters(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      for (const [id, src] of Object.entries(sources())) {
        try {
          const uri = uriOf(src as never);
          if (!uri) continue;
          const img = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
          if (img) cache.set(id, img);
        } catch (e) {
          console.warn('[dreamCard] motif raster load failed', id, e);
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
