// C12 맡겨 두기: 연령 확인(기기 판정·저장 값), 상태 기계(글귀 한 번·확인 절차·고르기 두 번 확인), 작업(가짜 서버로 실제 계약 흐름).
// 데이터 유실 0 시나리오: 충돌은 자동으로 덮지 않음, 반쯤 성공, 서버 본이 바뀐 뒤 고르기, 진 본 보존, 오프라인·느림·중단, 옮겨 감(410).
import { createHash } from 'node:crypto';
import { AGE_GATE_VERSION } from '@mong/contract';
import { SAVE_KEYS, sim, type KV } from '@mong/core';
import { describe, expect, it } from 'vitest';
import { AGE_KEY, ageStatus, checkAgeInput, judgeAge, recordAge } from '../src/cloud/ageGate';
import { classify, createCloudApi, decodeBase64Url, subOf } from '../src/cloud/api';
import { createFakeServer } from '../src/cloud/fakeServer';
import { closable, deleteToken, initialView, reduce, startEvents, tailMatches, type CloudEvent, type SaveSide, type View } from '../src/cloud/model';
import { addParked, UNCONFIRMED_DELETE_KEY as UNCONFIRMED_KEY, CLOUD_KEY, keepPreRestore, markUnconfirmedDelete, PARKED_KEY, PARKED_SLOTS, PRE_RESTORE_KEY, readParkedList, readPreRestore, readRecord, readRecovering, readUnconfirmedDelete } from '../src/cloud/record';
import { markCodeConfirmed, runTask, uploadShapeOk, type TaskDeps } from '../src/cloud/tasks';

const sha = async (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const T = Date.UTC(2026, 10, 25, 3, 0); // 서울 11-25 정오
const TZ = 540;

function memKV(): KV & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getString: (k) => m.get(k), set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
}

function mong(seed: number, days = 0): string {
  const s = sim.createInitial(T - days * 86_400_000, TZ, seed);
  return sim.serializeState({ ...s, dayIndex: days }, T - days * 1000);
}

function device(server: ReturnType<typeof createFakeServer>, name: string, raw: string | null) {
  const kv = memKV();
  if (raw !== null) kv.set(SAVE_KEYS.main, raw);
  const adopted: sim.State[] = [];
  const auth = server.authFor(name);
  const deps: TaskDeps = {
    api: createCloudApi({ fetch: server.fetch, base: 'https://api.test', auth, timeoutMs: 200 }),
    auth,
    kv,
    sha256: sha,
    now: () => T,
    local: {
      raw: () => kv.getString(SAVE_KEYS.main) ?? null,
      adopt: (st) => {
        adopted.push(st);
        kv.set(SAVE_KEYS.main, sim.serializeState(st, T + 1));
        return true;
      },
    },
  };
  return { kv, deps, adopted };
}

const run = (v: View, ...evs: CloudEvent[]) => evs.reduce(reduce, v);
const formatCode = (c16: string) => c16.match(/.{4}/g)!.join('-');
const FRESH_REC = { v: 1, state: 'on', rev: null, sha: null, syncedAt: null, codeConfirmed: false, conflict: false, held: null, creature: null, deleteTries: 0, sub: null };
/** 가장 최근 parked 칸(없으면 null) */
const readParked = (kv: KV, now: number) => readParkedList(kv, now)[0] ?? null;

describe('연령 확인(중립형, 기기 판정)', () => {
  it('같은 달은 아직 생일 전(보수적 → 미달), 한 달 지났으면 통과 — 기준 숫자는 판정 안에만', () => {
    expect(judgeAge({ year: 2012, month: 11 }, T, TZ)).toBe('under');
    expect(judgeAge({ year: 2012, month: 12 }, T, TZ)).toBe('under');
    expect(judgeAge({ year: 2012, month: 10 }, T, TZ)).toBe('pass');
    expect(judgeAge({ year: 1990, month: 1 }, T, TZ)).toBe('pass');
    expect(judgeAge({ year: 2020, month: 1 }, T, TZ)).toBe('under');
  });
  it('빈 칸·미래 달·너무 이른 해는 판정하지 않는다', () => {
    expect(checkAgeInput({ year: null, month: 3 }, T, TZ)).toBe('incomplete');
    expect(checkAgeInput({ year: 2026, month: 12 }, T, TZ)).toBe('range');
    expect(checkAgeInput({ year: 1899, month: 1 }, T, TZ)).toBe('range');
    expect(checkAgeInput({ year: 2010, month: 13 }, T, TZ)).toBe('range');
    expect(judgeAge({ year: 2026, month: 12 }, T, TZ)).toBeNull();
  });
  it('기기에는 판정과 날짜만 남는다(해·달 없음), 미달은 같은 날만 쉰다', () => {
    const kv = memKV();
    expect(ageStatus(kv, T, TZ).kind).toBe('ask');
    recordAge(kv, 'under', T, TZ);
    expect(kv.m.get(AGE_KEY)).toBe('under:2026-11-25');
    expect(ageStatus(kv, T + 3_600_000, TZ).kind).toBe('wait');
    expect(ageStatus(kv, T + 86_400_000, TZ).kind).toBe('ask');
    recordAge(kv, 'pass', T, TZ);
    expect(kv.m.get(AGE_KEY)).toBe(`pass:${AGE_GATE_VERSION}:2026-11-25`);
    expect(ageStatus(kv, T, TZ)).toEqual({ kind: 'passed', gate: { v: AGE_GATE_VERSION, ok: true } });
    expect([...kv.m.values()].join()).not.toMatch(/2012|1990/);
  });
  it('판이 바뀐 통과 기록·깨진 기록이면 다시 묻는다', () => {
    const kv = memKV();
    kv.set(AGE_KEY, 'pass:1:2026-01-01');
    expect(ageStatus(kv, T, TZ).kind).toBe('ask');
    kv.set(AGE_KEY, '???');
    expect(ageStatus(kv, T, TZ).kind).toBe('ask');
  });
});

