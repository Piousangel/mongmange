// `/m/**` 직접 호출 막기(B7a·B6 1안, src/common/web-edge.ts) — 위조할 수 없는 맨 오른쪽 XFF 홉이 Google 자체 서비스 대역(goog − cloud) 안인지.
// 그럴듯한 오답 판별(OPERATING 8-1):
//  - Host·X-Forwarded-Host를 Google·mongmang.ink로 꾸민 직접 호출이 통과하면 실패
//  - XFF 왼쪽(위조 가능)에 Google IP를 넣은 직접 호출이 통과하면 실패
//  - 고객이 빌릴 수 있는 Google Cloud 대역(cloud.json — 서울 34.0.96.0/19 등)에서 온 요청이 통과하면 실패
//  - 앱 API(api 그룹, 앱이 *.run.app을 직접 부름)가 막히면 실패
//  - 막힌 요청이 레이트 리밋 저장소에 키를 남기면 실패(홍수가 메모리로 번짐)
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BoundedThrottlerStorage } from '../src/common/throttler-storage';
import { envSchema } from '../src/config/env';
import { GOOGLE_EDGE_RANGES } from '../src/common/google-edge-ranges';
import { checkRanges, inGoogleEdge, rightmostHop, WebEdgeCheck } from '../src/common/web-edge';
import { startApp } from './support';

const GFE = '35.191.0.1'; // Google 프런트엔드 대역(goog.json, cloud.json 아님)
const CLOUD_SEOUL = '34.0.96.10'; // cloud.json asia-northeast3 — 고객 VM이 쓸 수 있는 대역
const ATTACKER = '203.0.113.9';

describe('대역 판정', () => {
  it('Google 자체 서비스 대역은 안, 고객 Cloud 대역·사설·문서용 대역은 밖', () => {
    expect(inGoogleEdge(GFE)).toBe(true);
    expect(inGoogleEdge('130.211.0.1')).toBe(true);
    expect(inGoogleEdge('2001:4860:4860::8888')).toBe(true);
    expect(inGoogleEdge(`::ffff:${GFE}`)).toBe(true);
    expect(inGoogleEdge(CLOUD_SEOUL)).toBe(false);
    expect(inGoogleEdge('2600:1900:8000::1')).toBe(false); // cloud.json IPv6
    expect(inGoogleEdge('10.0.0.1')).toBe(false);
    expect(inGoogleEdge(ATTACKER)).toBe(false);
    expect(inGoogleEdge('not-an-ip')).toBe(false);
  });
  it('맨 오른쪽 홉만 본다(포트·대괄호 표기, 빈 칸, 여러 줄)', () => {
    expect(rightmostHop(`${GFE}, ${ATTACKER}`)).toBe(ATTACKER);
    expect(rightmostHop([`1.1.1.1`, `${ATTACKER}:443`])).toBe(ATTACKER);
    expect(rightmostHop('1.1.1.1, [2001:4860::1]:443')).toBe('2001:4860::1');
    expect(rightmostHop('1.1.1.1, garbage')).toBeUndefined();
    expect(rightmostHop(undefined)).toBeUndefined();
  });
  it('스냅숏이 비었거나 깨졌으면 부팅 거부, 7일 넘으면 경고 문구(갱신 주기 매일)', () => {
    expect(checkRanges(GOOGLE_EDGE_RANGES, Date.parse(GOOGLE_EDGE_RANGES.createdAt) + 86_400_000)).toBeNull();
    expect(checkRanges(GOOGLE_EDGE_RANGES, Date.parse(GOOGLE_EDGE_RANGES.createdAt) + 8 * 86_400_000)).toMatch(/8일/);
    expect(() => checkRanges({ createdAt: '2026-11-24', v4: [], v6: GOOGLE_EDGE_RANGES.v6 }, Date.now())).toThrow();
    expect(() => checkRanges({ createdAt: '2026-11-24', v4: [[5, 9], [1, 3]], v6: GOOGLE_EDGE_RANGES.v6 }, Date.now())).toThrow();
  });
  it('log 모드는 통과시키고 대역 밖 개수만(IP 없이) 1분마다 한 줄', () => {
    const lines: Array<Record<string, unknown>> = [];
    let t = 0;
    const c = new WebEdgeCheck('log', (o) => lines.push(o), () => t);
    expect(c.allow(`1.1.1.1, ${ATTACKER}`)).toBe(true);
    expect(c.allow(`1.1.1.1, ${GFE}`)).toBe(true);
    t = 60_000;
    c.allow(undefined);
    expect(lines).toEqual([{ code: 'web_edge_unverified', count: 2 }]);
  });
  it('운영 기본 = log(B6 실측 뒤 enforce), 그 밖 off', () => {
    const base = { DATABASE_URL: 'postgresql://x@127.0.0.1:1/x' };
    expect(envSchema.parse(base).WEB_EDGE_CHECK).toBe('off');
    const prod = {
      ...base,
      NODE_ENV: 'production',
      TRUSTED_PROXY_HOPS_API: '1',
      TRUSTED_PROXY_HOPS_WEB: '2',
      READY_TOKEN: 'ready-token-0000000',
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-000000',
      RECOVERY_PEPPER: 'p'.repeat(32),
      CRON_AUDIENCE: 'https://mong-api.example.run.app',
      CRON_SA_EMAIL: 'sched@example.iam.gserviceaccount.com',
      // B6a: 운영은 DB CA 필수(시험 전용 공개 인증서)
      DATABASE_CA_CERT: readFileSync(new URL('./fixtures/tls/test-ca.pem', import.meta.url), 'utf8'),
    };
    expect(envSchema.parse(prod).WEB_EDGE_CHECK).toBe('log');
    expect(envSchema.parse({ ...base, WEB_EDGE_CHECK: 'enforce' }).WEB_EDGE_CHECK).toBe('enforce');
  });
});

