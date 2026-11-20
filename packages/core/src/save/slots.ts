// 세이브 슬롯(D-04·D-13): 키-값 저장소 위에 sim 세이브 봉투를 쓰고 읽는다. 저장소 구현(MMKV·localStorage)은 앱이 넘긴다.
// 규칙(11-20 앱 흐름 리뷰 반영)
// ① 쓰기 전 검증: 직렬화한 문자열을 다시 parseState로 읽어 본다. 실패하면 아무것도 쓰지 않는다.
// ② 저장소 예외(디스크 가득·권한)는 던지지 않고 { ok:false } 로 돌려준다. 앱은 메모리 상태로 계속 간다.
// ③ 백업 = '어제의 몽망이': 매 쓰기가 아니라 하루 한 번(깸 직후 등, 호출자가 rotateBackup으로 알림) 직전 본을 민다.
// ④ 읽기는 본 → 백업 순. 깨진 본 원문은 corrupt 키에 최근 2개까지 남긴다(D-03: 몽망이를 잃지 않게).
// ⑤ 옛 버전 본을 읽을 때(마이그레이션 전) 원문을 pre-v<N> 키에 한 번 보존한다.
// 6. 이 앱보다 새 버전 본(옛 빌드로 내려감)은 읽지도 덮어쓰지도 않는다: futureVersion을 돌려주고, writeSave도 거부한다(리뷰 M-5).
import { SCHEMA_VERSION, isFutureSaveError } from './envelope';
import { SIM_SCHEMA_VERSION } from '../sim/reduce';
import { parseState, serializeState } from '../sim/save';
import type { Millis, State } from '../sim/types';

