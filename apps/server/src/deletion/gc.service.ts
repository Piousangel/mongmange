// 삭제 뒤처리 대기열(3-8 ③⑤⑥, 2-4 Cloud Scheduler `storage-gc`):
//  - storage_gc: Storage 파일. auth_gc: Supabase auth.users(sub). 성공하면 행째 지운다 — 남는 흔적이 없게.
//  - 실패하면 attempts + 1, 다음 시도는 not_before를 미뤄 Scheduler(04:30 KST)가 다시 한다.
//  - 한 삭제(deletion_log)의 대기 행이 모두 없어지면 completed_at → 영수증 조회가 'done'.
//  - 되찾기로 끊긴 옛 기기 로그인(user_auth.revoked_at)은 30일 뒤 auth_gc로 옮겨 같은 길로 지운다(3-3 ⑤ 단계 5).
import { Injectable, Logger } from '@nestjs/common';
import { AuthAdmin } from '../auth/auth-admin';
import { Clock } from '../common/clock';
import { PrismaService } from '../prisma/prisma.service';
import { StorageRemover } from './storage-remover';

/** 옛 기기 로그인 보관(3-3 ⑤, 처리방침 6절 '옛 계정 30일') */
export const REVOKED_KEEP_DAYS = 30;
const RETRY_MS = 60 * 60_000;
/** 이만큼 실패하면 알림 로그 */
export const STUCK_ATTEMPTS = 3;
const BATCH = 200;

export interface GcReport {
  storageDone: number;
  storageFailed: number;
  authDone: number;
  authFailed: number;
  revokedQueued: number;
  deletionsCompleted: number;
}

@Injectable()
export class GcService {
  private readonly log = new Logger('Gc');

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly storage: StorageRemover,
    private readonly auth: AuthAdmin,
  ) {}

  /** 삭제 요청 안에서 그 삭제분만 한 번 시도(3-8 ③⑤). 실패해도 throw하지 않는다 — 대기열에 남는다 */
  async drainDeletion(deletionId: bigint): Promise<void> {
    const now = new Date(this.clock.now());
    await this.processStorage({ deletionId }, now);
    await this.processAuth({ deletionId }, now);
    await this.completeDeletions(now, deletionId);
  }

  /** Scheduler 작업 하나(기한이 된 대기열 전부 + 옛 기기 로그인 30일 + 완료 판정) */
  async runDue(): Promise<GcReport> {
    const now = new Date(this.clock.now());
    const revokedQueued = await this.queueRevoked(now);
    const s = await this.processStorage({ due: true }, now);
    const a = await this.processAuth({ due: true }, now);
    const deletionsCompleted = await this.completeDeletions(now);
    const r = { storageDone: s.done, storageFailed: s.failed, authDone: a.done, authFailed: a.failed, revokedQueued, deletionsCompleted };
    this.log.log({ gc: r }, '대기열 처리');
    await this.alertStuck(now);
    return r;
  }

  private async processStorage(sel: { deletionId: bigint } | { due: true }, now: Date): Promise<{ done: number; failed: number }> {
    const rows = await this.prisma.storageGc.findMany({
      where: 'deletionId' in sel ? { deletionId: sel.deletionId } : { notBefore: { lte: now } },
      take: BATCH,
      orderBy: { id: 'asc' },
    });
    let done = 0;
    let failed = 0;
    for (const r of rows) {
      try {
        await this.storage.removePrefix(r.bucket, r.prefix);
        await this.prisma.storageGc.delete({ where: { id: r.id } });
        done++;
      } catch {
        failed++;
        await this.prisma.storageGc.update({ where: { id: r.id }, data: { attempts: { increment: 1 }, notBefore: new Date(now.getTime() + RETRY_MS) } });
      }
    }
    return { done, failed };
  }

  private async processAuth(sel: { deletionId: bigint } | { due: true }, now: Date): Promise<{ done: number; failed: number }> {
    const rows = await this.prisma.authGc.findMany({
      where: 'deletionId' in sel ? { deletionId: sel.deletionId } : { notBefore: { lte: now } },
      take: BATCH,
      orderBy: { notBefore: 'asc' },
    });
    let done = 0;
    let failed = 0;
    for (const r of rows) {
      try {
        await this.auth.remove(r.sub);
        await this.prisma.authGc.delete({ where: { sub: r.sub } });
        done++;
      } catch {
        failed++;
        await this.prisma.authGc.update({ where: { sub: r.sub }, data: { attempts: { increment: 1 }, notBefore: new Date(now.getTime() + RETRY_MS) } });
      }
    }
    if (failed) this.log.warn({ authFailed: failed }, 'Auth 사용자 삭제 실패 — 재시도 대기');
    return { done, failed };
  }

  /**
   * 막힌 일을 알림 대상(error)으로(B2 리뷰 I2): 3번 넘게 실패한 대기 행, 24시간 넘게 끝나지 않은 삭제.
   * 영수증·/delete 문구('24시간 안에 끝나요')가 거짓이 되기 전에 사람이 본다. 개수만 남긴다(sub·경로 없음)
   */
  private async alertStuck(now: Date): Promise<void> {
    const [authStuck, storageStuck, deletionsLate] = await Promise.all([
      this.prisma.authGc.count({ where: { attempts: { gte: STUCK_ATTEMPTS } } }),
      this.prisma.storageGc.count({ where: { attempts: { gte: STUCK_ATTEMPTS } } }),
      this.prisma.deletionLog.count({ where: { completedAt: null, requestedAt: { lt: new Date(now.getTime() - 86_400_000) } } }),
    ]);
    if (authStuck || storageStuck || deletionsLate) {
      this.log.error({ code: 'gc_stuck', authStuck, storageStuck, deletionsLate }, '삭제 뒤처리가 막혀 있음 — 운영 확인 필요');
    }
  }

  /** 30일 지난 끊긴 로그인 → auth_gc(같은 트랜잭션에서 user_auth 행 삭제) */
  private async queueRevoked(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - REVOKED_KEEP_DAYS * 86_400_000);
    return this.prisma.$transaction(async (tx) => {
      const old = await tx.userAuth.findMany({ where: { revokedAt: { lt: cutoff } }, select: { sub: true }, take: BATCH });
      if (!old.length) return 0;
      await tx.authGc.createMany({ data: old.map((o) => ({ sub: o.sub, notBefore: now })), skipDuplicates: true });
      await tx.userAuth.deleteMany({ where: { sub: { in: old.map((o) => o.sub) } } });
      return old.length;
    });
  }

  /** 대기 행이 남지 않은 삭제를 끝냄(⑥). deletionId를 주면 그 하나만 */
  private async completeDeletions(now: Date, deletionId?: bigint): Promise<number> {
    return this.prisma.$executeRaw`
      UPDATE app.deletion_log d SET completed_at = ${now}
       WHERE d.completed_at IS NULL
         AND (${deletionId ?? null}::bigint IS NULL OR d.id = ${deletionId ?? null}::bigint)
         AND NOT EXISTS (SELECT 1 FROM app.storage_gc s WHERE s.deletion_id = d.id)
         AND NOT EXISTS (SELECT 1 FROM app.auth_gc a WHERE a.deletion_id = d.id)`;
  }
}
