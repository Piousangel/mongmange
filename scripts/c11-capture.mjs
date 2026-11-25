// C11 통계·링크 시트 캡처(웹): 확인판 ?screen=net&nv=<갈래>를 ko·en × 글자 100%·200%로 찍고, 글자가 화면 밖으로 넘치지 않는지 잰다.
// 이어서 실제 흐름 둘을 클릭으로 따라간다: ① 통계 — 연령 확인 → 토글 꺼짐(기본) → 켬 → 끔 ② 링크 — 알리기 → 사유 → 보내기 → 고마워요.
// 사용: node scripts/c11-capture.mjs <baseUrl> <outDir>   (예: http://localhost:8150 docs/app/c11)
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:8150';
const OUT = path.resolve(process.argv[3] ?? 'docs/app/c11');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await mkdir(OUT, { recursive: true });

const VIEWS = ['metrics-age', 'metrics-under', 'metrics-off', 'metrics-on', 'link-loading', 'link-live', 'link-live-anon', 'link-gone', 'link-failed', 'link-report', 'link-report-failed', 'link-reported'];
const browser = await chromium.launch({ headless: true });
const errors = [];
const log = [];

async function open(query, { width = 390, height = 844 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => localStorage.clear());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${query}: ${String(e)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${query}: ${m.text()}`);
  });
  await page.goto(`${BASE}/?screen=net&${query}`, { waitUntil: 'networkidle', timeout: 300000 });
  await page.waitForSelector('[data-testid="net-board"]', { timeout: 120000 });
  await sleep(900);
  return { ctx, page };
}

async function overflow(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const bad = [];
    for (const el of document.querySelectorAll('div')) {
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
    for (const nv of VIEWS) {
      const name = `${lang}-fs${fs * 100}-${nv}`;
      const { ctx, page } = await open(`nv=${nv}&lang=${lang}&fs=${fs}`);
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
      log.push({ shot: name, ...(await overflow(page)) });
      console.log(JSON.stringify(log.at(-1)));
      await ctx.close();
    }
  }
}

// 좁은 폭(320) × 200%
for (const lang of ['ko', 'en']) {
  for (const nv of ['metrics-age', 'link-live', 'link-report']) {
    const { ctx, page } = await open(`nv=${nv}&lang=${lang}&fs=2`, { width: 320, height: 640 });
    await page.screenshot({ path: path.join(OUT, `${lang}-w320-fs200-${nv}.png`) });
    log.push({ shot: `${lang}-w320-fs200-${nv}`, ...(await overflow(page)) });
    console.log(JSON.stringify(log.at(-1)));
    await ctx.close();
  }
}

const tid = (page, id) => page.locator(`[data-testid="${id}"]`).first();

// ── 흐름 ①: 통계 — 연령 확인 → 기본 꺼짐 → 켬 → 끔 ──
{
  const { ctx, page } = await open('nv=metrics-age&lang=ko');
  const steps = {};
  steps.toggleHiddenBeforeAge = (await tid(page, 'metrics-toggle-row').count()) === 0;
  await tid(page, 'cloud-year').fill('1995');
  await tid(page, 'cloud-month-3').click();
  await tid(page, 'cloud-age-next').click();
  await page.waitForSelector('[data-testid="metrics-toggle-row"]', { timeout: 20000 });
  const sw = page.locator('[data-testid="metrics-toggle-row"] [role="switch"]').first();
  // RN-web은 switch의 checked를 aria로 내지 않는다 → 토글 바탕색으로 판정(꺼짐 = 한지 bgShade, 켜짐 = 먹색)
  const isOn = () => sw.evaluate((el) => getComputedStyle(el.firstElementChild).backgroundColor !== 'rgb(227, 218, 202)');
  steps.defaultOff = !(await isOn());
  await page.screenshot({ path: path.join(OUT, 'flow-metrics-1-off.png') });
  await sw.click();
  await sleep(400);
  steps.turnedOn = await isOn();
  await page.screenshot({ path: path.join(OUT, 'flow-metrics-2-on.png') });
  await sw.click();
  await sleep(400);
  steps.turnedOff = !(await isOn());
  log.push({ flow: 'metrics', ...steps });
  console.log(JSON.stringify(log.at(-1)));
  await ctx.close();
}
// 미달(2020년생) → 켤 수 없음
{
  const { ctx, page } = await open('nv=metrics-age&lang=ko');
  await tid(page, 'cloud-year').fill('2020');
  await tid(page, 'cloud-month-3').click();
  await tid(page, 'cloud-age-next').click();
  await page.waitForSelector('[data-testid="metrics-under"]', { timeout: 20000 });
  log.push({ flow: 'metrics-under', toggleHidden: (await tid(page, 'metrics-toggle-row').count()) === 0 });
  console.log(JSON.stringify(log.at(-1)));
  await page.screenshot({ path: path.join(OUT, 'flow-metrics-under.png') });
  await ctx.close();
}

// ── 흐름 ②: 링크 — 알리기 → 사유 → 보내기 → 고마워요 ──
{
  const { ctx, page } = await open('nv=link-live&lang=ko');
  const steps = {};
  await tid(page, 'link-report').click();
  await sleep(200);
  steps.sendDisabledBeforePick = (await tid(page, 'link-report-send').getAttribute('aria-disabled')) === 'true';
  await tid(page, 'link-reason-hate').click();
  await tid(page, 'link-report-send').click();
  await page.waitForSelector('[data-testid="link-reported"]', { timeout: 20000 });
  steps.thanked = true;
  await page.screenshot({ path: path.join(OUT, 'flow-link-reported.png') });
  log.push({ flow: 'link-report', ...steps });
  console.log(JSON.stringify(log.at(-1)));
  await ctx.close();
}

await browser.close();
await writeFile(path.join(OUT, 'capture-log.json'), JSON.stringify({ log, errors }, null, 2));
console.log(errors.length ? `오류 ${errors.length}건\n${errors.join('\n')}` : '오류 0');
