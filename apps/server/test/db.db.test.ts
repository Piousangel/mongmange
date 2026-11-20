// 실제 Postgres 시험(pnpm --filter server test:db). DATABASE_URL·DIRECT_URL은 밖에서 주고 둘 다 **prisma 롤**이어야 한다
// (로컬: compose db + prisma/local/00-roles.sql, CI: 서비스 컨테이너 + 같은 SQL). 마이그레이션이 먼저 돌아 있어야 한다.
// RLS 시험은 슈퍼유저가 아닌 런타임 롤로 돈다 — Supabase처럼 '표 소유자 ≠ 다른 롤'일 때 무엇이 보이는지 재현한다(B1 리뷰 I4).
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.factory';
import { PrismaService } from '../src/prisma/prisma.service';

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
    expect(owners.length).toBe(3);
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
    expect(rows).toEqual([
      { relname: 'creatures', relrowsecurity: true },
      { relname: 'saves', relrowsecurity: true },
      { relname: 'users', relrowsecurity: true },
    ]);
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
});
