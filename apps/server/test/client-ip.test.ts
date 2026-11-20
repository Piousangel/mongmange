import { describe, expect, it } from 'vitest';
import { pickClientIp, rateLimitKey } from '../src/common/client-ip';

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
