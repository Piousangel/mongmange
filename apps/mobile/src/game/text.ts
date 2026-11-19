// 한국어 문구(MVP 임시판). sim은 키만 내고 문장은 앱이 고른다(sim-impl 2절). 영어·ICU는 D-06 외부화 작업에서.
// 시 문구는 번역이 아니라 언어별로 따로 쓴다 — 이 파일은 한국어 판의 자리 채움이다(카피 담당 검수 전).
import type { sim } from '@mong/core';

const DAY_NAMES = ['첫날', '이튿날', '사흘째', '나흘째', '닷새째', '엿새째', '이레째', '여드레째', '아흐레째', '열흘째'];
/** dayIndex(깸 횟수) → 고유어 날 세기. 0 = 첫날 */
export function dayName(dayIndex: number): string {
  return DAY_NAMES[dayIndex] ?? `${dayIndex + 1}일째`;
}

export const MOTIF_NAMES: Record<string, string> = {
  'near-alone.quilt': '포근한 이불',
  'near-alone.teacup': '찻잔 하나',
  'near-with.window-hand': '창가의 손',
  'near-with.teacup-two': '찻잔 둘',
  'far-alone.mountain': '먼 산',
  'far-alone.sea': '혼자 보는 바다',
  'far-with.stars-drops': '별과 물방울',
  'far-with.sea-hand': '손잡고 본 바다',
  'center.rain': '빗소리',
  'center.moon': '둥근 달',
};

/** 카드 그림 설명(스크린리더, 아트 10절). 카드 v1.1 구도 기준 — 그림이 바뀌면 같이 고친다 */
export const MOTIF_SCENES: Record<string, string> = {
  'near-alone.quilt': '누빔 이불 위에서 몽망이가 눈을 감고 자요',
  'near-alone.teacup': '김이 오르는 찻잔 하나 곁에 몽망이가 있어요',
  'near-with.window-hand': '창살 같은 물방울 너머로 손 하나가 비쳐요',
  'near-with.teacup-two': '찻잔 두 개에서 김이 꼬여 올라요',
  'far-alone.mountain': '먹물결이 먼 산 능선처럼 솟아 있어요',
  'far-alone.sea': '몽망이 아래로 바다 물띠가 흘러요',
  'far-with.stars-drops': '먹점과 금점이 별처럼 흩어져 있어요',
  'far-with.sea-hand': '물띠 곁에 작은 몽망이 둘이 나란히 있어요',
  'center.rain': '비구름 같은 호 아래로 먹점이 끌려 내려요',
  'center.moon': '큰 맑은 방울에 금빛 테가 둘린 둥근 달이에요',
};

const CAUSE: Record<string, [string, string]> = {
  speed: ['어제 획을 빠르게 그어서', '어제 획을 천천히 그어서'],
  len: ['어제 획을 길게 뻗어서', '어제 획을 짧게 그어서'],
  dist: ['어제 획을 몸에서 멀리 그어서', '어제 획을 몸 가까이 그어서'],
  novel: ['어제 새로운 모양을 그어서', '어제 익숙한 모양을 그어서'],
  grind: ['어제 먹을 오래 갈아서', '어제 먹을 살짝 갈아서'],
  touch: ['어제 자주 쓰다듬어 줘서', '어제는 조용히 지켜봐서'],
  holdSpeed: ['어제 부드럽게 문질러 줘서', '어제 가만히 눌러 줘서'],
  tapSpread: ['어제 여기저기 보여 줘서', '어제 한곳을 보여 줘서'],
};

const AXIS_EFFECT: Record<sim.AxisId, [string, string]> = {
  tempo: ['먹이 잔잔하게 빨리 번져요', '먹이 느긋하게 번져요'],
  boldness: ['먹빛이 한결 짙어졌어요', '먹빛이 맑고 옅어졌어요'],
  closeness: ['몽망이가 더 가까이 기대요', '몽망이가 제 자리를 좋아해요'],
  curiosity: ['몽망이가 먼 곳을 자주 봐요', '몽망이가 가까운 것을 오래 봐요'],
};

/** 아침 문장 키 → 한 줄. 모르는 키는 조용한 관찰 문장으로 */
export function morningLine(line: sim.MorningLine, card: sim.DreamCard | null): string {
  const k = line.keys;
  if (line.kind === 'seven-day') return '이레가 지났어요. 첫 획은 여전히 몽망이의 몸에 있어요';
  if (line.kind === 'observation') {
    const motif = card ? MOTIF_NAMES[card.motifId] : undefined;
    return motif ? `간밤엔 ${motif} 꿈을 꾸었어요` : '간밤엔 조용한 꿈을 꾸었어요';
  }
  const [cause, effect] = k;
  const cm = cause?.match(/^cause\.(\w+)\.(plus|minus)$/);
  const causeText = cm ? CAUSE[cm[1]!]?.[cm[2] === 'plus' ? 0 : 1] : undefined;
  const em = effect?.match(/^(effect|deepen)\.(\w+)\.(plus|minus)\./);
  const ax = em ? AXIS_EFFECT[em[2] as sim.AxisId] : undefined;
  const effText = ax ? ax[em![3] === 'plus' ? 0 : 1] : '먹결이 조금 달라졌어요';
  return causeText ? `${causeText} ${effText}` : effText;
}

/** 현지 시각 → "아침 6시쯤", "오전 11시 반쯤" */
export function wakeClock(at: number, tzOffsetMin: number): string {
  const d = new Date(at + tzOffsetMin * 60_000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const half = m >= 15 && m < 45 ? ' 반' : '';
  const hh = m >= 45 ? (h + 1) % 24 : h;
  const label = hh < 5 ? '새벽' : hh < 9 ? '아침' : hh < 12 ? '오전' : hh < 18 ? '오후' : '저녁';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${label} ${h12}시${half}쯤`;
}

export function hhmm(localMin: number): string {
  const h = Math.floor(localMin / 60);
  const m = localMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const REJECT_TEXT: Record<'used' | 'asleep' | 'tooShort', string> = {
  used: '오늘의 한 획은 이미 그었어요 · 내일 아침에 다시 생겨요',
  asleep: '몽망이가 자고 있어요',
  tooShort: '조금 더 길게 그어 주세요',
};
