// `/m/{code}` HTML 틀(architecture.md v2.2 3-5 '페이지 — 정적 먼저'·3-5-2 이스케이프·3-9 캐시). 로드맵 B3 '서버 렌더 없음' =
// React SSR·서버에서 그림 그리기 없음. Nest는 **고정 틀에 이스케이프한 값 몇 개만** 채운다(PM 승인 11-20).
//
// 값의 화이트리스트(시험 m-html.test.ts가 고정): LivePageValues의 필드뿐. 틀은 태그 함수 `html`로만 만들고, 끼워 넣는 값은
// 반드시 문맥별 이스케이프를 거친 `Safe` 객체여야 한다 — 맨 문자열을 끼우면 **던진다**(이스케이프 누락이 실행 시 바로 드러남).
//   text(v)  본문 텍스트: & < > " ' → 엔티티
//   attr(v)  큰따옴표로 감싼 속성 값 안: 같은 다섯 글자 + 줄바꿈·탭. 틀이 늘 "…"로 감싼다
//   url(v)   허용 출처의 절대 주소만(http·https, 자격 증명·따옴표·공백 없음) → attr 이스케이프. 아니면 던진다
// 인라인 스크립트는 상수 하나뿐(데이터를 박지 않는다, CSP 해시 고정). 데이터는 DOM의 data-* 속성(attr 이스케이프)으로만 읽는다.
// 링크 코드는 주소창에 이미 있는 값이라 HTML 안 같은 출처 경로(/m/{code}/get)에만 쓴다(형식 검사 뒤). 공개 파일 경로는 pageKey라 코드가 없다.
// 바깥으로 나가는 주소(스토어)에는 코드가 없다 — 302 Location·캠페인 값 모두 고정값(리퍼러는 no-referrer).
import { createHash } from 'node:crypto';

const SAFE = Symbol('safe');
export interface Safe {
  readonly [SAFE]: string;
}
const mk = (s: string): Safe => ({ [SAFE]: s });
const isSafe = (v: unknown): v is Safe => typeof v === 'object' && v !== null && SAFE in v;

