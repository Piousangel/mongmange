// C13 로그인 포트(C11·C11b) 무작위 시험 + 가짜 서버의 B2b 계약 일치.
// 가짜 GoTrue(익명 signup·refresh 회전·logout)에 끊김·5xx·429·키 오류 401·'그 로그인이 끝났다' 코드·시계 흐름을 섞어 수백 번 돌린다.
// 불변식: (a) 세션이 있으면 signup 0(남은 익명 사용자를 덮지 않음 — 리뷰 M2) (b) 세션은 signOut·'끝남' 코드(TERMINAL_REFRESH_CODES)일 때만 지워진다(M3)
//   (c) token()이 'none'이면 정말 세션이 없다 / 세션이 남았으면 'none'이 아니다(N1) (d) 요청은 고정 머리글·빈 signup 본문(⑤ 식별자 0).
import { AUTH_ERROR } from '@mong/contract';
import { describe, expect, it } from 'vitest';
import { classify, createCloudApi } from '../src/cloud/api';
import { createFakeServer } from '../src/cloud/fakeServer';
import { passGate } from '../src/cloud/ageGate';
import type { FetchLike } from '../src/net/http';
import { createSupabaseAuth, refreshEnded, SESSION_KEY, SUPABASE_USER_AGENT } from '../src/net/supabaseAuth';
import { memKV, prng, sha } from './support/c13World';

const RUNS = Number(process.env.C13_AUTH_RUNS ?? 300);
const LEN = 40;
const BASE = 'https://sb.test';

type Reply = { status: number; body: string } | 'network';

function fakeGoTrue() {
  let n = 0;
  const refresh = new Map<string, { user: string; used: boolean }>();
  const state = { offline: false, next: null as Reply | null, signups: 0 };
  const log: Array<{ url: string; headers: Record<string, string>; body?: string; status: number | 'network'; resBody?: string }> = [];
  const session = (user: string) => {
    const rt = `rt${++n}`;
    refresh.set(rt, { user, used: false });
    return JSON.stringify({ access_token: `at${n}`, refresh_token: rt, expires_in: 3600, token_type: 'bearer', user: { id: user, email: '' } });
  };
  const fetch: FetchLike = async (url, init = {}) => {
    const entry: (typeof log)[number] = { url, headers: init.headers ?? {}, body: init.body, status: 'network' };
    log.push(entry);
    if (state.offline) throw new TypeError('Network request failed');
    let r: Reply;
    if (state.next) {
      r = state.next;
      state.next = null;
    } else if (url === `${BASE}/auth/v1/signup`) {
      state.signups++;
      r = { status: 200, body: session(`u${n + 1}`) };
    } else if (url.startsWith(`${BASE}/auth/v1/token?grant_type=refresh_token`)) {
      const rt = (JSON.parse(init.body ?? '{}') as { refresh_token?: string }).refresh_token ?? '';
      const e = refresh.get(rt);
      if (!e) r = { status: 400, body: JSON.stringify({ code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }) };
      else if (e.used) r = { status: 400, body: JSON.stringify({ code: 400, error_code: 'refresh_token_already_used', msg: 'used' }) };
      else {
        e.used = true;
        r = { status: 200, body: session(e.user) };
      }
    } else r = { status: 204, body: '' };
    if (r === 'network') throw new TypeError('Network request failed');
    entry.status = r.status;
    entry.resBody = r.body;
    const rr = r;
    return { ok: rr.status >= 200 && rr.status < 300, status: rr.status, text: async () => rr.body };
  };
  /** 서버 쪽에서 그 로그인의 갱신 토큰을 모두 끝낸다(Auth 사용자 삭제·세션 만료) */
  const revokeAll = () => refresh.clear();
  return { fetch, state, log, revokeAll };
}

