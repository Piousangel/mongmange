// 픽셀 불변 검사 사례(LOD 이전 렌더의 해시를 golden으로 고정)
import { BASE_LOOK, day7Records, handRecords, inkLook, shapeOf, type MongLook, type StrokeRecord } from '@mong/core';

export interface Case {
  id: string;
  wpx: number;
  dpr: number;
  look: MongLook;
  records: StrokeRecord[];
}

export function identityCases(): Case[] {
  const tr = { body: 2, comb: 3, ring: 1 } as const;
  const sh = shapeOf(tr);
  const m1: MongLook = { traits: tr, shape: sh, ink: inkLook('songyeon') };
  const out: Case[] = [];
  for (const [wpx, dpr] of [[49, 2], [64, 2], [96, 3], [120, 1]] as const) {
    out.push({ id: `base-${wpx}@${dpr}`, wpx, dpr, look: BASE_LOOK, records: day7Records(2) });
    out.push({ id: `m1-${wpx}@${dpr}`, wpx, dpr, look: m1, records: handRecords(4, 7, sh) });
  }
  return out;
}

/**
 * 블러 하한이 48pt 초과에서도 걸리는 저밀도 사례(아트 1-5 v1.4, 리뷰 I-1): 하한은 크기가 아니라 장치 px 기준이라
 * 1x에서 몸 폭 83pt 미만이면 눈 구멍 σ가 0.006W → 0.5px로 오른다. de90b3d와 **달라지는 것이 맞다**(의도된 변화).
 */
export function floorCases(): (Case & { before: string })[] {
  return [{ id: 'base-64@1', wpx: 64, dpr: 1, look: BASE_LOOK, records: day7Records(2), before: 'aaef4bc6' }];
}
