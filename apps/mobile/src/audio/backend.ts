// 네이티브 재생: expo-audio 플레이어 + expo-haptics. 웹은 backend.web.ts(no-op).
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import type { Backend, Voice } from './engine';
import { SOUND_FILES, type Haptic, type SoundId } from './soundMap';

let modeSet = false;
function ensureMode() {
  if (modeSet) return;
  modeSet = true;
  // iOS 무음 스위치를 따르고(playsInSilentMode false = ambient) 다른 앱 음악과 섞인다. 백그라운드 재생 없음
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false, allowsRecording: false }).catch(() => {
    /* 실패해도 기본 세션으로 재생 */
  });
}

export const backend: Backend = {
  create(id: SoundId, loop: boolean): Voice | null {
    ensureMode();
    try {
      const p = createAudioPlayer(SOUND_FILES[id]);
      p.loop = loop;
      let ended: (() => void) | null = null;
      let removed = false;
      const sub = p.addListener('playbackStatusUpdate', (s) => {
        if (s.didJustFinish && !loop) ended?.();
      });
      return {
        setVolume: (v) => {
          if (!removed) p.volume = v;
        },
        setRate: (r) => {
          if (!removed && r !== 1) p.setPlaybackRate(r);
        },
        play: () => {
          if (!removed) p.play();
        },
        stop: () => {
          if (removed) return;
          removed = true;
          sub.remove();
          try {
            p.pause();
            p.remove();
          } catch {
            /* 이미 해제 */
          }
        },
        onEnd: (cb) => {
          ended = cb;
        },
      };
    } catch {
      return null;
    }
  },
  haptic(h: Haptic) {
    // 저전력 모드 등에서 OS가 막으면 재시도하지 않는다
    const ignore = () => {};
    if (h.kind === 'impact') Haptics.impactAsync(h.style as Haptics.ImpactFeedbackStyle).catch(ignore);
    else if (h.kind === 'notification') Haptics.notificationAsync(h.type as Haptics.NotificationFeedbackType).catch(ignore);
    else Haptics.selectionAsync().catch(ignore);
  },
};
