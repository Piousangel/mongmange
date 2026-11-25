// C12 맡겨 두기 캡처(웹): 확인판 ?screen=cloud&cv=<갈래>를 ko·en × 글자 100%·200%로 찍고, 글자가 화면 밖으로 넘치지 않는지 잰다.
// 이어서 실제 흐름 하나(소개 → 켜기 → 연령 → 글귀 → 틀린 확인 → 맞는 확인 → 켜짐)를 클릭으로 따라간다(가짜 서버).
// 사용: node scripts/c12-capture.mjs <baseUrl> <outDir>   (예: http://localhost:8140 docs/app/c12)
// 세이브: docs/app/flow-v1/.snapshots.json의 day2(이 기기 본) — 백업 본이 '다른 기기 본'이 된다.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:8140';
const OUT = path.resolve(process.argv[3] ?? 'docs/app/c12');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await mkdir(OUT, { recursive: true });
const snapshots = JSON.parse(await readFile(path.resolve('docs/app/flow-v1/.snapshots.json'), 'utf8'));

const VIEWS = ['intro', 'age', 'under', 'code', 'confirm', 'recover', 'choose', 'choose-confirm', 'unreadable', 'on', 'on-attention', 'slow', 'failed', 'delete', 'delete-check', 'already', 'revert', 'choose-has', 'on-parked', 'moved'];
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const errors = [];
const log = [];

