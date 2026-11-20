// 이레 두루마리 영상의 프레임 타임라인(로드맵 C7). 순수·결정적: 같은 세이브 → 같은 슬롯·같은 프레임.
// 정본: B-identity-share 4-2 ③(9:16 1080×1920·8초·소리, 방울 0.6초 → 하루 0.7초씩 7획 → 기쁨·결 이름 → 끝 장),
// C-integrated 2-5(공유 꼬리표 = 영상 끝 1.5초), D-20(8초·240프레임), server-v1 3-5-3(웹 루프 540×675·무음·7.5~8.5초).
// 그리기는 앱(render/ireVideo), 인코딩은 네이티브 모듈(C10 묶음, 미구현). 이 파일은 '어느 프레임에 무엇이 얼마나 보이나'만 정한다.
import { currentInk, type InkId } from '../sim/pillars';
import type { AxisId, DreamCard, State } from '../sim/types';
import { isMoonMotifId } from '../moon/motifs';
import { coreScale } from './bodySpec';

/** 두루마리 한 폭 = 첫 일곱 획(성장은 날짜가 아니라 획 수, systems 4.1) */
export const IRE_SLOTS = 7;

/**
 * 출력 규격. `share` = OS 공유 영상(D-20: 9:16, 8초, 240프레임, 소리), `webLoop` = `/m` 8초 루프(architecture 3-5-3:
 * H.264, 540×675, 무음, 24fps, 이름 없음, 커밋 검사 길이 7.5~8.5초). 길이 = frames / fps.
 */
export const IRE_OUTPUTS = {
  share: { width: 1080, height: 1920, fps: 30, frames: 240, audio: true, text: true },
  webLoop: { width: 540, height: 675, fps: 24, frames: 192, audio: false, text: false },
} as const;
export type IreOutputKind = keyof typeof IRE_OUTPUTS;

/** 서버 루프 커밋 검사(3-5-3)의 길이 범위(ms) */
export const LOOP_DURATION_RANGE_MS = [7500, 8500] as const;

export function ireDurationMs(kind: IreOutputKind): number {
  const o = IRE_OUTPUTS[kind];
  return (o.frames * 1000) / o.fps;
}

/**
 * 장면 박자(ms). 방울 0~0.6 → 획 0.6~5.5(하루 0.7초 × 7) → 기쁨 5.5~6.5 → 꼬리표 6.5~8.0(결 이름 번짐 6.5~7.3, 인장·이름·앱 이름 7.0~).
 * 정본 차이: B 4-2는 '결 이름 1.5초 + 끝 장 1초', C 2-5는 '꼬리표 끝 1.5초' — 기쁨 1.0초 + 꼬리표 1.5초(결 이름은 꼬리표 안)로 확정(PM 11-20, DECISIONS 'C7').
 * 웹 루프는 글이 없어 꼬리표 대신 기쁨을 7.6초까지 두고, 마지막 0.4초에 몸이 한지로 스며 첫 프레임(빈 한지)과 이어진다.
 */
export const IRE_BEATS = {
  dropEnd: 600,
  strokeMs: 700,
  strokesEnd: 600 + 700 * IRE_SLOTS,
  joyEnd: 6500,
  labelIn: [6500, 7300],
  tagIn: [7000, 7600],
  loopFade: [7600, 8000],
} as const;

/** 9:16 안전 영역(B 4-2: 정보는 세로 14~80%, 아래 14%는 링크 스티커 자리로 비움) */
export const IRE_SAFE_Y = [0.14, 0.8] as const;

export interface IreSlot {
  /** 0..6, 그은 순서 */
  index: number;
  /** State.strokes 안 자리(그리기용) */
  strokeIndex: number;
  strokeId: string;
  /** 그은 날의 dayIndex(깸 횟수 — 시계와 무관, 현지 04:00 날 경계와 같은 '잠 한 번' 기준) */
  day: number;
  /** 그 획이 들어간 밤의 카드(State.cards 자리). 아직 현상 전·씻긴 획이면 null */
  cardIndex: number | null;
  /** 밀린 밤을 합친 '긴 잠' 카드인가 */
  longSleep: boolean;
  /** 보름 카드인가 */
  moon: boolean;
}

