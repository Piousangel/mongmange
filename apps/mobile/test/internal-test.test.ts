// 내부 시험 APK(eas.json `internal-test`) 고정 — plugins/buildMode.js·withInternalTest.js.
// 이 프로필만 앱 링크를 빼고(명시 모드), 스토어에 낼 수 없는 모양(패키지 .internaltest·이름 '(시험)'·OTA 꺼짐)이 되는지,
// 그리고 production·preview 가드(앱 링크 키·자체 OTA 조건)는 그대로 멈추는지 본다. 플러그인을 app.json 순서대로 이어 돌린다(c10 방식).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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
  it('internal 배포·APK·개발 클라이언트 아님·OTA 채널 없음·자동 번호 없음', () => {
    expect(p.distribution).toBe('internal');
    expect(p.android?.buildType).toBe('apk');
    expect(p.developmentClient).toBe(false);
    expect(p.channel).toBeUndefined();
    expect(p.env?.MONG_OTA_CHANNEL).toBeUndefined();
    expect(p.env?.MONG_INTERNAL_TEST).toBe('1');
    expect(p.autoIncrement).toBeUndefined();
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
    expect(out.extra?.internalTest).toEqual({ buildId: 'b-1', commit: 'c-1' });
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
