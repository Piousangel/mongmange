// M2 앱 쪽(이름·인장·가락) — 그럴듯한 오답 판별(OPERATING 8-1):
//  ① 플래그 꺼짐인데 화면·공유가 바뀐다 → 꺼짐이면 이름 없음·묻지 않음·카드 라벨 빌드 1 그대로
//  ② 화면에 이름이 있으니 공유 PNG에도 이름이 실린다 → 공개 끔이면 공유 재료의 이름 줄 = '몽망이·날', 이레 영상 nameVisible=false
//  ③ 공유 코드가 문(sharedName)을 우회해 state.name을 직접 읽는다 → 공유·그리기 코드에서 이름 직접 읽기 0(정적 검사)
//  ④ 가락 파일 번호가 core id와 어긋난다 / 윤곽 순서가 합성기와 다르다 → 32개 파일·번호 대응·합성기 윤곽 순서 대조
//  ⑤ 조합 중 '몽ㅅ'에 오류를 띄운다 → 조합 중에는 안내만, 확정 거부는 core
//  ⑥ 서브셋 표가 글꼴과 어긋난다 → 표와 글자 목록 11,172자 전수 대조
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { sim, type KV } from '@mong/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SoundEngine, type Backend, type Timers } from '../src/audio/engine';
import { DEFAULT_SOUND_SETTINGS, NAME_MELODY_COUNT, SOUND_FILES, nameMelodySound, type SoundId } from '../src/audio/soundMap';
import { FEATURE_DEFAULTS, setFeature } from '../src/features';
import { displayName, namePromptNow, sharedName } from '../src/game/naming';
import { __configureForTest, getSnapshot, install, dispatch, setMeta } from '../src/game/store';
import { __setDeviceTagForTest, setLanguagePref, t, tIn } from '../src/i18n';
import { cardNameLabel, shareInput } from '../src/share/shareName';
import { inSerifSubset, needsFallbackGlyph } from '../src/ui/serifSubset';

const ROOT = path.resolve(__dirname, '../../..');
const mem = (): KV => {
  const m = new Map<string, string>();
  return { getString: (k) => m.get(k), set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) } as KV;
};
const T0 = Date.UTC(2026, 11, 1, 3);
const card: sim.DreamCard = { night: 3, motifId: 'center.moon', composition: 0, inkTone: 0.5, flow: 0, flowSeed: 1, strokeRef: null, nightsMerged: 1 };

beforeEach(() => {
  __setDeviceTagForTest('ko-KR');
  setLanguagePref('system');
  __configureForTest({ kv: mem(), now: () => T0 });
  install({ x: 0.1, y: -0.2 });
});
afterEach(() => {
  setFeature('naming', null);
  setFeature('nameMelody', null);
});

describe('① 플래그 꺼짐 = 빌드 1', () => {
  it('기본 꺼짐', () => {
    expect(FEATURE_DEFAULTS.naming).toBe(false);
    expect(FEATURE_DEFAULTS.nameMelody).toBe(false);
    expect(getSnapshot().meta.nameVisible).toBe(false);
  });
  it('세이브에 이름이 있어도(빌드 1에도 있던 setName) 꺼짐이면 화면·공유 이름 없음, 묻지 않음', () => {
    dispatch({ type: 'setName', text: '몽실' });
    const s = getSnapshot().state!;
    expect(s.name?.text).toBe('몽실');
    expect(displayName(s)).toBeNull();
    expect(sharedName(s)).toBeNull();
    expect(namePromptNow(s, 'sleep')).toBe(false);
    expect(namePromptNow(s, 'morning')).toBe(false);
  });
  it('이름 없는 새 세이브 + 꺼짐: 잘 수 있는 때에도 이름 창을 열지 않는다(켜면 연다 — 가드만이 차이, 리뷰 M-1 A1)', () => {
    const s = getSnapshot().state!;
    expect(s.name).toBeNull();
    expect(namePromptNow(s, 'sleep')).toBe(false);
    setFeature('naming', true);
    expect(namePromptNow(s, 'sleep')).toBe(true);
    setFeature('naming', null);
    // 창이 열리지 않으면 앱은 setName을 보낼 길이 없다 → 세이브의 name은 그대로 null(core ⑥의 전제)
    expect(getSnapshot().state!.name).toBeNull();
  });
  it('꺼짐 + 이름 공개 켬: 공유 이름은 null(켜면 이름 — 리뷰 M-1 A2)', () => {
    dispatch({ type: 'setName', text: '몽실' });
    setMeta({ nameVisible: true });
    const s = getSnapshot().state!;
    expect(sharedName(s)).toBeNull();
    expect(displayName(s)).toBeNull();
    setFeature('naming', true);
    expect(sharedName(s)).toBe('몽실');
  });
  it('카드 이름 줄: 이름 없음이면 빌드 1 문구 그대로', () => {
    expect(cardNameLabel(card, null)).toBe(t('card.name', { day: t('day.name', { n: 3 }) }));
  });
});

