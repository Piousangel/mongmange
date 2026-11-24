// 자체 OTA 앱 설정 고정(V21, docs/design/server-v1/ota-self-host.md 4·8·9절). 바이너리에 박히는 값이라 빌드 2 전에 검사로 묶는다:
// 업데이트 주소가 Expo 서비스로 새거나, 채널마다 런타임이 갈리거나(리뷰 H1), 인증서·준비 없이 OTA가 켜지거나(M2), 채널 키가 섞이거나(M3),
// 설치 id가 그대로 나가면(H2) 실패.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Updates = {
  url?: string;
  enabled?: boolean;
  checkAutomatically?: string;
  fallbackToCacheTimeout?: number;
  enableBsdiffPatchSupport?: boolean;
  codeSigningCertificate?: string;
  codeSigningMetadata?: { keyid: string; alg: string };
  requestHeaders?: Record<string, string>;
};
type Config = { runtimeVersion?: unknown; updates?: Updates; plugins?: unknown[] };
const root = join(__dirname, '..');
const raw = readFileSync(join(root, 'app.json'), 'utf8');
const app = (JSON.parse(raw) as { expo: Config }).expo;
const eas = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8')) as { build: Record<string, { env?: Record<string, string> }> };
const req = createRequire(import.meta.url);
const plugin = req('../plugins/withSelfHostedUpdates.js') as ((c: Config, p?: Record<string, unknown>) => Config) & { PRIVACY_HEADERS: Record<string, string> };
const fpConfig = req('../fingerprint.config.js') as { fileHookTransform: (s: { type: string; id?: string }, c: unknown) => unknown };

describe('app.json 자체 OTA 설정', () => {
  it('업데이트 주소 = 우리 도메인의 서버 경로, Expo 업데이트 서비스 흔적 없음', () => {
    expect(app.updates?.url).toBe('https://ota.mongmang.ink/api/v1/ota/manifest');
    expect(raw).not.toMatch(/u\.expo\.dev|expo\.io\/@/);
  });
  it('둘째 실행부터 JS가 직접 확인(NEVER), 시작을 기다리지 않음, bsdiff 패치 끔, 런타임 = fingerprint', () => {
    expect(app.updates).toMatchObject({ checkAutomatically: 'NEVER', fallbackToCacheTimeout: 0, enableBsdiffPatchSupport: false });
    expect(app.runtimeVersion).toEqual({ policy: 'fingerprint' });
  });
  it('서명 설정은 app.json에 두지 않는다(채널별로 플러그인이 넣음), 가드는 아직 준비 전(ready false), 채널은 빌드 프로필 env', () => {
    expect(app.updates?.codeSigningCertificate).toBeUndefined();
    expect(app.plugins).toContainEqual(['./plugins/withSelfHostedUpdates', { ready: false }]);
    expect(eas.build.preview?.env?.MONG_OTA_CHANNEL).toBe('preview');
    expect(eas.build.production?.env?.MONG_OTA_CHANNEL).toBe('production');
    expect(eas.build.development?.env?.MONG_OTA_CHANNEL).toBeUndefined();
  });
  it('앱 코드는 Expo-Extra-Params 통로(setExtraParamAsync)를 쓰지 않는다(리뷰 L6 — 식별자 통로)', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx|js)$/.test(n)) files.push(p);
      }
    };
    walk(join(root, 'src'));
    files.push(join(root, 'App.tsx'), join(root, 'index.ts'));
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/setExtraParamAsync|ExtraParams/);
  });
});

