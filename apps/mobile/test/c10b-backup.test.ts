// 로그인 세션 저장소 OS 백업 제외 고정(C10b, DECISIONS 'C10b'). 바이너리에 박히는 설정이라 동결(12-19) 전에 검사로 묶는다:
// 세션 파일 경로 계약(`mong.session` → mmkv/mong.session·.crc)이 Android 규칙 XML·iOS 모듈·C11 sessionStore 사이에서 어긋나거나,
// 규칙이 include로 세이브를 빼 버리거나, 한 갈래(클라우드·기기 이전)가 빠지거나, iOS 구독자가 등록되지 않으면 실패.
// prebuild 실제 결과(AndroidManifest·res/xml·자동 링크)는 DECISIONS C10b 증거 줄(새 임시 폴더 `expo prebuild --clean`)에 적었다.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Config = { extra?: Record<string, unknown>; _internal?: { projectRoot: string; staticConfigPath?: string }; android?: { allowBackup?: boolean }; ios?: { infoPlist?: Record<string, unknown> }; plugins?: unknown[] };
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
  EXTRA_KEY: string;
  iosModuleProblems: (root: string) => string[];
  ruleProblems: (kind: 'fullBackupContent' | 'dataExtractionRules', xml: string) => string[];
  mergeRules: (kind: 'fullBackupContent' | 'dataExtractionRules', xml: string) => string;
  verifyIosOutput: (platformProjectRoot: string, projectName?: string) => void;
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

describe('바이너리 표시 extra.mongSessionBackupExcluded — C11 nativeFlags가 정확히 true만 믿는다', () => {
  it('키 이름은 C11 SESSION_BACKUP_EXCLUDED_EXTRA_KEY와 같다', () => {
    expect(t.EXTRA_KEY).toBe('mongSessionBackupExcluded');
  });
  it('플러그인이 성공하면 true(불리언) — 다른 extra 값은 그대로', () => {
    const out = plugin(fresh());
    expect(out.extra?.[t.EXTRA_KEY]).toBe(true);
    expect(out.extra?.eas).toEqual(app.extra?.eas);
  });
  it('플러그인이 빠지면 없다: app.json 원본에도 없다(손으로 적으면 플러그인이 멈춘다)', () => {
    expect(app.extra ?? {}).not.toHaveProperty(t.EXTRA_KEY);
    expect(() => plugin(fresh({ extra: { ...app.extra, [t.EXTRA_KEY]: true } }))).toThrow(/직접 두지 않는다/);
  });
  it('가드에 걸리면(Android·iOS 어느 쪽이든) 값을 쓰지 않고 멈춘다 — 넘긴 config에도 남지 않는다', () => {
    const bad: Array<[string, Config]> = [
      ['android', fresh({ android: { ...app.android, allowBackup: false } })],
      ['ios', fresh({ ios: { ...app.ios, infoPlist: { ...app.ios?.infoPlist, AppGroupIdentifier: 'group.x' } } })],
      ['module', { ...fresh(), _internal: { projectRoot: mkdtempSync(join(tmpdir(), 'mong-c10b-')) } }],
    ];
    for (const [name, c] of bad) {
      expect(() => plugin(c), name).toThrow();
      expect(c.extra ?? {}, name).not.toHaveProperty(t.EXTRA_KEY);
    }
  });
  it('실제 app config(expo getConfig, 모든 플러그인 적용) = expo-constants가 받는 값에 true가 들어 있다', () => {
    const { getConfig } = req(req.resolve('@expo/config', { paths: [req.resolve('expo/package.json')] })) as {
      getConfig: (root: string, o: object) => { exp: Config };
    };
    expect(getConfig(root, { skipSDKVersionRequirement: true }).exp.extra?.[t.EXTRA_KEY]).toBe(true);
  });
});

