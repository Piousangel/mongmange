// 맡겨 두기 작업(상태 기계 model.ts의 busy 보기에서 하나씩 돈다). 작업은 결과 하나(TaskResult)를 돌려주고 던지지 않는다.
// 데이터 유실 0 규칙(architecture 3-3·3-4·3-4-1):
//  - 모든 작업은 다시 돌려도 안전하다(bootstrap 멱등, 같은 sha 빨리 감기, 글귀 재발급은 아직 보여 주지 않은 글귀만 무효).
//  - 반쯤 성공(서버는 커밋, 응답은 끊김): 409의 server.sha == 내 본 sha면 성공으로 본다.
//  - 409(다른 본)는 고르지 않는다 → 기록에 conflict를 남기고 나란히 고르기로.
//  - 서버 본으로 바꿀 때: ① 고른 그 본인지(rev·sha) 다시 확인 ② 이 기기 본을 서버 conflict 칸(30일)에 먼저 올리고
//    ③ 바꾸기 직전에 기기 본을 다시 읽어 그 사이 바뀌었으면 멈추고 다시 나란히(리뷰 M3) ④ 기기 preRestore 칸에 한 번 남긴 뒤
//    ⑤ 바꾼다. ①~④ 중 하나라도 실패하면 기기 본은 그대로다.
//  - 되찾기 409 has_creature(앞선 되찾기가 커밋된 뒤 응답이 끊긴 경우 등)는 **아무것도 지우지 않는다**: 서버 현재 본을 읽어
//    이 기기 본과 같으면 '이미 되찾음', 다르면 나란히 고르기(리뷰 C1). DELETE /me는 지우기 작업 하나에서만 부른다.
//  - 지우기: 요청 전에 기록을 'deleting'으로 남기고, 끊김·401·404면 서버에 다시 물어 지워졌는지 확인한다(리뷰 H2).
//  - 410(다른 기기로 옮겨 감)이면 세션을 비우고 로컬 게임은 그대로 이어 간다.
import { isFuture, sim, type KV } from '@mong/core';
import { passGate } from './ageGate';
import { readToken, subOf, type ApiResult, type CloudApi, type CloudAuth, type Failure } from './api';
import type { ChooseNote, SaveSide, ServerPick, Task, TaskResult, Why } from './model';
import { clearRecovering, clearUnconfirmedDelete, dropPreRestore, FRESH_RECORD, PARKED_SLOTS, addParked, keepPreRestore, markRecovering, markUnconfirmedDelete, readParkedList, readParkedOne, setParked, readPreRestore, readRecord, readRecovering, readUnconfirmedDelete, writeRecord, type CloudRecord } from './record';

export interface LocalSave {
  /** 기기에 저장된 본 원문(core SAVE_KEYS.main 그대로 — 같은 본이면 같은 sha). 없으면 null */
  raw(): string | null;
  /** 서버 본으로 이어 간다: 기기 본 교체 + 홈 다시 그리기. 실패하면 false(기기 본은 그대로) */
  adopt(state: sim.State): boolean;
}

export interface TaskDeps {
  api: CloudApi;
  auth: CloudAuth;
  kv: KV;
  local: LocalSave;
  /** 본문(UTF-8) SHA-256 소문자 16진 — 서버 sha와 같은 계산 */
  sha256(s: string): Promise<string>;
  now(): number;
}

const fail = (failure: Failure): TaskResult => ({ r: 'failed', failure });

/** 업로드 모양 검사(DECISIONS V22 ①·heart-grain 9-2 R7): 세이브 안의 `word`는 날마다 {attachStroke, sense}만. 어긋나면 올리지 않는다(닫힌 쪽으로 실패) */
export const WORD_FIELDS: readonly string[] = ['attachStroke', 'sense'];
export function uploadShapeOk(body: string): boolean {
  let root: unknown;
  try {
    root = JSON.parse(body);
  } catch {
    return false;
  }
  const okWord = (w: unknown) => typeof w === 'object' && w !== null && !Array.isArray(w) && Object.keys(w).every((k) => WORD_FIELDS.includes(k));
  const walk = (x: unknown): boolean => {
    if (Array.isArray(x)) return x.every(walk);
    if (typeof x !== 'object' || x === null) return true;
    for (const [k, v] of Object.entries(x)) {
      if (k === 'word') {
        const words = Array.isArray(v) ? v : [v];
        if (!words.every((w) => w === null || okWord(w))) return false;
      } else if (!walk(v)) return false;
    }
    return true;
  };
  return walk(root);
}

/** 세이브 원문의 저장 시각(sim.savedAt). 못 읽으면 null */
export function savedAtOf(raw: string): number | null {
  try {
    const o = JSON.parse(raw) as { sim?: { savedAt?: unknown } };
    return typeof o.sim?.savedAt === 'number' && Number.isFinite(o.sim.savedAt) ? o.sim.savedAt : null;
  } catch {
    return null;
  }
}

