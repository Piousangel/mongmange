// Supabase JWT 검사(architecture.md 3-3 ⑧, 2-4 'JWT 검증'). 서버는 **비대칭 서명만** 받는다:
//  - 공개 키는 JWKS(`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`)에서 받아 캐시한다(jose createRemoteJWKSet — 모르는 kid면 쿨다운 뒤 다시 받음).
//  - 알고리즘 허용 목록 ES256·RS256. HS256(레거시 공유 비밀 서명)·none은 키를 찾기 전에 떨어진다.
//  - iss = `{SUPABASE_URL}/auth/v1`, aud = `authenticated`, exp(시계 오차 30초), role = `authenticated`, sub = uuid.
// SUPABASE_URL이 없으면(로컬·compose) 모든 토큰을 401로 거절한다 — 인증이 '열리는' 설정은 없다.
// 오류 분류는 **허용 목록**(B2 리뷰 I1): 토큰 자체가 틀린 경우(서명·클레임·형식·키 없음)만 401이고, 그 밖의 모든 실패
// (JWKS 비 200·302·429·시간 초과·파싱 실패·연결 실패·키 가져오기 실패)는 503 — 앱이 익명 세션을 버리지 않게(3-3 ⑦ '끊김 표시만').
import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Env } from '../config/env';

export const JWT_ALGORITHMS = ['ES256', 'RS256'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VerifiedToken {
  sub: string;
}

@Injectable()
export class JwtVerifier {
  private readonly issuer: string | null;
  private readonly jwks: JWTVerifyGetKey | null;

  constructor(config: ConfigService<Env, true>) {
    const base = config.get('SUPABASE_URL', { infer: true })?.replace(/\/+$/, '');
    this.issuer = base ? `${base}/auth/v1` : null;
    this.jwks = base
      ? createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`), {
          timeoutDuration: 3000,
          cooldownDuration: 30_000,
          cacheMaxAge: 10 * 60_000,
        })
      : null;
  }

  async verify(token: string): Promise<VerifiedToken> {
    if (!this.jwks || !this.issuer) throw unauthorized();
    let payload: Record<string, unknown>;
    try {
      ({ payload } = await jwtVerify(token, this.jwks, {
        algorithms: JWT_ALGORITHMS,
        issuer: this.issuer,
        audience: 'authenticated',
        requiredClaims: ['exp', 'sub'],
        clockTolerance: 30,
      }));
    } catch (e) {
      if (isTokenFault(e)) throw unauthorized();
      throw new ServiceUnavailableException({ code: 'auth_unavailable', message: '로그인 확인을 잠시 할 수 없습니다' });
    }
    if (payload.role !== 'authenticated' || typeof payload.sub !== 'string' || !UUID_RE.test(payload.sub)) throw unauthorized();
    return { sub: payload.sub.toLowerCase() };
  }
}

function unauthorized(): UnauthorizedException {
  // 이유를 나누지 않는다(만료·서명·발급자 — 조작하는 쪽에 단서를 주지 않음). 앱은 세션을 새로 고친다
  return new UnauthorizedException({ code: 'unauthorized', message: '로그인이 필요합니다' });
}

/** 토큰 쪽 잘못(401)인 오류 — 이 목록 밖은 모두 우리 쪽·Supabase 쪽 장애(503)로 본다 */
const TOKEN_FAULTS = [
  errors.JWSSignatureVerificationFailed,
  errors.JWTClaimValidationFailed,
  errors.JWTExpired,
  errors.JWSInvalid,
  errors.JWTInvalid,
  errors.JWKSNoMatchingKey,
  errors.JWKSMultipleMatchingKeys,
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
];

export function isTokenFault(e: unknown): boolean {
  return TOKEN_FAULTS.some((C) => e instanceof C);
}
