// DB TLS 검증(B6a): Supabase CA로 sslmode=verify-full과 같은 검사(인증서 사슬 + 호스트 이름)를 하는지 실제 TLS 손잡기로 확인한다.
// 가짜 Postgres(포트 8182)는 SSLRequest에 'S'로 답하고 시험이 만든 CA의 서버 인증서로 TLS를 연다. 실제 Supabase에는 붙지 않는다.
// 그럴듯한 오답: 'URL에 sslmode=require만 두면 된다' — pg는 URL의 ssl 설정이 코드에서 준 ssl(CA)을 덮어써 CA 없이 공개 CA로만 검사한다.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TLSSocket } from 'node:tls';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateEnv } from '../src/config/env';
import { pgConnection } from '../src/prisma/db-ssl';

const PORT = 8182;
const dir = mkdtempSync(join(tmpdir(), 'mong-dbtls-'));
const ossl = (...a: string[]) => execFileSync('openssl', a, { cwd: dir, stdio: 'pipe' });
/** CA 하나 + 그 CA가 서명한 서버 인증서(SAN = 주어진 이름들) */
function makeCa(name: string, sans: string): { ca: string; key: string; cert: string } {
  ossl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', `/CN=${name} CA`, '-keyout', `${name}-ca.key`, '-out', `${name}-ca.pem`);
  ossl('req', '-newkey', 'rsa:2048', '-nodes', '-subj', `/CN=${name}`, '-keyout', `${name}.key`, '-out', `${name}.csr`);
  writeFileSync(join(dir, `${name}.ext`), `subjectAltName=${sans}\n`);
  ossl('x509', '-req', '-in', `${name}.csr`, '-CA', `${name}-ca.pem`, '-CAkey', `${name}-ca.key`, '-CAcreateserial', '-days', '2', '-extfile', `${name}.ext`, '-out', `${name}.pem`);
  const r = (f: string) => readFileSync(join(dir, f), 'utf8');
  return { ca: r(`${name}-ca.pem`), key: r(`${name}.key`), cert: r(`${name}.pem`) };
}

let good: ReturnType<typeof makeCa>;
let other: ReturnType<typeof makeCa>;
let server: Server;
let serving: { key: string; cert: string };
const handshakes: string[] = [];

beforeAll(async () => {
  good = makeCa('supabase-test', 'DNS:localhost');
  other = makeCa('other-test', 'DNS:localhost');
  serving = good;
  // Postgres SSLRequest(8바이트) → 'S' → TLS. 손잡기가 끝나면 서버가 끊는다(시험은 손잡기 성공·실패만 본다)
  server = createServer((sock: Socket) => {
    sock.once('data', () => {
      sock.write('S');
      const tls = new TLSSocket(sock, { isServer: true, key: serving.key, cert: serving.cert });
      tls.on('secure', () => {
        handshakes.push('ok');
        tls.destroy();
      });
      tls.on('error', () => undefined);
    });
    sock.on('error', () => undefined);
  });
  await new Promise<void>((r) => server.listen(PORT, '127.0.0.1', r));
});
afterAll(async () => {
  await new Promise<void>((r) => server?.close(() => r()));
});

/** pgConnection이 만든 설정으로 붙어 본다 → TLS 오류 문자열(손잡기는 됐는데 서버가 끊으면 'handshake-ok') */
async function tryConnect(url: string, env: Record<string, string>): Promise<string> {
  const before = handshakes.length;
  const c = new pg.Client({ ...pgConnection(validateEnv({ DATABASE_URL: url, ...env })), connectionTimeoutMillis: 3000 });
  c.on('error', () => undefined);
  try {
    await c.connect();
    return 'connected';
  } catch (e) {
    return handshakes.length > before ? 'handshake-ok' : String((e as Error).message);
  } finally {
    await c.end().catch(() => undefined);
  }
}
const url = (q = '') => `postgresql://prisma.ref:pw@localhost:${PORT}/postgres${q}`;

describe('DB TLS — CA로 verify-full', () => {
  it('맞는 CA(본문·파일)면 손잡기 성공 — URL에 sslmode=require가 있어도 CA 검사가 이긴다', async () => {
    expect(await tryConnect(url('?sslmode=require'), { DATABASE_CA_CERT: good.ca })).toBe('handshake-ok');
    writeFileSync(join(dir, 'file-ca.pem'), good.ca);
    expect(await tryConnect(url(), { DATABASE_CA_FILE: join(dir, 'file-ca.pem') })).toBe('handshake-ok');
  });
  it('다른 CA가 서명한 서버(중간자)는 거부', async () => {
    serving = other;
    try {
      expect(await tryConnect(url('?sslmode=require'), { DATABASE_CA_CERT: good.ca })).toMatch(/self[- ]signed|unable to verify|certificate/i);
    } finally {
      serving = good;
    }
  });
  it('호스트 이름이 인증서와 다르면 거부(verify-ca가 아니라 verify-full)', async () => {
    const r = await tryConnect(`postgresql://prisma.ref:pw@127.0.0.1:${PORT}/postgres`, { DATABASE_CA_CERT: good.ca });
    expect(r).toMatch(/Hostname|IP: 127\.0\.0\.1 is not in the cert|altnames/i);
  });
  it('URL의 no-verify·sslrootcert는 CA 경로에서 지운다(검사를 끄는 우회 없음)', () => {
    const c = pgConnection(validateEnv({ DATABASE_URL: url('?sslmode=no-verify&sslrootcert=/x&uselibpqcompat=true&application_name=mong'), DATABASE_CA_CERT: good.ca }));
    expect(c.connectionString).toBe(url('?application_name=mong'));
    expect(c.ssl).toMatchObject({ rejectUnauthorized: true, ca: good.ca });
  });
  it('CA가 없으면(로컬·CI) 연결 문자열을 그대로 둔다', () => {
    const local = 'postgresql://prisma:prisma-local@127.0.0.1:54329/mong';
    expect(pgConnection(validateEnv({ DATABASE_URL: local }))).toEqual({ connectionString: local });
  });
  it('CA 파일이 없거나 인증서가 아니면 부팅 거부', () => {
    expect(() => pgConnection(validateEnv({ DATABASE_URL: url(), DATABASE_CA_FILE: join(dir, 'none.pem') }))).toThrow(/DATABASE_CA_FILE/);
    expect(() => validateEnv({ DATABASE_URL: url(), DATABASE_CA_CERT: 'not a cert' })).toThrow(/DATABASE_CA_CERT/);
    // 파일도 본문과 같은 검사(리뷰 L3): 인증서가 아닌 파일·머리말만 맞고 깨진 PEM
    writeFileSync(join(dir, 'not-cert.pem'), 'hello\n');
    writeFileSync(join(dir, 'broken.pem'), '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n');
    for (const f of ['not-cert.pem', 'broken.pem']) expect(() => pgConnection(validateEnv({ DATABASE_URL: url(), DATABASE_CA_FILE: join(dir, f) }))).toThrow(/DATABASE_CA_FILE: PEM/);
  });
});
