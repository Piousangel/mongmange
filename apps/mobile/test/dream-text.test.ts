// C6 꿈 문구(dreams-30days v1.1 1-5·1-7·3절): core 모티프 25 ↔ i18n 키, 스키마 1 글자 수 상한·금지어, 캡션 길이 산식(3-6),
// 캡션 조립(원인 + 결과, 보름 원인), '처음 꾼 꿈', 플래그 꺼짐이면 이벤트에 필드를 싣지 않음.
import { MOTIF_FORBIDDEN, MOTIF_TEXT_LIMITS, motifFileSchema } from '@mong/contract';
import { sim } from '@mong/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { setFeature } from '../src/features';
import { nightFields } from '../src/game/store';
import { appendA11y, dreamCaption, firstDreamText, motifName, motifScene, visibleCaption } from '../src/game/text';
import { en } from '../src/i18n/en';
import { ko } from '../src/i18n/ko';
import { setLanguagePref } from '../src/i18n';
import type { MessageKey } from '../src/i18n/types';

const TABLES = { ko, en } as const;
const k = (s: string) => s as MessageKey;
const len = (s: string) => [...s].length;
const ZONES = ['near-alone', 'near-with', 'far-alone', 'far-with', 'center'] as const;
const card = (motifId: string, over: Partial<sim.DreamCard> = {}): sim.DreamCard => ({
  night: 5,
  motifId,
  composition: 1,
  inkTone: 0.5,
  flow: 0,
  flowSeed: 1,
  strokeRef: null,
  nightsMerged: 1,
  ...over,
});

describe('core 모티프 25 ↔ i18n', () => {
  it('모든 모티프에 이름·장면·캡션 결과가 두 언어로 있다(빠지면 화면이 fallback이 된다)', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLanguagePref(lang);
      for (const m of sim.MOTIFS) {
        expect(motifName(m.id), m.id).toBe(TABLES[lang][k(`motif.${m.id}`)]);
        expect(motifScene(m.id), m.id).toBe(TABLES[lang][k(`scene.${m.id}`)]);
        expect(TABLES[lang][k(`caption.line.${m.id}`)], m.id).toBeTruthy();
      }
    }
  });

  it('문구가 스키마 1과 같은 상한·금지어를 지킨다(번들도 원격과 같은 상한, 5-2) — motifFileSchema로 검사', () => {
    const issues: string[] = [];
    for (const m of sim.MOTIFS) {
      const text = Object.fromEntries(
        (['ko', 'en'] as const).map((lang) => {
          const tb = TABLES[lang];
          return [lang, { title: tb[k(`motif.${m.id}`)], line: tb[k(`caption.line.${m.id}`)], scene: tb[k(`scene.${m.id}`)] }];
        }),
      );
      const r = motifFileSchema.safeParse({ schema: 1, id: m.id.replace('.', '-'), zone: m.zone, family: m.family, paths: [{ d: 'M0 0 L1 1', w: 1, layer: 'ink' }], shader: { bleed: 0.3, grain: 0.2, tone: 'night' }, text });
      if (!r.success) for (const i of r.error.issues) issues.push(`${m.id} ${i.path.slice(1).join('.')} ${i.message}`);
    }
    // 정본 en 결과 두 줄의 'ran'(바다·길이 '흘렀다·이어졌다')이 금지어 /\bran\b/(발 동사)에 걸린다 — 문구는 작가·원어민 검수 몫이라
    // 개발이 고치지 않고 검수 질문으로 올렸다(docs/app/i18n-v1/native-review.md 4절). 필드 + 걸린 금지어 문장 전체를 고정한다:
    // 같은 줄에 다른 금지어가 새로 생겨도 실패, 고치면 이 목록을 줄인다(리뷰 m5)
    const RAN = `금지 표현 ${String(MOTIF_FORBIDDEN.find((re) => re.test('ran'))!)}`;
    expect(issues).toEqual([`far-alone.sea en.line ${RAN}`, `far-alone.path en.line ${RAN}`]);
  });

  it('원인 조각도 금지어 없음(3-7 — 감정·선호 단정, 발 동사, 숫자·느낌표)', () => {
    for (const lang of ['ko', 'en'] as const)
      for (const z of ZONES)
        for (const n of [1, 2, 3]) {
          const s = TABLES[lang][k(`caption.cause.${z}.${n}`)];
          for (const re of MOTIF_FORBIDDEN) expect(s, `${lang} ${z}.${n}`).not.toMatch(re);
        }
  });

  it('캡션 길이 산식(3-6): 원인을 붙여도 ko 40·en 80자 이내, 보름 캡션 포함', () => {
    const cap = { ko: 40, en: 80 } as const;
    for (const lang of ['ko', 'en'] as const) {
      setLanguagePref(lang);
      for (const m of sim.MOTIFS) {
        expect(len(TABLES[lang][k(`caption.line.${m.id}`)]), m.id).toBeLessThanOrEqual(MOTIF_TEXT_LIMITS[lang].line);
        for (const z of ZONES) for (const n of [1, 2, 3]) expect(len(dreamCaption(card(m.id, { cause: `${z}.${n}` }))!), `${lang} ${m.id} ${z}.${n}`).toBeLessThanOrEqual(cap[lang]);
      }
      for (const id of ['moon-12', 'moon-01', 'moon-02']) for (const c of [0, 1, 2] as const) expect(len(dreamCaption(card(id, { composition: c }))!)).toBeLessThanOrEqual(cap[lang]);
    }
  });
});