const FAILS: Reply[] = [
  'network',
  { status: 503, body: '{"message":"upstream"}' },
  { status: 500, body: '' },
  { status: 429, body: '{"error_code":"over_request_rate_limit"}' },
  { status: 401, body: '{"message":"Invalid API key"}' }, // 공개 키 사고 — 모두에게 한꺼번에, 세션을 지우면 안 됨
  { status: 400, body: '{"error_code":"session_not_found"}' }, // '끝남'
  { status: 400, body: '{"error":"invalid_grant","error_description":"Invalid Refresh Token: Refresh Token Not Found"}' }, // 옛 GoTrue '끝남'
];

async function runAuth(seed: number): Promise<string[]> {
  const r = prng(seed);
  const g = fakeGoTrue();
  const store = memKV();
  let t = Date.UTC(2026, 10, 25);
  const auth = createSupabaseAuth({ fetch: g.fetch, url: BASE, key: 'sb_publishable_test', store, now: () => t });
  const bad: string[] = [];
  for (let i = 0; i < LEN; i++) {
    const x = r();
    if (x < 0.15) g.state.offline = r() < 0.4;
    else if (x < 0.27) g.state.next = FAILS[Math.floor(r() * FAILS.length)]!;
    else if (x < 0.37) t += [60_000, 3_000_000, 3_600_000, 7_200_000, 86_400_000][Math.floor(r() * 5)]!;
    else if (x < 0.4) g.revokeAll();
    else {
      const op = ['token', 'token', 'signIn', 'signIn', 'refresh', 'signOut'][Math.floor(r() * 6)]!;
      const had = store.getString(SESSION_KEY) !== undefined;
      const from = g.log.length;
      const signupsBefore = g.state.signups;
      const out =
        op === 'token' ? await auth.token() : op === 'signIn' ? await auth.signIn() : op === 'refresh' ? await auth.refresh() : await auth.signOut();
      const has = store.getString(SESSION_KEY) !== undefined;
      const calls = g.log.slice(from);
      // (a) 세션이 있었는데 signup
      if (had && calls.some((c) => c.url.endsWith('/auth/v1/signup'))) bad.push(`(a) 시드 ${seed} 사건 ${i}: 세션이 있는데 ${op}가 새 익명 사용자를 만듦`);
      if (g.state.signups - signupsBefore > 1) bad.push(`(a) 시드 ${seed}: 한 번에 signup ${g.state.signups - signupsBefore}회`);
      // (b) 세션이 지워진 까닭
      if (had && !has && op !== 'signOut') {
        const ended = calls.some((c) => c.url.includes('grant_type=refresh_token') && typeof c.status === 'number' && c.status >= 400 && refreshEnded(c.resBody ?? ''));
        if (!ended) bad.push(`(b) 시드 ${seed} 사건 ${i}: '끝남' 코드 없이 ${op}가 세션을 지움 (응답 ${calls.map((c) => c.status).join(',')})`);
      }
      // (c) token() 'none' ⇔ 세션 없음
      if (op === 'token') {
        const k = (out as { kind: string }).kind;
        if (k === 'none' && has) bad.push(`(c) 시드 ${seed} 사건 ${i}: 세션이 남았는데 token()=none`);
        if (k !== 'none' && !has) bad.push(`(c) 시드 ${seed} 사건 ${i}: 세션이 없는데 token()=${k}`);
      }
      // (d) 식별자 0
      for (const c of calls) {
        const hs = Object.keys(c.headers);
        if (hs.some((h) => !['apikey', 'content-type', 'user-agent', 'authorization'].includes(h)) || c.headers['user-agent'] !== SUPABASE_USER_AGENT) bad.push(`(d) 시드 ${seed}: 머리글 ${JSON.stringify(c.headers)}`);
        if (c.url.endsWith('/auth/v1/signup') && c.body !== '{"data":{}}') bad.push(`(d) 시드 ${seed}: signup 본문 ${c.body}`);
        if (c.url.includes('grant_type=refresh_token') && Object.keys(JSON.parse(c.body ?? '{}')).join() !== 'refresh_token') bad.push(`(d) 시드 ${seed}: 갱신 본문 ${c.body}`);
      }
    }
    if (bad.length) break;
  }
  return bad;
}

