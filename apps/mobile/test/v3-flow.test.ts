// 새 컨셉 v3 앱 층(리뷰 2026-11-25-v3-slice H1·H2·M1·M2·M4·M5): store v3 경로, 스크린리더로 한 마디까지, 쓴 글자 남기지 않기,
// 배고픔 낱말 기쁨 호 없음, 곁 대답이 따로 드러나지 않음, 맡겨 두기는 V27b 뒤로 함께 켤 수 있음(v3 본문은 cloud-v3 시험).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { PING_EVENTS } from '@mong/contract';
import { SAVE_KEYS, sim, v3, writeSave, type KV, type RawPoint } from '@mong/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isOn, setFeature } from '../src/features';
import { __configureForTest, adoptState, boot, devReset, devRestartV3, dispatch, getSnapshot, getV3, install } from '../src/game/store';
import { A11Y_GRIND_MS, WORD_SHEET_INITIAL, cueOf, inkstoneA11yActions, sheetGrindMode, sheetGrindOn, sheetGrindStep, wordSheetClose, wordSheetOnAppState } from '../src/game/v3Flow';
import { messages } from '../src/i18n';
import { CUE, answerPose, cueLength } from '../src/render/answer';

const KST_NOON = Date.UTC(2026, 10, 25, 3, 0);
function memKV(): KV & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getString: (k) => m.get(k), set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
}
/** 몸 오른쪽에서 바깥으로 휘는 결정적 손획(core 시험 도우미와 같은 모양) */
function handStroke(seed = 1, ms = 900, n = 90): RawPoint[] {
  const out: RawPoint[] = [];
  const a0 = 1.4 + (seed % 5) * 0.5;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const th = a0 + u * 1.2;
    const r = 0.56 + u * 0.2;
    out.push({ x: Math.sin(th) * r, y: -Math.cos(th) * r, t: Math.round(u * ms) });
  }
  return out;
}
const wordOf = (text: string) => ({ ...v3.storedWordOf(v3.interpretWord(text, 'ko')), lexVer: v3.LEX_VER, source: 'keyboard' as const });

let t = KST_NOON;
let kv = memKV();
beforeEach(() => {
  t = KST_NOON;
  kv = memKV();
  setFeature('conceptV3', true);
  __configureForTest({ kv, now: () => t });
});
afterEach(() => {
  setFeature('conceptV3', null);
  setFeature('cloud', null);
});

