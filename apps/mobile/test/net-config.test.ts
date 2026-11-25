// 원격 플래그 로더(B0 → C11): 서명 필수(verifyRemoteDocStrict만)·만료·되감기 막기·ETag·max-age·캐시·minAppBuild·minBundle·rollout·TTL,
// 그리고 크래시 루프 탈출(escapeThresholds·escapeFlags — architecture 3-7-2, B4 보고 3절 6·7).
// 원격 문서는 시험 전용 키로 node:crypto가 서명한다(support/remoteSign.ts — 계약 검사기와 독립 구현).
import { REMOTE_FLAG_KEYS, type RemoteFlagKey } from '@mong/contract';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FetchLike } from '../src/net/http';
import { maxAgeOf } from '../src/net/http';
import { CONFIG_KEYS, createRemoteConfig, FOREGROUND_REFRESH_MS } from '../src/net/remoteConfig';
import { isoSec, makeSigner, type Signer } from './support/remoteSign';

function memKV() {
  const m = new Map<string, string>();
  return { getString: (k: string) => m.get(k), set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k), m };
}

const DAY = 86_400_000;
let signer: Signer;
let other: Signer;
beforeAll(() => {
  signer = makeSigner('app-test');
  other = makeSigner('other');
});

let kv: ReturnType<typeof memKV>;
let clock = Date.UTC(2026, 11, 22, 3);

const body = (over: Record<string, unknown> = {}) => ({
  v: 3,
  ttlSec: 3600,
  flags: { ...Object.fromEntries(REMOTE_FLAG_KEYS.map((k) => [k, false])), nameTiming: true, cloud: true, link: true },
  rollout: { cloud: 0.2 },
  minBundle: { link: 4 },
  minAppBuild: { ios: 0, android: 10 },
  dreamUnlock: { kite: 2 },
  expiresAt: isoSec(clock + 14 * DAY),
  ...over,
});
const signed = (over: Record<string, unknown> = {}, s: Signer = signer) => {
  const b: Record<string, unknown> = body(over);
  for (const k of Object.keys(b)) if (b[k] === undefined) delete b[k]; // undefined = 그 칸을 뺀다
  return s.sign('config/v1', b);
};

type Req = { url: string; headers: Record<string, string>; cache?: string };
let reqs: Req[] = [];
type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | 'network';
let reply: () => Reply = () => ({ status: 200, body: signed() });
const fetchFn: FetchLike = async (url, init) => {
  reqs.push({ url, headers: init?.headers ?? {}, cache: init?.cache });
  const r = reply();
  if (r === 'network') throw new Error('offline');
  const h = new Map(Object.entries(r.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? '')),
    headers: { get: (n: string) => h.get(n.toLowerCase()) ?? null },
  };
};

const BUNDLED: Partial<Record<RemoteFlagKey, boolean>> = { cloud: false, moonNight: true, hesitation: true, widget: true };
let timers: Array<{ fn: () => void; ms: number }> = [];

function make(over: Partial<Parameters<typeof createRemoteConfig>[0]> = {}) {
  return createRemoteConfig({
    kv,
    fetch: fetchFn,
    staticBase: 'https://static.test',
    keys: [signer.key],
    platform: 'android',
    appBuild: 14,
    bundleSeq: 3,
    bundled: BUNDLED,
    now: () => clock,
    random: () => 0.1,
    schedule: (fn, ms) => void timers.push({ fn, ms }),
    ...over,
  });
}

beforeEach(() => {
  kv = memKV();
  clock = Date.UTC(2026, 11, 22, 3);
  reqs = [];
  timers = [];
  reply = () => ({ status: 200, body: signed() });
});

