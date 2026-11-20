// 빌드 1 앱 쪽 규칙: 평점 요청(이레 아침 1회), 공유 이미지 배치·고르기, 기능 플래그, 설치 = 타고남 씨앗, 메타 reviewAsked.
import type { KV, sim } from '@mong/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { FEATURE_DEFAULTS, isOn, setFeature } from '../src/features';
import { REVIEW_DELAY_MS, createReviewAsker, shouldAskReview } from '../src/game/reviewPolicy';
import { entropy32 } from '../src/game/entropy';
import { sim as coreSim } from '@mong/core';
import { __configureForTest, boot, getSnapshot, install, setMeta } from '../src/game/store';
import { footerSpot, ireScrollLayout, pickScrollCards, shareFileName } from '../src/share/layout';

const line = (kind: sim.LineKind): sim.MorningLine => ({ kind, axis: null, keys: [] });
const card = (night: number, strokeRef: string | null): sim.DreamCard => ({ night, motifId: 'center.moon', composition: 0, inkTone: 0.5, flow: 0, flowSeed: night, strokeRef, nightsMerged: 1 });

describe('평점 요청(D-18 ⑤)', () => {
  it('이레 아침(seven-day)에만, 아직 안 물었고 플래그가 켜졌을 때만', () => {
    expect(shouldAskReview(line('seven-day'), { reviewAsked: false, featureOn: true })).toBe(true);
    expect(shouldAskReview(line('seven-day'), { reviewAsked: true, featureOn: true })).toBe(false);
    expect(shouldAskReview(line('seven-day'), { reviewAsked: false, featureOn: false })).toBe(false);
    for (const k of ['change', 'deepen', 'observation'] as const) expect(shouldAskReview(line(k), { reviewAsked: false, featureOn: true })).toBe(false);
  });
});

describe('평점 요청 1회 보장(createReviewAsker)', () => {
  function harness(opts: { active?: boolean; fail?: boolean } = {}) {
    const calls: string[] = [];
    let asked = false;
    let active = opts.active ?? true;
    const timers: { fn: () => void; ms: number }[] = [];
    const asker = createReviewAsker({
      getAsked: () => asked,
      markAsked: () => {
        calls.push('mark');
        asked = true;
      },
      featureOn: () => true,
      isActive: () => active,
      request: async () => {
        calls.push('request');
        if (opts.fail) throw new Error('store down');
      },
      setTimer: (fn, ms) => timers.push({ fn, ms }),
    });
    return { asker, calls, timers, setActive: (v: boolean) => (active = v), asked: () => asked };
  }

  it('먼저 기록 → (카드가 놓인 뒤) 요청, 두 번 현상해도 1회', () => {
    const h = harness();
    h.asker.onCardDeveloped(line('seven-day'));
    h.asker.onCardDeveloped(line('seven-day'));
    expect(h.calls).toEqual(['mark']); // 요청 전에 이미 기록
    expect(h.timers).toHaveLength(1);
    expect(h.timers[0]!.ms).toBe(REVIEW_DELAY_MS);
    h.timers[0]!.fn();
    h.timers[0]!.fn();
    h.asker.onActive();
    expect(h.calls).toEqual(['mark', 'request']);
  });

  it('요청이 실패해도 기록은 남고 다시 묻지 않는다', async () => {
    const h = harness({ fail: true });
    h.asker.onCardDeveloped(line('seven-day'));
    h.timers[0]!.fn();
    await Promise.resolve();
    expect(h.asked()).toBe(true);
    h.asker.onActive();
    expect(h.calls.filter((c) => c === 'request')).toHaveLength(1);
  });

  it('타이머 사이에 뒤로 갔다 오면: 뒤에서는 부르지 않고, 앞에 돌아올 때 한 번', () => {
    const h = harness();
    h.asker.onCardDeveloped(line('seven-day'));
    h.setActive(false);
    h.timers[0]!.fn();
    expect(h.calls).toEqual(['mark']);
    h.setActive(true);
    h.asker.onActive();
    h.asker.onActive();
    expect(h.calls).toEqual(['mark', 'request']);
  });

  it('앞에 돌아오는 이벤트가 타이머보다 먼저 와도 일찍 부르지 않는다', () => {
    const h = harness();
    h.asker.onCardDeveloped(line('seven-day'));
    h.asker.onActive();
    expect(h.calls).toEqual(['mark']);
  });
});

describe('기능 플래그 골격', () => {
  it('빌드 1은 공유·평점만 켜고 세 기둥 기능은 끈다', () => {
    const on = Object.entries(FEATURE_DEFAULTS)
      .filter(([, v]) => v)
      .map(([k]) => k);
    expect(on.sort()).toEqual(['review', 'share']);
  });
  it('개발 덮어쓰기는 켜고 끄고 되돌릴 수 있다', () => {
    setFeature('relation', true);
    expect(isOn('relation')).toBe(true);
    setFeature('relation', null);
    expect(isOn('relation')).toBe(false);
  });
});

