// 맡겨 두기 API(architecture.md v2.2 3-2 B2 행). 모두 JWT(AuthGuard) + no-store. 본문·응답은 로그에 남지 않는다(logging.ts 규칙 4).
// 요청 모양은 @mong/contract(앱과 같은 스키마), 규칙은 cloud-save.service.ts.
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  conflictUploadSchema,
  saveUploadSchema,
  type SaveMeta,
  type SaveVersion,
  type SaveVersionWithBody,
  type SaveWithBody,
  type SaveWriteResponse,
} from '@mong/contract';
import { Auth, AuthGuard, linkedUser, type AuthContext } from '../auth/auth.guard';
import { openApiSchema } from '../common/openapi-schema';
import { parseBody } from '../common/parse';
import { CloudSaveService, type Precondition } from './cloud-save.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `If-Match: 3` / `"3"` / `W/"3"` → 3 */
export function parseRev(v: string | undefined): number | null {
  const m = typeof v === 'string' ? /^\s*(?:W\/)?"?(\d{1,9})"?\s*$/.exec(v) : null;
  return m ? Number(m[1]) : null;
}

function precondition(ifMatch: string | undefined, ifNoneMatch: string | undefined): Precondition {
  if (ifMatch !== undefined && ifNoneMatch !== undefined) {
    throw new BadRequestException({ code: 'bad_request', message: 'If-Match와 If-None-Match는 함께 보낼 수 없습니다' });
  }
  if (ifNoneMatch !== undefined) {
    if (ifNoneMatch.trim() !== '*') throw new BadRequestException({ code: 'bad_request', message: 'If-None-Match는 *만 받습니다' });
    return { kind: 'none' };
  }
  const rev = parseRev(ifMatch);
  if (rev !== null) return { kind: 'match', rev };
  if (ifMatch !== undefined) throw new BadRequestException({ code: 'bad_request', message: 'If-Match는 rev 숫자입니다' });
  throw new HttpException({ code: 'precondition_required', message: 'If-Match 또는 If-None-Match: *가 필요합니다' }, HttpStatus.PRECONDITION_REQUIRED);
}

function versionId(id: string): string {
  // 형식이 틀린 id도 '없음'과 같은 404(남의 것인지·형식인지 구별해 주지 않는다)
  if (!UUID_RE.test(id)) throw new NotFoundException();
  return id.toLowerCase();
}

@ApiTags('saves')
@ApiBearerAuth()
@Controller('api/v1/saves/main')
@UseGuards(AuthGuard)
export class CloudSavesController {
  constructor(private readonly saves: CloudSaveService) {}

  @Get('meta')
  @Header('cache-control', 'no-store')
  @ApiResponse({ status: 200, description: 'SaveMeta' })
  @ApiResponse({ status: 404, description: 'no_save — 맡긴 적 없음' })
  meta(@Auth() a: AuthContext): Promise<SaveMeta> {
    return this.saves.meta(linkedUser(a));
  }

  @Get()
  @Header('cache-control', 'no-store')
  @ApiResponse({ status: 200, description: 'SaveMeta + body(세이브 JSON 문자열, 서버가 gzip을 푼 값)' })
  full(@Auth() a: AuthContext): Promise<SaveWithBody> {
    return this.saves.full(linkedUser(a));
  }

  @Put()
  @HttpCode(200)
  @Header('cache-control', 'no-store')
  @ApiHeader({ name: 'If-Match', required: false, description: '마지막으로 본 rev' })
  @ApiHeader({ name: 'If-None-Match', required: false, description: '처음 올릴 때 *' })
  @ApiBody({ schema: openApiSchema(saveUploadSchema) })
  @ApiResponse({ status: 200, description: '{rev, sha} — 빨리 감기(같은 sha)도 200' })
  @ApiResponse({ status: 409, description: 'save_conflict — error.details.server = SaveMeta | null' })
  @ApiResponse({ status: 413, description: 'save_too_large — UTF-8 512KB 또는 gzip 256KB 초과' })
  @ApiResponse({ status: 422, description: 'save_invalid — details.reason(not_json·corrupt·future_too_far…)' })
  @ApiResponse({ status: 428, description: 'precondition_required' })
  @ApiResponse({ status: 429, description: 'save_quota(하루 4MB) 또는 rate_limited(60/시간)' })
  put(
    @Auth() a: AuthContext,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Body() raw: unknown,
  ): Promise<SaveWriteResponse> {
    const userId = linkedUser(a);
    const pre = precondition(ifMatch, ifNoneMatch);
    const b = parseBody(saveUploadSchema, raw);
    return this.saves.put(userId, pre, b.body, b.clientSavedAt, b.resolve === 'keep_mine');
  }

  @Post('conflicts')
  @HttpCode(201)
  @Header('cache-control', 'no-store')
  @ApiBody({ schema: openApiSchema(conflictUploadSchema) })
  @ApiResponse({ status: 201, description: '{id} — conflict 칸 30일, 최대 3벌' })
  @ApiResponse({ status: 404, description: 'no_save — 맡긴 본이 없으면 충돌도 없다' })
  conflicts(@Auth() a: AuthContext, @Body() raw: unknown): Promise<{ id: string }> {
    const userId = linkedUser(a);
    const b = parseBody(conflictUploadSchema, raw);
    return this.saves.addConflict(userId, b.body, b.clientSavedAt);
  }

  @Get('versions')
  @Header('cache-control', 'no-store')
  @ApiResponse({ status: 200, description: 'SaveVersion[] 최신순(본문 없음)' })
  versions(@Auth() a: AuthContext): Promise<SaveVersion[]> {
    return this.saves.versions(linkedUser(a));
  }

  @Get('versions/:id')
  @Header('cache-control', 'no-store')
  @ApiResponse({ status: 200, description: 'SaveVersion + body' })
  @ApiResponse({ status: 404, description: '없음·남의 것·솎인 것(구별하지 않음)' })
  version(@Auth() a: AuthContext, @Param('id') id: string): Promise<SaveVersionWithBody> {
    return this.saves.version(linkedUser(a), versionId(id));
  }

  @Post('versions/:id/restore')
  @HttpCode(200)
  @Header('cache-control', 'no-store')
  @ApiHeader({ name: 'If-Match', required: true, description: '지금 서버 rev' })
  @ApiResponse({ status: 200, description: '{rev, sha} — 성공 뒤 앱은 GET /saves/main으로 새 현재본을 받는다' })
  @ApiResponse({ status: 409, description: 'save_conflict' })
  restore(@Auth() a: AuthContext, @Param('id') id: string, @Headers('if-match') ifMatch: string | undefined): Promise<SaveWriteResponse> {
    const userId = linkedUser(a);
    const vid = versionId(id);
    const rev = parseRev(ifMatch);
    if (rev === null) throw new HttpException({ code: 'precondition_required', message: 'If-Match가 필요합니다' }, HttpStatus.PRECONDITION_REQUIRED);
    return this.saves.restore(userId, vid, rev);
  }
}
