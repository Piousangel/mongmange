// C14b 꿈 모티프 붓 형상 15 — 데이터 구조·결정성(D-13)·카드 위 자리·금지 규칙(1-1, R8·R9).
// 64px 구별은 motif-distinct.test.ts, 앱 렌더 픽셀은 apps/mobile test/skia/dream-motif-ink.test.tsx.
import { describe, expect, it } from 'vitest';
import {
  BRUSH,
  MOTIF_INK_COMPOSITION,
  MOTIF_INK_MAX,
  BLOB_INK_MAX,
  COMPANION,
  COMPANION_ROUNDNESS_MAX,
  companionBlob,
  roundness,
  MOTIF_NIGHT_INK,
  PALETTE,
  hexRgb,
  FRIEND_ADJ,
  FRIEND_FAR_MAX,
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
import { ART_REV_SHAPES_ARCHIVE } from '../src/sim/artRevArchive';

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
  it('래스터는 사물형 7장(+ 빌드 1의 창가 손·이불·찻잔·찻잔 둘은 앱 그릇)에만 — 9차: 손바닥은 판 1에서 손을 그리지 않는 코드판(잎에 고인 물), 상자는 그림 안, keep은 있는 경로 번호이고 금이 아닌 장 쪽 그림(획·문판)', () => {
    const rs = NEW.filter((m) => m.raster).map((m) => m.id).sort();
    expect(rs).toEqual(['far-alone.kite', 'far-alone.paper-boat', 'far-with.stepping-stones', 'near-alone.inkstone', 'near-alone.washing-line', 'near-with.letter', 'near-with.umbrella']);
    for (const m of NEW) {
      if (!m.raster) continue;
      const [x, y, w, h] = m.raster.box;
      expect(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 100 && y + h <= 100, m.id).toBe(true);
      for (const k of m.raster.keep) {
        expect(m.paths[k], m.id).toBeDefined();
        expect(m.paths[k]!.layer, m.id).not.toBe('gold');
      }
      // 장 조작은 래스터여도 코드(장의 반응)
      expect((m.field ?? []).length, m.id).toBeGreaterThan(0);
      const sc = buildDreamScene({ card: card(m.id), strokes: day7Records() });
      expect(sc.motifInk!.raster, m.id).toEqual(m.raster);
    }
  });
});

