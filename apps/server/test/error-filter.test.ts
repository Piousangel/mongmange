import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toErrorBody } from '../src/common/http-exception.filter';

describe('전역 에러 필터의 응답 모양', () => {
  it('zod 오류 → 400 bad_request + 경로별 details', () => {
    const r = z.object({ a: z.string() }).safeParse({});
    const { status, body } = toErrorBody(r.error);
    expect(status).toBe(400);
    expect(body.error.code).toBe('bad_request');
    expect(body.error.details).toEqual([{ path: 'a', message: expect.any(String) }]);
  });
  it('HttpException은 상태별 code, 직접 준 code가 우선', () => {
    expect(toErrorBody(new NotFoundException()).body.error.code).toBe('not_found');
    expect(toErrorBody(new BadRequestException({ code: 'age_gate_missing', message: 'x' })).body.error).toEqual({ code: 'age_gate_missing', message: 'x' });
  });
  it('404는 경로·쿼리를 되돌려 주지 않는다', () => {
    const e = new NotFoundException('Cannot GET /m/ABCD1234?sig=SECRET');
    expect(toErrorBody(e).body.error).toEqual({ code: 'not_found', message: '찾을 수 없습니다' });
    const f = Object.assign(new Error('Route GET:/x?token=SECRET not found'), { statusCode: 404 });
    expect(JSON.stringify(toErrorBody(f))).not.toMatch(/SECRET/);
  });
  it('500 외 500대(502·504)도 내용을 숨긴다', () => {
    expect(toErrorBody(new BadGatewayException('upstream 10.0.0.3 refused')).body.error).toEqual({ code: 'internal', message: '서버 오류' });
    expect(toErrorBody(new GatewayTimeoutException('db host x')).body.error.message).toBe('서버 오류');
  });
  it('429', () => expect(toErrorBody(new ThrottlerException()).status).toBe(429));
  it('500과 알 수 없는 예외는 내용을 숨긴다', () => {
    expect(toErrorBody(new InternalServerErrorException('DB 비밀번호 틀림')).body.error.message).toBe('서버 오류');
    expect(toErrorBody(new Error('내부 경로 /etc/x'))).toEqual({ status: 500, body: { error: { code: 'internal', message: '서버 오류' } } });
  });
  it('503은 의도한 code·문구를 그대로', () => {
    const { status, body } = toErrorBody(new ServiceUnavailableException({ code: 'db_unavailable', message: 'DB에 닿지 않습니다' }));
    expect(status).toBe(503);
    expect(body.error.code).toBe('db_unavailable');
  });
  it('Fastify 4xx(본문 초과 등)는 statusCode를 따른다', () => {
    const e = Object.assign(new Error('Request body is too large'), { statusCode: 413 });
    expect(toErrorBody(e)).toMatchObject({ status: 413, body: { error: { code: 'payload_too_large' } } });
  });
});
