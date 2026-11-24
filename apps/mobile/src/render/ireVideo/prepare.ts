// 이레 영상 프레임 렌더 준비(플랫폼 공통): core 재료·슬롯 획·카드 그림(앨범 썸네일 캐시, 낙관 없는 판)을 한 번 모은다.
// 프레임마다 다시 하는 일은 core ireFrameAt + 그리기뿐이다.
import { ireLoopSourceOf, ireShareSourceOf, type IreLoopSource, type IreShareSource, type IreStrings, type MongLook, type sim } from '@mong/core';
import { strokesForCard, thumbImage } from '../dreamCard/DreamCardThumb';
import { ireSize, type IreArtInput } from './IreFrameArt';
import { isOn } from '../../features';

/**
 * 판별 유니온: 웹 루프(kind 'webLoop')의 재료는 `IreLoopSource`뿐이라 이름 칸이 타입에 없다(architecture 3-5-2, C7 리뷰 L-1).
 * `{ kind: 'webLoop', src: 이름 있는 공유 재료 }`는 타입 오류다.
 */
export type IrePrepared =
  | { kind: 'share'; src: IreShareSource; input: IreArtInput; strings: IreStrings }
  | { kind: 'webLoop'; src: IreLoopSource; input: IreArtInput; strings: IreStrings };

interface PrepareBase {
  state: sim.State;
  look?: MongLook;
  strokeInks?: readonly (sim.InkId | null)[];
  /** 출력 폭(px). 기본 = 규격 폭(미리보기·포스터는 더 크게·작게) */
  width?: number;
}

/** OS 공유 영상(이름은 nameVisible일 때만 재료에 실림) */
export async function prepareIreShare(o: PrepareBase & { nameVisible: boolean; strings: IreStrings }): Promise<IrePrepared> {
  const src = ireShareSourceOf(o.state, { nameVisible: o.nameVisible });
  return { kind: 'share', src, strings: o.strings, input: await artInput('share', src, o) };
}

/** 웹 루프·포스터 — 이름 인자가 없다 */
export async function prepareIreLoop(o: PrepareBase): Promise<IrePrepared> {
  const src = ireLoopSourceOf(o.state);
  return { kind: 'webLoop', src, strings: { app: '' }, input: await artInput('webLoop', src, o) };
}

async function artInput(kind: IrePrepared['kind'], src: IreShareSource | IreLoopSource, o: PrepareBase): Promise<IreArtInput> {
  const { width } = ireSize(kind, o.width);
  const strokes = o.state.strokes;
  const records = src.slots.map((sl) => strokes[sl.strokeIndex]!);
  const strokeInks = o.strokeInks ? src.slots.map((sl) => o.strokeInks![sl.strokeIndex] ?? null) : undefined;
  const cardImages = await Promise.all(
    src.slots.map((sl) => {
      if (kind !== 'share' || sl.cardIndex === null) return null;
      const card = o.state.cards[sl.cardIndex]!;
      // 칸 폭 0.11W의 2배 해상도. 낙관은 빼고 그린다 — 주사는 꼬리표의 큰 인장 한 곳뿐(C7 리뷰 M-4)
      return thumbImage(card, strokesForCard(strokes, card), Math.round(width * 0.22), o.look, 1, false, false);
    }),
  );
  // M2: 꼬리표의 큰 인장 = 그 아이의 이 빠짐 무늬(naming 켬, 공유판만 — 웹 루프에는 인장 칸이 없다). 꺼짐 = 빌드 그대로 둥근 사각
  const sealSeed = kind === 'share' && isOn('naming') ? o.state.birth.sealSeed : undefined;
  return { kind, width, records, look: o.look, strokeInks, cardImages, sealSeed };
}
