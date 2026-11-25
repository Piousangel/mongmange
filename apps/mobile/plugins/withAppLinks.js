// 공유 링크 앱 열기(C10, 빌드 2 네이티브 묶음 — DECISIONS D-04 보강 줄·'C10 빌드 2 네이티브 묶음').
// 바이너리에 박히는 값은 app.json에 그대로 둔다(읽기 쉽게): ios.associatedDomains `applinks:mongmang.ink`,
// android.intentFilters(autoVerify, https://mongmang.ink/m/…). 이 플러그인은 그 값을 **검사**하고 키 자리를 지킨다.
//  ① 앱 쪽 값이 web-static의 AASA(`/m/*`)·assetlinks와 같은 범위인지: 도메인 = mongmang.ink, 경로 = /m/ 하나, autoVerify. 어긋나면 늘 멈춘다
//  ② 키 자리(오너 몫): props.appleTeamId(Apple 팀 ID 10자) · props.androidCertSha256(EAS 업로드 키 + Play 앱 서명 키 SHA-256).
//     둘 다 공개 값이다(배포한 AASA·assetlinks.json에 그대로 보인다). web-static 배포 env APPLE_TEAM_ID·ANDROID_CERT_SHA256과 **같은 값**을 넣는다.
//     EAS 출시 빌드(development 밖)에서 그 플랫폼 값이 비었거나 형식이 틀리면 멈춘다 — 개발 빌드·로컬은 통과(앱 링크만 검증 안 됨).
//     production Android는 지문 2개 이상(업로드 키 + Play 앱 서명 키 — Play가 다시 서명하므로 업로드 키만으로는 설치본이 검증에 실패).
//  ③ appleTeamId가 있으면 config.ios.appleTeamId로 넣는다(@bacons/apple-targets가 위젯 타깃 DEVELOPMENT_TEAM에 씀 → 이 플러그인이 그보다 앞).
//  ④ 내부 시험 모드(plugins/buildMode.js, eas.json internal-test 프로필): 앱 링크를 **아예 넣지 않는** 명시 모드. withInternalTest가 먼저
//     associatedDomains·autoVerify 필터를 뺐는지(하나라도 남으면 멈춤)만 보고 키 검사는 하지 않는다 — 이 바이너리는 패키지 `.internaltest`라
//     스토어에 낼 수 없다. 다른 프로필에서는 이 모드를 켤 수 없으므로(buildMode 일치 검사) production·preview 가드는 그대로다.
// env로 받지 않는 까닭: config에 들어가는 값이 env마다 다르면 fingerprint 런타임이 빌드 환경마다 갈린다(V21 리뷰 H1과 같은 함정).
// props에 두면 값은 한 번 채울 때만 런타임이 바뀐다(빌드 2 동결 12-19 전에 채움).
const DOMAIN = 'mongmang.ink';
const PATH_PREFIX = '/m/';
const TEAM_RE = /^[A-Z0-9]{10}$/;
const { internalTestMode } = require('./buildMode');
const FP_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

function fail(msg) {
  throw new Error(`[withAppLinks] ${msg}`);
}

/** web-static scripts/build.mjs looksPlaceholder와 같은 규칙(같은 값을 두 곳에 넣으므로 같은 거름) */
function looksPlaceholder(v) {
  const c = v.replace(/:/g, '').toUpperCase();
  const distinct = new Set(c).size;
  if (distinct <= 1 || (c.length >= 32 && distinct < 4)) return true;
  const SEQ = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (c.length >= 6 && (SEQ.includes(c) || '9876543210'.includes(c) || '1234567890'.includes(c))) return true;
  return /^(X+|TEAMID.*|EXAMPLE.*|PLACEHOLDER.*|TODO.*|CHANGEME.*)$/.test(c);
}

