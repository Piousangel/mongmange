// 인증 가드(architecture.md 3-2 '인증 공통 규칙'):
//  ① Authorization: Bearer <Supabase JWT> → JwtVerifier(비대칭·iss·aud·exp·role).
//  ② sub → user_auth. 행이 없으면 401 — 단 bootstrap·recover(@AllowUnlinked)는 계정을 만들거나 붙이는 길이라 통과.
//  ③ 그 행이 revoked면 410 `moved`(되찾기로 다른 기기에 옮겨 감) — 앱은 세션을 비우고 로컬 게임을 계속한다.
// 토큰 문자열은 어디에도 남기지 않는다(로그 규칙은 logging.ts — 헤더는 직렬화하지 않는다).
import {
  createParamDecorator,
  GoneException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { JwtVerifier } from './jwt-verifier';

const ALLOW_UNLINKED = 'mong.allowUnlinked';
/** bootstrap·recover 전용: user_auth 행이 없어도 통과(req.auth.userId = null) */
export const AllowUnlinked = () => SetMetadata(ALLOW_UNLINKED, true);

export interface AuthContext {
  sub: string;
  /** 붙어 있는 사용자. AllowUnlinked 경로에서만 null일 수 있다 */
  userId: string | null;
  /** 이 sub가 끊긴(revoked) 로그인인지 — AllowUnlinked 경로가 410을 직접 판단하게 */
  revoked: boolean;
}

type AuthedRequest = { headers: Record<string, string | string[] | undefined>; auth?: AuthContext };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtVerifier,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const h = req.headers.authorization;
    const m = typeof h === 'string' ? /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(h) : null;
    if (!m) throw new UnauthorizedException({ code: 'unauthorized', message: '로그인이 필요합니다' });
    const { sub } = await this.jwt.verify(m[1]!);
    const link = await this.prisma.userAuth.findUnique({ where: { sub }, select: { userId: true, revokedAt: true } });
    const unlinkedOk = this.reflector.getAllAndOverride<boolean>(ALLOW_UNLINKED, [ctx.getHandler(), ctx.getClass()]);
    if (!unlinkedOk) {
      if (!link) throw new UnauthorizedException({ code: 'unauthorized', message: '로그인이 필요합니다' });
      if (link.revokedAt) throw movedAway();
    }
    req.auth = { sub, userId: link && !link.revokedAt ? link.userId : null, revoked: !!link?.revokedAt };
    return true;
  }
}

export function movedAway(): GoneException {
  return new GoneException({ code: 'moved', message: '이 몽망이는 다른 기기로 옮겨졌어요' });
}

/** 컨트롤러 인자: 가드가 붙인 인증 문맥 */
export const Auth = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthContext => {
  const a = ctx.switchToHttp().getRequest<AuthedRequest>().auth;
  if (!a) throw new UnauthorizedException({ code: 'unauthorized', message: '로그인이 필요합니다' });
  return a;
});

/** 붙어 있는 사용자 id(AllowUnlinked가 아닌 경로에서는 늘 있다) */
export function linkedUser(a: AuthContext): string {
  if (!a.userId) throw new UnauthorizedException({ code: 'unauthorized', message: '로그인이 필요합니다' });
  return a.userId;
}
