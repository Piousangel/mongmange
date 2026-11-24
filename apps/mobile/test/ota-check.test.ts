// 앱 OTA 확인(V24, src/ota/checker.ts) — 그럴듯한 오답을 잡는 시험. expo-updates는 대역, 시계·타이머는 가짜.
// 잡아야 할 오답: 첫 실행에 묻기 / 하루 두 번 묻기 / 실패·시간 초과가 밖으로 새기 / 실행 중 재시작(reloadAsync) /
// 모듈 없음·개발·웹·OTA 꺼짐에서 무엇이든 하기(저장 포함) / 크래시 루프에서 하루 제한에 막혀 고친 판을 못 받기
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHECK_TIMEOUT_MS, FETCH_TIMEOUT_MS, OTA_KEY, createOtaChecker, readRecord, type OtaDeps, type OtaTimers } from '../src/ota/checker';

const H = 3_600_000;
const DAY0 = Date.parse('2026-12-22T09:00:00+09:00');

function memKV() {
  const m = new Map<string, string>();
  return { getString: (k: string) => m.get(k), set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k), m };
}

function fakeTimers() {
  const q = new Map<number, { fn: () => void; ms: number }>();
  let id = 0;
  const t: OtaTimers & { fireAll(): void; size(): number; pending(): number[] } = {
    set: (fn, ms) => {
      q.set(++id, { fn, ms });
      return id;
    },
    clear: (h) => void q.delete(h as number),
    fireAll: () => {
      const all = [...q.values()];
      q.clear();
      all.forEach((x) => x.fn());
    },
    size: () => q.size,
    pending: () => [...q.values()].map((x) => x.ms),
  };
  return t;
}

type Mode = 'none' | 'new' | 'rollback' | 'throw' | 'hang' | 'fetchThrow' | 'fetchHang';
function fakeUpdates(mode: Mode = 'new') {
  const calls = { check: 0, fetch: 0, reload: 0 };
  const never = new Promise<never>(() => {});
  const u = {
    isEnabled: true,
    calls,
    mode,
    async checkForUpdateAsync() {
      calls.check++;
      if (u.mode === 'throw') throw new Error('net');
      if (u.mode === 'hang') return never;
      if (u.mode === 'none') return { isAvailable: false, isRollBackToEmbedded: false };
      if (u.mode === 'rollback') return { isAvailable: false, isRollBackToEmbedded: true };
      return { isAvailable: true, isRollBackToEmbedded: false };
    },
    async fetchUpdateAsync() {
      calls.fetch++;
      if (u.mode === 'fetchThrow') throw new Error('disk');
      if (u.mode === 'fetchHang') return never;
      if (u.mode === 'rollback') return { isNew: false, isRollBackToEmbedded: true };
      return { isNew: true, isRollBackToEmbedded: false };
    },
    // 진짜 모듈에는 있다 — 이 코드가 부르면 '실행 중 재시작'이다
    async reloadAsync() {
      calls.reload++;
    },
  };
  return u;
}

function setup(over: Partial<OtaDeps> = {}, mode: Mode = 'new') {
  const kv = memKV();
  const updates = fakeUpdates(mode);
  const timers = fakeTimers();
  let t = DAY0;
  const clock = { set: (x: number) => (t = x), add: (ms: number) => (t += ms) };
  const deps = (): OtaDeps => ({ updates, platform: 'ios', dev: false, kv, now: () => t, timers, ...over });
  /** 콜드 스타트 하나(새 checker = 새 JS 실행) */
  const launch = () => createOtaChecker(deps());
  return { kv, updates, timers, clock, launch };
}

/** 한 번 실행해서 앞에 두었다가 백그라운드로(깨끗한 끝) */
async function cleanRun(s: ReturnType<typeof setup>) {
  const c = s.launch();
  const r = await c.start();
  void c.onAppState('background');
  return r;
}

describe('OTA 확인 — 언제 묻나', () => {
  it('첫 실행에는 묻지 않는다(그 세션에서 다음 날 다시 앞으로 와도)', async () => {
    const s = setup();
    const c = s.launch();
    expect(await c.start()).toBe('first');
    void c.onAppState('background');
    s.clock.add(30 * H);
    expect(await c.onAppState('active')).toBe('first');
    expect(s.updates.calls.check).toBe(0);
  });
  it('둘째 실행에 묻고 새 판을 받는다(적용은 하지 않음)', async () => {
    const s = setup();
    await cleanRun(s);
    s.clock.add(H);
    expect(await cleanRun(s)).toBe('fetched');
    expect(s.updates.calls).toEqual({ check: 1, fetch: 1, reload: 0 });
  });
  it('하루에 두 번 열어도(콜드 스타트 2·앞으로 오기 2) 확인은 1번, 다음 날 다시 1번', async () => {
    const s = setup();
    await cleanRun(s);
    s.clock.add(H);
    await cleanRun(s);
    s.clock.add(2 * H);
    expect(await cleanRun(s)).toBe('later');
    const c = s.launch();
    await c.start();
    void c.onAppState('background');
    s.clock.add(H);
    expect(await c.onAppState('active')).toBe('later');
    expect(s.updates.calls.check).toBe(1);
    s.clock.add(20 * H); // 다음 날(현지 날짜)
    expect(await c.onAppState('active')).toBe('fetched');
    expect(s.updates.calls.check).toBe(2);
  });
  it('새 판 없음 → 받지 않는다. 확인 중 다시 앞으로 와도 겹쳐 묻지 않는다', async () => {
    const s = setup({}, 'hang');
    await cleanRun(s);
    s.clock.add(H);
    const c = s.launch();
    const p = c.start();
    expect(await c.onAppState('active')).toBe('busy');
    s.timers.fireAll();
    expect(await p).toBe('timeout');
    expect(s.updates.calls.check).toBe(1);
    s.updates.mode = 'none';
    s.clock.add(24 * H);
    expect(await c.onAppState('active')).toBe('none');
    expect(s.updates.calls.fetch).toBe(0);
  });
});

