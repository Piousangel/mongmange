// 실험 스트립 캡처. 실행(저장소 루트에서): node docs/design/meetings/2026-11-26-planning-2/exp/capture.mjs [s ...]
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const PAGE = pathToFileURL(path.join(DIR, 'strips.html')).href;
const list = process.argv.slice(2).length ? process.argv.slice(2) : ['body', 'board', 'dutA', 'dutB'];
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
page.on('pageerror', (e) => { console.error('페이지 오류', e.message); process.exitCode = 1; });
for (const s of list) {
  await page.goto(`${PAGE}?s=${s}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  await (await page.$('#c')).screenshot({ path: path.join(DIR, `strip-${s}.png`) });
  console.log('saved', s);
}
await browser.close();
