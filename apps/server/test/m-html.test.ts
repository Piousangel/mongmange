// /m HTML 틀(m-html.ts) — PM 조건 ①: 템플릿 값은 화이트리스트, 이스케이프는 문맥별(본문·속성·URL). 시험으로 고정한다.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  attr,
  cspFor,
  escapeAttr,
  escapeText,
  html,
  LIVE_VALUE_KEYS,
  M_SCRIPT,
  M_SCRIPT_HASH,
  renderGonePage,
  renderLivePage,
  renderReportedPage,
  reportAction,
  storeHop,
  text,
  toString,
  url,
  type LivePageValues,
  type PageConfig,
} from '../src/pages/m-html';

const CFG: PageConfig = {
  siteOrigin: 'https://mongmang.ink',
  publicOrigin: 'https://proj.supabase.co',
  storeIosUrl: 'https://apps.apple.com/app/id6739012345?ct=m_link',
  storeAndroidUrl: 'https://play.google.com/store/apps/details?id=com.piousangel.mongmange&referrer=utm_source%3Dmongmang.ink',
};
const PUB = 'https://proj.supabase.co/storage/v1/object/public/public-pages/AbCdEfGhIjKlMnOpQrStUv';
function values(tag: string): LivePageValues {
  return {
    code: 'K7M3QX9P',
    lang: 'ko',
    title: `TITLE${tag}`,
    auxKo: `AUXKO${tag}`,
    auxEn: `AUXEN${tag}`,
    posterUrl: `${PUB}/poster.jpg?v=P${tag}`,
    ogUrl: `${PUB}/og.jpg?v=O${tag}`,
    loopUrl: `${PUB}/loop.mp4?v=L${tag}`,
    snapUrl: `${PUB}/snap.json?v=S${tag}`,
  };
}

describe('화이트리스트 — 틀에 들어가는 값은 LivePageValues 필드뿐', () => {
  it('키 목록이 타입과 같다(필드를 더하면 이 시험과 LIVE_VALUE_KEYS를 함께 고쳐야 한다)', () => {
    const v = values('x');
    expect(Object.keys(v).sort()).toEqual([...LIVE_VALUE_KEYS].sort());
  });
  it('값을 바꿔 두 번 그리면, 값 자리를 지운 나머지(틀)는 글자 하나 다르지 않다 — 숨은 동적 값 없음', () => {
    const a = renderLivePage(values('AAAA'), CFG).replaceAll('AAAA', '§');
    const b = renderLivePage(values('BBBB'), CFG).replaceAll('BBBB', '§');
    expect(a).toBe(b);
  });
  it('사라진 링크 페이지에는 값이 하나도 없다(같은 설정이면 늘 같은 바이트)', () => {
    expect(renderGonePage(CFG)).toBe(renderGonePage(CFG));
    expect(renderGonePage(CFG)).not.toMatch(/K7M3QX9P|data-snap|og:image/);
  });
  it('이스케이프하지 않은 값을 틀에 끼우면 던진다(누락이 실행 시 바로 드러남)', () => {
    const raw = '<b>' as unknown as ReturnType<typeof text>;
    expect(() => html`<p>${raw}</p>`).toThrow(/이스케이프/);
    expect(toString(html`<p>${text('<b>')}</p>`)).toBe('<p>&lt;b&gt;</p>');
  });
});

