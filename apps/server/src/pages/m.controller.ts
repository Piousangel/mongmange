// `/m/{code}` 웹 경로(architecture.md v2.2 3-2·3-5·3-6 '링크 퍼널'·3-9). 인증 없음, Firebase Hosting → Cloud Run(TRUSTED_PROXY_HOPS_WEB).
//  GET  /m/{code}        HTML(고정 틀 + 이스케이프한 값, m-html.ts). live = public, max-age=60, s-maxage=300 / 사라진 링크 = s-maxage=60.
//  POST /m/{code}/seen   페이지 로드 비콘 → link_daily(view). 204 no-store. IP 접두당 30/분, 넘으면 조용히 버림.
//  GET  /m/{code}/get    스토어 302(코드 없는 고정 주소) + link_daily(store_*). no-store. IP 접두당 30/분까지만 센다 — 넘어도 302(B7a).
//  비콘·스토어 이동은 DB를 치지 않는다: LinkCounter가 메모리에 모아 15초마다 한 문장으로 쓴다(B7a, link-counter.ts).
//  POST /m/{code}/report 신고(B5, 3-8). 웹 폼(x-www-form-urlencoded) → 303 감사 페이지 / 앱(JSON {reason}) → 204. 인증 없음, no-store.
//                        같은 출처만(남의 사이트가 방문자 IP로 신고를 쏘게 하는 자동 제출 막기 — sameOriginPost), IP 접두(/64)당 5/시간(DB 앞).
//                        신고자 키 접두는 IPv6 /48(reportKeyPrefix, B5 리뷰 H2).
//                        대상이 없거나 꺼져 있거나 세지 않았어도 응답은 같다.
//  GET  /m/{code}/report 감사 페이지(값 없음, DB 안 봄).
// 캐시의 정본은 이 응답 헤더 하나다(firebase.json `/m/*`에는 Cache-Control을 두지 않는다 — B3 리뷰 I3): 503·429 no-store.
// 링크 코드는 로그에 남지 않는다: 요청 로그 route는 템플릿(`/m/:code`), 이 파일은 코드를 로그·오류 문구에 싣지 않는다(시험이 고정).
import { Body, Controller, Get, Header, HttpCode, Inject, Logger, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import { CREATURE_CODE_RE, REPORT_PER_HOUR, REPORT_REASONS, reportRequestSchema, type ReportReason } from '@mong/contract';
import { ClientIpService, rateLimitKey, reportKeyPrefix, type IpRequest } from '../common/client-ip';
import { RateLimiter } from '../common/rate-limiter';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { OBJECT_STORE, pageDir, type ObjectStore } from '../storage/object-store';
import { ReportService } from '../moderation/report.service';
import { LinkCounter } from './link-counter';
import { auxLine } from './m-copy';
import { cspFor, renderGonePage, renderLivePage, renderReportedPage, type PageConfig } from './m-html';
import type { PageMeta } from './page.service';

/** 3-9 표 */
export const M_CACHE = { live: 'public, max-age=60, s-maxage=300', gone: 'public, max-age=60, s-maxage=60' } as const;
/** 3-8 레이트 리밋 표 */
export const M_LIMITS = { pagePerMin: 60, gonePerMin: 30, seenPerMin: 30, getPerMin: 30, reportPerHour: REPORT_PER_HOUR } as const;
/** 신고 폼 본문 형식(app.factory.ts가 이 경로에서만 x-www-form-urlencoded를 읽는다) */
export const REPORT_PATH_RE = /^\/m\/[^/?#]+\/report(?:\?.*)?$/;
const APP_NAME = { ko: '몽망이 키우기', en: 'Mongmangi' } as const;

interface LiveRow {
  code: string;
  store_key: string;
  meta: PageMeta | null;
  path_prefix: string | null;
  has_loop: boolean;
  name_shown: boolean;
}

/**
 * 같은 출처 판정(B5 리뷰 C1). /m 페이지는 `Referrer-Policy: no-referrer`라 **진짜 브라우저는 같은 출처 폼 POST에 `Origin: null`을 붙인다**
 * (Fetch 표준 — no-cors 요청의 Origin 직렬화). 그래서 Origin을 1차 근거로 쓰면 웹 신고가 늘 403이 된다.
 *  ① `Sec-Fetch-Site`가 있으면(현대 브라우저) 그것만 본다: `same-origin`만 통과, cross-site·same-site·none은 거부
 *  ② 없으면(옛 브라우저·앱·curl) Origin으로: 사이트 출처와 정확히 같으면 통과, `null`은 거부(샌드박스 iframe 자동 제출 구멍),
 *     Origin이 아예 없으면 폼은 거부·JSON(앱)은 통과(다른 출처 브라우저의 JSON은 CORS 사전 요청에서 막힌다)
 */
export function sameOriginPost(headers: Record<string, string | string[] | undefined>, siteOrigin: string, form: boolean): boolean {
  const sfs = headers['sec-fetch-site'];
  if (typeof sfs === 'string' && sfs) return sfs === 'same-origin';
  const origin = headers.origin;
  if (origin === undefined) return !form;
  return origin === siteOrigin;
}

/** 폼·JSON 본문에서 사유 코드 하나. 모르는 값·자유 글은 null */
function reasonOf(body: unknown, form: boolean): ReportReason | null {
  if (form) {
    const v = body && typeof body === 'object' ? (body as Record<string, unknown>).reason : undefined;
    return typeof v === 'string' && (REPORT_REASONS as readonly string[]).includes(v) ? (v as ReportReason) : null;
  }
  const r = reportRequestSchema.safeParse(body);
  return r.success ? r.data.reason : null;
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
    private readonly counter: LinkCounter,
    private readonly reports: ReportService,
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
  seen(@Param('code') code: string, @Req() req: IpRequest): void {
    const ip = rateLimitKey(this.ips.clientIp(req, 'web'));
    if (this.limiter.take([{ name: 'm_seen', key: ip, limit: M_LIMITS.seenPerMin, windowMs: 60_000 }])) return;
    // live 확인은 flush 문장이 한다(꺼진·없는 코드의 칸은 그때 버려진다)
    if (CREATURE_CODE_RE.test(code)) this.counter.add(code, 'view');
  }

  /**
   * 스토어 이동(B7a, B7-report B4). 한도는 **세는 것만** 막는다 — 넘어도 사용자는 늘 스토어로 간다(CGNAT 한 IP를 많은 사람이 쓰는 입소문 순간에
   * 설치하려던 사람이 'Too Many Requests'를 보지 않게). 전역 throttler(120/분)에서도 뺀다(@SkipThrottle) — 이 경로는 DB를 치지 않고
   * 고정 주소 302만 내므로 /healthz처럼 홍수가 DB로 번지지 않는다. 남용 막기의 목적(퍼널 부풀리기·쓰기 증폭)은 그대로: IP 접두당 30/분만 세고,
   * 쓰기는 15초마다 한 문장(link-counter.ts)이다. 302 Location은 코드 없는 고정 주소라 열린 리디렉트도 아니다.
   */
  @Get(':code/get')
  @SkipThrottle()
  get(@Param('code') code: string, @Query('p') p: string | undefined, @Req() req: IpRequest, @Res() reply: FastifyReply): void {
    const ip = rateLimitKey(this.ips.clientIp(req, 'web'));
    const ios = p === 'ios';
    // 퍼널 부풀리기 막기(B3 리뷰 M1): IP 접두당 분당 한도 — 넘으면 세지 않을 뿐 이동은 그대로
    const counted = !this.limiter.take([{ name: 'm_get', key: ip, limit: M_LIMITS.getPerMin, windowMs: 60_000 }]);
    if (counted && (ios || p === 'android') && CREATURE_CODE_RE.test(code)) this.counter.add(code, ios ? 'store_ios' : 'store_android');
    void reply.code(302).header('cache-control', 'no-store').header('location', ios ? this.cfg.storeIosUrl : this.cfg.storeAndroidUrl).send();
  }

  @Post(':code/report')
  async report(@Param('code') code: string, @Body() body: unknown, @Req() req: IpRequest, @Res() reply: FastifyReply): Promise<void> {
    const plain = (status: number, msg: string) => void reply.code(status).header('cache-control', 'no-store').type('text/plain; charset=utf-8').send(msg);
    const ct = String(req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
    const form = ct === 'application/x-www-form-urlencoded';
    if (!form && ct !== 'application/json') return plain(415, 'Unsupported Media Type');
    if (!sameOriginPost(req.headers, this.cfg.siteOrigin, form)) return plain(403, 'Forbidden');
    const client = this.ips.clientIp(req, 'web');
    if (this.limiter.take([{ name: 'm_report', key: rateLimitKey(client), limit: M_LIMITS.reportPerHour, windowMs: 3_600_000 }])) return tooMany(reply);
    const reason = reasonOf(body, form);
    if (!reason) return plain(400, 'Bad Request');
    if (CREATURE_CODE_RE.test(code)) {
      try {
        await this.reports.report(code, reportKeyPrefix(client), reason);
      } catch {
        this.log.warn({ code: 'm_report_failed' }, '신고 기록 실패');
        return unavailable(reply);
      }
    }
    // 세었든 아니든(없는 코드·중복·꺼진 링크) 같은 응답
    if (form) {
      void reply.code(303).header('cache-control', 'no-store').header('location', `/m/${encodeURIComponent(code)}/report`).send();
      return;
    }
    void reply.code(204).header('cache-control', 'no-store').send();
  }

  @Get(':code/report')
  reported(@Res() reply: FastifyReply): void {
    void reply
      .header('cache-control', 'no-store')
      .header('x-robots-tag', 'noindex')
      .header('content-security-policy', cspFor(this.cfg, false))
      .type('text/html; charset=utf-8')
      .send(renderReportedPage());
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
      // 운영자 이름 가리기 뒤(meta.ogPoster)에는 이름이 그려졌을 수 있는 og.jpg 대신 포스터(3-5-2 '이름 가리기' ②)
      ogUrl: m.ogPoster ? f('poster.jpg') : f('og.jpg'),
      loopUrl: r.has_loop ? f('loop.mp4') : null,
      snapUrl: m.snapPending ? null : f('snap.json'),
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
}
