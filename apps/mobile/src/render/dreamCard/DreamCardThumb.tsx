// 앨범 썸네일: 셰이더 카드를 화면마다 다시 그리지 않고, 저해상도 오프스크린으로 한 번 찍어 SkImage로 캐시한다.
// 카드 하나 = 마블링 셰이더 2~3개라 앨범에서 살아 있는 Canvas를 여러 장 띄우면 스크롤이 무겁다(카드 REPORT 4절 'Picture 캐시').
// 캐시 키 = 카드 시드(카드 필드 + 획 점열, dreamCardSeed) + 픽셀 폭. 찍기는 한 번에 하나씩(줄 세우기) — 앨범을 열 때 프레임이 밀리지 않게.
import { Canvas, Image as SkiaImage, drawAsImage, type SkImage } from '@shopify/react-native-skia';
import { dreamCardSeed, type MongLook, type StrokeRecord, type sim } from '@mong/core';
import { useEffect, useState } from 'react';
import { PixelRatio, View } from 'react-native';
import { DreamCardArt, makeDreamArt } from './DreamCard';
import { useFeature } from '../../features';

const CACHE_MAX = 48;
const cache = new Map<string, SkImage>();
let queue: Promise<unknown> = Promise.resolve();

function keyOf(card: sim.DreamCard, strokes: readonly StrokeRecord[], px: number, look?: MongLook, ptPerPx = 1, lod = false, seal = true, sealSeed?: number): string {
  // 그 아이(체형·빗 모양·몸의 먹)가 다르면 다른 그림
  const lk = look ? `${look.shape.aspect}|${look.shape.combRatios.join(',')}|${look.ink.id ?? '-'}` : 'base';
  // M2 인장(그 아이의 이 빠짐 무늬)이 있으면 다른 그림 — 썸네일 크기에서는 LOD로 사각이지만 종이 귀와 모양이 다르다
  return `${dreamCardSeed(card, strokes)}:${card.motifId}:${px}:${lk}:${lod ? `lod${ptPerPx.toFixed(3)}` : '-'}${seal ? '' : ':noseal'}${sealSeed === undefined ? '' : `:seal${sealSeed}`}`;
}

/**
 * 캐시에 있으면 바로, 없으면 줄을 서서 찍는다. 실패하면 null(평평한 한지 자리로 둔다).
 * ptPerPx = 화면 pt / 이미지 px(썸네일 LOD가 몸 폭을 pt로 잰다), lod = 플래그 thumbLod, seal = 낙관(이레 영상 카드 줄은 false),
 * sealSeed = M2 그 아이의 인장(naming 켬일 때만 — 크게 본 카드와 같은 인장, 문턱 아래면 core LOD로 사각. 리뷰 L-2)
 */
export function thumbImage(card: sim.DreamCard, strokes: readonly StrokeRecord[], px: number, look?: MongLook, ptPerPx = 1, lod = false, seal = true, sealSeed?: number): Promise<SkImage | null> {
  const key = keyOf(card, strokes, px, look, ptPerPx, lod, seal, sealSeed);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const job = queue.then(async () => {
    const again = cache.get(key);
    if (again) return again;
    try {
      // 표본 1(aa)·저해상도: 썸네일 크기에서는 계단이 안 보인다
      const art = makeDreamArt({ card, strokes, look, sealSeed }, '4:5', px, 1, { lod, ptPerUnit: ptPerPx, devicePerUnit: 1, seal });
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

export function DreamCardThumb({ card, strokes, width, look, sealSeed }: { card: sim.DreamCard; strokes: readonly StrokeRecord[]; width: number; look?: MongLook; sealSeed?: number }) {
  const height = width * 1.25;
  // 화면 밀도 반영, 최대 2배(저해상도 캐시)
  const px = Math.round(width * Math.min(PixelRatio.get(), 2));
  const lod = useFeature('thumbLod');
  const ptPerPx = width / px;
  const [img, setImg] = useState<SkImage | null>(() => cache.get(keyOf(card, strokes, px, look, ptPerPx, lod, true, sealSeed)) ?? null);
  useEffect(() => {
    let alive = true;
    void thumbImage(card, strokes, px, look, ptPerPx, lod, true, sealSeed).then((i) => {
      if (alive && i) setImg(i);
    });
    return () => {
      alive = false;
    };
  }, [card, strokes, px, look, ptPerPx, lod, sealSeed]);
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
