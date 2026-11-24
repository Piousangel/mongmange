import { describe, expect, it } from 'vitest';
import { pickClientIp, rateLimitKey, reportKeyPrefix, routeGroupOf } from '../src/common/client-ip';
import { sameOriginPost } from '../src/pages/m.controller';

describe('pickClientIp — 믿을 XFF 위치는 TRUSTED_PROXY_HOPS 하나', () => {
  it('hops 0이면 XFF를 무시하고 소켓 주소', () => {
    expect(pickClientIp('1.1.1.1', '10.0.0.1', 0)).toBe('10.0.0.1');
  });
  it('hops 1이면 오른쪽 끝(마지막 프록시가 본 주소)', () => {
    expect(pickClientIp('6.6.6.6, 1.2.3.4', '10.0.0.1', 1)).toBe('1.2.3.4');
  });
  it('hops 2면 오른쪽에서 두 번째 — 클라이언트가 왼쪽에 위조한 값은 무시된다', () => {
    expect(pickClientIp('6.6.6.6, 1.2.3.4, 35.1.1.1', '10.0.0.1', 2)).toBe('1.2.3.4');
  });
  it('여러 줄 헤더를 이어 붙여 읽는다', () => {
    expect(pickClientIp(['6.6.6.6', '1.2.3.4, 35.1.1.1'], undefined, 2)).toBe('1.2.3.4');
  });
  it('체인이 hops보다 짧거나 IP가 아니면 소켓 주소', () => {
    expect(pickClientIp('1.2.3.4', '10.0.0.1', 2)).toBe('10.0.0.1');
    expect(pickClientIp('garbage, 35.1.1.1', '10.0.0.1', 2)).toBe('10.0.0.1');
  });
  it('포트가 붙은 값도 읽는다', () => {
    expect(pickClientIp('1.2.3.4:5555', undefined, 1)).toBe('1.2.3.4');
    expect(pickClientIp('[2001:db8::1]:443', undefined, 1)).toBe('2001:db8::1');
  });
});

describe('rateLimitKey — IPv6는 /64로 접는다', () => {
  it('IPv4는 그대로', () => expect(rateLimitKey('1.2.3.4')).toBe('1.2.3.4'));
  it('IPv4-매핑 IPv6는 IPv4로', () => expect(rateLimitKey('::ffff:1.2.3.4')).toBe('1.2.3.4'));
  it('같은 /64 안의 주소는 같은 키', () => {
    const a = rateLimitKey('2001:db8:abcd:12:1111:2222:3333:4444');
    const b = rateLimitKey('2001:0db8:abcd:0012::9');
    expect(a).toBe('2001:db8:abcd:12::/64');
    expect(b).toBe(a);
  });
  it('다른 /64는 다른 키', () => {
    expect(rateLimitKey('2001:db8:abcd:13::1')).not.toBe(rateLimitKey('2001:db8:abcd:12::1'));
  });
  it('축약·존 ID·끝 IPv4 표기', () => {
    expect(rateLimitKey('::1')).toBe('0:0:0:0::/64');
    expect(rateLimitKey('fe80::1%en0')).toBe('fe80:0:0:0::/64');
    expect(rateLimitKey('64:ff9b::1.2.3.4')).toBe('64:ff9b:0:0::/64');
  });
  it('없으면 unknown', () => expect(rateLimitKey(undefined)).toBe('unknown'));
});

describe('reportKeyPrefix — 신고자 키는 IPv6 /48(B5 리뷰 H2), 레이트 리밋은 /64 그대로', () => {
  it('같은 /48의 서로 다른 /64는 신고자 하나, 리밋 키는 둘', () => {
    expect(reportKeyPrefix('2001:db8:aa:bb::1')).toBe('2001:db8:aa::/48');
    expect(reportKeyPrefix('2001:db8:aa:ffff:1:2:3:4')).toBe('2001:db8:aa::/48');
    expect(rateLimitKey('2001:db8:aa:bb::1')).not.toBe(rateLimitKey('2001:db8:aa:cc::1'));
    expect(reportKeyPrefix('2001:db8:ab::1')).not.toBe(reportKeyPrefix('2001:db8:aa::1'));
    expect(reportKeyPrefix('::ffff:192.0.2.1')).toBe('192.0.2.1');
    expect(reportKeyPrefix('192.0.2.1')).toBe('192.0.2.1');
    expect(reportKeyPrefix(undefined)).toBe('unknown');
  });
});

describe('sameOriginPost — 신고 같은 출처 판정(B5 리뷰 C1)', () => {
  const S = 'https://mongmang.ink';
  it.each([
    ['브라우저 같은 출처(no-referrer라 Origin null)', { 'sec-fetch-site': 'same-origin', origin: 'null' }, true, true],
    ['다른 사이트', { 'sec-fetch-site': 'cross-site', origin: S }, true, false],
    ['같은 사이트 다른 출처', { 'sec-fetch-site': 'same-site' }, true, false],
    ['사용자 주도(none)', { 'sec-fetch-site': 'none' }, true, false],
    ['옛 브라우저 Origin = 사이트', { origin: S }, true, true],
    ['옛 브라우저 Origin null(샌드박스 iframe)', { origin: 'null' }, true, false],
    ['옛 브라우저 Origin 없음(폼)', {}, true, false],
    ['앱 JSON(Origin 없음)', {}, false, true],
    ['다른 출처 JSON', { origin: 'https://evil.example' }, false, false],
  ])('%s', (_n, h, form, ok) => expect(sameOriginPost(h as Record<string, string>, S, form)).toBe(ok));
});

describe('경로 그룹(V21 OTA)', () => {
  it('/api/v1/ota/** = ota 그룹, /m/** = web, 나머지 api', () => {
    expect(routeGroupOf('/api/v1/ota/manifest')).toBe('ota');
    expect(routeGroupOf('/api/v1/ota/assets/abc?x=1')).toBe('ota');
    expect(routeGroupOf('/api/v1/otaz')).toBe('api');
    expect(routeGroupOf('/m/K7M3QX9P')).toBe('web');
    expect(routeGroupOf('/api/v1/ping')).toBe('api');
  });
});
