// 64px 흑백 구별 틀(dreams-30days 1-2, 아트 1-4) — **형상(`paths`)이 들어온 모티프만** 대상.
// C14b(11-25)에 새 꿈 15개의 붓 형상이 들어왔다 — 관문 목록 = 그 15개. 빌드 1의 10개는 경로가 아니라 마블링 조작으로 그려
// 이 틀 밖이다(카드 렌더 자체의 구별은 apps/mobile `test/skia/dream-motif-ink` 64pt 시험이 본다).
// 사람 3명 시험(오답 쌍 3쌍 이하)이 `dreamContent`를 운영에서 켜기 전 PM 관문이고, 이 틀은 그 앞에서 같은 기준으로 한 번 거른다.
import { describe, expect, it } from 'vitest';
import { BUNDLED_MOON_MOTIFS, sim, type MotifPathData } from '../src/index';
import { CONFUSABLE_BELOW, MAX_CONFUSABLE_PAIRS, THUMB_PX, confusablePairs, contactSheet, flattenPath, rasterize, thumbDistance } from './motif-raster';

const shapedMotifs = () => sim.MOTIFS.filter((m) => m.paths.length > 0).map((m) => ({ id: m.id, paths: m.paths, field: m.field ?? [] }));
const shapedMoons = () => BUNDLED_MOON_MOTIFS.filter((m) => m.paths.length > 0).map((m) => ({ id: m.id, paths: m.paths }));

describe('형상이 들어온 모티프 — 64px 시트에서 헷갈리는 쌍 3쌍 이하', () => {
  // 빈 관문 방지(리뷰 참고): 형상이 들어온 목록을 그대로 적는다. 형상이 늘거나 빠지면 이 단언이 실패해 목록 갱신을 강제한다
  const GATED_MOTIFS: readonly string[] = sim.MOTIFS.filter((m) => m.unlockAtCards > 0).map((m) => m.id);
  const GATED_MOONS: readonly string[] = [];

  it('모티프 25(5×5 시트): 형상이 들어온 목록 = 관문 목록(새 15개), 헷갈리는 쌍 3쌍 이하 — C14b 실측 0쌍', () => {
    const items = shapedMotifs();
    expect(GATED_MOTIFS).toHaveLength(15);
    expect(items.map((x) => x.id)).toEqual(GATED_MOTIFS);
    expect(confusablePairs(items).length).toBeLessThanOrEqual(MAX_CONFUSABLE_PAIRS);
    // 여유: 15개 중 가장 가까운 쌍(C14b 실측 은하수 다리~눈 0.036)도 문턱의 1.5배 넘게 떨어진다 — 형상을 고칠 때 문턱 바로 위로
    // 미끄러지지 않게. 이 거리는 성긴 그림(점·ㅅ자)일수록 먹 양에 끌려 작아지므로 점 모티프끼리가 늘 가장 가깝다
    expect(confusablePairs(items, CONFUSABLE_BELOW * 1.5)).toEqual([]);
  });

  it('보름 번들(4×3 시트, 번들 3개 먼저)', () => {
    const items = shapedMoons();
    expect(items.map((x) => x.id)).toEqual(GATED_MOONS);
    expect(confusablePairs(items).length).toBeLessThanOrEqual(MAX_CONFUSABLE_PAIRS);
  });

  it('형상이 들어온 모티프는 자리표시가 풀려 있고, 자리표시는 형상이 없다', () => {
    for (const m of sim.MOTIFS) {
      if (m.placeholder) expect(m.paths, m.id).toEqual([]);
      if (m.paths.length > 0) expect(m.placeholder, m.id).toBe(false);
    }
  });
});

describe('틀 자체(합성 형상)', () => {
  const P = (d: string, w = 2, layer: MotifPathData['layer'] = 'ink'): MotifPathData[] => [{ d, w, layer }];
  const umbrella = P('M15 55 Q50 5 85 55 M50 30 L50 85');
  const cloud = P('M15 55 Q50 5 85 55 M25 65 L22 80 M50 65 L47 80 M75 65 L72 80');
  const letter = P('M10 20 L90 20 M30 50 L75 40 L80 70 L35 80 Z');
  const kite = P('M70 10 L85 25 L70 40 L55 25 Z M70 40 C60 60 40 70 20 90');

  it('경로 읽기: 직선·곡선·닫기·상대 좌표', () => {
    expect(flattenPath('M0 0 L10 0 l0 10 Z')).toEqual([[[0, 0], [10, 0], [10, 10], [0, 0]]]);
    const q = flattenPath('M0 0 Q50 100 100 0', 4)[0]!;
    expect(q).toHaveLength(5);
    expect(q[2]).toEqual([50, 50]);
  });

  it('썸네일은 64×64, 같은 형상 = 거리 0, 다른 형상 > 0', () => {
    const a = rasterize(umbrella);
    expect(a.length).toBe(THUMB_PX * THUMB_PX);
    expect(thumbDistance(a, rasterize(umbrella))).toBe(0);
    expect(thumbDistance(a, rasterize(kite))).toBeGreaterThan(0.02);
  });

  it('같은 형상을 두 모티프에 넣으면 헷갈리는 쌍으로 잡는다(그럴듯한 오답: 우산 = 비구름 호만 같고 손잡이·빗점이 다르면 통과)', () => {
    expect(confusablePairs([{ id: 'a', paths: umbrella }, { id: 'b', paths: umbrella }]).map(([x, y]) => [x, y])).toEqual([['a', 'b']]);
    expect(confusablePairs([{ id: 'umbrella', paths: umbrella }, { id: 'letter', paths: letter }, { id: 'kite', paths: kite }])).toEqual([]);
    expect(thumbDistance(rasterize(umbrella), rasterize(cloud))).toBeGreaterThan(0);
  });

  it('5×5 시트: 칸 순서대로 붙인다', () => {
    const t = [umbrella, letter, kite].map((p) => rasterize(p));
    const sheet = contactSheet(t, 5, 5);
    expect([sheet.w, sheet.h]).toEqual([320, 320]);
    expect(sheet.data[THUMB_PX + 32 * 320 + 32]).toBe(t[1]![32 * THUMB_PX + 32]);
  });
});