const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '\n': '&#10;', '\r': '&#13;', '\t': '&#9;' };
export const escapeText = (v: string): string => v.replace(/[&<>"']/g, (c) => ENT[c]!);
export const escapeAttr = (v: string): string => v.replace(/[&<>"'\n\r\t]/g, (c) => ENT[c]!);

export const text = (v: string): Safe => mk(escapeText(v));
export const attr = (v: string): Safe => mk(escapeAttr(v));
/** 절대 URL(허용 출처 중 하나로 시작) */
export function url(v: string, allowedOrigins: readonly string[]): Safe {
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new Error('url: 절대 주소가 아니다');
  }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw new Error('url: 허용 밖 형식');
  if (!allowedOrigins.includes(u.origin)) throw new Error('url: 허용 밖 출처');
  if (/["'<>\s`\\]/.test(v)) throw new Error('url: 허용 밖 글자');
  return mk(escapeAttr(v));
}
/** 같은 출처 `/m/{code}/report` — 신고 폼 action(B5). 코드는 인장 코드 형식만 */
export function reportAction(code: string): Safe {
  if (!/^[0-9A-HJKMNP-TV-Z]{8}$/.test(code)) throw new Error('reportAction: 코드 형식이 아니다');
  return mk(`/m/${code}/report`);
}
/** 같은 출처 `/m/{code}/get?p=…` — 코드는 인장 코드 형식(Crockford 8자)만 */
export function storeHop(code: string, p: 'ios' | 'android'): Safe {
  if (!/^[0-9A-HJKMNP-TV-Z]{8}$/.test(code)) throw new Error('storeHop: 코드 형식이 아니다');
  return mk(`/m/${code}/get?p=${p}`);
}

/** 틀 태그: 끼우는 값은 Safe만, 배열은 Safe의 배열만 */
export function html(strings: TemplateStringsArray, ...vals: Array<Safe | readonly Safe[]>): Safe {
  let out = strings[0]!;
  vals.forEach((v, i) => {
    const parts = Array.isArray(v) ? v : [v];
    for (const p of parts) {
      if (!isSafe(p)) throw new Error('html: 이스케이프하지 않은 값');
      out += p[SAFE];
    }
    out += strings[i + 1]!;
  });
  return mk(out);
}
export const toString = (s: Safe): string => s[SAFE];
const EMPTY = mk('');

/**
 * 페이지 인라인 스크립트(상수, CSP 해시 하나). 하는 일:
 *  ① 언어 고르기(navigator.language) ② 포스터가 404면(숨김 직후 캐시된 HTML) '사라진 링크' 모양으로 ③ 페이지 로드 비콘 한 번(seen, 쿠키·본문 없음)
 *  ④ 첫 페인트 뒤 조건(WebGL2·절약 모드 아님·움직임 줄이기 아님·config webLive)이 다 맞을 때만 live.js를 붙인다.
 * 주소(코드)는 읽어서 보내지 않는다 — 상대 주소 'seen'만 쓴다(같은 출처, 리퍼러 없음).
 */
export const M_SCRIPT = `(function(){var d=document,h=d.documentElement,m=d.getElementById('m');
h.lang=/^ko\\b/i.test(navigator.language||'')?'ko':'en';
var p=d.getElementById('poster');function gone(){h.className+=' gone';}
if(p){p.addEventListener('error',gone);if(p.complete&&!p.naturalWidth)gone();}
if(!m||m.getAttribute('data-state')!=='live')return;
try{navigator.sendBeacon&&navigator.sendBeacon(location.pathname.replace(/\\/$/,'')+'/seen');}catch(e){}
function live(){try{var c=d.createElement('canvas');if(!c.getContext('webgl2'))return;
var cn=navigator.connection;if(cn&&cn.saveData)return;if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
fetch('/config/v1.json',{credentials:'omit'}).then(function(r){return r.json();}).then(function(cfg){
if(!cfg||!cfg.flags||cfg.flags.webLive!==true)return;return fetch('/w/manifest.json',{credentials:'omit'}).then(function(r){return r.json();}).then(function(mf){
if(!mf||typeof mf.live!=='string'||!/^\\/w\\/live\\.[0-9a-f]{8,}\\.js$/.test(mf.live))return;var s=d.createElement('script');s.src=mf.live;s.async=true;
s.setAttribute('data-ck',String(mf.ck||''));d.body.appendChild(s);});}).catch(function(){});}catch(e){}}
function idle(){(window.requestIdleCallback||function(f){setTimeout(f,200);})(live);}
if(d.readyState==='complete')idle();else addEventListener('load',idle);})();`;
export const M_SCRIPT_HASH = `sha256-${createHash('sha256').update(M_SCRIPT).digest('base64')}`;

export interface PageConfig {
  /** 사이트 출처(https://mongmang.ink — og:url·스크립트·config) */
  siteOrigin: string;
  /** 공개 파일 출처(Storage 공개 버킷) */
  publicOrigin: string;
  /** 스토어 주소(사라진 링크 페이지의 버튼 — 코드 없음, 캠페인 값 고정) */
  storeIosUrl: string;
  storeAndroidUrl: string;
}

/** 살아 있는 링크 페이지에 들어가는 값 — **이것이 화이트리스트 전부다**(m-html.test.ts가 키 목록을 고정) */
export interface LivePageValues {
  /** 인장 코드(형식 검사된 값) — 같은 출처 스토어 경유 경로에만 */
  code: string;
  /** 주인 언어(html lang 기본값·og:locale) */
  lang: 'ko' | 'en';
  /** title·og:title — 이름이 실린 판이면 이름, 아니면 앱 이름(3-5-2 표) */
  title: string;
  /** 보조 줄(먹·결, 이름 없음) 한·영 */
  auxKo: string;
  auxEn: string;
  /** 공개 파일 절대 주소(publicOrigin) */
  posterUrl: string;
  ogUrl: string;
  loopUrl: string | null;
  /** null = data-snap을 싣지 않는다(운영자 이름 가리기 직후 — 이름 없는 판이 생기기 전, B5 리뷰 M3) */
  snapUrl: string | null;
}
export const LIVE_VALUE_KEYS = ['code', 'lang', 'title', 'auxKo', 'auxEn', 'posterUrl', 'ogUrl', 'loopUrl', 'snapUrl'] as const;

const APP_NAME = { ko: '몽망이 키우기', en: 'Mongmangi' } as const;

export function cspFor(cfg: PageConfig, live: boolean): string {
  const pub = cfg.publicOrigin;
  const site = cfg.siteOrigin;
  return [
    "default-src 'none'",
    `img-src ${pub} data:`,
    live ? `media-src ${pub}` : null,
    "style-src 'unsafe-inline'",
    // live.js·CanvasKit은 사이트의 /w/ 아래에서만, wasm 컴파일 허용
    `script-src '${M_SCRIPT_HASH}' ${site}/w/ 'wasm-unsafe-eval'`,
    `connect-src 'self' ${site}/config/v1.json ${site}/w/ ${pub}`,
    "base-uri 'none'",
    // 살아 있는 링크에만 신고 폼(같은 출처 /m/{code}/report, B5). 사라진 링크·감사 페이지는 폼이 없다
    live ? "form-action 'self'" : "form-action 'none'",
    "frame-ancestors 'none'",
  ]
    .filter(Boolean)
    .join('; ');
}

const STYLE = `:root{color-scheme:light;--paper:#EFE8DA;--ink:#1B1A18;--soft:#6B655B}*{box-sizing:border-box}
html,body{margin:0;background:var(--paper);color:var(--ink)}body{min-height:100svh;display:flex;align-items:center;justify-content:center;padding:24px 16px;font:17px/1.6 "Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif}
main{width:100%;max-width:420px;text-align:center}.stage{position:relative;width:100%;aspect-ratio:4/5;margin:0 0 20px;border-radius:12px;overflow:hidden;background:var(--paper)}
.stage img,.stage video,.stage canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.stage canvas{opacity:0;transition:opacity .6s}.stage canvas.on{opacity:1}
h1{font-size:24px;font-weight:600;margin:0 0 6px}p{margin:0 0 20px;color:var(--soft)}.stores{display:grid;gap:12px}
.stores a{display:block;padding:14px 16px;border-radius:12px;background:var(--ink);color:var(--paper);text-decoration:none;font-weight:600;min-height:48px}
.stores a:focus-visible{outline:3px solid #8a6d3b;outline-offset:3px}.gone-msg{display:none}html.gone .stage,html.gone .live-msg,html.gone .report{display:none}html.gone .gone-msg{display:block}
.report{margin:28px 0 0;text-align:left;color:var(--soft);font-size:15px}.report summary{cursor:pointer;min-height:44px;display:flex;align-items:center;justify-content:center}
.report fieldset{border:0;margin:8px 0 0;padding:0;display:grid;gap:4px}.report label{display:flex;gap:10px;align-items:center;min-height:44px}.report input{width:20px;height:20px;margin:0}
.report button{margin:12px 0 0;width:100%;min-height:48px;border:1px solid var(--soft);border-radius:12px;background:transparent;color:var(--ink);font:inherit;font-weight:600}
.report summary:focus-visible,.report button:focus-visible{outline:3px solid #8a6d3b;outline-offset:3px}
html[lang="ko"] [lang="en"],html[lang="en"] [lang="ko"]{display:none}`;

function shell(o: { lang: 'ko' | 'en'; title: Safe; head: Safe; body: Safe }): string {
  return toString(html`<!doctype html>
<html lang="${attr(o.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>${o.title}</title>
${o.head}
<style>${mk(STYLE)}</style>
</head>
<body>
${o.body}
<script>${mk(M_SCRIPT)}</script>
</body>
</html>
`);
}

const STORE_ORIGINS = ['https://apps.apple.com', 'https://play.google.com'];
function stores(ios: Safe, android: Safe): Safe {
  return html`<nav class="stores">
<a href="${ios}" rel="noreferrer noopener"><span lang="ko">App Store에서 받기</span><span lang="en">Get it on the App Store</span></a>
<a href="${android}" rel="noreferrer noopener"><span lang="ko">Google Play에서 받기</span><span lang="en">Get it on Google Play</span></a>
</nav>`;
}

const GONE_MSG = html`<section class="gone-msg"><h1><span lang="ko">사라진 링크예요</span><span lang="en">This link is gone</span></h1>
<p><span lang="ko">주인이 링크를 껐거나 잠시 가려졌어요. 몽망이는 앱 안에서 계속 자라요.</span><span lang="en">Its owner turned the link off, or it is hidden for now. Mongmangi keeps growing inside the app.</span></p></section>`;

/**
 * 신고 폼(B5, architecture 3-8 '신고 → 자동 숨김'). 사유 코드 넷 중 하나만 — 자유 글 칸이 없다(D-21 P3). JS 없이 동작(접힌 details + POST 폼).
 * 문구는 초안(작가 검수 대상). 값은 고정 — 코드는 action 경로에만(reportAction 형식 검사)
 */
const REPORT_REASON_LABELS: ReadonlyArray<{ v: string; ko: string; en: string }> = [
  { v: 'sexual', ko: '성적인 모양이에요', en: 'It looks sexual' },
  { v: 'hate', ko: '혐오·괴롭힘이에요', en: 'It is hateful or bullying' },
  { v: 'personal', ko: '실명·연락처 같은 개인정보가 보여요', en: 'It shows a real name or contact info' },
  { v: 'other', ko: '그 밖의 문제가 있어요', en: 'Something else is wrong' },
];
function reportForm(code: string): Safe {
  const options = REPORT_REASON_LABELS.map(
    (r) => html`<label><input type="radio" name="reason" value="${attr(r.v)}" required><span lang="ko">${text(r.ko)}</span><span lang="en">${text(r.en)}</span></label>`,
  );
  return html`<details class="report"><summary><span lang="ko">이 페이지 알리기</span><span lang="en">Report this page</span></summary>
<form method="post" action="${reportAction(code)}">
<fieldset><legend><span lang="ko">어떤 문제인가요?</span><span lang="en">What is wrong?</span></legend>
${options}
</fieldset>
<button type="submit"><span lang="ko">알리기</span><span lang="en">Send report</span></button>
</form></details>`;
}

/** 살아 있는 링크 */
export function renderLivePage(v: LivePageValues, cfg: PageConfig): string {
  const pub = [cfg.publicOrigin];
  const poster = url(v.posterUrl, pub);
  const og = url(v.ogUrl, pub);
  // 운영자 이름 가리기 뒤(B5)에는 og:image가 포스터다(4:5) — 크기를 그에 맞춘다
  const ogIsPoster = v.ogUrl === v.posterUrl;
  const head = html`<link rel="preload" as="image" href="${poster}" fetchpriority="high">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${attr(APP_NAME[v.lang])}">
<meta property="og:title" content="${attr(v.title)}">
<meta property="og:description" content="${attr(v.lang === 'ko' ? v.auxKo : v.auxEn)}">
<meta property="og:image" content="${og}">
<meta property="og:image:width" content="${mk(ogIsPoster ? '1080' : '1200')}">
<meta property="og:image:height" content="${mk(ogIsPoster ? '1350' : '630')}">
<meta property="og:locale" content="${attr(v.lang === 'ko' ? 'ko_KR' : 'en_US')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="description" content="${attr(v.lang === 'ko' ? v.auxKo : v.auxEn)}">`;
  const video = v.loopUrl
    ? html`<video id="loop" src="${url(v.loopUrl, pub)}" poster="${poster}" autoplay muted playsinline loop preload="auto" aria-hidden="true"></video>`
    : EMPTY;
  const snapAttr = v.snapUrl === null ? EMPTY : html` data-snap="${url(v.snapUrl, pub)}"`;
  const body = html`<main id="m" data-state="live"${snapAttr}>
<div class="stage"><img id="poster" src="${poster}" width="1080" height="1350" alt="" fetchpriority="high">${video}</div>
<section class="live-msg"><h1>${text(v.title)}</h1>
<p><span lang="ko">${text(v.auxKo)}</span><span lang="en">${text(v.auxEn)}</span></p></section>
${GONE_MSG}
${stores(storeHop(v.code, 'ios'), storeHop(v.code, 'android'))}
${reportForm(v.code)}
</main>`;
  return shell({ lang: v.lang, title: text(v.title), head, body });
}

/** 사라진 링크(없는·꺼진·숨긴 코드 — 모두 같은 모양, 200 noindex). 값이 하나도 없다 */
export function renderGonePage(cfg: PageConfig): string {
  const head = html`<meta property="og:type" content="website">
<meta property="og:title" content="${attr(`${APP_NAME.ko} · ${APP_NAME.en}`)}">`;
  const body = html`<main id="m" data-state="gone">
${GONE_MSG}
${stores(url(cfg.storeIosUrl, STORE_ORIGINS), url(cfg.storeAndroidUrl, STORE_ORIGINS))}
</main>`;
  return shell({ lang: 'ko', title: text(`${APP_NAME.ko} · ${APP_NAME.en}`), head, body }).replace('<html lang="ko">', '<html lang="ko" class="gone">');
}

/** 신고 뒤 감사 페이지(303 → GET /m/{code}/report). 값이 하나도 없다 — 신고가 세졌는지·대상이 있는지 알리지 않는다 */
export function renderReportedPage(): string {
  const body = html`<main id="m" data-state="reported">
<section><h1><span lang="ko">알려 주셔서 고마워요</span><span lang="en">Thank you for letting us know</span></h1>
<p><span lang="ko">운영자가 7일 안에 살펴볼게요. 여러 사람이 알리면 확인 전까지 페이지가 바로 가려져요.</span><span lang="en">We will look at it within 7 days. If several people report it, the page is hidden right away until we check.</span></p></section>
</main>`;
  return shell({ lang: 'ko', title: text(`${APP_NAME.ko} · ${APP_NAME.en}`), head: EMPTY, body });
}