describe('withSelfHostedUpdates 가드', () => {
  const withCert = (...channels: string[]) => {
    const dir = mkdtempSync(join(tmpdir(), 'mong-ota-app-'));
    mkdirSync(join(dir, 'certs'));
    for (const c of channels) writeFileSync(join(dir, 'certs', `ota-${c}.pem`), '-----BEGIN CERTIFICATE-----\n');
    return dir;
  };
  const easEnv = (profile: string, channel?: string) => ({ EAS_BUILD: 'true', EAS_BUILD_PROFILE: profile, ...(channel ? { MONG_OTA_CHANNEL: channel } : {}) });

  it('EAS 출시 빌드: 준비 전·채널 없음·그 채널 인증서 없음이면 멈춘다', () => {
    expect(() => plugin(app, { ready: false, env: easEnv('production', 'production'), projectRoot: withCert('production') })).toThrow(/ready/);
    expect(() => plugin(app, { ready: true, env: easEnv('production'), projectRoot: withCert('production') })).toThrow(/MONG_OTA_CHANNEL/);
    // production 빌드인데 preview 인증서만 있음 → 멈춤(채널 키 섞임 방지)
    expect(() => plugin(app, { ready: true, env: easEnv('production', 'production'), projectRoot: withCert('preview') })).toThrow(/ota-production\.pem/);
  });
  it('다 갖추면 OTA 켬 + 그 채널 인증서·keyid(= 채널) + 채널 헤더', () => {
    const out = plugin(app, { ready: true, env: easEnv('production', 'production'), projectRoot: withCert('preview', 'production') });
    expect(out.updates).toMatchObject({ enabled: true, codeSigningCertificate: './certs/ota-production.pem', codeSigningMetadata: { keyid: 'production', alg: 'rsa-v1_5-sha256' } });
    expect(out.updates?.requestHeaders?.['expo-channel-name']).toBe('production');
  });
  it('fail-closed: 로컬 출시 구성(EAS 아님)에서도 조건이 하나라도 빠지면 OTA 자체를 끈다(enabled false, 서명·URL만 남은 바이너리 없음)', () => {
    const cases: Array<[Record<string, string>, boolean, string]> = [
      [{}, true, withCert('production')], // 채널 없음
      [{ MONG_OTA_CHANNEL: 'production' }, true, withCert()], // 인증서 없음
      [{ MONG_OTA_CHANNEL: 'production' }, false, withCert('production')], // 준비 전
      [easEnv('development', 'production'), true, withCert()], // 개발 빌드
    ];
    for (const [env, ready, projectRoot] of cases) {
      const out = plugin(app, { ready, env, projectRoot });
      expect(out.updates?.enabled, JSON.stringify(env)).toBe(false);
      expect(out.updates?.codeSigningCertificate).toBeUndefined();
    }
  });
  it('설치 id·오류 텍스트·실패 id 헤더는 어떤 구성에서도 상수로 덮는다', () => {
    for (const [env, ready] of [[{}, false], [easEnv('preview', 'preview'), true]] as const) {
      const out = plugin(app, { ready, env, projectRoot: withCert('preview') });
      expect(out.updates?.requestHeaders).toMatchObject({ 'EAS-Client-ID': '00000000-0000-0000-0000-000000000000', 'Expo-Fatal-Error': '-', 'Expo-Recent-Failed-Update-IDs': '' });
    }
  });
  it('업데이트 주소가 우리 도메인이 아니면(Expo·http·비슷한 이름) 늘 멈춘다', () => {
    for (const url of ['https://u.expo.dev/3f2eff79-1c05-4259-85f0-bc6a59b722de', 'http://ota.mongmang.ink/x', 'https://mongmang.ink.evil.example/x', 'https://evilmongmang.ink/x']) {
      expect(() => plugin({ ...app, updates: { ...app.updates, url } }, { env: {}, projectRoot: withCert() })).toThrow(/updates\.url/);
    }
  });
});

