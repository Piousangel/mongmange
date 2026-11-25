// 루트 모듈. 기능 모듈은 B 항목마다 붙인다(architecture.md 6-1: auth·saves·pages·web·metrics·reports·deletion·cron).
// 관리 도구(admin)는 서버 v2 리뷰에 따라 소프트런칭 뒤로 미뤄 골격에 없다.
import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConditionalModule, ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { devEndpointsEnabled, validateEnv, type Env } from './config/env';
import { ClientIpService } from './common/client-ip';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { loggerParams } from './common/logging';
import { ClientIpThrottlerGuard } from './common/throttler.guard';
import { BoundedThrottlerStorage } from './common/throttler-storage';
import { ShutdownBudget } from './common/shutdown-budget';
import { CloudModule } from './account/cloud.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { OtaModule } from './ota/ota.module';
import { PrismaModule } from './prisma/prisma.module';
import { SavesModule } from './saves/saves.module';
import { LocalStorageModule } from './storage/local-storage.module';

@Global()
@Module({ providers: [ClientIpService, ShutdownBudget], exports: [ClientIpService, ShutdownBudget] })
class CommonModule {}

@Module({
  imports: [
    // .env 파일은 읽지 않는다 — 로컬은 compose의 environment / 셸, 운영은 Cloud Run 환경 변수·Secret Manager
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv, cache: true }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService<Env, true>) =>
        loggerParams({
          LOG_LEVEL: c.get('LOG_LEVEL', { infer: true }),
          LOG_PRETTY: c.get('LOG_PRETTY', { infer: true }),
          NODE_ENV: c.get('NODE_ENV', { infer: true }),
        }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      // 저장소는 상한 있는 LRU(B7a — 기본 메모리 저장소는 키 상한이 없어 서로 다른 IP 홍수로 OOM, B7-report B2)
      useFactory: (c: ConfigService<Env, true>) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: c.get('RATE_LIMIT_PER_MIN', { infer: true }) }],
        storage: new BoundedThrottlerStorage(c.get('RATE_LIMIT_MAX_KEYS', { infer: true })),
      }),
    }),
    CommonModule,
    PrismaModule,
    HealthModule,
    // B0 집계 핑(식별자 없음, 3-6)
    MetricsModule,
    // B2 맡겨 두기(계정·세이브·되찾기·삭제, 3-3·3-4·3-8)
    CloudModule,
    // V21 자체 OTA(Expo Updates 프로토콜, 설치 id 저장 0 — docs/design/server-v1/ota-self-host.md)
    OtaModule,
    // 예시 엔드포인트(세이브 검사)는 개발·테스트 전용 — 운영(NODE_ENV=production)에는 모듈 자체가 없다(B1 리뷰 I7)
    ConditionalModule.registerWhen(SavesModule, devEndpointsEnabled),
    // 로컬 파일 저장소의 서명 업로드·공개 읽기 주소(STORAGE_DRIVER=local — 운영에서는 env가 local을 거부한다)
    ConditionalModule.registerWhen(LocalStorageModule, (env: NodeJS.ProcessEnv) => env.STORAGE_DRIVER === 'local'),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ClientIpThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
