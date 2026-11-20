// JWT 검사(architecture 3-3 ⑧) — 실제 원격 JWKS 경로(로컬 HTTP 서버)로. 그럴듯한 오답: '서명만 맞으면 통과'.
// 아래 거부 목록 하나라도 통과하면 실패다: HS256(공유 비밀)·alg none·다른 발급자·다른 aud·만료·role anon·sub 없음·uuid 아닌 sub·모르는 키.
import { createHmac, generateKeyPairSync, randomUUID, sign as nodeSign } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JwtVerifier } from '../src/auth/jwt-verifier';
import { startFakeSupabase, type FakeSupabase } from './fake-supabase';

let sb: FakeSupabase;
let v: JwtVerifier;

const cfg = (url?: string) => ({ get: (k: string) => (k === 'SUPABASE_URL' ? url : undefined) }) as unknown as ConfigService<never, true>;
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

beforeAll(async () => {
  sb = await startFakeSupabase();
  v = new JwtVerifier(cfg(sb.url));
});
afterAll(async () => {
  await sb?.close();
});

async function rejects(token: string): Promise<void> {
  await expect(v.verify(token)).rejects.toMatchObject({ status: 401 });
}

describe('JwtVerifier — 받는 것', () => {
  it('Supabase 익명 로그인 모양(ES256·kid·iss·aud·role)은 sub를 돌려준다', async () => {
    const { sub, token } = await sb.signIn();
    await expect(v.verify(token)).resolves.toEqual({ sub });
  });
  it('JWKS는 캐시한다(토큰 여러 개에 한 번)', async () => {
    const before = sb.jwksHits;
    for (let i = 0; i < 5; i++) await v.verify((await sb.signIn()).token);
    expect(sb.jwksHits - before).toBe(0);
  });
});

describe('JwtVerifier — 거절하는 것', () => {
  const payload = () => ({ sub: randomUUID(), role: 'authenticated', aud: 'authenticated', iss: `${sb.url}/auth/v1`, exp: Math.floor(Date.now() / 1000) + 600 });

  it('HS256(레거시 공유 비밀)은 서명이 맞아도 거절', async () => {
    const h = b64({ alg: 'HS256', typ: 'JWT' });
    const p = b64(payload());
    const sig = createHmac('sha256', 'super-secret-jwt-token-with-at-least-32-characters').update(`${h}.${p}`).digest('base64url');
    await rejects(`${h}.${p}.${sig}`);
  });
  it('alg none 거절', async () => {
    await rejects(`${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload())}.`);
    await rejects(`${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload())}.x`);
  });
  it('JWKS에 없는 키로 서명(kid 위조)하면 거절', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const h = b64({ alg: 'ES256', typ: 'JWT', kid: 'test-key-1' });
    const p = b64(payload());
    const sig = nodeSign('sha256', Buffer.from(`${h}.${p}`), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    await rejects(`${h}.${p}.${sig}`);
  });
  it('다른 발급자·다른 aud·만료·role anon·sub 없음·uuid 아닌 sub', async () => {
    await rejects(await sb.token({}, { iss: 'https://evil.supabase.co/auth/v1' }));
    await rejects(await sb.token({}, { aud: 'anon' }));
    await rejects(await sb.token({}, { exp: '-5m' }));
    await rejects(await sb.token({ role: 'anon' }));
    await rejects(await sb.token({ role: 'service_role' }));
    await rejects(await sb.token({}, { sub: 'not-a-uuid' }));
  });
  it('서명 한 글자를 바꾸면 거절', async () => {
    const { token } = await sb.signIn();
    const bad = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA');
    await rejects(bad);
  });
  it('SUPABASE_URL이 없으면(로컬) 어떤 토큰도 401 — 인증이 열리는 설정은 없다', async () => {
    const closed = new JwtVerifier(cfg(undefined));
    await expect(closed.verify((await sb.signIn()).token)).rejects.toMatchObject({ status: 401 });
  });
  it.each([500, 503, 429, 302, 'garbage'] as const)('JWKS가 %s면 유효한 토큰도 401이 아니라 503(리뷰 I1 — 허용 목록 분류)', async (st) => {
    const fresh = new JwtVerifier(cfg(sb.url)); // 캐시 없는 검사기 — 반드시 JWKS를 받으러 간다
    const { token } = await sb.signIn();
    sb.jwksStatus = st;
    try {
      await expect(fresh.verify(token)).rejects.toMatchObject({ status: 503 });
    } finally {
      sb.jwksStatus = 200;
    }
    await expect(fresh.verify(token)).resolves.toMatchObject({ sub: expect.any(String) });
  });
  it('JWKS에 닿지 못하면 401이 아니라 503(앱이 세션을 버리지 않게)', async () => {
    const down = new JwtVerifier(cfg('http://127.0.0.1:1'));
    await expect(down.verify((await sb.signIn()).token)).rejects.toMatchObject({ status: 503 });
  });
});
