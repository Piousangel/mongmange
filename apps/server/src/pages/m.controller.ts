// `/m/{code}` 웹 경로(architecture.md v2.2 3-2·3-5·3-6 '링크 퍼널'·3-9). 인증 없음, Firebase Hosting → Cloud Run(TRUSTED_PROXY_HOPS_WEB).
//  GET  /m/{code}        HTML(고정 틀 + 이스케이프한 값, m-html.ts). live = public, max-age=60, s-maxage=300 / 사라진 링크 = s-maxage=60.
//  POST /m/{code}/seen   페이지 로드 비콘 → link_daily(view). 204 no-store. IP 접두당 30/분, 넘으면 조용히 버림.
//  GET  /m/{code}/get    스토어 302(코드 없는 고정 주소) + link_daily(store_*). no-store. IP 접두당 30/분.
// 캐시의 정본은 이 응답 헤더 하나다(firebase.json `/m/*`에는 Cache-Control을 두지 않는다 — B3 리뷰 I3): 503·429 no-store.
// 링크 코드는 로그에 남지 않는다: 요청 로그 route는 템플릿(`/m/:code`), 이 파일은 코드를 로그·오류 문구에 싣지 않는다(시험이 고정).
import { Controller, Get, Header, HttpCode, Inject, Logger, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { CREATURE_CODE_RE } from '@mong/contract';
import { ClientIpService, rateLimitKey, type IpRequest } from '../common/client-ip';
import { Clock, utcDay } from '../common/clock';
import { RateLimiter } from '../common/rate-limiter';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { OBJECT_STORE, pageDir, type ObjectStore } from '../storage/object-store';
import { auxLine } from './m-copy';
import { cspFor, renderGonePage, renderLivePage, type PageConfig } from './m-html';
import type { PageMeta } from './page.service';

/** 3-9 표 */
export const M_CACHE = { live: 'public, max-age=60, s-maxage=300', gone: 'public, max-age=60, s-maxage=60' } as const;
/** 3-8 레이트 리밋 표 */
export const M_LIMITS = { pagePerMin: 60, gonePerMin: 30, seenPerMin: 30, getPerMin: 30 } as const;
const APP_NAME = { ko: '몽망이 키우기', en: 'Mongmangi' } as const;

interface LiveRow {
  code: string;
  store_key: string;
  meta: PageMeta | null;
  path_prefix: string | null;
  has_loop: boolean;
  name_shown: boolean;
}

function tooMany(reply: FastifyReply): void {
  void reply.code(429).header('cache-control', 'no-store').type('text/plain; charset=utf-8').send('Too Many Requests');
}
function unavailable(reply: FastifyReply): void {
  void reply.code(503).header('cache-control', 'no-store').type('text/plain; charset=utf-8').send('Service Unavailable');
}

@ApiExcludeController()
@Controller('m')
export class MController {
  private readonly cfg: PageConfig;
  private readonly log = new Logger('M');

  constructor(
    private readonly prisma: PrismaService,
    private readonly ips: ClientIpService,
    private readonly limiter: RateLimiter,
    private readonly clock: Clock,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
    config: ConfigService<Env, true>,
  ) {
    const storeId = config.get('APP_STORE_ID', { infer: true });
    const pkg = config.get('ANDROID_PACKAGE', { infer: true });
    this.cfg = {
      siteOrigin: new URL(config.get('SITE_ORIGIN', { infer: true })).origin,
      publicOrigin: store.publicOrigin,
      storeIosUrl: storeId ? `https://apps.apple.com/app/id${storeId}?ct=m_link` : 'https://apps.apple.com/',
      storeAndroidUrl: `https://play.google.com/store/apps/details?id=${pkg}&referrer=utm_source%3Dmongmang.ink%26utm_medium%3Dshare%26utm_campaign%3Dm_link`,
    };
  }

  @Get(':code')
  async page(@Param('code') code: string, @Req() req: IpRequest, @Res() reply: FastifyReply): Promise<void> {
    const ip = rateLimitKey(this.ips.clientIp(req, 'web'));
    // 리밋은 DB 조회 **앞**에서(B3 리뷰 M1 — 넘친 요청이 DB를 치지 않게). 사라진 링크 한도는 조회 뒤 따로 센다
    if (this.limiter.take([{ name: 'm_page', key: ip, limit: M_LIMITS.pagePerMin, windowMs: 60_000 }])) return tooMany(reply);
    let row: LiveRow | null;
    try {
      row = CREATURE_CODE_RE.test(code) ? await this.live(code) : null;
    } catch {
      // DB가 없으면 '사라진 링크'로 답하지 않는다(CDN이 1분 동안 거짓 '사라짐'을 퍼뜨린다) — 캐시하지 않는 503
      this.log.warn({ code: 'm_db_unavailable' }, '/m 조회 실패');
      return unavailable(reply);
    }
    // 저장소가 없는 서버(운영 none — B6 롤백·복원)에 live 행이 있으면 파일 주소를 만들 수 없다: 거짓 '사라짐' 대신 캐시 안 하는 503(리뷰 L5)
    if (row && !this.store.configured) return unavailable(reply);
    if (!row && this.limiter.take([{ name: 'm_gone', key: ip, limit: M_LIMITS.gonePerMin, windowMs: 60_000 }])) return tooMany(reply);
    void reply.header('x-robots-tag', 'noindex').header('content-type', 'text/html; charset=utf-8');
    if (!row) {
      void reply.header('cache-control', M_CACHE.gone).header('content-security-policy', cspFor(this.cfg, false)).send(renderGonePage(this.cfg));
      return;
    }
    void reply.header('cache-control', M_CACHE.live).header('content-security-policy', cspFor(this.cfg, true)).send(renderLivePage(this.valuesOf(row), this.cfg));
  }

  @Post(':code/seen')
  @HttpCode(204)
  @Header('cache-control', 'no-store')
  async seen(@Param('code') code: string, @Req() req: IpRequest): Promise<void> {
    const ip = rateLimitKey(this.ips.clientIp(req, 'web'));
    if (this.limiter.take([{ name: 'm_seen', key: ip, limit: M_LIMITS.seenPerMin, windowMs: 60_000 }])) return;
    try {
      if (CREATURE_CODE_RE.test(code) && (await this.live(code))) await this.count(code, 'view');
    } catch {
      this.log.warn({ code: 'm_seen_dropped' }, '비콘 기록 실패(버림)');
    }
  }

  @Get(':code/get')
  async get(@Param('code') code: string, @Query('p') p: string | undefined, @Req() req: IpRequest, @Res() reply: FastifyReply): Promise<void> {
    const ip = rateLimitKey(this.ips.clientIp(req, 'web'));
    // 퍼널 부풀리기·쓰기 증폭 막기(B3 리뷰 M1): IP 접두당 분당 한도, DB 앞에서
    if (this.limiter.take([{ name: 'm_get', key: ip, limit: M_LIMITS.getPerMin, windowMs: 60_000 }])) return tooMany(reply);
    const ios = p === 'ios';
    try {
      if ((ios || p === 'android') && CREATURE_CODE_RE.test(code) && (await this.live(code))) await this.count(code, ios ? 'store_ios' : 'store_android');
    } catch {
      this.log.warn({ code: 'm_get_uncounted' }, '스토어 이동 기록 실패(이동은 그대로)');
    }
    void reply.code(302).header('cache-control', 'no-store').header('location', ios ? this.cfg.storeIosUrl : this.cfg.storeAndroidUrl).send();
  }

  private valuesOf(r: LiveRow) {
    const m = r.meta!;
    const aux = auxLine(m.ink, m.texture);
    const f = (name: string) => this.store.publicUrl(`${pageDir(r.store_key, r.path_prefix!)}/${name}`);
    return {
      code: r.code,
      lang: m.lang,
      // 이름이 실린 판(name_shown)이고 meta에 이름이 있을 때만 — 아니면 앱 이름(3-5-2 표)
      title: r.name_shown && m.name ? m.name : APP_NAME[m.lang],
      auxKo: aux.ko,
      auxEn: aux.en,
      posterUrl: f('poster.jpg'),
      ogUrl: f('og.jpg'),
      loopUrl: r.has_loop ? f('loop.mp4') : null,
      snapUrl: f('snap.json'),
    };
  }

  /** 살아 있는 링크만(켜짐·live·운영 숨김 아님). 그 밖은 모두 같은 '사라진 링크' */
  private async live(code: string): Promise<LiveRow | null> {
    const [r] = await this.prisma.$queryRaw<LiveRow[]>`
      SELECT c.code, p.store_key, p.meta, p.path_prefix, p.has_loop, p.name_shown
        FROM app.creatures c JOIN app.public_pages p ON p.creature_id = c.id
       WHERE c.code = ${code} AND c.link_enabled AND NOT c.hidden AND p.state = 'live' AND p.path_prefix IS NOT NULL`;
    return r ?? null;
  }

  private async count(code: string, event: 'view' | 'store_ios' | 'store_android'): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO app.link_daily (day, code, event, count)
      SELECT ${utcDay(this.clock.now())}::date, ${code}, ${event}::app.link_event, 1
       WHERE EXISTS (SELECT 1 FROM app.creatures WHERE code = ${code})
      ON CONFLICT (day, code, event) DO UPDATE SET count = app.link_daily.count + 1`;
    // ↑ 조회와 쓰기 사이에 계정이 지워지면 행을 만들지 않는다(B3 리뷰 L8 — 지운 코드의 하루치 행)
  }
}
