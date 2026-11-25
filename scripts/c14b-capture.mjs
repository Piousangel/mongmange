// C14b 꿈 모티프 붓 형상 15 캡처(웹): 공유 이미지 함수(renderDreamCardImage) 결과 PNG를 모아 시트로 남긴다.
//  - sheet-15.png    새 15개(구도 a, 성향 b) 5×3 — 한 장에 모아 보기
//  - sheet-comp.png  새 15개 × 구도 a·b·c(성향 a·b·c를 번갈아) — 자리·뒤집기·잘림 확인
//  - sheet-mixed.png 기존 10 + 새 15 = 25장(5×5) — 한 화면에 섞였을 때
//  - sheet-64pt.png  같은 25장을 카드 폭 64pt(2x)로 줄인 판독 시트(아트 바이블 7-6 ⑦)
//  - sheet-dark.png  는 서버 없이 scripts/c14b-dark-sheet.mjs가 만든다
//  - blind/sheet-25.png 라벨 없는 25장(번호만, 순서는 고정 시드로 섞음 — 래스터·코드 표시 없음) + 정답표 docs/team/reviews/2026-11-25-c14b-blind-key.md(리뷰어에게 주지 않는다)
//  - sheet-night.png 실제 밤 카드 9장(8차)(마블링·몽망이·래스터 사물 함께, &theme=night — 확인판 전용 밤 판)
//  - compare-ref.png 3차 대상 7장: Gemini 레퍼런스(docs/creative/c14b-ref, ★ = 고른 안)와 결과 카드를 한 줄에 나란히
// 모든 카드는 판 1(꿈 콘텐츠가 켜진 카드의 그림, &rev=1)로 찍는다 — 판 0(빌드 1) 그림은 main과 바이트 같음(시험)
// 사용: node scripts/c14b-capture.mjs [baseUrl=http://localhost:8147] [outDir=docs/app/c14b]
// 개발 서버(expo start --web)는 metro 감시가 멈추는 일이 있어 캡처 전에 `-c`로 새로 띄운다(11-25 확인: 고친 파일이 번들에 안 들어감).
import { chromium } from 'playwright';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:8147';
const OUT = path.resolve(process.argv[3] ?? 'docs/app/c14b');
const TMP = path.join(OUT, '.cards');
const OLD = ['near-alone.quilt', 'near-alone.teacup', 'near-with.window-hand', 'near-with.teacup-two', 'far-alone.mountain', 'far-alone.sea', 'far-with.stars-drops', 'far-with.sea-hand', 'center.rain', 'center.moon'];
const NEW = [
  'near-alone.inkstone',
  'near-alone.washing-line',
  'near-alone.sprout',
  'near-with.umbrella',
  'near-with.letter',
  'near-with.palm',
  'far-alone.paper-boat',
  'far-alone.kite',
  'far-alone.path',
  'far-with.geese',
  'far-with.star-bridge',
  'far-with.stepping-stones',
  'center.leaf',
  'center.snow',
  'center.wind',
];
await mkdir(TMP, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

async function grab(motif, t, comp, night = false) {
  const file = `${motif}__${t}${comp}${night ? '_night' : ''}.png`;
  await page.goto(`${BASE}/?screen=card&export=1&rev=1${night ? '&theme=night' : ''}&motif=${motif}&t=${t}&seed=7&comp=${comp}`, { waitUntil: 'networkidle', timeout: 300000 });
  await page.waitForFunction(() => window.__dreamPng, null, { timeout: 180000 });
  const b64 = await page.evaluate(() => window.__dreamPng);
  await writeFile(path.join(TMP, file), Buffer.from(b64, 'base64'));
  console.log('saved', file);
  return file;
}

async function sheet(name, cells, cols, w, dpr = 1) {
  const html = `<html><body style="margin:0;background:#141A2C;color:#E9E2D2;font:13px -apple-system,sans-serif">
<div style="display:grid;grid-template-columns:repeat(${cols},${w}px);gap:10px;padding:14px">
${cells.map(([f, label]) => `<div><img src="file://${path.join(TMP, f)}" style="width:${w}px;display:block;border-radius:2px"><div style="padding:4px 0 2px">${label}</div></div>`).join('')}
</div></body></html>`;
  const htmlPath = path.join(TMP, `${name}.html`);
  await writeFile(htmlPath, html);
  const c2 = dpr === 1 ? ctx : await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: dpr });
  const p = await c2.newPage();
  await p.setViewportSize({ width: cols * (w + 10) + 28, height: 800 });
  await p.goto(`file://${htmlPath}`);
  await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  await p.close();
}

