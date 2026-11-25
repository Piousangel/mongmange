// V7 최소판 — '마시고 3초 대답'(heart-grain 5-1). 마시기(먹 방울이 몸으로 빨려 듦 1.2초) → ① 따라 하기(1.5초) → ② 돌아오기(1.5초, 유저를 봄).
// 기존 몸짓 재료만 쓴다: 고개(tilt)·뜀(hop)·눈(eyeB·eyeMix)·시선(gx·gy)·빗(angle·wobble)·번짐 고리(bleed). **몸 크기·비율(sx·sy·s)은 건드리지 않는다**(QA-3 R8·R9).
// 밥 한 숟갈·작은 것(D-27)도 같은 마시기를 쓰고, 오물오물·^ ^·꾸벅으로 대답한다(부풂 없음, 숟갈 수에 따라 크기 같음 — R7).
// RN·reanimated를 불러오지 않는 순수 모듈(앱 시험이 직접 부른다) — clock.ts 대신 clamp01을 여기 둔다
import { wobble } from './idle';

function clamp01(t: number): number {
  'worklet';
  return Math.min(Math.max(t, 0), 1);
}

/** 대답 종류(공유값에 숫자로 싣는다) */
export const CUE = {
  none: 0,
  bright: 1,
  warm: 2,
  spiky: 3,
  low: 4,
  nature: 5,
  home: 6,
  kin: 7,
  days: 8,
  unknown: 9,
  call: 10,
  /**
   * 배고픔 낱말(home.in.meal): 기쁨 호 없이 제자리에서 유저를 본다(QA-3 R4-3).
   * 곁 대답(위기)은 따로 두지 않는다 — 넓은 그물 가라앉음 대답과 같은 모양이라 위기 판정이 화면·소리로 드러나지 않는다(리뷰 M2)
   */
  look: 11,
  meal: 12,
  /** 그 깸의 마지막 숟갈 뒤 꾸벅(만족, 배와 무관) */
  mealBow: 13,
  treat: 14,
  // ── M4 반김·정 몸짓(마시기 없음 — 먹 방울이 날아가지 않는다). 강도 칸 = closeness 구간(3 다가옴 · 2 가운데 · 1 혼자) ──
  /** 6h 미만: 고개 돌림(+ 다가옴은 빗 한 번, 혼자는 시선만) */
  greetGlance: 15,
  /** 6~30h: 기쁨(다가옴 = 좌우로 비빔, 혼자 = 제자리 기쁨 + 빗 크게) */
  greetJoy: 16,
  /** 기다림 자세: 유저 쪽을 보고 빗을 세운 채 고요히(30~72h, 정 4 익숙한 시각, 머뭇거림을 끈 72h) */
  greetWait: 17,
  /** 72h 이상 첫 터치 뒤 큰 반김: 기쁨 1.5배 + 빗 두 번(이름 가락 2회는 소리) */
  greetBig: 18,
  /** 머뭇거림 0.8초: 제자리에서 고개를 한 번 갸웃, 시선은 유저 쪽. 비켜 앉기·몸 돌리기·크기 줄이기·빗 납작 없음 */
  hesitate: 19,
  /** 정 4 내밂: 좋아하는 자리 쪽으로 몸을 기울여 내민다(fromX = 자리 0..5) */
  offerSpot: 20,
  /** 정 7 이름 대답: closeness ≥ 0 = 유저 쪽으로 다가오듯 기울임(이동 0 — 몸 자리 그대로), < 0 = 제자리에서 빗만 크게 두 번 */
  replyNear: 21,
  replyFar: 22,
} as const;
export type CueKind = (typeof CUE)[keyof typeof CUE];

export interface CueValue {
  kind: number;
  /** 강도 1·2·3 → 진폭 0.6·0.8·1.0 */
  intensity: number;
  /** 넓은 그물(가라앉음 5결): 돌아오기 = 곁으로 와서 붙어 앉기 */
  net: boolean;
  /** 먹 방울이 출발하는 곳(화면 px) */
  fromX: number;
  fromY: number;
  /** 시작 시각(clock) */
  at: number;
}

export const NO_CUE: CueValue = { kind: 0, intensity: 2, net: false, fromX: 0, fromY: 0, at: -1e9 };

export const DRINK_MS = 1200;
export const ECHO_MS = 1500;
export const BACK_MS = 1500;

/** 반김·정 몸짓 길이(ms) */
export const GREET_MS: Record<number, number> = {
  [CUE.greetGlance]: 1400,
  [CUE.greetJoy]: 2200,
  [CUE.greetWait]: 2400,
  [CUE.greetBig]: 3000,
  [CUE.hesitate]: 800,
  [CUE.offerSpot]: 1800,
  [CUE.replyNear]: 1600,
  [CUE.replyFar]: 1600,
};