function checkLinkConfig(config) {
  const domains = config.ios?.associatedDomains ?? [];
  if (JSON.stringify(domains) !== JSON.stringify([`applinks:${DOMAIN}`])) fail(`ios.associatedDomains는 ["applinks:${DOMAIN}"] 하나여야 한다 — 지금 ${JSON.stringify(domains)}`);
  const filters = (config.android?.intentFilters ?? []).filter((f) => (f.data ?? []).some((d) => d.host === DOMAIN));
  if (filters.length !== 1) fail(`android.intentFilters에 ${DOMAIN} 필터가 정확히 하나여야 한다 — 지금 ${filters.length}개`);
  const f = filters[0];
  const data = f.data ?? [];
  const ok =
    f.action === 'VIEW' &&
    f.autoVerify === true &&
    ['BROWSABLE', 'DEFAULT'].every((c) => (f.category ?? []).includes(c)) &&
    data.length === 1 &&
    data[0].scheme === 'https' &&
    data[0].host === DOMAIN &&
    data[0].pathPrefix === PATH_PREFIX &&
    !data[0].path &&
    !data[0].pathPattern;
  if (!ok) fail(`intentFilter는 VIEW·autoVerify·BROWSABLE+DEFAULT, https://${DOMAIN}${PATH_PREFIX} 하나만(AASA /m/*와 같은 범위)`);
}

/** 키 자리 검사 결과: 문제 목록(값은 싣지 않음) */
function keyProblems(props, { platform, profile }) {
  const problems = [];
  const team = (props.appleTeamId ?? '').trim();
  const fps = (props.androidCertSha256 ?? []).map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  if (platform !== 'android') {
    if (!team) problems.push('appleTeamId가 비어 있다(오너: Apple Developer → Membership)');
    else if (!TEAM_RE.test(team) || looksPlaceholder(team)) problems.push('appleTeamId 형식이 아니다(대문자·숫자 10자)');
  }
  if (platform !== 'ios') {
    if (!fps.length) problems.push('androidCertSha256이 비어 있다(EAS 업로드 키 + Play 앱 서명 키 SHA-256)');
    for (const [i, f] of fps.entries()) if (!FP_RE.test(f) || looksPlaceholder(f)) problems.push(`androidCertSha256 ${i + 1}번째 값이 SHA-256 지문 형식이 아니다`);
    if (new Set(fps).size !== fps.length) problems.push('androidCertSha256에 같은 지문이 두 번 있다');
    if (profile === 'production' && new Set(fps).size < 2) problems.push('production은 지문 2개 이상(EAS 업로드 키 + Play 앱 서명 키)');
  }
  return problems;
}

/** 내부 시험 모드: 앱 링크가 하나도 없어야 한다(withInternalTest가 뺐는지) */
function checkNoLinks(config) {
  const domains = config.ios?.associatedDomains ?? [];
  if (domains.length) fail(`내부 시험 모드인데 ios.associatedDomains가 남아 있다 — ${JSON.stringify(domains)}(withInternalTest가 withAppLinks보다 앞에 있어야 한다)`);
  const left = (config.android?.intentFilters ?? []).filter((f) => f.autoVerify === true || (f.data ?? []).some((d) => d.host === DOMAIN));
  if (left.length) fail(`내부 시험 모드인데 android 앱 링크 필터가 ${left.length}개 남아 있다(withInternalTest가 withAppLinks보다 앞에 있어야 한다)`);
}

function withAppLinks(config, props = {}) {
  const env = props.env ?? process.env;
  if (internalTestMode(env, 'withAppLinks')) {
    checkNoLinks(config);
    return config;
  }
  checkLinkConfig(config);
  const team = (props.appleTeamId ?? '').trim();
  if (props.androidCertSha256 !== undefined && !Array.isArray(props.androidCertSha256)) fail('androidCertSha256은 배열이어야 한다');

  const easRelease = env.EAS_BUILD === 'true' && env.EAS_BUILD_PROFILE !== 'development';
  if (easRelease) {
    const problems = keyProblems(props, { platform: env.EAS_BUILD_PLATFORM, profile: env.EAS_BUILD_PROFILE });
    if (problems.length) fail(`출시 빌드인데 앱 링크 키 자리가 비었다: ${problems.join(' / ')} — app.json withAppLinks props(web-static env와 같은 값)`);
  }
  if (!team) return config;
  if (config.ios?.appleTeamId && config.ios.appleTeamId !== team) fail('ios.appleTeamId와 withAppLinks appleTeamId가 다르다 — 한 곳(props)에만 둔다');
  return { ...config, ios: { ...config.ios, appleTeamId: team } };
}

module.exports = withAppLinks;
module.exports._test = { keyProblems, looksPlaceholder, DOMAIN, PATH_PREFIX };
