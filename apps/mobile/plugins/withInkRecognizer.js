// 필기 인식 네이티브 의존(ML Kit Digital Ink, V2 `modules/ink-recognizer`)을 빌드에 넣고 빼는 스위치 하나(C10).
// 11-30 V0-5 결정(C′ / C′-키보드)에 따라 빌드 2에서 빠질 수 있어서, app.json 이 플러그인의 `enabled` 한 칸으로 정한다.
//
// 계약(V2 모듈이 지킬 것 — enabled: true로 바꾸기 전에 이 플러그인이 검사한다):
//  ① 스위치 값은 두 곳에 문자열 'true' | 'false'로 쓴다
//     - Android gradle.properties `mong.inkRecognizer` → 모듈 android/build.gradle이 `findProperty('mong.inkRecognizer') == 'true'`일 때만
//       `com.google.mlkit:digital-ink-recognition` 의존과 ML Kit 소스 세트를 넣는다(아니면 스텁 소스만)
//     - iOS Podfile.properties.json `mong.inkRecognizer` → 모듈 podspec이 그 값이 'true'일 때만 `GoogleMLKit/DigitalInkRecognition`
//       의존과 ML Kit Swift 소스를 넣는다(아니면 스텁 소스만)
//  ② 꺼진 빌드에서도 모듈은 자동 링크될 수 있다 → 스텁은 `isAvailable() = false`만 돌려주고 ML Kit 기호를 하나도 참조하지 않는다.
//     JS는 그 값으로 키보드 입력(V3 대체 경로)으로 간다
//  ③ modules/ink-recognizer가 **있으면 켬·꺼짐과 관계없이** build.gradle·podspec이 스위치를 읽는지 검사하고, 아니면 prebuild를 멈춘다
//     (C10 리뷰 H1: 꺼짐인데 스파이크처럼 ML Kit을 무조건 넣는 모듈이 동결 바이너리에 조용히 들어가는 것을 막는다).
//     읽는 모양: Android `findProperty('mong.inkRecognizer')`, iOS podspec이 `Podfile.properties.json`을 열고 'mong.inkRecognizer' 키를 본다.
//     모듈이 없으면 꺼짐만 통과(켬이면 멈춤)
// 값이 바뀌면 네이티브가 바뀌므로 fingerprint 런타임도 바뀐다(config 해시에 props가 들어감) — 빌드 2 동결 12-19 전에만 바꾼다.
const fs = require('node:fs');
const path = require('node:path');
const { withGradleProperties, withPodfileProperties } = require('expo/config-plugins');

const KEY = 'mong.inkRecognizer';
const MODULE_DIR = 'modules/ink-recognizer';

function fail(msg) {
  throw new Error(`[withInkRecognizer] ${msg}`);
}

const GRADLE_READS = /findProperty\(\s*['"]mong\.inkRecognizer['"]\s*\)/;
const PODSPEC_READS = [/Podfile\.properties\.json/, /\[\s*['"]mong\.inkRecognizer['"]\s*\]/];
/** 주석 속 이름은 읽는 것으로 치지 않는다(리뷰 L3) */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)(\/\/|#).*$/gm, '$1');

/** 모듈이 계약 ①을 지키는지. 모듈이 없으면 null(검사할 것 없음), 있으면 문제 목록 */
function contractProblems(projectRoot) {
  const dir = path.join(projectRoot, MODULE_DIR);
  if (!fs.existsSync(dir)) return null;
  const problems = [];
  const gradle = path.join(dir, 'android', 'build.gradle');
  if (!fs.existsSync(gradle) || !GRADLE_READS.test(stripComments(fs.readFileSync(gradle, 'utf8')))) problems.push(`android/build.gradle이 findProperty('${KEY}')를 읽지 않는다`);
  const iosDir = path.join(dir, 'ios');
  const specs = fs.existsSync(iosDir) ? fs.readdirSync(iosDir).filter((n) => n.endsWith('.podspec')) : [];
  const specOk = (n) => {
    const src = stripComments(fs.readFileSync(path.join(iosDir, n), 'utf8'));
    return PODSPEC_READS.every((re) => re.test(src));
  };
  if (!specs.some(specOk)) problems.push(`ios/*.podspec이 Podfile.properties.json의 '${KEY}'를 읽지 않는다`);
  return problems;
}

function withInkRecognizer(config, props = {}) {
  if (typeof props.enabled !== 'boolean') fail('enabled(true | false)를 app.json에 적는다');
  const value = props.enabled ? 'true' : 'false';
  const projectRoot = props.projectRoot ?? config._internal?.projectRoot ?? process.cwd();
  const problems = contractProblems(projectRoot);
  if (problems === null) {
    if (props.enabled) fail(`enabled: true인데 ${MODULE_DIR}가 없다(V2 모듈을 먼저 넣는다)`);
  } else if (problems.length) {
    fail(`${MODULE_DIR}가 스위치를 읽지 않는다(enabled: ${value} — 꺼짐이어도 ML Kit이 들어갈 수 있음): ${problems.join(' / ')}`);
  }
  config = withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === KEY));
    cfg.modResults.push({ type: 'property', key: KEY, value });
    return cfg;
  });
  return withPodfileProperties(config, (cfg) => {
    cfg.modResults[KEY] = value;
    return cfg;
  });
}

module.exports = withInkRecognizer;
module.exports._test = { contractProblems, KEY, MODULE_DIR };
