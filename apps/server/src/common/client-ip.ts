// 클라이언트 IP 판정(레이트 리밋 키 전용). architecture.md 3-8, 서버 v2 리뷰 C1-4, B1 리뷰 I1:
// ① 경로 그룹마다 앞단 프록시 수가 다르다(API = Google 프런트엔드 직접, `/m/**` = Firebase 경유) →
//    `clientIp(req, routeGroup)` 하나로만 판단하고, 그룹별 hops는 설정(TRUSTED_PROXY_HOPS_API/_WEB)에서 온다.
//    XFF 왼쪽은 클라이언트가 마음대로 쓸 수 있으므로, 우리 프록시가 덧붙인 오른쪽에서 hops번째 값만 믿는다.
// ② IPv6는 /64로 접는다 — 한 가입자가 /64 안에서 주소를 바꿔 가며 한도를 피하지 못하게.
// 이 값은 레이트 리밋 메모리 키로만 쓰고 저장·로그에 남기지 않는다(로그 규칙은 logging.ts).
import { isIP } from 'node:net';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

export type RouteGroup = 'api' | 'web';

/** 경로 → 그룹. `/m`·`/m/**`는 Firebase Hosting 경유(web), 나머지는 앱 API 직접(api) */
export function routeGroupOf(path: string | undefined): RouteGroup {
  const p = (path ?? '').split('?')[0] ?? '';
  return p === '/m' || p.startsWith('/m/') ? 'web' : 'api';
}

export interface IpRequest {
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  raw?: { url?: string; socket?: { remoteAddress?: string } };
}

@Injectable()
export class ClientIpService {
  private readonly hops: Record<RouteGroup, number>;

  constructor(config: ConfigService<Env, true>) {
    this.hops = {
      api: config.get('TRUSTED_PROXY_HOPS_API', { infer: true }),
      web: config.get('TRUSTED_PROXY_HOPS_WEB', { infer: true }),
    };
  }

  /** 정본 3-8의 `clientIp(req, routeGroup)`. 그룹을 안 주면 경로로 고른다 */
  clientIp(req: IpRequest, group: RouteGroup = routeGroupOf(req.raw?.url ?? req.url)): string | undefined {
    const socketIp = req.raw?.socket?.remoteAddress ?? req.socket?.remoteAddress;
    return pickClientIp(req.headers['x-forwarded-for'], socketIp, this.hops[group]);
  }
}

/** XFF 헤더(여러 줄일 수 있음)와 소켓 주소, 믿는 프록시 수로 클라이언트 IP를 고른다 */
export function pickClientIp(
  xff: string | string[] | undefined,
  socketIp: string | undefined,
  trustedHops: number,
): string | undefined {
  if (trustedHops <= 0 || !xff) return socketIp;
  const parts = (Array.isArray(xff) ? xff.join(',') : xff)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // 오른쪽 끝이 마지막(우리 쪽) 프록시가 덧붙인 값. hops개를 믿으면 오른쪽에서 hops번째가 클라이언트
  const v = parts[parts.length - trustedHops];
  // 체인이 기대보다 짧으면(프록시를 우회한 직접 접속 등) 위조 가능한 값 대신 소켓 주소
  return v && isIP(stripPort(v)) ? stripPort(v) : socketIp;
}

function stripPort(v: string): string {
  // "1.2.3.4:5678" / "[2001:db8::1]:443"
  const br = /^\[([^\]]+)\](?::\d+)?$/.exec(v);
  if (br) return br[1]!;
  const v4 = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(v);
  return v4 ? v4[1]! : v;
}

/** 레이트 리밋 키: IPv4는 그대로, IPv4-매핑 IPv6는 IPv4로, IPv6는 앞 64비트(/64) */
export function rateLimitKey(ip: string | undefined): string {
  if (!ip) return 'unknown';
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1]!;
  if (isIP(ip) !== 6) return ip;
  return `${expandV6(ip).slice(0, 4).join(':')}::/64`;
}

/**
 * 신고자 키 접두(B5 리뷰 H2): IPv4는 그대로(/32), IPv4-매핑 IPv6는 IPv4로, IPv6는 **앞 48비트(/48)**.
 * 흔한 VPS가 /48·/56을 통째로 주므로 /64로 접으면 서로 다른 신고자 셋을 공짜로 만든다. 레이트 리밋(rateLimitKey)은 /64 그대로 —
 * 같은 /48 안 이웃 가입자가 리밋을 나눠 쓰지 않게. 신고는 반대로 '한 사람이 여럿 행세'를 막는 쪽이 중요하다(진짜 이웃 둘이 1로 묶여도 안전한 방향)
 */
export function reportKeyPrefix(ip: string | undefined): string {
  if (!ip) return 'unknown';
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1]!;
  if (isIP(ip) !== 6) return ip;
  return `${expandV6(ip).slice(0, 3).join(':')}::/48`;
}

/** IPv6 → 8개 16비트 그룹(소문자, 앞 0 제거). 존 ID(%eth0)는 버린다 */
function expandV6(ip: string): string[] {
  const addr = ip.split('%')[0]!;
  const [head, tail] = addr.includes('::') ? addr.split('::') : [addr, undefined];
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  // 끝이 IPv4 표기(::ffff:1.2.3.4 외의 경우)면 그룹 두 개로
  const last = t.length ? t : h;
  const lastPart = last[last.length - 1];
  if (lastPart && lastPart.includes('.')) {
    const b = lastPart.split('.').map(Number);
    last.splice(last.length - 1, 1, ((b[0]! << 8) | b[1]!).toString(16), ((b[2]! << 8) | b[3]!).toString(16));
  }
  const fill = tail === undefined ? [] : new Array(8 - h.length - t.length).fill('0');
  return [...h, ...fill, ...t].map((g) => parseInt(g, 16).toString(16));
}
