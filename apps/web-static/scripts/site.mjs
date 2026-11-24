// mongmang.ink 출시 전 판(마케팅 P0, SE-2·GE-1). 사실은 이 파일의 FACTS 한 곳에서 나와
// 첫 화면·사실 페이지·프레스킷·JSON-LD·llms.txt·sitemap에 똑같이 쓰인다(GEO: 한 사실 = 한 문장).
// 사실마다 정본 출처는 docs/strategy/geo-v1.md 대조표. 정본이 바뀌면 그 표 → 이 파일 순서로 고친다.
//
// 규칙: 스크립트 0(JSON-LD는 실행되지 않는 데이터 블록), 외부 자원 0, 느낌표·이모지 0(몽망이 톤), 날짜 약속 0,
// 정본(D-05)보다 강한 약속 0, 아직 구현되지 않은 동작은 '준비 중인 원칙'으로만(리뷰 2026-11-25 I2·I3).
//
// 모드(SITE_MODE): 'prelaunch'(기본) — /privacy = '출시 전 개인정보 안내'(지금 받는 것 = 테스터 신청 메일뿐).
//                  'launch' — /privacy = 처리방침 정본 전체 렌더. 내부 메모가 렌더 HTML에 남으면 빌드 실패(build.mjs ⑦).
import { readFileSync } from 'node:fs';
import { markdownToHtml, stripInternal } from './markdown.mjs';

/** 사실을 마지막으로 정본과 대조한 날(sitemap lastmod·facts '마지막 확인') */
export const FACTS_CHECKED = '2026-11-25';
export const MODES = ['prelaunch', 'launch'];
export const CONTACT = 'hello@mongmang.ink';

/**
 * 색인 정책 표(빌드 검사의 기준). 여기 없는 HTML이 public/에 생기면 빌드 실패.
 * index: true → 검색 노출(sitemap에 실림, noindex 금지) / false → noindex meta 필수.
 * /m/{코드}는 Cloud Run이 답하고 firebase.json의 X-Robots-Tag noindex로 막는다(정적 파일 없음, 기존 ⑤ 검사).
 */
export const PAGES = [
  { path: '/', file: 'index.html', lang: 'ko', index: true, pair: '/en' },
  { path: '/en', file: 'en/index.html', lang: 'en', index: true, pair: '/' },
  { path: '/facts', file: 'facts/index.html', lang: 'ko', index: true, pair: '/en/facts' },
  { path: '/en/facts', file: 'en/facts/index.html', lang: 'en', index: true, pair: '/facts' },
  { path: '/press', file: 'press/index.html', lang: 'ko', index: true, pair: '/en/press' },
  { path: '/en/press', file: 'en/press/index.html', lang: 'en', index: true, pair: '/press' },
  { path: '/privacy', file: 'privacy/index.html', lang: 'ko', index: true, pair: '/en/privacy' },
  { path: '/en/privacy', file: 'en/privacy/index.html', lang: 'en', index: true, pair: '/privacy' },
  // 손으로 쓴 기존 페이지(B2) — 한·영 한 파일
  { path: '/delete', file: 'delete/index.html', lang: 'ko', index: true, handwritten: true },
];

/** 실제 렌더 캡처(D-04). 원본은 docs/app/ — 출처는 geo-v1.md 4절 */
export const IMAGES = {
  face: { w: 780, h: 520, ko: '한지 위의 작은 먹 방울 몽망이가 두 눈을 뜨고 있다. 머리 위로 짧은 획 세 개가 뻗어 있다', en: 'Mongmangi, a small drop of ink on paper, with both eyes open and three short strokes on its head' },
  ire: {
    w: 724,
    h: 1200,
    ko: '첫 이레 두루마리. 제목 첫 이레, 몽망이의 일곱 밤. 첫날부터 이레째까지 아침 꿈 카드 일곱 장이 지그재그로 이어진다. 카드마다 눈을 감은 몽망이가 번지는 먹 무늬 속에 있고, 닷새째부터는 찻잔 두 개에 몽망이가 잠겨 있다',
    en: 'The first-week scroll, titled The First Seven Days, Mongmangi’s seven nights. Seven morning dream cards from Day 1 to Day 7 zigzag down the page. On each card Mongmangi sleeps with its eyes closed inside spreading ink patterns, and from Day 5 it sits in one of two teacups',
  },
};
const imgSrc = (key, lang) => (key === 'face' ? '/img/face.jpg' : `/img/first-ire.${lang}.jpg`);

