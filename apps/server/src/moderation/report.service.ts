// 신고 → 자동 숨김(architecture.md v2.2 3-8 '신고 → 자동 숨김' 1~4, 처리방침 3-6·5·6절).
//  - 대상(link = 인장 코드)마다 열린 reports 행 하나, 새로 열 때 그 신고 전용 소금 32바이트(서버 난수) + 창 7일.
//  - 신고자 키 = HMAC-SHA256(소금, IP 접두) — IPv4 /32·IPv6 /48(reportKeyPrefix, B5 리뷰 H2). User-Agent는 넣지 않는다. 평문 IP는 어디에도 저장하지 않는다.
//    report_hits PK(report_id, reporter_key)라 같은 사람은 창 안에서 몇 번을 눌러도 1. 소금이 대상마다 달라 대상끼리 신고자를 잇지 못한다.
//  - 창 안 서로 다른 키 REPORT_HIDE_THRESHOLD(3)개 → **같은 트랜잭션에서** auto_hidden + 소금 NULL(트리거가 키 삭제) + 페이지 quarantined,
//    커밋 뒤 공개 → 격리 이동(요청 안에서 한 번, 실패분은 대기열)과 /m CDN 무효화.
//  - 문턱을 넘어도 숨기지 않고 **운영자 대기 목록에만** 올리는 셋(B5 리뷰 H2 — reports.held, 행은 열린 채 7일 창을 마저 센다):
//    disabled = 자동 숨김 꺼짐(REPORT_AUTO_HIDE, 운영 기본 — B6 XFF 실측 전) / immune = 최근 7일 안에 복원된 대상 /
//    breaker = 서비스 전체 최근 1시간 자동 숨김이 REPORT_AUTO_HIDE_PER_HOUR(5)건 — error 알림 report_auto_hidden_burst.
//  - 창이 끝난 열린 행은 여기서도(다음 신고 때) 닫고, Scheduler `moderation`이 5분마다 app.expire_reports로 닫는다.
//  - 살아 있지 않은 대상(없는·꺼진·격리·삭제된 코드)은 세지 않는다 — 응답은 같다(대상이 있는지 알리지 않음).
// 로그에 코드·IP·키를 남기지 않는다(5-2).
import { createHmac, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REPORT_AUTO_HIDE_PER_HOUR, REPORT_HIDE_THRESHOLD, REPORT_IMMUNITY_DAYS, REPORT_WINDOW_DAYS, type ReportReason } from '@mong/contract';
import { Clock } from '../common/clock';
import type { Env } from '../config/env';
import { PageService } from '../pages/page.service';
import { PrismaService } from '../prisma/prisma.service';

export type HeldReason = 'disabled' | 'immune' | 'breaker';
export type ReportOutcome = 'ignored' | 'duplicate' | 'counted' | 'hidden' | 'held';

/** 신고자 키(가명): HMAC-SHA256(그 대상의 소금, IP 접두). 소금이 지워지면 되짚을 수 없다 */
export function reporterKey(salt: Uint8Array, ipPrefix: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(createHmac('sha256', salt).update(ipPrefix, 'utf8').digest());
}

