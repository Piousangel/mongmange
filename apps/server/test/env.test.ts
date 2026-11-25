import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateEnv } from '../src/config/env';

/** 시험 전용 공개 인증서(키는 버림 — B6a DB TLS 운영 필수값 자리) */
const TEST_CA = readFileSync(new URL('./fixtures/tls/test-ca.pem', import.meta.url), 'utf8');

const base = { DATABASE_URL: 'postgresql://u:secret-pw@db:5432/mong' };
const prod = {
  ...base,
  NODE_ENV: 'production',
  TRUSTED_PROXY_HOPS_API: '1',
  TRUSTED_PROXY_HOPS_WEB: '2',
  READY_TOKEN: 'r'.repeat(24),
  SUPABASE_URL: 'https://abcd.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'k'.repeat(40),
  RECOVERY_PEPPER: 'p'.repeat(40),
  CRON_AUDIENCE: 'https://mong-api-abc-du.a.run.app',
  CRON_SA_EMAIL: 'scheduler@mong-prod.iam.gserviceaccount.com',
  DATABASE_CA_CERT: TEST_CA,
};

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
    it('V21: OTA hops는 비우면 WEB 값(Firebase 리라이트 같은 길), 운영에서 0이면 부팅 거부', () => {
      expect(validateEnv(prod).TRUSTED_PROXY_HOPS_OTA).toBe(2);
      expect(validateEnv({ ...prod, TRUSTED_PROXY_HOPS_OTA: '3' }).TRUSTED_PROXY_HOPS_OTA).toBe(3);
      expect(() => validateEnv({ ...prod, TRUSTED_PROXY_HOPS_OTA: '0' })).toThrow(/TRUSTED_PROXY_HOPS_OTA/);
      expect(validateEnv(base).TRUSTED_PROXY_HOPS_OTA).toBe(0);
    });
    it('V21: 운영에서 서명 없는 OTA 허용은 부팅 거부, 기본은 꺼짐', () => {
      expect(validateEnv(prod).OTA_ALLOW_UNSIGNED).toBe(false);
      expect(() => validateEnv({ ...prod, OTA_ALLOW_UNSIGNED: 'true' })).toThrow(/OTA_ALLOW_UNSIGNED/);
      expect(validateEnv({ ...base, OTA_ALLOW_UNSIGNED: 'true' }).OTA_ALLOW_UNSIGNED).toBe(true);
    });
    it('READY_TOKEN이 없으면 부팅 거부', () => {
      const { READY_TOKEN: _t, ...rest } = prod;
      expect(() => validateEnv(rest)).toThrow(/READY_TOKEN/);
    });
    it.each(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RECOVERY_PEPPER', 'CRON_AUDIENCE', 'CRON_SA_EMAIL'])('B2: %s가 없으면 부팅 거부', (k) => {
      const { [k as keyof typeof prod]: _drop, ...rest } = prod;
      expect(() => validateEnv(rest)).toThrow(new RegExp(k));
    });
    it('B2: 운영 Supabase 주소는 https만, pepper는 32자 이상(값은 오류에 싣지 않음)', () => {
      expect(() => validateEnv({ ...prod, SUPABASE_URL: 'http://abcd.supabase.co' })).toThrow(/SUPABASE_URL/);
      try {
        validateEnv({ ...prod, RECOVERY_PEPPER: 'short-secret-pepper' });
        expect.unreachable();
      } catch (e) {
        expect(String(e)).toMatch(/RECOVERY_PEPPER/);
        expect(String(e)).not.toMatch(/short-secret-pepper/);
      }
    });
    it('B2 pepper 회전: 옛 판은 `판:값`(32자+), 지금 판보다 작고 겹치지 않아야 한다', () => {
      const old = 'o'.repeat(40);
      expect(validateEnv({ ...prod, RECOVERY_PEPPER_V: '2', RECOVERY_PEPPERS_PREVIOUS: `1:${old}` }).RECOVERY_PEPPERS_PREVIOUS).toEqual([{ v: 1, value: old }]);
      expect(() => validateEnv({ ...prod, RECOVERY_PEPPER_V: '2', RECOVERY_PEPPERS_PREVIOUS: `2:${old}` })).toThrow(/RECOVERY_PEPPERS_PREVIOUS/);
      expect(() => validateEnv({ ...prod, RECOVERY_PEPPER_V: '3', RECOVERY_PEPPERS_PREVIOUS: `1:${old},1:${old}` })).toThrow(/RECOVERY_PEPPERS_PREVIOUS/);
      expect(() => validateEnv({ ...prod, RECOVERY_PEPPER_V: '2', RECOVERY_PEPPERS_PREVIOUS: '1:short' })).toThrow(/RECOVERY_PEPPERS_PREVIOUS/);
    });
    it('B6a: DB CA(본문·파일 중 하나)가 없으면 부팅 거부, 검증을 끄는 sslmode도 거부', () => {
      const { DATABASE_CA_CERT: _c, ...rest } = prod;
      expect(() => validateEnv(rest)).toThrow(/DATABASE_CA_CERT/);
      expect(validateEnv({ ...rest, DATABASE_CA_FILE: '/secrets/db-ca/ca.pem' }).DATABASE_CA_FILE).toBe('/secrets/db-ca/ca.pem');
      expect(() => validateEnv({ ...prod, DATABASE_CA_FILE: '/x.pem' })).toThrow(/둘 중 하나만/);
      for (const m of ['disable', 'no-verify', 'prefer']) expect(() => validateEnv({ ...prod, DATABASE_URL: `${base.DATABASE_URL}?sslmode=${m}` })).toThrow(/DATABASE_URL/);
      expect(() => validateEnv({ ...prod, DATABASE_URL: `${base.DATABASE_URL}?sslmode=require` })).not.toThrow();
      expect(() => validateEnv({ ...prod, DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\nnope\n-----END CERTIFICATE-----' })).toThrow(/DATABASE_CA_CERT/);
    });
    it('B6a: 운영 저장소는 none·supabase만(local 거부), supabase·firebase는 필요한 값이 있어야', () => {
      expect(validateEnv({ ...prod, STORAGE_DRIVER: 'supabase' }).STORAGE_DRIVER).toBe('supabase');
      expect(() => validateEnv({ ...prod, STORAGE_DRIVER: 'local' })).toThrow(/STORAGE_DRIVER/);
      expect(() => validateEnv({ ...base, STORAGE_DRIVER: 'supabase' })).toThrow(/SUPABASE_URL과/);
      expect(() => validateEnv({ ...base, CDN_DRIVER: 'firebase' })).toThrow(/FIREBASE_HOSTING_SITE/);
      expect(validateEnv({ ...prod, CDN_DRIVER: 'firebase', FIREBASE_HOSTING_SITE: 'mongmange' }).CDN_DRIVER).toBe('firebase');
      expect(validateEnv(base)).toMatchObject({ STORAGE_DRIVER: 'none', CDN_DRIVER: 'none' });
    });
    it('개발에서는 hops 0·토큰 없음 허용', () => {
      expect(() => validateEnv({ ...base, NODE_ENV: 'development' })).not.toThrow();
    });
  });
});
