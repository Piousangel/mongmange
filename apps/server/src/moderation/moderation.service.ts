// 운영 정기 작업(B5, Cloud Scheduler `moderation` — 5분마다, B6 등록). 관리 API는 없다: 운영자는 Supabase Studio에서 SQL 함수를 부르고
// (docs/ops/moderation/*.sql), 파일·계정을 건드리는 뒷일은 이 작업이 한다.
//  ① app.expire_reports: 7일 창이 끝난 열린 신고를 닫는다(소금·신고자 키 삭제), 1년 지난 신고·운영 기록 삭제
//  ② app.expire_quarantine: 격리 30일이 지나도록 결정이 없으면 확정 삭제(3-8 ⑤ 기본값)
//  ③ 운영자 계정 삭제 요청(users.delete_requested_at)이 **72시간 지난 것만** → DELETE /me와 같은 연쇄(DeletionService). 대기 중에는 주인 앱 알림·운영자 취소
//  ④ 기한이 된 Storage 대기열(복원·이름 가리기·확정 삭제·지난 판) ⑤ /m CDN 무효화 차례
//  ⑥ SLA 알림: 격리가 6일 넘게 운영자 결정을 기다리면 error 로그 `moderation_sla`(개수만 — 코드 없음). 7일 SLA 전에 사람이 본다
// 파기 여유 10분은 SQL 함수 안(창 끝·30일보다 10분 일찍) — 이 작업이 5분마다라 처리방침의 '최대 7일'·'최대 30일'을 넘지 않는다.
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ACCOUNT_DELETION_WAIT_HOURS, MODERATION_SLA_DAYS } from '@mong/contract';
import { CdnPurgeQueue, type FlushResult } from '../cdn/cdn-purge';
import { Clock } from '../common/clock';
import { DeletionService } from '../deletion/deletion.service';
import { GcService } from '../deletion/gc.service';
import { PrismaService } from '../prisma/prisma.service';

/** 한 번에 처리할 운영자 계정 삭제 수(남으면 다음 차례) */
const DELETE_BATCH = 20;

export interface ModerationReport {
  reportsExpired: number;
  quarantineConfirmed: number;
  accountsDeleted: number;
  storageDone: number;
  storageFailed: number;
  waitingDecision: number;
  cdn: FlushResult;
}

@Injectable()
export class ModerationService {
  private readonly log = new Logger('Moderation');

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly gc: GcService,
    private readonly deletion: DeletionService,
    private readonly cdn: CdnPurgeQueue,
  ) {}

  async runDue(): Promise<ModerationReport> {
    const at = new Date(this.clock.now());
    const [e] = await this.prisma.$queryRaw<Array<{ n: number }>>`SELECT app.expire_reports(${at}::timestamptz) AS n`;
    const [q] = await this.prisma.$queryRaw<Array<{ n: number }>>`SELECT app.expire_quarantine(${at}::timestamptz) AS n`;
    let accountsDeleted = 0;
    const due = new Date(at.getTime() - ACCOUNT_DELETION_WAIT_HOURS * 3_600_000);
    const asked = await this.prisma.user.findMany({ where: { deleteRequestedAt: { lte: due } }, select: { id: true }, orderBy: { deleteRequestedAt: 'asc' }, take: DELETE_BATCH });
    for (const u of asked) {
      try {
        await this.deletion.deleteUser(u.id, { channel: 'email', kind: 'user_request' });
        accountsDeleted++;
      } catch (err) {
        // 이미 지워졌으면(같은 사람이 앱에서 먼저 지움) 지나간다. 그 밖은 다음 차례에 다시
        if (!(err instanceof NotFoundException)) this.log.warn({ code: 'operator_delete_failed', type: err instanceof Error ? err.name : 'unknown' }, '운영자 삭제 요청 처리 실패 — 다음 차례');
      }
    }
    const s = await this.gc.drainDueStorage();
    const cdn = await this.cdn.flush();
    const lateCut = new Date(at.getTime() - (MODERATION_SLA_DAYS - 1) * 86_400_000);
    const [waiting, late] = await Promise.all([
      this.prisma.publicPage.count({ where: { state: 'quarantined' } }),
      this.prisma.publicPage.count({ where: { state: 'quarantined', stateChangedAt: { lt: lateCut } } }),
    ]);
    if (late) this.log.error({ code: 'moderation_sla', late }, '격리가 6일 넘게 운영자 결정을 기다림 — 7일 SLA(docs/ops/moderation/README.md)');
    const r: ModerationReport = {
      reportsExpired: Number(e!.n),
      quarantineConfirmed: Number(q!.n),
      accountsDeleted,
      storageDone: s.done,
      storageFailed: s.failed,
      waitingDecision: waiting,
      cdn,
    };
    this.log.log({ moderation: r }, '운영 정기 작업');
    return r;
  }
}
