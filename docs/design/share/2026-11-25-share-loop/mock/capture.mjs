// 목업 캡처(360px 뷰포트, 2배). 실행: 저장소 루트에서 node docs/design/share/2026-11-25-share-loop/mock/capture.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const JOBS = [
  ['cards.html?only=morning', 'card-morning.png', 640],
  ['cards.html?only=ire', 'card-ire.png', 450],
  ['cards.html?only=scroll', 'card-scroll.png', 640],
  ['preview.html', 'preview-360.png', 780],
  ['preview.html?state=hidden', 'preview-hidden-360.png', 780],
  ['landing.html', 'landing-360.png', 780],
  ['landing.html?state=after', 'landing-after-360.png', 780],
];
const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
for (const [u, out, h] of JOBS) {
  const [file] = u.split('?');
  try { await import('node:fs').then((fs) => fs.accessSync(path.join(DIR, file))); } catch { continue; }
  await p.setViewportSize({ width: 360, height: h });

  await p.goto(`file://${DIR}/${u}`, { waitUntil: 'load' });
  await p.waitForTimeout(400);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  await p.screenshot({ path: path.join(DIR, out), fullPage: out.includes('-360') });
  console.log(out, 'scrollWidth', sw);
}
await b.close();
