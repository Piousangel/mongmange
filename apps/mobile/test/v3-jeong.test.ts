// M4 정·반김·머뭇거림 앱 층(D-20·D-26 '그대로', 시스템 3.6·3.8): 플래그 jeong(운영 꺼짐)·반김 계획·머뭇거림 몸짓 규칙(D2 '찔렸다' 0명 기준)·
// 정 자막 문구(관찰자 3인칭, 금지 표현)·콜드 스타트 반김·v2 경로 차단.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { v3, type KV } from '@mong/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FEATURE_DEFAULTS, isOn, setFeature } from '../src/features';
import { __configureForTest, boot, dispatch, getSnapshot, getV3, goBackground, install, takeBootGreeting } from '../src/game/store';
import { CAPTION_FADE_MS, CAPTION_HOLD_MS, JEONG_CAPTION_KEYS, captionShown, greetPlan, leanIntensity } from '../src/game/v3Flow';
import { messages, setLanguagePref, t as tr } from '../src/i18n';
import { CUE, GREET_MS, answerPose, cueLength, drinks, greetPose, type CueValue } from '../src/render/answer';

const H = 3_600_000;
const KST_NOON = Date.UTC(2026, 10, 25, 3, 0);
function memKV(): KV & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getString: (k) => m.get(k), set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
}
const src = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8');

let now = KST_NOON;
let kv = memKV();
beforeEach(() => {
  now = KST_NOON;
  kv = memKV();
  setFeature('conceptV3', true);
  __configureForTest({ kv, now: () => now });
});
afterEach(() => {
  setFeature('conceptV3', null);
  setFeature('jeong', null);
});

describe('플래그 jeong — v3 위에서만, 운영 꺼짐', () => {
  it('운영과 같은 시험 환경 기본값은 jeong·hesitation·jeongCaptions 모두 꺼짐', () => {
    expect(FEATURE_DEFAULTS.jeong).toBe(false);
    expect(FEATURE_DEFAULTS.hesitation).toBe(false);
    expect(FEATURE_DEFAULTS.jeongCaptions).toBe(false);
  });
  it('v2 경로(conceptV3 꺼짐)에서는 부르기·정 자막 이벤트가 sim으로 가지 않는다', () => {
    setFeature('conceptV3', false);
    boot();
    install({ x: 0, y: 0 });
    expect(getSnapshot().v3).toBeNull();
    const before = JSON.stringify(getSnapshot().state);
    expect(dispatch({ type: 'call', melody: true })).toEqual([]);
    expect(dispatch({ type: 'jeongCaption', signal: 'recognize' })).toEqual([]);
    expect(JSON.stringify(getSnapshot().state)).toBe(before);
  });
  it('GameApp은 반김·정 신호·부르기 몸짓을 jeong(+ v3) 플래그 뒤에서만 쓴다', () => {
    const app = src('src/game/GameApp.tsx');
    expect(app).toMatch(/const jeongOn = isV3Mode\(\) && isOn\('jeong'\);/);
    for (const c of ["case 'greeted': {\n              if (!jeongOn) break;", "case 'jeongSignal': {\n              if (!jeongOn) break;"]) expect(app).toContain(c);
    expect(app).toMatch(/if \(jeongOn && e\.near !== null\)/);
  });
});

describe('반김 계획(core greeted → 몸짓)', () => {
  it('단계별: glance·joy는 여는 몸짓만, wait은 기다림 → 첫 터치 기쁨, long은 머뭇거림 → 첫 터치 큰 반김', () => {
    expect(greetPlan({ tier: 'glance', waiting: false }, { hesitation: true })).toEqual({ open: 'glance', firstTouch: null });
    expect(greetPlan({ tier: 'joy', waiting: false }, { hesitation: true })).toEqual({ open: 'joy', firstTouch: null });
    expect(greetPlan({ tier: 'wait', waiting: false }, { hesitation: true })).toEqual({ open: 'wait', firstTouch: 'joy' });
    expect(greetPlan({ tier: 'long', waiting: false }, { hesitation: true })).toEqual({ open: 'hesitate', firstTouch: 'big' });
  });
  it('머뭇거림 스위치가 꺼지면 72h 이상도 기다림 자세만(C 2-4 실패 시 대체)', () => {
    expect(greetPlan({ tier: 'long', waiting: true }, { hesitation: false })).toEqual({ open: 'wait', firstTouch: 'big' });
  });
  it('정 4 익숙한 시각이면 72h 미만은 기다림 자세로 열고 첫 터치에 그 단계의 기쁨', () => {
    expect(greetPlan({ tier: 'joy', waiting: true }, { hesitation: true })).toEqual({ open: 'wait', firstTouch: 'joy' });
    expect(greetPlan({ tier: 'glance', waiting: true }, { hesitation: true })).toEqual({ open: 'wait', firstTouch: 'glance' });
  });
  it('closeness 구간 → 강도 칸(near 3 · mid 2 · alone 1)', () => {
    expect([leanIntensity('near'), leanIntensity('mid'), leanIntensity('alone')]).toEqual([3, 2, 1]);
  });
});

