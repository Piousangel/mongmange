// Supabase Storage 드라이버(B6a, STORAGE_DRIVER=supabase). ObjectStore 계약을 local 드라이버와 같은 뜻으로 지킨다.
// REST API(`{SUPABASE_URL}/storage/v1`)를 fetch로 직접 부른다 — supabase-js를 들이지 않는다(B2와 같은 판단: 필요한 호출 몇 개뿐).
// 근거: Storage API 명세(supabase.github.io/storage/api.json, 2026-11-25), architecture 2-4 Storage 행·3-5-3·3-9, DECISIONS B3·B5·V25·B6a.
//
// 계약과 Supabase가 다른 곳(DECISIONS B6a):
//  - 서명 업로드 URL 만료는 Supabase가 **2시간 고정**(만료를 고를 수 없다) → ttlSec(5분)는 지킬 수 없다. 대신 x-upsert 없이 발급해
//    같은 키 두 번째 업로드는 409(1회), 버킷 상한(600KB·jpeg/mp4)이 서명 업로드에도 걸리고, commit이 크기·유형·내용을 다시 검사하며,
//    commit 뒤 staging 대기 행(2시간)이 늦은 업로드를 지운다.
//  - 옮기기는 copy(메타데이터 새로 지정) + 원본 지우기: 공개 버킷 파일의 Cache-Control을 local과 같은 PUBLIC_FILE_CACHE로 맞추려고
//    (앱이 서명 URL로 올릴 때 붙인 머리글을 믿지 않는다). 다시 불러도 같은 결과(원본이 없고 대상이 있으면 성공).
//
// 로그·오류에 URL·키·사용자 식별값을 싣지 않는다: 이 파일은 로그를 쓰지 않고, 던지는 StorageError의 메시지는 고정 문구 + 연산 이름뿐.
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import {
  ALL_BUCKETS,
  BUCKET_POLICY,
  BUCKETS,
  OBJECT_KEY_RE,
  PREFIX_RE,
  PUBLIC_FILE_CACHE,
  validObjectKey,
  type Bucket,
  type ObjectInfo,
  type ObjectStore,
  type SignedUpload,
} from './object-store';

/** 비공개 버킷 파일의 Cache-Control(서버만 읽는다 — 중간 캐시에 남지 않게) */
export const PRIVATE_FILE_CACHE = 'private, no-store';
/** 여러 개 지우기 한 번의 상한(Storage API: 1000) */
const DELETE_BATCH = 1000;
/** removePrefix가 '목록 → 지우기'를 되풀이하는 최대 횟수(지우는 사이 새 파일이 생기는 경합까지 — 넘으면 실패로 대기열 재시도) */
const REMOVE_ROUNDS = 5;

export type StorageErrorCode = 'not_found' | 'conflict' | 'too_large' | 'unsupported_type' | 'unauthorized' | 'bad_request' | 'unavailable' | 'timeout';

/** Storage 호출 실패. 메시지에 URL·키·버킷 경로를 넣지 않는다(로그로 새지 않게) — 연산 이름과 분류 코드만 */
export class StorageError extends Error {
  constructor(
    readonly code: StorageErrorCode,
    readonly op: string,
    readonly status?: number,
  ) {
    super(`Storage ${op} 실패(${code}${status ? ` ${status}` : ''})`);
    this.name = 'StorageError';
  }
  /** 다시 시도할 만한가(네트워크·시간 초과·5xx·429) */
  get retryable(): boolean {
    return this.code === 'unavailable' || this.code === 'timeout';
  }
}

