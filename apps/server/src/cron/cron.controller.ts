// `POST /internal/cron/{job}` — Cloud Scheduler만(architecture.md 2-4·3-2). Storage·Auth를 건드리는 정기 작업(DB만 건드리는 솎기는 pg_cron).
// 인증 = Google OIDC ID 토큰: iss accounts.google.com, aud = CRON_AUDIENCE(서비스 URL), email = CRON_SA_EMAIL(검증된 것), RS256만.
// 설정이 없거나 토큰이 틀리면 404 — 경로가 있는지도 알리지 않는다(/readyz와 같은 방식). 공개 OpenAPI에 싣지 않는다.
import { Controller, Headers, HttpCode, Injectable, NotFoundException, Param, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Env } from '../config/env';
import { DeletionService } from '../deletion/deletion.service';
import { GcService, type GcReport } from '../deletion/gc.service';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

@Injectable()
export class CronAuth {
  /** 시험이 로컬 키 집합으로 바꾼다 */
  getKey: JWTVerifyGetKey = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { timeoutDuration: 3000 });
  private readonly audience: string | undefined;
  private readonly email: string | undefined;

  constructor(config: ConfigService<Env, true>) {
    this.audience = config.get('CRON_AUDIENCE', { infer: true });
    this.email = config.get('CRON_SA_EMAIL', { infer: true });
  }

  async check(authorization: string | undefined): Promise<void> {
    const m = typeof authorization === 'string' ? /^Bearer (\S+)$/.exec(authorization) : null;
    if (!this.audience || !this.email || !m) throw new NotFoundException();
    try {
      const { payload } = await jwtVerify(m[1]!, this.getKey, { algorithms: ['RS256'], issuer: GOOGLE_ISSUERS, audience: this.audience });
      if (payload.email !== this.email || payload.email_verified !== true) throw new Error('email');
    } catch {
      throw new NotFoundException();
    }
  }
}

@ApiExcludeController()
@Controller('internal/cron')
export class CronController {
  constructor(
    private readonly auth: CronAuth,
    private readonly gc: GcService,
    private readonly deletion: DeletionService,
  ) {}

  @Post(':job')
  @HttpCode(200)
  async run(@Param('job') job: string, @Headers('authorization') authorization: string | undefined): Promise<GcReport | { reapplied: number }> {
    await this.auth.check(authorization);
    // 백업 복원 뒤 한 번(운영자가 Scheduler '지금 실행' — docs/ops/restore-runbook.md). 정기 예약은 하지 않는다
    if (job === 'reapply-deletions') return this.deletion.reapplyAfterRestore();
    // 매일 04:30 KST: Storage 대기열·Auth 사용자 삭제 재시도·되찾기로 끊긴 옛 기기 30일(B2). 격리본 처리는 B5에서 같은 작업에 더한다
    if (job === 'storage-gc') return this.gc.runDue();
    throw new NotFoundException();
  }
}