const a = [];
for (const m of NEW) a.push([await grab(m, 'b', 0), m]);
await sheet('sheet-15', a, 5, 300);

const comp = [];
for (const [i, m] of NEW.entries()) for (const c of [0, 1, 2]) comp.push([await grab(m, ['a', 'b', 'c'][(i + c) % 3], c), `${m} · ${'abc'[c]}`]);
await sheet('sheet-comp', comp, 6, 220);

const olds = [];
for (const m of OLD) olds.push([await grab(m, 'b', 0), `${m} (기존)`]);
// 한 화면에 섞인 모습: 줄마다 기존 2 + 새 3, 자리를 줄마다 밀어 섞는다
const news = [...a];
const mixed = Array.from({ length: 25 }, (_, i) => ((i + Math.floor(i / 5) * 2) % 5 < 2 ? olds : news).shift());
await sheet('sheet-mixed', mixed, 5, 220);
// 블라인드 시트(5차, 오너 조건 ② — 새 리뷰어가 '다른 손으로 그린 장'을 고른다)
{
  // 8차: 판 1 래스터 사물 12장(이불·찻잔·찻잔 둘·벼루·징검다리·빨랫줄 추가, 창은 손 없는 창살 창)
  const RASTER = new Set(['near-with.letter', 'far-alone.kite', 'near-with.umbrella', 'far-alone.paper-boat', 'near-with.palm', 'near-with.window-hand', 'near-alone.quilt', 'near-alone.teacup', 'near-with.teacup-two', 'near-alone.inkstone', 'far-with.stepping-stones', 'near-alone.washing-line']);
  // mixed = 기존 10 + 새 15(위에서 olds·news를 꺼내 썼으므로 mixed에서 가져온다)
  const all = mixed.map(([f, l]) => [f, l.replace(' (기존)', '')]);
  let seed = 20261208; // 8차: 3차 판정 뒤 새 시드로 다시 섞음(7차 20261127)
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  await mkdir(path.join(OUT, 'blind'), { recursive: true });
  const BOUT = path.join(OUT, 'blind');
  await sheet('blind-tmp', all.map(([f], i) => [f, String(i + 1)]), 5, 220);
  const { rename } = await import('node:fs/promises');
  await rename(path.join(OUT, 'blind-tmp.png'), path.join(BOUT, 'sheet-25.png'));
  const key = all.map(([, id], i) => `| ${i + 1} | ${id} | ${RASTER.has(id) ? '래스터 사물' : '코드'} |`).join('\n');
  await writeFile(
    path.resolve('docs/team/reviews/2026-11-25-c14b-blind-key.md'),
    `# C14b 블라인드 시트 정답표 (리뷰어에게 주지 않는다)\n\n- 시트: \`docs/app/c14b/blind/sheet-25.png\`(번호만, 고정 시드 20261208로 섞음). 판정 뒤에 이 표와 맞춘다.\n\n| 번호 | 모티프 | 그린 방법 |\n|---|---|---|\n${key}\n`,
  );
}
await sheet('sheet-64pt', mixed.map(([f, l]) => [f, l.replace(/^[a-z-]+\./, '').replace(' (기존)', '*')]), 5, 64, 2);