describe('공유 이미지 배치', () => {
  it('꿈 카드 아래 띠는 한지 아래 여백 안(4:5·9:16)', () => {
    // dreamCardLayout: 4:5 한지 아래 1.205 / 높이 1.25, 9:16 한지 아래 1.52 / 높이 16/9
    for (const [aspect, bottom, h] of [['4:5', 1.205, 1.25], ['9:16', 1.52, 16 / 9]] as const) {
      const f = footerSpot(aspect, bottom, h);
      expect(f.y - f.size).toBeGreaterThan(bottom);
      expect(f.y).toBeLessThan(h);
    }
  });
  it('두루마리 1080×1920: 카드 7장이 서로·글·축과 겹치지 않고 화면 안', () => {
    const L = ireScrollLayout(7);
    expect([L.width, L.height]).toEqual([1080, 1920]);
    expect(L.cards).toHaveLength(7);
    const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    for (let i = 0; i < 7; i++) {
      const c = L.cards[i]!;
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(L.width);
      expect(c.y).toBeGreaterThan(L.subtitle.y);
      expect(c.y + c.h).toBeLessThan(L.footer.y - L.footer.size);
      for (let j = i + 1; j < 7; j++) expect(overlap(c, L.cards[j]!)).toBe(false);
      // 날 이름은 카드 밖 안쪽 틈에
      const lb = L.labels[i]!;
      expect(lb.align === 'left' ? lb.x >= c.x + c.w : lb.x <= c.x).toBe(true);
    }
  });
  it('두루마리 카드 고르기: 획 있는 밤 7장 우선, 모자라면 채우고 시간 순', () => {
    const cards = [card(1, 's0'), card(2, null), card(3, 's2'), card(4, 's3'), card(5, 's4'), card(6, 's5'), card(7, 's6'), card(8, 's7'), card(9, 's8')];
    expect(pickScrollCards(cards).map((c) => c.night)).toEqual([1, 3, 4, 5, 6, 7, 8]);
    expect(pickScrollCards(cards.slice(0, 4)).map((c) => c.night)).toEqual([1, 2, 3, 4]);
  });
  it('파일 이름은 영문(한글 파일 이름이 깨지는 앱 대비)', () => {
    expect(shareFileName('card', 7, '9:16')).toBe('mongmangi-card-7-9x16.png');
    expect(shareFileName('ire', 7, '9:16')).toMatch(/^[a-z0-9.-]+$/);
  });
});

describe('설치·메타(세이브 v2)', () => {
  let m = new Map<string, string>();
  const kv: KV = { getString: (k) => m.get(k), set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
  beforeEach(() => {
    m = new Map();
    __configureForTest({ kv, now: () => Date.UTC(2026, 10, 20, 3, 0) });
  });
  it('첫 탭 좌표가 타고남 씨앗 재료로 들어가고 세이브는 sim 2', () => {
    boot();
    install({ x: 0.1, y: -0.4 });
    const s = getSnapshot().state!;
    expect(s.schemaVersion).toBe(2);
    expect(s.birth.source).toBe('tap');
    expect(JSON.parse(m.get('mong.save.main')!).sim.version).toBe(2);
  });
  it('새 버전 세이브(옛 빌드로 내려감): 업데이트 안내 상태, 설치·저장하지 않고 본을 그대로 둔다', () => {
    const s = coreSim.createInitial(Date.UTC(2026, 10, 20, 3, 0), 540, 1);
    const o = JSON.parse(coreSim.serializeState(s, Date.UTC(2026, 10, 20, 3, 0)));
    const future = JSON.stringify({ ...o, sim: { ...o.sim, version: 99, state: { ...o.sim.state, schemaVersion: 99 } } });
    m.set('mong.save.main', future);
    boot();
    expect(getSnapshot()).toMatchObject({ state: null, futureSave: true, lostSave: false });
    install({ x: 0, y: 0 });
    expect(getSnapshot().state).toBeNull();
    expect(m.get('mong.save.main')).toBe(future);
    expect([...m.keys()].filter((k) => k.startsWith('mong.save.'))).toEqual(['mong.save.main']);
  });

  it('씨앗 난수: 모듈이 없는 환경(테스트)에서는 Web Crypto로 대체', () => {
    const e = entropy32();
    expect(e.source).toBe('web-crypto');
    expect(e.value).toBe(e.value >>> 0);
  });

  it('reviewAsked는 옛 메타에 없으면 false, 한 번 기록하면 재시작해도 유지', () => {
    m.set('mong.meta', JSON.stringify({ v: 1, notifAsked: true }));
    boot();
    expect(getSnapshot().meta.reviewAsked).toBe(false);
    setMeta({ reviewAsked: true });
    __configureForTest({ kv, now: () => Date.UTC(2026, 10, 20, 3, 0) });
    boot();
    expect(getSnapshot().meta.reviewAsked).toBe(true);
  });
});
