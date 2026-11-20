// 보름 창(core 달 위상) — '그럴듯한 오답' 검사(OPERATING 8-1).
// 잡아야 할 오답: 하루 어긋남 · UTC 날짜/현지 날짜 혼동 · 현지 자정 근처 보름 · 남반구(서머타임 반대 계절) · 월 경계 귀속.
// 천문 자료: 미 해군 천문대(USNO) 위상 API, 2026~2028 보름 38개(fixtures/usno-full-moons-2026-2028.json, 11-20 조회).
import { describe, expect, it } from 'vitest';
import usno from './fixtures/usno-full-moons-2026-2028.json';
import { fullMoonDatesOfYear, fullMoonUtcMs, isMoonWindow, latestMoonNight, moonNightOf } from '../src/index';

const MIN = 60_000;
const usnoMs = usno.fullMoonsUtc.map((s) => Date.parse(s.replace('Z', ':00Z')));
/** 테스트 쪽 독립 계산(모듈의 localDateOf를 쓰지 않는다) */
const dateAt = (ms: number, off: number) => new Date(ms + off * MIN).toISOString().slice(0, 10);
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Intl로 그 순간의 실제 시간대 오프셋(분) — 손으로 적은 오프셋이 틀리지 않았는지 대조 */
function intlOffset(tz: string, ms: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return Math.round((Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!) - Math.floor(ms / MIN) * MIN) / MIN);
}

describe('Meeus 49장 보름 시각 vs USNO', () => {
  it('2026~2028 보름 38개 모두 ±1분 안(USNO는 분 단위 반올림)', () => {
    expect(usnoMs).toHaveLength(38);
    let k = Math.round((usnoMs[0]! / 86_400_000 + 2440587.5 - 2451550.09766) / 29.530588861 - 0.5) + 0.5;
    let worst = 0;
    for (const ms of usnoMs) {
      worst = Math.max(worst, Math.abs(fullMoonUtcMs(k) - ms) / MIN);
      k += 1; // 연속한 보름이 빠짐없이 이어지는지도 함께 본다
    }
    expect(worst).toBeLessThanOrEqual(1);
  });
});

