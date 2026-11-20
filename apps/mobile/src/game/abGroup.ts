// 이름 시점 A/B 군(nt, architecture.md 3-6, B0 리뷰 I7). **설치 순간**에 별도 로컬 난수로 정해 기기에 저장한다.
// - birth.seed와 무관하다(군이 세이브 씨앗의 단서가 되지 않게). 서버로 가는 것은 핑의 'A'/'B' 한 글자뿐.
// - 이용 통계를 꺼도 군은 생긴다 — 게임(이름 시점 처리, nameTiming 플래그)이 읽는 값과 핑이 보내는 값이 늘 같다.
// - 빌드 1에서 이미 설치한 기기는 다음 실행(boot)에서 정한다(그 코호트는 판정에서 빠진다).
import type { KV } from '@mong/core';

export const AB_KEYS = { nameTiming: 'mong.ab.nt' } as const;
export type NameTimingGroup = 'A' | 'B';

export function readNameTimingGroup(kv: KV): NameTimingGroup | null {
  try {
    const v = kv.getString(AB_KEYS.nameTiming);
    return v === 'A' || v === 'B' ? v : null;
  } catch {
    return null;
  }
}

/** 없으면 정해 저장한다(있으면 그대로). 저장이 실패해도 던지지 않는다 */
export function ensureNameTimingGroup(kv: KV, random: () => number = Math.random): NameTimingGroup {
  const cur = readNameTimingGroup(kv);
  if (cur) return cur;
  const g: NameTimingGroup = random() < 0.5 ? 'A' : 'B';
  try {
    kv.set(AB_KEYS.nameTiming, g);
  } catch {
    /* 이번 실행만 */
  }
  return g;
}
