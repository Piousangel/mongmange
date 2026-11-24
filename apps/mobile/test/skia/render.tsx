// 실제 Mongmangi를 헤드리스 CanvasKit(CPU)으로 그린다. 테스트 파일에서 vi.mock(reanimated·skia·react-native) 뒤에 동적 import로 쓴다.
import { createElement } from 'react';
import * as Sk from '@shopify/react-native-skia';
import { Group, Skia, type SkImage, type SkSurface } from '@shopify/react-native-skia';
import { BASE_LOOK, GRAMMARS, coreScale, type MongLook, type StrokeRecord } from '@mong/core';
import { Mongmangi, REST_FRAME, type BodyFrame } from '../../src/render/Mongmangi';
import { PALETTE } from '@mong/core';

// 테스트에서는 '@shopify/react-native-skia'가 헤드리스 모듈로 바뀐다(mocks.ts skiaMock) — 그 두 함수는 타입에 없어 여기서만 꺼낸다
const headless = Sk as unknown as {
  makeOffscreenSurface(w: number, h: number): SkSurface;
  drawOffscreen(surface: SkSurface, el: React.ReactElement): Promise<SkImage>;
};
const { makeOffscreenSurface, drawOffscreen } = headless;

export interface MongShot {
  /** 1W(= 몸 폭) pt */
  wpx: number;
  /** pt → 장치 px */
  dpr: number;
  records: StrokeRecord[];
  look?: MongLook;
  lod?: boolean;
  night?: number;
  /** 캔버스 크기(몸 폭 배수, 기본 3W 정사각) */
  span?: number;
  /** V12a 몸 빛(Mongmangi light: 수·낮밤 쌍). 없으면 0(꺼짐). 'flag' = prop을 넘기지 않음(기능 플래그 bodyLight를 따름) */
  light?: number | { day: number; night: number } | 'flag';
  /** 몸 먹 농도(나타남·페이드, 기본 1) */
  ink?: number;
  /** 몸 기울기(rad, 기본 0) */
  tilt?: number;
  /** 바탕색(기본 = night > 0.5면 밤 바탕, 아니면 낮 바탕) — 밤 전환 연속성 시험이 바탕을 고정할 때 */
  bg?: string;
}

export interface Shot {
  width: number;
  height: number;
  /** RGBA 8bit, 장치 px */
  rgba: Uint8Array;
  /** 핵 중심(장치 px) */
  cx: number;
  cy: number;
  /** 1W 장치 px */
  w: number;
  png(): Uint8Array;
}

export async function shootMong(o: MongShot): Promise<Shot> {
  const span = o.span ?? 3;
  const look = o.look ?? BASE_LOOK;
  const night = o.night ?? 0;
  const s = coreScale(o.records.length);
  const Wpt = Math.ceil(o.wpx * span);
  const ox = Wpt / 2;
  const oy = Wpt / 2;
  const frame = {
    value: {
      ...REST_FRAME,
      ox,
      oy,
      wpx: o.wpx,
      s,
      combN: o.records.length,
      eyeMix: night,
      eyeB: 'closed',
      night,
      ringAlpha: 1 - night,
      attachK: o.records.map(() => 1),
      fresh: o.records.map(() => 0),
      ink: o.ink ?? 1,
      tilt: o.tilt ?? 0,
    } as BodyFrame,
    _isReanimatedSharedValue: true,
  };
  const px = Math.round(Wpt * o.dpr);
  const surf = makeOffscreenSurface(px, px);
  surf.getCanvas().clear(Skia.Color(o.bg ?? (night > 0.5 ? PALETTE.night.bg : PALETTE.day.bg)));
  const el = createElement(
    Group,
    { transform: [{ scale: o.dpr }] },
    createElement(Mongmangi, { frame: frame as never, records: o.records, mode: 'A', grammar: GRAMMARS.C, look, lod: o.lod ?? false, pixelRatio: o.dpr, ...(o.light === 'flag' ? {} : { light: o.light ?? 0 }) }),
  );
  const img = await drawOffscreen(surf, el);
  const rgba = img.readPixels(0, 0, { width: px, height: px, colorType: 4, alphaType: 3 }) as Uint8Array;
  return { width: px, height: px, rgba, cx: ox * o.dpr, cy: oy * o.dpr, w: o.wpx * o.dpr, png: () => img.encodeToBytes() };
}

export function hashRgba(a: Uint8Array): string {
  let h = 2166136261;
  for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i]!, 16777619) >>> 0;
  return h.toString(16).padStart(8, '0');
}
