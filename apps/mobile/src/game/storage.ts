// 네이티브 저장소 = MMKV(D-04). 웹은 storage.web.ts(localStorage)가 대신한다.
import { createMMKV } from 'react-native-mmkv';
import type { KV } from '@mong/core';

const mmkv = createMMKV({ id: 'mong' });

export const kv: KV = {
  getString: (k) => mmkv.getString(k),
  set: (k, v) => mmkv.set(k, v),
  remove: (k) => {
    mmkv.remove(k);
  },
};
