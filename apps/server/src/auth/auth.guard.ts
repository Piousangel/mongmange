// 인증 가드(architecture.md 3-2 '인증 공통 규칙'):
//  ① Authorization: Bearer <Supabase JWT> → JwtVerifier(비대칭·iss·aud·exp·role).
//  ② sub → user_auth. 행이 없으면 401 `no_account` — 단 bootstrap·recover·DELETE /me(@AllowUnlinked)는 통과(만들거나 붙이는 길,
//     DELETE는 '지울 것 없음' 410을 직접 낸다). 토큰 문제(①)는 401 `unauthorized`로 따로 — 두 코드는 B2b(@mong/contract AUTH_ERROR).
//     정보 노출: no_account는 서명·발급자·대상·만료가 모두 맞는 토큰에서만 나온다. sub는 그 서명된 토큰에서만 오므로, 알 수 있는 것은
//     토큰 주인 자신의 로그인이 붙어 있는지뿐이다(남의 sub를 넣은 위조 토큰은 ①에서 DB를 보기 전에 같은 401 unauthorized로 떨어진다).
//     지운 계정을 알아보는 흔적은 따로 두지 않는다 — '행 없음' 하나로 판단한다(삭제 뒤 흔적 0).
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
/** bootstrap·recover·DELETE /me 전용: user_auth 행이 없어도·끊겼어도 통과(req.auth.userId = null) — 핸들러가 직접 판단한다 */
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
      if (!link) throw noAccount();
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

/** 유효하게 서명된 토큰인데 서버에 그 로그인(sub)에 붙은 사용자가 없다 — 토큰을 새로 받아도 같다(B2b) */
export function noAccount(): UnauthorizedException {
  return new UnauthorizedException({ code: 'no_account', message: '이 로그인에 맡긴 것이 없습니다' });
}

/** DELETE /me 전용: 지울 것이 없다(이미 지움·맡긴 적 없음) — 멱등 '이미 지워짐'(B2b) */
export function alreadyGone(): GoneException {
  return new GoneException({ code: 'no_account', message: '이미 지워졌거나 맡긴 것이 없습니다' });
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
