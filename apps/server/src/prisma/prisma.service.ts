// Prisma 7 + @prisma/adapter-pg(architecture.md 2-5). 연결은 첫 쿼리 때 맺는다(lazy):
// DB가 잠깐 죽어도 프로세스는 뜨고 /healthz(라이브니스)는 200, /readyz만 503 — Cloud Run이 컨테이너를 재시작 고리에 넣지 않는다.
// 제한 시간(B1 리뷰 I2): 연결 얻기 DB_CONNECT_TIMEOUT_MS(< READY_TIMEOUT_MS, env.ts가 검사) + 쿼리 statement_timeout(DB 안)
// + **클라이언트 쪽 query_timeout DB_QUERY_TIMEOUT_MS**(B7a — 네트워크가 멈추면 statement_timeout이 걸리지 않아 요청이 무기한 기다렸다, B7-report B3).
// 제한 시간에 걸린 연결은 응답이 늦게 와도 이미 다른 요청 것이 아니므로 **소켓째 버린다**(DroppingClient) — 그대로 풀에 돌아가면 다음 쿼리가 멈춘
// 쿼리 뒤에 줄을 서서 또 기다린다(트랜잭션 경로는 오류 없이 release하므로 pg-pool이 버리지 않는다). keepAlive로 반쯤 열린 연결도 OS가 알아챈다.
import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { ShutdownBudget, within } from '../common/shutdown-budget';
import { PrismaClient } from '../generated/prisma/client';
import type { Env } from '../config/env';
import { pgConnection } from './db-ssl';

@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  constructor(
    config: ConfigService<Env, true>,
    private readonly budget: ShutdownBudget,
  ) {
    super({
      adapter: new PrismaPg({
        // B6a: 운영은 Supabase CA로 verify-full(db-ssl.ts). CA가 없으면(로컬·CI) 연결 문자열 그대로
        ...pgConnection({ DATABASE_URL: config.get('DATABASE_URL', { infer: true }), DATABASE_CA_CERT: config.get('DATABASE_CA_CERT', { infer: true }), DATABASE_CA_FILE: config.get('DATABASE_CA_FILE', { infer: true }) }),
        max: config.get('DB_POOL_MAX', { infer: true }),
        connectionTimeoutMillis: config.get('DB_CONNECT_TIMEOUT_MS', { infer: true }),
        statement_timeout: config.get('DB_STATEMENT_TIMEOUT_MS', { infer: true }),
        query_timeout: config.get('DB_QUERY_TIMEOUT_MS', { infer: true }),
        keepAlive: true,
        // 트랜잭션 도중 소켓을 버리면(블랙홀) 서버 쪽 백엔드가 잠금을 쥔 채 'idle in transaction'으로 남을 수 있다(B7a 리뷰 L3).
        // 저장소를 읽고 옮기는 commit·name-mask 트랜잭션(최대 30초)보다 긴 40초 뒤 DB가 끊고 롤백한다(재리뷰 N1). 트랜잭션 풀러(Supavisor)가 이 시작 매개변수를 받는지 [확인 필요: B6]
        idle_in_transaction_session_timeout: 40_000,
        idleTimeoutMillis: 30_000,
        Client: DroppingClient,
      }),
    });
  }

  /** /readyz용 — `select 1` */
  async ping(): Promise<void> {
    await this.$queryRaw`select 1`;
  }

  /**
   * 종료 마지막 단계에서 끊는다. 그 전 단계(beforeApplicationShutdown)에서 시작된 집계·링크 flush를 **공유 마감까지만** 기다린다(ShutdownBudget,
   * B7a 리뷰 M1). 연결 끊기도 멈춘 DB에 묶이지 않게 1.5초로 자른다
   */
  async onApplicationShutdown(): Promise<void> {
    await this.budget.settle();
    await within(this.$disconnect(), 1500);
  }
}

/** pg의 클라이언트 쪽 제한 시간 오류(pg/lib/client.js 'Query read timeout') */
export function isQueryReadTimeout(e: unknown): boolean {
  return e instanceof Error && e.message === 'Query read timeout';
}

/** query_timeout에 걸리면 그 연결의 소켓을 끊는다 → pg-pool이 그 클라이언트를 풀에서 뺀다(_queryable=false) */
export class DroppingClient extends pg.Client {
  // pg.Client.query는 겹친 형태(콜백·프라미스·Submittable)라 인자를 그대로 넘긴다
  override query(...args: unknown[]): never {
    const last = args.at(-1);
    if (typeof last === 'function') {
      args[args.length - 1] = (err: unknown, res: unknown) => {
        if (isQueryReadTimeout(err)) this.drop();
        (last as (e: unknown, r: unknown) => void)(err, res);
      };
    }
    const r = (super.query as (...a: unknown[]) => unknown)(...args);
    if (r && typeof (r as Promise<unknown>).catch === 'function') {
      (r as Promise<unknown>).catch((e: unknown) => {
        if (isQueryReadTimeout(e)) this.drop();
      });
    }
    return r as never;
  }

  private drop(): void {
    (this as unknown as { connection?: { stream?: { destroy(): void } } }).connection?.stream?.destroy();
  }
}