describe('OTA 확인 — 실패는 조용히', () => {
  for (const mode of ['throw', 'fetchThrow'] as const) {
    it(`${mode}: 던지지 않고 'failed', 그날은 다시 묻지 않는다`, async () => {
      const s = setup({}, mode);
      await cleanRun(s);
      s.clock.add(H);
      expect(await cleanRun(s)).toBe('failed');
      s.clock.add(H);
      expect(await cleanRun(s)).toBe('later');
      expect(s.updates.calls.check).toBe(1);
    });
  }
  for (const [mode, ms] of [
    ['hang', CHECK_TIMEOUT_MS],
    ['fetchHang', FETCH_TIMEOUT_MS],
  ] as const) {
    it(`${mode}: ${ms}ms 시간 초과 → 'timeout'(약속이 끝난다), 타이머가 남지 않는다`, async () => {
      const s = setup({}, mode);
      await cleanRun(s);
      s.clock.add(H);
      const c = s.launch();
      const p = c.start();
      // 걸린 단계(확인 또는 받기)의 제한 타이머가 걸릴 때까지 마이크로태스크를 돌린다
      for (let i = 0; i < 50 && !s.timers.pending().includes(ms); i++) await Promise.resolve();
      expect(s.timers.pending()).toEqual([ms]);
      s.timers.fireAll();
      expect(await p).toBe('timeout');
      expect(s.timers.size()).toBe(0);
    });
  }
  it('성공하면 시간 초과 타이머를 지운다', async () => {
    const s = setup();
    await cleanRun(s);
    s.clock.add(H);
    await cleanRun(s);
    expect(s.timers.size()).toBe(0);
  });
  it('저장소가 던져도 밖으로 새지 않는다', async () => {
    const s = setup();
    await cleanRun(s);
    s.kv.set = () => {
      throw new Error('full');
    };
    s.clock.add(H);
    expect(await cleanRun(s)).toBe('fetched');
  });
});

describe('OTA 확인 — 적용·의례', () => {
  it('내장판 지시(rollBackToEmbedded)도 받기만 한다 → 다음 실행에 내장판', async () => {
    const s = setup({}, 'rollback');
    await cleanRun(s);
    s.clock.add(H);
    expect(await cleanRun(s)).toBe('rollback');
    expect(s.updates.calls).toEqual({ check: 1, fetch: 1, reload: 0 });
  });
  it('어떤 흐름에서도 재시작(reloadAsync) 0 — 받은 뒤 백그라운드·앞으로 오기를 거듭해도(의례 중 적용 0)', async () => {
    const s = setup();
    await cleanRun(s);
    s.clock.add(H);
    const c = s.launch();
    expect(await c.start()).toBe('fetched');
    for (let i = 0; i < 3; i++) {
      void c.onAppState('inactive');
      void c.onAppState('background');
      s.clock.add(25 * H);
      await c.onAppState('active');
    }
    expect(s.updates.calls.reload).toBe(0);
  });
  it('정적: 앱 코드 어디에도 reloadAsync 호출이 없다(실행 중 재시작 금지)', () => {
    const root = join(__dirname, '..');
    const files: string[] = [join(root, 'App.tsx'), join(root, 'index.ts')];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(n)) files.push(p);
      }
    };
    walk(join(root, 'src'));
    expect(files.some((f) => f.endsWith(join('ota', 'index.ts')))).toBe(true);
    for (const f of files) expect(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, ''), f).not.toMatch(/reloadAsync\s*\(/);
  });
});

