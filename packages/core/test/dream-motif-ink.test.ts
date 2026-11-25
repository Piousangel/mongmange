// C14b 꿈 모티프 붓 형상 15 — 데이터 구조·결정성(D-13)·카드 위 자리·금지 규칙(1-1, R8·R9).
// 64px 구별은 motif-distinct.test.ts, 앱 렌더 픽셀은 apps/mobile test/skia/dream-motif-ink.test.tsx.
import { describe, expect, it } from 'vitest';
import {
  MOTIF_INK_COMPOSITION,
  RING_OFF,
  SEAT_MAX,
  buildDreamScene,
  day7Records,
  dreamCardLayout,
  flattenMotifPath,
  motifInkLayers,
  motifInkPlacement,
  sim,
  type DreamScene,
} from '../src/index';

const NEW = sim.MOTIFS.filter((m) => m.unlockAtCards > 0);
const card = (motifId: string, over: Partial<sim.DreamCard> = {}): sim.DreamCard => ({
  night: 7,
  motifId,
  composition: 0,
  inkTone: 0.5,
  flow: 0,
  flowSeed: 12345,
  strokeRef: null,
  nightsMerged: 1,
  ...over,
});
function hash(v: unknown): string {
  const json = JSON.stringify(v, (_k, x) => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x));
  let h = 2166136261;
  for (let i = 0; i < json.length; i++) h = Math.imul(h ^ json.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0');
}

