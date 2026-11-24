// M2 이름·가락·부르기·이름 묻는 때(C-integrated v1.1 2-2·3-1, 시스템 3.8 '부르기', D-20 개정 줄 '이름 시점 A/B').
// 순수 TS·결정적: 같은 이름(또는 같은 씨앗) → 같은 가락. 시각은 State에서만, 난수 없음.
// 화면·소리는 앱이 플래그(`naming`·`nameMelody`)를 보고 정한다. 여기 규칙은 플래그를 모른다 — 앱이 켬/끔을 인자로 넘긴다.
import { mix32 } from '../visual/traits';
import { fnv1a } from './pillars';
import type { State } from './types';

// ── 이름 가락(32 = 음 개수 1~4 × 윤곽 8) ─────────────────────

/** 가락 사전 렌더 규격(sound-v0 8절): 파일 `name_melody_{id 두 자리}.wav`, id = (음 개수 − 1) × 8 + 윤곽 */
export const NAME_MELODY = {
  maxNotes: 4,
  contours: 8,
  count: 32,
  /** 재생 속도(= 음역·빠르기) 흔들림: 1 ± 0.08을 0.02 간격 9칸(sound-v0 '재생 속도 ±8%로만') */
  rateStep: 0.02,
  rateSteps: 9,
} as const;

/** 윤곽 8(A 1-4 가안: 오름·내림·오르내림·내리오름·같은음 끝올림 등). 순서 = 파일 번호, 바꾸면 소리 파일도 다시 만든다 */
export const MELODY_CONTOURS = ['rise', 'fall', 'arch', 'valley', 'flatUp', 'flatDown', 'zigzag', 'steps'] as const;
export type MelodyContour = (typeof MELODY_CONTOURS)[number];

export interface NameMelody {
  /** 0..31 — 사전 렌더 파일 번호 */
  id: number;
  notes: 1 | 2 | 3 | 4;
  contour: number;
  /** 재생 속도 0.92..1.08 */
  rate: number;
  /** 이름에서 왔나, 타고남 씨앗에서 왔나(이름이 없는 아이도 자기 가락이 있다) */
  from: 'name' | 'seed';
}

/**
 * 가락의 열쇠 = 이름을 '부르는 소리'로 본 것: NFC, 라틴 소문자, 공백·가운뎃점 제거.
 * 그래서 '먹 보'와 '먹보', 'Momo'와 'momo', 조합형(NFD)과 완성형(NFC)은 같은 가락이다.
 */
export function melodyKey(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/[\s·]/gu, '');
}

/** 음절 수(가락의 음 개수 재료): 한글 완성형 1자 = 1, 라틴은 모음 덩이(y 포함) 하나 = 1(없으면 1), 숫자 1자 = 1 */
export function syllableCount(text: string): number {
  const k = melodyKey(text);
  let n = 0;
  for (const run of k.match(/[\uAC00-\uD7A3]|[a-z]+|\p{Nd}/gu) ?? []) {
    if (/^[a-z]/.test(run)) n += Math.max(1, (run.match(/[aeiouy]+/g) ?? []).length);
    else n += 1;
  }
  return n;
}

const TAG_CONTOUR = 0x6d656c63; // 'melc'
const TAG_RATE = 0x6d656c72; // 'melr'
const TAG_SEED = 0x6d656c73; // 'mels'

function codepoints(s: string): number[] {
  return Array.from(s, (ch) => ch.codePointAt(0)!);
}

function rateOf(h: number): number {
  const step = mix32(h) % NAME_MELODY.rateSteps;
  const mid = (NAME_MELODY.rateSteps - 1) / 2;
  return Math.round((1 + (step - mid) * NAME_MELODY.rateStep) * 100) / 100;
}

/**
 * 이름 가락(2-2): 이름이 있으면 이름에서, 없으면 타고남 씨앗에서 고른다.
 * - 이름: 음 개수 = 음절 수(1~4, 5 이상은 4), 윤곽 = 이름 글자 해시 % 8, 속도 = 다른 꼬리표 해시.
 *   음 개수가 길이만으로 정해지므로 **윤곽·속도는 길이와 무관한 해시**여야 같은 길이 이름끼리도 갈린다(시험 '두 글자 이름 100개').
 * - 씨앗: 셋 다 씨앗 해시에서.
 */
export function nameMelodyOf(name: string | null, birthSeed: number): NameMelody {
  const key = name === null ? '' : melodyKey(name);
  if (key === '') {
    const h = mix32(fnv1a([birthSeed >>> 0, TAG_SEED]));
    const notes = ((h % NAME_MELODY.maxNotes) + 1) as NameMelody['notes'];
    const contour = (h >>> 8) % NAME_MELODY.contours;
    return { id: (notes - 1) * NAME_MELODY.contours + contour, notes, contour, rate: rateOf(fnv1a([h, TAG_RATE])), from: 'seed' };
  }
  const cps = codepoints(key);
  const notes = Math.min(NAME_MELODY.maxNotes, Math.max(1, syllableCount(key))) as NameMelody['notes'];
  const contour = mix32(fnv1a(cps, fnv1a([TAG_CONTOUR]))) % NAME_MELODY.contours;
  return { id: (notes - 1) * NAME_MELODY.contours + contour, notes, contour, rate: rateOf(fnv1a(cps, fnv1a([TAG_RATE]))), from: 'name' };
}

/** 두 가락이 얼마나 다른가(시험 지표): 음 개수 차 + 윤곽이 다르면 1 + 속도 차(칸 수 × 0.25) */
export function melodyDistance(a: NameMelody, b: NameMelody): number {
  return Math.abs(a.notes - b.notes) + (a.contour === b.contour ? 0 : 1) + (Math.abs(a.rate - b.rate) / NAME_MELODY.rateStep) * 0.25;
}

