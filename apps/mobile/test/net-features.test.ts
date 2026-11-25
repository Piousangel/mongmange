// 기능 플래그의 가운데 층(3-7 우선순위: FEATURE_DEFAULTS < 원격 < 개발 메뉴). 원격 층은 원격 키와 이름이 같은 기능만 덮는다(3-7-1).
import { afterEach, describe, expect, it } from 'vitest';
import { FEATURE_DEFAULTS, isOn, remoteBundled, resolveFeature, setFeature, setRemoteLayer } from '../src/features';
import { readSessionBackupExcluded, SESSION_BACKUP_EXCLUDED_EXTRA_KEY } from '../src/net/nativeFlags';
import { gateRemoteFlag } from '../src/net/remoteGate';

afterEach(() => {
  setRemoteLayer(null);
  setFeature('cloud', null);
});

describe('원격 층', () => {
  it('원격이 말하지 않으면(undefined) 번들 기본값, 말하면 그 값, 개발 메뉴가 그 위', () => {
    expect(isOn('cloud')).toBe(FEATURE_DEFAULTS.cloud);
    setRemoteLayer(() => undefined);
    expect(isOn('cloud')).toBe(false);
    setRemoteLayer((k) => (k === 'cloud' ? true : undefined));
    expect(isOn('cloud')).toBe(true);
    setFeature('cloud', false);
    expect(isOn('cloud')).toBe(false);
  });
  it('원격 키가 아닌 기능(share·naming 등)은 원격 층이 건드리지 못한다', () => {
    const asked: string[] = [];
    setRemoteLayer((k) => {
      asked.push(k);
      return false;
    });
    expect(isOn('share')).toBe(true);
    expect(isOn('naming')).toBe(false);
    expect(asked).toEqual([]);
  });
  it('탈출 계산에 넘기는 번들 값 = FEATURE_DEFAULTS 중 원격 키와 이름이 같은 것(cloud·moonNight·hesitation·jeongCaptions — M4)', () => {
    expect(remoteBundled()).toEqual({ cloud: FEATURE_DEFAULTS.cloud, moonNight: FEATURE_DEFAULTS.moonNight, hesitation: FEATURE_DEFAULTS.hesitation, jeongCaptions: FEATURE_DEFAULTS.jeongCaptions });
  });
});

// C11 리뷰 H1: 세션 백업 제외(C10b)가 없는 바이너리에서는 원격 설정으로도 cloud가 켜지지 않는다.
describe('원격 층의 바이너리 조건(cloud ↔ 세션 백업 제외)', () => {
  const layer = (remote: boolean | undefined, sessionBackupExcluded: boolean) => (k: Parameters<typeof gateRemoteFlag>[0]) => gateRemoteFlag(k, k === 'cloud' ? remote : undefined, { sessionBackupExcluded });
  it('백업 제외 미확인 바이너리 + 원격 cloud 켬 → 꺼짐(번들 꺼짐 강제)', () => {
    setRemoteLayer(layer(true, false));
    expect(isOn('cloud')).toBe(false);
    setRemoteLayer(layer(undefined, false)); // 원격이 말하지 않아도 꺼짐(번들 기본값이 OTA로 켜져도)
    expect(isOn('cloud')).toBe(false);
  });
  it('번들 기본값이 OTA로 켜져도(true) 백업 제외 미확인 바이너리면 꺼짐 — 문이 undefined가 아니라 false를 낸다(재리뷰 N2)', () => {
    expect(gateRemoteFlag('cloud', undefined, { sessionBackupExcluded: false })).toBe(false);
    expect(gateRemoteFlag('cloud', true, { sessionBackupExcluded: false })).toBe(false);
    // 번들 기본값 true(OTA로 바뀐 경우)에서도 원격 층의 false가 이긴다
    expect(resolveFeature(undefined, gateRemoteFlag('cloud', undefined, { sessionBackupExcluded: false }), true)).toBe(false);
    expect(resolveFeature(undefined, gateRemoteFlag('cloud', undefined, { sessionBackupExcluded: true }), true)).toBe(true);
  });
  it('백업 제외 바이너리면 원격 값을 그대로 받는다', () => {
    setRemoteLayer(layer(true, true));
    expect(isOn('cloud')).toBe(true);
    setRemoteLayer(layer(false, true));
    expect(isOn('cloud')).toBe(false);
  });
  it('다른 원격 키는 영향 없음', () => {
    expect(gateRemoteFlag('moonNight', true, { sessionBackupExcluded: false })).toBe(true);
    expect(gateRemoteFlag('hesitation', undefined, { sessionBackupExcluded: false })).toBeUndefined();
  });
  it('주입 값 읽기: app config extra.mongSessionBackupExcluded가 정확히 true일 때만', () => {
    expect(SESSION_BACKUP_EXCLUDED_EXTRA_KEY).toBe('mongSessionBackupExcluded');
    expect(readSessionBackupExcluded({ mongSessionBackupExcluded: true })).toBe(true);
    for (const e of [undefined, null, {}, { mongSessionBackupExcluded: 'true' }, { mongSessionBackupExcluded: 1 }]) expect(readSessionBackupExcluded(e)).toBe(false);
  });
  it('앱 연결(net/index.ts)이 원격 층을 이 문으로 거친다(정적 확인 — RN 모듈이라 불러오지 않음)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/net/index.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/setRemoteLayer\(\(key\) => gateRemoteFlag\(key, remoteConfig\.remoteFlag\(key\), \{ sessionBackupExcluded: SESSION_BACKUP_EXCLUDED \}\)\)/);
    expect(src.match(/setRemoteLayer\(/g)).toHaveLength(1);
  });
});
