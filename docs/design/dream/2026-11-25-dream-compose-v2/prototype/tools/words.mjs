// 캡처한 밤들의 말·덧말 텍스트를 뽑는다(블라인드 정답표용). 사용: node words.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const PAGE = pathToFileURL(path.resolve(DIR, '../index.html')).href;
const qs = ['seed=11&n=1', 'seed=11&n=7', 'seed=11&n=14', 'seed=11&n=28', 'seed=27&n=9', 'seed=27&n=21', 'seed=64&n=12', 'seed=11&n=14&mode=v1'];
const b = await chromium.launch(); const p = await b.newPage();
for (const q of qs) { await p.goto(`${PAGE}?${q}`); await p.waitForFunction(() => window.__ready); console.log(q, '|', (await p.$eval('#words', (e) => e.innerText)).replace(/\n/g, ' / '), '|', await p.$eval('#weekTitle', (e) => e.innerText)); }
await b.close();