/** 사실(한 곳). 문장은 정본에서 옮김 — 출처는 geo-v1.md 3절 대조표의 번호(F1…) */
export const FACTS = {
  ko: {
    name: '몽망이 키우기',
    tagline: '먹으로 쓴 한 마디, 스물여덟 밤.', // F1 D-26
    summary: '한지 위의 먹 한 방울, 몽망이를 키우는 모바일 게임이에요. 날마다 붓으로 낱말 하나를 쓰면 몽망이가 그 글자를 마시고 몸으로 대답해요. 스물여덟 밤 동안 그렇게 자라요.', // F2 D-26
    day: ['벼루에 먹을 갈아요. 간 만큼 먹의 양과 진하기가 정해져요.', '붓으로 오늘의 한 마디, 낱말 하나를 써요. 글씨의 가장 긴 획은 몸에 남아요.', '연적에 내려놓아요. 물이 말을 풀어 그날 밤 꿈이 돼요.'], // F3 D-26
    rows: [
      ['플랫폼', 'iOS, Android'], // F5
      ['언어', '한국어, 영어'], // F6
      ['가격', '무료로 내려받아요'], // F7 (D-05 [잠정] — 결제·광고 여부는 약속하지 않음)
      ['대상 연령', '만 14세 이상'], // F8
      ['출시', '준비 중. 날짜는 테스트를 마친 뒤 정해요'], // F9
      ['만든 사람', '1인 개발'], // F10
      ['문의', CONTACT], // F11
    ],
    // F12: 지금 사실(테스트 판·이 사이트)
    privacyNow: [
      '이 사이트는 쿠키와 분석 도구를 쓰지 않아요.',
      '지금 받는 개인정보는 테스트 신청 메일뿐이에요. 정식 출시 30일 뒤 지워요.',
    ],
    // F12b: 준비 중인 원칙(처리방침 v3.1 1절 — 구현 확인 K1·K9·K11·K25 전이라 현재형 사실로 쓰지 않음)
    privacyPlan: [
      '날마다 쓰는 한 마디는 기기 안에서 읽도록 만들고 있어요.',
      '이용 통계는 기본으로 꺼 두고, 만 14세 확인을 통과한 분이 직접 켰을 때만 보내도록 만들고 있어요.',
      '공유 링크와 클라우드 보관은 켠 분에게만 생기고, 앱 안에서 지울 수 있게 만들고 있어요.',
    ],
    not: ['확률형 아이템', '화면을 가리는 광고', '에너지 제한', '키운 결과(획·먹·결)를 파는 것', '모르는 사람의 그림이 흐르는 피드', '앱 안에서 생성형 AI가 그림이나 글을 만드는 것'], // F13 D-05 금지 목록 + 피드·AI
    faq: [
      ['몽망이 키우기는 어떤 게임인가요?', '한지 위의 먹 한 방울을 스물여덟 밤 동안 키우는 모바일 게임이에요. 날마다 붓으로 낱말 하나를 쓰면 몽망이가 그 글자를 마시고 몸으로 대답하고, 아침마다 꿈 카드가 한 장 남아요.'],
      ['언제 나오나요?', '준비 중이에요. 날짜는 테스트를 마친 뒤 정해요. 지금은 Android 비공개 테스트를 준비하고 있어요.'],
      ['무료인가요?', '무료로 내려받아요. 확률형 아이템과 화면을 가리는 광고는 넣지 않아요.'],
      ['어떤 기기에서 할 수 있나요?', 'iPhone(iOS)과 Android 폰이에요. 한국어와 영어를 지원해요.'],
      ['제가 쓴 글씨가 서버로 가나요?', '글씨는 기기 안에서 읽도록 만들고 있어요. 손글씨 기능은 아직 만드는 중이라, 확정된 내용은 출시 때 개인정보처리방침에 적어요.'],
      ['AI가 그림을 그려 주나요?', '아니요. 몽망이의 몸과 꿈은 앱이 정해진 규칙으로 그려요.'],
      ['몇 살부터 할 수 있나요?', '만 14세 이상을 대상으로 만들어요.'],
      ['누가 만드나요?', '혼자 만들고 있어요. 문의는 hello@mongmang.ink로 보내 주세요.'],
    ], // F14 = 위 사실의 묶음
  },
  en: {
    name: 'Mongmangi',
    tagline: 'One word in ink, twenty-eight nights.',
    summary: 'A mobile game about raising Mongmangi, a drop of ink on paper. Each day you write one word with a brush, and Mongmangi drinks the letters and answers with its body. It grows this way over twenty-eight nights.',
    day: ['Grind ink on the inkstone. How long you grind sets how much ink there is and how dark it is.', 'Write the word of the day with the brush, a single word. The longest stroke of your writing stays on its body.', 'Set it down at the water dropper. The water loosens the word into that night’s dream.'],
    rows: [
      ['Platforms', 'iOS, Android'],
      ['Languages', 'Korean, English'],
      ['Price', 'Free to download'],
      ['Age', '14 and over'],
      ['Release', 'In development. The date is set after testing'],
      ['Made by', 'One independent developer'],
      ['Contact', CONTACT],
    ],
    privacyNow: [
      'This site uses no cookies and no analytics tools.',
      'The only personal information we receive now is test sign-up email. It is deleted 30 days after the official launch.',
    ],
    privacyPlan: [
      'The word you write each day is being built to be read on your device.',
      'Usage statistics are being built to be off by default and sent only if you pass the age check and turn them on yourself.',
      'Share links and cloud backup are being built to exist only if you turn them on, and to be deletable in the app.',
    ],
    not: ['Loot boxes', 'Ads that cover the screen', 'Energy limits', 'Selling what you raised (strokes, ink, grain)', 'A feed of strangers’ drawings', 'Generative AI making pictures or text in the app'],
    faq: [
      ['What is Mongmangi?', 'A mobile game about raising a drop of ink on paper for twenty-eight nights. Each day you write one word with a brush, Mongmangi drinks the letters and answers with its body, and each morning leaves a dream card.'],
      ['When does it come out?', 'It is in development. The date is set after testing. Right now we are preparing a closed test on Android.'],
      ['Is it free?', 'It is free to download. We do not put in loot boxes or ads that cover the screen.'],
      ['Which devices does it run on?', 'iPhone (iOS) and Android phones. It is available in Korean and English.'],
      ['Does my handwriting go to a server?', 'We are building it so your handwriting is read on your device. The handwriting feature is still being made, so the confirmed details will be in the Privacy Policy at launch.'],
      ['Does AI draw the pictures?', 'No. The app draws Mongmangi’s body and dreams by fixed rules.'],
      ['What age is it for?', 'It is made for people aged 14 and over.'],
      ['Who makes it?', 'One person makes it. Please write to hello@mongmang.ink.'],
    ],
  },
};