describe('OTA 확인 — 아무것도 안 하는 빌드', () => {
  const cases: [string, Partial<OtaDeps>][] = [
    ['expo-updates 모듈 없음', { updates: null }],
    ['개발 빌드', { dev: true }],
    ['웹', { platform: 'web' }],
  ];
  for (const [name, over] of cases) {
    it(`${name}: 묻지도 저장하지도 않는다`, async () => {
      const s = setup(over);
      for (let i = 0; i < 3; i++) {
        const c = s.launch();
        expect(await c.start()).toBe('off');
        expect(c.onAppState('active')).toBeNull();
        expect(c.onAppState('background')).toBeNull();
        s.clock.add(25 * H);
      }
      expect(s.updates.calls).toEqual({ check: 0, fetch: 0, reload: 0 });
      expect(s.kv.m.size).toBe(0);
    });
  }
  it('OTA 꺼진 바이너리(가드 ready false → isEnabled false): 묻지도 저장하지도 않는다', async () => {
    const s = setup();
    s.updates.isEnabled = false;
    await cleanRun(s);
    s.clock.add(25 * H);
    expect(await cleanRun(s)).toBe('off');
    expect(s.updates.calls.check).toBe(0);
    expect(s.kv.m.size).toBe(0);
  });
});

describe('OTA 확인 — 크래시 루프(D-22)', () => {
  /** 앞에서 죽은 실행(백그라운드를 거치지 않음) */
  async function crashRun(s: ReturnType<typeof setup>) {
    return s.launch().start();
  }
  it('앞에서 끝난 실행이 2번 연달아면 오늘 이미 물었어도 바로 묻는다(고친 판·내장판 지시를 받게)', async () => {
    const s = setup({}, 'none');
    await cleanRun(s);
    s.clock.add(H);
    expect(await crashRun(s)).toBe('none'); // 오늘 첫 확인, 그리고 죽음(1)
    s.clock.add(60_000);
    expect(await crashRun(s)).toBe('later'); // 죽음(2) 전 실행: 아직 1번
    s.updates.mode = 'rollback';
    s.clock.add(60_000);
    expect(await crashRun(s)).toBe('rollback'); // 앞 실행 2번 연달아 앞에서 끝남 → 하루 제한 건너뜀
    expect(s.updates.calls.check).toBe(2);
    expect(s.updates.calls.reload).toBe(0);
  });
  it('깨끗한 끝(백그라운드)을 거치면 세기가 0으로 → 하루 제한 그대로', async () => {
    const s = setup({}, 'none');
    await cleanRun(s);
    s.clock.add(H);
    await crashRun(s);
    s.clock.add(60_000);
    await cleanRun(s); // 1번 죽은 뒤 이번엔 깨끗하게 끝남
    s.clock.add(60_000);
    expect(await crashRun(s)).toBe('later');
    expect(readRecord(s.kv)?.crash).toBe(0);
    expect(s.updates.calls.check).toBe(1);
  });
  it('죽음 1 → 다음 실행은 뒤로 갔다 다시 앞으로 온 뒤 죽음: 연속이 아니므로 하루 제한 그대로', async () => {
    const s = setup({}, 'none');
    await cleanRun(s);
    s.clock.add(H);
    await crashRun(s); // 오늘 확인 1번, 죽음
    s.clock.add(60_000);
    const b = s.launch();
    expect(await b.start()).toBe('later'); // 세기 1
    void b.onAppState('background'); // 깨끗한 끝 → 세기 0
    s.clock.add(60_000);
    await b.onAppState('active'); // 다시 앞으로 온 뒤 죽음
    s.clock.add(60_000);
    expect(await crashRun(s)).toBe('later'); // 연속 1번뿐
    expect(s.updates.calls.check).toBe(1);
  });
  it('iOS 앱 전환기(inactive)에서 끝난 실행은 크래시로 세지 않는다(L1) — 두 번 연달아도 하루 제한 그대로', async () => {
    const s = setup({}, 'none');
    await cleanRun(s);
    s.clock.add(H);
    for (let i = 0; i < 3; i++) {
      const c = s.launch();
      await c.start();
      void c.onAppState('inactive'); // 전환기를 열고 카드를 쓸어 올림 → background 없이 끝
      s.clock.add(60_000);
    }
    expect(readRecord(s.kv)?.crash).toBe(0);
    expect(s.updates.calls.check).toBe(1);
  });
  it('확인 도중 죽어도(시도를 먼저 기록) 같은 날 다음 실행은 묻지 않는다 — 이 죽음은 크래시 1로 세어진다(루프 기준 2 미만)', async () => {
    const s = setup({}, 'hang');
    await cleanRun(s);
    s.clock.add(H);
    void s.launch().start(); // 확인이 끝나지 않은 채 죽음(백그라운드 없음)
    s.clock.add(60_000);
    expect(await s.launch().start()).toBe('later');
    expect(readRecord(s.kv)?.crash).toBe(1);
    expect(s.updates.calls.check).toBe(1);
  });
  it('저장 값은 시각·표시·세기뿐(식별자 0)', async () => {
    const s = setup();
    await cleanRun(s);
    s.clock.add(H);
    await cleanRun(s);
    expect([...s.kv.m.keys()]).toEqual([OTA_KEY]);
    expect(Object.keys(JSON.parse(s.kv.m.get(OTA_KEY)!)).sort()).toEqual(['crash', 'first', 'last', 'open', 'v']);
  });
  it('깨진 저장 값: 첫 실행으로 보지 않고 묻는다(던지지 않음)', async () => {
    const s = setup();
    s.kv.set(OTA_KEY, '{oops');
    expect(await s.launch().start()).toBe('fetched');
  });
});
