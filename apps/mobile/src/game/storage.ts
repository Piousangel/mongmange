// 네이티브 저장소 = MMKV(D-04). 웹은 storage.web.ts(localStorage)가 대신한다.
// MMKV 네이티브 모듈이 없는 옛 개발 빌드에서는 메모리 저장으로 대신한다(앱 종료 시 사라짐).
import type { KV } from '@mong/core';

function createKV(): KV {
  try {
    const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    const mmkv = createMMKV({ id: 'mong' });
    return {
      getString: (k) => mmkv.getString(k),
      set: (k, v) => mmkv.set(k, v),
      remove: (k) => {
        mmkv.remove(k);
      },
    };
  } catch {
    const mem = new Map<string, string>();
    return {
      getString: (k) => mem.get(k),
      set: (k, v) => {
        mem.set(k, v);
      },
      remove: (k) => {
        mem.delete(k);
      },
    };
  }
}

export const kv: KV = createKV();
/** 네이티브 저장소를 못 쓰고 메모리로 돌고 있는지(개발 메뉴·노트 안내용). */
export const kvIsMemoryOnly = !(() => {
  try {
    require('react-native-mmkv');
    return true;
  } catch {
    return false;
  }
})();
