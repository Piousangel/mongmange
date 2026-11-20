import { describe, expect, it } from 'vitest';
import { validateEnv } from '../src/config/env';

const base = { DATABASE_URL: 'postgresql://u:secret-pw@db:5432/mong' };
const prod = { ...base, NODE_ENV: 'production', TRUSTED_PROXY_HOPS_API: '1', TRUSTED_PROXY_HOPS_WEB: '2', READY_TOKEN: 'r'.repeat(24) };

describe('환경 변수 검증(zod)', () => {
  it('기본값을 채운다', () => {
    const e = validateEnv(base);
    expect(e).toMatchObject({
      PORT: 8080,
      DB_POOL_MAX: 5,
      DB_CONNECT_TIMEOUT_MS: 1500,
      READY_TIMEOUT_MS: 2000,
      TRUSTED_PROXY_HOPS_API: 0,
      TRUSTED_PROXY_HOPS_WEB: 0,
      OPENAPI_UI: false,
      APP_VERSION: 'dev',
    });
  });
  it('문자열 숫자·불리언을 바꾼다', () => {
    const e = validateEnv({ ...base, PORT: '9000', OPENAPI_UI: 'true', TRUSTED_PROXY_HOPS_API: '2' });
    expect(e.PORT).toBe(9000);
    expect(e.OPENAPI_UI).toBe(true);
    expect(e.TRUSTED_PROXY_HOPS_API).toBe(2);
  });
  it('DATABASE_URL이 없거나 postgres가 아니면 시작하지 않는다', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ DATABASE_URL: 'mysql://x@y/z' })).toThrow(/DATABASE_URL/);
  });
  it('오류 메시지에 값(비밀번호)을 싣지 않는다', () => {
    try {
      validateEnv({ ...base, PORT: 'secret-pw' });
      expect.unreachable();
    } catch (e) {
      expect(String(e)).toMatch(/PORT/);
      expect(String(e)).not.toMatch(/secret-pw/);
    }
  });
  it('풀 연결 제한 시간은 READY_TIMEOUT_MS보다 짧아야 한다', () => {
    expect(() => validateEnv({ ...base, DB_CONNECT_TIMEOUT_MS: '2000', READY_TIMEOUT_MS: '2000' })).toThrow(/DB_CONNECT_TIMEOUT_MS/);
  });

  describe('운영(NODE_ENV=production) 필수값', () => {
    it('다 있으면 통과', () => {
      expect(validateEnv(prod)).toMatchObject({ TRUSTED_PROXY_HOPS_API: 1, TRUSTED_PROXY_HOPS_WEB: 2 });
    });
    it.each(['TRUSTED_PROXY_HOPS_API', 'TRUSTED_PROXY_HOPS_WEB'])('%s가 없거나 0이면 부팅 거부', (k) => {
      const { [k as keyof typeof prod]: _drop, ...rest } = prod;
      expect(() => validateEnv(rest)).toThrow(new RegExp(k));
      expect(() => validateEnv({ ...prod, [k]: '0' })).toThrow(new RegExp(k));
    });
    it('READY_TOKEN이 없으면 부팅 거부', () => {
      const { READY_TOKEN: _t, ...rest } = prod;
      expect(() => validateEnv(rest)).toThrow(/READY_TOKEN/);
    });
    it('개발에서는 hops 0·토큰 없음 허용', () => {
      expect(() => validateEnv({ ...base, NODE_ENV: 'development' })).not.toThrow();
    });
  });
});
