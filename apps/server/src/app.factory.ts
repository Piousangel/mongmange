// 앱 조립(main·e2e·openapi 스크립트가 같이 쓴다). listen은 하지 않는다.
import { Logger as NestLogger, Module, type DynamicModule, type Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { Env } from './config/env';
import { routeGroupOf } from './common/client-ip';
import { GOOGLE_EDGE_RANGES } from './common/google-edge-ranges';
import { genReqId, ROUTE_TEMPLATE } from './common/logging';
import { checkRanges, WebEdgeCheck } from './common/web-edge';
import { REPORT_PATH_RE } from './pages/m.controller';

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
  // x-www-form-urlencoded는 신고 폼(B5, `POST /m/{code}/report`)에서만 읽는다 — 다른 경로는 415. Nest 기본 파서는 모든 경로에서 폼을
  // 객체로 풀어 남의 사이트 폼(사전 요청 없는 단순 요청)이 JSON API(예: 웹 삭제)를 부를 수 있었다. 새 의존성 없이 URLSearchParams로
  // 평평한 문자열 객체만(같은 키가 여럿이면 마지막 값), 1KB 상한
  app.useBodyParser('application/x-www-form-urlencoded', { bodyLimit: 1024 }, (req, body, done) => {
    if (!REPORT_PATH_RE.test(req.url)) {
      done(Object.assign(new Error('Unsupported Media Type'), { statusCode: 415 }), undefined);
      return;
    }
    done(null, Object.fromEntries(new URLSearchParams(body.toString('utf8'))));
  });
  app.useLogger(app.get(Logger));
  // `/m/**` 직접 호출 막기(B7a·B6 1안, web-edge.ts) — 레이트 리밋·DB 앞(onRequest). 앱 API(api 그룹)에는 걸지 않는다(앱이 *.run.app 직접 사용)
  const config0 = app.get<ConfigService<Env, true>>(ConfigService);
  const edgeLog = new NestLogger('WebEdge');
  const edgeMode = config0.get('WEB_EDGE_CHECK', { infer: true });
  // off(개발)에서는 대역을 쓰지 않으므로 검사도 하지 않는다(B7a 리뷰 L5). log·enforce에서 깨졌으면 부팅 거부
  const stale = edgeMode === 'off' ? null : checkRanges(GOOGLE_EDGE_RANGES, Date.now());
  if (stale) edgeLog.warn({ code: 'web_edge_ranges_stale' }, stale);
  const edge = new WebEdgeCheck(edgeMode, (o, m) => edgeLog.warn(o, m));
  if (edgeMode !== 'off') {
    fastify.addHook('onRequest', async (request, reply) => {
      // 판정은 **Fastify가 실제로 고른 라우트**로(B7a 리뷰 H1): 원본 경로 문자열은 `/%6D/…`처럼 인코딩하면 `/m/`로 시작하지 않는데
      // 라우터는 디코드해 `/m/:code` 핸들러로 보냈다. 맞는 라우트가 없으면(404) 검사할 것이 없다
      if (routeGroupOf(request.routeOptions?.url) !== 'web') return;
      if (!edge.allow(request.headers['x-forwarded-for'])) {
        await reply.code(403).header('cache-control', 'no-store').type('text/plain; charset=utf-8').send('Forbidden');
      }
    });
  }
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
