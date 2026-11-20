// /m HTML CDN 무효화(architecture.md v2.2 3-9 'CDN 무효화'). 링크 끄기·이름 가리기(다시 만들기)·격리·계정 삭제 때 부른다.
// - Firebase Hosting에는 경로별 지우기 API가 없다 → 지금 버전을 **새 릴리스로 다시 내면** 사이트 전체 캐시가 비워진다(B6에서 실제 호출).
// - 그래서 대기열에는 '무엇을'이 없다: DB 한 행(cdn_purge)에 '요청 있음' 시각만. 코드·경로를 담지 않으니 계정 삭제 뒤 흔적도 0.
// - **1분 묶음**: 마지막 릴리스 뒤 1분이 지나지 않았으면 기다린다. 남은 요청은 다음 요청이나 Scheduler `cdn-purge`(1분마다, B6 등록)가 낸다.
// - 실패하면 요청을 되돌려 놓는다. 끝내 실패해도 바닥은 `s-maxage` 5분(3-9).
// - 릴리스 호출 중에는 DB 잠금을 쥐지 않는다: 먼저 '이번 차례'를 커밋으로 잡고(released_at = 지금, requested_at = NULL) 바깥에서 부른다.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Clock } from '../common/clock';
import { PrismaService } from '../prisma/prisma.service';

/** 묶음 간격(3-9 '1분에 한 번') */
export const PURGE_BATCH_MS = 60_000;

export interface CdnInvalidator {
  readonly kind: 'none' | 'firebase';
  /** 사이트 전체 CDN 캐시 비우기 */
  purgeSite(): Promise<void>;
}
export const CDN_INVALIDATOR = Symbol('CDN_INVALIDATOR');

/** 로컬·시험: 실제 호출 없이 횟수만 센다(운영에서 이 구현이면 기동 로그에 경고 — B6 전까지 s-maxage 5분이 바닥) */
export class CountingInvalidator implements CdnInvalidator {
  readonly kind = 'none' as const;
  calls = 0;
  fail = false;
  async purgeSite(): Promise<void> {
    if (this.fail) throw new Error('purge 실패(시험)');
    this.calls++;
  }
}

export type FlushResult = 'idle' | 'waiting' | 'released' | 'failed';

@Injectable()
export class CdnPurgeQueue {
  private readonly log = new Logger('CdnPurge');

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    @Inject(CDN_INVALIDATOR) private readonly cdn: CdnInvalidator,
  ) {}

  /** 무효화가 필요하다고 적고(이미 대기 중이면 그대로), 1분 묶음이 허락하면 바로 낸다. 실패해도 던지지 않는다 */
  async request(): Promise<FlushResult> {
    const now = new Date(this.clock.now());
    await this.prisma.$executeRaw`
      INSERT INTO app.cdn_purge (id, requested_at) VALUES (1, ${now})
      ON CONFLICT (id) DO UPDATE SET requested_at = coalesce(app.cdn_purge.requested_at, EXCLUDED.requested_at)`;
    return this.flush();
  }

  /** 대기 중이면 한 번 낸다(Scheduler·요청 뒤). 1분 안이면 waiting */
  async flush(): Promise<FlushResult> {
    const now = new Date(this.clock.now());
    const cutoff = new Date(now.getTime() - PURGE_BATCH_MS);
    // 이번 차례 잡기(원자적): 대기 중이고 마지막 릴리스가 1분 넘었을 때만
    const claimed = await this.prisma.$queryRaw<{ requested_at: Date }[]>`
      UPDATE app.cdn_purge p SET released_at = ${now}, requested_at = NULL
        FROM (SELECT requested_at, released_at FROM app.cdn_purge WHERE id = 1 FOR UPDATE) prev
       WHERE p.id = 1 AND prev.requested_at IS NOT NULL AND (prev.released_at IS NULL OR prev.released_at <= ${cutoff})
      RETURNING prev.requested_at, prev.released_at AS prev_released`;
    if (!claimed.length) {
      const row = await this.prisma.cdnPurge.findUnique({ where: { id: 1 }, select: { requestedAt: true } });
      return row?.requestedAt ? 'waiting' : 'idle';
    }
    try {
      await this.cdn.purgeSite();
      await this.prisma.cdnPurge.update({ where: { id: 1 }, data: { attempts: 0 } });
      return 'released';
    } catch (e) {
      // 되돌려 놓는다: 요청 시각은 원래 값, 다음 시도는 1분 뒤(released_at은 잡은 시각 그대로 — 폭주 방지)
      await this.prisma.$executeRaw`
        UPDATE app.cdn_purge SET requested_at = coalesce(requested_at, ${claimed[0]!.requested_at}), attempts = attempts + 1 WHERE id = 1`;
      this.log.warn({ code: 'cdn_purge_failed', type: e instanceof Error ? e.name : 'unknown' }, 'CDN 무효화 실패 — 다음 차례에 다시');
      return 'failed';
    }
  }
}
