// V27b 세이브 v3 맡겨 두기 연결: 올리는 본문 = uploadV3(허용 목록)뿐·되찾기 복원·충돌 나란히 고르기·되돌리기 유실 0·
// 공방 합집합·정 최댓값·한쪽 v2/한쪽 v3·처리방침 3-5 대조·크기 상한·'둘 다 켜짐' 판정.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { SAVE_MAX_BYTES, SAVE_MAX_GZIP_BYTES } from '@mong/contract';
import { SAVE_KEYS, sim, v3, type KV, type RawPoint } from '@mong/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createCloudApi } from '../src/cloud/api';
import { createFakeServer } from '../src/cloud/fakeServer';
import type { FetchLike } from '../src/net/http';
import { createLocalV2, createLocalV3 } from '../src/cloud/localSave';
import { reduce, type View } from '../src/cloud/model';
import { CLOUD_KEY, CLOUD_V2_ARCHIVE_KEY, PRE_RESTORE_KEY, readCloudV2Archive, readParkedList, readPreRestore, readRecord } from '../src/cloud/record';
import { runTask, type TaskDeps } from '../src/cloud/tasks';
import { isOn, setFeature } from '../src/features';
import { __configureForTest, adoptStateV3, boot, dispatch, getSnapshot, getV3, install } from '../src/game/store';

const ROOT = path.resolve(__dirname, '../../..');
const sha = async (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const KST = 540;
const H = 3_600_000;
const T0 = Date.UTC(2026, 10, 25, 0, 0); // 서울 11-25 09:00
const kst = (d: number, h: number) => T0 + d * 24 * H + (h - 9) * H;

type S = v3.V3State;
type E = v3.V3Event;

function memKV(): KV & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getString: (k) => m.get(k), set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
}
function handStroke(seed = 1, n = 90): RawPoint[] {
  const out: RawPoint[] = [];
  const a0 = 1.4 + (seed % 5) * 0.5;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const th = a0 + u * 1.2;
    const r = 0.56 + u * 0.2 + Math.sin(u * 9 + seed) * 0.004;
    out.push({ x: Math.sin(th) * r, y: -Math.cos(th) * r, t: Math.round(u * 900) });
  }
  return out;
}
const word = (text: string): v3.WordInput => ({ ...v3.storedWordOf(v3.interpretWord(text, 'ko')), lexVer: v3.LEX_VER, source: 'keyboard' });
const fresh = (entropy = 0x1234) => v3.createV3(kst(0, 9), KST, 7, { birth: { x: 0.1, y: -0.2, ms: kst(0, 9), installAt: kst(0, 9), entropy } });
function day(s: S, d: number, o: { touch?: boolean; text?: string; raw?: RawPoint[] } = {}): S {
  const base = kst(d, 20);
  const ev: E[] = [{ type: 'appForeground', at: base, tzOffsetMin: KST }, { type: 'grind', at: base + 60_000, durationMs: 9000 }];
  if (o.touch) ev.push({ type: 'tap', at: base + 90_000, target: 'body', holdMs: 100, x: 0, y: 0 });
  ev.push({ type: 'write', at: base + 120_000, word: word(o.text ?? ['행복해', '비', '고마워'][d % 3]!), chars: 1, raw: o.raw ?? handStroke(d + 1) });
  ev.push({ type: 'putToSleep', at: base + 2 * H }, { type: 'appBackground', at: base + 2 * H + 60_000 }, { type: 'appForeground', at: base + 12 * H, tzOffsetMin: KST });
  let st = s;
  for (const e of ev) st = v3.reduceV3(st, e).state;
  return st;
}
function lived(n: number, o: { touch?: boolean; entropy?: number; from?: S; at?: number } = {}): S {
  let s = o.from ?? fresh(o.entropy);
  const at = o.at ?? 0;
  for (let d = at; d < at + n; d++) s = day(s, d, { touch: o.touch });
  return s;
}
const withCaptions = (s: S, c: number[]): S => ({ ...s, v3: { ...s.v3, captionsShown: c } });
const withPantry = (s: S, meal: v3.MealItem[], treat: v3.TreatItem[]): S => ({ ...s, v3: { ...s.v3, pantry: { meal, treat } } });
const withJeong = (s: S, n: number): S => ({ ...s, sim: { ...s.sim, relation: { ...s.sim.relation, jeongDays: n } } });

