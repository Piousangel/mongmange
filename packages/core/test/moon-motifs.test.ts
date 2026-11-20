// 보름 모티프 선택(dreams-30days v1.1 4-1·4-2·5-1) — 월 귀속·`월 mod 3` 대체·처음 3장 보호·center.moon 제외·원격 팩 자리.
import { describe, expect, it } from 'vitest';
import {
  BUNDLED_MOON_MOTIFS,
  isMoonMotifId,
  moonMotifBlockers,
  moonMotifUsable,
  moonFallbackId,
  moonMotifIdOfMonth,
  moonPackIds,
  resolveMoonMotifId,
  type ManifestLike,
} from '../src/index';

describe('오프라인 대체 표(4-1, 고정)', () => {
  it('현지 월 1..12 → moon-01·02·12 순환', () => {
    const table = Array.from({ length: 12 }, (_, i) => moonFallbackId(i + 1));
    expect(table).toEqual([
      'moon-01', 'moon-02', 'moon-12',
      'moon-01', 'moon-02', 'moon-12',
      'moon-01', 'moon-02', 'moon-12',
      'moon-01', 'moon-02', 'moon-12',
    ]);
  });
  it('12·1·2월은 대체가 곧 자기 자신', () => {
    for (const m of [12, 1, 2]) expect(moonFallbackId(m)).toBe(moonMotifIdOfMonth(m));
  });
  it('id 형식', () => {
    expect(moonMotifIdOfMonth(3)).toBe('moon-03');
    expect(isMoonMotifId('moon-11')).toBe(true);
    expect(isMoonMotifId('moon-13')).toBe(false);
    expect(isMoonMotifId('center.moon')).toBe(false);
  });
});

describe('번들 보름 3(4-2)', () => {
  it('12·1·2월(달항아리 11월은 번들 아님). 문구는 앱 i18n에만 — core `text`는 비어 있다(D-25 C6 줄, 문구 시험은 apps/mobile/test/moon-contract.test.ts)', () => {
    expect(BUNDLED_MOON_MOTIFS.map((m) => [m.id, m.month, m.schema, m.zone, m.family])).toEqual([
      ['moon-12', 12, 1, 'moon', 'moon'],
      ['moon-01', 1, 1, 'moon', 'moon'],
      ['moon-02', 2, 1, 'moon', 'moon'],
    ]);
    for (const m of BUNDLED_MOON_MOTIFS) expect(m.text).toEqual({});
  });
  it('형상은 아트 레인(C14) 몫 — 지금은 자리표시', () => {
    for (const m of BUNDLED_MOON_MOTIFS) expect([m.placeholder, m.paths.length]).toEqual([true, 0]);
  });
  it('제품 출시 차단 목록: 자리표시 형상 + en scene 초안이 걸린다(고치면 이 목록을 함께 줄인다)', () => {
    expect(BUNDLED_MOON_MOTIFS.flatMap((m) => moonMotifBlockers(m.id))).toEqual([
      'moon-12: 형상 자리표시(C14)',
      'moon-12: en.scene 초안',
      'moon-01: 형상 자리표시(C14)',
      'moon-01: en.scene 초안',
      'moon-02: 형상 자리표시(C14)',
      'moon-02: en.scene 초안',
    ]);
    for (const m of BUNDLED_MOON_MOTIFS) {
      expect(m.draft).toContain('en.scene');
      expect(moonMotifUsable(m.id, false)).toBe(false);
      expect(moonMotifUsable(m.id, true)).toBe(true);
    }
    // 원격(번들 아님) id는 contract 검증을 통과해 기기에 있으므로 막지 않는다
    expect(moonMotifBlockers('moon-03')).toEqual([]);
  });
});

describe('원격 팩 연결 자리', () => {
  const manifest: ManifestLike = {
    motifs: [
      { id: 'w2027-06-crane', kind: 'weekly', from: '2027-02-08', minAppBuild: 14 },
      { id: 'moon-03', kind: 'moon', month: 3, minAppBuild: 14 },
      { id: 'moon-04', kind: 'moon', month: 4, minAppBuild: 99 },
      { id: 'moon-05', kind: 'moon', month: 5, minAppBuild: 1 },
      { id: 'moon-06', kind: 'moon', month: 7, minAppBuild: 1 },
    ],
    revoked: ['moon-05'],
  };
  it('moonPackIds: 보름만, minAppBuild 통과, revoked·id/month 불일치 제외', () => {
    expect(moonPackIds(manifest, 14)).toEqual(['moon-03']);
    expect(moonPackIds(manifest, 99)).toEqual(['moon-03', 'moon-04']);
  });
  it('resolveMoonMotifId: 번들 → 받아 둔 원격 → `월 mod 3` 대체', () => {
    expect(resolveMoonMotifId(1, [])).toBe('moon-01');
    expect(resolveMoonMotifId(3, ['moon-03'])).toBe('moon-03');
    expect(resolveMoonMotifId(3, [])).toBe('moon-12');
    expect(resolveMoonMotifId(11, ['moon-03'])).toBe('moon-02');
    // 서버 없이도 보름밤은 늘 온다(P1): 12달 모두 번들 id로 끝난다
    for (let m = 1; m <= 12; m++) expect(['moon-12', 'moon-01', 'moon-02']).toContain(resolveMoonMotifId(m, []));
  });
});