describe('도시별 현지 날짜(손으로 적은 표 — USNO UT + 그날 실제 오프셋)', () => {
  // [USNO 보름 UT, 시간대, 그 순간 오프셋(분), 보름 당일 현지 날짜, 메모]
  const CASES: readonly [string, string, number, string, string][] = [
    ['2026-12-24T01:28Z', 'Asia/Seoul', 540, '2026-12-24', '출시 전 첫 보름'],
    ['2026-12-24T01:28Z', 'America/New_York', -300, '2026-12-23', 'UTC 날짜(24일)를 쓰면 하루 늦음'],
    ['2026-12-24T01:28Z', 'Australia/Sydney', 660, '2026-12-24', '남반구 여름(AEDT)'],
    ['2026-12-24T01:28Z', 'Pacific/Auckland', 780, '2026-12-24', '남반구 여름(NZDT)'],
    ['2027-01-22T12:17Z', 'Asia/Seoul', 540, '2027-01-22', ''],
    ['2027-01-22T12:17Z', 'America/New_York', -300, '2027-01-22', ''],
    ['2027-01-22T12:17Z', 'Australia/Sydney', 660, '2027-01-22', '현지 23:17 — 자정 43분 전'],
    ['2027-01-22T12:17Z', 'Pacific/Auckland', 780, '2027-01-23', '현지 01:17 — UTC 날짜와 하루 다름'],
    ['2027-02-20T23:23Z', 'Asia/Seoul', 540, '2027-02-21', '출시 뒤 첫 보름: 한국은 21일'],
    ['2027-02-20T23:23Z', 'America/New_York', -300, '2027-02-20', ''],
    ['2027-02-20T23:23Z', 'Australia/Sydney', 660, '2027-02-21', ''],
    ['2027-02-20T23:23Z', 'Pacific/Auckland', 780, '2027-02-21', ''],
    ['2026-11-24T14:53Z', 'Asia/Seoul', 540, '2026-11-24', '현지 23:53 — 자정 7분 전'],
    ['2026-11-24T14:53Z', 'Australia/Sydney', 660, '2026-11-25', '현지 01:53'],
    ['2026-11-24T14:53Z', 'Pacific/Auckland', 780, '2026-11-25', ''],
    ['2026-06-29T23:56Z', 'Atlantic/Reykjavik', 0, '2026-06-29', 'UTC 23:56 — 자정 4분 전'],
    ['2026-06-29T23:56Z', 'Europe/London', 60, '2026-06-30', 'BST 00:56'],
    ['2026-06-29T23:56Z', 'Australia/Sydney', 600, '2026-06-30', '남반구 겨울(AEST)'],
    ['2026-06-29T23:56Z', 'Pacific/Auckland', 720, '2026-06-30', '남반구 겨울(NZST)'],
    ['2027-06-19T00:44Z', 'America/New_York', -240, '2027-06-18', 'EDT 20:44'],
    ['2026-04-02T02:12Z', 'America/New_York', -240, '2026-04-01', '월 경계: 전날 밤은 3-31'],
    ['2028-12-31T16:48Z', 'Asia/Seoul', 540, '2029-01-01', '연 경계: 한국은 새해 첫날'],
    ['2028-12-31T16:48Z', 'America/New_York', -300, '2028-12-31', ''],
  ];

  it.each(CASES)('%s %s → %s', (utc, tz, off, local) => {
    const ms = Date.parse(utc.replace('Z', ':00Z'));
    expect(intlOffset(tz, ms)).toBe(off);
    expect(moonNightOf(local, off)).toMatchObject({ phase: 'full', composition: 1, fullDate: local });
    expect(moonNightOf(shift(local, -1), off)).toMatchObject({ phase: 'before', composition: 0, fullDate: local });
    expect(moonNightOf(shift(local, 1), off)).toMatchObject({ phase: 'after', composition: 2, fullDate: local });
    expect(moonNightOf(shift(local, -2), off)).toBeNull();
    expect(moonNightOf(shift(local, 2), off)).toBeNull();
  });

  it('UTC 날짜로 판정하면 틀리는 밤을 실제로 구별한다', () => {
    // 2027-02-20 23:23 UTC: UTC 날짜로는 20일이 '당일'이지만 서울의 20일 밤은 '전날'이다
    expect(moonNightOf('2027-02-20', 540)?.phase).toBe('before');
    expect(moonNightOf('2027-02-20', 0)?.phase).toBe('full');
    // 오클랜드의 2027-01-22 밤은 '전날'(당일은 23일)
    expect(moonNightOf('2027-01-22', 780)?.phase).toBe('before');
    // 뉴욕 2026-12-24 밤은 '다음 날'
    expect(moonNightOf('2026-12-24', -300)?.phase).toBe('after');
  });
});

