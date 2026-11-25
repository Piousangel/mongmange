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
  /**
   * 캡션 원인 말씨 `{zone}.{1|2|3}`(i18n `caption.cause.*`), null = 결과만(dreams-30days 3-2). 꿈 콘텐츠 플래그(`DreamContext`)가
   * 켜진 밤에 고른 카드에만 있다 — 없으면(빌드 1·플래그 꺼짐) 세이브 문자열이 지금과 같다. 그 밤의 성향이 몸짓으로 보였는지는
   * 나중에 다시 계산할 수 없어서(성향은 매일 바뀐다) 고를 때 정해 둔다.
   */
  cause?: string | null;
  /**
   * 그림 판(artRev, C14b 5차 — PM 11-25 채택). 꿈 콘텐츠 카드(C6 새 모티프)를 받은 때의 그림 판 번호. 렌더는 이 판의 그림(래스터·형상)으로
   * 그려 그림을 바꿔도 이미 받은 카드는 그대로다(D-13). 없으면 1판(`cardArtRev`). 빌드 1 카드에는 싣지 않는다(세이브 문자열 그대로)
   */
  artRev?: number;
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
  /**
   * 보름·꿈 콘텐츠 입력의 마지막 값(C6). 이벤트가 `moon`·`dream` 필드를 실어 올 때만 생긴다 — 없으면(옛 세이브·플래그 꺼짐)
   * doWake는 빌드 1과 같다. 같은 이벤트 열 = 같은 카드(결정성).
   */
  nightCtx?: NightContext;
}

/**
 * 보름밤 입력(C4 설계, 연결은 C6). 원격 플래그 `moonNight`·받아 둔 원격 보름 파일·빌드 종류는 State 밖 값이라,
 * 그대로 reduce가 읽으면 같은 이벤트 열의 결과가 '언제 앱을 열었나·파일을 받았나'에 따라 달라진다.
 * 그래서 이 값은 **이벤트 payload로만** 들어온다(재우기·포그라운드의 선택 필드). C6에서 State에 마지막 값을 기록하고
 * doWake가 그 값을 `pickNightCard`에 넘긴다. 필드가 없는 옛 이벤트 = 보름 끔 = 지금 동작.
 */
export interface MoonContext {
  /** 원격 플래그 moonNight(rollout 적용 뒤 값) */
  enabled: boolean;
  /** 기기에 받아 두고 검증을 통과한 원격 보름 id(revoked 제외) */
  remoteMoon?: string[];
  /** 개발 빌드(자리표시 모티프도 고른다). 제품 빌드는 false·없음 */
  dev?: boolean;
}

/**
 * 꿈 콘텐츠 입력(C6, dreams-30days 1~3절): 모티프 25·점적 해금·반복 방지 규칙(R1~R5)·캡션 원인. 앱 플래그 `dreamContent`와
 * 원격 `dreamUnlock`은 State 밖 값이라 `MoonContext`와 같은 길(재우기·포그라운드 이벤트의 선택 필드 → State `nightCtx`)로만 들어온다.
 * 없거나 꺼짐 = 빌드 1 `pickCard`(모티프 10) 그대로.
 */
export interface DreamContext {
  enabled: boolean;
  /** 원격 dreamUnlock(앞당기기만, 2-1) */
  unlock?: Record<string, number>;
  /** 개발 빌드(형상 자리표시 모티프도 고른다). 제품 빌드는 false·없음 */
  dev?: boolean;
}

/** doWake가 읽는 State 밖 입력의 마지막 값(이벤트가 그 필드를 실어 올 때만 바뀐다) */
export interface NightContext {
  moon?: MoonContext;
  dream?: DreamContext;
}

export type Event =
  /** birthShape = M1 타고남 플래그가 켜진 앱: 그 개체의 체형으로 부착(D-12 개정 ①). 없으면 기본형 — 빌드 1과 같다 */
  | { type: 'stroke'; at: Millis; raw: RawPoint[]; level?: AttachLevel; birthShape?: boolean }
  | { type: 'washStroke'; at: Millis }
  | { type: 'grind'; at: Millis; durationMs: number }
  /** 몽망이 탭 = 쓰다듬기, holdMs ≥ 500 = 문지르기(길게 누르기). 종이 탭 = 그쪽을 봄 */
  | { type: 'tap'; at: Millis; target: 'body' | 'paper'; holdMs: number; x: number; y: number; moveSpeed?: number }
  /** 연적 탭 */
  | { type: 'putToSleep'; at: Millis; moon?: MoonContext; dream?: DreamContext }
  /** 건져 올리기 */
  | { type: 'developCard'; at: Millis }
  | { type: 'setTimes'; at: Millis; bedtimeLocalMin: number; morningLocalMin: number }
  | { type: 'appForeground'; at: Millis; tzOffsetMin: number; moon?: MoonContext; dream?: DreamContext }
  | { type: 'appBackground'; at: Millis }
  /** 먹 고르기·바꾸기(빌드 2). 첫 잠에 씨앗이 정해 둔 먹을 덮는다 */
  | { type: 'chooseInk'; at: Millis; ink: InkId; seeded?: boolean }
  /** 이름 짓기·바꾸기(빌드 2 M2). 검사(normalizeName)를 통과한 이름만 받는다. 지금 이름과 같으면 아무 일도 없다 */
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
  | { type: 'clockSuspect'; kind: 'rewind' | 'reset' | 'jump' }
  /** 이름을 새로 짓거나 바꿈(M2) — 앱이 인장 '탁'을 이 한 곳에서만 낸다. first = 처음 지은 이름 */
  | { type: 'named'; first: boolean };

export interface Step {
  state: State;
  effects: Effect[];
}
