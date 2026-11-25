// 맡겨 두기 API 클라이언트(architecture.md v2.2 3-2 B2 행, 실제 계약 = apps/server/src/{account,saves} 컨트롤러 + @mong/contract).
// 모든 응답을 한 갈래 결과(ApiResult)로 접는다 — 화면·작업 코드는 HTTP 상태 숫자를 보지 않는다.
// 실패는 던지지 않는다(net/http.ts). 응답 본문은 계약 스키마로 읽고, 모양이 틀리면 'server'(서버를 믿지 않는다).
import {
  AUTH_ERROR,
  bootstrapResponseSchema,
  deleteMeResponseSchema,
  myDataSchema,
  recoverResponseSchema,
  recoveryCodeResponseSchema,
  saveConflictDetailsSchema,
  saveMetaSchema,
  saveWithBodySchema,
  saveWriteResponseSchema,
  type AgeGate,
  type MyData,
  type RecoverResponse,
  type SaveMeta,
  type SaveWithBody,
  type SaveWriteResponse,
} from '@mong/contract';
import { request, type FetchLike, type HttpResult } from '../net/http';

/** 서버 쪽이 느릴 때를 위해 세이브는 핑(5초)보다 길게 기다린다. 넘으면 'timeout' — 서버가 받았을 수도 있다(반쯤 성공, 3-4) */
export const CLOUD_TIMEOUT_MS = 15_000;

/** 화면이 고를 실패 갈래(문구가 갈래마다 하나) */
/** signedOut = 401(연결이 끊김 — 토큰 만료일 수도 있어 기록은 지우지 않는다) */
export type Failure = 'offline' | 'timeout' | 'server' | 'rateLimited' | 'unavailable' | 'device' | 'signedOut';

export type ApiResult<T> =
  | { kind: 'ok'; value: T }
  /** 409 save_conflict: 서버 본 메타(null = 서버가 사본을 잃음 → If-None-Match: *로 다시) */
  | { kind: 'conflict'; server: SaveMeta | null }
  /** 404(글귀 틀림·맡긴 본 없음·이력 없음 — 경로마다 뜻이 하나) */
  | { kind: 'notFound' }
  /** 409 has_creature(되찾기: 이 기기 로그인에 이미 몽망이가 있음) */
  | { kind: 'hasCreature' }
  /** 401 `unauthorized`: 토큰 문제(서명·만료 등). call이 토큰을 새로 받아 한 번 더 보낸 뒤에도 그러면 이 갈래 */
  | { kind: 'signedOut' }
  /** 401 `no_account`(B2b): 서명이 맞는 토큰인데 서버에 그 로그인(sub)에 붙은 사용자가 없다 — 지움·Auth 삭제 대기·**맡긴 적 없는 새 로그인**(백업 복원 폰) */
  | { kind: 'noAccount' }
  /** 410 `no_account`(B2b, DELETE /me 전용): 지울 것이 없다. 지움 확정은 기록의 sub와 지금 sub가 같을 때만(B2b 리뷰 H1) */
  | { kind: 'alreadyGone' }
  /** 410 moved: 되찾기로 다른 기기로 옮겨 감 */
  | { kind: 'moved' }
  /** 413: 본문 상한 초과 → 조용히 보류 */
  | { kind: 'tooLarge' }
  /** 429 save_quota: 오늘 몫을 다 씀 → 다음 날 조용히 */
  | { kind: 'quota' }
  | { kind: 'failed'; failure: Failure };

/** 로그인 포트. Supabase 익명 로그인은 C11(net 모듈)이 이 모양으로 넘긴다. 세션 저장은 백업 제외 MMKV(3-3 ④) */
/**
 * 지금 접근 토큰의 상태(C11 재리뷰 N1). **'세션 없음'과 '세션은 있는데 지금 토큰을 못 받음'을 가른다** —
 * 오프라인에서 접근 토큰이 만료돼 갱신이 실패한 것을 '로그인 없음(백업 복원 폰)'으로 읽어 세션·기록을 지우지 않게.
 *  - ok: 쓸 수 있는 접근 토큰 / none: 이 기기에 세션이 없다(또는 Auth가 '그 로그인이 끝났다'고 해 비웠다)
 *  - unavailable: 세션은 있는데 지금 토큰을 못 받음(연결 실패·시간 초과·서버 오류·한도) — 작업을 미루고 아무것도 지우지 않는다
 */
export type TokenState = { kind: 'ok'; token: string } | { kind: 'none' } | { kind: 'unavailable'; failure: Failure };

/** token()이 던져도 '못 받음'으로(세션 없음으로 읽지 않는다) */
export async function readToken(auth: CloudAuth): Promise<TokenState> {
  try {
    return await auth.token();
  } catch {
    return { kind: 'unavailable', failure: 'offline' };
  }
}