describe('② 공유물의 이름 = 공개 설정만이 연다', () => {
  const input = () => ({ card, strokes: [], labels: { name: '몽실', line: '줄', sub: '보조' } });
  it('naming 켬 + 공개 끔: 화면은 이름, 공유 재료 이름 줄은 몽망이·날, 이레 영상 nameVisible 거짓', () => {
    setFeature('naming', true);
    dispatch({ type: 'setName', text: '몽실' });
    const s = getSnapshot().state!;
    expect(displayName(s)).toBe('몽실');
    expect(sharedName(s)).toBeNull();
    const out = shareInput(input(), s);
    expect(out.labels!.name).toBe(cardNameLabel(card, null));
    expect(JSON.stringify(out)).not.toContain('몽실');
  });
  it('공개 켬이면 그때만 실린다', () => {
    setFeature('naming', true);
    dispatch({ type: 'setName', text: '몽실' });
    setMeta({ nameVisible: true });
    const s = getSnapshot().state!;
    expect(sharedName(s)).toBe('몽실');
    expect(shareInput(input(), s).labels!.name).toBe('몽실');
  });
  it('라벨이 없는 재료도 이름 줄을 채워 넘긴다(공유 이름 없음 = 몽망이·날)', () => {
    const out = shareInput({ card, strokes: [] }, { name: { text: '몽실', at: 0 } });
    expect(out.labels!.name).toBe(cardNameLabel(card, null));
  });
});

describe('③ (보조) 정적 검사: 공유·그리기 코드의 이름 직접 읽기 — 주 검사는 m2-share.test.ts의 런타임 시험(리뷰 M-2)', () => {
  const files = (p: string): string[] => (statSync(p).isFile() ? (/\.(ts|tsx)$/.test(p) ? [p] : []) : readdirSync(p).flatMap((e) => files(path.join(p, e))));
  it('src/share·src/render·cardText에서 `name.text`·`name?.text` 0건(game/naming.ts만 읽는다)', () => {
    const scan = [...files(path.join(ROOT, 'apps/mobile/src/share')), ...files(path.join(ROOT, 'apps/mobile/src/render')), path.join(ROOT, 'apps/mobile/src/screens/cardText.tsx')];
    const hits = scan.filter((f) => /\bname\??\.text\b/.test(readFileSync(f, 'utf8'))).map((f) => path.relative(ROOT, f));
    expect(hits).toEqual([]);
  });
});

describe('집계 핑 name_set = 처음 지은 시각 한 번(리뷰 L-3)', () => {
  it('이름을 바꿔도 name_set 시각은 처음 지은 때', async () => {
    const { onceEventsFromState } = await import('../src/net/ping');
    let st = sim.createInitial(T0, 540, 7);
    st = sim.reduce(st, { type: 'setName', at: T0 + 10_000, text: '몽실' }).state;
    st = sim.reduce(st, { type: 'setName', at: T0 + 99_000, text: '먹보' }).state;
    expect(onceEventsFromState(st).filter((e) => e.e === 'name_set')).toEqual([{ e: 'name_set', at: T0 + 10_000 }]);
  });
});

