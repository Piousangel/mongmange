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
const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');

const SESSION_STORE_ID = 'mong.session';
const MMKV_DIR = 'mmkv';
const SESSION_FILES = [SESSION_STORE_ID, `${SESSION_STORE_ID}.crc`];
const FULL_BACKUP_RES = 'mong_backup_rules';
const DATA_EXTRACTION_RES = 'mong_data_extraction_rules';
const MODULE_DIR = 'modules/session-backup';
const IOS_SUBSCRIBER = 'SessionBackupAppDelegateSubscriber';

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

function withSessionBackupExclusion(config, props = {}) {
  const projectRoot = props.projectRoot ?? config._internal?.projectRoot ?? process.cwd();
  if (config.android?.allowBackup === false) fail('android.allowBackup이 false다 — 세이브 백업까지 꺼진다(세션만 빼는 것이 C10b)');
  if (config.ios?.infoPlist && 'AppGroupIdentifier' in config.ios.infoPlist) {
    fail('ios.infoPlist.AppGroupIdentifier가 있으면 react-native-mmkv가 세션·세이브를 App Group 폴더로 옮겨 백업 제외 경로가 어긋난다(앱 App Group 이름은 MongAppGroup에)');
  }
  const problems = iosModuleProblems(projectRoot);
  if (problems.length) fail(`${MODULE_DIR}가 세션 백업 제외 계약과 다르다: ${problems.join(' / ')}`);

  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const want = { 'android:allowBackup': 'true', 'android:fullBackupContent': `@xml/${FULL_BACKUP_RES}`, 'android:dataExtractionRules': `@xml/${DATA_EXTRACTION_RES}` };
    for (const [k, v] of Object.entries(want)) {
      const had = app.$[k];
      // 다른 플러그인(예: expo-secure-store 백업 규칙)이 먼저 자기 규칙을 걸었으면 조용히 덮지 않고 멈춘다 — 규칙은 하나로 합쳐야 한다
      if (k !== 'android:allowBackup' && had !== undefined && had !== v) fail(`${k}가 이미 ${had}다 — 규칙 파일을 하나로 합친 뒤 넣는다`);
      if (k === 'android:allowBackup' && had === 'false') fail('AndroidManifest android:allowBackup이 false다');
      app.$[k] = v;
    }
    return cfg;
  });
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const xmlDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, `${FULL_BACKUP_RES}.xml`), FULL_BACKUP_XML);
      fs.writeFileSync(path.join(xmlDir, `${DATA_EXTRACTION_RES}.xml`), DATA_EXTRACTION_XML);
      return cfg;
    },
  ]);
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
  iosModuleProblems,
};
