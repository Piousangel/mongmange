// 내부 시험 APK(eas.json `internal-test`) 고정 — plugins/buildMode.js·withInternalTest.js.
// 이 프로필만 앱 링크를 빼고(명시 모드), 스토어에 낼 수 없는 모양(패키지 .internaltest·이름 '(시험)'·OTA 꺼짐)이 되는지,
// 그리고 production·preview 가드(앱 링크 키·자체 OTA 조건)는 그대로 멈추는지 본다. 플러그인을 app.json 순서대로 이어 돌린다(c10 방식).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INTERNAL_TEST, conceptV3Default, devMenuMode, readInternalTest } from '../src/buildKind';
import { FEATURE_DEFAULTS, isOn, setFeature } from '../src/features';

type IntentFilter = { action?: string; autoVerify?: boolean; data?: Array<Record<string, string>>; category?: string[] };
type Config = {
  name?: string;
  runtimeVersion?: unknown;
  updates?: { enabled?: boolean; requestHeaders?: Record<string, string>; codeSigningCertificate?: string; url?: string };
  ios?: { bundleIdentifier?: string; associatedDomains?: string[]; appleTeamId?: string };
  android?: { package?: string; intentFilters?: IntentFilter[] };
  extra?: Record<string, unknown>;
  plugins?: unknown[];
  _internal?: { projectRoot?: string };
};
type Env = Record<string, string>;
const root = join(__dirname, '..');
const app = (JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')) as { expo: Config }).expo;
const eas = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8')) as {
  build: Record<string, { distribution?: string; developmentClient?: boolean; autoIncrement?: boolean; channel?: string; android?: { buildType?: string }; env?: Env }>;
  submit?: Record<string, unknown>;
};
const req = createRequire(import.meta.url);
type Plugin = (c: Config, p?: Record<string, unknown>) => Config;
const withInternalTest = req('../plugins/withInternalTest.js') as Plugin;
const withSelfHostedUpdates = req('../plugins/withSelfHostedUpdates.js') as Plugin;
const withAppLinks = req('../plugins/withAppLinks.js') as Plugin;
const { internalTestMode } = req('../plugins/buildMode.js') as { internalTestMode: (env: Env) => boolean };

const pluginName = (p: unknown) => (Array.isArray(p) ? p[0] : p) as string;
const pluginIndex = (name: string) => app.plugins?.findIndex((p) => pluginName(p) === name) ?? -1;
const pluginProps = (name: string) => (app.plugins?.find((p) => pluginName(p) === name) as [string, Record<string, unknown>] | undefined)?.[1] ?? {};

/** EAS가 그 프로필로 빌드할 때의 env(eas.json env + EAS 변수) */
const profileEnv = (profile: string, platform = 'android'): Env => ({
  ...(eas.build[profile]?.env ?? {}),
  EAS_BUILD: 'true',
  EAS_BUILD_PROFILE: profile,
  EAS_BUILD_PLATFORM: platform,
});
/** app.json 순서대로 세 플러그인을 이어 돌린다(app.json에 적힌 props 그대로 = 오너 키 없음) */
const resolve = (env: Env) =>
  [
    ['./plugins/withInternalTest', withInternalTest],
    ['./plugins/withSelfHostedUpdates', withSelfHostedUpdates],
    ['./plugins/withAppLinks', withAppLinks],
  ]
    .sort((a, b) => pluginIndex(a[0] as string) - pluginIndex(b[0] as string))
    .reduce((c, [name, fn]) => (fn as Plugin)(c, { ...pluginProps(name as string), env, projectRoot: root }), app);

describe('eas.json internal-test 프로필', () => {
  const p = eas.build['internal-test']!;
  it('internal 배포·APK·개발 클라이언트 아님·OTA 채널 없음·빌드마다 versionCode 올림(기존 시험판 위에 덮어 설치)', () => {
    expect(p.distribution).toBe('internal');
    expect(p.android?.buildType).toBe('apk');
    expect(p.developmentClient).toBe(false);
    expect(p.channel).toBeUndefined();
    expect(p.env?.MONG_OTA_CHANNEL).toBeUndefined();
    expect(p.env?.MONG_INTERNAL_TEST).toBe('1');
    expect(p.autoIncrement).toBe(true);
  });
  it('플래그는 internal-test에만, 제출 프로필은 production뿐', () => {
    for (const [name, b] of Object.entries(eas.build)) if (name !== 'internal-test') expect(b.env?.MONG_INTERNAL_TEST, name).toBeUndefined();
    expect(Object.keys(eas.submit ?? {})).toEqual(['production']);
  });
  it('withInternalTest는 withSelfHostedUpdates·withAppLinks보다 앞', () => {
    expect(pluginIndex('./plugins/withInternalTest')).toBeGreaterThanOrEqual(0);
    expect(pluginIndex('./plugins/withInternalTest')).toBeLessThan(pluginIndex('./plugins/withSelfHostedUpdates'));
    expect(pluginIndex('./plugins/withInternalTest')).toBeLessThan(pluginIndex('./plugins/withAppLinks'));
  });
});