export interface KV {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const SAVE_KEYS = {
  main: 'mong.save.main',
  backup: 'mong.save.backup',
  corrupt: 'mong.save.corrupt',
  corruptPrev: 'mong.save.corrupt.1',
  /** 마이그레이션 전 원문: `${preMigration}<봉투버전>.<sim버전>` */
  preMigration: 'mong.save.pre-v',
} as const;

export type WriteResult = { ok: true; bytes: number; rotated: boolean } | { ok: false; error: string };

export interface WriteOptions {
  /** 직전 본을 백업으로 민다(하루 한 번). 백업이 아직 없으면 언제든 민다 */
  rotateBackup?: boolean;
}

const msg = (e: unknown) => String((e as Error)?.message ?? e);

function safeGet(kv: KV, k: string): string | undefined {
  try {
    return kv.getString(k);
  } catch {
    return undefined;
  }
}

function isReadable(json: string | undefined): json is string {
  if (!json) return false;
  try {
    parseState(json);
    return true;
  } catch {
    return false;
  }
}

/** 검증 → (하루 한 번) 직전 본을 백업으로 → 새 본. 어떤 실패도 던지지 않는다 */
export function writeSave(kv: KV, state: State, savedAt: Millis, opts: WriteOptions = {}): WriteResult {
  const cur = safeGet(kv, SAVE_KEYS.main);
  if (cur !== undefined && isFuture(cur)) return { ok: false, error: 'future: 새 버전 세이브를 덮어쓰지 않는다' };
  let json: string;
  try {
    json = serializeState(state, savedAt);
    parseState(json);
  } catch (e) {
    return { ok: false, error: `검증: ${msg(e)}` };
  }
  let rotated = false;
  try {
    const wantRotate = opts.rotateBackup || safeGet(kv, SAVE_KEYS.backup) === undefined;
    if (wantRotate) {
      const prev = safeGet(kv, SAVE_KEYS.main);
      if (prev !== undefined && prev !== json && isReadable(prev)) {
        kv.set(SAVE_KEYS.backup, prev);
        rotated = true;
      }
    }
    kv.set(SAVE_KEYS.main, json);
  } catch (e) {
    return { ok: false, error: `io: ${msg(e)}` };
  }
  return { ok: true, bytes: json.length, rotated };
}

export interface ReadResult {
  state: State | null;
  source: 'main' | 'backup' | 'none';
  /** 본이 있었는데 못 읽었을 때의 이유 */
  error?: string;
  /** 본 또는 백업이 있었는가(있었는데 둘 다 못 읽으면 복구 안내 대상) */
  hadSave: boolean;
  /** 본이 이 앱보다 새 버전(옛 빌드로 내려감). 앱은 설치·저장하지 말고 업데이트를 안내한다 */
  futureVersion?: boolean;
}

/** 원문의 봉투·sim 버전이 이 앱보다 새것인가 */
export function isFuture(json: string): boolean {
  const v = versionsOf(json);
  return (typeof v.env === 'number' && v.env > SCHEMA_VERSION) || (typeof v.sim === 'number' && v.sim > SIM_SCHEMA_VERSION);
}

function versionsOf(json: string): { env: unknown; sim: unknown } {
  try {
    const o = JSON.parse(json) as { schemaVersion?: unknown; sim?: { version?: unknown } };
    return { env: o.schemaVersion, sim: o.sim?.version };
  } catch {
    return { env: undefined, sim: undefined };
  }
}

function keepCorrupt(kv: KV, raw: string) {
  try {
    const cur = safeGet(kv, SAVE_KEYS.corrupt);
    if (cur === raw) return;
    if (cur !== undefined) kv.set(SAVE_KEYS.corruptPrev, cur);
    kv.set(SAVE_KEYS.corrupt, raw);
  } catch {
    /* 보존 실패는 읽기를 막지 않는다 */
  }
}

/** 옛 버전 본이면 마이그레이션 전에 원문을 한 번 남긴다(파싱이 안 되는 원문은 corrupt 쪽이 맡는다) */
function keepPreMigration(kv: KV, raw: string) {
  const v = versionsOf(raw);
  if (v.env === undefined || isFuture(raw)) return;
  if (v.env === SCHEMA_VERSION && v.sim === SIM_SCHEMA_VERSION) return;
  const key = `${SAVE_KEYS.preMigration}${String(v.env)}.${String(v.sim ?? 'none')}`;
  try {
    if (safeGet(kv, key) === undefined) kv.set(key, raw);
  } catch {
    /* 무시 */
  }
}

/** 본 → 백업 순서로 복원. parseState가 콜드 스타트 규칙(savedAt에 백그라운드)을 적용한다 */
export function readSave(kv: KV): ReadResult {
  const main = safeGet(kv, SAVE_KEYS.main);
  const backup = safeGet(kv, SAVE_KEYS.backup);
  const hadSave = main !== undefined || backup !== undefined;
  let error: string | undefined;
  if (main !== undefined) {
    // 새 버전 본: 백업(옛 본)으로 이어 가면 다음 저장에서 새 본을 잃는다 → 아무것도 읽지 않고 그대로 둔다
    if (isFuture(main)) return { state: null, source: 'none', error: 'future', hadSave, futureVersion: true };
    keepPreMigration(kv, main);
    try {
      return { state: parseState(main), source: 'main', hadSave };
    } catch (e) {
      if (isFutureSaveError(e)) return { state: null, source: 'none', error: msg(e), hadSave, futureVersion: true };
      error = msg(e);
      keepCorrupt(kv, main);
    }
  }
  if (backup !== undefined) {
    try {
      return { state: parseState(backup), source: 'backup', error, hadSave };
    } catch {
      /* 백업도 깨짐 */
    }
  }
  return { state: null, source: 'none', error, hadSave };
}

/** 마이그레이션 전 원문 키 후보(KV에 목록 기능이 없어 알려진 버전 조합을 다 적는다) */
export function preMigrationKeys(): string[] {
  const out: string[] = [];
  for (let e = 1; e <= SCHEMA_VERSION; e++) for (const sv of ['none', ...Array.from({ length: SIM_SCHEMA_VERSION }, (_, i) => String(i + 1))]) out.push(`${SAVE_KEYS.preMigration}${e}.${sv}`);
  return out;
}

/** 세이브 초기화(개발 메뉴). 보존 원문(깨진 본·마이그레이션 전 원문)도 지운다 */
export function clearSave(kv: KV): void {
  for (const k of [SAVE_KEYS.main, SAVE_KEYS.backup, SAVE_KEYS.corrupt, SAVE_KEYS.corruptPrev, ...preMigrationKeys()]) {
    try {
      kv.remove(k);
    } catch {
      /* 무시 */
    }
  }
}
