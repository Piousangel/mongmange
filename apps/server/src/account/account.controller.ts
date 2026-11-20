// 계정 API(architecture.md v2.2 3-2 B2 행): bootstrap·recovery-code·recover·DELETE /me. 모두 JWT, 응답 no-store.
// 글귀가 오가는 요청·응답 본문은 로그에 남지 않는다(logging.ts 규칙 4 — 본문은 어떤 로그에도 직렬화하지 않는다).
import { Body, Controller, Delete, Header, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  bootstrapRequestSchema,
  recoverRequestSchema,
  type BootstrapResponse,
  type DeleteMeResponse,
  type RecoverResponse,
  type RecoveryCodeResponse,
} from '@mong/contract';
import { AllowUnlinked, Auth, AuthGuard, linkedUser, type AuthContext } from '../auth/auth.guard';
import { ClientIpService, rateLimitKey, type IpRequest } from '../common/client-ip';
import { openApiSchema } from '../common/openapi-schema';
import { parseBody } from '../common/parse';
import { DeletionService } from '../deletion/deletion.service';
import { AccountService } from './account.service';

@ApiTags('account')
@ApiBearerAuth()
@Controller('api/v1')
@UseGuards(AuthGuard)
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly deletion: DeletionService,
    private readonly ips: ClientIpService,
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
  @ApiResponse({ status: 200, description: '{creature:{code}, save: SaveMeta|null, newCode} — 새 글귀를 한 번 보여 준다' })
  @ApiResponse({ status: 404, description: '글귀 없음·틀림' })
  @ApiResponse({ status: 409, description: 'has_creature — 이 기기 로그인에 이미 몽망이가 있음' })
  @ApiResponse({ status: 429, description: 'IP 접두당 5/시간·글귀당 10/일' })
  recover(@Auth() a: AuthContext, @Req() req: IpRequest, @Body() raw: unknown): Promise<RecoverResponse> {
    const b = parseBody(recoverRequestSchema, raw);
    return this.account.recover(a, this.ipKey(req), b.code, b.ageGate);
  }

  @Delete('me')
  @HttpCode(202)
  @Header('cache-control', 'no-store')
  @ApiResponse({ status: 202, description: '{receipt} — 삭제 영수증(24시간, GET /deletion/{receipt}로 인증 없이 조회)' })
  deleteMe(@Auth() a: AuthContext): Promise<DeleteMeResponse> {
    return this.deletion.deleteUser(linkedUser(a), { channel: 'app', kind: 'user_request' });
  }

  private ipKey(req: IpRequest): string {
    return rateLimitKey(this.ips.clientIp(req, 'api'));
  }
}
