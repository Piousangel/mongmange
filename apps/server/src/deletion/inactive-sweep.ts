// 2년 미사용 정리(V25, architecture.md 5-5, 처리방침 6절 '장기 미사용 계정', K20). 매일 Scheduler `storage-gc`가 대기열 처리와 독립으로 함께 부른다
// (PM 11-25 — 별도 잡 없음). `POST /internal/cron/inactive-sweep`은 수동 실행·시험용(B2 cron OIDC 그대로, 하루 1회 잠금 없음).
//  - 대상: 활동 달(last_active_month, 없으면 만든 달 — deletion.service.ts activeMonthOf와 같은 정의)이 '이달 1일(UTC) − 24개월'보다 앞선 사용자.
//    달 단위 값은 그달 마지막 날까지의 활동일 수 있으므로, 이 조건이면 마지막 활동 뒤 **꼭 2년이 지난** 계정만 지운다
//    (예: 2024-11 활동 → 2026-12-01부터 대상. 2026-11에는 23개월 남짓이라 대상이 아니다).
//  - 삭제는 계정 삭제 연쇄 그대로(deletion.service.ts 3-8): 공개·staging·격리 파일, 이력, link_daily, 열린 신고, Auth 사용자까지.
//    deletion_log(kind=inactive, channel=app — 여기서 app은 '시스템 실행')에는 개수만. 연쇄 안에서 잠근 행을 다시 보고, 그 사이 활동했으면 건너뛴다.
//  - 차단기(리뷰 M2 — 되돌릴 수 없는 일이라 지우기 전에 멈춘다. 멈추면 한 명도 지우지 않고 error 로그, 운영자가 확인):
//    ① 하루 대상 수가 min(전체 계정의 1%, 200)을 넘으면 `limit`. 운영자가 대상 수를 확인한 뒤 수동 실행에 `confirm=<그 수>`를 주면 그 실행만 통과.
//    ② 이달(서버 시계)이 DB의 최신 활동 달보다 2달 넘게 앞서면 `clock` — 시계가 미래로 튀었거나 활동 갱신이 통째로 멈춘 경우.
//    활동 갱신 실패율로 멈추는 조건은 두지 않는다: 실패 개수는 인스턴스 메모리에 있어 정리 실행과 공유되지 않고, 실패는 다음 요청이
//    다시 쓰므로 한 사람이 잘못 지워지려면 24개월 동안 그 사람의 모든 요청이 실패해야 한다. 통째 실패는 ②가 2달 안에 잡는다.
//  - 한 실행 SWEEP_MAX명·시간 예산 budgetMs(리뷰 M3). 넘치면 more=true — 다음 날 storage-gc가 잇는다.
//    매일 실행(runDaily)은 inactive_sweep 행의 last_day를 오늘로 바꾸는 데 성공해야만 돈다 — Scheduler 재시도가 같은 날 정리를 다시 돌리지 않는다.
//    실패한 사용자는 대상으로 남아 다음 날이 다시 하고, Storage·Auth 쪽 실패분은 삭제 대기열(storage-gc)이 재시도한다.
//  - 연락 수단이 없어 사전 개별 안내는 하지 않는다(처리방침 6절의 사전 고지로 갈음). 로그·응답은 개수만(식별자 0).
import { Injectable, Logger } from '@nestjs/common';
import { Clock, monthStart, utcDay } from '../common/clock';
import { PrismaService } from '../prisma/prisma.service';
import { DeletionService, InactiveSkipped } from './deletion.service';

/** 미사용 기간(개월) — 처리방침 '2년' */
export const INACTIVE_MONTHS = 24;
const SWEEP_BATCH = 50;
/** 한 실행에서 지우는 최대 사용자 수(= 차단기 ①의 절대 상한) */
export const SWEEP_MAX = 200;
/** 차단기 ②: 이달이 최신 활동 달보다 이만큼(개월) 넘게 앞서면 멈춤 */
export const CLOCK_SLACK_MONTHS = 2;
/** 한 실행 시간 예산 — Scheduler attemptDeadline(B6, architecture.md Scheduler 행)은 이것 + 대기열 처리보다 넉넉히 */
export const SWEEP_BUDGET_MS = 60_000;

export type SweepHalt = 'limit' | 'clock' | 'already_ran';

export interface InactiveReport {
  inactiveDeleted: number;
  skipped: number;
  failed: number;
  more: boolean;
  /** 지우기 전 대상 수(개수만) — 차단기 ①을 넘길 때 운영자가 confirm에 주는 값 */
  candidates: number;
  /** 멈춘 사유. 멈췄으면 한 명도 지우지 않았다 */
  halted: SweepHalt | null;
}

/** 이 날짜(그달 1일, UTC)보다 활동 달이 앞서면 대상 */
export function inactiveBefore(nowMs: number): Date {
  const m = monthStart(nowMs);
  return new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() - INACTIVE_MONTHS, 1));
}

/** 차단기 ①: 하루 대상 상한 = min(전체 계정의 1%(내림), 200) */
export function sweepLimit(totalUsers: number): number {
  return Math.min(Math.floor(totalUsers / 100), SWEEP_MAX);
}

/** 두 달(그달 1일) 사이 개월 수 a − b */
export function monthsBetween(a: Date, b: Date): number {
  return (a.getUTCFullYear() - b.getUTCFullYear()) * 12 + (a.getUTCMonth() - b.getUTCMonth());
}

