// 로그인 세션 저장소 OS 백업 제외 고정(C10b, DECISIONS 'C10b'). 바이너리에 박히는 설정이라 동결(12-19) 전에 검사로 묶는다:
// 세션 파일 경로 계약(`mong.session` → mmkv/mong.session·.crc)이 Android 규칙 XML·iOS 모듈·C11 sessionStore 사이에서 어긋나거나,
// 규칙이 include로 세이브를 빼 버리거나, 한 갈래(클라우드·기기 이전)가 빠지거나, iOS 구독자가 등록되지 않으면 실패.
// prebuild 실제 결과(AndroidManifest·res/xml·자동 링크)는 DECISIONS C10b 증거 줄(새 임시 폴더 `expo prebuild --clean`)에 적었다.
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Config = { android?: { allowBackup?: boolean }; ios?: { infoPlist?: Record<string, unknown> }; plugins?: unknown[]; _internal?: { projectRoot: string } };
type Manifest = { manifest: { application: Array<{ $: Record<string, string> }> } };
type ModFn = (c: Record<string, unknown>) => Promise<{ modResults: unknown }>;
type Mods = { mods?: { android?: { manifest?: ModFn; dangerous?: ModFn } } };
type T = {
  SESSION_STORE_ID: string;
  MMKV_DIR: string;
  SESSION_FILES: string[];
  FULL_BACKUP_RES: string;
  DATA_EXTRACTION_RES: string;
  FULL_BACKUP_XML: string;
  DATA_EXTRACTION_XML: string;
  MODULE_DIR: string;
  iosModuleProblems: (root: string) => string[];
};

const root = join(__dirname, '..');
const app = (JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')) as { expo: Config }).expo;
const req = createRequire(import.meta.url);
const plugin = req('../plugins/withSessionBackupExclusion.js') as ((c: Config, p?: Record<string, unknown>) => Config & Mods) & { _test: T };
const t = plugin._test;
const PLUGIN = './plugins/withSessionBackupExclusion';
const swiftPath = join(root, t.MODULE_DIR, 'ios', 'SessionBackupModule.swift');
const swift = readFileSync(swiftPath, 'utf8');

/** <exclude>/<include> 줄을 (갈래, 종류, 도메인, 경로)로 */
const rules = (xml: string) => {
  const out: Array<{ section: string; kind: string; domain: string; path: string }> = [];
  let section = 'full-backup-content';
  for (const line of xml.split('\n')) {
    const s = line.match(/<(cloud-backup|device-transfer|cross-platform-transfer)\b/);
    if (s) section = s[1]!;
    const r = line.match(/<(include|exclude)\s+domain="([^"]+)"\s+path="([^"]+)"/);
    if (r) out.push({ section, kind: r[1]!, domain: r[2]!, path: r[3]! });
  }
  return out;
};
const sessionPaths = ['mmkv/mong.session', 'mmkv/mong.session.crc'];

const baseManifest = (): Manifest => ({ manifest: { application: [{ $: { 'android:name': '.MainApplication', 'android:allowBackup': 'true' } }] } });
const runManifest = async (out: Config & Mods, m = baseManifest()) => {
  const r = await out.mods!.android!.manifest!({ ...out, modResults: m, modRequest: { projectRoot: root, platformProjectRoot: root, platform: 'android', modName: 'manifest', introspect: true } });
  return (r.modResults as Manifest).manifest.application[0]!.$;
};
const fresh = (extra: Partial<Config> = {}) => ({ ...structuredClone(app), ...extra, _internal: { projectRoot: root } });

describe('세션 파일 경로 계약 — 한 곳(플러그인)에서 정하고 세 곳이 따른다', () => {
  it('세션 = MMKV id mong.session, 파일은 <MMKV 기본 폴더>/mmkv/ 아래 두 개(본 파일 + .crc)', () => {
    expect(t.SESSION_STORE_ID).toBe('mong.session');
    expect(t.MMKV_DIR).toBe('mmkv');
    expect(t.SESSION_FILES).toEqual(['mong.session', 'mong.session.crc']);
  });
  it('react-native-mmkv 기본 폴더가 계약과 같다(Android filesDir/mmkv, iOS Documents/mmkv, iOS는 AppGroupIdentifier가 있으면 옮겨 감)', () => {
    const mmkv = join(req.resolve('react-native-mmkv/package.json'), '..');
    const kt = readFileSync(join(mmkv, 'android/src/main/java/com/margelo/nitro/mmkv/HybridMMKVPlatformContext.kt'), 'utf8');
    expect(kt).toMatch(/context\.filesDir\.absolutePath \+ "\/mmkv"/);
    const sw = readFileSync(join(mmkv, 'ios/HybridMMKVPlatformContext.swift'), 'utf8');
    expect(sw).toMatch(/return \.documentDirectory/);
    expect(sw).toMatch(/appendingPathComponent\("mmkv"/);
    expect(sw).toMatch(/forInfoDictionaryKey: "AppGroupIdentifier"/);
  });
  it('세이브(mong)·위젯 값(mong.widget)은 세션과 다른 id — 규칙이 세이브를 건드리지 않는다', () => {
    expect(readFileSync(join(root, 'src/game/storage.ts'), 'utf8')).toMatch(/createMMKV\(\{ id: 'mong' \}\)/);
    const all = [...rules(t.FULL_BACKUP_XML), ...rules(t.DATA_EXTRACTION_XML)];
    expect(new Set(all.map((r) => r.path))).toEqual(new Set(sessionPaths));
  });
  // C11(feat/c11-net)이 합쳐지면 이 시험이 켜진다 — 그 전에는 건너뜀으로 보인다
  const sessionStore = join(root, 'src/net/sessionStore.ts');
  it.skipIf(!existsSync(sessionStore))('C11 sessionStore: createMMKV({ id: mong.session })에 path·App Group 없음', () => {
    const src = readFileSync(sessionStore, 'utf8').replace(/\/\/.*$/gm, '');
    const calls = [...src.matchAll(/createMMKV\(\s*\{([^}]*)\}\s*\)/g)].map((m) => m[1]!);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/id:\s*'mong\.session'/);
    expect(calls[0]).not.toMatch(/\bpath\b/);
  });
  it('src 어디서도 mong.session을 다른 path로 열지 않는다', () => {
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.tsx?$/.test(e.name) ? [join(d, e.name)] : []));
    for (const f of walk(join(root, 'src'))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/createMMKV\(\s*\{([^}]*)\}\s*\)/g)) if (/mong\.session/.test(m[1]!)) expect(m[1], f).not.toMatch(/\bpath\b/);
    }
  });
});