describe('형상 데이터 구조(스키마 1 paths와 같은 꼴)', () => {
  it('새 15개 모두: 경로 1~64개, 굵기 0.1~8, 층 ink·wash·gold, 경로 글자는 명령·숫자만, 좌표는 그림 안(0..100)', () => {
    expect(NEW).toHaveLength(15);
    for (const m of NEW) {
      expect(m.paths.length, m.id).toBeGreaterThanOrEqual(1);
      expect(m.paths.length, m.id).toBeLessThanOrEqual(64);
      for (const p of m.paths) {
        expect(p.w, m.id).toBeGreaterThanOrEqual(0.1);
        expect(p.w, m.id).toBeLessThanOrEqual(8);
        expect(['ink', 'wash', 'gold']).toContain(p.layer);
        expect(p.d, m.id).toMatch(/^[MLHVCSQTAZmlhvcsqtaz0-9eE.,\s-]+$/);
        const lines = flattenMotifPath(p.d);
        expect(lines.length, `${m.id} ${p.d}`).toBeGreaterThan(0);
        for (const l of lines)
          for (const [x, y] of l) {
            expect(x, m.id).toBeGreaterThanOrEqual(0);
            expect(x, m.id).toBeLessThanOrEqual(100);
            expect(y, m.id).toBeGreaterThanOrEqual(0);
            expect(y, m.id).toBeLessThanOrEqual(100);
          }
      }
      const [sx, sy] = m.seat!;
      expect(sx >= 0 && sx <= 100 && sy >= 0 && sy <= 100, m.id).toBe(true);
    }
  });

  it('금(gold)은 은하수 다리의 금점뿐(아트 4절 — 금은 머리카락 선 장식, 기존 별과 물방울과 같은 쓰임). 붉은 층 없음', () => {
    const gold = NEW.filter((m) => m.paths.some((p) => p.layer === 'gold')).map((m) => m.id);
    expect(gold).toEqual(['far-with.star-bridge']);
  });

  it('곁의 다른 방울은 with 구역의 우산·은하수 다리·징검다리만, 몸 배율은 몽망이보다 작다(눈 없는 방울)', () => {
    const fr = NEW.filter((m) => m.friend).map((m) => m.id);
    expect(fr).toEqual(['near-with.umbrella', 'far-with.star-bridge', 'far-with.stepping-stones']);
    for (const m of NEW) if (m.friend) expect(m.friend[2]).toBeLessThan(1);
  });

  it('몽망이 자리는 먹 획에서 떨어져 있다(몸이 그림 선에 박히지 않게 — 오목한 손·우산 아래·길 입구 포함, 그림 좌표 7 이상)', () => {
    for (const m of NEW) {
      if (m.water === 'clear') continue;
      let near = Infinity;
      for (const p of m.paths)
        if (p.layer === 'ink')
          for (const l of flattenMotifPath(p.d)) for (const [x, y] of l) near = Math.min(near, Math.hypot(x - m.seat![0], y - m.seat![1]) - p.w / 2);
      expect(near, m.id).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('붓 리본 — 결정성(D-13)', () => {
  it('같은 경로 → 같은 리본(두 번·깊은 복제 입력), 15개 리본 해시 고정', () => {
    const got: Record<string, string> = {};
    for (const m of NEW) {
      const a = motifInkLayers(m.paths);
      expect(motifInkLayers(JSON.parse(JSON.stringify(m.paths)))).toEqual(a);
      got[m.id] = hash(a);
    }
    expect(hash(got)).toBe(RIBBON_SNAPSHOT);
  });

  it('붓 폭: 돈필(시작이 끝보다 굵다)·수필(끝이 가늘다), 층 순서 = 담묵 → 먹 → 금', () => {
    const layers = motifInkLayers([{ d: 'M10 50 L90 50', w: 4, layer: 'ink' }]);
    const rb = layers[0]!.ribbons[0]!;
    // 앞 4n개 = 점마다 [왼쪽 x,y, 오른쪽 x,y], 그 뒤 = 둥근 캡 둘(중심 + 9점씩 = 20점)
    const n = (rb.positions.length - 40) / 4;
    const width = (i: number) => Math.hypot(rb.positions[4 * i]! - rb.positions[4 * i + 2]!, rb.positions[4 * i + 1]! - rb.positions[4 * i + 3]!);
    expect(width(0)).toBeCloseTo(4 * 0.72, 6);
    expect(width(Math.floor(n / 2))).toBeCloseTo(4, 1);
    expect(width(n - 1)).toBeCloseTo(4 * 0.38, 6);
    const order = motifInkLayers(sim.motifById('far-with.star-bridge')!.paths).map((l) => l.layer);
    expect(order).toEqual(['wash', 'ink', 'gold']);
  });
});

describe('카드 위 자리(구도 a·b·c × 비율 2)', () => {
  const scenes = (id: string) =>
    (['4:5', '9:16'] as const).flatMap((aspect) => ([0, 1, 2] as const).map((composition) => ({ aspect, composition, sc: buildDreamScene({ card: card(id, { composition }), strokes: day7Records(), aspect }) })));

  it('몽망이 중심은 인화 중심에서 0.6R 안, 그림 상자는 몽망이 자리를 품고, b는 좌우 뒤집힌다', () => {
    for (const m of NEW)
      for (const { aspect, composition, sc } of scenes(m.id)) {
        const R = dreamCardLayout(aspect).print.r;
        expect(Math.hypot(sc.anchor.x, sc.anchor.y), `${m.id} ${aspect} ${composition}`).toBeLessThanOrEqual(SEAT_MAX * R + 1e-9);
        const p = motifInkPlacement(m.seat!, composition, R);
        expect(p.flip).toBe(composition === 1);
        expect(p.box.size).toBeCloseTo(MOTIF_INK_COMPOSITION[composition]!.size * R, 9);
        expect(p.box.x <= 0 && p.box.x + p.box.size >= 0 && p.box.y <= 0 && p.box.y + p.box.size >= 0, m.id).toBe(true);
        if (m.water !== 'clear') expect(sc.motifInk, m.id).toEqual({ ...p.box, flip: p.flip, paths: m.paths });
      }
  });

  it('고리 중심은 인화 정가운데가 아니고(RING_OFF·R), 몽망이에서도 그보다 멀다(눈동자·과녁 금지)', () => {
    for (const m of NEW)
      for (const { aspect, sc } of scenes(m.id)) {
        const R = dreamCardLayout(aspect).print.r;
        // 인화 중심(c0 기준) = −anchor
        expect(Math.hypot(sc.ringC.x + sc.anchor.x, sc.ringC.y + sc.anchor.y), m.id).toBeCloseTo(RING_OFF * R, 9);
        expect(Math.hypot(sc.ringC.x, sc.ringC.y), m.id).toBeGreaterThanOrEqual(RING_OFF * R);
      }
  });

  it('소리 없는 눈은 먹 대신 맑은 물방울(금 없음) 12개, 곁 방울 모티프는 friend(맑은 자리 없음 — 두 눈 읽힘 금지)', () => {
    const snow = buildDreamScene({ card: card('center.snow'), strokes: day7Records() });
    expect(snow.motifInk).toBeUndefined();
    const seatAt = snow.post.findIndex((o) => o.k === 'drop' && o.seat);
    const clear = snow.post.slice(seatAt + 1).filter((o) => o.k === 'drop' && o.ink === 0 && !o.gold);
    expect(clear).toHaveLength(12);
    for (const id of ['near-with.umbrella', 'far-with.star-bridge', 'far-with.stepping-stones']) {
      const sc = buildDreamScene({ card: card(id), strokes: day7Records() });
      expect(sc.friend, id).not.toBeNull();
      expect(sc.post.filter((o) => o.k === 'drop' && o.ink === 0 && !o.seat), id).toEqual([]);
    }
  });

  it('R8·R9: 몸(폭·핵 크기·몽망이 자리 반경)은 모티프와 무관하다 — 붓 형상이 몸을 키우거나 줄이지 않는다', () => {
    const body = (sc: DreamScene) => [sc.body, sc.pool];
    const ref = body(buildDreamScene({ card: card('center.moon'), strokes: day7Records() }));
    for (const m of NEW) for (const c of [0, 1, 2] as const) expect(body(buildDreamScene({ card: card(m.id, { composition: c }), strokes: day7Records() })), m.id).toEqual(ref);
  });

  it('빌드 1의 10개 장면에는 붓 형상 키 자체가 없다(장면 해시 그대로)', () => {
    for (const m of sim.MOTIFS.filter((x) => x.unlockAtCards === 0)) expect('motifInk' in buildDreamScene({ card: card(m.id), strokes: day7Records() }), m.id).toBe(false);
  });

  it('새 15개 장면 해시 고정(구도 a, 4:5) — 형상·자리·고리가 바뀌면 실패: 의도한 변경이면 값을 갱신하고 docs/app/c14b 시트를 다시 본다', () => {
    const got = Object.fromEntries(NEW.map((m) => [m.id, hash(buildDreamScene({ card: card(m.id), strokes: day7Records() }))]));
    expect(hash(got)).toBe(SCENE_SNAPSHOT);
  });
});

const RIBBON_SNAPSHOT = '6e45662b';
const SCENE_SNAPSHOT = 'e437a63e';
