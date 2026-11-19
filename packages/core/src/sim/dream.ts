// 꿈 카드(systems 5절): 모티프(curiosity × closeness 사분면 + 가운데) × 구도 3 × 물결(tempo) × 먹 톤(boldness).
// MVP 보유량 = 모티프 10개. id는 자리표시다 — 실제 모티프 목록·그림은 아트·콘텐츠 담당이 채운다.
import { rngInt, rngNext } from './rng';
import type { AxisRecord, DreamCard } from './types';

export type MotifZone = 'near-alone' | 'near-with' | 'far-alone' | 'far-with' | 'center';

export interface Motif {
  id: string;
  zone: MotifZone;
  placeholder: true;
}

/** systems 2.5 '꿈' 열: 가까운 것(이불·찻잔·창) / 먼 것(산·바다·별), 다가옴 = 다른 존재(손 그림자·다른 방울) */
export const MOTIFS: readonly Motif[] = [
  { id: 'near-alone.quilt', zone: 'near-alone', placeholder: true },
  { id: 'near-alone.teacup', zone: 'near-alone', placeholder: true },
  { id: 'near-with.window-hand', zone: 'near-with', placeholder: true },
  { id: 'near-with.teacup-two', zone: 'near-with', placeholder: true },
  { id: 'far-alone.mountain', zone: 'far-alone', placeholder: true },
  { id: 'far-alone.sea', zone: 'far-alone', placeholder: true },
  { id: 'far-with.stars-drops', zone: 'far-with', placeholder: true },
  { id: 'far-with.sea-hand', zone: 'far-with', placeholder: true },
  { id: 'center.rain', zone: 'center', placeholder: true },
  { id: 'center.moon', zone: 'center', placeholder: true },
];

/** 가운데로 보는 폭 */
const CENTER = 0.15;

export function zoneOf(v: AxisRecord): Exclude<MotifZone, 'center'> | 'center' {
  if (Math.abs(v.curiosity) < CENTER && Math.abs(v.closeness) < CENTER) return 'center';
  return `${v.curiosity >= 0 ? 'far' : 'near'}-${v.closeness >= 0 ? 'with' : 'alone'}`;
}

/** 접근 풀 = 현재 사분면 + 가운데(약 4개 × 구도 3 = 12장면). 이미 나온 장면은 다시 고르지 않는다(바닥나면 가장 오래된 것) */
export function pickCard(
  v: AxisRecord,
  used: readonly { motifId: string; composition: number }[],
  rng: number,
  night: number,
  strokeRef: string | null,
): { card: DreamCard; rng: number } {
  const zone = zoneOf(v);
  // 가운데 유저도 12장면: 가운데 2 + 부호가 가리키는 가장 가까운 사분면 2(리뷰 1-4)
  const near = zone === 'center' ? `${v.curiosity >= 0 ? 'far' : 'near'}-${v.closeness >= 0 ? 'with' : 'alone'}` : zone;
  const pool = MOTIFS.filter((m) => m.zone === near || m.zone === 'center');
  const scenes: { motifId: string; composition: 0 | 1 | 2 }[] = [];
  for (const m of pool) for (const c of [0, 1, 2] as const) scenes.push({ motifId: m.id, composition: c });
  const key = (x: { motifId: string; composition: number }) => `${x.motifId}/${x.composition}`;
  const usedKeys = used.map(key);
  let cands = scenes.filter((x) => !usedKeys.includes(key(x)));
  if (cands.length === 0) {
    // 가장 오래전에 나온 장면부터
    const age = (x: (typeof scenes)[number]) => usedKeys.lastIndexOf(key(x));
    const oldest = Math.min(...scenes.map(age));
    cands = scenes.filter((x) => age(x) === oldest);
  }
  const pick = rngInt(rng, cands.length);
  const fs = rngNext(pick.seed);
  const chosen = cands[pick.value]!;
  return {
    card: {
      night,
      motifId: chosen.motifId,
      composition: chosen.composition,
      inkTone: (Math.max(-0.85, Math.min(0.85, v.boldness)) + 0.85) / 1.7,
      flow: Math.max(-1, Math.min(1, v.tempo / 0.85)),
      flowSeed: Math.floor(fs.value * 2 ** 31),
      strokeRef,
      nightsMerged: 1,
    },
    rng: fs.seed,
  };
}
