// 시제품 캡처(헤드리스 Chromium). 실행: node docs/design/dream/2026-11-25-dream-compose-v2/prototype/tools/capture.mjs [이름=쿼리 ...]
// 인자 없으면 기본 묶음(1·7·14·28밤 + v1 비교 + 새김 연출 프레임 + 몸 4획 안 A·B·C)을 찍는다.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PAGE = pathToFileURL(path.resolve(DIR, '../index.html')).href;
const OUT = path.resolve(DIR, '../../captures');
const shots = process.argv.slice(2).length
  ? process.argv.slice(2).map((a) => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)])
  : [
      ['night-01', 'seed=11&n=1'], ['night-07', 'seed=11&n=7'], ['night-14', 'seed=11&n=14'], ['night-28', 'seed=11&n=28'],
      ['s27-night-09-crisis-as-still', 'seed=27&n=9'], ['s27-night-21', 'seed=27&n=21'], ['s64-night-12', 'seed=64&n=12'],
      ['v1-sticker-night-14', 'seed=11&n=14&mode=v1'],
      ['impact-07-a-lift', 'seed=11&n=7&anim=300'], ['impact-07-b-fly', 'seed=11&n=7&anim=820'], ['impact-07-c-hit', 'seed=11&n=7&anim=1080'], ['impact-07-d-soak', 'seed=11&n=7&anim=1500'],
      ['impact-28-glow', 'seed=11&n=28&anim=3000'],
      ['face-A', 'seed=11&n=28&variant=A'], ['face-B', 'seed=11&n=28&variant=B'], ['face-C', 'seed=11&n=28&variant=C'],
    ];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1660, height: 1300 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => { console.error('페이지 오류', e.message); process.exitCode = 1; });
for (const [name, q] of shots) {
  await page.goto(`${PAGE}?cap=1&${q}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  if (name.startsWith('face')) await (await page.$('#face')).screenshot({ path: path.join(OUT, `${name}.png`) });
  else if (name.startsWith('impact')) await (await page.$('#day')).screenshot({ path: path.join(OUT, `${name}.png`) });
  else { await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true }); await (await page.$('#day')).screenshot({ path: path.join(OUT, `card-${name}.png`) }); await (await page.$('#week')).screenshot({ path: path.join(OUT, `week-${name}.png`) }); }
  console.log('saved', name);
}
await browser.close();