describe('상태 기계', () => {
  const side = (state: sim.State | null): SaveSide => ({ state, dayIndex: 3, strokes: 2, savedAt: T });
  const st = sim.parseState(mong(1));
  const choose: View = { v: 'choose', why: 'conflict', local: side(st), server: side(st), pick: { rev: 2, sha: 'a'.repeat(64) }, picked: null, confirming: false, note: null };

  it('켜기: 소개 → 연령 → (통과) 작업 / (미달) 쉼', () => {
    expect(run({ v: 'intro' }, { e: 'start', purpose: 'enable' }, { e: 'age', ok: true })).toEqual({ v: 'busy', task: { t: 'enable' }, slow: false });
    expect(run({ v: 'intro' }, { e: 'start', purpose: 'enable' }, { e: 'age', ok: false })).toEqual({ v: 'ageUnder' });
  });
  it('되찾기: 연령 → 글귀 입력(형식 틀림은 서버에 보내지 않음) → 작업', () => {
    const v = run({ v: 'intro' }, { e: 'start', purpose: 'recover' }, { e: 'age', ok: true });
    expect(v).toEqual({ v: 'recoverInput', error: null });
    expect(reduce(v, { e: 'submitCode', input: 'ABCD' })).toEqual({ v: 'recoverInput', error: 'format' });
    expect(reduce(v, { e: 'submitCode', input: 'abcd-efgh-jkmn-pqrs' })).toEqual({ v: 'busy', task: { t: 'recover', code: 'ABCDEFGHJKMNPQRS', target: null }, slow: false });
    expect(reduce(v, { e: 'submitCode', input: 'abcd-efgh-jkmn-pqrs', seal: 'k7m2-abcd' })).toEqual({ v: 'busy', task: { t: 'recover', code: 'ABCDEFGHJKMNPQRS', target: 'K7M2ABCD' }, slow: false });
    expect(reduce(v, { e: 'submitCode', input: 'abcd-efgh-jkmn-pqrs', seal: 'xx' })).toEqual({ v: 'recoverInput', error: 'seal' });
  });
  it('글귀는 보여 주기 → 적어 두었어요 → 끝 네 자 확인. 보여 주는 동안은 뒤로도 닫기도 없다', () => {
    let v = run({ v: 'busy', task: { t: 'enable' }, slow: false }, { e: 'done', result: { r: 'enabled', code: 'ABCD-EFGH-JKMN-PQRS' } });
    expect(v).toMatchObject({ v: 'code', step: 'show' });
    expect(closable(v)).toBe(false);
    expect(reduce(v, { e: 'back' })).toEqual(v);
    v = reduce(v, { e: 'codeWritten' });
    expect(v).toMatchObject({ step: 'confirm' });
    expect(reduce(v, { e: 'codeCheck', input: 'PQRT' })).toMatchObject({ step: 'confirm', mismatch: true });
    expect(reduce(v, { e: 'back' })).toMatchObject({ step: 'show' });
    expect(reduce(v, { e: 'codeCheck', input: 'pqrs' })).toEqual({ v: 'on' });
  });
  it('끝 네 자 확인은 Crockford 읽기(소문자·O→0·I→1)', () => {
    expect(tailMatches('ABCD-EFGH-JKMN-P010', 'pOiO')).toBe(true);
    expect(tailMatches('ABCD-EFGH-JKMN-P010', 'P01')).toBe(false);
    expect(tailMatches('ABCD-EFGH-JKMN-P010', 'MP01')).toBe(false);
    // 길이 검사(리뷰 생존 변이 M3b): 빈 입력·짧은 입력은 끝과 겹쳐도 거짓. 엔터(onSubmitEditing)는 버튼 disabled를 거치지 않는다
    expect(tailMatches('ABCD-EFGH-JKMN-P010', '')).toBe(false);
    expect(tailMatches('ABCD-EFGH-JKMN-P010', '10')).toBe(false);
    const confirm: View = { v: 'code', code: 'ABCD-EFGH-JKMN-P010', step: 'confirm', then: 'on', mismatch: false };
    expect(reduce(confirm, { e: 'codeCheck', input: '' })).toMatchObject({ v: 'code', mismatch: true });
  });
  it('되찾은 뒤 글귀 확인 → 서버 본 받기(나란히)', () => {
    const v = run({ v: 'busy', task: { t: 'recover', code: 'X', target: null }, slow: false }, { e: 'done', result: { r: 'recovered', code: 'ABCD-EFGH-JKMN-PQRS', then: 'restore' } }, { e: 'codeWritten' }, { e: 'codeCheck', input: 'PQRS' });
    expect(v).toEqual({ v: 'busy', task: { t: 'fetch', why: 'restore' }, slow: false });
  });
  it('나란히 고르기: 고르고 → 한 번 더 확인해야 작업, 못 읽는 서버 본이면 어느 쪽도 못 고름', () => {
    const a = reduce(choose, { e: 'confirmPick' });
    expect(a).toEqual(choose);
    const b = run(choose, { e: 'pick', side: 'server' }, { e: 'confirmPick' });
    expect(b).toMatchObject({ v: 'choose', confirming: true });
    expect(reduce(b, { e: 'pick', side: 'local' })).toEqual(b);
    expect(reduce(b, { e: 'confirmPick' })).toEqual({ v: 'busy', task: { t: 'takeServer', server: { rev: 2, sha: 'a'.repeat(64) } }, slow: false });
    expect(run(choose, { e: 'pick', side: 'local' }, { e: 'confirmPick' }, { e: 'confirmPick' })).toMatchObject({ task: { t: 'keepLocal' } });
    const unreadable: View = { ...choose, server: side(null) };
    expect(reduce(unreadable, { e: 'pick', side: 'server' })).toEqual(unreadable);
    expect(reduce(unreadable, { e: 'pick', side: 'local' })).toEqual(unreadable);
  });
  it('고르지 않고 나가도 된다(나중에) — 켜짐으로', () => {
    expect(reduce(choose, { e: 'back' })).toEqual({ v: 'on' });
    expect(reduce({ ...choose, why: 'restore' }, { e: 'back' })).toEqual({ v: 'on' });
  });
  it('느림·실패·다시·나중에', () => {
    const b: View = { v: 'busy', task: { t: 'sync' }, slow: false };
    expect(reduce(b, { e: 'slow' })).toMatchObject({ slow: true });
    const f = reduce(b, { e: 'done', result: { r: 'failed', failure: 'offline' } });
    expect(f).toEqual({ v: 'failed', task: { t: 'sync' }, failure: 'offline' });
    expect(reduce(f, { e: 'retry' })).toEqual(b);
    expect(reduce(f, { e: 'back' })).toEqual({ v: 'on' });
    expect(reduce({ v: 'failed', task: { t: 'enable' }, failure: 'timeout' }, { e: 'back' })).toEqual({ v: 'intro' });
  });
  it('지우기는 인장 코드 끝 네 자를 직접 쳐야만 작업(빈·틀린·짧은 입력은 아님), 처음 자리는 기기 기록에서', () => {
    const ask = { e: 'askDelete', token: 'K7M2' } as const;
    expect(run({ v: 'on' }, ask, { e: 'confirmDelete', input: 'k7m2' })).toEqual({ v: 'busy', task: { t: 'delete' }, slow: false });
    expect(run({ v: 'on' }, ask, { e: 'confirmDelete', input: '' })).toEqual({ v: 'deleteConfirm', token: 'K7M2', mismatch: true });
    expect(run({ v: 'on' }, ask, { e: 'confirmDelete', input: 'K7M' })).toMatchObject({ mismatch: true });
    expect(run({ v: 'on' }, ask, { e: 'confirmDelete', input: 'K7M3' })).toMatchObject({ mismatch: true });
    expect(run({ v: 'on' }, ask, { e: 'back' })).toEqual({ v: 'on' });
    expect(deleteToken({ creature: 'ABCDK7M2', sha: null })).toBe('K7M2');
    expect(initialView({ state: 'deleting', deleteTries: 3 })).toEqual({ v: 'deleteCheck', tries: 3 });
    expect(reduce({ v: 'deleteCheck', tries: 0 }, { e: 'retry' })).toEqual({ v: 'busy', task: { t: 'deleteCheck' }, slow: false });
    expect(reduce({ v: 'busy', task: { t: 'delete' }, slow: false }, { e: 'done', result: { r: 'deleteUnknown', tries: 1 } })).toEqual({ v: 'deleteCheck', tries: 1 });
    // 출구('이 기기에서 끄기')는 몇 번 확인한 뒤에만
    expect(reduce({ v: 'deleteCheck', tries: 1 }, { e: 'forget' })).toEqual({ v: 'deleteCheck', tries: 1 });
    expect(reduce({ v: 'deleteCheck', tries: 2 }, { e: 'forget' })).toEqual({ v: 'busy', task: { t: 'forget' }, slow: false });
    expect(initialView(null)).toEqual({ v: 'intro' });
    expect(initialView({ state: 'moved' })).toEqual({ v: 'moved' });
  });
  it('이미 되찾아짐 → 안내 → 켜짐(지우는 갈래는 없다)', () => {
    const v = run({ v: 'busy', task: { t: 'recover', code: 'C', target: null }, slow: false }, { e: 'done', result: { r: 'already' } });
    expect(v).toEqual({ v: 'already' });
    expect(reduce(v, { e: 'continue' })).toEqual({ v: 'on' });
  });
  it('시작 사건(리뷰 생존 변이 M8): 오늘 미달 기록이면 묻지 않고 쉼, 통과 기록이면 묻지 않고 다음, 없으면 묻는다', () => {
    expect(startEvents('enable', { kind: 'wait' })).toEqual([{ e: 'start', purpose: 'enable' }, { e: 'age', ok: false }]);
    expect(startEvents('enable', { kind: 'passed' })).toEqual([{ e: 'start', purpose: 'enable' }, { e: 'age', ok: true }]);
    expect(startEvents('recover', { kind: 'ask' })).toEqual([{ e: 'start', purpose: 'recover' }]);
    const kv = memKV();
    recordAge(kv, 'under', T, TZ);
    expect(startEvents('enable', ageStatus(kv, T, TZ)).reduce(reduce, { v: 'intro' } as View)).toEqual({ v: 'ageUnder' });
  });
  it('되돌리기: 켜짐·꺼짐 어디서든 확인 한 번 뒤 작업', () => {
    expect(run({ v: 'on' }, { e: 'askRevert' }, { e: 'confirmRevert' })).toEqual({ v: 'busy', task: { t: 'revert' }, slow: false });
    expect(run({ v: 'intro' }, { e: 'askRevert' }, { e: 'back' })).toEqual({ v: 'intro' });
  });
});

describe('API 결과 갈래', () => {
  const http = (status: number, body: unknown) => classify({ kind: 'http', status, body: JSON.stringify(body) });
  it('상태 코드·오류 코드 → 갈래', () => {
    expect(http(429, { error: { code: 'save_quota' } })).toEqual({ kind: 'quota' });
    expect(http(429, { error: { code: 'rate_limited' } })).toEqual({ kind: 'failed', failure: 'rateLimited' });
    expect(http(503, {})).toEqual({ kind: 'failed', failure: 'unavailable' });
    expect(http(410, { error: { code: 'moved' } })).toEqual({ kind: 'moved' });
    // B2b: 401·410은 error.code로 가른다
    expect(http(401, { error: { code: 'unauthorized' } })).toEqual({ kind: 'signedOut' });
    expect(http(401, { error: { code: 'no_account' } })).toEqual({ kind: 'noAccount' });
    expect(http(410, { error: { code: 'no_account' } })).toEqual({ kind: 'alreadyGone' });
    expect(http(410, { error: { code: 'something' } })).toEqual({ kind: 'failed', failure: 'server' });
    expect(http(409, { error: { code: 'has_creature' } })).toEqual({ kind: 'hasCreature' });
    expect(http(409, { error: { code: 'save_conflict', details: { server: null } } })).toEqual({ kind: 'conflict', server: null });
    expect(http(409, { error: { code: 'save_conflict', details: { server: { rev: 'x' } } } })).toEqual({ kind: 'failed', failure: 'server' });
    expect(classify({ kind: 'timeout' })).toEqual({ kind: 'failed', failure: 'timeout' });
    expect(classify({ kind: 'network' })).toEqual({ kind: 'failed', failure: 'offline' });
  });
});

