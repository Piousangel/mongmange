// 서명된 원격 문서 하나(config/v1.json·content/v1.json)의 받기·검사·캐시(C11 — architecture 3-7-2, B4 보고 3절 6).
// - 검사는 **@mong/contract `verifyRemoteDocStrict`만**(서명 필수·만료·바닥 판). `verifyRemoteDoc`·'unsigned'를 여기서 따로 다루지 않는다.
//   받은 원문(JSON.parse 결과 그대로)을 검사한 뒤 앱용 스키마(lenient)로 읽고, 쓰는 쪽 추가 검사(accept)까지 통과해야 받는다.
// - 캐시 = 받은 원문 문자열 + ETag + 받은 시각 + max-age. 읽을 때마다 같은 검사를 다시 하므로 만료된 캐시는 '원격 없음'(번들 기본값)이 된다.
// - 되감기 막기: 바닥 = max(번들 바닥 판, 이 기기가 받아 본 가장 큰 판). 바닥 기록은 캐시와 따로 둔다(캐시가 지워져도 남게).
// - 다시 받는 때(due): 캐시 없음·시계 되돌아감, 또는 max-age(1시간에서 자름)가 지났고 [TTL이 지났거나 포그라운드에서 15분이 지났을 때].
//   force는 둘 다 무시한다. ETag가 있으면 If-None-Match로 묻고 304면 받은 시각만 새로 한다.
// - 실패는 던지지 않는다. 게임 경로는 이 결과를 기다리지 않는다.
import type { KV } from '@mong/core';
import { CONFIG_TTL_MAX_SEC, verifyRemoteDocStrict, type RemoteDocKind, type RemotePublicKey } from '@mong/contract';
import { maxAgeOf, request, type FetchLike } from './http';

/** 포그라운드 때 이보다 오래된 캐시면 다시 받는다 */
export const FOREGROUND_REFRESH_MS = 15 * 60_000;

export interface DocCache {
  raw: string;
  etag: string | null;
  fetchedAt: number;
  /** 응답 Cache-Control max-age(초). 없으면 null */
  maxAgeSec: number | null;
}

/** updated = 새 문서를 받음 / same = 304 / rejected = 받았지만 검사 실패 / failed = 못 받음 / skipped = 받을 때가 아님·주소 없음 */
export type DocFetch = 'updated' | 'same' | 'rejected' | 'failed' | 'skipped';

export interface Accepted<T> {
  doc: T;
  version: number;
  expiresAtMs: number;
}

export interface SignedDocDeps<T> {
  kind: RemoteDocKind;
  /** 문서 전체 주소. 비면 받지 않는다 */
  url: string;
  kv: KV;
  cacheKey: string;
  floorKey: string;
  keys: readonly RemotePublicKey[];
  /** 앱 번들 바닥 판(빌드 때 배포본 판으로 올림) */
  bundleFloor: number;
  fetch: FetchLike;
  now: () => number;
  /** 원문 → 앱이 읽는 모양(스키마). 틀리면 null */
  parse: (raw: unknown) => T | null;
  /** 받기 전 추가 검사(예: 사전 팩 불변). false면 받지 않는다 */
  accept?: (doc: T) => boolean;
}

export interface DuePolicy {
  /** 문서가 정한 다시 받기 간격(초) */
  ttlSec: number;
  foreground?: boolean;
  force?: boolean;
}

/** 지금 다시 받을 때인가(순수 함수) */
export function due(cache: Pick<DocCache, 'fetchedAt' | 'maxAgeSec'> | null, nowMs: number, p: DuePolicy): boolean {
  if (p.force || !cache) return true;
  const age = nowMs - cache.fetchedAt;
  if (age < 0) return true; // 시계가 되돌아감
  const maxAge = Math.min(cache.maxAgeSec ?? 0, CONFIG_TTL_MAX_SEC) * 1000;
  if (age < maxAge) return false; // HTTP 캐시가 아직 신선하다고 말한 동안은 묻지 않는다
  const ttl = Math.min(Math.max(p.ttlSec, 0), CONFIG_TTL_MAX_SEC) * 1000;
  return age >= ttl || (!!p.foreground && age >= FOREGROUND_REFRESH_MS);
}

