// 맡겨 두기 API 클라이언트(architecture.md v2.2 3-2 B2 행, 실제 계약 = apps/server/src/{account,saves} 컨트롤러 + @mong/contract).
// 모든 응답을 한 갈래 결과(ApiResult)로 접는다 — 화면·작업 코드는 HTTP 상태 숫자를 보지 않는다.
// 실패는 던지지 않는다(net/http.ts). 응답 본문은 계약 스키마로 읽고, 모양이 틀리면 'server'(서버를 믿지 않는다).
import {
  bootstrapResponseSchema,
  deleteMeResponseSchema,
  recoverResponseSchema,
  recoveryCodeResponseSchema,
  saveConflictDetailsSchema,
  saveMetaSchema,
  saveWithBodySchema,
  saveWriteResponseSchema,
  type AgeGate,
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
  /** 401: 이 로그인에 연결된 사용자가 없다(지워짐·auth_gc) 또는 토큰이 받아들여지지 않음 — 지우기 확인에서만 '지워짐'의 증거로 쓴다 */
  | { kind: 'signedOut' }
  /** 410 moved: 되찾기로 다른 기기로 옮겨 감 */
  | { kind: 'moved' }
  /** 413: 본문 상한 초과 → 조용히 보류 */
  | { kind: 'tooLarge' }
  /** 429 save_quota: 오늘 몫을 다 씀 → 다음 날 조용히 */
  | { kind: 'quota' }
  | { kind: 'failed'; failure: Failure };

/** 로그인 포트. Supabase 익명 로그인은 C11(net 모듈)이 이 모양으로 넘긴다. 세션 저장은 백업 제외 MMKV(3-3 ④) */
export interface CloudAuth {
  /** 지금 세션의 접근 토큰(없으면 null) */
  token(): Promise<string | null>;
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
    case 401:
      return { kind: 'signedOut' };
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
    case 410:
      return { kind: 'moved' };
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
}

export function createCloudApi(deps: CloudApiDeps): CloudApi {
  const timeout = deps.timeoutMs ?? CLOUD_TIMEOUT_MS;
  async function call(method: string, path: string, opts: { body?: unknown; headers?: Record<string, string> } = {}): Promise<ApiResult<string>> {
    if (!deps.base) return { kind: 'failed', failure: 'unavailable' };
    const token = await deps.auth.token().catch(() => null);
    if (!token) return { kind: 'failed', failure: 'unavailable' };
    const headers: Record<string, string> = { accept: 'application/json', authorization: `Bearer ${token}`, ...opts.headers };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const r = await request(deps.fetch, `${deps.base}/api/v1/${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }, timeout);
    return classify(r);
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
  };
}
