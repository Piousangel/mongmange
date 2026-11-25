// 시험용 Supabase Storage 자리(B6a). 실제 Supabase에 붙지 않는다 — 로컬 HTTP 서버 하나가 Storage REST API(`/storage/v1`)의
// 쓰는 부분만 메모리로 흉내 낸다. 근거: Storage API 명세(supabase.github.io/storage/api.json, 2026-11-25 내려받음)·JS 문서.
//  - 버킷: public 여부·file_size_limit·allowed_mime_types(서명 업로드에도 같은 상한)
//  - 서명 업로드 URL(만료 2시간 고정 — 만료를 고를 수 없다), x-upsert 없으면 같은 키 두 번째는 409
//  - copy(metadata·copyMetadata·destinationBucket)·move·여러 개 지우기(한 번 1000개)·list-v2(cursor 쪽 나눔)
//  - Range 읽기, 공개 버킷만 /object/public, 서비스 키 헤더 확인
//  - 장애 흉내: 다음 n번 5xx·429·멈춤(시간 초과)·연결 끊기, '옛 오류 꼴'(HTTP 400 + body.statusCode '404')
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export const STORAGE_SERVICE_KEY = 'sb_secret_storage-fake-key-000000000001';
const SIGNED_UPLOAD_TTL_MS = 2 * 3600_000;

export interface FakeBucket {
  public: boolean;
  file_size_limit: number | null;
  allowed_mime_types: string[] | null;
}
interface Obj {
  body: Buffer;
  contentType: string;
  cacheControl: string;
}
/** ghost = 200을 주고 아무것도 하지 않음(조용한 실패 — 경로 인코딩 불일치 같은 것) */
export type Fault = number | 'hang' | 'reset' | 'ghost';

export interface FakeStorage {
  url: string;
  buckets: Map<string, FakeBucket>;
  objects: Map<string, Obj>;
  /** 요청 기록(method + 경로, 질의 없이) */
  requests: string[];
  /** 다음 요청들에 차례로 건다(맞는 요청에만 — match가 없으면 모두) */
  faults: Array<{ fault: Fault; match?: RegExp }>;
  /** true면 오류를 HTTP 400 + body.statusCode(옛 Storage 꼴)로 */
  legacyErrors: boolean;
  /** list-v2 한 쪽의 최대 개수(쪽 나눔 시험) */
  listPageMax: number;
  now: () => number;
  setNow(ms: number): void;
  keys(bucket: string): string[];
  close(): Promise<void>;
}

