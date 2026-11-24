// 공통 바텀시트 캡처(웹): 공방 노트를 열고 낮 시트·글자 200%·폭 320/430·모션 줄이기를 찍고,
// 마우스 드래그(덜 끌기 → 제자리, 아래로 끌기 → 닫힘, 빠른 튕김 → 닫힘, 위로 과도 당김 → 저항 후 복귀), 배경 탭, Esc를 확인한다.
// 사용: node scripts/sheet-capture.mjs <baseUrl> <outDir> [--shots-only]
//   --shots-only: 드래그 확인을 건너뛰고 화면만(이전 구현 '전' 캡처용 — 옛 노트는 드래그가 없다)
// 세이브: docs/app/flow-v1/.snapshots.json의 day2(카드 1장, 깨어 있음).
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:8093';
const OUT = path.resolve(process.argv[3] ?? 'docs/app/bottom-sheet/after');
const SHOTS_ONLY = process.argv.includes('--shots-only');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await mkdir(OUT, { recursive: true });
const snapshots = JSON.parse(await readFile(path.resolve('docs/app/flow-v1/.snapshots.json'), 'utf8'));

const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const errors = [];
const log = [];
const _push = log.push.bind(log);
log.push = (x) => { console.log(JSON.stringify(x)); return _push(x); };

