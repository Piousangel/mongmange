// 통계 동의 게이트(C11 — 처리방침 1·3-1·K1·K25): '직접 켠 만 14세 확인 통과자만' 켜짐, 기본 꺼짐.
// - 코드 게이트(B0 리뷰 m1): 설정 토글 연결 상수(METRICS_SETTING_CONNECTED)가 false인 동안은 무엇을 켜 두어도 보내지 않는다.
//   켜기는 PM 결정이다 — 이 상수를 바꾸면 첫 단언이 실패한다. 그때 토글 화면·처리방침 게시를 함께 확인하고 시험을 고친다.
// - 연령 확인 기록은 맡겨 두기와 **같은 기록**(cloud/ageGate.ts AGE_KEY)을 쓴다: 한쪽에서 통과하면 다른 쪽에서 다시 묻지 않는다.
// 또 이름 A/B 군은 통계와 무관하게 설치 때 정해진다(리뷰 I7).
import { describe, expect, it } from 'vitest';
import { AGE_KEY, recordAge } from '../src/cloud/ageGate';
import { ensureNameTimingGroup, readNameTimingGroup } from '../src/game/abGroup';
import { LEGACY_METRICS_OFF_KEY, METRICS_ON_KEY, METRICS_SETTING_CONNECTED, metricsConsent, metricsSetting, setMetricsOn } from '../src/net/gate';
import type { FetchLike } from '../src/net/http';
import { createPingClient, NET_KEYS } from '../src/net/ping';

function memKV() {
  const m = new Map<string, string>();
  return { getString: (k: string) => m.get(k), set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k), m };
}
const AT = Date.UTC(2026, 11, 22, 3);
const TZ = 540;

describe('핑 게이트 — 연결 상수', () => {
  it('설정 토글 연결 전: 켜 두고 연령 확인을 통과해도 동의는 거짓 → 주소가 있어도 아무것도 보내지 않는다', async () => {
    expect(METRICS_SETTING_CONNECTED).toBe(false);
    const kv = memKV();
    recordAge(kv, 'pass', AT, TZ);
    kv.set(METRICS_ON_KEY, '1');
    expect(metricsConsent(kv)).toBe(false);
    let calls = 0;
    const f: FetchLike = async () => {
      calls++;
      return { ok: true, status: 204, text: async () => '' };
    };
    ensureNameTimingGroup(kv);
    const c = createPingClient({ kv, fetch: f, apiBase: 'https://api.example', consent: () => metricsConsent(kv), nameTiming: () => readNameTimingGroup(kv) });
    const ctx = { cohortDay: '2026-12-22', dayN: 0, tzOffsetMin: 540, platform: 'ios', appVer: '1.0', lang: 'ko' } as const;
    expect(c.enabled()).toBe(false);
    expect(c.recordOpen(ctx)).toBe(false);
    c.track('share_link', ctx);
    await c.flush(ctx);
    expect(calls).toBe(0);
  });
});

describe('핑 게이트 — 연결된 뒤의 규칙(opt-in, K1·K25)', () => {
  it('새 설치 = 보내지 않음(기본 꺼짐)', () => {
    expect(metricsConsent(memKV(), true)).toBe(false);
  });
  it('켠 표시가 없으면 거짓 — 옛 opt-out 규칙(끈 표시가 없으면 켜짐)으로 돌아가지 않는다', () => {
    const kv = memKV();
    recordAge(kv, 'pass', AT, TZ);
    expect(metricsConsent(kv, true)).toBe(false);
    kv.set(LEGACY_METRICS_OFF_KEY, '0'); // 옛 키에 무엇이 있어도
    expect(metricsConsent(kv, true)).toBe(false);
  });
  it('켠 표시가 있어도 연령 확인 통과 기록이 없으면 거짓(미달·기록 없음·옛 판 기록·깨진 기록)', () => {
    for (const age of [undefined, 'under:2026-12-22', 'pass:1:2026-12-01', 'pass:x', '']) {
      const kv = memKV();
      if (age !== undefined) kv.set(AGE_KEY, age);
      kv.set(METRICS_ON_KEY, '1');
      expect(metricsConsent(kv, true), String(age)).toBe(false);
    }
  });
  it('직접 켠 통과자만 참. 켠 표시는 정확히 "1"만', () => {
    const kv = memKV();
    recordAge(kv, 'pass', AT, TZ);
    kv.set(METRICS_ON_KEY, 'true');
    expect(metricsConsent(kv, true)).toBe(false);
    kv.set(METRICS_ON_KEY, '1');
    expect(metricsConsent(kv, true)).toBe(true);
  });
  it('저장소가 던지면 거짓(안전 쪽)', () => {
    const kv = {
      getString: () => {
        throw new Error('x');
      },
      set: () => {},
      remove: () => {},
    };
    expect(metricsConsent(kv, true)).toBe(false);
  });
});

