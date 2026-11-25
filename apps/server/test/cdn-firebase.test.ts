// Firebase Hosting CDN 무효화(B6a) — 가짜 메타데이터 서버 + 가짜 Hosting REST(포트 8183)로. 실제 Google에는 붙지 않는다.
// 그럴듯한 오답: '아무 버전이나 새로 배포' — live 채널의 **지금 버전**을 다시 내야 사이트 내용이 바뀌지 않고 캐시만 비워진다.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CdnPurgeError, FirebaseHostingInvalidator } from '../src/cdn/firebase-invalidator';

const PORT = 8183;
const BASE = `http://127.0.0.1:${PORT}`;
const SITE = 'mongmange';
const VERSION = `sites/${SITE}/versions/abc123`;
let server: Server;
let calls: Array<{ method: string; url: string; auth?: string; flavor?: string; body?: string }>;
let tokenIssued: number;
let fault: { path: RegExp; status: number | 'hang' } | null;
let liveVersion: string | null;
/** 릴리스 기록(최신이 앞) */
let releases: Array<{ name: string; version: { name: string } }>;
/** true면 channels/live 응답 직후 정적 배포가 새 버전을 낸다(리뷰 M2 경합) */
let deployDuringPurge: boolean;
const newRelease = (version: string) => releases.unshift({ name: `sites/${SITE}/releases/r${releases.length + 1}`, version: { name: version } });

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      const url = req.url ?? '';
      calls.push({ method: req.method ?? '', url, auth: req.headers.authorization, flavor: req.headers['metadata-flavor'] as string | undefined, body });
      if (fault && fault.path.test(url)) {
        if (fault.status === 'hang') return;
        return void res.writeHead(fault.status).end('{}');
      }
      if (url === '/token') {
        if (req.headers['metadata-flavor'] !== 'Google') return void res.writeHead(403).end();
        tokenIssued++;
        return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ access_token: `ya29.token-${tokenIssued}`, expires_in: 3599, token_type: 'Bearer' }));
      }
      if (req.headers.authorization?.startsWith('Bearer ya29.') !== true) return void res.writeHead(401).end('{}');
      if (req.method === 'GET' && url === `/v1beta1/sites/${SITE}/channels/live`) {
        res.writeHead(200).end(JSON.stringify({ name: `sites/${SITE}/channels/live`, release: liveVersion ? releases[0] : undefined }));
        if (deployDuringPurge) newRelease(`sites/${SITE}/versions/deployed-v2`);
        return;
      }
      if (req.method === 'POST' && url.startsWith(`/v1beta1/sites/${SITE}/releases?`)) {
        newRelease(new URL(url, BASE).searchParams.get('versionName')!);
        return void res.writeHead(200).end(JSON.stringify(releases[0]));
      }
      if (req.method === 'GET' && url === `/v1beta1/sites/${SITE}/releases?pageSize=2`) {
        return void res.writeHead(200).end(JSON.stringify({ releases: releases.slice(0, 2) }));
      }
      res.writeHead(404).end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(PORT, '127.0.0.1', r));
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});
beforeEach(() => {
  calls = [];
  tokenIssued = 0;
  fault = null;
  liveVersion = VERSION;
  releases = [];
  newRelease(VERSION);
  deployDuringPurge = false;
});

let clock = 1_000_000;
const make = (timeoutMs = 2000) => new FirebaseHostingInvalidator({ site: SITE, apiBase: `${BASE}/v1beta1`, tokenUrl: `${BASE}/token`, timeoutMs, now: () => clock });

describe('FirebaseHostingInvalidator', () => {
  it('live 채널의 지금 버전을 새 릴리스로 다시 낸다(토큰은 메타데이터 서버, Metadata-Flavor 머리글)', async () => {
    const inv = make();
    expect(inv.kind).toBe('firebase');
    await inv.purgeSite();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /token',
      `GET /v1beta1/sites/${SITE}/channels/live`,
      `POST /v1beta1/sites/${SITE}/releases?versionName=${encodeURIComponent(VERSION)}`,
      `GET /v1beta1/sites/${SITE}/releases?pageSize=2`,
    ]);
    expect(releases.map((r) => r.version.name)).toEqual([VERSION, VERSION]); // 내용은 그대로, 릴리스만 새로
    expect(calls[0]!.flavor).toBe('Google');
    expect(calls[2]!.auth).toBe('Bearer ya29.token-1');
    expect(JSON.parse(calls[2]!.body!)).toEqual({ message: expect.any(String) });
  });
  it('토큰은 만료 1분 전까지 다시 쓰고, 그 뒤·401 뒤에는 새로 받는다', async () => {
    const inv = make();
    await inv.purgeSite();
    await inv.purgeSite();
    expect(tokenIssued).toBe(1);
    clock += 3540_000;
    await inv.purgeSite();
    expect(tokenIssued).toBe(2);
    fault = { path: /channels\/live/, status: 401 };
    await expect(inv.purgeSite()).rejects.toMatchObject({ step: 'channel', status: 401 });
    fault = null;
    await inv.purgeSite();
    expect(tokenIssued).toBe(3);
  });
  it('live 채널에 릴리스가 없거나 다른 사이트 버전이면 릴리스를 내지 않는다', async () => {
    liveVersion = null;
    await expect(make().purgeSite()).rejects.toMatchObject({ step: 'channel' });
    liveVersion = 'sites/other-site/versions/x';
    releases[0]!.version.name = liveVersion;
    await expect(make().purgeSite()).rejects.toMatchObject({ step: 'channel' });
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });
  it('리뷰 M2: 채널을 읽은 뒤 정적 배포가 새 버전을 내면, 되감긴 것을 알아채고 그 새 버전을 다시 낸다(live = 새 버전)', async () => {
    deployDuringPurge = true;
    await make().purgeSite();
    expect(releases[0]!.version.name).toBe(`sites/${SITE}/versions/deployed-v2`);
    expect(releases.map((r) => r.version.name)).toEqual([`sites/${SITE}/versions/deployed-v2`, VERSION, `sites/${SITE}/versions/deployed-v2`, VERSION]);
    // 다시 내기도 실패하면 repair 단계 오류
    releases = [];
    newRelease(VERSION);
    fault = { path: /deployed-v2/, status: 503 };
    await expect(make().purgeSite()).rejects.toMatchObject({ step: 'repair', status: 503 });
  });
  it('권한 없음(403)·시간 초과는 CdnPurgeError — 메시지에 주소·토큰·사이트 없음', async () => {
    fault = { path: /releases/, status: 403 };
    const e1 = await make().purgeSite().catch((x: unknown) => x);
    fault = { path: /channels/, status: 'hang' };
    const e2 = await make(150).purgeSite().catch((x: unknown) => x);
    fault = { path: /token/, status: 500 };
    const e3 = await make().purgeSite().catch((x: unknown) => x);
    expect([e1, e2, e3].map((e) => [(e as CdnPurgeError).step, (e as CdnPurgeError).status])).toEqual([['release', 403], ['channel', undefined], ['token', 500]]);
    for (const e of [e1, e2, e3]) {
      expect(e).toBeInstanceOf(CdnPurgeError);
      const t = `${String(e)} ${JSON.stringify(e)}`;
      for (const s of ['127.0.0.1', 'ya29', SITE, 'versions']) expect(t).not.toContain(s);
    }
  });
});
