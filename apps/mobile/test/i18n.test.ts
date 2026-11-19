// i18n 코어: ICU 부분 구현, 한국어 조사, 두 언어 표의 키·변수 일치, 언어 고르기, 날짜·시각.
import { afterEach, describe, expect, it } from 'vitest';
import { __setDeviceTagForTest, clockTime, dayName, getLocale, localeFromTag, messages, nightName, setLanguagePref, subscribeLocale, t, tIn, wakeClock, type MessageKey } from '../src/i18n';
import { PLURAL, argNames, format, parse } from '../src/i18n/icu';
import { josa, jongseong } from '../src/i18n/josa';

afterEach(() => {
  __setDeviceTagForTest('ko-KR');
  setLanguagePref('system');
});

describe('ICU 부분 구현', () => {
  const f = (src: string, p: Record<string, string | number>, loc: 'ko' | 'en' = 'en') => format(parse(src), p, PLURAL[loc]);
  it('변수·복수·고르기·#', () => {
    expect(f('Hi {name}', { name: 'Ann' })).toBe('Hi Ann');
    expect(f('{n, plural, one {# card} other {# cards}}', { n: 1 })).toBe('1 card');
    expect(f('{n, plural, one {# card} other {# cards}}', { n: 3 })).toBe('3 cards');
    expect(f('{n, plural, =0 {none} one {# card} other {# cards}}', { n: 0 })).toBe('none');
    expect(f('{n, plural, one {# 장} other {# 장들}}', { n: 1 }, 'ko')).toBe('1 장들'); // 한국어는 늘 other
    expect(f('{s, select, a {A} other {Z}}', { s: 'a' })).toBe('A');
    expect(f('{s, select, a {A} other {Z}}', { s: 'q' })).toBe('Z');
    expect(f('{h}{half, select, yes {:30} other {}} x', { h: 6, half: 'no' })).toBe('6 x');
  });
  it('가지 안의 변수와 겹친 괄호', () => {
    expect(f('{n, plural, =1 {first} other {{day} night}}', { n: 2, day: 'Day 2' })).toBe('Day 2 night');
  });
  it('plural 안에 중첩된 select 가지의 #도 수로 바뀐다(리뷰 P2)', () => {
    expect(f('{n, plural, one {{g, select, a {# A} other {# Z}}} other {{g, select, a {# As} other {# Zs}}}}', { n: 1, g: 'a' })).toBe('1 A');
    expect(f('{n, plural, one {{g, select, a {# A} other {# Z}}} other {{g, select, a {# As} other {# Zs}}}}', { n: 3, g: 'q' })).toBe('3 Zs');
    expect(f('{g, select, a {# stays} other {x}}', { g: 'a' })).toBe('# stays'); // plural 밖의 #은 글자
  });
  it('표에 없는 조사 스타일은 파싱에서 실패한다(리뷰 P2)', () => {
    expect(() => parse('{x, josa, 으로}')).toThrow(/josa style/);
    expect(() => parse('{x, josa, 을를}')).toThrow(/josa style/);
    expect(() => josa('달', '을를')).toThrow();
  });
  it('작은따옴표는 글자 그대로(영어 아포스트로피)', () => {
    expect(f("today's {x}", { x: 'stroke' })).toBe("today's stroke");
  });
  it('문법 오류는 바로 드러난다', () => {
    expect(() => parse('{n, plural, one {x}}')).toThrow(/other/);
    expect(() => parse('{n, plural, one {x} other {y}')).toThrow();
    expect(() => parse('{bad name}')).toThrow();
  });
});

describe('한국어 조사', () => {
  it('받침 유무', () => {
    expect(josa('둥근 달', '이/가')).toBe('둥근 달이');
    expect(josa('빗소리', '이/가')).toBe('빗소리가');
    expect(josa('찻잔 하나', '을/를')).toBe('찻잔 하나를');
    expect(josa('먼 산', '을/를')).toBe('먼 산을');
    expect(josa('몽망이', '은/는')).toBe('몽망이는');
    expect(josa('바다', '와/과')).toBe('바다와');
    expect(josa('이불', '와/과')).toBe('이불과');
  });
  it('(으)로: ㄹ 받침은 로', () => {
    expect(josa('물', '으로/로')).toBe('물로');
    expect(josa('산', '(으)로')).toBe('산으로');
    expect(josa('바다', '(으)로')).toBe('바다로');
  });
  it('숫자는 읽는 소리, 끝 문장부호는 건너뜀, 모르는 글자는 둘 다', () => {
    expect(josa('3', '이/가')).toBe('3이');
    expect(josa('2', '이/가')).toBe('2가');
    expect(josa('7', '(으)로')).toBe('7로');
    expect(jongseong('달)')).toBe(8);
    expect(josa('Mongmangi', '이/가')).toBe('Mongmangi이(가)');
  });
  it('끝 문장부호·괄호는 건너뛰고 판정한다(리뷰 P2)', () => {
    expect(josa('몽망이(Mongmangi)', '이/가')).toBe('몽망이(Mongmangi)가');
    expect(josa('둥근 달(月)', '을/를')).toBe('둥근 달(月)을');
    expect(josa('달.', '이/가')).toBe('달이.');
    expect(josa('바다…', '은/는')).toBe('바다는…');
    expect(josa('「먼 산」', '이/가')).toBe('「먼 산」이');
  });
});