/** 원문 → 나란히 고르기의 한 쪽. 이 앱이 못 읽는 본이면 state=null(메타의 날·획 수로만) */
export function sideOf(raw: string | null, meta?: { dayIndex: number | null; strokesTotal: number | null }): SaveSide {
  if (raw !== null && !isFuture(raw)) {
    try {
      const st = sim.parseState(raw);
      return { state: st, dayIndex: st.dayIndex, strokes: st.strokes.length, savedAt: savedAtOf(raw) };
    } catch {
      /* 아래 */
    }
  }
  return { state: null, dayIndex: meta?.dayIndex ?? null, strokes: meta?.strokesTotal ?? null, savedAt: raw === null ? null : savedAtOf(raw) };
}

function iso(ms: number): string {
  // 서버 isoDateTime은 2025~2100만 받는다. 범위 밖 기기 시계는 지금 시각으로 보낸다(표시용 값)
  const lo = Date.UTC(2025, 0, 1);
  const hi = Date.UTC(2100, 0, 1);
  return new Date(ms >= lo && ms < hi ? ms : Math.min(Math.max(Date.now(), lo), hi - 1)).toISOString();
}

function save(d: TaskDeps, rec: CloudRecord): CloudRecord {
  writeRecord(d.kv, rec);
  return rec;
}

/** 공통 실패 처리: 410이면 세션을 비우고 기록을 '옮겨 감'으로 */
async function common<T>(d: TaskDeps, r: ApiResult<T>): Promise<TaskResult | null> {
  if (r.kind === 'moved') {
    await d.auth.signOut().catch(() => undefined);
    const rec = readRecord(d.kv) ?? FRESH_RECORD;
    save(d, { ...rec, state: 'moved' });
    return { r: 'moved' };
  }
  if (r.kind === 'signedOut') return fail('signedOut');
  if (r.kind === 'noAccount' || r.kind === 'alreadyGone') return loginGone(d);
  if (r.kind === 'failed') return fail(r.failure);
  return null;
}

/** 지금 로그인: sub / 세션 없음 / 지금 토큰을 못 받음(C11 재리뷰 N1 — 일시 실패를 '다른 로그인'·'로그인 없음'으로 읽지 않는다) */
type Login = { kind: 'sub'; sub: string | null } | { kind: 'none' } | { kind: 'unavailable'; failure: Failure };
async function login(d: TaskDeps): Promise<Login> {
  const t = await readToken(d.auth);
  return t.kind === 'ok' ? { kind: 'sub', sub: subOf(t.token) } : t;
}

/** 지금 접근 토큰의 sub(모르면 null — 같다고 확정하는 데만 쓴다) */
async function currentSub(d: TaskDeps): Promise<string | null> {
  const l = await login(d);
  return l.kind === 'sub' ? l.sub : null;
}

/** 기록(또는 표시)의 sub가 지금 로그인과 같은가 — 같을 때만 서버의 '그 로그인에 사용자 없음'을 '이 맡겨 두기가 끝남'으로 확정한다(B2b 리뷰 H1) */
async function sameLogin(d: TaskDeps, sub: string | null | undefined): Promise<boolean> {
  if (!sub) return false;
  return (await currentSub(d)) === sub;
}

/**
 * 서버가 '이 로그인에 붙은 사용자가 없다'(401·410 no_account)고 했다.
 *  - 기록을 켠 로그인과 지금 로그인이 같으면: 이 맡겨 두기는 끝났다(지움·정리) → 세션·기록 비움('ended').
 *  - 다르거나 모르면(백업 복원 폰처럼 새 로그인): 서버의 맡겨 두기는 그대로일 수 있다 → 조용히 끄지 않고 '예전 계정' 표시를 남긴 뒤 기록을 비운다('orphaned').
 */
async function loginGone(d: TaskDeps): Promise<TaskResult> {
  const rec = readRecord(d.kv);
  if (rec && (await sameLogin(d, rec.sub))) {
    await d.auth.signOut().catch(() => undefined);
    writeRecord(d.kv, null);
    return { r: 'ended' };
  }
  // 지금 로그인을 확인하지 못했으면 '다른 로그인'으로 단정하지 않고 미룬다(아무것도 지우지 않음)
  const l = await login(d);
  if (l.kind === 'unavailable') return fail(l.failure);
  return orphan(d);
}