describe('블라인드 판정 반영(6차) — 기계 규칙', () => {
  it('두 번째 몽망이 금지: 몽망이에 맞닿지 않은 곁 방울(둥글고 검은 덩어리)은 몸의 0.3배까지 — 25모티프 × 구도 3 × 비율 2', () => {
    for (const m of sim.MOTIFS)
      for (const aspect of ['4:5', '9:16'] as const)
        for (const composition of [0, 1, 2] as const) {
          const sc = buildDreamScene({ card: card(m.id, { composition, artRev: 1 }), strokes: day7Records(), aspect });
          if (!sc.friend) continue;
          if (Math.hypot(sc.friend.x, sc.friend.y) > FRIEND_ADJ) expect(sc.friend.r, `${m.id} ${aspect} ${composition}`).toBeLessThanOrEqual(FRIEND_FAR_MAX);
        }
    expect(FRIEND_FAR_MAX).toBeLessThanOrEqual(0.3);
  });

  it('밤 먹 토큰: 밤 바탕(PALETTE.night.bg) 대비 7:1 이상의 밝은 은회색, 차가운 쪽(파랑 ≥ 빨강)', () => {
    const lin = (c: number) => {
      const v = c / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const L = (hex: string) => {
      const [r, g, b] = hexRgb(hex);
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const ratio = (L(MOTIF_NIGHT_INK) + 0.05) / (L(PALETTE.night.bg) + 0.05);
    expect(ratio).toBeGreaterThanOrEqual(7);
    const [r, , b] = hexRgb(MOTIF_NIGHT_INK);
    expect(b).toBeGreaterThanOrEqual(r);
  });

  it('64px 헷갈리던 쌍을 구도로 떼어 놓음: 바다↔손잡고 본 바다(몽망이가 바다 위/아래), 찻잔↔찻잔 둘(둘째 잔 자리), 벼루·징검다리·길(몽망이 자리가 서로 다름)', () => {
    const at = (id: string) => buildDreamScene({ card: card(id, { artRev: 1 }), strokes: day7Records() });
    expect(Math.sign(at('far-alone.sea').anchor.y)).not.toBe(Math.sign(at('far-with.sea-hand').anchor.y));
    expect(at('near-with.teacup-two').vessels).toHaveLength(2);
    const seats = ['near-alone.inkstone', 'far-with.stepping-stones', 'far-alone.path'].map((id) => sim.motifById(id)!.seat!);
    for (let i = 0; i < seats.length; i++)
      for (let j = i + 1; j < seats.length; j++) expect(Math.hypot(seats[i]![0] - seats[j]![0], seats[i]![1] - seats[j]![1])).toBeGreaterThan(20);
  });
});

describe('2차 블라인드 반영(7차) — 기계 규칙', () => {
  it('곁 방울은 몽망이와 재질로 갈린다: 담묵(몸 먹 45~60%) + 젖은 테 합쳐 0.6 이하, 붓 방울 꼴(원형도 0.94 미만, 시드 결정)', () => {
    expect(COMPANION.fill).toBeGreaterThanOrEqual(0.45);
    expect(COMPANION.fill).toBeLessThanOrEqual(COMPANION.total);
    expect(COMPANION.total).toBeLessThanOrEqual(BLOB_INK_MAX);
    expect(BLOB_INK_MAX).toBeLessThanOrEqual(0.6);
    for (const seed of [1, 7, 12345, 4242424242]) {
      const b = companionBlob(seed);
      expect(companionBlob(seed)).toEqual(b);
      expect(roundness(b), String(seed)).toBeLessThan(COMPANION_ROUNDNESS_MAX);
      // 9차: 몽망이(둥근 몸)와 다른 꼴 — 세로로 길고(높이 ≥ 폭 1.15배) 위가 뾰족하다(꼭대기 근처 폭이 가운데 폭의 35% 이하)
      const xs = b.filter((_, i) => i % 2 === 0);
      const ys = b.filter((_, i) => i % 2 === 1);
      const W = Math.max(...xs) - Math.min(...xs);
      const H = Math.max(...ys) - Math.min(...ys);
      expect(H / W, `${seed} 세로로 긴 물방울`).toBeGreaterThanOrEqual(1.15);
      const top = Math.min(...ys);
      const nearTop = xs.filter((_, i) => ys[i]! < top + H * 0.12);
      expect(Math.max(...nearTop) - Math.min(...nearTop), `${seed} 뾰족한 위`).toBeLessThanOrEqual(W * 0.35);
    }
    // 원형도 잣대 자체: 원 ≈ 1
    const circle = Array.from({ length: 96 }, (_, i) => [Math.cos((i / 48) * Math.PI), Math.sin((i / 48) * Math.PI)]).flat();
    expect(roundness(circle)).toBeGreaterThan(0.99);
  });

  it('몸 이외 덩어리 먹 상한: 판 1 장면의 맑지 않은 방울(고리 뒤 — 모티프·늦은 방울)은 0.6 이하 — 25모티프 × 구도 3', () => {
    for (const m of sim.MOTIFS)
      for (const composition of [0, 1, 2] as const) {
        const sc = buildDreamScene({ card: card(m.id, { composition, artRev: 1 }), strokes: day7Records() });
        for (const o of sc.post) if (o.k === 'drop' && !o.seat && !o.gold) expect(o.ink, `${m.id} ${composition}`).toBeLessThanOrEqual(BLOB_INK_MAX);
      }
  });

  it('사물 크기 하한(8차 — 블라인드 3회 모두 64px에서 사라짐): 새 15모티프의 사물(경로 + 장의 방울 + 래스터 상자) 경계 × 상자 배율(zoom)이 7차 하한의 1.3배(긴 변 58.5 이상·넓이 1521 이상), 사물 먹은 한 단계 진하게', () => {
    expect(WASH_FACE.toneBase).toBeGreaterThanOrEqual(0.36);
    for (const m of NEW) {
      let x0 = 100, y0 = 100, x1 = 0, y1 = 0;
      const add = (x: number, y: number, r = 0) => {
        x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r);
      };
      for (const p of m.paths) for (const l of flattenMotifPath(p.d)) for (const [x, y] of l) add(x, y, p.w / 2);
      for (const f of m.field ?? []) {
        if (f.k === 'drop') add(f.x, f.y, f.r);
        else if (f.k === 'tine') add(f.x, f.y); // 빗질·들어올림이 형상을 만드는 자리
      }
      if (m.raster) {
        const [bx, by, bw, bh] = m.raster.box;
        add(bx, by);
        add(bx + bw, by + bh);
      }
      const z = m.zoom ?? 1;
      expect(z, m.id).toBeLessThanOrEqual(1.5);
      expect(Math.max(x1 - x0, y1 - y0) * z, m.id).toBeGreaterThanOrEqual(45 * 1.3);
      expect((x1 - x0) * (y1 - y0) * z * z, m.id).toBeGreaterThanOrEqual(900 * 1.3 * 1.3);
    }
  });

  it('새싹은 좌우 대칭이 아니다(신체 연상 금지 — 2차 블라인드 안전): 경로·장 조작의 무게중심이 몸 축(x=50)에서 비켜 있고 들어올림이 기울어 있다', () => {
    const m = sim.motifById('near-alone.sprout')!;
    const lifts = m.field!.filter((f) => f.k === 'tine' && f.gauss);
    for (const f of lifts) if (f.k === 'tine') expect(Math.abs(f.dx), '들어올림 기울기').toBeGreaterThan(2);
    // 거울쌍 장 조작 금지(예전: x=40에서 좌우 ±7로 똑같이 끈 두 가닥 = 대칭 주름)
    const f = m.field!;
    for (let i = 0; i < f.length; i++)
      for (let j = i + 1; j < f.length; j++) {
        const a = f[i]!;
        const b = f[j]!;
        if (a.k === 'tine' && b.k === 'tine') expect(Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.dx + b.dx) < 1 && Math.abs(a.dy - b.dy) < 1, '거울쌍').toBe(false);
      }
    // 떡잎 둘의 길이가 다르다(20% 이상)
    const len = (d: string) => flattenMotifPath(d)[0]!.reduce((acc, p, k, arr) => (k ? acc + Math.hypot(p[0] - arr[k - 1]![0], p[1] - arr[k - 1]![1]) : 0), 0);
    const [l1, l2] = [len(m.paths[0]!.d), len(m.paths[1]!.d)];
    expect(Math.max(l1, l2) / Math.min(l1, l2)).toBeGreaterThan(1.2);
  });
});