type Srv = ReturnType<typeof createFakeServer>;
let clock = kst(40, 12);
/** 서버마다 기기가 보낸 요청(경로·본문) */
const SENT = new WeakMap<Srv, { dev: string; route: string; body: string }[]>();
function fetchOf(srv: Srv, dev: string): FetchLike {
  return async (url, init = {}) => {
    const list = SENT.get(srv) ?? [];
    list.push({ dev, route: `${init.method ?? 'GET'} ${url.replace(/^.*\/api\/v1\//, '')}`, body: init.body ?? '' });
    SENT.set(srv, list);
    return srv.fetch(url, init);
  };
}

/** 새 컨셉(v3)으로 도는 기기 — 실제 어댑터(createLocalV3), 저장은 세이브 v3 키 */
function v3Device(srv: Srv, name: string, st: S | null) {
  const kv = memKV();
  if (st) kv.set(v3.V3_KEYS.main, v3.serializeV3(st, clock));
  const writes: S[] = [];
  const current = () => {
    const r = kv.getString(v3.V3_KEYS.main);
    return r ? v3.parseV3(r) : null;
  };
  const local = createLocalV3({
    kv,
    current,
    write: (s) => {
      writes.push(s);
      kv.set(v3.V3_KEYS.main, v3.serializeV3(s, ++clock));
      return true;
    },
  });
  const auth = srv.authFor(name);
  const deps: TaskDeps = { api: createCloudApi({ fetch: fetchOf(srv, name), base: 'https://api.test', auth, timeoutMs: 200 }), auth, kv, sha256: sha, now: () => clock, local };
  return { kv, deps, current, writes };
}
/** 옛 세이브(v2)로 도는 기기 */
function v2Device(srv: Srv, name: string, raw: string | null) {
  const kv = memKV();
  if (raw) kv.set(SAVE_KEYS.main, raw);
  const auth = srv.authFor(name);
  const local = createLocalV2({ kv, adopt: (st) => (kv.set(SAVE_KEYS.main, sim.serializeState(st, ++clock)), true) });
  const deps: TaskDeps = { api: createCloudApi({ fetch: fetchOf(srv, name), base: 'https://api.test', auth, timeoutMs: 200 }), auth, kv, sha256: sha, now: () => clock, local };
  return { kv, deps };
}
const v2Save = (seed: number) => sim.serializeState({ ...sim.createInitial(kst(0, 9), KST, seed), dayIndex: 3 }, kst(3, 9));
const putBodies = (srv: Srv) => (SENT.get(srv) ?? []).filter((l) => l.route === 'PUT saves/main' || l.route === 'POST saves/main/conflicts').map((l) => (JSON.parse(l.body) as { body: string }).body);

/** 켜기(A) → 되찾기(B): B의 기록은 restore 대기(conflict 표시) */
async function enableThenRecover(srv: Srv, a: { deps: TaskDeps; kv: KV }, b: { deps: TaskDeps; kv: KV }) {
  const en = (await runTask({ t: 'enable' }, a.deps)) as { r: string; code: string };
  expect(en.r).toBe('enabled');
  const target = readRecord(a.kv)!.creature!;
  const rc = await runTask({ t: 'recover', code: en.code, target }, b.deps);
  expect(rc).toMatchObject({ r: 'recovered' });
  return target;
}

afterEach(() => {
  setFeature('conceptV3', null);
  setFeature('cloud', null);
});