/** 기록의 맡겨 두기에 이 로그인으로 닿을 수 없다 → 예전 계정 표시(웹 삭제·되찾기 안내) + 기록 비움 + 로그인 비움 */
async function orphan(d: TaskDeps): Promise<TaskResult> {
  const rec = readRecord(d.kv);
  if (rec) markUnconfirmedDelete(d.kv, rec.creature, d.now(), true, { reason: 'orphan', sub: rec.sub });
  writeRecord(d.kv, null);
  await d.auth.signOut().catch(() => undefined);
  return { r: 'orphaned' };
}

/**
 * 확인하지 못한 지우기의 옛 로그인을 버린다(한 번만). 표시는 남기고 abandoned로 바꾼다 — 그 뒤로는 웹 삭제 안내만(재리뷰 4 S1).
 * '두고 새로 시작'·'안내 닫기'·켜기·되찾기가 모두 이 한 함수를 지난다.
 */
async function abandonOld(d: TaskDeps): Promise<void> {
  const m = readUnconfirmedDelete(d.kv);
  if (!m || m.abandoned) return;
  await d.auth.signOut().catch(() => undefined);
  markUnconfirmedDelete(d.kv, m.creature, m.at, true, { reason: m.reason, sub: m.sub });
}

/** 로그인을 비우고 새 익명 로그인 */
async function freshSignIn(d: TaskDeps): Promise<TaskResult | null> {
  await d.auth.signOut().catch(() => undefined);
  return signIn(d);
}

async function signIn(d: TaskDeps): Promise<TaskResult | null> {
  const t = await readToken(d.auth);
  if (t.kind === 'ok') return null;
  // 세션은 있는데 지금 토큰을 못 받음 → 새 사용자를 만들지 않고 미룬다(남은 로그인을 덮지 않게, 리뷰 M2·N1)
  if (t.kind === 'unavailable') return fail(t.failure);
  const s = await d.auth.signIn().catch(() => ({ ok: false as const, failure: 'offline' as Failure }));
  return s.ok ? null : fail(s.failure);
}

/**
 * 이 기기 본 올리기(3-4 '버전 확인'·'빨리 감기'·'반쯤 성공'). keepMine = 나란히 고르기에서 이 기기 본을 고름.
 * 충돌 표시가 있으면 고르기 전에는 올리지 않는다.
 */
async function upload(d: TaskDeps, keepMine?: ServerPick): Promise<TaskResult> {
  const rec = readRecord(d.kv) ?? FRESH_RECORD;
  if (rec.conflict && !keepMine) return { r: 'conflict' };
  const raw = d.local.raw();
  if (raw === null) return { r: 'synced' };
  if (!uploadShapeOk(raw)) {
    save(d, { ...rec, held: 'shape' });
    return { r: 'synced' };
  }
  const sha = await d.sha256(raw);
  if (!keepMine && rec.sha === sha && rec.rev !== null) {
    save(d, { ...rec, held: null });
    return { r: 'synced' };
  }
  const at = iso(savedAtOf(raw) ?? d.now());
  let pre: { ifMatch: number } | { ifNoneMatch: true } = keepMine ? { ifMatch: keepMine.rev } : rec.rev === null ? { ifNoneMatch: true } : { ifMatch: rec.rev };
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await d.api.putSave(raw, at, pre, keepMine !== undefined);
    if (r.kind === 'ok') {
      save(d, { ...rec, rev: r.value.rev, sha: r.value.sha, syncedAt: d.now(), conflict: false, held: null });
      return { r: 'synced' };
    }
    if (r.kind === 'conflict') {
      // 서버가 사본을 잃었으면(백업 복원) 처음 올리기로 한 번 더
      if (r.server === null && attempt === 0) {
        pre = { ifNoneMatch: true };
        continue;
      }
      // 반쯤 성공: 서버 본이 바로 내 본이면 충돌이 아니다
      if (r.server !== null && r.server.sha === sha) {
        save(d, { ...rec, rev: r.server.rev, sha, syncedAt: d.now(), conflict: false, held: null });
        return { r: 'synced' };
      }
      if (keepMine) return { r: 'serverChanged', why: 'conflict' };
      save(d, { ...rec, conflict: true });
      return { r: 'conflict' };
    }
    if (r.kind === 'tooLarge' || r.kind === 'quota') {
      save(d, { ...rec, held: r.kind });
      return { r: 'synced' };
    }
    const c = await common(d, r);
    return c ?? fail('server');
  }
  return fail('server');
}

/**
 * 서버 본을 받아 나란히 놓는다. keepRecord = 기기 기록을 건드리지 않는다(has_creature 뒤 — 리뷰 R1: 이 기기의 맡겨 두기 기록을 덮지 않음).
 * 이미 같은 본이면 고를 것이 없다(synced). note가 있으면 같은 본이어도 나란히 보여 준다(무엇이 일어났는지 사용자가 보게).
 */
