// 계정 삭제(architecture.md v2.2 3-8 '삭제(파기) 절차' — 연쇄 목록의 정본):
//  ① 지울 Storage 경로를 모은다 — 지금(B2)은 그 몽망이의 storage_gc 대기 항목. B3가 public_pages(path_prefix·pending_prefix)·격리본을 더한다.
//  ② 한 트랜잭션: deletion_log(영수증 해시, 24시간) → storage_gc를 지금으로 당기고 deletion_id 표시 → auth_gc에 이 사용자의 모든 sub
//     (살아 있는 것 + 되찾기로 끊긴 것) → users 삭제(CASCADE: user_auth·creatures·saves·save_versions). link_daily 삭제는 B3(표가 B3).
//  ③⑤ 커밋 뒤 요청 안에서 한 번 시도(gc.service), 실패분은 Scheduler가 재시도. ④ /m CDN 무효화는 B3(공개 페이지가 B3).
//  ⑥ 대기열이 비면 completed_at → 영수증 'done'.
//  남기는 것: metric_*(식별자 없음), reports(B5, 코드만 1년), 백업 속 사본(7일 뒤 소멸).
//  백업 복원 대비(B2 리뷰 m2): deletion_log.subject_hmac = HMAC(pepper 파생 키, user id)를 백업 보관 기간(7일)만 둔다.
//  복원하면 지운 사용자가 되살아나므로 reapplyAfterRestore()가 이 값으로 다시 지운다(런북 docs/ops/restore-runbook.md). 7일 뒤 NULL.
// deletion_log에는 누구인지 없이 개수만 남는다(items) — 삭제 뒤 흔적 0은 test/cloud.db.test.ts가 모든 표를 훑어 확인한다.
import { createHmac } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DELETION_RECEIPT_RE, DELETION_RECEIPT_TTL_HOURS, type DeletionStatus } from '@mong/contract';
import { Clock } from '../common/clock';
import { PrismaService } from '../prisma/prisma.service';
import { newReceipt, receiptHash } from '../account/codes';
import { RecoveryPepper } from '../account/recovery-pepper';
import { GcService } from './gc.service';

export type DeletionSource =
  | { channel: 'app'; kind: 'user_request' }
  | { channel: 'web'; kind: 'web_request' }
  | { channel: 'app'; kind: 'restore_reapply' };

/** 운영 백업 보관 기간(Supabase Pro 일일 백업 7일, 3-8 '백업') — 지운 사용자 HMAC도 이만큼만 */
export const BACKUP_RETENTION_DAYS = 7;

/** 지운 사용자 표지: 단방향 HMAC. 키는 pepper에서 용도를 나눠 파생(글귀 해시와 섞이지 않게) */
export function subjectHmac(pepper: string, userId: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(createHmac('sha256', pepper).update(`deletion-subject:${userId.toLowerCase()}`, 'utf8').digest());
}

