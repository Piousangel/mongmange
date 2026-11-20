// B2 로그 규칙(정본 5-2 '로그 가림 목록', 처리방침 14절 '로그인 토큰·되찾기 글귀·게임 기록 본문을 남기지 않는다'):
// 계정을 만들고 세이브를 올리고 글귀를 받아 되찾고 웹으로 지우는 전 과정을 실제로 돈 뒤, 로그 어디에도
// JWT·글귀(보이는 꼴·정규 16자)·영수증·IP·sub·인장 코드·세이브 본문이 없는지 본다. 하나라도 있으면 실패.
import 'reflect-metadata';
import { Writable } from 'node:stream';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sim } from '@mong/core';
import { normalizeRecoveryCode } from '@mong/contract';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { logSink } from '../src/common/logging';
import { SERVICE_KEY, startFakeSupabase, type FakeSupabase } from './fake-supabase';

const lines: string[] = [];
let app: NestFastifyApplication;
let sb: FakeSupabase;

beforeAll(async () => {
  sb = await startFakeSupabase();
  logSink.stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(...String(chunk).split('\n').filter(Boolean));
      cb();
    },
  });
  Object.assign(process.env, {
    LOG_LEVEL: 'info',
    SUPABASE_URL: sb.url,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    TRUSTED_PROXY_HOPS_API: '1',
    TRUSTED_PROXY_HOPS_WEB: '2',
  });
  const { createApp } = await import('../src/app.factory');
  app = await createApp({ bufferLogs: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
afterAll(async () => {
  await app?.close();
  await sb?.close();
  logSink.stream = undefined;
});

describe('B2 흐름 전체를 돈 뒤 로그', () => {
  it('토큰·글귀·영수증·IP·sub·인장 코드·세이브 본문 0건', async () => {
    const http = () => request(app.getHttpServer());
    const ip1 = '203.0.113.41';
    const ip2 = '2001:db8:cafe:1::9';
    const a = await sb.signIn();
    const b = await sb.signIn();
    const as = (t: string, ip: string, r: request.Test) => r.set('authorization', `Bearer ${t}`).set('x-forwarded-for', ip);
    const gate = { v: 2, ok: true };

    const boot = await as(a.token, ip1, http().post('/api/v1/me/bootstrap')).send({ ageGate: gate }).expect(200);
    const code = boot.body.creature.code as string;
    const save = sim.serializeState(sim.createInitial(Date.UTC(2026, 10, 20), -540, 7), Date.UTC(2026, 10, 20));
    await as(a.token, ip1, http().put('/api/v1/saves/main')).set('if-none-match', '*').send({ body: save, clientSavedAt: '2026-11-20T00:00:00Z' }).expect(200);
    await as(a.token, ip1, http().put('/api/v1/saves/main')).set('if-match', '9').send({ body: save + ' ', clientSavedAt: '2026-11-20T00:00:00Z' }).expect(409);
    const phrase = (await as(a.token, ip1, http().post('/api/v1/recovery-code')).expect(200)).body.code as string;
    await as(b.token, ip2, http().post('/api/v1/recover')).send({ code: 'WRNG-WRNG-WRNG-WRNG', ageGate: gate }).expect(404);
    const rec = await as(b.token, ip2, http().post('/api/v1/recover')).send({ code: phrase, ageGate: gate }).expect(200);
    const newPhrase = rec.body.newCode as string;
    await as(a.token, ip1, http().get('/api/v1/saves/main')).expect(410);
    const del = await http()
      .post('/api/v1/deletion/web')
      .set('x-forwarded-for', ip2)
      .set('origin', 'https://mongmang.ink')
      .send({ code, phrase: newPhrase })
      .expect(202);
    const receipt = del.body.receipt as string;
    await http().get(`/api/v1/deletion/${receipt}`).set('x-forwarded-for', ip2).expect(200);
    await new Promise((r) => setTimeout(r, 50));

    const all = lines.join('\n');
    expect(lines.length).toBeGreaterThan(8); // 로그가 실제로 쌓였는지(빈 로그로 통과하지 않게)
    const secrets: Record<string, string> = {
      tokenA: a.token,
      tokenASig: a.token.split('.')[2]!,
      tokenB: b.token,
      subA: a.sub,
      subB: b.sub,
      phrase,
      phrase16: normalizeRecoveryCode(phrase)!,
      newPhrase,
      newPhrase16: normalizeRecoveryCode(newPhrase)!,
      receipt,
      code,
      ip1,
      ip2,
      ip2prefix: '2001:db8:cafe:1',
      saveBody: save.slice(0, 40),
    };
    for (const [name, v] of Object.entries(secrets)) expect(all, `${name}가 로그에 있음`).not.toContain(v);
    // 요청 로그의 route는 템플릿(영수증이 경로에 있어도 '/api/v1/deletion/:receipt')
    const routes = lines.map((l) => JSON.parse(l) as { req?: { route: string | null } }).filter((o) => o.req).map((o) => o.req!.route);
    expect(routes).toEqual(expect.arrayContaining(['/api/v1/me/bootstrap', '/api/v1/recover', '/api/v1/deletion/:receipt', '/api/v1/saves/main']));
  });
});
