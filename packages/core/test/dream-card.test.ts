import { describe, expect, it } from 'vitest';
import { DREAM_LIMITS, DREAM_TEMPERS, buildDreamScene, day7ClumsyRecords, day7Records, dreamCardSeed, dreamMotifShape, sim, type DreamScene } from '../src/index';

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

/** 장면 전체(조작 열·자리·그릇)의 FNV-1a 해시 — 소수 6자리로 반올림해 플랫폼 차이를 줄인다 */
function sceneHash(sc: DreamScene): string {
  const json = JSON.stringify(sc, (_k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v));
  let h = 2166136261;
  for (let i = 0; i < json.length; i++) h = Math.imul(h ^ json.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0');
}

describe('꿈 인화 카드 장면 — 스냅샷(문법이 바뀌면 실패: 의도한 변경이면 값을 갱신하고 그리드를 다시 본다)', () => {
  it('고정 입력 3개의 시드·장면 해시', () => {
    const got = {
      moon: [dreamCardSeed(card('center.moon'), day7Records()), sceneHash(buildDreamScene({ card: card('center.moon'), strokes: day7Records() }))],
      quilt916: sceneHash(buildDreamScene({ card: card('near-alone.quilt', { ...DREAM_TEMPERS.a, composition: 1 }), strokes: day7ClumsyRecords(), aspect: '9:16' })),
      empty: sceneHash(buildDreamScene({ card: card('center.rain', DREAM_TEMPERS.c), strokes: [] })),
    };
    expect(got).toEqual(SNAPSHOT);
  });

  it('입력을 깊은 복제해도(다른 객체) 같은 장면', () => {
    const recs = day7Records();
    const clone = JSON.parse(JSON.stringify(recs));
    expect(sceneHash(buildDreamScene({ card: card('center.moon'), strokes: clone }))).toBe(sceneHash(buildDreamScene({ card: card('center.moon'), strokes: recs })));
  });

  it('세이브 내용 어느 필드가 바뀌어도 시드가 바뀐다', () => {
    const base = dreamCardSeed(card('center.moon'), day7Records());
    const variants: Partial<sim.DreamCard>[] = [{ night: 8 }, { inkTone: 0.51 }, { flow: 0.01 }, { flowSeed: 12346 }, { composition: 1 }, { motifId: 'center.rain' }, { nightsMerged: 2 }];
    for (const v of variants) expect(dreamCardSeed(card('center.moon', v), day7Records())).not.toBe(base);
    expect(dreamCardSeed(card('center.moon'), day7ClumsyRecords())).not.toBe(base);
    const moved = day7Records();
    moved[0]!.raw[3] = { ...moved[0]!.raw[3]!, x: moved[0]!.raw[3]!.x + 0.002 };
    expect(dreamCardSeed(card('center.moon'), moved)).not.toBe(base);
  });
});

describe('uniform 상한 — 자르기가 일어나면 실패', () => {
  it('모티프 25(형상 없는 15는 제품 = 형상 없음) × 성향 3 × 비율 2 × 손 3(기준·서툰·빈)에서 자르기 0', () => {
    for (const m of sim.MOTIFS)
      for (const t of Object.values(DREAM_TEMPERS))
        for (const aspect of ['4:5', '9:16'] as const)
          for (const strokes of [day7Records(), day7ClumsyRecords(), []])
            for (const composition of [0, 1, 2] as const) {
              const sc = buildDreamScene({ card: card(m.id, { ...t, composition }), strokes, aspect });
              expect({ m: m.id, trimmed: sc.trimmed }).toEqual({ m: m.id, trimmed: 0 });
              expect(sc.pre.length).toBeLessThanOrEqual(DREAM_LIMITS.pre);
              expect(sc.post.length).toBeLessThanOrEqual(DREAM_LIMITS.post);
              expect(sc.segs.length).toBeLessThanOrEqual(DREAM_LIMITS.segs);
            }
  }, 30000); // 무거운 전수 시험 — 기계가 바쁠 때(다른 작업 병렬) 기본 5초를 넘는 일이 있어 넉넉히(C14b, 바꾸기 전 코드에서도 같게 걸림)

  it('상한을 억지로 낮추면 자르기를 보고하고, 가장 바깥 고리(첫 방울)는 남는다', () => {
    const input = { card: card('far-with.stars-drops'), strokes: day7Records() };
    const full = buildDreamScene(input);
    const tight = buildDreamScene({ ...input, limits: { pre: 10, post: 12, segs: 8 } });
    expect(tight.trimmed).toBeGreaterThan(0);
    expect(tight.pre[0]).toEqual(full.pre[0]);
    expect(tight.pre.length).toBeLessThanOrEqual(10);
    expect(tight.post.length).toBeLessThanOrEqual(12);
    // 몽망이 자리(빈 물)는 끝까지 남는다
    expect(tight.post.some((o) => o.k === 'drop' && o.seat)).toBe(true);
  });

  it('모티프 구성(조작 종류 열·그릇)이 마블링 절차 형상 10개 모두 다르다(C14b 15개는 붓 경로 — 아래 절)', () => {
    const shaped = sim.MOTIFS.filter((m) => m.paths.length === 0);
    expect(shaped).toHaveLength(10);
    const sigs = new Set(shaped.map((m) => {
      const sc = buildDreamScene({ card: card(m.id), strokes: day7Records() });
      return `${sc.pre.concat(sc.post).map((o) => o.k).join(',')}|${sc.vessels.map((v) => v.kind).join(',')}|${sc.friend ? 'f' : ''}`;
    }));
    expect(sigs.size).toBe(10);
  });

  it('몽망이는 고리 한가운데에 있지 않다(눈동자·과녁 금지)', () => {
    for (const m of sim.MOTIFS) {
      const sc = buildDreamScene({ card: card(m.id), strokes: day7Records() });
      expect(Math.hypot(sc.ringC.x, sc.ringC.y)).toBeGreaterThan(0.06);
    }
  });
});

// 11-20 v1.2: quilt916 갱신 — 서툰 손 6번(앞 위 지그재그)이 미끄러짐 비용(attach SLIDE_DRIFT_W)으로 자리가 바뀜. 의도한 변경
const SNAPSHOT = { moon: [3914316475, '2d519a11'], quilt916: '37769e1e', empty: '8487e6ad' };

// C6 리뷰 I2: 세이브에 이미 있는 미완 모티프 카드(개발 빌드 세이브·원격 앞당김 뒤 형상 제거 등)는 그리기 규칙만이 막는다.
// C14b 뒤 25개는 모두 형상이 있어 미완은 보름 번들(자리표시)과 표에 없는 자리표시 모티프뿐이다
describe('제품 빌드의 미완 모티프 = 형상 없는 일반 카드(plain)', () => {
  const goldInPost = (sc: DreamScene) => sc.post.filter((o) => o.k === 'drop' && (o as { gold?: boolean }).gold).length;

  it('표의 25개는 모두 자기 형상 id로 그린다(제품·개발 같음 — 자리표시 0)', () => {
    // 표(MOTIFS)에는 이제 자리표시가 없다 — 규칙은 dreamMotifShape가 표를 읽는 그대로 둔다
    expect(sim.MOTIFS.filter((m) => m.placeholder)).toEqual([]);
    for (const m of sim.MOTIFS) {
      expect(dreamMotifShape(m.id, false), m.id).toBe(m.id);
      expect(dreamMotifShape(m.id, true), m.id).toBe(m.id);
    }
  });

  it('미완 보름 번들은 제품 빌드에서 plain — 달(결 뒤 맑은 방울 + 금박 테)이 없다', () => {
    expect(goldInPost(buildDreamScene({ card: card('center.moon'), strokes: day7Records() }))).toBeGreaterThan(0);
    const sc = buildDreamScene({ card: card('moon-12'), strokes: day7Records() });
    expect(sc.motifId).toBe('plain');
    expect(goldInPost(sc)).toBe(0);
    expect(sc.motifInk).toBeUndefined();
  });
});
