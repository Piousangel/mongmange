// 되찾기 pepper(3-3 ⑤). 운영은 RECOVERY_PEPPER 필수(env.ts). 개발·시험에서 비어 있으면 고정 개발값 — 운영 이미지에서는 쓰일 수 없다.
// 회전(B2 리뷰 m1): 해시 옆에 판 번호(creatures.recovery_pepper_v)를 저장하고, 찾을 때는 지금 판 + RECOVERY_PEPPERS_PREVIOUS의
// 옛 판을 모두 대 본다. 새 해시는 늘 지금 판으로 쓴다 — 글귀를 다시 쓰는 순간(recover = 새 글귀 발급, recovery-code 재발급)
// 지금 판으로 바뀐다. 평문 글귀는 서버에 없으므로 그 전에는 다시 해시할 수 없다. 절차는 architecture.md 3-3 ⑤ 'pepper 회전'.
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { recoveryHash } from './codes';

const DEV_PEPPER = 'dev-only-recovery-pepper-not-a-secret';

export interface PepperVersion {
  v: number;
  value: string;
}

@Injectable()
export class RecoveryPepper {
  current!: PepperVersion;
  previous: PepperVersion[] = [];

  constructor(config: ConfigService<Env, true>) {
    this.configure(
      { v: config.get('RECOVERY_PEPPER_V', { infer: true }), value: config.get('RECOVERY_PEPPER', { infer: true }) ?? DEV_PEPPER },
      config.get('RECOVERY_PEPPERS_PREVIOUS', { infer: true }) ?? [],
    );
  }

  /** 시험이 회전을 흉내 낼 때도 이 길로 */
  configure(current: PepperVersion, previous: PepperVersion[]): void {
    this.current = current;
    this.previous = previous.filter((p) => p.v !== current.v);
  }

  /** 지금 판 해시(새로 쓸 때·글귀당 한도 키) */
  hash(code16: string): Uint8Array<ArrayBuffer> {
    return recoveryHash(this.current.value, code16);
  }

  /** 찾을 때 대 볼 (판, 해시) 전부 — 지금 판이 먼저 */
  candidates(code16: string): Array<{ recoveryPepperV: number; recoveryHash: Uint8Array<ArrayBuffer> }> {
    return [this.current, ...this.previous].map((p) => ({ recoveryPepperV: p.v, recoveryHash: recoveryHash(p.value, code16) }));
  }
}
