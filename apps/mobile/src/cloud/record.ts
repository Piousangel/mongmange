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
  /** 맡겨 두기를 켠(되찾은) 로그인의 sub(B2b 리뷰 H1). 서버가 '그 로그인에 사용자 없음'이라 할 때 지금 sub와 같아야만 지워짐·끝남을 확정한다 */
  sub: string | null;
  /**
   * 마지막으로 맞춘 서버 본의 형태(V27b): v2 = 옛 세이브, v3 = 새 컨셉 본문. 없으면(V27b 전 기록) v2로 본다.
   * 이 기기가 도는 판과 다르면 If-Match로 덮지 않고 나란히 고르기를 거친다(서버의 옛 v2 본을 말없이 덮지 않게).
   */
  form: 'v2' | 'v3' | null;
}

export const FRESH_RECORD: CloudRecord = { v: 1, state: 'on', rev: null, sha: null, syncedAt: null, codeConfirmed: false, conflict: false, held: null, creature: null, deleteTries: 0, sub: null, form: null };

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
    const sub = typeof o.sub === 'string' ? o.sub : null;
    const form = o.form === 'v2' || o.form === 'v3' ? o.form : null;
    return { v: 1, state: o.state, rev: o.rev ?? null, sha: o.sha ?? null, syncedAt: o.syncedAt ?? null, codeConfirmed: o.codeConfirmed === true, conflict: o.conflict === true, held, creature, deleteTries, sub, form };
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
/** 이 기간(일)이 지나면 '만료됨'으로 표시만 한다(재리뷰 5 V4·V5 PM 결정: 기기 칸은 자동으로 지우지 않는다 — 시계 조작 경로 0). 비우기는 사용자가 직접 */
export const PRE_RESTORE_DAYS = 30;

export interface PreRestore {
  /** 바꾼 시각(ms) */
  at: number;
  /** 바꾸기 직전 이 기기 세이브 원문 그대로 */
  raw: string;
  /** 30일이 지났다(표시용 — 지우지 않는다) */
  expired: boolean;
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
    return { at: o.at, raw: o.raw, expired: !live(o.at, now, PRE_RESTORE_DAYS) };
  } catch {
    return null;
  }
}

/** 복원 한 번에 한 번 쓴다. 쓰고 다시 읽어 확인하지 못하면 false(그러면 바꾸지 않는다) */
export function keepPreRestore(kv: KV, raw: string, at: number): boolean {
  try {
    const v = JSON.stringify({ at, raw });
    kv.set(PRE_RESTORE_KEY, v);
    return kv.getString(PRE_RESTORE_KEY) === v;
  } catch {
    return false;
  }
}

/** 사용자가 '이 칸 비우기'로 직접 비울 때만 부른다(자동 삭제 없음) */
export function dropPreRestore(kv: KV): boolean {
  try {
    kv.remove(PRE_RESTORE_KEY);
    return kv.getString(PRE_RESTORE_KEY) === undefined;
  } catch {
    return false;
  }
}

// ── 다시 고를 수 있게 둔 되찾은 본(parked, 리뷰 재리뷰 2 M-b·M-d, 재리뷰 3 Q1) ──
// 나란히 고르기에서 '이 기기'를 골라 밀려난 서버 본(되찾기·has_creature 맥락)을 **기기 안에** 30일 둔다.
// 서버 conflict 칸은 최대 3벌이라 30일 전에 밀려날 수 있으므로, 30일 약속은 기기 사본으로 지킨다(서버 칸은 덤).
// 칸은 PARKED_SLOTS개. 새로 둘 때 앞선 본을 **덮지 않는다** — 다 찼으면 'full'을 돌려주고 고르기 자체를 멈춘다(말없이 사라지는 경로 0).
// **자동으로 지우지 않는다**(재리뷰 5 V4·V5 PM 결정): 30일이 지나면 '만료됨'으로 표시만 하고, 비우기는 사용자가 '이 칸 비우기'로 직접 한다.
// 그래서 시계를 어떻게 돌려도 칸이 사라지지 않는다. 앱을 지우면 기기 칸도 함께 사라진다(문구가 알린다).
export const PARKED_KEY = 'mong.cloud.parked';
export const PARKED_DAYS = 30;
export const PARKED_SLOTS = 3;