describe('그림 판(artRev, 5차·6차 코드 리뷰 H1·M-2)', () => {
  const build1 = sim.MOTIFS.filter((m) => m.unlockAtCards === 0);
  const rev0Scenes = () =>
    hash(build1.flatMap((m) => (['4:5', '9:16'] as const).flatMap((aspect) => ([0, 1, 2] as const).map((composition) => buildDreamScene({ card: card(m.id, { composition }), strokes: day7Records(), aspect })))));

  it('판 0(꿈 콘텐츠 꺼짐 = 판 번호 없는 빌드 1 카드): 빌드 1 10모티프 장면이 고정값(main과 같음) — 판 키도 없다', () => {
    expect(rev0Scenes()).toBe(SCENE_SNAPSHOT_BY_REV[0]);
    for (const m of build1) expect('artRev' in buildDreamScene({ card: card(m.id), strokes: day7Records() }), m.id).toBe(false);
  });

  // 판 r 장면 = 그 판 번호를 단 카드(artRev: r)로 25모티프 × 구도 3 × 비율 2를 다시 계산한 해시(코드 확인 3차 낮음 — 형상 보관만으로는
  // 장면 코드 갈래(판 1 갈래를 판 2가 같이 쓰는 곳)의 변경을 못 잡는다). 판 0 = 판 번호 없는 빌드 1 카드
  const revScenes = (r: number) =>
    r === 0
      ? rev0Scenes()
      : hash(sim.MOTIFS.flatMap((m) => (['4:5', '9:16'] as const).flatMap((aspect) => ([0, 1, 2] as const).map((composition) => buildDreamScene({ card: card(m.id, { composition, artRev: r }), strokes: day7Records(), aspect })))));

  it('판마다 장면 해시를 artRev: r 카드로 다시 계산해 기록과 같다(0..지금 판) — 닫힌 판 장면이 바뀌면 실패, 열린 판만 값을 갱신한다', () => {
    for (let r = 0; r <= sim.DREAM_ART_REV; r++) expect(revScenes(r), `판 ${r}`).toBe(SCENE_SNAPSHOT_BY_REV[r]);
  }, 30000);

  it('지난 판 장면 해시를 모두 남긴다(0..지금 판), 지금 판의 형상 데이터 해시가 기록과 같다(형상을 바꾸면 판을 올려야 함)', () => {
    for (let r = 0; r <= sim.DREAM_ART_REV; r++) expect(SCENE_SNAPSHOT_BY_REV[r], `판 ${r}`).toBeDefined();
    const shapes = NEW.map((m) => ({ id: m.id, paths: m.paths, field: m.field, seat: m.seat, friend: m.friend, water: m.water, raster: m.raster, zoom: m.zoom }));
    expect(hash(shapes)).toBe(SHAPE_SNAPSHOT_BY_REV[sim.DREAM_ART_REV]);
  });

  it('판 보관(2차 ①): 판마다 형상 보관이 있고, 열린 판이면 지금 형상과 같다 — 닫힌 판은 보관·해시가 바뀌면 실패', () => {
    for (let r = 1; r <= sim.DREAM_ART_REV; r++) expect(ART_REV_SHAPES_ARCHIVE[r], `판 ${r}`).toBeDefined();
    const now = Object.fromEntries(NEW.map((m) => [m.id, { paths: m.paths, field: m.field, seat: m.seat, ...(m.friend ? { friend: m.friend } : {}), ...(m.water ? { water: m.water } : {}), ...(m.raster ? { raster: m.raster } : {}), ...(m.zoom ? { zoom: m.zoom } : {}) }]));
    expect(JSON.parse(JSON.stringify(ART_REV_SHAPES_ARCHIVE[sim.DREAM_ART_REV]))).toEqual(JSON.parse(JSON.stringify(now)));
    // 지난 판 카드는 보관 형상으로(지금은 판 1뿐이라 같은 값) — motifForRev 경로가 장면에 쓰인다
    expect(sim.motifForRev('far-alone.kite', 1)!.paths).toEqual(ART_REV_SHAPES_ARCHIVE[1]!['far-alone.kite']!.paths);
  });

  it('판 1 카드는 빌드 1 모티프도 C14b 그림(창가 손 = 창 그릇, 찻잔 둘·바다 손 새 구도), 판 0은 옛 그림', () => {
    const w0 = buildDreamScene({ card: card('near-with.window-hand'), strokes: day7Records() });
    const w1 = buildDreamScene({ card: card('near-with.window-hand', { artRev: 1 }), strokes: day7Records() });
    expect(w0.vessels).toEqual([]);
    expect(w1.vessels.map((v) => v.kind)).toEqual(['window']);
    expect(w1.artRev).toBe(1);
  });
});