export interface SupabaseStoreOptions {
  /** Supabase 프로젝트 주소(https://<ref>.supabase.co) */
  url: string;
  /** 서비스 롤 키(Secret Manager `SUPABASE_SERVICE_ROLE_KEY`) */
  serviceKey: string;
  /** 요청 하나의 제한 시간(응답 머리글까지 — 스트림 본문은 따로). 기본 10초 */
  timeoutMs?: number;
  /** 다시 시도 횟수(재시도 가능한 실패만). 기본 2 */
  retries?: number;
  /** 시험용 */
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

interface Req {
  method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  headers?: Record<string, string>;
  body?: Uint8Array | string;
  /** true면 본문 스트림을 위해 제한 시간을 머리글까지만 건다 */
  stream?: boolean;
  /** 이 상태는 오류로 보지 않고 응답을 돌려준다 */
  allow?: number[];
}

/** 키 경로 한 조각씩 encodeURIComponent(‘/’는 둔다). 키는 이미 정규식으로 검사한 값뿐 */
const encPath = (key: string) => key.split('/').map(encodeURIComponent).join('/');

export class SupabaseObjectStore implements ObjectStore {
  readonly configured = true;
  readonly publicOrigin: string;
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly fetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly o: SupabaseStoreOptions) {
    const u = new URL(o.url);
    this.publicOrigin = u.origin;
    this.base = `${u.origin}/storage/v1`;
    this.timeoutMs = o.timeoutMs ?? 10_000;
    this.retries = o.retries ?? 2;
    this.fetch = o.fetch ?? globalThis.fetch;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private check(bucket: Bucket, key: string, op: string): void {
    if (!ALL_BUCKETS.includes(bucket) || !validObjectKey(bucket, key)) throw new StorageError('bad_request', op);
  }

  /** 한 번 부르기 + 재시도(네트워크·시간 초과·429·5xx). 응답 본문은 부른 쪽이 읽는다 */
  private async call(op: string, r: Req): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.once(op, r);
      } catch (e) {
        if (!(e instanceof StorageError) || !e.retryable || attempt >= this.retries) throw e;
        await this.sleep(200 * 2 ** attempt);
      }
    }
  }

  private async once(op: string, r: Req): Promise<Response> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetch(`${this.base}${r.path}`, {
        method: r.method,
        headers: { apikey: this.o.serviceKey, authorization: `Bearer ${this.o.serviceKey}`, ...r.headers },
        body: r.body as RequestInit['body'],
        signal: ac.signal,
        redirect: 'error',
      });
      if (!r.stream) {
        // 본문까지 제한 시간 안에 — 응답을 버퍼로 바꿔 돌려준다(타이머는 finally에서 끈다)
        const buf = r.method === 'HEAD' ? null : await res.arrayBuffer();
        res = new Response(buf && buf.byteLength ? buf : null, { status: res.status, headers: res.headers });
      }
    } catch {
      throw new StorageError(ac.signal.aborted ? 'timeout' : 'unavailable', op);
    } finally {
      clearTimeout(timer);
    }
    if (res.ok || r.allow?.includes(res.status)) return res;
    const code = await classify(res);
    if (r.stream) await res.body?.cancel().catch(() => undefined);
    throw new StorageError(code, op, res.status);
  }

  async signUpload(bucket: Bucket, key: string, _o: { contentType: string; maxBytes: number; ttlSec: number }): Promise<SignedUpload> {
    this.check(bucket, key, 'signUpload');
    // x-upsert를 주지 않는다 → 같은 키에 두 번째 업로드는 409(1회). 만료는 Supabase 2시간 고정(머리 주석)
    const res = await this.call('signUpload', { method: 'POST', path: `/object/upload/sign/${bucket}/${encPath(key)}` });
    const b = (await res.json()) as { url?: unknown; token?: unknown };
    if (typeof b.url !== 'string' || !b.url.startsWith('/object/upload/sign/')) throw new StorageError('unavailable', 'signUpload', res.status);
    const token = typeof b.token === 'string' ? b.token : (new URL(b.url, 'http://x').searchParams.get('token') ?? '');
    if (!token) throw new StorageError('unavailable', 'signUpload', res.status);
    return { signedUrl: `${this.base}${b.url}`, token };
  }

  async put(bucket: Bucket, key: string, body: Uint8Array, contentType: string): Promise<void> {
    this.check(bucket, key, 'put');
    await this.call('put', {
      method: 'POST',
      path: `/object/${bucket}/${encPath(key)}`,
      headers: { 'content-type': contentType, 'cache-control': cacheFor(bucket), 'x-upsert': 'true' },
      body,
    });
  }

  async stat(bucket: Bucket, key: string): Promise<ObjectInfo | null> {
    this.check(bucket, key, 'stat');
    // HEAD 대신 첫 1바이트 Range GET: HEAD는 본문이 없어 옛 오류 꼴(400 + statusCode)에서 '없음'과 '키 틀림'을 가를 수 없다.
    // 크기 = Content-Range의 전체 길이(206), 빈 파일은 416(bytes */0), Range를 무시하면 200 + Content-Length
    let res: Response;
    try {
      res = await this.call('stat', { method: 'GET', path: `/object/authenticated/${bucket}/${encPath(key)}`, headers: { range: 'bytes=0-0' }, allow: [416] });
    } catch (e) {
      if (e instanceof StorageError && e.code === 'not_found') return null;
      throw e;
    }
    const total = /\/(\d+)$/.exec(res.headers.get('content-range') ?? '');
    const size = total ? Number(total[1]) : res.status === 416 ? 0 : Number(res.headers.get('content-length') ?? 0);
    return { size, contentType: res.status === 416 ? (await this.typeOf(bucket, key)) : mime(res) };
  }

  async read(bucket: Bucket, key: string): Promise<{ body: Uint8Array; contentType: string } | null> {
    this.check(bucket, key, 'read');
    try {
      const res = await this.call('read', { method: 'GET', path: `/object/authenticated/${bucket}/${encPath(key)}` });
      return { body: new Uint8Array(await res.arrayBuffer()), contentType: mime(res) };
    } catch (e) {
      if (e instanceof StorageError && e.code === 'not_found') return null;
      throw e;
    }
  }

  async openRead(bucket: Bucket, key: string): Promise<{ stream: Readable; size: number; contentType: string } | null> {
    this.check(bucket, key, 'openRead');
    try {
      const res = await this.call('openRead', { method: 'GET', path: `/object/authenticated/${bucket}/${encPath(key)}`, stream: true });
      if (!res.body) return { stream: Readable.from([]), size: 0, contentType: mime(res) };
      return { stream: Readable.fromWeb(res.body as unknown as WebReadableStream), size: Number(res.headers.get('content-length') ?? 0), contentType: mime(res) };
    } catch (e) {
      if (e instanceof StorageError && e.code === 'not_found') return null;
      throw e;
    }
  }

  async readHead(bucket: Bucket, key: string, n: number): Promise<Uint8Array> {
    this.check(bucket, key, 'readHead');
    if (n <= 0) return new Uint8Array();
    // 없으면 던진다(local과 같음). 빈 파일·n보다 짧은 파일은 있는 만큼(416 = 0바이트)
    const res = await this.call('readHead', { method: 'GET', path: `/object/authenticated/${bucket}/${encPath(key)}`, headers: { range: `bytes=0-${n - 1}` }, allow: [416] });
    if (res.status === 416) return new Uint8Array();
    return new Uint8Array(await res.arrayBuffer()).subarray(0, n);
  }

  async move(from: Bucket, to: Bucket, key: string): Promise<void> {
    this.check(from, key, 'move');
    this.check(to, key, 'move');
    // 원본의 유형을 읽고 → 대상 버킷의 Cache-Control로 복사 → 원본 지우기. 재시도·다시 부르기 안전(원본이 없고 대상이 있으면 이미 옮김)
    const src = await this.stat(from, key);
    if (!src) {
      if (await this.stat(to, key)) return;
      throw new StorageError('not_found', 'move');
    }
    await this.call('move', {
      method: 'POST',
      path: '/object/copy',
      headers: { 'content-type': 'application/json', 'x-upsert': 'true' },
      body: JSON.stringify({ bucketId: from, sourceKey: key, destinationBucket: to, destinationKey: key, copyMetadata: false, metadata: { mimetype: src.contentType, cacheControl: cacheFor(to) } }),
    });
    await this.deleteKeys(from, [key]);
  }

  async removePrefix(bucket: Bucket, prefix: string): Promise<void> {
    if (!PREFIX_RE.test(prefix)) throw new StorageError('bad_request', 'removePrefix');
    // 목록 → 지우기를 목록이 빌 때까지(지우는 사이 생긴 파일까지). 이미 없으면 목록 한 번으로 성공
    for (let round = 0; round < REMOVE_ROUNDS; round++) {
      const keys = await this.list(bucket, prefix);
      if (!keys.length) return;
      for (let i = 0; i < keys.length; i += DELETE_BATCH) await this.deleteKeys(bucket, keys.slice(i, i + DELETE_BATCH));
    }
    if ((await this.list(bucket, prefix)).length) throw new StorageError('unavailable', 'removePrefix');
  }

  async list(bucket: Bucket, prefix: string): Promise<string[]> {
    if (!ALL_BUCKETS.includes(bucket) || (prefix && !PREFIX_RE.test(prefix))) throw new StorageError('bad_request', 'list');
    // 접두 경계를 '/'로 — storeKey 접두가 다른 storeKey의 앞부분과 겹치지 않게(모양상 길이가 같아 겹칠 일은 없지만 뜻을 분명히)
    const want = prefix ? `${prefix}/` : '';
    const out: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10_000; page++) {
      const res = await this.call('list', {
        method: 'POST',
        path: `/object/list-v2/${bucket}`,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefix: want, with_delimiter: false, limit: DELETE_BATCH, sortBy: { column: 'name', order: 'asc' }, ...(cursor ? { cursor } : {}) }),
      });
      const b = (await res.json()) as { objects?: Array<{ name?: unknown }>; hasNext?: unknown; nextCursor?: unknown };
      for (const o of b.objects ?? []) {
        if (typeof o.name !== 'string') continue;
        // 이름이 전체 키(S3 꼴)든 접두 뒤 상대 이름이든 전체 키로
        out.push(o.name.startsWith(want) ? o.name : `${want}${o.name}`);
      }
      if (b.hasNext !== true || typeof b.nextCursor !== 'string' || b.nextCursor === cursor) break;
      cursor = b.nextCursor;
    }
    return [...new Set(out)].sort();
  }

  publicUrl(key: string): string {
    if (!OBJECT_KEY_RE.test(key)) throw new StorageError('bad_request', 'publicUrl');
    return `${this.base}/object/public/${BUCKETS.public}/${encPath(key)}`;
  }

  /**
   * 버킷 설정 대조(정본 BUCKET_POLICY): 없음·공개 여부·상한이 다르면 문제 목록(버킷 이름과 항목만 — 값·키 없음).
   * 기동 때 한 번 부르고 다르면 error 로그(부팅은 막지 않는다 — Storage 잠깐 장애로 API 전체가 안 뜨는 일을 피함)
   */
  async checkBuckets(): Promise<string[]> {
    const problems: string[] = [];
    for (const id of ALL_BUCKETS) {
      const res = await this.call('checkBuckets', { method: 'GET', path: `/bucket/${id}`, allow: [400, 404] });
      if (res.status === 400 || res.status === 404) {
        problems.push(`${id}: 없음`);
        continue;
      }
      const b = (await res.json()) as { public?: unknown; file_size_limit?: unknown; allowed_mime_types?: unknown };
      const want = BUCKET_POLICY[id];
      if (b.public !== want.public) problems.push(`${id}: public은 ${want.public}여야 함`);
      if ((b.file_size_limit ?? null) !== want.fileSizeLimit) problems.push(`${id}: file_size_limit은 ${want.fileSizeLimit ?? '없음'}이어야 함`);
      const types = Array.isArray(b.allowed_mime_types) && b.allowed_mime_types.length ? [...(b.allowed_mime_types as string[])].sort().join(',') : null;
      if (types !== (want.allowedMimeTypes ? [...want.allowedMimeTypes].sort().join(',') : null)) problems.push(`${id}: allowed_mime_types가 다름`);
    }
    return problems;
  }

  /** 빈 파일의 유형(416 응답에는 Content-Type이 없다) — 0바이트라 전체 GET */
  private async typeOf(bucket: Bucket, key: string): Promise<string> {
    return mime(await this.call('stat', { method: 'GET', path: `/object/authenticated/${bucket}/${encPath(key)}` }));
  }

  private async deleteKeys(bucket: Bucket, keys: string[]): Promise<void> {
    await this.call('remove', { method: 'DELETE', path: `/object/${bucket}`, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefixes: keys }) });
  }
}

