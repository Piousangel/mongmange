// V21 자체 OTA 묶음. 파일 저장소(OBJECT_STORE)·시계·레이트 리미터는 CloudModule 것을 같이 쓴다(에셋은 ota-assets 버킷)
import { Module } from '@nestjs/common';
import { CloudModule } from '../account/cloud.module';
import { OtaController } from './ota.controller';
import { OtaService } from './ota.service';

@Module({ imports: [CloudModule], controllers: [OtaController], providers: [OtaService] })
export class OtaModule {}