describe('app.json', () => {
  it('플러그인이 등록돼 있다', () => {
    expect(app.plugins).toContain(PLUGIN);
  });
  it('allowBackup을 끄지 않는다(세이브는 백업에 남는다), Info.plist에 AppGroupIdentifier 없음', () => {
    expect(app.android?.allowBackup).not.toBe(false);
    expect(Object.keys(app.ios?.infoPlist ?? {})).not.toContain('AppGroupIdentifier');
  });
});

describe('Android 백업 규칙 XML', () => {
  it('API 30 이하(fullBackupContent): 세션 두 파일 exclude만, include 0', () => {
    expect(rules(t.FULL_BACKUP_XML)).toEqual(sessionPaths.map((path) => ({ section: 'full-backup-content', kind: 'exclude', domain: 'file', path })));
    expect(t.FULL_BACKUP_XML).toMatch(/<full-backup-content>[\s\S]*<\/full-backup-content>/);
  });
  it('API 31 이상(dataExtractionRules): 클라우드 백업 + 기기 간 이전 두 갈래 모두 같은 exclude, include 0', () => {
    const r = rules(t.DATA_EXTRACTION_XML);
    for (const section of ['cloud-backup', 'device-transfer']) {
      expect(r.filter((x) => x.section === section)).toEqual(sessionPaths.map((path) => ({ section, kind: 'exclude', domain: 'file', path })));
    }
    expect(r.filter((x) => x.kind === 'include')).toEqual([]);
    expect(t.DATA_EXTRACTION_XML).not.toMatch(/disableIfNoEncryptionCapabilities="true"/);
  });
});

