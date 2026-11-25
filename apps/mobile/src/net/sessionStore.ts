// 로그인 세션 전용 저장소(architecture 3-3 ④): 세이브 MMKV(`mong`)와 다른 인스턴스 `mong.session`.
// OS 백업 제외(iOS isExcludedFromBackup·Android 백업 규칙)는 네이티브 설정이라 빌드 2 네이티브 묶음 몫 — 그 전에는 세이브와 같은 백업 정책이다.
// 웹은 sessionStore.web.ts(메모리 — 웹은 맡겨 두기를 쓰지 않는다).
import type { KV } from '@mong/core';

function create(): KV {
  try {
    const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    const mmkv = createMMKV({ id: 'mong.session' });
    return {
      getString: (k) => mmkv.getString(k),
      set: (k, v) => mmkv.set(k, v),
      remove: (k) => {
        mmkv.remove(k);
      },
    };
  } catch {
    // MMKV가 없는 옛 개발 빌드: 세션을 메모리에만(다시 켜면 로그아웃 — 세이브와 달리 잃어도 되돌릴 수 있다)
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

export const sessionStore: KV = create();
