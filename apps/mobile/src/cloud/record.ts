// 맡겨 두기 기기 기록(기기 안 키 하나, 타입 모델). 세션 토큰·글귀 평문은 여기에 두지 않는다(토큰은 C11 세션 저장소, 글귀는 화면 메모리에만).
// 이 기록이 앱이 꺼졌다 켜져도 '데이터 유실 0'을 지키는 장치다:
//  - conflict: 서버에 다른 본이 있다 → 고르기 전까지 올리기를 멈춘다(자동으로 덮어쓰지 않음)
//  - codeConfirmed=false: 글귀를 받는 도중 끊겼다 → 켜짐 화면이 '새 글귀 받기'를 먼저 보인다
//  - state 'deleting': 지우기 요청을 보내기 직전에 남긴다 → 끊기거나 꺼져도 다시 열면 '지웠는지 확인'부터 한다(리뷰 H2)
import type { KV } from '@mong/core';

export const CLOUD_KEY = 'mong.cloud.v1';

export type Held = 'tooLarge' | 'quota' | 'shape';
export type RecordState = 'on' | 'moved' | 'deleting';

export interface CloudRecord {
  v: 1;
  /** on = 켜짐, moved = 다른 기기로 옮겨 감(410), deleting = 지우기 요청 중·결과 미확인 */
  state: RecordState;
  /** 마지막으로 맞춘 서버 rev·sha(null = 아직 올린 적 없음) */
  rev: number | null;
  sha: string | null;
  /** 마지막으로 맡긴 시각(ms) */
  syncedAt: number | null;
  codeConfirmed: boolean;
  conflict: boolean;
  /** 조용히 보류한 까닭(크기 상한·오늘 몫·업로드 모양 검사) */
  held: Held | null;
  /** 인장 코드(공개 링크 키 — 비밀 아님). 지우기 확인에서 끝 네 자를 직접 쳐서 확인한다 */
  creature: string | null;
  /** 지우기 결과를 확인하지 못한 횟수(리뷰 재리뷰 2 M-a: 몇 번 뒤 '이 기기에서 끄기' 출구를 연다) */
  deleteTries: number;
}

export const FRESH_RECORD: CloudRecord = { v: 1, state: 'on', rev: null, sha: null, syncedAt: null, codeConfirmed: false, conflict: false, held: null, creature: null, deleteTries: 0 };

const isNumOrNull = (x: unknown) => x === null || (typeof x === 'number' && Number.isFinite(x));

/** 읽기: 깨진 기록은 '켜짐 + 충돌'로 읽는다 — 무엇이 서버에 있는지 모를 때는 덮어쓰지 않고 나란히 보게 한다 */
export function readRecord(kv: KV): CloudRecord | null {
  let raw: string | undefined;
  try {
    raw = kv.getString(CLOUD_KEY);
  } catch {
    return null;
  }
  if (raw === undefined) return null;
  try {
    const o = JSON.parse(raw) as Partial<CloudRecord>;
    if (o.v !== 1 || (o.state !== 'on' && o.state !== 'moved' && o.state !== 'deleting')) throw new Error('모양');
    if (!isNumOrNull(o.rev) || !isNumOrNull(o.syncedAt) || !(o.sha === null || typeof o.sha === 'string')) throw new Error('모양');
    const held = o.held === 'tooLarge' || o.held === 'quota' || o.held === 'shape' ? o.held : null;
    const creature = typeof o.creature === 'string' ? o.creature : null;
    const deleteTries = typeof o.deleteTries === 'number' && o.deleteTries >= 0 ? o.deleteTries : 0;
    return { v: 1, state: o.state, rev: o.rev ?? null, sha: o.sha ?? null, syncedAt: o.syncedAt ?? null, codeConfirmed: o.codeConfirmed === true, conflict: o.conflict === true, held, creature, deleteTries };
  } catch {
    return { ...FRESH_RECORD, conflict: true };
  }
}

export function writeRecord(kv: KV, rec: CloudRecord | null): boolean {
  try {
    if (rec === null) kv.remove(CLOUD_KEY);
    else kv.set(CLOUD_KEY, JSON.stringify(rec));
    return true;
  } catch {
    return false;
  }
}

// ── 바꾸기 전 본(preRestore, 리뷰 H1) ──
// 서버 본으로 바꿀 때 한 번만 쓰는 칸. 키는 세이브 슬롯(mong.save.*)과 분리되어 있어 깸 정산·백업 회전이 닿지 않는다.
// 쓰는 길은 keepPreRestore 하나뿐(tasks.ts takeServer), 지우는 길은 되돌리기 성공뿐(기한이 지나면 읽히지 않는다).

export const PRE_RESTORE_KEY = 'mong.cloud.preRestore';
/** 되돌릴 수 있는 기간(일) — 서버 conflict 칸과 같은 30일 */
export const PRE_RESTORE_DAYS = 30;

export interface PreRestore {
  /** 바꾼 시각(ms) */
  at: number;
  /** 바꾸기 직전 이 기기 세이브 원문 그대로 */
  raw: string;
}

export function readPreRestore(kv: KV, now: number): PreRestore | null {
  let s: string | undefined;
  try {
    s = kv.getString(PRE_RESTORE_KEY);
  } catch {
    return null;
  }
  if (!s) return null;
  try {
    const o = JSON.parse(s) as Partial<PreRestore>;
    if (typeof o.at !== 'number' || typeof o.raw !== 'string') return null;
    if (now - o.at > PRE_RESTORE_DAYS * 86_400_000) return null;
    return { at: o.at, raw: o.raw };
  } catch {
    return null;
  }
}

