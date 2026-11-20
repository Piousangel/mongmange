// 서버·정적 주소와 앱 판 정보(architecture.md v2.1 3-2·3-7·4-1). 모든 서버 호출은 이 값이 비면 아무것도 하지 않는다(no-op).
// - EXPO_PUBLIC_API_BASE: Cloud Run 서울(앱 API 직접). **아직 배포 전 — 기본은 빈 값 = 핑 꺼짐**. 로컬: http://<맥 IP>:8080
// - EXPO_PUBLIC_STATIC_BASE: Firebase Hosting(`https://mongmang.ink`) — config/v1.json·content/v1.json. 기본 빈 값 = 번들 기본값만
// EXPO_PUBLIC_* 는 빌드(번들) 때 박히고 OTA로 바뀔 수 있다.
import { optionalModule } from '../lib/optionalModule';
import { releaseVersion } from './ping';

const trimSlash = (s: string | undefined) => (s ?? '').trim().replace(/\/+$/, '');

/** https만(개발 빌드는 로컬 http 허용, 리뷰 m1) */
const httpsOnly = (u: string) => (u === '' || u.startsWith('https://') || (typeof __DEV__ !== 'undefined' && __DEV__) ? u : '');

export const API_BASE = httpsOnly(trimSlash(process.env.EXPO_PUBLIC_API_BASE));
export const STATIC_BASE = httpsOnly(trimSlash(process.env.EXPO_PUBLIC_STATIC_BASE));

/**
 * 앱 JS 판 번호(3-7 minBundle). **OTA를 낼 때마다 1씩 올린다.** 바이너리 내장 값과 OTA를 통틀어 하나의 증가 값이다 —
 * 새 바이너리의 내장 값은 앞선 마지막 OTA보다 커야 한다(아니면 새 바이너리에서 기능이 꺼진다). ota-guard가 확인(6-4).
 */
export const BUNDLE_SEQ = 1;

/** app.json의 version(`1.0.0`) */
const APP_VERSION: string = (require('../../app.json') as { expo: { version: string } }).expo.version;

type ExpoApplication = { nativeBuildVersion: string | null };
/**
 * 바이너리 빌드 번호(iOS buildNumber·Android versionCode). expo-application이 없는 바이너리는 0 — 그 경우 minAppBuild > 0인 원격 설정은 무시된다(안전 쪽).
 * expo-application은 빌드 2 네이티브 묶음에 선언 예정(지금은 다른 Expo 모듈의 하위 의존으로만 있을 수 있다).
 */
export function appBuild(): number {
  const mod = optionalModule<ExpoApplication>(() => require('expo-application'));
  const n = Number.parseInt(mod?.nativeBuildVersion ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** 핑의 appVer = 출시 판(`1.0`). 빌드 번호는 싣지 않는다(리뷰 I2). minAppBuild 판단에는 appBuild()를 쓴다 */
export function appVer(): string {
  return releaseVersion(APP_VERSION);
}
