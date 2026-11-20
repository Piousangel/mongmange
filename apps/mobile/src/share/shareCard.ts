// 공유 흐름(빌드 1): 그리기(renderImage) → 파일·공유 시트(native). 어떤 실패도 던지지 않고 결과로 돌려준다.
import type { DreamAspect, MongLook, sim } from '@mong/core';
import { dayName, t } from '../i18n';
import { PARAMS } from '../render/clock';
import type { DreamCardInput } from '../render/dreamCard/DreamCard';
import { strokesForCard } from '../render/dreamCard/DreamCardThumb';
import { renderDreamCardImage, renderIreScrollImage } from '../render/dreamCard/renderImage';
import { pickScrollCards, SHARE_WIDTH, shareFileName } from './layout';
import { sharePng, shareSupported, type ShareResult } from './native';

export type { ShareResult } from './native';
export { shareSupported };

/** 개발 확인(웹 캡처 ?shareFail=1): 실패 처리 화면을 보기 위한 흉내 */
const simulateFail = () => __DEV__ && PARAMS.shareFail;

export async function shareDreamCard(input: DreamCardInput, aspect: DreamAspect): Promise<ShareResult> {
  try {
    if (simulateFail()) throw new Error('simulated share failure');
    const img = await renderDreamCardImage(input, { aspect, width: SHARE_WIDTH, footer: t('share.footer') });
    return await sharePng(img.base64, shareFileName('card', input.card.night, aspect), t('share.dialog'));
  } catch (e) {
    console.warn('[share] 카드 이미지 실패:', e);
    return 'failed';
  }
}

/** 이레 두루마리에 들어갈 그림 재료(카드 7장 + 날 이름) */
export function ireScrollInput(state: sim.State, look?: MongLook) {
  const cards = pickScrollCards(state.cards);
  return {
    cards: cards.map((card) => ({ card, strokes: strokesForCard(state.strokes, card), look })),
    dayLabels: cards.map((c) => dayName(Math.max(0, c.night - 1))),
    title: t('scroll.title'),
    subtitle: t('scroll.subtitle'),
    footer: t('share.footer'),
  };
}

export async function shareIreScroll(state: sim.State, look?: MongLook): Promise<ShareResult> {
  try {
    if (simulateFail()) throw new Error('simulated share failure');
    const input = ireScrollInput(state, look);
    if (input.cards.length === 0) return 'failed';
    const img = await renderIreScrollImage(input, SHARE_WIDTH);
    const last = input.cards[input.cards.length - 1]!.card.night;
    return await sharePng(img.base64, shareFileName('ire', last, '9:16'), t('share.dialog'));
  } catch (e) {
    console.warn('[share] 두루마리 이미지 실패:', e);
    return 'failed';
  }
}
