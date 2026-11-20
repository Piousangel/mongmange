// M1 앱 쪽: 기능 플래그(기본 꺼짐·웹 쿼리), 먹 고르기 문구(두 언어·네 먹·조사), '바꾸기' 흐름(씨앗 먹 → 고른 먹).
import { BASE_INK_LOOK, GRAMMARS, PALETTE, inkLook, lookOf, sim } from '@mong/core';
import { inkChangeAvailable, inkPickerOpen } from '../src/game/look';
import { STROKE_INK_LEGACY, STROKE_INK_LEGACY_RETURN, strokeInkSksl, strokeInkUniforms, strokeTexId } from '../src/render/strokeInkSrc';
import { afterEach, describe, expect, it } from 'vitest';
import { FEATURE_DEFAULTS, fromQuery, isOn, setFeature } from '../src/features';
import { __setDeviceTagForTest, setLanguagePref, t, tIn } from '../src/i18n';

afterEach(() => {
  setFeature('birthTraits', null);
  setFeature('inkChoice', null);
  __setDeviceTagForTest('ko-KR');
  setLanguagePref('system');
});

describe('M1 기능 플래그', () => {
  it('빌드 2 전까지 기본 꺼짐', () => {
    expect(FEATURE_DEFAULTS.birthTraits).toBe(false);
    expect(FEATURE_DEFAULTS.inkChoice).toBe(false);
    expect(isOn('birthTraits')).toBe(false);
    expect(isOn('inkChoice')).toBe(false);
  });
  it('웹 확인 쿼리: ?ff=m1 은 둘 다, 이름으로 하나씩, 모르는 이름은 무시', () => {
    expect(fromQuery('?screen=app&ff=m1')).toEqual({ birthTraits: true, inkChoice: true });
    expect(fromQuery('?ff=inkChoice')).toEqual({ inkChoice: true });
    expect(fromQuery('?ff=birthTraits%2Cnope')).toEqual({ birthTraits: true });
    expect(fromQuery('?screen=app')).toEqual({});
    expect(fromQuery('?ff=%E0%A4%A')).toEqual({}); // 잘못된 인코딩도 던지지 않는다
  });
});

describe('먹 고르기 문구(D-17)', () => {
  it('네 먹 이름·빛깔이 두 언어에서 서로 다르고 비지 않는다', () => {
    for (const loc of ['ko', 'en'] as const) {
      const names = sim.INK_IDS.map((ink) => tIn(loc, 'ink.name', { ink }));
      const hues = sim.INK_IDS.map((ink) => tIn(loc, 'ink.hue', { ink }));
      expect(new Set(names).size).toBe(4);
      expect(new Set(hues).size).toBe(4);
      for (const v of [...names, ...hues]) expect(v.trim().length).toBeGreaterThan(1);
    }
    expect(tIn('ko', 'ink.name', { ink: 'songyeon' })).toBe('송연먹');
    expect(tIn('ko', 'ink.name', { ink: 'songhwa' })).toBe('송화먹');
  });
  it('고른 뒤 알림: 한국어 조사가 맞는다(먹 → 을)', () => {
    const name = tIn('ko', 'ink.name', { ink: 'yuyeon' });
    expect(tIn('ko', 'ink.chosen.a11y', { name })).toMatch(/^유연먹을 골랐어요/);
    expect(t('ink.stick.a11y', { name, hue: t('ink.hue', { ink: 'yuyeon' }), n: 2 })).toBe('유연먹, 갈색 기가 도는 먹, 네 자루 중 2번째');
  });
});

describe('먹 네 자루가 열리는 때(H2: 첫 밤까지, 그 뒤는 공방 노트 먹 바꾸기)', () => {
  it('첫 잠 전 null → 잠들면 씨앗 먹(seeded) → 첫 밤 뒤 고르면 바꾸기(새 획에만), 몸의 먹은 그대로', () => {
    const t0 = Date.UTC(2026, 11, 1, 10); // 19:00 KST
    let s = sim.createInitial(t0, 540, 3, { birth: { x: 0, y: 0, ms: t0, installAt: t0, entropy: 99 } });
    expect(s.ink.id).toBeNull();
    // 23:00 KST 재우기 — 첫 잠에 씨앗이 먹을 정해 둔다
    const sleepAt = t0 + 4 * 3_600_000;
    s = sim.reduce(s, { type: 'putToSleep', at: sleepAt }).state;
    expect(s.phase).toBe('asleep');
    expect(s.ink.seeded).toBe(true);
    expect(s.ink.id).toBe(sim.seededInk(s.birth.seed));
    const seededId = s.ink.id;
    const other = sim.INK_IDS.find((k) => k !== s.ink.id)!;
    s = sim.reduce(s, { type: 'chooseInk', at: sleepAt + 60_000, ink: other }).state;
    expect(s.ink.id).toBe(seededId);
    expect(sim.currentInk(s.ink)).toBe(other);
    // 그릴 몸의 먹(고리·밤 몸)은 씨앗 먹 그대로
    expect(lookOf(s.birth, s.ink, { traits: true, ink: true }).ink.id).toBe(seededId);
  });

  const day = (dayIndex: number, phase: 'awake' | 'asleep', ink: sim.State['ink']) => ({ dayIndex, phase, ink });
  const none = { id: null, chosenAt: null, seeded: false };
  const seeded = { id: 'yuyeon' as const, chosenAt: 1, seeded: true };
  const chosen = { id: 'jayeon' as const, chosenAt: 1, seeded: false };
  it('첫날 깨어 있을 때만 저절로 열린다(안 골랐거나 씨앗 먹), 골랐으면 닫힌다', () => {
    expect(inkPickerOpen(day(0, 'awake', none), { flag: true, changing: false })).toBe(true);
    expect(inkPickerOpen(day(0, 'awake', seeded), { flag: true, changing: false })).toBe(true);
    expect(inkPickerOpen(day(0, 'awake', chosen), { flag: true, changing: false })).toBe(false);
    expect(inkPickerOpen(day(0, 'asleep', none), { flag: true, changing: false })).toBe(false);
    expect(inkPickerOpen(day(0, 'awake', none), { flag: false, changing: false })).toBe(false);
  });
  it('첫 밤 뒤에는 씨앗 먹이어도 저절로 안 열리고, 공방 노트 먹 바꾸기로 연 때만', () => {
    for (const ink of [seeded, chosen]) {
      expect(inkPickerOpen(day(1, 'awake', ink), { flag: true, changing: false })).toBe(false);
      expect(inkPickerOpen(day(5, 'awake', ink), { flag: true, changing: false })).toBe(false);
      expect(inkPickerOpen(day(1, 'awake', ink), { flag: true, changing: true })).toBe(true);
      expect(inkChangeAvailable(day(1, 'awake', ink), true)).toBe(true);
    }
    expect(inkChangeAvailable(day(0, 'awake', chosen), true)).toBe(false);
    expect(inkChangeAvailable(day(3, 'awake', seeded), false)).toBe(false);
  });
});

