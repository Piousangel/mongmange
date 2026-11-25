// 시험 전용 원격 문서 서명기: node:crypto로 RSA 키를 만들고 계약의 서명 원문(remoteSigningInput)에 RS256으로 서명한다.
// 앱 검사기(@mong/contract 순수 JS)와 독립된 구현으로 서명하므로 '같은 코드로 만들고 같은 코드로 검사'하는 맹점이 없다.
import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { remoteSigningInput, type RemoteDocKind, type RemotePublicKey } from '@mong/contract';

export interface Signer {
  key: RemotePublicKey;
  sign<T extends Record<string, unknown>>(kind: RemoteDocKind, doc: T): T & { sig: { alg: 'RS256'; kid: string; value: string } };
}

export function makeSigner(kid = 'app-test'): Signer {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = (publicKey as KeyObject).export({ format: 'jwk' }) as { n: string; e: string };
  return {
    key: { kid, n: jwk.n, e: jwk.e },
    sign(kind, doc) {
      const s = createSign('RSA-SHA256');
      s.update(remoteSigningInput(kind, doc));
      return { ...doc, sig: { alg: 'RS256' as const, kid, value: s.sign(privateKey).toString('base64url') } };
    },
  };
}

/** UTC `YYYY-MM-DDTHH:MM:SSZ`(초까지) */
export function isoSec(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
}