describe('enforce로 띄운 앱', () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    app = await startApp({ TRUSTED_PROXY_HOPS_API: '1', TRUSTED_PROXY_HOPS_WEB: '2', WEB_EDGE_CHECK: 'enforce' });
  });
  afterAll(async () => {
    await app?.close();
  });
  const http = () => request(app.getHttpServer());

  it('Firebase 경유 모양(맨 오른쪽 = Google 대역)은 통과', async () => {
    await http().get('/m/k7m3qx9p/report').set('x-forwarded-for', `198.51.100.7, ${GFE}`).expect(200);
  });
  it('직접 호출(맨 오른쪽 = 공격자)은 403 no-store — 왼쪽에 Google IP를 넣거나 Host를 꾸며도', async () => {
    const r = await http()
      .get('/m/k7m3qx9p/report')
      .set('host', 'mongmang.ink')
      .set('x-forwarded-host', 'mongmang.ink')
      .set('x-forwarded-for', `${GFE}, ${GFE}, ${ATTACKER}`)
      .expect(403);
    expect(r.headers['cache-control']).toBe('no-store');
    await http().post('/m/K7M3QX9P/seen').set('x-forwarded-for', `1.1.1.1, ${ATTACKER}`).expect(403);
    await http().get('/m/K7M3QX9P/get?p=ios').set('x-forwarded-for', `1.1.1.1, ${ATTACKER}`).expect(403);
  });
  it('경로 변형으로 우회하지 못한다(B7a 리뷰 H1): 퍼센트 인코딩·대소문자·이중 인코딩·끝 슬래시 — 핸들러에 닿으면 반드시 403', async () => {
    const bad = `1.1.1.1, ${ATTACKER}`;
    // 라우터가 디코드해 /m/:code… 핸들러로 보내는 것 → 403
    for (const [method, path] of [
      ['get', '/%6D/k7m3qx9p/report'],
      ['get', '/%6d/K7M3QX9P/get?p=ios'],
      ['post', '/%6D/K7M3QX9P/seen'],
      ['get', '/%6D/K7M3QX9P'],
      ['get', '/m/%6B7m3qx9p/report'],
    ] as const) {
      const r = await http()[method](path).set('x-forwarded-for', bad);
      expect([path, r.status]).toEqual([path, 403]);
    }
    // 그 밖의 변형(대문자 M·이중 인코딩·인코딩된 / ·점 경로·끝 슬래시·겹 슬래시)은 403 또는 404 — 어떤 경우도 2xx·3xx가 아니다
    for (const path of ['/M/k7m3qx9p/report', '/%256D/k7m3qx9p/report', '/%6D%2Fk7m3qx9p/report', '/./m/k7m3qx9p/report', '/api/../m/k7m3qx9p/report', '/m/k7m3qx9p/report/', '//m/k7m3qx9p/report', '/%6D/K7M3QX9P/get/']) {
      const r = await http().get(path).set('x-forwarded-for', bad);
      expect([path, r.status >= 400]).toEqual([path, true]);
    }
    // 같은 변형이라도 Firebase 경유 모양이면 통과(판정이 경로가 아니라 라우트·홉으로 이뤄진다)
    await http().get('/%6D/k7m3qx9p/report').set('x-forwarded-for', `198.51.100.7, ${GFE}`).expect(200);
  });
  it('인코딩 경로도 레이트 리밋 그룹은 web(오른쪽에서 2번째)으로 센다 — 두 판정이 어긋나지 않는다', async () => {
    const { ClientIpService } = await import('../src/common/client-ip');
    const ips = app.get(ClientIpService);
    const req = { url: '/%6D/k7m3qx9p', routeOptions: { url: '/m/:code' }, headers: { 'x-forwarded-for': `9.9.9.9, 198.51.100.7, ${GFE}` } };
    expect(ips.clientIp(req)).toBe('198.51.100.7');
  });
  it('고객 Google Cloud VM(cloud.json 서울 대역)에서 온 직접 호출도 403', async () => {
    await http().get('/m/k7m3qx9p/report').set('x-forwarded-for', `1.1.1.1, ${CLOUD_SEOUL}`).expect(403);
  });
  it('XFF가 없거나 IP가 아니면 403(거부가 기본)', async () => {
    await http().get('/m/k7m3qx9p/report').expect(403);
    await http().get('/m/k7m3qx9p/report').set('x-forwarded-for', 'unknown').expect(403);
  });
  it('막힌 요청은 레이트 리밋 저장소에 키를 남기지 않는다', async () => {
    const s = app.get(ThrottlerStorage) as BoundedThrottlerStorage;
    const before = s.size;
    for (let i = 0; i < 50; i++) await http().get('/m/k7m3qx9p/report').set('x-forwarded-for', `10.0.${i}.1, ${ATTACKER}`).expect(403);
    expect(s.size).toBe(before);
  });
  it('앱 API(api 그룹 — 앱이 *.run.app을 직접 부름)와 /healthz는 막지 않는다', async () => {
    await http().get('/healthz').expect(200);
    await http().post('/api/v1/saves/validate').set('x-forwarded-for', ATTACKER).send({}).expect(400);
    await http().get('/nope').set('x-forwarded-for', ATTACKER).expect(404);
  });
});