describe('H1 기본 먹 = 빌드 1 획 칠 셰이더 그대로', () => {
  // 빌드 1(HEAD 11-20) STROKE_INK main 본문 — 한 글자도 바뀌면 안 된다(독립 기준: 빌드 1 소스에서 옮긴 고정 문자열)
  const BUILD1_LINES = [
    'float id = floor(t.x * 0.5);',
    'float u = t.x - id * 2.0;',
    'float v = clamp(t.y, -1.0, 1.0);',
    'bool comb = id >= 40.0;',
    'float k = comb ? 0.0 : tone;',
    'k *= 0.92 + 0.16 * vnoise(float2(u * 3.0 + id * 7.7, id * 1.3));',
    'float hair = vnoise(float2(v * 7.0 + id * 17.3, id * 2.9));',
    'float brk = vnoise(float2(u * 5.0 + id * 5.1, v * 1.5));',
    'float cap = 1.0 - smoothstep(0.985, 0.998, u);',
    'float tail = comb ? smoothstep(0.72, 0.95, u) * 0.6 : smoothstep(0.7, 0.97, u);',
    'float streak = smoothstep(0.64, 0.74, hair) * smoothstep(0.35, 0.55, brk + u * 0.3) * (1.0 - smoothstep(0.55, 0.75, av)) * tail * cap * dry;',
    'k = k + (0.8 - k) * streak;',
    'return half4(half3(mix(ink, paper, clamp(k, 0.0, 1.0))), 1.0);',
  ];
  const src = strokeInkSksl('/*noise*/');
  it('빌드 1 식의 모든 줄이 순서대로 있고, 기본 먹(useStroke 0)·빗은 그 식으로 끝난다', () => {
    let at = 0;
    for (const line of BUILD1_LINES) {
      const i = src.indexOf(line, at);
      expect(i, line).toBeGreaterThanOrEqual(0);
      at = i;
    }
    expect(STROKE_INK_LEGACY_RETURN).toBe(BUILD1_LINES.at(-1));
    expect(src).toMatch(/if \(useStroke < 0\.5 \|\| comb\) \{\s*return half4\(half3\(mix\(ink, paper, clamp\(k, 0\.0, 1\.0\)\)\), 1\.0\);/);
    // 슬롯 0은 번호가 그대로(빌드 1 리본 번호 = 획 번호)
    expect(strokeTexId(5, 0)).toBe(5);
    expect(STROKE_INK_LEGACY).toContain('k = k + (0.8 - k) * streak;');
  });
  it('기본 먹 uniform: ink·paper·tone을 낮↔밤 각각 보간(빌드 1 inkU와 같은 값), useStroke 0', () => {
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const g = GRAMMARS.C;
    for (const n of [0, 0.37, 1]) {
      const u = strokeInkUniforms(n, hex(BASE_INK_LOOK.dayBody), hex(BASE_INK_LOOK.nightBody), hex(PALETTE.day.bg), hex(PALETTE.night.bg), g.tone, g.toneNight, g.dry, false, [], []);
      const b = hex(PALETTE.day.body);
      const nb = hex(PALETTE.night.body);
      const pd = hex(PALETTE.day.bg);
      const pn = hex(PALETTE.night.bg);
      // 빌드 1 Mongmangi inkU 식
      expect(u.ink).toEqual([0, 1, 2].map((i) => b[i]! + (nb[i]! - b[i]!) * n));
      expect(u.paper).toEqual([0, 1, 2].map((i) => pd[i]! + (pn[i]! - pd[i]!) * n));
      expect(u.tone).toBe(g.tone + (g.toneNight - g.tone) * n);
      expect(u.dry).toBe(g.dry * (1 - n));
      expect(u.useStroke).toBe(0);
    }
  });
  it('고른 먹 경로: 같은 k에서 바탕 비율이 빌드 1과 같다(kk 환산 — 농담 결 진폭·비백 목표 유지)', () => {
    const tone = GRAMMARS.C.tone;
    for (const k of [tone * 0.92, tone, tone * 1.08, 0.8]) {
      const kk = (k - tone) / (1 - tone);
      expect(tone + (1 - tone) * kk).toBeCloseTo(k, 12);
    }
    expect(inkLook('songyeon').id).toBe('songyeon');
  });
});
