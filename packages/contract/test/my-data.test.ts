// C12f '맡긴 것 보기'(처리방침 12절 열람) 응답 계약 — 그럴듯한 오답 판별(OPERATING 8-1):
// 세이브 본문·이름·글귀(해시 포함)·sub·IP 같은 칸이 응답에 섞여도 '그냥 받아 주는' 스키마는 실패다(유저 글자 노출 0).
import { describe, expect, it } from 'vitest';
import { MY_DATA_PER_HOUR, myDataSchema, PAGE_STATES } from '../src/index';

const ok = {
  account: { createdAt: '2026-11-20T10:00:00.000Z', lastActiveMonth: '2026-11', ageGateVersion: 2, ageConfirmedOn: '2026-11-20', logins: 1, movedLogins: 0, deletionPendingUntil: null },
  creatures: 1,
  creature: {
    code: 'ABCD2345',
    createdAt: '2026-11-20T10:00:00.000Z',
    recoveryCodeSet: true,
    link: { enabled: false, nameVisible: false, nameShown: false, pageState: null, publishedAt: null },
  },
  save: { rev: 3, clientSavedAt: '2026-11-20T10:00:00.000Z', lastSavedAt: '2026-11-21T10:00:00.000Z', dayIndex: 2, strokesTotal: 9, validated: true, bytes: 1834 },
  versions: [{ reason: 'conflict', createdAt: '2026-11-21T10:00:00.000Z', clientSavedAt: '2026-11-20T10:00:00.000Z', dayIndex: 1, strokesTotal: 3, bytes: 900 }],
};

describe('GET /me/data 응답(C12f)', () => {
  it('메타만 있는 모양은 통과, 맡긴 것이 아직 없으면(creature·save null, versions 빈 배열)도 통과', () => {
    expect(myDataSchema.safeParse(ok).success).toBe(true);
    expect(myDataSchema.safeParse({ ...ok, creatures: 0, creature: null, save: null, versions: [] }).success).toBe(true);
  });
  it.each([
    ['세이브 본문', { ...ok, save: { ...ok.save, body: '{"a":1}' } }],
    ['이력 본문', { ...ok, versions: [{ ...ok.versions[0], body: '{}' }] }],
    ['이름', { ...ok, creature: { ...ok.creature, name: '몽이' } }],
    ['링크 이름', { ...ok, creature: { ...ok.creature, link: { ...ok.creature.link, name: '몽이' } } }],
    ['글귀 해시', { ...ok, creature: { ...ok.creature, recoveryHash: 'ab' } }],
    ['sub', { ...ok, account: { ...ok.account, sub: '00000000-0000-0000-0000-000000000000' } }],
    ['userId', { ...ok, userId: 'u' }],
    ['sha', { ...ok, save: { ...ok.save, sha: 'a'.repeat(64) } }],
  ])('%s 칸이 섞이면 거부(strict — 유저 글자·식별자 노출 0)', (_n, v) => {
    expect(myDataSchema.safeParse(v).success).toBe(false);
  });
  it('크기는 0 이상 정수, 몽망이 수는 0·1', () => {
    expect(myDataSchema.safeParse({ ...ok, save: { ...ok.save, bytes: -1 } }).success).toBe(false);
    expect(myDataSchema.safeParse({ ...ok, save: { ...ok.save, bytes: 1.5 } }).success).toBe(false);
    expect(myDataSchema.safeParse({ ...ok, creatures: 2 }).success).toBe(false);
  });
  it('활동 달은 YYYY-MM(날짜·시각이 아니다)', () => {
    expect(myDataSchema.safeParse({ ...ok, account: { ...ok.account, lastActiveMonth: '2026-11-20' } }).success).toBe(false);
  });
  it('공개 페이지 상태 갈래는 PAGE_STATES와 같다(한쪽만 늘면 실패)', () => {
    for (const st of PAGE_STATES) expect(myDataSchema.safeParse({ ...ok, creature: { ...ok.creature, link: { ...ok.creature.link, pageState: st } } }).success, st).toBe(true);
    expect(myDataSchema.safeParse({ ...ok, creature: { ...ok.creature, link: { ...ok.creature.link, pageState: 'gone' } } }).success).toBe(false);
  });
  it('사용자당 시간 한도는 양의 정수', () => {
    expect(Number.isInteger(MY_DATA_PER_HOUR) && MY_DATA_PER_HOUR > 0).toBe(true);
  });
});