interface IreSourceBase {
  slots: IreSlot[];
  ink: InkId | null;
  /** 결(이레 아침에 처음 정함). null = 아직 */
  label: { axis: AxisId; sign: 1 | -1 } | null;
}

/** OS 공유 영상의 재료. `name`은 이름 공개(nameVisible)가 켜지고 이름이 있을 때만 있다 */
export interface IreShareSource extends IreSourceBase {
  name?: string;
}

/** 웹 루프의 재료 — 이름 칸 자체가 없다(3-5-2: 루프 렌더는 이름 인자를 타입으로 받지 않는다) */
export interface IreLoopSource extends IreSourceBase {
  name?: never;
}

/** 첫 일곱 획 → 슬롯. 순서는 State.strokes 순서(그은 순서, 정본 기록)이고 시계 값으로 다시 정렬하지 않는다 */
export function ireSlotsOf(s: Pick<State, 'strokes' | 'cards'>): IreSlot[] {
  const out: IreSlot[] = [];
  const n = Math.min(IRE_SLOTS, s.strokes.length);
  for (let i = 0; i < n; i++) {
    const st = s.strokes[i]!;
    const ci = s.cards.findIndex((c) => c.strokeRef === st.id);
    const card: DreamCard | undefined = ci >= 0 ? s.cards[ci] : undefined;
    out.push({
      index: i,
      strokeIndex: i,
      strokeId: st.id,
      day: st.day,
      cardIndex: ci >= 0 ? ci : null,
      longSleep: (card?.nightsMerged ?? 1) > 1,
      moon: card ? isMoonMotifId(card.motifId) : false,
    });
  }
  return out;
}

function baseOf(s: State): IreSourceBase {
  const label = s.temperamentLabel;
  return { slots: ireSlotsOf(s), ink: currentInk(s.ink), label: label ? { axis: label.axis, sign: label.sign } : null };
}

/** OS 공유 영상 재료. 이름은 `nameVisible`이 켜져 있을 때만 싣는다(꺼짐 = 키 자체가 없음) */
export function ireShareSourceOf(s: State, opts: { nameVisible: boolean }): IreShareSource {
  const base = baseOf(s);
  return opts.nameVisible && s.name ? { ...base, name: s.name.text } : base;
}

/** 웹 루프 재료(이름 없음) */
export function ireLoopSourceOf(s: State): IreLoopSource {
  return baseOf(s);
}

export type IreBeat = 'drop' | 'strokes' | 'joy' | 'tag' | 'fade';

/** 한 프레임의 장면 기술. 앱은 이것만 보고 그린다(몸 = Mongmangi BodyFrame, 그 밖 = 점·카드·글) */
export interface IreFrame {
  i: number;
  /** 프레임 시작 시각(ms) */
  t: number;
  beat: IreBeat;
  /** 방울이 한지에 떨어져 몸이 되는 정도 0..1(몸 먹 농도) */
  drop: number;
  /** 슬롯별 부착 진행: −1 = 아직 안 보임, 0..1 = 붙는 중·붙음 */
  attachK: number[];
  /** 슬롯별 갓 그은 번짐 0..1 */
  fresh: number[];
  /** 핵 크기(보이는 획 수로 보간, coreScale) */
  scale: number;
  /** 빗 성장 단계(다 붙은 획 수) */
  combN: number;
  /** 기쁨 눈 섞임 0..1 */
  joy: number;
  /** 바닥에서 뜬 높이(W) */
  hop: number;
  /** 일곱 날 점 채움 0..1(빈 슬롯은 0) */
  dots: number[];
  /** 슬롯별 꿈 카드 펼침 0..1(카드 없으면 0) */
  cards: number[];
  /** 결 이름 번짐 0..1 */
  label: number;
  /** 꼬리표(인장·이름·앱 이름) 0..1 */
  tag: number;
  /** 이번 프레임에 이름을 그리나(재료에 이름이 있고 꼬리표가 보일 때만) */
  showName: boolean;
  /** 장면 전체 먹 농도(웹 루프 끝에서 한지로 스밈) */
  fade: number;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x: number) => 1 - (1 - x) * (1 - x);
const ease = (x: number) => x * x * (3 - 2 * x);
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