@Injectable()
export class InactiveSweep {
  private readonly log = new Logger('InactiveSweep');
  /** 시험이 줄인다 */
  budgetMs = SWEEP_BUDGET_MS;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly deletion: DeletionService,
  ) {}

  /** 매일 storage-gc가 부른다: 오늘(UTC) 처음일 때만 정리하고 결과(개수·사유)를 기록 행에 남긴다 */
  async runDaily(): Promise<InactiveReport> {
    const now = this.clock.now();
    const claimed = await this.prisma.$executeRaw`
      UPDATE app.inactive_sweep SET last_day = ${utcDay(now)}::date, started_at = ${new Date(now)}, finished_at = NULL
       WHERE id = 1 AND (last_day IS NULL OR last_day < ${utcDay(now)}::date)`;
    if (!claimed) {
      const r: InactiveReport = { inactiveDeleted: 0, skipped: 0, failed: 0, more: false, candidates: 0, halted: 'already_ran' };
      this.log.log({ inactive: r }, '2년 미사용 정리 — 오늘은 이미 돌았음');
      return r;
    }
    const r = await this.run();
    await this.prisma.inactiveSweepState.update({
      where: { id: 1 },
      data: { finishedAt: new Date(this.clock.now()), deleted: r.inactiveDeleted, skipped: r.skipped, failed: r.failed, candidates: r.candidates, more: r.more, halted: r.halted },
    });
    return r;
  }

  /** 정리 한 번(하루 잠금 없음). confirm = 운영자가 확인한 대상 수 — 지금 대상 수와 같을 때만 차단기 ①을 넘는다(②는 늘 적용) */
  async run(opts: { confirm?: number } = {}): Promise<InactiveReport> {
    const nowMs = this.clock.now();
    const before = inactiveBefore(nowMs);
    const r: InactiveReport = { inactiveDeleted: 0, skipped: 0, failed: 0, more: false, candidates: 0, halted: null };
    const [s] = await this.prisma.$queryRaw<{ total: number; latest: Date | null; candidates: number }[]>`
      SELECT count(*)::int AS total, max(last_active_month) AS latest,
             (count(*) FILTER (WHERE COALESCE(last_active_month, date_trunc('month', created_at AT TIME ZONE 'UTC')::date) < ${before}::date))::int AS candidates
        FROM app.users`;
    r.candidates = s!.candidates;
    const ahead = s!.latest ? monthsBetween(monthStart(nowMs), s!.latest) : 0;
    if (ahead > CLOCK_SLACK_MONTHS) {
      r.halted = 'clock';
      this.log.error({ code: 'inactive_sweep_clock', monthsAhead: ahead }, '서버 시계가 최신 활동 달보다 너무 앞섬 — 정리 멈춤(운영 확인)');
      return this.finish(r);
    }
    const limit = sweepLimit(s!.total);
    if (r.candidates > limit && opts.confirm !== r.candidates) {
      r.halted = 'limit';
      this.log.error({ code: 'inactive_sweep_tripped', candidates: r.candidates, total: s!.total, limit }, '정리 대상이 하루 상한을 넘음 — 한 명도 지우지 않음(운영 확인 뒤 confirm)');
      return this.finish(r);
    }
    const t0 = performance.now();
    let cursor = '00000000-0000-0000-0000-000000000000';
    let seen = 0;
    while (!r.more) {
      const take = Math.min(SWEEP_BATCH, SWEEP_MAX - seen);
      if (take <= 0) {
        r.more = (await this.candidates(before, cursor, 1)).length > 0;
        break;
      }
      const ids = await this.candidates(before, cursor, take);
      if (!ids.length) break;
      for (const id of ids) {
        try {
          await this.deletion.deleteUser(id, { channel: 'app', kind: 'inactive', activeBefore: before });
          r.inactiveDeleted++;
        } catch (e) {
          // 그 사이 활동했거나(InactiveSkipped) 다른 실행이 먼저 지웠으면(404) 건너뜀
          if (e instanceof InactiveSkipped || (e as { status?: number }).status === 404) r.skipped++;
          else r.failed++;
        }
        seen++;
        cursor = id;
        // 시간 예산은 한 명을 처리한 뒤에 본다 — 실행마다 적어도 한 명은 나아간다
        if (performance.now() - t0 >= this.budgetMs) {
          r.more = true;
          break;
        }
      }
    }
    return this.finish(r);
  }

  /** 지금 대상 수(운영 확인·시험용) */
  async candidateCount(): Promise<number> {
    const before = inactiveBefore(this.clock.now());
    const [s] = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM app.users
       WHERE COALESCE(last_active_month, date_trunc('month', created_at AT TIME ZONE 'UTC')::date) < ${before}::date`;
    return s!.n;
  }

  private finish(r: InactiveReport): InactiveReport {
    this.log.log({ inactive: r }, '2년 미사용 정리');
    // 경고 코드 분리(리뷰 L3): 사용자 단위 실패는 error, 정상 적체(상한·시간 예산)는 warn
    if (r.failed) this.log.error({ code: 'inactive_sweep_failed', failed: r.failed }, '일부 계정 정리 실패 — 다음 날 다시');
    if (r.more) this.log.warn({ code: 'inactive_sweep_more' }, '정리할 계정이 남음 — 다음 날 잇는다');
    return r;
  }

  private async candidates(before: Date, after: string, take: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM app.users
       WHERE COALESCE(last_active_month, date_trunc('month', created_at AT TIME ZONE 'UTC')::date) < ${before}::date
         AND id > ${after}::uuid
       ORDER BY id LIMIT ${take}`;
    return rows.map((x) => x.id);
  }
}
