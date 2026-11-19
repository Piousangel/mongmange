// 앨범 썸네일: 셰이더 카드를 화면마다 다시 그리지 않고, 저해상도 오프스크린으로 한 번 찍어 SkImage로 캐시한다.
// 카드 하나 = 마블링 셰이더 2~3개라 앨범에서 살아 있는 Canvas를 여러 장 띄우면 스크롤이 무겁다(카드 REPORT 4절 'Picture 캐시').
// 캐시 키 = 카드 시드(카드 필드 + 획 점열, dreamCardSeed) + 픽셀 폭. 찍기는 한 번에 하나씩(줄 세우기) — 앨범을 열 때 프레임이 밀리지 않게.
import { Canvas, Image as SkiaImage, drawAsImage, type SkImage } from '@shopify/react-native-skia';
import { dreamCardSeed, type StrokeRecord, type sim } from '@mong/core';
import { useEffect, useState } from 'react';
import { PixelRatio, View } from 'react-native';
import { DreamCardArt, makeDreamArt } from './DreamCard';

const CACHE_MAX = 48;
const cache = new Map<string, SkImage>();
let queue: Promise<unknown> = Promise.resolve();

function keyOf(card: sim.DreamCard, strokes: readonly StrokeRecord[], px: number): string {
  return `${dreamCardSeed(card, strokes)}:${card.motifId}:${px}`;
}

/** 캐시에 있으면 바로, 없으면 줄을 서서 찍는다. 실패하면 null(평평한 한지 자리로 둔다) */
export function thumbImage(card: sim.DreamCard, strokes: readonly StrokeRecord[], px: number): Promise<SkImage | null> {
  const key = keyOf(card, strokes, px);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const job = queue.then(async () => {
    const again = cache.get(key);
    if (again) return again;
    try {
      // 표본 1(aa)·저해상도: 썸네일 크기에서는 계단이 안 보인다
      const art = makeDreamArt({ card, strokes }, '4:5', px, 1);
      const img = await drawAsImage(<DreamCardArt art={art} />, { width: px, height: Math.round(art.H) });
      if (!img) return null;
      cache.set(key, img);
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
      return img;
    } catch (e) {
      console.warn('[dreamCard] thumb failed', e);
      return null;
    }
  });
  queue = job.catch(() => null);
  return job;
}

/** 그 아침까지 있던 획(카드를 현상한 아침 = card.night, 그 전날까지 그은 획). 씻긴 획은 기록에 없다 */
export function strokesForCard<T extends StrokeRecord & { day: number }>(strokes: readonly T[], card: sim.DreamCard): T[] {
  return strokes.filter((s) => s.day < card.night);
}

export function DreamCardThumb({ card, strokes, width }: { card: sim.DreamCard; strokes: readonly StrokeRecord[]; width: number }) {
  const height = width * 1.25;
  // 화면 밀도 반영, 최대 2배(저해상도 캐시)
  const px = Math.round(width * Math.min(PixelRatio.get(), 2));
  const [img, setImg] = useState<SkImage | null>(() => cache.get(keyOf(card, strokes, px)) ?? null);
  useEffect(() => {
    let alive = true;
    void thumbImage(card, strokes, px).then((i) => {
      if (alive && i) setImg(i);
    });
    return () => {
      alive = false;
    };
  }, [card, strokes, px]);
  return (
    <View style={{ width, height, borderRadius: 3, overflow: 'hidden', backgroundColor: '#141A2C' }}>
      {img && (
        <Canvas style={{ width, height }}>
          <SkiaImage image={img} x={0} y={0} width={width} height={height} fit="cover" />
        </Canvas>
      )}
    </View>
  );
}
