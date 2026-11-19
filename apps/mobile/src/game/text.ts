// 아침 문장·모티프 이름 등 sim 키 → 문구. sim은 키만 내고 문장은 앱이 현재 언어로 고른다(sim-impl 2절, D-06·D-17).
// 문구 자체는 src/i18n/ko.ts·en.ts에 있다(언어별 원작). 여기에는 키를 고르는 규칙만 둔다.
import type { sim } from '@mong/core';
import { t, type MessageKey } from '../i18n';

export { clockTime, dayName, nightName, wakeClock } from '../i18n';

const MOTIF_IDS = [
  'near-alone.quilt',
  'near-alone.teacup',
  'near-with.window-hand',
  'near-with.teacup-two',
  'far-alone.mountain',
  'far-alone.sea',
  'far-with.stars-drops',
  'far-with.sea-hand',
  'center.rain',
  'center.moon',
] as const;
type MotifId = (typeof MOTIF_IDS)[number];
const isMotif = (id: string): id is MotifId => (MOTIF_IDS as readonly string[]).includes(id);

/** 꿈 모티프 이름(시 문구). 모르는 id는 null */
export function motifName(id: string): string | null {
  return isMotif(id) ? t(`motif.${id}`) : null;
}

/** 카드 그림 설명(스크린리더, 아트 10절). 카드 v1.1 구도 기준 — 그림이 바뀌면 ko·en 둘 다 고친다 */
export function motifScene(id: string): string {
  return isMotif(id) ? t(`scene.${id}`) : t('scene.fallback');
}

type Measure = 'speed' | 'len' | 'dist' | 'novel' | 'grind' | 'touch' | 'holdSpeed' | 'tapSpread';
const MEASURES: readonly Measure[] = ['speed', 'len', 'dist', 'novel', 'grind', 'touch', 'holdSpeed', 'tapSpread'];
const AXES: readonly sim.AxisId[] = ['tempo', 'boldness', 'closeness', 'curiosity'];
type Sign = 'plus' | 'minus';

/** 아침 문장 키 → 한 줄. 모르는 키는 조용한 문장으로(빈칸이 되지 않는다) */
export function morningLine(line: sim.MorningLine, card: sim.DreamCard | null): string {
  if (line.kind === 'seven-day') return t('poem.sevenDay');
  if (line.kind === 'observation') {
    const motif = card ? motifName(card.motifId) : null;
    return motif ? t('poem.dream', { motif }) : t('poem.quietDream');
  }
  const [cause, effect] = line.keys;
  const cm = cause?.match(/^cause\.(\w+)\.(plus|minus)$/);
  const causeKey: MessageKey | null = cm && (MEASURES as readonly string[]).includes(cm[1]!) ? `poem.cause.${cm[1] as Measure}.${cm[2] as Sign}` : null;
  const em = effect?.match(/^(effect|deepen)\.(\w+)\.(plus|minus)\./);
  const effectKey: MessageKey = em && (AXES as readonly string[]).includes(em[2]!) ? `poem.effect.${em[2] as sim.AxisId}.${em[3] as Sign}` : 'poem.effect.fallback';
  const effText = t(effectKey);
  return causeKey ? t('poem.change', { cause: t(causeKey), effect: effText }) : effText;
}

/** 획 거절 사유 → 한 줄 */
export function rejectText(reason: 'used' | 'asleep' | 'tooShort'): string {
  return t(`line.reject.${reason}`);
}
