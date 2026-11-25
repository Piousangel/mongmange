// C13 고정 시나리오: 오프라인 7일(Q9 — 끊긴 채 매일 깸, 토큰 만료, 아웃박스, 칸 만료)과 느린 서버(Q5 — 요청마다 10~30초, 커밋 뒤 늦은 응답,
// 중간 끊김). 세계·불변식(①~⑤)은 무작위 시험과 같은 test/support/c13World.ts — 매 사건 뒤 같은 검사를 돈다.
import { EVENT_MAX_AGE_DAYS } from '@mong/contract';
import { SAVE_KEYS } from '@mong/core';
import { afterEach, describe, expect, it } from 'vitest';
import { CLOUD_TIMEOUT_MS } from '../src/cloud/api';
import { deleteToken, type CloudEvent } from '../src/cloud/model';
import { PARKED_KEY, PRE_RESTORE_KEY, readParkedList, readPreRestore, readRecord } from '../src/cloud/record';
import { SLOW_MS } from '../src/cloud/useCloud';
import { NET_KEYS, OUTBOX_MAX } from '../src/net/ping';
import { apply, createWorld, DAY, disposeWorld, keyOf, playOnce, type World } from './support/c13World';

afterEach(() => disposeWorld());

const ev = (w: World, i: number, e: CloudEvent) => apply(w, ['ev', i, e]);
const tick = (w: World, ms: number) => apply(w, ['tick', ms]);
const view = (w: World, i = 0) => w.devs[i]!.view;
const mainRaw = (w: World, i = 0) => w.devs[i]!.kv.getString(SAVE_KEYS.main)!;
/** 통계 사건(c13World 'ping'의 r 구간: 켜기 0 · 끄기 1/6 · 열기 기록 2/6 · 공유 기록 3/6 · 보내기 4/6 · 보내기 직후 끄기 5/6) */
const PING = { on: 0, off: 0.2, open: 0.4, flush: 0.7 } as const;
const ping = (w: World, k: keyof typeof PING) => apply(w, ['ping', 0, PING[k]]);

/** 켜기 → 글귀 받기 → 끝 네 자 확인 → 켜짐 */
async function enable(w: World, i: number) {
  await ev(w, i, { e: 'start', purpose: 'enable' });
  await ev(w, i, { e: 'age', ok: true });
  const v = view(w, i);
  if (v.v !== 'code') throw new Error(`켜기 실패: ${JSON.stringify(v)}`);
  await ev(w, i, { e: 'codeWritten' });
  await ev(w, i, { e: 'codeCheck', input: v.code.slice(-4) });
  expect(view(w, i)).toEqual({ v: 'on' });
  return v.code;
}

/** 되찾기(글귀 + 인장 코드) → 글귀 확인까지 */
async function recover(w: World, i: number, code: string, seal?: string) {
  await ev(w, i, { e: 'start', purpose: 'recover' });
  await ev(w, i, { e: 'age', ok: true });
  await ev(w, i, { e: 'submitCode', input: code, ...(seal ? { seal } : {}) });
}

function clean(w: World) {
  expect(w.violations).toEqual([]);
}