async function openApp({ width = 390, height = 844, query = '' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  await ctx.addInitScript((data) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
  }, snapshots.day2);
  const page = await ctx.newPage();
  bindFlick(page);
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${BASE}/${query}`, { waitUntil: 'networkidle', timeout: 300000 });
  await page.waitForSelector('[data-testid="seal"]', { timeout: 120000 });
  await sleep(1200);
  return { ctx, page };
}
const tid = (page, id) => page.locator(`[data-testid="${id}"]`).first();
const noteOpen = (page) => page.locator('[data-testid="note-close"]').count().then((n) => n > 0);
/** 시트 위쪽 y(화면 좌표): 닫기 버튼의 위치로 잰다 */
const closeY = async (page) => (await tid(page, 'note-close').boundingBox())?.y ?? null;

/**
 * 튕김: 8번에 나눠 8ms 간격으로 움직인다(실측 약 600px/s). Playwright의 한 번에 몰아친 이동은 시각 간격이 0이라
 * RNGH 웹이 속도 0으로 계산한다 — 실제 손·마우스와 다른 입력이라 쓰지 않는다.
 */
let flick;
function bindFlick(page) {
  flick = async (x, y, dy) => {
    for (let i = 1; i <= 8; i++) {
      if (i > 1) await sleep(8);
      await page.mouse.move(x, y + (dy * i) / 8);
    }
  };
}

async function openNote(page) {
  await tid(page, 'seal').click();
  await sleep(700);
}

// ── 1. 화면: 낮 기본 / 글자 200% / 폭 320·430 / 모션 줄이기 ──
for (const v of [
  { name: '01-note-390', width: 390, height: 844 },
  { name: '02-note-fs200', width: 390, height: 844, query: '?fs=2' },
  { name: '03-note-320', width: 320, height: 640 },
  { name: '04-note-430', width: 430, height: 932 },
  { name: '05-note-rm', width: 390, height: 844, query: '?rm=1' },
]) {
  const { ctx, page } = await openApp(v);
  await openNote(page);
  await page.screenshot({ path: path.join(OUT, `${v.name}.png`) });
  log.push({ shot: v.name, open: await noteOpen(page) });
  await ctx.close();
}

if (!SHOTS_ONLY) {
  const { ctx, page } = await openApp();
  const handle = async () => {
    const b = await tid(page, 'note-handle').boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const dragBy = async (dy, steps) => {
    const h = await handle();
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    if (steps <= 6) await flick(h.x, h.y, dy);
    else await page.mouse.move(h.x, h.y + dy, { steps });
    return h;
  };

  // 2-1. 조금 끌었다 놓기 → 제자리
  await openNote(page);
  const y0 = await closeY(page);
  await dragBy(60, 12);
  await sleep(50);
  const yMid = await closeY(page);
  await page.screenshot({ path: path.join(OUT, '10-drag-mid.png') });
  await page.mouse.up();
  await sleep(600);
  const y1 = await closeY(page);
  log.push({ check: '덜 끌면 제자리', y0, during: yMid, after: y1, pass: yMid - y0 > 40 && Math.abs(y1 - y0) < 2 });

  // 2-2. 위로 과도 당김 → 저항(손가락보다 훨씬 덜) → 놓으면 복귀
  await dragBy(-200, 20);
  await sleep(50);
  const yOver = await closeY(page);
  const skirt = (await tid(page, 'note-skirt').boundingBox())?.height ?? 0;
  log.push({ check: '과도 당김으로 들린 바닥 틈을 시트 색 띠가 채움(리뷰 L1)', skirt, pass: skirt > 2 });
  await page.screenshot({ path: path.join(OUT, '11-overdrag-up.png') });
  await page.mouse.up();
  await sleep(600);
  const yBack = await closeY(page);
  log.push({ check: '위로 과도 당김 저항', y0, during: yOver, moved: y0 - yOver, after: yBack, pass: y0 - yOver > 2 && y0 - yOver < 40 && Math.abs(yBack - y0) < 2 });

  // 2-3. 천천히 많이 끌어 내리기 → 닫힘
  const sheetH = 844 - y0;
  await dragBy(sheetH * 0.7, 40);
  await sleep(100);
  await page.mouse.up();
  await sleep(900);
  log.push({ check: '많이 끌어 내리면 닫힘', pass: !(await noteOpen(page)) });

  // (튕김 닫기는 4절 확인판에서 본다. 홈 화면은 Skia가 메인 스레드를 차지해 헤드리스 마우스 이동이 8번에 약 0.8초 걸려 '튕김'을 만들 수 없다)

  // 2-5. 안쪽 스크롤: 내린 뒤 내용 위에서 아래로 끌면 먼저 스크롤이 올라가고 시트는 그대로
  await openNote(page);
  const scroll = tid(page, 'note-scroll');
  await scroll.hover();
  await page.mouse.wheel(0, 400);
  await sleep(400);
  const st0 = await scroll.evaluate((e) => e.scrollTop);
  const sb = await scroll.boundingBox();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2 + 120, { steps: 12 });
  await page.mouse.up();
  await sleep(700);
  log.push({ check: '스크롤이 내려가 있으면 내용 드래그로 시트가 닫히지 않음', scrollTopBefore: st0, open: await noteOpen(page), pass: st0 > 0 && (await noteOpen(page)) });

  // 2-6. 스크롤 맨 위에서 내용을 아래로 끌기 → 시트가 따라 내려옴
  await scroll.evaluate((e) => e.scrollTo(0, 0));
  await sleep(300);
  const yTop = await closeY(page);
  await page.mouse.move(sb.x + sb.width / 2, sb.y + 40);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + 40 + 80, { steps: 12 });
  await sleep(50);
  const yFollow = await closeY(page);
  await page.mouse.up();
  await sleep(700);
  log.push({ check: '스크롤 맨 위에서 내용 드래그 → 시트가 따라옴', y0: yTop, during: yFollow, pass: yFollow - yTop > 40 });

  // 2-7. 행 탭은 그대로 동작(드래그가 탭을 먹지 않음): 언어 라디오
  if (!(await noteOpen(page))) await openNote(page);
  await tid(page, 'lang-ko').click();
  await sleep(400);
  const koTitle = (await page.locator('[role="heading"]').allInnerTexts()).includes('공방 노트');
  await tid(page, 'lang-system').click();
  await sleep(400);
  log.push({ check: '안쪽 탭(언어 라디오) 동작 — 끌기가 탭을 먹지 않음', pass: koTitle });

  // 2-8. 배경 탭 → 닫힘
  await page.mouse.click(195, 12);
  await sleep(700);
  log.push({ check: '배경 탭 → 닫힘', pass: !(await noteOpen(page)) });

  // 2-9. Esc → 닫힘
  await openNote(page);
  await page.keyboard.press('Escape');
  await sleep(700);
  log.push({ check: 'Esc → 닫힘', pass: !(await noteOpen(page)) });

  // 2-9b. 리뷰 H1: 배경 탭 직후(닫히는 240ms 안) 손잡이를 잡아 위·아래로 끌어도 결국 닫히고 Modal이 내려간다
  for (const dy of [-80, 60]) {
    await openNote(page);
    const h = await handle();
    await page.mouse.click(195, 12);
    await page.mouse.move(h.x, h.y + 4);
    await page.mouse.down();
    await page.mouse.move(h.x, h.y + 4 + dy, { steps: 10 });
    await page.mouse.up();
    await sleep(900);
    log.push({ check: `닫히는 중 잡아 끌기(${dy}) → 그래도 닫힘(리뷰 H1)`, pass: !(await noteOpen(page)) && (await page.locator('[data-testid="note"]').count()) === 0 });
  }

  // 2-10. 접근성: 첫 포커스 = 제목, 대화상자 표시, 닫기 버튼 라벨, 웹 손잡이는 접근성 트리 밖
  await openNote(page);
  await sleep(500);
  const focusId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  log.push({ check: '열면 첫 포커스가 제목(리뷰 M3)', focusId, pass: focusId === 'note-title' });
  const handleA11y = await tid(page, 'note-handle').evaluate((e) => ({ role: e.getAttribute('role'), label: e.getAttribute('aria-label') }));
  log.push({ check: '웹 손잡이 그림은 역할 없음(포인터 캡처 유지), 단일 스냅이라 크기 조절 노드 없음', handleA11y, pass: !handleA11y.role && (await page.locator('[data-testid="note-size"]').count()) === 0 });
  const modal = await page.evaluate(() => !!document.querySelector('[aria-modal="true"]'));
  const closeBtn = await tid(page, 'note-close').evaluate((e) => ({ role: e.getAttribute('role'), label: e.getAttribute('aria-label') }));
  log.push({ check: '대화상자(aria-modal)·닫기 버튼 라벨', modal, closeBtn, pass: modal && !!closeBtn.label });
  await page.screenshot({ path: path.join(OUT, '12-reopened.png') });
  await ctx.close();
}

// ── 3. 공방 노트 앨범 → 카드 크게 보기(같은 Modal 위 겹침) → 돌아가기 ──
if (!SHOTS_ONLY) {
  const { ctx, page } = await openApp();
  await openNote(page);
  await tid(page, 'album-0').scrollIntoViewIfNeeded();
  await tid(page, 'album-0').click();
  await sleep(1200);
  const viewer = (await page.locator('[data-testid="card-viewer"]').count()) > 0;
  await page.screenshot({ path: path.join(OUT, '13-card-viewer.png') });
  await tid(page, 'viewer-close').click();
  await sleep(500);
  await tid(page, 'album-0').click();
  await sleep(1000);
  await page.keyboard.press('Escape');
  await sleep(600);
  log.push({ check: '카드 보기 중 Esc → 카드 보기만 닫히고 노트는 열린 채(겹침 뒤로 가기)', pass: (await page.locator('[data-testid="card-viewer"]').count()) === 0 && (await noteOpen(page)) });
  log.push({ check: '앨범 → 카드 보기 → 돌아가기(노트는 열린 채)', viewer, pass: viewer && (await page.locator('[data-testid="card-viewer"]').count()) === 0 && (await noteOpen(page)) });
  await ctx.close();
}

// ── 4. 확인판(?screen=sheet): 밤 테마 · 스냅 35%·85% ──
if (!SHOTS_ONLY) {
  const H = 844;
  const ctx = await browser.newContext({ viewport: { width: 390, height: H }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  bindFlick(page);
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?screen=sheet`, { waitUntil: 'networkidle', timeout: 300000 });
  await page.waitForSelector('[data-testid="board-sheet-handle"]', { timeout: 120000 });
  await sleep(800);
  const top = async () => (await tid(page, 'board-sheet-handle').boundingBox()).y;
  const visible = async () => H - (await top());
  const near = (v, want) => Math.abs(v - want) < 30;
  const drag = async (dy, steps) => {
    const b = await tid(page, 'board-sheet-handle').boundingBox();
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    if (steps > 6) {
      await page.mouse.move(x, y + dy, { steps });
      await sleep(150); // 천천히: 멈췄다 놓기(속도 0 근처)
    } else await flick(x, y, dy);
    await page.mouse.up();
    await sleep(700);
  };
  const isOpen = async () => (await page.locator('[data-testid="board-sheet-handle"]').count()) > 0;
  const v0 = await visible();
  await page.screenshot({ path: path.join(OUT, '20-board-35.png') });
  log.push({ check: '확인판: 처음은 낮은 스냅(35%)', visible: v0, pass: near(v0, H * 0.35) });
  await drag(-260, 30);
  const v1 = await visible();
  await page.screenshot({ path: path.join(OUT, '21-board-85.png') });
  log.push({ check: '천천히 위로 260 → 가까운 85%', visible: v1, pass: near(v1, H * 0.85) });
  await drag(100, 30);
  const v2 = await visible();
  log.push({ check: '천천히 아래로 100 → 85% 그대로', visible: v2, pass: near(v2, H * 0.85) });
  await drag(100, 3);
  const v3 = await visible();
  log.push({ check: '빠른 아래 튕김 100 → 한 칸만(35%), 닫히지 않음', visible: v3, pass: near(v3, H * 0.35) });
  await drag(-120, 3);
  const v4 = await visible();
  log.push({ check: '빠른 위 튕김 120 → 85%', visible: v4, pass: near(v4, H * 0.85) });
  // 낮은 스냅에서 내용을 위로 밀면 시트가 먼저 펼쳐지고 스크롤은 0에 묶인다
  await drag(100, 3);
  const sc = tid(page, 'board-sheet-scroll');
  const sb = await sc.boundingBox();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + 60);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + 60 - 200, { steps: 25 });
  await sleep(150);
  await page.mouse.up();
  await sleep(700);
  const v5 = await visible();
  const st5 = await sc.evaluate((e) => e.scrollTop);
  log.push({ check: '35%에서 내용 위로 200 → 시트가 85%로, 스크롤은 0', visible: v5, scrollTop: st5, pass: near(v5, H * 0.85) && st5 === 0 });
  // 리뷰 M1 재현: 85%에서 내용을 내려 스크롤 → 손잡이로 35%까지 → 내용을 아래로 끌면 시트가 따라 내려와야 한다
  await sc.hover();
  await page.mouse.wheel(0, 300);
  await sleep(400);
  const scrolled = await sc.evaluate((e) => e.scrollTop);
  await drag(100, 3);
  const v6 = await visible();
  const sb2 = await sc.boundingBox();
  await page.mouse.move(sb2.x + sb2.width / 2, sb2.y + 30);
  await page.mouse.down();
  await page.mouse.move(sb2.x + sb2.width / 2, sb2.y + 30 + 60, { steps: 12 });
  await sleep(150);
  const v7 = await visible();
  await page.mouse.up();
  await sleep(700);
  log.push({ check: '낮은 스냅 + 스크롤 내려간 채 내용을 아래로 끌기 → 시트가 따라옴(리뷰 M1)', scrolled, at35: v6, during: v7, pass: scrolled > 0 && near(v6, H * 0.35) && v6 - v7 > 30 });

  // 리뷰 M4: 웹 크기 조절 노드(slider) — 화살표 키로 한 칸씩, aria-valuenow 갱신
  const size = tid(page, 'board-sheet-size');
  const role = await size.getAttribute('role');
  await size.focus();
  await page.keyboard.press('ArrowUp');
  await sleep(500);
  const up = { visible: await visible(), now: await size.getAttribute('aria-valuenow') };
  await page.keyboard.press('ArrowDown');
  await sleep(500);
  const down = { visible: await visible(), now: await size.getAttribute('aria-valuenow') };
  log.push({ check: '웹 slider + 화살표 키로 스냅 바꾸기(리뷰 M4)', role, up, down, pass: role === 'slider' && near(up.visible, H * 0.85) && up.now === '2' && near(down.visible, H * 0.35) && down.now === '1' });

  await drag(120, 3);
  log.push({ check: '35%에서 아래로 튕김 120 → 닫힘', pass: !(await isOpen()) });
  await ctx.close();
}

// ── 5. 모션 줄이기(?rm=1): 열기·닫기가 즉시(애니메이션 없음) ──
if (!SHOTS_ONLY) {
  const { ctx, page } = await openApp({ query: '?rm=1' });
  await tid(page, 'seal').click();
  await sleep(60);
  const y = await closeY(page);
  await tid(page, 'note-close').click();
  await sleep(60);
  log.push({ check: '모션 줄이기: 60ms 안에 열림·닫힘', closeY: y, pass: y !== null && Math.abs(y - 38) < 2 && !(await noteOpen(page)) });
  await ctx.close();
}

await browser.close();
const ok = log.filter((l) => 'pass' in l).every((l) => l.pass);
await writeFile(path.join(OUT, 'log.json'), JSON.stringify({ base: BASE, log, errors }, null, 2));

console.log(errors.length ? `콘솔 오류 ${errors.length}건` : '콘솔 오류 0건');
console.log(ok ? '드래그 확인 전부 통과' : '실패 있음');
process.exit(ok ? 0 : 1);
