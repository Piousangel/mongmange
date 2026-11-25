// 맡겨 두기 로그인 포트(C11 — architecture 3-3): Supabase Auth REST 익명 로그인 어댑터(cloud/api.ts CloudAuth 모양).
// supabase-js를 들이지 않고 fetch로 GoTrue 세 경로(signup 익명·token refresh·logout)만 쓴다 — 빌드 2 동결 뒤에도 OTA로 고칠 수 있게(네이티브 0).
// 요청 스냅숏: 로그인 요청 본문은 `{"data":{}}` 하나 — 기기 값·이름·이메일·태어난 해·달 0. 머리글은 apikey(공개 키)·content-type뿐.
// 세션은 세이브와 다른 저장소(세션 전용 KV, 3-3 ④)에 둔다.
import { describe, expect, it } from 'vitest';
import type { FetchLike } from '../src/net/http';
import { createSupabaseAuth, refreshEnded, SESSION_KEY, startOver, SUPABASE_USER_AGENT } from '../src/net/supabaseAuth';

function memKV() {
  const m = new Map<string, string>();
  return { getString: (k: string) => m.get(k), set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k), m };
}
type Req = { url: string; method?: string; headers?: Record<string, string>; body?: string };
function fake(res: Array<{ status: number; body?: unknown } | 'network'>) {
  const reqs: Req[] = [];
  const f: FetchLike = async (url, init) => {
    reqs.push({ url, method: init?.method, headers: init?.headers, body: init?.body });
    const r = res.shift() ?? { status: 500 };
    if (r === 'network') throw new TypeError('Network request failed');
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => (r.body === undefined ? '' : JSON.stringify(r.body)) };
  };
  return { f, reqs };
}
const URL_ = 'https://proj.supabase.co';
const KEY = 'sb_publishable_test';
const session = (n: number) => ({ access_token: `at${n}`, refresh_token: `rt${n}`, expires_in: 3600, token_type: 'bearer', user: { id: 'u1', is_anonymous: true } });