describe('store v3 경로', () => {
  it('옛 세이브(v2)가 있어도 1일차(설치 전)부터, v2는 그대로 + 보관 키에 복사', () => {
    writeSave(kv, sim.createInitial(KST_NOON - 86_400_000 * 5, 540, 3), KST_NOON - 1000);
    const v2 = kv.m.get(SAVE_KEYS.main)!;
    boot();
    expect(getSnapshot().state).toBeNull();
    expect(getSnapshot().v3).toBeNull();
    expect(kv.m.get(v3.V3_KEYS.archiveV2)).toBe(v2);
    install({ x: 0, y: 0 });
    expect(getSnapshot().v3).not.toBeNull();
    expect(kv.m.has(v3.V3_KEYS.main)).toBe(true);
    expect(kv.m.get(SAVE_KEYS.main)).toBe(v2);
  });

  it('스크린리더 흐름: 벼루 두 번 탭(먹 갈기) → 한 마디 → 저장 → 다시 켜도 그대로', () => {
    boot();
    install({ x: 0, y: 0 });
    expect(v3.writeBlock(getV3()!)).toBe('noInk');
    // 벼루 접근성 동작의 두 번 탭(activate) = 먹 갈기
    const acts = inkstoneA11yActions({ grind: 'g', sheet: 's' });
    expect(acts[0]).toEqual({ name: 'activate', label: 'g' });
    t += 1000;
    dispatch({ type: 'grind', durationMs: A11Y_GRIND_MS });
    expect(v3.inkCells(getV3()!)).toBe(v3.WORD_MAX_CHARS);
    expect(v3.writeBlock(getV3()!)).toBeNull();
    t += 1000;
    const eff = dispatch({ type: 'write', word: wordOf('행복해'), chars: 3, raw: handStroke(1) });
    expect(eff.some((e) => e.type === 'wordAccepted')).toBe(true);
    const saved = kv.m.get(v3.V3_KEYS.main)!;
    expect(saved).not.toContain('행복');
    __configureForTest({ kv, now: () => t });
    setFeature('conceptV3', true);
    boot();
    expect(getSnapshot().v3!.words).toHaveLength(1);
  });

  it('처음부터 다시 = v3만 지움(v2·보관본 그대로), 세이브 초기화도 v3 모드에서는 v2를 지우지 않는다', () => {
    writeSave(kv, sim.createInitial(KST_NOON - 86_400_000, 540, 3), KST_NOON - 1000);
    const v2 = kv.m.get(SAVE_KEYS.main)!;
    boot();
    install();
    devRestartV3();
    expect(getSnapshot().state).toBeNull();
    expect(kv.m.has(v3.V3_KEYS.main)).toBe(false);
    expect(kv.m.get(SAVE_KEYS.main)).toBe(v2);
    install();
    devReset();
    expect(kv.m.has(v3.V3_KEYS.main)).toBe(false);
    expect(kv.m.get(SAVE_KEYS.main)).toBe(v2);
    expect(kv.m.get(v3.V3_KEYS.archiveV2)).toBe(v2);
  });

  it('설치 = 타고남 씨앗으로 처음 공방(V9b T-2 좋아하는 것 예외) — 다시 켜도 같은 공방(리뷰 L2)', () => {
    boot();
    let liking = 0;
    for (let i = 0; i < 300 && liking < 3; i++) {
      install();
      const st = getSnapshot().state!;
      const block = getV3()!.v3;
      expect(block).toEqual(v3.emptyV3Block(st.birth.seed));
      expect(v3.parseV3(kv.m.get(v3.V3_KEYS.main)!).v3.pantry).toEqual(block.pantry);
      if (v3.likedItemOf(st.birth.seed) === 'dewdrop') {
        liking++;
        expect(block.pantry.treat).toEqual(['pattern', 'dewdrop']);
      } else expect(block.pantry.treat).toEqual(['pattern']);
      devRestartV3();
    }
    expect(liking).toBe(3);
  });
  it('v3 모드에서 옛 세이브(v2) 복원은 거부(v2 키는 보관만), 맡겨 두기 플래그는 V27b 뒤로 v3와 함께 켤 수 있다(M5 풀림)', () => {
    boot();
    install();
    expect(adoptState(sim.createInitial(KST_NOON, 540, 9))).toBe(false);
    setFeature('cloud', true);
    expect(isOn('cloud')).toBe(true);
    setFeature('cloud', null);
  });
});