export interface CloudAuth {
  /** 지금 세션의 접근 토큰 상태(TokenState) */
  token(): Promise<TokenState>;
  /** 익명 로그인. **연령 확인 통과 뒤에만** 부른다 */
  signIn(): Promise<{ ok: true } | { ok: false; failure: Failure }>;
  /** 세션 비우기(410·지우기 뒤). 실패해도 던지지 않는다 */
  signOut(): Promise<void>;
  /** 접근 토큰을 새로 받는다(지우기 결과 확인 전 — 리뷰 R4). 못 받으면 false */
  refresh(): Promise<boolean>;
}

export interface CloudApiDeps {
  fetch: FetchLike;
  /** API 주소(`EXPO_PUBLIC_API_BASE`). 비면 모든 호출이 unavailable */
  base: string;
  auth: CloudAuth;
  timeoutMs?: number;
}

type Precondition = { ifMatch: number } | { ifNoneMatch: true };

function errorCode(body: string): string | null {
  try {
    const o = JSON.parse(body) as { error?: { code?: unknown } };
    return typeof o.error?.code === 'string' ? o.error.code : null;
  } catch {
    return null;
  }
}

/** HTTP 결과 → 공통 갈래. 경로마다 다른 뜻(404)은 호출하는 쪽이 정한다 */
export function classify(r: HttpResult): ApiResult<string> {
  if (r.kind === 'ok') return { kind: 'ok', value: r.body };
  if (r.kind === 'timeout') return { kind: 'failed', failure: 'timeout' };
  if (r.kind === 'network') return { kind: 'failed', failure: 'offline' };
  const code = errorCode(r.body);
  switch (r.status) {
    case AUTH_ERROR.unauthorized.status:
      return code === AUTH_ERROR.noAccount.code ? { kind: 'noAccount' } : { kind: 'signedOut' };
    case 404:
      return { kind: 'notFound' };
    case 409: {
      if (code === 'has_creature') return { kind: 'hasCreature' };
      if (code !== 'save_conflict') return { kind: 'failed', failure: 'server' };
      try {
        const o = JSON.parse(r.body) as { error?: { details?: unknown } };
        const d = saveConflictDetailsSchema.safeParse(o.error?.details);
        return d.success ? { kind: 'conflict', server: d.data.server } : { kind: 'failed', failure: 'server' };
      } catch {
        return { kind: 'failed', failure: 'server' };
      }
    }
    case AUTH_ERROR.moved.status:
      // 410은 error.code로 가른다(B2b): moved = 다른 기기로 옮겨 감, no_account = DELETE /me에 지울 것 없음. 모르는 코드는 서버 문제로
      if (code === AUTH_ERROR.moved.code) return { kind: 'moved' };
      if (code === AUTH_ERROR.alreadyGone.code) return { kind: 'alreadyGone' };
      return { kind: 'failed', failure: 'server' };
    case 413:
      return { kind: 'tooLarge' };
    case 429:
      return code === 'save_quota' ? { kind: 'quota' } : { kind: 'failed', failure: 'rateLimited' };
    case 503:
      return { kind: 'failed', failure: 'unavailable' };
    default:
      return { kind: 'failed', failure: 'server' };
  }
}

/** 성공 본문을 스키마로 읽는다. 틀리면 server */
function read<T>(r: ApiResult<string>, schema: { safeParse(x: unknown): { success: true; data: T } | { success: false } }): ApiResult<T> {
  if (r.kind !== 'ok') return r;
  try {
    const p = schema.safeParse(r.value === '' ? {} : JSON.parse(r.value));
    return p.success ? { kind: 'ok', value: p.data } : { kind: 'failed', failure: 'server' };
  } catch {
    return { kind: 'failed', failure: 'server' };
  }
}

export interface CloudApi {
  bootstrap(ageGate: AgeGate): Promise<ApiResult<{ code: string }>>;
  issueCode(): Promise<ApiResult<string>>;
  recover(code: string, ageGate: AgeGate): Promise<ApiResult<RecoverResponse>>;
  getSave(): Promise<ApiResult<SaveWithBody>>;
  getMeta(): Promise<ApiResult<SaveMeta>>;
  putSave(body: string, clientSavedAt: string, pre: Precondition, keepMine?: boolean): Promise<ApiResult<SaveWriteResponse>>;
  addConflict(body: string, clientSavedAt: string): Promise<ApiResult<{ id: string }>>;
  deleteMe(): Promise<ApiResult<{ receipt: string }>>;
  /** GET /me/data — '맡긴 것 보기'(C12f). 메타만(계약이 strict라 본문·이름 칸이 실려 오면 'server') */
  myData(): Promise<ApiResult<MyData>>;
}

