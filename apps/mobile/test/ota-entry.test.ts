// 진입점 방어(V24 리뷰 M2·L2·L3): OTA 코드가 무엇을 던져도 앱은 뜬다 / App 로드 실패는 빈 화면이 아니라 크래시로 끝난다 /
// 진입점이 동기 등록 뒤 startOta를 try 안에서 부른다. react-native는 대역(진짜 모듈은 node에서 못 불러옴).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    addEventListener: () => {
      throw new Error('AppState 대역: 등록 실패');
    },
  },
}));

const { startOta, startOtaWith, whenForeground } = await import('../src/ota/index');
const { rethrowLater } = await import('../src/lib/rethrowLater');
type Env = Parameters<typeof startOtaWith>[0];

function memKV() {
  const m = new Map<string, string>();
  return { getString: (k: string) => m.get(k), set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k), m };
}
const updates = () => ({
  isEnabled: true,
  checkForUpdateAsync: async () => ({ isAvailable: false }),
  fetchUpdateAsync: async () => ({ isNew: false }),
});
const env = (over: Partial<Env> = {}): Env => ({
  dev: false,
  platform: 'ios',
  loadUpdates: updates,
  loadKV: () => memKV(),
  onAppState: () => {},
  now: () => Date.parse('2026-12-22T09:00:00+09:00'),
  timers: { set: () => 0, clear: () => {} },
  ...over,
});
const boom = () => {
  throw new Error('boom');
};

describe('startOta는 무슨 일이 있어도 던지지 않는다(L2)', () => {
  it('정상: 시작하고 AppState를 구독한다, 첫 실행 기록을 남긴다', () => {
    const kv = memKV();
    let subs = 0;
    expect(startOtaWith(env({ loadKV: () => kv, onAppState: () => void subs++ }))).toBe(true);
    expect(subs).toBe(1);
    expect(kv.m.has('mong.ota')).toBe(true);
  });
  it('저장소(MMKV) 로드 실패·모듈 로드 실패·구독 실패·시계 실패 → false, 던지지 않음', () => {
    expect(startOtaWith(env({ loadKV: boom }))).toBe(false);
    expect(startOtaWith(env({ loadUpdates: boom }))).toBe(false);
    expect(startOtaWith(env({ onAppState: boom }))).toBe(false);
    expect(startOtaWith(env({ now: boom }))).toBe(false);
  });
  it('개발·웹·isEnabled false: 모듈·저장소를 불러 보지도 않는다', () => {
    let loads = 0;
    const count = () => {
      loads++;
      return memKV();
    };
    expect(startOtaWith(env({ dev: true, loadKV: count, loadUpdates: () => (loads++, updates()) }))).toBe(false);
    expect(startOtaWith(env({ platform: 'web', loadKV: count, loadUpdates: () => (loads++, updates()) }))).toBe(false);
    expect(loads).toBe(0);
    expect(startOtaWith(env({ loadKV: count, loadUpdates: () => ({ ...updates(), isEnabled: false }) }))).toBe(false);
    expect(loads).toBe(0);
  });
  it('실제 startOta(대역 AppState가 던짐·node엔 expo-updates 네이티브 없음)도 던지지 않는다', () => {
    expect(() => startOta()).not.toThrow();
    expect(() => startOta()).not.toThrow(); // 두 번째는 아무것도 안 함
  });
});

describe('App 로드 실패는 크래시로 끝난다(M2)', () => {
  it('rethrowLater: 바로 던지지 않고(등록은 동기 유지), 다음 틱에 같은 오류를 던진다', () => {
    const q: Array<{ fn: () => void; ms: number }> = [];
    const err = new Error('App 모듈 평가 실패');
    expect(() => rethrowLater(err, (fn, ms) => q.push({ fn, ms }))).not.toThrow();
    expect(q.map((x) => x.ms)).toEqual([0]);
    expect(() => q[0]!.fn()).toThrow(err);
  });
  it('오류가 아닌 값도 Error로 던진다', () => {
    const q: Array<() => void> = [];
    rethrowLater('문자열', (fn) => q.push(fn));
    expect(() => q[0]!()).toThrow(/문자열/);
  });
});

describe('진입점(index.ts) 정적 고정(L3)', () => {
  const src = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8').replace(/\/\/.*$/gm, '');
  it('등록은 최상위 동기(약속 안이 아님), 그 뒤 try 안에서 startOta()', () => {
    const reg = src.search(/^registerRootComponent\(Boot\);/m);
    const ota = src.search(/^try \{\s*startOta\(\);\s*\} catch/m);
    expect(reg).toBeGreaterThan(0);
    expect(ota).toBeGreaterThan(reg);
    expect(src.match(/startOta\(\)/g)).toHaveLength(1);
  });
  it('App 로드 실패를 rethrowLater로 크래시로 보낸다', () => {
    expect(src).toMatch(/ready\.catch\(\(e: unknown\) => \{\s*rethrowLater\(e\);/);
  });
});

describe('Android 위젯 헤드리스 기동에서는 OTA를 시작하지 않는다(C10 리뷰 L2)', () => {
  const harness = (platform: string, current: string | null) => {
    const fns: Array<(s: string) => void> = [];
    let removed = 0;
    let starts = 0;
    whenForeground(platform, current, (fn) => (fns.push(fn), { remove: () => void removed++ }), () => void starts++);
    return { emit: (st: string) => fns.forEach((f) => f(st)), get starts() { return starts; }, get removed() { return removed; }, subs: fns.length };
  };
  it('Android가 이미 active면 곧바로, iOS는 상태와 무관하게 곧바로(V24 그대로)', () => {
    expect(harness('android', 'active').starts).toBe(1);
    expect(harness('ios', 'background').starts).toBe(1);
    expect(harness('ios', null).starts).toBe(1);
  });
  it('Android가 background(헤드리스)면 시작하지 않고, 첫 active에서 한 번만 시작하고 구독을 푼다', () => {
    const h = harness('android', 'background');
    expect(h.starts).toBe(0);
    h.emit('background');
    h.emit('inactive');
    expect(h.starts).toBe(0);
    h.emit('active');
    expect(h.starts).toBe(1);
    expect(h.removed).toBe(1);
    expect(harness('android', null).starts).toBe(0);
  });
});

describe('startOta는 반드시 whenForeground를 거친다(C10 재리뷰 경미 — 헤드리스 기동 때 OTA 금지)', () => {
  it('startOta 본문이 startNow를 직접 부르지 않고 whenForeground에 넘긴다', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'ota', 'index.ts'), 'utf8').replace(/\/\/.*$/gm, '');
    const body = src.slice(src.indexOf('export function startOta('), src.indexOf('function startNow('));
    expect(body).toMatch(/whenForeground\([\s\S]*?,\s*startNow\);/);
    expect(body.replace(/whenForeground\([\s\S]*?,\s*startNow\);/, '')).not.toMatch(/startNow\s*\(/);
  });
});