/** 획 부착 곡선(StrokeScreen attachProgress를 0.7초 슬롯에 맞춰 줄인 것): 150ms에 0.6, 650ms에 1 */
export function slotAttach(dt: number): number {
  if (dt < 0) return -1;
  if (dt < 150) return 0.6 * easeOut(dt / 150);
  return 0.6 + 0.4 * ease(clamp01((dt - 150) / 500));
}

export function ireFrameCount(kind: IreOutputKind): number {
  return IRE_OUTPUTS[kind].frames;
}

/** 프레임 i의 장면. 범위 밖 i는 끝으로 자른다 */
export function ireFrameAt(src: IreShareSource | IreLoopSource, kind: IreOutputKind, i: number): IreFrame {
  const out = IRE_OUTPUTS[kind];
  const fi = Math.min(out.frames - 1, Math.max(0, Math.floor(i)));
  const t = (fi * 1000) / out.fps;
  const B = IRE_BEATS;
  const attachK: number[] = [];
  const fresh: number[] = [];
  const dots: number[] = [];
  const cards: number[] = [];
  let shown = 0;
  let combN = 0;
  for (let k = 0; k < IRE_SLOTS; k++) {
    const slot = src.slots[k];
    const t0 = B.dropEnd + k * B.strokeMs;
    if (!slot) {
      dots.push(0);
      cards.push(0);
      continue;
    }
    const a = slotAttach(t - t0);
    attachK.push(a);
    fresh.push(a < 0 ? 0 : clamp01(1 - (t - t0) / 1200));
    if (a >= 0) shown += a;
    if (a >= 1) combN++;
    dots.push(ease(span(t, t0 + 300, t0 + 600)));
    cards.push(slot.cardIndex === null ? 0 : easeOut(span(t, t0 + 150, t0 + 650)));
  }
  const n = Math.floor(shown);
  const scale = coreScale(n) + (coreScale(n + 1) - coreScale(n)) * (shown - n);
  const joy = kind === 'webLoop' ? ease(span(t, B.strokesEnd, B.strokesEnd + 300)) : ease(span(t, B.strokesEnd, B.strokesEnd + 300)) * (1 - ease(span(t, B.joyEnd + 400, B.joyEnd + 900)));
  const hk = span(t, B.strokesEnd + 100, B.strokesEnd + 600);
  const hop = hk > 0 && hk < 1 ? 0.07 * 4 * hk * (1 - hk) : 0;
  const text = out.text;
  const label = text && src.label ? ease(span(t, B.labelIn[0], B.labelIn[1])) : 0;
  const tag = text ? ease(span(t, B.tagIn[0], B.tagIn[1])) : 0;
  const fade = kind === 'webLoop' ? 1 - ease(span(t, B.loopFade[0], B.loopFade[1])) : 1;
  const beat: IreBeat =
    t < B.dropEnd ? 'drop' : t < B.strokesEnd ? 'strokes' : kind === 'webLoop' ? (t < B.loopFade[0] ? 'joy' : 'fade') : t < B.joyEnd ? 'joy' : 'tag';
  return {
    i: fi,
    t,
    beat,
    drop: easeOut(span(t, 0, B.dropEnd)),
    attachK,
    fresh,
    scale,
    combN,
    joy,
    hop,
    dots,
    cards,
    label,
    tag,
    showName: text && typeof src.name === 'string' && tag > 0,
    fade,
  };
}

/** 정지 이미지(포스터·이미지판)에 쓰는 프레임: 웹 루프는 스미기 직전, 공유는 마지막 프레임 */
export function irePosterFrame(kind: IreOutputKind): number {
  if (kind === 'webLoop') return Math.floor((IRE_BEATS.loopFade[0] * IRE_OUTPUTS.webLoop.fps) / 1000) - 1;
  return IRE_OUTPUTS[kind].frames - 1;
}

export type IreCueSound = 'ink_drop' | 'stroke_attach' | 'mong_joy';

/** 소리 자리(공유 영상만, 웹 루프는 무음): 방울 → 슬롯마다 붙는 소리 → 기쁨. 인코더가 AAC 트랙으로 섞는다 */
export function ireAudioCues(src: IreShareSource, kind: IreOutputKind): { t: number; sound: IreCueSound }[] {
  if (!IRE_OUTPUTS[kind].audio) return [];
  const cues: { t: number; sound: IreCueSound }[] = [{ t: 0, sound: 'ink_drop' }];
  src.slots.forEach((_, k) => cues.push({ t: IRE_BEATS.dropEnd + k * IRE_BEATS.strokeMs + 120, sound: 'stroke_attach' }));
  cues.push({ t: IRE_BEATS.strokesEnd + 100, sound: 'mong_joy' });
  return cues;
}