describe('대답 신호', () => {
  const eyesOver = (c: ReturnType<typeof cueOf>, rm: boolean) => {
    const out = new Set<string>();
    const cv = { ...c, at: 0 };
    for (let ms = 0; ms <= cueLength(c.kind); ms += 25) {
      const p = answerPose(cv, ms, rm);
      if (p.eyeMix > 0) out.add(p.eyeB);
    }
    return out;
  };
  it('배고픔 낱말(home.in.meal)에는 기쁨 호가 없다(QA-3 R4-3)', () => {
    for (const w of ['배고파', '꼬르륵']) {
      const a = v3.interpretWord(w, 'ko');
      expect(a).toMatchObject({ kind: 'sense', sense: 'home.in.meal' });
      const c = cueOf(a, 0, 0, 1);
      expect(c.kind).toBe(CUE.look);
      expect(eyesOver(c, false).has('joy')).toBe(false);
      expect(eyesOver(c, true).has('joy')).toBe(false);
    }
    // hungry(영어)·과장도 같은 결
    expect(cueOf(v3.interpretWord('hungry', 'en'), 0, 0, 1).kind).toBe(CUE.look);
    expect(cueOf(v3.interpretWord('starving', 'en'), 0, 0, 1).kind).toBe(CUE.look);
    expect(cueOf(v3.interpretWord('배고파죽겠다', 'ko'), 0, 0, 1).kind).toBe(CUE.look);
  });
  it('음식·맛 낱말(밥·치킨·맛있어·yummy)은 기쁨을 유지한다(care-rituals 2-5 R4-3, 리뷰 2차 L-a)', () => {
    for (const [w, lang] of [['밥', 'ko'], ['치킨', 'ko'], ['맛있어', 'ko'], ['맛있어죽겠다', 'ko'], ['yummy', 'en'], ['pizza', 'en']] as const) {
      const a = v3.interpretWord(w, lang);
      expect(a, w).toMatchObject({ kind: 'sense', sense: 'home.in.meal' });
      const c = cueOf(a, 0, 0, 1);
      expect(c.kind, w).toBe(CUE.home);
      expect(eyesOver(c, false).has('joy'), w).toBe(true);
    }
  });
  it('곁 대답은 넓은 그물 가라앉음 대답과 같은 모양 — 위기만의 몸짓·길이가 없다(M2)', () => {
    const stay = cueOf({ kind: 'stay', level: 'strong' }, 5, 6, 1);
    const soft = cueOf({ kind: 'stay', level: 'soft' }, 5, 6, 1);
    const lonely = cueOf({ kind: 'sense', sense: 'low.out.lonely', intensity: 1, net: true }, 5, 6, 1);
    expect(stay).toEqual(lonely);
    expect(soft).toEqual(lonely);
    expect(Object.keys(CUE)).not.toContain('stay');
    for (const ms of [0, 600, 1500, 2500, 3500]) expect(answerPose({ ...stay, at: 0 }, ms, false)).toEqual(answerPose({ ...lonely, at: 0 }, ms, false));
  });
  it('스크린리더 알림은 모든 대답에 같은 한 줄(위기 판정으로 갈리는 알림 없음)', () => {
    const src = readFileSync(path.join(__dirname, '../src/game/GameApp.tsx'), 'utf8');
    const block = src.slice(src.indexOf("case 'wordAccepted'"), src.indexOf("case 'writeRejected'"));
    expect(block).toContain("t('v3.answer.a11y')");
    expect(block).not.toMatch(/'stay'/);
    expect(src).not.toContain('v3.stay.a11y');
  });
});