describe('④ 가락·인장 소리', () => {
  it('가락 파일 32개 + 인장 탁, 번호 = core id', () => {
    const ids = Object.keys(SOUND_FILES).filter((k) => k.startsWith('name_melody_'));
    expect(ids.length).toBe(NAME_MELODY_COUNT);
    expect(NAME_MELODY_COUNT).toBe(sim.NAME_MELODY.count);
    expect(SOUND_FILES.seal_tak).toBeTruthy();
    for (let i = 0; i < 32; i++) expect(SOUND_FILES[nameMelodySound(i)]).toBeTruthy();
    expect(nameMelodySound(sim.nameMelodyOf('몽실', 0).id)).toBe(`name_melody_${String(sim.nameMelodyOf('몽실', 0).id).padStart(2, '0')}`);
  });
  it('합성기 윤곽 순서 = core MELODY_CONTOURS(번호가 같은 소리를 가리킨다)', () => {
    const src = readFileSync(path.join(ROOT, 'tools/sound/synth.mjs'), 'utf8');
    const m = /const CONTOUR_ORDER = \[([^\]]+)\]/.exec(src)!;
    const order = m[1]!.split(',').map((x) => x.trim().replace(/'/g, ''));
    expect(order).toEqual([...sim.MELODY_CONTOURS]);
  });
  it('playMelody: 가락 번호 파일 + 이름에서 정한 속도(무작위 흔들림 없음), 소리를 꺼도 햅틱은 남는다', () => {
    const made: { id: SoundId; rate: number }[] = [];
    const haptics: unknown[] = [];
    const backend: Backend = {
      create: (id) => {
        const rec = { id, rate: 1 };
        made.push(rec);
        return { setVolume() {}, setRate: (r) => (rec.rate = r), play() {}, stop() {}, onEnd() {} };
      },
      haptic: (h) => haptics.push(h),
    };
    const timers: Timers = { now: () => 0, setTimeout: (fn) => fn(), setInterval: () => 1, clearInterval() {} };
    const eng = new SoundEngine(backend, timers, { ...DEFAULT_SOUND_SETTINGS }, () => 0.99);
    const m = sim.nameMelodyOf('먹보', 0);
    expect(eng.playMelody(nameMelodySound(m.id), m.rate)).toBe(true);
    expect(made).toEqual([{ id: nameMelodySound(m.id), rate: m.rate }]);
    const quiet = new SoundEngine(backend, timers, { ...DEFAULT_SOUND_SETTINGS, soundEnabled: false });
    quiet.playMelody(nameMelodySound(m.id), m.rate);
    expect(haptics.length).toBe(2);
  });
});

describe('⑤ 입력 상태·문구', () => {
  it('조합 중·빈 칸은 오류 없이 안내, 확정할 수 있는 이름만 ok', async () => {
    const { nameInputState } = await import('../src/screens/nameInput');
    expect(nameInputState('몽ㅅ')).toMatchObject({ ok: false, message: null });
    expect(nameInputState('   ')).toMatchObject({ ok: false, message: null });
    expect(nameInputState('몽🐾')).toMatchObject({ ok: false, message: 'name.err.chars' });
    expect(nameInputState('가나다라마바사')).toMatchObject({ ok: false, message: 'name.err.length' });
    expect(nameInputState('01012345678')).toMatchObject({ ok: false, message: 'name.err.digits' });
    expect(nameInputState(' 몽 실 ')).toMatchObject({ ok: true, text: '몽 실', fallback: false });
    expect(nameInputState('똠이')).toMatchObject({ ok: true, fallback: true }); // KS X 1001 밖 글자 → 대체 글꼴 안내
  });
  it('M2 문구는 두 언어 모두 비지 않고, 조사·변수가 채워진다', () => {
    for (const loc of ['ko', 'en'] as const) {
      expect(tIn(loc, 'name.stamped.a11y', { name: '몽실' })).toContain('몽실');
      expect(tIn(loc, 'name.reply.melody.a11y', { name: 'Momo' })).toContain('Momo');
      expect(tIn(loc, 'tag.bornValue', { date: 'D', sijin: 0 }).length).toBeGreaterThan(3);
    }
    expect(tIn('ko', 'name.confirm.a11y', { name: '몽실' })).toBe('몽실이라고 부르기');
    expect(tIn('ko', 'name.confirm.a11y', { name: '먹보' })).toBe('먹보라고 부르기');
  });
});

describe('⑥ 서브셋 표 = 글꼴 글자 목록', () => {
  it('한글 11,172자 전수 대조', () => {
    const have = new Set(readFileSync(path.join(ROOT, 'apps/mobile/assets/fonts/GowunBatang_400Regular.subset.chars.txt'), 'utf8'));
    let diff = 0;
    for (let c = 0xac00; c <= 0xd7a3; c++) if (inSerifSubset(String.fromCharCode(c)) !== have.has(String.fromCharCode(c))) diff++;
    expect(diff).toBe(0);
    expect(needsFallbackGlyph('Momo 7')).toBe(false);
  });
});
