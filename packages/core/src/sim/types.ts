// MVP 시뮬레이션 상태·이벤트·효과 타입(systems-v1 7절 스케치 기반). 순수 데이터만.
import type { AttachLevel, RawPoint, StrokeRecord } from '../geometry/types';
import type { Birth, InkChoice, InkId, NameRecord, Relation, TemperamentLabel } from './pillars';

export type Millis = number;
export type AxisId = 'tempo' | 'boldness' | 'closeness' | 'curiosity';
export const AXES: readonly AxisId[] = ['tempo', 'boldness', 'closeness', 'curiosity'];
export type AxisRecord = Record<AxisId, number>;

/** 하루 입력 측정값(0..1, 모집단 중앙값 0.5). systems 2.2 표의 '측정값' */
export interface Measures {
  speed: number;
  grind: number;
  len: number;
  dist: number;
  novel: number;
  touch: number;
  holdSpeed: number;
  tapSpread: number;
}

/** 획의 칠 — 그을 때 성향으로 고정(systems 2.5) */
export interface StrokeStyle {
  bleedPx: number;
  bleedMs: number;
  dryBrush: number;
  endCap: 'taper' | 'square';
  tone: number;
  spreadDir: number;
}

/** 정본 점열 기록(D-13, 기존 StrokeRecord) + 시뮬레이션 메타 */
export interface Stroke extends StrokeRecord {
  id: string;
  /** 그은 날의 dayIndex */
  day: number;
  createdAt: Millis;
  /** 그날 간 먹 농도(0..1) */
  grind: number;
  style: StrokeStyle;
  /** 첫 두름은 평생 고정 */
  pinned: 'first' | null;
}

export type Phase = 'awake' | 'asleep';
/** rewind = 1~12h 역행(경과 0), reset = 12h 넘는 역행 → 시계 보정, jump = 72h 초과 */
export type ClockSuspect = null | 'rewind' | 'reset' | 'jump';

export interface ClockState {
  /** 지금까지 본 가장 늦은 시각(줄지 않음) */
  hwm: Millis;
  lastSimAt: Millis;
  /** UTC 기준 현지 오프셋(분, 동쪽 +). 서울 540 */
  tzOffsetMin: number;
  suspect: ClockSuspect;
}

export type InputKind = 'stroke' | 'grind' | 'tap';

export interface StrokeMeasure {
  speed: number;
  len: number;
  dist: number;
  novel: number;
}

/** 깬 뒤 하루 동안 모은 입력. 깰 때 비운다 */
export interface DayLedger {
  stroke: StrokeMeasure | null;
  grindMs: number;
  petCount: number;
  holdMs: number;
  /** 길게 누르기 미세 이동 속도 × 누른 시간(가중 평균용) */
  holdMoveMs: number;
  taps: { x: number; y: number }[];
  strokeUsed: boolean;
  washUsed: boolean;
  lastStrokeAt: Millis | null;
  /** 성향 입력 횟수. 0이면 그 밤은 축을 움직이지 않는다 */
  inputs: number;
}

export interface DreamCard {
  /** 이 카드가 나온 아침의 dayIndex */
  night: number;
  motifId: string;
  composition: 0 | 1 | 2;
  /** 먹 톤 0(회청)..1(짙은 흑) — boldness */
  inkTone: number;
  /** 물결 — tempo(−1 긴 너울 .. +1 잔물결) */
  flow: number;
  flowSeed: number;
  strokeRef: string | null;
  /** 1보다 크면 '긴 잠' 카드(밀린 밤을 한 장으로) */
  nightsMerged: number;
}

export type LineKind = 'change' | 'deepen' | 'observation' | 'seven-day';

/** 아침 문장 데이터. 문자열은 키만(ko/en 템플릿은 앱이 고른다) */
export interface MorningLine {
  kind: LineKind;
  axis: AxisId | null;
  /** change·deepen = [원인 키, 결과 키], observation = [꿈 키], seven-day = [축1, 축2, 첫 획] */
  keys: string[];
}

export type Stage = 'drop' | 'firstStroke' | 'young' | 'ire7';

