// Prisma 7 + @prisma/adapter-pg(architecture.md 2-5). 연결은 첫 쿼리 때 맺는다(lazy):
// DB가 잠깐 죽어도 프로세스는 뜨고 /healthz(라이브니스)는 200, /readyz만 503 — Cloud Run이 컨테이너를 재시작 고리에 넣지 않는다.
// 제한 시간(B1 리뷰 I2): 연결 얻기 DB_CONNECT_TIMEOUT_MS(< READY_TIMEOUT_MS, env.ts가 검사) + 쿼리 statement_timeout.
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { Env } from '../config/env';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
        max: config.get('DB_POOL_MAX', { infer: true }),
        connectionTimeoutMillis: config.get('DB_CONNECT_TIMEOUT_MS', { infer: true }),
        statement_timeout: config.get('DB_STATEMENT_TIMEOUT_MS', { infer: true }),
        idleTimeoutMillis: 30_000,
      }),
    });
  }

  /** /readyz용 — `select 1` */
  async ping(): Promise<void> {
    await this.$queryRaw`select 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
