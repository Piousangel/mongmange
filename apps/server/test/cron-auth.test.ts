// /internal/cron/* OIDC 검사(2-4, B6 체크 'aud·서비스 계정 이메일'). 그럴듯한 오답: 'Google이 서명한 토큰이면 통과'
// — 다른 서비스(aud)·다른 서비스 계정(email)·이메일 미검증 토큰도 Google 서명은 맞다. 셋 다 404여야 한다.
import { ConfigService } from '@nestjs/config';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { CronAuth } from '../src/cron/cron.controller';

const AUD = 'https://mong-api-abc-du.a.run.app';
const SA = 'scheduler@mong-prod.iam.gserviceaccount.com';
let auth: CronAuth;
let sign: (claims: Record<string, unknown>, aud?: string, iss?: string) => Promise<string>;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'g1', alg: 'RS256' };
  const cfg = { get: (k: string) => ({ CRON_AUDIENCE: AUD, CRON_SA_EMAIL: SA })[k] } as unknown as ConfigService<never, true>;
  auth = new CronAuth(cfg);
  auth.getKey = createLocalJWKSet({ keys: [jwk] });
  sign = (claims, aud = AUD, iss = 'https://accounts.google.com') =>
    new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'g1' }).setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime('5m').sign(privateKey);
});

describe('CronAuth', () => {
  it('전용 서비스 계정·이 서비스 aud·검증된 이메일이면 통과', async () => {
    await expect(auth.check(`Bearer ${await sign({ email: SA, email_verified: true })}`)).resolves.toBeUndefined();
  });
  it('다른 aud·다른 계정·미검증·다른 발급자·토큰 없음은 404', async () => {
    const no = (h: string | undefined) => expect(auth.check(h)).rejects.toMatchObject({ status: 404 });
    await no(`Bearer ${await sign({ email: SA, email_verified: true }, 'https://other-svc.a.run.app')}`);
    await no(`Bearer ${await sign({ email: 'someone@mong-prod.iam.gserviceaccount.com', email_verified: true })}`);
    await no(`Bearer ${await sign({ email: SA, email_verified: false })}`);
    await no(`Bearer ${await sign({ email: SA, email_verified: true }, AUD, 'https://evil.example')}`);
    await no(undefined);
  });
  it('설정(CRON_AUDIENCE·CRON_SA_EMAIL)이 없으면 늘 404', async () => {
    const off = new CronAuth({ get: () => undefined } as unknown as ConfigService<never, true>);
    await expect(off.check(`Bearer ${await sign({ email: SA, email_verified: true })}`)).rejects.toMatchObject({ status: 404 });
  });
});