@Injectable()
export class DeletionService {
  private readonly log = new Logger('Deletion');

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly gc: GcService,
    private readonly pepper: RecoveryPepper,
  ) {}

  async deleteUser(userId: string, source: DeletionSource): Promise<{ receipt: string }> {
    const now = new Date(this.clock.now());
    const { receipt, hash } = newReceipt();
    const deletionId = await this.prisma.$transaction(async (tx) => {
      // 같은 사용자의 삭제가 동시에 둘 오면 하나만 — 사용자 행을 잠근다
      const [u] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM app.users WHERE id = ${userId}::uuid FOR UPDATE`;
      if (!u) throw new NotFoundException({ code: 'no_account', message: '이미 지워졌습니다' });
      const creature = await tx.creature.findUnique({ where: { userId }, select: { id: true } });
      const subs = await tx.userAuth.findMany({ where: { userId }, select: { sub: true } });
      const [counts] = await tx.$queryRaw<{ saves: number; versions: number; files: number }[]>`
        SELECT (SELECT count(*) FROM app.saves WHERE creature_id = ${creature?.id ?? null}::uuid)::int AS saves,
               (SELECT count(*) FROM app.save_versions WHERE creature_id = ${creature?.id ?? null}::uuid)::int AS versions,
               (SELECT count(*) FROM app.storage_gc WHERE creature_id = ${creature?.id ?? null}::uuid)::int AS files`;
      const log = await tx.deletionLog.create({
        data: {
          requestedAt: now,
          channel: source.channel,
          kind: source.kind,
          // 개수만(누구인지·코드·sub 없음)
          items: { saves: counts!.saves, versions: counts!.versions, files: counts!.files, logins: subs.length },
          receiptHash: hash,
          receiptExpiresAt: new Date(now.getTime() + DELETION_RECEIPT_TTL_HOURS * 3_600_000),
          subjectHmac: subjectHmac(this.pepper.current.value, userId),
          subjectExpiresAt: new Date(now.getTime() + BACKUP_RETENTION_DAYS * 86_400_000),
        },
        select: { id: true },
      });
      if (creature) {
        await tx.storageGc.updateMany({ where: { creatureId: creature.id }, data: { notBefore: now, deletionId: log.id, reason: 'deletion' } });
      }
      if (subs.length) {
        await tx.authGc.createMany({ data: subs.map((s) => ({ sub: s.sub, deletionId: log.id, notBefore: now })), skipDuplicates: true });
      }
      await tx.user.delete({ where: { id: userId } });
      return log.id;
    });
    try {
      await this.gc.drainDeletion(deletionId);
    } catch (e) {
      // 응답은 202 그대로 — 남은 일은 Scheduler가 이어 한다
      this.log.warn({ code: 'deletion_drain_failed', type: e instanceof Error ? e.name : 'unknown' }, '삭제 뒤처리 지연');
    }
    return { receipt };
  }

  /**
   * 백업 복원 뒤 재삭제(런북). 살아 있는 subject_hmac과 같은 사용자를 찾아 같은 연쇄로 다시 지운다.
   * 사용자 수만큼 HMAC을 계산한다(소프트런칭 규모 — 수만 명이면 수 초). 지금 판 + 옛 판 pepper를 모두 대 본다
   */
  async reapplyAfterRestore(): Promise<{ reapplied: number }> {
    const now = new Date(this.clock.now());
    const marks = await this.prisma.deletionLog.findMany({
      where: { subjectHmac: { not: null }, subjectExpiresAt: { gt: now } },
      select: { subjectHmac: true },
    });
    if (!marks.length) return { reapplied: 0 };
    const wanted = new Set(marks.map((m) => Buffer.from(m.subjectHmac!).toString('hex')));
    const peppers = [this.pepper.current, ...this.pepper.previous];
    let reapplied = 0;
    let cursor: string | undefined;
    for (;;) {
      const users = await this.prisma.user.findMany({ select: { id: true }, orderBy: { id: 'asc' }, take: 1000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      if (!users.length) break;
      for (const u of users) {
        if (peppers.some((p) => wanted.has(Buffer.from(subjectHmac(p.value, u.id)).toString('hex')))) {
          await this.deleteUser(u.id, { channel: 'app', kind: 'restore_reapply' });
          reapplied++;
        }
      }
      cursor = users[users.length - 1]!.id;
    }
    if (reapplied) this.log.warn({ code: 'restore_reapply', reapplied }, '복원 뒤 지운 계정을 다시 지움');
    return { reapplied };
  }

  /** GET /deletion/{receipt} — 인증 없음(영수증이 곧 권한). 모르는·만료된 영수증은 404 */
  async status(receipt: string): Promise<DeletionStatus> {
    if (!DELETION_RECEIPT_RE.test(receipt)) throw new NotFoundException();
    const now = new Date(this.clock.now());
    const d = await this.prisma.deletionLog.findFirst({
      where: { receiptHash: receiptHash(receipt), receiptExpiresAt: { gt: now } },
      select: { completedAt: true },
    });
    if (!d) throw new NotFoundException();
    return { state: d.completedAt ? 'done' : 'pending' };
  }
}
