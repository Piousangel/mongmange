// 이름 규칙(architecture.md 3-5-2, 로드맵 B2): 앱 이름 입력·서버 공개 검사가 같은 core 함수를 쓴다.
// 그럴듯한 오답: '숫자 규칙을 넣었더니 이미 이름이 있는 세이브가 열리지 않는다' — 불러오기는 모양 검사만 해야 한다.
import { describe, expect, it } from 'vitest';
import { sim } from '../src/index';

const T0 = Date.UTC(2026, 10, 20, 10);

describe('normalizeName 숫자 규칙(7개 이상 이어지면 거부)', () => {
  it('전화번호 꼴은 거부', () => {
    expect(sim.normalizeName('01012345678')).toEqual({ ok: false, reason: 'digits' });
    expect(sim.normalizeName('1234567')).toEqual({ ok: false, reason: 'digits' });
    expect(sim.normalizeName('ab1234567')).toEqual({ ok: false, reason: 'digits' });
    expect(sim.normalizeName('Mo 12345678')).toEqual({ ok: false, reason: 'digits' });
  });
  it('여섯 개까지·글자로 끊긴 숫자는 통과', () => {
    expect(sim.normalizeName('123456')).toEqual({ ok: true, text: '123456' });
    expect(sim.normalizeName('먹보2')).toEqual({ ok: true, text: '먹보2' });
    expect(sim.normalizeName('ab123cd4567')).toEqual({ ok: true, text: 'ab123cd4567' });
    expect(sim.normalizeName('12 34 56')).toEqual({ ok: true, text: '12 34 56' });
  });
  it('구분자(공백·가운뎃점·점·하이픈)로 끊어도 숫자를 이어 센다(B2 리뷰 m4)', () => {
    for (const n of ['12 3456 7890', '010·1234·5678', '010123·45678', '010 123 4567', '01.0123.4567', '010-1234-5678']) {
      expect(sim.normalizeName(n), n).toEqual({ ok: false, reason: 'digits' });
    }
  });
  it('앞뒤·겹공백 정리 뒤에 판정한다(공백으로 끊어도 정리되면 이어진 것이 아니다)', () => {
    expect(sim.normalizeName('  1234567  ')).toEqual({ ok: false, reason: 'digits' });
  });
  it('전각·다른 문자 체계 숫자(\\p{Nd})도 센다 — 이유는 digits', () => {
    expect(sim.normalizeName('１２３４５６７')).toEqual({ ok: false, reason: 'digits' });
    expect(sim.normalizeName('٠١٢٣٤٥٦٧')).toEqual({ ok: false, reason: 'digits' });
    expect(sim.normalizeName('０１０ 1234 ５６')).toEqual({ ok: false, reason: 'digits' });
    expect(sim.normalizeName('１２３')).toEqual({ ok: false, reason: 'chars' }); // 짧으면 허용 문자 검사가 막는다
  });
  it('setName 이벤트도 숫자 규칙으로 막힌다(앱 입력과 같은 함수)', () => {
    const s0 = sim.createInitial(T0, -540, 3);
    const r = sim.reduce(s0, { type: 'setName', at: T0 + 60_000, text: '01012345678' });
    expect(r.state.name).toBeNull();
  });
});

describe('하위 호환: 숫자 규칙 전에 지은 이름이 든 세이브', () => {
  it('그대로 열린다(불러오기는 문자·길이만 본다)', () => {
    const s0 = sim.createInitial(T0, -540, 3);
    const withName = { ...s0, name: { text: '1234567', at: T0 } };
    const back = sim.parseState(sim.serializeState(withName, T0));
    expect(back.name).toEqual({ text: '1234567', at: T0 });
  });
  it('문자·길이가 깨진 이름은 여전히 손상으로 본다', () => {
    const s0 = sim.createInitial(T0, -540, 3);
    const bad = { ...s0, name: { text: '<b>', at: T0 } };
    expect(() => sim.parseState(sim.serializeState(bad, T0))).toThrow();
  });
});