describe('원격 설정 — 서명·만료·되감기(verifyRemoteDocStrict만)', () => {
  it('캐시가 없고 받기 전이면 원격 값 없음(= 번들 기본값)', () => {
    const rc = make();
    expect(rc.remoteFlag('cloud')).toBeUndefined();
    expect(rc.dreamUnlock()).toEqual({});
  });

  it('서명된 문서를 받으면 값이 생기고, minBundle·rollout을 적용한다', async () => {
    const rc = make();
    expect(await rc.refresh()).toBe('updated');
    expect(reqs[0]!.url).toBe('https://static.test/config/v1.json');
    expect(rc.remoteFlag('cloud')).toBe(true); // rollout 0.2, 난수 0.1
    expect(rc.remoteFlag('link')).toBe(false); // minBundle 4 > BUNDLE_SEQ 3
    expect(rc.remoteFlag('nameTiming')).toBe(true);
    expect(rc.remoteFlag('widget')).toBe(false);
    expect(rc.dreamUnlock()).toEqual({ kite: 2 });
    expect(make({ random: () => 0.5 }).remoteFlag('cloud')).toBe(true); // 다음 실행: 캐시 그대로, 기기 난수(0.1)는 저장돼 있어 다시 뽑지 않는다
    expect(rc.version()).toBe(3);
  });

  it('서명 없는 문서·모르는 키·바뀐 값·잘못된 종류·금지 키는 받지 않는다(번들 기본값)', async () => {
    const plain = body();
    const tampered = { ...signed(), flags: { ...body().flags, cloud: false } };
    const wrongKind = { ...body(), sig: signer.sign('content/v1', body()).sig };
    const proto = JSON.parse(`{"__proto__":{"x":1},${JSON.stringify(signed()).slice(1)}`) as unknown;
    for (const doc of [plain, signed({}, other), tampered, wrongKind, proto]) {
      kv = memKV();
      reply = () => ({ status: 200, body: doc });
      const rc = make();
      expect(await rc.refresh()).toBe('rejected');
      expect(rc.remoteFlag('cloud')).toBeUndefined();
      expect(kv.m.has(CONFIG_KEYS.cache)).toBe(false);
    }
  });

  it('만료(expiresAt 없음·지남·30일 넘음)는 받지 않고, 받은 문서도 만료되면 다시 받지 않아도 번들 기본값으로 돌아간다', async () => {
    for (const over of [{ expiresAt: undefined }, { expiresAt: isoSec(clock - 1000) }, { expiresAt: isoSec(clock + 31 * DAY) }]) {
      kv = memKV();
      reply = () => ({ status: 200, body: signed(over) });
      expect(await make().refresh()).toBe('rejected');
    }
    kv = memKV();
    reply = () => ({ status: 200, body: signed({ expiresAt: isoSec(clock + 2 * DAY) }) });
    const rc = make();
    await rc.refresh();
    expect(rc.remoteFlag('nameTiming')).toBe(true);
    clock += 2 * DAY + 1000;
    expect(rc.remoteFlag('nameTiming')).toBeUndefined(); // 같은 실행 안에서도
    expect(make().remoteFlag('nameTiming')).toBeUndefined(); // 다음 실행 캐시에서도
  });

  it('되감기 막기: 지금 쓰는 판보다 작은 판은 받지 않고, 캐시를 지워도 바닥 판은 남는다. 같은 판은 다시 받는다', async () => {
    const rc = make();
    reply = () => ({ status: 200, body: signed({ v: 5 }) });
    await rc.refresh({ force: true });
    reply = () => ({ status: 200, body: signed({ v: 4, flags: { cloud: false, link: false, remoteMotifs: false, webLive: false } }) });
    expect(await rc.refresh({ force: true })).toBe('rejected');
    expect(rc.version()).toBe(5);
    kv.remove(CONFIG_KEYS.cache);
    expect(await make().refresh({ force: true })).toBe('rejected');
    reply = () => ({ status: 200, body: signed({ v: 5 }) });
    expect(await make().refresh({ force: true })).toBe('updated');
  });

  it('번들 바닥 판(bundleFloor) 아래 문서는 새 설치에서도 받지 않는다', async () => {
    reply = () => ({ status: 200, body: signed({ v: 3 }) });
    expect(await make({ bundleFloor: 4 }).refresh()).toBe('rejected');
  });

  it('실패·모양 틀림이면 마지막 캐시를 유지하고, 캐시는 다음 실행에도 남는다', async () => {
    const rc = make();
    await rc.refresh();
    for (const r of ['network', { status: 500 }, { status: 200, body: 'not json' }, { status: 200, body: signed({ ttlSec: 5 }) }] as Reply[]) {
      reply = () => r;
      clock += 3_600_000;
      expect(['failed', 'rejected']).toContain(await rc.refresh());
      expect(rc.remoteFlag('nameTiming')).toBe(true);
    }
    expect(make().remoteFlag('nameTiming')).toBe(true);
  });

  it('minAppBuild 미달 바이너리는 원격 값을 통째로 무시', async () => {
    const rc = make({ appBuild: 9 });
    await rc.refresh();
    expect(rc.remoteFlag('nameTiming')).toBeUndefined();
  });

  it('새 플래그 키가 생긴 파일도 옛 앱이 읽는다(모르는 키는 무시)', async () => {
    reply = () => ({ status: 200, body: signed({ flags: { cloud: false, link: false, remoteMotifs: false, webLive: false, futureKey: true } }) });
    const rc = make();
    expect(await rc.refresh()).toBe('updated');
    expect(rc.remoteFlag('cloud')).toBe(false);
  });

  it('주소가 비면 받지 않는다(배포 전 기본)', async () => {
    expect(await make({ staticBase: '' }).refresh({ force: true })).toBe('skipped');
    expect(reqs).toHaveLength(0);
  });
});

