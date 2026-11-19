// 앱 흐름 v1.1 캡처(웹).
// 1부 = 하루 시나리오: 설치 → 첫 탭 → 한 획 → 등장 순서 → 먹 갈기 → 재우기(조수 연속) → 알림 사전 문구 → 다음 아침(건져 올리기 연속) → 카드 → 새로고침 복원 → 공방 노트
// 2부 = 품질 관문(OPERATING 4절): 폭 320·360·390·412·430 × 글자 100·150·200%로 낮 홈·긋기·밤·아침·노트(1부의 세이브 스냅숏을 주입)
// 사용: node scripts/app-flow-capture.mjs [baseUrl] [--gate-only]. 결과: docs/app/flow-v1/*.png, gate/*.png, flow-log.json
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:8095';
const GATE_ONLY = process.argv.includes('--gate-only');
const FLOW_ONLY = process.argv.includes('--flow-only');
const OUT = path.resolve('docs/app/flow-v1');
const GATE = `${OUT}/gate`;
const SNAP = `${OUT}/.snapshots.json`;
const VIEW = { width: 390, height: 844 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await mkdir(GATE, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const errors = [];
const log = [];
const watch = (page, tag) => {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`);
    if (m.type() === 'warning' && m.text().includes('[save]')) errors.push(`${tag}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${tag}: ${String(e)}`));
};
const dumpLS = (page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('mong.')).map((k) => [k, localStorage.getItem(k)])));

let snapshots = {};
if (!GATE_ONLY) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  watch(page, 'flow');
  const shot = async (name, note) => {
    await page.screenshot({ path: `${OUT}/${name}.png` });
    const save = await page.evaluate(() => {
      const raw = localStorage.getItem('mong.save.main');
      if (!raw) return null;
      const j = JSON.parse(raw);
      const s = j.sim.state;
      return { phase: s.phase, dayIndex: s.dayIndex, strokes: j.strokes.length, cards: s.cards.length, pendingCard: !!s.pendingCard, strokeUsed: s.ledger.strokeUsed, grindMs: s.ledger.grindMs, holdMs: s.ledger.holdMs, bytes: raw.length, backup: !!localStorage.getItem('mong.save.backup') };
    });
    log.push({ name, note, save });
    console.log(name, JSON.stringify(save));
  };
  const tid = (id) => page.locator(`[data-testid="${id}"]`).first();
  const cx = VIEW.width / 2;
  const cy = VIEW.height * 0.62;

  // 1. 설치 전 인트로(자막 없음), 탭 전 새로고침 → 다시 인트로
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 90000 });
  await sleep(600);
  await shot('01-install-blank', '빈 한지(0~2초) · 글자 없음');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 60000 });
  await sleep(6600);
  await shot('02-ask', '탭 전 새로고침 → 다시 인트로 · 6초 "만져 볼래요?"');

  // 2. 첫 탭 → 눈 → 기쁨 → 낮 홈(붓만)
  await page.mouse.click(cx, cy);
  await sleep(1600);
  await shot('03-first-tap-eyes', '첫 탭 = 설치 → 눈이 처음 열림');
  await sleep(4000);
  await shot('04-joy', '기쁨(열림 + 5.6초)');
  await sleep(2200);
  await shot('05-day-first', '낮 홈 · 붓만 · "오늘의 한 획을 그어 주세요"');

  // 3. 붓 → 긋기 모드(지시문·알약 없음, 젖은 자국) → 한 획
  await tid('obj-brush').click();
  await sleep(700);
  await shot('06-stroke-mode', '긋기 모드 · 위쪽 비움 · 젖은 자국');
  const pts = [];
  for (let i = 0; i <= 30; i++) {
    const a = ((175 + 80 * (i / 30)) * Math.PI) / 180;
    pts.push([cx + Math.cos(a) * 62, cy - 4 + Math.sin(a) * 50]);
  }
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) {
    await page.mouse.move(x, y, { steps: 2 });
    await sleep(16);
  }
  await page.mouse.up();
  await sleep(2000);
  await shot('07-attached-jar', '부착 + 기쁨 · 연적이 숨 쉼(씻기 5초)');
  await page.mouse.move(cx - 80, cy - 120);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy - 160, { steps: 12 });
  await page.mouse.up();
  await sleep(400);
  await shot('08-second-in-wash', '씻기 창 안 두 번째 획 → "연적 물로 씻으면…"(sim 판정)');
  await sleep(5900);
  // 4. 낮 홈 복귀: 낙관 '탁' → 제목 → 벼루 → 연적
  await shot('09-reveal-seal', '등장 순서: 낙관·제목');
  await sleep(1400);
  await shot('10-reveal-ink', '벼루');
  await sleep(1500);
  await shot('11-reveal-all', '연적까지');
  // 5. 붓 막힘(긋기 모드에 들어가지 않음)
  await tid('obj-brush').click();
  await sleep(500);
  await shot('12-brush-blocked', '오늘 그은 뒤 붓 → 부드러운 거절, 긋기 모드 진입 없음');
  // 6. 몽망이 문지르기(미세 이동) + 벼루
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(cx + Math.sin(i / 2) * 6, cy + Math.cos(i / 2) * 4);
    await sleep(60);
  }
  await page.mouse.up();
  const ink = await tid('obj-inkstone').boundingBox();
  await page.mouse.move(ink.x + ink.width / 2, ink.y + 20);
  await page.mouse.down();
  await sleep(2000);
  await page.mouse.up();
  await sleep(300);
  await shot('13-rub-grind', '문지르기(holdMs·moveSpeed) + 벼루 2초 → 먹물');
  snapshots.day1 = await dumpLS(page);

  // 7. 연적 → 조수(연속) → 밤 → 안심 문구 → 알림 사전 문구
  await tid('obj-dropper').click();
  const tideAt = [300, 900, 1700, 2500];
  for (let i = 0; i < tideAt.length; i++) {
    await sleep(tideAt[i] - (tideAt[i - 1] ?? 0));
    await shot(`14-tide-${i}`, `조수 ${tideAt[i]}ms`);
  }
  await sleep(1200);
  await shot('15-night-soothe', '첫 밤 안심 문구');
  await sleep(2800);
  await shot('16-notif-prompt', '안심 문구 뒤 앱 안 사전 문구(알림)');
  snapshots.night = await dumpLS(page);
  await tid('notif-yes').click();
  await sleep(1200);
  await shot('17-night-wake-line', '밤 · "아직 자고 있어요 · ○시쯤 깨요"');

  // 8. 다음 아침 → 건져 올리기(연속) → 카드
  await tid('dev-toggle').click();
  await sleep(300);
  await tid('dev-morning').click();
  await sleep(300);
  await tid('dev-toggle').click();
  await sleep(1600);
  await shot('18-morning-water', '아침 · 물 위 젖은 한지 · 몽망이가 함께 봄');
  snapshots.morning = await dumpLS(page);
  const sheet = await tid('dream-sheet').boundingBox();
  await page.mouse.move(sheet.x + sheet.width / 2, sheet.y + sheet.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(sheet.x + sheet.width / 2, sheet.y + sheet.height / 2 - i * 16);
    await sleep(16);
  }
  await page.mouse.up();
  const liftAt = [300, 900, 1500, 2000, 2600];
  for (let i = 0; i < liftAt.length; i++) {
    await sleep(liftAt[i] - (liftAt[i - 1] ?? 0));
    await shot(`19-lift-${i}`, `건져 올린 뒤 ${liftAt[i]}ms(물 빠짐 1600 + 카드 800)`);
  }
  await sleep(600);
  await shot('20-dream-card', '인화 카드 + 아침 문장');

  // 9. 낮으로 → 이튿날, 새로고침 복원, 공방 노트
  await tid('card-done').click();
  await sleep(3500);
  await shot('21-day2-home', '이튿날 낮 · 붓 다시 진함');
  snapshots.day2 = await dumpLS(page);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 60000 });
  await sleep(3500);
  await shot('22-reload-restored', '새로고침(콜드 스타트) → 인트로 없이 이튿날');
  await tid('seal').click();
  await sleep(150);
  await shot('23-note-sliding', '노트 올라오는 중 · 배경은 제자리 페이드');
  await sleep(700);
  await shot('24-note', '공방 노트 · 먹·한지 토글');
  // 메타 손상 → 그래도 인트로로 돌아가지 않는다
  await page.evaluate(() => localStorage.setItem('mong.meta', '{broken'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 60000 });
  await sleep(3500);
  await shot('25-meta-corrupt', '메타 손상 후 새로고침 → 인트로 없이 낮 홈(설치 판정 = 세이브)');
  const a11y = await page.evaluate(() => [...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')));
  log.push({ name: 'aria', a11y });
  await ctx.close();
  await writeFile(SNAP, JSON.stringify(snapshots));
} else {
  snapshots = JSON.parse(await readFile(SNAP, 'utf8'));
}

// ── 2부: 품질 관문 ──
const WIDTHS = FLOW_ONLY ? [] : process.env.GATE_WIDTHS ? process.env.GATE_WIDTHS.split(',').map(Number) : [320, 360, 390, 412, 430];
const HEIGHT_OF = { 320: 568, 360: 780, 390: 844, 412: 915, 430: 932 };
const SCALES = [1, 1.5, 2];
const gate = [];
for (const w of WIDTHS) {
  for (const fs of SCALES) {
    const tag = `w${w}-fs${Math.round(fs * 100)}`;
    const shots = [
      ['day', snapshots.day2, null],
      ['stroke', snapshots.day2, 'stroke'],
      ['note', snapshots.day2, 'note'],
      ['night', snapshots.night, null],
      ['morning', snapshots.morning, null],
    ];
    for (const [scr, ls, action] of shots) {
      const ctx = await browser.newContext({ viewport: { width: w, height: HEIGHT_OF[w] }, deviceScaleFactor: 2 });
      await ctx.addInitScript((data) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
      }, ls);
      const page = await ctx.newPage();
      watch(page, `${tag}-${scr}`);
      await page.goto(`${BASE}/?fs=${fs}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('canvas', { timeout: 60000 });
      await sleep(scr === 'day' || action ? 3600 : 2200);
      if (action === 'stroke') {
        await page.locator('[data-testid="obj-brush"]').first().click();
        await sleep(800);
      }
      if (action === 'note') {
        await page.locator('[data-testid="seal"]').first().click();
        await sleep(900);
      }
      // 사물 터치 영역 겹침 검사
      const boxes = await page.evaluate(() =>
        ['obj-brush', 'obj-inkstone', 'obj-dropper'].map((id) => {
          const el = document.querySelector(`[data-testid="${id}"]`);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { id, l: r.left, r: r.right };
        }),
      );
      const b = boxes.filter(Boolean);
      const overlap = b.some((x, i) => i > 0 && x.l < b[i - 1].r - 0.5);
      await page.screenshot({ path: `${GATE}/${tag}-${scr}.png` });
      gate.push({ tag, scr, overlap });
      await ctx.close();
    }
    console.log('gate', tag);
  }
}
if (!process.env.GATE_WIDTHS) await writeFile(`${OUT}/flow-log.json`, JSON.stringify({ base: BASE, view: VIEW, steps: log, gate, errors }, null, 2));
console.log('errors', errors.length, errors.slice(0, 6));
console.log('overlaps', gate.filter((g) => g.overlap).map((g) => `${g.tag}-${g.scr}`));
await browser.close();
