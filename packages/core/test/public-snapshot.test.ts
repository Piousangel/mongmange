// 공개 스냅숏 snap:1(architecture.md 3-5-1). 고정물 test/fixtures/snap/*.json은 서버 e2e(B3)도 같은 파일을 읽는다.
// 그럴듯한 오답: '모르는 키를 조용히 버리고 통과' — 그러면 앱이 relation·age 같은 사생활 값을 실어도 서버가 공개 파일에 쓴다.
import { describe, expect, it } from 'vitest';
import f0 from './fixtures/snap/ok.json';
import f1 from './fixtures/snap/named.json';
import f2 from './fixtures/snap/pre-ire.json';
import f3 from './fixtures/snap/max-size.json';
import f4 from './fixtures/snap/theta-wrap.json';
import f5 from './fixtures/snap/forbidden-key.json';
import f6 from './fixtures/snap/age-key.json';
import f7 from './fixtures/snap/pts-65.json';
import f8 from './fixtures/snap/b64-mismatch.json';
import f9 from './fixtures/snap/anc-out.json';
import { decodeSnapPoints, encodeSnapPoints, parsePublicSnapshot, serializePublicSnapshot, SNAP_LIMITS } from '../src/index';

const FX: Record<string, unknown> = { 'ok': f0, 'named': f1, 'pre-ire': f2, 'max-size': f3, 'theta-wrap': f4, 'forbidden-key': f5, 'age-key': f6, 'pts-65': f7, 'b64-mismatch': f8, 'anc-out': f9 };
/** 고정물의 깊은 사본(시험이 고치지 못하게) */
const fx = (name: string): unknown => JSON.parse(JSON.stringify(FX[name]));

describe('parsePublicSnapshot — 고정물', () => {
  it.each(['ok', 'named', 'pre-ire', 'max-size', 'theta-wrap'])('%s 통과', (n) => {
    expect(parsePublicSnapshot(fx(n)).ok).toBe(true);
  });
  it.each([
    ['forbidden-key', 'unknown_key', 'relation'],
    ['age-key', 'unknown_key', 'strokes.0.age'],
    ['pts-65', 'range', 'strokes.0.n'],
    ['b64-mismatch', 'pts', 'strokes.0.pts'],
    ['anc-out', 'range', 'strokes.0.anc'],
  ])('%s 거부(%s %s)', (n, reason, path) => {
    expect(parsePublicSnapshot(fx(n))).toEqual({ ok: false, reason, path });
  });
  it('최대 크기 고정물(획 24 × 64점 + 스밈 39 × 16점)이 32KB 상한 안 — 상한이 두 배 여유', () => {
    const r = parsePublicSnapshot(fx('max-size'));
    if (!r.ok) throw new Error(r.reason);
    const bytes = new TextEncoder().encode(serializePublicSnapshot(r.snap, '가나다라마바')).length;
    expect(bytes).toBeLessThan(SNAP_LIMITS.bytes / 2);
  });
});

describe('parsePublicSnapshot — 범위·개수', () => {
  const ok = fx('ok') as Record<string, unknown>;
  const with_ = (patch: Record<string, unknown>) => parsePublicSnapshot({ ...ok, ...patch });
  it('snap 2·문자열 숫자·NaN 꼴·없는 날짜는 거부', () => {
    expect(with_({ snap: 2 })).toMatchObject({ ok: false, reason: 'version' });
    expect(with_({ dayAtPublish: '9' })).toMatchObject({ ok: false, reason: 'type' });
    expect(with_({ coreScale: 1310.5 })).toMatchObject({ ok: false, reason: 'type' });
    expect(with_({ born: { date: '2026-02-30', shape: 1, comb: 2 } })).toMatchObject({ ok: false, reason: 'range', path: 'born.date' });
    expect(with_({ born: { date: '2026-12-22', shape: 3, comb: 2 } })).toMatchObject({ ok: false, path: 'born.shape' });
  });
  it('획 25개·고정 획 4개·스밈 40개는 count', () => {
    const s = (ok.strokes as unknown[])[2] as Record<string, unknown>;
    expect(with_({ strokes: Array(25).fill(s) })).toMatchObject({ ok: false, reason: 'count', path: 'strokes' });
    expect(with_({ strokes: Array(4).fill({ ...s, fixed: 1 }) })).toMatchObject({ ok: false, reason: 'count' });
    expect(with_({ soak: Array(40).fill({ n: 2, pts: 'AAAAAAAAAAA=' }) })).toMatchObject({ ok: false, reason: 'count', path: 'soak' });
  });
  it('모르는 먹·결은 거부, 이름은 형태만(24자 넘으면 거부)', () => {
    expect(with_({ ink: 'gold' })).toMatchObject({ ok: false, path: 'ink' });
    expect(with_({ texture: 'shy' })).toMatchObject({ ok: false, path: 'texture' });
    expect(with_({ name: 'x'.repeat(25) })).toMatchObject({ ok: false, path: 'name' });
  });
  it('배열·null·문자열은 not_object', () => {
    for (const v of [null, [], 'snap', 1]) expect(parsePublicSnapshot(v)).toMatchObject({ ok: false, reason: 'not_object' });
  });
  it('프로토타입 오염 키(__proto__ JSON 키)도 모르는 키로 거부', () => {
    expect(parsePublicSnapshot(JSON.parse(`{"__proto__":{"x":1},${JSON.stringify(ok).slice(1)}`))).toMatchObject({ ok: false, reason: 'unknown_key' });
  });
});

describe('serializePublicSnapshot — 서버가 쓰는 바이트', () => {
  it('키 순서 고정·공백 없음, 같은 값이면 입력 키 순서와 무관하게 같은 바이트', () => {
    const r1 = parsePublicSnapshot(fx('ok'));
    const shuffled = Object.fromEntries(Object.entries(fx('ok') as object).reverse());
    const r2 = parsePublicSnapshot(shuffled);
    if (!r1.ok || !r2.ok) throw new Error('parse');
    expect(serializePublicSnapshot(r1.snap, null)).toBe(serializePublicSnapshot(r2.snap, null));
    expect(serializePublicSnapshot(r1.snap, null)).not.toMatch(/\s/);
  });
  it('앱이 보낸 name은 늘 무시 — 인자가 null이면 키 자체가 없다, 인자를 주면 그 값', () => {
    const r = parsePublicSnapshot(fx('named'));
    if (!r.ok) throw new Error('parse');
    expect(serializePublicSnapshot(r.snap, null)).not.toContain('"name"');
    expect(serializePublicSnapshot(r.snap, null)).not.toContain('몽이');
    expect(JSON.parse(serializePublicSnapshot(r.snap, '달이')).name).toBe('달이');
  });
});

describe('점 양자화(θ·d int16)', () => {
  it('θ 2π 근처는 넘치지 않고 접힌다, d 범위 밖은 null(자르지 않음)', () => {
    const b = encodeSnapPoints([{ theta: 2 * Math.PI - 1e-9, d: 0.1 }, { theta: Math.PI, d: -0.2 }])!;
    const back = decodeSnapPoints(b);
    expect(back[0]!.theta).toBeCloseTo(0, 3);
    expect(back[1]!.theta).toBeCloseTo(Math.PI, 3);
    expect(back[1]!.d).toBeCloseTo(-0.2, 3);
    expect(encodeSnapPoints([{ theta: 0, d: 9 }])).toBeNull();
  });
});
