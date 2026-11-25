// 원격 플래그 `config/v1.json` 로더(architecture.md 3-7·3-7-2·4-1, C11).
// - 받기·검사·캐시는 signedDoc.ts(서명 필수 `verifyRemoteDocStrict`만, 만료, 되감기 막기, ETag·max-age). 실패·만료 → 원격 없음(= 번들 기본값).
// - 받는 때: 실행 때 + 포그라운드 때 캐시가 15분보다 오래됐으면. TTL은 파일의 ttlSec(상한 1시간).
// - minAppBuild: 이 바이너리 빌드 번호가 더 작으면 원격 값을 통째로 무시(번들 기본값).
// - minBundle: BUNDLE_SEQ < minBundle[key]면 그 키는 끈 것으로 본다. rollout: 기기 로컬 난수(서버로 안 감) < 비율이면 켬.
// - 우선순위(3-7): FEATURE_DEFAULTS(바이너리) < 원격 캐시 < 개발 메뉴 — 이 모듈은 가운데 층만 낸다(remoteFlag가 undefined면 아래 층).
// - **크래시 루프 탈출**(3-7-2): 원격 판 v를 적용한 실행이 문턱(withinSec) 안에 죽은 일이 연달아 afterCrashes번이면 그다음 실행부터
//   탈출 모드 — 키 값 = escapeFlags(번들, 마지막 원격 실효 값, off)(꺼짐 우선, 어느 키도 켜지지 않음), 꿈 해금 앞당기기 없음.
//   문턱 = escapeThresholds(원격 escape)(번들 2번·10초보다 둔해지지 않음). 더 큰 v를 받으면 그 자리에서 풀린다.
//   실행 하나 = createRemoteConfig 한 번(앱 시작). '건강함' = 문턱 시간을 살아 넘김 또는 백그라운드로 감(markHealthy).
import type { KV } from '@mong/core';
import {
  escapeFlags,
  escapeThresholds,
  REMOTE_BUNDLE_FLOOR,
  REMOTE_FLAG_KEYS,
  remoteConfigSchema,
  type RemoteConfig,
  type RemoteFlagKey,
  type RemotePublicKey,
} from '@mong/contract';
import type { FetchLike } from './http';
import { createSignedDoc, type DocFetch } from './signedDoc';

export { FOREGROUND_REFRESH_MS } from './signedDoc';

export const CONFIG_KEYS = {
  cache: 'mong.net.config',
  /** 받아 본 가장 큰 config 판(되감기 바닥) */
  floor: 'mong.net.configFloor',
  /** 비율 배포용 기기 로컬 난수(키마다) */
  roll: 'mong.net.roll',
  /** 이번 실행의 적용 표시 `{v, crashes, healthy}` */
  boot: 'mong.net.boot',
  /** 탈출 모드 `{v, flags}` */
  escape: 'mong.net.escape',
} as const;

/** 앱 번들 바닥 판(B4 보고 3절 6). 바이너리·OTA를 만들 때 그때 배포본 config `v`로 올린다. 계약 상수와 큰 쪽을 쓴다 */
export const APP_CONFIG_FLOOR = 0;

export interface RemoteConfigDeps {
  kv: KV;
  fetch: FetchLike;
  /** 비면 받지 않는다 */
  staticBase: string;
  /** 앱 번들 공개키 목록(remote-public-keys.json) */
  keys: readonly RemotePublicKey[];
  platform: 'ios' | 'android' | 'web';
  appBuild: number;
  bundleSeq: number;
  /** 원격 키의 번들 기본값(features.ts FEATURE_DEFAULTS에서 같은 이름). 빠진 키는 꺼짐 */
  bundled: Partial<Record<RemoteFlagKey, boolean>>;
  now: () => number;
  random: () => number;
  /** 기본 = max(계약 REMOTE_BUNDLE_FLOOR, APP_CONFIG_FLOOR) */
  bundleFloor?: number;
  /** '건강함' 표시를 미루어 부르는 타이머(기본 setTimeout). 시험은 가짜로 */
  schedule?: (fn: () => void, ms: number) => void;
}

interface BootMark {
  v: number;
  crashes: number;
  healthy: boolean;
}
type EscapeState = { kind: 'normal' } | { kind: 'escaping'; v: number; flags: Record<RemoteFlagKey, boolean> };