/** 지금 이 아이의 가락(이름이 있으면 이름, 없으면 씨앗) */
export function melodyOfState(s: Pick<State, 'name' | 'birth'>): NameMelody {
  return nameMelodyOf(s.name?.text ?? null, s.birth.seed);
}

// ── 부르기(세로 이름 탭) ─────────────────────────────────────

/** 부르기 대답이 가락으로 바뀌는 정(시스템 3.8 '2 알아봄') */
export const CALL_MELODY_JEONG = 2;

/**
 * 세로 이름을 눌렀을 때의 대답(2-2 '부르기와 발견', 시스템 3.8):
 * - turn = 고개를 돌리고 짧은 '응?'(정 0~1, 또는 가락이 꺼짐, 또는 이름을 지은 날 밤을 아직 지나지 않음)
 * - melody = 가락으로 대답 + 빗 튕김. 처음 대답 = 정 2 이상이면서 **이름을 지은 다음 깸**(이름을 지은 시각 < 마지막 깸).
 *   이름을 바꾸면 그 이름도 하룻밤을 지나야 대답한다(새 이름을 '배우는' 밤). 이름이 없는 아이는 정 2부터 씨앗 가락.
 */
export function callReply(s: Pick<State, 'relation' | 'name' | 'lastWakeAt' | 'phase'>, opts: { melody: boolean }): 'turn' | 'melody' {
  if (!opts.melody || s.phase !== 'awake') return 'turn';
  if (s.relation.jeongDays < CALL_MELODY_JEONG) return 'turn';
  if (s.name && !(s.name.at < s.lastWakeAt)) return 'turn';
  return 'melody';
}

// ── 이름 묻는 때(C2가 바꾸는 자리) ───────────────────────────

/** 이름을 물을 수 있는 순간: sleep = 연적으로 재우기 직전(A), morning = 아침 카드를 건져 올리고 닫은 직후(A 두 번째·B) */
export type NameMoment = 'sleep' | 'morning';
export type NameTimingGroup = 'A' | 'B';

/** 앱 메타에 남기는 묻기 기록(게임 규칙이 아니라 화면 흐름 기록이라 세이브 밖) */
export interface NameAskLog {
  /** 이름 짓기 창을 저절로 연 횟수(건너뛴 것 포함) */
  count: number;
  /** 마지막으로 연 dayIndex. -1 = 아직 */
  lastDay: number;
}
export const EMPTY_NAME_ASK: NameAskLog = { count: 0, lastDay: -1 };

/**
 * 지금 이름 짓기 창을 저절로 열까(D-20 개정 줄 '이름 시점 A/B' — 군 배정·판정은 C2 몫, 이 함수는 순간 규칙만):
 * - A(기본값): 첫 재우기에 한 번, 건너뛰면 그다음 아침(카드를 본 직후)에 한 번 더. 그 뒤로는 공방 노트에서만.
 * - B: 둘째 날 아침(dayIndex ≥ 1) 카드를 본 직후 한 번.
 * - 이미 이름이 있으면 열지 않는다. 같은 깸에 두 번 열지 않는다.
 */
export function namePromptDue(s: Pick<State, 'name' | 'dayIndex'>, moment: NameMoment, group: NameTimingGroup, log: NameAskLog): boolean {
  if (s.name) return false;
  if (log.lastDay === s.dayIndex && log.count > 0) return false;
  if (group === 'A') {
    if (moment === 'sleep') return log.count === 0;
    return log.count === 1 && s.dayIndex > log.lastDay;
  }
  return moment === 'morning' && log.count === 0 && s.dayIndex >= 1;
}

/** 묻기 기록 갱신(창을 연 순간) */
export function recordNameAsk(log: NameAskLog, dayIndex: number): NameAskLog {
  return { count: log.count + 1, lastDay: dayIndex };
}

// ── 이름 입력 경계 ────────────────────────────────────────────

/**
 * 입력 중인 끝 글자가 아직 조합 중인 한글(호환 자모 ㄱ~ㆎ·첫가끝 자모)인가. 조합 중에는 '허용 안 되는 글자' 안내를 띄우지 않는다
 * (IME가 '몽ㅁ' 같은 중간 상태를 내보낸다). 확정(짓기)할 때는 normalizeName이 그대로 거부한다.
 */
export function endsWithComposingJamo(raw: string): boolean {
  const last = Array.from(raw.normalize('NFC')).at(-1);
  if (!last) return false;
  const c = last.codePointAt(0)!;
  return (c >= 0x3131 && c <= 0x318e) || (c >= 0x1100 && c <= 0x11ff);
}

/** 처음 이름을 지은 시각(바꿔도 그대로). 이름이 없으면 null — 집계 핑 name_set은 이 시각으로 한 번만 */
export function firstNamedAt(s: Pick<State, 'name'>): number | null {
  return s.name ? (s.name.firstAt ?? s.name.at) : null;
}

// ── 공유물의 이름(유일한 문) ─────────────────────────────────

/**
 * 공유물(꿈 카드 PNG·이레 영상·공개 스냅숏)에 실을 이름. **공유물은 반드시 이 함수 하나로 이름을 얻는다**(architecture 3-5-2 'nameShown'의 앱 쪽 문).
 * 이름 공개(`nameVisible`, 기본 끔)가 꺼졌거나 이름이 없으면 null. 앱 안 화면(이름표·홈·카드 보기)은 공개 설정과 무관하다(3-5-2 표 끝 줄).
 */
export function sharedNameOf(s: Pick<State, 'name'>, nameVisible: boolean): string | null {
  return nameVisible && s.name ? s.name.text : null;
}
