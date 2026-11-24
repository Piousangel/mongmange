// `POST /internal/cron/{job}` — Cloud Scheduler만(architecture.md 2-4·3-2). Storage·Auth를 건드리는 정기 작업(DB만 건드리는 솎기는 pg_cron).
// 인증 = Google OIDC ID 토큰: iss accounts.google.com, aud = CRON_AUDIENCE(서비스 URL), email = CRON_SA_EMAIL(검증된 것), RS256만.
// 설정이 없거나 토큰이 틀리면 404 — 경로가 있는지도 알리지 않는다(/readyz와 같은 방식). 공개 OpenAPI에 싣지 않는다.
import { CdnPurgeQueue, type FlushResult } from '../cdn/cdn-purge';
import { Controller, Headers, HttpCode, Injectable, InternalServerErrorException, Logger, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Env } from '../config/env';
import { DeletionService } from '../deletion/deletion.service';
import { GcService, type GcReport } from '../deletion/gc.service';
import { InactiveSweep, type InactiveReport } from '../deletion/inactive-sweep';
import { ModerationService, type ModerationReport } from '../moderation/moderation.service';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/** 매일 storage-gc 한 번의 결과: 대기열(gc)과 2년 미사용 정리(inactive). 실패한 쪽은 null */
export interface DailyReport {
  gc: GcReport | null;
  inactive: InactiveReport | null;
}

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
  private readonly log = new Logger('Cron');

  constructor(
    private readonly auth: CronAuth,
    private readonly gc: GcService,
    private readonly deletion: DeletionService,
    private readonly cdn: CdnPurgeQueue,
    private readonly moderation: ModerationService,
    private readonly inactive: InactiveSweep,
  ) {}

  @Post(':job')
  @HttpCode(200)
  async run(
    @Param('job') job: string,
    @Headers('authorization') authorization: string | undefined,
    @Query('confirm') confirm?: string,
  ): Promise<DailyReport | ModerationReport | InactiveReport | { reapplied: number } | { cdn: FlushResult }> {
    await this.auth.check(authorization);
    // 백업 복원 뒤 한 번(운영자가 Scheduler '지금 실행' — docs/ops/restore-runbook.md). 정기 예약은 하지 않는다
    if (job === 'reapply-deletions') return this.deletion.reapplyAfterRestore();
    // 매일 04:30 KST: Storage 대기열·Auth 사용자 삭제 재시도·되찾기로 끊긴 옛 기기 30일(B2) + 2년 미사용 정리(V25 — PM 11-25: Scheduler 무료 3개 안, 별도 잡 없음)
    if (job === 'storage-gc') return this.daily();
    // 2년 미사용 정리만 — 수동 실행·시험용(정기 예약은 storage-gc가 겸한다, 하루 잠금 없음).
    // 차단기 ①로 멈췄으면 운영자가 대상 수를 확인한 뒤 `?confirm=<그 수>`로 그 실행만 넘긴다(시계 차단기 ②는 넘기지 못한다)
    if (job === 'inactive-sweep') return this.inactive.run({ confirm: confirm && /^\d{1,9}$/.test(confirm) ? Number(confirm) : undefined });
    // 5분마다(B6 등록, B5): 신고 창 7일 만료·격리 30일 기본 확정·운영자 삭제 요청·복원/이름 가리기 파일 일·CDN 차례·SLA 알림
    if (job === 'moderation') return this.moderation.runDue();
    // 1분마다(B6 등록): 1분 묶음에 걸려 기다리는 /m CDN 무효화를 낸다(B3, 3-9)
    if (job === 'cdn-purge') return { cdn: await this.cdn.flush() };
    throw new NotFoundException();
  }

  /**
   * 대기열 → 2년 미사용 정리를 차례로, 서로 독립으로: 한쪽이 던져도 다른 쪽은 돈다(PM 11-25).
   * 500은 대기열(gc) 실패에만 — Scheduler 재시도는 대기열을 위한 것이다. 정리는 하루 한 번(runDaily의 날짜 잠금)이라 재시도가 와도
   * 다시 돌지 않고, 정리 쪽 실패는 error 로그 + 다음 날 재시도로 처리한다(리뷰 M3)
   */
  private async daily(): Promise<DailyReport> {
    const r: DailyReport = { gc: null, inactive: null };
    let gcFailed = false;
    try {
      r.gc = await this.gc.runDue();
    } catch (e) {
      gcFailed = true;
      this.log.error({ code: 'cron_gc_failed', type: e instanceof Error ? e.name : 'unknown' }, '대기열 처리 실패 — 미사용 정리는 계속');
    }
    try {
      r.inactive = await this.inactive.runDaily();
    } catch (e) {
      this.log.error({ code: 'cron_inactive_failed', type: e instanceof Error ? e.name : 'unknown' }, '2년 미사용 정리 실패 — 다음 날 다시(응답은 대기열 결과만 따름)');
    }
    if (gcFailed) throw new InternalServerErrorException({ code: 'cron_gc_failed', message: '대기열 처리 실패' });
    return r;
  }
}
