// 아침 문장 키 → 한국어 한 줄, 날 세기, 깨는 시각 표기.
import { beforeEach, describe, expect, it } from 'vitest';
import { dayName, morningLine, wakeClock } from '../src/game/text';
import { setLanguagePref } from '../src/i18n';

const card = { night: 1, motifId: 'center.moon', composition: 0 as const, inkTone: 0.5, flow: 0, flowSeed: 1, strokeRef: null, nightsMerged: 1 };

describe('문구', () => {
  beforeEach(() => setLanguagePref('ko'));
  it('날 세기', () => {
    expect(dayName(0)).toBe('첫날');
    expect(dayName(6)).toBe('이레째');
    expect(dayName(14)).toBe('15일째');
  });
  it('change 문장은 원인 + 결과', () => {
    expect(morningLine({ kind: 'change', axis: 'tempo', keys: ['cause.speed.minus', 'effect.tempo.minus.bleed'] }, card)).toBe('어제 획을 천천히 그어서 먹이 느긋하게 번져요');
  });
  it('관찰 문장은 꿈 모티프', () => {
    expect(morningLine({ kind: 'observation', axis: null, keys: ['obs.dream.center.moon'] }, card)).toBe('간밤엔 둥근 달이 꿈에 나왔어요');
    expect(morningLine({ kind: 'observation', axis: null, keys: [] }, { ...card, motifId: 'center.rain' })).toBe('간밤엔 빗소리가 꿈에 나왔어요');
  });
  it('모르는 키도 문장이 빈칸이 되지 않는다', () => {
    expect(morningLine({ kind: 'change', axis: 'tempo', keys: ['cause.none', 'effect.zzz.plus.x'] }, card).length).toBeGreaterThan(0);
  });
  it('깨는 시각: 서울 06:00 → 아침 6시쯤, 11:30 → 오전 11시 반쯤', () => {
    const KST = 540;
    const at = (h: number, m: number) => Date.UTC(2026, 10, 21, h, m) - KST * 60_000;
    expect(wakeClock(at(6, 0), KST)).toBe('아침 6시쯤');
    expect(wakeClock(at(11, 30), KST)).toBe('오전 11시 반쯤');
  });
});

describe('영어 아침 문장(원작 — 결과 먼저, 까닭 뒤)', () => {
  beforeEach(() => setLanguagePref('en'));
  it('change', () => {
    expect(morningLine({ kind: 'change', axis: 'tempo', keys: ['cause.speed.minus', 'effect.tempo.minus.bleed'] }, card)).toBe('The ink spreads at its leisure — you drew slowly yesterday');
  });
  it('관찰·이레', () => {
    expect(morningLine({ kind: 'observation', axis: null, keys: [] }, card)).toBe('Last night it dreamed of a full moon');
    expect(morningLine({ kind: 'seven-day', axis: null, keys: [] }, card)).toMatch(/^Seven nights have passed/);
  });
  it('모르는 키도 빈칸이 아니다', () => {
    expect(morningLine({ kind: 'change', axis: 'tempo', keys: ['cause.zzz.plus', 'effect.zzz.plus.x'] }, card)).toBe('Something in the grain of the ink has shifted');
  });
});