/** 마시기(먹 방울)가 있는 대답인가 — 반김·정 몸짓은 마시지 않는다 */
export function drinks(kind: number): boolean {
  'worklet';
  return kind >= CUE.bright && kind <= CUE.treat;
}

export function cueLength(kind: number): number {
  'worklet';
  if (kind === CUE.none) return 0;
  if (!drinks(kind)) return GREET_MS[kind] ?? 0;
  return DRINK_MS + ECHO_MS + BACK_MS;
}

export interface AnswerPose {
  tilt: number;
  hop: number;
  gx: number;
  gy: number;
  /** 아래로(곁으로) 내려앉는 양(W) */
  settle: number;
  eyeB: 'open' | 'joy' | 'sleepy' | 'surprised' | 'closed';
  eyeMix: number;
  combAngle: number;
  combWobble: number;
  bleed: number;
  /** 숨 주기 배율(1 = 그대로, 곁 대답 8초 숨) */
  breathMs: number;
  /** 먹 방울(마시기): 0..1 진행, 음수 = 안 보임 */
  drop: number;
}

const REST: AnswerPose = { tilt: 0, hop: 0, gx: 0, gy: 0, settle: 0, eyeB: 'open', eyeMix: 0, combAngle: 0, combWobble: 0, bleed: 1, breathMs: 0, drop: -1 };

/**
 * M4 반김·정 몸짓(시스템 3.8, 아트 8절 — 모션 확정은 DS-2 임시판). 기존 재료(고개·뜀·눈·시선·빗·번짐)만 쓰고 몸 크기·비율·자리는 건드리지 않는다.
 * 모든 반김은 유저 쪽(화면 앞, gy +)을 본다 — 등 돌림·시선 피하기 없음. 머뭇거림은 빗을 내리지 않고(납작 금지) 내려앉지도 않는다.
 */
export function greetPose(c: CueValue, dt: number, rm: boolean): AnswerPose {
  'worklet';
  const total = GREET_MS[c.kind] ?? 0;
  if (dt < 0 || dt > total || total === 0) return REST;
  const u = dt / total;
  const env = Math.sin(Math.PI * u);
  const lean = c.intensity >= 3 ? 'near' : c.intensity <= 1 ? 'alone' : 'mid';
  // 유저 쪽 = 정면(시선 0). gy를 아래로 주면 웹·기기 캡처에서 눈이 내리깐 모양(졸림·풀 죽음)으로 읽혀 반김에는 쓰지 않는다(M4 캡처 판정)
  const front = 0;
  if (rm) {
    // 모션 줄이기: 눈·빗만(0.4초 들고 나기)
    const k = clamp01(dt / 400) * clamp01((total - dt) / 400);
    const joy = c.kind === CUE.greetJoy || c.kind === CUE.greetBig || c.kind === CUE.offerSpot || c.kind === CUE.replyNear || (c.kind === CUE.greetGlance && lean === 'near');
    const ang = c.kind === CUE.greetWait ? 8 : c.kind === CUE.greetBig || c.kind === CUE.replyFar ? 12 : 0;
    return { ...REST, eyeB: joy ? 'joy' : 'open', eyeMix: joy ? 0.8 * k : 0, combAngle: ang * k };
  }
  switch (c.kind) {
    case CUE.greetGlance:
      // 고개를 유저 쪽으로 돌림. 다가옴 = 빗 한 번, 혼자 = 시선만(고개 그대로)
      return { ...REST, gy: front, tilt: lean === 'alone' ? 0 : 0.05 * env, combWobble: lean === 'near' ? 6 * wobble(dt, 3, 2) : 0, eyeB: 'joy', eyeMix: lean === 'near' ? 0.6 * env : 0 };
    case CUE.greetJoy: {
      // 기쁨: 다가옴 = 좌우로 천천히 비빔, 가운데 = 작게 뜀, 혼자 = 제자리 기쁨 + 빗 크게
      const rub = lean === 'near' ? 0.06 * Math.sin(4 * Math.PI * u) * env : 0;
      const hop = lean === 'mid' ? 0.07 * Math.abs(Math.sin(2 * Math.PI * u)) * env : 0;
      return { ...REST, gy: front, tilt: rub, hop, eyeB: 'joy', eyeMix: env, combAngle: (lean === 'alone' ? 22 : 12) * env, combWobble: 6 * wobble(dt, 3, 2) * env };
    }
    case CUE.greetWait:
      // 기다림 자세: 유저 쪽을 보고 빗을 조금 세운 채 고요히(혼자 = 멀찍이 — 시선만 조금 덜)
      return { ...REST, combAngle: (lean === 'alone' ? 5 : 8) * clamp01(u * 4), breathMs: 4400 };
    case CUE.greetBig:
      // 큰 반김: 기쁨 1.5배 — 통통 두 번 + 빗 두 번 크게 + 기쁨 눈
      return { ...REST, gy: front, hop: 0.15 * Math.abs(Math.sin(2 * Math.PI * u)) * env, eyeB: 'joy', eyeMix: 1, combAngle: 30 * env, combWobble: 9 * wobble(dt, 3, 2), bleed: 1 + 0.1 * env };
    case CUE.hesitate:
      // 머뭇거림: 제자리에서 고개를 한 번 갸웃, 시선은 처음부터 끝까지 유저 쪽. 눈은 뜬 그대로(슬픈 눈·감은 눈 없음)
      return { ...REST, tilt: 0.09 * env, eyeB: 'open', eyeMix: 0 };
    case CUE.offerSpot: {
      // 내밂: 좋아하는 자리(0..5, 위 = 0 시계 방향) 쪽으로 기울여 내민다. 시선은 유저 쪽
      const spot = Math.max(0, Math.min(5, Math.round(c.fromX)));
      const side = spot <= 2 ? 1 : -1; // 앞쪽 자리 = 화면 오른쪽
      return { ...REST, gy: front, tilt: 0.1 * side * env, eyeB: 'joy', eyeMix: 0.7 * env, combWobble: 4 * wobble(dt, 2.5, 2) * env };
    }
    case CUE.replyNear:
      return { ...REST, tilt: 0.04 * env, eyeB: 'joy', eyeMix: env, combAngle: 10 * env };
    case CUE.replyFar:
      return { ...REST, gy: front, combAngle: 24 * Math.abs(Math.sin(2 * Math.PI * u)) * env, combWobble: 8 * wobble(dt, 3, 2) * env };
    default:
      return REST;
  }
}

