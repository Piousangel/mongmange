// 로그인 세션 저장소를 OS 백업·기기 이전에서 뺀다(C10b, DECISIONS 'C10b'). 백업 복원 폰이 옛 로그인을 들고 오지 않게(B2b 판정 H1 전제).
// 세이브(MMKV `mong`)·위젯 값(`mong.widget`)은 백업에 그대로 남는다 — 빼는 것은 세션 두 파일뿐이다.
//
// 계약(C11 `src/net/sessionStore.ts`가 지킬 것 — test/c10b-backup.test.ts가 그 파일이 들어오면 검사한다):
//   react-native-mmkv `createMMKV({ id: 'mong.session' })`, `path` 없음, 암호화·모드 옵션과 무관
//   → Android  <filesDir>/mmkv/mong.session, mong.session.crc   (HybridMMKVPlatformContext.kt: filesDir + "/mmkv")
//   → iOS      <Documents>/mmkv/mong.session, mong.session.crc  (HybridMMKVPlatformContext.swift: documentDirectory + "/mmkv",
//              Info.plist `AppGroupIdentifier`가 있으면 App Group 폴더로 옮겨 가므로 이 키를 두지 않는다 — 아래 가드)
//
// Android: application에 `android:fullBackupContent`(API 30 이하 기기)·`android:dataExtractionRules`(API 31 이상, 클라우드 백업 +
//   기기 간 이전 두 갈래)를 걸고 res/xml 규칙 파일 두 개를 쓴다. 규칙은 `exclude`만 쓴다 — `include`를 하나라도 쓰면 그것만 백업되므로
//   (Android 'Auto Backup' 문서) 세이브가 빠질 수 있다. `android:allowBackup`은 true여야 한다(false면 세이브 백업도 꺼짐 → 멈춤).
// iOS: 런타임 표시(NSURLIsExcludedFromBackupKey)라 네이티브 설정으로는 안 된다 → 로컬 모듈 modules/session-backup의 AppDelegate 구독자가
//   실행 때마다 건다. 이 플러그인은 그 모듈이 같은 파일 이름을 쓰는지, 구독자가 등록돼 있는지 보고 아니면 prebuild를 멈춘다.
// 플러그인 파일·모듈·XML이 모두 fingerprint에 들어가므로 바꾸면 런타임이 바뀐다 — 빌드 2 동결(12-19) 전에만.
//
// 원칙(C10b 리뷰 M1): **이 플러그인이 앱 백업 규칙의 유일한 주인**이다. 다른 라이브러리·플러그인이 규칙을 걸면(대표: expo-secure-store
//   `configureAndroidBackup` 기본 true → `@xml/secure_store_backup_rules`·`@xml/secure_store_data_extraction_rules`) prebuild가 멈춘다.
//   가드를 지우지 말고 둘 중 하나로 합친다:
//   ⓐ 상대 플러그인의 규칙 쓰기를 끈다(expo-secure-store는 `configureAndroidBackup: false`) — 그 라이브러리가 빼려던 항목은
//      우리 XML 상수(FULL_BACKUP_XML·DATA_EXTRACTION_XML)에 exclude로 옮겨 적는다(SecureStore = `domain="sharedpref" path="SECURESTORE"`
//      [확인 필요: 넣는 날 그 판의 XML]).
//   ⓑ props `mergeWith: { fullBackupContent: '<상대 res 이름>', dataExtractionRules: '<상대 res 이름>' }`를 app.json에 적는다 →
//      매니페스트는 상대 파일을 가리키게 두고, 최종 단계에서 그 파일에 우리 exclude를 넣어 합친다(상대 파일에 include가 있으면 멈춤 —
//      include는 '그것만 백업'이라 세이브가 빠질 수 있어 사람이 합친다).
// 검증(리뷰 H1): Expo mod는 **나중에 등록된 플러그인의 것이 먼저** 돌아, app.json에서 우리보다 앞에 있는 플러그인은 우리 매니페스트 값을
//   조용히 덮을 수 있다 → 모든 mod가 파일을 쓴 뒤 도는 finalized 단계에서 **디스크의 최종 AndroidManifest·규칙 XML·Info.plist**를 다시 읽어
//   세션 exclude가 실제로 걸렸는지 보고, 아니면 prebuild를 멈춘다(바이너리가 생기지 않는다).
// 세션 파일 계약 하나 더(리뷰 L3): C11은 세션을 비울 때 **파일을 지우지 않는다**(`removeStorage` 금지 — 키 삭제·`clearAll`만). MMKV가 파일을
//   새로 만들면 다음 실행 전까지 iOS 백업 제외 표시가 없다(test/c10b-backup.test.ts가 src 전체에서 `removeStorage`를 막는다).
const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod, withFinalizedMod, AndroidConfig } = require('expo/config-plugins');

