// C14b 4차: 사물 한 겹 래스터 6장 다크 모드 시트(서버 불필요). 에셋은 검정 + 알파라 색을 테마 토큰으로 입히면 밤 바탕에서도 그대로 보인다.
// 6차: 밤은 곱하기를 쓰지 않는다(대조 열 삭제). 밤 먹 토큰 = 밝고 차가운 은회색 MOTIF_NIGHT_INK, 가림 층 = 밤 바탕 토큰.
// 사용: node scripts/c14b-dark-sheet.mjs [outDir=docs/app/c14b]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] ?? 'docs/app/c14b');
const RAS = path.resolve('apps/mobile/assets/motifs/r1');
const IDS = ['near-with.letter', 'far-alone.kite', 'near-with.umbrella', 'far-alone.paper-boat', 'near-with.palm', 'near-with.window-hand'];
const TOKENS = { dayBg: '#EFE8DA', dayInk: '#1B1A18', nightBg: '#141A2C', nightInk: '#BEC5D1' }; // core PALETTE.day.bg·body, PALETTE.night.bg, MOTIF_NIGHT_INK(6차 밝은 은회색)
const uri = (id) => `data:image/webp;base64,${readFileSync(path.join(RAS, `${id}.webp`)).toString('base64')}`;
const box = 'width:180px;height:180px';
const mask = (id, bg, ink, label) =>
  `<div style="background:${bg};padding:8px"><div style="${box};background:${ink};-webkit-mask:url(${uri(id)}) center/contain no-repeat;mask:url(${uri(id)}) center/contain no-repeat"></div><div style="color:#999;font:11px sans-serif">${label}</div></div>`;
const html = `<html><body style="margin:0;background:#222;padding:12px;font:13px sans-serif;color:#ccc">
<div style="max-width:600px">낮(한지 ${TOKENS.dayBg} · 먹 토큰 ${TOKENS.dayInk}) / 밤(밤 물 ${TOKENS.nightBg} · 밤 먹 토큰 ${TOKENS.nightInk}, 곱하기 없음)</div>
${IDS.map((id) => `<div style="display:flex;gap:6px;margin:6px 0">${mask(id, TOKENS.dayBg, TOKENS.dayInk, `${id} · 낮`)}${mask(id, TOKENS.nightBg, TOKENS.nightInk, '밤 토큰')}</div>`).join('')}
</body></html>`;
const dir = mkdtempSync(path.join(os.tmpdir(), 'c14b-dark-'));
writeFileSync(path.join(dir, 'dark.html'), html);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 440, height: 800 } });
await p.goto(`file://${path.join(dir, 'dark.html')}`);
await p.waitForTimeout(600);
await p.screenshot({ path: path.join(OUT, 'sheet-dark.png'), fullPage: true });
await b.close();
console.log('saved sheet-dark.png');
