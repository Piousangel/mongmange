// 출시 전 판(마케팅 P0, SE-2·GE-1): 페이지 내용 · GEO 파일 · 색인 정책 · 링크 · 이미지 예산 · 처리방침 두 모드.
// 검사(check)가 그럴듯한 고장을 실제로 잡는지 산출물을 고장 내 본다(OPERATING 8-1). 리뷰 2026-11-25(B1·B2·I1~I5·L1~L7) 반영.
// 11-25 W1~W7(docs/release/README): 출시 전 모드 /privacy = 빌드 2 테스터판 방침. 보호책임자 칸이 빈 정본이면 빌드 실패(W7) —
// 성공 경로는 칸을 채운 사본(filledDocs)이나 PRIVACY_OFFICER 주입으로 본다.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build, BuildError, check, IMAGE_BYTES_BUDGET, readFirebaseJson, ROOT, visibleText } from '../scripts/build.mjs';
import { inline, markdownToHtml, stripInternal } from '../scripts/markdown.mjs';
import { CONTACT, FACTS, PAGES } from '../scripts/site.mjs';
import { cleanDocs as cleanDocsIn, DOCS, filledDocs, keysFile, OFFICER, OFFICER_SLOT, signedSrc } from './helpers.mjs';

const FP = Array.from({ length: 32 }, (_, i) => (i * 7 + 16).toString(16).toUpperCase().padStart(2, '0')).join(':');
const API = 'https://mong-api-abc123-du.a.run.app';
const ENV = { APPLE_TEAM_ID: 'A1B2C3D4E5', ANDROID_CERT_SHA256: FP, APP_STORE_ID: '6739012345', API_ORIGIN: API };
const ORIGIN = 'https://mongmang.ink';

const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'web-site-'));
  dirs.push(d);
  return d;
};
const filled = () => filledDocs(tmp());
const cleanDocs = (o) => cleanDocsIn(tmp(), o);
/** 출시 모드 성공 경로: 메모를 걷은 정본 + 서명된 config·매니페스트 + 공개키 목록(B4 후속) */
const launchReady = (o) => ({ env: { ...ENV, SITE_MODE: 'launch' }, docsDir: cleanDocs(o), srcDir: signedSrc(tmp()), remoteKeysPath: keysFile(tmp()) });
function built({ env = ENV, docsDir = filled(), srcDir, remoteKeysPath } = {}) {
  const o = join(tmp(), 'out');
  const r = build({ env, outDir: o, docsDir, ...(srcDir && { srcDir }), ...(remoteKeysPath && { remoteKeysPath }) });
  const app = JSON.parse(readFileSync(join(ROOT, '../mobile/app.json'), 'utf8')).expo;
  const v = { team: 'A1B2C3D4E5', origin: ORIGIN, apiOrigin: API, iosBundle: app.ios.bundleIdentifier, androidPackage: app.android.package, firebaseJson: readFirebaseJson(join(ROOT, 'firebase.json')), mode: env.SITE_MODE ?? 'prelaunch' };
  return { o, v, r, read: (p) => readFileSync(join(o, p), 'utf8') };
}
function fails(env, docsDir = filled(), extra = {}) {
  const o = join(tmp(), 'out');
  try {
    build({ env, outDir: o, docsDir, ...extra });
  } catch (e) {
    expect(e).toBeInstanceOf(BuildError);
    return e.problems.join('\n');
  }
  throw new Error('빌드가 통과했다');
}
const ld = (html) => JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
const text = (html) => visibleText(html).replace(/\s+/g, ' ');

