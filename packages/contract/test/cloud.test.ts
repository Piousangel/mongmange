// B2 계약(맡겨 두기·계정·삭제) — 그럴듯한 오답 판별(OPERATING 8-1):
// 요청에 기기 값·태어난 해·달·이름·미달 기록이 실려도 '그냥 받아 주는' 스키마는 실패다(처리방침 3-5·4절 '보내지 않음').
import { describe, expect, it } from 'vitest';
import {
  AGE_GATE_VERSION,
  ageGateSchema,
  AUTH_ERROR,
  bootstrapRequestSchema,
  conflictUploadSchema,
  DELETION_RECEIPT_RE,
  formatRecoveryCode,
  normalizeCreatureCode,
  normalizeRecoveryCode,
  RECOVERY_ALPHABET,
  RECOVERY_CODE_RE,
  recoverRequestSchema,
  recoverResponseSchema,
  saveMetaSchema,
  saveUploadSchema,
  webDeletionRequestSchema,
} from '../src/index';

const gate = { v: AGE_GATE_VERSION, ok: true };
const save = { body: '{"a":1}', clientSavedAt: '2026-12-24T07:30:00.000Z' };

describe('연령 확인 — 서버는 판 번호와 통과만 받는다(3-3 ③, 처리방침 4절)', () => {
  it('통과 모양만 통과', () => {
    expect(bootstrapRequestSchema.safeParse({ ageGate: gate }).success).toBe(true);
  });
  it('미달(ok:false)·태어난 해·달·나이를 실으면 거부', () => {
    expect(ageGateSchema.safeParse({ v: 2, ok: false }).success).toBe(false);
    expect(ageGateSchema.safeParse({ ...gate, birthYear: 2010 }).success).toBe(false);
    expect(ageGateSchema.safeParse({ ...gate, birthMonth: 3 }).success).toBe(false);
    expect(ageGateSchema.safeParse({ ...gate, age: 16 }).success).toBe(false);
    expect(bootstrapRequestSchema.safeParse({}).success).toBe(false);
  });
  it('bootstrap에 기기 값·이름·언어를 실으면 거부(최소 수집)', () => {
    for (const extra of [{ deviceId: 'x' }, { name: '먹보' }, { email: 'a@b.c' }, { locale: 'ko' }]) {
      expect(bootstrapRequestSchema.safeParse({ ageGate: gate, ...extra }).success).toBe(false);
    }
  });
});

describe('세이브 올림', () => {
  it('정본 3-2 모양은 통과, keep_mine만 resolve 값', () => {
    expect(saveUploadSchema.safeParse(save).success).toBe(true);
    expect(saveUploadSchema.safeParse({ ...save, resolve: 'keep_mine' }).success).toBe(true);
    expect(saveUploadSchema.safeParse({ ...save, resolve: 'merge' }).success).toBe(false);
  });
  it('기기 값(A4 결정: 받지 않음)·모르는 키는 거부', () => {
    expect(saveUploadSchema.safeParse({ ...save, deviceId: 'abc' }).success).toBe(false);
    expect(conflictUploadSchema.safeParse({ ...save, resolve: 'keep_mine' }).success).toBe(false);
  });
  it('clientSavedAt은 ISO 시각만(숫자·없는 날짜·범위 밖 거부)', () => {
    expect(saveUploadSchema.safeParse({ ...save, clientSavedAt: 1766561400000 }).success).toBe(false);
    expect(saveUploadSchema.safeParse({ ...save, clientSavedAt: '2026-13-01T00:00:00Z' }).success).toBe(false);
    expect(saveUploadSchema.safeParse({ ...save, clientSavedAt: '1999-01-01T00:00:00Z' }).success).toBe(false);
    expect(saveUploadSchema.safeParse({ ...save, clientSavedAt: '2026-12-24T16:30:00+09:00' }).success).toBe(true);
  });
  it('메타는 미래 본의 null 날 세기를 받는다', () => {
    const meta = { rev: 3, sha: 'a'.repeat(64), clientSavedAt: save.clientSavedAt, dayIndex: null, strokesTotal: null, envelopeVer: 3, simVer: 3, validated: false };
    expect(saveMetaSchema.safeParse(meta).success).toBe(true);
    expect(saveMetaSchema.safeParse({ ...meta, sha: 'A'.repeat(64) }).success).toBe(false);
  });
});