async function fetchCompare(d: TaskDeps, why: Why, opts: { note?: ChooseNote; keepRecord?: boolean } = {}): Promise<TaskResult> {
  const r = await d.api.getSave();
  const note = opts.note ?? null;
  if (r.kind === 'notFound') {
    if (opts.keepRecord) return { r: 'synced' };
    // 맡긴 본이 없다 → 고를 것이 없다. 충돌 표시를 풀고 이 기기 본을 처음 본으로 올린다
    const rec = readRecord(d.kv) ?? FRESH_RECORD;
    save(d, { ...rec, rev: null, sha: null, conflict: false });
    return upload(d);
  }
  if (r.kind !== 'ok') return (await common(d, r)) ?? fail('server');
  const s = r.value;
  const localRaw = d.local.raw();
  if (note === null && localRaw !== null && (await d.sha256(localRaw)) === s.sha) {
    const rec = readRecord(d.kv) ?? FRESH_RECORD;
    save(d, { ...rec, rev: s.rev, sha: s.sha, syncedAt: d.now(), conflict: false });
    return { r: 'synced' };
  }
  if (!opts.keepRecord) {
    const rec = readRecord(d.kv) ?? FRESH_RECORD;
    save(d, { ...rec, conflict: true });
  }
  return {
    r: 'compare',
    why,
    local: sideOf(localRaw),
    server: s.validated ? sideOf(s.body, s) : sideOf(null, s),
    pick: { rev: s.rev, sha: s.sha },
    ...(note ? { note } : {}),
  };
}

/** '이 기기'를 골라 밀려난 서버 본(기기 parked 칸 하나, 30일)을 다시 나란히. 서버를 부르지 않는다(칸이 기기에 있으므로) */
async function fetchParked(d: TaskDeps, slot: string | undefined): Promise<TaskResult> {
  const p = slot ? readParkedOne(d.kv, slot, d.now()) : (readParkedList(d.kv, d.now())[0] ?? null);
  if (!p) return { r: 'synced' };
  return { r: 'compare', why: 'parked', local: sideOf(d.local.raw()), server: sideOf(p.raw), pick: { rev: 0, sha: await d.sha256(p.raw), slot: p.id } };
}

/**
 * parked 칸의 본으로 이어 가기 = 맞바꾸기: 지금 본은 같은 칸으로(새 30일), 칸의 본은 지금 자리로.
 * 칸에 먼저 쓰고 바꾸며, 바꾸기에 실패하면 칸을 원래 본으로 되돌린다. 다음 맡기기는 평소처럼(사용자가 고른 본) — 밀려나는 서버 본은 서버 이력에 남는다.
 */
async function takeParked(d: TaskDeps, slot: string): Promise<TaskResult> {
  const p = readParkedOne(d.kv, slot, d.now());
  if (!p) return fail('device');
  let next: sim.State;
  try {
    next = sim.parseState(p.raw);
  } catch {
    return fail('device');
  }
  const cur = d.local.raw();
  if (!setParked(d.kv, slot, cur, d.now())) return fail('device');
  if (!d.local.adopt(next)) {
    setParked(d.kv, slot, p.raw, p.at);
    return fail('device');
  }
  return { r: 'synced' };
}

/**
 * preRestore 칸에 새 본을 넣을 때 칸의 **다른 본을 덮지 않는다**(C13 D1 — 되돌리기로 칸에 들어간 키운 본은 서버·다른 칸 어디에도 없을 수 있다).
 * 칸에 다른 본이 있으면 먼저 parked 칸으로 옮기고(같은 본이 이미 parked에 있으면 그대로), parked가 가득이면 멈춘다('칸 비우기' 안내).
 * 칸 쓰기 경로 전부의 원칙: keepPreRestore(여기 하나 + 되돌리기의 맞바꾸기·원상 복구)·addParked(덮지 않음, 가득이면 full)·
 * setParked(맞바꾸기·원상 복구·사용자 비우기)·dropPreRestore(사용자 비우기) — 말없이 덮는 길은 이 함수를 지나지 않는 takeServer뿐이었다.
 */
function preRestoreBlocked(d: TaskDeps, raw: string): boolean {
  const pre = readPreRestore(d.kv, d.now());
  if (!pre || pre.raw === raw) return false;
  const list = readParkedList(d.kv, d.now());
  return !list.some((p) => p.raw === pre.raw) && list.length >= PARKED_SLOTS;
}
function putPreRestore(d: TaskDeps, raw: string): TaskResult | null {
  const pre = readPreRestore(d.kv, d.now());
  if (pre && pre.raw !== raw) {
    const moved = addParked(d.kv, pre.raw, d.now());
    if (moved === 'full') return { r: 'parkFull' };
    if (moved === 'io') return fail('device');
  }
  return keepPreRestore(d.kv, raw, d.now()) ? null : fail('device');
}

