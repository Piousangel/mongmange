// 맡겨 두기 로그인 포트 = Supabase Auth(GoTrue) REST 익명 로그인 어댑터(C11 — architecture 3-3, cloud/api.ts CloudAuth 모양).
// - supabase-js를 들이지 않는다: 쓰는 경로가 셋뿐(익명 signup·refresh_token·logout)이고, fetch만 쓰면 빌드 2 동결 뒤에도 OTA로 고칠 수 있다.
// - 로그인 요청 본문은 `{"data":{}}` 하나 — 기기 값·이름·이메일·태어난 해·달이 들어갈 칸이 없다(test/net-auth.test.ts 요청 스냅숏).
//   머리글은 apikey(공개 publishable 키)·content-type·고정 User-Agent뿐.
// - **연령 확인 통과 뒤에만** signIn을 부른다(cloud/tasks.ts가 지킨다). 이 어댑터는 연령을 모른다.
// - 세션(접근·갱신 토큰, 만료 시각)은 세이브와 다른 세션 전용 저장소에 둔다(3-3 ④, net/sessionStore.ts — MMKV `mong.session`).
//   사용자 정보(id 등)는 두지 않는다. OS 백업 제외는 네이티브 설정이라 빌드 2 묶음 몫(architecture 4-2).
// - 실패는 던지지 않는다.
// - [C11 리뷰 M2] signIn은 남아 있는 세션을 덮어쓰지 않는다: 세션이 있으면 새 사용자를 만들지 않고 갱신을 시도해 그 결과를 돌려준다
//   (갱신이 503·timeout이어도 몽망이가 걸린 원래 익명 사용자를 잃지 않게). 새 사용자는 세션이 없을 때만, 또는 명시적인 startOver()로만.
// - [C11 리뷰 M3] 갱신이 거절돼도 '그 로그인이 끝났다'가 확실한 오류 코드일 때만 세션을 지운다(TERMINAL_REFRESH_CODES).
//   401 'Invalid API key'처럼 공개 키 사고·게이트웨이 오류는 모든 사용자에게 한꺼번에 오므로 세션을 두고 나중에 다시 시도한다.
import type { KV } from '@mong/core';
import type { CloudAuth, Failure } from '../cloud/api';
import { request, type FetchLike, type HttpResult } from './http';

export const SESSION_KEY = 'mong.session.v1';
export const SUPABASE_USER_AGENT = 'Mongmangi';
/** 만료 이만큼 전부터 새로 받는다 */
export const REFRESH_LEEWAY_MS = 60_000;
const AUTH_TIMEOUT_MS = 15_000;

/**
 * 세션을 지워도 되는 갱신 거절 코드 = **Supabase Auth(GoTrue)가 '그 로그인이 끝났다'고 한 것만**: 본문 `error_code`(Supabase 'Auth error codes')와
 * 옛 GoTrue의 `error: invalid_grant` + 'Invalid Refresh Token' 설명. 그 밖의 거절(키 틀림·게이트웨이 401·5xx·429)은 세션을 둔다.
 * 우리 서버(Nest)의 B2b `no_account`는 여기서 다루지 않는다 — 그것은 'Supabase 로그인은 살아 있는데 우리 서버에 붙은 사용자가 없다'(백업 복원 폰·
 * 지운 계정)이고, 세션을 비울지는 C12 작업(cloud/tasks.ts)이 기록의 sub와 지금 sub를 대조해 정한다(C12d). 어댑터가 먼저 지우면 그 대조를 못 한다.
 */