const SESSION_STORE_ID = 'mong.session';
const MMKV_DIR = 'mmkv';
const SESSION_FILES = [SESSION_STORE_ID, `${SESSION_STORE_ID}.crc`];
const FULL_BACKUP_RES = 'mong_backup_rules';
const DATA_EXTRACTION_RES = 'mong_data_extraction_rules';
const MODULE_DIR = 'modules/session-backup';
const IOS_SUBSCRIBER = 'SessionBackupAppDelegateSubscriber';
// 바이너리 표시(C11 `src/net/nativeFlags.ts` SESSION_BACKUP_EXCLUDED가 expo-constants expoConfig.extra에서 '정확히 true'만 믿는다).
// expo-constants가 바이너리에 넣는 config는 mod를 돌리지 않고 평가한 값이라 표시는 설정 평가 때 써야 한다. 대신 그 config로 만든
// 바이너리는 반드시 prebuild를 거치고(CNG — /ios·/android는 gitignore), prebuild는 위 finalized 검증을 통과해야 끝난다
// → '표시가 true인데 규칙이 덮인 바이너리'는 만들어지지 않는다. 가드에 걸리면 표시를 쓰기 전에 멈추고, 플러그인이 빠지면 값이 없다.
// app.json에 손으로 적으면 플러그인 없이도 '백업 제외 바이너리'로 보이므로 정적 app.json에 있으면 멈춘다(쓰는 곳은 여기 하나).
//   평가된 config가 아니라 정적 파일을 보므로, 이미 적용된 config에 다시 적용해도 멈추지 않는다(리뷰 L2, 멱등).
// config(extra)가 바뀌므로 fingerprint 런타임에 들어간다 → 이 값이 true인 OTA는 같은 플러그인으로 만든 바이너리에만 내려간다.
const EXTRA_KEY = 'mongSessionBackupExcluded';

function fail(msg) {
  throw new Error(`[withSessionBackupExclusion] ${msg}`);
}

const excludes = (indent) => SESSION_FILES.map((f) => `${indent}<exclude domain="file" path="${MMKV_DIR}/${f}" />`).join('\n');

/** API 30 이하 기기(그리고 targetSdk 30 이하일 때의 모든 기기)가 읽는 규칙 */
const FULL_BACKUP_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- C10b: 로그인 세션(MMKV mong.session)만 뺀다. include가 없으므로 나머지(세이브 mmkv/mong 등)는 그대로 백업된다. 생성 파일 — plugins/withSessionBackupExclusion.js -->
<full-backup-content>
${excludes('  ')}
</full-backup-content>
`;

/** API 31 이상 기기: 클라우드 백업과 기기 간 이전 둘 다 같은 규칙(갈래가 빠지면 그 갈래는 전부 옮겨진다) */
const DATA_EXTRACTION_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- C10b: 로그인 세션(MMKV mong.session)만 뺀다 — 클라우드 백업·기기 간 이전 모두. include가 없으므로 나머지는 그대로. 생성 파일 — plugins/withSessionBackupExclusion.js -->
<data-extraction-rules>
  <cloud-backup>
${excludes('    ')}
  </cloud-backup>
  <device-transfer>
${excludes('    ')}
  </device-transfer>
</data-extraction-rules>
`;

/** 주석 속 이름은 치지 않는다 */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

