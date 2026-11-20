// 원격 플래그 `config/v1.json` 로더(architecture.md v2.1 3-7·4-1).
// - 받는 때: 실행 때 + 포그라운드 때 캐시가 15분보다 오래됐으면. TTL은 파일의 ttlSec(상한 1시간).
// - 실패·모양 틀림·주소 없음 → 마지막 캐시, 캐시도 없으면 원격 값 없음(= 번들 기본값). 아침 카드·게임은 이것을 기다리지 않는다.
// - minAppBuild: 이 바이너리 빌드 번호가 더 작으면 원격 값을 통째로 무시(번들 기본값).
// - minBundle: BUNDLE_SEQ < minBundle[key]면 그 키는 끈 것으로 본다. rollout: 기기 로컬 난수(서버로 안 감) < 비율이면 켬.
// - 우선순위(3-7): FEATURE_DEFAULTS(바이너리) < 원격 캐시 < 개발 메뉴 — 이 모듈은 가운데 층만 낸다(remoteFlag가 undefined면 아래 층).
// 모양은 @mong/contract remoteConfigSchema(앱용 lenient)가 정본, CI는 같은 파일을 strict로 검사한다.
import type { KV } from '@mong/core';
import { CONFIG_TTL_MAX_SEC, remoteConfigSchema, type RemoteConfig, type RemoteFlagKey } from '@mong/contract';
import { request, type FetchLike } from './http';

export const CONFIG_KEYS = {
  cache: 'mong.net.config',
  /** 비율 배포용 기기 로컬 난수(키마다) */
  roll: 'mong.net.roll',
} as const;

/** 포그라운드 때 이보다 오래된 캐시면 다시 받는다 */
export const FOREGROUND_REFRESH_MS = 15 * 60_000;

interface Cached {
  fetchedAt: number;
  config: RemoteConfig;
}

export interface RemoteConfigDeps {
  kv: KV;
  fetch: FetchLike;
  /** 비면 받지 않는다 */
  staticBase: string;
  platform: 'ios' | 'android' | 'web';
  appBuild: number;
  bundleSeq: number;
  now: () => number;
  random: () => number;
}

export function createRemoteConfig(deps: RemoteConfigDeps) {
  const { kv } = deps;
  let mem: Cached | null = readCache();
  let inflight: Promise<void> | null = null;
  const subs = new Set<() => void>();

  function readCache(): Cached | null {
    try {
      const raw = kv.getString(CONFIG_KEYS.cache);
      if (!raw) return null;
      const o = JSON.parse(raw) as { fetchedAt?: unknown; config?: unknown };
      const c = remoteConfigSchema.safeParse(o.config);
      return c.success && typeof o.fetchedAt === 'number' ? { fetchedAt: o.fetchedAt, config: c.data } : null;
    } catch {
      return null;
    }
  }

  /** 이 바이너리에 적용되는 원격 설정(없거나 minAppBuild 미달이면 null) */
  function active(): RemoteConfig | null {
    if (!mem) return null;
    if (deps.platform === 'web') return mem.config;
    return deps.appBuild >= mem.config.minAppBuild[deps.platform] ? mem.config : null;
  }

  function rollValue(key: string): number {
    let rolls: Record<string, number> = {};
    try {
      rolls = JSON.parse(kv.getString(CONFIG_KEYS.roll) ?? '{}') as Record<string, number>;
    } catch {
      /* 새로 뽑는다 */
    }
    const v = rolls[key];
    if (typeof v === 'number' && v >= 0 && v < 1) return v;
    const r = deps.random();
    try {
      kv.set(CONFIG_KEYS.roll, JSON.stringify({ ...rolls, [key]: r }));
    } catch {
      /* 이번 실행만 */
    }
    return r;
  }

  function stale(foreground: boolean): boolean {
    if (!mem) return true;
    const age = deps.now() - mem.fetchedAt;
    if (age < 0) return true; // 시계가 되돌아감
    const ttl = Math.min(mem.config.ttlSec, CONFIG_TTL_MAX_SEC) * 1000;
    return age >= ttl || (foreground && age >= FOREGROUND_REFRESH_MS);
  }

  async function fetchNow(): Promise<void> {
    const r = await request(deps.fetch, `${deps.staticBase}/config/v1.json`, { headers: { accept: 'application/json' } });
    if (r.kind !== 'ok') return;
    let json: unknown;
    try {
      json = JSON.parse(r.body);
    } catch {
      return;
    }
    const c = remoteConfigSchema.safeParse(json);
    if (!c.success) return; // 모양이 틀리면 마지막 캐시 유지
    mem = { fetchedAt: deps.now(), config: c.data };
    try {
      kv.set(CONFIG_KEYS.cache, JSON.stringify(mem));
    } catch {
      /* 메모리에는 있다 */
    }
    subs.forEach((f) => f());
  }

  return {
    /** 실행 때(foreground=false)·포그라운드 때(true). 필요할 때만 받는다. 실패해도 던지지 않는다 */
    refresh(opts: { foreground?: boolean; force?: boolean } = {}): Promise<void> {
      if (!deps.staticBase) return Promise.resolve();
      if (!opts.force && !stale(opts.foreground ?? false)) return Promise.resolve();
      inflight ??= fetchNow().finally(() => {
        inflight = null;
      });
      return inflight;
    },

    /** 원격 층의 값. undefined = 원격이 말하지 않음 → 번들 기본값을 쓴다 */
    remoteFlag(key: RemoteFlagKey): boolean | undefined {
      const c = active();
      if (!c) return undefined;
      const v = c.flags[key];
      if (v === undefined) return undefined;
      if (!v) return false;
      if (deps.bundleSeq < (c.minBundle[key] ?? 0)) return false;
      const rate = c.rollout[key];
      if (rate !== undefined && !(rollValue(key) < rate)) return false;
      return true;
    },

    /** 꿈 해금 앞당기기(dreams-30days 2-1). 앱은 min(번들 값, 이 값)만 쓴다 — 늦추는 값은 쓰는 쪽에서 무시 */
    dreamUnlock(): Readonly<Record<string, number>> {
      return active()?.dreamUnlock ?? {};
    },

    /** 원격 값이 바뀌면 알림 */
    subscribe(f: () => void): () => void {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}
