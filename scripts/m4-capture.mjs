// M4 머뭇거림 → 큰 반김 캡처(리뷰 L1 — 재현용). 72시간 비운 뒤 돌아온 장면에서 글(자막·안내 한 줄)이 0인지 재고 ko·en을 찍는다.
// 띄워 둔 웹 개발 서버(apps/mobile: expo start --web --port 8152)가 있어야 한다. 가상 시계(?vclock=1, window.__step)로 몸짓 순간을 고정한다.
// pnpm verify에는 넣지 않는다.
//   node scripts/m4-capture.mjs [baseUrl=http://localhost:8152] [outDir=docs/team/captures/m4]
// 순서: 설치 → (쓰다듬기 → 개발 메뉴 '밤 넘기기') ×4로 정 4 이상 → 개발 메뉴 '비움 72h' → 아침 카드 → 낮 홈 0.6초 뒤 머뭇거림(캡처 1)
//       → 몸 첫 터치 → 큰 반김(캡처 2). 두 장면 모두 자막 띠·안내 한 줄이 없어야 한다(있으면 종료 코드 1).
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.argv[2] ?? 'http://localhost:8152';
const OUT = process.argv[3] ?? 'docs/team/captures/m4';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
let bad = 0;
for (const [name, locale] of [
  ['ko', 'ko-KR'],
  ['en', 'en-US'],
]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale });
  const page = await ctx.newPage();
  const step = (ms) => page.evaluate((m) => window.__step?.(m), ms);
  const tid = (id) => page.locator(`[data-testid="${id}"]`);
  const has = async (id) => (await tid(id).count()) > 0;
  const wait = async (ms) => {
    await sleep(ms);
    await step(ms + 4000);
  };
  const clearMorning = async () => {
    for (let i = 0; i < 30; i++) {
      await step(3000);
      if (await has('card-done')) {
        await tid('card-done').click();
        await wait(700);
        continue;
      }
      if (await has('develop')) {
        await tid('develop').click();
        await wait(1500);
        continue;
      }
      if ((await has('game-home')) && !(await has('morning'))) return;
      await sleep(400);
    }
  };
  const dev = async (id) => {
    await tid('dev-toggle').click();
    await sleep(300);
    await tid(id).click();
    await sleep(300);
    if (await has(id)) await tid('dev-toggle').click();
  };
  const pet = async () => {
    const b = await tid('mong-body').boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  };
  /** 화면에 보이는 글: 정 자막 띠 + 안내 한 줄(글자가 있는 것만) */
  const texts = () =>
    page.evaluate(() =>
      ['jeong-caption', 'home-line']
        .map((id) => document.querySelector(`[data-testid="${id}"]`))
        .filter((el) => el && el.textContent && Number(getComputedStyle(el).opacity) > 0.05)
        .map((el) => el.textContent),
    );
  await page.goto(BASE + '/?vclock=1', { waitUntil: 'networkidle', timeout: 240000 });
  await page.waitForSelector('canvas', { timeout: 180000 });
  await sleep(2500);
  await page.mouse.click(195, 422);
  for (let i = 0; i < 60 && !(await has('home-line')); i++) await wait(500);
  await wait(1000);
  for (let n = 0; n < 4; n++) {
    await pet();
    await wait(500);
    await dev('dev-v3-night');
    await clearMorning();
    await wait(1500);
  }
  await wait(5000);
  await dev('dev-away-72');
  // 마지막 아침은 가상 시계를 낮 홈 직전까지만 진행한다(낮 홈 0.6초 뒤 머뭇거림이 붙는다)
  for (let i = 0; i < 30; i++) {
    await step(3000);
    if (await has('develop')) {
      await tid('develop').click();
      await wait(1500);
      continue;
    }
    if (await has('card-done')) {
      await tid('card-done').click();
      break;
    }
    await sleep(300);
  }
  await sleep(1000);
  await step(380); // 머뭇거림 가운데(갸웃 최대)
  const t1 = await texts();
  await page.screenshot({ path: `${OUT}/${name}-1-hesitate.png` });
  await step(1000);
  await pet(); // 첫 터치 → 물 한 방울 → 큰 반김(머뭇거림이 끝난 뒤)
  await sleep(600);
  await step(900); // 큰 반김 가운데
  const t2 = await texts();
  await page.screenshot({ path: `${OUT}/${name}-2-big.png` });
  console.log(`${name}: 머뭇거림 글 ${JSON.stringify(t1)} · 큰 반김 글 ${JSON.stringify(t2)}`);
  if (t1.length || t2.length) bad++;
  await ctx.close();
}
await browser.close();
console.log(bad ? `실패: 머뭇거림~큰 반김 사이에 글이 있다(${bad})` : '통과: 머뭇거림~큰 반김 글 0 (ko·en)');
process.exit(bad ? 1 : 0);
