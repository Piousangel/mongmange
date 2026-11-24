// 삭제 뒤처리 대기열(3-8 ③⑤⑥, 2-4 Cloud Scheduler `storage-gc`):
//  - storage_gc: Storage 파일(지우기, 격리 이동 quarantine_move는 옮기기). auth_gc: Supabase auth.users(sub). 성공하면 행째 지운다 — 남는 흔적이 없게.
//    B5 운영(SQL 함수가 적은 행): restore_move = 격리본을 공개로 되돌리고 live, name_mask = 이름 뺀 판 다시 쓰기(moderation/name-mask.ts),
//    quarantine_expiry = 격리본 삭제(확정). 되돌림·이름 가리기를 마치면 /m CDN 무효화.
//  - 실패하면 attempts + 1, 다음 시도는 not_before를 미뤄 Scheduler(04:30 KST)가 다시 한다.
//  - 한 삭제(deletion_log)의 대기 행이 모두 없어지면 completed_at → 영수증 조회가 'done'.
//  - 되찾기로 끊긴 옛 기기 로그인(user_auth.revoked_at)은 30일 뒤 auth_gc로 옮겨 같은 길로 지운다(3-3 ⑤ 단계 5).
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuthAdmin } from '../auth/auth-admin';
import { CdnPurgeQueue } from '../cdn/cdn-purge';
import { Clock } from '../common/clock';
import { rewritePageWithoutName } from '../moderation/name-mask';
import { PrismaService } from '../prisma/prisma.service';
import { BUCKETS, OBJECT_STORE, type Bucket, type ObjectStore } from '../storage/object-store';

