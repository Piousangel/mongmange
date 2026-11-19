// store 연결(리뷰 C13): 설치 = 첫 탭, 설치 판정 = 세이브 하나, 메타 손상 무해, 저장소 예외에도 계속, 백그라운드 → 저장 순서, 깸 직후 백업.
import type { KV } from '@mong/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { __configureForTest, boot, dispatch, getSnapshot, goBackground, install, onEffects, setMeta, tickNow } from '../src/game/store';

const KST_NOON = Date.UTC(2026, 10, 20, 3, 0); // 서울 12:00
function memKV(): KV & { m: Map<string, string>; fail: boolean } {
  const m = new Map<string, string>();
  const kv = {
    m,
    fail: false,
    getString: (k: string) => m.get(k),
    set: (k: string, v: string) => {
      if (kv.fail) throw new Error('ENOSPC');
      m.set(k, v);
    },
    remove: (k: string) => void m.delete(k),
  };
  return kv;
}
let t = KST_NOON;
let kv = memKV();
beforeEach(() => {
  t = KST_NOON;
  kv = memKV();
  __configureForTest({ kv, now: () => t });
});
const restart = () => {
  __configureForTest({ kv, now: () => t });
  boot();
};

describe('store', () => {
  it('세이브가 없으면 설치 전(state null) — 인트로 탭 전에 닫아도 세이브가 생기지 않는다', () => {
    boot();
    expect(getSnapshot().state).toBeNull();
    expect(kv.m.has('mong.save.main')).toBe(false);
  });

  it('첫 탭에 설치 → 재시작하면 같은 몽망이(메타가 깨져도 인트로로 돌아가지 않는다)', () => {
    boot();
    install();
    dispatch({ type: 'tap', target: 'body', holdMs: 0, x: 0, y: 0 });
    const created = getSnapshot().state!.createdAt;
    kv.m.set('mong.meta', '{broken');
    t += 60_000;
    restart();
    expect(getSnapshot().state?.createdAt).toBe(created);
    expect(getSnapshot().meta.notifEnabled).toBe(true); // 기본값으로
  });

  it('저장소가 던져도 dispatch·setMeta가 크래시하지 않고 메모리로 계속 간다', () => {
    boot();
    install();
    kv.fail = true;
    expect(() => dispatch({ type: 'grind', durationMs: 3000 })).not.toThrow();
    expect(getSnapshot().state!.ledger.grindMs).toBe(3000);
    expect(getSnapshot().saveError).toContain('io');
    expect(() => setMeta({ listView: true })).not.toThrow();
    expect(getSnapshot().meta.listView).toBe(true);
    kv.fail = false;
    dispatch({ type: 'grind', durationMs: 1000 });
    expect(getSnapshot().saveError).toBeNull();
  });

  it('백그라운드는 sim에 알린 뒤 저장된다(저장본에 backgroundSince)', () => {
    boot();
    install();
    t += 5000;
    goBackground();
    const j = JSON.parse(kv.m.get('mong.save.main')!);
    expect(j.sim.state.backgroundSince).toBe(t);
  });

  it('깸 직후에만 백업이 어제 본으로 바뀐다', () => {
    t = KST_NOON + 4 * 3_600_000; // 서울 16:00 설치 → 06시 깸 뒤 10h라 재울 수 있다
    boot();
    install();
    t += 1000;
    dispatch({ type: 'grind', durationMs: 2000 }); // 백업이 없어서 첫 백업 생성
    const firstBackup = kv.m.get('mong.save.backup');
    t += 1000;
    dispatch({ type: 'grind', durationMs: 2000 });
    expect(kv.m.get('mong.save.backup')).toBe(firstBackup);
    t += 1000;
    dispatch({ type: 'putToSleep' });
    expect(getSnapshot().state!.phase).toBe('asleep');
    const before = kv.m.get('mong.save.main');
    t += 20 * 3_600_000;
    let woke = false;
    const off = onEffects((e) => (woke ||= e.some((x) => x.type === 'woke')));
    tickNow();
    off();
    expect(woke).toBe(true);
    expect(kv.m.get('mong.save.backup')).toBe(before);
  });

  it('손상된 세이브만 있으면 lostSave(조용히 새 몽망이를 만들지 않는다)', () => {
    kv.m.set('mong.save.main', 'x');
    restart();
    expect(getSnapshot().state).toBeNull();
    expect(getSnapshot().lostSave).toBe(true);
  });
});
