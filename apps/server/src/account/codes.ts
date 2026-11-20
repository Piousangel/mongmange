// 서버가 만드는 난수 값(B2): 인장 코드 40비트·되찾기 글귀 80비트(Crockford base32)·삭제 영수증 128비트(base64url).
// 모두 node:crypto 보안 난수. 글귀·영수증은 평문을 저장하지 않는다 — 글귀는 HMAC(pepper), 영수증은 SHA-256.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { formatRecoveryCode, RECOVERY_ALPHABET } from '@mong/contract';

/** 5비트씩 끊어 Crockford base32로. bits는 5의 배수 */
function base32(bits: number): string {
  const buf = randomBytes(Math.ceil(bits / 8));
  let acc = 0;
  let n = 0;
  let out = '';
  for (const b of buf) {
    acc = (acc << 8) | b;
    n += 8;
    while (n >= 5 && out.length < bits / 5) {
      n -= 5;
      out += RECOVERY_ALPHABET[(acc >> n) & 31];
    }
    acc &= (1 << n) - 1;
  }
  return out;
}

/** 인장 코드 8자 = 40비트(3-5 '서버 난수 40비트') */
export function newCreatureCode(): string {
  return base32(40);
}

/** 되찾기 글귀: 정규 16자(80비트)와 보여 줄 꼴 */
export function newRecoveryCode(): { code16: string; display: string } {
  const code16 = base32(80);
  return { code16, display: formatRecoveryCode(code16) };
}

/** 글귀 해시 = HMAC-SHA256(pepper, 정규 16자). pepper 없이는 80비트 공간을 오프라인으로 대입할 수 없다 */
export function recoveryHash(pepper: string, code16: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(createHmac('sha256', pepper).update(code16, 'utf8').digest());
}

/** 삭제 영수증 22자(128비트 base64url)와 저장할 해시 */
export function newReceipt(): { receipt: string; hash: Uint8Array<ArrayBuffer> } {
  const receipt = randomBytes(16).toString('base64url');
  return { receipt, hash: receiptHash(receipt) };
}

export function receiptHash(receipt: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(createHash('sha256').update(receipt, 'utf8').digest());
}