/** 서버 본으로 이어 가기(위 머리말 ①~⑤) */
async function takeServer(d: TaskDeps, pick: ServerPick): Promise<TaskResult> {
  const r = await d.api.getSave();
  if (r.kind === 'notFound') return { r: 'serverChanged', why: 'conflict' };
  if (r.kind !== 'ok') return (await common(d, r)) ?? fail('server');
  if (r.value.rev !== pick.rev || r.value.sha !== pick.sha) return { r: 'serverChanged', why: 'conflict' };
  let next: sim.State;
  try {
    next = sim.parseState(r.value.body);
  } catch {
    return fail('server');
  }
  const localRaw = d.local.raw();
  if (localRaw !== null) {
    // preRestore 칸을 덮기 전에 자리부터 본다(D1): 칸에 다른 본이 있고 parked가 가득이면 아무것도 바꾸지 않고 멈춘다
    if (preRestoreBlocked(d, localRaw)) return { r: 'parkFull' };
    const c = await d.api.addConflict(localRaw, iso(savedAtOf(localRaw) ?? d.now()));
    if (c.kind !== 'ok') return (await common(d, c)) ?? fail('server');
    // 올리는 동안 게임이 저장한 본이 있으면 그 본은 어디에도 없다 → 바꾸지 않고 다시 나란히
    if (d.local.raw() !== localRaw) return { r: 'localChanged', why: 'conflict' };
    const kept = putPreRestore(d, localRaw);
    if (kept !== null) return kept;
  }
  if (!d.local.adopt(next)) return fail('device');
  const rec = readRecord(d.kv) ?? FRESH_RECORD;
  save(d, { ...rec, rev: r.value.rev, sha: r.value.sha, syncedAt: d.now(), conflict: false, held: null });
  return { r: 'synced' };
}

/**
 * 이 기기 본을 고름. park(되찾기·has_creature 맥락)면 밀려날 서버 본을 먼저 받아 고른 그 본인지(sha) 확인하고 기기 parked 칸에 둔다(리뷰 재리뷰 2 M-b·M-d).
 * 서버 conflict 칸(최대 3벌)과 달리 이 칸은 30일 동안 밀려나지 않는다. 칸에 못 두면 고르지 않는다(되찾은 본이 닿을 수 없는 곳으로만 가지 않게).
 */
async function keepLocal(d: TaskDeps, pick: ServerPick, park: boolean): Promise<TaskResult> {
  if (park) {
    const r = await d.api.getSave();
    if (r.kind === 'notFound') return { r: 'serverChanged', why: 'conflict' };
    if (r.kind !== 'ok') return (await common(d, r)) ?? fail('server');
    if (r.value.rev !== pick.rev || r.value.sha !== pick.sha) return { r: 'serverChanged', why: 'conflict' };
    // 앞선 칸을 덮지 않는다: 다 찼으면 고르기를 멈춘다(재리뷰 3 Q1). 같은 본이 이미 있으면 그대로
    const kept = addParked(d.kv, r.value.body, d.now());
    if (kept === 'full') return { r: 'parkFull' };
    if (kept === 'io') return fail('device');
  }
  return upload(d, pick);
}

/** 인장 코드 알아내기: bootstrap은 이미 몽망이가 있는 사용자에게 그 코드를 돌려준다(멱등). 실패하면 null */
async function currentCreature(d: TaskDeps): Promise<string | null> {
  const b = await d.api.bootstrap(passGate());
  return b.kind === 'ok' ? b.value.code : null;
}

/**
 * 되찾은 몽망이가 '예전 계정 남음' 표시의 그 몽망이면 표시를 지운다(재리뷰 5 V3 — 지금 쓰는 계정을 웹에서 지우라고 권하지 않게).
 * 판정은 계정의 식별값인 인장 코드로 한다: 되찾기 응답의 creature.code는 서버가 그 글귀로 찾은 계정이고, 표시의 creature는 그 기기 기록의
 * 계정이다. sub는 되찾기에서 바뀐다(옛 sub는 revoked, 새 sub가 붙음)라 같은 계정이어도 같지 않다 — 그래서 sub는 '같은 로그인'
 * 확인(지워짐 확정)에만 쓰고, 계정이 같은지는 인장 코드로 본다. 표시에 인장 코드가 없으면 지우지 않는다(모를 때는 안내를 남김).
 */
function clearOldIfSame(d: TaskDeps, creature: string): void {
  const m = readUnconfirmedDelete(d.kv);
  if (m && m.creature !== null && m.creature === creature) clearUnconfirmedDelete(d.kv);
}