/** fallback: `/storage/v1` 밖의 요청(Auth JWKS·Admin)을 넘길 주소 — 앱 시험에서 SUPABASE_URL 하나로 Auth 가짜와 함께 쓴다 */
export async function startFakeStorage(port: number, buckets: Record<string, FakeBucket>, fallback?: string, serviceKey = STORAGE_SERVICE_KEY): Promise<FakeStorage> {
  let now = Date.now();
  const tokens = new Map<string, { bucket: string; key: string; exp: number; upsert: boolean }>();
  const hung = new Set<ServerResponse>();
  const state: Omit<FakeStorage, 'url' | 'close' | 'keys' | 'setNow'> = {
    buckets: new Map(Object.entries(buckets)),
    objects: new Map(),
    requests: [],
    faults: [],
    legacyErrors: false,
    listPageMax: 1000,
    now: () => now,
  };

  const fail = (res: ServerResponse, status: number, error: string, message: string): void => {
    const body = JSON.stringify({ statusCode: String(status), error, message, code: error });
    res.writeHead(state.legacyErrors ? 400 : status, { 'content-type': 'application/json' }).end(body);
  };
  const notFound = (res: ServerResponse) => fail(res, 404, 'not_found', 'Object not found');
  const authed = (req: IncomingMessage) => req.headers.apikey === serviceKey && req.headers.authorization === `Bearer ${serviceKey}`;
  const readBody = (req: IncomingMessage) =>
    new Promise<Buffer>((resolve) => {
      const parts: Buffer[] = [];
      req.on('data', (c: Buffer) => parts.push(c));
      req.on('end', () => resolve(Buffer.concat(parts)));
    });
  const json = async (req: IncomingMessage) => JSON.parse((await readBody(req)).toString('utf8') || '{}') as Record<string, unknown>;
  const send = (res: ServerResponse, status: number, body: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  };

  /** 버킷 상한 검사(서명 업로드·서비스 업로드 모두) — 통과면 null */
  const limitFails = (res: ServerResponse, bucket: FakeBucket, size: number, type: string): boolean => {
    if (bucket.file_size_limit !== null && size > bucket.file_size_limit) {
      fail(res, 413, 'Payload too large', 'The object exceeded the maximum allowed size');
      return true;
    }
    if (bucket.allowed_mime_types && !bucket.allowed_mime_types.includes(type)) {
      fail(res, 415, 'invalid_mime_type', `mime type ${type} is not supported`);
      return true;
    }
    return false;
  };
  const store = (res: ServerResponse, bucketId: string, key: string, req: IncomingMessage, body: Buffer, upsert: boolean): void => {
    const bucket = state.buckets.get(bucketId);
    if (!bucket) return fail(res, 404, 'Bucket not found', 'Bucket not found');
    const type = (req.headers['content-type'] ?? 'application/octet-stream').split(';')[0]!.trim();
    if (limitFails(res, bucket, body.length, type)) return;
    const id = `${bucketId}/${key}`;
    if (state.objects.has(id) && !upsert) return fail(res, 409, 'Duplicate', 'The resource already exists');
    state.objects.set(id, { body, contentType: type, cacheControl: req.headers['cache-control'] ?? 'no-cache' });
    send(res, 200, { Key: id, Id: randomBytes(8).toString('hex') });
  };
  const serveObject = (req: IncomingMessage, res: ServerResponse, o: Obj): void => {
    const h = { 'content-type': o.contentType, 'cache-control': o.cacheControl, etag: '"x"' };
    if (req.method === 'HEAD') return void res.writeHead(200, { ...h, 'content-length': String(o.body.length) }).end();
    const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '');
    if (range) {
      const start = Number(range[1]);
      if (start >= o.body.length) return void res.writeHead(416, { 'content-range': `bytes */${o.body.length}` }).end();
      const end = Math.min(Number(range[2]), o.body.length - 1);
      const part = o.body.subarray(start, end + 1);
      return void res.writeHead(206, { ...h, 'content-length': String(part.length), 'content-range': `bytes ${start}-${end}/${o.body.length}` }).end(part);
    }
    res.writeHead(200, { ...h, 'content-length': String(o.body.length) }).end(o.body);
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const u = new URL(req.url ?? '/', 'http://x');
    const path = decodeURIComponent(u.pathname);
    state.requests.push(`${req.method} ${path}`);
    const fi = state.faults.findIndex((f) => !f.match || f.match.test(`${req.method} ${path}`));
    if (fi >= 0) {
      const { fault } = state.faults.splice(fi, 1)[0]!;
      if (fault === 'hang') return void hung.add(res);
      if (fault === 'reset') return void req.socket.destroy();
      if (fault === 'ghost') return send(res, 200, []);
      return fail(res, fault, fault === 429 ? 'too_many_requests' : 'internal', 'injected');
    }
    if (!path.startsWith('/storage/v1/')) {
      if (!fallback) return notFound(res);
      const body = await readBody(req);
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => k !== 'host' && k !== 'content-length')) as Record<string, string>;
      const r = await fetch(`${fallback}${req.url}`, { method: req.method, headers, body: body.length ? body : undefined, redirect: 'manual' });
      const out = Buffer.from(await r.arrayBuffer());
      res.writeHead(r.status, Object.fromEntries([...r.headers].filter(([k]) => k !== 'content-encoding' && k !== 'transfer-encoding' && k !== 'content-length'))).end(out);
      return;
    }
    const p = path.slice('/storage/v1'.length);
    let m: RegExpExecArray | null;

    // 공개 읽기(인증 없음) — 공개 버킷만
    if ((m = /^\/object\/public\/([^/]+)\/(.+)$/.exec(p)) && (req.method === 'GET' || req.method === 'HEAD')) {
      const o = state.objects.get(`${m[1]}/${m[2]}`);
      if (!state.buckets.get(m[1]!)?.public || !o) return notFound(res);
      return serveObject(req, res, o);
    }
    // 서명 URL로 올리기(인증 없음 — 토큰이 권한)
    if ((m = /^\/object\/upload\/sign\/([^/]+)\/(.+)$/.exec(p)) && req.method === 'PUT') {
      const t = tokens.get(u.searchParams.get('token') ?? '');
      if (!t || t.bucket !== m[1] || t.key !== m[2]) return fail(res, 400, 'InvalidSignature', 'invalid signature');
      if (t.exp < now) return fail(res, 400, 'InvalidJWT', 'jwt expired');
      // 실제 서버처럼 upsert는 **발급 때** 토큰에 묶인다 — 업로드 PUT의 x-upsert 머리글은 보지 않는다(리뷰 L2)
      return store(res, m[1]!, m[2]!, req, await readBody(req), t.upsert);
    }
    if (!authed(req)) return fail(res, 403, 'Unauthorized', 'invalid key');

    if ((m = /^\/bucket\/([^/]+)$/.exec(p)) && req.method === 'GET') {
      const b = state.buckets.get(m[1]!);
      return b ? send(res, 200, { id: m[1], name: m[1], ...b }) : fail(res, 404, 'Bucket not found', 'Bucket not found');
    }
    if ((m = /^\/object\/upload\/sign\/([^/]+)\/(.+)$/.exec(p)) && req.method === 'POST') {
      if (!state.buckets.has(m[1]!)) return fail(res, 404, 'Bucket not found', 'Bucket not found');
      const token = randomBytes(24).toString('base64url');
      tokens.set(token, { bucket: m[1]!, key: m[2]!, exp: now + SIGNED_UPLOAD_TTL_MS, upsert: req.headers['x-upsert'] === 'true' });
      return send(res, 200, { url: `/object/upload/sign/${m[1]}/${m[2]}?token=${token}`, token });
    }
    if (p === '/object/copy' && req.method === 'POST') {
      const b = await json(req);
      const src = state.objects.get(`${b.bucketId}/${b.sourceKey}`);
      if (!src) return notFound(res);
      const to = `${(b.destinationBucket as string | undefined) ?? b.bucketId}/${b.destinationKey}`;
      if (state.objects.has(to) && req.headers['x-upsert'] !== 'true') return fail(res, 409, 'Duplicate', 'The resource already exists');
      const meta = (b.metadata ?? {}) as { cacheControl?: string; mimetype?: string };
      const base = b.copyMetadata === false ? { contentType: 'application/octet-stream', cacheControl: 'no-cache' } : { contentType: src.contentType, cacheControl: src.cacheControl };
      state.objects.set(to, { body: src.body, contentType: meta.mimetype ?? base.contentType, cacheControl: meta.cacheControl ?? base.cacheControl });
      return send(res, 200, { Key: to });
    }
    if (p === '/object/move' && req.method === 'POST') {
      const b = await json(req);
      const from = `${b.bucketId}/${b.sourceKey}`;
      const src = state.objects.get(from);
      if (!src) return notFound(res);
      state.objects.set(`${(b.destinationBucket as string | undefined) ?? b.bucketId}/${b.destinationKey}`, src);
      state.objects.delete(from);
      return send(res, 200, { message: 'Successfully moved' });
    }
    if ((m = /^\/object\/list-v2\/([^/]+)$/.exec(p)) && req.method === 'POST') {
      const b = await json(req);
      const prefix = (b.prefix as string | undefined) ?? '';
      if (b.with_delimiter !== false) return fail(res, 400, 'test_fake', '이 가짜는 with_delimiter=false만 흉내 낸다');
      const all = [...state.objects.keys()]
        .filter((k) => k.startsWith(`${m![1]}/`))
        .map((k) => k.slice(m![1]!.length + 1))
        .filter((k) => k.startsWith(prefix))
        .sort();
      const after = typeof b.cursor === 'string' ? all.filter((k) => k > (b.cursor as string)) : all;
      const limit = Math.min(Number(b.limit ?? 1000), state.listPageMax);
      const page = after.slice(0, limit);
      const hasNext = after.length > limit;
      return send(res, 200, { objects: page.map((name) => ({ name, id: name })), folders: [], hasNext, ...(hasNext ? { nextCursor: page.at(-1) } : {}) });
    }
    if ((m = /^\/object\/([^/]+)$/.exec(p)) && req.method === 'DELETE') {
      const b = await json(req);
      const list = b.prefixes as string[];
      if (!Array.isArray(list) || list.length < 1 || list.length > 1000) return fail(res, 400, 'InvalidRequest', 'prefixes 1..1000');
      const gone = list.filter((k) => state.objects.delete(`${m![1]}/${k}`));
      return send(res, 200, gone.map((name) => ({ name, bucket_id: m![1] })));
    }
    if ((m = /^\/object\/authenticated\/([^/]+)\/(.+)$/.exec(p)) && (req.method === 'GET' || req.method === 'HEAD')) {
      const o = state.objects.get(`${m[1]}/${m[2]}`);
      return o ? serveObject(req, res, o) : req.method === 'HEAD' ? void res.writeHead(state.legacyErrors ? 400 : 404).end() : notFound(res);
    }
    if ((m = /^\/object\/([^/]+)\/(.+)$/.exec(p)) && req.method === 'POST') return store(res, m[1]!, m[2]!, req, await readBody(req), req.headers['x-upsert'] === 'true');
    fail(res, 400, 'test_fake', `가짜가 모르는 경로 ${req.method}`);
  };

  const server: Server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((r, j) => server.once('error', j).listen(port, '127.0.0.1', r));
  return {
    ...(state as FakeStorage),
    get legacyErrors() {
      return state.legacyErrors;
    },
    set legacyErrors(v: boolean) {
      state.legacyErrors = v;
    },
    get listPageMax() {
      return state.listPageMax;
    },
    set listPageMax(v: number) {
      state.listPageMax = v;
    },
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    setNow: (ms: number) => void (now = ms),
    keys: (bucket: string) => [...state.objects.keys()].filter((k) => k.startsWith(`${bucket}/`)).map((k) => k.slice(bucket.length + 1)).sort(),
    close: () =>
      new Promise<void>((r) => {
        for (const res of hung) res.destroy();
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}
