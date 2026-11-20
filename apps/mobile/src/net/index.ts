// 서버 연동 단일 인스턴스(게임 경로 밖 — architecture.md 4-1). 화면은 이 모듈을 기다리지 않는다.
// 웹(미리보기)은 핑을 보내지 않는다(측정 대상은 스토어 설치뿐).
// 핑 켜짐 = 서버 주소(API_BASE) AND 사용자 동의(gate.ts — 설정 토글 연결 전에는 늘 거짓, 리뷰 m1).
import { Platform } from 'react-native';
import { readNameTimingGroup } from '../game/abGroup';
import { kv } from '../game/storage';
import { API_BASE, appBuild, BUNDLE_SEQ, STATIC_BASE } from './env';
import { metricsConsent } from './gate';
import type { FetchLike } from './http';
import { createPingClient } from './ping';
import { createRemoteConfig } from './remoteConfig';

const fetchFn: FetchLike = (url, init) => fetch(url, init);

export const pingClient = createPingClient({
  kv,
  fetch: fetchFn,
  apiBase: Platform.OS === 'ios' || Platform.OS === 'android' ? API_BASE : '',
  consent: () => metricsConsent(kv),
  nameTiming: () => readNameTimingGroup(kv),
  // isMoonWindow: core 달 위상 함수가 들어오면 연결(로드맵 'core 함수' 단계). 그 전에는 늘 '0' — 연결 전에는 핑을 켜지 않는다
  // widgetCount: 위젯 로컬 모듈 getInstalledCount()(빌드 2 네이티브 묶음). 그 전에는 '-'
});

/**
 * 원격 설정 로더. **아직 읽는 곳이 없어 받지 않는다**(리뷰 m9) — features.ts에 원격 층을 끼우는 작업이
 * 크래시 루프 탈출(정본 3-7)과 함께 refresh 호출을 연결한다.
 */
export const remoteConfig = createRemoteConfig({
  kv,
  fetch: fetchFn,
  staticBase: STATIC_BASE,
  platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
  appBuild: appBuild(),
  bundleSeq: BUNDLE_SEQ,
  now: () => Date.now(),
  random: Math.random,
});