export function createSignedDoc<T>(d: SignedDocDeps<T>) {
  const { kv } = d;
  let cache: DocCache | null = readCache();
  let accepted: Accepted<T> | null = cache ? check(cache.raw) : null;
  if (!accepted) cache = null; // 검사를 못 넘는 캐시(만료·키 교체)는 ETag도 쓰지 않는다

  function readCache(): DocCache | null {
    try {
      const raw = kv.getString(d.cacheKey);
      if (!raw) return null;
      const o = JSON.parse(raw) as Partial<DocCache>;
      if (typeof o.raw !== 'string' || typeof o.fetchedAt !== 'number') return null;
      return { raw: o.raw, etag: typeof o.etag === 'string' ? o.etag : null, fetchedAt: o.fetchedAt, maxAgeSec: typeof o.maxAgeSec === 'number' ? o.maxAgeSec : null };
    } catch {
      return null;
    }
  }
  function writeCache(c: DocCache | null) {
    try {
      if (c) kv.set(d.cacheKey, JSON.stringify(c));
      else kv.remove(d.cacheKey);
    } catch {
      /* 메모리에는 있다 */
    }
  }
  function floor(): number {
    let stored = 0;
    try {
      const n = Number(kv.getString(d.floorKey) ?? '0');
      stored = Number.isInteger(n) && n >= 0 ? n : 0;
    } catch {
      /* 바닥 기록을 못 읽으면 번들 바닥만 */
    }
    return Math.max(d.bundleFloor, stored);
  }

  /** 원문 문자열 → 검사를 모두 통과한 문서(아니면 null) */
  function check(text: string): Accepted<T> | null {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return null;
    }
    const v = verifyRemoteDocStrict(d.kind, raw, d.keys, { nowMs: d.now(), floor: floor() });
    if (!v.ok) return null;
    const doc = d.parse(raw);
    if (doc === null) return null;
    return { doc, version: v.version, expiresAtMs: v.expiresAtMs };
  }

  /** 지금 쓸 수 있는 문서(만료되면 null). 검사는 받을 때·실행 시작 때 하고, 여기서는 만료만 다시 본다 */
  function current(): Accepted<T> | null {
    return accepted && accepted.expiresAtMs > d.now() ? accepted : null;
  }

  return {
    current,
    cache(): DocCache | null {
      return cache;
    },
    async refresh(p: DuePolicy): Promise<DocFetch> {
      if (!d.url) return 'skipped';
      if (!due(cache, d.now(), p)) return 'skipped';
      const headers: Record<string, string> = { accept: 'application/json' };
      if (cache?.etag && current()) headers['if-none-match'] = cache.etag;
      const r = await request(d.fetch, d.url, { headers });
      const maxAgeSec = r.kind === 'ok' || r.kind === 'http' ? maxAgeOf(r.header?.('cache-control') ?? null) : null;
      if (r.kind === 'http' && r.status === 304) {
        if (!cache || !headers['if-none-match']) return 'failed';
        cache = { ...cache, fetchedAt: d.now(), maxAgeSec: maxAgeSec ?? cache.maxAgeSec };
        writeCache(cache);
        return 'same';
      }
      if (r.kind !== 'ok') return 'failed';
      const next = check(r.body);
      if (!next || (d.accept && !d.accept(next.doc))) return 'rejected';
      accepted = next;
      cache = { raw: r.body, etag: r.header?.('etag') ?? null, fetchedAt: d.now(), maxAgeSec };
      writeCache(cache);
      try {
        if (next.version > floor()) kv.set(d.floorKey, String(next.version));
      } catch {
        /* 바닥을 못 올리면 캐시 판이 바닥 구실을 한다(이번 실행) */
      }
      return 'updated';
    },
  };
}
