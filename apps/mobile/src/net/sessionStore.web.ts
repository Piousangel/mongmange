// 웹: 세션을 메모리에만(웹 미리보기는 맡겨 두기를 쓰지 않는다 — 브라우저 저장소에 토큰을 남기지 않음).
import type { KV } from '@mong/core';

const mem = new Map<string, string>();
export const sessionStore: KV = {
  getString: (k) => mem.get(k),
  set: (k, v) => {
    mem.set(k, v);
  },
  remove: (k) => {
    mem.delete(k);
  },
};
