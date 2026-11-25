// 딥링크 받는 시트(C11 — architecture 3-5 '딥링크', C10 앱 링크 `/m/*`)의 순수 부분: 주소 → 인장 코드, 공개 페이지 → 시트 값, 신고 요청.
// 공개 API 계약 = 서버 `/m/{code}` HTML(apps/server/src/pages/m-html.ts의 고정 틀). 여기 고정물(test/fixtures/m-page/*.html)은
// 그 렌더러(renderLivePage·renderGonePage)가 실제로 낸 출력이다 — 틀이 바뀌면 고정물을 다시 만들고 이 시험으로 대조한다.
// B5 숨김·신고 상태: 꺼짐·격리(신고 3건)·운영 숨김·삭제는 서버가 모두 같은 '사라진 링크'로 답한다 → 시트는 gone 하나로 보인다.
// 요청 스냅숏: 앱이 링크 때문에 보내는 요청은 GET /m/{code}(값 없음)와 신고 POST {reason}뿐이다 — 식별자·기기 값 0.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LINK_PAGE_APP_TITLES } from '../src/i18n/brand';
import type { FetchLike } from '../src/net/http';
import { linkCodeFromUrl, LINK_TIMEOUT_MS, loadLinkPage, parseLinkPage, sendReport } from '../src/net/link';
import { renderMPageFixtures } from './support/mPageFixtures';

const fx = (n: string) => readFileSync(join(__dirname, 'fixtures/m-page', `${n}.html`), 'utf8');
const SITE = 'https://mongmang.ink';

describe('주소 → 인장 코드', () => {
  it('사이트의 /m/{코드}만 받는다(끝 빗금·쿼리·조각 허용, 소문자·하이픈은 정규화)', () => {
    expect(linkCodeFromUrl('https://mongmang.ink/m/K7M3QX9P', SITE)).toBe('K7M3QX9P');
    expect(linkCodeFromUrl('https://mongmang.ink/m/K7M3QX9P/', SITE)).toBe('K7M3QX9P');
    expect(linkCodeFromUrl('https://mongmang.ink/m/k7m3-qx9p?utm=x#y', SITE)).toBe('K7M3QX9P');
    expect(linkCodeFromUrl('https://MONGMANG.INK/m/K7M3QX9P', SITE)).toBe('K7M3QX9P');
  });
  it('다른 호스트·http·하위 경로·다른 경로·틀린 코드·사용자 정보 섞인 주소는 null', () => {
    for (const u of [
      'https://evil.example/m/K7M3QX9P',
      'https://mongmang.ink.evil.example/m/K7M3QX9P',
      'https://user@mongmang.ink/m/K7M3QX9P',
      'http://mongmang.ink/m/K7M3QX9P',
      'https://mongmang.ink/m/K7M3QX9P/get',
      'https://mongmang.ink/m/K7M3QX9P/report',
      'https://mongmang.ink/w/K7M3QX9P',
      'https://mongmang.ink/m/K7M3QX9',
      'https://mongmang.ink/m/K7M3QX9PU',
      'https://mongmang.ink:8443/m/K7M3QX9P',
      'mongmange://m/K7M3QX9P',
      '',
    ]) {
      expect(linkCodeFromUrl(u, SITE), u).toBeNull();
    }
  });
});

describe('공개 페이지 계약 — 고정물 = 지금 서버 렌더러 출력(리뷰 M4)', () => {
  it('live·anon·gone 고정물이 서버 renderLivePage·renderGonePage 출력과 바이트까지 같다', async () => {
    const now = await renderMPageFixtures();
    for (const [name, html] of Object.entries(now)) {
      const p = join(__dirname, 'fixtures/m-page', `${name}.html`);
      if (process.env.MPAGE_WRITE === '1') writeFileSync(p, html);
      expect(readFileSync(p, 'utf8'), `${name}.html — 서버 틀이 바뀌었다. 파서(net/link.ts)를 확인하고 MPAGE_WRITE=1로 고정물을 다시 쓴다`).toBe(html);
      expect(parseLinkPage(html), name).not.toBeNull(); // 지금 서버 출력을 앱이 읽는다
    }
  });
});

