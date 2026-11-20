// 인증 없는 삭제 경로 둘(architecture.md v2.2 3-2·3-8):
//  - GET /api/v1/deletion/{receipt}: 영수증이 곧 권한. IP 접두당 30/분, no-store. 계정이 이미 없으므로 JWT를 받지 않는다.
//  - POST /api/v1/deletion/web: 웹 /delete 페이지(앱 없이 지우기). 인장 코드 + 되찾기 글귀가 둘 다 맞을 때만(3-8 ②).
//    CORS는 WEB_ORIGIN 한 곳만(페이지는 mongmang.ink 정적, API는 Cloud Run 서울 직접 — 글귀가 국외 CDN 엣지를 지나지 않는다, 2-1).
import { Body, Controller, Get, Header, HttpCode, Options, Param, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiExcludeEndpoint, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { webDeletionRequestSchema, type DeleteMeResponse, type DeletionStatus } from '@mong/contract';
import type { FastifyReply } from 'fastify';
import { AccountService } from '../account/account.service';
import { ClientIpService, rateLimitKey, type IpRequest } from '../common/client-ip';
import { openApiSchema } from '../common/openapi-schema';
import { parseBody } from '../common/parse';
import type { Env } from '../config/env';
import { DeletionService } from './deletion.service';

/** 영수증 조회 IP 접두당 분당(3-8 표) */
export const RECEIPT_LIMIT_PER_MIN = 30;

type OriginRequest = IpRequest & { headers: { origin?: string } };

@ApiTags('deletion')
@Controller('api/v1/deletion')
export class DeletionController {
  private readonly webOrigin: string;

  constructor(
    private readonly deletion: DeletionService,
    private readonly account: AccountService,
    private readonly ips: ClientIpService,
    config: ConfigService<Env, true>,
  ) {
    this.webOrigin = new URL(config.get('WEB_ORIGIN', { infer: true })).origin;
  }

  @Options('web')
  @HttpCode(204)
  @ApiExcludeEndpoint()
  preflight(@Req() req: OriginRequest, @Res({ passthrough: true }) res: FastifyReply): void {
    if (this.cors(req, res)) {
      res.header('access-control-allow-methods', 'POST');
      res.header('access-control-allow-headers', 'content-type');
      res.header('access-control-max-age', '600');
    }
  }

  @Post('web')
  @HttpCode(202)
  @Header('cache-control', 'no-store')
  @ApiBody({ schema: openApiSchema(webDeletionRequestSchema) })
  @ApiResponse({ status: 202, description: '{receipt} — 앱 안 삭제와 같은 연쇄' })
  @ApiResponse({ status: 404, description: '코드·글귀가 같은 몽망이를 가리키지 않음(어느 쪽이 틀렸는지 알리지 않는다)' })
  @ApiResponse({ status: 429, description: 'IP 접두당 5/시간·글귀당 10/일' })
  async web(@Req() req: OriginRequest, @Res({ passthrough: true }) res: FastifyReply, @Body() raw: unknown): Promise<DeleteMeResponse> {
    this.cors(req, res);
    const b = parseBody(webDeletionRequestSchema, raw);
    const userId = await this.account.userForWebDeletion(rateLimitKey(this.ips.clientIp(req, 'api')), b.code, b.phrase);
    return this.deletion.deleteUser(userId, { channel: 'web', kind: 'web_request' });
  }

  @Get(':receipt')
  @Header('cache-control', 'no-store')
  @Throttle({ default: { limit: RECEIPT_LIMIT_PER_MIN, ttl: 60_000 } })
  @ApiResponse({ status: 200, description: '{state: pending|done}' })
  @ApiResponse({ status: 404, description: '모르는·만료된 영수증' })
  status(@Req() req: OriginRequest, @Res({ passthrough: true }) res: FastifyReply, @Param('receipt') receipt: string): Promise<DeletionStatus> {
    this.cors(req, res);
    return this.deletion.status(receipt);
  }

  /** 우리 웹 출처일 때만 CORS 헤더(다른 출처의 페이지는 응답을 읽지 못한다) */
  private cors(req: OriginRequest, res: FastifyReply): boolean {
    if (req.headers.origin !== this.webOrigin) return false;
    res.header('access-control-allow-origin', this.webOrigin);
    res.header('vary', 'origin');
    return true;
  }
}