@Injectable()
export class ReportService {
  private readonly log = new Logger('Report');
  /** 자동 숨김 켜짐(env REPORT_AUTO_HIDE, 비우면 운영 꺼짐·그 밖 켜짐). 시험이 바꿀 수 있게 readonly가 아니다 */
  autoHide: boolean;
  /** 서비스 전체 1시간 자동 숨김 상한(env REPORT_AUTO_HIDE_PER_HOUR, 기본 contract 5) */
  autoHidePerHour: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly pages: PageService,
    config: ConfigService<Env, true>,
  ) {
    this.autoHide = config.get('REPORT_AUTO_HIDE', { infer: true }) ?? config.get('NODE_ENV', { infer: true }) !== 'production';
    this.autoHidePerHour = config.get('REPORT_AUTO_HIDE_PER_HOUR', { infer: true }) ?? REPORT_AUTO_HIDE_PER_HOUR;
  }

  /** ipPrefix = reportKeyPrefix(clientIp) — 평문 IP는 이 함수 밖에서 이미 접두로 접혀 온다 */
  async report(code: string, ipPrefix: string, reason: ReportReason): Promise<ReportOutcome> {
    const now = new Date(this.clock.now());
    const windowEnds = new Date(now.getTime() + REPORT_WINDOW_DAYS * 86_400_000);
    const out = await this.prisma.$transaction(async (tx) => {
      // 페이지 행을 먼저 잠근다 — 잠금 순서를 운영 SQL 함수(페이지 → 신고 행)·PUT/commit(페이지)과 같게 해 교착을 막는다
      const [c] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT c.id FROM app.creatures c JOIN app.public_pages p ON p.creature_id = c.id
         WHERE c.code = ${code} AND c.link_enabled AND NOT c.hidden AND p.state = 'live' FOR UPDATE OF p`;
      if (!c) return { outcome: 'ignored' as const, gcId: null };
      // 창이 끝난 열린 행은 닫는다(소금 NULL → 트리거가 신고자 키 삭제). 다음 신고는 새 행·새 소금
      await tx.$executeRaw`
        UPDATE app.reports SET status = 'expired', salt = NULL, resolved_at = ${now}
         WHERE target_kind = 'link' AND target_ref = ${code} AND status = 'open' AND window_ends_at <= ${now}`;
      await tx.$executeRaw`
        INSERT INTO app.reports (target_kind, target_ref, created_at, window_ends_at, salt)
        VALUES ('link', ${code}, ${now}, ${windowEnds}, ${Uint8Array.from(randomBytes(32))})
        ON CONFLICT (target_kind, target_ref) WHERE status = 'open' DO NOTHING`;
      const [r] = await tx.$queryRaw<Array<{ id: bigint; salt: Uint8Array }>>`
        SELECT id, salt FROM app.reports WHERE target_kind = 'link' AND target_ref = ${code} AND status = 'open' FOR UPDATE`;
      const key = reporterKey(r!.salt, ipPrefix);
      const added = await tx.$executeRaw`
        INSERT INTO app.report_hits (report_id, reporter_key) VALUES (${r!.id}, ${key}) ON CONFLICT DO NOTHING`;
      if (!added) return { outcome: 'duplicate' as const, gcId: null };
      const [u] = await tx.$queryRaw<Array<{ n: number }>>`
        UPDATE app.reports
           SET distinct_reporters = distinct_reporters + 1,
               reason_counts = jsonb_set(reason_counts, ARRAY[${reason}::text], to_jsonb(coalesce((reason_counts ->> ${reason}::text)::int, 0) + 1))
         WHERE id = ${r!.id} RETURNING distinct_reporters::int AS n`;
      if (u!.n < REPORT_HIDE_THRESHOLD) return { outcome: 'counted' as const, gcId: null };
      const held = await this.holdReason(tx, code, now);
      if (held) {
        // 숨기지 않고 대기 목록에만(행은 열린 채 — 소금은 7일 창이 끝나면 지워진다)
        await tx.$executeRaw`UPDATE app.reports SET held = ${held} WHERE id = ${r!.id} AND held IS NULL`;
        return { outcome: 'held' as const, gcId: null, held };
      }
      // 문턱: 숨김과 격리를 한 트랜잭션에(둘 중 하나만 커밋되는 일이 없게). 소금은 지금 지운다
      await tx.$executeRaw`UPDATE app.reports SET status = 'auto_hidden', salt = NULL, hidden_at = ${now} WHERE id = ${r!.id}`;
      return { outcome: 'hidden' as const, gcId: await this.pages.markQuarantined(tx, c.id) };
    });
    if (out.outcome === 'held' && 'held' in out) {
      // breaker는 서비스 전체 이상 — error(알림). 그 밖은 warn. 코드 없음
      if (out.held === 'breaker') this.log.error({ code: 'report_auto_hidden_burst' }, '자동 숨김 차단기 — 1시간 상한, 대기 목록으로만');
      else this.log.warn({ code: 'report_held', held: out.held }, '신고 문턱 — 자동 숨김 없이 대기 목록');
    }
    if (out.outcome === 'hidden') {
      // 운영 알림 대상(warn, 코드 없음): 7일 안에 Studio에서 확인(docs/ops/moderation/README.md)
      this.log.warn({ code: 'report_auto_hidden' }, '신고 문턱 — 자동 숨김(격리)');
      await this.pages.afterQuarantine(out.gcId);
    }
    return out.outcome;
  }

  /** 문턱을 넘었는데 숨기지 말아야 하는 까닭(없으면 null) */
  private async holdReason(tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0], code: string, now: Date): Promise<HeldReason | null> {
    if (!this.autoHide) return 'disabled';
    const since = new Date(now.getTime() - REPORT_IMMUNITY_DAYS * 86_400_000);
    const [im] = await tx.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM app.reports
       WHERE target_kind = 'link' AND target_ref = ${code} AND status = 'restored' AND resolved_at > ${since}`;
    if (im!.n) return 'immune';
    const hour = new Date(now.getTime() - 3_600_000);
    const [b] = await tx.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM app.reports WHERE hidden_at > ${hour}`;
    if (b!.n >= this.autoHidePerHour) return 'breaker';
    return null;
  }
}
