// 세이브 슬롯: 쓰기 전 검증, 저장소 예외 무해화, 하루 한 번 백업, 본 손상 시 백업 복원, corrupt 2개, 마이그레이션 전 원문, 콜드 스타트.
import { describe, expect, it } from 'vitest';
import { SAVE_KEYS, clearSave, readSave, sim, writeSave, type KV } from '../src/index';
import { KST, handStroke, kst, play } from './sim-helpers';

function memKV(): KV & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getString: (k) => m.get(k), set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
}

const base = () => sim.createInitial(kst(11, 20, 15), KST, 7);
const stroked = () => play(base(), [{ type: 'stroke', at: kst(11, 20, 15, 2), raw: handStroke(3) }]).state;

describe('세이브 슬롯', () => {
  it('빈 저장소 → none, hadSave 없음', () => {
    expect(readSave(memKV())).toEqual({ state: null, source: 'none', error: undefined, hadSave: false });
  });

  it('왕복 + 콜드 스타트 규칙(앞에 있던 채로 저장 → savedAt에 백그라운드)', () => {
    const kv = memKV();
    writeSave(kv, stroked(), kst(11, 20, 15, 3));
    const r = readSave(kv);
    expect(r.source).toBe('main');
    expect(r.state!.strokesTotal).toBe(1);
    expect(r.state!.backgroundSince).toBe(kst(11, 20, 15, 3));
  });

  it('백업은 하루 한 번: 처음 한 번 생기고, rotateBackup 없이는 그대로, 있으면 직전 본으로', () => {
    const kv = memKV();
    writeSave(kv, base(), kst(11, 20, 15, 1));
    expect(kv.m.has(SAVE_KEYS.backup)).toBe(false);
    const first = kv.m.get(SAVE_KEYS.main);
    writeSave(kv, base(), kst(11, 20, 15, 2)); // 백업이 없으니 민다
    expect(kv.m.get(SAVE_KEYS.backup)).toBe(first);
    writeSave(kv, stroked(), kst(11, 20, 15, 3)); // 탭마다 밀지 않는다
    expect(kv.m.get(SAVE_KEYS.backup)).toBe(first);
    const yesterday = kv.m.get(SAVE_KEYS.main);
    const w = writeSave(kv, stroked(), kst(11, 21, 7), { rotateBackup: true }); // 깸 직후
    expect(w.ok && w.rotated).toBe(true);
    expect(kv.m.get(SAVE_KEYS.backup)).toBe(yesterday);
  });

  it('본이 깨지면 백업에서 복원하고 원문은 corrupt에 최근 2개까지 남긴다', () => {
    const kv = memKV();
    const s0 = base();
    writeSave(kv, s0, kst(11, 20, 15, 1));
    writeSave(kv, s0, kst(11, 20, 15, 2));
    kv.set(SAVE_KEYS.main, 'broken-1');
    const r = readSave(kv);
    expect(r.source).toBe('backup');
    expect(r.error).toBeTruthy();
    expect(r.hadSave).toBe(true);
    expect(r.state!.createdAt).toBe(s0.createdAt);
    kv.set(SAVE_KEYS.main, 'broken-2');
    readSave(kv);
    expect(kv.m.get(SAVE_KEYS.corrupt)).toBe('broken-2');
    expect(kv.m.get(SAVE_KEYS.corruptPrev)).toBe('broken-1');
  });

  it('본·백업이 모두 깨지면 state null + hadSave(복구 안내 대상)', () => {
    const kv = memKV();
    kv.set(SAVE_KEYS.main, 'x');
    kv.set(SAVE_KEYS.backup, 'y');
    const r = readSave(kv);
    expect(r.state).toBeNull();
    expect(r.hadSave).toBe(true);
  });

  it('검증에 실패하는 상태는 쓰지 않는다(본 그대로)', () => {
    const kv = memKV();
    writeSave(kv, base(), kst(11, 20, 15, 1));
    const before = kv.m.get(SAVE_KEYS.main);
    const bad = { ...base(), phase: 'dancing' } as unknown as sim.State;
    const w = writeSave(kv, bad, kst(11, 20, 15, 2));
    expect(w.ok).toBe(false);
    expect(kv.m.get(SAVE_KEYS.main)).toBe(before);
  });

  it('저장소가 던져도(디스크 가득) 예외 없이 ok:false, 읽기 예외는 none', () => {
    const kv: KV = {
      getString: () => undefined,
      set: () => {
        throw new Error('ENOSPC');
      },
      remove: () => {},
    };
    let w: ReturnType<typeof writeSave> | undefined;
    expect(() => (w = writeSave(kv, base(), 1))).not.toThrow();
    expect(w!.ok).toBe(false);
    if (!w!.ok) expect(w!.error).toContain('io');
    const throwingRead: KV = {
      getString: () => {
        throw new Error('EIO');
      },
      set: () => {},
      remove: () => {},
    };
    expect(readSave(throwingRead).source).toBe('none');
  });

  it('옛 버전 본(sim 블록 없는 봉투 v2)은 마이그레이션 전 원문을 pre-v 키에 한 번 남긴다', () => {
    const kv = memKV();
    const legacy = JSON.stringify({ schemaVersion: 2, strokes: [] });
    kv.set(SAVE_KEYS.main, legacy);
    readSave(kv);
    expect(kv.m.get(`${SAVE_KEYS.preMigration}2.none`)).toBe(legacy);
  });

  it('초기화', () => {
    const kv = memKV();
    writeSave(kv, base(), 1);
    writeSave(kv, base(), 2);
    clearSave(kv);
    expect(kv.m.size).toBe(0);
  });
});

describe('sim 선택자', () => {
  it('strokeBlock: 그을 수 있음 → null, 그은 뒤 used, 잠 asleep', () => {
    const s0 = base();
    expect(sim.strokeBlock(s0)).toBeNull();
    expect(sim.strokeBlock(stroked())).toBe('used');
    const slept = play(s0, [{ type: 'putToSleep', at: kst(11, 20, 15, 5) }]).state;
    expect(sim.strokeBlock(slept)).toBe('asleep');
  });
});
