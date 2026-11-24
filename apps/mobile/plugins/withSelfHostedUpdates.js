// 자체 OTA 서버 설정 가드(V21, docs/design/server-v1/ota-self-host.md 8절). expo-updates 자체 플러그인은 그대로 두고, 그 앞에서 config.updates를 고친다.
//  ① updates.url은 우리 도메인(https, mongmang.ink)만 — Expo 업데이트 서비스(u.expo.dev)로 설치 id가 나가는 설정을 막는다
//  ② 채널: 빌드 프로필 환경 변수 MONG_OTA_CHANNEL(eas.json) → 요청 헤더 expo-channel-name. (eas.json의 `channel`은 EAS Update 전용이라 쓰지 않는다)
//  ③ 채널별 서명 키(리뷰 M3): 인증서 = certs/ota-<채널>.pem, keyid = 채널. production 바이너리는 production 인증서만 믿는다 →
//     preview 키로 서명한 판은 production 기기에서 검증에 실패한다
//  ④ fail-closed(리뷰 M2): ready·채널·그 채널 인증서가 **모두** 있을 때만 OTA를 켠다. 하나라도 없으면 `updates.enabled = false` —
//     EAS든 로컬(Xcode Archive·gradlew bundleRelease·expo run --variant release)이든 어떤 출시 구성도 '서명 없이 OTA를 받는 바이너리'가 되지 않는다.
//     EAS 출시 빌드(development 밖)에서는 조건이 빠지면 아예 빌드를 멈춘다(ready = PM 확인, 8절 체크리스트)
//  ⑤ 설치 id를 보내지 않게(리뷰 H2, 9절): expo-updates는 EAS-Client-ID(설치마다 영속 무작위 id)·Expo-Fatal-Error(오류 텍스트)·
//     Expo-Recent-Failed-Update-IDs를 끌 설정이 없다. 대신 config.requestHeaders를 그 뒤에 덮어쓴다(Android OkHttp `header()`·iOS
//     `setValue` 모두 같은 이름을 바꿔 씀 — FileDownloader.kt·FileDownloader.swift 순서는 test/ota-config.test.ts가 설치본 소스로 고정).
//     그래서 상수로 덮는다 — 모든 설치가 같은 값을 보낸다
// 이 플러그인이 넣는 값(requestHeaders·서명 설정·enabled)은 fingerprint.config.js가 런타임 계산에서 뺀다(리뷰 H1)
const fs = require('node:fs');
const path = require('node:path');

const OUR_DOMAIN = 'mongmang.ink';
const CHANNEL_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** 설치 식별·충돌 정보를 상수로 덮는 헤더(모든 설치 같은 값) */
const PRIVACY_HEADERS = Object.freeze({
  'EAS-Client-ID': '00000000-0000-0000-0000-000000000000',
  'Expo-Fatal-Error': '-',
  'Expo-Recent-Failed-Update-IDs': '',
});

function fail(msg) {
  throw new Error(`[withSelfHostedUpdates] ${msg}`);
}

function withSelfHostedUpdates(config, props = {}) {
  const ready = props.ready === true;
  const env = props.env ?? process.env;
  const projectRoot = props.projectRoot ?? config._internal?.projectRoot ?? process.cwd();
  const updates = { ...(config.updates ?? {}) };

  let url;
  try {
    url = new URL(updates.url ?? '');
  } catch {
    fail('updates.url이 없다');
  }
  if (url.protocol !== 'https:' || !(url.hostname === OUR_DOMAIN || url.hostname.endsWith(`.${OUR_DOMAIN}`))) {
    fail(`updates.url은 https://*.${OUR_DOMAIN}만 — 지금 ${url.href}`);
  }
  if (!config.runtimeVersion) fail('runtimeVersion이 없다');

  const channel = env.MONG_OTA_CHANNEL && CHANNEL_RE.test(env.MONG_OTA_CHANNEL) ? env.MONG_OTA_CHANNEL : null;
  const certRel = channel ? `./certs/ota-${channel}.pem` : null;
  const hasCert = !!certRel && fs.existsSync(path.resolve(projectRoot, certRel));
  const missing = [!ready && 'ready: true(PM 확인)', !channel && 'MONG_OTA_CHANNEL', channel && !hasCert && `인증서 ${certRel}`].filter(Boolean);

  const easRelease = env.EAS_BUILD === 'true' && env.EAS_BUILD_PROFILE !== 'development';
  if (easRelease && missing.length) fail(`출시 빌드인데 자체 OTA 조건이 빠졌다: ${missing.join(', ')} — ota-self-host.md 8절 체크리스트`);

  updates.requestHeaders = { ...(updates.requestHeaders ?? {}), ...PRIVACY_HEADERS, ...(channel ? { 'expo-channel-name': channel } : {}) };
  delete updates.codeSigningCertificate;
  delete updates.codeSigningMetadata;
  if (missing.length) {
    updates.enabled = false;
  } else {
    updates.enabled = true;
    updates.codeSigningCertificate = certRel;
    updates.codeSigningMetadata = { keyid: channel, alg: 'rsa-v1_5-sha256' };
  }
  return { ...config, updates };
}

module.exports = withSelfHostedUpdates;
module.exports.PRIVACY_HEADERS = PRIVACY_HEADERS;