describe('작업(가짜 서버, 실제 계약 흐름)', () => {
  it('켜기: 로그인 → bootstrap → 첫 본 → 글귀. 글귀 확인 전 기록은 codeConfirmed=false', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1, 3));
    const r = await runTask({ t: 'enable' }, a.deps);
    expect(r).toMatchObject({ r: 'enabled' });
    const rec = readRecord(a.kv)!;
    expect(rec).toMatchObject({ state: 'on', rev: 1, conflict: false, codeConfirmed: false });
    expect(srv.peek('A')!.save!.sha).toBe(await sha(a.kv.getString(SAVE_KEYS.main)!));
    markCodeConfirmed(a.kv);
    expect(readRecord(a.kv)!.codeConfirmed).toBe(true);
    // 글귀 평문은 기기 어디에도 없다
    const code = (r as { code: string }).code;
    expect([...a.kv.m.values()].some((v) => v.includes(code) || v.includes(code.replace(/-/g, '')))).toBe(false);
  });

  it('오프라인이면 아무 기록도 남기지 않고 실패(다시 하면 이어짐)', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    srv.faults.offline = true;
    expect(await runTask({ t: 'enable' }, a.deps)).toEqual({ r: 'failed', failure: 'offline' });
    expect(a.kv.m.has(CLOUD_KEY)).toBe(false);
    srv.faults.offline = false;
    expect(await runTask({ t: 'enable' }, a.deps)).toMatchObject({ r: 'enabled' });
  });

  it('중단 뒤 다시: bootstrap 멱등·같은 sha 빨리 감기로 같은 결과', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    srv.faults.failNext = { status: 503, code: 'auth_unavailable' };
    expect(await runTask({ t: 'enable' }, a.deps)).toEqual({ r: 'failed', failure: 'unavailable' });
    expect(await runTask({ t: 'enable' }, a.deps)).toMatchObject({ r: 'enabled' });
    expect(srv.peek('A')!.save!.rev).toBe(1);
  });

  it('커밋 뒤 응답 끊김 → 같은 본을 다시 올리면 서버가 같은 sha로 빨리 감기(200) → rev만 맞춘다', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    a.kv.set(SAVE_KEYS.main, mong(1, 1));
    srv.faults.dropAfterCommit = true;
    expect(await runTask({ t: 'sync' }, a.deps)).toEqual({ r: 'failed', failure: 'offline' });
    expect(readRecord(a.kv)!.rev).toBe(1);
    expect(await runTask({ t: 'sync' }, a.deps)).toEqual({ r: 'synced' });
    expect(readRecord(a.kv)).toMatchObject({ rev: 2, conflict: false });
  });

  it('반쯤 성공(정본 3-4 문구 그대로): 409인데 server.sha가 내 본이면 충돌이 아니라 성공 — 서버가 빨리 감기 대신 409를 줘도', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    const mine = mong(1, 1);
    a.kv.set(SAVE_KEYS.main, mine);
    const mineSha = await sha(mine);
    const stub = createCloudApi({
      base: 'https://api.test',
      auth: a.deps.auth,
      fetch: async () => ({ ok: false, status: 409, text: async () => JSON.stringify({ error: { code: 'save_conflict', details: { server: { rev: 7, sha: mineSha, clientSavedAt: '2026-11-25T00:00:00Z', dayIndex: 1, strokesTotal: 0, envelopeVer: 2, simVer: 1, validated: true } } } }) }),
    });
    expect(await runTask({ t: 'sync' }, { ...a.deps, api: stub })).toEqual({ r: 'synced' });
    expect(readRecord(a.kv)).toMatchObject({ rev: 7, sha: mineSha, conflict: false });
  });

  it('다른 기기 본이 있으면 덮지 않는다: 충돌 표시 → 고르기 전까지 PUT 0번', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    await srv.putFromElsewhere('A', mong(9, 5));
    a.kv.set(SAVE_KEYS.main, mong(1, 1));
    expect(await runTask({ t: 'sync' }, a.deps)).toEqual({ r: 'conflict' });
    expect(readRecord(a.kv)!.conflict).toBe(true);
    const before = srv.log.filter((l) => l.startsWith('PUT')).length;
    expect(await runTask({ t: 'sync' }, a.deps)).toEqual({ r: 'conflict' });
    expect(srv.log.filter((l) => l.startsWith('PUT')).length).toBe(before);
    expect(srv.peek('A')!.save!.body).toBe(mong(9, 5));
  });

  it('나란히 → 서버 본 고름: 이 기기 본은 서버 conflict 칸 + 기기 사본, 그 뒤에 바꾼다', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    await srv.putFromElsewhere('A', mong(9, 5));
    const mine = mong(1, 1);
    a.kv.set(SAVE_KEYS.main, mine);
    const cmp = await runTask({ t: 'fetch', why: 'conflict' }, a.deps);
    expect(cmp).toMatchObject({ r: 'compare', local: { dayIndex: 1 }, server: { dayIndex: 5 } });
    const pick = (cmp as { pick: { rev: number; sha: string } }).pick;
    expect(await runTask({ t: 'takeServer', server: pick }, a.deps)).toEqual({ r: 'synced' });
    expect(a.adopted).toHaveLength(1);
    expect(a.adopted[0]!.dayIndex).toBe(5);
    expect(readPreRestore(a.kv, T)!.raw).toBe(mine);
    expect(srv.peek('A')!.conflicts.map((c) => c.body)).toContain(mine);
    expect(readRecord(a.kv)).toMatchObject({ conflict: false, rev: pick.rev });
  });

  it('고른 뒤 서버 본이 또 바뀌었으면 바꾸지 않고 다시 나란히', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    await srv.putFromElsewhere('A', mong(9, 5));
    a.kv.set(SAVE_KEYS.main, mong(1, 1));
    const cmp = (await runTask({ t: 'fetch', why: 'conflict' }, a.deps)) as { pick: { rev: number; sha: string } };
    await srv.putFromElsewhere('A', mong(8, 6));
    expect(await runTask({ t: 'takeServer', server: cmp.pick }, a.deps)).toEqual({ r: 'serverChanged', why: 'conflict' });
    expect(a.adopted).toHaveLength(0);
    expect(await runTask({ t: 'keepLocal', server: cmp.pick, why: 'conflict', park: false }, a.deps)).toEqual({ r: 'serverChanged', why: 'conflict' });
    expect(srv.peek('A')!.save!.body).toBe(mong(8, 6));
  });

  it('진 본을 못 맡기면(오프라인) 기기 본을 바꾸지 않는다', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    await srv.putFromElsewhere('A', mong(9, 5));
    const mine = mong(1, 1);
    a.kv.set(SAVE_KEYS.main, mine);
    const cmp = (await runTask({ t: 'fetch', why: 'conflict' }, a.deps)) as { pick: { rev: number; sha: string } };
    srv.faults.failNext = { status: 500, code: 'internal' };
    // getSave가 500 → 실패. 기기 본 그대로
    expect(await runTask({ t: 'takeServer', server: cmp.pick }, a.deps)).toEqual({ r: 'failed', failure: 'server' });
    expect(a.adopted).toHaveLength(0);
    expect(a.kv.getString(SAVE_KEYS.main)).toBe(mine);
  });

  it('이 기기 본 고름: keep_mine → 서버 본은 conflict 칸으로(30일)', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    await srv.putFromElsewhere('A', mong(9, 5));
    const mine = mong(1, 1);
    a.kv.set(SAVE_KEYS.main, mine);
    const cmp = (await runTask({ t: 'fetch', why: 'conflict' }, a.deps)) as { pick: { rev: number; sha: string } };
    expect(await runTask({ t: 'keepLocal', server: cmp.pick, why: 'conflict', park: false }, a.deps)).toEqual({ r: 'synced' });
    expect(srv.peek('A')!.save!.body).toBe(mine);
    expect(srv.peek('A')!.conflicts.map((c) => c.body)).toContain(mong(9, 5));
    expect(readRecord(a.kv)!.conflict).toBe(false);
  });

  it('새 기기 되찾기: 새 글귀, 서버 본은 고르기 전까지 올리지 않음, 옛 기기는 410 → 옮겨 감(로컬 그대로)', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1, 4));
    const en = (await runTask({ t: 'enable' }, a.deps)) as { code: string };
    const b = device(srv, 'B', mong(2, 0));
    expect(await runTask({ t: 'recover', code: 'WRONGWRONGWRONG0', target: null }, b.deps)).toEqual({ r: 'badCode' });
    const rec = await runTask({ t: 'recover', code: en.code.replace(/-/g, '').toLowerCase(), target: null }, b.deps);
    expect(rec).toMatchObject({ r: 'recovered', then: 'restore' });
    expect((rec as { code: string }).code).not.toBe(en.code);
    expect(readRecord(b.kv)).toMatchObject({ conflict: true, codeConfirmed: false });
    expect(await runTask({ t: 'sync' }, b.deps)).toEqual({ r: 'conflict' });
    const cmp = await runTask({ t: 'fetch', why: 'restore' }, b.deps);
    expect(cmp).toMatchObject({ r: 'compare', why: 'restore', server: { dayIndex: 4 }, local: { dayIndex: 0 } });
    // 옛 기기: 바뀐 본이 없으면 요청하지 않는다. 다음에 올릴 때 410
    expect(await runTask({ t: 'sync' }, a.deps)).toEqual({ r: 'synced' });
    a.kv.set(SAVE_KEYS.main, mong(1, 5));
    const aMain = a.kv.getString(SAVE_KEYS.main);
    expect(await runTask({ t: 'sync' }, a.deps)).toEqual({ r: 'moved' });
    expect(readRecord(a.kv)!.state).toBe('moved');
    expect(a.kv.getString(SAVE_KEYS.main)).toBe(aMain);
    expect(await a.deps.auth.token()).toBeNull();
  });

  it('[리뷰 C1 재현·B2b] 되찾기 커밋 뒤 응답 끊김 → 다시 부르면 200 replay, 대상 인장 코드가 같으면 정상 되찾기(같은 새 글귀), 지우지 않음', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1, 4));
    const en = (await runTask({ t: 'enable' }, a.deps)) as { code: string };
    const x = readRecord(a.kv)!.creature!;
    const serverBody = srv.peek('A')!.save!.body;
    const b = device(srv, 'B', mong(2, 0));
    srv.faults.dropAfterCommit = true;
    expect(await runTask({ t: 'recover', code: en.code, target: x }, b.deps)).toEqual({ r: 'failed', failure: 'offline' });
    expect(readRecovering(b.kv)).toMatchObject({ target: x });
    const newCode = formatCode(srv.peek('B')!.code16!);
    // 다시 누를 때는 인장 코드를 비워도(target null) 앞선 표시의 대상이 남아 있다
    const again = await runTask({ t: 'recover', code: en.code, target: null }, b.deps);
    expect(again).toEqual({ r: 'recovered', code: newCode, then: 'restore' });
    expect(srv.log.some((l) => l.startsWith('DELETE'))).toBe(false);
    expect(srv.peek('B')!.save!.body).toBe(serverBody);
    expect(readRecovering(b.kv)).toBeNull();
    expect(readRecord(b.kv)).toMatchObject({ conflict: true, codeConfirmed: false, creature: x, sub: expect.any(String) });
    const cmp = (await runTask({ t: 'fetch', why: 'restore' }, b.deps)) as { pick: { rev: number; sha: string } };
    expect(await runTask({ t: 'takeServer', server: cmp.pick }, b.deps)).toEqual({ r: 'synced' });
    expect(b.adopted[0]!.dayIndex).toBe(4);
  });

  it('[B2b] replay이고 대상이 같아도 이미 있는 기기 기록은 덮지 않는다', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1, 4));
    const en = (await runTask({ t: 'enable' }, a.deps)) as { code: string };
    const x = readRecord(a.kv)!.creature!;
    const b = device(srv, 'B', mong(2, 0));
    srv.faults.dropAfterCommit = true;
    await runTask({ t: 'recover', code: en.code, target: x }, b.deps);
    const keep = { ...FRESH_REC, creature: 'KEEP0000', sub: 'first-try', conflict: true, rev: 3 };
    b.kv.set(CLOUD_KEY, JSON.stringify(keep));
    expect(await runTask({ t: 'recover', code: en.code, target: x }, b.deps)).toMatchObject({ r: 'recovered' });
    expect(readRecord(b.kv)).toEqual(keep);
  });

  it('[R4·B2b] 토큰을 새로 받아도 DELETE가 계속 401 unauthorized면 지워짐이 아니라 확인 필요', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    const api = { ...a.deps.api, deleteMe: async () => ({ kind: 'signedOut' as const }) };
    expect(await runTask({ t: 'delete' }, { ...a.deps, api })).toEqual({ r: 'deleteUnknown', tries: 1 });
    expect(readRecord(a.kv)!.state).toBe('deleting');
  });

  it('[재리뷰 5 V3] 예전 계정 안내 뒤 같은 몽망이를 글귀로 되찾으면 표시를 지운다(지금 쓰는 계정을 지우라고 권하지 않음), 다른 몽망이면 남긴다', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1, 3));
    const en = (await runTask({ t: 'enable' }, a.deps)) as { code: string };
    const rec = readRecord(a.kv)!;
    // 백업으로 옮긴 새 폰: 기록만 오고 로그인 없음 → 예전 계정 안내
    const b = device(srv, 'B', a.kv.getString(SAVE_KEYS.main)!);
    b.kv.set(CLOUD_KEY, a.kv.getString(CLOUD_KEY)!);
    b.kv.set(SAVE_KEYS.main, mong(1, 4));
    expect(await runTask({ t: 'sync' }, b.deps)).toEqual({ r: 'orphaned' });
    expect(readUnconfirmedDelete(b.kv)).toMatchObject({ creature: rec.creature, reason: 'orphan' });
    // 다른 몽망이(Z)를 되찾으면 표시는 그대로
    const z = device(srv, 'Z', mong(9, 9));
    const zEn = (await runTask({ t: 'enable' }, z.deps)) as { code: string };
    const c = device(srv, 'C', mong(2));
    c.kv.set(UNCONFIRMED_KEY, b.kv.getString(UNCONFIRMED_KEY)!);
    expect(await runTask({ t: 'recover', code: zEn.code, target: null }, c.deps)).toMatchObject({ r: 'recovered' });
    expect(readUnconfirmedDelete(c.kv)).not.toBeNull();
    // 같은 몽망이를 되찾으면 표시를 지운다(되찾기로 sub는 바뀌므로 계정은 인장 코드로 본다)
    expect(await runTask({ t: 'recover', code: en.code, target: null }, b.deps)).toMatchObject({ r: 'recovered' });
    expect(readUnconfirmedDelete(b.kv)).toBeNull();
  });

  it('[재리뷰 5] JWT sub 디코드는 atob 없이 순수 JS(base64url·패딩 없음·UTF-8)', () => {
    const g = globalThis as { atob?: unknown };
    const saved = g.atob;
    g.atob = undefined;
    try {
      const payload = Buffer.from(JSON.stringify({ sub: '8f1c2d3e-몽-✓', role: 'authenticated' }), 'utf8').toString('base64url');
      expect(subOf(`h.${payload}.s`)).toBe('8f1c2d3e-몽-✓');
      expect(decodeBase64Url(Buffer.from('a?b>c', 'utf8').toString('base64url'))).toBe('a?b>c');
      expect(decodeBase64Url(Buffer.from('a?b>c', 'utf8').toString('base64'))).toBe('a?b>c');
      expect(decodeBase64Url('a$b')).toBeNull();
      expect(subOf('nodots')).toBeNull();
      expect(subOf(`h.${Buffer.from('{"x":1}').toString('base64url')}.s`)).toBeNull();
    } finally {
      g.atob = saved;
    }
  });

  it('[B2b] replay인데 대상 인장 코드가 다르면 정상 되찾기로 보지 않고 나란히, 기존 기록은 덮지 않는다', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1, 4));
    const en = (await runTask({ t: 'enable' }, a.deps)) as { code: string };
    const b = device(srv, 'B', mong(2, 0));
    srv.faults.dropAfterCommit = true;
    await runTask({ t: 'recover', code: en.code, target: 'ZZZZZZZZ' }, b.deps);
    const keep = { ...FRESH_REC, creature: 'KEEP0000', sub: 'kept', conflict: true };
    b.kv.set(CLOUD_KEY, JSON.stringify(keep));
    expect(await runTask({ t: 'recover', code: en.code, target: null }, b.deps)).toMatchObject({ r: 'compare', note: 'hasCreature' });
    expect(readRecord(b.kv)).toEqual(keep);
  });

  it('[리뷰 C1] 대상 인장 코드를 모르면 반쯤 성공이어도 성공으로 보지 않고 나란히(안내 hasCreature), 지우지 않음', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1, 4));
    const en = (await runTask({ t: 'enable' }, a.deps)) as { code: string };
    const b = device(srv, 'B', srv.peek('A')!.save!.body);
    srv.faults.dropAfterCommit = true;
    await runTask({ t: 'recover', code: en.code, target: null }, b.deps);
    // 두 본이 같아도 sha로 성공을 판정하지 않는다(리뷰 R1)
    expect(await runTask({ t: 'recover', code: en.code, target: null }, b.deps)).toMatchObject({ r: 'compare', note: 'hasCreature' });
    expect(srv.log.some((l) => l.startsWith('DELETE'))).toBe(false);
  });

  it('[재리뷰 R1 재현] 이 기기가 이미 Y를 맡겨 동기된 상태에서 X의 글귀 → 성공이라 하지 않고, Y의 기기 기록을 덮지 않으며, X는 그대로', async () => {
    const srv = createFakeServer(sha);
    const xDev = device(srv, 'X', mong(5, 6));
    const xEn = (await runTask({ t: 'enable' }, xDev.deps)) as { code: string };
    const xCode = readRecord(xDev.kv)!.creature!;
    const xBody = srv.peek('X')!.save!.body;
    const y = device(srv, 'Y', mong(7, 3));
    await runTask({ t: 'enable' }, y.deps);
    markCodeConfirmed(y.kv);
    const yRec = readRecord(y.kv)!;
    for (const target of [null, xCode]) {
      const r = await runTask({ t: 'recover', code: xEn.code, target }, y.deps);
      expect(r).not.toEqual({ r: 'already' });
      expect(r).toMatchObject({ r: 'compare', why: 'conflict', note: 'hasCreature' });
      expect(readRecord(y.kv)).toEqual(yRec);
    }
    expect(srv.peek('X')!.save!.body).toBe(xBody);
    expect(srv.log.some((l) => l.startsWith('DELETE'))).toBe(false);
    // X의 글귀는 여전히 쓸 수 있다(서버가 글귀를 쓰기 전에 거절)
    const z = device(srv, 'Z', mong(8, 0));
    expect(await runTask({ t: 'recover', code: xEn.code, target: null }, z.deps)).toMatchObject({ r: 'recovered' });
  });

  it('[재리뷰] 되찾기에서 이 기기를 고르면 되찾은 본은 서버 conflict 칸에도, 기기 parked 칸(30일)에도 남고, 다시 골라 이어 갈 수 있다', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1, 4));
    const en = (await runTask({ t: 'enable' }, a.deps)) as { code: string };
    const xBody = srv.peek('A')!.save!.body;
    const b = device(srv, 'B', mong(2, 1));
    await runTask({ t: 'recover', code: en.code, target: null }, b.deps);
    const cmp = (await runTask({ t: 'fetch', why: 'restore' }, b.deps)) as { pick: { rev: number; sha: string } };
    expect(await runTask({ t: 'keepLocal', server: cmp.pick, why: 'restore', park: true }, b.deps)).toEqual({ r: 'synced' });
    expect(srv.peek('B')!.conflicts.map((c) => c.body)).toContain(xBody);
    expect(readParked(b.kv, T)!.raw).toBe(xBody);
    expect(readParked(b.kv, T + 29 * 86_400_000)).not.toBeNull();
    expect(readParked(b.kv, T + 31 * 86_400_000)!.expired).toBe(true); // 30일이 지나면 만료됨 표시만(지우지 않는다)
    // 공방 노트 → 다시 나란히 → 되찾은 본 고름(맞바꾸기: 지금 본은 parked 칸으로)
    const slot = readParked(b.kv, T)!.id;
    expect(reduce({ v: 'on' }, { e: 'openParked', slot })).toEqual({ v: 'busy', task: { t: 'fetch', why: 'parked', slot }, slow: false });
    const again = await runTask({ t: 'fetch', why: 'parked', slot }, b.deps);
    expect(again).toMatchObject({ r: 'compare', why: 'parked', server: { dayIndex: 4 }, local: { dayIndex: 1 } });
    const v = reduce(reduce(reduce({ v: 'busy', task: { t: 'fetch', why: 'parked' }, slow: false }, { e: 'done', result: again }), { e: 'pick', side: 'server' }), { e: 'confirmPick' });
    expect(reduce(v, { e: 'confirmPick' })).toEqual({ v: 'busy', task: { t: 'takeParked', slot }, slow: false });
    const mine = b.kv.getString(SAVE_KEYS.main);
    expect(await runTask({ t: 'takeParked', slot }, b.deps)).toEqual({ r: 'synced' });
    expect(b.adopted.at(-1)!.dayIndex).toBe(4);
    expect(readParked(b.kv, T)!.raw).toBe(mine);
  });

  it('[재리뷰 2 M-d] 서버 conflict 칸이 3벌 한도로 밀려도 기기 parked 칸은 30일 동안 그대로', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1, 4));
    const en = (await runTask({ t: 'enable' }, a.deps)) as { code: string };
    const xBody = srv.peek('A')!.save!.body;
    const b = device(srv, 'B', mong(2, 1));
    await runTask({ t: 'recover', code: en.code, target: null }, b.deps);
    const cmp = (await runTask({ t: 'fetch', why: 'restore' }, b.deps)) as { pick: { rev: number; sha: string } };
    await runTask({ t: 'keepLocal', server: cmp.pick, why: 'restore', park: true }, b.deps);
    for (let i = 0; i < 4; i++) {
      await srv.putFromElsewhere('B', mong(20 + i, 6 + i));
      b.kv.set(SAVE_KEYS.main, mong(2, 2 + i));
      const c = (await runTask({ t: 'fetch', why: 'conflict' }, b.deps)) as { pick: { rev: number; sha: string } };
      await runTask({ t: 'keepLocal', server: c.pick, why: 'conflict', park: false }, b.deps);
    }
    expect(srv.peek('B')!.conflicts.map((c) => c.body)).not.toContain(xBody);
    expect(readParked(b.kv, T + 20 * 86_400_000)!.raw).toBe(xBody);
    expect(await runTask({ t: 'fetch', why: 'parked' }, b.deps)).toMatchObject({ r: 'compare', server: { dayIndex: 4 } });
  });

  it('[재리뷰 2 M-b] 인장 칸을 비운 반쯤 성공(has_creature)에서 이 기기를 골라도 밀려나는 서버 본을 parked로 남긴다', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1, 4));
    const en = (await runTask({ t: 'enable' }, a.deps)) as { code: string };
    const xBody = srv.peek('A')!.save!.body;
    const b = device(srv, 'B', mong(2, 0));
    srv.faults.dropAfterCommit = true;
    await runTask({ t: 'recover', code: en.code, target: null }, b.deps);
    const r = await runTask({ t: 'recover', code: en.code, target: null }, b.deps);
    expect(r).toMatchObject({ r: 'compare', note: 'hasCreature' });
    const v = reduce(reduce(reduce({ v: 'busy', task: { t: 'recover', code: 'X', target: null }, slow: false }, { e: 'done', result: r }), { e: 'pick', side: 'local' }), { e: 'confirmPick' });
    const task = reduce(v, { e: 'confirmPick' });
    expect(task).toMatchObject({ v: 'busy', task: { t: 'keepLocal', park: true } });
    expect(await runTask((task as { task: Parameters<typeof runTask>[0] }).task, b.deps)).toEqual({ r: 'synced' });
    expect(readParked(b.kv, T)!.raw).toBe(xBody);
  });

  it('[재리뷰 2 M-b] parked로 남길 서버 본이 고른 그 본이 아니면(sha 다름) 고르지 않고 다시 나란히', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1, 4));
    const en = (await runTask({ t: 'enable' }, a.deps)) as { code: string };
    const b = device(srv, 'B', mong(2, 1));
    await runTask({ t: 'recover', code: en.code, target: null }, b.deps);
    const cmp = (await runTask({ t: 'fetch', why: 'restore' }, b.deps)) as { pick: { rev: number; sha: string } };
    expect(await runTask({ t: 'keepLocal', server: { ...cmp.pick, sha: 'f'.repeat(64) }, why: 'restore', park: true }, b.deps)).toEqual({ r: 'serverChanged', why: 'conflict' });
    expect(b.kv.getString(PARKED_KEY)).toBeUndefined();
  });

  it('[재리뷰 2 M-c] 인장 칸에 이 기기 몽망이의 코드를 넣으면 서버를 부르지 않고 바로 알려 준다(이미 되찾음으로 안내하지 않음)', async () => {
    const srv = createFakeServer(sha);
    const xDev = device(srv, 'X', mong(5, 6));
    const xEn = (await runTask({ t: 'enable' }, xDev.deps)) as { code: string };
    const y = device(srv, 'Y', mong(7, 3));
    await runTask({ t: 'enable' }, y.deps);
    const own = readRecord(y.kv)!.creature!;
    const before = srv.log.length;
    expect(await runTask({ t: 'recover', code: xEn.code, target: own }, y.deps)).toEqual({ r: 'ownSeal' });
    expect(srv.log.length).toBe(before);
    expect(reduce({ v: 'busy', task: { t: 'recover', code: 'X', target: own }, slow: false }, { e: 'done', result: { r: 'ownSeal' } })).toEqual({ v: 'recoverInput', error: 'ownSeal' });
  });

  it('[리뷰 M3] 서버 본을 고른 뒤 바꾸기 직전까지 이 기기 본이 바뀌면 바꾸지 않고 다시 나란히(preRestore도 쓰지 않음)', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    await srv.putFromElsewhere('A', mong(9, 5));
    a.kv.set(SAVE_KEYS.main, mong(1, 1));
    const cmp = (await runTask({ t: 'fetch', why: 'conflict' }, a.deps)) as { pick: { rev: number; sha: string } };
    const api = { ...a.deps.api, addConflict: async (b: string, at: string) => {
      const r = await a.deps.api.addConflict(b, at);
      a.kv.set(SAVE_KEYS.main, mong(1, 2)); // 올리는 동안 게임이 저장
      return r;
    } };
    expect(await runTask({ t: 'takeServer', server: cmp.pick }, { ...a.deps, api })).toEqual({ r: 'localChanged', why: 'conflict' });
    expect(a.adopted).toHaveLength(0);
    expect(a.kv.getString(PRE_RESTORE_KEY)).toBeUndefined();
    expect(a.kv.getString(SAVE_KEYS.main)).toBe(mong(1, 2));
  });

  it('[재리뷰 R4·B2b] 지우기 커밋 뒤 응답 끊김 → 다시 보낸 DELETE가 410 no_account, 맡겨 두기를 켠 로그인과 같으면 지워짐 확정', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    srv.faults.dropAfterCommit = true;
    expect(await runTask({ t: 'delete' }, a.deps)).toEqual({ r: 'deleted' });
    expect(readRecord(a.kv)).toBeNull();
    expect(srv.log.filter((l) => l === 'DELETE me')).toHaveLength(2);
  });

  it('[B2b 리뷰 H1 재현] 백업으로 옮긴 새 폰: 기록은 있고 로그인이 없으면 조용히 끄지 않고 예전 계정 안내, 서버의 맡겨 두기는 그대로', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1, 3));
    await runTask({ t: 'enable' }, a.deps);
    const rec = readRecord(a.kv)!;
    const b = device(srv, 'B', a.kv.getString(SAVE_KEYS.main)!);
    b.kv.set(CLOUD_KEY, a.kv.getString(CLOUD_KEY)!); // OS 백업이 기기 기록을 옮김(세션은 백업에서 빠짐)
    b.kv.set(SAVE_KEYS.main, mong(1, 4));
    expect(await runTask({ t: 'sync' }, b.deps)).toEqual({ r: 'orphaned' });
    expect(readRecord(b.kv)).toBeNull();
    expect(readUnconfirmedDelete(b.kv)).toMatchObject({ creature: rec.creature, reason: 'orphan', sub: rec.sub, abandoned: true });
    expect(srv.peek('A')).not.toBeNull();
    expect(srv.log.some((l) => l.startsWith('DELETE'))).toBe(false);
    expect(reduce({ v: 'busy', task: { t: 'sync' }, slow: false }, { e: 'done', result: { r: 'orphaned' } })).toEqual({ v: 'orphaned' });
  });

  it('[B2b 리뷰 H1 재현] 새 폰이 새 로그인으로 지우기를 눌러 410 no_account가 와도 로그인이 다르면 지워짐을 확정하지 않는다(확인 필요)', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1, 3));
    await runTask({ t: 'enable' }, a.deps);
    const b = device(srv, 'B', a.kv.getString(SAVE_KEYS.main)!);
    b.kv.set(CLOUD_KEY, a.kv.getString(CLOUD_KEY)!);
    await b.deps.auth.signIn(); // 새 폰의 새 익명 로그인(다른 sub)
    expect(await runTask({ t: 'delete' }, b.deps)).toEqual({ r: 'deleteUnknown', tries: 1 });
    expect(readRecord(b.kv)!.state).toBe('deleting');
    expect(srv.peek('A')).not.toBeNull();
  });

  it('[B2b 리뷰 H1] 401 no_account: 켠 로그인과 같으면 끝난 로그인으로 정리(ended), 다르면 예전 계정 안내(orphaned)', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    // 다른 길(웹 삭제 등)로 지워짐 → 같은 로그인으로 맡기기
    srv.faults.dropAfterCommit = true;
    await a.deps.api.deleteMe();
    a.kv.set(SAVE_KEYS.main, mong(1, 2));
    expect(await runTask({ t: 'sync' }, a.deps)).toEqual({ r: 'ended' });
    expect(readRecord(a.kv)).toBeNull();
    expect(readUnconfirmedDelete(a.kv)).toBeNull();
    // 다른 로그인으로 기록이 남은 기기
    const b = device(srv, 'B', mong(2));
    await runTask({ t: 'enable' }, b.deps);
    const brec = readRecord(b.kv)!;
    b.kv.set(CLOUD_KEY, JSON.stringify({ ...brec, sub: 'someone-else' }));
    await b.deps.api.deleteMe();
    b.kv.set(SAVE_KEYS.main, mong(2, 2));
    expect(await runTask({ t: 'sync' }, b.deps)).toEqual({ r: 'orphaned' });
    expect(readUnconfirmedDelete(b.kv)).toMatchObject({ reason: 'orphan', creature: brec.creature });
  });

  it('[재리뷰 2 M-a] 확인 필요에서 영구히 갇히지 않는다: 몇 번 확인 뒤 이 기기에서 끄기 → 표시 + 다시 지우기 길 → 실제로 지워졌으면(같은 로그인 410) 다시 지우기가 확정', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    const creature = readRecord(a.kv)!.creature;
    // DELETE는 서버에 닿았지만 응답이 끊기고, 그 뒤 확인은 연결이 없어 모름
    srv.faults.dropAfterCommit = true;
    await a.deps.api.deleteMe();
    srv.faults.offline = true;
    expect(await runTask({ t: 'delete' }, a.deps)).toEqual({ r: 'deleteUnknown', tries: 1 });
    expect(await runTask({ t: 'deleteCheck' }, a.deps)).toEqual({ r: 'deleteUnknown', tries: 2 });
    srv.faults.offline = false;
    expect(await runTask({ t: 'forget' }, a.deps)).toEqual({ r: 'forgotten' });
    expect(readRecord(a.kv)).toBeNull();
    expect(readUnconfirmedDelete(a.kv)).toMatchObject({ creature, reason: 'delete' });
    expect(reduce({ v: 'forgotten' }, { e: 'continue' })).toEqual({ v: 'intro' });
    expect(await runTask({ t: 'retryForgotten' }, a.deps)).toEqual({ r: 'deleted' });
    expect(readUnconfirmedDelete(a.kv)).toBeNull();
    expect(await runTask({ t: 'enable' }, a.deps)).toMatchObject({ r: 'enabled' });
    expect(readRecord(a.kv)!.creature).not.toBe(creature);
  });

  it('[재리뷰 2 M-a] 끈 뒤 다시 지우기: 서버에 남아 있었으면 202 → 지웠어요, 표시를 지운다', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    srv.faults.offline = true;
    await runTask({ t: 'delete' }, a.deps);
    await runTask({ t: 'deleteCheck' }, a.deps);
    srv.faults.offline = false;
    expect(await runTask({ t: 'forget' }, a.deps)).toEqual({ r: 'forgotten' });
    expect(srv.peek('A')).not.toBeNull();
    expect(await runTask({ t: 'retryForgotten' }, a.deps)).toEqual({ r: 'deleted' });
    expect(readUnconfirmedDelete(a.kv)).toBeNull();
  });

  it('[재리뷰 R4·B2b] DELETE가 닿지 않고(오프라인) 다음 확인이 401 unauthorized여도 지웠다고 하지 않는다 — 토큰을 새로 받아 다시 보낸 202에서만 지워짐', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    srv.faults.offline = true;
    expect(await runTask({ t: 'delete' }, a.deps)).toEqual({ r: 'deleteUnknown', tries: 1 });
    srv.faults.offline = false;
    expect(srv.peek('A')).not.toBeNull();
    srv.faults.failNext = { status: 401, code: 'unauthorized' };
    expect(await runTask({ t: 'deleteCheck' }, a.deps)).toEqual({ r: 'deleted' });
    expect(srv.peek('A')).toBeNull();
    expect(readRecord(a.kv)).toBeNull();
  });

  it('[재리뷰 2 M-e] 맡겨 두는 중에 되돌리면(맞바꾸기) 다음 맡기기가 서버 현재본을 말없이 덮지 않고 나란히 고르기를 거친다', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1, 2));
    await runTask({ t: 'enable' }, a.deps);
    const serverBody = srv.peek('A')!.save!.body;
    keepPreRestore(a.kv, mong(9, 7), T);
    expect(await runTask({ t: 'revert' }, a.deps)).toEqual({ r: 'reverted' });
    expect(readRecord(a.kv)!.conflict).toBe(true);
    const puts = srv.log.filter((l) => l.startsWith('PUT')).length;
    expect(await runTask({ t: 'sync' }, a.deps)).toEqual({ r: 'conflict' });
    expect(srv.log.filter((l) => l.startsWith('PUT')).length).toBe(puts);
    expect(srv.peek('A')!.save!.body).toBe(serverBody);
  });

  it('[재리뷰 2 M-f/N9] 되돌리기·parked 맞바꾸기에서 바꾸기가 실패하면 칸을 원래 본으로 되돌린다(어느 본도 잃지 않음)', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1, 2));
    const cur = a.kv.getString(SAVE_KEYS.main)!;
    const before = mong(9, 7);
    keepPreRestore(a.kv, before, T - 1000);
    const failing = { ...a.deps, local: { ...a.deps.local, adopt: () => false } };
    expect(await runTask({ t: 'revert' }, failing)).toEqual({ r: 'failed', failure: 'device' });
    expect(readPreRestore(a.kv, T)).toEqual({ at: T - 1000, raw: before, expired: false });
    expect(a.kv.getString(SAVE_KEYS.main)).toBe(cur);
    a.kv.set(PARKED_KEY, JSON.stringify([{ id: 'p1', at: T - 2000, raw: before }]));
    expect(await runTask({ t: 'takeParked', slot: 'p1' }, failing)).toEqual({ r: 'failed', failure: 'device' });
    expect(readParked(a.kv, T)).toEqual({ id: 'p1', at: T - 2000, raw: before, expired: false });
    expect(a.kv.getString(SAVE_KEYS.main)).toBe(cur);
  });

  it('[리뷰 H2] 첫 DELETE가 401(토큰 만료)이면 토큰을 새로 받아 다시 보내 202 → 지워짐', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    srv.expireSession('A');
    expect(await runTask({ t: 'delete' }, a.deps)).toEqual({ r: 'deleted' });
    expect(srv.peek('A')).toBeNull();
    expect(readRecord(a.kv)).toBeNull();
  });

  it('[재리뷰 3 Q1] 30일 안에 이 기기를 두 번 골라도 앞선 parked 본이 덮이지 않는다 — 칸이 다 차면 고르기 자체를 멈추고 아무것도 바꾸지 않음', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1, 4));
    const en = (await runTask({ t: 'enable' }, a.deps)) as { code: string };
    const b = device(srv, 'B', mong(2, 1));
    await runTask({ t: 'recover', code: en.code, target: null }, b.deps);
    const bodies: string[] = [];
    for (let i = 0; i <= PARKED_SLOTS; i++) {
      if (i > 0) await srv.putFromElsewhere('B', mong(30 + i, 10 + i));
      const cmp = (await runTask({ t: 'fetch', why: 'restore' }, b.deps)) as { pick: { rev: number; sha: string } };
      const serverBody = srv.peek('B')!.save!.body;
      const puts = srv.log.filter((l) => l.startsWith('PUT')).length;
      const r = await runTask({ t: 'keepLocal', server: cmp.pick, why: 'restore', park: true }, b.deps);
      if (i < PARKED_SLOTS) {
        expect(r).toEqual({ r: 'synced' });
        bodies.push(serverBody);
      } else {
        expect(r).toEqual({ r: 'parkFull' });
        expect(srv.log.filter((l) => l.startsWith('PUT')).length).toBe(puts);
        expect(srv.peek('B')!.save!.body).toBe(serverBody);
      }
    }
    expect(readParkedList(b.kv, T).map((p) => p.raw).sort()).toEqual([...bodies].sort());
    expect(reduce({ v: 'busy', task: { t: 'keepLocal', server: { rev: 1, sha: 'x' }, why: 'restore', park: true }, slow: false }, { e: 'done', result: { r: 'parkFull' } })).toEqual({ v: 'parkFull' });
    // 같은 본을 다시 두면 칸을 더 쓰지 않는다
    expect(addParked(b.kv, bodies[0]!, T)).toBe('ok');
    expect(readParkedList(b.kv, T)).toHaveLength(PARKED_SLOTS);
  });

  it('[재리뷰 3 Q1] 업로드가 실패해도(오프라인) 앞선 parked 본은 그대로', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1, 4));
    const en = (await runTask({ t: 'enable' }, a.deps)) as { code: string };
    const b = device(srv, 'B', mong(2, 1));
    await runTask({ t: 'recover', code: en.code, target: null }, b.deps);
    const first = mong(40, 40);
    addParked(b.kv, first, T - 1000);
    const cmp = (await runTask({ t: 'fetch', why: 'restore' }, b.deps)) as { pick: { rev: number; sha: string } };
    const api = { ...b.deps.api, putSave: async () => ({ kind: 'failed' as const, failure: 'offline' as const }) };
    expect(await runTask({ t: 'keepLocal', server: cmp.pick, why: 'restore', park: true }, { ...b.deps, api })).toEqual({ r: 'failed', failure: 'offline' });
    expect(readParkedList(b.kv, T).map((p) => p.raw)).toContain(first);
  });

  it('[재리뷰 5 V4·V5] 기기 칸은 자동으로 지우지 않는다: 시계를 하루씩 33번·한 번에 40일 앞당겨도 원문은 그대로, 30일이 지나면 만료됨 표시만', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    let now = T;
    const deps = { ...a.deps, now: () => now };
    addParked(a.kv, mong(3, 3), T - 1000);
    addParked(a.kv, mong(4, 4), T - 2000);
    keepPreRestore(a.kv, mong(5, 5), T - 3000);
    const parkedRaw = a.kv.getString(PARKED_KEY);
    const preRaw = a.kv.getString(PRE_RESTORE_KEY);
    for (let k = 1; k <= 33; k++) {
      now = T + k * 86_400_000;
      await runTask({ t: 'sync' }, deps);
    }
    now = T + 73 * 86_400_000;
    await runTask({ t: 'sync' }, deps);
    await runTask({ t: 'sync' }, deps);
    expect(a.kv.getString(PARKED_KEY)).toBe(parkedRaw);
    expect(a.kv.getString(PRE_RESTORE_KEY)).toBe(preRaw);
    expect(readParkedList(a.kv, now).map((p) => p.expired)).toEqual([true, true]);
    expect(readPreRestore(a.kv, now)!.expired).toBe(true);
    expect(readParkedList(a.kv, T).map((p) => p.expired)).toEqual([false, false]);
    expect(readPreRestore(a.kv, T)!.expired).toBe(false);
  });

  it('[재리뷰 5] 만료된 칸도 고르거나 되돌릴 수 있고, 비우기는 사용자가 직접(확인 한 번) — parked·preRestore', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1, 2));
    const later = T + 40 * 86_400_000;
    const deps = { ...a.deps, now: () => later };
    addParked(a.kv, mong(3, 3), T);
    keepPreRestore(a.kv, mong(5, 5), T);
    const slot = readParkedList(a.kv, later)[0]!;
    expect(slot.expired).toBe(true);
    const cmp = await runTask({ t: 'fetch', why: 'parked', slot: slot.id }, deps);
    expect(cmp).toMatchObject({ r: 'compare', why: 'parked', pick: { slot: slot.id } });
    const v = reduce({ v: 'busy', task: { t: 'fetch', why: 'parked', slot: slot.id }, slow: false }, { e: 'done', result: cmp });
    const ask = reduce(v, { e: 'askDropParked', slot: slot.id });
    expect(ask).toEqual({ v: 'dropParkedConfirm', slot: slot.id, back: 'on' });
    expect(reduce(ask, { e: 'back' })).toEqual({ v: 'on' });
    expect(await runTask({ t: 'dropParked', slot: slot.id }, deps)).toEqual({ r: 'parkedDropped' });
    expect(a.kv.getString(PARKED_KEY)).toBeUndefined();
    const rv: View = { v: 'revertConfirm', back: 'on', now: null, before: null };
    const askPre = reduce(rv, { e: 'askDropPre' });
    expect(askPre).toEqual({ v: 'dropPreConfirm', back: 'on' });
    expect(reduce(askPre, { e: 'confirmDropPre' })).toEqual({ v: 'busy', task: { t: 'dropPre' }, slow: false });
    expect(reduce(askPre, { e: 'back' })).toEqual({ v: 'on' });
    expect(await runTask({ t: 'revert' }, deps)).toEqual({ r: 'reverted' }); // 만료돼도 되돌릴 수 있다
    expect(await runTask({ t: 'dropPre' }, deps)).toEqual({ r: 'parkedDropped' });
    expect(a.kv.getString(PRE_RESTORE_KEY)).toBeUndefined();
  });

  it('[재리뷰 4 S4] 칸이 가득 차면 한 칸을 비우는 길(확인 한 번)이 있고, 비운 뒤 이 기기를 다시 고를 수 있다', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1, 4));
    const en = (await runTask({ t: 'enable' }, a.deps)) as { code: string };
    const b = device(srv, 'B', mong(2, 1));
    await runTask({ t: 'recover', code: en.code, target: null }, b.deps);
    for (let i = 0; i < PARKED_SLOTS; i++) addParked(b.kv, mong(50 + i, i), T - i);
    const cmp = (await runTask({ t: 'fetch', why: 'restore' }, b.deps)) as { pick: { rev: number; sha: string } };
    expect(await runTask({ t: 'keepLocal', server: cmp.pick, why: 'restore', park: true }, b.deps)).toEqual({ r: 'parkFull' });
    const slot = readParkedList(b.kv, T)[2]!.id;
    const v = run({ v: 'parkFull' }, { e: 'askDropParked', slot });
    expect(v).toEqual({ v: 'dropParkedConfirm', slot, back: 'parkFull' });
    expect(reduce(v, { e: 'back' })).toEqual({ v: 'parkFull' });
    expect(reduce(v, { e: 'confirmDropParked' })).toEqual({ v: 'busy', task: { t: 'dropParked', slot }, slow: false });
    expect(await runTask({ t: 'dropParked', slot }, b.deps)).toEqual({ r: 'parkedDropped' });
    expect(readParkedList(b.kv, T)).toHaveLength(PARKED_SLOTS - 1);
    expect(await runTask({ t: 'keepLocal', server: cmp.pick, why: 'restore', park: true }, b.deps)).toEqual({ r: 'synced' });
    expect(readParkedList(b.kv, T)).toHaveLength(PARKED_SLOTS);
  });

  it('[재리뷰 4 S1 재현] 안내 닫기 = 옛 로그인 버리기(확인 한 번): DELETE가 닿지 않았던 계정에 켜기가 다시 붙지 않는다. 표시는 남는다', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    const old = readRecord(a.kv)!.creature;
    srv.faults.offline = true;
    await runTask({ t: 'delete' }, a.deps);
    await runTask({ t: 'deleteCheck' }, a.deps);
    srv.faults.offline = false;
    await runTask({ t: 'forget' }, a.deps);
    expect(srv.peek('A')).not.toBeNull();
    const ask = reduce({ v: 'intro' }, { e: 'askDismissOld' });
    expect(ask).toEqual({ v: 'dismissOldConfirm', back: 'intro' });
    expect(reduce(ask, { e: 'back' })).toEqual({ v: 'intro' });
    expect(reduce(ask, { e: 'confirmDismissOld' })).toEqual({ v: 'busy', task: { t: 'abandonOld' }, slow: false });
    expect(await runTask({ t: 'abandonOld' }, a.deps)).toEqual({ r: 'abandoned' });
    expect(await a.deps.auth.token()).toBeNull();
    expect(readUnconfirmedDelete(a.kv)).toMatchObject({ creature: old, abandoned: true });
    // 버린 뒤에는 되묻지 않고(이미 버렸으므로) 켜기가 새 계정으로
    expect(startEvents('enable', { kind: 'passed' }, readUnconfirmedDelete(a.kv)!.abandoned === false)).toEqual([{ e: 'start', purpose: 'enable' }, { e: 'age', ok: true }]);
    expect(await runTask({ t: 'enable' }, a.deps)).toMatchObject({ r: 'enabled' });
    expect(readRecord(a.kv)!.creature).not.toBe(old);
    expect(readUnconfirmedDelete(a.kv)).toMatchObject({ creature: old });
  });

  it('[재리뷰 4 S2 재현] 실제로 지워진 뒤 끄고 닫아도 켜기가 영원히 실패하지 않는다(지워진 계정의 남은 로그인이면 새로 시작)', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    srv.faults.dropAfterCommit = true;
    await runTask({ t: 'delete' }, a.deps);
    await runTask({ t: 'deleteCheck' }, a.deps);
    await runTask({ t: 'forget' }, a.deps);
    expect(await runTask({ t: 'abandonOld' }, a.deps)).toEqual({ r: 'abandoned' });
    expect(await runTask({ t: 'enable' }, a.deps)).toMatchObject({ r: 'enabled' });
    // 표시가 없어도(예: 기록이 지워진 기기) 지워진 계정의 남은 로그인 401이면 한 번 새로 시작한다
    const b = device(srv, 'B', mong(2));
    await runTask({ t: 'enable' }, b.deps);
    srv.faults.dropAfterCommit = true;
    await b.deps.api.deleteMe();
    b.kv.remove(CLOUD_KEY);
    expect(await runTask({ t: 'enable' }, b.deps)).toMatchObject({ r: 'enabled' });
  });

  it('[재리뷰 4 S2] 되찾기도 지워진 계정의 남은 로그인(401)이면 로그인을 비우고 한 번 새로 시작한다', async () => {
    const srv = createFakeServer(sha);
    const x = device(srv, 'X', mong(5, 6));
    const xEn = (await runTask({ t: 'enable' }, x.deps)) as { code: string };
    const b = device(srv, 'B', mong(2));
    await runTask({ t: 'enable' }, b.deps);
    srv.faults.dropAfterCommit = true;
    await b.deps.api.deleteMe();
    b.kv.remove(CLOUD_KEY);
    expect(await runTask({ t: 'recover', code: xEn.code, target: null }, b.deps)).toMatchObject({ r: 'recovered' });
  });

  it('[재리뷰 3 Q3·Q6] 확인하지 못한 지우기가 남은 채 켜기·되찾기를 시작하면 먼저 묻는다(다시 지우기 / 두고 새로 시작)', () => {
    for (const purpose of ['enable', 'recover'] as const) {
      const evs = startEvents(purpose, { kind: 'passed' }, true);
      expect(evs).toEqual([{ e: 'start', purpose, unconfirmed: true }]);
      const v = run({ v: 'intro' }, ...evs);
      expect(v).toEqual({ v: 'oldAccount', purpose });
      expect(reduce(v, { e: 'skipOld' })).toEqual({ v: 'age', purpose });
      const retry = reduce(v, { e: 'retryOld' });
      expect(retry).toEqual({ v: 'busy', task: { t: 'retryForgotten', then: purpose }, slow: false });
      expect(reduce(retry, { e: 'done', result: { r: 'deleted' } })).toEqual({ v: 'oldCleared', purpose });
      expect(reduce(retry, { e: 'done', result: { r: 'failed', failure: 'signedOut' } })).toMatchObject({ v: 'failed' });
      expect(reduce({ v: 'failed', task: { t: 'retryForgotten', then: purpose }, failure: 'signedOut' }, { e: 'back' })).toEqual({ v: 'oldAccount', purpose });
      expect(reduce({ v: 'oldCleared', purpose }, { e: 'proceedOld' })).toEqual({ v: 'age', purpose });
    }
    expect(startEvents('enable', { kind: 'passed' }, false)).toEqual([{ e: 'start', purpose: 'enable' }, { e: 'age', ok: true }]);
  });

  it('[재리뷰 3 Q3] 두고 새로 시작한 되찾기는 옛 로그인을 버린다 → 지우려던 계정에 다시 붙지 않고 글귀의 몽망이를 되찾는다. 표시는 남는다', async () => {
    const srv = createFakeServer(sha);
    const x = device(srv, 'X', mong(5, 6));
    const xEn = (await runTask({ t: 'enable' }, x.deps)) as { code: string };
    const a = device(srv, 'A', mong(1, 2));
    await runTask({ t: 'enable' }, a.deps);
    const old = readRecord(a.kv)!.creature;
    // 지우기가 서버에 닿지 않은 채 끔
    srv.faults.offline = true;
    await runTask({ t: 'delete' }, a.deps);
    await runTask({ t: 'deleteCheck' }, a.deps);
    srv.faults.offline = false;
    await runTask({ t: 'forget' }, a.deps);
    expect(srv.peek('A')).not.toBeNull();
    const r = await runTask({ t: 'recover', code: xEn.code, target: null }, a.deps);
    expect(r).toMatchObject({ r: 'recovered' });
    expect(readRecord(a.kv)!.creature).not.toBe(old);
    expect(readUnconfirmedDelete(a.kv)).toMatchObject({ creature: old });
  });

  it('[재리뷰 3 Q6·4 S1] 끈 뒤(로그인 남음) 두고 새로 켜면 옛 로그인을 버려 지우려던 계정에 다시 붙지 않는다', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    const old = readRecord(a.kv)!.creature;
    srv.faults.offline = true;
    await runTask({ t: 'delete' }, a.deps);
    await runTask({ t: 'deleteCheck' }, a.deps);
    srv.faults.offline = false;
    await runTask({ t: 'forget' }, a.deps);
    expect(await runTask({ t: 'enable' }, a.deps)).toMatchObject({ r: 'enabled' });
    expect(readRecord(a.kv)!.creature).not.toBe(old);
    expect(readUnconfirmedDelete(a.kv)).toMatchObject({ creature: old, abandoned: true });
  });

  it('[재리뷰 3 Q6] 두고 새로 켜도 표시는 남아 켜짐 화면이 계속 안내한다', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    markUnconfirmedDelete(a.kv, 'K7M2ABCD', T);
    expect(await runTask({ t: 'enable' }, a.deps)).toMatchObject({ r: 'enabled' });
    expect(readUnconfirmedDelete(a.kv)).toMatchObject({ creature: 'K7M2ABCD' });
  });

  it('지우기: 서버 것만 지우고 기기 몽망이는 그대로', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    const main = a.kv.getString(SAVE_KEYS.main);
    expect(await runTask({ t: 'delete' }, a.deps)).toEqual({ r: 'deleted' });
    expect(readRecord(a.kv)).toBeNull();
    expect(a.kv.getString(SAVE_KEYS.main)).toBe(main);
    expect(await a.deps.auth.token()).toBeNull();
  });

  it('느린 서버(제한 시간 초과)는 timeout 갈래, 기록은 그대로', async () => {
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    a.kv.set(SAVE_KEYS.main, mong(1, 2));
    srv.faults.delayMs = 400;
    expect(await runTask({ t: 'sync' }, a.deps)).toEqual({ r: 'failed', failure: 'timeout' });
    expect(readRecord(a.kv)!.rev).toBe(1);
  });

  it('업로드 모양: word가 {attachStroke, sense} 밖의 필드를 가지면 올리지 않는다(보류)', async () => {
    expect(uploadShapeOk(JSON.stringify({ sim: { state: { days: [{ word: { attachStroke: 1, sense: 'calm' } }] } } }))).toBe(true);
    expect(uploadShapeOk(JSON.stringify({ sim: { state: { days: [{ word: { attachStroke: 1, sense: 'calm', strokes: [[1, 2]] } }] } } }))).toBe(false);
    expect(uploadShapeOk(JSON.stringify({ words: [{ word: { text: 'x' } }] }))).toBe(false);
    const srv = createFakeServer(sha);
    const a = device(srv, 'A', mong(1));
    await runTask({ t: 'enable' }, a.deps);
    const puts = srv.log.filter((l) => l.startsWith('PUT')).length;
    const o = JSON.parse(mong(1, 2)) as Record<string, unknown>;
    a.kv.set(SAVE_KEYS.main, JSON.stringify({ ...o, word: { attachStroke: 0, sense: 'calm', raw: 'xx' } }));
    expect(await runTask({ t: 'sync' }, a.deps)).toEqual({ r: 'synced' });
    expect(readRecord(a.kv)!.held).toBe('shape');
    expect(srv.log.filter((l) => l.startsWith('PUT')).length).toBe(puts);
  });

  it('깨진 기기 기록은 충돌로 읽는다(무엇이 있는지 모르면 덮지 않음)', () => {
    const kv = memKV();
    kv.set(CLOUD_KEY, '{oops');
    expect(readRecord(kv)).toMatchObject({ state: 'on', conflict: true });
  });
});
