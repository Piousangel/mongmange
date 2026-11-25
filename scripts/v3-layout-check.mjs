// 새 컨셉 v3 홈 겹침 검사(캡처 검사): 1일차 홈에서 세로 제목·안내 한 줄·몸·사물 세 칸의 상자가 서로 겹치지 않는지 본다.
// 띄워 둔 웹 개발 서버(expo start --web)가 있어야 한다 — pnpm verify에는 넣지 않는다(서버가 필요해서).
//   node scripts/v3-layout-check.mjs [baseUrl=http://localhost:8146] [outDir]
// 조건 = 390×844 글자 100% · 320×568 글자 100% · 320×568 글자 200%(?fs=2) · 390×844 영어. 겹치면 종료 코드 1.
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
const IDS = ['v-title', 'home-line', 'mong-body', 'obj-brush', 'obj-inkstone', 'obj-dropper'];
// 몸 누르기 상자와 사물 칸은 화면 설계상 떨어져 있어야 한다. 겹침은 1px 넘게 파고든 것만 센다
const overlap = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;

if (OUT) await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
let bad = 0;
for (const c of CASES) {
  const ctx = await browser.newContext({ viewport: { width: c.vw, height: c.vh }, deviceScaleFactor: 2, locale: c.locale });
  const page = await ctx.newPage();
  await page.goto(BASE + '/' + c.q, { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForSelector('canvas', { timeout: 120000 });
  await sleep(2500);
  await page.mouse.click(c.vw / 2, c.vh / 2);
  // 인트로가 끝나고 첫 안내 한 줄이 떠 있는 동안 잰다
  await page.waitForSelector('[data-testid="home-line"]', { timeout: 60000 });
  await sleep(1500);
  const rects = await page.evaluate((ids) => {
    const out = {};
    for (const id of ids) {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) continue;
      // 글자 상자: 안내 한 줄은 폭 전체 칸이라 실제 글자 범위(Range)로 잰다
      let r = el.getBoundingClientRect();
      if (id === 'home-line' || id === 'v-title') {
        const range = document.createRange();
        range.selectNodeContents(el);
        r = range.getBoundingClientRect();
      }
      out[id] = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    }
    return out;
  }, IDS);
  if (OUT) await page.screenshot({ path: `${OUT}/layout-${c.name}.png` });
  const found = Object.keys(rects);
  const hits = [];
  for (let i = 0; i < found.length; i++) for (let j = i + 1; j < found.length; j++) if (overlap(rects[found[i]], rects[found[j]])) hits.push(`${found[i]}×${found[j]}`);
  const missing = ['v-title', 'home-line'].filter((id) => !rects[id]);
  console.log(`${c.name}: 잰 상자 ${found.length}(${found.join(',')}) · 겹침 ${hits.length ? hits.join(' ') : 0}${missing.length ? ` · 없음 ${missing.join(',')}` : ''}`);
  if (hits.length || missing.length) bad++;
  await ctx.close();
}
await browser.close();
console.log(bad ? `실패 ${bad}/${CASES.length}` : `통과 ${CASES.length}/${CASES.length}`);
process.exit(bad ? 1 : 0);
