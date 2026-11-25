// Firebase Hosting CDN 무효화(B6a, CDN_DRIVER=firebase). 정본 architecture 3-9 'CDN 무효화': Hosting에는 경로별 지우기가 없어
// **지금 live 채널의 버전을 새 릴리스로 다시 낸다**(Hosting REST v1beta1 `sites.releases.create?versionName=`) — 새 릴리스가 사이트 전체
// CDN 캐시를 비운다. 묶음(1분)·실패 되돌리기·로그는 CdnPurgeQueue(cdn-purge.ts)가 맡고, 여기는 호출 두 번만 한다:
//  ① GET sites/{site}/channels/live → release.version.name  ② POST sites/{site}/releases?versionName=…
//  ③ (B6a 리뷰 M2) GET sites/{site}/releases?pageSize=2 — ①과 ② 사이에 정적 배포(web-static `firebase deploy`)가 새 버전을 냈으면
//     ②가 사이트를 옛 판으로 되감는다. 바로 앞 릴리스의 버전이 ①에서 읽은 것과 다르면 그 버전을 한 번 더 내서 되돌리고 error 로그.
// 인증: Cloud Run 실행 계정(mong-api-run)의 접근 토큰을 메타데이터 서버에서 받는다(키 파일 없음). 필요한 권한(sites.get·sites.update — 사이트 전체 배포 권한이라 기본 꺼짐)은 deploy/README 10-3.
// 실패는 CdnPurgeError(단계·분류만 — URL·토큰·사이트 id 없음)로 던지고, 대기열이 1분 뒤 다시 낸다(여기서는 재시도하지 않는다).
import { Logger } from '@nestjs/common';
import type { CdnInvalidator } from './cdn-purge';

export const HOSTING_API = 'https://firebasehosting.googleapis.com/v1beta1';
export const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

export class CdnPurgeError extends Error {
  constructor(
    readonly step: 'token' | 'channel' | 'release' | 'verify' | 'repair',
    readonly status?: number,
  ) {
    super(`CDN 무효화 ${step} 실패${status ? `(${status})` : ''}`);
    this.name = 'CdnPurgeError';
  }
}

export interface FirebaseInvalidatorOptions {
  site: string;
  apiBase?: string;
  tokenUrl?: string;
  /** 호출 하나의 제한 시간. 기본 10초(Scheduler cdn-purge 60초 안) */
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

export class FirebaseHostingInvalidator implements CdnInvalidator {
  readonly kind = 'firebase' as const;
  private readonly log = new Logger('CdnPurge');
  private token: { value: string; exp: number } | null = null;
  private readonly api: string;
  private readonly tokenUrl: string;
  private readonly timeoutMs: number;
  private readonly fetch: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly o: FirebaseInvalidatorOptions) {
    this.api = (o.apiBase ?? HOSTING_API).replace(/\/+$/, '');
    this.tokenUrl = o.tokenUrl ?? METADATA_TOKEN_URL;
    this.timeoutMs = o.timeoutMs ?? 10_000;
    this.fetch = o.fetch ?? globalThis.fetch;
    this.now = o.now ?? Date.now;
  }

  async purgeSite(): Promise<void> {
    const site = encodeURIComponent(this.o.site);
    const ch = await this.json('channel', `${this.api}/sites/${site}/channels/live`, { method: 'GET' });
    const version = (ch as { release?: { version?: { name?: unknown } } }).release?.version?.name;
    // 다른 사이트의 버전을 내지 않게 모양까지 확인
    if (typeof version !== 'string' || !version.startsWith(`sites/${this.o.site}/versions/`)) throw new CdnPurgeError('channel');
    const ours = (await this.release(site, version)) as { name?: unknown };
    // ③ 되감기 확인: 최신 둘 = [우리 릴리스, 그 바로 앞]. 우리 것이 최신이 아니면 그 뒤에 배포가 또 있었다 = 되감기 없음
    const list = (await this.json('verify', `${this.api}/sites/${site}/releases?pageSize=2`, { method: 'GET' })) as { releases?: Array<{ name?: unknown; version?: { name?: unknown } }> };
    const [latest, before] = list.releases ?? [];
    if (!latest || typeof ours.name !== 'string' || latest.name !== ours.name) return;
    const prev = before?.version?.name;
    if (typeof prev !== 'string' || prev === version) return;
    if (!prev.startsWith(`sites/${this.o.site}/versions/`)) throw new CdnPurgeError('verify');
    this.log.error({ code: 'cdn_release_race' }, 'CDN 무효화가 동시에 낸 정적 배포를 되감았다 — 그 판을 다시 낸다');
    try {
      await this.release(site, prev);
    } catch (e) {
      throw new CdnPurgeError('repair', e instanceof CdnPurgeError ? e.status : undefined);
    }
  }

  private release(site: string, versionName: string): Promise<unknown> {
    return this.json('release', `${this.api}/sites/${site}/releases?versionName=${encodeURIComponent(versionName)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'mong-api cdn-purge (B3 3-9)' }),
    });
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.exp > this.now()) return this.token.value;
    const res = await this.send('token', this.tokenUrl, { method: 'GET', headers: { 'metadata-flavor': 'Google' } });
    const b = (await res.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown };
    if (typeof b.access_token !== 'string' || !b.access_token) throw new CdnPurgeError('token', res.status);
    // 만료 1분 전에 새로 받는다
    const ttl = typeof b.expires_in === 'number' ? b.expires_in : 300;
    this.token = { value: b.access_token, exp: this.now() + Math.max(0, ttl - 60) * 1000 };
    return b.access_token;
  }

  private async json(step: 'channel' | 'release' | 'verify', url: string, init: RequestInit): Promise<unknown> {
    const token = await this.accessToken();
    const res = await this.send(step, url, { ...init, headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${token}` } });
    return res.json().catch(() => ({}));
  }

  private async send(step: CdnPurgeError['step'], url: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      throw new CdnPurgeError(step);
    }
    if (!res.ok) {
      if (res.status === 401) this.token = null; // 토큰이 무효 — 다음 차례에 새로
      await res.body?.cancel().catch(() => undefined);
      throw new CdnPurgeError(step, res.status);
    }
    return res;
  }
}