describe('C13 로그인 포트 무작위(C11·C11b)', () => {
  it(`시드 1~${RUNS}: 세션 유실·덮어쓰기 0, none ⇔ 세션 없음, 식별자 0`, async () => {
    const all: string[] = [];
    for (let s = 1; s <= RUNS && all.length < 3; s++) all.push(...(await runAuth(s)));
    expect(all).toEqual([]);
  });
});

describe('가짜 서버 ↔ B2b 계약(AUTH_ERROR) 일치', () => {
  it('만료 토큰 401 unauthorized · 지운 계정 401 no_account · 지울 것 없음 410 no_account · 옮겨 감 410 moved — 앱 classify가 같은 갈래로 읽는다', async () => {
    const srv = createFakeServer(sha, 3);
    const seen: Array<{ route: string; status: number; code: string | null }> = [];
    const spy: FetchLike = async (url, init) => {
      const r = await srv.fetch(url, init);
      const text = await r.text();
      let code: string | null = null;
      try {
        code = (JSON.parse(text) as { error?: { code?: string } }).error?.code ?? null;
      } catch {
        /* 본문 없음 */
      }
      seen.push({ route: `${init?.method} ${url.replace(/^.*\/api\/v1\//, '')}`, status: r.status, code });
      return { ok: r.ok, status: r.status, text: async () => text };
    };
    const a = srv.authFor('A');
    const b = srv.authFor('B');
    const apiA = createCloudApi({ fetch: spy, base: 'https://api.test', auth: { ...a, refresh: async () => false } });
    const apiB = createCloudApi({ fetch: spy, base: 'https://api.test', auth: b });
    await a.signIn();
    await b.signIn();
    expect((await apiA.bootstrap(passGate())).kind).toBe('ok');
    await apiA.putSave('{"v":1}', new Date().toISOString(), { ifNoneMatch: true });
    const code = await apiA.issueCode();
    srv.expireSession('A');
    expect(await apiA.getMeta()).toEqual({ kind: 'signedOut' });
    expect(seen.at(-1)).toMatchObject({ status: AUTH_ERROR.unauthorized.status, code: AUTH_ERROR.unauthorized.code });
    // B가 되찾음 → A의 옛 로그인은 410 moved
    expect((await apiB.recover(code.kind === 'ok' ? code.value : '', passGate())).kind).toBe('ok');
    const a2 = srv.authFor('A');
    await a2.refresh();
    const apiA2 = createCloudApi({ fetch: spy, base: 'https://api.test', auth: a2 });
    expect(await apiA2.getMeta()).toEqual({ kind: 'moved' });
    expect(seen.at(-1)).toMatchObject({ status: AUTH_ERROR.moved.status, code: AUTH_ERROR.moved.code });
    // B가 지움 → 다시 지우기 410 no_account, 남은 로그인의 다른 경로 401 no_account
    expect((await apiB.deleteMe()).kind).toBe('ok');
    expect(await apiB.deleteMe()).toEqual({ kind: 'alreadyGone' });
    expect(seen.at(-1)).toMatchObject({ status: AUTH_ERROR.alreadyGone.status, code: AUTH_ERROR.alreadyGone.code });
    expect(await apiB.getMeta()).toEqual({ kind: 'noAccount' });
    expect(seen.at(-1)).toMatchObject({ status: AUTH_ERROR.noAccount.status, code: AUTH_ERROR.noAccount.code });
    expect(await apiB.bootstrap(passGate())).toEqual({ kind: 'noAccount' });
    // 가짜 서버가 낸 인증 오류는 모두 계약 표 안의 (상태, 코드) 쌍
    const pairs = new Set(Object.values(AUTH_ERROR).map((e) => `${e.status} ${e.code}`));
    for (const s of seen.filter((x) => x.status === 401 || x.status === 410)) expect(pairs.has(`${s.status} ${s.code}`), JSON.stringify(s)).toBe(true);
    expect(classify({ kind: 'http', status: 410, body: '{"error":{"code":"something_new"}}' })).toEqual({ kind: 'failed', failure: 'server' });
  });
});
