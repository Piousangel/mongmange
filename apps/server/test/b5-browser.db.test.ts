// B5 신고 폼 — **진짜 브라우저**(Playwright Chromium) e2e(B5 리뷰 C1). 손으로 머리글을 넣는 시험은 '브라우저가 no-referrer 페이지에서
// 같은 출처 폼 POST에 Origin: null을 붙인다'는 사실을 못 잡았다. 여기서는 서버를 실제 포트로 띄우고 브라우저가 고른 머리글 그대로 보낸다.
//  ① /m/{code} 페이지에서 '알리기'를 펼쳐 사유를 고르고 제출 → 303 → 감사 페이지, 신고 행 1
//  ② 다른 출처(다른 사이트) 페이지가 같은 폼을 자동 제출 → 403, 신고 수 그대로
// CI: server-ci가 `playwright install chromium` 뒤 test:db로 돌린다(실제 DB 필요). 브라우저가 없으면 실패한다(건너뛰지 않는다).
import 'reflect-metadata';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { chromium, type Browser } from 'playwright';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SERVICE_KEY, startFakeSupabase, type FakeSupabase } from './fake-supabase';

let app: NestFastifyApplication;
let prisma: PrismaService;
let sb: FakeSupabase;
let browser: Browser;
let evil: Server;
let origin = '';
// 진짜 브라우저는 그림을 디코드한다 — 합성 JPEG(채움 0)는 깨진 그림이라 페이지가 '사라진 링크' 모양이 된다. ffmpeg 산출물 고정물을 쓴다
const MEDIA = join(__dirname, 'fixtures/media');
const SNAP_OK = JSON.parse(readFileSync(join(__dirname, '../../../packages/core/test/fixtures/snap/ok.json'), 'utf8')) as Record<string, unknown>;

async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address() as AddressInfo;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

beforeAll(async () => {
  sb = await startFakeSupabase();
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  Object.assign(process.env, {
    SUPABASE_URL: sb.url,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    TRUSTED_PROXY_HOPS_API: '1',
    TRUSTED_PROXY_HOPS_WEB: '2',
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_DIR: mkdtempSync(join(tmpdir(), 'mong-b5b-')),
    STORAGE_LOCAL_BASE_URL: origin,
    SITE_ORIGIN: origin,
    LOG_LEVEL: 'silent',
    RATE_LIMIT_PER_MIN: '10000',
  });
  const { createApp } = await import('../src/app.factory');
  const { PrismaService } = await import('../src/prisma/prisma.service');
  app = await createApp({ bufferLogs: false });
  await app.listen(port, '127.0.0.1');
  prisma = app.get(PrismaService);
  browser = await chromium.launch();
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => (evil ? evil.close(() => r()) : r()));
  await app?.close();
  await sb?.close();
});

async function livePage(): Promise<string> {
  const http = () => request(app.getHttpServer());
  const { token } = await sb.signIn();
  const as = (r: request.Test) => r.set('authorization', `Bearer ${token}`).set('x-forwarded-for', '10.250.0.9');
  const code = (await as(http().post('/api/v1/me/bootstrap')).send({ ageGate: { v: 2, ok: true } }).expect(200)).body.creature.code as string;
  const put = await as(http().put('/api/v1/creature/page'))
    .send({ snapshot: SNAP_OK, nameVisible: false, lang: 'ko', files: { poster: { contentType: 'image/jpeg', bytes: 5000 }, og: { contentType: 'image/jpeg', bytes: 5000 }, loop: { contentType: 'video/mp4', bytes: 5000 } } })
    .expect(200);
  const path = (u: string) => new URL(u).pathname + new URL(u).search;
  await http().put(path(put.body.upload.poster.signedUrl)).set('content-type', 'image/jpeg').send(readFileSync(join(MEDIA, 'poster.jpg'))).expect(200);
  await http().put(path(put.body.upload.og.signedUrl)).set('content-type', 'image/jpeg').send(readFileSync(join(MEDIA, 'og.jpg'))).expect(200);
  await http().put(path(put.body.upload.loop.signedUrl)).set('content-type', 'video/mp4').send(readFileSync(join(MEDIA, 'loop-ok.mp4'))).expect(200);
  await as(http().post(`/api/v1/creature/page/${put.body.ver}/commit`)).send().expect(200);
  return code;
}
const reportersOf = async (code: string) =>
  (await prisma.report.findFirst({ where: { targetKind: 'link', targetRef: code, status: 'open' } }))?.distinctReporters ?? 0;

describe('신고 폼 — 진짜 브라우저(B5 리뷰 C1)', () => {
  it('/m 페이지에서 제출하면 303 → 감사 페이지, 신고 1(브라우저가 보낸 Origin은 null, Sec-Fetch-Site는 same-origin)', async () => {
    const code = await livePage();
    const page = await browser.newPage();
    try {
      await page.goto(`${origin}/m/${code}`);
      await page.locator('details.report summary').click();
      await page.locator('input[name="reason"][value="sexual"]').check();
      const [res] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/m/${code}/report`)),
        page.locator('details.report button[type="submit"]').click(),
      ]);
      expect(res.status()).toBe(303);
      const sent = await res.request().allHeaders();
      // 이 시험이 지키는 사실: no-referrer 페이지의 같은 출처 POST — Origin만 보면 403이 되는 조건
      expect(sent.origin).toBe('null');
      expect(sent['sec-fetch-site']).toBe('same-origin');
      await page.waitForURL(`${origin}/m/${code}/report`);
      expect(await page.locator('main').getAttribute('data-state')).toBe('reported');
      expect(await reportersOf(code)).toBe(1);
    } finally {
      await page.close();
    }
  });

  it('다른 사이트 페이지가 같은 폼을 자동 제출하면 403 — 신고 수 그대로', async () => {
    const code = await livePage();
    evil = createServer((_req, res) => {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(`<!doctype html><form id="f" method="post" action="${origin}/m/${code}/report"><input name="reason" value="sexual"></form><script>document.getElementById('f').submit()</script>`);
    });
    await new Promise<void>((r) => evil.listen(0, '127.0.0.1', r));
    const evilPort = (evil.address() as AddressInfo).port;
    const page = await browser.newPage();
    try {
      const [res] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/m/${code}/report`)),
        // localhost ≠ 127.0.0.1 — 다른 사이트(cross-site)
        page.goto(`http://localhost:${evilPort}/`),
      ]);
      expect(res.status()).toBe(403);
      expect((await res.request().allHeaders())['sec-fetch-site']).toBe('cross-site');
      expect(await reportersOf(code)).toBe(0);
    } finally {
      await page.close();
    }
  });
});
