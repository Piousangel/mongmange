// M4 정·반김·머뭇거림 앱 층(D-20·D-26 '그대로', 시스템 3.6·3.8): 플래그 jeong(운영 꺼짐)·반김 계획·머뭇거림 몸짓 규칙(D2 '찔렸다' 0명 기준)·
// 정 자막 문구(관찰자 3인칭, 금지 표현)·콜드 스타트 반김·v2 경로 차단.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { v3, type KV } from '@mong/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FEATURE_DEFAULTS, isOn, setFeature } from '../src/features';
import { __configureForTest, boot, dispatch, getSnapshot, getV3, goBackground, install, takeBootGreeting } from '../src/game/store';
import {
  BIG_GREET_MS,
  CAPTION_FADE_MS,
  CAPTION_HOLD_MS,
  JEONG_CAPTION_KEYS,
  captionShown,
  emptyGreetQueue,
  greetPlan,
  leanIntensity,
  queueCaption,
  queueGreet,
  GREET_HESITATE_MS,
  QUIET_MAX_MS,
  QUIET_NONE,
  QUIET_TOUCH_WAIT_MS,
  quietStep,
  type QuietState,
  textAllowed,
} from '../src/game/v3Flow';
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
  it('관찰자 3인칭 서술만: 듣는 사람(당신·너·you)·몽망이 1인칭·말 걸기·인용이 없고, 주어는 몽망이(이름)로 시작한다(PM 판정)', () => {
    // 2인칭·1인칭(몽망이가 화자)·말 걸기·권유·명령형(리뷰 2차 M3: '나 여기 있다고'·'만져 봐요' 같은 꼴까지)
    const VIEWER_KO = /당신|너희|너는|너를|너도|네가|니가|우리|내가|나는|나를|저는|제가|저를|(^|\s)나(\s|$)|(^|\s)내(\s|$)|(^|\s)제(\s|$)|여기\s*있|있다고|님|해\s*줘|줄래|볼래|(어|아|해|져|러|워|와)\s?봐(요)?$|(어|아|해|져|러|워|와)\s?봐요|보세요|세요|주세요|자요$|합시다|["“”'‘’]|\?|!/;
    const VIEWER_EN = /\byou\b|\byour|\byou'|\bI\b|\bme\b|\bmy\b|\bmine\b|\bwe\b|\bus\b|\bour\b|\blet's\b|\bplease\b|\bgive\b|\btry\b|["“”]|\?|!/i;
    // 부재 암시(리뷰 2차 M3·A7: 낱말 검사 한계 — 나머지는 V14 사람 검수 목록)
    const ABSENCE_KO = /기다|그리|보고\s*싶|오랜|종일|하루\s*종일|내내|아직|여태|다시\s*왔|돌아왔|문\s*쪽|문을|비었|없는\s*동안|혼자/;
    const ABSENCE_EN = /miss|wait|been away|where were|all day|all night|kept|still|finally|at last|again|came back|come back|returned|door|alone|lonely|empty|gone/i;
    for (const loc of ['ko', 'en'] as const) {
      const m = messages(loc) as Record<string, string>;
      for (const key of Object.values(JEONG_CAPTION_KEYS)) {
        const s = m[key]!;
        expect(s, `${loc} ${key}`).not.toMatch(loc === 'ko' ? VIEWER_KO : VIEWER_EN);
        expect(s, `${loc} ${key} 부재`).not.toMatch(loc === 'ko' ? ABSENCE_KO : ABSENCE_EN);
        expect(s.startsWith('{name'), `${loc} ${key} 주어`).toBe(true);
        // 서술형으로 끝남: ko '…어요/아요/해요'(권유 '봐요'는 위에서 막음), en 주어 뒤 3인칭 단수 동사(명령형 아님)
        if (loc === 'ko') expect(s, `${loc} ${key} 끝`).toMatch(/(어|아|해|여|워|와|러|봐)요$/);
        else expect(s, `${loc} ${key} 동사`).toMatch(/^\{name\} ([a-z]+ly )?[a-z]+s\b/);
      }
    }
  });
  it('이름이 없으면 기본 이름으로, 조사가 맞는다(ko)', () => {
    setLanguagePref('ko');
    expect(tr('v3.jeong.recognize', { name: tr('name.default') })).toBe('몽망이가 먼저 고개를 들어요');
    expect(tr('v3.jeong.wait', { name: '먹물' })).toBe('먹물은 이맘때면 종이 끝을 바라봐요');
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

describe('머뭇거림부터 큰 반김까지 글 0(리뷰 H1)', () => {
  const long = greetPlan({ tier: 'long', waiting: true }, { hesitation: true });
  const glance = greetPlan({ tier: 'glance', waiting: false }, { hesitation: true });
  it('72h 이상 반김은 머뭇거림 + 첫 터치 대기 상한까지만 조용 — 머뭇거림 스위치와 무관, 그 밖 반김은 구간을 푼다', () => {
    expect(GREET_HESITATE_MS).toBe(GREET_MS[CUE.hesitate]);
    expect(GREET_HESITATE_MS).toBe(v3.GREET.hesitateMs);
    for (const hesitation of [true, false]) {
      const q = quietStep(QUIET_NONE, { type: 'greet', plan: greetPlan({ tier: 'long', waiting: false }, { hesitation }), now: 1000 });
      expect(q.until).toBe(1000 + GREET_HESITATE_MS + QUIET_TOUCH_WAIT_MS);
      expect(Number.isFinite(q.until)).toBe(true);
    }
    expect(QUIET_TOUCH_WAIT_MS + GREET_HESITATE_MS).toBeLessThanOrEqual(QUIET_MAX_MS);
    expect(QUIET_MAX_MS).toBeLessThanOrEqual(60_000); // 길어도 수십 초
    for (const tier of ['glance', 'joy', 'wait'] as const) expect(quietStep({ until: 9e9, started: 0, waitingTouch: true }, { type: 'greet', plan: greetPlan({ tier, waiting: true }, { hesitation: true }), now: 5 })).toEqual(QUIET_NONE);
  });
  it('첫 터치 뒤에는 머뭇거림이 끝난 때부터 큰 반김 길이만큼(상한 안) 조용하고, 그 뒤엔 글이 다시 된다', () => {
    expect(BIG_GREET_MS).toBe(GREET_MS[CUE.greetBig]);
    let q = quietStep(QUIET_NONE, { type: 'greet', plan: long, now: 1000 });
    q = quietStep(q, { type: 'touch', now: 1200, notBefore: 1800 });
    expect(q.until).toBe(1800 + BIG_GREET_MS);
    expect(textAllowed(q.until - 1, q.until)).toBe(false);
    expect(textAllowed(q.until, q.until)).toBe(true);
    // 두 번째 터치는 구간을 늘리지 않는다
    expect(quietStep(q, { type: 'touch', now: 2000, notBefore: 9000 })).toEqual(q);
  });
  it('리뷰 2차 H2 순서: 72h 반김 → 몸을 안 만지고 앱 닫기 → 다시 열기(짧은 반김) = 글이 바로 다시 된다', () => {
    let q: QuietState = quietStep(QUIET_NONE, { type: 'greet', plan: long, now: 0 });
    expect(textAllowed(500, q.until)).toBe(false);
    q = quietStep(q, { type: 'background' });
    expect(q).toEqual(QUIET_NONE);
    q = quietStep(q, { type: 'greet', plan: glance, now: 120_000 });
    expect(textAllowed(120_001, q.until)).toBe(true);
  });
  it('리뷰 2차 H2: 닫지 않고 만지지도 않아도 상한이 지나면 글이 된다 — 그 뒤 첫 터치는 다시 조용하게 하지 않는다', () => {
    let q: QuietState = quietStep(QUIET_NONE, { type: 'greet', plan: long, now: 0 });
    const end = GREET_HESITATE_MS + QUIET_TOUCH_WAIT_MS;
    expect(textAllowed(end - 1, q.until)).toBe(false);
    expect(textAllowed(end, q.until)).toBe(true);
    q = quietStep(q, { type: 'touch', now: end + 5000, notBefore: 800 });
    expect(textAllowed(end + 5000, q.until)).toBe(true);
    // 깸이 바뀌어도 푼다
    expect(quietStep(quietStep(QUIET_NONE, { type: 'greet', plan: long, now: 0 }), { type: 'woke' })).toEqual(QUIET_NONE);
  });
  it('어떤 순서로도 조용한 구간은 시작부터 QUIET_MAX_MS를 넘지 않는다(무작위 순서 500)', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    for (let n = 0; n < 500; n++) {
      let q = QUIET_NONE;
      let now = 0;
      for (let i = 0; i < 8; i++) {
        now += Math.floor(rnd() * 15_000);
        const r = rnd();
        const ev: Parameters<typeof quietStep>[1] =
          r < 0.35 ? { type: 'greet', plan: rnd() < 0.6 ? long : glance, now } : r < 0.8 ? { type: 'touch', now, notBefore: now + Math.floor(rnd() * 2000) } : rnd() < 0.5 ? { type: 'background' } : { type: 'woke' };
        q = quietStep(q, ev);
        if (q.until > 0) expect(q.until - q.started).toBeLessThanOrEqual(QUIET_MAX_MS);
      }
    }
  });
  it('store: 80h 뒤 돌아오면 반김(long)만 — 정 신호(자막 후보)가 하나도 없다(core 규칙, 정 4·익숙한 시각이어도)', () => {
    boot();
    install({ x: 0, y: 0 });
    // 날마다 같은 시각에 와서 쓰다듬는다(정 4 이상 + 익숙한 시각)
    for (let d = 0; d < 6; d++) {
      now += 60_000;
      dispatch({ type: 'tap', target: 'body', holdMs: 100, x: 0, y: -0.3 });
      goBackground();
      now += 24 * H - 60_000;
      dispatch({ type: 'appForeground', tzOffsetMin: 540 });
    }
    expect(v3.jeongOf(getV3()!)).toBeGreaterThanOrEqual(4);
    goBackground();
    now += 96 * H;
    const fx = dispatch({ type: 'appForeground', tzOffsetMin: 540 });
    const g = fx.find((e) => e.type === 'greeted');
    expect(g).toMatchObject({ tier: 'long' });
    const shown = fx.filter((e) => e.type === 'jeongSignal' && captionShown(e, { jeong: true, jeongCaptions: true }));
    expect(shown).toEqual([]);
    expect(fx.filter((e) => e.type === 'jeongSignal')).toEqual([]);
  });
  it('GameApp: 안내 한 줄(flash)·스크린리더 알림(announce)·정 자막은 모두 textAllowed 문을 지난다 — 알림 직접 호출은 한 곳뿐', () => {
    const app = src('src/game/GameApp.tsx');
    expect(app.match(/AccessibilityInfo\.announceForAccessibility\(/g)).toHaveLength(1);
    expect(app).toMatch(/if \(textAllowed\(Date\.now\(\), quiet\.current\.until\)\) AccessibilityInfo\.announceForAccessibility\(text\);/);
    expect(app).toMatch(/const flash = useCallback\(\(text: string, ms = 3400\) => \{\n\s+if \(!textAllowed\(Date\.now\(\), quiet\.current\.until\)\) return;/);
    expect(app).toMatch(/if \(!st \|\| !textAllowed\(Date\.now\(\), quiet\.current\.until\)\) return;/);
    // 반김마다 구간을 다시 정하고(72h가 아니면 푼다), 72h면 떠 있던 한 줄·자막도 거둔다
    expect(app).toMatch(/quiet\.current = quietStep\(quiet\.current, \{ type: 'greet', plan, now: Date\.now\(\) \}\);\n\s+if \(quiet\.current\.waitingTouch\) \{\n(\s+\/\/.*\n)?\s+if \(lineTimer\.current\) clearTimeout\(lineTimer\.current\);\n\s+setLine\(''\);\n\s+setCaption\(null\);/);
    expect(app).toMatch(/if \(f\.cue === 'big'\) quiet\.current = quietStep\(quiet\.current, \{ type: 'touch', now: Date\.now\(\), notBefore: f\.notBefore \}\);/);
    // 리뷰 2차 H2: 앱을 닫거나 깸이 바뀌면 푼다(quiet를 바꾸는 곳은 quietStep 넷뿐)
    expect(app).toMatch(/quiet\.current = quietStep\(quiet\.current, \{ type: 'background' \}\);\n\s+firstTouch\.current = null;/);
    expect(app).toMatch(/case 'woke':\n\s+quiet\.current = quietStep\(quiet\.current, \{ type: 'woke' \}\);/);
    expect(app.match(/quiet\.current = /g)).toHaveLength(4);
  });
});

describe('정 자막 스크린리더(리뷰 M1): Android = 자막 띠 liveRegion polite, iOS = 자막을 보일 때 알림 한 번', () => {
  it('GameHome 자막 띠는 polite(끼어들지 않음) 하나, GameApp은 iOS에서만 자막 알림', () => {
    const home = src('src/screens/GameHome.tsx');
    const band = home.slice(home.indexOf('function CaptionBand'), home.indexOf('function ObjLabel'));
    expect(band).toMatch(/accessibilityLiveRegion="polite"/);
    expect(band).not.toMatch(/assertive/);
    const app = src('src/game/GameApp.tsx');
    expect(app).toMatch(/if \(Platform\.OS === 'ios'\) announce\(text\);/);
  });
});

describe('미뤄 둔 반김은 마지막 한 번만(리뷰 L2)', () => {
  it('새 반김이 오면 앞 반김과 그 뒤 자막 신호를 버리고, 자막 신호는 중복 없이', () => {
    let q = emptyGreetQueue<string>();
    q = queueGreet(q, 'g1');
    q = queueCaption(q, 'recognize');
    q = queueCaption(q, 'recognize');
    expect(q).toEqual({ greet: 'g1', captions: ['recognize'] });
    q = queueGreet(q, 'g2');
    q = queueCaption(q, 'wait');
    expect(q).toEqual({ greet: 'g2', captions: ['wait'] });
  });
});

describe('플래그 jeong 꺼짐 = M4 이전 v3(리뷰 M2)', () => {
  it('GameApp은 jeong이 켜졌을 때만 한 마디에 jeong 칸을 싣고, 부르기 이벤트를 보낸다', () => {
    const app = src('src/game/GameApp.tsx');
    expect(app).toMatch(/\.\.\.\(isOn\('jeong'\) \? \{ jeong: true \} : \{\}\)/);
    expect(app).toMatch(/const called = isV3Mode\(\) && isOn\('jeong'\) \? dispatch\(\{ type: 'call'/);
  });
  it('store: jeong 칸 없는 한 마디는 정을 올리지 않고, 세이브에 captionsShown 칸이 생기지 않는다', () => {
    boot();
    install({ x: 0, y: 0 });
    now += 60_000;
    dispatch({ type: 'grind', durationMs: 9000 });
    const raw = Array.from({ length: 60 }, (_, i) => ({ x: Math.sin(1.4 + i / 50) * (0.56 + i / 300), y: -Math.cos(1.4 + i / 50) * (0.56 + i / 300), t: i * 15 }));
    const fx = dispatch({ type: 'write', word: { ...v3.storedWordOf(v3.interpretWord('비', 'ko')), lexVer: v3.LEX_VER, source: 'keyboard' }, chars: 1, raw });
    expect(fx.some((e) => e.type === 'wordAccepted')).toBe(true);
    expect(getV3()!.sim.relation.jeongDays).toBe(0);
    expect(kv.m.get(v3.V3_KEYS.main)).not.toContain('captionsShown');
  });
});

describe("공방·벼루 문구가 '써야 열린다'로 읽히지 않는다(V27 서명 PM 11-25, 리뷰 2차 참고 4)", () => {
  it('v3 문구(ko·en)에 쓰기와 열림을 잇는 표현이 없다', () => {
    const BAN_KO = /써야|쓰면\s*(열|생|받|나와)|써\s*주면|한\s*마디(를|로)?\s*(써야|쓰면|해야)|열리려면|열려면|정이\s*(쌓이면|오르면)|매일\s*쓰|날마다\s*쓰/;
    const BAN_EN = /unlock|write\s+to\s+(open|get)|if you write|keep writing|write (every|each) day|to open (it|this)|earn/i;
    for (const loc of ['ko', 'en'] as const) {
      const m = messages(loc) as Record<string, string>;
      const bad = Object.entries(m).filter(([k, v]) => k.startsWith('v3.') && (loc === 'ko' ? BAN_KO : BAN_EN).test(v));
      expect(bad, loc).toEqual([]);
    }
  });
});
