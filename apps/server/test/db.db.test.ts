// 실제 Postgres 시험(pnpm --filter server test:db). DATABASE_URL·DIRECT_URL은 밖에서 주고 둘 다 **prisma 롤**이어야 한다
// (로컬: compose db + prisma/local/00-roles.sql, CI: 서비스 컨테이너 + 같은 SQL). 마이그레이션이 먼저 돌아 있어야 한다.
// RLS 시험은 슈퍼유저가 아닌 런타임 롤로 돈다 — Supabase처럼 '표 소유자 ≠ 다른 롤'일 때 무엇이 보이는지 재현한다(B1 리뷰 I4).
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.factory';
import { MetricAggregator } from '../src/metrics/metric-aggregator';
import { PrismaService } from '../src/prisma/prisma.service';
import { pingSchema, pingToCells } from '@mong/contract';
import { readFileSync } from 'node:fs';

let app: NestFastifyApplication;
let prisma: PrismaService;

beforeAll(async () => {
  app = await createApp({ bufferLogs: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  prisma = app.get(PrismaService);
});
afterAll(async () => {
  await app?.close();
});

class Rollback<T> extends Error {
  constructor(readonly value: T) {
    super('rollback');
  }
}
/** 트랜잭션 안에서 SET LOCAL ROLE 등으로 확인하고 되돌린다 */
async function inRolledBackTx<T>(fn: (tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0]) => Promise<T>): Promise<T> {
  try {
    await prisma.$transaction(async (tx) => {
      throw new Rollback(await fn(tx));
    });
  } catch (e) {
    if (e instanceof Rollback) return e.value as T;
    throw e;
  }
  throw new Error('unreachable');
}

describe('실제 DB', () => {
  it('/readyz 200', async () => {
    await request(app.getHttpServer()).get('/readyz').expect(200, { ok: true, db: 'up' });
  });

  it('런타임 롤은 슈퍼유저·BYPASSRLS가 아니고, app 표의 소유자다', async () => {
    const [me] = await prisma.$queryRaw<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }[]>`
      select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
    expect(me).toMatchObject({ rolsuper: false, rolbypassrls: false });
    const owners = await prisma.$queryRaw<{ tableowner: string }[]>`select tableowner from pg_tables where schemaname = 'app'`;
    expect(owners.length).toBe(10);
    for (const o of owners) expect(o.tableowner).toBe(me!.rolname);
  });

  it('app 스키마 표가 있고, 사용자당 몽망이 하나(UNIQUE user_id)·CASCADE 삭제', async () => {
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, ageGateV: 1, ageConfirmedOn: new Date('2026-11-20') } });
    await prisma.creature.create({ data: { userId, code: randomUUID().slice(0, 8).toUpperCase() } });
    await expect(prisma.creature.create({ data: { userId, code: randomUUID().slice(0, 8).toUpperCase() } })).rejects.toThrow();
    await prisma.user.delete({ where: { id: userId } });
    expect(await prisma.creature.count({ where: { userId } })).toBe(0);
  });

  it('RLS가 켜져 있다(정책 0개)', async () => {
    const rows = await prisma.$queryRaw<{ relname: string; relrowsecurity: boolean }[]>`
      select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app' and c.relkind = 'r' order by c.relname`;
    expect(rows).toEqual(
      ['auth_gc', 'creatures', 'deletion_log', 'metric_daily', 'metric_monthly', 'save_versions', 'saves', 'storage_gc', 'user_auth', 'users'].map(
        (relname) => ({ relname, relrowsecurity: true }),
      ),
    );
    const [p] = await prisma.$queryRaw<{ n: bigint }[]>`select count(*) as n from pg_policies where schemaname = 'app'`;
    expect(Number(p!.n)).toBe(0);
  });

  it('Data API 롤(anon)은 마이그레이션이 권한을 거둬 app 표에 손댈 수 없다', async () => {
    const err = await inRolledBackTx(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE anon');
      try {
        await tx.$queryRawUnsafe('select count(*) from app.users');
        return null;
      } catch (e) {
        return String(e);
      }
    }).catch((e: unknown) => String(e));
    expect(err).toMatch(/permission denied/i);
  });

  it('소유자가 아닌 롤은 SELECT 권한을 받아도 RLS 때문에 0행(Supabase에서 런타임 롤을 잘못 붙였을 때의 모습)', async () => {
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId } });
    try {
      const seen = await inRolledBackTx(async (tx) => {
        await tx.$executeRawUnsafe('GRANT USAGE ON SCHEMA app TO authenticated');
        await tx.$executeRawUnsafe('GRANT SELECT ON app.users TO authenticated');
        const [owner] = await tx.$queryRawUnsafe<{ n: bigint }[]>('select count(*) as n from app.users');
        await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
        const [other] = await tx.$queryRawUnsafe<{ n: bigint }[]>('select count(*) as n from app.users');
        return { owner: Number(owner!.n), other: Number(other!.n) };
      });
      expect(seen.owner).toBeGreaterThanOrEqual(1);
      expect(seen.other).toBe(0);
    } finally {
      await prisma.user.delete({ where: { id: userId } });
    }
  });

  // 그럴듯한 오답 판별(OPERATING 8-1): 집계 표에 사람·기기·IP·시각을 담을 '자리'가 생기면 실패한다.
  // 열을 더하려면 이 목록과 처리방침 3-1을 함께 고쳐야 한다.
  it('metric_daily 열은 칸(날짜·차원)과 개수뿐이고 시각(timestamp) 열이 없다', async () => {
    const cols = await prisma.$queryRaw<{ column_name: string; data_type: string }[]>`
      select column_name, data_type from information_schema.columns
      where table_schema = 'app' and table_name = 'metric_daily' order by ordinal_position`;
    expect(cols.map((c) => c.column_name)).toEqual(['day', 'event', 'cohort_day', 'day_n', 'platform', 'app_ver', 'lang', 'nt', 'wg', 'moon', 'count']);
    for (const c of cols) expect(c.data_type).not.toMatch(/timestamp|time|inet|uuid|bytea|json/);
  });

  it('집계 UPSERT: 같은 칸은 더해지고 다른 칸은 따로, 행에는 칸 값과 개수만', async () => {
    const agg = app.get(MetricAggregator);
    const cohort = '2001-01-01'; // 다른 시험·실데이터와 겹치지 않는 날짜
    const p = pingSchema.parse({
      cohortDay: cohort,
      dayN: 3,
      platform: 'ios',
      appVer: '9.9',
      lang: 'en',
      dims: { nt: 'B', wg: '-', moon: '1' },
      events: [
        { e: 'open', dayN: 3 },
        { e: 'open', dayN: 3 },
        { e: 'first_night', dayN: 1 },
      ],
    });
    try {
      agg.add(pingToCells(p));
      await agg.flush();
      agg.add(pingToCells(p));
      await agg.flush();
      const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
        select to_char(day, 'YYYY-MM-DD') as day, event, day_n, nt, wg, moon, count from app.metric_daily
        where cohort_day = ${cohort}::date order by event`;
      expect(rows).toEqual([
        { day: '2001-01-02', event: 'first_night', day_n: 1, nt: 'B', wg: '-', moon: '1', count: 2 },
        { day: '2001-01-04', event: 'open', day_n: 3, nt: 'B', wg: '-', moon: '1', count: 4 },
      ]);
    } finally {
      await prisma.$executeRaw`delete from app.metric_daily where cohort_day = ${cohort}::date`;
    }
  });

  it('Data API 롤(anon)은 metric_daily도 읽을 수 없다', async () => {
    const err = await inRolledBackTx(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE anon');
      try {
        await tx.$queryRawUnsafe('select count(*) from app.metric_daily');
        return null;
      } catch (e) {
        return String(e);
      }
    }).catch((e: unknown) => String(e));
    expect(err).toMatch(/permission denied/i);
  });

  it('조회 롤(metrics_reader)은 원표를 못 읽고, 뷰에서는 count 5 미만 칸이 안 보인다(I2)', async () => {
    const cohort = '2001-02-01';
    try {
      await prisma.$executeRaw`insert into app.metric_daily values
        (${cohort}::date, 'open', ${cohort}::date, 0, 'ios', '9.9', 'ko', 'A', '-', '0', 4),
        (${cohort}::date, 'open', ${cohort}::date, 0, 'ios', '9.9', 'ko', 'B', '-', '0', 5)`;
      const r = await inRolledBackTx(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE metrics_reader');
        const view = await tx.$queryRawUnsafe<{ nt: string; count: number }[]>(`select nt, count from app.metric_daily_k5 where cohort_day = '${cohort}'`);
        let raw: string | null = null;
        try {
          await tx.$queryRawUnsafe('select count(*) from app.metric_daily');
        } catch (e) {
          raw = String(e);
        }
        return { view, raw };
      });
      expect(r.view).toEqual([{ nt: 'B', count: 5 }]);
      expect(r.raw).toMatch(/permission denied/i);
    } finally {
      await prisma.$executeRaw`delete from app.metric_daily where cohort_day = ${cohort}::date`;
    }
  });

  it('단조 검사 SQL(docs/ops/metrics/monotonic-check.sql)이 분자만 부풀린 코호트를 잡는다(I5)', async () => {
    const cohort = '2001-03-01';
    const sql = readFileSync(new URL('../../../docs/ops/metrics/monotonic-check.sql', import.meta.url), 'utf8');
    try {
      await prisma.$executeRaw`insert into app.metric_daily values
        (${cohort}::date, 'open', ${cohort}::date, 0, 'android', '9.9', 'en', 'A', '-', '0', 10),
        ('2001-03-08'::date, 'open', ${cohort}::date, 7, 'android', '9.9', 'en', 'A', '1', '0', 3),
        ('2001-03-15'::date, 'open', ${cohort}::date, 14, 'android', '9.9', 'en', 'A', '1', '0', 40),
        ('2001-03-02'::date, 'name_set', ${cohort}::date, 1, 'android', '9.9', 'en', 'A', '-', '0', 11)`;
      const bad = (await prisma.$queryRawUnsafe<{ cohort_day: Date; rule: string }[]>(sql)).filter((b) => b.cohort_day.toISOString().startsWith(cohort));
      expect(bad.map((b) => b.rule).sort()).toEqual(['name_set', 'open_d14']);
    } finally {
      await prisma.$executeRaw`delete from app.metric_daily where cohort_day = ${cohort}::date`;
    }
  });

  it('90일 말기: cutoff 이전 일 단위 행을 지우며 월 합계로 옮긴다(처리방침 6절), 그 뒤 행은 그대로', async () => {
    const cohort = '2001-04-28';
    try {
      await prisma.$executeRaw`insert into app.metric_daily values
        ('2001-04-28'::date, 'open', ${cohort}::date, 0, 'ios', '9.9', 'ko', 'A', '-', '0', 3),
        ('2001-04-29'::date, 'open', ${cohort}::date, 1, 'ios', '9.9', 'ko', 'A', '-', '1', 2),
        ('2001-05-03'::date, 'open', ${cohort}::date, 5, 'ios', '9.9', 'ko', 'A', '-', '0', 1),
        ('2001-05-03'::date, 'open', ${cohort}::date, 1, 'ios', '9.9', 'ko', 'A', '-', '0', 4)`;
      const [r] = await prisma.$queryRaw<{ n: number }[]>`select app.rollup_metric_daily('2001-05-01'::date) as n`;
      expect(r!.n).toBe(2);
      const left = await prisma.$queryRaw<{ n: bigint }[]>`select count(*) as n from app.metric_daily where cohort_day = ${cohort}::date`;
      expect(Number(left[0]!.n)).toBe(2); // 5월 행은 남는다
      const monthly = await prisma.$queryRaw<{ month: string; day_n: number; count: number }[]>`
        select to_char(month, 'YYYY-MM-DD') as month, day_n, count from app.metric_monthly where cohort_month = '2001-04-01' and app_ver = '9.9' order by day_n`;
      expect(monthly).toEqual([
        { month: '2001-04-01', day_n: 0, count: 3 },
        { month: '2001-04-01', day_n: 1, count: 2 },
      ]);
    } finally {
      await prisma.$executeRaw`delete from app.metric_daily where cohort_day = ${cohort}::date`;
      await prisma.$executeRaw`delete from app.metric_monthly where cohort_month = '2001-04-01' and app_ver = '9.9'`;
    }
  });
});