describe('출시 전 판 페이지', () => {
  it('첫 화면 한·영: D-26 한 줄, 실제 캡처 둘(얼굴·첫 이레), 겨울에 만나요, Android 테스트 안내 + 메일은 글자 + 출시 30일 뒤 삭제, 처리방침·지우기 링크, 언어 전환', () => {
    const { read } = built();
    const ko = read('index.html');
    const en = read('en/index.html');
    expect(ko).toContain('<html lang="ko">');
    expect(en).toContain('<html lang="en">');
    expect(text(ko)).toContain('먹으로 쓴 한 마디, 스물여덟 밤.');
    expect(text(en)).toContain('One word in ink, twenty-eight nights.');
    expect(text(ko)).toContain('겨울에 만나요');
    expect(text(en)).toContain('See you in winter');
    expect(text(ko)).toContain('정식 출시 30일 뒤 지워요');
    expect(text(en)).toContain('30 days after the official launch');
    for (const h of [ko, en]) {
      expect(h).toContain('src="/img/face.jpg"');
      expect(h).toMatch(/src="\/img\/first-ire\.(ko|en)\.jpg"/);
      expect(h).not.toMatch(/morning-card/);
      expect(h).toContain(`<p class="mail">${CONTACT}</p>`);
      expect(h).not.toContain('mailto:');
      expect(h).toContain('href="/delete"');
    }
    expect(ko).toContain('href="/privacy"');
    expect(en).toContain('href="/en/privacy"');
    expect(ko).toContain('href="/en" hreflang="en" lang="en"');
    expect(en).toContain('href="/" hreflang="ko" lang="ko"');
  });

  it('약속하지 않기(리뷰 I2·L1): 날짜·"2027"·"광고 없음"·"결제 없음" 문구 없음, 출시는 "준비 중"', () => {
    const { read } = built();
    for (const pg of PAGES.filter((p) => !p.handwritten && !p.path.endsWith('/facts'))) {
      expect(text(read(pg.file)), pg.file).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    }
    // /privacy(테스터판)는 법정 기재인 시행일·적용 대상 날짜를 싣는다 — 약속 문구 검사에서 날짜만 뺀다
    for (const pg of PAGES.filter((p) => !p.handwritten)) {
      const t = text(read(pg.file));
      if (!pg.path.endsWith('/privacy')) expect(t, pg.file).not.toMatch(/\d+월 \d+일|2027/);
      expect(t, pg.file).not.toMatch(/결제가 없|광고가 없|광고와 앱 안 결제|No ads|no in-app purchases/);
    }
    expect(text(read('facts/index.html'))).toContain('준비 중. 날짜는 테스트를 마친 뒤 정해요');
    expect(text(read('en/facts/index.html'))).toContain('In development. The date is set after testing');
  });

  it('구현 전 동작(K1·K9·K11·K25)은 "준비 중인 원칙"으로만 — 현재형 단정 문장이 없다(리뷰 I3)', () => {
    const { read } = built();
    const ko = text(read('facts/index.html'));
    expect(ko).toContain('준비 중인 원칙');
    for (const s of FACTS.ko.privacyPlan) expect(s).toMatch(/만들고 있어요/);
    expect(ko).not.toMatch(/기기 안에서만 읽어요|직접 켰을 때만 보내요\.|한 획과 그 말의 분류값만 보관해요/);
    const en = text(read('en/facts/index.html'));
    expect(en).toContain('Principles we are building to');
    for (const s of FACTS.en.privacyPlan) expect(s).toMatch(/being built/);
  });

  it('프레스킷 한·영: 한 줄 소개·사실·실제 스크린샷(내려받기)·로고 자리·"1인 개발"만(이름 비공개 문구 없음)·연락처', () => {
    const { read } = built();
    for (const [f, lang] of [['press/index.html', 'ko'], ['en/press/index.html', 'en']]) {
      const h = read(f);
      expect(text(h)).toContain(FACTS[lang].tagline);
      for (const [k, val] of FACTS[lang].rows) {
        expect(text(h)).toContain(k);
        expect(text(h)).toContain(val);
      }
      expect(h.match(/<a href="\/img\/[^"]+" download>/g)?.length).toBeGreaterThanOrEqual(2);
      expect(h).toContain('id="logo"');
      expect(text(h)).not.toMatch(/이름과 얼굴|name and face/);
      expect(text(h)).toMatch(lang === 'ko' ? /1인 개발이에요/ : /One independent developer/);
    }
  });

  it('사실 페이지: 무엇·하루·기본 정보·개인정보(지금/준비 중)·하지 않는 것(D-05 금지 + 피드·AI)·FAQ', () => {
    const { read } = built();
    const ko = text(read('facts/index.html'));
    for (const s of [...FACTS.ko.day, ...FACTS.ko.privacyNow, ...FACTS.ko.privacyPlan, ...FACTS.ko.not]) expect(ko).toContain(s);
    expect(FACTS.ko.not).toEqual(expect.arrayContaining(['확률형 아이템', '화면을 가리는 광고']));
    expect(FACTS.en.not).toEqual(expect.arrayContaining(['Loot boxes', 'Ads that cover the screen']));
    const en = text(read('en/facts/index.html'));
    for (const s of [...FACTS.en.day, ...FACTS.en.privacyNow, ...FACTS.en.privacyPlan, ...FACTS.en.not]) expect(en).toContain(s);
  });

  it('영어 alt는 그림 속 글·장면과 맞다(리뷰 L3)', () => {
    const { read } = built();
    expect(read('en/index.html')).toMatch(/alt="[^"]*The First Seven Days[^"]*Day 1 to Day 7[^"]*two teacups/);
  });

  it('생성 페이지는 실행 스크립트 0, CSP default-src none, referrer no-referrer, 느낌표·이모지·[ ] 메모 0', () => {
    const { read } = built();
    for (const pg of PAGES.filter((p) => !p.handwritten)) {
      const h = read(pg.file);
      expect(h.match(/<script/g)?.length ?? 0, pg.file).toBe(h.match(/<script type="application\/ld\+json">/g)?.length ?? 0);
      expect(h).toContain("default-src 'none'");
      expect(h).toContain('<meta name="referrer" content="no-referrer">');
      expect(text(h), pg.file).not.toMatch(/[!！]|\p{Extended_Pictographic}|\[[^\]]+\]/u);
    }
  });

  it('firebase.json: 생성 페이지마다 frame-ancestors none + X-Frame-Options(리뷰 L5), /img 캐시는 1시간', () => {
    const fb = readFirebaseJson(join(ROOT, 'firebase.json')).hosting;
    for (const pg of PAGES.filter((p) => !p.handwritten)) {
      const hs = fb.headers.find((h) => h.source === pg.path)?.headers ?? [];
      expect(hs, pg.path).toContainEqual({ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" });
      expect(hs, pg.path).toContainEqual({ key: 'X-Frame-Options', value: 'DENY' });
    }
    expect(fb.headers.find((h) => h.source === '/img/**').headers).toEqual([{ key: 'Cache-Control', value: 'public, max-age=3600' }]);
  });
});

describe('/privacy 두 모드(PM 11-25 웹 리뷰 결정)', () => {
  it('W1·W5 출시 전 모드(기본): /privacy·/en/privacy = 빌드 2 테스터판 방침 — 1-1 업데이트 확인·1-2 손글씨 인식 문장, \'지금 받는 것 = 메일뿐\' 문장 없음, 외부 링크는 Google 문서 두 곳만', () => {
    const { read, r } = built();
    const want = {
      ko: { h1: '몽망이 키우기 테스트 빌드 개인정보처리방침', s11: '두 번째 실행부터 기기 날짜로 하루 한 번', s12: '쓴 글씨(획)와 인식 결과는 Google이나 운영자에게 보내지 않습니다', mail: 'Cloudflare 이메일 라우팅을 거쳐 운영자의 Gmail로 전달됩니다', d30: '정식 출시 30일 뒤' },
      en: { h1: 'Privacy Policy for the Mongmangi Test Build', s11: "once a day by your device's calendar, starting from the second launch", s12: 'Your handwriting (strokes) and the recognition result are not sent to Google or to us.', mail: 'Cloudflare Email Routing', d30: '30 days after the official launch' },
    };
    for (const [f, lang] of [['privacy/index.html', 'ko'], ['en/privacy/index.html', 'en']]) {
      const h = read(f);
      const t = text(h);
      const w = want[lang];
      expect(h).toContain(`<h1>${w.h1}</h1>`);
      expect(h).toMatch(/id="s-1-1"/);
      expect(h).toMatch(/id="s-1-2"/);
      for (const s of [w.s11, w.s12, w.mail, w.d30, CONTACT, OFFICER]) expect(t, `${lang}: ${s}`).toContain(s);
      // 옛 출시 전 안내의 '지금 받는 것 = 테스트 신청 메일뿐' 문장은 빌드 2가 업데이트 확인·ML Kit을 보내므로 사실이 아니다
      expect(t).not.toMatch(/테스트 신청 메일뿐|Only email asking to join|The only personal information we receive now/);
      expect(h).not.toMatch(/id="s-1[4-9]"|id="s-17"/);
      const ext = [...h.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith(ORIGIN));
      expect([...new Set(ext)].sort(), lang).toEqual(['https://developers.google.com/ml-kit/android-data-disclosure', 'https://support.google.com/policies?p=privpol_privts']);
    }
    // 정본에는 메모·기입 칸이 남아 있다 → 경고(출시 모드면 실패한다는 안내)
    expect(r.warnings.join('\n')).toMatch(/내부 메모·오너 기입 칸 \d+곳 — 출시 모드/);
  });

  it('W7 출시 전 모드 + 지금 정본(보호책임자 칸 비어 있음): 테스터판 렌더 HTML의 [ … ] 때문에 빌드 실패, 오너 할 일을 알린다', () => {
    const md = readFileSync(join(DOCS, 'privacy-policy-tester.ko.md'), 'utf8');
    expect(md).toContain(OFFICER_SLOT.ko); // 정본이 채워지면 이 시험은 '기입한 사본' 경로만 남기고 지운다
    const msg = fails(ENV, DOCS);
    expect(msg).toMatch(/(^|\n)privacy\/index\.html: 내부 메모·기입 칸 1곳\(예: \[성명 또는 상호 — 오너 기입\]\)/);
    expect(msg).toMatch(/en\/privacy\/index\.html: 내부 메모·기입 칸 1곳/);
    expect(msg).toMatch(/PRIVACY_OFFICER/);
  });

  it('W7 PRIVACY_OFFICER 주입: 정본은 그대로 두고 배포 환경 변수로 보호책임자 칸을 채우면 통과, 형식이 틀리면 실패(값은 싣지 않음)', () => {
    const { read } = built({ env: { ...ENV, PRIVACY_OFFICER: '행복가게' }, docsDir: DOCS });
    expect(text(read('privacy/index.html'))).toMatch(/성명\(또는 상호\) 행복가게/);
    expect(text(read('en/privacy/index.html'))).toContain('행복가게');
    for (const bad of ['[상호]', 'a|b', '<b>x</b>', 'TODO']) {
      const msg = fails({ ...ENV, PRIVACY_OFFICER: bad }, DOCS);
      expect(msg).toMatch(/PRIVACY_OFFICER 형식/);
      if (bad.length > 3) expect(msg).not.toContain(bad);
    }
  });

  it('R1 PRIVACY_OFFICER: 정규화 뒤 검사 — 보이지 않는 값·자리표시자 낱말·괄호류(전각 포함)·1자·81자는 실패, 앞뒤 공백·제로폭은 걷고 통과', () => {
    const long = '가나다라마바사아자차카타파하'.repeat(6).slice(0, 81); // 서로 다른 글자 — 자리표시자 검사가 아니라 길이로만 걸린다(리뷰 R4)
    expect(long).toHaveLength(81);
    const bads = ['\u200b\u200c', '\u202e\u202d', ' \u200b ', '미정', 'TBD', 'tbd', 'N/A', 'n/a', '상호', '성명', '오너 기입', 'Owner to fill', '［상호］', '【상호】', '〔상호〕', '「상호」', '가', 'A\u200b', '가.', '- 가 -', long];
    for (const bad of bads) expect(fails({ ...ENV, PRIVACY_OFFICER: bad }, DOCS), JSON.stringify(bad)).toMatch(/PRIVACY_OFFICER 형식/);
    expect(() => built({ env: { ...ENV, PRIVACY_OFFICER: long.slice(0, 80) }, docsDir: DOCS })).not.toThrow();
    const { read } = built({ env: { ...ENV, PRIVACY_OFFICER: '  (주)행복\u200b가게\u202e ' }, docsDir: DOCS });
    const h = read('privacy/index.html');
    expect(text(h)).toContain('(주)행복가게');
    expect(h).not.toMatch(/[\u200b\u202e]/u);
  });

  it('R1 ⑦: 전각 괄호 꼴 메모(［ … ］·【 … 】·〔 … 〕)도 렌더 HTML에 남으면 실패', () => {
    const d = filled();
    const p = join(d, 'privacy-policy-tester.ko.md');
    for (const memo of ['［오너 기입］', '【확인할 것】', '〔메모〕']) {
      writeFileSync(p, readFileSync(join(DOCS, 'privacy-policy-tester.ko.md'), 'utf8').replace(OFFICER_SLOT.ko, `시험상호 ${memo}`));
      expect(fails(ENV, d), memo).toMatch(/privacy\/index\.html: 내부 메모·기입 칸 1곳/);
    }
  });

  it('출시 모드 + 지금 정본: 내부 메모·기입 칸·작업 메모가 렌더 HTML에 남아 빌드 실패(K32, 리뷰 B1·B2)', () => {
    const msg = fails({ ...ENV, SITE_MODE: 'launch' });
    expect(msg).toMatch(/(^|\n)privacy\/index\.html: 내부 메모·기입 칸 \d+곳/);
    expect(msg).toMatch(/en\/privacy\/index\.html: 내부 메모·기입 칸 \d+곳/);
    expect(msg).toMatch(/작업 메모\('초안'\)/);
  });

  it('출시 모드 + 메모를 걷은 정본 + 서명된 원격 문서: 통과, 정본의 번호 절(H2)이 같은 순서, 체크리스트 0, 외부 링크는 Google 문서 두 곳만', () => {
    const o = launchReady();
    const { read } = built(o);
    for (const [f, md] of [['privacy/index.html', 'privacy-policy.ko.md'], ['en/privacy/index.html', 'privacy-policy.en.md']]) {
      const h = read(f);
      const want = [...readFileSync(join(o.docsDir, md), 'utf8').matchAll(/^## (\d.+)$/gm)].map((m) => m[1].replace(/\*\*/g, ''));
      expect([...h.matchAll(/<h2 id="s-[^"]+">(.+?)<\/h2>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))).toEqual(want);
      expect(h).not.toMatch(/<td>K\d+<\/td>|metricsConsent|게시 전 삭제|Remove before publishing/);
      expect(h).toContain('id="s-17"');
    }
    const ext = [...read('privacy/index.html').matchAll(/href="(https:\/\/[^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith(ORIGIN));
    expect([...new Set(ext)].sort()).toEqual(['https://developers.google.com/ml-kit/android-data-disclosure', 'https://support.google.com/policies?p=privpol_privts']);
  });

  it('변이 M4: 체크리스트 상자 안에 빈 줄이 있어도 K행이 새지 않는다(표식 기반 제외)', () => {
    const o = launchReady({ blankInBox: true });
    expect(readFileSync(join(o.docsDir, 'privacy-policy.ko.md'), 'utf8')).toMatch(/\n\n> \| K1 \|/);
    const { read } = built(o);
    for (const f of ['privacy/index.html', 'en/privacy/index.html']) expect(read(f)).not.toMatch(/<td>K\d+<\/td>|metricsConsent/);
  });

  it('stripInternal: 빈 줄로 갈라진 상자·명시적 끝 표식 모두 지우고, 상자 뒤 본문은 남긴다', () => {
    const md = '# T\n\n> **게시 전 삭제 — x**\n> 설명\n\n> | # | a |\n> |---|---|\n> | K1 | b |\n\n본문 첫 줄\n\n> 남는 인용\n';
    const s = stripInternal(md);
    expect(s).not.toMatch(/K1|게시 전 삭제/);
    expect(s).toContain('본문 첫 줄');
    expect(s).toContain('> 남는 인용');
    const marked = '> **Remove before publishing — x**\n> a\n\nloose text inside\n<!-- end remove before publishing -->\nafter\n';
    expect(stripInternal(marked)).toBe('after\n');
    expect(stripInternal('no box\n')).toBe('no box\n');
  });

  it('잘못된 SITE_MODE는 빌드 실패', () => {
    expect(fails({ ...ENV, SITE_MODE: 'beta' })).toMatch(/SITE_MODE는 prelaunch·launch/);
  });
});

describe('GEO: JSON-LD · sitemap · robots · llms.txt', () => {
  it('JSON-LD: 첫 화면 WebSite+Organization+SoftwareApplication(언어별 @id), 사실 페이지 FAQPage = 화면의 질문·답, 사람 정보 없음', () => {
    const { read } = built();
    const home = ld(read('index.html'))['@graph'];
    expect(home.map((n) => n['@type'])).toEqual(['WebSite', 'Organization', 'SoftwareApplication']);
    const app = home.find((n) => n['@type'] === 'SoftwareApplication');
    expect(app).toMatchObject({ '@id': `${ORIGIN}/#app`, inLanguage: 'ko', applicationCategory: 'GameApplication', operatingSystem: 'iOS, Android', offers: { price: '0' }, typicalAgeRange: '14-' });
    const appEn = ld(read('en/index.html'))['@graph'].find((n) => n['@type'] === 'SoftwareApplication');
    expect(appEn['@id']).toBe(`${ORIGIN}/en#app`);
    expect(appEn.inLanguage).toBe('en');
    for (const [f, lang] of [['facts/index.html', 'ko'], ['en/facts/index.html', 'en']]) {
      const h = read(f);
      const faq = ld(h)['@graph'].find((n) => n['@type'] === 'FAQPage');
      expect(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(FACTS[lang].faq);
      for (const [q, a] of FACTS[lang].faq) {
        expect(text(h)).toContain(q);
        expect(text(h)).toContain(a);
      }
      const s = JSON.stringify(ld(h));
      expect(s).not.toMatch(/Person|telephone|address|founder|author/);
      expect([...new Set([...s.matchAll(/[\w.+-]+@[\w.-]+\.[a-z]+/gi)].map((m) => m[0]))]).toEqual([CONTACT]);
    }
  });

  it('sitemap = 색인 페이지 전부(한·영 짝 hreflang), robots = Sitemap 줄 + /m 막지 않음 + AI 크롤러 따로 막지 않음(G3)', () => {
    const { read } = built();
    const sm = read('sitemap.xml');
    const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
    expect(locs).toEqual(PAGES.filter((p) => p.index).map((p) => ORIGIN + p.path).sort());
    expect(sm).toContain(`<xhtml:link rel="alternate" hreflang="en" href="${ORIGIN}/en/facts"/>`);
    const robots = read('robots.txt');
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    expect(robots).not.toMatch(/^Disallow:\s*\/(m|press|facts|privacy|en)\b/m);
    expect(robots).not.toMatch(/User-agent:\s*(GPTBot|ClaudeBot|Google-Extended|CCBot|OAI-SearchBot|PerplexityBot)/i);
  });

  it('llms.txt 형식(리뷰 L6): H1 · > 요약 · 제목 없는 사실 본문 · H2 아래는 링크 목록만', () => {
    const { read } = built();
    const lt = read('llms.txt');
    expect(lt).toMatch(/^# 몽망이 키우기 \(Mongmangi\)\n\n> /);
    const h2 = lt.split(/^## /m).slice(1);
    expect(h2.map((sec) => sec.split('\n')[0])).toEqual(['Pages', 'Optional']);
    for (const sec of h2) {
      for (const line of sec.split('\n').slice(1).filter((l) => l.trim())) expect(line).toMatch(/^- \[[^\]]+\]\(https:\/\/mongmang\.ink[^)]*\)(: .+)?$/);
    }
    expect(lt.split(/^## /m)[0]).toContain(`Contact: ${CONTACT}`);
    expect(lt).toContain('[테스트 빌드 개인정보처리방침](https://mongmang.ink/privacy)');
  });

  it('색인 정책 표: /m은 정적 파일 없이 firebase.json X-Robots-Tag noindex, 나머지 페이지는 index(noindex meta 없음)', () => {
    const { read, v } = built();
    expect(v.firebaseJson.hosting.headers.find((h) => h.source === '/m/*').headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex' });
    for (const pg of PAGES) expect(read(pg.file), pg.file).not.toMatch(/<meta name="robots" content="[^"]*noindex/);
  });
});

describe('markdown 변환기 방어(리뷰 L4, 변이 M3)', () => {
  it('https 주소만 링크가 되고 javascript:·data:·raw HTML은 글자로 남는다', () => {
    expect(inline('javascript:alert(1)')).toBe('javascript:alert(1)');
    expect(inline('go javascript://x.test/%0Aalert(1)')).not.toContain('<a ');
    expect(inline('data:text/html,<b>x</b>')).not.toMatch(/<a |<b>/);
    expect(inline('<a href="javascript:alert(1)">x</a>')).toBe('&lt;a href=&quot;javascript:alert(1)&quot;&gt;x&lt;/a&gt;');
    expect(inline('see http://x.test/a')).not.toContain('<a ');
    expect(inline('`https://x.test/a`')).toBe('<code>https://x.test/a</code>');
    expect(inline('see https://mongmang.ink/delete.')).toBe('see <a href="https://mongmang.ink/delete">https://mongmang.ink/delete</a>.');
    expect(inline('https://x.test/a"onmouseover="y')).not.toMatch(/"onmouseover="/);
  });
  it('목록·번호 목록·표를 렌더한다', () => {
    const { html, headings } = markdownToHtml('## 1. 가\n\n- 하나\n  1. **셋**\n  2. 넷\n- 둘\n\n| a | b |\n|---|---|\n| x | y |\n');
    expect(headings.map((x) => x.id)).toEqual(['s-1']);
    expect(html).toContain('<ul><li>하나<ol><li><strong>셋</strong></li><li>넷</li></ol></li><li>둘</li></ul>');
    expect(html).toContain('<th scope="col">a</th>');
  });
});

describe('check() — 출시 전 판을 고장 내면 잡는다', () => {
  const breaks = (fn) => {
    const b = built();
    const v2 = fn(b) ?? b.v;
    try {
      check(b.o, v2);
    } catch (e) {
      return e.problems.join('\n');
    }
    throw new Error('검사가 통과했다');
  };
  const edit = (b, rel, from, to) => {
    const p = join(b.o, rel);
    const s = readFileSync(p, 'utf8');
    const found = from instanceof RegExp ? from.test(s) : s.includes(from);
    if (!found) throw new Error(`시험 준비: ${rel}에 ${from}이 없다`);
    writeFileSync(p, s.replace(from, to));
  };

  it('정책 표에 없는 페이지가 생기면 실패', () => {
    expect(breaks((b) => {
      mkdirSync(join(b.o, 'about'));
      cpSync(join(b.o, 'index.html'), join(b.o, 'about/index.html'));
    })).toMatch(/색인 정책 표\(PAGES\)에 없는/);
  });
  it('index 페이지에 noindex가 붙으면 실패', () => {
    expect(breaks((b) => edit(b, 'press/index.html', 'content="index, follow, max-image-preview:large"', 'content="noindex"'))).toMatch(/정책은 index인데 noindex/);
  });
  it('깨진 링크·없는 조각·상대 주소면 실패', () => {
    expect(breaks((b) => edit(b, 'index.html', 'href="/facts"', 'href="/fact"'))).toMatch(/깨진 링크 \/fact/);
    expect(breaks((b) => edit(b, 'privacy/index.html', 'href="#main"', 'href="#nope"'))).toMatch(/조각 #nope/);
    expect(breaks((b) => edit(b, 'en/index.html', 'href="/en/press"', 'href="press"'))).toMatch(/상대 주소/);
  });
  it('위험한 스킴(javascript:·data:·vbscript:) 링크·그림이면 실패(리뷰 L4)', () => {
    expect(breaks((b) => edit(b, 'index.html', 'href="/facts"', 'href="javascript:alert(1)"'))).toMatch(/위험한 스킴 href/);
    expect(breaks((b) => edit(b, 'en/press/index.html', 'href="/en/facts"', "href='JaVaScRiPt:alert(1)'"))).toMatch(/위험한 스킴/);
    expect(breaks((b) => edit(b, 'facts/index.html', '</main>', '<img src="data:image/png;base64,AAAA" alt="x" width="1" height="1"></main>'))).toMatch(/위험한 스킴 src/);
    expect(breaks((b) => edit(b, 'delete/index.html', 'href="/privacy"', 'href="vbscript:x"'))).toMatch(/위험한 스킴/);
  });
  it('firebase.json에서 페이지 rewrite나 frame-ancestors 헤더가 빠지면 실패', () => {
    expect(breaks((b) => {
      const fb = structuredClone(b.v.firebaseJson);
      fb.hosting.rewrites = fb.hosting.rewrites.filter((r) => r.source !== '/press');
      return { ...b.v, firebaseJson: fb };
    })).toMatch(/\/press → \/press\/index\.html rewrite/);
    expect(breaks((b) => {
      const fb = structuredClone(b.v.firebaseJson);
      fb.hosting.headers = fb.hosting.headers.filter((h) => h.source !== '/en/facts');
      return { ...b.v, firebaseJson: fb };
    })).toMatch(/\/en\/facts에 frame-ancestors/);
  });
  it('그림: alt 없음·크기 속성 없음·한 장 예산 초과면 실패', () => {
    expect(breaks((b) => edit(b, 'index.html', /alt="[^"]+"/, 'alt=""'))).toMatch(/대체 글\(alt\)/);
    expect(breaks((b) => edit(b, 'index.html', /width="780" height="520"/, ''))).toMatch(/width·height/);
    expect(breaks((b) => writeFileSync(join(b.o, 'img/face.jpg'), Buffer.alloc(IMAGE_BYTES_BUDGET + 1)))).toMatch(/그림 한 장 예산/);
  });
  it('내부 메모: [ ] 메모·K행(표 칸·글자)·체크리스트 표식이 어느 생성 페이지에든 새면 실패(렌더 HTML 기준)', () => {
    expect(breaks((b) => edit(b, 'privacy/index.html', '</main>', '<p>[법률 검토: 위탁인지]</p></main>'))).toMatch(/내부 메모·기입 칸 1곳/);
    expect(breaks((b) => edit(b, 'en/privacy/index.html', '</main>', '<table><tr><td>K1</td><td>x</td></tr></table></main>'))).toMatch(/체크리스트\(K행\)가 새었다/);
    expect(breaks((b) => edit(b, 'facts/index.html', '</main>', '<p>K32 빈칸</p></main>'))).toMatch(/K행/);
    expect(breaks((b) => edit(b, 'press/index.html', '</main>', '<p>게시 전 삭제 — 내부용</p></main>'))).toMatch(/표식이 남았다/);
  });
  it('W4(법률 리뷰 L4): K33 이상·U행(개정 목록)·A행도 K행처럼 잡는다 — 표 칸과 글자 모두', () => {
    expect(breaks((b) => edit(b, 'privacy/index.html', '</main>', '<p>K35 돌봄</p></main>'))).toMatch(/K행/);
    expect(breaks((b) => edit(b, 'privacy/index.html', '</main>', '<p>U8 개정</p></main>'))).toMatch(/K행/);
    expect(breaks((b) => edit(b, 'en/privacy/index.html', '</main>', '<table><tr><td>U3</td><td>x</td></tr></table></main>'))).toMatch(/K행/);
    expect(breaks((b) => edit(b, 'en/privacy/index.html', '</main>', '<table><tr><th>A12</th></tr></table></main>'))).toMatch(/K행/);
    expect(breaks((b) => edit(b, 'facts/index.html', '</main>', '<p>A2 항목</p></main>'))).toMatch(/K행/);
  });
  it('W3: 출시 전 모드 테스터판에도 작업 메모(초안·확인 필요·법률 검토·draft·To verify)가 남으면 실패', () => {
    for (const [f, w] of [['privacy/index.html', '초안'], ['privacy/index.html', '확인 필요'], ['privacy/index.html', '법률 검토'], ['en/privacy/index.html', 'draft'], ['en/privacy/index.html', 'To verify']]) {
      expect(breaks((b) => edit(b, f, '</article>', `<p>${w} 반영</p></article>`))).toMatch(new RegExp(`작업 메모\\('${w}'\\)`));
    }
  });
  it('W2: 출시 전 모드는 테스터판 절 id(s-1~s-13)를 허용하고, 전체 정본(17절 이상)·테스터판이 아닌 방침이 렌더되면 실패. 문의처·30일 검사는 그대로', () => {
    expect(breaks((b) => edit(b, 'privacy/index.html', /30일/g, '며칠'))).toMatch(/'출시 30일 뒤 삭제'가 없다/);
    expect(breaks((b) => edit(b, 'en/privacy/index.html', '</article>', '<h2 id="s-17">17. Privacy officer</h2></article>'))).toMatch(/전체 처리방침 정본\(17절 이상\)/);
    expect(breaks((b) => edit(b, 'privacy/index.html', '<h1>몽망이 키우기 테스트 빌드 개인정보처리방침</h1>', '<h1>몽망이 키우기 개인정보처리방침</h1>'))).toMatch(/테스터판 방침이 아니다/);
  });
  it('출시 모드 산출물에 작업 메모가 남거나 17절이 사라지면 실패', () => {
    const b = built(launchReady());
    const p = join(b.o, 'privacy/index.html');
    const orig = readFileSync(p, 'utf8');
    writeFileSync(p, orig.replace('</article>', '<p>독립 리뷰 반영본</p></article>'));
    expect(() => check(b.o, b.v)).toThrow(/작업 메모\('독립 리뷰'\)/);
    writeFileSync(p, orig.replace('id="s-17"', 'id="x-17"'));
    expect(() => check(b.o, b.v)).toThrow(/17절/);
  });
  it('생성 페이지에 실행 스크립트·분석 태그가 들어오면 실패(본문 낱말 "analytics"는 통과)', () => {
    expect(breaks((b) => edit(b, 'press/index.html', '</main>', '<script>1</script></main>'))).toMatch(/실행되는 스크립트/);
    expect(breaks((b) => edit(b, 'facts/index.html', '</main>', '<script src="https://www.googletagmanager.com/gtag/js"></script></main>'))).toMatch(/외부 스크립트/);
    const b = built();
    edit(b, 'en/facts/index.html', '</main>', '<p>usage analytics</p></main>');
    expect(() => check(b.o, b.v)).not.toThrow();
  });
  it('JSON-LD: 사람 정보가 들어오거나 FAQ가 화면 글과 달라지면 실패', () => {
    expect(breaks((b) => edit(b, 'index.html', '"@type":"Organization"', '"@type":"Organization","founder":{"@type":"Person","name":"x"}'))).toMatch(/사람·연락 정보/);
    expect(breaks((b) => edit(b, 'facts/index.html', `<p>${FACTS.ko.faq[2][1]}</p>`, '<p>무료예요.</p>'))).toMatch(/FAQ 구조화 데이터 '무료인가요\?'/);
  });
  it('느낌표·이모지가 들어오면 실패(몽망이 톤)', () => {
    expect(breaks((b) => edit(b, 'index.html', '겨울에 만나요</h2>', '겨울에 만나요!</h2>'))).toMatch(/느낌표/);
    expect(breaks((b) => edit(b, 'en/press/index.html', 'Press kit</h1>', 'Press kit \u{1F3A8}</h1>'))).toMatch(/이모지/);
  });
  it('sitemap에서 페이지가 빠지거나, robots가 색인 페이지를 막거나 Sitemap 줄이 없거나, llms.txt가 엉뚱한 곳을 가리키면 실패', () => {
    expect(breaks((b) => edit(b, 'sitemap.xml', `<loc>${ORIGIN}/en/press</loc>`, ''))).toMatch(/sitemap\.xml/);
    expect(breaks((b) => edit(b, 'robots.txt', 'Disallow: /config/', 'Disallow: /press\nDisallow: /config/'))).toMatch(/색인 페이지 \/press를 막는다/);
    expect(breaks((b) => edit(b, 'robots.txt', /Sitemap: .*/, ''))).toMatch(/Sitemap 줄/);
    expect(breaks((b) => edit(b, 'llms.txt', `(${ORIGIN}/en/facts)`, `(${ORIGIN}/m/ABCD1234)`))).toMatch(/llms\.txt: 색인 페이지가 아닌 링크/);
  });
});
