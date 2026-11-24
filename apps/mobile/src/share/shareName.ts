// 공유물의 이름 줄(M2, architecture 3-5-2): 꿈 카드 PNG로 나가는 재료는 이름 줄을 **늘** 공유 이름(game/naming sharedName)으로 다시 쓴다.
// 화면 라벨에 이름이 있어도 이름 공개(meta.nameVisible)가 꺼져 있으면 빌드 1 그대로 '몽망이·날'로 나간다. RN을 불러오지 않는 순수 모듈(시험 대상).
import type { sim } from '@mong/core';
import { sharedName } from '../game/naming';
import { dayName, t } from '../i18n';
import type { DreamCardInput } from '../render/dreamCard/DreamCard';

/** 카드의 이름 줄: 이름이 있으면 이름만(세로 제목 = 이름, C-integrated 2-2), 없으면 빌드 1 그대로 '몽망이·날' */
export function cardNameLabel(card: sim.DreamCard, name: string | null): string {
  return name ?? t('card.name', { day: dayName(Math.max(0, card.night - 1)) });
}

/**
 * 공유로 나가는 카드 재료(shareDreamCard 안에서만 부른다). 라벨이 없으면 기본 라벨(이름 없음)을 만들어 이름 줄을 채운다 —
 * 그리는 쪽에 이름 출처가 둘이 되지 않게 늘 labels를 채워 넘긴다.
 */
export function shareInput(input: DreamCardInput, owner: Pick<sim.State, 'name'> | null | undefined): DreamCardInput {
  const name = cardNameLabel(input.card, sharedName(owner));
  const labels = input.labels ? { ...input.labels, name } : { name, line: t('card.defaultLine'), sub: dayName(Math.max(0, input.card.night - 1)) };
  return { ...input, labels };
}
