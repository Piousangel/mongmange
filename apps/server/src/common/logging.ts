// 구조화 로그(pino, JSON 한 줄 = Cloud Logging 한 항목). 로그 필드 규칙(서버 v2 리뷰 S5, 정본 5-2, B1 리뷰 I5):
//  1. 요청 로그 필드는 화이트리스트뿐: req{id, method, route}·res{statusCode}·responseTime(·오류면 err{type, message}).
//  2. route는 **경로 템플릿**(`/m/:code`)이다 — 실제 경로가 아니다. 링크 코드·id가 로그에 남지 않는다. 경로가 없으면(404) null.
//  3. IP·X-Forwarded-For·User-Agent·Authorization·Cookie·쿼리 문자열은 어떤 로그에도 남기지 않는다.
//  4. 요청 본문(세이브·스냅숏)은 찍지 않는다. 500대 오류 로그는 err.type·message·stack만.
//  5. 레벨 이름은 Cloud Logging severity로 맞춘다.
// 이 규칙은 test/log-redaction.test.ts가 실제 앱 로그를 받아 단언한다(OPERATING 7: 검사로 승격).
import { RequestMethod } from '@nestjs/common';
import type { Params } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Env } from '../config/env';

const SEVERITY: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

/** Fastify onRequest 훅이 원본 요청에 붙이는 경로 템플릿(app.factory.ts). 직렬화기는 이것만 읽는다 */
export const ROUTE_TEMPLATE = Symbol.for('mong.routeTemplate');
type RawReq = IncomingMessage & { id?: unknown; [ROUTE_TEMPLATE]?: string | null };

/** pino-http는 직렬화기에 감싼 객체({id, method, url, headers, …, raw})를 넘긴다 — 템플릿은 raw에서 읽는다 */
export function serializeReq(req: RawReq & { raw?: RawReq }) {
  const raw = req.raw ?? req;
  return { id: req.id, method: req.method, route: raw[ROUTE_TEMPLATE] ?? null };
}

export function serializeRes(res: ServerResponse) {
  return { statusCode: res.statusCode };
}

/** 요청 id: 들어온 x-request-id(우리 프록시·앱이 붙인 값)를 쓰되 형식이 이상하면 새로 만든다. Fastify genReqId로 쓴다 */
export function genReqId(req: { headers: Record<string, string | string[] | undefined> }): string {
  const h = req.headers['x-request-id'];
  return typeof h === 'string' && /^[\w-]{8,64}$/.test(h) ? h : randomUUID();
}

/** 시험 전용 출력 대상(log-redaction.test.ts가 메모리 스트림을 꽂는다). 운영에서는 비어 있어 stdout */
export const logSink: { stream?: DestinationStream } = {};

export function loggerParams(env: Pick<Env, 'LOG_LEVEL' | 'LOG_PRETTY' | 'NODE_ENV'>): Params {
  const options = {
    level: env.LOG_LEVEL,
    // 요청 id는 Fastify가 genReqId로 만든 req.id를 그대로 쓴다(app.factory.ts)
    base: null, // pid·hostname 빼기(Cloud Run이 인스턴스 정보를 붙인다)
    serializers: {
      req: serializeReq,
      res: serializeRes,
      // 요청 로그의 err는 종류·메시지만(스택은 에러 필터가 500대일 때만 한 번 남긴다)
      err: (e: Error) => ({ type: e.name, message: e.message }),
    },
    customLogLevel: (_req: unknown, res: ServerResponse, err?: Error) =>
      err || res.statusCode >= 500 ? ('error' as const) : res.statusCode >= 400 ? ('warn' as const) : ('info' as const),
    // 규칙 3의 이중 안전장치: 혹시 다른 곳에서 헤더를 찍어도 지운다
    redact: {
      paths: ['req.headers', 'req.remoteAddress', 'req.remotePort', 'req.url', 'req.query', 'headers', 'ip', 'ips'],
      remove: true,
    },
    customAttributeKeys: { responseTime: 'responseTime' },
    formatters: { level: (label: string) => ({ level: label, severity: SEVERITY[label] ?? 'DEFAULT' }) },
    messageKey: 'message',
    transport: env.LOG_PRETTY && env.NODE_ENV !== 'production' && !logSink.stream ? { target: 'pino-pretty' } : undefined,
  };
  return {
    pinoHttp: logSink.stream ? [options, logSink.stream] : options,
    // 헬스체크는 시끄러우니 요청 로그를 남기지 않는다(/readyz 실패는 컨트롤러가 warn 한 줄)
    exclude: [
      { method: RequestMethod.GET, path: 'healthz' },
      { method: RequestMethod.GET, path: 'readyz' },
    ],
  };
}