describe('원격 설정 — 캐시: TTL·포그라운드·ETag·max-age', () => {
  it('TTL 안에서는 다시 받지 않고, 포그라운드는 15분, TTL은 1시간 상한', async () => {
    reply = () => ({ status: 200, body: signed({ ttlSec: 3600 }) });
    const rc = make();
    await rc.refresh();
    clock += 10 * 60_000;
    expect(await rc.refresh({ foreground: true })).toBe('skipped');
    clock += FOREGROUND_REFRESH_MS;
    expect(await rc.refresh({ foreground: true })).toBe('updated');
    clock += 59 * 60_000;
    expect(await rc.refresh()).toBe('skipped');
    clock += 2 * 60_000;
    expect(await rc.refresh()).toBe('updated');
    expect(reqs).toHaveLength(3);
  });

  it('ETag가 있으면 다음 요청에 If-None-Match로 싣고, 304면 캐시를 그대로 쓰며 받은 시각만 새로 한다', async () => {
    reply = () => ({ status: 200, body: signed(), headers: { ETag: '"abc"', 'Cache-Control': 'public, max-age=300' } });
    const rc = make();
    await rc.refresh();
    expect(reqs[0]!.headers['if-none-match']).toBeUndefined();
    reply = () => ({ status: 304 });
    clock += 3_600_000;
    expect(await rc.refresh()).toBe('same');
    expect(reqs[1]!.headers['if-none-match']).toBe('"abc"');
    expect(rc.remoteFlag('nameTiming')).toBe(true);
    clock += 30 * 60_000;
    expect(await rc.refresh()).toBe('skipped'); // 304가 받은 시각을 새로 했다
  });

  it('캐시가 없을 때 온 304는 실패로 본다(If-None-Match를 보내지 않았다)', async () => {
    reply = () => ({ status: 304 });
    expect(await make().refresh()).toBe('failed');
  });

  it('max-age를 따른다: 그 안에서는 TTL이 지나도 다시 받지 않는다. max-age는 1시간에서 자른다', async () => {
    reply = () => ({ status: 200, body: signed({ ttlSec: 60 }), headers: { 'cache-control': 'public, max-age=300' } });
    const rc = make();
    await rc.refresh();
    clock += 120_000;
    expect(await rc.refresh()).toBe('skipped');
    clock += 180_000;
    expect(await rc.refresh()).toBe('updated');
    reply = () => ({ status: 200, body: signed({ ttlSec: 60 }), headers: { 'cache-control': 'max-age=31536000, immutable' } });
    await rc.refresh({ force: true });
    clock += 3_600_000;
    expect(await rc.refresh()).toBe('updated');
  });
});

// C11 리뷰 M5: 살아남은 변이 셋(시계 되감기·만료 캐시 ETag·no-store)을 잡는 시험
describe('원격 설정 — 캐시 경계(리뷰 M5)', () => {
  it('시계가 되돌아가면(받은 시각이 미래) max-age 안이어도 다시 받는다 — 신선함에 갇히지 않게', async () => {
    reply = () => ({ status: 200, body: signed(), headers: { 'cache-control': 'public, max-age=300' } });
    const rc = make();
    await rc.refresh();
    clock -= 60_000; // 기기 시계를 1분 되돌림
    expect(await rc.refresh()).toBe('updated');
  });
  it('만료된 캐시에는 If-None-Match를 싣지 않는다(304로 만료본을 신선하다고 붙잡지 않게)', async () => {
    reply = () => ({ status: 200, body: signed({ expiresAt: isoSec(clock + 2 * DAY) }), headers: { etag: '"old"' } });
    const rc = make();
    await rc.refresh();
    clock += 2 * DAY + 1000;
    reply = () => ({ status: 200, body: signed({ v: 4, expiresAt: isoSec(clock + 14 * DAY) }), headers: { etag: '"new"' } });
    expect(await rc.refresh()).toBe('updated');
    expect(reqs.at(-1)!.headers['if-none-match']).toBeUndefined();
    expect(rc.remoteFlag('nameTiming')).toBe(true);
  });
  it('Cache-Control no-store·no-cache는 max-age 0(함께 적힌 max-age보다 앞선다)', async () => {
    expect(maxAgeOf('no-store, max-age=600')).toBe(0);
    expect(maxAgeOf('max-age=600, no-cache')).toBe(0);
    expect(maxAgeOf('public, max-age=300')).toBe(300);
    expect(maxAgeOf(null)).toBeNull();
    reply = () => ({ status: 200, body: signed({ ttlSec: 60 }), headers: { 'cache-control': 'no-store, max-age=3600' } });
    const rc = make();
    await rc.refresh();
    clock += 61_000;
    expect(await rc.refresh()).toBe('updated'); // max-age 3600을 따랐다면 skipped
  });
});