describe('withSessionBackupExclusion mod 출력', () => {
  it('AndroidManifest application: allowBackup true + 두 규칙 파일 참조', async () => {
    const a = await runManifest(plugin(fresh()));
    expect(a['android:allowBackup']).toBe('true');
    expect(a['android:fullBackupContent']).toBe('@xml/mong_backup_rules');
    expect(a['android:dataExtractionRules']).toBe('@xml/mong_data_extraction_rules');
  });
  it('res/xml 두 파일을 쓴다(내용 = 위 XML)', async () => {
    const out = plugin(fresh());
    const dir = mkdtempSync(join(tmpdir(), 'mong-c10b-'));
    await out.mods!.android!.dangerous!({ ...out, modResults: {}, modRequest: { projectRoot: root, platformProjectRoot: dir, platform: 'android', modName: 'dangerous', introspect: false } });
    expect(readFileSync(join(dir, 'app/src/main/res/xml/mong_backup_rules.xml'), 'utf8')).toBe(t.FULL_BACKUP_XML);
    expect(readFileSync(join(dir, 'app/src/main/res/xml/mong_data_extraction_rules.xml'), 'utf8')).toBe(t.DATA_EXTRACTION_XML);
  });
  it('다른 규칙이 이미 걸려 있으면 덮지 않고 멈춘다, manifest allowBackup false도 멈춘다', async () => {
    const m = baseManifest();
    m.manifest.application[0]!.$['android:dataExtractionRules'] = '@xml/secure_store_data_extraction_rules';
    await expect(runManifest(plugin(fresh()), m)).rejects.toThrow(/dataExtractionRules가 이미/);
    const off = baseManifest();
    off.manifest.application[0]!.$['android:allowBackup'] = 'false';
    await expect(runManifest(plugin(fresh()), off)).rejects.toThrow(/allowBackup/);
  });
  it('config 가드: android.allowBackup false · ios.infoPlist.AppGroupIdentifier면 prebuild가 멈춘다', () => {
    expect(() => plugin(fresh({ android: { ...app.android, allowBackup: false } }))).toThrow(/allowBackup/);
    expect(() => plugin(fresh({ ios: { ...app.ios, infoPlist: { ...app.ios?.infoPlist, AppGroupIdentifier: 'group.x' } } }))).toThrow(/AppGroupIdentifier/);
  });
});

describe('iOS 로컬 모듈 modules/session-backup', () => {
  const copyModule = (edit?: (swift: string, cfg: string) => [string, string]) => {
    const dir = mkdtempSync(join(tmpdir(), 'mong-c10b-'));
    cpSync(join(root, t.MODULE_DIR), join(dir, t.MODULE_DIR), { recursive: true });
    if (edit) {
      const cfgPath = join(dir, t.MODULE_DIR, 'expo-module.config.json');
      const sp = join(dir, t.MODULE_DIR, 'ios', 'SessionBackupModule.swift');
      const [s, c] = edit(readFileSync(sp, 'utf8'), readFileSync(cfgPath, 'utf8'));
      writeFileSync(sp, s);
      writeFileSync(cfgPath, c);
    }
    return dir;
  };
  it('지금 모듈은 계약을 지킨다(문제 0) — AppDelegate 구독자 등록, 실행 때 apply(createMissing: true)', () => {
    expect(t.iosModuleProblems(root)).toEqual([]);
    const cfg = JSON.parse(readFileSync(join(root, t.MODULE_DIR, 'expo-module.config.json'), 'utf8')) as { platforms: string[]; apple: { appDelegateSubscribers: string[] } };
    expect(cfg.platforms).toEqual(['apple']);
    expect(cfg.apple.appDelegateSubscribers).toEqual(['SessionBackupAppDelegateSubscriber']);
  });
  it('Swift: 둘 다 없을 때만 빈 파일을 만든다(.crc 하나만 새로 만들어 데이터를 깨진 것으로 보이게 하지 않음)', () => {
    expect(swift).toMatch(/let noneExists = urls\.allSatisfy \{ !fm\.fileExists\(atPath: \$0\.path\) \}/);
    expect(swift).toMatch(/if createMissing && noneExists \{/);
    expect(swift).toMatch(/Function\("status"\)[\s\S]*apply\(createMissing: false\)/);
  });
  it('파일 이름이 어긋나거나 구독자가 빠지면 prebuild가 멈춘다', () => {
    const renamed = copyModule((s, c) => [s.replace('"mong.session.crc"', '"mong.session.CRC"'), c]);
    expect(() => plugin({ ...fresh(), _internal: { projectRoot: renamed } })).toThrow(/fileNames/);
    const noSub = copyModule((s, c) => [s, c.replace(/"appDelegateSubscribers": \[[^\]]*\]/, '"appDelegateSubscribers": []')]);
    expect(() => plugin({ ...fresh(), _internal: { projectRoot: noSub } })).toThrow(/appDelegateSubscribers/);
    const commented = copyModule((s, c) => [s.replace('values.isExcludedFromBackup = true', '// values.isExcludedFromBackup = true'), c]);
    expect(() => plugin({ ...fresh(), _internal: { projectRoot: commented } })).toThrow(/isExcludedFromBackup/);
    expect(() => plugin({ ...fresh(), _internal: { projectRoot: mkdtempSync(join(tmpdir(), 'mong-c10b-')) } })).toThrow(/expo-module\.config\.json이 없다/);
  });
});