export interface Parked {
  id: string;
  at: number;
  raw: string;
}
/** 읽을 때 붙이는 표시: 30일이 지났다(지우지 않는다) */
export type ParkedView = Parked & { expired: boolean };

const live = (at: number, now: number, days: number) => now - at <= days * 86_400_000;

/** 저장된 칸 전부(기한 무관). 옛 한 칸 형식({at, raw})도 읽는다 */
function readAllParked(kv: KV): Parked[] {
  try {
    const s = kv.getString(PARKED_KEY);
    if (!s) return [];
    const o = JSON.parse(s) as unknown;
    const arr = Array.isArray(o) ? o : [o];
    return arr.flatMap((x, n) => {
      const e = x as Partial<Parked>;
      if (typeof e.at !== 'number' || typeof e.raw !== 'string') return [];
      return [{ id: typeof e.id === 'string' ? e.id : `p${e.at}-${n}`, at: e.at, raw: e.raw }];
    });
  } catch {
    return [];
  }
}

function writeAllParked(kv: KV, list: Parked[]): boolean {
  try {
    if (list.length === 0) {
      kv.remove(PARKED_KEY);
      return kv.getString(PARKED_KEY) === undefined;
    }
    const v = JSON.stringify(list);
    kv.set(PARKED_KEY, v);
    return kv.getString(PARKED_KEY) === v;
  } catch {
    return false;
  }
}

/** 모든 칸(최근 것이 앞), 30일이 지난 칸은 expired 표시 */
export function readParkedList(kv: KV, now: number): ParkedView[] {
  return readAllParked(kv)
    .map((p) => ({ ...p, expired: !live(p.at, now, PARKED_DAYS) }))
    .sort((a, b) => b.at - a.at);
}
export function readParkedOne(kv: KV, id: string, now: number): ParkedView | null {
  return readParkedList(kv, now).find((p) => p.id === id) ?? null;
}

/** 새 칸에 둔다. 같은 원문이 이미 있으면 그대로 ok, 칸이 다 찼으면 'full'(아무것도 쓰지 않음), 쓰기 실패면 'io' */
export function addParked(kv: KV, raw: string, now: number): 'ok' | 'full' | 'io' {
  // 만료된 칸도 칸을 차지한다(지우는 길은 사용자의 '이 칸 비우기' 하나뿐)
  const all = readAllParked(kv);
  if (all.some((p) => p.raw === raw)) return 'ok';
  if (all.length >= PARKED_SLOTS) return 'full';
  let id = `p${now}`;
  for (let n = 1; all.some((p) => p.id === id); n++) id = `p${now}-${n}`;
  return writeAllParked(kv, [{ id, at: now, raw }, ...all]) ? 'ok' : 'io';
}

/** 한 칸의 원문을 바꾼다(맞바꾸기). raw=null이면 그 칸을 비운다 */
export function setParked(kv: KV, id: string, raw: string | null, at: number): boolean {
  const all = readAllParked(kv);
  const next = raw === null ? all.filter((p) => p.id !== id) : all.map((p): Parked => (p.id === id ? { id, at, raw } : p));
  return writeAllParked(kv, next);
}

// ── 서버에서 만난 옛 세이브(v2) 보관함(V27b) ──
// 새 컨셉(v3)으로 도는 기기가 서버에서 옛 세이브(v2) 본을 만나면 그 본은 이어 갈 수 없다(새 컨셉은 1일차부터 — 이 기기의 옛 세이브도
// mong.v3.archive.v2에 보관만 한다). 사용자가 '이 기기' 몽망이를 맡기기로 고르면, 서버 본을 덮기 **전에** 그 원문을 이 보관함에 둔다.
// 보관함은 **덮지 않고 자동으로 지우지 않는다**(만료 표시도 없음 — 옛 판 보관이지 다시 고를 칸이 아니다). 같은 원문은 한 번만.
// 칸은 CLOUD_V2_ARCHIVE_SLOTS개, 다 차면 'full'(아무것도 쓰지 않음 → 고르기를 멈춘다). 서버로 보내지 않는다.
export const CLOUD_V2_ARCHIVE_KEY = 'mong.v3.archive.cloudV2';
export const CLOUD_V2_ARCHIVE_SLOTS = 3;

