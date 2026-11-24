// 자체 OTA 엔드포인트(V21, Expo Updates 프로토콜 v1 — docs/design/server-v1/ota-self-host.md).
//  GET /api/v1/ota/manifest        앱(expo-updates)이 '새 판 있나' 묻는다. 200 multipart(manifest 또는 directive) / 204 없음
//  GET /api/v1/ota/assets/:hash    매니페스트가 가리키는 파일(내용 해시 주소, immutable, 스트림)
// 인증 없음(설치 직후 계정이 없다). **요청 헤더를 저장·로그하지 않는다**: EAS-Client-ID(설치 id — 앱은 상수로 덮어 보낸다, 9절)·
// Expo-Current/Embedded-Update-ID·Expo-Recent-Failed-Update-IDs·Expo-Fatal-Error·User-Agent·IP. 요청 로그는 logging.ts 화이트리스트
// (route 템플릿·상태)뿐이고, 이 파일은 요청 헤더를 로그·DB·오류 문구에 싣지 않는다 — test/ota.e2e.test.ts(stdout 포함)·ota.db.test.ts가 고정하고,
// console 출력은 린트(no-console)가 막는다.
// 경로 그룹 = ota(`ota.mongmang.ink` Firebase 리라이트 → Cloud Run, TRUSTED_PROXY_HOPS_OTA). 전역 IP 카운터 대신 OTA 전용 카운터로 센다(리뷰 L3).
import { Controller, Get, Headers, Param, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import { ClientIpService, rateLimitKey, type IpRequest } from '../common/client-ip';
import { RateLimiter } from '../common/rate-limiter';
import { OtaService } from './ota.service';
import { ASSET_CACHE, ASSET_HASH_RE, COMMON_HEADERS, multipart, parseManifestRequest, pickEncoding, signatureHeader } from './protocol';

/**
 * 레이트 리밋(3-8 표에 더함, OTA 전용 카운터 — 같은 CGNAT 뒤 다른 API 호출이 OTA를 밀어내지 않게).
 * 매니페스트: 정상 앱은 하루 한 번 — IP 접두당 분당 60. 에셋: 한 판에 파일 약 53개(11-24 expo export 실측) — 분당 600
 */
export const OTA_LIMITS = { manifestPerMin: 60, assetsPerMin: 600 } as const;

function common(reply: FastifyReply): FastifyReply {
  for (const [k, v] of Object.entries(COMMON_HEADERS)) void reply.header(k, v);
  return reply;
}

@ApiExcludeController()
@SkipThrottle()
@Controller('api/v1/ota')
export class OtaController {
  constructor(
    private readonly ota: OtaService,
    private readonly limiter: RateLimiter,
    private readonly ips: ClientIpService,
  ) {}

  /** OTA 그룹 IP 접두로 센다. 넘으면 true(429를 이미 보냄) */
  private limited(name: 'ota_manifest' | 'ota_asset', limit: number, req: IpRequest, reply: FastifyReply): boolean {
    if (!this.limiter.take([{ name, key: rateLimitKey(this.ips.clientIp(req, 'ota')), limit, windowMs: 60_000 }])) return false;
    void reply.code(429).header('cache-control', 'no-store').send({ error: { code: 'rate_limited' } });
    return true;
  }

  @Get('manifest')
  async manifest(@Headers() headers: Record<string, string | string[] | undefined>, @Req() req: IpRequest, @Res() reply: FastifyReply): Promise<void> {
    if (this.limited('ota_manifest', OTA_LIMITS.manifestPerMin, req, reply)) return;
    const q = parseManifestRequest(headers);
    if (!q.ok) {
      void common(reply).code(q.status).send({ error: { code: q.code } });
      return;
    }
    const p = await this.ota.pick(q);
    if (p.kind === 'none') {
      // 명세: 파트 없는 multipart = 204, content-type 없음. 헤더는 보낸다
      void common(reply).code(204).send();
      return;
    }
    const sig = p.release.signature ? signatureHeader(p.release.signature, p.release.keyId) : null;
    if (q.format === 'json') {
      // JSON 꼴은 지시를 실을 수 없다 → 명세대로 406
      if (p.kind === 'rollback') {
        void common(reply).code(406).send({ error: { code: 'directive_needs_multipart' } });
        return;
      }
      if (sig) void reply.header('expo-signature', sig);
      void common(reply).code(200).header('content-type', 'application/expo+json; charset=utf-8').send(p.release.body);
      return;
    }
    const m = multipart([{ name: p.kind === 'update' ? 'manifest' : 'directive', body: p.release.body, signature: sig }]);
    void common(reply).code(200).header('content-type', m.contentType).send(m.body);
  }

  @Get('assets/:hash')
  async asset(@Param('hash') hash: string, @Headers('accept-encoding') ae: string | undefined, @Req() req: IpRequest, @Res() reply: FastifyReply): Promise<void> {
    if (this.limited('ota_asset', OTA_LIMITS.assetsPerMin, req, reply)) return;
    if (!ASSET_HASH_RE.test(hash)) {
      void reply.code(404).header('cache-control', 'no-store').send({ error: { code: 'not_found' } });
      return;
    }
    const f = await this.ota.openAsset(hash, pickEncoding(ae));
    if (!f.ok) {
      void reply.code(f.why === 'not_found' ? 404 : 503).header('cache-control', 'no-store').send({ error: { code: f.why } });
      return;
    }
    void reply.header('content-type', f.contentType).header('content-length', String(f.size)).header('cache-control', ASSET_CACHE).header('vary', 'accept-encoding');
    if (f.encoding) void reply.header('content-encoding', f.encoding);
    void reply.code(200).send(f.stream);
  }
}