describe('맡기기 = uploadV3 본문뿐(R7·허용 목록)', () => {
  it('켜기 PUT 본문: v3 키 = version + V3_UPLOAD_FIELDS, 말 = {attachStroke, sense}, 기기 전용 칸·말 기록 0', async () => {
    const srv = createFakeServer(sha);
    const s = withCaptions(lived(5, { touch: true }), [1, 0, 2, 0]);
    const a = v3Device(srv, 'A', s);
    expect((await runTask({ t: 'enable' }, a.deps)).r).toBe('enabled');
    const [b] = putBodies(srv);
    const o = JSON.parse(b!) as { v3: Record<string, unknown> & { words: Record<string, unknown>[] } };
    expect(Object.keys(o.v3).sort()).toEqual(['version', ...v3.V3_UPLOAD_FIELDS].sort());
    for (const w of o.v3.words) expect(Object.keys(w).sort()).toEqual(['attachStroke', 'sense']);
    for (const ban of [...v3.V3_DEVICE_ONLY_FIELDS, 'intensity', 'lexVer', 'strokeId']) expect(b, ban).not.toContain(`"${ban}"`);
    expect(v3.checkUploadBodyV3(b!)).toEqual({ kind: 'ok' });
    expect(readRecord(a.kv)).toMatchObject({ form: 'v3', conflict: false });
    // 서버 본 = 기기 본의 올리는 본문 그대로(빨리 감기·sha 일치)
    expect(srv.peek('A')!.save!.sha).toBe(await sha(a.deps.local.body(a.kv.getString(v3.V3_KEYS.main)!)!));
  });
  it('다시 맡기기: 같은 본이면 PUT 0(빨리 감기), 하루 더 살면 같은 rev 위로', async () => {
    const srv = createFakeServer(sha);
    const a = v3Device(srv, 'A', lived(3));
    await runTask({ t: 'enable' }, a.deps);
    const puts = putBodies(srv).length;
    expect(await runTask({ t: 'sync' }, a.deps)).toEqual({ r: 'synced' });
    expect(putBodies(srv).length).toBe(puts);
    a.kv.set(v3.V3_KEYS.main, v3.serializeV3(day(a.current()!, 3), ++clock));
    expect(await runTask({ t: 'sync' }, a.deps)).toEqual({ r: 'synced' });
    expect(srv.peek('A')!.save!.rev).toBe(2);
  });
  it('정적: 맡겨 두기 앱 모듈은 serializeV3를 쓰지 않고, 본문은 core uploadBodyV3(= uploadV3)로만 만든다', () => {
    const dir = path.join(ROOT, 'apps/mobile/src/cloud');
    for (const f of readdirSync(dir)) expect(readFileSync(path.join(dir, f), 'utf8'), f).not.toMatch(/serializeV3/);
    const local = readFileSync(path.join(dir, 'localSave.ts'), 'utf8');
    expect(local).toMatch(/v3\.uploadBodyV3\(/);
    const core = readFileSync(path.join(ROOT, 'packages/core/src/v3/cloud.ts'), 'utf8');
    expect(core).toMatch(/const up = uploadV3\(s\)/);
    expect(core).not.toMatch(/serializeV3\(/);
  });
  it('크기 상한: 28밤 × 512점(필압 포함) 거친 획에서도 본문 ≤ SAVE_MAX_BYTES, gzip ≤ SAVE_MAX_GZIP_BYTES', () => {
    let x = 12345;
    const r = () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296);
    let s = fresh();
    for (let d = 0; d < 28; d++) {
      const raw: RawPoint[] = Array.from({ length: 512 }, (_, i) => ({ x: r() * 1.6 - 0.8, y: r() * 1.6 - 0.8, t: i * 11, p: r() }));
      s = day(s, d, { raw });
    }
    expect(s.v3.words).toHaveLength(28);
    const b = v3.uploadBodyV3(s, clock);
    const bytes = Buffer.byteLength(b, 'utf8');
    const gz = gzipSync(Buffer.from(b, 'utf8')).length;
    expect(bytes).toBeLessThanOrEqual(SAVE_MAX_BYTES);
    expect(gz).toBeLessThanOrEqual(SAVE_MAX_GZIP_BYTES);
  });
  it('가짜 서버도 실서버처럼 허용 목록 밖 v3 본문(기기 형태)을 422로 받지 않는다', async () => {
    const srv = createFakeServer(sha);
    const a = v3Device(srv, 'A', lived(2));
    // 변이 흉내: body가 기기 세이브를 그대로 올리면
    const leaky = { ...a.deps, local: { ...a.deps.local, body: (raw: string) => raw } };
    await runTask({ t: 'enable' }, leaky);
    expect(srv.peek('A')?.save ?? null).toBeNull();
    expect(readRecord(a.kv)?.held).toBe('shape');
  });
});

describe('되찾기·나란히 고르기·되돌리기 — v3에서도 유실 0', () => {
  it('B가 되찾아 서버 본을 고르면: 몸·밤·말결·공방이 A와 같고, B의 앞 본은 기기 preRestore + 서버 conflict 칸', async () => {
    const srv = createFakeServer(sha);
    const aState = lived(6, { touch: true });
    const bState = withCaptions(lived(2, { entropy: 0x7777 }), [2, 0, 0, 0]);
    const a = v3Device(srv, 'A', aState);
    const b = v3Device(srv, 'B', bState);
    await enableThenRecover(srv, a, b);
    const cmp = await runTask({ t: 'fetch', why: 'restore' }, b.deps);
    expect(cmp).toMatchObject({ r: 'compare', why: 'restore' });
    const pick = (cmp as { pick: { rev: number; sha: string } }).pick;
    const bRawBefore = b.kv.getString(v3.V3_KEYS.main)!;
    expect(await runTask({ t: 'takeServer', server: pick }, b.deps)).toEqual({ r: 'synced' });
    const got = b.current()!;
    const want = v3.parseV3(a.kv.getString(v3.V3_KEYS.main)!);
    expect(got.sim.strokes.map((x) => x.raw)).toEqual(want.sim.strokes.map((x) => x.raw));
    expect(got.sim.relation.jeongDays).toBe(want.sim.relation.jeongDays);
    expect(got.v3.life).toEqual(want.v3.life);
    expect(got.v3.words.map((w) => w.sense)).toEqual(want.v3.words.map((w) => w.sense));
    expect(v3.heartOf(got)).toEqual(v3.heartOf(want));
    // B의 앞 본은 기기 칸에 원문 그대로(말 기록·정 자막 횟수까지), 서버 conflict 칸에는 올리는 본문으로
    expect(readPreRestore(b.kv, clock)!.raw).toBe(bRawBefore);
    const conf = srv.peek('B')!.conflicts.map((c) => c.body);
    expect(conf).toContain(b.deps.local.body(bRawBefore));
    expect(readRecord(b.kv)).toMatchObject({ form: 'v3', conflict: false });
    // 되돌리기 = 맞바꾸기: B의 앞 몽망이가 말 기록·정 자막 횟수까지 그대로 돌아온다
    expect(await runTask({ t: 'revert' }, b.deps)).toEqual({ r: 'reverted' });
    const back = b.current()!;
    const before = v3.parseV3(bRawBefore);
    expect(back.sim).toEqual(before.sim);
    expect(back.v3.words).toEqual(before.v3.words);
    expect(back.v3.captionsShown).toEqual([2, 0, 0, 0]);
    expect(back.v3.life).toEqual(before.v3.life);
    // A에서 온 몽망이는 preRestore 칸으로 갔다(유실 0)
    expect(v3.parseV3(readPreRestore(b.kv, clock)!.raw).sim.birth.seed).toBe(want.sim.birth.seed);
  });
  it('되찾은 말은 같은 몽망이의 기기 기록이 있으면 night·세기·사전 판을 되붙인다(맡긴 뒤 같은 기기가 서버 본을 고름)', async () => {
    const srv = createFakeServer(sha);
    const base = lived(4);
    const a = v3Device(srv, 'A', base);
    await runTask({ t: 'enable' }, a.deps);
    // 다른 기기(같은 로그인)에서 하루 더 산 본이 올라옴
    const ahead = day(v3.parseUploadV3(srv.peek('A')!.save!.body), 4, { text: '고마워' });
    await srv.putFromElsewhere('A', v3.uploadBodyV3(ahead, ++clock));
    a.kv.set(v3.V3_KEYS.main, v3.serializeV3(day(base, 4, { text: '비' }), ++clock)); // A도 다르게 하루
    expect(await runTask({ t: 'sync' }, a.deps)).toEqual({ r: 'conflict' });
    const cmp = (await runTask({ t: 'fetch', why: 'conflict' }, a.deps)) as { pick: { rev: number; sha: string } };
    expect(await runTask({ t: 'takeServer', server: cmp.pick }, a.deps)).toEqual({ r: 'synced' });
    const got = a.current()!;
    expect(got.v3.words.slice(0, 4)).toEqual(base.v3.words); // 겹치는 넷은 기기 기록 그대로
    expect(got.v3.words[4]!.lexVer).toBe(v3.RESTORED_LEX_VER); // 기기에 없던 말은 고정값
  });
  it('충돌 — 서버 본을 고르면 공방은 합집합, 같은 몽망이 정은 큰 쪽(쌓이기만)', async () => {
    const srv = createFakeServer(sha);
    const base = lived(3);
    const a = v3Device(srv, 'A', base);
    await runTask({ t: 'enable' }, a.deps);
    const server = withJeong(withPantry(day(base, 3), ['clear'], ['pattern', 'ribbon']), 3);
    await srv.putFromElsewhere('A', v3.uploadBodyV3(server, ++clock));
    a.kv.set(v3.V3_KEYS.main, v3.serializeV3(withJeong(withPantry(day(base, 3, { text: '비' }), ['clear', 'pine'], ['pattern']), 6), ++clock));
    await runTask({ t: 'sync' }, a.deps);
    const cmp = (await runTask({ t: 'fetch', why: 'conflict' }, a.deps)) as { pick: { rev: number; sha: string } };
    expect(await runTask({ t: 'takeServer', server: cmp.pick }, a.deps)).toEqual({ r: 'synced' });
    const got = a.current()!;
    expect(got.sim.relation.jeongDays).toBe(6);
    expect(got.v3.pantry.meal).toEqual(expect.arrayContaining(['clear', 'pine']));
    expect(got.v3.pantry.treat).toEqual(expect.arrayContaining(['pattern', 'ribbon']));
  });
  it("충돌 — '이 기기'를 고르면 서버 본의 공방·정을 이 기기 본으로 모은 뒤 맡긴다", async () => {
    const srv = createFakeServer(sha);
    const base = lived(3);
    const a = v3Device(srv, 'A', base);
    await runTask({ t: 'enable' }, a.deps);
    const server = withJeong(withPantry(day(base, 3), ['clear', 'dew'], ['pattern']), 7);
    const serverBody = v3.uploadBodyV3(server, ++clock);
    await srv.putFromElsewhere('A', serverBody);
    a.kv.set(v3.V3_KEYS.main, v3.serializeV3(withJeong(withPantry(day(base, 3, { text: '비' }), ['clear', 'pine'], ['pattern']), 2), ++clock));
    await runTask({ t: 'sync' }, a.deps);
    const cmp = (await runTask({ t: 'fetch', why: 'conflict' }, a.deps)) as { pick: { rev: number; sha: string } };
    expect(await runTask({ t: 'keepLocal', server: cmp.pick, why: 'conflict', park: false }, a.deps)).toEqual({ r: 'synced' });
    const up = v3.parseUploadV3(srv.peek('A')!.save!.body);
    expect(up.v3.pantry.meal).toEqual(['clear', 'pine', 'dew']);
    expect(up.sim.relation.jeongDays).toBe(7);
    expect(up.v3.words.at(-1)!.sense).toBe(v3.storedWordOf(v3.interpretWord('비', 'ko')).sense); // 이 기기 말이 이겼다
    // 진 서버 본은 서버 conflict 칸(keep_mine)
    expect(srv.peek('A')!.conflicts.map((c) => c.body)).toContain(serverBody);
  });
  it('D1(v3): 되돌리기로 칸에 들어간 키운 본은 다음 서버 본 고르기 전에 parked 칸으로 옮긴다', async () => {
    const srv = createFakeServer(sha);
    const a = v3Device(srv, 'A', lived(4));
    const b = v3Device(srv, 'B', lived(1, { entropy: 0x5151 }));
    await enableThenRecover(srv, a, b);
    let cmp = (await runTask({ t: 'fetch', why: 'restore' }, b.deps)) as { pick: { rev: number; sha: string } };
    await runTask({ t: 'takeServer', server: cmp.pick }, b.deps);
    b.kv.set(v3.V3_KEYS.main, v3.serializeV3(day(b.current()!, 30), ++clock)); // 하루 키움(서버에 올리지 않음)
    const grown = b.kv.getString(v3.V3_KEYS.main)!;
    await runTask({ t: 'revert' }, b.deps); // 키운 본 → preRestore
    expect(readPreRestore(b.kv, clock)!.raw).toBe(grown);
    cmp = (await runTask({ t: 'fetch', why: 'conflict' }, b.deps)) as { pick: { rev: number; sha: string } };
    expect(await runTask({ t: 'takeServer', server: cmp.pick }, b.deps)).toEqual({ r: 'synced' });
    expect(readParkedList(b.kv, clock).map((p) => p.raw)).toContain(grown);
  });
  it('parked 칸 맞바꾸기도 v3로: 되찾기 맥락에서 이 기기를 고르면 서버 본은 기기 칸에, 다시 고르면 그 본으로', async () => {
    const srv = createFakeServer(sha);
    const a = v3Device(srv, 'A', lived(5));
    const b = v3Device(srv, 'B', lived(2, { entropy: 0x2222 }));
    await enableThenRecover(srv, a, b);
    const cmp = (await runTask({ t: 'fetch', why: 'restore' }, b.deps)) as { pick: { rev: number; sha: string } };
    expect(await runTask({ t: 'keepLocal', server: cmp.pick, why: 'restore', park: true }, b.deps)).toEqual({ r: 'synced' });
    const slot = readParkedList(b.kv, clock)[0]!;
    expect(v3.saveFormOf(slot.raw)).toBe('v3');
    expect(await runTask({ t: 'takeParked', slot: slot.id }, b.deps)).toEqual({ r: 'synced' });
    expect(b.current()!.sim.birth.seed).toBe(v3.parseV3(a.kv.getString(v3.V3_KEYS.main)!).sim.birth.seed);
  });
});

describe('한쪽 v2, 한쪽 v3', () => {
  it('v3 기기가 서버의 옛 v2 본을 만남: 서버 쪽은 고를 수 없고, 이 기기를 고르면 그 v2 원문을 기기 보관함에 둔 뒤 맡긴다', async () => {
    const srv = createFakeServer(sha);
    const oldRaw = v2Save(3);
    const a = v2Device(srv, 'A', oldRaw);
    const b = v3Device(srv, 'B', lived(3));
    await enableThenRecover(srv, a, b);
    const cmp = (await runTask({ t: 'fetch', why: 'restore' }, b.deps)) as unknown as { r: "compare"; local: never; server: { state: unknown; old?: boolean }; pick: { rev: number; sha: string } };
    expect(cmp.server.state).toBeNull();
    expect(cmp.server.old).toBe(true);
    // 화면: 서버 쪽은 고를 수 없고 이 기기만
    const view: View = { v: 'choose', why: 'restore', local: cmp.local, server: cmp.server as never, pick: cmp.pick, picked: null, confirming: false, note: null };
    expect(reduce(view, { e: 'pick', side: 'server' })).toBe(view);
    expect(reduce(view, { e: 'pick', side: 'local' })).toMatchObject({ picked: 'local' });
    // 서버 본으로 바꾸기는 작업에서도 거절(기기 본 그대로)
    const before = b.kv.getString(v3.V3_KEYS.main);
    expect(await runTask({ t: 'takeServer', server: cmp.pick }, b.deps)).toEqual({ r: 'failed', failure: 'server' });
    expect(b.kv.getString(v3.V3_KEYS.main)).toBe(before);
    expect(await runTask({ t: 'keepLocal', server: cmp.pick, why: 'restore', park: true }, b.deps)).toEqual({ r: 'synced' });
    expect(readCloudV2Archive(b.kv).map((x) => x.raw)).toEqual([oldRaw]);
    expect(readParkedList(b.kv, clock)).toHaveLength(0); // v2는 다시 고를 칸이 아니라 보관함
    expect(v3.saveFormOf(srv.peek('B')!.save!.body)).toBe('v3');
    expect(readRecord(b.kv)?.form).toBe('v3');
  });
  it('기기 옛 세이브 보관 키와 같은 원문이면 보관함에 두 번 두지 않는다, 보관함이 가득이면 덮지 않고 멈춘다', async () => {
    const srv = createFakeServer(sha);
    const oldRaw = v2Save(4);
    const a = v2Device(srv, 'A', oldRaw);
    const b = v3Device(srv, 'B', lived(2));
    b.kv.set(v3.V3_KEYS.archiveV2, oldRaw);
    await enableThenRecover(srv, a, b);
    const cmp = (await runTask({ t: 'fetch', why: 'restore' }, b.deps)) as { pick: { rev: number; sha: string } };
    expect(await runTask({ t: 'keepLocal', server: cmp.pick, why: 'restore', park: true }, b.deps)).toEqual({ r: 'synced' });
    expect(b.kv.getString(CLOUD_V2_ARCHIVE_KEY)).toBeUndefined();

    const srv2 = createFakeServer(sha, 2);
    const c = v2Device(srv2, 'C', v2Save(5));
    const d = v3Device(srv2, 'D', lived(2));
    d.kv.set(CLOUD_V2_ARCHIVE_KEY, JSON.stringify([1, 2, 3].map((i) => ({ at: i, raw: v2Save(10 + i) }))));
    await enableThenRecover(srv2, c, d);
    const cmp2 = (await runTask({ t: 'fetch', why: 'restore' }, d.deps)) as { pick: { rev: number; sha: string } };
    const v2Body = srv2.peek('D')!.save!.body;
    expect(await runTask({ t: 'keepLocal', server: cmp2.pick, why: 'restore', park: true }, d.deps)).toEqual({ r: 'failed', failure: 'device' });
    expect(srv2.peek('D')!.save!.body).toBe(v2Body); // 서버 v2 그대로
  });
  it('v3 기기의 기록이 옛 v2 동기화(form 없음)면 If-Match로 덮지 않고 충돌로 멈춘다', async () => {
    const srv = createFakeServer(sha);
    const a = v2Device(srv, 'A', v2Save(6));
    await runTask({ t: 'enable' }, a.deps);
    const rec = readRecord(a.kv)!;
    expect(rec.form).toBe('v2');
    // 같은 기기가 새 컨셉으로 바뀜(기록·로그인 그대로)
    const b = v3Device(srv, 'A', lived(2));
    b.kv.set(CLOUD_KEY, JSON.stringify({ ...rec, form: null }));
    const v2Body = srv.peek('A')!.save!.body;
    expect(await runTask({ t: 'sync' }, b.deps)).toEqual({ r: 'conflict' });
    expect(srv.peek('A')!.save!.body).toBe(v2Body);
  });
  it('v2 기기가 서버의 v3 본을 만남: 어느 쪽도 고를 수 없고(새 판), 받지도 덮지도 않는다', async () => {
    const srv = createFakeServer(sha);
    const a = v3Device(srv, 'A', lived(3));
    const b = v2Device(srv, 'B', v2Save(7));
    await enableThenRecover(srv, a, b);
    const cmp = (await runTask({ t: "fetch", why: "restore" }, b.deps)) as unknown as { local: never; server: { state: unknown; old?: boolean }; pick: { rev: number; sha: string } };
    expect(cmp.server.state).toBeNull();
    expect(cmp.server.old).toBeUndefined();
    const view: View = { v: 'choose', why: 'restore', local: cmp.local, server: cmp.server as never, pick: cmp.pick, picked: null, confirming: false, note: null };
    expect(reduce(view, { e: 'pick', side: 'local' })).toBe(view);
    expect(reduce(view, { e: 'pick', side: 'server' })).toBe(view);
    const v3Body = srv.peek('B')!.save!.body;
    expect(await runTask({ t: 'takeServer', server: cmp.pick }, b.deps)).toEqual({ r: 'failed', failure: 'server' });
    expect(await runTask({ t: 'sync' }, b.deps)).toEqual({ r: 'conflict' });
    expect(srv.peek('B')!.save!.body).toBe(v3Body);
    expect(b.kv.getString(SAVE_KEYS.main)).toBe(v2Save(7));
  });
  it('v2 어댑터는 v3 원문을, v3 어댑터는 v2 원문을 이어 가지 않는다(adopt false)', () => {
    const srv = createFakeServer(sha);
    expect(v2Device(srv, 'X', null).deps.local.adopt(v3.uploadBodyV3(lived(1), clock))).toBe(false);
    expect(v3Device(srv, 'Y', lived(1)).deps.local.adopt(v2Save(1))).toBe(false);
  });
});

describe('store 연결(실제 adoptStateV3) — 옛 v2 키는 보관만', () => {
  it('v3로 부팅한 앱이 맡긴 본을 받으면 v3 키에 쓰고 v2 키는 그대로, 공방은 합집합', () => {
    const kv = memKV();
    const v2 = v2Save(9);
    kv.set(SAVE_KEYS.main, v2);
    let now = kst(20, 12);
    __configureForTest({ kv, now: () => now });
    setFeature('conceptV3', true);
    boot();
    install();
    dispatch({ type: 'grind', durationMs: 4000 });
    const local = createLocalV3({ kv, current: getV3, write: adoptStateV3 });
    const incoming = withPantry(lived(8, { touch: true }), ['clear', 'pine'], ['pattern', 'ribbon']);
    const cur = getV3()!;
    now += 60_000;
    expect(local.adopt(v3.uploadBodyV3(incoming, now))).toBe(true);
    const snap = getSnapshot();
    expect(snap.state!.birth.seed).toBe(incoming.sim.birth.seed);
    expect(snap.v3!.pantry.meal).toEqual(expect.arrayContaining([...cur.v3.pantry.meal, 'pine']));
    expect(kv.m.get(SAVE_KEYS.main)).toBe(v2);
    expect(v3.parseV3(kv.m.get(v3.V3_KEYS.main)!).sim.birth.seed).toBe(incoming.sim.birth.seed);
    expect(v3.parseV3(kv.m.get(v3.V3_KEYS.backup)!).sim.birth.seed).toBe(cur.sim.birth.seed); // 바꾸기 전 본 = 백업
  });
});

describe('처리방침 3-5·2절 ↔ 실제 올리는 칸(K11·K33·K35, V27b)', () => {
  const sec = (md: string, head: RegExp) => {
    const i = md.search(head);
    const rest = md.slice(i + 1);
    const j = rest.search(/\n#{2,3} /);
    return rest.slice(0, j < 0 ? undefined : j);
  };
  const ko = readFileSync(path.join(ROOT, 'docs/release/privacy-policy.ko.md'), 'utf8');
  const en = readFileSync(path.join(ROOT, 'docs/release/privacy-policy.en.md'), 'utf8');
  const ko35 = sec(ko, /\n### 3-5\. /);
  const en35 = sec(en, /\n### 3-5\. /);
  /** 올리는 v3 칸 → 3-5가 그 칸을 적은 말(ko, en). 새 칸을 올리면 여기와 방침을 함께 고쳐야 시험이 통과한다 */
  const FIELD_WORDS: Record<string, [string[], string[]]> = {
    words: [['한 획의 좌표와 그 말의 분류값'], ['single stroke that became part of', "the word's category"]],
    life: [['잠든 시각·깬 시각', '게임 진행 값'], ['slept and woke', 'Game progress']],
    tonightCounted: [['게임 진행 값'], ['Game progress']],
    meal: [['숟갈', '작은 것 수', '밥 알림 설정'], ['spoonfuls', 'little things', 'meal reminder setting']],
    pantry: [['열린 종류'], ['unlocked kinds']],
  };
  it('올리는 v3 칸마다 3-5(ko·en)에 그 말이 있고, 표에 없는 칸은 올리지 않는다', () => {
    const o = JSON.parse(v3.uploadBodyV3(lived(3, { touch: true }), clock)) as { v3: Record<string, unknown> };
    const fields = Object.keys(o.v3).filter((k) => k !== 'version');
    expect(fields.sort()).toEqual(Object.keys(FIELD_WORDS).sort());
    for (const f of fields) {
      for (const w of FIELD_WORDS[f]![0]) expect(ko35, `${f} ko`).toContain(w);
      for (const w of FIELD_WORDS[f]![1]) expect(en35, `${f} en`).toContain(w);
    }
  });
  it('기기 전용(마실 날)은 3-5에 "올리지 않습니다", 2절 한 마디 줄은 "나머지 글씨는 기기에만"', () => {
    expect(ko35).toContain('마실 날 표시는 올리지 않습니다');
    expect(en35).toContain('stroll day mark is not uploaded');
    expect(sec(ko, /\n## 2\. /)).toContain('나머지 글씨는 기기에만');
    expect(v3.V3_DEVICE_ONLY_FIELDS).toEqual(['walk', 'captionsShown']);
  });
  it('2절 기기 칸 사본 줄(K36)은 서버로 보내지 않는다 — v3 기기 칸·보관함도 요청 본문에 0', async () => {
    expect(sec(ko, /\n## 2\. /)).toContain('서버로 보내지 않습니다');
    const srv = createFakeServer(sha);
    const a = v2Device(srv, 'A', v2Save(3));
    const b = v3Device(srv, 'B', lived(2));
    await enableThenRecover(srv, a, b);
    const cmp = (await runTask({ t: 'fetch', why: 'restore' }, b.deps)) as { pick: { rev: number; sha: string } };
    await runTask({ t: 'keepLocal', server: cmp.pick, why: 'restore', park: true }, b.deps);
    const sent = (SENT.get(srv) ?? []).filter((l) => l.dev === 'B').map((l) => l.body).join('\n');
    expect(sent).not.toContain('archive');
    for (const body of putBodies(srv)) if (v3.saveFormOf(body) === 'v3') expect(v3.checkUploadBodyV3(body)).toEqual({ kind: 'ok' });
  });
});

describe("판정: 'conceptV3 + cloud 둘 다 켜짐' 허용(플래그 기본값은 운영 꺼짐 그대로)", () => {
  it('개발 메뉴로 둘 다 켜면 둘 다 켜진다(리뷰 M5 막음 풀림 — V27b 연결 뒤)', () => {
    setFeature('conceptV3', true);
    setFeature('cloud', true);
    expect(isOn('conceptV3')).toBe(true);
    expect(isOn('cloud')).toBe(true);
  });
  it('번들 기본값: cloud는 꺼짐 그대로', () => {
    const src = readFileSync(path.join(ROOT, 'apps/mobile/src/features.ts'), 'utf8');
    expect(src).toMatch(/\n {2}cloud: false,/);
  });
});

it('기록 키 이름 고정(PRE_RESTORE_KEY·CLOUD_V2_ARCHIVE_KEY)', () => {
  expect(PRE_RESTORE_KEY).toBe('mong.cloud.preRestore');
  expect(CLOUD_V2_ARCHIVE_KEY).toBe('mong.v3.archive.cloudV2');
});
