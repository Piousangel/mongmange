// 중립형 연령 확인(architecture.md 3-3 ③, 처리방침 4절, DECISIONS D-23·V22 ③). 순수 모듈 — 화면은 CloudSheet.
// - 태어난 해·달을 고르게 하고(기본값 없음, 기준 숫자를 화면에 보이지 않음) 판정은 기기에서 한다.
// - 태어난 해·달은 어디에도 저장하지 않는다. 기기에 남는 것은 '통과: 판 번호·날짜' 또는 '미달: 날짜'뿐.
// - 미달이면 같은 날(기기 현지 날짜) 다시 묻지 않고, 익명 로그인을 하지 않는다 → 서버에 under14가 존재할 수 없다.
import { AGE_GATE_VERSION, type AgeGate } from '@mong/contract';
import type { KV } from '@mong/core';

/** 계정 기능을 쓸 수 있는 만 나이(화면에는 이 숫자를 보이지 않는다) */
export const MIN_AGE = 14;
/** 기기 기록 키: 값 = `pass:<판>:<YYYY-MM-DD>` 또는 `under:<YYYY-MM-DD>` */
export const AGE_KEY = 'mong.cloud.age';
/** 고를 수 있는 가장 이른 해 */
export const MIN_BIRTH_YEAR = 1900;

export type AgeInput = { year: number | null; month: number | null };
export type AgeVerdict = 'pass' | 'under';
export type AgeInputError = 'incomplete' | 'range';

/** 기기 현지 날짜(YYYY-MM-DD). tzOffsetMin = 동쪽 + 분(서울 540) */
export function localDate(at: number, tzOffsetMin: number): string {
  return new Date(at + tzOffsetMin * 60_000).toISOString().slice(0, 10);
}

/** 입력 검사: 빈 칸·범위 밖(미래 달 포함) */
export function checkAgeInput(input: AgeInput, at: number, tzOffsetMin: number): AgeInputError | null {
  const { year, month } = input;
  if (year === null || month === null) return 'incomplete';
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return 'range';
  const [ty, tm] = localDate(at, tzOffsetMin).split('-').map(Number) as [number, number];
  if (year < MIN_BIRTH_YEAR || year > ty || (year === ty && month > tm)) return 'range';
  return null;
}

/**
 * 만 나이 판정. 날짜의 일은 묻지 않으므로 **태어난 달이 이번 달이면 아직 생일 전으로 본다**(보수적, C12 리뷰 M2·PM 11-25):
 * 이번 달이 생일인 만 14세는 다음 달까지 기다리지만, 만 13세가 통과하는 경계는 없다. 입력이 틀리면 null(판정하지 않음).
 */
export function judgeAge(input: AgeInput, at: number, tzOffsetMin: number): AgeVerdict | null {
  if (checkAgeInput(input, at, tzOffsetMin) !== null) return null;
  const [ty, tm] = localDate(at, tzOffsetMin).split('-').map(Number) as [number, number];
  const age = ty - input.year! - (tm <= input.month! ? 1 : 0);
  return age >= MIN_AGE ? 'pass' : 'under';
}

/** 지금 연령 확인을 다시 물을 수 있나: 미달 기록이 오늘 날짜면 묻지 않는다 */
export type AgeStatus = { kind: 'ask' } | { kind: 'passed'; gate: AgeGate } | { kind: 'wait' };

function readRaw(kv: KV): string | undefined {
  try {
    return kv.getString(AGE_KEY);
  } catch {
    return undefined;
  }
}

/**
 * 계정이 생기기 직전마다 부른다. 통과 기록이 지금 판이면 다시 묻지 않는다(판이 바뀌면 다시 묻는다).
 * 기록이 깨졌으면 묻는다(안전 쪽).
 */
export function ageStatus(kv: KV, at: number, tzOffsetMin: number): AgeStatus {
  const raw = readRaw(kv);
  if (!raw) return { kind: 'ask' };
  const pass = /^pass:(\d{1,3}):\d{4}-\d{2}-\d{2}$/.exec(raw);
  if (pass) return Number(pass[1]) === AGE_GATE_VERSION ? { kind: 'passed', gate: { v: AGE_GATE_VERSION, ok: true } } : { kind: 'ask' };
  const under = /^under:(\d{4}-\d{2}-\d{2})$/.exec(raw);
  if (under) return under[1] === localDate(at, tzOffsetMin) ? { kind: 'wait' } : { kind: 'ask' };
  return { kind: 'ask' };
}

/**
 * 판정 결과를 기기에 남긴다(해·달은 받지도 남기지도 않는다 — 인자에 없다). 저장 실패는 던지지 않는다:
 * 통과를 못 남기면 다음에 다시 묻고, 미달을 못 남기면 같은 날 다시 물을 수 있을 뿐이다.
 */
export function recordAge(kv: KV, verdict: AgeVerdict, at: number, tzOffsetMin: number): void {
  const d = localDate(at, tzOffsetMin);
  try {
    kv.set(AGE_KEY, verdict === 'pass' ? `pass:${AGE_GATE_VERSION}:${d}` : `under:${d}`);
  } catch {
    /* 기록 실패 — 위 설명 */
  }
}

/** 서버에 보낼 값: 통과일 때만 만들 수 있다(미달 값은 타입에 칸이 없다) */
export function passGate(): AgeGate {
  return { v: AGE_GATE_VERSION, ok: true };
}