/** 버킷별 Cache-Control: 공개 버킷은 local 공개 주소와 같은 값(B3 리뷰 M3 — 최대 1시간), 나머지는 저장 안 함 */
export function cacheFor(bucket: Bucket): string {
  return BUCKET_POLICY[bucket].public ? PUBLIC_FILE_CACHE : PRIVATE_FILE_CACHE;
}

function mime(res: Response): string {
  return (res.headers.get('content-type') ?? 'application/octet-stream').split(';')[0]!.trim();
}

/** 오류 응답 → 분류. Storage는 오래전부터 HTTP 400 + body.statusCode('404' 등)로도 답한다 — 둘 다 본다 */
async function classify(res: Response): Promise<StorageErrorCode> {
  let inner = res.status;
  let error = '';
  if (res.status === 400) {
    try {
      const b = (await res.clone().json()) as { statusCode?: unknown; error?: unknown };
      if (typeof b.statusCode === 'string' && /^\d{3}$/.test(b.statusCode)) inner = Number(b.statusCode);
      if (typeof b.error === 'string') error = b.error;
    } catch {
      /* 본문이 JSON이 아니면 상태만 */
    }
  }
  if (inner === 404 || /not_?found|NoSuchKey/i.test(error)) return 'not_found';
  if (inner === 409 || /Duplicate|already exists/i.test(error)) return 'conflict';
  if (inner === 413 || /EntityTooLarge|too large/i.test(error)) return 'too_large';
  if (inner === 415 || /mime/i.test(error)) return 'unsupported_type';
  if (inner === 401 || inner === 403) return 'unauthorized';
  if (inner === 429 || inner >= 500) return 'unavailable';
  return 'bad_request';
}
