// 32비트 보안 난수(타고남 씨앗 재료, C-integrated 2-1·리뷰 H-1). Hermes에는 crypto.getRandomValues가 없으므로 expo-crypto를 쓴다.
// 모듈이 없는 옛 빌드: 웹·Node의 crypto → 그것도 없으면 Math.random(개발 경고). 웹은 expo-crypto가 Web Crypto를 쓴다.
import { optionalModule } from '../lib/optionalModule';

type ExpoCrypto = typeof import('expo-crypto');
const Crypto = optionalModule<ExpoCrypto>(() => require('expo-crypto'));

export type EntropySource = 'expo-crypto' | 'web-crypto' | 'math-random';

export function entropy32(): { value: number; source: EntropySource } {
  try {
    if (Crypto) {
      const b = Crypto.getRandomBytes(4);
      return { value: (b[0]! | (b[1]! << 8) | (b[2]! << 16) | (b[3]! << 24)) >>> 0, source: 'expo-crypto' };
    }
  } catch {
    /* 아래 대체 */
  }
  try {
    const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
    if (c?.getRandomValues) return { value: c.getRandomValues(new Uint32Array(1))[0]! >>> 0, source: 'web-crypto' };
  } catch {
    /* 아래 대체 */
  }
  if (typeof __DEV__ === 'undefined' || __DEV__) console.warn('[entropy] 보안 난수 모듈 없음 → Math.random으로 대체(옛 빌드)');
  return { value: (Math.random() * 0x100000000) >>> 0, source: 'math-random' };
}