describe('최종 산출물 검증(리뷰 H1) — 실제 mod 컴파일(compileModsAsync)로 플러그인 순서를 재현', () => {
  type Plugin = (c: Config) => Config;
  const cp = req(req.resolve('expo/config-plugins')) as {
    compileModsAsync: (c: Config, o: object) => Promise<Config>;
    withAndroidManifest: (c: Config, a: (x: { modResults: Manifest }) => unknown) => Config;
    withDangerousMod: (c: Config, a: [string, (x: { modRequest: { platformProjectRoot: string } }) => unknown]) => Config;
  };
  /** 다른 백업 규칙을 거는 플러그인(리뷰어 사본 실험과 같은 모양: 두 속성을 자기 xml로) */
  const ruleHog = (full: string, data: string, body = '<exclude domain="sharedpref" path="SECURESTORE"/>'): Plugin => (c) => {
    c = cp.withAndroidManifest(c, (x) => {
      const a = x.modResults.manifest.application[0]!.$;
      a['android:fullBackupContent'] = `@xml/${full}`;
      a['android:dataExtractionRules'] = `@xml/${data}`;
      return x;
    });
    return cp.withDangerousMod(c, [
      'android',
      (x) => {
        const dir = join(x.modRequest.platformProjectRoot, 'app/src/main/res/xml');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${full}.xml`), `<?xml version="1.0" encoding="utf-8"?>\n<full-backup-content>\n  ${body}\n</full-backup-content>\n`);
        writeFileSync(
          join(dir, `${data}.xml`),
          `<?xml version="1.0" encoding="utf-8"?>\n<data-extraction-rules>\n  <cloud-backup>\n    ${body}\n  </cloud-backup>\n  <device-transfer>\n    ${body}\n  </device-transfer>\n</data-extraction-rules>\n`,
        );
        return x;
      },
    ]);
  };
  const ours = (props: Record<string, unknown> = {}): Plugin => (c) => plugin(c, props);
  /** plugins 배열 순서대로 적용(= app.json 순서) 후 Android mod 컴파일. 돌려준 값: 임시 프로젝트 폴더 */
  const prebuild = async (plugins: Plugin[]) => {
    const dir = mkdtempSync(join(tmpdir(), 'mong-c10b-mods-'));
    mkdirSync(join(dir, 'android/app/src/main'), { recursive: true });
    writeFileSync(
      join(dir, 'android/app/src/main/AndroidManifest.xml'),
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n  <application android:name=".MainApplication" android:allowBackup="true"/>\n</manifest>\n',
    );
    let c: Config = { ...structuredClone(app), _internal: { projectRoot: root } };
    for (const p of plugins) c = p(c);
    await cp.compileModsAsync(c, { projectRoot: dir, platforms: ['android'], assertMissingModProviders: false });
    return dir;
  };
  const manifestOf = (dir: string) => readFileSync(join(dir, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const xmlOf = (dir: string, name: string) => readFileSync(join(dir, `android/app/src/main/res/xml/${name}.xml`), 'utf8');

  it('우리 플러그인만: 최종 매니페스트가 우리 규칙을 가리키고 검증 통과', async () => {
    const dir = await prebuild([ours()]);
    expect(manifestOf(dir)).toMatch(/android:fullBackupContent="@xml\/mong_backup_rules"/);
    expect(manifestOf(dir)).toMatch(/android:dataExtractionRules="@xml\/mong_data_extraction_rules"/);
  });
  it('규칙 플러그인이 app.json에서 **앞에** 있으면(그 mod가 나중에 돌아 우리 값을 덮음) prebuild가 멈춘다 — 리뷰어 실측 재현', async () => {
    await expect(prebuild([ruleHog('other_backup', 'other_rules'), ours()])).rejects.toThrow(/최종 AndroidManifest android:fullBackupContent = @xml\/other_backup/);
  });
  it('규칙 플러그인이 **뒤에** 있으면(그 mod가 먼저 돎) 우리 매니페스트 mod가 덮지 않고 멈춘다', async () => {
    await expect(prebuild([ours(), ruleHog('other_backup', 'other_rules')])).rejects.toThrow(/이미 @xml\/other_backup/);
  });
  it('앞에 있는 플러그인이 우리 규칙 파일 내용을 덮어써도(dangerous mod가 나중에 돎) 최종 내용 검사로 멈춘다', async () => {
    const clobber: Plugin = (c) =>
      cp.withDangerousMod(c, [
        'android',
        (x) => {
          const dir = join(x.modRequest.platformProjectRoot, 'app/src/main/res/xml');
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, 'mong_data_extraction_rules.xml'), '<data-extraction-rules>\n  <cloud-backup>\n  </cloud-backup>\n</data-extraction-rules>\n');
          return x;
        },
      ]);
    await expect(prebuild([clobber, ours()])).rejects.toThrow(/mong_data_extraction_rules\.xml이 세션을 빼지 않는다/);
  });
  it('mergeWith(expo-secure-store 모양): 앞·뒤 어느 순서든 상대 파일에 세션 exclude를 합쳐 통과, 상대 exclude는 남는다', async () => {
    const mw = { mergeWith: { fullBackupContent: 'secure_store_backup_rules', dataExtractionRules: 'secure_store_data_extraction_rules' } };
    for (const order of ['앞', '뒤']) {
      const hog = ruleHog('secure_store_backup_rules', 'secure_store_data_extraction_rules');
      const dir = await prebuild(order === '앞' ? [hog, ours(mw)] : [ours(mw), hog]);
      expect(manifestOf(dir), order).toMatch(/android:dataExtractionRules="@xml\/secure_store_data_extraction_rules"/);
      const data = xmlOf(dir, 'secure_store_data_extraction_rules');
      expect(t.ruleProblems('dataExtractionRules', data), order).toEqual([]);
      expect(t.ruleProblems('fullBackupContent', xmlOf(dir, 'secure_store_backup_rules')), order).toEqual([]);
      expect(data.match(/SECURESTORE/g), order).toHaveLength(2);
    }
  });
  it('mergeWith 대상에 include가 있으면 합치지 않고 멈춘다(그것만 백업 → 세이브가 빠질 수 있음)', async () => {
    const mw = { mergeWith: { fullBackupContent: 'inc_backup', dataExtractionRules: 'inc_rules' } };
    await expect(prebuild([ruleHog('inc_backup', 'inc_rules', '<include domain="sharedpref" path="."/>'), ours(mw)])).rejects.toThrow(/mergeWith 대상 규칙에 include가 있다/);
  });
  it('mergeWith 값 검사: 모르는 칸·우리 이름·이상한 res 이름이면 멈춘다', () => {
    expect(() => plugin(fresh(), { mergeWith: { foo: 'x' } })).toThrow(/모르는 칸/);
    expect(() => plugin(fresh(), { mergeWith: { fullBackupContent: 'mong_backup_rules' } })).toThrow(/우리 이름 아님/);
    expect(() => plugin(fresh(), { mergeWith: { dataExtractionRules: '@xml/Foo' } })).toThrow(/res\/xml 이름/);
  });
  it('규칙 검사: 갈래가 빠졌거나 exclude 하나가 빠졌거나 include가 있으면 문제', () => {
    expect(t.ruleProblems('dataExtractionRules', t.DATA_EXTRACTION_XML.replace(/<device-transfer>[\s\S]*<\/device-transfer>/, ''))).toEqual([expect.stringMatching(/device-transfer> 갈래가 없다/)]);
    expect(t.ruleProblems('fullBackupContent', t.FULL_BACKUP_XML.replace(/.*mong\.session\.crc.*\n/, ''))).toEqual([expect.stringMatching(/mong\.session\.crc exclude가 없다/)]);
    expect(t.ruleProblems('fullBackupContent', t.FULL_BACKUP_XML.replace('</full-backup-content>', '<include domain="file" path="."/></full-backup-content>'))).toEqual([expect.stringMatching(/include/)]);
    // 주석 속 exclude는 치지 않는다
    expect(t.ruleProblems('fullBackupContent', t.FULL_BACKUP_XML.replace(/(<exclude[^>]*mong\.session"[^>]*>)/, '<!-- $1 -->'))).toHaveLength(1);
  });
  it('mergeRules는 멱등(두 번 합쳐도 같은 결과)', () => {
    const once = t.mergeRules('dataExtractionRules', '<data-extraction-rules>\n  <cloud-backup>\n  </cloud-backup>\n</data-extraction-rules>\n');
    expect(t.mergeRules('dataExtractionRules', once)).toBe(once);
    expect(t.ruleProblems('dataExtractionRules', once)).toEqual([]);
  });
  it('iOS 최종 Info.plist에 AppGroupIdentifier가 있으면(다른 플러그인의 mod로 들어와도) 멈춘다 — 리뷰 L1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mong-c10b-ios-'));
    mkdirSync(join(dir, 'App'));
    writeFileSync(join(dir, 'App/Info.plist'), '<plist><dict><key>MongAppGroup</key><string>group.x</string></dict></plist>');
    expect(() => t.verifyIosOutput(dir, 'App')).not.toThrow();
    writeFileSync(join(dir, 'App/Info.plist'), '<plist><dict><key>AppGroupIdentifier</key><string>group.x</string></dict></plist>');
    expect(() => t.verifyIosOutput(dir, 'App')).toThrow(/AppGroupIdentifier/);
    expect(() => t.verifyIosOutput(dir, undefined)).toThrow(/찾지 못했다/);
  });
});

describe('리뷰 L2·L3', () => {
  it('L2 멱등: 이미 적용된 config에 다시 적용해도 멈추지 않는다(정적 app.json에 손으로 적은 값만 본다)', () => {
    const withStatic = (staticConfigPath: string) => ({ ...fresh(), _internal: { projectRoot: root, staticConfigPath } }) as Config;
    const once = plugin(withStatic(join(root, 'app.json')));
    expect(() => plugin({ ...once, _internal: { projectRoot: root, staticConfigPath: join(root, 'app.json') } } as Config)).not.toThrow();
    const dir = mkdtempSync(join(tmpdir(), 'mong-c10b-'));
    writeFileSync(join(dir, 'app.json'), JSON.stringify({ expo: { ...app, extra: { ...app.extra, [t.EXTRA_KEY]: true } } }));
    expect(() => plugin(withStatic(join(dir, 'app.json')))).toThrow(/직접 두지 않는다/);
  });
  it('L3: src 어디서도 MMKV 파일을 지우지 않는다(removeStorage 금지 — 세션은 키 삭제·clearAll로만 비운다)', () => {
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.tsx?$/.test(e.name) ? [join(d, e.name)] : []));
    for (const f of walk(join(root, 'src'))) expect(readFileSync(f, 'utf8'), f).not.toMatch(/\.removeStorage\s*\(/);
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
