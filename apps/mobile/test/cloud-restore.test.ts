// C12 리뷰 H1: 서버 본으로 바꾼 뒤 '바꾸기 전으로 되돌리기'(공방 노트, 30일). 실제 저장소(store.adoptState)로
// 복원 → 깸 정산(밤 사이 맡긴 본) → 게임 진행 → 되돌리기에서 바꾸기 전 본이 그대로 돌아오는지 본다.
import { createHash } from 'node:crypto';
import { SAVE_KEYS, sim, type KV } from '@mong/core';
import { describe, expect, it } from 'vitest';
import { createCloudApi } from '../src/cloud/api';
import { createFakeServer } from '../src/cloud/fakeServer';
import { PRE_RESTORE_DAYS, PRE_RESTORE_KEY, readPreRestore } from '../src/cloud/record';
import { runTask, type TaskDeps } from '../src/cloud/tasks';
import { __configureForTest, adoptState, boot, dispatch, getSnapshot, install, onEffects, tickNow } from '../src/game/store';

const sha = async (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const KST_16 = Date.UTC(2026, 10, 20, 7, 0); // 서울 16:00

function memKV(): KV & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getString: (k) => m.get(k), set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
}

describe('바꾸기 전으로 되돌리기(preRestore)', () => {
  it('복원 → 깸 정산 → 게임 진행 → 되돌리기: 바꾸기 전 본이 그대로, 칸은 정산·회전이 덮지 않는다', async () => {
    let t = KST_16;
    // 다른 기기: 잠든 몽망이(S)
    const other = memKV();
    __configureForTest({ kv: other, now: () => t });
    boot();
    install();
    t += 1000;
    dispatch({ type: 'putToSleep' });
    expect(getSnapshot().state!.phase).toBe('asleep');
    const sRaw = other.m.get(SAVE_KEYS.main)!;

    // 이 기기: 깨어 있는 다른 몽망이(L)
    t += 60_000;
    const kv = memKV();
    __configureForTest({ kv, now: () => t });
    boot();
    install();
    t += 1000;
    dispatch({ type: 'grind', durationMs: 2000 });
    const lRaw = kv.m.get(SAVE_KEYS.main)!;
    const lState = sim.parseState(lRaw);

    const srv = createFakeServer(sha);
    const auth = srv.authFor('A');
    const deps: TaskDeps = {
      api: createCloudApi({ fetch: srv.fetch, base: 'https://api.test', auth, timeoutMs: 500 }),
      auth,
      kv,
      sha256: sha,
      now: () => t,
      local: { raw: () => kv.getString(SAVE_KEYS.main) ?? null, adopt: adoptState },
    };
    expect(await runTask({ t: 'enable' }, deps)).toMatchObject({ r: 'enabled' });
    await srv.putFromElsewhere('A', sRaw);

    // 밤을 넘겨 연다 → 바꾸는 순간 정산에서 깸이 난다
    t += 20 * 3_600_000;
    const cmp = (await runTask({ t: 'fetch', why: 'conflict' }, deps)) as { r: string; pick: { rev: number; sha: string } };
    expect(cmp.r).toBe('compare');
    let woke = false;
    const off = onEffects((e) => (woke ||= e.some((x) => x.type === 'woke')));
    expect(await runTask({ t: 'takeServer', server: cmp.pick }, deps)).toEqual({ r: 'synced' });
    off();
    expect(woke).toBe(true);
    expect(getSnapshot().state!.createdAt).toBe(sim.parseState(sRaw).createdAt);

    // 칸: 바꾸기 전 본 원문 그대로. 백업 칸도 깸 정산이 다시 밀지 않아 L 그대로
    const slot = kv.m.get(PRE_RESTORE_KEY);
    expect(readPreRestore(kv, t)!.raw).toBe(lRaw);
    expect(kv.m.get(SAVE_KEYS.backup)).toBe(lRaw);

    // 게임이 더 돌아도(깸·저장·다음 깸) 칸은 그대로
    t += 3_600_000;
    dispatch({ type: 'grind', durationMs: 1000 });
    t += 30 * 3_600_000;
    tickNow();
    expect(kv.m.get(PRE_RESTORE_KEY)).toBe(slot);

    // 되돌리기 = 맞바꾸기: 지금 본은 칸으로, 칸의 L은 지금 자리로(서버 호출 없이 — 꺼짐·옮겨 감에서도 됨)
    const cur = kv.m.get(SAVE_KEYS.main)!;
    const calls = srv.log.length;
    expect(await runTask({ t: 'revert' }, deps)).toEqual({ r: 'reverted' });
    const back = getSnapshot().state!;
    expect(back.createdAt).toBe(lState.createdAt);
    expect(back.birth).toEqual(lState.birth);
    expect(back.strokes.length).toBe(lState.strokes.length);
    expect(readPreRestore(kv, t)!.raw).toBe(cur);
    expect(srv.log.length).toBe(calls);
    // 다시 맞바꾸면 방금까지의 몽망이(서버에서 받아 키운 본)가 그대로 돌아온다
    const lNow = kv.m.get(SAVE_KEYS.main)!;
    expect(await runTask({ t: 'revert' }, deps)).toEqual({ r: 'reverted' });
    expect(getSnapshot().state!.createdAt).toBe(sim.parseState(cur).createdAt);
    expect(getSnapshot().state!.strokes.length).toBe(sim.parseState(cur).strokes.length);
    expect(readPreRestore(kv, t)!.raw).toBe(lNow);
  });

  it('[재리뷰 R3 재현] 맡겨 두기를 지운 뒤(기록 없음)·옮겨 감 상태에서도 되돌리기가 지금 몽망이를 잃지 않는다', async () => {
    for (const recState of [null, 'moved'] as const) {
      let t = KST_16;
      const kv = memKV();
      __configureForTest({ kv, now: () => t });
      boot();
      install();
      const first = kv.m.get(SAVE_KEYS.main)!;
      kv.set(PRE_RESTORE_KEY, JSON.stringify({ at: t, raw: first }));
      t += 3_600_000;
      dispatch({ type: 'grind', durationMs: 2000 });
      const grown = kv.m.get(SAVE_KEYS.main)!;
      if (recState) kv.set('mong.cloud.v1', JSON.stringify({ v: 1, state: recState, rev: 1, sha: null, syncedAt: null, codeConfirmed: true, conflict: false, held: null, creature: null, parked: null }));
      const srv = createFakeServer(sha);
      const auth = srv.authFor('A');
      const deps: TaskDeps = { api: createCloudApi({ fetch: srv.fetch, base: 'https://api.test', auth }), auth, kv, sha256: sha, now: () => t, local: { raw: () => kv.getString(SAVE_KEYS.main) ?? null, adopt: adoptState } };
      expect(await runTask({ t: 'revert' }, deps)).toEqual({ r: 'reverted' });
      expect(srv.log).toHaveLength(0);
      expect(readPreRestore(kv, t)!.raw).toBe(grown);
      expect(await runTask({ t: 'revert' }, deps)).toEqual({ r: 'reverted' });
      expect(sim.parseState(kv.m.get(SAVE_KEYS.main)!).ledger.grindMs).toBe(sim.parseState(grown).ledger.grindMs);
    }
  });

  it('30일이 지나면 되돌리기 칸은 읽히지 않는다', () => {
    const kv = memKV();
    kv.set(PRE_RESTORE_KEY, JSON.stringify({ at: 0, raw: '{}' }));
    expect(readPreRestore(kv, PRE_RESTORE_DAYS * 86_400_000)).not.toBeNull();
    expect(readPreRestore(kv, PRE_RESTORE_DAYS * 86_400_000 + 1)).toBeNull();
  });
});
