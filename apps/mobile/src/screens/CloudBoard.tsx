// 맡겨 두기 확인판(웹 ?screen=cloud&cv=<갈래>, 캡처 scripts/c12-capture.mjs). 제품 화면이 아니다 —
// 가짜 서버(cloud/fakeServer.ts)와 메모리 기기 저장소로 시트의 각 갈래를 실제 작업 흐름으로 만들어 보여 준다.
// 이 기기 본 = 웹 저장소의 세이브(캡처가 flow-v1 스냅숏을 넣음), 다른 기기 본 = 그 스냅숏의 백업 본(없으면 새로 만든 몽망이).
import { PALETTE, SAVE_KEYS, sim, type KV } from '@mong/core';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { sha256Hex } from '../cloud';
import { createCloudApi } from '../cloud/api';
import { createFakeServer } from '../cloud/fakeServer';
import { deleteToken, type View as CloudView } from '../cloud/model';
import { addParked, markUnconfirmedDelete, writeRecord, readRecord } from '../cloud/record';
import { markCodeConfirmed, runTask, sideOf, type TaskDeps } from '../cloud/tasks';
import { kv as webKV } from '../game/storage';
import { CloudSheetHost } from './CloudSheet';

function memKV(): KV {
  const m = new Map<string, string>();
  return { getString: (k) => m.get(k), set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
}

function fallbackSave(seed: number, day: number): string {
  const at = Date.UTC(2026, 10, 25, 3);
  const s = sim.createInitial(at - day * 86_400_000, 540, seed);
  return sim.serializeState({ ...s, dayIndex: day }, at - day * 3_600_000);
}

async function setup(cv: string): Promise<{ deps: TaskDeps; initial?: CloudView }> {
  const server = createFakeServer(sha256Hex, 7);
  const kv = memKV();
  const local = webKV.getString(SAVE_KEYS.main) ?? fallbackSave(3, 1);
  const other = webKV.getString(SAVE_KEYS.backup) ?? fallbackSave(11, 5);
  kv.set(SAVE_KEYS.main, local);
  const auth = server.authFor('board');
  const deps: TaskDeps = {
    api: createCloudApi({ fetch: server.fetch, base: 'https://fake.local', auth }),
    auth,
    kv,
    sha256: sha256Hex,
    now: () => Date.now(),
    local: {
      raw: () => kv.getString(SAVE_KEYS.main) ?? null,
      adopt: (st) => {
        kv.set(SAVE_KEYS.main, sim.serializeState(st, Date.now()));
        return true;
      },
    },
  };
  const enable = async () => (await runTask({ t: 'enable' }, deps)) as { r: string; code?: string };
  const conflict = async () => {
    await enable();
    markCodeConfirmed(kv);
    await server.putFromElsewhere('board', other);
    return runTask({ t: 'fetch', why: 'conflict' }, deps);
  };
  switch (cv) {
    case 'age':
      return { deps, initial: { v: 'age', purpose: 'enable' } };
    case 'under':
      return { deps, initial: { v: 'ageUnder' } };
    case 'code': {
      const r = await enable();
      return { deps, initial: { v: 'code', code: r.code ?? '', step: 'show', then: 'on', mismatch: false } };
    }
    case 'confirm': {
      const r = await enable();
      return { deps, initial: { v: 'code', code: r.code ?? '', step: 'confirm', then: 'on', mismatch: true } };
    }
    case 'recover':
      return { deps, initial: { v: 'recoverInput', error: 'notFound' } };
    case 'choose':
    case 'choose-confirm':
    case 'choose-has':
    case 'unreadable': {
      const r = await conflict();
      if (r.r !== 'compare') return { deps };
      const base = { v: 'choose' as const, why: 'conflict' as const, local: r.local, server: r.server, pick: r.pick, picked: null, confirming: false, note: null };
      if (cv === 'choose') return { deps, initial: base };
      if (cv === 'choose-confirm') return { deps, initial: { ...base, picked: 'server', confirming: true } };
      if (cv === 'choose-has') return { deps, initial: { ...base, note: 'hasCreature', picked: 'local', confirming: true } };
      return { deps, initial: { ...base, server: { ...r.server, state: null } } };
    }
    case 'on':
      await enable();
      markCodeConfirmed(kv);
      return { deps, initial: { v: 'on' } };
    case 'on-parked': {
      await enable();
      markCodeConfirmed(kv);
      const rec = readRecord(kv);
      if (rec) writeRecord(kv, rec);
      addParked(kv, other, Date.now());
      return { deps, initial: { v: 'on' } };
    }
    case 'on-attention': {
      await enable();
      const rec = readRecord(kv);
      if (rec) writeRecord(kv, { ...rec, conflict: true, codeConfirmed: false });
      return { deps, initial: { v: 'on' } };
    }
    case 'slow':
      await enable();
      markCodeConfirmed(kv);
      kv.set(SAVE_KEYS.main, other);
      server.faults.delayMs = 600_000;
      return { deps, initial: { v: 'busy', task: { t: 'sync' }, slow: false } };
    case 'failed':
      await enable();
      return { deps, initial: { v: 'failed', task: { t: 'sync' }, failure: 'offline' } };
    case 'delete':
      await enable();
      markCodeConfirmed(kv);
      return { deps, initial: { v: 'deleteConfirm', token: deleteToken(readRecord(kv)), mismatch: false } };
    case 'delete-check':
      return { deps, initial: { v: 'deleteCheck', tries: 2 } };
    case 'park-full': {
      for (let i = 0; i < 3; i++) addParked(kv, fallbackSave(40 + i, 2 + i), Date.now() - i * 86_400_000);
      return { deps, initial: { v: 'parkFull' } };
    }
    case 'old-account':
      markUnconfirmedDelete(kv, 'K7M2ABCD', Date.now());
      return { deps, initial: { v: 'oldAccount', purpose: 'enable' } };
    case 'old-cleared':
      return { deps, initial: { v: 'oldCleared', purpose: 'enable' } };
    case 'unconfirmed':
      markUnconfirmedDelete(kv, 'K7M2ABCD', Date.now());
      return { deps };
    case 'already':
      return { deps, initial: { v: 'already' } };
    case 'revert':
      return { deps, initial: { v: 'revertConfirm', back: 'on', now: sideOf(local), before: sideOf(other) } };
    case 'moved':
      return { deps, initial: { v: 'moved' } };
    default:
      return { deps };
  }
}

function readCv(): string {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').get('cv') ?? 'intro';
  } catch {
    return 'intro';
  }
}

export function CloudBoard() {
  const [ready, setReady] = useState<{ deps: TaskDeps; initial?: CloudView } | null>(null);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    let alive = true;
    void setup(readCv()).then((r) => {
      if (alive) setReady(r);
    });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <View style={styles.fill} testID="cloud-board">
      {ready && <CloudSheetHost visible={open} onClose={() => setOpen(false)} deps={ready.deps} initial={ready.initial} tzOffsetMin={() => -new Date().getTimezoneOffset()} />}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: PALETTE.day.bgShade },
});