export function createRemoteConfig(deps: RemoteConfigDeps) {
  const { kv } = deps;
  const subs = new Set<() => void>();
  const doc = createSignedDoc<RemoteConfig>({
    kind: 'config/v1',
    url: deps.staticBase ? `${deps.staticBase}/config/v1.json` : '',
    kv,
    cacheKey: CONFIG_KEYS.cache,
    floorKey: CONFIG_KEYS.floor,
    keys: deps.keys,
    bundleFloor: deps.bundleFloor ?? Math.max(REMOTE_BUNDLE_FLOOR['config/v1'], APP_CONFIG_FLOOR),
    fetch: deps.fetch,
    now: deps.now,
    parse: (raw) => {
      const c = remoteConfigSchema.safeParse(raw);
      return c.success ? c.data : null;
    },
  });

  /** 이 바이너리에 적용되는 원격 설정(없음·만료·minAppBuild 미달이면 null) */
  function active(): { c: RemoteConfig; v: number } | null {
    const a = doc.current();
    if (!a) return null;
    if (deps.platform !== 'web' && deps.appBuild < a.doc.minAppBuild[deps.platform]) return null;
    return { c: a.doc, v: a.version };
  }

  function readJson<T>(key: string): T | null {
    try {
      const raw = kv.getString(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }
  function write(key: string, v: unknown | null) {
    try {
      if (v === null) kv.remove(key);
      else kv.set(key, JSON.stringify(v));
    } catch {
      /* 이번 실행만 */
    }
  }

  function rollValue(key: string): number {
    const rolls = readJson<Record<string, number>>(CONFIG_KEYS.roll) ?? {};
    const v = rolls[key];
    if (typeof v === 'number' && v >= 0 && v < 1) return v;
    const r = deps.random();
    write(CONFIG_KEYS.roll, { ...rolls, [key]: r });
    return r;
  }

  /** 원격이 말한 키의 실효 값(rollout·minBundle 적용). 말하지 않은 키는 undefined */
  function effective(c: RemoteConfig, key: RemoteFlagKey): boolean | undefined {
    const v = c.flags[key];
    if (v === undefined) return undefined;
    if (!v) return false;
    if (deps.bundleSeq < (c.minBundle[key] ?? 0)) return false;
    const rate = c.rollout[key];
    if (rate !== undefined && !(rollValue(key) < rate)) return false;
    return true;
  }

  // ── 크래시 루프: 실행 시작 판정 ──
  let escape: EscapeState = { kind: 'normal' };
  let healthyTimerFor: number | null = null;

  function arm(v: number, crashes: number, c: RemoteConfig) {
    write(CONFIG_KEYS.boot, { v, crashes, healthy: false } satisfies BootMark);
    if (healthyTimerFor === v) return;
    healthyTimerFor = v;
    const ms = escapeThresholds(c.escape).withinSec * 1000;
    (deps.schedule ?? ((fn, t) => void setTimeout(fn, t)))(() => markHealthyFor(v), ms);
  }
  function markHealthyFor(v: number) {
    const m = readJson<BootMark>(CONFIG_KEYS.boot);
    if (m && m.v === v) write(CONFIG_KEYS.boot, { v, crashes: 0, healthy: true } satisfies BootMark);
  }

  (function startRun() {
    const a = active();
    if (!a) {
      write(CONFIG_KEYS.boot, null);
      return;
    }
    const stored = readJson<{ v?: unknown; flags?: unknown }>(CONFIG_KEYS.escape);
    if (stored && typeof stored.v === 'number' && stored.flags && typeof stored.flags === 'object') {
      if (a.v <= stored.v) {
        escape = { kind: 'escaping', v: stored.v, flags: escapeFlags(stored.flags as Record<RemoteFlagKey, boolean>, null, []) };
        return;
      }
      write(CONFIG_KEYS.escape, null); // 더 큰 판이 이미 캐시에 있다 → 풀림
    }
    const mark = readJson<BootMark>(CONFIG_KEYS.boot);
    const crashes = mark && mark.v === a.v && !mark.healthy && Number.isInteger(mark.crashes) ? mark.crashes + 1 : 0;
    if (crashes >= escapeThresholds(a.c.escape).afterCrashes) {
      const last: Partial<Record<RemoteFlagKey, boolean>> = {};
      for (const k of REMOTE_FLAG_KEYS) {
        const e = effective(a.c, k);
        if (e !== undefined) last[k] = e;
      }
      const flags = escapeFlags(deps.bundled, last, a.c.escape.off);
      escape = { kind: 'escaping', v: a.v, flags };
      write(CONFIG_KEYS.escape, { v: a.v, flags });
      write(CONFIG_KEYS.boot, null);
      return;
    }
    arm(a.v, crashes, a.c);
  })();

  /** 새 문서를 받은 뒤: 더 큰 v면 탈출을 풀고, 새 판을 이번 실행의 적용 판으로 센다 */
  function applied() {
    const a = active();
    if (!a) return;
    if (escape.kind === 'escaping') {
      if (a.v <= escape.v) return;
      escape = { kind: 'normal' };
      write(CONFIG_KEYS.escape, null);
    }
    const mark = readJson<BootMark>(CONFIG_KEYS.boot);
    if (!mark || mark.v !== a.v) arm(a.v, 0, a.c);
  }

  return {
    /** 실행 때(foreground=false)·포그라운드 때(true). 필요할 때만 받는다. 실패해도 던지지 않는다 */
    async refresh(opts: { foreground?: boolean; force?: boolean } = {}): Promise<DocFetch> {
      const r = await doc.refresh({ ttlSec: doc.current()?.doc.ttlSec ?? 0, ...opts });
      if (r === 'updated') {
        applied();
        subs.forEach((f) => f());
      }
      return r;
    },

    /** 원격 층의 값. undefined = 원격이 말하지 않음 → 번들 기본값을 쓴다. 탈출 중에는 탈출 값(모든 키) */
    remoteFlag(key: RemoteFlagKey): boolean | undefined {
      if (escape.kind === 'escaping') return escape.flags[key];
      const a = active();
      return a ? effective(a.c, key) : undefined;
    },

    /** 꿈 해금 앞당기기(dreams-30days 2-1). 앱은 min(번들 값, 이 값)만 쓴다. 탈출 중에는 없음 */
    dreamUnlock(): Readonly<Record<string, number>> {
      if (escape.kind === 'escaping') return {};
      return active()?.c.dreamUnlock ?? {};
    },

    escaping(): boolean {
      return escape.kind === 'escaping';
    },

    /** 지금 쓰는 원격 판(없으면 null) */
    version(): number | null {
      return active()?.v ?? null;
    },

    /** 이번 실행은 건강하다(문턱 시간을 넘김·백그라운드로 감) — 크래시 수를 0으로 */
    markHealthy(): void {
      const m = readJson<BootMark>(CONFIG_KEYS.boot);
      if (m) markHealthyFor(m.v);
    },

    /** 원격 값이 바뀌면 알림 */
    subscribe(f: () => void): () => void {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}