describe('internal-test config 결과(오너 키 없음)', () => {
  const out = resolve({ ...profileEnv('internal-test'), EAS_BUILD_ID: 'b-1', EAS_BUILD_GIT_COMMIT_HASH: 'c-1' });
  it('키 없이도 멈추지 않는다', () => expect(out).toBeTruthy());
  it('앱 링크 없음(associatedDomains·autoVerify 필터 0)', () => {
    expect(out.ios?.associatedDomains).toBeUndefined();
    expect(out.android?.intentFilters?.filter((f) => f.autoVerify || f.data?.some((d) => d.host === 'mongmang.ink'))).toEqual([]);
  });
  it('스토어에 낼 수 없는 모양: 패키지 .internaltest, 이름 (시험), 빌드 표시', () => {
    expect(out.android?.package).toBe('com.piousangel.mongmange.internaltest');
    expect(out.ios?.bundleIdentifier).toBe('com.piousangel.mongmange.internaltest');
    expect(out.name).toBe(`${app.name} (시험)`);
    expect(out.extra?.internalTest).toBe(true);
  });
  it('빌드마다 다른 EAS 값(빌드 id·커밋)은 config에 들어가지 않는다 — 로컬·EAS fingerprint가 같아야 한다(빌드 0b52cf57 런타임 불일치 재발 방지)', () => {
    expect(JSON.stringify(out)).not.toMatch(/b-1|c-1/);
    expect(resolve(profileEnv('internal-test'))).toEqual(out);
  });
  it('OTA 꺼짐: enabled false, 채널 헤더·서명 없음, 설치 id 헤더는 상수로 덮음', () => {
    expect(out.updates?.enabled).toBe(false);
    expect(out.updates?.requestHeaders?.['expo-channel-name']).toBeUndefined();
    expect(out.updates?.codeSigningCertificate).toBeUndefined();
    expect(out.updates?.requestHeaders?.['EAS-Client-ID']).toBe('00000000-0000-0000-0000-000000000000');
  });
  it('원본 app.json 값은 바꾸지 않는다', () => {
    expect(app.android?.package).toBe('com.piousangel.mongmange');
    expect(app.ios?.associatedDomains).toEqual(['applinks:mongmang.ink']);
  });
});

describe('다른 프로필 가드는 그대로', () => {
  it('production·preview: 키가 없으면 여전히 멈춘다(Android·iOS)', () => {
    for (const profile of ['production', 'preview']) {
      for (const platform of ['android', 'ios']) expect(() => resolve(profileEnv(profile, platform)), `${profile} ${platform}`).toThrow(/withSelfHostedUpdates|withAppLinks/);
    }
  });
  it('production: OTA 준비가 됐다고 쳐도 앱 링크 키가 없으면 멈춘다', () => {
    const env = profileEnv('production', 'android');
    const otaOk = withSelfHostedUpdates(app, { ready: false, env: {}, projectRoot: root });
    expect(() => withAppLinks(otaOk, { ...pluginProps('./plugins/withAppLinks'), env })).toThrow(/androidCertSha256이 비어/);
  });
  it('production·preview·development·로컬 config는 패키지·이름·앱 링크가 원래대로', () => {
    for (const env of [{}, profileEnv('development')]) {
      const out = resolve(env);
      expect(out.android?.package).toBe('com.piousangel.mongmange');
      expect(out.name).toBe(app.name);
      expect(out.ios?.associatedDomains).toEqual(['applinks:mongmang.ink']);
      expect(out.android?.intentFilters).toEqual(app.android?.intentFilters);
      expect(out.extra?.internalTest).toBeUndefined();
    }
    for (const profile of ['production', 'preview']) expect(withInternalTest(app, { env: profileEnv(profile) })).toBe(app);
  });
  it('플래그를 다른 프로필에 붙이면 멈춘다(가드 우회 금지)', () => {
    for (const profile of ['production', 'preview', 'development']) {
      expect(() => resolve({ ...profileEnv(profile), MONG_INTERNAL_TEST: '1' }), profile).toThrow(/internal-test 프로필에서만/);
    }
  });
  it('internal-test 프로필인데 플래그 없음·OTA 채널 동반·iOS·이상한 값이면 멈춘다', () => {
    const base = profileEnv('internal-test');
    expect(() => internalTestMode({ ...base, MONG_INTERNAL_TEST: '' })).toThrow(/MONG_INTERNAL_TEST=1이 없다/);
    expect(() => internalTestMode({ ...base, MONG_OTA_CHANNEL: 'production' })).toThrow(/OTA 채널/);
    expect(() => internalTestMode(profileEnv('internal-test', 'ios'))).toThrow(/Android만/);
    expect(() => internalTestMode({ MONG_INTERNAL_TEST: 'true' })).toThrow(/'1'만/);
  });
  it('내부 시험 모드에서 앱 링크가 남아 있으면(withInternalTest가 빠지면) withAppLinks가 멈춘다', () => {
    expect(() => withAppLinks(app, { env: profileEnv('internal-test') })).toThrow(/남아 있다/);
  });
});