export const TERMINAL_REFRESH_CODES: readonly string[] = ['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'session_expired', 'user_not_found', 'user_banned'];

/** 갱신 거절 본문 → 세션이 끝났다고 확실한가 */
export function refreshEnded(body: string): boolean {
  let o: { error_code?: unknown; error?: unknown; error_description?: unknown };
  try {
    o = JSON.parse(body) as typeof o;
  } catch {
    return false;
  }
  if (!o || typeof o !== 'object') return false;
  if (typeof o.error_code === 'string' && TERMINAL_REFRESH_CODES.includes(o.error_code)) return true;
  return o.error === 'invalid_grant' && typeof o.error_description === 'string' && /invalid refresh token/i.test(o.error_description);
}

interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface SupabaseAuthDeps {
  fetch: FetchLike;
  /** 프로젝트 주소(`EXPO_PUBLIC_SUPABASE_URL`) */
  url: string;
  /** 공개(publishable·anon) 키(`EXPO_PUBLIC_SUPABASE_KEY`) */
  key: string;
  /** 세션 전용 저장소(세이브 저장소와 따로) */
  store: KV;
  now: () => number;
}

function failureOf(r: HttpResult): Failure {
  if (r.kind === 'network') return 'offline';
  if (r.kind === 'timeout') return 'timeout';
  if (r.status === 429) return 'rateLimited';
  if (r.status >= 500) return 'unavailable';
  return 'server';
}

export function createSupabaseAuth(deps: SupabaseAuthDeps): CloudAuth {
  const base = deps.url.replace(/\/+$/, '');
  const headers = (extra: Record<string, string> = {}) => ({ apikey: deps.key, ...extra, 'user-agent': SUPABASE_USER_AGENT });
  let inflight: Promise<RefreshResult> | null = null;

  function read(): Session | null {
    try {
      const o = JSON.parse(deps.store.getString(SESSION_KEY) ?? 'null') as Partial<Session> | null;
      return o && typeof o.accessToken === 'string' && typeof o.refreshToken === 'string' && typeof o.expiresAt === 'number'
        ? { accessToken: o.accessToken, refreshToken: o.refreshToken, expiresAt: o.expiresAt }
        : null;
    } catch {
      return null;
    }
  }
  function clear() {
    try {
      deps.store.remove(SESSION_KEY);
    } catch {
      /* 다음 읽기에서 다시 */
    }
  }

  /** 응답 본문 → 세션(모양이 틀리면 null). 사용자 정보는 버린다 */
  function save(body: string): Session | null {
    let o: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
    try {
      o = JSON.parse(body) as typeof o;
    } catch {
      return null;
    }
    if (typeof o.access_token !== 'string' || !o.access_token || typeof o.refresh_token !== 'string' || !o.refresh_token) return null;
    if (typeof o.expires_in !== 'number' || !(o.expires_in > 0)) return null;
    const s: Session = { accessToken: o.access_token, refreshToken: o.refresh_token, expiresAt: deps.now() + o.expires_in * 1000 };
    try {
      deps.store.set(SESSION_KEY, JSON.stringify(s));
    } catch {
      return null;
    }
    return s;
  }

  type RefreshResult = { ok: true } | { ok: false; failure: Failure };
  async function doRefresh(): Promise<RefreshResult> {
    const s = read();
    if (!s) return { ok: false, failure: 'signedOut' };
    const r = await request(
      deps.fetch,
      `${base}/auth/v1/token?grant_type=refresh_token`,
      { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify({ refresh_token: s.refreshToken }) },
      AUTH_TIMEOUT_MS,
    );
    if (r.kind === 'ok') return save(r.body) !== null ? { ok: true } : { ok: false, failure: 'server' };
    if (r.kind === 'http' && refreshEnded(r.body)) {
      clear(); // 그 로그인이 끝났다 — '맡겨 두기 끊김'(3-3의 7)
      return { ok: false, failure: 'signedOut' };
    }
    return { ok: false, failure: failureOf(r) }; // 세션은 두고 나중에 다시
  }
  function refreshOnce(): Promise<RefreshResult> {
    inflight ??= doRefresh().finally(() => {
      inflight = null;
    });
    return inflight;
  }
  async function signUp(): Promise<{ ok: true } | { ok: false; failure: Failure }> {
    const r = await request(
      deps.fetch,
      `${base}/auth/v1/signup`,
      { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify({ data: {} }) },
      AUTH_TIMEOUT_MS,
    );
    if (r.kind !== 'ok') return { ok: false, failure: failureOf(r) };
    return save(r.body) ? { ok: true } : { ok: false, failure: 'server' };
  }

  const auth: CloudAuth = {
    async token() {
      const s = read();
      if (!s) return null;
      if (s.expiresAt - REFRESH_LEEWAY_MS > deps.now()) return s.accessToken;
      return (await refreshOnce()).ok ? (read()?.accessToken ?? null) : null;
    },
    async signIn() {
      const s = read();
      if (!s) return signUp();
      if (s.expiresAt - REFRESH_LEEWAY_MS > deps.now()) return { ok: true }; // 쓸 수 있는 세션이 있다 — 그대로
      // 세션이 있으면 새 사용자를 만들지 않는다 — 갱신 결과를 그대로(실패면 세션을 두고 나중에 다시. '끝난 로그인'이면 signedOut)
      return refreshOnce();
    },
    async signOut() {
      const s = read();
      clear();
      if (!s) return;
      await request(deps.fetch, `${base}/auth/v1/logout?scope=local`, { method: 'POST', headers: headers({ authorization: `Bearer ${s.accessToken}` }) }, AUTH_TIMEOUT_MS);
    },
    async refresh() {
      return (await refreshOnce()).ok;
    },
  };
  return auth;
}

/**
 * 명시적인 '새로 시작'(되찾기 실패 뒤 새 몽망이로 맡기기처럼 화면이 사용자에게 확인을 받은 경우만): 남은 세션을 버리고 새 익명 사용자를 만든다.
 * CloudAuth.signIn은 남은 세션을 덮어쓰지 않으므로(리뷰 M2) 이 길이 따로 있어야 한다. 지금 부르는 화면은 없다.
 */
export function startOver(deps: Pick<SupabaseAuthDeps, 'store'>, auth: CloudAuth): Promise<{ ok: true } | { ok: false; failure: Failure }> {
  try {
    deps.store.remove(SESSION_KEY);
  } catch {
    /* 그래도 아래 signIn이 세션 없음으로 본다 */
  }
  return auth.signIn();
}
