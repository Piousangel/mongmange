// 아침 문장·모티프 이름 등 sim 키 → 문구. sim은 키만 내고 문장은 앱이 현재 언어로 고른다(sim-impl 2절, D-06·D-17).
// 문구 자체는 src/i18n/ko.ts·en.ts에 있다(언어별 원작). 여기에는 키를 고르는 규칙만 둔다.
import { BUNDLED_MOON_MOTIFS, sim } from '@mong/core';
import { t, type MessageKey } from '../i18n';

export { clockTime, dayName, nightName, wakeClock } from '../i18n';

// 모티프 id → 문구 키. 목록의 정본은 core `sim.MOTIFS`(25)·`BUNDLED_MOON_MOTIFS`(3). 아래 유니온의 키가 i18n에 없으면 typecheck가,
// core 목록과 유니온이 어긋나면 test/dream-text.test.ts가 막는다
type MotifId =
  | 'near-alone.quilt'
  | 'near-alone.teacup'
  | 'near-alone.inkstone'
  | 'near-alone.washing-line'
  | 'near-alone.sprout'
  | 'near-with.window-hand'
  | 'near-with.teacup-two'
  | 'near-with.umbrella'
  | 'near-with.letter'
  | 'near-with.palm'
  | 'far-alone.mountain'
  | 'far-alone.sea'
  | 'far-alone.paper-boat'
  | 'far-alone.kite'
  | 'far-alone.path'
  | 'far-with.stars-drops'
  | 'far-with.sea-hand'
  | 'far-with.geese'
  | 'far-with.star-bridge'
  | 'far-with.stepping-stones'
  | 'center.rain'
  | 'center.moon'
  | 'center.leaf'
  | 'center.snow'
  | 'center.wind';
type MoonId = 'moon-12' | 'moon-01' | 'moon-02';
const MOTIF_IDS: ReadonlySet<string> = new Set(sim.MOTIFS.map((m) => m.id));
const MOON_IDS: ReadonlySet<string> = new Set(BUNDLED_MOON_MOTIFS.map((m) => m.id));
const isMotif = (id: string): id is MotifId => MOTIF_IDS.has(id);
const isMoon = (id: string): id is MoonId => MOON_IDS.has(id);

/**
 * 판별 문구(8차, PM): 판 1 그림이 바뀌어 뜻이 달라진 모티프는 판 1 카드에만 다른 문구를 쓴다. 판 0 카드(빌드 1에서 받은 카드)는
 * 옛 문구 그대로(시험 고정). 모티프 id는 그대로(맡겨 두기·핑 호환)
 */
const REV1_TEXT: ReadonlySet<MotifId> = new Set<MotifId>(['near-with.window-hand']);
type Rev1Id = 'near-with.window-hand';
const rev1 = (id: MotifId, rev: number): id is Rev1Id => rev >= 1 && REV1_TEXT.has(id);

/** 꿈 모티프 이름(시 문구). rev = 카드의 그림 판(`sim.dreamArtRevOf`, 기본 0). 모르는 id는 null(원격 모티프는 파일의 text.title — 원격 연결 때) */
export function motifName(id: string, rev = 0): string | null {
  if (isMotif(id)) return rev1(id, rev) ? t(`motif.${id}.r1`) : t(`motif.${id}`);
  if (isMoon(id)) return t(`moon.${id}`);
  return null;
}

/** 카드 그림 설명(스크린리더, 아트 10절). 카드 v1.1 구도 기준 — 그림이 바뀌면 ko·en 둘 다 고친다 */
export function motifScene(id: string, rev = 0): string {
  if (isMotif(id)) return rev1(id, rev) ? t(`scene.${id}.r1`) : t(`scene.${id}`);
  if (isMoon(id)) return t(`scene.moon.${id}`);
  return t('scene.fallback');
}

type Zone = 'near-alone' | 'near-with' | 'far-alone' | 'far-with' | 'center';
const CAUSE_RE = /^(near-alone|near-with|far-alone|far-with|center)\.([123])$/;