async function recover(d: TaskDeps, code: string, target: string | null): Promise<TaskResult> {
  // 인장 칸에 이 기기 몽망이의 코드를 넣었다면 되찾을 대상이 아니다(리뷰 재리뷰 2 M-c) — 서버를 부르기 전에 되돌려 준다
  const own = readRecord(d.kv)?.creature ?? null;
  if (target !== null && own !== null && target === own) return { r: 'ownSeal' };
  // 확인하지 못한 지우기가 남은 로그인으로는 되찾지 않는다(그 계정에 다시 붙지 않게 — 재리뷰 3 Q3). 표시는 남긴다
  await abandonOld(d);
  const s = await signIn(d);
  if (s) return s;
  // 부르기 직전에 남긴다: 응답이 끊겨 다시 부를 때 has_creature를 판별할 근거(대상 인장 코드)
  if (!readRecovering(d.kv) || target !== null) markRecovering(d.kv, target, d.now());
  const marker = readRecovering(d.kv);
  let r = await d.api.recover(code, passGate());
  // 끝난 로그인(401 no_account)이면 로그인을 비우고 한 번 새로 시작한다(막다른 길 막기 — 재리뷰 4 S2, B2b ③)
  if (r.kind === 'noAccount') {
    const again = await freshSignIn(d);
    if (again) return again;
    r = await d.api.recover(code, passGate());
  }
  if (r.kind === 'notFound') {
    clearRecovering(d.kv);
    return { r: 'badCode' };
  }
  if (r.kind === 'hasCreature') {
    // 이 로그인에 이미 몽망이가 있다. 아무것도 지우지 않고, 본 비교로 성공을 판정하지 않는다(리뷰 R1).
    // 그 몽망이의 인장 코드가 되찾기 대상과 같을 때만 '이미 되찾음'. 그 밖에는 언제나 나란히 고르기, 기기 기록은 덮지 않는다
    const cur = await currentCreature(d);
    const want = marker?.target ?? null;
    // (대상 = 이 기기 몽망이 코드인 경우는 위에서 이미 걸렀다)
    if (cur !== null && want !== null && cur === want) {
      // 성공: 앞선 되찾기가 이미 끝났다. 평소 되찾기와 같이 나란히 고르기로 이어 간다(서버 본이 없으면 '이미 되찾음'으로 끝)
      clearRecovering(d.kv);
      clearOldIfSame(d, cur);
      if (!readRecord(d.kv)) save(d, { ...FRESH_RECORD, conflict: true, creature: cur, sub: await currentSub(d) });
      const c = await fetchCompare(d, 'restore', { note: 'already' });
      return c.r === 'synced' ? { r: 'already' } : c;
    }
    if (!readRecord(d.kv)) save(d, { ...FRESH_RECORD, conflict: true, creature: cur, sub: await currentSub(d) });
    // 되찾았는지 모르므로 '되찾기' 맥락(restore — '이 기기'를 고르면 되찾은 본으로 기록)이 아니라 일반 충돌로 보인다
    return fetchCompare(d, 'conflict', { note: 'hasCreature', keepRecord: true });
  }
  if (r.kind !== 'ok') return (await common(d, r)) ?? fail('server');
  if (r.value.replay) {
    // 다시 부르기(B2b ①): 앞선 되찾기가 커밋됐다. 부르기 전에 남긴 대상 인장 코드와 같을 때만 정상 되찾기로 이어 간다.
    // 대상을 모르거나 다르면 성공으로 보지 않고 has_creature와 같이 나란히(기록은 덮지 않는다)
    const want = marker?.target ?? null;
    if (want === null || want !== r.value.creature.code) {
      if (!readRecord(d.kv)) save(d, { ...FRESH_RECORD, conflict: true, creature: r.value.creature.code, sub: await currentSub(d) });
      return fetchCompare(d, 'conflict', { note: 'hasCreature', keepRecord: true });
    }
    clearRecovering(d.kv);
    clearOldIfSame(d, r.value.creature.code);
    // 기존 기록은 덮지 않는다(같은 되찾기의 첫 시도가 남긴 것일 수 있다)
    if (!readRecord(d.kv)) save(d, { ...FRESH_RECORD, conflict: r.value.save !== null, creature: r.value.creature.code, sub: await currentSub(d) });
    return { r: 'recovered', code: r.value.newCode, then: r.value.save !== null ? 'restore' : 'on' };
  }
  clearRecovering(d.kv);
  clearOldIfSame(d, r.value.creature.code);
  // 서버 본이 있으면 고르기 전까지 올리지 않는다(conflict 표시). 글귀는 아직 확인 전
  save(d, { ...FRESH_RECORD, conflict: r.value.save !== null, creature: r.value.creature.code, sub: await currentSub(d) });
  return { r: 'recovered', code: r.value.newCode, then: r.value.save !== null ? 'restore' : 'on' };
}

