// 앱 흐름 v1.2 캡처(웹): 아침 인화 카드(건져 올리기 → 카드), 대체 획 입력(?sr=1 = 스크린리더 흉내), 앨범·다시 보기,
// 인트로 첫 탭의 접근성 경로, 서툰 손 7일차(오른쪽 위 획). 세이브는 v1.1 캡처의 스냅숏(docs/app/flow-v1/.snapshots.json)에서 시작한다.
// 사용: node scripts/v12-capture.mjs [baseUrl]. 결과: docs/app/flow-v1/v1.2/*.png, log.json
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:8097';
const OUT = path.resolve('docs/app/flow-v1/v1.2');
const VIEW = { width: 390, height: 844 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await mkdir(OUT, { recursive: true });
const snapshots = JSON.parse(await readFile(path.resolve('docs/app/flow-v1/.snapshots.json'), 'utf8'));

const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const errors = [];
const log = [];
const watch = (page, tag) => {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${tag}: ${String(e)}`));
};
const saveInfo = (page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('mong.save.main');
    if (!raw) return null;
    const j = JSON.parse(raw);
    const s = j.sim.state;
    return { phase: s.phase, dayIndex: s.dayIndex, strokes: j.strokes.length, cards: s.cards.length, strokeUsed: s.ledger.strokeUsed, pending: !!s.pendingCard };
  });

// ── 1. 인트로 첫 탭: 스크린리더 경로(접근성 트리 + 키보드 활성화) ──
{
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  watch(page, 'intro');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 300000 });
  await page.waitForSelector('canvas', { timeout: 120000 });
  await sleep(1500);
  const intro = page.locator('[data-testid="intro"]');
  const a11y = await intro.evaluate((e) => ({ role: e.getAttribute('role'), label: e.getAttribute('aria-label'), tabIndex: e.getAttribute('tabindex') }));
  await intro.focus();
  await page.keyboard.press('Enter');
  await sleep(1200);
  const afterEnter = await saveInfo(page);
  log.push({ name: 'intro-a11y', a11y, installedByEnter: !!afterEnter });
  console.log('intro', JSON.stringify(a11y), 'Enter → 설치', !!afterEnter);
  await ctx.close();
}

// ── 2. 하루 세 번: 대체 획 입력 → 재우기 → 아침 카드 (스크린리더 흉내 ?sr=1) ──
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
await ctx.addInitScript((data) => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
}, snapshots.day2);
const page = await ctx.newPage();
watch(page, 'flow');
const tid = (id) => page.locator(`[data-testid="${id}"]`).first();
const shot = async (name, note) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const save = await saveInfo(page);
  log.push({ name, note, save });
  console.log(name, JSON.stringify(save));
};
await page.goto(`${BASE}/?sr=1`, { waitUntil: 'networkidle', timeout: 300000 });
await page.waitForSelector('canvas', { timeout: 120000 });
await sleep(4000);

const CHOICES = [
  // [자리 +n, 방향 +n, 길이 +n, 휨 +n] — 기본(오른쪽·아래로·짧게·오른쪽으로 조금)에서
  [0, 0, 1, 0], // 오른쪽에서 아래로 보통
  [-1, 2, 0, 1], // 오른쪽 위(금지 자리 ①)에서 왼쪽으로 짧게, 크게 휨 → 미끄러짐
  [4, 3, 1, -1], // 왼쪽에서 왼쪽 위로 보통, 곧게
];
for (let day = 0; day < CHOICES.length; day++) {
  await tid('obj-붓').click();
  await sleep(900);
  const [dp, dd, dl, db] = CHOICES[day];
  const step = async (key, n) => {
    for (let i = 0; i < Math.abs(n); i++) await tid(`assist-${key}-${n > 0 ? 'next' : 'prev'}`).click();
  };
  await step('place', dp);
  await step('dir', dd);
  await step('len', dl);
  await step('bend', db);
  await sleep(500);
  if (day === 0) {
    await shot('01-assist-panel', '스크린리더 흉내: 긋기 모드에 들어오면 고르기 패널(자리·방향·길이·휨) + 미리 보기 획');
    const rows = await page.evaluate(() =>
      ['place', 'dir', 'len', 'bend'].map((k) => {
        const e = document.querySelector(`[data-testid="assist-${k}"]`);
        return e ? { k, role: e.getAttribute('role'), label: e.getAttribute('aria-label'), value: e.getAttribute('aria-valuetext') } : null;
      }),
    );
    log.push({ name: 'assist-a11y', rows });
    console.log('assist rows', JSON.stringify(rows));
  }
  if (day === 1) await shot('02-assist-panel-back', '자리 = 위쪽(금지 자리 ①)에서 긋는 고름 — 미리 보기');
  await tid('assist-commit').click();
  await sleep(day === 1 ? 1400 : 2400);
  if (day === 0) await shot('03-assist-attached', '"이 획으로 긋기" → 손획과 같은 stroke 이벤트 → 부착 + 기쁨');
  if (day === 1) await shot('04-slid-lean', '금지 자리에서 시작한 획: 가장 가까운 허용 자리에 붙고 몸이 그쪽으로 9° 기욺');
  await sleep(6500);
  await tid('obj-연적').click();
  await sleep(7500);
  const no = page.locator('[data-testid="notif-no"]');
  if (await no.count()) await no.first().click();
  await sleep(600);
  await tid('dev-toggle').click();
  await sleep(300);
  await tid('dev-morning').click();
  await sleep(300);
  await tid('dev-toggle').click();
  await sleep(1800);
  if (day === 0) await shot('05-morning-water', '아침 · 물 위 젖은 한지');
  await tid('develop').click();
  if (day === 0) {
    for (const [ms, nm] of [
      [900, '06-lift-900'],
      [1900, '07-lift-1900'],
      [2300, '08-lift-2300'],
    ]) {
      await sleep(ms - (log.at(-1)?.ms ?? 0));
      await shot(nm, `건져 올린 뒤 ${ms}ms — 한지 자리에서 카드로 커짐`);
      log.at(-1).ms = ms;
    }
    await sleep(1400);
    await shot('09-dream-card', '아침 인화 카드(DreamCard) + 읽는 문장 + 공유 자리');
    const card = await page.evaluate(() => {
      const e = document.querySelector('[data-testid="dream-card-art"]');
      return e ? e.getAttribute('aria-label') : null;
    });
    log.push({ name: 'card-a11y', label: card });
    console.log('card label', card);
  } else {
    await sleep(3200);
  }
  await tid('card-done').click();
  await sleep(4200);
}

// ── 3. 공방 노트 앨범 → 다시 보기 ──
await tid('seal').click();
await sleep(1000);
await page.locator('[data-testid="album-0"]').first().scrollIntoViewIfNeeded();
await sleep(2500);
await shot('10-album', '공방 노트 · 인화 카드 앨범(저해상도 오프스크린 썸네일 캐시)');
await tid('album-0').click();
await sleep(1500);
await shot('11-album-viewer', '지난 카드 크게 다시 보기');
await ctx.close();

// ── 4. 서툰 손 7일차: 오른쪽 위 지그재그(6번) 자리 ──
{
  const c2 = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  const p2 = await c2.newPage();
  watch(p2, 'clumsy');
  await p2.goto(`${BASE}/?screen=day&day=7&pose=clumsy&clean=1`, { waitUntil: 'networkidle', timeout: 300000 });
  await p2.waitForSelector('canvas', { timeout: 120000 });
  await sleep(2500);
  await p2.screenshot({ path: `${OUT}/12-clumsy-day7.png` });
  await c2.close();
}

await writeFile(`${OUT}/log.json`, JSON.stringify({ base: BASE, view: VIEW, steps: log, errors }, null, 2));
console.log('errors', errors.length, errors.slice(0, 8));
await browser.close();