// 밤 카드 6장(7차)
{
  const nights = [];
  // 8차: 9장(래스터 사물 + 곁 방울 바다 손) — 몸은 검은 먹 + 달빛 테
  for (const m of ['near-with.letter', 'far-alone.kite', 'near-with.umbrella', 'far-alone.paper-boat', 'near-with.palm', 'near-with.window-hand', 'near-with.teacup-two', 'near-alone.inkstone', 'far-with.sea-hand']) nights.push([await grab(m, 'b', 0, true), `${m} · 밤`]);
  await sheet('sheet-night', nights, 3, 300);
}

// 레퍼런스 ↔ 결과 비교(3차 아트 리뷰용)
const REF = path.resolve('docs/creative/c14b-ref');
const CMP = [
  // 4차: ★ = 앱 에셋으로 손질한 사물 원본(-o), 나머지 = 다른 안·3차 장 레퍼런스
  ['near-with.letter', ['letter-o2', 'letter-o1', 'letter-o3', 'letter-f2'], 'letter-o2'],
  ['far-alone.kite', ['kite-o3', 'kite-o1', 'kite-o2', 'kite-f3'], 'kite-o3'],
  ['near-with.umbrella', ['umbrella-o1', 'umbrella-o2', 'umbrella-o3', 'umbrella-f3'], 'umbrella-o1'],
  ['far-alone.paper-boat', ['boat-o1', 'boat-o2', 'boat-o3', 'boat-p1'], 'boat-o1'],
  ['near-with.palm', ['palm-o3', 'palm-o1', 'palm-o2', 'palm-f4'], 'palm-o3'],
  ['near-with.window-hand', ['windowsill-o1', 'windowsill-o2', 'windowsill-o3', 'window-o3'], 'windowsill-o1'],
  ['near-alone.quilt', ['quilt-o1', 'quilt-o2', 'quilt-o3'], 'quilt-o1'],
  ['near-alone.teacup', ['teacup-o1', 'teacup-o2', 'teacup-o3'], 'teacup-o1'],
  ['near-with.teacup-two', ['teacuptwo-o2', 'teacuptwo-o1', 'teacuptwo-o3'], 'teacuptwo-o2'],
  ['near-alone.inkstone', ['inkstone-o2', 'inkstone-o1', 'inkstone-o3'], 'inkstone-o2'],
  ['far-with.stepping-stones', ['stones-o3', 'stones-o1', 'stones-o2'], 'stones-o3'],
  ['near-alone.washing-line', ['washingline-o3', 'washingline-o1', 'washingline-o2'], 'washingline-o3'],
  ['far-alone.path', ['path-f3', 'path-f1', 'path-p1'], 'path-f3'],
];
const cmpHtml = `<html><body style="margin:0;background:#141A2C;color:#E9E2D2;font:13px -apple-system,sans-serif;padding:14px">
${CMP.map(([m, refs, pick]) => {
  const card = `${m}__b0.png`;
  const cells = refs.length
    ? refs.map((r) => `<div><img src="file://${REF}/${r}.jpg" style="height:220px;display:block;${r === pick ? 'outline:3px solid #C9A45C' : ''}"><div>${r}${r === pick ? ' ★' : ''}</div></div>`).join('')
    : '<div style="width:200px;height:260px;display:flex;align-items:center;justify-content:center;border:1px dashed #555">레퍼런스 없음<br>(Figma AI 크레딧 한도)</div>';
  return `<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:14px"><div style="width:150px">${m}</div>${cells}<div style="margin-left:24px"><img src="file://${path.join(TMP, card)}" style="height:260px;display:block"><div>결과(4차)</div></div></div>`;
}).join('')}</body></html>`;
await writeFile(path.join(TMP, 'compare.html'), cmpHtml);
{
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1400, height: 800 });
  await p.goto(`file://${path.join(TMP, 'compare.html')}`);
  await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(OUT, 'compare-ref.png'), fullPage: true });
  await p.close();
}

console.log('errors', errors.slice(0, 5));
await browser.close();
await rm(TMP, { recursive: true, force: true });