describe('시험판에서만 새 컨셉 v3·v3 개발 메뉴 켜짐(운영·preview 꺼짐)', () => {
  const extraOf = (env: Env) => resolve(env).extra;
  it('config extra.internalTest: internal-test만 true, production·preview·development·로컬은 없음', () => {
    expect(readInternalTest(extraOf(profileEnv('internal-test')))).toBe(true);
    // production·preview는 OTA·키 가드로 멈추므로 시험판 플러그인만 돌려 본다(가드는 위에서 고정)
    for (const profile of ['production', 'preview', 'development']) expect(readInternalTest(withInternalTest(app, { env: profileEnv(profile) }).extra), profile).toBe(false);
    expect(readInternalTest(extraOf({}))).toBe(false);
  });
  it('readInternalTest는 정확히 true만', () => {
    for (const extra of [undefined, null, {}, { internalTest: 'true' }, { internalTest: 1 }, { internalTest: { buildId: 'x' } }]) expect(readInternalTest(extra)).toBe(false);
  });
  it('conceptV3 기본값: 운영·preview(개발 아님·시험판 아님) 꺼짐, 시험판·개발 켜짐', () => {
    expect(conceptV3Default({ dev: false, internalTest: false })).toBe(false);
    expect(conceptV3Default({ dev: false, internalTest: true })).toBe(true);
    expect(conceptV3Default({ dev: true, internalTest: false })).toBe(true);
  });
  it('개발 메뉴: 운영·preview 없음, 시험판 v3 단추만, 개발 빌드 전부', () => {
    expect(devMenuMode({ dev: false, internalTest: false })).toBeNull();
    expect(devMenuMode({ dev: false, internalTest: true })).toBe('v3');
    expect(devMenuMode({ dev: true, internalTest: true })).toBe('full');
  });
  it('M4 jeong·hesitation·jeongCaptions도 conceptV3와 같은 규칙(운영 꺼짐, 개발·시험판 켜짐) — 소스로 고정', () => {
    const src = readFileSync(join(root, 'src/features.ts'), 'utf8');
    for (const id of ['conceptV3', 'jeong', 'hesitation', 'jeongCaptions'])
      expect(src, id).toMatch(new RegExp(`\\n  ${id}: conceptV3Default\\(\\{ dev: typeof __DEV__ !== 'undefined' && __DEV__ === true, internalTest: INTERNAL_TEST \\}\\),`));
    expect(FEATURE_DEFAULTS.jeong).toBe(false); // 시험 환경(Node) = 운영과 같은 값
  });
  it('시험판에서 켜는 플래그는 conceptV3(+ M4 jeong 묶음) — dreamContent 등 다른 시험 플래그 기본값은 그대로 꺼짐', () => {
    expect(INTERNAL_TEST).toBe(false); // 시험 환경(Node)은 시험판이 아니다
    const { conceptV3: _v3, share: _s, review: _r, ...rest } = FEATURE_DEFAULTS;
    for (const [id, on] of Object.entries(rest)) expect(on, id).toBe(false);
  });
  it('v3가 켜져도 맡겨 두기(cloud)는 번들 기본값(꺼짐)을 따른다 — V27b 뒤로 둘 다 켜짐은 허용, 켜는 길은 개발 메뉴·원격뿐', () => {
    setFeature('conceptV3', true);
    expect(isOn('cloud')).toBe(false);
    setFeature('cloud', true);
    expect(isOn('cloud')).toBe(true);
    setFeature('cloud', null);
    setFeature('conceptV3', null);
  });
  it('GameApp은 개발 메뉴를 devMenuMode로만 연다(__DEV__ 직접 분기 없음), 시험판은 v3Only', () => {
    const src = readFileSync(join(root, 'src/game/GameApp.tsx'), 'utf8');
    expect(src).toMatch(/const DEV_MENU = devMenuMode\(\{ dev: __DEV__, internalTest: INTERNAL_TEST \}\)/);
    expect(src).toMatch(/\{DEV_MENU && \(\s*<DevPanel\s+v3Only=\{DEV_MENU === 'v3'\}/);
    expect(src).not.toMatch(/\{__DEV__ && \(\s*<DevPanel/);
  });
});
