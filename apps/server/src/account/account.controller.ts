// 계정 API(architecture.md v2.2 3-2 B2 행): bootstrap·recovery-code·recover·DELETE /me·GET /me/data(C12f 맡긴 것 보기). 모두 JWT, 응답 no-store.
// 글귀가 오가는 요청·응답 본문은 로그에 남지 않는다(logging.ts 규칙 4 — 본문은 어떤 로그에도 직렬화하지 않는다).
import { Body, Controller, Delete, Get, Header, HttpCode, NotFoundException, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  bootstrapRequestSchema,
  recoverRequestSchema,
  type BootstrapResponse,
  type DeleteMeResponse,
  type MyData,
  type RecoverResponse,
  type RecoveryCodeResponse,
} from '@mong/contract';
import { AllowUnlinked, alreadyGone, Auth, AuthGuard, linkedUser, movedAway, type AuthContext } from '../auth/auth.guard';
import { ClientIpService, rateLimitKey, type IpRequest } from '../common/client-ip';
import { openApiSchema } from '../common/openapi-schema';
import { parseBody } from '../common/parse';
import { DeletionService } from '../deletion/deletion.service';
import { AccountService } from './account.service';
import { MyDataService } from './my-data.service';

@ApiTags('account')
@ApiBearerAuth()
@Controller('api/v1')
@UseGuards(AuthGuard)
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly deletion: DeletionService,
    private readonly ips: ClientIpService,
    private readonly myData: MyDataService,
  ) {}

  @Post('me/bootstrap')
  @HttpCode(200)
  @AllowUnlinked()
  @Header('cache-control', 'no-store')
  @ApiBody({ schema: openApiSchema(bootstrapRequestSchema) })
  @ApiResponse({ status: 200, description: '{userId, creature:{code}} — 멱등' })
  @ApiResponse({ status: 400, description: 'ageGate 없음·형식 틀림(미달 값은 받을 칸이 없다)' })
  @ApiResponse({ status: 401, description: 'auth.users에 없는 sub(삭제된 계정의 남은 토큰)' })
  @ApiResponse({ status: 429, description: '새 계정 IP 접두당 5/시간·20/일' })
  @ApiResponse({ status: 503, description: 'account_cap(서비스 전체 하루 상한)·auth_unavailable' })
  bootstrap(@Auth() a: AuthContext, @Req() req: IpRequest, @Body() raw: unknown): Promise<BootstrapResponse> {
    const { ageGate } = parseBody(bootstrapRequestSchema, raw);
    return this.account.bootstrap(a, this.ipKey(req), ageGate);
  }

  @Post('recovery-code')
  @HttpCode(200)
  @Header('cache-control', 'no-store')
  @ApiResponse({ status: 200, description: '{code:"XXXX-XXXX-XXXX-XXXX"} — 한 번만 보여 준다. 다시 부르면 옛 글귀 무효' })
  recoveryCode(@Auth() a: AuthContext): Promise<RecoveryCodeResponse> {
    return this.account.issueRecoveryCode(linkedUser(a));
  }

  @Post('recover')
  @HttpCode(200)
  @AllowUnlinked()
  @Header('cache-control', 'no-store')
  @ApiBody({ schema: openApiSchema(recoverRequestSchema) })
  @ApiResponse({ status: 200, description: '{creature:{code}, save: SaveMeta|null, newCode} — 새 글귀를 한 번 보여 준다. 멱등(B2b): 같은 기기가 같은 글귀로 다시 부르면 replay:true + 같은 인장 코드·같은 새 글귀' })
  @ApiResponse({ status: 404, description: '글귀 없음·틀림' })
  @ApiResponse({ status: 401, description: 'unauthorized(토큰) · no_account(유효한 토큰이지만 지워진·없는 로그인)' })
  @ApiResponse({ status: 409, description: 'has_creature — 이 기기 로그인에 이미 다른 몽망이가 있음(재시도가 아님)' })
  @ApiResponse({ status: 429, description: 'IP 접두당 5/시간·글귀당 10/일' })
  recover(@Auth() a: AuthContext, @Req() req: IpRequest, @Body() raw: unknown): Promise<RecoverResponse> {
    const b = parseBody(recoverRequestSchema, raw);
    return this.account.recover(a, this.ipKey(req), b.code, b.ageGate);
  }

  @Get('me/data')
  @Header('cache-control', 'no-store')
  @ApiResponse({ status: 200, description: 'MyData — 서버에 맡긴 것의 메타(본문·이름·글귀·sub 없음). 처리방침 12절 열람(C12f)' })
  @ApiResponse({ status: 401, description: 'unauthorized(토큰) · no_account(이 로그인에 맡긴 것이 없음)' })
  @ApiResponse({ status: 410, description: 'moved — 다른 기기로 옮겨 감' })
  @ApiResponse({ status: 429, description: 'rate_limited — 사용자당 MY_DATA_PER_HOUR/시간' })
  data(@Auth() a: AuthContext): Promise<MyData> {
    return this.myData.view(linkedUser(a));
  }

  @Delete('me')
  @HttpCode(202)
  @AllowUnlinked()
  @Header('cache-control', 'no-store')
  @ApiResponse({ status: 202, description: '{receipt} — 삭제 영수증(24시간, GET /deletion/{receipt}로 인증 없이 조회)' })
  @ApiResponse({ status: 401, description: 'unauthorized — 토큰 없음·서명·클레임·만료가 틀림' })
  @ApiResponse({ status: 410, description: 'no_account — 이 로그인에 붙은 사용자가 없음(이미 지움·맡긴 적 없음, 멱등) / moved — 다른 기기로 옮겨 감' })
  async deleteMe(@Auth() a: AuthContext): Promise<DeleteMeResponse> {
    if (a.revoked) throw movedAway();
    // B2b 멱등: 토큰의 sub에 붙은 행이 없다는 사실만 본다(지운 사용자를 알아보는 흔적을 남기지 않는다)
    if (!a.userId) throw alreadyGone();
    try {
      return await this.deletion.deleteUser(a.userId, { channel: 'app', kind: 'user_request' });
    } catch (e) {
      // 같은 사용자의 삭제 둘이 겹치면 늦은 쪽은 사용자 행을 못 찾는다(deletion.service no_account 404) — 그것도 '이미 지워짐'
      if (e instanceof NotFoundException) throw alreadyGone();
      throw e;
    }
  }

  private ipKey(req: IpRequest): string {
    return rateLimitKey(this.ips.clientIp(req, 'api'));
  }
}