async function finishDeleted(d: TaskDeps): Promise<TaskResult> {
  await d.auth.signOut().catch(() => undefined);
  writeRecord(d.kv, null);
  return { r: 'deleted' };
}

/**
 * 지우기(리뷰 H2·R4). 요청 전에 'deleting'을 남긴다. 202를 받았을 때만 '지웠어요'.
 * 응답을 못 받았거나 401·404·5xx면 토큰을 새로 받아 DELETE를 한 번 더 보낸다(멱등 — 이미 지워졌으면 지울 것이 없다).
 * 그래도 202가 아니면 '확인 필요'로 둔다: 계약의 401(`unauthorized`)은 '토큰 문제'와 '사용자 없음'을 구별하지 않으므로 지워짐의 증거가 아니다.
 */
async function deleteMe(d: TaskDeps, first: boolean): Promise<TaskResult> {
  const rec0 = readRecord(d.kv) ?? FRESH_RECORD;
  const rec = save(d, { ...rec0, state: 'deleting', deleteTries: first ? 0 : rec0.deleteTries });
  // 410·401 no_account(지울 것이 없다)는 이 맡겨 두기를 켠 로그인과 지금 로그인이 같을 때만 '지워짐'으로 확정한다(B2b 리뷰 H1).
  // 다르면(복원 폰의 새 로그인 등) 서버의 맡겨 두기는 그대로일 수 있다 → 확인 필요
  const gone = async (k: string) => (k === 'alreadyGone' || k === 'noAccount') && (await sameLogin(d, rec.sub));
  if (first) {
    const r = await d.api.deleteMe();
    if (r.kind === 'ok' || (await gone(r.kind))) return finishDeleted(d);
    if (r.kind === 'moved') return (await common(d, r))!;
  }
  await d.auth.refresh().catch(() => false);
  const again = await d.api.deleteMe();
  if (again.kind === 'ok' || (await gone(again.kind))) return finishDeleted(d);
  if (again.kind === 'moved') return (await common(d, again))!;
  const tries = rec.deleteTries + 1;
  save(d, { ...rec, deleteTries: tries });
  return { r: 'deleteUnknown', tries };
}

/**
 * 지우기 결과를 끝내 모를 때의 출구(리뷰 재리뷰 2 M-a — 서버 B2b 전까지): 이 기기의 맡겨 두기 기록만 비우고,
 * '서버에 남았을 수 있음' 표시(인장 코드)를 남긴다. 로그인은 남겨 두어 소개 화면에서 '다시 지우기'를 할 수 있게 한다.
 */
function forget(d: TaskDeps): TaskResult {
  const rec = readRecord(d.kv);
  if (!markUnconfirmedDelete(d.kv, rec?.creature ?? null, d.now(), false, { reason: 'delete', sub: rec?.sub ?? null })) return fail('device');
  writeRecord(d.kv, null);
  return { r: 'forgotten' };
}

/** 끈 뒤 '다시 지우기': 토큰을 새로 받아 DELETE. 202일 때만 표시를 지우고 '지웠어요' */
async function retryForgotten(d: TaskDeps): Promise<TaskResult> {
  await d.auth.refresh().catch(() => false);
  const r = await d.api.deleteMe();
  const m = readUnconfirmedDelete(d.kv);
  const goneHere = (r.kind === 'alreadyGone' || r.kind === 'noAccount') && (await sameLogin(d, m?.sub));
  if (r.kind === 'ok' || goneHere) {
    clearUnconfirmedDelete(d.kv);
    await d.auth.signOut().catch(() => undefined);
    return { r: 'deleted' };
  }
  return fail(r.kind === 'failed' ? r.failure : 'signedOut');
}

/**
 * 바꾸기 전 몽망이로 되돌리기 = **맞바꾸기**(리뷰 R3): 지금 몽망이는 preRestore 칸으로, 칸의 몽망이는 지금 자리로.
 * 기기 안에서만 일어나므로 맡겨 두기가 꺼졌거나 옮겨진 상태에서도 되고, 다시 맞바꾸면 원래대로 돌아온다.
 * 순서: 칸에 지금 본을 먼저 쓰고 → 바꾼다. 바꾸기에 실패하면 칸을 원래대로 되돌린다(어느 본도 한 칸에서만 사라지지 않게).
 */