// ── 배치(폭 1 = 출력 폭, y는 높이 비율) ─────────────────────────

export interface IreRectN {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface IreLayout {
  /** 몸 중심(폭·높이 비율)과 1W(폭 비율) */
  body: { cx: number; cy: number; w: number };
  /** 일곱 날 점: 가운데 x, y(높이 비율), 간격·반지름(폭 비율) */
  dots: { cx: number; y: number; gap: number; r: number };
  /** 꿈 카드 일곱 칸(공유만) */
  cards: IreRectN[];
  /** 결 이름·꼬리표 줄·앱 이름 기준선(높이 비율)과 글자 크기(폭 비율), 인장(공유만) */
  text: { label: { y: number; size: number }; tag: { y: number; size: number }; app: { y: number; size: number }; seal: IreRectN } | null;
}

export function ireLayout(kind: IreOutputKind): IreLayout {
  if (kind === 'webLoop') {
    return { body: { cx: 0.5, cy: 0.47, w: 0.2 }, dots: { cx: 0.5, y: 0.87, gap: 0.05, r: 0.008 }, cards: [], text: null };
  }
  const { width, height } = IRE_OUTPUTS.share;
  const aspect = width / height;
  const cw = 0.11;
  const ch = cw * 1.25 * aspect;
  const gap = 0.018;
  const x0 = 0.5 - (IRE_SLOTS * cw + (IRE_SLOTS - 1) * gap) / 2;
  const cards = Array.from({ length: IRE_SLOTS }, (_, k) => ({ x: x0 + k * (cw + gap), y: 0.615, w: cw, h: ch }));
  return {
    body: { cx: 0.5, cy: 0.38, w: 0.24 },
    dots: { cx: 0.5, y: 0.585, gap: 0.05, r: 0.007 },
    cards,
    text: {
      label: { y: 0.74, size: 0.06 },
      tag: { y: 0.768, size: 0.028 },
      app: { y: 0.792, size: 0.022 },
      seal: { x: 0.79, y: 0.712, w: 0.06, h: 0.06 * aspect },
    },
  };
}

// ── 글(꼬리표) ──────────────────────────────────────────────

/** 앱이 언어별로 풀어 넘기는 글. 이름은 재료(`IreShareSource.name`)에서만 온다 — 여기서 따로 받지 않는다 */
export interface IreStrings {
  /** 결 이름(없으면 그리지 않음) */
  label?: string;
  /** 먹 이름(없으면 꼬리표에서 뺌) */
  ink?: string;
  /** 앱 이름·스토어 줄 */
  app: string;
}

export interface IreTextItem {
  role: 'label' | 'tag' | 'app';
  text: string;
  /** 가운데 x(폭 비율), 기준선 y(높이 비율), 크기(폭 비율) */
  x: number;
  y: number;
  size: number;
  alpha: number;
}

/** 프레임 i의 글 목록. 웹 루프·글 없는 프레임은 빈 배열. 꼬리표 = `{이름} · {먹}`(있는 것만) */
export function ireTextItems(src: IreShareSource | IreLoopSource, frame: IreFrame, kind: IreOutputKind, strings: IreStrings): IreTextItem[] {
  const L = ireLayout(kind).text;
  if (!L || !IRE_OUTPUTS[kind].text) return [];
  const items: IreTextItem[] = [];
  if (frame.label > 0 && strings.label) items.push({ role: 'label', text: strings.label, x: 0.5, y: L.label.y, size: L.label.size, alpha: frame.label });
  if (frame.tag > 0) {
    const parts = [frame.showName ? src.name : undefined, strings.ink].filter((p): p is string => !!p);
    if (parts.length > 0) items.push({ role: 'tag', text: parts.join(' · '), x: 0.5, y: L.tag.y, size: L.tag.size, alpha: frame.tag });
    items.push({ role: 'app', text: strings.app, x: 0.5, y: L.app.y, size: L.app.size, alpha: frame.tag });
  }
  return items;
}
