// 화면이 언어 바뀜을 따라 다시 그리게 하는 훅. 문구는 t()로 읽는다(현재 언어 전역).
import { useSyncExternalStore } from 'react';
import { getLocale, subscribeLocale, type Locale } from './index';

export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale);
}
