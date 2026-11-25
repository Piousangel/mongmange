// 빌드 2 네이티브 묶음 고정(C10, DECISIONS 'C10 빌드 2 네이티브 묶음'). 바이너리에 박히는 값이라 동결(12-19) 전에 검사로 묶는다:
// 앱 링크 범위가 web-static AASA·assetlinks와 어긋나거나, 출시 빌드에 키 자리가 빈 채 나가거나, 위젯 App Group·키가 네이티브 세 곳에서
// 갈리거나, 필기 인식 스위치를 켰는데 모듈 계약이 안 맞으면 실패.
// prebuild 실제 결과(Info.plist·entitlements·AndroidManifest)는 DECISIONS C10 증거 줄(임시 폴더 `expo prebuild --clean`)에 적었다.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANDROID_WIDGET_NAME, WIDGET_APP_GROUP, WIDGET_VALUE_KEY } from '../src/widget/contract';

type IntentFilter = { action?: string; autoVerify?: boolean; data?: Array<Record<string, string>>; category?: string[] };
type Config = {
  ios?: { bundleIdentifier?: string; associatedDomains?: string[]; entitlements?: Record<string, unknown>; infoPlist?: Record<string, unknown>; appleTeamId?: string };
  android?: { package?: string; intentFilters?: IntentFilter[] };
  plugins?: unknown[];
};
const root = join(__dirname, '..');
const repo = join(root, '..', '..');
const app = (JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')) as { expo: Config }).expo;
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string>; expo?: { autolinking?: { exclude?: string[] } } };
const req = createRequire(import.meta.url);
type LinkProps = { appleTeamId?: string; androidCertSha256?: string[]; env?: Record<string, string> };
const withAppLinks = req('../plugins/withAppLinks.js') as (c: Config, p?: LinkProps) => Config;
type ModFn = (c: Record<string, unknown>) => Promise<{ modResults: unknown }>;
type Mods = { mods?: { android?: { gradleProperties?: ModFn }; ios?: { podfileProperties?: ModFn } } };
const withInk = req('../plugins/withInkRecognizer.js') as ((c: Config, p?: Record<string, unknown>) => Config & Mods) & {
  _test: { contractProblems: (root: string) => string[] | null; KEY: string };
};
const fpConfig = req('../fingerprint.config.js') as { extraSources: Array<{ type: string; filePath: string }>; ignorePaths: string[] };
const pluginEntry = (name: string) => app.plugins?.find((p) => (Array.isArray(p) ? p[0] : p) === name);
const pluginProps = (name: string) => (pluginEntry(name) as [string, Record<string, unknown>] | undefined)?.[1];
const pluginIndex = (name: string) => app.plugins?.findIndex((p) => (Array.isArray(p) ? p[0] : p) === name) ?? -1;

// 형식만 맞는 가짜 값(자리표시자 거름을 통과하는 무작위 모양)
const TEAM = 'Q7H2K9M4TZ';
const FP1 = 'A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90:12:34:56:78:9A:BC:DE:F0:13:57:9B:DF:24:68:AC:E0';
const FP2 = '5E:2D:91:C4:07:B8:6A:F3:30:1F:E9:82:4D:76:AB:C1:9E:08:53:FA:62:17:D0:3B:8C:45:E7:29:B6:0A:71:D8';
const easEnv = (profile: string, platform?: string) => ({ EAS_BUILD: 'true', EAS_BUILD_PROFILE: profile, ...(platform ? { EAS_BUILD_PLATFORM: platform } : {}) });