describe('오프라인 7일(Q9)', () => {
  for (const days of [7, 10, 31]) {
    it(`${days}일 끊긴 채 매일 깸 → 다시 붙으면: 토큰 갱신 → 충돌은 나란히, 두 본 모두 남음 · 아웃박스는 ${EVENT_MAX_AGE_DAYS}일 창만 · 칸은 만료 표시만`, async () => {
      const w = createWorld(700 + days, 1);
      const A = w.devs[0]!;
      await enable(w, 0);
      // 기기 칸 둘(30일 기한)을 미리: 바꾸기 전 본, 되찾은 본(이 기기 다른 본)
      const old = mainRaw(w);
      A.kv.set(PRE_RESTORE_KEY, JSON.stringify({ at: w.t, raw: old }));
      A.kv.set(PARKED_KEY, JSON.stringify([{ id: 'p1', at: w.t, raw: playOnce(old, w.t, 9_000) }]));
      // 통계 켜기 → 오늘 열기 한 번은 바로 보냄
      await ping(w, 'on');
      await ping(w, 'open'); // 하루 첫 열기 기록
      await ping(w, 'flush'); // 보내기(끊겼으면 재시도 대기)
      await tick(w, 1000);
      expect(w.pings).toHaveLength(1);

      // 끊김 + 접근 토큰 만료(앱을 오래 안 열었다)
      await apply(w, ['net', 0, 0.1]);
      await apply(w, ['expire', 0]);
      for (let d = 1; d <= days; d++) {
        await tick(w, DAY);
        await apply(w, ['play', 0]); // 매일 깸 = 새 본 저장
        await ev(w, 0, { e: 'syncNow' });
        await tick(w, 100);
        // 토큰을 못 받음 = '지금 못 받음'(세션 없음 아님) → 미루기만: 기록·세션·본 그대로
        expect(view(w)).toMatchObject({ v: 'failed', failure: 'offline' });
        expect(readRecord(A.kv)).toMatchObject({ state: 'on', conflict: false });
        expect((await A.deps.auth.token()).kind).toBe('unavailable');
        await ev(w, 0, { e: 'back' });
        expect(view(w)).toEqual({ v: 'on' });
        await ping(w, 'open'); // 하루 첫 열기 기록
        await ping(w, 'flush'); // 보내기(끊겼으면 재시도 대기)
        await tick(w, 100);
        if (d === 3) {
          // 그 사이 다른 쪽(같은 로그인)이 서버 본을 바꿈
          const srvBody = w.srv.peek('A')!.save!.body;
          const other = playOnce(srvBody, w.t, 8_000);
          w.parent.set(keyOf(other), keyOf(srvBody));
          await w.srv.putFromElsewhere('A', other);
        }
      }
      const outbox = JSON.parse(A.kv.getString(NET_KEYS.outbox) ?? '[]') as Array<{ dayN: number }>;
      // 보내기 시도(대기가 아닐 때)마다 7일 창 밖은 버리므로 끊긴 날이 길어도 창 + 하루를 넘지 않는다
      expect(outbox.length).toBe(Math.min(days, EVENT_MAX_AGE_DAYS + 1));
      expect(outbox.length).toBeLessThanOrEqual(OUTBOX_MAX);
      expect(w.pings).toHaveLength(1); // 끊긴 동안 하나도 닿지 않음

      // 다시 붙음
      await apply(w, ['net', 5, 0]);
      await tick(w, 3_600_000); // 재시도 대기(최대 1시간)가 지난 뒤
      const localKey = keyOf(mainRaw(w));
      const serverKey = keyOf(w.srv.peek('A')!.save!.body);
      await ev(w, 0, { e: 'syncNow' });
      await tick(w, 100);
      // 401 unauthorized → 갱신 → 다시 → 409 → 자동으로 고르지 않고 나란히
      expect(view(w)).toMatchObject({ v: 'choose', why: 'conflict', picked: null });
      expect(readRecord(A.kv)!.conflict).toBe(true);
      await ev(w, 0, { e: 'pick', side: 'local' });
      await ev(w, 0, { e: 'confirmPick' });
      await ev(w, 0, { e: 'confirmPick' });
      await tick(w, 100);
      expect(view(w)).toEqual({ v: 'on' });
      const s = w.srv.peek('A')!;
      expect(keyOf(s.save!.body)).toBe(localKey);
      expect(s.conflicts.map((c) => keyOf(c.body))).toContain(serverKey); // 진 본은 서버 conflict 칸

      // 칸은 기한이 지나도 그대로(만료 표시만)
      expect(readPreRestore(A.kv, A.deps.now())).toMatchObject({ raw: old, expired: days > 30 });
      expect(readParkedList(A.kv, A.deps.now()).map((p) => [p.id, p.expired])).toEqual([['p1', days > 30]]);

      // 핑: 7일보다 오래된 날은 버리고 나머지는 보냄, 아웃박스 비움
      await ping(w, 'flush');
      await tick(w, 1000);
      const sent = w.pings.slice(1).flatMap((p) => (JSON.parse(p.body) as { events: Array<{ dayN: number }> }).events.map((e) => e.dayN));
      const today = days; // 다시 붙은 날(dayN)
      expect(sent.length).toBeGreaterThan(0);
      expect(Math.min(...sent)).toBeGreaterThanOrEqual(today - EVENT_MAX_AGE_DAYS);
      expect(sent.length).toBe(Math.min(days, EVENT_MAX_AGE_DAYS + 1)); // 1..days 중 [오늘−7, 오늘] 창 안의 날 수
      expect(JSON.parse(A.kv.getString(NET_KEYS.outbox) ?? '[]')).toEqual([]);
      clean(w);
    });
  }

  it('7일 동안 통계를 끈 채 깸만: 끄는 순간 모아 둔 것을 지우고, 다시 붙어도 핑 0', async () => {
    const w = createWorld(77, 1);
    await ping(w, 'on');
    await apply(w, ['net', 0, 0.1]);
    for (let d = 1; d <= 7; d++) {
      await tick(w, DAY);
      await ping(w, 'open'); // 하루 첫 열기 기록
      await ping(w, 'flush'); // 보내기(끊겼으면 재시도 대기)
    }
    expect(JSON.parse(w.devs[0]!.kv.getString(NET_KEYS.outbox) ?? '[]')).toHaveLength(7);
    await ping(w, 'off');
    expect(w.devs[0]!.kv.getString(NET_KEYS.outbox)).toBeUndefined();
    await apply(w, ['net', 5, 0]);
    for (let d = 0; d < 3; d++) {
      await tick(w, DAY);
      await ping(w, 'open'); // 하루 첫 열기 기록
      await ping(w, 'flush'); // 보내기(끊겼으면 재시도 대기)
    }
    expect(w.pings).toEqual([]);
    clean(w);
  });
});