/**
 * 꿈 카드 캡션(dreams-30days 3-2): 원인(요즘 몸짓) + 결과(그 꿈). 아침 문장과 별개다.
 * - 보름 카드: 원인 = 그 밤의 달(구도에서 되읽음), 늘 붙인다.
 * - 일반 카드: 원인 = 고를 때 정한 말씨(`card.cause`), 없으면 결과만.
 * - 모르는 모티프(원격 미연결)는 null — 캡션 줄을 비운다.
 */
export function dreamCaption(card: Pick<sim.DreamCard, 'motifId' | 'composition' | 'cause' | 'artRev'>): string | null {
  const phase = sim.moonPhaseOfCard(card);
  if (phase) {
    if (!isMoon(card.motifId)) return null;
    return t('caption.dream', { cause: t(`caption.moon.cause.${phase}`), line: t(`caption.moon.line.${card.motifId}`) });
  }
  if (!isMotif(card.motifId)) return null;
  const line = rev1(card.motifId, sim.dreamArtRevOf(card)) ? t(`caption.line.${card.motifId}.r1`) : t(`caption.line.${card.motifId}`);
  const m = card.cause ? CAUSE_RE.exec(card.cause) : null;
  if (!m) return line;
  return t('caption.dream', { cause: t(`caption.cause.${m[1] as Zone}.${m[2] as '1' | '2' | '3'}`), line });
}

/**
 * 화면에 낼 캡션(플래그 반영). 보름은 독립 기능이라 `moonNight`만 켜져 있어도 보름 카드 캡션을 낸다(리뷰 m4).
 * 일반 카드 캡션은 `dreamContent`가 켜졌을 때만. 둘 다 꺼짐 = 빌드 1(캡션 없음).
 */
export function visibleCaption(card: Pick<sim.DreamCard, 'motifId' | 'composition' | 'cause' | 'artRev'>, on: { dream: boolean; moon: boolean }): string | null {
  const isMoonCard = sim.moonPhaseOfCard(card) !== null;
  if (isMoonCard ? !(on.moon || on.dream) : !on.dream) return null;
  return dreamCaption(card);
}

/** 스크린리더 설명 끝에 덧붙이기(캡션·'처음 꾼 꿈' — 빈 값은 건너뜀) */
export function appendA11y(base: string, extra: readonly (string | null | undefined)[]): string {
  let out = base;
  for (const more of extra) if (more) out = t('card.a11y.more', { base: out, more });
  return out;
}

/** '처음 꾼 꿈' 줄(1-7): 그 카드가 앨범에서 그 모티프의 첫 카드일 때만 */
export function firstDreamText(cards: readonly sim.DreamCard[], card: Pick<sim.DreamCard, 'night' | 'motifId'>): string | null {
  // 앨범 안 자리는 (아침, 모티프)로 찾는다 — 세이브를 다시 읽으면 객체가 바뀐다
  const i = cards.findIndex((c) => c.night === card.night && c.motifId === card.motifId);
  return i >= 0 && sim.isFirstDream(cards, i) ? t('caption.first') : null;
}

type Measure = 'speed' | 'len' | 'dist' | 'novel' | 'grind' | 'touch' | 'holdSpeed' | 'tapSpread';
const MEASURES: readonly Measure[] = ['speed', 'len', 'dist', 'novel', 'grind', 'touch', 'holdSpeed', 'tapSpread'];
const AXES: readonly sim.AxisId[] = ['tempo', 'boldness', 'closeness', 'curiosity'];
type Sign = 'plus' | 'minus';

/** 아침 문장 키 → 한 줄. 모르는 키는 조용한 문장으로(빈칸이 되지 않는다) */
export function morningLine(line: sim.MorningLine, card: sim.DreamCard | null): string {
  if (line.kind === 'seven-day') return t('poem.sevenDay');
  if (line.kind === 'observation') {
    const motif = card ? motifName(card.motifId, sim.dreamArtRevOf(card)) : null;
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
