import { Module } from '@nestjs/common';
import { CloudModule } from '../account/cloud.module';
import { LocalStorageController } from './local-storage.controller';

/** STORAGE_DRIVER=local일 때만 붙는 로컬 저장소 주소(app.module.ts) */
@Module({ imports: [CloudModule], controllers: [LocalStorageController] })
export class LocalStorageModule {}
