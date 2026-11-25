// 서버가 만드는 난수 값(B2): 인장 코드 40비트·되찾기 글귀 80비트(Crockford base32)·삭제 영수증 128비트(base64url).
// 모두 node:crypto 보안 난수. 글귀·영수증은 평문을 저장하지 않는다 — 글귀는 HMAC(pepper), 영수증은 SHA-256.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { formatRecoveryCode, RECOVERY_ALPHABET } from '@mong/contract';

/** 5비트씩 끊어 Crockford base32로. bits는 5의 배수. buf는 보안 난수 또는 비밀 키 HMAC */
function base32(bits: number, buf: Uint8Array = randomBytes(Math.ceil(bits / 8))): string {
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

/**
 * 되찾기가 줄 새 글귀(B2b 멱등): HMAC-SHA256(pepper 파생, 기기 sub + 넣은 옛 글귀)의 앞 80비트.
 * 같은 기기가 같은 옛 글귀로 다시 부르면 같은 새 글귀가 나와, 서버는 아무것도 더 저장하지 않고 '같은 대상의 재시도'를 알아본다
 * (지금 해시 = 이 값의 해시인지). pepper 없이는 sub·옛 글귀를 알아도 계산할 수 없다(글귀 해시와 용도 문자열로 키를 나눔).
 */
export function deriveRecoveryCode(pepper: string, sub: string, oldCode16: string): { code16: string; display: string } {
  const mac = createHmac('sha256', pepper).update(`recover-next:${sub.toLowerCase()}:${oldCode16}`, 'utf8').digest();
  const code16 = base32(80, mac.subarray(0, 10));
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
