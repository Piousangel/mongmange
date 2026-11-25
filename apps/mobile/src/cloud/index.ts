// 맡겨 두기 앱 연결(제품 경로). 서버 주소(API_BASE)와 로그인 포트가 둘 다 있어야 작업 묶음(TaskDeps)이 생긴다.
// 로그인 포트(Supabase 익명 로그인·세션 저장 MMKV mong.session)는 C11 net 모듈이 registerCloudAuth로 넘긴다 — 그 전에는 null(행 숨김).
import { SAVE_KEYS, type sim } from '@mong/core';
import { useMemo, useSyncExternalStore } from 'react';
import { optionalModule } from '../lib/optionalModule';
import { kv } from '../game/storage';
import { adoptState, now } from '../game/store';
import { API_BASE } from '../net/env';
import type { FetchLike } from '../net/http';
import { createCloudApi, type CloudAuth } from './api';
import type { TaskDeps } from './tasks';

type ExpoCrypto = typeof import('expo-crypto');
const Crypto = optionalModule<ExpoCrypto>(() => require('expo-crypto'));

let auth: CloudAuth | null = null;
const subs = new Set<() => void>();

/** C11이 로그인 포트를 넘긴다(한 번). 화면은 구독으로 행을 다시 그린다 */
export function registerCloudAuth(a: CloudAuth | null): void {
  auth = a;
  subs.forEach((f) => f());
}
export function subscribeCloudAuth(f: () => void): () => void {
  subs.add(f);
  return () => subs.delete(f);
}

/** 본문 SHA-256(서버 sha와 같은 계산: UTF-8 → 소문자 16진) */
export async function sha256Hex(s: string): Promise<string> {
  if (!Crypto) throw new Error('expo-crypto 없음');
  return (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s)).toLowerCase();
}

const fetchFn: FetchLike = (url, init) => fetch(url, init);

/** 제품 작업 묶음. 서버 주소·로그인 포트·해시 모듈 중 하나라도 없으면 null */
export function cloudDeps(a: CloudAuth | null = auth): TaskDeps | null {
  if (!API_BASE || !a || !Crypto) return null;
  return {
    api: createCloudApi({ fetch: fetchFn, base: API_BASE, auth: a }),
    auth: a,
    kv,
    sha256: sha256Hex,
    now,
    local: {
      raw: () => {
        try {
          return kv.getString(SAVE_KEYS.main) ?? null;
        } catch {
          return null;
        }
      },
      adopt: (st: sim.State) => adoptState(st),
    },
  };
}

/** 화면용: 로그인 포트가 바뀔 때만 새 작업 묶음(같은 묶음이면 진행 중인 작업을 다시 돌리지 않는다) */
export function useCloudDeps(): TaskDeps | null {
  const a = useSyncExternalStore(subscribeCloudAuth, () => auth, () => auth);
  return useMemo(() => cloudDeps(a), [a]);
}