describe('설정 토글 상태(통과자에게만 토글이 보인다 — K25)', () => {
  it('기록 없음 → needAge, 오늘 미달 → under(켤 수 없음), 다음 날 → 다시 needAge, 통과 → off', () => {
    const kv = memKV();
    expect(metricsSetting(kv, AT, TZ)).toEqual({ kind: 'needAge' });
    recordAge(kv, 'under', AT, TZ);
    expect(metricsSetting(kv, AT, TZ)).toEqual({ kind: 'under' });
    expect(metricsSetting(kv, AT + 86_400_000, TZ)).toEqual({ kind: 'needAge' });
    recordAge(kv, 'pass', AT, TZ);
    expect(metricsSetting(kv, AT, TZ)).toEqual({ kind: 'off' });
  });
  it('켜기는 통과자만 된다 — 미달·기록 없음이면 거절하고 아무것도 쓰지 않는다', () => {
    const kv = memKV();
    expect(setMetricsOn(kv, true)).toBe(false);
    recordAge(kv, 'under', AT, TZ);
    expect(setMetricsOn(kv, true)).toBe(false);
    expect(kv.m.has(METRICS_ON_KEY)).toBe(false);
    recordAge(kv, 'pass', AT, TZ);
    expect(setMetricsOn(kv, true)).toBe(true);
    expect(metricsSetting(kv, AT, TZ)).toEqual({ kind: 'on' });
  });
  it('끄면 켠 표시와 기기에 모아 둔 통계(아웃박스·재시도 대기)를 지운다(처리방침 3-1 "켜고 끄기")', () => {
    const kv = memKV();
    recordAge(kv, 'pass', AT, TZ);
    setMetricsOn(kv, true);
    kv.set(NET_KEYS.outbox, '[{"e":"open","dayN":0,"dims":{"nt":"A","wg":"-","moon":"0"}}]');
    kv.set(NET_KEYS.retry, '{"at":1,"n":1}');
    expect(setMetricsOn(kv, false)).toBe(true);
    expect(kv.m.has(METRICS_ON_KEY)).toBe(false);
    expect(kv.m.has(NET_KEYS.outbox)).toBe(false);
    expect(kv.m.has(NET_KEYS.retry)).toBe(false);
    expect(metricsSetting(kv, AT, TZ)).toEqual({ kind: 'off' });
  });
  it('연령 확인 판이 바뀌면(통과 기록이 옛 판) 켠 표시가 있어도 needAge로 돌아가고 동의는 거짓', () => {
    const kv = memKV();
    kv.set(AGE_KEY, 'pass:1:2026-12-01');
    kv.set(METRICS_ON_KEY, '1');
    expect(metricsSetting(kv, AT, TZ)).toEqual({ kind: 'needAge' });
    expect(metricsConsent(kv, true)).toBe(false);
  });
});

describe('이름 A/B 군(설치 때, 통계와 무관)', () => {
  it('한 번 정하면 바뀌지 않고, 게임이 읽는 값 = 핑이 보내는 값', () => {
    const kv = memKV();
    expect(readNameTimingGroup(kv)).toBeNull();
    expect(ensureNameTimingGroup(kv, () => 0.9)).toBe('B');
    expect(ensureNameTimingGroup(kv, () => 0.1)).toBe('B');
    expect(readNameTimingGroup(kv)).toBe('B');
  });
});