describe('반김 몸짓 — 몸 크기·자리 그대로, 늘 정면(유저 쪽)을 본다', () => {
  const KINDS = [CUE.greetGlance, CUE.greetJoy, CUE.greetWait, CUE.greetBig, CUE.hesitate, CUE.offerSpot, CUE.replyNear, CUE.replyFar];
  const cue = (kind: number, intensity = 2, fromX = 0): CueValue => ({ kind, intensity, net: false, fromX, fromY: 0, at: 0 });
  it('반김 몸짓은 마시지 않는다(먹 방울 없음)·길이가 정해져 있다', () => {
    for (const k of KINDS) {
      expect(drinks(k), String(k)).toBe(false);
      expect(cueLength(k)).toBe(GREET_MS[k]);
      expect(answerPose(cue(k), 10, false).drop).toBe(-1);
    }
    expect(drinks(CUE.bright)).toBe(true);
  });
  for (const rm of [false, true])
    it(`${rm ? '모션 줄이기' : '보통'}: 내려앉기·시선 피하기·슬픈 눈 없음(모든 반김)`, () => {
      for (const k of KINDS)
        for (const i of [1, 2, 3])
          for (let dt = 0; dt <= GREET_MS[k]!; dt += 20) {
            const p = answerPose(cue(k, i, 4), dt, rm);
            expect(p.settle, `${k}`).toBe(0);
            expect(p.gy, `${k} gy`).toBe(0); // 정면 = 유저 쪽(내리깐 눈 없음 — 캡처 판정)
            expect(p.gx, `${k} gx`).toBe(0); // 시선을 옆으로 피하지 않는다
            expect(['open', 'joy']).toContain(p.eyeB);
            expect(p.combAngle, `${k} 빗`).toBeGreaterThanOrEqual(0); // 빗을 내리지 않는다
          }
    });

  it('머뭇거림 = 0.8초 제자리 갸웃 한 번, 시선은 처음부터 끝까지 유저 쪽(D2 "찔렸다" 0명 기준)', () => {
    expect(GREET_MS[CUE.hesitate]).toBe(v3.GREET.hesitateMs);
    let maxTilt = 0;
    for (let dt = 0; dt <= 800; dt += 10) {
      const p = greetPose(cue(CUE.hesitate), dt, false);
      expect(p.gy).toBe(0); // 늘 정면(유저 쪽), 내리깐 눈 없음
      expect(p.hop).toBe(0); // 뛰거나
      expect(p.settle).toBe(0); // 비켜 앉거나 내려앉지 않는다
      expect(p.gx).toBe(0); // 옆으로 눈을 돌리지 않는다
      expect(p.eyeB).toBe('open');
      expect(p.combAngle).toBe(0); // 빗 납작 없음
      expect(p.bleed).toBe(1);
      expect(p.tilt).toBeGreaterThanOrEqual(0); // 한쪽으로 한 번만 갸웃
      maxTilt = Math.max(maxTilt, p.tilt);
    }
    expect(maxTilt).toBeGreaterThan(0.05);
    expect(greetPose(cue(CUE.hesitate), 801, false).tilt).toBe(0);
  });

  it('큰 반김은 보통 반김보다 크다(기쁨 1.5배 자리) — 그래도 몸 크기는 건드리지 않는다', () => {
    const peak = (k: number) => {
      let hop = 0;
      let comb = 0;
      for (let dt = 0; dt <= GREET_MS[k]!; dt += 10) {
        const p = greetPose(cue(k), dt, false);
        hop = Math.max(hop, p.hop);
        comb = Math.max(comb, p.combAngle);
      }
      return { hop, comb };
    };
    expect(peak(CUE.greetBig).hop).toBeGreaterThanOrEqual(1.5 * peak(CUE.greetJoy).hop);
    expect(peak(CUE.greetBig).comb).toBeGreaterThanOrEqual(1.5 * peak(CUE.greetJoy).comb);
    // AnswerPose에는 몸 크기 칸(sx·sy·s)이 없다 — 반김이 몸 크기를 바꿀 길이 없다
    expect(Object.keys(greetPose(cue(CUE.greetBig), 500, false)).filter((k) => /^(s|sx|sy|scale)$/.test(k))).toEqual([]);
  });
});