/** iOS 모듈이 계약을 지키는지 — 문제 목록(빈 배열 = 통과) */
function iosModuleProblems(projectRoot) {
  const dir = path.join(projectRoot, MODULE_DIR);
  const problems = [];
  const cfgPath = path.join(dir, 'expo-module.config.json');
  if (!fs.existsSync(cfgPath)) return [`${MODULE_DIR}/expo-module.config.json이 없다`];
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  if (!(cfg.platforms ?? []).includes('apple')) problems.push('모듈 platforms에 apple이 없다');
  if (!(cfg.apple?.appDelegateSubscribers ?? []).includes(IOS_SUBSCRIBER)) problems.push(`apple.appDelegateSubscribers에 ${IOS_SUBSCRIBER}가 없다`);
  const iosDir = path.join(dir, 'ios');
  const swift = fs.existsSync(iosDir)
    ? fs.readdirSync(iosDir).filter((n) => n.endsWith('.swift')).map((n) => stripComments(fs.readFileSync(path.join(iosDir, n), 'utf8'))).join('\n')
    : '';
  if (!new RegExp(`class\\s+${IOS_SUBSCRIBER}\\s*:\\s*ExpoAppDelegateSubscriber`).test(swift)) problems.push(`Swift에 ${IOS_SUBSCRIBER} 구독자 클래스가 없다`);
  if (!/didFinishLaunchingWithOptions[\s\S]*?apply\(createMissing:\s*true\)/.test(swift)) problems.push('구독자가 실행 때 apply(createMissing: true)를 부르지 않는다');
  if (!/\.documentDirectory/.test(swift) || !new RegExp(`appendingPathComponent\\("${MMKV_DIR}"`).test(swift)) problems.push(`Swift가 <Documents>/${MMKV_DIR}를 보지 않는다`);
  const names = swift.match(/fileNames\s*=\s*\[([^\]]*)\]/)?.[1];
  const listed = names ? [...names.matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
  if (JSON.stringify(listed) !== JSON.stringify(SESSION_FILES)) problems.push(`Swift fileNames ${JSON.stringify(listed)} ≠ ${JSON.stringify(SESSION_FILES)}`);
  if (!/isExcludedFromBackup\s*=\s*true/.test(swift)) problems.push('Swift가 isExcludedFromBackup = true를 걸지 않는다');
  return problems;
}

const ATTRS = { fullBackupContent: 'android:fullBackupContent', dataExtractionRules: 'android:dataExtractionRules' };
const OURS = { fullBackupContent: FULL_BACKUP_RES, dataExtractionRules: DATA_EXTRACTION_RES };
/** 규칙 종류별로 세션 exclude가 있어야 하는 갈래 */
const SECTIONS = { fullBackupContent: ['full-backup-content'], dataExtractionRules: ['cloud-backup', 'device-transfer'] };
const RES_NAME = /^[a-z][a-z0-9_]*$/;
const HOW_TO_MERGE =
  '앱 백업 규칙의 주인은 이 플러그인 하나다 — 가드를 지우지 말고 ⓐ 상대 플러그인의 규칙 쓰기를 끄고(expo-secure-store는 configureAndroidBackup: false) 그 항목을 우리 XML에 옮기거나, ' +
  'ⓑ app.json 이 플러그인 props에 mergeWith: { fullBackupContent, dataExtractionRules } = 상대 res 이름을 적는다(플러그인 머리 주석)';

const xmlNoComments = (xml) => xml.replace(/<!--[\s\S]*?-->/g, '');
/** 한 갈래 본문(<tag …>…</tag>). 없으면 null, 자기 닫힘이면 '' */
function sectionBody(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  if (m) return m[2];
  return new RegExp(`<${tag}(\\s[^>]*)?/>`).test(xml) ? '' : null;
}
const hasExclude = (body, file) => new RegExp(`<exclude\\s+domain="file"\\s+path="(\\./)?${MMKV_DIR}/${file.replace(/\./g, '\\.')}"\\s*/>`).test(body);

/** 최종 규칙 파일이 세션을 빼는지 — 문제 목록(빈 배열 = 통과) */
function ruleProblems(kind, rawXml) {
  const xml = xmlNoComments(rawXml);
  const problems = [];
  for (const tag of SECTIONS[kind]) {
    const body = sectionBody(xml, tag);
    if (body === null) {
      problems.push(`<${tag}> 갈래가 없다(없으면 그 갈래는 전부 옮겨진다)`);
      continue;
    }
    if (/<include\b/.test(body)) problems.push(`<${tag}>에 include가 있다(그것만 백업 — 세이브가 빠질 수 있음)`);
    for (const f of SESSION_FILES) if (!hasExclude(body, f)) problems.push(`<${tag}>에 ${MMKV_DIR}/${f} exclude가 없다`);
  }
  return problems;
}