/** 화면 문구(사실이 아닌 안내·제목) */
const UI = {
  ko: {
    nav: [['/', '소개'], ['/facts', '사실'], ['/press', '프레스킷'], ['/privacy', '개인정보']],
    other: 'English', skip: '본문으로 건너뛰기', navLabel: '사이트',
    real: '실제 앱 화면',
    winter: '겨울에 만나요', winterBody: '아직 만들고 있어요. 테스트를 마치면 스토어에서 만날 수 있어요.',
    testerH: '테스트에 함께해 주세요',
    tester: ['Android 비공개 테스트에 함께할 분을 찾고 있어요. 14일 동안 앱을 지우지 않고 두면 돼요. 하루 한 번 열어 주면 더 좋아요.', '만 14세 이상이고, Android 폰과 Google Play에 로그인된 Gmail 주소가 있으면 돼요.', '아래 주소로 테스트에 함께하고 싶다고 메일을 보내 주세요. 받은 주소는 테스터 등록과 연락에만 쓰고, 정식 출시 30일 뒤 지워요.'],
    iphone: 'iPhone 테스트는 아직 열지 않았어요.',
    more: '더 보기', delete: '맡겨 둔 것 지우기',
    factsH: '몽망이 키우기에 대한 사실', checked: '마지막 확인', what: '무엇인가요', how: '하루는 이렇게 흘러요', howNote: '28밤이 지나면 그동안 쓴 말로 자란 몽망이가 남아요. 화면에 점수나 수치는 보이지 않아요. 개발 중이라 세부는 테스트로 다듬고 있어요.', basics: '기본 정보', privacyH: '개인정보', privacyNowH: '지금', privacyPlanH: '준비 중인 원칙', privacyMore: '출시 전 개인정보 안내 보기', privacyMoreLaunch: '개인정보처리방침 보기', notH: '하지 않는 것', faqH: '자주 묻는 질문', source: '이 페이지의 사실은 개발 기록에서 옮겼어요. 사실이 바뀌면 이 페이지를 먼저 고쳐요.',
    pressH: '프레스킷', pressLead: '기사와 소개에 필요한 자료를 한곳에 모았어요.', shots: '스크린샷', shotsNote: '모두 실제 앱 화면이에요. 그림을 눌러 원본을 받을 수 있어요.', logoH: '로고와 아이콘', logoBody: '준비 중이에요. 아이콘은 테스트에서 고른 뒤 이곳에 올려요.', videoH: '영상', videoBody: '준비 중이에요.', makerH: '만든 사람', makerBody: '1인 개발이에요.', contactH: '연락처', contactBody: '취재와 자료 요청은 아래 주소로 보내 주세요.',
    toc: '목차',
    download: '원본 받기',
    footer: '몽망이 키우기',
  },
  en: {
    nav: [['/en', 'About'], ['/en/facts', 'Facts'], ['/en/press', 'Press kit'], ['/en/privacy', 'Privacy']],
    other: '한국어', skip: 'Skip to content', navLabel: 'Site',
    real: 'Actual app screen',
    winter: 'See you in winter', winterBody: 'It is still being made. Once testing is done, it will be on the stores.',
    testerH: 'Help us test',
    tester: ['We are looking for people to join a closed test on Android. Keep the app installed for 14 days. Opening it once a day helps even more.', 'You need to be 14 or over, with an Android phone and a Gmail address signed in to Google Play.', 'Email the address below to say you would like to join. We use your address only to register you as a tester and to contact you, and delete it 30 days after the official launch.'],
    iphone: 'Testing on iPhone has not opened yet.',
    more: 'More', delete: 'Delete what you stored',
    factsH: 'Facts about Mongmangi', checked: 'Last checked', what: 'What it is', how: 'How a day goes', howNote: 'After 28 nights, a Mongmangi grown from the words you wrote remains. No scores or numbers appear on screen. It is still in development, so the details are being refined through testing.', basics: 'Basics', privacyH: 'Privacy', privacyNowH: 'Now', privacyPlanH: 'Principles we are building to', privacyMore: 'Read the pre-launch privacy notice', privacyMoreLaunch: 'Read the Privacy Policy', notH: 'What it does not have', faqH: 'Frequently asked questions', source: 'The facts on this page come from our development records. When a fact changes, this page is updated first.',
    pressH: 'Press kit', pressLead: 'Materials for articles and features, in one place.', shots: 'Screenshots', shotsNote: 'All are actual app screens. Select an image to download the original.', logoH: 'Logo and icon', logoBody: 'In preparation. The icon will be posted here after it is chosen in testing.', videoH: 'Video', videoBody: 'In preparation.', makerH: 'Who makes it', makerBody: 'One independent developer.', contactH: 'Contact', contactBody: 'Send interview and material requests to the address below.',
    toc: 'Contents',
    download: 'Download original',
    footer: 'Mongmangi',
  },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `
:root { color-scheme: light; --paper: #EFE8DA; --card: #F6F1E6; --ink: #1B1A18; --soft: #5E584F; --line: #CFC6B4; --seal: #B5432F; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
html, body { margin: 0; background: var(--paper); color: var(--ink); }
body { font: 1.0625rem/1.75 "Nanum Myeongjo", "Noto Serif KR", "Noto Serif CJK KR", "Source Han Serif K", "AppleMyungjo", "Batang", "Iowan Old Style", Georgia, serif; overflow-wrap: break-word; word-break: keep-all; }
.skip { position: absolute; left: -9999px; }
.skip:focus { left: 1rem; top: 1rem; background: var(--ink); color: var(--paper); padding: .5rem .75rem; z-index: 1; }
header, main, footer { max-width: 40rem; margin: 0 auto; padding: 0 1rem; }
header { padding-top: 1.25rem; display: flex; flex-wrap: wrap; gap: .25rem 1rem; align-items: baseline; justify-content: space-between; }
header .home { font-weight: 700; text-decoration: none; }
nav ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: .25rem 1rem; font-size: .9375rem; }
a { color: var(--ink); text-underline-offset: .2em; }
a:focus-visible { outline: 3px solid #8a6d3b; outline-offset: 2px; }
a[aria-current="page"] { text-decoration-thickness: 2px; }
main { padding-top: 2rem; padding-bottom: 3rem; }
h1 { font-size: 1.75rem; line-height: 1.35; margin: 0 0 .75rem; font-weight: 700; letter-spacing: -0.01em; }
h2 { font-size: 1.25rem; line-height: 1.4; margin: 2.5rem 0 .75rem; font-weight: 700; }
h3 { font-size: 1.0625rem; margin: 1.75rem 0 .5rem; }
p, li, dd, td { color: var(--soft); }
strong { color: var(--ink); }
.tagline { font-size: 1.375rem; line-height: 1.5; color: var(--ink); margin: 0 0 1rem; }
figure { margin: 1.5rem 0; }
figure img { display: block; width: 100%; height: auto; background: var(--card); border-radius: .25rem; }
figcaption { font-size: .875rem; margin-top: .5rem; color: var(--soft); }
.mail { font-size: 1.125rem; color: var(--ink); background: var(--card); border: 1px solid var(--line); border-radius: .5rem; padding: .75rem 1rem; display: inline-block; user-select: all; -webkit-user-select: all; letter-spacing: .02em; max-width: 100%; overflow-wrap: anywhere; }
.note { font-size: .9375rem; }
dl { display: grid; grid-template-columns: minmax(6rem, auto) minmax(0, 1fr); gap: .5rem 1rem; margin: 0; }
dt { color: var(--ink); font-weight: 700; }
dd { margin: 0; overflow-wrap: anywhere; }
@media (max-width: 26rem) { dl { grid-template-columns: minmax(0, 1fr); gap: 0 } dd { margin-bottom: .75rem } }
.box { border: 1px dashed var(--line); border-radius: .5rem; padding: 1rem; background: var(--card); }
.shots { display: grid; gap: 1.5rem; }
.table { overflow-x: auto; margin: 1rem 0; }
table { border-collapse: collapse; width: 100%; font-size: .9375rem; }
th, td { border-top: 1px solid var(--line); padding: .5rem .5rem .5rem 0; text-align: left; vertical-align: top; }
th { color: var(--ink); }
code { font-family: ui-monospace, Menlo, monospace; font-size: .875em; overflow-wrap: anywhere; }
blockquote { margin: 1rem 0; padding: 0 0 0 1rem; border-left: 3px solid var(--line); }
footer { padding-bottom: 2.5rem; border-top: 1px solid var(--line); padding-top: 1.25rem; font-size: .9375rem; color: var(--soft); }
footer ul { list-style: none; padding: 0; margin: .5rem 0 0; display: flex; flex-wrap: wrap; gap: .25rem 1rem; }
`;

const CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

/** 같은 사실로 만드는 JSON-LD(개인정보 없음 — 사람 이름·주소·전화 없음, 연락은 도메인 메일 하나) */
export function jsonLd(kind, lang, origin) {
  const f = FACTS[lang];
  const org = { '@type': 'Organization', '@id': `${origin}/#org`, name: FACTS.ko.name, alternateName: FACTS.en.name, url: `${origin}/`, email: CONTACT };
  // 언어마다 다른 노드(@id) — 한 노드에 두 언어 설명이 겹치지 않게(리뷰 L6). Organization은 두 언어가 같은 값이라 하나
  const home = `${origin}${lang === 'ko' ? '/' : '/en'}`;
  const app = {
    '@type': 'SoftwareApplication',
    '@id': `${home}#app`,
    name: FACTS.ko.name,
    alternateName: FACTS.en.name,
    description: f.summary,
    applicationCategory: 'GameApplication',
    operatingSystem: 'iOS, Android',
    inLanguage: lang,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
    typicalAgeRange: '14-',
    image: `${origin}${imgSrc('face', lang)}`,
    screenshot: ['face', 'ire'].map((k) => `${origin}${imgSrc(k, lang)}`),
    publisher: { '@id': `${origin}/#org` },
    url: home,
  };
  const graph = [org, app];
  if (kind === 'home') graph.unshift({ '@type': 'WebSite', '@id': `${home}#site`, name: f.name, url: home, inLanguage: lang, publisher: { '@id': `${origin}/#org` } });
  if (kind === 'facts') {
    graph.push({
      '@type': 'FAQPage',
      inLanguage: lang,
      url: `${origin}${lang === 'ko' ? '/facts' : '/en/facts'}`,
      dateModified: FACTS_CHECKED,
      mainEntity: f.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    });
  }
  // `</`가 데이터 블록을 닫지 못하게
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

function layout({ page, title, description, body, ld, origin }) {
  const u = UI[page.lang];
  const pair = PAGES.find((p) => p.path === page.pair);
  const ko = page.lang === 'ko' ? page : pair;
  const en = page.lang === 'en' ? page : pair;
  const navHtml = u.nav.map(([href, label]) => `<li><a href="${href}"${href === page.path ? ' aria-current="page"' : ''}>${esc(label)}</a></li>`).join('');
  const otherLang = page.lang === 'ko' ? 'en' : 'ko';
  return `<!doctype html>
<!-- 생성 파일(scripts/site.mjs). 직접 고치지 말 것. 스크립트 0, 외부 자원 0 -->
<html lang="${page.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="no-referrer">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${page.index ? 'index, follow, max-image-preview:large' : 'noindex'}">
<link rel="canonical" href="${origin}${page.path}">
<link rel="alternate" hreflang="ko" href="${origin}${ko.path}">
<link rel="alternate" hreflang="en" href="${origin}${en.path}">
<link rel="alternate" hreflang="x-default" href="${origin}${ko.path}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(FACTS[page.lang].name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${origin}${page.path}">
<meta property="og:locale" content="${page.lang === 'ko' ? 'ko_KR' : 'en_US'}">
<meta property="og:image" content="${origin}${imgSrc('face', page.lang)}">
<meta property="og:image:alt" content="${esc(IMAGES.face[page.lang])}">
<meta name="twitter:card" content="summary_large_image">
${ld ? `<script type="application/ld+json">${ld}</script>\n` : ''}<style>${CSS}</style>
</head>
<body>
<a class="skip" href="#main">${esc(u.skip)}</a>
<header>
  <a class="home" href="${page.lang === 'ko' ? '/' : '/en'}">${esc(FACTS[page.lang].name)}</a>
  <nav aria-label="${esc(u.navLabel)}"><ul>${navHtml}<li><a href="${pair.path}" hreflang="${otherLang}" lang="${otherLang}">${esc(u.other)}</a></li></ul></nav>
</header>
<main id="main">
${body}
</main>
<footer>
  <p>${esc(u.footer)} · <span class="mailtext">${CONTACT}</span></p>
  <ul>${u.nav.slice(1).map(([href, label]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('')}<li><a href="/delete">${esc(u.delete)}</a></li></ul>
</footer>
</body>
</html>
`;
}

const fig = (key, lang, { caption = true, eager = false, link = false } = {}) => {
  const img = `<img src="${imgSrc(key, lang)}" width="${IMAGES[key].w}" height="${IMAGES[key].h}" alt="${esc(IMAGES[key][lang])}"${eager ? '' : ' loading="lazy"'} decoding="async">`;
  return `<figure>${link ? `<a href="${imgSrc(key, lang)}" download>${img}</a>` : img}${caption ? `<figcaption>${esc(UI[lang].real)}${link ? ` · <a href="${imgSrc(key, lang)}" download>${esc(UI[lang].download)}</a>` : ''}</figcaption>` : ''}</figure>`;
};
const factsDl = (lang) => `<dl>${FACTS[lang].rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v === CONTACT ? `<span class="mailtext">${v}</span>` : esc(v)}</dd>`).join('')}</dl>`;
const p = (path, lang) => (lang === 'ko' ? path : `/en${path === '/' ? '' : path}`);

function home(lang) {
  const f = FACTS[lang];
  const u = UI[lang];
  return `<h1>${esc(f.name)}</h1>