describe('정 자막 문구 — 관찰자 3인칭 한 줄, 금지 표현 0(시스템 3.8, QA-3)', () => {
  const BAN_KO = /기다렸|보고\s*싶|그리웠|그리워|외로|서운|미안|섭섭|왜\s*이제|오랜만|드디어|잊|혼자\s*두|떠나|버려|슬퍼|아파|내가|나는|저는|제가|!|\?|\d/;
  const BAN_EN = /waited|miss(ed)?\b|lonely|alone|sad|sorry|forgot|where were you|finally|at last|long time|left (me|it)|\bI\b|\bme\b|\bmy\b|!|\?|\d/i;
  it('네 신호 모두 ko·en에 있고, 이름 자리가 있고, 금지 표현이 없다', () => {
    for (const loc of ['ko', 'en'] as const) {
      const m = messages(loc) as Record<string, string>;
      for (const key of Object.values(JEONG_CAPTION_KEYS)) {
        const s = m[key]!;
        expect(s, `${loc} ${key}`).toBeTruthy();
        expect(s).toMatch(/\{name/); // 말하는 쪽은 관찰자 — 몽망이(이름)가 주어
        expect(s, `${loc} ${key}`).not.toMatch(loc === 'ko' ? BAN_KO : BAN_EN);
        // 한 줄(자막 띠): 이름 자리를 기본 이름 길이로 채워 잰다
        expect(s.replace(/\{name[^}]*\}/, loc === 'ko' ? '몽망이가' : 'Mongmang').length, `${loc} ${key}`).toBeLessThanOrEqual(loc === 'ko' ? 26 : 48);
      }
    }
  });
  it('이름이 없으면 기본 이름으로, 조사가 맞는다(ko)', () => {
    setLanguagePref('ko');
    expect(tr('v3.jeong.recognize', { name: tr('name.default') })).toBe('몽망이가 당신을 먼저 알아봤어요');
    expect(tr('v3.jeong.wait', { name: '먹물' })).toBe('먹물은 이맘때 당신이 오는 걸 기억해요');
    setLanguagePref('system');
  });
  it('머뭇거림·반김에는 문구 키가 없다(글·알림 없음) — v3 문구 어디에도 비운 시간·서운 낱말이 없다', () => {
    for (const loc of ['ko', 'en'] as const) {
      const m = messages(loc) as Record<string, string>;
      expect(Object.keys(m).filter((k) => /hesitat|greet|absen/i.test(k))).toEqual([]);
      const bad = Object.entries(m).filter(([k, v]) => k.startsWith('v3.') && (loc === 'ko' ? /오랜만|며칠\s*만|사흘|기다렸|서운|보고\s*싶/ : /been a while|days? away|waited|missed you/i).test(v));
      expect(bad, loc).toEqual([]);
    }
  });
  it('자막은 jeong·jeongCaptions 둘 다 켜지고 core가 아직 세 번이 안 됐다고 할 때만', () => {
    expect(captionShown({ caption: true }, { jeong: true, jeongCaptions: true })).toBe(true);
    expect(captionShown({ caption: false }, { jeong: true, jeongCaptions: true })).toBe(false);
    expect(captionShown({ caption: true }, { jeong: false, jeongCaptions: true })).toBe(false);
    expect(captionShown({ caption: true }, { jeong: true, jeongCaptions: false })).toBe(false);
    expect(CAPTION_HOLD_MS).toBe(1600);
    expect(CAPTION_FADE_MS).toBeGreaterThan(0);
  });
  it('정 자막·반김은 알림·스크린리더 알림으로 내보내지 않는다(GameApp 정적 검사)', () => {
    const app = src('src/game/GameApp.tsx');
    const block = app.slice(app.indexOf("case 'greeted': {"), app.indexOf("case 'called':"));
    expect(block.length).toBeGreaterThan(200);
    expect(block).not.toMatch(/announceForAccessibility|scheduleMorning|notify|flash\(/);
    // 자막 띠는 화면 아래, 말풍선 없음
    const home = src('src/screens/GameHome.tsx');
    expect(home).toMatch(/function CaptionBand/);
    expect(home).not.toMatch(/bubble|tail|말풍선 그림/i);
  });
});

describe('콜드 스타트 반김(store)', () => {
  it('앱을 닫고 80시간 뒤 다시 켜면 반김(long)이 남아 화면이 구독 뒤 한 번 꺼내 쓴다', () => {
    boot();
    install({ x: 0, y: 0 });
    now += 60_000;
    dispatch({ type: 'tap', target: 'body', holdMs: 100, x: 0, y: -0.3 });
    goBackground();
    now += 80 * H;
    // 아침 10시대로 맞춘다(깨어 있을 때 반김)
    const d = new Date(now + 540 * 60_000);
    now += ((34 - d.getUTCHours()) % 24) * H;
    __configureForTest({ kv, now: () => now });
    setFeature('conceptV3', true);
    boot();
    expect(getV3()!.sim.phase).toBe('awake');
    const fx = takeBootGreeting();
    const g = fx.find((e) => e.type === 'greeted');
    expect(g).toMatchObject({ type: 'greeted', tier: 'long' });
    expect(takeBootGreeting()).toEqual([]); // 한 번만
  });
  it('jeong 플래그와 상관없이 정 값은 쌓인다(공방이 같은 값을 읽음)', () => {
    expect(isOn('jeong')).toBe(false);
    boot();
    install({ x: 0, y: 0 });
    now += 60_000;
    dispatch({ type: 'tap', target: 'body', holdMs: 100, x: 0, y: -0.3 });
    expect(getV3()!.sim.relation.jeongDays).toBe(1);
  });
});
