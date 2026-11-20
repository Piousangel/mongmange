// 헬스체크(architecture.md 3-2). 둘 다 캐시 금지.
//  - /healthz 라이브니스(공개): 프로세스가 살아 있으면 200. DB를 보지 않는다(DB 장애로 컨테이너가 재시작 고리에 빠지지 않게).
//    Cloud Run startup/liveness probe가 쓰는 유일한 경로. 레이트 리밋 없음(DB를 치지 않으므로 홍수가 DB로 번지지 않는다).
//  - /readyz 레디니스(내부): READY_TOKEN이 있으면 `x-ready-token`이 같아야 하고 아니면 404(B1 리뷰 I2).
//    DB `select 1`을 READY_TIMEOUT_MS 안에 확인, 결과를 READY_CACHE_MS 동안 캐시하고 동시 요청은 한 번만 DB를 친다.
//    레이트 리밋도 받는다(IP 접두당 전역 카운터).
import { Controller, Get, Header, Headers, HttpCode, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeEndpoint, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { SAVE_SCHEMA, SIM_SCHEMA } from '../version';

export interface Healthz {
  ok: true;
  ver: string;
  saveSchema: number;
  simSchema: number;
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

@ApiTags('health')
@Controller()
export class HealthController {
  private readonly log = new Logger('Readiness');
  private cached: { at: number; ok: boolean } | null = null;
  private inflight: Promise<boolean> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get('healthz')
  @SkipThrottle()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ description: '{ ok, ver, saveSchema, simSchema }' })
  healthz(): Healthz {
    return { ok: true, ver: this.config.get('APP_VERSION', { infer: true }), saveSchema: SAVE_SCHEMA, simSchema: SIM_SCHEMA };
  }

  @Get('readyz')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiExcludeEndpoint() // 내부 경로 — 공개 문서에 싣지 않는다
  async readyz(@Headers('x-ready-token') token?: string): Promise<{ ok: true; db: 'up' }> {
    const expected = this.config.get('READY_TOKEN', { infer: true });
    if (expected && !(typeof token === 'string' && sameToken(token, expected))) throw new NotFoundException();
    if (!(await this.dbReady())) {
      throw new ServiceUnavailableException({ code: 'db_unavailable', message: 'DB에 닿지 않습니다' });
    }
    return { ok: true, db: 'up' };
  }

  /** 캐시 + 단일 비행. 실패는 캐시 창마다 warn 한 줄(요청 로그에서 /readyz는 빠지므로) */
  private async dbReady(): Promise<boolean> {
    const ttl = this.config.get('READY_CACHE_MS', { infer: true });
    const now = Date.now();
    if (this.cached && now - this.cached.at < ttl) return this.cached.ok;
    this.inflight ??= this.checkDb().then((ok) => {
      this.cached = { at: Date.now(), ok };
      this.inflight = null;
      if (!ok) this.log.warn({ code: 'db_unavailable' }, 'DB 확인 실패');
      return ok;
    });
    return this.inflight;
  }

  private async checkDb(): Promise<boolean> {
    const ms = this.config.get('READY_TIMEOUT_MS', { infer: true });
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.ping(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), ms);
        }),
      ]);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
