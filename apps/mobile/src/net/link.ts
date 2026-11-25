// 딥링크 받는 시트의 순수 부분(C11 — architecture 3-5 '딥링크': 앱이 있으면 이름표처럼 카드만 보여 주는 시트, 디퍼드 딥링크 없음).
// - 주소: C10 앱 링크 범위(`https://mongmang.ink/m/*`)와 같게 사이트 출처의 `/m/{인장 코드}`만 받는다(하위 경로 /get·/report는 웹 몫).
// - 공개 API 계약 = 서버 `/m/{code}` HTML의 고정 틀(apps/server/src/pages/m-html.ts): `<main id="m" data-state="live|gone">`,
//   live의 `<img id="poster">`·`<section class="live-msg"><h1>제목</h1><p><span lang="ko">…</span><span lang="en">…</span></p>`.
//   JSON 공개 API를 새로 두지 않은 까닭: 같은 값을 두 번 내는 길이 생기면 숨김·이름 가리기·캐시 무효화(3-9)를 두 곳에서 맞춰야 한다.
// - B5 상태: 꺼짐·신고 격리·운영 숨김·삭제·없는 코드는 서버가 모두 같은 '사라진 링크'로 답한다 → gone 하나(어느 쪽인지 알리지 않음).
//   이름이 실리지 않은 판(끔·검사 실패·운영자 가리기)은 제목이 앱 이름 → title null.
// - 요청은 GET /m/{code}(본문 없음)와 앱 신고 POST /m/{code}/report `{reason}`(계약 reportRequestSchema, 자유 글 없음)뿐. 페이지 조회는
//   비콘(/seen)을 부르지 않으므로 링크 퍼널에 세지 않는다. 실패는 던지지 않는다.
import { normalizeCreatureCode, reportRequestSchema, type ReportReason } from '@mong/contract';
import { LINK_PAGE_APP_TITLES } from '../i18n/brand';
import { request, type FetchLike } from './http';

export const LINK_TIMEOUT_MS = 8000;
const APP_NAMES = new Set(LINK_PAGE_APP_TITLES);

export type LinkPage =
  | {
      kind: 'live';
      /** 이름이 실린 판의 이름. 아니면 null */
      title: string | null;
      /** 보조 줄(먹·결) 두 언어 — 시트는 앱 언어로 고른다 */
      aux: { ko: string; en: string };
      /** 포스터(4:5) https 주소. 믿을 수 없으면 null(그림 없이 글만) */
      posterUrl: string | null;
    }
  | { kind: 'gone' };

/** 시트 상태(화면 갈래는 이것뿐) */
export type LinkView =
  | { v: 'loading' }
  | { v: 'live'; page: Extract<LinkPage, { kind: 'live' }> }
  | { v: 'gone' }
  | { v: 'failed'; why: 'offline' | 'server' }
  | { v: 'report'; page: Extract<LinkPage, { kind: 'live' }>; reason: ReportReason | null }
  | { v: 'reporting'; page: Extract<LinkPage, { kind: 'live' }>; reason: ReportReason }
  | { v: 'reported' }
  | { v: 'reportFailed'; page: Extract<LinkPage, { kind: 'live' }>; reason: ReportReason; why: 'offline' | 'limited' | 'server' };

function hostOf(origin: string): string | null {
  const m = /^https:\/\/([a-z0-9.-]+(?::\d{1,5})?)\/?$/i.exec(origin.trim());
  return m ? m[1]!.toLowerCase() : null;
}

/** 열린 주소 → 인장 코드(정규 8자). 사이트의 `/m/{코드}`(끝 빗금·쿼리·조각 허용)가 아니면 null */
export function linkCodeFromUrl(url: string, siteOrigin: string): string | null {
  const host = hostOf(siteOrigin);
  if (!host) return null;
  const m = /^https:\/\/([^/?#]+)\/m\/([^/?#]{1,16})\/?(?:[?#].*)?$/i.exec(url);
  if (!m || m[1]!.toLowerCase() !== host) return null;
  let raw = m[2]!;
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return normalizeCreatureCode(raw);
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function unescapeHtml(s: string): string {
  return s.replace(/&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
    }
    return ENT[e.toLowerCase()] ?? all;
  });
}

const SAFE_HTTPS = /^https:\/\/[a-z0-9.-]+(?::\d{1,5})?\/[^\s"'<>\\]*$/i;

/** `/m/{code}` HTML → 시트 값. 고정 틀이 아니면 null(믿지 않음) */
export function parseLinkPage(html: string): LinkPage | null {
  const state = /<main id="m" data-state="(live|gone)"/.exec(html)?.[1];
  if (state === 'gone') return { kind: 'gone' };
  if (state !== 'live') return null;
  const msg = /<section class="live-msg"><h1>([^<]*)<\/h1>\s*<p><span lang="ko">([^<]*)<\/span><span lang="en">([^<]*)<\/span><\/p><\/section>/.exec(html);
  if (!msg) return null;
  const title = unescapeHtml(msg[1]!).trim();
  const poster = /<img id="poster" src="([^"]*)"/.exec(html)?.[1];
  const posterUrl = poster ? unescapeHtml(poster) : null;
  return {
    kind: 'live',
    title: title && !APP_NAMES.has(title) ? title : null,
    aux: { ko: unescapeHtml(msg[2]!), en: unescapeHtml(msg[3]!) },
    posterUrl: posterUrl && SAFE_HTTPS.test(posterUrl) ? posterUrl : null,
  };
}

/** 시트를 열 때 한 번. 결과는 live·gone·failed 중 하나 */
export async function loadLinkPage(fetchFn: FetchLike, siteBase: string, code: string): Promise<LinkView> {
  if (!siteBase) return { v: 'failed', why: 'server' };
  const r = await request(fetchFn, `${siteBase}/m/${encodeURIComponent(code)}`, { method: 'GET', headers: { accept: 'text/html' } }, LINK_TIMEOUT_MS);
  if (r.kind === 'network' || r.kind === 'timeout') return { v: 'failed', why: 'offline' };
  if (r.kind !== 'ok') return { v: 'failed', why: 'server' };
  const page = parseLinkPage(r.body);
  if (!page) return { v: 'failed', why: 'server' };
  return page.kind === 'gone' ? { v: 'gone' } : { v: 'live', page };
}

/** 앱 신고(B5 — 웹 폼과 같은 사유 코드). 서버는 세었든 아니든 같은 204를 준다 */
export async function sendReport(fetchFn: FetchLike, siteBase: string, code: string, reason: ReportReason): Promise<'ok' | 'offline' | 'limited' | 'server'> {
  if (!siteBase) return 'server';
  const body = reportRequestSchema.parse({ reason });
  const r = await request(
    fetchFn,
    `${siteBase}/m/${encodeURIComponent(code)}/report`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    LINK_TIMEOUT_MS,
  );
  if (r.kind === 'network' || r.kind === 'timeout') return 'offline';
  if (r.kind === 'http' && r.status === 429) return 'limited';
  return r.kind === 'ok' ? 'ok' : 'server';
}
