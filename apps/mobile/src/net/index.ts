// 서버 연동 단일 인스턴스(게임 경로 밖 — architecture.md 4-1). 화면은 이 모듈을 기다리지 않는다.
// 웹(미리보기)은 핑을 보내지 않는다(측정 대상은 스토어 설치뿐).
// - 핑 켜짐 = 서버 주소(API_BASE) AND 동의(gate.ts — 직접 켠 14세 확인 통과자만, 설정 토글 연결 전에는 늘 거짓).
// - 원격 설정(서명 검사·크래시 루프 탈출)은 features.ts의 가운데 층으로 건다. 공개키 목록이 비어 있으면 어떤 원격 문서도 받지 않는다.
// - 원격 콘텐츠(모티프·사전 팩)는 원격 플래그 remoteMotifs가 켜졌을 때만 받는다(NetBridge).
// - 맡겨 두기 로그인 포트: Supabase 주소·공개 키가 있으면 익명 로그인 어댑터를 C12 registerCloudAuth에 건다(플래그 cloud는 따로 — 기본 꺼짐).
import { Platform } from 'react-native';
import { registerCloudAuth } from '../cloud';
import { notifyFeatures, remoteBundled, setRemoteLayer } from '../features';
import { readNameTimingGroup } from '../game/abGroup';
import { kv } from '../game/storage';
import { createContentPacks } from './contentPacks';
import { API_BASE, appBuild, BUNDLE_SEQ, STATIC_BASE, SUPABASE_KEY, SUPABASE_URL } from './env';
import { metricsConsent } from './gate';
import { SESSION_BACKUP_EXCLUDED } from './nativeFlags';
import { gateRemoteFlag } from './remoteGate';
import type { FetchLike } from './http';
import { REMOTE_PUBLIC_KEYS } from './keys';
import { createPingClient } from './ping';
import { createRemoteConfig } from './remoteConfig';
import { sessionStore } from './sessionStore';
import { createSupabaseAuth } from './supabaseAuth';

const fetchFn: FetchLike = (url, init) => fetch(url, init);
const native = Platform.OS === 'ios' || Platform.OS === 'android';

export const pingClient = createPingClient({
  kv,
  fetch: fetchFn,
  apiBase: native ? API_BASE : '',
  consent: () => metricsConsent(kv),
  nameTiming: () => readNameTimingGroup(kv),
  // isMoonWindow: core 달 위상 함수가 들어오면 연결(로드맵 'core 함수' 단계). 그 전에는 늘 '0' — 연결 전에는 핑을 켜지 않는다
  // widgetCount: 위젯 로컬 모듈 getInstalledCount()(빌드 2 네이티브 묶음). 그 전에는 '-'
});

/** 원격 설정 로더. 만들어지는 순간이 '실행 시작'이다(크래시 루프 판정) */
export const remoteConfig = createRemoteConfig({
  kv,
  fetch: fetchFn,
  staticBase: STATIC_BASE,
  keys: REMOTE_PUBLIC_KEYS,
  platform: native ? (Platform.OS as 'ios' | 'android') : 'web',
  appBuild: appBuild(),
  bundleSeq: BUNDLE_SEQ,
  bundled: remoteBundled(),
  now: () => Date.now(),
  random: Math.random,
});
// cloud는 세션 백업 제외 바이너리에서만 원격 값을 받는다(리뷰 H1 — 아니면 꺼짐 강제)
setRemoteLayer((key) => gateRemoteFlag(key, remoteConfig.remoteFlag(key), { sessionBackupExcluded: SESSION_BACKUP_EXCLUDED }));
remoteConfig.subscribe(notifyFeatures);

/** 원격 콘텐츠(지금 읽는 곳 없음 — 꿈 풀·V5d 사전이 연결할 자리) */
export const contentPacks = createContentPacks({
  kv,
  fetch: fetchFn,
  staticBase: STATIC_BASE,
  keys: REMOTE_PUBLIC_KEYS,
  appBuild: appBuild(),
  // 번들 사전 판: V5d 사전이 들어오면 그 판으로(지금은 번들 사전이 없어 1 = 원격 판 2부터)
  bundledLexVer: { ko: 1, en: 1 },
  now: () => Date.now(),
  escaping: () => remoteConfig.escaping(),
});

if (native && SUPABASE_URL && SUPABASE_KEY) {
  registerCloudAuth(createSupabaseAuth({ fetch: fetchFn, url: SUPABASE_URL, key: SUPABASE_KEY, store: sessionStore, now: () => Date.now() }));
}
