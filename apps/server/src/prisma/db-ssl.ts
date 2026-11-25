// DB TLS 검증(B6a). Supabase 풀러(Supavisor)는 Supabase 자체 CA로 서명한 인증서를 쓴다 → 공개 CA 묶음으로는 검증할 수 없다.
// CA가 주어지면(DATABASE_CA_CERT 본문 또는 DATABASE_CA_FILE 경로 — 운영 필수, env.ts) sslmode=verify-full과 같은 검사를 한다:
//  - 사슬: 이 CA만 믿는다(rejectUnauthorized), 호스트 이름: 연결 주소의 호스트와 인증서 SAN이 맞아야 한다.
//  - URL의 ssl 관련 값(sslmode·sslrootcert·uselibpqcompat 등)은 지운다: pg는 연결 문자열을 코드의 ssl 설정 **위에** 덮어써,
//    `sslmode=require`가 남아 있으면 넘긴 CA가 사라지고 `no-verify`면 검사가 꺼진다.
// CA가 없으면(로컬·CI) 연결 문자열을 그대로 쓴다 — 지금 동작과 같다.
import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ConnectionOptions } from 'node:tls';
import type { Env } from '../config/env';

const SSL_PARAMS = ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'sslca', 'sslpassword', 'uselibpqcompat'];

export interface PgConnection {
  connectionString: string;
  ssl?: ConnectionOptions;
}

export function pgConnection(env: Pick<Env, 'DATABASE_URL' | 'DATABASE_CA_CERT' | 'DATABASE_CA_FILE'>): PgConnection {
  const ca = env.DATABASE_CA_CERT ?? (env.DATABASE_CA_FILE ? readCaFile(env.DATABASE_CA_FILE) : undefined);
  if (!ca) return { connectionString: env.DATABASE_URL };
  const u = new URL(env.DATABASE_URL);
  for (const k of SSL_PARAMS) u.searchParams.delete(k);
  return {
    connectionString: u.toString(),
    ssl: {
      ca,
      // 호스트 이름 검사는 Node 기본(checkServerIdentity) — pg 8.23은 servername(IP면 host)을 넘긴다. db-tls.test.ts가 IP·이름 불일치를 고정
      rejectUnauthorized: true,
    },
  };
}

function readCaFile(path: string): string {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    // 경로는 비밀이 아니지만 메시지에는 키 이름만(다른 오류 메시지와 같은 꼴)
    throw new Error('환경 변수 오류 — DATABASE_CA_FILE: 파일을 읽을 수 없습니다');
  }
  // DATABASE_CA_CERT와 같은 검사(리뷰 L3): 머리말 + X509 파싱. 깨진 파일로 뜨지 않게
  let ok = text.includes('-----BEGIN CERTIFICATE-----');
  if (ok) {
    try {
      new X509Certificate(text);
    } catch {
      ok = false;
    }
  }
  if (!ok) throw new Error('환경 변수 오류 — DATABASE_CA_FILE: PEM 인증서가 아닙니다');
  return text;
}