describe('언어 표', () => {
  const ko = messages('ko');
  const en = messages('en');
  const keys = Object.keys(ko) as MessageKey[];
  it('두 표의 키가 같다(타입이 1차로 막고, 여기서 한 번 더)', () => {
    expect(Object.keys(en).sort()).toEqual([...keys].sort());
  });
  it('모든 문구가 파싱되고 비어 있지 않다', () => {
    for (const loc of ['ko', 'en'] as const) for (const k of keys) expect(messages(loc)[k].length, `${loc} ${k}`).toBeGreaterThan(0);
    for (const k of keys) {
      parse(ko[k]);
      parse(en[k]);
    }
  });
  it('영어가 쓰는 변수는 한국어(타입의 정본)에 모두 있다', () => {
    for (const k of keys) {
      const ka = argNames(parse(ko[k]));
      for (const a of argNames(parse(en[k]))) expect(ka.has(a), `${k}: en {${a}}`).toBe(true);
    }
  });
  it('타입 수준 변수 추출 규칙 = 실제 파서(가지 본문이 식별자 한 단어면 실패)', () => {
    for (const k of keys) {
      const typeLike = new Set([...ko[k].matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g)].map((m) => m[1]));
      expect([...typeLike].sort(), k).toEqual([...argNames(parse(ko[k]))].sort());
    }
  });
  it('한국어 표에 영어 호칭이, 영어 표에 한글이 섞이지 않는다', () => {
    for (const k of keys) {
      expect(/[가-힣]/.test(en[k]), `en ${k}`).toBe(false);
      expect(/Mongmang/i.test(ko[k]), `ko ${k}`).toBe(false);
    }
  });
  it('영어 시 문구는 광고체가 아니다(느낌표·cute·amazing 없음)', () => {
    for (const k of keys) expect(/!|\bcute\b|\bamazing\b|\bawesome\b/i.test(en[k]), k).toBe(false);
  });
});

describe('언어 고르기', () => {
  it('기기 태그 → 언어(한국어가 아니면 영어)', () => {
    expect(localeFromTag('ko-KR')).toBe('ko');
    expect(localeFromTag('ko')).toBe('ko');
    expect(localeFromTag('en-GB')).toBe('en');
    expect(localeFromTag('ja-JP')).toBe('en');
    expect(localeFromTag(null)).toBe('en');
  });
  it('기기 따름 / 고정, 바뀌면 구독자에 알림(다음 마이크로태스크)', async () => {
    __setDeviceTagForTest('ja-JP');
    setLanguagePref('system');
    expect(getLocale()).toBe('en');
    await Promise.resolve();
    let hits = 0;
    const off = subscribeLocale(() => hits++);
    setLanguagePref('ko');
    expect(getLocale()).toBe('ko');
    setLanguagePref('ko');
    await Promise.resolve();
    expect(hits).toBe(1);
    setLanguagePref('en');
    expect(t('obj.brush')).toBe('Brush');
    off();
  });
});

describe('날·시각 표기', () => {
  it('날 세기: 한국어 고유어, 영어 Day n', () => {
    setLanguagePref('ko');
    expect(dayName(0)).toBe('첫날');
    expect(dayName(6)).toBe('이레째');
    expect(dayName(14)).toBe('15일째');
    expect(nightName(0)).toBe('첫 밤');
    expect(nightName(2)).toBe('사흘째 밤');
    setLanguagePref('en');
    expect(dayName(6)).toBe('Day 7');
    expect(nightName(0)).toBe('First night');
    expect(nightName(2)).toBe('Night 3');
    expect(tIn('en', 'note.cards', { n: 1 })).toBe('1 dream card');
    expect(tIn('en', 'note.cards', { n: 4 })).toBe('4 dream cards');
    expect(tIn('ko', 'note.cards', { n: 4 })).toBe('인화 카드 4장');
  });
  it('깨는 시각: 30분 단위 대략', () => {
    const KST = 540;
    const at = (h: number, m: number) => Date.UTC(2026, 10, 21, h, m) - KST * 60_000;
    setLanguagePref('ko');
    expect(wakeClock(at(6, 0), KST)).toBe('아침 6시쯤');
    expect(wakeClock(at(11, 30), KST)).toBe('오전 11시 반쯤');
    expect(wakeClock(at(19, 50), KST)).toBe('저녁 8시쯤');
    setLanguagePref('en');
    expect(wakeClock(at(6, 0), KST)).toBe('around 6 a.m.');
    expect(wakeClock(at(11, 30), KST)).toBe('around 11:30 a.m.');
    expect(wakeClock(at(19, 50), KST)).toBe('around 8 p.m.');
    expect(wakeClock(at(0, 10), KST)).toBe('around midnight');
    expect(wakeClock(at(23, 50), KST)).toBe('around midnight');
    expect(wakeClock(at(12, 0), KST)).toBe('around noon');
    expect(wakeClock(at(12, 30), KST)).toBe('around 12:30 p.m.');
    setLanguagePref('ko');
    expect(wakeClock(at(0, 0), KST)).toBe('자정쯤');
    expect(wakeClock(at(11, 50), KST)).toBe('정오쯤');
  });
  it('설정 시각은 Intl 표기(영어 12시간제, 한국어 오전/오후)', () => {
    __setDeviceTagForTest('en-US');
    expect(clockTime(23 * 60, 'en')).toMatch(/^11:00\s?PM$/);
    expect(clockTime(6 * 60 + 30, 'ko')).toMatch(/오전\s?6:30/);
  });
});
