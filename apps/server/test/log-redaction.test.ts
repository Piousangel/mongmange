// 로그 규칙(src/common/logging.ts 머리) 고정 시험 — OPERATING 7(같은 지적은 검사로 승격), B1 리뷰 I5.
// 실제 앱 로그를 메모리로 받아, IP·XFF·UA·인증 헤더·쿠키·쿼리 토큰·링크 코드가 어디에도 없고
// 요청 로그 키가 화이트리스트뿐임을 단언한다(정상 200·4xx·404·500 각각).
import 'reflect-metadata';
import { Writable } from 'node:stream';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { logSink } from '../src/common/logging';
import { startApp } from './support';

const lines: string[] = [];
let app: NestFastifyApplication;

const SECRETS = {
  clientIp: '203.0.113.77',
  spoofIp: '198.51.100.23',
  proxyIp: '35.191.0.9',
  ipv6: '2001:db8:dead:beef::1',
  ua: 'SecretAgent/9.9 (fingerprint-xyz)',
  bearer: 'eyJhbGciOiJFUzI1NiJ9.SECRETJWT.sig',
  cookie: 'sb-session=SECRETCOOKIE',
  query: 'QSECRETTOKEN',
  code: 'K7M3QX9P',
};

beforeAll(async () => {
  logSink.stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(...String(chunk).split('\n').filter(Boolean));
      cb();
    },
  });
  app = await startApp({ LOG_LEVEL: 'info', TRUSTED_PROXY_HOPS_API: '1', TRUSTED_PROXY_HOPS_WEB: '2' });
});
afterAll(async () => {
  await app?.close();
  logSink.stream = undefined;
});

function hit(method: 'get' | 'post', path: string, xff: string) {
  return request(app.getHttpServer())
    [method](path)
    .set('x-forwarded-for', xff)
    .set('user-agent', SECRETS.ua)
    .set('authorization', `Bearer ${SECRETS.bearer}`)
    .set('cookie', SECRETS.cookie);
}

describe('로그에 남지 않는 것', () => {
  it('IP·헤더·쿼리·링크 코드 0건, 요청 로그 키는 화이트리스트, route는 템플릿', async () => {
    const xff = `${SECRETS.spoofIp}, ${SECRETS.clientIp}, ${SECRETS.proxyIp}`;
    await hit('get', `/m/${SECRETS.code}?t=${SECRETS.query}`, xff).expect(200);
    await hit('post', `/api/v1/saves/validate?token=${SECRETS.query}`, `${SECRETS.ipv6}`).send({ save: '{"sim":{}}' }).expect(422);
    await hit('get', `/nope/${SECRETS.code}?sig=${SECRETS.query}`, xff).expect(404);
    await hit('get', `/boom?k=${SECRETS.query}`, xff).expect(500);
    await new Promise((r) => setTimeout(r, 50));

    const all = lines.join('\n');
    for (const [name, v] of Object.entries(SECRETS)) expect(all, `${name}가 로그에 있음`).not.toContain(v);
    expect(all).not.toMatch(/user-agent|authorization|cookie|x-forwarded-for|remoteAddress/i);

    const reqLogs = lines.map((l) => JSON.parse(l) as Record<string, unknown>).filter((o) => o.req);
    expect(reqLogs.length).toBeGreaterThanOrEqual(4);
    // context·exception·status·code는 에러 필터 줄(요청 컨텍스트가 붙은 앱 로그)의 키
    const allowedTop = new Set(['level', 'severity', 'time', 'req', 'res', 'responseTime', 'message', 'err', 'context', 'exception', 'status', 'code']);
    for (const o of reqLogs) {
      for (const k of Object.keys(o)) expect(allowedTop.has(k), `요청 로그 키 ${k}: ${JSON.stringify(o)}`).toBe(true);
      expect(Object.keys(o.req as object).sort()).toEqual(['id', 'method', 'route']);
      if (o.res) expect(Object.keys(o.res as object)).toEqual(['statusCode']);
    }
    const routes = reqLogs.map((o) => (o.req as { route: string | null }).route);
    expect(routes).toEqual(expect.arrayContaining(['/m/:code', '/api/v1/saves/validate', null, '/boom']));
    // 500은 스택과 함께 error 한 줄(경로·IP 없이)
    const err = lines.map((l) => JSON.parse(l) as Record<string, unknown>).find((o) => o.message === '처리하지 못한 오류');
    expect(err?.exception).toMatchObject({ type: 'Error', stack: expect.stringContaining('Error') });
  });
});
