// 내부 시험 APK(eas.json `internal-test`) — 판정은 plugins/buildMode.js. 이 모드가 꺼져 있으면 config를 그대로 돌려준다(다른 프로필 영향 0).
// 켜져 있으면 바이너리를 '스토어에 낼 수 없는 시험판'으로 바꾼다:
//  ① android.package·ios.bundleIdentifier에 `.internaltest` — Play·App Store 등록 앱 id와 달라 올릴 수 없고, 본 앱과 나란히 설치된다
//  ② 앱 이름 뒤 ' (시험)' — 홈 화면에서 본 앱과 구별
//  ③ 앱 링크를 아예 넣지 않는다: ios.associatedDomains, android의 mongmang.ink autoVerify intentFilter 제거
//     (키 없이 넣으면 검증 실패 링크가 되고, 시험판이 본 앱의 링크를 가로채지도 않게) — withAppLinks는 이 모드에서 '없음'을 검사한다
//  ④ OTA는 withSelfHostedUpdates가 이 모드에서 끈다(updates.enabled false, 채널 헤더·서명 없음)
//  ⑤ extra.internalTest = { buildId, commit } — 어느 빌드인지 표시(EAS가 주는 값, 로컬은 'local')
// app.json의 plugins에서 withSelfHostedUpdates·withAppLinks보다 **앞**에 둔다(config 변환은 배열 순서대로 돈다) — test/internal-test.test.ts가 고정.
const { internalTestMode, PACKAGE_SUFFIX, NAME_SUFFIX } = require('./buildMode');

const LINK_DOMAIN = 'mongmang.ink';

function withInternalTest(config, props = {}) {
  const env = props.env ?? process.env;
  if (!internalTestMode(env, 'withInternalTest')) return config;
  const pkg = config.android?.package;
  const bundle = config.ios?.bundleIdentifier;
  if (!pkg || !bundle) throw new Error('[withInternalTest] android.package·ios.bundleIdentifier가 있어야 한다');
  const { associatedDomains: _drop, ...ios } = config.ios ?? {};
  const intentFilters = (config.android?.intentFilters ?? []).filter((f) => !(f.data ?? []).some((d) => d.host === LINK_DOMAIN));
  return {
    ...config,
    name: `${config.name}${NAME_SUFFIX}`,
    ios: { ...ios, bundleIdentifier: `${bundle}${PACKAGE_SUFFIX}` },
    android: { ...config.android, package: `${pkg}${PACKAGE_SUFFIX}`, intentFilters },
    extra: { ...config.extra, internalTest: { buildId: env.EAS_BUILD_ID || 'local', commit: env.EAS_BUILD_GIT_COMMIT_HASH || 'local' } },
  };
}

module.exports = withInternalTest;