describe('Supabase 익명 로그인 어댑터', () => {
  it('signIn: POST /auth/v1/signup 본문 {"data":{}} — 요청 스냅숏, 세션은 세션 저장소에', async () => {
    let clock = 1_000_000;
    const store = memKV();
    const { f, reqs } = fake([{ status: 200, body: session(1) }]);
    const a = createSupabaseAuth({ fetch: f, url: URL_, key: KEY, store, now: () => clock });
    expect(await a.token()).toEqual({ kind: 'none' });
    expect(await a.signIn()).toEqual({ ok: true });
    expect(reqs).toEqual([
      {
        url: 'https://proj.supabase.co/auth/v1/signup',
        method: 'POST',
        headers: { apikey: KEY, 'content-type': 'application/json', 'user-agent': SUPABASE_USER_AGENT },
        body: '{"data":{}}',
      },
    ]);
    expect(await a.token()).toEqual({ kind: 'ok', token: 'at1' });
    expect(JSON.parse(store.getString(SESSION_KEY)!)).toEqual({ accessToken: 'at1', refreshToken: 'rt1', expiresAt: clock + 3_600_000 });
    clock += 1;
    expect(Object.keys(JSON.parse(store.getString(SESSION_KEY)!)).sort()).toEqual(['accessToken', 'expiresAt', 'refreshToken']); // 사용자 정보는 두지 않는다
  });

  it('token: 만료 60초 전부터는 refresh_token으로 새로 받는다(동시에 여러 번 불러도 요청 한 번)', async () => {
    let clock = 0;
    const store = memKV();
    const { f, reqs } = fake([{ status: 200, body: session(1) }, { status: 200, body: session(2) }]);
    const a = createSupabaseAuth({ fetch: f, url: URL_, key: KEY, store, now: () => clock });
    await a.signIn();
    clock = 3_600_000 - 59_000;
    expect(await Promise.all([a.token(), a.token()])).toEqual([{ kind: 'ok', token: 'at2' }, { kind: 'ok', token: 'at2' }]);
    expect(reqs[1]).toEqual({
      url: 'https://proj.supabase.co/auth/v1/token?grant_type=refresh_token',
      method: 'POST',
      headers: { apikey: KEY, 'content-type': 'application/json', 'user-agent': SUPABASE_USER_AGENT },
      body: '{"refresh_token":"rt1"}',
    });
    expect(reqs).toHaveLength(2);
  });

  it('refresh 실패: "그 로그인이 끝났다"는 오류 코드일 때만 세션을 비우고, 연결 실패·키 오류 401·5xx·모르는 400은 남긴다(리뷰 M3)', async () => {
    const keep: Array<{ status: number; body?: unknown } | 'network'> = [
      'network',
      { status: 401, body: { message: 'Invalid API key' } },
      { status: 401, body: { error: { code: 'unauthorized' } } },
      { status: 503 },
      { status: 400, body: { error_code: 'validation_failed' } },
      { status: 429, body: { error_code: 'over_request_rate_limit' } },
      // 우리 서버 꼴 no_account는 Supabase 갱신의 '끝남'이 아니다 — 세션 정리는 C12 sub 대조 몫(C12d)
      { status: 401, body: { error: { code: 'no_account' } } },
      { status: 400, body: { error_code: 'no_account' } },
    ];
    for (const r of keep) {
      const store = memKV();
      let clock = 0;
      const a = createSupabaseAuth({ fetch: fake([{ status: 200, body: session(1) }, r]).f, url: URL_, key: KEY, store, now: () => clock });
      await a.signIn();
      clock = 3_600_000;
      expect(await a.refresh(), JSON.stringify(r)).toBe(false);
      expect(store.getString(SESSION_KEY), JSON.stringify(r)).toBeDefined();
    }
    const ended: unknown[] = [
      { code: 400, error_code: 'refresh_token_already_used', msg: 'x' },
      { error_code: 'refresh_token_not_found' },
      { error_code: 'session_not_found' },
      { error_code: 'user_not_found' },
      { error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found' },
    ];
    for (const b of ended) {
      const store = memKV();
      let clock = 0;
      const a = createSupabaseAuth({ fetch: fake([{ status: 200, body: session(1) }, { status: 400, body: b }]).f, url: URL_, key: KEY, store, now: () => clock });
      await a.signIn();
      clock = 3_600_000;
      expect(await a.refresh()).toBe(false);
      expect(store.getString(SESSION_KEY), JSON.stringify(b)).toBeUndefined();
      expect(await a.token()).toEqual({ kind: 'none' });
    }
    expect(refreshEnded('not json')).toBe(false);
    expect(refreshEnded('{"error":"invalid_grant","error_description":"something else"}')).toBe(false);
  });

  it('signIn은 남은 세션을 덮어쓰지 않는다: 살아 있으면 그대로, 만료면 갱신(503이면 signup 없이 실패·세션 유지)(리뷰 M2)', async () => {
    const store = memKV();
    let clock = 0;
    const { f, reqs } = fake([{ status: 200, body: session(1) }, { status: 503 }, { status: 200, body: session(2) }]);
    const a = createSupabaseAuth({ fetch: f, url: URL_, key: KEY, store, now: () => clock });
    await a.signIn();
    expect(await a.signIn()).toEqual({ ok: true }); // 살아 있는 세션 — 요청 없음
    expect(reqs).toHaveLength(1);
    clock = 3_600_000;
    expect(await a.signIn()).toEqual({ ok: false, failure: 'unavailable' });
    expect(reqs.map((r) => r.url.replace(URL_, ''))).toEqual(['/auth/v1/signup', '/auth/v1/token?grant_type=refresh_token']);
    expect(JSON.parse(store.getString(SESSION_KEY)!).refreshToken).toBe('rt1');
    expect(await a.signIn()).toEqual({ ok: true }); // 다음 번 갱신 성공 — 같은 사용자의 새 토큰
    expect(reqs.filter((r) => r.url.endsWith('/signup'))).toHaveLength(1);
    expect(JSON.parse(store.getString(SESSION_KEY)!).refreshToken).toBe('rt2');
  });

  it('끝난 로그인으로 갱신이 거절되면 signedOut — 그때도 같은 호출에서 새 사용자를 만들지 않는다. 새로 만드는 길은 startOver(명시)', async () => {
    const store = memKV();
    let clock = 0;
    const { f, reqs } = fake([{ status: 200, body: session(1) }, { status: 400, body: { error_code: 'refresh_token_not_found' } }, { status: 200, body: session(9) }, { status: 200, body: session(10) }]);
    const a = createSupabaseAuth({ fetch: f, url: URL_, key: KEY, store, now: () => clock });
    await a.signIn();
    clock = 3_600_000;
    expect(await a.signIn()).toEqual({ ok: false, failure: 'signedOut' });
    expect(reqs.filter((r) => r.url.endsWith('/signup'))).toHaveLength(1);
    // 명시적 새로 시작: 남은 세션이 있어도 버리고 새로
    store.set(SESSION_KEY, JSON.stringify({ accessToken: 'old', refreshToken: 'old', expiresAt: clock + 9_999_999 }));
    expect(await startOver({ store }, a)).toEqual({ ok: true });
    expect(JSON.parse(store.getString(SESSION_KEY)!).accessToken).toBe('at9');
  });

  it('token 상태 구분(C11 재리뷰 N1): 만료 + 갱신 연결 실패·503·키 오류 → unavailable(세션 유지), 끝난 로그인 → none', async () => {
    const cases: Array<[{ status: number; body?: unknown } | 'network', unknown]> = [
      ['network', { kind: 'unavailable', failure: 'offline' }],
      [{ status: 503 }, { kind: 'unavailable', failure: 'unavailable' }],
      [{ status: 401, body: { message: 'Invalid API key' } }, { kind: 'unavailable', failure: 'server' }],
      [{ status: 400, body: { error_code: 'refresh_token_not_found' } }, { kind: 'none' }],
    ];
    for (const [r, want] of cases) {
      const store = memKV();
      let clock = 0;
      const a = createSupabaseAuth({ fetch: fake([{ status: 200, body: session(1) }, r]).f, url: URL_, key: KEY, store, now: () => clock });
      await a.signIn();
      clock = 3_600_000;
      expect(await a.token(), JSON.stringify(r)).toEqual(want);
      expect(store.getString(SESSION_KEY) !== undefined, JSON.stringify(r)).toBe((want as { kind: string }).kind === 'unavailable');
    }
  });

  it('signIn 실패 갈래: 연결 실패 offline / 429 rateLimited / 5xx unavailable / 모양 틀림 server', async () => {
    const cases: Array<[{ status: number; body?: unknown } | 'network', string]> = [
      ['network', 'offline'],
      [{ status: 429 }, 'rateLimited'],
      [{ status: 503 }, 'unavailable'],
      [{ status: 200, body: { access_token: 'x' } }, 'server'],
      [{ status: 422, body: { msg: 'Anonymous sign-ins are disabled' } }, 'server'],
    ];
    for (const [r, want] of cases) {
      const a = createSupabaseAuth({ fetch: fake([r]).f, url: URL_, key: KEY, store: memKV(), now: () => 0 });
      expect(await a.signIn()).toEqual({ ok: false, failure: want });
    }
  });

  it('signOut: 서버에 로그아웃(scope=local)을 알리고 결과와 무관하게 세션을 비운다', async () => {
    const store = memKV();
    const { f, reqs } = fake([{ status: 200, body: session(1) }, 'network']);
    const a = createSupabaseAuth({ fetch: f, url: URL_, key: KEY, store, now: () => 0 });
    await a.signIn();
    await a.signOut();
    expect(reqs[1]).toEqual({
      url: 'https://proj.supabase.co/auth/v1/logout?scope=local',
      method: 'POST',
      headers: { apikey: KEY, authorization: 'Bearer at1', 'user-agent': SUPABASE_USER_AGENT },
      body: undefined,
    });
    expect(store.getString(SESSION_KEY)).toBeUndefined();
    expect(await a.token()).toEqual({ kind: 'none' });
  });

  it('깨진 세션 기록은 없는 것으로 본다', async () => {
    const store = memKV();
    store.set(SESSION_KEY, '{"accessToken":1}');
    const a = createSupabaseAuth({ fetch: fake([]).f, url: URL_, key: KEY, store, now: () => 0 });
    expect(await a.token()).toEqual({ kind: 'none' });
  });
});
