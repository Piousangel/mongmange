// 앱 OTA 확인의 실제 연결(checker.ts 규칙 + expo-updates·MMKV·AppState). 진입점(index.ts)에서 한 번 startOta().
// 진입점에서 부르므로 **무슨 일이 있어도 던지지 않는다**(V24 리뷰 L2): 내장 번들에서 여기가 던지면 번들 평가 오류 → 되돌아갈 판이 없고
// OTA로도 못 고친다(받는 코드 자신이 죽으므로). 그래서 ① 본문 전체 try ② 저장소(MMKV)·expo-updates는 안에서 지연 로드 —
// 실패하면 OTA만 꺼지고 앱은 뜬다. 앱이 끝날 때까지 사는 구독이라 정리하지 않는다(진입점 모듈 수명 = 앱 수명).
// 시험: test/ota-entry.test.ts(react-native 대역으로 startOtaWith)
import type { KV } from '@mong/core';
import { AppState, Platform } from 'react-native';
import { optionalModule } from '../lib/optionalModule';
import { createOtaChecker, type OtaTimers, type UpdatesLike } from './checker';

export interface OtaEnv {
  dev: boolean;
  platform: string;
  loadUpdates: () => UpdatesLike | null;
  loadKV: () => KV;
  onAppState: (fn: (state: string) => void) => void;
  now: () => number;
  timers: OtaTimers;
}

/** 시작했으면 true. 개발·웹이면 아무것도 불러오지 않고 false, 어떤 예외도 삼키고 false */
export function startOtaWith(env: OtaEnv): boolean {
  try {
    // 개발 빌드·웹은 모듈·저장소를 불러 보지도 않는다(dev client에서 expo-updates 호출은 거부된다)
    if (env.dev || (env.platform !== 'ios' && env.platform !== 'android')) return false;
    const updates = env.loadUpdates();
    if (!updates || updates.isEnabled !== true) return false;
    const checker = createOtaChecker({ updates, platform: env.platform, dev: env.dev, kv: env.loadKV(), now: env.now, timers: env.timers });
    void checker.start();
    env.onAppState((st) => {
      void checker.onAppState(st);
    });
    return true;
  } catch {
    return false;
  }
}

let started = false;

export function startOta(): void {
  if (started) return;
  started = true;
  try {
    startOtaWith({
      dev: typeof __DEV__ !== 'undefined' && __DEV__ === true,
      platform: Platform.OS,
      loadUpdates: () => optionalModule<UpdatesLike>(() => require('expo-updates') as UpdatesLike),
      loadKV: () => (require('../game/storage') as typeof import('../game/storage')).kv,
      onAppState: (fn) => {
        AppState.addEventListener('change', fn);
      },
      now: () => Date.now(),
      timers: {
        set: (fn, ms) => setTimeout(fn, ms),
        clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      },
    });
  } catch {
    /* OTA만 꺼진다 — 앱은 뜬다 */
  }
}
