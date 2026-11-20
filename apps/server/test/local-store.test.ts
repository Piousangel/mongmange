// 로컬 저장소가 Supabase 버킷 동작(서명 업로드: 유형·크기·버킷 상한·1회·만료, 경로 조작 차단)을 흉내 내는지.
// 그럴듯한 오답: '서명 URL이 아무 유형·아무 크기나 받는다' — 그러면 커밋 전 staging이 임의 파일 창고가 된다(A4 리뷰 I10).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalObjectStore } from '../src/storage/local-store';

/** 파일 키 = {storeKey 16진 32자}/{pageKey 22자}/파일 */
const STORE = '0123456789abcdef0123456789abcdef';
const KEY = `${STORE}/AbCdEfGhIjKlMnOpQrStUv`;
function store() {
  let now = 1_000_000;
  const s = new LocalObjectStore(mkdtempSync(join(tmpdir(), 'mong-store-')), 'http://localhost:9999', () => now);
  return { s, tick: (ms: number) => (now += ms) };
}
const tokenOf = (u: string) => new URL(u).searchParams.get('token')!;

describe('서명 업로드', () => {
  it('유형·크기가 맞으면 한 번만 받는다', async () => {
    const { s } = store();
    const up = await s.signUpload('page-staging', `${KEY}/og.jpg`, { contentType: 'image/jpeg', maxBytes: 100, ttlSec: 300 });
    expect(up.signedUrl).toMatch(/^http:\/\/localhost:9999\/_local-storage\/upload\?token=/);
    expect(await s.acceptUpload(tokenOf(up.signedUrl), 'image/jpeg', new Uint8Array(50))).toBeNull();
    expect(await s.acceptUpload(tokenOf(up.signedUrl), 'image/jpeg', new Uint8Array(50))).toBe('used');
    expect(await s.stat('page-staging', `${KEY}/og.jpg`)).toEqual({ size: 50, contentType: 'image/jpeg' });
  });
  it('다른 유형·큰 파일·만료·위조 토큰은 거부', async () => {
    const { s, tick } = store();
    const up = await s.signUpload('page-staging', `${KEY}/og.jpg`, { contentType: 'image/jpeg', maxBytes: 100, ttlSec: 300 });
    const t = tokenOf(up.signedUrl);
    expect(await s.acceptUpload(t, 'application/json', new Uint8Array(10))).toBe('mime');
    expect(await s.acceptUpload(t, 'image/jpeg', new Uint8Array(101))).toBe('too_big');
    expect(await s.acceptUpload(`${t.split('.')[0]}.AAAA`, 'image/jpeg', new Uint8Array(10))).toBe('bad_token');
    tick(301_000);
    expect(await s.acceptUpload(t, 'image/jpeg', new Uint8Array(10))).toBe('expired');
  });
  it('page-staging 버킷 상한(600KB·jpeg/mp4)은 서명이 더 크게 허락해도 걸린다', async () => {
    const { s } = store();
    const up = await s.signUpload('page-staging', `${KEY}/loop.mp4`, { contentType: 'video/mp4', maxBytes: 10_000_000, ttlSec: 300 });
    expect(await s.acceptUpload(tokenOf(up.signedUrl), 'video/mp4', new Uint8Array(600 * 1024 + 1))).toBe('too_big');
    const j = await s.signUpload('page-staging', `${KEY}/snap.json`, { contentType: 'application/json', maxBytes: 100, ttlSec: 300 });
    expect(await s.acceptUpload(tokenOf(j.signedUrl), 'application/json', new Uint8Array(10))).toBe('mime');
  });
  it('키 모양 밖(경로 조작·모르는 파일 이름)은 서명조차 하지 않는다', async () => {
    const { s } = store();
    await expect(s.signUpload('page-staging', '../../etc/passwd', { contentType: 'image/jpeg', maxBytes: 1, ttlSec: 1 })).rejects.toThrow();
    await expect(s.signUpload('page-staging', `${KEY}/x.html`, { contentType: 'image/jpeg', maxBytes: 1, ttlSec: 1 })).rejects.toThrow();
    await expect(s.removePrefix('public-pages', '..')).rejects.toThrow();
    await expect(s.removePrefix('public-pages', 'AbCdEfGhIjKlMnOpQrStUv')).rejects.toThrow(); // pageKey만(접두 없음)은 모양 밖
  });
});

describe('옮기기·지우기·공개 읽기', () => {
  it('staging → public 이동 뒤 원본은 없고, 공개 읽기는 public-pages만', async () => {
    const { s } = store();
    await s.put('page-staging', `${KEY}/snap.json`, new TextEncoder().encode('{}'), 'application/json');
    expect(await s.readPublic(`${KEY}/snap.json`)).toBeNull(); // 커밋 전 파일은 공개 주소로 읽히지 않는다
    await s.move('page-staging', 'public-pages', `${KEY}/snap.json`);
    expect(await s.list('page-staging', '')).toEqual([]);
    expect((await s.readPublic(`${KEY}/snap.json`))?.contentType).toBe('application/json');
    await s.removePrefix('public-pages', KEY);
    expect(await s.list('public-pages', '')).toEqual([]);
    await s.removePrefix('public-pages', KEY); // 이미 없어도 성공
  });
  it('몽망이 접두(storeKey) 하나로 그 아래 모든 판을 지운다(계정 삭제의 마지막 그물)', async () => {
    const { s } = store();
    const other = 'ffffffffffffffffffffffffffffffff/AbCdEfGhIjKlMnOpQrStUv';
    for (const k of [`${STORE}/AAAAAAAAAAAAAAAAAAAAAA/og.jpg`, `${STORE}/BBBBBBBBBBBBBBBBBBBBBB/og.jpg`, `${other}/og.jpg`]) {
      await s.put('public-pages', k, new Uint8Array(1), 'image/jpeg');
    }
    expect((await s.list('public-pages', STORE)).length).toBe(2);
    await s.removePrefix('public-pages', STORE);
    expect(await s.list('public-pages', '')).toEqual([`${other}/og.jpg`]);
  });
});
