// 장기 미사용 판단의 시계(architecture.md 5-5, 처리방침 6절 '장기 미사용 계정', K20, PM 11-24 '활동 날짜는 인증된 요청마다').
//  - '활동' = 인증 가드를 통과한 요청 전부(세이브·링크·계정). 붙은 사용자가 있는 요청만 — 영수증 조회·/m·핑처럼 인증이 없는 길은 세지 않는다.
//  - 값은 그달 1일(UTC, 서버 시계 Clock)뿐 — 언제 썼는지가 일 단위로 남지 않는다. 월 경계는 UTC 00:00(KST 09:00)이다.
//  - 읽기는 가드의 로그인 조회 한 문장에 붙어 온다(user_auth JOIN users — 요청당 읽기 1회는 V25 전과 같음, 시험이 SQL 문장 수를 센다).
//  - 쓰기는 달마다 최대 한 번: 가드가 이미 읽은 값으로 같은 달이면 UPDATE를 내지 않는다. 동시 요청이 함께 쓰더라도
//    `last_active_month < 이달` 조건이라 같은 값을 한 번 더 쓰거나(무해) 0행이다. 시계가 어긋난 인스턴스가 값을 되돌리지도 못한다.
import { Injectable, Logger } from '@nestjs/common';
import { Clock, monthStart } from '../common/clock';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActivityTracker {
  private readonly log = new Logger('Activity');
  /** 이 인스턴스가 뜬 뒤 갱신 실패 수(카운트 로그 — B6 알림 대상 코드 `activity_touch_failed`) */
  private failures = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /**
   * 이 요청의 달이 저장된 달보다 늦을 때만 UPDATE. 실패해도 요청은 그대로 — 다음 요청이 다시 쓴다(코드·누적 개수만 남김).
   * 통째로 실패가 이어지면 DB 최신 활동 달이 멈춰 정리 잡의 시계 차단기(inactive-sweep.ts ②)가 2달 안에 정리를 멈춘다
   */
  async touch(userId: string, stored: Date | null): Promise<void> {
    const m = monthStart(this.clock.now());
    if (stored && stored.getTime() >= m.getTime()) return;
    try {
      await this.prisma.$executeRaw`
        UPDATE app.users SET last_active_month = ${m}::date
         WHERE id = ${userId}::uuid AND (last_active_month IS NULL OR last_active_month < ${m}::date)`;
    } catch (e) {
      this.failures++;
      this.log.warn({ code: 'activity_touch_failed', failures: this.failures, type: e instanceof Error ? e.name : 'unknown' }, '활동 달 갱신 실패(다음 요청이 다시 씀)');
    }
  }
}