<p class="tagline">${esc(f.tagline)}</p>
<p>${esc(f.summary)}</p>
${fig('face', lang, { eager: true })}
${fig('ire', lang)}
<section aria-labelledby="winter"><h2 id="winter">${esc(u.winter)}</h2><p>${esc(u.winterBody)}</p></section>
<section aria-labelledby="tester"><h2 id="tester">${esc(u.testerH)}</h2>
${u.tester.map((t) => `<p>${esc(t)}</p>`).join('\n')}
<p class="mail">${CONTACT}</p>
<p class="note">${esc(u.iphone)}</p></section>
<section aria-labelledby="more"><h2 id="more">${esc(u.more)}</h2>
<ul><li><a href="${p('/facts', lang)}">${esc(u.factsH)}</a></li><li><a href="${p('/press', lang)}">${esc(u.pressH)}</a></li><li><a href="${p('/privacy', lang)}">${esc(u.nav[3][1])}</a></li><li><a href="/delete">${esc(u.delete)}</a></li></ul></section>`;
}

function facts(lang, mode) {
  const f = FACTS[lang];
  const u = UI[lang];
  return `<h1>${esc(u.factsH)}</h1>
<p class="note">${esc(u.checked)}: <time datetime="${FACTS_CHECKED}">${FACTS_CHECKED}</time></p>
<section aria-labelledby="what"><h2 id="what">${esc(u.what)}</h2><p class="tagline">${esc(f.tagline)}</p><p>${esc(f.summary)}</p></section>
<section aria-labelledby="how"><h2 id="how">${esc(u.how)}</h2><ol>${f.day.map((d) => `<li>${esc(d)}</li>`).join('')}</ol><p>${esc(u.howNote)}</p></section>
<section aria-labelledby="basics"><h2 id="basics">${esc(u.basics)}</h2>${factsDl(lang)}</section>
<section aria-labelledby="privacy"><h2 id="privacy">${esc(u.privacyH)}</h2>
<h3>${esc(u.privacyNowH)}</h3><ul>${f.privacyNow.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
<h3>${esc(u.privacyPlanH)}</h3><ul>${f.privacyPlan.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
<p><a href="${p('/privacy', lang)}">${esc(mode === 'launch' ? u.privacyMoreLaunch : u.privacyMore)}</a></p></section>
<section aria-labelledby="not"><h2 id="not">${esc(u.notH)}</h2><ul>${f.not.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></section>
<section aria-labelledby="faq"><h2 id="faq">${esc(u.faqH)}</h2>${f.faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('\n')}</section>
<p class="note">${esc(u.source)}</p>`;
}

function press(lang) {
  const f = FACTS[lang];
  const u = UI[lang];
  return `<h1>${esc(u.pressH)}</h1>
<p>${esc(u.pressLead)}</p>
<p class="tagline">${esc(f.tagline)}</p>
<p>${esc(f.summary)}</p>
<section aria-labelledby="basics"><h2 id="basics">${esc(u.basics)}</h2>${factsDl(lang)}<p><a href="${p('/facts', lang)}">${esc(u.factsH)}</a></p></section>
<section aria-labelledby="shots"><h2 id="shots">${esc(u.shots)}</h2><p class="note">${esc(u.shotsNote)}</p>
<div class="shots">${['face', 'ire'].map((k) => fig(k, lang, { link: true })).join('')}</div></section>
<section aria-labelledby="logo"><h2 id="logo">${esc(u.logoH)}</h2><p class="box">${esc(u.logoBody)}</p></section>
<section aria-labelledby="video"><h2 id="video">${esc(u.videoH)}</h2><p class="box">${esc(u.videoBody)}</p></section>
<section aria-labelledby="maker"><h2 id="maker">${esc(u.makerH)}</h2><p>${esc(u.makerBody)}</p></section>
<section aria-labelledby="contact"><h2 id="contact">${esc(u.contactH)}</h2><p>${esc(u.contactBody)}</p><p class="mail">${CONTACT}</p></section>`;
}

/**
 * 출시 전 개인정보 안내(PM 11-25 웹 리뷰 결정). 지금 실제로 받는 것 = 테스터 신청 메일뿐.
 * 사실 출처: DECISIONS 'PM 11-25 마케팅 P0'(출시 30일 뒤 삭제), V22 ④(Cloudflare 라우팅 → 운영자 Gmail, 서버 저장 없음), tester-recruit(Play 테스터 목록)
 */
export const NOTICE = {
  ko: {
    title: '출시 전 개인정보 안내',
    lead: '몽망이 키우기는 아직 출시 전이에요. 지금 이 사이트와 테스트 신청에서 다루는 개인정보를 적었어요.',
    sections: [
      ['지금 받는 것', ['Android 비공개 테스트 신청 메일뿐이에요. 보내 주신 메일 주소와 메일 내용을 받아요.']],
      ['쓰는 곳', ['Google Play 비공개 테스트의 테스터 목록에 메일 주소를 등록하고, 테스트 안내를 보내는 데만 써요.']],
      ['받는 길', [`${CONTACT}로 보낸 메일은 운영자의 Gmail로 전달돼요. 우리 서버에는 저장하지 않아요.`]],
      ['지우는 때', ['정식 출시 30일 뒤에 받은 메일과 테스터 목록의 주소를 지워요. 그 전에 지워 달라고 하시면 바로 지워요.']],
      ['이 사이트', ['쿠키, 분석 도구, 광고 추적을 쓰지 않아요. 페이지에는 실행되는 스크립트가 없어요.']],
      ['문의', [`${CONTACT}`]],
      ['앞으로', ['앱을 출시할 때 앱 전체의 개인정보처리방침을 이 주소에 올려요.']],
    ],
  },
  en: {
    title: 'Pre-launch privacy notice',
    lead: 'Mongmangi has not launched yet. This notice covers the personal information this site and the test sign-up handle right now.',
    sections: [
      ['What we receive now', ['Only email asking to join the closed test on Android. We receive your email address and what you write.']],
      ['What it is used for', ['Only to add your address to the tester list of the Google Play closed test and to send you test information.']],
      ['How it reaches us', [`Email sent to ${CONTACT} is forwarded to the operator’s Gmail. It is not stored on our servers.`]],
      ['When it is deleted', ['30 days after the official launch, we delete the email we received and your address in the tester list. If you ask earlier, we delete it right away.']],
      ['This site', ['It uses no cookies, analytics tools or ad tracking. The pages run no scripts.']],
      ['Contact', [`${CONTACT}`]],
      ['Next', ['When the app launches, the full Privacy Policy for the app will be posted at this address.']],
    ],
  },
};

function notice(lang) {
  const n = NOTICE[lang];
  return {
    title: n.title,
    body: `<h1>${esc(n.title)}</h1>
<p>${esc(n.lead)}</p>
${n.sections.map(([h, ps], i) => `<section aria-labelledby="n-${i + 1}"><h2 id="n-${i + 1}">${esc(h)}</h2>${ps.map((t) => (t === CONTACT ? `<p class="mail">${t}</p>` : `<p>${esc(t)}</p>`)).join('')}</section>`).join('\n')}`,
  };
}

/** 출시 모드: 처리방침 정본 전체(체크리스트 상자 제외). 내부 메모 검사는 build.mjs ⑦이 렌더 HTML에서 */
function privacy(lang, md) {
  // 정본의 H1은 맨 위에 따로 두고(제목 → 안내 → 목차 → 본문 순서), 목차는 H2만
  const src = stripInternal(md);
  const h1 = /^#\s+(.*)$/m.exec(src)?.[1] ?? '';
  const { html, headings } = markdownToHtml(src.replace(/^#\s+.*$/m, ''));
  const u = UI[lang];
  const toc = headings.filter((h) => h.level === 2);
  return {
    title: h1,
    body: `<h1>${esc(h1)}</h1>
<nav aria-label="${esc(u.toc)}"><h2>${esc(u.toc)}</h2><ol class="toc">${toc.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ol></nav>
<article>
${html}
</article>`,
  };
}

/**
 * 생성 페이지 전부. @returns {Record<string,string>} public/ 상대 경로 → 내용
 * @param {{ origin: string, privacyMd: { ko: string, en: string }, mode?: 'prelaunch'|'launch' }} o
 */
export function renderSite({ origin, privacyMd, mode = 'prelaunch' }) {
  if (!MODES.includes(mode)) throw new Error(`SITE_MODE는 ${MODES.join('·')} 중 하나`);
  const out = {};
  for (const page of PAGES.filter((pg) => !pg.handwritten)) {
    const lang = page.lang;
    const f = FACTS[lang];
    const u = UI[lang];
    let title;
    let description;
    let body;
    let ld = null;
    if (page.path.endsWith('/facts')) {
      title = `${u.factsH} · ${f.name}`;
      description = f.summary;
      body = facts(lang, mode);
      ld = jsonLd('facts', lang, origin);
    } else if (page.path.endsWith('/press')) {
      title = `${u.pressH} · ${f.name}`;
      description = `${f.tagline} ${u.pressLead}`;
      body = press(lang);
      ld = jsonLd('press', lang, origin);
    } else if (page.path.endsWith('/privacy')) {
      const r = mode === 'launch' ? privacy(lang, privacyMd[lang]) : notice(lang);
      title = `${r.title} · ${f.name}`;
      description = mode === 'launch' ? r.title : NOTICE[lang].lead;
      body = r.body;
    } else {
      title = `${f.name} · ${f.tagline}`;
      description = f.summary;
      body = home(lang);
      ld = jsonLd('home', lang, origin);
    }
    out[page.file] = layout({ page, title, description, body, ld, origin });
  }
  out['sitemap.xml'] = sitemap(origin);
  out['llms.txt'] = llms(origin, mode);
  return out;
}

export function sitemap(origin) {
  const urls = PAGES.filter((pg) => pg.index)
    .map((pg) => {
      const pair = PAGES.find((q) => q.path === pg.pair);
      const alt = pair
        ? [pg, pair].map((q) => `\n    <xhtml:link rel="alternate" hreflang="${q.lang}" href="${origin}${q.path}"/>`).join('')
        : '';
      return `  <url>\n    <loc>${origin}${pg.path}</loc>\n    <lastmod>${FACTS_CHECKED}</lastmod>${alt}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

/**
 * llms.txt(llmstxt.org 형식): H1 · `>` 요약 · 제목 없는 본문(사실 목록) · H2마다 링크 목록만(리뷰 L6)
 */
export function llms(origin, mode = 'prelaunch') {
  const ko = FACTS.ko;
  const en = FACTS.en;
  const list = (rows) => rows.map(([k, v]) => `- ${k}: ${v}`).join('\n');
  const pv = mode === 'launch' ? ['Privacy Policy', '개인정보처리방침'] : [NOTICE.en.title, NOTICE.ko.title];
  return `# ${ko.name} (${en.name})

> ${en.summary} Korean title: ${ko.name}. ${en.tagline}

${ko.summary}

Facts in English:

${list(en.rows)}
- Not in the app: ${en.not.join('; ')}
- Last checked: ${FACTS_CHECKED}

한국어 사실:

${list(ko.rows)}
- 하지 않는 것: ${ko.not.join(', ')}
- 마지막 확인: ${FACTS_CHECKED}

## Pages

- [Facts](${origin}/en/facts): what it is, how a day goes, basics, privacy, FAQ
- [사실](${origin}/facts): 한국어 사실 페이지와 자주 묻는 질문
- [Press kit](${origin}/en/press): one-line description, facts, actual screenshots, contact
- [프레스킷](${origin}/press): 한국어 프레스킷
- [${pv[0]}](${origin}/en/privacy): ${mode === 'launch' ? 'privacy policy for the app' : 'what is handled before launch'}
- [${pv[1]}](${origin}/privacy): ${mode === 'launch' ? '앱 개인정보처리방침' : '출시 전에 다루는 개인정보'}
- [Delete your data](${origin}/delete): how to delete what you stored on the server

## Optional

- [Home](${origin}/en): pre-launch page and closed test information
- [첫 화면](${origin}/): 출시 전 안내와 테스트 신청 방법
`;
}

export const readPrivacy = (docsDir) => ({
  ko: readFileSync(`${docsDir}/privacy-policy.ko.md`, 'utf8'),
  en: readFileSync(`${docsDir}/privacy-policy.en.md`, 'utf8'),
});
