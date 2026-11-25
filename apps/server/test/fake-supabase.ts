// 시험용 Supabase 자리(로컬에 Supabase CLI가 없다 — architecture 6-3): 실제 HTTP 서버 하나가
//  ① JWKS(`/auth/v1/.well-known/jwks.json`) — 시험이 만든 ES256 키쌍의 공개 키 → 서버의 JWT 검사가 실제 원격 JWKS 경로를 탄다
//  ② Auth Admin(`/auth/v1/admin/users/:id` GET·DELETE) — 메모리의 사용자 집합, 서비스 키 헤더 확인
// 를 흉내 낸다. 토큰은 Supabase 익명 로그인과 같은 클레임(iss·aud authenticated·role authenticated·sub uuid·exp).
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from 'jose';

export const SERVICE_KEY = 'service-role-key-for-tests-0001';

export interface FakeSupabase {
  url: string;
  users: Set<string>;
  /** Admin DELETE를 실패시키기(재시도 대기열 시험) */
  failDeletes: boolean;
  /** JWKS 요청 수 */
  jwksHits: number;
  /** JWKS 응답 상태(장애 흉내 — 500·503·429·302, 'garbage'면 200 + JSON 아님) */
  jwksStatus: number | 'garbage';
  /** 새 익명 로그인(= auth.users에 sub 추가) → 그 sub의 JWT */
  signIn(): Promise<{ sub: string; token: string }>;
  token(claims: Record<string, unknown>, opts?: { sub?: string; alg?: 'ES256'; kid?: string; exp?: string; iss?: string; aud?: string }): Promise<string>;
  close(): Promise<void>;
}

/** port 0 = 아무 빈 포트(기존 시험), B6a 시험은 8180~8189 안의 고정 포트 */
export async function startFakeSupabase(port = 0): Promise<FakeSupabase> {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'test-key-1', alg: 'ES256', use: 'sig' };
  const state = { users: new Set<string>(), failDeletes: false, jwksHits: 0, jwksStatus: 200 as number | 'garbage' };
  const server: Server = createServer((req, res) => {
    const url = req.url ?? '';
    if (req.method === 'GET' && url === '/auth/v1/.well-known/jwks.json') {
      state.jwksHits++;
      if (state.jwksStatus === 'garbage') {
        res.writeHead(200, { 'content-type': 'text/html' }).end('<html>maintenance</html>');
        return;
      }
      if (state.jwksStatus !== 200) {
        res.writeHead(state.jwksStatus, state.jwksStatus === 302 ? { location: 'https://login.example/' } : {}).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    const m = /^\/auth\/v1\/admin\/users\/([0-9a-f-]{36})$/.exec(url);
    if (m) {
      if (req.headers.apikey !== SERVICE_KEY || req.headers.authorization !== `Bearer ${SERVICE_KEY}`) {
        res.writeHead(401).end();
        return;
      }
      const id = m[1]!;
      if (req.method === 'GET') {
        res.writeHead(state.users.has(id) ? 200 : 404, { 'content-type': 'application/json' }).end(JSON.stringify({ id }));
        return;
      }
      if (req.method === 'DELETE') {
        if (state.failDeletes) {
          res.writeHead(500).end();
          return;
        }
        const had = state.users.delete(id);
        res.writeHead(had ? 200 : 404).end();
        return;
      }
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  const addr = server.address();
  const url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;

  const fake: FakeSupabase = {
    url,
    get users() {
      return state.users;
    },
    get failDeletes() {
      return state.failDeletes;
    },
    set failDeletes(v: boolean) {
      state.failDeletes = v;
    },
    get jwksHits() {
      return state.jwksHits;
    },
    get jwksStatus() {
      return state.jwksStatus;
    },
    set jwksStatus(v: number | 'garbage') {
      state.jwksStatus = v;
    },
    async signIn() {
      const sub = randomUUID();
      state.users.add(sub);
      return { sub, token: await fake.token({}, { sub }) };
    },
    async token(claims, opts = {}) {
      return sign(privateKey, { role: 'authenticated', is_anonymous: true, ...claims }, {
        sub: opts.sub ?? randomUUID(),
        kid: opts.kid ?? 'test-key-1',
        exp: opts.exp ?? '1h',
        iss: opts.iss ?? `${url}/auth/v1`,
        aud: opts.aud ?? 'authenticated',
      });
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
  return fake;
}

async function sign(key: CryptoKey, claims: Record<string, unknown>, o: { sub: string; kid: string; exp: string; iss: string; aud: string }): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid: o.kid, typ: 'JWT' })
    .setSubject(o.sub)
    .setIssuer(o.iss)
    .setAudience(o.aud)
    .setIssuedAt()
    .setExpirationTime(o.exp)
    .sign(key);
}
