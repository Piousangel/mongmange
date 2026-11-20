// 서버 시계 하나(B2). 이력의 ISO 주·만료·하루 상한·솎기 기준이 모두 이 값을 쓴다 — 시험은 인스턴스의 now를 바꿔 '29일 뒤'를 만든다.
// 시간·성장 판단에는 쓰지 않는다(그건 기기 시계, D-07·3-4 '시계').
import { Injectable } from '@nestjs/common';

@Injectable()
export class Clock {
  now(): number {
    return Date.now();
  }
}

/** UTC 날짜 `YYYY-MM-DD` */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** 그달 1일(UTC) — users.last_active_month(5-5: 월 단위로만) */
export function monthStart(ms: number): Date {
  const d = new Date(ms);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** 서버 UTC ISO 주 `2026-W52`(3-4-1 weekly 칸) — Postgres `to_char(…, 'IYYY-"W"IW')`와 같은 값 */
export function isoWeekUtc(ms: number): string {
  const d = new Date(ms);
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = day.getUTCDay() || 7; // 월=1 … 일=7
  day.setUTCDate(day.getUTCDate() + 4 - dow); // 그 주의 목요일이 ISO 해를 정한다
  const year = day.getUTCFullYear();
  const week = Math.ceil(((day.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}
