// 코드 게이트(B0 리뷰 m1): 설정 토글이 연결되기 전(METRICS_SETTING_CONNECTED = false)에는 **서버 주소가 있어도** 핑이 나가지 않는다.
// 토글을 연결하는 작업이 이 상수를 바꾸면 이 시험의 첫 단언이 실패한다 — 그때 토글 화면·처리방침 게시를 함께 확인하고 시험을 고친다.
// 또 이름 A/B 군은 통계와 무관하게 설치 때 정해진다(리뷰 I7).
import { describe, expect, it } from 'vitest';
import { ensureNameTimingGroup, readNameTimingGroup } from '../src/game/abGroup';
import { METRICS_OFF_KEY, METRICS_SETTING_CONNECTED, metricsConsent } from '../src/net/gate';
import type { FetchLike } from '../src/net/http';
import { createPingClient } from '../src/net/ping';

function memKV() {
  const m = new Map<string, string>();
  return { getString: (k: string) => m.get(k), set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k), m };
}

describe('핑 게이트', () => {
  it('설정 토글 연결 전: 동의는 늘 거짓 → 주소가 있어도 아무것도 보내지 않는다', async () => {
    expect(METRICS_SETTING_CONNECTED).toBe(false);
    const kv = memKV();
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
  it('연결된 뒤의 규칙: 토글이 끔(1)이면 거짓, 아니면 참', () => {
    const kv = memKV();
    expect(metricsConsent(kv, true)).toBe(true);
    kv.set(METRICS_OFF_KEY, '1');
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