/** 상대 규칙 파일에 우리 exclude를 넣는다(mergeWith). include가 있으면 합치지 않고 멈춘다 */
function mergeRules(kind, rawXml) {
  if (/<include\b/.test(xmlNoComments(rawXml))) fail(`mergeWith 대상 규칙에 include가 있다 — 사람이 합친다. ${HOW_TO_MERGE}`);
  let xml = rawXml;
  const root = kind === 'fullBackupContent' ? 'full-backup-content' : 'data-extraction-rules';
  if (!new RegExp(`</${root}>`).test(xml)) fail(`mergeWith 대상이 <${root}>…</${root}> 모양이 아니다`);
  for (const tag of SECTIONS[kind]) {
    const body = sectionBody(xmlNoComments(xml), tag);
    const missing = SESSION_FILES.filter((f) => body === null || !hasExclude(body, f));
    if (!missing.length) continue;
    const lines = missing.map((f) => `    <exclude domain="file" path="${MMKV_DIR}/${f}" /><!-- C10b withSessionBackupExclusion -->`).join('\n');
    const close = (t, indent) => (x, add) => x.replace(new RegExp(`[ \\t]*</${t}>`), `${add}\n${indent}</${t}>`);
    if (tag === root) xml = close(root, '')(xml, lines.replace(/^ {4}/gm, '  '));
    else if (body === null) xml = close(root, '')(xml, `  <${tag}>\n${lines}\n  </${tag}>`);
    else if (new RegExp(`</${tag}>`).test(xml)) xml = close(tag, '  ')(xml, lines);
    else fail(`mergeWith 대상의 <${tag}/>가 자기 닫힘이다 — 사람이 합친다`);
  }
  return xml;
}

function readMergeWith(props) {
  const m = props.mergeWith ?? {};
  if (typeof m !== 'object' || Array.isArray(m)) fail('mergeWith는 { fullBackupContent?, dataExtractionRules? } 객체다');
  for (const [k, v] of Object.entries(m)) {
    if (!(k in ATTRS)) fail(`mergeWith에 모르는 칸 ${k}`);
    if (typeof v !== 'string' || !RES_NAME.test(v) || v === OURS[k]) fail(`mergeWith.${k}는 상대 res/xml 이름(소문자·숫자·_, 우리 이름 아님)이다`);
  }
  return m;
}

/** 정적 app.json(평가 전)에 표시가 손으로 적혀 있나. 정적 파일을 모르면 평가된 config로 본다 */
function handWrittenFlag(config) {
  const staticPath = config._internal?.staticConfigPath;
  if (staticPath && fs.existsSync(staticPath) && staticPath.endsWith('.json')) {
    const raw = JSON.parse(fs.readFileSync(staticPath, 'utf8'));
    return ((raw.expo ?? raw).extra ?? {})[EXTRA_KEY] !== undefined;
  }
  return !!config.extra && EXTRA_KEY in config.extra;
}

/** finalized: 디스크의 최종 Android 산출물을 검사(필요하면 mergeWith 대상에 합친 뒤) */
async function verifyAndroidOutput(platformProjectRoot, mergeWith) {
  const manifestPath = path.join(platformProjectRoot, 'app', 'src', 'main', 'AndroidManifest.xml');
  const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(manifestPath);
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest).$;
  if (app['android:allowBackup'] !== 'true') fail(`최종 AndroidManifest android:allowBackup = ${app['android:allowBackup']}(true여야 세이브가 백업된다)`);
  const xmlDir = path.join(platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
  for (const [kind, attr] of Object.entries(ATTRS)) {
    const ref = app[attr];
    const name = ref?.startsWith('@xml/') ? ref.slice(5) : null;
    if (name !== OURS[kind] && name !== mergeWith[kind]) {
      fail(`최종 AndroidManifest ${attr} = ${ref ?? '(없음)'} — 세션 제외 규칙이 걸리지 않았다(app.json에서 앞에 있는 플러그인이 덮었을 수 있음). ${HOW_TO_MERGE}`);
    }
    const file = path.join(xmlDir, `${name}.xml`);
    if (!fs.existsSync(file)) fail(`${attr}가 가리키는 res/xml/${name}.xml이 없다`);
    if (name === mergeWith[kind]) fs.writeFileSync(file, mergeRules(kind, fs.readFileSync(file, 'utf8')));
    const problems = ruleProblems(kind, fs.readFileSync(file, 'utf8'));
    if (problems.length) fail(`res/xml/${name}.xml이 세션을 빼지 않는다: ${problems.join(' / ')}. ${HOW_TO_MERGE}`);
  }
}