describe('모든 시간대 전수(UTC−12 ~ UTC+14, 15분 간격) × USNO 38개', () => {
  it('보름 당일·전날·다음 날이 맞고 ±2일은 창 밖', () => {
    let checked = 0;
    for (let off = -720; off <= 840; off += 15) {
      for (const ms of usnoMs) {
        // USNO 반올림(±1분) 안에 현지 자정이 끼면 판정 불가 — 건너뛴다
        if (dateAt(ms - MIN, off) !== dateAt(ms + MIN, off)) continue;
        const d = dateAt(ms, off);
        const got = [-2, -1, 0, 1, 2].map((n) => moonNightOf(shift(d, n), off)?.phase ?? null);
        if (got.join() !== [null, 'before', 'full', 'after', null].join()) throw new Error(`${new Date(ms).toISOString()} off ${off}: ${got.join()}`);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(38 * 100);
  });
});

describe('창의 모양', () => {
  it.each([540, -300, -240, 660, 780, 0, 345, -570, 840, -720])('오프셋 %i: 2026-01-06~2028-12-28 매일 — 창은 b·f·a 사흘씩, 겹치지 않고, 보름 수가 USNO와 같다', (off) => {
    const [from, to] = ['2026-01-06', '2028-12-28'];
    let s = '';
    for (let d = from; d <= to; d = shift(d, 1)) s += moonNightOf(d, off)?.phase[0] ?? '.';
    expect(s.replace(/bfa/g, '')).toMatch(/^\.*$/);
    const expected = usnoMs.filter((ms) => dateAt(ms, off) >= from && dateAt(ms, off) <= to).length;
    expect((s.match(/f/g) ?? []).length).toBe(expected);
  });

  it('fullMoonDatesOfYear는 그 해 보름 당일과 같다', () => {
    for (const off of [540, -300, 780]) {
      const all = [2026, 2027, 2028].flatMap((y) => fullMoonDatesOfYear(y, off));
      expect(all).toEqual(usnoMs.map((ms) => dateAt(ms, off)).filter((d) => d >= '2026-01-01' && d <= '2028-12-31'));
    }
  });
});

describe('월 귀속 = 당일 밤의 현지 월', () => {
  it('사흘이 월 경계에 걸쳐도 월이 같다(뉴욕 2026-03-31 밤 → 4월)', () => {
    expect(['2026-03-31', '2026-04-01', '2026-04-02'].map((d) => moonNightOf(d, -240)?.month)).toEqual([4, 4, 4]);
  });
  it('연 경계: 서울은 2028-12-31 밤이 1월, 뉴욕은 2029-01-01 밤이 12월', () => {
    expect(['2028-12-31', '2029-01-01', '2029-01-02'].map((d) => moonNightOf(d, 540)?.month)).toEqual([1, 1, 1]);
    expect(['2028-12-30', '2028-12-31', '2029-01-01'].map((d) => moonNightOf(d, -300)?.month)).toEqual([12, 12, 12]);
  });
  it('한 달에 보름이 둘(서울 2026-05-02·05-31)이면 둘 다 5월', () => {
    expect(moonNightOf('2026-05-02', 540)).toMatchObject({ phase: 'full', month: 5 });
    expect(moonNightOf('2026-05-31', 540)).toMatchObject({ phase: 'full', month: 5 });
  });
});

describe('출시 일정 확인(number-one 2-1·7절, 기획 4-5)', () => {
  it('출시 전후 세 보름의 현지 당일', () => {
    const near = (off: number) => fullMoonDatesOfYear(2026, off).slice(-1).concat(fullMoonDatesOfYear(2027, off).slice(0, 3));
    expect(near(540)).toEqual(['2026-12-24', '2027-01-22', '2027-02-21', '2027-03-22']);
    expect(near(-300)).toEqual(['2026-12-23', '2027-01-22', '2027-02-20', '2027-03-22']);
    expect(near(780)).toEqual(['2026-12-24', '2027-01-23', '2027-02-21', '2027-03-22']);
  });
  it('2월 초 출시면 출시 주에는 보름이 없고 첫 보름 창은 2월(번들 moon-02)', () => {
    for (let d = '2027-02-01'; d <= '2027-02-07'; d = shift(d, 1)) expect(isMoonWindow(d, 540)).toBe(false);
    expect(moonNightOf('2027-02-20', 540)).toMatchObject({ phase: 'before', month: 2 });
  });
});

describe('입력 방어·긴 잠', () => {
  it('없는 날짜·형식 오류·NaN 오프셋은 null', () => {
    expect(moonNightOf('2027-02-30', 540)).toBeNull();
    expect(moonNightOf('2027-2-21', 540)).toBeNull();
    expect(moonNightOf('2027-02-21', Number.NaN)).toBeNull();
  });
  it('합친 밤 중 가장 늦은 보름 밤(순서 무관)', () => {
    const nights = ['2027-01-23', '2027-01-20', '2027-01-22', '2027-01-21'];
    expect(latestMoonNight(nights, 540)).toMatchObject({ phase: 'after', fullDate: '2027-01-22' });
    expect(latestMoonNight(['2027-01-10', '2027-01-11'], 540)).toBeNull();
  });
});
