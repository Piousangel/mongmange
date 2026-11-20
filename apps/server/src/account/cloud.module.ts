// B2 맡겨 두기 묶음: 인증(JWT·Auth Admin)·계정·세이브 동기화·삭제·뒤처리 대기열.
import { Module } from '@nestjs/common';
import { AuthAdmin } from '../auth/auth-admin';
import { AuthGuard } from '../auth/auth.guard';
import { JwtVerifier } from '../auth/jwt-verifier';
import { Clock } from '../common/clock';
import { CronAuth, CronController } from '../cron/cron.controller';
import { RateLimiter } from '../common/rate-limiter';
import { DeletionController } from '../deletion/deletion.controller';
import { DeletionService } from '../deletion/deletion.service';
import { GcService } from '../deletion/gc.service';
import { StorageRemover } from '../deletion/storage-remover';
import { CloudSaveService } from '../saves/cloud-save.service';
import { CloudSavesController } from '../saves/cloud-saves.controller';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { RecoveryPepper } from './recovery-pepper';

@Module({
  controllers: [AccountController, CloudSavesController, DeletionController, CronController],
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
    StorageRemover,
    CronAuth,
  ],
  exports: [Clock, GcService],
})
export class CloudModule {}