/** finalized: 디스크의 최종 Info.plist에 AppGroupIdentifier가 없는지(다른 플러그인의 mod로 들어온 경우까지 — 리뷰 L1) */
function verifyIosOutput(platformProjectRoot, projectName) {
  const plist = path.join(platformProjectRoot, projectName ?? '', 'Info.plist');
  if (!projectName || !fs.existsSync(plist)) fail(`최종 Info.plist를 찾지 못했다(${plist})`);
  if (/<key>\s*AppGroupIdentifier\s*<\/key>/.test(fs.readFileSync(plist, 'utf8'))) {
    fail('최종 Info.plist에 AppGroupIdentifier가 있다 — react-native-mmkv가 세션·세이브를 App Group 폴더로 옮겨 백업 제외 경로가 어긋난다');
  }
}

function withSessionBackupExclusion(config, props = {}) {
  const projectRoot = props.projectRoot ?? config._internal?.projectRoot ?? process.cwd();
  const mergeWith = readMergeWith(props);
  if (handWrittenFlag(config)) fail(`extra.${EXTRA_KEY}를 app.json에 직접 두지 않는다 — 이 플러그인만 쓴다`);
  if (config.android?.allowBackup === false) fail('android.allowBackup이 false다 — 세이브 백업까지 꺼진다(세션만 빼는 것이 C10b)');
  if (config.ios?.infoPlist && 'AppGroupIdentifier' in config.ios.infoPlist) {
    fail('ios.infoPlist.AppGroupIdentifier가 있으면 react-native-mmkv가 세션·세이브를 App Group 폴더로 옮겨 백업 제외 경로가 어긋난다(앱 App Group 이름은 MongAppGroup에)');
  }
  const problems = iosModuleProblems(projectRoot);
  if (problems.length) fail(`${MODULE_DIR}가 세션 백업 제외 계약과 다르다: ${problems.join(' / ')}`);

  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    if (app.$['android:allowBackup'] === 'false') fail('AndroidManifest android:allowBackup이 false다');
    app.$['android:allowBackup'] = 'true';
    for (const [kind, attr] of Object.entries(ATTRS)) {
      const had = app.$[attr];
      const ours = `@xml/${OURS[kind]}`;
      // 뒤에 등록된 플러그인이 먼저 걸어 둔 값: mergeWith로 지정한 상대면 그대로 두고(최종 단계에서 합침), 아니면 덮지 않고 멈춘다
      if (had !== undefined && had !== ours) {
        if (mergeWith[kind] && had === `@xml/${mergeWith[kind]}`) continue;
        fail(`${attr}가 이미 ${had}다. ${HOW_TO_MERGE}`);
      }
      app.$[attr] = ours;
    }
    return cfg;
  });
  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      const xmlDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, `${FULL_BACKUP_RES}.xml`), FULL_BACKUP_XML);
      fs.writeFileSync(path.join(xmlDir, `${DATA_EXTRACTION_RES}.xml`), DATA_EXTRACTION_XML);
      return cfg;
    },
  ]);
  // 리뷰 H1: 모든 mod가 파일을 쓴 뒤(finalized) 디스크의 최종 산출물을 검사한다 — 통과해야 prebuild가 끝난다
  config = withFinalizedMod(config, [
    'android',
    async (cfg) => {
      await verifyAndroidOutput(cfg.modRequest.platformProjectRoot, mergeWith);
      return cfg;
    },
  ]);
  config = withFinalizedMod(config, [
    'ios',
    (cfg) => {
      verifyIosOutput(cfg.modRequest.platformProjectRoot, cfg.modRequest.projectName);
      return cfg;
    },
  ]);
  // 표시: 가드를 모두 통과하고 mod(최종 검증 포함)를 붙인 뒤에만. 이 config로 바이너리를 만들려면 위 finalized 검증을 통과해야 한다
  config.extra = { ...config.extra, [EXTRA_KEY]: true };
  return config;
}

module.exports = withSessionBackupExclusion;
module.exports._test = {
  SESSION_STORE_ID,
  MMKV_DIR,
  SESSION_FILES,
  FULL_BACKUP_RES,
  DATA_EXTRACTION_RES,
  FULL_BACKUP_XML,
  DATA_EXTRACTION_XML,
  MODULE_DIR,
  EXTRA_KEY,
  iosModuleProblems,
  ruleProblems,
  mergeRules,
  verifyAndroidOutput,
  verifyIosOutput,
};