describe('크래시 루프 탈출(3-7-2)', () => {
  /** 서명된 v3을 받아 캐시에 둔 상태에서 시작 */
  async function seeded(over: Record<string, unknown> = {}) {
    reply = () => ({ status: 200, body: signed({ rollout: {}, minBundle: {}, ...over }) });
    const first = make();
    await first.refresh();
    first.markHealthy();
    timers = [];
    return first;
  }

  it('적용 뒤 문턱 안에 연달아 2번 죽으면 세 번째 실행이 탈출 모드: 번들 AND (원격이 끈 키는 끈 채) AND NOT off', async () => {
    await seeded({
      flags: { cloud: true, link: true, remoteMotifs: true, webLive: false, moonNight: false, widget: true },
      escape: { afterCrashes: 2, withinSec: 10, off: ['widget'] },
    });
    const run1 = make(); // 죽음(건강 표시 없음)
    expect(run1.escaping()).toBe(false);
    expect(timers.map((t) => t.ms)).toEqual([10_000]);
    const run2 = make(); // 죽음
    expect(run2.escaping()).toBe(false);
    const run3 = make();
    expect(run3.escaping()).toBe(true);
    const want: Record<string, boolean> = Object.fromEntries(REMOTE_FLAG_KEYS.map((k) => [k, false]));
    want.hesitation = true; // 번들 켬 + 원격이 말하지 않음 + off 아님
    for (const k of REMOTE_FLAG_KEYS) expect(run3.remoteFlag(k), k).toBe(want[k]);
    // cloud: 원격 켬이어도 번들 끔 → 끔 / moonNight: 번들 켬이어도 원격 끔 → 끔(킬 스위치 유지) / widget: off
    expect(run3.dreamUnlock()).toEqual({});
  });

  it('건강해진 실행이 끼면 다시 0부터 센다', async () => {
    await seeded();
    make(); // 죽음
    const ok = make();
    ok.markHealthy();
    make(); // 죽음
    expect(make().escaping()).toBe(false);
  });

  it('원격은 문턱을 더 민감하게만 바꾼다: afterCrashes 1이면 한 번에, withinSec 60이면 건강 표시가 60초 뒤', async () => {
    await seeded({ escape: { afterCrashes: 1, withinSec: 60, off: [] } });
    const r1 = make();
    expect(timers.map((t) => t.ms)).toEqual([60_000]);
    expect(r1.escaping()).toBe(false);
    expect(make().escaping()).toBe(true);
  });

  it('번들 문턱보다 둔한 값은 스키마가 거부해 문서째 받지 않는다(afterCrashes 3)', async () => {
    reply = () => ({ status: 200, body: signed({ escape: { afterCrashes: 3, withinSec: 10, off: [] } }) });
    expect(await make().refresh()).toBe('rejected');
  });

  it('탈출은 실행을 넘어 이어지고(건강해도), 더 큰 v를 받으면 그 자리에서 풀린다', async () => {
    await seeded();
    make();
    make();
    const esc = make();
    expect(esc.escaping()).toBe(true);
    esc.markHealthy();
    expect(make().escaping()).toBe(true);
    const r = make();
    reply = () => ({ status: 200, body: signed({ v: 4, rollout: {}, minBundle: {} }) });
    expect(await r.refresh({ force: true })).toBe('updated');
    expect(r.escaping()).toBe(false);
    expect(r.remoteFlag('cloud')).toBe(true);
    expect(make().escaping()).toBe(false);
  });

  it('같은 v를 다시 받아도 풀리지 않는다', async () => {
    await seeded();
    make();
    make();
    const esc = make();
    expect(await esc.refresh({ force: true })).toBe('updated');
    expect(esc.escaping()).toBe(true);
  });

  it('원격 값이 없으면(캐시 없음·만료) 탈출을 세지 않는다', () => {
    make();
    make();
    expect(make().escaping()).toBe(false);
    expect(timers).toHaveLength(0);
  });

  it('값이 바뀌면 구독자에게 알린다', async () => {
    const rc = make();
    let n = 0;
    rc.subscribe(() => n++);
    await rc.refresh();
    expect(n).toBe(1);
  });
});