/** dt = 시작 뒤 ms. rm = 모션 줄이기(눈·빗만, 0.4초) */
export function answerPose(c: CueValue, dt: number, rm: boolean): AnswerPose {
  'worklet';
  const total = cueLength(c.kind);
  if (c.kind === CUE.none || dt < 0 || dt > total) return REST;
  if (!drinks(c.kind)) return greetPose(c, dt, rm);
  const drop = dt < DRINK_MS ? dt / DRINK_MS : -1;
  if (dt < DRINK_MS) return { ...REST, drop, gx: 0, gy: 0.15 * (1 - dt / DRINK_MS) };
  const A = c.intensity <= 1 ? 0.6 : c.intensity >= 3 ? 1 : 0.8;
  const t = dt - DRINK_MS;
  const echo = t < ECHO_MS;
  const e = echo ? t / ECHO_MS : 1;
  const env = echo ? Math.sin(Math.PI * e) : 0;
  // 돌아오기: 유저 쪽(화면 앞)을 본다. 넓은 그물은 곁으로 와서 붙어 앉기(같은 길이·같은 이동량)
  const b = echo ? 0 : clamp01((t - ECHO_MS) / BACK_MS);
  const backEnv = echo ? 0 : Math.sin(Math.PI * b);
  const back: Partial<AnswerPose> = c.net ? { settle: rm ? 0 : 0.05 * backEnv, gy: 0.2 * backEnv } : { gy: 0.12 * backEnv };
  if (rm) {
    const k = clamp01(t / 400) * clamp01((ECHO_MS + BACK_MS - t) / 400);
    const eyes = c.kind === CUE.bright || c.kind === CUE.kin || c.kind === CUE.treat || c.kind === CUE.meal || c.kind === CUE.mealBow || c.kind === CUE.home ? 'joy' : c.kind === CUE.warm || c.kind === CUE.low ? 'sleepy' : c.kind === CUE.unknown ? 'surprised' : 'open';
    const ang = c.kind === CUE.bright ? 14 : c.kind === CUE.low ? -8 : c.kind === CUE.unknown ? 10 : 0;
    return { ...REST, eyeB: eyes, eyeMix: 0.8 * k, combAngle: ang * k };
  }
  let p: AnswerPose = { ...REST, ...back };
  switch (c.kind) {
    case CUE.bright:
      // 통통 두 번 뛰고 눈 ^ ^, 빗 위로(스프링은 기쁨에만)
      p = { ...p, hop: echo ? 0.1 * A * Math.abs(Math.sin(2 * Math.PI * e)) : 0, eyeB: 'joy', eyeMix: echo ? 1 : 1 - b, combAngle: 20 * A * env + 6 * backEnv, combWobble: echo ? 6 * wobble(t, 3, 2) : 0 };
      break;
    case CUE.warm:
      // 눈이 스르르 감기고 숨이 길어지며 번짐이 부드럽게 넓어진다
      p = { ...p, eyeB: 'sleepy', eyeMix: 0.8 * A * (echo ? env : 0.4 * backEnv), tilt: 0.04 * A * Math.sin(Math.PI * e), bleed: 1 + 0.18 * A * env, breathMs: 4800 };
      break;
    case CUE.spiky:
      // 빗이 곧게 서고 고개를 짧게 턴다(놀람 눈)
      p = { ...p, tilt: echo ? 0.08 * A * wobble(t, 4, 3) : 0, eyeB: 'surprised', eyeMix: 0.7 * A * env, combAngle: -6 * A * env, combWobble: echo ? 10 * A * wobble(t, 5, 3) : 0 };
      break;
    case CUE.low:
      // 시선이 아래로, 빗 끝이 부드럽게 늘어지고(−8°까지, 처짐 아님) 번짐이 깊어진다
      p = { ...p, gy: (p.gy ?? 0) + 0.35 * A * env, eyeB: 'sleepy', eyeMix: 0.45 * A * env, combAngle: -8 * A * env, bleed: 1 + 0.22 * A * env };
      break;
    case CUE.nature:
      // 하늘 쪽을 올려다보고 빗이 바람에 흔들린다
      p = { ...p, gy: (p.gy ?? 0) - 0.5 * A * env, gx: 0.2 * A * Math.sin(2 * Math.PI * e), combWobble: 8 * A * Math.sin(2 * Math.PI * 2 * e) };
      break;
    case CUE.home:
      // 오물오물 두 번(작게 끄덕) → 눈 ^ ^. 받침·몸 비율은 그대로
      // 몸은 움직이지 않고 시선만 두 번 끄덕 — 받침 띠의 폭·위치 그대로(QA-3 R9)
      p = { ...p, gy: (p.gy ?? 0) + (echo ? 0.3 * A * Math.abs(Math.sin(2 * Math.PI * e)) : 0), eyeB: 'joy', eyeMix: echo ? e : 1 - b };
      break;
    case CUE.kin:
      // 유저 쪽을 보며 반기는 작은 기울임
      p = { ...p, gy: (p.gy ?? 0) + 0.2 * env, tilt: 0.06 * A * Math.sin(2 * Math.PI * e), eyeB: 'joy', eyeMix: env };
      break;
    case CUE.days:
      // 박자 — 좌우로 네 번 똑딱
      p = { ...p, tilt: 0.05 * A * Math.sign(Math.sin(4 * Math.PI * e)) * env, combAngle: 4 * A * env };
      break;
    case CUE.unknown:
      // 갸웃 한 번, 빗 끝이 물음표처럼 말림
      p = { ...p, tilt: 0.12 * env, combAngle: 10 * env, combWobble: echo ? 6 * wobble(t, 2, 2) : 0, eyeB: 'surprised', eyeMix: 0.4 * env };
      break;
    case CUE.look:
      // 배고픔 낱말: 기쁨 호 없이 제자리에서 유저를 본다(R4-3). 눈은 뜬 그대로
      p = { ...p, gy: (p.gy ?? 0) + 0.15 * env };
      break;
    case CUE.call:
      p = { ...p, tilt: 0.07 * env, eyeB: 'surprised', eyeMix: 0.5 * env, combWobble: echo ? 8 * wobble(t, 3.2, 2.2) : 0 };
      break;
    case CUE.meal:
      // 맑은 먹: 오물오물 두 번 → 유저를 봄(몸 부풂 없음)
      // 1숟갈·2숟갈 반응 크기는 같다(QA-3 R7) — 눈 진폭을 mealBow와 맞춘다
      p = { ...p, gy: (p.gy ?? 0) + (echo ? 0.3 * Math.abs(Math.sin(2 * Math.PI * e)) : 0), eyeB: 'joy', eyeMix: echo ? 1 : 1 - b };
      break;
    case CUE.mealBow:
      // 만족: 눈 기쁨 호 + 꾸벅(배와 무관). 크기는 meal과 같다
      p = { ...p, gy: (p.gy ?? 0) + (echo ? 0.3 * Math.abs(Math.sin(2 * Math.PI * e)) : 0), tilt: echo ? 0.05 * Math.max(0, Math.sin(Math.PI * clamp01((e - 0.5) * 2))) : 0, eyeB: 'joy', eyeMix: echo ? 1 : 1 - b };
      break;
    case CUE.treat:
      // 무늬 먹 조각: 통 한 번 튀고 제자리에서 ^ ^
      p = { ...p, hop: echo ? 0.08 * Math.max(0, Math.sin(Math.PI * clamp01(e * 2))) : 0, eyeB: 'joy', eyeMix: echo ? 1 : 1 - b };
      break;
    default:
      break;
  }
  return p;
}

