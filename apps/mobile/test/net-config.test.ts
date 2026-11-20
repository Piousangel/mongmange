// 원격 플래그 로더(B0) — 캐시·실패 시 번들 기본값·minAppBuild·minBundle·rollout·TTL.
import { REMOTE_FLAG_KEYS } from '@mong/contract';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FetchLike } from '../src/net/http';
import { CONFIG_KEYS, createRemoteConfig, FOREGROUND_REFRESH_MS } from '../src/net/remoteConfig';

function memKV() {
  const m = new Map<string, string>();
  return { getString: (k: string) => m.get(k), set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k), m };
}

const cfg = (over: Record<string, unknown> = {}) => ({
  v: 3,
  ttlSec: 3600,
  flags: { ...Object.fromEntries(REMOTE_FLAG_KEYS.map((k) => [k, false])), nameTiming: true, cloud: true, link: true },
  rollout: { cloud: 0.2 },
  minBundle: { link: 4 },
  minAppBuild: { ios: 0, android: 10 },
  dreamUnlock: { kite: 2 },
  ...over,
});

let kv: ReturnType<typeof memKV>;
let clock = 1_000_000;
let calls = 0;
let reply: () => { status: number; body: string } | 'network' = () => ({ status: 200, body: JSON.stringify(cfg()) });
const fetchFn: FetchLike = async () => {
  calls++;
  const r = reply();
  if (r === 'network') throw new Error('offline');
  return { ok: r.status === 200, status: r.status, text: async () => r.body };
};

function make(over: Partial<Parameters<typeof createRemoteConfig>[0]> = {}) {
  return createRemoteConfig({ kv, fetch: fetchFn, staticBase: 'https://static.test', platform: 'android', appBuild: 14, bundleSeq: 3, now: () => clock, random: () => 0.1, ...over });
}

beforeEach(() => {
  kv = memKV();
  calls = 0;
  clock = 1_000_000;
  reply = () => ({ status: 200, body: JSON.stringify(cfg()) });
});

describe('원격 설정 로더', () => {
  it('캐시가 없고 받기 전이면 원격 값 없음(= 번들 기본값)', () => {
    const rc = make();
    expect(rc.remoteFlag('nameTiming')).toBeUndefined();
    expect(rc.dreamUnlock()).toEqual({});
  });

  it('받으면 값이 생기고, minBundle·rollout을 적용한다', async () => {
    const rc = make();
    await rc.refresh();
    expect(rc.remoteFlag('nameTiming')).toBe(true);
    expect(rc.remoteFlag('widget')).toBe(false);
    expect(rc.remoteFlag('link')).toBe(false); // BUNDLE_SEQ 3 < minBundle 4
    expect(rc.remoteFlag('cloud')).toBe(true); // 기기 난수 0.1 < 0.2
    expect(make({ random: () => 0.5 }).remoteFlag('cloud')).toBe(true); // 이미 뽑은 난수는 저장돼 그대로
    kv.remove(CONFIG_KEYS.roll);
    expect(make({ random: () => 0.5 }).remoteFlag('cloud')).toBe(false);
    expect(rc.dreamUnlock()).toEqual({ kite: 2 });
  });

  it('minAppBuild 미달 바이너리는 원격 값을 통째로 무시', async () => {
    const rc = make({ appBuild: 9 });
    await rc.refresh();
    expect(rc.remoteFlag('nameTiming')).toBeUndefined();
    expect(make({ platform: 'ios', appBuild: 0 }).remoteFlag('nameTiming')).toBe(true); // ios 하한 0
  });

  it('실패·모양 틀림이면 마지막 캐시를 유지하고, 캐시는 다음 실행에도 남는다', async () => {
    const rc = make();
    await rc.refresh();
    reply = () => ({ status: 200, body: JSON.stringify(cfg({ ttlSec: 'x' })) });
    await rc.refresh({ force: true });
    expect(rc.remoteFlag('nameTiming')).toBe(true);
    reply = () => 'network';
    await rc.refresh({ force: true });
    reply = () => ({ status: 500, body: '' });
    await rc.refresh({ force: true });
    reply = () => ({ status: 200, body: '<html>captive portal</html>' });
    await rc.refresh({ force: true });
    expect(make().remoteFlag('nameTiming')).toBe(true); // 새 실행 = 저장된 캐시
  });

  it('TTL 안에서는 다시 받지 않고, 포그라운드는 15분, TTL은 1시간 상한', async () => {
    const rc = make();
    await rc.refresh();
    expect(calls).toBe(1);
    clock += 60_000;
    await rc.refresh();
    await rc.refresh({ foreground: true });
    expect(calls).toBe(1);
    clock += FOREGROUND_REFRESH_MS;
    await rc.refresh({ foreground: true });
    expect(calls).toBe(2);
    clock += 3600_000;
    await rc.refresh();
    expect(calls).toBe(3);
  });

  it('주소가 비면 받지 않는다(배포 전 기본)', async () => {
    const rc = make({ staticBase: '' });
    await rc.refresh({ force: true });
    expect(calls).toBe(0);
  });

  it('새 플래그 키가 생긴 파일도 옛 앱이 읽는다(모르는 키는 무시)', async () => {
    reply = () => ({ status: 200, body: JSON.stringify(cfg({ flags: { ...cfg().flags, futureThing: true }, newTop: 1 })) });
    const rc = make();
    await rc.refresh();
    expect(rc.remoteFlag('nameTiming')).toBe(true);
  });
});
