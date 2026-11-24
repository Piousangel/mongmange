// 런타임 버전(fingerprint) 계산 설정(V21 리뷰 H1, docs/design/server-v1/ota-self-host.md 4절).
// 문제: fingerprint는 정규화한 expo config 전체를 해시한다. 가드 플러그인(plugins/withSelfHostedUpdates.js)이 빌드 프로필마다 다르게 넣는
// `updates.requestHeaders`(채널)·`codeSigningCertificate`·`codeSigningMetadata`(채널별 키)·`enabled`(준비·인증서 여부)가 그대로 들어가
// 같은 소스인데 채널마다 런타임이 달라졌다(11-25 실측 env 없음 89d4… / preview 2403… / production 632e…) → 게시한 판이 어느 바이너리와도 안 맞는다.
// 고침: 공식 훅 fileHookTransform으로 'expoConfig' 내용에서 그 네 칸만 뺀다. 네 칸은 JS ↔ 네이티브 호환과 무관한 '빌드별 설정 값'이다
// (네이티브 모듈·의존성·플러그인 파일·그 밖의 config는 그대로 해시 → 네이티브가 바뀌면 여전히 런타임이 바뀐다).
// 버린 안: ⓐ 채널 헤더를 config 밖 네이티브 mod로 직접 쓰기 — 서명 설정·enabled까지 mod로 옮겨야 해 expo-updates 플러그인을 다시 구현하게 된다.
// ⓑ 채널마다 런타임을 다르게 두고 CLI가 채널별로 계산 — preview에서 확인한 같은 번들을 production에 내는 길(republish)이 런타임 불일치로 막힌다.
// 시험: apps/mobile/test/ota-config.test.ts '채널 env 셋에서 런타임이 같다'(실제 runtimeversion:resolve).
const BUILD_SPECIFIC_UPDATES_KEYS = ['requestHeaders', 'codeSigningCertificate', 'codeSigningMetadata', 'enabled'];

function stripBuildSpecific(json) {
  const config = JSON.parse(json);
  if (config.updates) for (const k of BUILD_SPECIFIC_UPDATES_KEYS) delete config.updates[k];
  return JSON.stringify(config);
}

/** @type {import('expo/fingerprint').Config & { _test: unknown }} */
module.exports = {
  fileHookTransform: (source, chunk) => (source.type === 'contents' && source.id === 'expoConfig' && typeof chunk === 'string' ? stripBuildSpecific(chunk) : chunk),
  _test: { stripBuildSpecific, BUILD_SPECIFIC_UPDATES_KEYS },
};
