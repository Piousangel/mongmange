// 캡처 비교 시트(검토용). 사용: node sheet.mjs <폴더 절대경로> <출력 png> [파일 정규식] [높이px]
import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
const dir = process.argv[2], out = process.argv[3], filt = new RegExp(process.argv[4] || '.');
const files = readdirSync(dir).filter((f) => f.endsWith('.png') && filt.test(f));
const html = `<body style="margin:0;background:#ddd;display:flex;flex-wrap:wrap;gap:6px;padding:6px;width:1600px">${files.map((f) => `<div style="font:12px sans-serif"><img src="data:image/png;base64,${readFileSync(dir + '/' + f).toString('base64')}" style="height:${process.argv[5]||420}px;display:block">${f}</div>`).join('')}</body>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1612, height: 800 } });
await p.setContent(html); await p.waitForTimeout(800); await p.screenshot({ path: out, fullPage: true }); await b.close();
