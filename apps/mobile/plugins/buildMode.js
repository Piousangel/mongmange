// 내부 시험 빌드 모드 판정(eas.json `internal-test` 프로필). 노트북(개발 서버) 없이 폰에서 보는 단독 APK용 — 앱 링크를 **아예 넣지 않는** 명시 모드다.
// 가드를 약하게 하는 스위치가 아니다: 이 모드가 켜지면 바이너리를 스토어에 낼 수 없는 모양(패키지 `.internaltest`·이름 '(시험)'·OTA 꺼짐)으로
// 바꾸는 withInternalTest가 함께 돈다. production·preview·development 프로필에서는 켤 수 없다(아래 일치 검사, test/internal-test.test.ts).
//  - 켜는 법: 환경 변수 MONG_INTERNAL_TEST=1 (eas.json internal-test 프로필 env)
//  - EAS 빌드에서는 프로필 이름과 플래그가 서로 맞아야 한다: internal-test 프로필인데 플래그 없음 / 플래그인데 다른 프로필 → 멈춤
//  - OTA 채널(MONG_OTA_CHANNEL)과 함께 켜면 멈춤 — 운영·preview OTA를 받는 시험 바이너리를 만들지 않는다
//  - 지금은 Android만(iOS는 App Group·위젯 번들 id가 본 앱 id에 묶여 있어 따로 설계해야 한다) → EAS iOS면 멈춤
const PROFILE = 'internal-test';
const FLAG = 'MONG_INTERNAL_TEST';
const PACKAGE_SUFFIX = '.internaltest';
const NAME_SUFFIX = ' (시험)';

function internalTestMode(env = process.env, who = 'buildMode') {
  const fail = (msg) => {
    throw new Error(`[${who}] ${msg}`);
  };
  const raw = env[FLAG];
  if (raw !== undefined && raw !== '' && raw !== '1') fail(`${FLAG}는 '1'만 — 지금 ${JSON.stringify(raw)}`);
  const on = raw === '1';
  if (env.EAS_BUILD === 'true') {
    const isProfile = env.EAS_BUILD_PROFILE === PROFILE;
    if (isProfile && !on) fail(`${PROFILE} 프로필인데 ${FLAG}=1이 없다(eas.json env)`);
    if (on && !isProfile) fail(`${FLAG}=1은 ${PROFILE} 프로필에서만 — 지금 ${env.EAS_BUILD_PROFILE}`);
    if (on && env.EAS_BUILD_PLATFORM === 'ios') fail('내부 시험 모드는 지금 Android만');
  }
  if (on && env.MONG_OTA_CHANNEL) fail(`내부 시험 모드에 OTA 채널(MONG_OTA_CHANNEL=${env.MONG_OTA_CHANNEL})을 두지 않는다`);
  return on;
}

module.exports = { internalTestMode, PROFILE, FLAG, PACKAGE_SUFFIX, NAME_SUFFIX };
