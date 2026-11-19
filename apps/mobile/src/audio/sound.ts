// 앱 전역 소리 엔진 하나 + 설정 동기화 훅.
import { useEffect } from 'react';
import { backend } from './backend';
import { SoundEngine } from './engine';
import { DEFAULT_SOUND_SETTINGS, type SoundSettings } from './soundMap';

export const sound = new SoundEngine(
  backend,
  {
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
  },
  DEFAULT_SOUND_SETTINGS,
);

/** 공방 노트 설정이 바뀌면 엔진에 반영 */
export function useSoundSettings(s: SoundSettings) {
  useEffect(() => {
    sound.setSettings(s);
  }, [s]);
}