describe('그림 판(artRev, 5차)', () => {
  it('지금 판의 장면 해시가 기록돼 있고, 판마다 래스터 목록이 있다(지금 판 = 래스터 사물 5장 + 창가 손)', () => {
    expect(Object.keys(SCENE_SNAPSHOT_BY_REV).map(Number)).toContain(sim.DREAM_ART_REV);
    for (let r = 1; r <= sim.DREAM_ART_REV; r++) expect(sim.ART_REV_RASTERS[r], `판 ${r}`).toBeDefined();
    const now = NEW.filter((m) => m.raster).map((m) => m.id);
    expect([...sim.ART_REV_RASTERS[sim.DREAM_ART_REV]!].sort()).toEqual([...now, 'near-with.window-hand', 'near-alone.quilt', 'near-alone.teacup', 'near-with.teacup-two'].sort());
  });

  it('카드 판: 판 번호 없는 빌드 1 카드 = 판 0(빌드 1 그림), 없는 새 모티프 카드 = 1, 이행은 새 모티프 카드에만 1을 적고 두 번 돌려도 같다', () => {
    expect(sim.dreamArtRevOf({ motifId: 'center.moon' })).toBe(0);
    expect(sim.dreamArtRevOf({ motifId: 'near-with.window-hand' })).toBe(0);
    expect(sim.dreamArtRevOf({ motifId: 'near-with.letter' })).toBe(1);
    expect(sim.dreamArtRevOf({ motifId: 'center.moon', artRev: 1 })).toBe(1);
    expect(sim.dreamArtRevOf({ motifId: 'center.moon', artRev: 3 })).toBe(3);
    expect(sim.dreamArtRevOf({ motifId: 'moon-12' })).toBe(0);
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
        const p = motifInkPlacement(m.seat!, composition, R, m.zoom ?? 1);
        expect(p.flip).toBe(composition === 1);
        expect(p.box.size).toBeCloseTo(MOTIF_INK_COMPOSITION[composition]!.size * R * (m.zoom ?? 1), 9);
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

  it('장 조작은 결 뒤·몽망이 자리 앞에 그대로 들어가고(자르기 0), 소리 없는 눈은 먹 대신 맑은 물방울 15개, 곁 방울은 맑은 자리 없음', () => {
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
    expect(clear).toHaveLength(15);
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
});

const RIBBON_SNAPSHOT = 'd84c4db4';
/**
 * 판(artRev)마다 장면 해시(코드 리뷰 M-2). 판 0 = 빌드 1의 10모티프 × 구도 3 × 비율 2 장면(main과 같음 — 판 번호 없는 카드),
 * 판 r ≥ 1 = 25모티프 전부를 `artRev: r` 카드로(구도 3 × 비율 2 — 빌드 1 모티프의 판 갈래 포함, 8차). **지난 판 값은 지우지 않는다** —
 * 닫힌 판(OPEN_ART_REV가 아닌 판)의 장면을 바꾸는 코드는 시험이 막는다. 새 그림은 판을 올리고 `rev >= 새 판` 갈래로 더한다
 */
const SCENE_SNAPSHOT_BY_REV: Record<number, string> = { 0: '4eeaf729', 1: '7414e0db' };
/** 판마다 형상 데이터 해시(경로·장·자리·래스터 상자·가림). 형상을 바꾸고 판을 안 올리면 실패 */
const SHAPE_SNAPSHOT_BY_REV: Record<number, string> = { 1: 'ea8c80f8' };
