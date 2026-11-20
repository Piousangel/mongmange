// 앱 조립(main·e2e·openapi 스크립트가 같이 쓴다). listen은 하지 않는다.
import { Module, type DynamicModule, type Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { Env } from './config/env';
import { genReqId, ROUTE_TEMPLATE } from './common/logging';

/**
 * Fastify 본문 상한. 세이브 상한 512KB는 **이스케이프 전** 문자열 기준이라, JSON 안에 문자열로 실리면 따옴표·역슬래시가
 * 두 배가 될 수 있다 → 512KB × 2 + 여유(B2 리뷰 m8). 파일은 서명 URL로 Storage에 직접 올리므로 API는 작다
 */
export const BODY_LIMIT = 2 * 512 * 1024 + 64 * 1024;

/** 모든 응답의 기본 보안 헤더. `/m` HTML의 CSP는 B3에서 그 경로에만 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-resource-policy': 'same-site',
};

export async function createApp(
  opts: { bufferLogs?: boolean; extraModules?: Array<Type | DynamicModule> } = {},
): Promise<NestFastifyApplication> {
  // 시험이 추가 컨트롤러(500 유발·/m/:code 템플릿 확인)를 붙일 수 있게 감싼다
  @Module({ imports: [AppModule, ...(opts.extraModules ?? [])] })
  class RootModule {}

  const adapter = new FastifyAdapter({
    bodyLimit: BODY_LIMIT,
    // trustProxy는 끈다: 클라이언트 IP는 client-ip.ts가 경로 그룹별 설정으로만 판단한다
    trustProxy: false,
    genReqId,
    requestIdHeader: false,
  });
  const fastify = adapter.getInstance();
  // 로그 규칙 2: 실제 경로 대신 경로 템플릿을 원본 요청에 붙여 둔다(라우팅 뒤라 onRequest에서 알 수 있다)
  fastify.addHook('onRequest', async (request) => {
    (request.raw as unknown as Record<symbol, unknown>)[ROUTE_TEMPLATE] = request.routeOptions?.url ?? null;
  });
  // 로컬 저장소 서명 업로드(STORAGE_DRIVER=local)만 이진 본문을 받는다 — 상한은 버킷 상한(600KB)보다 조금 크게, 판정은 저장소가
  fastify.addContentTypeParser(['image/jpeg', 'video/mp4'], { parseAs: 'buffer', bodyLimit: 700 * 1024 }, (_req, body, done) => done(null, body));
  fastify.addHook('onSend', async (_request, reply) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!reply.hasHeader(k)) reply.header(k, v);
  });

  const app = await NestFactory.create<NestFastifyApplication>(RootModule, adapter, { bufferLogs: opts.bufferLogs ?? true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  if (config.get('OPENAPI_UI', { infer: true })) {
    SwaggerModule.setup('api/docs', app, buildOpenApi(app));
  }
  return app;
}

export function buildOpenApi(app: NestFastifyApplication): OpenAPIObject {
  const doc = new DocumentBuilder()
    .setTitle('mong-api')
    .setDescription('몽망이 키우기 API(architecture.md v2 3-2). 인증 = Supabase JWT(B2부터)')
    .setVersion('v1')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, doc);
}
