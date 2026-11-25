// 새 컨셉 v3 앱 층(리뷰 2026-11-25-v3-slice H1·H2·M1·M2·M4·M5): store v3 경로, 스크린리더로 한 마디까지, 쓴 글자 남기지 않기,
// 배고픔 낱말 기쁨 호 없음, 곁 대답이 따로 드러나지 않음, 맡겨 두기와 함께 켜지지 않음.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SAVE_KEYS, sim, v3, writeSave, type KV, type RawPoint } from '@mong/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isOn, setFeature } from '../src/features';
import { __configureForTest, adoptState, boot, devReset, devRestartV3, dispatch, getSnapshot, getV3, install } from '../src/game/store';
import { A11Y_GRIND_MS, WORD_SHEET_INITIAL, cueOf, inkstoneA11yActions, wordSheetClose, wordSheetOnAppState } from '../src/game/v3Flow';
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
    // hungry(영어)도 같은 결
    expect(cueOf(v3.interpretWord('hungry', 'en'), 0, 0, 1).kind).toBe(CUE.look);
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
  it('앱이 앞에서 벗어나면(inactive·background) 시트를 닫고 입력칸을 새로 만들고, 열려 있었으면 가림막', () => {
    const open = { ...WORD_SHEET_INITIAL, open: true };
    for (const st of ['inactive', 'background']) {
      const n = wordSheetOnAppState(open, st);
      expect(n).toEqual({ open: false, key: 1, cover: true });
      // 돌아오면 가림막만 내리고 시트는 닫힌 채(어제 글자가 다시 열리지 않음)
      expect(wordSheetOnAppState(n, 'active')).toEqual({ open: false, key: 1, cover: false });
    }
    // 닫혀 있었으면 가림막 없음
    expect(wordSheetOnAppState(WORD_SHEET_INITIAL, 'background').cover).toBe(false);
    expect(wordSheetClose(open)).toEqual({ open: false, key: 1, cover: false });
  });
  it('앱은 앱 상태가 바뀔 때마다 이 규칙을 쓰고, 시트는 key로 새로 그려지며 숨김에서 입력칸을 비운다', () => {
    const app = readFileSync(path.join(__dirname, '../src/game/GameApp.tsx'), 'utf8');
    expect(app).toMatch(/AppState\.addEventListener\('change', \(st\) => \{\s*setWordSheet\(\(cur\) => wordSheetOnAppState\(cur, st\)\)/);
    expect(app).toContain('key={wordSheet.key}');
    expect(app).toContain('testID="v3-privacy-cover"');
    const sheet = readFileSync(path.join(__dirname, '../src/screens/V3Sheets.tsx'), 'utf8');
    expect(sheet).toMatch(/if \(!visible\) setRaw\(''\)/);
  });
});
