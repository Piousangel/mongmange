// 웹 대체 경로: localStorage. 막혀 있으면(사생활 모드 등) 메모리로 떨어진다(세션 안에서만 유지).
import type { KV } from '@mong/core';

const mem = new Map<string, string>();
function ls(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const kv: KV = {
  getString: (k) => {
    try {
      return ls()?.getItem(k) ?? mem.get(k) ?? undefined;
    } catch {
      return mem.get(k);
    }
  },
  set: (k, v) => {
    mem.set(k, v);
    try {
      ls()?.setItem(k, v);
    } catch {
      /* 용량·권한 — 메모리에는 남는다 */
    }
  },
  remove: (k) => {
    mem.delete(k);
    try {
      ls()?.removeItem(k);
    } catch {
      /* 무시 */
    }
  },
};