export function createCloudApi(deps: CloudApiDeps): CloudApi {
  const timeout = deps.timeoutMs ?? CLOUD_TIMEOUT_MS;
  async function once(method: string, path: string, opts: { body?: unknown; headers?: Record<string, string> }): Promise<ApiResult<string>> {
    const t = await readToken(deps.auth);
    if (t.kind === 'none') return { kind: 'failed', failure: 'unavailable' };
    if (t.kind === 'unavailable') return { kind: 'failed', failure: t.failure };
    const token = t.token;
    const headers: Record<string, string> = { accept: 'application/json', authorization: `Bearer ${token}`, ...opts.headers };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const r = await request(deps.fetch, `${deps.base}/api/v1/${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }, timeout);
    return classify(r);
  }
  /** 401 `unauthorized`(토큰 문제)면 토큰을 새로 받아 한 번만 더 보낸다(B2b ③). `no_account`는 새 토큰으로도 같으므로 다시 보내지 않는다 */
  async function call(method: string, path: string, opts: { body?: unknown; headers?: Record<string, string> } = {}): Promise<ApiResult<string>> {
    if (!deps.base) return { kind: 'failed', failure: 'unavailable' };
    const r = await once(method, path, opts);
    if (r.kind !== 'signedOut') return r;
    if (!(await deps.auth.refresh().catch(() => false))) return r;
    return once(method, path, opts);
  }
  return {
    async bootstrap(ageGate) {
      const r = read(await call('POST', 'me/bootstrap', { body: { ageGate } }), bootstrapResponseSchema);
      return r.kind === 'ok' ? { kind: 'ok', value: { code: r.value.creature.code } } : r;
    },
    async issueCode() {
      const r = read(await call('POST', 'recovery-code', { body: {} }), recoveryCodeResponseSchema);
      return r.kind === 'ok' ? { kind: 'ok', value: r.value.code } : r;
    },
    async recover(code, ageGate) {
      return read(await call('POST', 'recover', { body: { code, ageGate } }), recoverResponseSchema);
    },
    async getSave() {
      return read(await call('GET', 'saves/main'), saveWithBodySchema);
    },
    async getMeta() {
      return read(await call('GET', 'saves/main/meta'), saveMetaSchema);
    },
    async putSave(body, clientSavedAt, pre, keepMine) {
      const headers: Record<string, string> = 'ifMatch' in pre ? { 'if-match': String(pre.ifMatch) } : { 'if-none-match': '*' };
      return read(await call('PUT', 'saves/main', { headers, body: keepMine ? { body, clientSavedAt, resolve: 'keep_mine' } : { body, clientSavedAt } }), saveWriteResponseSchema);
    },
    async addConflict(body, clientSavedAt) {
      const r = await call('POST', 'saves/main/conflicts', { body: { body, clientSavedAt } });
      if (r.kind !== 'ok') return r;
      try {
        const o = JSON.parse(r.value) as { id?: unknown };
        return typeof o.id === 'string' ? { kind: 'ok', value: { id: o.id } } : { kind: 'failed', failure: 'server' };
      } catch {
        return { kind: 'failed', failure: 'server' };
      }
    },
    async deleteMe() {
      return read(await call('DELETE', 'me'), deleteMeResponseSchema);
    },
    async myData() {
      return read(await call('GET', 'me/data'), myDataSchema);
    },
  };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * base64url → UTF-8 문자열(순수 JS — Hermes의 atob 유무에 기대지 않는다, 재리뷰 5). 표준 base64('+','/','=')도 받는다.
 * 틀린 글자가 있으면 null.
 */
export function decodeBase64Url(input: string): string | null {
  const str = input.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const bytes: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of str) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 0xff);
    }
  }
  // UTF-8 → 문자열
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i]!;
    let cp: number;
    let n: number;
    if (b < 0x80) [cp, n] = [b, 1];
    else if (b >= 0xc0 && b < 0xe0) [cp, n] = [b & 0x1f, 2];
    else if (b >= 0xe0 && b < 0xf0) [cp, n] = [b & 0x0f, 3];
    else if (b >= 0xf0 && b < 0xf8) [cp, n] = [b & 0x07, 4];
    else return null;
    for (let k = 1; k < n; k++) {
      const c = bytes[i + k];
      if (c === undefined || (c & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (c & 0x3f);
    }
    out += String.fromCodePoint(cp);
    i += n;
  }
  return out;
}

/**
 * 접근 토큰(JWT)의 sub. 서명은 보지 않는다 — 서버가 보증한 토큰을 우리 기기 기록과 견주는 데만 쓴다(B2b 리뷰 H1:
 * 맡겨 두기를 켠 로그인과 지금 로그인이 같은지). 읽을 수 없으면 null(그러면 '지워짐'을 확정하지 않는다).
 */
export function subOf(token: string | null): string | null {
  if (!token) return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = decodeBase64Url(part);
    if (json === null) return null;
    const o = JSON.parse(json) as { sub?: unknown };
    return typeof o.sub === 'string' && o.sub.length > 0 ? o.sub : null;
  } catch {
    return null;
  }
}
