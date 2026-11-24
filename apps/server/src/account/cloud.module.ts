// B2 맡겨 두기 묶음: 인증(JWT·Auth Admin)·계정·세이브 동기화·삭제·뒤처리 대기열.
// B3 공유 링크: 링크 API·/m 웹 경로·파일 저장소(OBJECT_STORE)·CDN 무효화 대기열 — 삭제 연쇄가 같은 저장소·대기열을 쓰므로 한 묶음.
// B5 안전 장치: 신고·운영 정기 작업(관리 API 없음 — 운영은 Studio SQL 함수, docs/ops/moderation/).
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CDN_INVALIDATOR, CdnPurgeQueue, CountingInvalidator } from '../cdn/cdn-purge';
import type { Env } from '../config/env';
import { MController } from '../pages/m.controller';
import { PageController } from '../pages/page.controller';
import { PageService } from '../pages/page.service';
import { ModerationService } from '../moderation/moderation.service';
import { ReportService } from '../moderation/report.service';
import { LocalObjectStore } from '../storage/local-store';
import { NoStore, OBJECT_STORE, type ObjectStore } from '../storage/object-store';
import { AuthAdmin } from '../auth/auth-admin';
import { AuthGuard } from '../auth/auth.guard';
import { JwtVerifier } from '../auth/jwt-verifier';
import { Clock } from '../common/clock';
import { CronAuth, CronController } from '../cron/cron.controller';
import { RateLimiter } from '../common/rate-limiter';
import { DeletionController } from '../deletion/deletion.controller';
import { DeletionService } from '../deletion/deletion.service';
import { GcService } from '../deletion/gc.service';
import { CloudSaveService } from '../saves/cloud-save.service';
import { CloudSavesController } from '../saves/cloud-saves.controller';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { RecoveryPepper } from './recovery-pepper';

@Module({
  controllers: [AccountController, CloudSavesController, DeletionController, CronController, PageController, MController],
  providers: [
    Clock,
    RateLimiter,
    JwtVerifier,
    AuthAdmin,
    AuthGuard,
    RecoveryPepper,
    AccountService,
    CloudSaveService,
    DeletionService,
    GcService,
    {
      provide: OBJECT_STORE,
      inject: [ConfigService, Clock],
      useFactory: (c: ConfigService<Env, true>, clock: Clock): ObjectStore =>
        c.get('STORAGE_DRIVER', { infer: true }) === 'local'
          ? new LocalObjectStore(
              resolve(c.get('STORAGE_LOCAL_DIR', { infer: true })),
              (c.get('STORAGE_LOCAL_BASE_URL', { infer: true }) ?? `http://localhost:${c.get('PORT', { infer: true })}`).replace(/\/+$/, ''),
              () => clock.now(),
            )
          : new NoStore(),
    },
    // 실제 Firebase 릴리스 호출은 B6(Hosting 릴리스 권한만 가진 서비스 계정). 그 전에는 횟수만 세고 바닥은 s-maxage 5분
    { provide: CDN_INVALIDATOR, useClass: CountingInvalidator },
    CdnPurgeQueue,
    PageService,
    // B5 안전 장치: 신고(/m/{code}/report)·운영 정기 작업(cron moderation)
    ReportService,
    ModerationService,
    CronAuth,
  ],
  exports: [Clock, GcService, OBJECT_STORE, CdnPurgeQueue, PageService],
})
export class CloudModule {}
