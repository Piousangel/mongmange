// 새 컨셉 v3 앱 층(리뷰 2026-11-25-v3-slice H1·H2·M1·M2·M4·M5): store v3 경로, 스크린리더로 한 마디까지, 쓴 글자 남기지 않기,
// 배고픔 낱말 기쁨 호 없음, 곁 대답이 따로 드러나지 않음, 맡겨 두기와 함께 켜지지 않음.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SAVE_KEYS, sim, v3, writeSave, type KV, type RawPoint } from '@mong/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isOn, setFeature } from '../src/features';
import { __configureForTest, adoptState, boot, devReset, devRestartV3, dispatch, getSnapshot, getV3, install } from '../src/game/store';
import { A11Y_GRIND_MS, WORD_SHEET_INITIAL, cueOf, inkstoneA11yActions, sheetGrindMode, sheetGrindStep, wordSheetClose, wordSheetOnAppState } from '../src/game/v3Flow';
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

  it('맡겨 두기 복원은 v3 모드에서 거부, 맡겨 두기 플래그는 v3와 함께 켜지지 않는다(M5)', () => {
    boot();
    install();
    expect(adoptState(sim.createInitial(KST_NOON, 540, 9))).toBe(false);
    setFeature('cloud', true);
    expect(isOn('cloud')).toBe(false);
    setFeature('conceptV3', false);
    expect(isOn('cloud')).toBe(true);
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
  it('앱은 스크린리더 여부로 시트 갈기 방식을 고른다', () => {
    const app = readFileSync(path.join(__dirname, '../src/game/GameApp.tsx'), 'utf8');
    expect(app).toContain('grindMode={sheetGrindMode(screenReader)}');
    const sheet = readFileSync(path.join(__dirname, '../src/screens/V3Sheets.tsx'), 'utf8');
    expect(sheet).toContain('sheetGrindStep(');
  });
});