describe('앱 링크 = web-static AASA·assetlinks와 같은 범위', () => {
  const aasa = JSON.parse(readFileSync(join(repo, 'apps/web-static/src/.well-known/apple-app-site-association'), 'utf8')) as {
    applinks: { details: Array<{ appIDs: string[]; components: Array<{ '/': string }> }> };
  };
  const assetlinks = readFileSync(join(repo, 'apps/web-static/src/.well-known/assetlinks.json'), 'utf8');

  it('iOS associatedDomains = applinks:mongmang.ink 하나, AASA 경로 /m/* 하나', () => {
    expect(app.ios?.associatedDomains).toEqual(['applinks:mongmang.ink']);
    expect(aasa.applinks.details.flatMap((d) => d.components.map((c) => c['/']))).toEqual(['/m/*']);
    expect(aasa.applinks.details[0]!.appIDs).toEqual(['{{APPLE_TEAM_ID}}.{{IOS_BUNDLE_ID}}']);
  });
  it('Android intentFilter = autoVerify https://mongmang.ink/m/ 하나(AASA /m/*와 같은 범위), assetlinks는 handle_all_urls', () => {
    expect(app.android?.intentFilters).toEqual([
      { action: 'VIEW', autoVerify: true, data: [{ scheme: 'https', host: 'mongmang.ink', pathPrefix: '/m/' }], category: ['BROWSABLE', 'DEFAULT'] },
    ]);
    expect(assetlinks).toContain('delegate_permission/common.handle_all_urls');
    expect(assetlinks).toContain('{{ANDROID_PACKAGE}}');
  });
  it('키 자리는 app.json withAppLinks props(비어 있음 = 오너 몫), apple-targets보다 앞', () => {
    expect(pluginProps('./plugins/withAppLinks')).toEqual({ appleTeamId: '', androidCertSha256: [] });
    expect(pluginIndex('./plugins/withAppLinks')).toBeGreaterThanOrEqual(0);
    expect(pluginIndex('./plugins/withAppLinks')).toBeLessThan(pluginIndex('@bacons/apple-targets'));
  });
});

describe('withAppLinks 가드', () => {
  it('개발 빌드·로컬은 키가 비어도 통과(앱 링크 검증만 안 됨)', () => {
    for (const env of [{}, easEnv('development', 'ios'), easEnv('development', 'android')]) {
      expect(() => withAppLinks(app, { appleTeamId: '', androidCertSha256: [], env })).not.toThrow();
    }
  });
  it('EAS 출시 빌드: 그 플랫폼 키가 비면 멈춘다(iOS = 팀 ID, Android = 지문)', () => {
    expect(() => withAppLinks(app, { appleTeamId: '', androidCertSha256: [FP1, FP2], env: easEnv('production', 'ios') })).toThrow(/appleTeamId가 비어/);
    expect(() => withAppLinks(app, { appleTeamId: TEAM, androidCertSha256: [], env: easEnv('preview', 'android') })).toThrow(/androidCertSha256이 비어/);
    // 플랫폼을 모르면 둘 다 본다
    expect(() => withAppLinks(app, { appleTeamId: TEAM, androidCertSha256: [], env: easEnv('preview') })).toThrow(/androidCertSha256/);
    // 다른 플랫폼 키는 보지 않는다
    expect(() => withAppLinks(app, { appleTeamId: '', androidCertSha256: [FP1], env: easEnv('preview', 'android') })).not.toThrow();
  });
  it('production Android는 지문 2개(EAS 업로드 키 + Play 앱 서명 키), preview는 1개로 통과', () => {
    expect(() => withAppLinks(app, { androidCertSha256: [FP1], env: easEnv('production', 'android') })).toThrow(/2개 이상/);
    expect(() => withAppLinks(app, { androidCertSha256: [FP1, FP1], env: easEnv('production', 'android') })).toThrow(/두 번/);
    expect(() => withAppLinks(app, { androidCertSha256: [FP1, FP2], env: easEnv('production', 'android') })).not.toThrow();
    expect(() => withAppLinks(app, { androidCertSha256: [FP1], env: easEnv('preview', 'android') })).not.toThrow();
  });
  it('지문은 대소문자를 가리지 않는다(keytool 소문자 출력 그대로 붙여도 통과, 같은 지문의 대·소문자는 한 개로)', () => {
    expect(() => withAppLinks(app, { androidCertSha256: [FP1.toLowerCase(), FP2.toLowerCase()], env: easEnv('production', 'android') })).not.toThrow();
    expect(() => withAppLinks(app, { androidCertSha256: [FP1, FP1.toLowerCase()], env: easEnv('production', 'android') })).toThrow(/두 번/);
  });
  it('자리표시자·형식 틀린 값은 거른다(web-static과 같은 규칙)', () => {
    for (const team of ['XXXXXXXXXX', 'ABCDEFGHIJ', 'abc1234567', 'TEAMID1234']) {
      expect(() => withAppLinks(app, { appleTeamId: team, env: easEnv('production', 'ios') }), team).toThrow(/appleTeamId/);
    }
    for (const fp of [Array(32).fill('00').join(':'), Array(32).fill('AB').join(':'), 'A1B2', FP1.toLowerCase().slice(0, 20)]) {
      expect(() => withAppLinks(app, { androidCertSha256: [fp, FP2], env: easEnv('production', 'android') }), fp).toThrow(/형식/);
    }
  });
  it('팀 ID가 있으면 ios.appleTeamId로 넣는다(위젯 타깃 서명), 다른 값이 이미 있으면 멈춤', () => {
    expect(withAppLinks(app, { appleTeamId: TEAM, env: {} }).ios?.appleTeamId).toBe(TEAM);
    expect(withAppLinks(app, { appleTeamId: '', env: {} }).ios?.appleTeamId).toBeUndefined();
    expect(() => withAppLinks({ ...app, ios: { ...app.ios, appleTeamId: 'Z9Y8X7W6V5' } }, { appleTeamId: TEAM, env: {} })).toThrow(/다르다/);
  });
  it('앱 링크 범위가 바뀌면(도메인·경로·autoVerify·추가 도메인) 어떤 빌드에서도 멈춘다', () => {
    const f = app.android!.intentFilters![0]!;
    const bad: Config[] = [
      { ...app, ios: { ...app.ios, associatedDomains: ['applinks:mongmang.ink', 'applinks:www.mongmang.ink'] } },
      { ...app, ios: { ...app.ios, associatedDomains: [] } },
      { ...app, android: { ...app.android, intentFilters: [{ ...f, autoVerify: false }] } },
      { ...app, android: { ...app.android, intentFilters: [{ ...f, data: [{ scheme: 'https', host: 'mongmang.ink', pathPrefix: '/' }] }] } },
      { ...app, android: { ...app.android, intentFilters: [{ ...f, data: [{ scheme: 'http', host: 'mongmang.ink', pathPrefix: '/m/' }] }] } },
      { ...app, android: { ...app.android, intentFilters: [] } },
      // path·pathPattern이 붙으면 범위가 AASA /m/*와 달라진다
      { ...app, android: { ...app.android, intentFilters: [{ ...f, data: [{ ...f.data![0]!, path: '/m/x' }] }] } },
      { ...app, android: { ...app.android, intentFilters: [{ ...f, data: [{ ...f.data![0]!, pathPattern: '/m/.*' }] }] } },
    ];
    for (const c of bad) expect(() => withAppLinks(c, { env: {} })).toThrow(/withAppLinks/);
  });
});