export function readCloudV2Archive(kv: KV): { at: number; raw: string }[] {
  try {
    const s = kv.getString(CLOUD_V2_ARCHIVE_KEY);
    if (!s) return [];
    const o = JSON.parse(s) as unknown;
    return Array.isArray(o) ? o.filter((x): x is { at: number; raw: string } => typeof x?.at === 'number' && typeof x?.raw === 'string') : [];
  } catch {
    return [];
  }
}

/** 옛 세이브 본 보관. 같은 원문이 보관함(또는 이 기기 옛 세이브 보관 키 alsoKeys)에 이미 있으면 ok, 다 찼으면 full, 쓰기 실패면 io */
export function archiveCloudV2(kv: KV, raw: string, at: number, alsoKeys: readonly string[] = []): 'ok' | 'full' | 'io' {
  const all = readCloudV2Archive(kv);
  try {
    if (all.some((x) => x.raw === raw) || alsoKeys.some((k) => kv.getString(k) === raw)) return 'ok';
  } catch {
    return 'io';
  }
  if (all.length >= CLOUD_V2_ARCHIVE_SLOTS) return 'full';
  try {
    const v = JSON.stringify([...all, { at, raw }]);
    kv.set(CLOUD_V2_ARCHIVE_KEY, v);
    return kv.getString(CLOUD_V2_ARCHIVE_KEY) === v ? 'ok' : 'io';
  } catch {
    return 'io';
  }
}

// ── 확인하지 못한 지우기(리뷰 재리뷰 2 M-a) ──
// 지우기 결과를 몇 번 확인해도 모를 때 사용자가 '이 기기에서 맡겨 두기 끄기'를 고르면 남긴다.
// 소개 화면이 '서버에 남았을 수 있어요'와 다시 지우기 길을 보인다. 인장 코드는 공개 값(웹 /delete에 글귀와 함께 씀).
export const UNCONFIRMED_DELETE_KEY = 'mong.cloud.unconfirmedDelete';
/** 이만큼 확인해도 모르면 '이 기기에서 끄기' 출구를 연다 */
export const DELETE_TRIES_BEFORE_EXIT = 2;

/** abandoned = 옛 로그인을 이미 버렸다('두고 새로 시작'·'안내 닫기' — 재리뷰 4 S1·S2). 그 뒤로는 앱에서 지울 수 없고 웹 삭제 안내만 남는다 */
/** reason: delete = 지우기를 확인하지 못함, orphan = 기기 기록의 로그인과 지금 로그인이 달라 서버에 남은 맡겨 두기에 닿을 수 없음(백업 복원 폰 — B2b 리뷰 H1). sub = 그 로그인 */
export type UnconfirmedDelete = { creature: string | null; at: number; abandoned: boolean; reason: 'delete' | 'orphan'; sub: string | null };

export function readUnconfirmedDelete(kv: KV): UnconfirmedDelete | null {
  try {
    const s = kv.getString(UNCONFIRMED_DELETE_KEY);
    if (!s) return null;
    const o = JSON.parse(s) as { creature?: unknown; at?: unknown; abandoned?: unknown; reason?: unknown; sub?: unknown };
    if (typeof o.at !== 'number') return null;
    return { creature: typeof o.creature === 'string' ? o.creature : null, at: o.at, abandoned: o.abandoned === true, reason: o.reason === 'orphan' ? 'orphan' : 'delete', sub: typeof o.sub === 'string' ? o.sub : null };
  } catch {
    return null;
  }
}
export function markUnconfirmedDelete(kv: KV, creature: string | null, at: number, abandoned = false, extra: { reason?: 'delete' | 'orphan'; sub?: string | null } = {}): boolean {
  try {
    kv.set(UNCONFIRMED_DELETE_KEY, JSON.stringify({ creature, at, abandoned, reason: extra.reason ?? 'delete', sub: extra.sub ?? null }));
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
