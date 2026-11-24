// 원격 문서(config/v1.json·content/v1.json) 서명 — 오프라인 CLI(remote-cli.ts)만 쓴다. Nest 서버 런타임은 이 파일을 부르지 않는다
// (서버에 개인키가 없다 — ota-self-host.md 1절과 같은 원칙). 검사는 계약의 순수 JS `verifyRemoteDoc`(앱과 같은 코드)로 한 번 더 한다.
import { createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { remoteDocBody, remoteSigningInput, verifyRemoteDoc, type RemoteDocKind, type RemotePublicKey } from '@mong/contract';

export interface RemoteSigner {
  kid: string;
  privateKeyPem: string;
}

export function publicKeyFromPem(pem: string, kid: string): RemotePublicKey {
  const jwk = createPublicKey(pem).export({ format: 'jwk' });
  if (jwk.kty !== 'RSA' || !jwk.n || !jwk.e) throw new Error('RSA 공개키가 아니다');
  return { kid, n: jwk.n, e: jwk.e };
}

/** RSA 키 쌍(기본 3072비트). 개인키 PEM(PKCS#8)과 앱에 넣을 공개키 {kid,n,e} */
export function generateRemoteKey(kid: string, bits = 3072): RemoteSigner & { publicKeyPem: string; publicKey: RemotePublicKey } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: bits, publicExponent: 0x10001 });
  const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
  return { kid, privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(), publicKeyPem, publicKey: publicKeyFromPem(publicKeyPem, kid) };
}

/**
 * 옛 sig를 버리고 새로 서명한 문서(sig는 맨 끝). 만든 서명을 계약 검사기로 다시 확인하고, 틀리면 던진다.
 * 본문 복사는 계약의 `remoteDocBody`(금지 키 거부·프로토타입 없는 객체 — B4 리뷰 M1)를 검사기와 함께 쓴다
 */
export function signRemoteDoc(kind: RemoteDocKind, doc: Record<string, unknown>, signer: RemoteSigner): Record<string, unknown> {
  const body = remoteDocBody(doc);
  const value = sign('sha256', Buffer.from(remoteSigningInput(kind, body), 'utf8'), signer.privateKeyPem).toString('base64url');
  const signed = { ...body, sig: { alg: 'RS256', kid: signer.kid, value } };
  const pub = publicKeyFromPem(signer.privateKeyPem, signer.kid);
  if (verifyRemoteDoc(kind, signed, [pub]) !== 'ok') throw new Error('만든 서명이 계약 검사기를 통과하지 못했다');
  return signed;
}
