// i18n v1 레이아웃 캡처(웹, D-17): 영어·한국어 × 폭 320·390 × 글자 100·200%.
// 화면: 인트로(만져 볼래요?) · 낮 홈 · 목록 보기 · 버튼으로 긋기 패널 · 밤 · 아침 카드 · 공방 노트(언어 고르기까지 스크롤) · 카드 미리보기.
// 세이브는 앱 흐름 v1 스냅숏(docs/app/flow-v1/.snapshots.json)을 주입한다. 언어는 메타 lang으로 고정(기기 감지 경로는 ?lang=로 따로 1장).
// 사용: node scripts/i18n-capture.mjs [baseUrl] → docs/app/i18n-v1/*.png, i18n-log.json
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:8097';
const OUT = path.resolve('docs/app/i18n-v1');
const snapshots = JSON.parse(await readFile(path.resolve('docs/app/flow-v1/.snapshots.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await mkdir(OUT, { recursive: true });
const HEIGHT_OF = { 320: 568, 390: 844 };
const LANGS = (process.env.LANGS ?? 'en,ko').split(',');
const WIDTHS = (process.env.WIDTHS ?? '320,390').split(',').map(Number);
const SCALES = (process.env.SCALES ?? '1,2').split(',').map(Number);

const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const errors = [];
const log = [];

function withMeta(ls, patch) {
  const meta = JSON.parse(ls['mong.meta'] ?? '{"v":1}');
  return { ...ls, 'mong.meta': JSON.stringify({ ...meta, firstNightShown: true, notifAsked: true, ...patch }) };
}

async function capture({ name, ls, query = '', action, w, h, fs }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  if (ls)
    await ctx.addInitScript((data) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
    }, ls);
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${name}: ${String(e)}`));
  await page.goto(`${BASE}/?fs=${fs}${query}`, { waitUntil: 'networkidle' });
  await page.waitForSelector(query.includes('export=1') ? 'img' : 'canvas', { timeout: 90000 });
  await sleep(3600);
  const tid = (id) => page.locator(`[data-testid="${id}"]`).first();
  if (action === 'assist') {
    await tid('obj-brush').click();
    await sleep(900);
    await tid('assist-open').click();
    await sleep(700);
  }
  if (action === 'card') {
    await tid('develop').click();
    await sleep(5200);
  }
  if (action === 'note' || action === 'noteLang') {
    await tid('seal').click();
    await sleep(1000);
    if (action === 'noteLang') {
      await tid('lang-system').scrollIntoViewIfNeeded();
      await sleep(300);
    }
  }
  if (action === 'intro') await sleep(3000);
  // 글이 상자를 넘치는지(가로 스크롤·잘림) 대략 검사: 화면 폭을 넘는 글 요소
  const overflow = await page.evaluate((vw) => {
    const bad = [];
    for (const el of document.querySelectorAll('div[dir="auto"], span')) {
      const r = el.getBoundingClientRect();
      const txt = el.textContent?.trim();
      if (!txt || r.width === 0) continue;
      if (r.right > vw + 1 || r.left < -1) bad.push(`${txt.slice(0, 40)} [${Math.round(r.left)},${Math.round(r.right)}]`);
    }
    return bad;
  }, w);
  const aria = await page.evaluate(() => [...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')).filter(Boolean));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  log.push({ name, overflow, aria });
  if (overflow.length) console.log('OVERFLOW', name, overflow);
  await ctx.close();
}

for (const lang of process.env.ONLY_EXPORT ? [] : LANGS)
  for (const w of WIDTHS)
    for (const fs of SCALES) {
      const h = HEIGHT_OF[w];
      const tag = `${lang}-w${w}-fs${Math.round(fs * 100)}`;
      const meta = { lang };
      const shots = [
        ['day', withMeta(snapshots.day2, meta)],
        ['list', withMeta(snapshots.day2, { ...meta, listView: true })],
        ['assist', withMeta(snapshots.day2, { ...meta, assistStroke: true }), 'assist'],
        ['night', withMeta(snapshots.night, { ...meta, firstNightShown: false })],
        ['morning', withMeta(snapshots.morning, meta)],
        ['card', withMeta(snapshots.morning, meta), 'card'],
        ['note', withMeta(snapshots.day2, meta), 'note'],
        ['note-lang', withMeta(snapshots.day2, meta), 'noteLang'],
      ];
      for (const [scr, ls, action] of shots) await capture({ name: `${tag}-${scr}`, ls, action, w, h, fs });
      console.log('done', tag);
    }

// 기기 언어 감지 경로(메타 기본 = 기기 따름): 새 설치 인트로를 ?lang=en/ko로
if (!process.env.ONLY_EXPORT) for (const lang of LANGS) await capture({ name: `${lang}-w390-intro-device`, ls: { 'mong.meta': '{"v":1}' }, query: `&lang=${lang}`, action: 'intro', w: 390, h: 844, fs: 1 });
// 인화 카드 미리보기(9:16 공유 비율, 영어 가로 이름)
if (!process.env.ONLY_EXPORT) for (const lang of LANGS) await capture({ name: `${lang}-card-916`, ls: null, query: `&screen=card&aspect=916&night=3&lang=${lang}`, w: 390, h: 844, fs: 1 });
// 공유 이미지 함수(renderDreamCardImage) 결과 PNG — 긴 영어 문장(두 줄) 배치 확인
for (const lang of LANGS) await capture({ name: `${lang}-card-export`, ls: null, query: `&screen=card&night=2&motif=far-with.sea-hand&export=1&lang=${lang}`, w: 390, h: 844, fs: 1 });

if (!process.env.ONLY_EXPORT) await writeFile(`${OUT}/i18n-log.json`, JSON.stringify({ base: BASE, errors, log }, null, 2));
console.log('errors', errors.length, errors.slice(0, 8));
console.log('overflow shots', log.filter((l) => l.overflow.length).map((l) => l.name));
await browser.close();
