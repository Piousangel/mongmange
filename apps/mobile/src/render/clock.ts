import { useEffect } from 'react';
import { Platform } from 'react-native';
import { makeMutable, useFrameCallback } from 'react-native-reanimated';

/**
 * 앱 시계(ms). 모든 모션은 withTiming이 아니라 "시계 + 사건 시각"의 순수 함수다 — 결정적이고,
 * 웹 캡처에서는 가상 시계(?vclock=1, window.__step)로 한 프레임씩 진행해 60fps를 드롭 없이 녹화한다.
 */
export const clock = makeMutable(0);

export interface Params {
  screen: string;
  day: number;
  attach: 1 | 2 | 3;
  body: 'A' | 'B';
  clean: boolean;
  vclock: boolean;
  rm: boolean;
  octaves: number;
  nres: number;
  study: string;
}

export function readParams(): Params {
  const q = Platform.OS === 'web' && typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const a = Number(q.get('attach'));
  return {
    screen: q.get('screen') ?? 'day',
    day: Number(q.get('day') ?? 0),
    attach: a === 1 || a === 3 ? a : 2,
    body: q.get('body') === 'B' ? 'B' : 'A',
    clean: q.get('clean') === '1',
    vclock: q.get('vclock') === '1',
    rm: q.get('rm') === '1',
    octaves: Number(q.get('oct') ?? 4),
    nres: Number(q.get('nres') ?? 0.5),
    study: q.get('study') ?? '',
  };
}

export const PARAMS = readParams();

/** 실시간이면 프레임마다 시계를 진행, 가상 시계면 window.__step(ms)로만 진행 */
export function useDriveClock() {
  const fc = useFrameCallback((f) => {
    'worklet';
    clock.value = f.timeSinceFirstFrame;
  }, !PARAMS.vclock);
  useEffect(() => {
    if (!PARAMS.vclock || typeof window === 'undefined') return;
    const w = window as unknown as { __step?: (ms: number) => number; __now?: () => number };
    w.__step = (ms: number) => {
      clock.value = clock.value + ms;
      return clock.value;
    };
    w.__now = () => clock.value;
  }, []);
  return fc;
}

export function ease(t: number): number {
  'worklet';
  const x = Math.min(Math.max(t, 0), 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
export function easeOut(t: number): number {
  'worklet';
  const x = Math.min(Math.max(t, 0), 1);
  return 1 - Math.pow(1 - x, 3);
}
export function clamp01(t: number): number {
  'worklet';
  return Math.min(Math.max(t, 0), 1);
}
/** 감쇠 스프링 응답(기쁨에만 허용, 아트 8절) — 0에서 출발해 1로 */
export function springStep(tMs: number, damping = 14, stiffness = 200): number {
  'worklet';
  if (tMs <= 0) return 0;
  const t = tMs / 1000;
  const w0 = Math.sqrt(stiffness);
  const zeta = damping / (2 * w0);
  if (zeta >= 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
}
