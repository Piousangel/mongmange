import { chromium } from '/Users/hyunseok/Developer/mongmange/node_modules/playwright/index.mjs';
const [,, url, out, w, h] = process.argv;
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 })).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(url);
try { await p.waitForFunction(() => document.title === 'ready', null, { timeout: 30000 }); } catch (e) { console.log('TIMEOUT', errs); }
await p.screenshot({ path: out, fullPage: true });
const ans = await p.evaluate(() => window.__answers || null);
console.log(out, 'errors', errs, 'answers', ans);
await b.close();
