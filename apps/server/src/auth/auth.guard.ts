// 인증 가드(architecture.md 3-2 '인증 공통 규칙'):
//  ① Authorization: Bearer <Supabase JWT> → JwtVerifier(비대칭·iss·aud·exp·role).
//  ② sub → user_auth. 행이 없으면 401 — 단 bootstrap·recover(@AllowUnlinked)는 계정을 만들거나 붙이는 길이라 통과.
//  ③ 그 행이 revoked면 410 `moved`(되찾기로 다른 기기에 옮겨 감) — 앱은 세션을 비우고 로컬 게임을 계속한다.
//  ④ 붙은 사용자가 있으면 활동 달을 갱신(activity.ts, V25·K20) — 인증된 요청의 공통 지점이 여기 하나다. 같은 달이면 쓰기 0.
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
import { ActivityTracker } from './activity';
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
    private readonly activity: ActivityTracker,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const h = req.headers.authorization;
    const m = typeof h === 'string' ? /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(h) : null;
    if (!m) throw new UnauthorizedException({ code: 'unauthorized', message: '로그인이 필요합니다' });
    const { sub } = await this.jwt.verify(m[1]!);
    // 로그인 → 사용자 + 활동 달을 한 문장으로(V25 리뷰 M1 — 관계 select는 Prisma가 SELECT 둘로 낸다). 요청당 DB 읽기는 V25 전과 같은 1회
    const [link] = await this.prisma.$queryRaw<{ user_id: string; revoked_at: Date | null; last_active_month: Date | null }[]>`
      SELECT a.user_id, a.revoked_at, u.last_active_month
        FROM app.user_auth a JOIN app.users u ON u.id = a.user_id
       WHERE a.sub = ${sub}::uuid`;
    const unlinkedOk = this.reflector.getAllAndOverride<boolean>(ALLOW_UNLINKED, [ctx.getHandler(), ctx.getClass()]);
    if (!unlinkedOk) {
      if (!link) throw new UnauthorizedException({ code: 'unauthorized', message: '로그인이 필요합니다' });
      if (link.revoked_at) throw movedAway();
    }
    const userId = link && !link.revoked_at ? link.user_id : null;
    req.auth = { sub, userId, revoked: !!link?.revoked_at };
    if (userId) await this.activity.touch(userId, link!.last_active_month);
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