describe('위젯 자리 — App Group·키가 네이티브 세 곳과 JS에서 같다', () => {
  const widgetSwift = readFileSync(join(root, 'targets/widget/MongWidget.swift'), 'utf8');
  const bridgeSwift = readFileSync(join(root, 'modules/widget-bridge/ios/WidgetBridgeModule.swift'), 'utf8');
  const target = (req('../targets/widget/expo-target.config.js') as (c: Config) => Record<string, unknown>)(app);

  it('App Group: entitlements = Info.plist MongAppGroup = 위젯 Swift = contract.ts, 그룹 이름은 번들 id 기반', () => {
    expect(app.ios?.entitlements?.['com.apple.security.application-groups']).toEqual([WIDGET_APP_GROUP]);
    expect(app.ios?.infoPlist?.MongAppGroup).toBe(WIDGET_APP_GROUP);
    expect(WIDGET_APP_GROUP).toBe(`group.${app.ios?.bundleIdentifier}`);
    expect(widgetSwift).toContain(`private let appGroup = "${WIDGET_APP_GROUP}"`);
    expect(bridgeSwift).toContain('forInfoDictionaryKey: "MongAppGroup"');
  });
  it('값 키: 위젯 Swift = 다리 Swift = contract.ts', () => {
    expect(widgetSwift).toContain(`private let valueKey = "${WIDGET_VALUE_KEY}"`);
    expect(bridgeSwift).toContain(`private let valueKey = "${WIDGET_VALUE_KEY}"`);
  });
  it('iOS 타깃: widget, 번들 id 접미사 .widget, 앱과 같은 최소 iOS 16.4, entitlements = 앱 App Group(이것이 없으면 타깃 entitlements 파일이 안 생김)', () => {
    expect(target).toMatchObject({ type: 'widget', bundleIdentifier: '.widget', deploymentTarget: '16.4' });
    expect(target.entitlements).toEqual({ 'com.apple.security.application-groups': [WIDGET_APP_GROUP] });
  });
  it('Android 위젯 이름 = contract.ts, 재촉 없는 갱신(updatePeriodMillis 0)', () => {
    const widgets = (pluginProps('react-native-android-widget') as { widgets: Array<{ name: string; updatePeriodMillis: number }> }).widgets;
    expect(widgets.map((w) => w.name)).toEqual([ANDROID_WIDGET_NAME]);
    expect(widgets[0]!.updatePeriodMillis).toBe(0);
  });
  it('index.ts가 android일 때만 try 안에서 위젯 작업 핸들러를 등록한다(빠지면 Android 위젯이 늘 빈 칸)', () => {
    const src = readFileSync(join(root, 'index.ts'), 'utf8').replace(/\/\/.*$/gm, '');
    expect(src).toMatch(
      /if \(Platform\.OS === 'android'\) \{\s*try \{\s*\(require\('\.\/src\/widget\/androidTask'\) as typeof import\('\.\/src\/widget\/androidTask'\)\)\.registerMongWidget\(\);\s*\} catch/,
    );
    expect(src.match(/registerMongWidget\(\)/g)).toHaveLength(1);
    const task = readFileSync(join(root, 'src/widget/androidTask.tsx'), 'utf8');
    expect(task).toMatch(/registerWidgetTaskHandler\(mongWidgetTaskHandler\)/);
  });
  it('위젯 Swift·Info.plist가 런타임(fingerprint)에 들어간다 — 생성 색 자산은 빠진다(리뷰 M2)', async () => {
    expect(fpConfig.extraSources).toEqual([{ type: 'dir', filePath: 'targets', reasons: ['appleTargets'] }]);
    expect(fpConfig.ignorePaths).toEqual(['targets/*/Assets.xcassets/**']);
    const fp = req(req.resolve('@expo/fingerprint', { paths: [req.resolve('expo-updates/package.json')] })) as {
      createFingerprintAsync: (root: string, o: object) => Promise<{ sources: Array<{ filePath?: string; debugInfo?: unknown }> }>;
    };
    const { sources } = await fp.createFingerprintAsync(root, { platforms: ['ios'], debug: true });
    const files: string[] = [];
    const walk = (n: { path?: string; children?: unknown[] }) => (n.children ? n.children.forEach((c) => walk(c as typeof n)) : n.path && files.push(n.path));
    walk((sources.find((s) => s.filePath === 'targets')?.debugInfo ?? {}) as { children?: unknown[] });
    expect(files).toEqual(expect.arrayContaining(['targets/widget/MongWidget.swift', 'targets/widget/Info.plist']));
    expect(files.filter((f) => f.includes('Assets.xcassets'))).toEqual([]);
  }, 60_000);
  it('apple-targets의 ExtensionStorage 네이티브 모듈은 자동 링크에서 뺀다(App Group 통로는 로컬 WidgetBridge 하나)', () => {
    expect(pkg.expo?.autolinking?.exclude).toEqual(['@bacons/apple-targets']);
  });
});

describe('새 네이티브 의존은 판 고정', () => {
  it('apple-targets·android-widget·expo-clipboard는 정확한 판(^·~ 없음)', () => {
    expect(pkg.dependencies['@bacons/apple-targets']).toBe('5.0.0');
    expect(pkg.dependencies['react-native-android-widget']).toBe('0.26.0');
    expect(pkg.dependencies['expo-clipboard']).toBe('58.0.4');
  });
});

describe('필기 인식(ML Kit) 스위치 — 플러그인 하나로 넣고 뺀다', () => {
  const moduleRoot = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), 'mong-ink-'));
    for (const [rel, body] of Object.entries(files)) {
      const p = join(dir, 'modules/ink-recognizer', rel);
      mkdirSync(join(p, '..'), { recursive: true });
      writeFileSync(p, body);
    }
    return dir;
  };
  const GATED = {
    'android/build.gradle': "if (findProperty('mong.inkRecognizer') == 'true') {\n  dependencies { implementation 'com.google.mlkit:digital-ink-recognition:19.0.0' }\n}",
    'ios/InkRecognizer.podspec': "props = JSON.parse(File.read(File.join(__dir__, '../../../ios/Podfile.properties.json'))) rescue {}\nif props['mong.inkRecognizer'] == 'true'\n  s.dependency 'GoogleMLKit/DigitalInkRecognition'\nend",
  };
  // V2 스파이크(mongmange-wt-ink) 모양: ML Kit을 무조건 넣는다
  const SPIKE = { 'android/build.gradle': "dependencies {\n  implementation 'com.google.mlkit:digital-ink-recognition:19.0.0'\n}", 'ios/InkRecognizer.podspec': "s.dependency 'ExpoModulesCore'" };
  // 플러그인은 넘긴 config에 mods를 붙인다(expo config-plugins 관례) → 시험마다 새 사본
  const runMods = async (out: Config & Mods) => {
    const req0 = { projectRoot: root, platformProjectRoot: root, introspect: true };
    const g = await out.mods!.android!.gradleProperties!({ ...out, modResults: [], modRequest: { ...req0, platform: 'android', modName: 'gradleProperties' } });
    const p = await out.mods!.ios!.podfileProperties!({ ...out, modResults: {}, modRequest: { ...req0, platform: 'ios', modName: 'podfileProperties' } });
    return { gradle: g.modResults, podfile: p.modResults };
  };

  it('app.json에 enabled 한 칸(지금 false — V2 모듈이 들어오고 V0-5 결정 뒤 켬)', () => {
    expect(pluginProps('./plugins/withInkRecognizer')).toEqual({ enabled: false });
  });
  it('enabled는 boolean만', () => {
    expect(() => withInk(structuredClone(app), {})).toThrow(/enabled/);
    expect(() => withInk(structuredClone(app), { enabled: 'true' })).toThrow(/enabled/);
  });
  it('꺼짐은 모듈이 없어도 통과, 켬은 모듈이 없으면 멈춘다', () => {
    expect(() => withInk(structuredClone(app), { enabled: false, projectRoot: mkdtempSync(join(tmpdir(), 'mong-ink-')) })).not.toThrow();
    expect(() => withInk(structuredClone(app), { enabled: true, projectRoot: mkdtempSync(join(tmpdir(), 'mong-ink-')) })).toThrow(/없다/);
  });
  it('모듈이 있으면 켬·꺼짐 모두 계약을 본다 — 꺼짐 + 스파이크 모양(ML Kit 무조건)이면 멈춘다(리뷰 H1 재현)', () => {
    for (const enabled of [false, true]) {
      expect(() => withInk(structuredClone(app), { enabled, projectRoot: moduleRoot(SPIKE) }), String(enabled)).toThrow(/build\.gradle.*podspec/);
      expect(() => withInk(structuredClone(app), { enabled, projectRoot: moduleRoot({ 'android/build.gradle': GATED['android/build.gradle'] }) })).toThrow(/podspec/);
      expect(() => withInk(structuredClone(app), { enabled, projectRoot: moduleRoot(GATED) })).not.toThrow();
    }
  });
  it('주석에 키 이름만 적은 모듈은 읽는 것으로 치지 않는다', () => {
    const commented = { 'android/build.gradle': "// findProperty('mong.inkRecognizer')\n" + SPIKE['android/build.gradle'], 'ios/InkRecognizer.podspec': "# Podfile.properties.json ['mong.inkRecognizer']\n" + SPIKE['ios/InkRecognizer.podspec'] };
    expect(() => withInk(structuredClone(app), { enabled: false, projectRoot: moduleRoot(commented) })).toThrow(/build\.gradle.*podspec/);
  });
  it('mod 출력 = 꺼짐 바이너리를 정하는 유일한 값: gradle.properties·Podfile.properties.json에 문자열 false / true', async () => {
    const off = await runMods(withInk(structuredClone(app), { enabled: false, projectRoot: mkdtempSync(join(tmpdir(), 'mong-ink-')) }));
    expect(off.gradle).toEqual([{ type: 'property', key: 'mong.inkRecognizer', value: 'false' }]);
    expect(off.podfile).toEqual({ 'mong.inkRecognizer': 'false' });
    const on = await runMods(withInk(structuredClone(app), { enabled: true, projectRoot: moduleRoot(GATED) }));
    expect(on.gradle).toEqual([{ type: 'property', key: 'mong.inkRecognizer', value: 'true' }]);
    expect(on.podfile).toEqual({ 'mong.inkRecognizer': 'true' });
  });
});
