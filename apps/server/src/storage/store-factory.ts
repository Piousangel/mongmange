// 드라이버 고르기(B6a): STORAGE_DRIVER → ObjectStore, CDN_DRIVER → CdnInvalidator. cloud.module.ts의 공급자가 부른다.
// 기동 때 한 번 Supabase 버킷 설정을 정본(BUCKET_POLICY)과 대조해 다르면 error 로그(이름·항목만). 부팅은 막지 않는다.
import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { CountingInvalidator, type CdnInvalidator } from '../cdn/cdn-purge';
import { FirebaseHostingInvalidator } from '../cdn/firebase-invalidator';
import type { Env } from '../config/env';
import { LocalObjectStore } from './local-store';
import { NoStore, type ObjectStore } from './object-store';
import { SupabaseObjectStore } from './supabase-store';

export function makeObjectStore(c: ConfigService<Env, true>, now: () => number): ObjectStore {
  const driver = c.get('STORAGE_DRIVER', { infer: true });
  if (driver === 'local') {
    const base = c.get('STORAGE_LOCAL_BASE_URL', { infer: true }) ?? `http://localhost:${c.get('PORT', { infer: true })}`;
    return new LocalObjectStore(resolve(c.get('STORAGE_LOCAL_DIR', { infer: true })), base.replace(/\/+$/, ''), now);
  }
  if (driver === 'supabase') {
    // env.ts가 supabase일 때 두 값을 요구한다
    const store = new SupabaseObjectStore({ url: c.get('SUPABASE_URL', { infer: true })!, serviceKey: c.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true })! });
    const log = new Logger('Storage');
    void store.checkBuckets().then(
      (problems) => problems.length && log.error({ code: 'storage_bucket_mismatch', problems }, '버킷 설정이 정본과 다르다(BUCKET_POLICY)'),
      (e: unknown) => log.warn({ code: 'storage_bucket_check_failed', type: e instanceof Error ? e.name : 'unknown' }, '버킷 설정 확인 실패'),
    );
    return store;
  }
  return new NoStore();
}

export function makeCdnInvalidator(c: ConfigService<Env, true>): CdnInvalidator {
  if (c.get('CDN_DRIVER', { infer: true }) === 'firebase') return new FirebaseHostingInvalidator({ site: c.get('FIREBASE_HOSTING_SITE', { infer: true })! });
  if (c.get('NODE_ENV', { infer: true }) === 'production') {
    new Logger('CdnPurge').warn({ code: 'cdn_purge_noop' }, 'CDN_DRIVER=none — /m 캐시는 s-maxage 5분이 바닥(B6a: firebase로 켠다)');
  }
  return new CountingInvalidator();
}