async function revert(d: TaskDeps): Promise<TaskResult> {
  const pre = readPreRestore(d.kv, d.now());
  if (!pre) return fail('device');
  let back: sim.State;
  try {
    back = sim.parseState(pre.raw);
  } catch {
    return fail('device');
  }
  const cur = d.local.raw();
  if (cur !== null && !keepPreRestore(d.kv, cur, d.now())) return fail('device');
  if (!d.local.adopt(back)) {
    keepPreRestore(d.kv, pre.raw, pre.at);
    return fail('device');
  }
  if (cur === null) dropPreRestore(d.kv);
  // 맡겨 두는 중이면 다음 맡기기가 서버 현재본을 말없이 덮지 않게, 나란히 고르기를 거치게 한다(리뷰 재리뷰 2 M-e)
  const rec = readRecord(d.kv);
  if (rec?.state === 'on') save(d, { ...rec, conflict: true });
  return { r: 'reverted' };
}

/** 기기 기록의 로그인으로 서버를 부르는 작업 */
const NEEDS_LOGIN: ReadonlySet<Task['t']> = new Set(['fetch', 'keepLocal', 'takeServer', 'sync', 'reissue', 'delete', 'deleteCheck']);

export async function runTask(task: Task, d: TaskDeps): Promise<TaskResult> {
  try {
    // 기록은 있는데 로그인이 없다(백업으로 옮긴 새 폰 — 세션은 백업에서 빠짐, 3-3 ④): 그 맡겨 두기에 이 기기로는 닿을 수 없다 → 예전 계정 안내.
    // 세션은 있는데 지금 토큰을 못 받음(오프라인에서 접근 토큰 만료 등)은 로그인 없음이 아니다 → 미루고 아무것도 지우지 않는다(C11 재리뷰 N1)
    if (NEEDS_LOGIN.has(task.t) && readRecord(d.kv)?.state === 'on') {
      const t = await readToken(d.auth);
      if (t.kind === 'none') return await orphan(d);
      if (t.kind === 'unavailable') return fail(t.failure);
    }
    switch (task.t) {
      case 'enable': {
        // 확인하지 못한 지우기가 남았으면 그 로그인을 쓰지 않고 새로 시작한다(지워졌을 수 있는 계정에 다시 붙지 않게)
        await abandonOld(d);
        const s = await signIn(d);
        if (s) return s;
        let b = await d.api.bootstrap(passGate());
        // 끝난 로그인(401 no_account — 지운 계정의 남은 로그인)이면 로그인을 비우고 한 번 새로 시작한다(재리뷰 4 S2, B2b ③)
        if (b.kind === 'noAccount') {
          const again = await freshSignIn(d);
          if (again) return again;
          b = await d.api.bootstrap(passGate());
        }
        if (b.kind !== 'ok') return (await common(d, b)) ?? fail('server');
        // 기록을 먼저 남긴다: 이 뒤에 끊기면 켜짐 화면이 '글귀 받기'를 먼저 보인다
        save(d, { ...(readRecord(d.kv) ?? FRESH_RECORD), creature: b.value.code, sub: await currentSub(d) });
        const u = await upload(d);
        if (u.r === 'failed' || u.r === 'moved') return u;
        const c = await d.api.issueCode();
        if (c.kind !== 'ok') return (await common(d, c)) ?? fail('server');
        return { r: 'enabled', code: c.value };
      }
      case 'recover':
        return await recover(d, task.code, task.target);
      case 'fetch':
        return task.why === 'parked' ? await fetchParked(d, task.slot) : await fetchCompare(d, task.why);
      case 'keepLocal':
        return await keepLocal(d, task.server, task.park);
      case 'abandonOld':
        await abandonOld(d);
        return { r: 'abandoned' };
      case 'dropPre':
        return dropPreRestore(d.kv) ? { r: 'parkedDropped' } : fail('device');
      case 'dropParked':
        return setParked(d.kv, task.slot, null, d.now()) ? { r: 'parkedDropped' } : fail('device');
      case 'takeParked':
        return await takeParked(d, task.slot);
      case 'forget':
        return forget(d);
      case 'retryForgotten':
        return await retryForgotten(d);
      case 'takeServer':
        return await takeServer(d, task.server);
      case 'sync':
        return await upload(d);
      case 'reissue': {
        const rec = readRecord(d.kv) ?? FRESH_RECORD;
        save(d, { ...rec, codeConfirmed: false });
        const c = await d.api.issueCode();
        if (c.kind !== 'ok') return (await common(d, c)) ?? fail('server');
        return { r: 'reissued', code: c.value };
      }
      case 'delete':
        return await deleteMe(d, true);
      case 'deleteCheck':
        return await deleteMe(d, false);
      case 'revert':
        return await revert(d);
    }
  } catch {
    return fail('server');
  }
}

/** 글귀 확인이 끝났다: 기록에 남긴다(글귀 자체는 남기지 않는다) */
export function markCodeConfirmed(kv: KV): void {
  const rec = readRecord(kv);
  if (rec) writeRecord(kv, { ...rec, codeConfirmed: true });
}