describe('공개 페이지 → 시트 값', () => {
  it('살아 있는 링크: 이름(엔티티 풀기)·보조 줄 두 언어·포스터', () => {
    expect(parseLinkPage(fx('live'))).toEqual({
      kind: 'live',
      title: '몽이 & <별>',
      aux: { ko: '송연먹 · 느긋결 몽망이를 보셨군요', en: 'You met a Songyeon-ink, Easygoing Mongmangi' },
      posterUrl: 'https://pub.example.co/storage/v1/object/public/public-pages/ab/cd/1/poster.jpg',
    });
  });
  it('이름이 실리지 않은 판(끔·검사 실패·운영자 가리기)은 제목이 앱 이름 → 이름 없음(null)', () => {
    const p = parseLinkPage(fx('anon'));
    expect(p).toMatchObject({ kind: 'live', title: null, posterUrl: 'https://pub.example.co/p/poster.jpg' });
  });
  it('앱이 아는 앱 이름 = 서버 틀의 APP_NAME(이름 없는 판의 제목) — 서버가 바꾸면 여기서 걸린다', () => {
    const src = readFileSync(join(__dirname, '../../server/src/pages/m-html.ts'), 'utf8');
    const m = /const APP_NAME = \{ ko: '([^']+)', en: '([^']+)' \}/.exec(src);
    expect(m, 'm-html.ts APP_NAME 모양').not.toBeNull();
    expect([...LINK_PAGE_APP_TITLES].sort()).toEqual([m![1], m![2]].sort());
  });
  it('사라진 링크(꺼짐·신고 격리·운영 숨김·없는 코드 — 서버가 같은 모양으로 답함) → gone', () => {
    expect(parseLinkPage(fx('gone'))).toEqual({ kind: 'gone' });
  });
  it('모르는 모양·https가 아닌 포스터는 믿지 않는다', () => {
    expect(parseLinkPage('<html><body>hi</body></html>')).toBeNull();
    expect(parseLinkPage(fx('live').replace('src="https://pub', 'src="http://pub'))).toMatchObject({ kind: 'live', posterUrl: null });
    expect(parseLinkPage(fx('live').replace('src="https://pub', 'src="javascript:alert(1)//pub'))).toMatchObject({ posterUrl: null });
  });
});

type Req = { url: string; init?: Parameters<FetchLike>[1] };
function fake(res: Array<{ status: number; body?: string } | 'network'>) {
  const reqs: Req[] = [];
  const f: FetchLike = async (url, init) => {
    reqs.push({ url, init: init && { ...init, signal: undefined } });
    const r = res.shift() ?? { status: 200, body: '' };
    if (r === 'network') throw new TypeError('Network request failed');
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => r.body ?? '' };
  };
  return { f, reqs };
}

describe('불러오기·신고(요청 스냅숏)', () => {
  it('GET /m/{코드} 한 번 — 머리글은 accept뿐, 본문 없음', async () => {
    const { f, reqs } = fake([{ status: 200, body: fx('live') }]);
    expect(await loadLinkPage(f, SITE, 'K7M3QX9P')).toMatchObject({ v: 'live', page: { title: '몽이 & <별>' } });
    expect(reqs).toEqual([{ url: 'https://mongmang.ink/m/K7M3QX9P', init: { method: 'GET', headers: { accept: 'text/html' }, signal: undefined } }]);
    expect(LINK_TIMEOUT_MS).toBe(8000);
  });
  it('결과 갈래: 사라짐 / 연결 실패 → offline / 5xx·429·모르는 모양 → server / 주소 없음 → server(요청 없음)', async () => {
    expect(await loadLinkPage(fake([{ status: 200, body: fx('gone') }]).f, SITE, 'K7M3QX9P')).toEqual({ v: 'gone' });
    expect(await loadLinkPage(fake(['network']).f, SITE, 'K7M3QX9P')).toEqual({ v: 'failed', why: 'offline' });
    for (const r of [{ status: 503 }, { status: 429 }, { status: 200, body: '<p>?</p>' }]) {
      expect(await loadLinkPage(fake([r]).f, SITE, 'K7M3QX9P')).toEqual({ v: 'failed', why: 'server' });
    }
    const none = fake([]);
    expect(await loadLinkPage(none.f, '', 'K7M3QX9P')).toEqual({ v: 'failed', why: 'server' });
    expect(none.reqs).toHaveLength(0);
  });
  it('신고: POST /m/{코드}/report, JSON {reason} 하나(자유 글 없음) → 204 ok / 429 limited / 연결 실패 offline / 그 밖 server', async () => {
    const { f, reqs } = fake([{ status: 204 }]);
    expect(await sendReport(f, SITE, 'K7M3QX9P', 'personal')).toBe('ok');
    expect(reqs).toEqual([
      { url: 'https://mongmang.ink/m/K7M3QX9P/report', init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"reason":"personal"}', signal: undefined } },
    ]);
    expect(await sendReport(fake([{ status: 429 }]).f, SITE, 'K7M3QX9P', 'other')).toBe('limited');
    expect(await sendReport(fake(['network']).f, SITE, 'K7M3QX9P', 'other')).toBe('offline');
    expect(await sendReport(fake([{ status: 403 }]).f, SITE, 'K7M3QX9P', 'other')).toBe('server');
  });
});
