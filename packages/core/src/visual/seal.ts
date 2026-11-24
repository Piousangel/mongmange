// 인장 모양(C-integrated v1.1 2-2 '인장', B-identity-share 3절): 주사 정사각 인장의 테두리 16칸(변마다 4칸)에
// 이 빠짐(0 온전·1 얕음·2 깊음, `sealNotches`)을 새긴 윤곽. 무늬는 타고남 씨앗에서 파생한 인장 씨앗(birth.sealSeed)에서만 온다 —
// **이름과 무관**하다(같은 이름의 두 아이도 인장이 다르고, 이름을 바꿔도 인장은 그대로).
// 순수·결정적. 단위 = 인장 한 변(0..1), 원점 = 왼쪽 위. 그리기(Skia 경로)는 앱이 한다.
import { sealNotches } from '../sim/pillars';

export const SEAL = {
  /** 변마다 칸 수(4변 × 4 = 16) */
  perSide: 4,
  /** 이 빠짐 깊이(한 변 비율): 온전·얕음·깊음 */
  depth: [0, 0.05, 0.1] as const,
  /** 이 빠짐 폭(칸 폭 비율) */
  width: 0.62,
  /** 이 빠짐 곡선 점 수(반원에 가까운 물린 자국) */
  segs: 6,
  /**
   * 작게 그릴 때(LOD, D-24 정신): 인장 한 변이 이 pt보다 작으면 이 빠짐을 그리지 않고 온전한 사각으로 그린다.
   * 깊음(0.1)이 1.4pt 아래로 내려가면 무늬로 읽히지 않고 가장자리 얼룩(먼지)으로 보인다 [팀 추정 — 아트 판정 항목].
   */
  lodMinPt: 14,
} as const;

/**
 * 칸 순서: 위 변 왼→오(0..3), 오른 변 위→아래(4..7), 아래 변 오→왼(8..11), 왼 변 아래→위(12..15) — 시계 방향 한 바퀴.
 * 모서리는 늘 온전하다(진짜 돌 인장의 모서리처럼, 사각으로 알아보게).
 */
export function sealOutline(notches: readonly number[], opts: { plain?: boolean } = {}): number[] {
  const out: number[] = [];
  const corners: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const n = SEAL.perSide;
  for (let side = 0; side < 4; side++) {
    const [ax, ay] = corners[side]!;
    const [bx, by] = corners[(side + 1) % 4]!;
    // 안쪽 법선(시계 방향 윤곽의 오른쪽)
    const nx = -(by - ay);
    const ny = bx - ax;
    out.push(ax, ay);
    if (opts.plain) continue;
    for (let k = 0; k < n; k++) {
      const d = SEAL.depth[(notches[side * n + k] ?? 0) as 0 | 1 | 2] ?? 0;
      if (d <= 0) continue;
      const c = (k + 0.5) / n;
      const hw = (SEAL.width / n) / 2;
      for (let i = 0; i <= SEAL.segs; i++) {
        const u = i / SEAL.segs;
        const t = c - hw + 2 * hw * u;
        const bite = d * Math.sin(Math.PI * u);
        out.push(ax + (bx - ax) * t + nx * bite, ay + (by - ay) * t + ny * bite);
      }
    }
  }
  return out;
}

/** 인장 씨앗 → 윤곽. sizePt(한 변 pt)가 LOD 문턱보다 작으면 온전한 사각 */
export function sealOutlineOf(sealSeed: number, sizePt = Infinity): number[] {
  return sealOutline(sealNotches(sealSeed), { plain: sizePt < SEAL.lodMinPt });
}

/** 두 인장 무늬의 거리 = 칸마다 깊이 단계 차의 합(시험 지표: 서로 다른 아이 100의 최소 쌍 거리) */
export function sealDistance(a: readonly number[], b: readonly number[]): number {
  let d = 0;
  for (let i = 0; i < 16; i++) d += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return d;
}