/** 옛 기기 로그인 보관(3-3 ⑤, 처리방침 6절 '옛 계정 30일') */
export const REVOKED_KEEP_DAYS = 30;
const RETRY_MS = 60 * 60_000;
/** 이름 가리기가 격리·복원 이동을 기다릴 때 다음 시도(실패로 세지 않음) */
const WAIT_MS = 60_000;
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
    @Inject(OBJECT_STORE) private readonly storage: ObjectStore,
    private readonly auth: AuthAdmin,
    private readonly cdn: CdnPurgeQueue,
  ) {}

  /** 삭제 요청 안에서 그 삭제분만 한 번 시도(3-8 ③⑤). 실패해도 throw하지 않는다 — 대기열에 남는다 */
  async drainDeletion(deletionId: bigint): Promise<void> {
    const now = new Date(this.clock.now());
    await this.processStorage({ deletionId }, now);
    await this.processAuth({ deletionId }, now);
    await this.completeDeletions(now, deletionId);
  }

  /** 방금 넣은 대기 행 몇 개를 요청 안에서 바로 처리(링크 끄기 '공개 파일 즉시 삭제', 3-5-3 ⑥). 실패분은 대기열에 남는다 */
  async drainIds(ids: bigint[]): Promise<{ done: number; failed: number }> {
    if (!ids.length) return { done: 0, failed: 0 };
    return this.processStorage({ ids }, new Date(this.clock.now()));
  }

  /** 기한이 된 Storage 대기열만(B5 Scheduler `moderation` 5분마다 — 복원·이름 가리기·확정 삭제·유예 끝난 지난 판). Auth·알림은 storage-gc가 */
  async drainDueStorage(): Promise<{ done: number; failed: number }> {
    return this.processStorage({ due: true }, new Date(this.clock.now()));
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

  private async processStorage(sel: { deletionId: bigint } | { ids: bigint[] } | { due: true }, now: Date): Promise<{ done: number; failed: number }> {
    const rows = await this.prisma.storageGc.findMany({
      where: 'deletionId' in sel ? { deletionId: sel.deletionId } : 'ids' in sel ? { id: { in: sel.ids } } : { notBefore: { lte: now } },
      take: BATCH,
      orderBy: { id: 'asc' },
    });
    let done = 0;
    let failed = 0;
    let purge = false;
    for (const r of rows) {
      try {
        if (r.reason === 'quarantine_move') {
          // 격리 이동(B3 리뷰 M5): 공개 버킷에 남은 파일을 모두 quarantine으로 — 일부만 됐어도 다음 시도가 나머지를 옮긴다
          for (const key of await this.storage.list(r.bucket as Bucket, r.prefix)) await this.storage.move(r.bucket as Bucket, 'quarantine', key);
        } else if (r.reason === 'restore_move') {
          // 운영자 복원(B5): 격리본을 공개로 — 일부만 됐어도 다음 시도가 나머지를. 포스터가 공개 쪽에 있어야 live(깨진 페이지를 내지 않는다).
          // 복원 대기 중에 주인이 링크를 껐으면 끄기가 우선(B5 리뷰 M1): 되살리지 않고 off + 두 버킷의 그 판을 지운다
          if (await this.ownerTurnedOff(r.creatureId, r.prefix, now)) {
            await this.storage.removePrefix(BUCKETS.quarantine, r.prefix);
            await this.storage.removePrefix(BUCKETS.public, r.prefix);
            await this.prisma.storageGc.deleteMany({ where: { id: r.id } });
            done++;
            continue;
          }
          for (const key of await this.storage.list(BUCKETS.quarantine, r.prefix)) await this.storage.move(BUCKETS.quarantine, BUCKETS.public, key);
          if (!(await this.storage.list(BUCKETS.public, r.prefix)).some((k) => k.endsWith('/poster.jpg'))) throw new Error('복원할 포스터 없음');
          // 끄기와 엇갈려도 꺼진 링크는 live가 되지 않는다(link_enabled 조건을 같은 문장에)
          await this.prisma.$executeRaw`
            UPDATE app.public_pages p SET state = 'live', state_changed_at = ${now}
              FROM app.creatures c
             WHERE p.creature_id = ${r.creatureId}::uuid AND c.id = p.creature_id AND c.link_enabled
               AND p.state = 'quarantined' AND p.store_key || '/' || p.path_prefix = ${r.prefix}`;
          if (await this.ownerTurnedOff(r.creatureId, r.prefix, now)) await this.storage.removePrefix(BUCKETS.public, r.prefix);
          purge = true;
        } else if (r.reason === 'name_mask') {
          const m = await rewritePageWithoutName(this.prisma, this.storage, r, now);
          if (m.kind === 'later') {
            await this.prisma.storageGc.updateMany({ where: { id: r.id }, data: { notBefore: new Date(now.getTime() + WAIT_MS) } });
            continue;
          }
          if (m.kind === 'done') {
            await this.prisma.storageGc.deleteMany({ where: { id: r.id } });
            await this.processStorage({ ids: [m.drain] }, now);
            purge ||= m.live;
          }
        } else {
          await this.storage.removePrefix(r.bucket as Bucket, r.prefix);
        }
        await this.prisma.storageGc.deleteMany({ where: { id: r.id } });
        // 커밋하지 않은 판을 지웠으면 그 판의 공개 값 사본(pending_meta — 이름 포함)도 비운다(B3 리뷰 L9)
        if (r.reason === 'uncommitted' && r.bucket === 'page-staging') {
          await this.prisma.$executeRaw`
            UPDATE app.public_pages SET pending_ver = NULL, pending_prefix = NULL, pending_meta = NULL, pending_name_shown = NULL, pending_has_loop = NULL
             WHERE pending_prefix IS NOT NULL AND store_key || '/' || pending_prefix = ${r.prefix}`;
        }
        done++;
      } catch {
        failed++;
        // updateMany: 다른 인스턴스(겹친 Scheduler·요청 안 처리)가 이미 지운 행이면 조용히 지나간다
        await this.prisma.storageGc.updateMany({ where: { id: r.id }, data: { attempts: { increment: 1 }, notBefore: new Date(now.getTime() + RETRY_MS) } });
      }
    }
    if (purge) {
      try {
        await this.cdn.request();
      } catch {
        this.log.warn({ code: 'cdn_purge_request_failed' }, 'CDN 무효화 요청 실패(바닥 s-maxage 5분)');
      }
    }
    return { done, failed };
  }

  /**
   * 복원 대상 판의 주인이 링크를 꺼 두었으면 페이지를 off로 내리고 true(파일 삭제는 부르는 쪽). 아직 격리 중인 그 판일 때만
   */
  private async ownerTurnedOff(creatureId: string | null, prefix: string, now: Date): Promise<boolean> {
    if (!creatureId) return false;
    const n = await this.prisma.$executeRaw`
      UPDATE app.public_pages p SET state = 'off', state_changed_at = ${now}, path_prefix = NULL, meta = NULL, name_shown = false, has_loop = false
        FROM app.creatures c
       WHERE p.creature_id = ${creatureId}::uuid AND c.id = p.creature_id AND NOT c.link_enabled
         AND p.state = 'quarantined' AND p.store_key || '/' || p.path_prefix = ${prefix}`;
    return n > 0;
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
