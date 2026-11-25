// C14b 꿈 모티프 붓 형상 15 — 데이터 구조·결정성(D-13)·카드 위 자리·금지 규칙(1-1, R8·R9).
// 64px 구별은 motif-distinct.test.ts, 앱 렌더 픽셀은 apps/mobile test/skia/dream-motif-ink.test.tsx.
import { describe, expect, it } from 'vitest';
import {
  BRUSH,
  MOTIF_INK_COMPOSITION,
  MOTIF_INK_MAX,
  WASH_FACE,
  brushProfile,
  isClosedLine,
  pathSeed,
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

describe('4차 혼합안 — 사물 한 겹 래스터 자리', () => {
  it('래스터는 사물형 5장(+ 기존 창가 손은 앱 그릇)에만, 상자는 그림 안, keep은 있는 경로 번호이고 먹 획만(장 쪽 획)', () => {
    const rs = NEW.filter((m) => m.raster).map((m) => m.id).sort();
    expect(rs).toEqual(['far-alone.kite', 'far-alone.paper-boat', 'near-with.letter', 'near-with.palm', 'near-with.umbrella']);
    for (const m of NEW) {
      if (!m.raster) continue;
      const [x, y, w, h] = m.raster.box;
      expect(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 100 && y + h <= 100, m.id).toBe(true);
      for (const k of m.raster.keep) {
        expect(m.paths[k], m.id).toBeDefined();
        expect(m.paths[k]!.layer, m.id).toBe('ink');
      }
      // 장 조작은 래스터여도 코드(장의 반응)
      expect((m.field ?? []).length, m.id).toBeGreaterThan(0);
      const sc = buildDreamScene({ card: card(m.id), strokes: day7Records() });
      expect(sc.motifInk!.raster, m.id).toEqual(m.raster);
    }
  });
});

describe('그림 판(artRev, 5차)', () => {
  it('지금 판의 장면 해시가 기록돼 있고, 판마다 래스터 목록이 있다(지금 판 = 래스터 사물 5장 + 창가 손)', () => {
    expect(Object.keys(SCENE_SNAPSHOT_BY_REV).map(Number)).toContain(sim.DREAM_ART_REV);
    for (let r = 1; r <= sim.DREAM_ART_REV; r++) expect(sim.ART_REV_RASTERS[r], `판 ${r}`).toBeDefined();
    const now = NEW.filter((m) => m.raster).map((m) => m.id);
    expect([...sim.ART_REV_RASTERS[sim.DREAM_ART_REV]!].sort()).toEqual([...now, 'near-with.window-hand'].sort());
  });

  it('카드 판: 없으면 1판, 이행은 새 모티프 카드에만 1을 적고(빌드 1·보름 카드 그대로) 두 번 돌려도 같다', () => {
    expect(sim.cardArtRev({})).toBe(1);
    expect(sim.cardArtRev({ artRev: 3 })).toBe(3);
    const cards = [card('center.moon'), card('near-with.letter'), card('moon-12'), card('far-alone.kite', { artRev: 2 })];
    const once = sim.withArtRev(cards);
    expect(once.map((c) => c.artRev)).toEqual([undefined, 1, undefined, 2]);
    expect('artRev' in once[0]!).toBe(false);
    expect(sim.withArtRev(once)).toEqual(once);
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

  it('붓 폭(7-6 ③ 굵기 한 가지 금지): 돈필 0.55 → 배 1.15 → 수필 0.25, 곡선에서 얇아짐 — 담묵은 덜 빠진다', () => {
    expect(brushProfile(0)).toBeCloseTo(BRUSH.head, 9);
    expect(brushProfile(BRUSH.bellyAt)).toBeCloseTo(BRUSH.belly, 9);
    expect(brushProfile(1)).toBeCloseTo(BRUSH.tailMin, 9);
    // 가장 굵은 곳 / 가장 가는 곳 ≥ 4배 — 균일한 모노라인이 아니다
    const ws = Array.from({ length: 101 }, (_, i) => brushProfile(i / 100));
    expect(Math.max(...ws) / Math.min(...ws)).toBeGreaterThanOrEqual(4);
  });

  it('비백: 긴 먹 획은 끝에서 가닥으로 갈라지고, 가닥 무늬는 경로 해시로 결정된다(같은 경로 = 같은 갈라짐, 다른 경로 = 다름)', () => {
    const one = (d: string) => motifInkLayers([{ d, w: 4, layer: 'ink' }])[0]!;
    const a = one('M10 50 L90 50');
    expect(a.ribbons.length).toBeGreaterThan(BRUSH.lanes); // 가닥 5 + 끊긴 조각
    expect(one('M10 50 L90 50')).toEqual(a);
    expect(hash(one('M10 50 L90 51').ribbons.map((r) => r.positions.length))).not.toBe(hash(a.ribbons.map((r) => r.positions.length)));
    // 가닥 끝(x 최댓값)이 서로 다르다 = 끝이 갈라진다. 가운데 가닥만 끝까지 간다
    const ends = a.ribbons.map((r) => Math.max(...r.positions.filter((_, i) => i % 2 === 0)));
    expect(new Set(ends.map((x) => Math.round(x))).size).toBeGreaterThanOrEqual(3);
    expect(Math.max(...ends)).toBeGreaterThan(89);
    // 담묵·점은 갈라지지 않는다
    expect(motifInkLayers([{ d: 'M10 50 L90 50', w: 4, layer: 'wash' }])[0]!.ribbons).toHaveLength(1);
    expect(pathSeed('M10 50 L90 50', 4)).toBe(pathSeed('M10 50 L90 50', 4));
  });

  it('번짐 한 겹 = 같은 획 폭 1.6배, 담묵 닫힌 경로 = 면(외곽선 획이 아니라 칠 + 젖은 테)', () => {
    const l = motifInkLayers([{ d: 'M10 50 L90 50', w: 4, layer: 'ink' }])[0]!;
    expect(l.bleed).toHaveLength(1);
    const width0 = (r: { positions: number[] }) => Math.hypot(r.positions[0]! - r.positions[2]!, r.positions[1]! - r.positions[3]!);
    expect(width0(l.bleed[0]!)).toBeCloseTo(4 * BRUSH.head * 1.6, 6);
    const f = motifInkLayers([{ d: 'M10 10 L60 10 L60 60 Z', w: 2, layer: 'wash' }])[0]!;
    expect(f.faces).toHaveLength(1);
    expect(f.ribbons).toHaveLength(0);
    const order = motifInkLayers([
      { d: 'M0 0 L9 9', w: 1, layer: 'gold' },
      { d: 'M0 0 L9 9', w: 1, layer: 'ink' },
      { d: 'M0 0 L9 9', w: 1, layer: 'wash' },
    ]).map((x) => x.layer);
    expect(order).toEqual(['wash', 'ink', 'gold']);
  });

  it('담묵 면(3차): 곧은 변을 경로 해시로 흔든다(같은 경로 = 같은 흔들림), 농담 = w, 칠 시작 꼭짓점 → 가장 먼 점, 한 경로의 모양은 한 묶음', () => {
    const sq = (d: string) => motifInkLayers([{ d, w: 2, layer: 'wash' }])[0]!.faces;
    const a = sq('M10 10 L60 10 L60 60 L10 60 Z')[0]!;
    expect(sq('M10 10 L60 10 L60 60 L10 60 Z')[0]).toEqual(a);
    // 위 변(y = 10) 위의 점들이 한 줄로 곧지 않다
    const top = [];
    for (let i = 0; i < a.poly.length; i += 2) if (Math.abs(a.poly[i + 1]! - 10) < WASH_FACE.wobble + 0.01 && a.poly[i]! > 15 && a.poly[i]! < 55) top.push(a.poly[i + 1]!);
    expect(Math.max(...top) - Math.min(...top)).toBeGreaterThan(0.2);
    expect(Math.max(...top.map((y) => Math.abs(y - 10)))).toBeLessThanOrEqual(WASH_FACE.wobble + 1e-9);
    expect(a.tone).toBeCloseTo(WASH_FACE.toneBase + 2 * WASH_FACE.toneStep, 9);
    expect(a.from).toEqual([10, 10]);
    expect(Math.hypot(a.to[0] - 60, a.to[1] - 60)).toBeLessThan(1);
    const two = motifInkLayers([{ d: 'M0 0 L9 0 L9 9 Z M20 0 L29 0 L29 9 Z', w: 1, layer: 'wash' }])[0]!.faces;
    expect(two.map((x) => x.group)).toEqual([0, 0]);
    // 가장 짙은 면(w 4)의 젖은 테도 먹 상한 아래
    expect((WASH_FACE.toneBase + 4 * WASH_FACE.toneStep) * WASH_FACE.rimDark).toBeLessThanOrEqual(MOTIF_INK_MAX);
  });
});

describe('아트 바이블 7-6 꿈 모티프 그리는 법 — 기계로 잡는 규칙', () => {
  it('② 먹 농도 위계: 모티프 먹 상한은 몸 먹의 0.70~0.75(순흑은 몽망이 몸만), 장 조작의 먹 방울도 그 아래', () => {
    expect(MOTIF_INK_MAX).toBeGreaterThanOrEqual(0.7);
    expect(MOTIF_INK_MAX).toBeLessThanOrEqual(0.75);
    for (const m of NEW) for (const f of m.field ?? []) if (f.k === 'drop') expect(f.ink, m.id).toBeLessThanOrEqual(MOTIF_INK_MAX);
  });

  it('④ 닫힌 기하 도형 금지: 먹·금 경로는 하나도 닫히지 않는다(닫힌 모양은 담묵 면만) — 닫힌 먹 경로 비율 0', () => {
    for (const m of NEW)
      for (const p of m.paths) {
        if (p.layer === 'wash') continue;
        for (const l of flattenMotifPath(p.d)) expect(isClosedLine(l), `${m.id} ${p.d}`).toBe(false);
      }
  });

  it('겹침 이음매 금지(2차 리뷰 2-1 3): 한 모티프의 서로 다른 담묵 면 경로는 겹치지 않는다(한 경로 안 모양은 렌더가 합쳐 칠함)', () => {
    const inside = (x: number, y: number, poly: readonly number[]) => {
      let c = false;
      for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
        const [xi, yi, xj, yj] = [poly[i]!, poly[i + 1]!, poly[j]!, poly[j + 1]!];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    for (const m of NEW) {
      const faces = motifInkLayers(m.paths).flatMap((l) => l.faces);
      let both = 0;
      for (let y = 0.25; y < 100; y += 0.5)
        for (let x = 0.25; x < 100; x += 0.5) {
          const gs = new Set(faces.filter((f) => inside(x, y, f.poly)).map((f) => f.group));
          if (gs.size > 1) both++;
        }
      expect(both, m.id).toBe(0);
    }
  });

  it('① 표현 순서·⑤ 장의 반응 의무: 모든 모티프가 장 조작(field)을 1개 이상 갖고, 장 또는 담묵 면이 있다(획만으로 된 모티프 없음)', () => {
    for (const m of NEW) {
      expect((m.field ?? []).length, m.id).toBeGreaterThan(0);
      // 장 조작은 그림 안(그림 상자 0..100)에 건다 — 형상 곁에서 띠가 반응한다
      for (const f of m.field!) expect(f.x >= 0 && f.x <= 100 && f.y >= 0 && f.y <= 100, m.id).toBe(true);
    }
  });

  it('⑧ 규칙 간격 점열·같은 크기 반복 도장 금지: 점이 3개 이상인 모티프는 점 크기가 여러 가지이고 이웃 간격이 고르지 않다', () => {
    for (const m of NEW) {
      const dots = m.paths.flatMap((p) => flattenMotifPath(p.d).filter((l) => l.length === 2 && Math.hypot(l[1]![0] - l[0]![0], l[1]![1] - l[0]![1]) < 0.5).map((l) => ({ x: l[0]![0], y: l[0]![1], w: p.w })));
      if (dots.length < 3) continue;
      expect(new Set(dots.map((d) => d.w)).size, m.id).toBeGreaterThanOrEqual(2);
      const gaps = dots.slice(1).map((d, i) => Math.hypot(d.x - dots[i]!.x, d.y - dots[i]!.y));
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const cv = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length) / mean;
      expect(cv, m.id).toBeGreaterThan(0.15);
    }
    // 기러기: ㅅ자 크기가 여러 가지(원근), 앞(먹)과 뒤(담묵) 두 농담
    const geese = sim.motifById('far-with.geese')!;
    expect(new Set(geese.paths.map((p) => p.layer))).toEqual(new Set(['ink', 'wash']));
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
        if (m.water !== 'clear') expect(sc.motifInk, m.id).toEqual({ ...p.box, flip: p.flip, paths: m.paths, ...(m.raster ? { raster: m.raster } : {}) });
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

  it('장 조작은 결 뒤·몽망이 자리 앞에 그대로 들어가고(자르기 0), 소리 없는 눈은 먹 대신 맑은 물방울 14개, 곁 방울은 맑은 자리 없음', () => {
    for (const m of NEW) {
      const sc = buildDreamScene({ card: card(m.id), strokes: day7Records() });
      const seatAt = sc.post.findIndex((o) => o.k === 'drop' && o.seat);
      expect(sc.trimmed, m.id).toBe(0);
      const kinds = sc.post.slice(0, seatAt).map((o) => o.k).join(',');
      expect(kinds.endsWith(m.field!.map((f) => f.k).join(',')), m.id).toBe(true);
    }
    const snow = buildDreamScene({ card: card('center.snow'), strokes: day7Records() });
    expect(snow.motifInk).toBeUndefined();
    const seatAt = snow.post.findIndex((o) => o.k === 'drop' && o.seat);
    const clear = snow.post.slice(0, seatAt).filter((o) => o.k === 'drop' && o.ink === 0 && !o.gold);
    expect(clear).toHaveLength(14);
    for (const id of ['near-with.umbrella', 'far-with.star-bridge', 'far-with.stepping-stones']) {
      const sc = buildDreamScene({ card: card(id), strokes: day7Records() });
      expect(sc.friend, id).not.toBeNull();
      const seatAt = sc.post.findIndex((o) => o.k === 'drop' && o.seat);
      expect(sc.post.slice(seatAt + 1).filter((o) => o.k === 'drop' && o.ink === 0), id).toEqual([]);
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

const RIBBON_SNAPSHOT = 'e5cdfc8f';
/** 판(artRev)마다 장면 해시 — 형상을 바꾸면 판을 올리고 이전 판 값은 남긴다(이전 판 형상 데이터도 함께 남겨야 한다) */
const SCENE_SNAPSHOT_BY_REV: Record<number, string> = { 1: 'b2a4bb72' };
const SCENE_SNAPSHOT = SCENE_SNAPSHOT_BY_REV[sim.DREAM_ART_REV]!;