/** 복원 한 번에 한 번 쓴다. 쓰고 다시 읽어 확인하지 못하면 false(그러면 바꾸지 않는다) */
export function keepPreRestore(kv: KV, raw: string, at: number): boolean {
  try {
    const v = JSON.stringify({ at, raw } satisfies PreRestore);
    kv.set(PRE_RESTORE_KEY, v);
    return kv.getString(PRE_RESTORE_KEY) === v;
  } catch {
    return false;
  }
}

export function dropPreRestore(kv: KV): void {
  try {
    kv.remove(PRE_RESTORE_KEY);
  } catch {
    /* 기한이 지나면 읽히지 않는다 */
  }
}

// ── 다시 고를 수 있게 둔 되찾은 본(parked, 리뷰 재리뷰 2 M-b·M-d) ──
// 나란히 고르기에서 '이 기기'를 골라 밀려난 서버 본(되찾기·has_creature 맥락)을 **기기 안에** 30일 둔다.
// 서버 conflict 칸은 최대 3벌이라 30일 전에 밀려날 수 있으므로, 30일 약속은 기기 사본으로 지킨다(서버 칸은 덤).
export const PARKED_KEY = 'mong.cloud.parked';
export const PARKED_DAYS = 30;

export interface Parked {
  at: number;
  raw: string;
}

export function readParked(kv: KV, now: number): Parked | null {
  try {
    const s = kv.getString(PARKED_KEY);
    if (!s) return null;
    const o = JSON.parse(s) as Partial<Parked>;
    if (typeof o.at !== 'number' || typeof o.raw !== 'string') return null;
    return now - o.at <= PARKED_DAYS * 86_400_000 ? { at: o.at, raw: o.raw } : null;
  } catch {
    return null;
  }
}
export function keepParked(kv: KV, raw: string, at: number): boolean {
  try {
    const v = JSON.stringify({ at, raw } satisfies Parked);
    kv.set(PARKED_KEY, v);
    return kv.getString(PARKED_KEY) === v;
  } catch {
    return false;
  }
}
export function dropParked(kv: KV): void {
  try {
    kv.remove(PARKED_KEY);
  } catch {
    /* 기한이 지나면 읽히지 않는다 */
  }
}

// ── 확인하지 못한 지우기(리뷰 재리뷰 2 M-a) ──
// 지우기 결과를 몇 번 확인해도 모를 때 사용자가 '이 기기에서 맡겨 두기 끄기'를 고르면 남긴다.
// 소개 화면이 '서버에 남았을 수 있어요'와 다시 지우기 길을 보인다. 인장 코드는 공개 값(웹 /delete에 글귀와 함께 씀).
export const UNCONFIRMED_DELETE_KEY = 'mong.cloud.unconfirmedDelete';
/** 이만큼 확인해도 모르면 '이 기기에서 끄기' 출구를 연다 */
export const DELETE_TRIES_BEFORE_EXIT = 2;

export function readUnconfirmedDelete(kv: KV): { creature: string | null; at: number } | null {
  try {
    const s = kv.getString(UNCONFIRMED_DELETE_KEY);
    if (!s) return null;
    const o = JSON.parse(s) as { creature?: unknown; at?: unknown };
    return typeof o.at === 'number' ? { creature: typeof o.creature === 'string' ? o.creature : null, at: o.at } : null;
  } catch {
    return null;
  }
}
export function markUnconfirmedDelete(kv: KV, creature: string | null, at: number): boolean {
  try {
    kv.set(UNCONFIRMED_DELETE_KEY, JSON.stringify({ creature, at }));
    return true;
  } catch {
    return false;
  }
}
export function clearUnconfirmedDelete(kv: KV): void {
  try {
    kv.remove(UNCONFIRMED_DELETE_KEY);
  } catch {
    /* 무시 */
  }
}

// ── 되찾기 진행 중 표시(리뷰 R1) ──
// recover를 부르기 직전에 남기고, 결과가 정해지면 지운다. target = 사용자가 함께 넣은 인장 코드(모르면 null).
// 409 has_creature가 났을 때 이 로그인의 몽망이 인장 코드가 target과 같을 때만 '이미 되찾음'으로 본다. 글귀 평문은 남기지 않는다.
export const RECOVERING_KEY = 'mong.cloud.recovering';

export function markRecovering(kv: KV, target: string | null, at: number): void {
  try {
    kv.set(RECOVERING_KEY, JSON.stringify({ target, at }));
  } catch {
    /* 표시를 못 남기면 has_creature는 언제나 나란히 고르기로 간다(안전 쪽) */
  }
}
export function readRecovering(kv: KV): { target: string | null; at: number } | null {
  try {
    const s = kv.getString(RECOVERING_KEY);
    if (!s) return null;
    const o = JSON.parse(s) as { target?: unknown; at?: unknown };
    return typeof o.at === 'number' ? { target: typeof o.target === 'string' ? o.target : null, at: o.at } : null;
  } catch {
    return null;
  }
}
export function clearRecovering(kv: KV): void {
  try {
    kv.remove(RECOVERING_KEY);
  } catch {
    /* 무시 */
  }
}
