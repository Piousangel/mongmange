// B2 작은 부품: ISO 주(weekly 칸 키), 서버 난수 값, 고정 창 카운터, If-Match 읽기.
import { RECOVERY_CODE_RE, normalizeRecoveryCode } from '@mong/contract';
import { describe, expect, it } from 'vitest';
import { newCreatureCode, newReceipt, newRecoveryCode, receiptHash, recoveryHash } from '../src/account/codes';
import { Clock, isoWeekUtc, monthStart } from '../src/common/clock';
import { MAX_WINDOWS, RateLimiter } from '../src/common/rate-limiter';
import { parseRev } from '../src/saves/cloud-saves.controller';

describe('isoWeekUtc — Postgres IYYY-"W"IW와 같은 값', () => {
  it.each([
    ['2026-12-28T00:00:00Z', '2026-W53'],
    ['2027-01-03T23:59:59Z', '2026-W53'],
    ['2027-01-04T00:00:00Z', '2027-W01'],
    ['2026-01-01T12:00:00Z', '2026-W01'],
    ['2025-12-29T00:00:00Z', '2026-W01'],
    ['2026-11-20T10:00:00Z', '2026-W47'],
  ])('%s → %s', (at, w) => {
    expect(isoWeekUtc(Date.parse(at))).toBe(w);
  });
  it('그달 1일(UTC)', () => {
    expect(monthStart(Date.parse('2026-11-30T23:59:59Z')).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
});

describe('서버 난수 값', () => {
  it('인장 코드 8자·글귀 16자 Crockford, 서로 다름', () => {
    const codes = new Set(Array.from({ length: 2000 }, newCreatureCode));
    expect(codes.size).toBe(2000);
    for (const c of codes) expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    const r = newRecoveryCode();
    expect(r.display).toMatch(RECOVERY_CODE_RE);
    expect(normalizeRecoveryCode(r.display)).toBe(r.code16);
  });
  it('글자 분포가 한쪽으로 쏠리지 않는다(비트 자르기 실수 판별)', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 4000; i++) for (const ch of newRecoveryCode().code16) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    expect(counts.size).toBe(32);
    for (const n of counts.values()) expect(n).toBeGreaterThan(1500); // 기대 2000
  });
  it('글귀 해시는 pepper에 따라 다르고 평문을 담지 않는다', () => {
    const h1 = Buffer.from(recoveryHash('pepper-a'.repeat(4), '0123456789ABCDEF'));
    const h2 = Buffer.from(recoveryHash('pepper-b'.repeat(4), '0123456789ABCDEF'));
    expect(h1.equals(h2)).toBe(false);
    expect(h1.toString('latin1')).not.toContain('0123456789ABCDEF');
  });
  it('영수증 22자 base64url, 해시로만 찾는다', () => {
    const { receipt, hash } = newReceipt();
    expect(receipt).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(Buffer.from(receiptHash(receipt)).equals(Buffer.from(hash))).toBe(true);
  });
});

describe('RateLimiter', () => {
  const at = { t: 0 };
  const clock = { now: () => at.t } as Clock;
  it('규칙 하나라도 넘치면 아무것도 세지 않는다', () => {
    const l = new RateLimiter(clock);
    const hour = { name: 'h', key: 'ip', limit: 2, windowMs: 3_600_000 };
    const day = { name: 'd', key: 'ip', limit: 3, windowMs: 86_400_000 };
    expect(l.take([hour, day])).toBeNull();
    expect(l.take([hour, day])).toBeNull();
    expect(l.take([hour, day])).toBe(hour);
    at.t += 3_600_000;
    expect(l.take([hour, day])).toBeNull(); // 시간 창은 새로, 일 창은 3번째
    expect(l.take([hour, day])).toBe(day);
  });
});

describe('RateLimiter 메모리 상한(B2 리뷰 m5)', () => {
  it('하루 안에 키가 넘쳐도 MAX_WINDOWS를 넘지 않는다', () => {
    const l = new RateLimiter({ now: () => 0 } as Clock);
    for (let i = 0; i < MAX_WINDOWS + 5_000; i++) l.take([{ name: 'r', key: `k${i}`, limit: 5, windowMs: 3_600_000 }]);
    expect(l.size).toBeLessThanOrEqual(MAX_WINDOWS);
  });
});

describe('If-Match 읽기', () => {
  it.each([
    ['3', 3],
    ['"3"', 3],
    ['W/"12"', 12],
    [' 7 ', 7],
  ])('%s → %d', (h, n) => expect(parseRev(h)).toBe(n));
  it.each(['*', 'abc', '-1', '1.5', '', '"1", "2"'])('%s → null', (h) => expect(parseRev(h)).toBeNull());
});