describe('캡션 조립', () => {
  beforeEach(() => setLanguagePref('ko'));

  it('ko: 원인 + 결과, en: 결과 — 원인', () => {
    expect(dreamCaption(card('near-with.umbrella', { cause: 'near-with.2' }))).toBe('요즘 손가락에 몸을 비비더니 간밤 꿈엔 우산 하나를 같이 썼어요');
    setLanguagePref('en');
    expect(dreamCaption(card('near-with.umbrella', { cause: 'near-with.2' }))).toBe('Last night it shared one umbrella — it nuzzles your finger lately');
  });

  it('원인이 없으면(성향이 약함·빌드 1 카드) 결과만', () => {
    expect(dreamCaption(card('center.rain', { cause: null }))).toBe('간밤 꿈엔 빗소리가 오래 들렸어요');
    expect(dreamCaption(card('center.rain'))).toBe('간밤 꿈엔 빗소리가 오래 들렸어요');
    expect(dreamCaption(card('center.rain', { cause: 'bogus' }))).toBe('간밤 꿈엔 빗소리가 오래 들렸어요');
  });

  it('보름 카드: 원인 = 구도로 되읽은 그 밤의 달(3-5 예문 그대로)', () => {
    expect(dreamCaption(card('moon-12', { composition: 1 }))).toBe('달이 가득 찬 밤이라 꿈속 물 위로 달길이 놓였어요');
    setLanguagePref('en');
    expect(dreamCaption(card('moon-12', { composition: 1 }))).toBe('A road of moonlight lay on the water — the moon was full');
    expect(dreamCaption(card('moon-07', { composition: 0 }))).toBeNull(); // 원격 미연결
  });

  it('처음 꾼 꿈: 앨범에서 그 모티프의 첫 카드만, 스크린리더 설명 끝에 캡션과 함께', () => {
    const cards = [card('center.rain', { night: 1 }), card('center.leaf', { night: 2 }), card('center.rain', { night: 3 })];
    expect(cards.map((c) => firstDreamText(cards, c))).toEqual(['처음 꾼 꿈', '처음 꾼 꿈', null]);
    expect(appendA11y('아침 문장', [dreamCaption(cards[1]!), firstDreamText(cards, cards[1]!)])).toBe('아침 문장. 간밤 꿈에 잎 하나가 물 위로 떠갔어요. 처음 꾼 꿈');
    expect(appendA11y('아침 문장', [null, firstDreamText(cards, cards[2]!)])).toBe('아침 문장');
  });
});

describe('캡션을 화면에 낼지(플래그)', () => {
  beforeEach(() => setLanguagePref('ko'));
  it('보름은 독립 기능: moonNight만 켜도 보름 카드 캡션, 일반 카드는 dreamContent일 때만, 둘 다 끄면 없음(리뷰 m4)', () => {
    const moon = card('moon-12', { composition: 0 });
    const plain = card('center.rain', { cause: 'center.1' });
    expect(visibleCaption(moon, { dream: false, moon: true })).toBe('달이 차오르는 밤이라 꿈속 물 위로 달길이 놓였어요');
    expect(visibleCaption(plain, { dream: false, moon: true })).toBeNull();
    expect(visibleCaption(plain, { dream: true, moon: false })).toBe('이쪽저쪽 고루 살피더니 간밤 꿈엔 빗소리가 오래 들렸어요');
    expect(visibleCaption(moon, { dream: false, moon: false })).toBeNull();
    expect(visibleCaption(plain, { dream: false, moon: false })).toBeNull();
  });
});

describe('플래그 → sim 이벤트 필드', () => {
  it('기본값(꺼짐)이면 아무 필드도 싣지 않는다 = 빌드 1과 같은 이벤트', () => {
    expect(nightFields()).toEqual({});
  });
  it('켜면 그 필드만(시험 환경은 __DEV__ 없음 = 제품 빌드 값)', () => {
    setFeature('dreamContent', true);
    expect(nightFields()).toEqual({ dream: { enabled: true } });
    setFeature('moonNight', true);
    expect(nightFields()).toEqual({ moon: { enabled: true }, dream: { enabled: true } });
    setFeature('dreamContent', null);
    setFeature('moonNight', null);
    expect(nightFields()).toEqual({});
  });
});
