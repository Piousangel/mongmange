// 시험 공통: 추가 컨트롤러(500 유발·/m/:code 템플릿)와 앱 준비
import { Controller, Get, Module, Param } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

@Controller()
class ProbeController {
  /** B3 `/m/{code}` 자리(웹 그룹 IP·경로 템플릿 확인용) */
  @Get('m/:code')
  page(@Param('code') code: string) {
    return { len: code.length };
  }

  @Get('boom')
  boom(): never {
    throw new Error('내부 비밀 경로 /srv/secret');
  }
}

@Module({ controllers: [ProbeController] })
export class ProbeModule {}

/** 환경 변수를 정한 뒤 앱을 불러와 띄운다(ConfigModule.forRoot는 import 때 환경 변수를 읽는다) */
export async function startApp(env: Record<string, string>): Promise<NestFastifyApplication> {
  Object.assign(process.env, env);
  const { createApp } = await import('../src/app.factory');
  const app = await createApp({ bufferLogs: false, extraModules: [ProbeModule] });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
