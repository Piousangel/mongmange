// 전역 에러 필터. 모든 오류 응답을 한 모양으로: { error: { code, message, details? }, requestId }.
// - 500대: 내부 내용을 숨긴다. 우리가 code를 직접 단 예외(예: 503 db_unavailable)만 그 문구를 낸다. 로그는 500대 전부(503은 warn, 나머지는 스택과 error).
// - 404: 고정 문구(요청 경로·쿼리를 되돌려 주지 않는다 — 서명·토큰 반사 방지, B1 리뷰 사소 2).
// - 4xx: 이유를 돌려준다. 앱은 code만 보고 분기한다.
import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger, type ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';
import { ZodError } from 'zod';

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
  requestId?: string;
}

const CODE_BY_STATUS: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  409: 'conflict',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  422: 'unprocessable',
  429: 'rate_limited',
  503: 'unavailable',
};

const HIDDEN = '서버 오류';
const NOT_FOUND = '찾을 수 없습니다';

/** 예외 → (상태, 본문). 순수 함수라 단위 테스트한다 */
export function toErrorBody(exception: unknown): { status: number; body: ErrorBody } {
  if (exception instanceof ZodError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      body: {
        error: {
          code: 'bad_request',
          message: '요청 형식이 맞지 않습니다',
          details: exception.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      },
    };
  }
  if (exception instanceof ThrottlerException) {
    return { status: 429, body: { error: { code: 'rate_limited', message: '요청이 너무 잦습니다' } } };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const res = exception.getResponse();
    const r = typeof res === 'object' && res !== null ? (res as Record<string, unknown>) : {};
    const ownCode = typeof r.code === 'string' ? r.code : undefined;
    const code = ownCode ?? CODE_BY_STATUS[status] ?? (status >= 500 ? 'internal' : 'error');
    let message: string;
    if (status >= 500) message = ownCode && typeof r.message === 'string' ? r.message : HIDDEN;
    else if (status === 404 && !ownCode) message = NOT_FOUND;
    else message = typeof res === 'string' ? res : String(r.message ?? exception.message);
    const details = status < 500 ? r.details : undefined;
    return { status, body: { error: { code, message, ...(details !== undefined ? { details } : {}) } } };
  }
  // Fastify 자체 오류(본문 크기 초과·JSON 깨짐 등)는 statusCode를 달고 온다
  const sc = (exception as { statusCode?: unknown })?.statusCode;
  if (typeof sc === 'number' && sc >= 400 && sc < 500) {
    const message = sc === 404 ? NOT_FOUND : (exception as Error).message;
    return { status: sc, body: { error: { code: CODE_BY_STATUS[sc] ?? 'bad_request', message } } };
  }
  return { status: 500, body: { error: { code: 'internal', message: HIDDEN } } };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Exception');

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<{ id?: string }>();
    const { status, body } = toErrorBody(exception);
    // 규칙(logging.ts): 오류 로그도 IP·헤더·본문·경로 없이
    if (status === 503) {
      this.log.warn({ code: body.error.code }, '사용할 수 없음');
    } else if (status >= 500) {
      const e = exception instanceof Error ? exception : new Error(String(exception));
      // 키를 err가 아닌 exception으로 — pino err 직렬화기(종류·메시지만)가 스택을 지우지 않게
      this.log.error({ exception: { type: e.name, message: e.message, stack: e.stack }, status }, '처리하지 못한 오류');
    }
    // 429는 캐시 금지(B7a, B7-report B5): /m/{code}에서 전역 throttler 429가 나와도 CDN이 다른 방문자에게 퍼뜨리지 않게(정본 3-9 '429 no-store')
    if (status === 429) httpAdapter.setHeader(ctx.getResponse(), 'cache-control', 'no-store');
    httpAdapter.reply(ctx.getResponse(), { ...body, requestId: req?.id }, status);
  }
}