export interface State {
  schemaVersion: number;
  /** 시드 RNG 상태(mulberry32) */
  rng: number;
  createdAt: Millis;
  clock: ClockState;
  phase: Phase;
  sleepAt: Millis | null;
  lastWakeAt: Millis;
  /** null = 앱이 앞에 있음 */
  backgroundSince: Millis | null;
  /** 깸 횟수 */
  dayIndex: number;
  bedtimeLocalMin: number;
  morningLocalMin: number;
  /** 타고난 결이 정해졌는가(첫 입력이 있던 밤) */
  born: boolean;
  temperament: AxisRecord;
  bornTemperament: AxisRecord;
  habit: AxisRecord;
  focusHistory: (AxisId | null)[];
  strokes: Stroke[];
  strokesTotal: number;
  /** 지금까지 도달한 최대 획 수(씻기 뒤 단계 효과 중복 방지) */
  peakStrokes: number;
  ledger: DayLedger;
  lastCareAt: Millis;
  pendingCard: DreamCard | null;
  pendingLine: MorningLine | null;
  /** 현상한 카드(앨범) */
  cards: DreamCard[];
  /** 최근 결과 채널 `${axis}.${channel}` (5일 안 겹치지 않게) */
  recentChannels: string[];
  ire7LineShown: boolean;
  // ── 세이브 v2(sim 2): 세 기둥 필드. 빌드 1은 기능 없이 값만 쌓는다(C-integrated 4-1) ──
  /** 타고남 씨앗·인장 씨앗(첫 탭에 한 번) */
  birth: Birth;
  /** 고른 먹(빌드 2 기능) */
  ink: InkChoice;
  /** 지은 이름(빌드 2 기능). null = 아직 */
  name: NameRecord | null;
  /** 결 이름. 이레 아침에 처음 정한다(전환은 1.0 직후) */
  temperamentLabel: TemperamentLabel | null;
  /** 정·손 기억·감정 상태 입력 */
  relation: Relation;
}

export type Event =
  /** birthShape = M1 타고남 플래그가 켜진 앱: 그 개체의 체형으로 부착(D-12 개정 ①). 없으면 기본형 — 빌드 1과 같다 */
  | { type: 'stroke'; at: Millis; raw: RawPoint[]; level?: AttachLevel; birthShape?: boolean }
  | { type: 'washStroke'; at: Millis }
  | { type: 'grind'; at: Millis; durationMs: number }
  /** 몽망이 탭 = 쓰다듬기, holdMs ≥ 500 = 문지르기(길게 누르기). 종이 탭 = 그쪽을 봄 */
  | { type: 'tap'; at: Millis; target: 'body' | 'paper'; holdMs: number; x: number; y: number; moveSpeed?: number }
  /** 연적 탭 */
  | { type: 'putToSleep'; at: Millis }
  /** 건져 올리기 */
  | { type: 'developCard'; at: Millis }
  | { type: 'setTimes'; at: Millis; bedtimeLocalMin: number; morningLocalMin: number }
  | { type: 'appForeground'; at: Millis; tzOffsetMin: number }
  | { type: 'appBackground'; at: Millis }
  /** 먹 고르기·바꾸기(빌드 2). 첫 잠에 씨앗이 정해 둔 먹을 덮는다 */
  | { type: 'chooseInk'; at: Millis; ink: InkId; seeded?: boolean }
  /** 이름 짓기(빌드 2). 검사(normalizeName)를 통과한 이름만 받는다 */
  | { type: 'setName'; at: Millis; text: string };

export type Effect =
  | { type: 'slept'; at: Millis }
  | { type: 'woke'; at: Millis; dayIndex: number }
  | { type: 'cardReady'; card: DreamCard }
  | { type: 'cardDeveloped'; card: DreamCard; line: MorningLine }
  | { type: 'strokeAccepted'; strokeId: string }
  | { type: 'strokeRejected'; reason: 'used' | 'asleep' | 'tooShort' }
  | { type: 'strokeWashed'; strokeId: string }
  | { type: 'stageReached'; stage: Stage }
  | { type: 'bandEntered'; axis: AxisId; band: -1 | 0 | 1 }
  | { type: 'notSleepy' }
  | { type: 'rehydrated' }
  | { type: 'clockSuspect'; kind: 'rewind' | 'reset' | 'jump' };

export interface Step {
  state: State;
  effects: Effect[];
}
