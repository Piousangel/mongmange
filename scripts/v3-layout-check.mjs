// 새 컨셉 v3 홈 겹침 검사(캡처 검사): 세로 제목·안내 한 줄·이레 표지·몸·사물 세 칸의 상자가 서로 겹치지 않는지 본다.
// 1번째 밤부터 28번째 밤까지 밤마다(이레 7·14·21·28 표지 포함) + 완성(곁에 남음) 화면을 잰다(리뷰 M3 — 1일차만 재면 긴 제목을 못 지킨다).
// 밤마다 붓을 눌러 '먹을 먼저' 안내 한 줄(두 줄 길이)을 띄우고 잰다. 밤 넘기기는 개발 메뉴 '밤 넘기기'.
// 띄워 둔 웹 개발 서버(expo start --web, CI=1 없이 — CI=1이면 파일 감시가 꺼진다)가 있어야 한다. pnpm verify에는 넣지 않는다.
//   node scripts/v3-layout-check.mjs [baseUrl=http://localhost:8146] [outDir]
// 조건 = 390×844 글자 100% · 320×568 글자 100% · 320×568 글자 200%(?fs=2) · 390×844 영어. 하나라도 겹치면 종료 코드 1.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.argv[2] ?? 'http://localhost:8146';
const OUT = process.argv[3] ?? null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CASES = [
  { name: '390-fs1-ko', vw: 390, vh: 844, q: '', locale: 'ko-KR' },
  { name: '320-fs1-ko', vw: 320, vh: 568, q: '', locale: 'ko-KR' },
  { name: '320-fs2-ko', vw: 320, vh: 568, q: '?fs=2', locale: 'ko-KR' },
  { name: '390-fs1-en', vw: 390, vh: 844, q: '', locale: 'en-US' },
];
const IDS = ['v-title', 'home-line', 'v3-ire-mark', 'mong-body', 'obj-brush', 'obj-inkstone', 'obj-dropper'];
// 몸 누르기 상자와 사물 칸은 화면 설계상 떨어져 있어야 한다. 겹침은 1px 넘게 파고든 것만 센다
const overlap = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;

if (OUT) await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });

async function runCase(c) {
  const ctx = await browser.newContext({ viewport: { width: c.vw, height: c.vh }, deviceScaleFactor: 2, locale: c.locale });
  const page = await ctx.newPage();
  const tid = (id) => page.locator(`[data-testid="${id}"]`);
  const has = async (id) => (await tid(id).count()) > 0;
  const fails = [];
  let measured = 0;
  const measure = async (label, needLine) => {
    const rects = await page.evaluate((ids) => {
      const out = {};
      for (const id of ids) {
        const el = document.querySelector(`[data-testid="${id}"]`);
        if (!el) continue;
        let r = el.getBoundingClientRect();
        // 글자 상자는 실제 글자 범위(Range)로 잰다(안내 한 줄은 폭 전체 칸이라)
        if (id === 'home-line' || id === 'v-title' || id === 'v3-ire-mark') {
          const range = document.createRange();
          range.selectNodeContents(el);
          r = range.getBoundingClientRect();
        }
        if (r.width > 0 && r.height > 0) out[id] = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      }
      return out;
    }, IDS);
    const found = Object.keys(rects);
    for (let i = 0; i < found.length; i++) for (let j = i + 1; j < found.length; j++) if (overlap(rects[found[i]], rects[found[j]])) fails.push(`${label}: ${found[i]}×${found[j]}`);
    for (const id of ['v-title', ...(needLine ? ['home-line'] : [])]) if (!rects[id]) fails.push(`${label}: ${id} 없음`);
    measured++;
    if (fails.length && OUT) await page.screenshot({ path: `${OUT}/layout-fail-${c.name}-${label}.png` });
  };
  const clearMorning = async () => {
    for (let i = 0; i < 20; i++) {
      if (await has('card-done')) { await tid('card-done').click(); await sleep(700); continue; }
      if (await has('develop')) { await tid('develop').click(); await sleep(2200); continue; }
      if ((await has('game-home')) && !(await has('morning'))) return;
      await sleep(500);
    }
  };
  const nightSkip = async () => {
    await tid('dev-toggle').click();
    await sleep(300);
    await tid('dev-v3-night').click();
    await sleep(700);
    if (await has('dev-v3-night')) await tid('dev-toggle').click();
    await clearMorning();
    await sleep(900);
  };
  await page.goto(BASE + '/' + c.q, { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForSelector('canvas', { timeout: 120000 });
  await sleep(2500);
  await page.mouse.click(c.vw / 2, c.vh / 2);
  await page.waitForSelector('[data-testid="home-line"]', { timeout: 60000 });
  await sleep(1500);
  await measure('밤1-첫안내', true);
  if (OUT) await page.screenshot({ path: `${OUT}/layout-${c.name}.png` });
  for (let n = 1; n <= 28; n++) {
    if (n > 1) await nightSkip();
    await sleep(2600); // 등장 연출(사물 세 칸)이 끝난 뒤
    await tid('obj-brush').click(); // 먹을 갈기 전 → 안내 한 줄
    await sleep(700);
    await measure(`밤${n}`, true);
    if (OUT && n % 7 === 0) await page.screenshot({ path: `${OUT}/layout-${c.name}-night${n}.png` });
  }
  await nightSkip(); // 28번째 밤 뒤 아침 = 완성
  await sleep(2600);
  await tid('obj-brush').click();
  await sleep(700);
  await measure('완성', true);
  if (OUT) await page.screenshot({ path: `${OUT}/layout-${c.name}-complete.png` });
  await ctx.close();
  return { name: c.name, measured, fails };
}

const results = await Promise.all(CASES.map(runCase));
await browser.close();
let bad = 0;
for (const r of results) {
  console.log(`${r.name}: 잰 화면 ${r.measured} · 겹침·빠짐 ${r.fails.length ? r.fails.join(' / ') : 0}`);
  if (r.fails.length) bad++;
}
console.log(bad ? `실패 ${bad}/${CASES.length}` : `통과 ${CASES.length}/${CASES.length}`);
process.exit(bad ? 1 : 0);