describe('되찾기 글귀', () => {
  it('알파벳은 Crockford 32자(I·L·O·U 없음)', () => {
    expect(RECOVERY_ALPHABET).toHaveLength(32);
    expect(new Set(RECOVERY_ALPHABET).size).toBe(32);
    for (const c of 'ILOU') expect(RECOVERY_ALPHABET).not.toContain(c);
  });
  it('옮겨 적은 꼴(소문자·공백·하이픈·I/L/O 혼동)을 같은 16자로 읽는다', () => {
    const c = '0123456789ABCDEF';
    expect(normalizeRecoveryCode('0123-4567-89AB-CDEF')).toBe(c);
    expect(normalizeRecoveryCode(' o123 4567 89ab cdef ')).toBe(c);
    expect(normalizeRecoveryCode('O123-4567-89AB-CDEF')).toBe(c);
    expect(normalizeRecoveryCode('0I23-4567-89AB-CDEF')).toBe(c);
    expect(formatRecoveryCode(c)).toMatch(RECOVERY_CODE_RE);
  });
  it('길이·글자가 틀리면 null(U는 Crockford에 없다)', () => {
    expect(normalizeRecoveryCode('0123-4567-89AB-CDE')).toBeNull();
    expect(normalizeRecoveryCode('0123-4567-89AB-CDEU')).toBeNull();
    expect(normalizeRecoveryCode('x'.repeat(65))).toBeNull();
  });
  it('recover 요청에는 연령 확인이 반드시 있다', () => {
    expect(recoverRequestSchema.safeParse({ code: '0123-4567-89AB-CDEF' }).success).toBe(false);
    expect(recoverRequestSchema.safeParse({ code: '0123-4567-89AB-CDEF', ageGate: gate }).success).toBe(true);
  });
});

describe('인장 코드 읽기(B2 리뷰 m7)', () => {
  it('글귀와 같은 Crockford 규칙으로 읽는다', () => {
    expect(normalizeCreatureCode('abcd-2345')).toBe('ABCD2345');
    expect(normalizeCreatureCode('O1LI 2345')).toBe('01112345');
    expect(normalizeCreatureCode('ABCD234U')).toBeNull();
    expect(normalizeCreatureCode('ABCD234')).toBeNull();
  });
});

describe('삭제', () => {
  it('영수증은 base64url 22자(128비트)', () => {
    expect(DELETION_RECEIPT_RE.test('A'.repeat(22))).toBe(true);
    expect(DELETION_RECEIPT_RE.test('A'.repeat(21))).toBe(false);
    expect(DELETION_RECEIPT_RE.test('A'.repeat(21) + '=')).toBe(false);
  });
  it('웹 삭제는 코드와 글귀 둘 다 있어야 하고, 다른 칸(이메일 등)은 거부', () => {
    expect(webDeletionRequestSchema.safeParse({ code: 'ABCD2345' }).success).toBe(false);
    expect(webDeletionRequestSchema.safeParse({ code: 'ABCD2345', phrase: 'x', email: 'a@b.c' }).success).toBe(false);
    expect(webDeletionRequestSchema.safeParse({ code: 'ABCD2345', phrase: '0123-4567-89AB-CDEF' }).success).toBe(true);
  });
});

describe('B2b — 다시 부르기(멱등)와 인증 실패 갈래', () => {
  const ok = { creature: { code: 'ABCD2345' }, save: null, newCode: '0123-4567-89AB-CDEF' };
  it('recover 응답: 처음은 replay 없음, 다시 부르기는 replay:true만(false 같은 애매한 값은 거부)', () => {
    expect(recoverResponseSchema.safeParse(ok).success).toBe(true);
    expect(recoverResponseSchema.parse({ ...ok, replay: true }).replay).toBe(true);
    expect(recoverResponseSchema.safeParse({ ...ok, replay: false }).success).toBe(false);
    expect(recoverResponseSchema.safeParse({ ...ok, creature: { code: 'abcd' } }).success).toBe(false);
  });
  it('인증 실패 코드: 토큰 문제·서버에 그 로그인 없음·옮겨 감이 서로 다른 값, 상태 번호도 고정', () => {
    expect(AUTH_ERROR).toEqual({
      unauthorized: { status: 401, code: 'unauthorized' },
      noAccount: { status: 401, code: 'no_account' },
      alreadyGone: { status: 410, code: 'no_account' },
      moved: { status: 410, code: 'moved' },
    });
  });
});