async function open(query, { width = 390, height = 844 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  await ctx.addInitScript((data) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
  }, snapshots.day2);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${query}: ${String(e)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${query}: ${m.text()}`);
  });
  await page.goto(`${BASE}/?screen=cloud&${query}`, { waitUntil: 'networkidle', timeout: 300000 });
  await page.waitForSelector('[data-testid="cloud-close"], [data-testid="cloud-handle"]', { timeout: 120000 });
  await sleep(900);
  return { ctx, page };
}

/** 넘침: 문서 가로 스크롤, 화면 밖으로 나간 글자 요소 */
async function overflow(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const bad = [];
    for (const el of document.querySelectorAll('div[dir], div')) {
      if (!el.childElementCount && el.textContent && el.textContent.trim()) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) bad.push(el.textContent.slice(0, 30));
      }
    }
    return { docScroll: document.documentElement.scrollWidth > vw + 1, outside: bad.slice(0, 5) };
  });
}

for (const lang of ['ko', 'en']) {
  for (const fs of [1, 2]) {
    for (const cv of VIEWS) {
      const name = `${lang}-fs${fs * 100}-${cv}`;
      const { ctx, page } = await open(`cv=${cv}&lang=${lang}&fs=${fs}`);
      if (cv === 'slow') await sleep(4600);
      // 긴 시트는 스크롤 끝까지 한 장 더
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
      const ov = await overflow(page);
      const scrolled = await page.evaluate(() => {
        const s = document.querySelector('[data-testid="cloud-scroll"]');
        if (!s || s.scrollHeight <= s.clientHeight + 4) return false;
        s.scrollTop = s.scrollHeight;
        return true;
      });
      if (scrolled) {
        await sleep(300);
        await page.screenshot({ path: path.join(OUT, `${name}-end.png`) });
      }
      log.push({ shot: name, ...ov, scrolled });
      console.log(JSON.stringify(log.at(-1)));
      await ctx.close();
    }
  }
}

// 좁은 폭(320) × 200%: 나란히 고르기가 위아래로 쌓이는지, 머리 줄 제목·닫기 사이, 입력 칸 자리표시
for (const lang of ['ko', 'en']) {
  for (const cv of ['choose', 'recover', 'delete']) {
    const { ctx, page } = await open(`cv=${cv}&lang=${lang}&fs=2`, { width: 320, height: 640 });
    await page.screenshot({ path: path.join(OUT, `${lang}-w320-fs200-${cv}.png`) });
    const head = await page.evaluate(() => {
      const a = document.querySelector('[data-testid="cloud-title"]')?.getBoundingClientRect();
      const b = document.querySelector('[data-testid="cloud-close"]')?.getBoundingClientRect();
      return a && b ? Math.round(b.left - a.right) : null;
    });
    // 입력 칸 자리표시가 칸 안에 다 들어가는가(자리표시는 scrollWidth에 잡히지 않아 글꼴로 너비를 잰다)
    const inputFits = await page.evaluate(() =>
      [...document.querySelectorAll('input')].every((i) => {
        const cs = getComputedStyle(i);
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `${cs.fontSize} ${cs.fontFamily}`;
        const text = i.value || i.placeholder;
        const w = ctx.measureText(text).width + text.length * (parseFloat(cs.letterSpacing) || 0);
        return w <= i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1;
      }),
    );
    log.push({ shot: `${lang}-w320-fs200-${cv}`, titleCloseGap: head, inputFits, ...(await overflow(page)) });
    console.log(JSON.stringify(log.at(-1)));
    await ctx.close();
  }
}

// ── 실제 흐름(가짜 서버): 켜기 → 연령 → 글귀 → 확인 ──
{
  const { ctx, page } = await open('cv=intro&lang=ko');
  const tid = (id) => page.locator(`[data-testid="${id}"]`).first();
  const steps = [];
  await tid('cloud-enable').click();
  await sleep(300);
  await tid('cloud-year').fill('1995');
  await tid('cloud-month-3').click();
  await tid('cloud-age-next').click();
  await page.waitForSelector('[data-testid="cloud-code"]', { timeout: 20000 });
  const label = await tid('cloud-code').getAttribute('aria-label');
  const code = (await tid('cloud-code').innerText()).replace(/\s+/g, '-');
  steps.push({ codeShown: /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(code), a11yLabelSpelled: /([0-9A-Z] ){3}[0-9A-Z],/.test(label ?? '') });
  // 글귀를 보여 주는 동안 Esc로 닫히지 않는다
  await page.keyboard.press('Escape');
  await sleep(500);
  steps.push({ escapeKeepsCode: (await tid('cloud-code').count()) > 0 });
  await page.screenshot({ path: path.join(OUT, 'flow-1-code.png') });
  await tid('cloud-written').click();
  await tid('cloud-confirm-input').fill('ZZZZ');
  await tid('cloud-confirm').click();
  await sleep(200);
  steps.push({ mismatchShown: (await tid('cloud-mismatch').count()) > 0 });
  await page.screenshot({ path: path.join(OUT, 'flow-2-mismatch.png') });
  await tid('cloud-confirm-input').fill(code.slice(-4).toLowerCase());
  await tid('cloud-confirm').click();
  await page.waitForSelector('[data-testid="cloud-delete"]', { timeout: 20000 });
  steps.push({ onAfterConfirm: true, codeGone: (await page.getByText(code.slice(0, 4)).count()) === 0 });
  await page.screenshot({ path: path.join(OUT, 'flow-3-on.png') });
  // 지우기 두 단계
  await tid('cloud-delete').click();
  await tid('cloud-delete-input').fill('ZZZZ');
  await tid('cloud-delete-yes').click();
  await sleep(200);
  steps.push({ deleteMismatchShown: (await tid('cloud-delete-mismatch').count()) > 0 });
  const token = (await tid('cloud-delete-token').innerText()).trim().slice(-4);
  await tid('cloud-delete-input').fill(token.toLowerCase());
  await tid('cloud-delete-yes').click();
  await page.waitForSelector('[data-testid="cloud-done"]', { timeout: 20000 });
  steps.push({ deleted: true });
  await page.screenshot({ path: path.join(OUT, 'flow-4-deleted.png') });
  log.push({ flow: steps });
  console.log(JSON.stringify({ flow: steps }));
  await ctx.close();
}

// ── 나란히 고르기 흐름: 서버 본 고름 → 확인 → 켜짐 ──
{
  const { ctx, page } = await open('cv=choose&lang=ko');
  const tid = (id) => page.locator(`[data-testid="${id}"]`).first();
  const disabledBefore = await tid('cloud-choose-next').getAttribute('aria-disabled');
  await tid('cloud-side-server').click();
  await tid('cloud-choose-next').click();
  await sleep(200);
  const confirmShown = (await tid('cloud-choose-confirm').count()) > 0;
  await tid('cloud-choose-yes').click();
  await page.waitForSelector('[data-testid="cloud-sync"]', { timeout: 20000 });
  log.push({ chooseFlow: { nextDisabledBeforePick: disabledBefore === 'true', confirmShown, onAfter: true } });
  console.log(JSON.stringify(log.at(-1)));
  await page.screenshot({ path: path.join(OUT, 'flow-5-chose-server.png') });
  await ctx.close();
}

await browser.close();
await writeFile(path.join(OUT, 'capture-log.json'), JSON.stringify({ base: BASE, log, errors }, null, 2));
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