describe('설치 id 덮어쓰기가 실제로 먹는가 — 설치된 expo-updates 소스 순서(리뷰 H2)', () => {
  // 헤더를 덮으려면 config.requestHeaders를 **EAS-Client-ID·Expo-Fatal-Error를 넣은 뒤에** 넣어야 한다. 판이 올라가 순서가 바뀌면 여기서 실패한다
  const pkg = join(req.resolve('expo-updates/package.json'), '..');
  /** needle이 나온 자리마다, 다음 끝 표시 전에 after가 나오는가 */
  const followedBy = (src: string, needle: string, after: string, end: RegExp) => {
    const hits: boolean[] = [];
    for (let i = src.indexOf(needle); i >= 0; i = src.indexOf(needle, i + 1)) {
      const rest = src.slice(i);
      const stop = rest.slice(needle.length).search(end);
      const scope = stop < 0 ? rest : rest.slice(0, stop + needle.length);
      hits.push(scope.includes(after));
    }
    return hits;
  };
  it('Android FileDownloader.kt: 매니페스트·에셋 요청 모두 EAS-Client-ID 다음에 requestHeaders(OkHttp header()는 같은 이름을 바꿔 씀)', () => {
    const kt = readFileSync(join(pkg, 'android/src/main/java/expo/modules/updates/loader/FileDownloader.kt'), 'utf8');
    const hits = followedBy(kt, '.header("EAS-Client-ID"', 'configuration.requestHeaders', /\.build\(\)/);
    expect(hits).toEqual([true, true]);
    expect(followedBy(kt, '"Expo-Fatal-Error"', 'configuration.requestHeaders', /\.build\(\)/)).toEqual([true]);
    expect(kt).toMatch(/for \(\(key, value\) in configuration\.requestHeaders\) \{\s*header\(key, value\)/);
  });
  it('iOS FileDownloader.swift: 두 헤더 설정 함수 모두 EAS-Client-ID 다음에 requestHeaders(setValue는 같은 이름을 바꿔 씀)', () => {
    const sw = readFileSync(join(pkg, 'ios/EXUpdates/AppLoader/FileDownloader.swift'), 'utf8');
    expect(followedBy(sw, 'forHTTPHeaderField: "EAS-Client-ID"', 'config.requestHeaders', /\n {2}(private |static |public )*func /)).toEqual([true, true]);
    expect(followedBy(sw, 'forHTTPHeaderField: "Expo-Fatal-Error"', 'config.requestHeaders', /\n {2}(private |static |public )*func /)).toEqual([true]);
    expect(sw).toMatch(/for \(key, value\) in config\.requestHeaders \{\s*request\.setValue\(value, forHTTPHeaderField: key\)/);
  });
});

describe('런타임 버전(fingerprint)이 채널·서명 설정에 흔들리지 않는다(리뷰 H1)', () => {
  it('fingerprint.config.js는 플러그인이 넣는 네 칸만 뺀다', () => {
    const json = JSON.stringify({ name: 'x', updates: { url: 'u', requestHeaders: { a: '1' }, codeSigningCertificate: 'c', codeSigningMetadata: {}, enabled: false, checkAutomatically: 'NEVER' } });
    expect(JSON.parse(fpConfig.fileHookTransform({ type: 'contents', id: 'expoConfig' }, json) as string)).toEqual({ name: 'x', updates: { url: 'u', checkAutomatically: 'NEVER' } });
    expect(fpConfig.fileHookTransform({ type: 'contents', id: 'other' }, json)).toBe(json);
  });
  it('실제 runtimeversion:resolve — 채널 env 없음·preview·production에서 플랫폼별 값이 같다', () => {
    const resolve = (platform: string, channel?: string) => {
      const env = { ...process.env };
      delete env.MONG_OTA_CHANNEL;
      if (channel) env.MONG_OTA_CHANNEL = channel;
      const out = execFileSync('npx', ['expo-updates', 'runtimeversion:resolve', '--platform', platform], { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return (JSON.parse(out) as { runtimeVersion: string }).runtimeVersion;
    };
    for (const platform of ['android', 'ios']) {
      const vals = [undefined, 'preview', 'production'].map((c) => resolve(platform, c));
      expect(vals[0], platform).toMatch(/^[0-9a-f]{40}$/);
      expect(new Set(vals).size, `${platform}: ${vals.join(' / ')}`).toBe(1);
    }
  }, 180_000);
});