describe('느린 서버(Q5): 요청마다 10~30초', () => {
  for (const delay of [10_000, 20_000, 30_000]) {
    it(`맡기기 지연 ${delay / 1000}초: ${SLOW_MS / 1000}초에 '느림' → ${delay < CLOUD_TIMEOUT_MS ? '끝까지 기다려 맡김' : "시간 초과 = '다시 시도'"}, 본은 그대로`, async () => {
      const w = createWorld(800, 1);
      await enable(w, 0);
      await apply(w, ['play', 0]);
      const before = w.srv.peek('A')!.save!.rev;
      w.srv.faults.delayMs = delay;
      await ev(w, 0, { e: 'syncNow' });
      await tick(w, SLOW_MS);
      expect(view(w)).toMatchObject({ v: 'busy', task: { t: 'sync' }, slow: true });
      await tick(w, CLOUD_TIMEOUT_MS - SLOW_MS + 1000);
      if (delay < CLOUD_TIMEOUT_MS) {
        expect(view(w)).toEqual({ v: 'on' });
        expect(w.srv.peek('A')!.save!.rev).toBe(before + 1);
      } else {
        expect(view(w)).toMatchObject({ v: 'failed', failure: 'timeout' });
        expect(w.srv.peek('A')!.save!.rev).toBe(before); // 닿기 전에 끊김 — 서버는 그대로
        await apply(w, ['net', 5, 0]);
        await ev(w, 0, { e: 'retry' });
        await tick(w, 100);
        expect(view(w)).toEqual({ v: 'on' });
        expect(keyOf(w.srv.peek('A')!.save!.body)).toBe(keyOf(mainRaw(w)));
      }
      clean(w);
    });
  }

  it('커밋 뒤 응답 20초(반쯤 성공): 시간 초과 → 다시 시도는 같은 sha 빨리 감기, rev는 한 번만 오른다', async () => {
    const w = createWorld(801, 1);
    await enable(w, 0);
    await apply(w, ['play', 0]);
    const rev0 = w.srv.peek('A')!.save!.rev;
    w.srv.faults.delayAfterMs = 20_000;
    await ev(w, 0, { e: 'syncNow' });
    await tick(w, CLOUD_TIMEOUT_MS + 1000);
    expect(view(w)).toMatchObject({ v: 'failed', failure: 'timeout' });
    expect(w.srv.peek('A')!.save!.rev).toBe(rev0 + 1); // 서버는 이미 받았다
    await apply(w, ['net', 5, 0]);
    await ev(w, 0, { e: 'retry' });
    await tick(w, 100);
    expect(view(w)).toEqual({ v: 'on' });
    expect(w.srv.peek('A')!.save!.rev).toBe(rev0 + 1);
    expect(readRecord(w.devs[0]!.kv)).toMatchObject({ rev: rev0 + 1, conflict: false });
    clean(w);
  });

  it("중간 끊김(커밋 뒤 연결 끊김): '연결 없음' → 다시 시도로 수렴", async () => {
    const w = createWorld(802, 1);
    await enable(w, 0);
    await apply(w, ['play', 0]);
    await apply(w, ['net', 3, 0]);
    await ev(w, 0, { e: 'syncNow' });
    await tick(w, 100);
    expect(view(w)).toMatchObject({ v: 'failed', failure: 'offline' });
    await ev(w, 0, { e: 'retry' });
    await tick(w, 100);
    expect(view(w)).toEqual({ v: 'on' });
    expect(keyOf(w.srv.peek('A')!.save!.body)).toBe(keyOf(mainRaw(w)));
    clean(w);
  });

  it("지우기 지연 20초: 두 번 다 시간 초과 → '확인 필요'(지웠다고 하지 않음), 고친 뒤 다시 확인해야 '지웠어요'", async () => {
    const w = createWorld(803, 1);
    await enable(w, 0);
    w.srv.faults.delayMs = 20_000;
    await ev(w, 0, { e: 'askDelete', token: deleteToken(readRecord(w.devs[0]!.kv)) });
    await ev(w, 0, { e: 'confirmDelete', input: deleteToken(readRecord(w.devs[0]!.kv)) });
    await tick(w, SLOW_MS);
    expect(view(w)).toMatchObject({ v: 'busy', task: { t: 'delete' }, slow: true });
    await tick(w, 2 * CLOUD_TIMEOUT_MS);
    expect(view(w)).toEqual({ v: 'deleteCheck', tries: 1 });
    expect(readRecord(w.devs[0]!.kv)!.state).toBe('deleting');
    expect(w.srv.dump()).toHaveLength(1); // 서버는 아직 그대로
    await apply(w, ['net', 5, 0]);
    await ev(w, 0, { e: 'retry' });
    await tick(w, 100);
    expect(view(w)).toEqual({ v: 'deleted' });
    expect(w.srv.dump()).toHaveLength(0);
    clean(w);
  });

  it("지우기 커밋 뒤 응답 20초: 서버는 지웠어도 응답을 못 받은 동안은 '확인 필요', 다시 확인(410 no_account·같은 로그인)에서 '지웠어요'", async () => {
    const w = createWorld(804, 1);
    await enable(w, 0);
    w.srv.faults.delayAfterMs = 20_000;
    const tok = deleteToken(readRecord(w.devs[0]!.kv));
    await ev(w, 0, { e: 'askDelete', token: tok });
    await ev(w, 0, { e: 'confirmDelete', input: tok });
    await tick(w, 2 * CLOUD_TIMEOUT_MS + 1000);
    expect(view(w)).toEqual({ v: 'deleteCheck', tries: 1 });
    expect(w.srv.dump()).toHaveLength(0);
    await apply(w, ['net', 5, 0]);
    await ev(w, 0, { e: 'retry' });
    await tick(w, 100);
    expect(view(w)).toEqual({ v: 'deleted' });
    clean(w);
  });

  it('되찾기 커밋 뒤 응답 20초(인장 코드 없이): 다시 시도의 replay를 되찾음으로 단정하지 않고 나란히(거짓 되찾음 0)', async () => {
    const w = createWorld(805, 2);
    const code = await enable(w, 0);
    w.srv.faults.delayAfterMs = 20_000;
    await recover(w, 1, code);
    await tick(w, CLOUD_TIMEOUT_MS + 1000);
    expect(view(w, 1)).toMatchObject({ v: 'failed', failure: 'timeout', task: { t: 'recover' } });
    await apply(w, ['net', 5, 0]);
    await ev(w, 1, { e: 'retry' });
    await tick(w, 100);
    expect(view(w, 1)).toMatchObject({ v: 'choose', why: 'conflict', note: 'hasCreature' });
    clean(w);
  });

  it('되찾기 커밋 뒤 응답 20초(인장 코드 함께): 다시 시도는 replay(같은 새 글귀), 옛 기기는 410 옮겨 감 — 두 몽망이 모두 남음', async () => {
    const w = createWorld(805, 2);
    const code = await enable(w, 0);
    const seal = w.srv.peek('A')!.creature;
    w.srv.faults.delayAfterMs = 20_000;
    await recover(w, 1, code, seal);
    await tick(w, CLOUD_TIMEOUT_MS + 1000);
    expect(view(w, 1)).toMatchObject({ v: 'failed', failure: 'timeout', task: { t: 'recover' } });
    await apply(w, ['net', 5, 0]);
    await ev(w, 1, { e: 'retry' });
    await tick(w, 100);
    const v = view(w, 1);
    expect(v).toMatchObject({ v: 'code', then: 'restore' });
    expect(v.v === 'code' && v.code.replace(/-/g, '')).toBe(w.srv.peek('B')!.code16);
    await ev(w, 1, { e: 'codeWritten' });
    await ev(w, 1, { e: 'codeCheck', input: v.v === 'code' ? v.code.slice(-4) : '' });
    await tick(w, 100);
    expect(view(w, 1)).toMatchObject({ v: 'choose', why: 'restore' });
    // 옛 기기 A가 올리면 410 → '옮겨 감', A의 본은 기기에 그대로
    await apply(w, ['play', 0]);
    await ev(w, 0, { e: 'syncNow' });
    await tick(w, 100);
    expect(view(w, 0)).toEqual({ v: 'moved' });
    clean(w);
  });

  it("서버 본으로 이어 가기 지연 30초: 시간 초과면 기기 본·칸 그대로('다시 시도'), 고친 뒤 바꿈", async () => {
    const w = createWorld(806, 2);
    const code = await enable(w, 0);
    await recover(w, 1, code);
    await tick(w, 100);
    const v = view(w, 1);
    if (v.v !== 'code') throw new Error(JSON.stringify(v));
    await ev(w, 1, { e: 'codeWritten' });
    await ev(w, 1, { e: 'codeCheck', input: v.code.slice(-4) });
    await tick(w, 100);
    expect(view(w, 1)).toMatchObject({ v: 'choose', why: 'restore' });
    const localBefore = mainRaw(w, 1);
    w.srv.faults.delayMs = 30_000;
    await ev(w, 1, { e: 'pick', side: 'server' });
    await ev(w, 1, { e: 'confirmPick' });
    await ev(w, 1, { e: 'confirmPick' });
    await tick(w, CLOUD_TIMEOUT_MS + 1000);
    expect(view(w, 1)).toMatchObject({ v: 'failed', failure: 'timeout', task: { t: 'takeServer' } });
    expect(mainRaw(w, 1)).toBe(localBefore);
    expect(w.devs[1]!.kv.getString(PRE_RESTORE_KEY)).toBeUndefined();
    await apply(w, ['net', 5, 0]);
    await ev(w, 1, { e: 'retry' });
    await tick(w, 100);
    expect(view(w, 1)).toEqual({ v: 'on' });
    expect(readPreRestore(w.devs[1]!.kv, w.t)!.raw).toBe(localBefore);
    clean(w);
  });
});
