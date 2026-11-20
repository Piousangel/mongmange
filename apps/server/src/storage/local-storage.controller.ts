// 로컬 저장소의 '서명 업로드'와 '공개 버킷 읽기'(STORAGE_DRIVER=local일 때만 붙는다 — 운영에는 없다).
// Supabase Storage의 두 바깥 주소를 흉내 낸다: 서명 URL로 PUT(유형·크기·버킷 상한·1회·만료), 공개 버킷 GET(immutable).
import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Put, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { OBJECT_STORE, PUBLIC_FILE_CACHE, type ObjectStore } from './object-store';
import { LocalObjectStore } from './local-store';

@ApiExcludeController()
@Controller('_local-storage')
export class LocalStorageController {
  constructor(@Inject(OBJECT_STORE) private readonly store: ObjectStore) {}

  private get local(): LocalObjectStore {
    if (!(this.store instanceof LocalObjectStore)) throw new Error('local 드라이버가 아니다');
    return this.store;
  }

  @Put('upload')
  @HttpCode(200)
  async upload(@Query('token') token: string | undefined, @Headers('content-type') type: string | undefined, @Body() body: unknown, @Res() reply: FastifyReply): Promise<void> {
    const buf = Buffer.isBuffer(body) ? new Uint8Array(body) : new Uint8Array();
    const why = token ? await this.local.acceptUpload(token, type?.split(';')[0]?.trim(), buf) : 'bad_token';
    if (why) {
      void reply.code(why === 'too_big' ? 413 : why === 'mime' ? 415 : 403).header('cache-control', 'no-store').send({ error: { code: why } });
      return;
    }
    void reply.code(200).header('cache-control', 'no-store').send({ ok: true });
  }

  @Get('public/:store/:page/:file')
  async read(@Param('store') store: string, @Param('page') page: string, @Param('file') file: string, @Res() reply: FastifyReply): Promise<void> {
    const f = await this.local.readPublic(`${store}/${page}/${file}`);
    if (!f) {
      void reply.code(404).header('cache-control', 'no-store').send();
      return;
    }
    void reply
      .header('content-type', f.contentType)
      .header('cache-control', PUBLIC_FILE_CACHE)
      .header('cross-origin-resource-policy', 'cross-origin')
      .header('access-control-allow-origin', '*')
      .send(f.body);
  }
}
