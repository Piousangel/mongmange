// 링크 API(architecture.md v2.2 3-2 링크 행). 모두 JWT, 응답 no-store(앱 안 표시는 즉시 — 3-9 표 첫 줄).
// 요청 본문(스냅숏·이름)은 어떤 로그에도 남지 않는다(logging.ts 규칙 4).
import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { creaturePatchSchema, pagePutRequestSchema, type CreatureInfo, type PagePutResponse } from '@mong/contract';
import { Auth, AuthGuard, linkedUser, type AuthContext } from '../auth/auth.guard';
import { openApiSchema } from '../common/openapi-schema';
import { parseBody } from '../common/parse';
import { PageService } from './page.service';

@ApiTags('link')
@ApiBearerAuth()
@Controller('api/v1/creature')
@UseGuards(AuthGuard)
export class PageController {
  constructor(private readonly pages: PageService) {}

  @Get()
  @Header('cache-control', 'no-store')
  @ApiResponse({ status: 200, description: '{code, linkEnabled, nameVisible, page:{ver, state}|null}' })
  info(@Auth() a: AuthContext): Promise<CreatureInfo> {
    return this.pages.info(linkedUser(a));
  }

  @Patch()
  @Header('cache-control', 'no-store')
  @ApiBody({ schema: openApiSchema(creaturePatchSchema) })
  @ApiResponse({ status: 200, description: '이름 공개 기본값 바꾸기 — 링크가 켜져 있으면 앱이 바로 PUT page(다시 만들기)' })
  patch(@Auth() a: AuthContext, @Body() raw: unknown): Promise<CreatureInfo> {
    return this.pages.patch(linkedUser(a), parseBody(creaturePatchSchema, raw).nameVisible);
  }

  @Put('page')
  @HttpCode(200)
  @Header('cache-control', 'no-store')
  @ApiBody({ schema: openApiSchema(pagePutRequestSchema) })
  @ApiResponse({ status: 200, description: '{ver, nameAllowed, url, upload:{poster, og, loop?}} — 비공개 page-staging 서명 업로드 URL(5분·1회)' })
  @ApiResponse({ status: 409, description: 'page_blocked — 격리·운영 숨김 중' })
  @ApiResponse({ status: 413, description: 'snapshot_too_big(32KB)' })
  @ApiResponse({ status: 422, description: 'snapshot — 모르는 키·범위·개수·점 길이' })
  @ApiResponse({ status: 429, description: '사용자당 20/일' })
  @ApiResponse({ status: 503, description: 'storage_unavailable' })
  put(@Auth() a: AuthContext, @Body() raw: unknown): Promise<PagePutResponse> {
    return this.pages.put(linkedUser(a), parseBody(pagePutRequestSchema, raw));
  }

  @Post('page/:ver/commit')
  @HttpCode(200)
  @Header('cache-control', 'no-store')
  @ApiResponse({ status: 200, description: '{ver, state:"live"}' })
  @ApiResponse({ status: 409, description: 'stale_version·page_blocked' })
  @ApiResponse({ status: 422, description: 'commit_check {file, reason} — 판 전체가 live가 되지 않는다' })
  commit(@Auth() a: AuthContext, @Param('ver', ParseIntPipe) ver: number): Promise<{ ver: number; state: 'live' }> {
    return this.pages.commit(linkedUser(a), ver);
  }

  @Delete('page')
  @HttpCode(204)
  @Header('cache-control', 'no-store')
  @ApiResponse({ status: 204, description: '링크 끄기 — 공개 파일 즉시 삭제, /m CDN 무효화' })
  async disable(@Auth() a: AuthContext): Promise<void> {
    await this.pages.disable(linkedUser(a));
  }
}