describe('문맥별 이스케이프', () => {
  const evil = `</title><script>alert(1)</script>"'&<img onerror=x>`;
  it('본문 텍스트·속성: 다섯 글자(속성은 줄바꿈까지)', () => {
    expect(escapeText(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
    expect(escapeAttr(`a"\nb`)).toBe('a&quot;&#10;b');
  });
  it('제목·보조 줄에 HTML이 섞여도 스크립트·태그가 새로 생기지 않는다', () => {
    const v = { ...values(''), title: evil, auxKo: evil, auxEn: evil };
    const h = renderLivePage(v, CFG);
    expect(h.match(/<script>/g)).toHaveLength(1); // 우리 인라인 스크립트 하나뿐
    expect(h).not.toContain('<img onerror');
    expect(h).not.toContain('</title><script>');
    expect(h).toContain('&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#39;&amp;');
    // 속성 값은 늘 큰따옴표로 감싸고 그 안에서 따옴표가 엔티티
    expect(h).toMatch(/<meta property="og:title" content="&lt;\/title&gt;[^"]*">/);
  });
  it('URL: 허용 출처의 http(s) 절대 주소만 — javascript:·다른 출처·따옴표·자격 증명은 던진다', () => {
    const ok = [CFG.publicOrigin];
    expect(() => url('javascript:alert(1)', ok)).toThrow();
    expect(() => url('https://evil.example/p.jpg', ok)).toThrow(/출처/);
    expect(() => url(`${PUB}/p.jpg"onerror="x`, ok)).toThrow();
    expect(() => url('https://u:p@proj.supabase.co/x', ok)).toThrow();
    expect(() => url('/relative.jpg', ok)).toThrow(/절대/);
    expect(() => renderLivePage({ ...values(''), posterUrl: 'https://evil.example/p.jpg' }, CFG)).toThrow();
    expect(toString(url(`${PUB}/a.jpg?x=1&y=2`, ok))).toBe(`${PUB}/a.jpg?x=1&amp;y=2`);
  });
  it('스토어 경유 경로는 인장 코드 형식만(경로 조작 차단)', () => {
    expect(() => storeHop('../../x', 'ios')).toThrow();
    expect(() => storeHop('k7m3qx9p', 'ios')).toThrow();
    expect(toString(storeHop('K7M3QX9P', 'android'))).toBe('/m/K7M3QX9P/get?p=android');
    expect(toString(attr('ko'))).toBe('ko');
  });
});

describe('페이지 모양 — 첫 페인트·CSP·외부 주소', () => {
  const h = renderLivePage(values(''), CFG);
  it('인라인 스크립트는 상수 하나, CSP 해시가 그 내용과 같다, 스크립트에 데이터 없음', () => {
    const script = /<script>([\s\S]*?)<\/script>/.exec(h)![1]!;
    expect(script).toBe(M_SCRIPT);
    expect(M_SCRIPT_HASH).toBe(`sha256-${createHash('sha256').update(script).digest('base64')}`);
    expect(cspFor(CFG, true)).toContain(`script-src '${M_SCRIPT_HASH}' https://mongmang.ink/w/ 'wasm-unsafe-eval'`);
    expect(cspFor(CFG, true)).toMatch(/^default-src 'none'/);
    expect(cspFor(CFG, true)).toContain("frame-ancestors 'none'");
    expect(script).not.toMatch(/K7M3QX9P|TITLE|supabase/);
  });
  it('30KB 미만(인라인 CSS 포함), 포스터 preload + 고정 크기 img, 루프는 muted playsinline autoplay loop', () => {
    expect(Buffer.byteLength(h)).toBeLessThan(30 * 1024);
    expect(h).toMatch(/<link rel="preload" as="image" href="[^"]+poster\.jpg/);
    expect(h).toMatch(/<img id="poster" src="[^"]+" width="1080" height="1350"/);
    expect(h).toMatch(/<video id="loop" [^>]*autoplay muted playsinline loop/);
    expect(renderLivePage({ ...values(''), loopUrl: null }, CFG)).not.toContain('<video');
  });
  it('noindex·no-referrer, 외부 주소는 공개 파일 출처뿐(스토어는 같은 출처 /m/{code}/get을 거친다)', () => {
    expect(h).toContain('<meta name="robots" content="noindex">');
    expect(h).toContain('<meta name="referrer" content="no-referrer">');
    for (const [, u] of h.matchAll(/=\s*"((?:https?:)?\/\/[^"]+)"/g)) expect(u!.startsWith(CFG.publicOrigin), u).toBe(true);
    expect(h).toContain('href="/m/K7M3QX9P/get?p=ios"');
  });
  it('비콘·live 로더는 config의 webLive가 켜졌을 때만 manifest의 live.<hash>.js를 붙인다(스크립트 문자열 고정)', () => {
    expect(M_SCRIPT).toContain("cfg.flags.webLive!==true");
    expect(M_SCRIPT).toContain("getContext('webgl2')");
    expect(M_SCRIPT).toContain('saveData');
    expect(M_SCRIPT).toContain('prefers-reduced-motion: reduce');
    expect(M_SCRIPT).not.toMatch(/innerHTML|document\.write|eval\(/);
  });
});

describe('신고 폼(B5) — 살아 있는 링크에만, 사유 코드 넷, 자유 글 칸 없음', () => {
  const live = renderLivePage(values(''), CFG);
  it('폼은 같은 출처 /m/{code}/report로 POST, 라디오 넷(값 = contract REPORT_REASONS), textarea·text 입력 없음', () => {
    const form = /<form method="post" action="([^"]+)">([\s\S]*?)<\/form>/.exec(live)!;
    expect(form[1]).toBe('/m/K7M3QX9P/report');
    expect([...form[2]!.matchAll(/name="reason" value="([^"]+)"/g)].map((m) => m[1])).toEqual(['sexual', 'hate', 'personal', 'other']);
    expect(live).not.toMatch(/<textarea|type="text"/);
    expect(form[2]).not.toMatch(/K7M3QX9P|TITLE/);
  });
  it('CSP form-action: 살아 있는 링크만 self, 사라진 링크·감사 페이지는 none(폼 없음)', () => {
    expect(cspFor(CFG, true)).toContain("form-action 'self'");
    expect(cspFor(CFG, false)).toContain("form-action 'none'");
    expect(renderGonePage(CFG)).not.toContain('<form');
    expect(renderReportedPage()).not.toContain('<form');
  });
  it('감사 페이지에는 값이 없다(늘 같은 바이트), 폼 action은 인장 코드 형식만', () => {
    expect(renderReportedPage()).toBe(renderReportedPage());
    expect(renderReportedPage()).toContain('data-state="reported"');
    expect(() => reportAction('../../x')).toThrow();
    expect(() => reportAction('k7m3qx9p')).toThrow();
  });
  it('이름 가리기 뒤 og:image가 포스터면 크기를 1080×1350으로(OG 그림 1200×630이 아님)', () => {
    const v = values('');
    const h = renderLivePage({ ...v, ogUrl: v.posterUrl }, CFG);
    expect(h).toContain('<meta property="og:image:width" content="1080">');
    expect(h).toContain('<meta property="og:image:height" content="1350">');
    expect(live).toContain('<meta property="og:image:width" content="1200">');
  });
});

describe('data-snap(B5 리뷰 M3)', () => {
  it('snapUrl이 null이면(이름 가리기 직후) data-snap 속성 자체가 없다', () => {
    expect(renderLivePage(values(''), CFG)).toContain('data-snap="');
    expect(renderLivePage({ ...values(''), snapUrl: null }, CFG)).not.toContain('data-snap');
  });
});