describe('확정하지 않은 글자를 남기지 않는다(H2)', () => {
  it('일시 비활성(inactive: 제어 센터·알림 끌어내리기)은 쓰던 글자를 두고 가림막만, background에서만 버린다(리뷰 2차 L-b)', () => {
    const open = { ...WORD_SHEET_INITIAL, open: true };
    const ina = wordSheetOnAppState(open, 'inactive');
    expect(ina).toEqual({ open: true, key: 0, cover: true });
    // inactive에서 돌아오면 가림막만 내리고 같은 입력칸(key 그대로)
    expect(wordSheetOnAppState(ina, 'active')).toEqual({ open: true, key: 0, cover: false });
    // 앱 전환기(iOS: inactive → background), Android(바로 background), 알 수 없는 상태 → 버린다
    for (const from of [ina, open])
      for (const st of ['background', 'unknown']) {
        const n = wordSheetOnAppState(from, st);
        expect(n).toEqual({ open: false, key: 1, cover: true });
        expect(wordSheetOnAppState(n, 'active')).toEqual({ open: false, key: 1, cover: false });
      }
    // 닫혀 있었으면 가림막 없음
    expect(wordSheetOnAppState(WORD_SHEET_INITIAL, 'inactive')).toEqual(WORD_SHEET_INITIAL);
    expect(wordSheetOnAppState(WORD_SHEET_INITIAL, 'background').cover).toBe(false);
    expect(wordSheetClose(open)).toEqual({ open: false, key: 1, cover: false });
  });
  it('앱은 앱 상태가 바뀔 때마다 이 규칙을 쓰고, 시트는 key로 새로 그려지며 숨김에서 입력칸을 비운다', () => {
    const app = readFileSync(path.join(__dirname, '../src/game/GameApp.tsx'), 'utf8');
    expect(app).toMatch(/AppState\.addEventListener\('change', \(st\) => \{\s*setWordSheet\(\(cur\) => wordSheetOnAppState\(cur, st\)\)/);
    expect(app).toContain('key={wordSheet.key}');
    expect(app).toContain('testID="v3-privacy-cover"');
    // 시트(Modal)는 앱 화면 위 창이라 바깥 가림막이 덮지 못한다 — 시트 안에도 가림막(BottomSheet overlay)
    expect(app).toContain('covered={wordSheet.cover}');
    const sheet = readFileSync(path.join(__dirname, '../src/screens/V3Sheets.tsx'), 'utf8');
    expect(sheet).toMatch(/if \(!visible\) setRaw\(''\)/);
    expect(sheet).toMatch(/overlay=\{covered \?/);
    expect(sheet).toContain('testID="v3-word-cover"');
  });
});

describe('벼루 시트 먹 갈기(리뷰 2차 L-d)', () => {
  it('스크린리더는 한 번에 6칸(H1), 보는 사용자는 눌러 시작·눌러 멈춤', () => {
    expect(sheetGrindMode(true)).toBe('all');
    expect(sheetGrindMode(false)).toBe('flow');
  });
  it('시트 갈기는 길게 누르기와 같은 속도로 칸이 차오르고, 6칸에서 저절로 멈춘다(그 위 보상 없음)', () => {
    expect(sheetGrindStep(0, 0)).toEqual({ cells: 0, addMs: 0, done: false });
    for (const ms of [1, 1499, 1500, 3000, 6000, 7499]) {
      const st = sheetGrindStep(0, ms);
      expect(st.cells).toBe(v3.inkCellsOfMs(ms));
      expect(st.addMs).toBe(ms);
      expect(st.done).toBe(false);
    }
    expect(sheetGrindStep(0, 1500).cells).toBe(2);
    expect(sheetGrindStep(0, A11Y_GRIND_MS)).toEqual({ cells: v3.WORD_MAX_CHARS, addMs: A11Y_GRIND_MS, done: true });
    expect(sheetGrindStep(0, 99_999)).toEqual({ cells: v3.WORD_MAX_CHARS, addMs: A11Y_GRIND_MS, done: true });
    // 이미 간 먹에 이어서 — 넘치는 만큼은 넘기지 않는다
    expect(sheetGrindStep(3000, 99_999)).toEqual({ cells: v3.WORD_MAX_CHARS, addMs: A11Y_GRIND_MS - 3000, done: true });
    expect(sheetGrindStep(3000, 1500).cells).toBe(4);
    expect(sheetGrindStep(A11Y_GRIND_MS, 10)).toEqual({ cells: v3.WORD_MAX_CHARS, addMs: 0, done: true });
  });
  it('중간에 멈춰도 간 만큼은 남는다(D-03) — 시트에서 멈춘 양을 store에 넘기면 그 칸 수', () => {
    boot();
    install({ x: 0, y: 0 });
    t += 1000;
    dispatch({ type: 'grind', durationMs: sheetGrindStep(0, 3200).addMs });
    expect(v3.inkCells(getV3()!)).toBe(3);
    t += 1000;
    dispatch({ type: 'grind', durationMs: sheetGrindStep(getV3()!.sim.ledger.grindMs, 99_999).addMs });
    expect(v3.inkCells(getV3()!)).toBe(v3.WORD_MAX_CHARS);
  });
  it('멈춤 규칙: 다시 누름·6칸 닿음·시트 닫힘·앱 background에서 멈추고 그때까지 간 양을 넘긴다(L 리뷰 N2·N3)', () => {
    const T0 = 1_000_000;
    // 멈춰 있을 때: 누르면 시작, 그 밖 사건은 아무것도 아님
    expect(sheetGrindOn(null, { type: 'press', at: T0 }, 0)).toEqual({ startAt: T0, started: true, commitMs: null });
    for (const ev of [{ type: 'tick', at: T0 }, { type: 'hide', at: T0 }, { type: 'appState', state: 'background', at: T0 }] as const)
      expect(sheetGrindOn(null, ev, 0)).toEqual({ startAt: null, started: false, commitMs: null });
    // 다시 누름 → 멈춤
    expect(sheetGrindOn(T0, { type: 'press', at: T0 + 3200 }, 0)).toEqual({ startAt: null, started: false, commitMs: 3200 });
    // 6칸 전 tick은 계속, 6칸에 닿으면 저절로 멈춤(상한까지만)
    expect(sheetGrindOn(T0, { type: 'tick', at: T0 + 5000 }, 0)).toEqual({ startAt: T0, started: false, commitMs: null });
    expect(sheetGrindOn(T0, { type: 'tick', at: T0 + A11Y_GRIND_MS }, 0)).toEqual({ startAt: null, started: false, commitMs: A11Y_GRIND_MS });
    expect(sheetGrindOn(T0, { type: 'tick', at: T0 + A11Y_GRIND_MS - 3000 }, 3000)).toEqual({ startAt: null, started: false, commitMs: A11Y_GRIND_MS - 3000 });
    // 시트가 닫히면 멈춤
    expect(sheetGrindOn(T0, { type: 'hide', at: T0 + 2000 }, 0)).toEqual({ startAt: null, started: false, commitMs: 2000 });
    // background(알 수 없는 상태 포함)에서 멈춤 — 다음 깸으로 넘어가지 않게. inactive·active에서는 계속
    for (const st of ['background', 'unknown']) expect(sheetGrindOn(T0, { type: 'appState', state: st, at: T0 + 2500 }, 0)).toEqual({ startAt: null, started: false, commitMs: 2500 });
    for (const st of ['inactive', 'active']) expect(sheetGrindOn(T0, { type: 'appState', state: st, at: T0 + 2500 }, 0)).toEqual({ startAt: T0, started: false, commitMs: null });
  });
  it('앱 배선: 시트 갈기 상태는 앱이 쥐고, 앱 상태(sim 백그라운드 알림 전)·시트 닫힘·0.1초 tick이 멈춤 규칙을 부른다', () => {
    const app = readFileSync(path.join(__dirname, '../src/game/GameApp.tsx'), 'utf8');
    expect(app).toContain('grindMode={sheetGrindMode(screenReader)}');
    // 앱 상태: background 처리(goBackground) 전에 멈춰 그 깸 장부에 넣는다
    const listener = app.slice(app.indexOf("AppState.addEventListener('change'"), app.indexOf('goBackground();'));
    expect(listener).toContain("sheetGrind({ type: 'appState', state: st, at: Date.now() })");
    // 시트가 안 보이면(닫기·잠·아침) 멈춤
    expect(app).toMatch(/if \(!inkSheetShown\) sheetGrind\(\{ type: 'hide', at: Date\.now\(\) \}\)/);
    // 6칸 자동 멈춤은 tick이 멈춤 규칙을 부른다
    expect(app).toMatch(/setInterval\(\(\) => \{\s*setGrindNow\(Date\.now\(\)\);\s*sheetGrind\(\{ type: 'tick', at: Date\.now\(\) \}\);/);
    expect(app).toContain('visible={inkSheetShown}');
  });
});

describe('V27 밥·간식 앱 쪽(시트가 공방 데이터를 읽음 — 정식 시트는 V28)', () => {
  it('store v3 경로로 건네고 저장된다. 밥 알림 켜기도 v3 세이브에만 남는다', () => {
    boot();
    install({ x: 0, y: 0 });
    t += 1000;
    dispatch({ type: 'grind', durationMs: 800 });
    t += 1000;
    const eff = dispatch({ type: 'offer', kind: 'meal', item: 'clear' });
    expect(eff).toContainEqual({ type: 'received', kind: 'meal', item: 'clear', bow: false, liked: false });
    t += 1000;
    dispatch({ type: 'mealNudge', on: true });
    const saved = JSON.parse(kv.m.get(v3.V3_KEYS.main)!) as { v3: v3.V3Block };
    expect(saved.v3.meal).toEqual({ spoons: 1, treats: 0, nudgeOptIn: true });
    expect(kv.m.has(SAVE_KEYS.main)).toBe(false);
  });
  it('공방에 열릴 수 있는 여섯 종류 모두 ko·en 이름이 있다(시트 줄 라벨)', () => {
    for (const loc of ['ko', 'en'] as const) {
      const m = messages(loc) as Record<string, string>;
      for (const item of v3.LIKED_ITEMS) expect(m[`v3.item.${item}`], `${loc} ${item}`).toBeTruthy();
    }
  });
  it('시트는 mealSheet의 열린 종류로 줄을 만든다(종류를 화면에 박아 두지 않음)', () => {
    const src = readFileSync(path.join(__dirname, '../src/screens/V3Sheets.tsx'), 'utf8');
    expect(src).toMatch(/sheet\.meals\.map\(/);
    expect(src).toMatch(/sheet\.treats\.map\(/);
    expect(src).not.toMatch(/t\('v3\.item\.(clear|pattern)'\)/);
  });
  it('집계 핑 사건에 밥·간식·공방·마실 신호가 없다(care 2-3 위젯·집계, M6)', () => {
    expect(PING_EVENTS.filter((e) => /meal|treat|pantry|spoon|offer|feed|walk|nudge/i.test(e))).toEqual([]);
  });
});

describe('밥 반응 크기는 숟갈 수와 무관(QA-3 R7, V27 리뷰 M1)', () => {
  const over = (kind: number, rm: boolean) => {
    const eyes = new Set<string>();
    let gy = 0;
    let hop = 0;
    let mix = 0;
    const cv = { kind, intensity: 2, net: false, fromX: 0, fromY: 0, at: 0 };
    for (let ms = 0; ms <= cueLength(kind); ms += 10) {
      const p = answerPose(cv, ms, rm);
      if (p.eyeMix > 0) eyes.add(p.eyeB);
      gy = Math.max(gy, Math.abs(p.gy ?? 0));
      hop = Math.max(hop, Math.abs(p.hop ?? 0));
      mix = Math.max(mix, p.eyeMix);
    }
    return { eyes: [...eyes].sort(), gy: +gy.toFixed(4), hop: +hop.toFixed(4), mix: +mix.toFixed(4) };
  };
  for (const rm of [false, true])
    it(`${rm ? '모션 줄이기' : '보통'}: 1숟갈(meal)과 마지막 숟갈(mealBow)의 눈·끄덕 진폭·눈 세기가 같다(꾸벅 기울기만 다름)`, () => {
      expect(over(CUE.mealBow, rm)).toEqual(over(CUE.meal, rm));
      expect(over(CUE.meal, rm).eyes).toContain('joy');
    });
});

describe('공방 열림 문턱을 재촉 표시로 쓰지 않는다(V27 리뷰 L3, care 2-3 금지 묶음 4)', () => {
  it('앱 코드는 열림 문턱·경계 진행(PANTRY_OPENS·boundaryProgress)을 읽지 않는다', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = path.join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f)) files.push(p);
      }
    };
    walk(path.join(__dirname, '../src'));
    const hits = files.filter((p) => /PANTRY_OPENS|boundaryProgress|LIKED_FROM_SLEPT/.test(readFileSync(p, 'utf8')));
    expect(files.length).toBeGreaterThan(20);
    expect(hits).toEqual([]);
  });
  it('v3 문구에 남은 밤·정 카운트다운이 없다(ko·en)', () => {
    const BAN = /밤\s*더|정\s*더|남은\s*(밤|날)|며칠\s*더|조금만\s*더|곧\s*열|열리기까지|more nights?|nights? (to go|left)|days? left|until (it )?unlocks?|almost there/i;
    for (const loc of ['ko', 'en'] as const) {
      const m = messages(loc) as Record<string, string>;
      const bad = Object.entries(m).filter(([k, v]) => k.startsWith('v3.') && BAN.test(v));
      expect(bad, loc).toEqual([]);
    }
  });
});
