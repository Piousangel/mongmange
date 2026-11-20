// M1 타고남 + 먹 토큰(C-integrated v1.1 2-1, 아트 1-1·4-1 v1.3, D-12·D-20 개정).
// ① 분포: 48칸(체형 3 × 빗 모양 4 × 씨앗 먹 4)이 고르다 — B 시뮬(3,000명, 엔트로피 5.57/5.58, 칸별 1.5~2.6%)과 같은 조건으로 비교
// ② 골든: 씨앗 → 타고남·씨앗 먹이 버전 1 규칙에서 바뀌지 않는다(바뀌면 세이브의 아이가 다른 아이가 된다)
// ③ 형태: 세 체형·네 빗 모양이 아트 1-1 허용 범위·1-4 금지표 안
// ④ 먹 토큰: OKLab 거리 ≥ 0.044, 대비(D-08), 단조 순서
import { describe, expect, it } from 'vitest';
import {
  BASE_INK_LOOK,
  BASE_LOOK,
  BASE_SHAPE,
  BODY_ASPECTS,
  BODY,
  COMB,
  COMB_SHAPES,
  CORE,
  FORBIDDEN_ZONES,
  GRAMMARS,
  INK_TOKENS,
  PALETTE,
  angleOf,
  attachStroke,
  buildDreamScene,
  combRootThetas,
  combStrands,
  COMB_REST,
  coreScale,
  coreSdf,
  coreRadius1,
  crownRadius,
  day7ClumsyRecords,
  day7Records,
  eyeCenters,
  inkLook,
  isForbiddenNow,
  lookOf,
  makeRecord,
  seedCell,
  shapeOf,
  strokeInkOf,
  strokeSpine,
  traitsOf,
  sim,
  type BodyShape,
  type Traits,
} from '../src/index';

const DEG = Math.PI / 180;

/** B 시뮬과 같은 xorshift 대신 mulberry32(B-identity-sim.mjs rng와 같은 식) */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 첫 탭 n번: 탭은 화면 가운데에 몰리고(±0.3W·±0.4W), 설치 시각은 하루 안, 보안 난수 32비트 */
function births(n: number, seed: number): number[] {
  const r = rng(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const installAt = Date.UTC(2026, 11, 1) + Math.floor(r() * 86_400_000);
    out.push(
      sim.birthSeedOf({ x: (r() - 0.5) * 0.6, y: (r() - 0.5) * 0.8, ms: installAt + 9000 + Math.floor(r() * 20_000), installAt, entropy: Math.floor(r() * 4294967296) }),
    );
  }
  return out;
}

function counts(cells: number[], k: number): number[] {
  const c = new Array(k).fill(0);
  for (const v of cells) c[v]++;
  return c;
}
const entropy = (c: number[]) => {
  const n = c.reduce((a, b) => a + b, 0);
  return -c.reduce((a, v) => (v ? a + (v / n) * Math.log2(v / n) : a), 0);
};
const chi2 = (c: number[]) => {
  const n = c.reduce((a, b) => a + b, 0);
  const e = n / c.length;
  return c.reduce((a, v) => a + ((v - e) * (v - e)) / e, 0);
};

describe('① 48칸 분포(B 시뮬과 비교)', () => {
  it('3,000명: 엔트로피 ≥ 5.55/5.58, 칸별 1.3~3.0% (B: 5.57, 1.5~2.6%, 기대 2.08%)', () => {
    const c = counts(births(3000, 7).map(seedCell), 48);
    const H = entropy(c);
    const pct = c.map((v) => (v / 3000) * 100);
    // 실측(이 시드): 보고서에 옮긴다
    console.log(`48칸 3000명: 엔트로피 ${H.toFixed(3)}/${Math.log2(48).toFixed(3)}, 최소 ${Math.min(...pct).toFixed(2)}%, 최대 ${Math.max(...pct).toFixed(2)}%`);
    expect(H).toBeGreaterThanOrEqual(5.55);
    expect(Math.min(...pct)).toBeGreaterThanOrEqual(1.3);
    expect(Math.max(...pct)).toBeLessThanOrEqual(3.0);
  });

  it('48,000명: 카이제곱 < 82.7(자유도 47, p = 0.001), 축마다·축 쌍마다도 고르다(희귀 칸 없음)', () => {
    const seeds = births(48000, 11);
    const c48 = counts(seeds.map(seedCell), 48);
    const x48 = chi2(c48);
    const ts = seeds.map((s) => traitsOf(s));
    const xBody = chi2(counts(ts.map((t) => t.body), 3));
    const xComb = chi2(counts(ts.map((t) => t.comb), 4));
    const xRing = chi2(counts(ts.map((t) => t.ring), 3));
    const xInk = chi2(counts(seeds.map((s) => sim.INK_IDS.indexOf(sim.seededInk(s))), 4));
    console.log(`48칸 48000명: χ² ${x48.toFixed(1)} · 체형 ${xBody.toFixed(2)} · 빗 ${xComb.toFixed(2)} · 고리 ${xRing.toFixed(2)} · 씨앗 먹 ${xInk.toFixed(2)}`);
    expect(x48).toBeLessThan(82.7);
    // 자유도 2·3, p = 0.001 임계 13.8·16.3
    expect(xBody).toBeLessThan(13.8);
    expect(xComb).toBeLessThan(16.3);
    expect(xRing).toBeLessThan(13.8);
    expect(xInk).toBeLessThan(16.3);
    // 체형 × 고리(후보 축)도 독립: 9칸, 자유도 8 임계 26.1
    expect(chi2(counts(ts.map((t) => t.body * 3 + t.ring), 9))).toBeLessThan(26.1);
  });

  it('보안 난수 하나만 달라도 다른 아이가 나올 수 있다(탭 좌표가 같아도) — 탭 몰림이 분포를 쏠리게 하지 않는다', () => {
    const cells = new Set<number>();
    for (let e = 0; e < 400; e++) cells.add(seedCell(sim.birthSeedOf({ x: 0, y: 0, ms: 1_000_000, installAt: 990_000, entropy: e })));
    expect(cells.size).toBe(48);
  });
});

describe('② 골든: 씨앗 → 타고남·씨앗 먹(TRAIT_VERSION 1)', () => {
  const GOLD: [number, Traits, string, number][] = [
    [0, { body: 1, comb: 3, ring: 0 }, 'yuyeon', 29],
    [1, { body: 1, comb: 3, ring: 1 }, 'songyeon', 28],
    [0xdeadbeef, { body: 1, comb: 2, ring: 2 }, 'songhwa', 27],
    [123456789, { body: 1, comb: 0, ring: 2 }, 'yuyeon', 17],
    [0x811c9dc5, { body: 2, comb: 2, ring: 1 }, 'songyeon', 40],
  ];
  it.each(GOLD)('씨앗 %i', (seed, traits, ink, cell) => {
    expect(traitsOf(seed)).toEqual(traits);
    expect(traitsOf(seed, 1)).toEqual(traits);
    expect(sim.seededInk(seed)).toBe(ink);
    expect(seedCell(seed)).toBe(cell);
  });
  it('v1 마이그레이션 씨앗(생일만으로 재현)도 같은 아이: 2026-11-20 00:00Z 생일', () => {
    const seed = sim.migratedBirthSeed(Date.UTC(2026, 10, 20));
    expect(seed).toBe(3930121672);
    expect(traitsOf(seed)).toEqual({ body: 1, comb: 0, ring: 1 });
    expect(sim.seededInk(seed)).toBe('songyeon');
  });
  it('모르는 미래 규칙 버전은 기본형(세이브 검증이 막지만 렌더가 죽지 않게)', () => {
    expect(traitsOf(12345, 99)).toEqual({ body: 1, comb: 0, ring: 1 });
  });
  it('기본형 몸 = 기존 기하 그대로(CORE·COMB.ratios·FORBIDDEN_ZONES) — 플래그를 끄면 빌드 1 화면과 같다', () => {
    expect(BASE_SHAPE.core).toEqual(CORE);
    expect([...BASE_SHAPE.combRatios]).toEqual([...COMB.ratios]);
    expect(BASE_SHAPE.forbidden).toEqual(FORBIDDEN_ZONES);
    expect(lookOf({ seed: 0xdeadbeef, traitVersion: 1 }, { id: 'songhwa' }, { traits: false, ink: false })).toEqual(BASE_LOOK);
    const on = lookOf({ seed: 0xdeadbeef, traitVersion: 1 }, { id: 'songhwa' }, { traits: true, ink: true });
    expect(on.shape).toBe(shapeOf({ body: 1, comb: 2, ring: 2 }));
    expect(on.ink.strokeDay).toBe('#4F6252');
    // 먹을 아직 안 골랐으면(첫 잠 전) 기본 먹
    expect(lookOf({ seed: 1, traitVersion: 1 }, { id: null }, { traits: true, ink: true }).ink).toEqual(BASE_INK_LOOK);
  });
});

const ALL: { name: string; sh: BodyShape }[] = [];
for (let b = 0; b < 3; b++) for (let c = 0; c < 4; c++) ALL.push({ name: `체형 ${BODY_ASPECTS[b]} · 빗 ${COMB_SHAPES[c]!.join(':')}`, sh: shapeOf({ body: b as 0, comb: c as 0, ring: 1 }) });
const BODIES = [0, 1, 2].map((b) => shapeOf({ body: b as 0, comb: 0, ring: 1 }));

describe('③ 형태: 아트 1-1 허용 범위·1-4 금지표', () => {
  it.each(BODIES.map((sh) => [sh.aspect, sh] as const))('체형 %f: 높이 < 폭(유령 금지), 정수리 곡률 ≥ 0.35W(💩 금지), 바닥 현 0.7W', (_a, sh) => {
    const p = sh.core;
    expect(sh.aspect).toBeGreaterThanOrEqual(BODY.aspectMin);
    expect(sh.aspect).toBeLessThanOrEqual(BODY.aspectMax);
    expect(p.h).toBeLessThan(1 / 1.1);
    expect(crownRadius(p)).toBeGreaterThanOrEqual(BODY.crownRadiusMin);
    // 바닥 현 끝(±0.35, 바닥)은 표면 근처(둥글림 0.07 안)
    expect(Math.abs(coreSdf(0.35, p.h / 2, 1, p))).toBeLessThan(0.03);
    expect(coreSdf(0, p.h / 2 - 0.02, 1, p)).toBeLessThan(0);
  });

  it('체형 셋은 나란히 놓으면 보일 만큼 다르다: 높이 차 ≥ 0.1W(1.15 ↔ 1.35)', () => {
    expect(BODIES[0]!.core.h - BODIES[2]!.core.h).toBeGreaterThan(0.1);
  });

  it.each(BODIES.map((sh) => [sh.aspect, sh] as const))('체형 %f: 두 눈은 몸 안(가장자리에서 0.08W 이상), 눈 높이 = 바닥에서 몸 높이 38%', (_a, sh) => {
    const e = eyeCenters(sh.core);
    for (const x of [e.lx, e.rx]) expect(coreSdf(x, e.y, 1, sh.core)).toBeLessThan(-0.08 - 0.08);
    expect((sh.core.h / 2 - e.y) / sh.core.h).toBeCloseTo(0.38, 6);
  });

  // ① 상한 = 맨 아래 가닥 뿌리 + 6°(파생). 체형마다 1.15 = 77.8°, 1.25 = 81.0°, 1.35 = 83.9°(넓고 낮은 몸일수록 뿌리가 옆으로 내려간다).
  // 독립 기준: 옆구리 수평(90°)에 닿으면 앞 옆구리 전체가 금지가 되어 '두름' 자리가 사라진다 → 상한 < 88°(여유 2° 이상)
  it.each(ALL.map((x) => [x.name, x.sh] as const))('%s: 빗 뿌리가 몸 안(떠 있는 틱 금지)·금지 자리 ① 안, ① 상한 45°~88°(옆구리 수평 전)', (_n, sh) => {
    const z = sh.forbidden[0]!;
    expect(z[1] / DEG).toBeGreaterThan(45);
    expect(z[1] / DEG).toBeLessThan(88);
    for (const n of [0, 7]) {
      const s = coreScale(n);
      const st = combStrands(n, s, COMB_REST, sh);
      for (const strand of st) expect(coreSdf(strand.pts[0]!.x, strand.pts[0]!.y, s, sh.core)).toBeLessThan(0);
      for (const th of combRootThetas(n, s, undefined, sh)) expect(isForbiddenNow(th, sh)).toBe(true);
    }
  });

  it('빗 모양은 길이비만 바꾼다(D-12 개정 ②): 같은 체형이면 뿌리 각도·굵기·금지 자리 ①이 빗 모양과 무관', () => {
    for (let b = 0; b < 3; b++) {
      const base = shapeOf({ body: b as 0, comb: 0, ring: 1 });
      for (let c = 1; c < 4; c++) {
        const sh = shapeOf({ body: b as 0, comb: c as 0, ring: 1 });
        expect(sh.forbidden).toEqual(base.forbidden);
        const a = combStrands(7, coreScale(7), COMB_REST, base);
        const o = combStrands(7, coreScale(7), COMB_REST, sh);
        for (let k = 0; k < 3; k++) {
          expect(o[k]!.pts[1]!.x).toBeCloseTo(a[k]!.pts[1]!.x, 9);
          expect(o[k]!.pts[1]!.y).toBeCloseTo(a[k]!.pts[1]!.y, 9);
          expect(o[k]!.widths[0]).toBeCloseTo(a[k]!.widths[0]!, 9);
        }
      }
    }
  });

  it('빗 모양 넷: 완전 등길이 없음(글자 E 금지, 최대/최소 ≥ 1.1), 가장 긴 가닥 = 돌출 상한(0.3W) 그대로', () => {
    for (const r of COMB_SHAPES) {
      expect(Math.max(...r) / Math.min(...r)).toBeGreaterThanOrEqual(1.1);
      expect(Math.max(...r)).toBe(1);
    }
    // 네 모양은 서로 다르다(가장 가까운 두 모양도 한 가닥이 0.1 이상 차이)
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) expect(Math.max(...COMB_SHAPES[i]!.map((v, k) => Math.abs(v - COMB_SHAPES[j]![k]!)))).toBeGreaterThanOrEqual(0.1);
  });

  it.each(BODIES.map((sh) => [sh.aspect, sh] as const))('체형 %f: 7일차 포즈(기준·서툰 손) — 획 점 중 금지 자리 비율 ≤ 15%, 앵커는 몸 표면(0.05W 안)', (_a, sh) => {
    for (const recs of [day7Records(2, sh), day7ClumsyRecords(2, sh)]) {
      for (const r of recs) {
        const sp = strokeSpine(r, r.drawnAtCoreScale, 1, undefined, undefined, sh);
        let near = 0;
        let bad = 0;
        let minD = 1e9;
        for (const p of sp.pts) {
          const d = coreSdf(p.x, p.y, r.drawnAtCoreScale, sh.core);
          minD = Math.min(minD, Math.abs(d));
          if (d < 0.3) {
            near++;
            if (isForbiddenNow(angleOf(p.x, p.y), sh)) bad++;
          }
        }
        if (near > 0) expect(bad / near).toBeLessThanOrEqual(0.15);
        expect(minD).toBeLessThan(0.12);
      }
    }
  });

  it('부착은 그 개체의 체형으로 계산된다: 같은 손획이라도 1.15와 1.35의 앵커는 각자 핵 표면 위', () => {
    const raw = Array.from({ length: 14 }, (_, i) => ({ x: -0.62 + i * 0.01, y: -0.05 + i * 0.03, t: i * 30 }));
    for (const sh of BODIES) {
      const rec = makeRecord(raw, 3, 2, sh);
      const s = coreScale(3);
      const placed = strokeSpine(rec, s, 1, undefined, GRAMMARS.A, sh).pts;
      const minD = Math.min(...placed.map((p) => Math.abs(coreSdf(p.x, p.y, s, sh.core))));
      expect(minD).toBeLessThan(0.05);
      // 부착 당시 체형이 기록된다(리뷰 M2)
      expect(rec.attach.body).toBe(sh.body);
    }
  });

  it('플래그 롤백: 체형 1.15로 붙은 획은 기본 몸을 그리는 중에도 1.15 핵 표면에 놓인다(기록된 체형으로 그림)', () => {
    const tall = BODIES[0]!;
    for (const r of day7Records(2, tall)) {
      const s = r.drawnAtCoreScale;
      // 틈(openGap)은 지금 그리는 몸 기준이라 끄고 '놓이는 자리'만 비교
      const g = { ...GRAMMARS.A, gap: 0 };
      const onRecorded = strokeSpine(r, s, 1, undefined, g, undefined).pts;
      const viaShape = strokeSpine(r, s, 1, undefined, g, tall).pts;
      for (let i = 0; i < onRecorded.length; i++) {
        expect(onRecorded[i]!.x).toBeCloseTo(viaShape[i]!.x, 9);
        expect(onRecorded[i]!.y).toBeCloseTo(viaShape[i]!.y, 9);
      }
    }
  });

  it('빌드 1 세이브(기본형 부착, 체형 기록 없음)를 세 체형 몸에 그려도 금지 비율 ≤ 15%·돌출 ≤ 0.33W(L2 상한)', () => {
    const recs = [...day7Records(2), ...day7ClumsyRecords(2)];
    for (const sh of BODIES) {
      for (const r of recs) {
        expect(r.attach.body).toBeUndefined();
        const sp = strokeSpine(r, r.drawnAtCoreScale, 1, undefined, undefined, sh);
        let near = 0;
        let bad = 0;
        let prot = -1;
        for (const p of sp.pts) {
          const d = coreSdf(p.x, p.y, r.drawnAtCoreScale, sh.core);
          prot = Math.max(prot, d);
          if (d < 0.3) {
            near++;
            if (isForbiddenNow(angleOf(p.x, p.y), sh)) bad++;
          }
        }
        if (near > 0) expect(bad / near).toBeLessThanOrEqual(0.15);
        expect(prot).toBeLessThanOrEqual(0.33);
      }
    }
  });

  it('측정 편향 없음(리뷰 M1): 각 체형 표면에서 같은 거리(0.1W)에 그은 같은 손획은 몸과의 거리가 체형과 상관없이 같다', () => {
    const s = coreScale(2);
    const dist = (sh: BodyShape, own: boolean) => {
      // 정수리 쪽 호(-60°~-10°)를 그 체형 표면 + 0.1W에 — 체형 차이가 가장 큰 자리
      const raw = Array.from({ length: 16 }, (_, i) => {
        const th = (-60 + (50 * i) / 15) * DEG;
        const r = coreRadius1(th, sh.core) * s + 0.1;
        return { x: Math.sin(th) * r, y: -Math.cos(th) * r, t: i * 30 };
      });
      return sim.measureStroke(raw, attachStroke(raw, s, 2, 1, sh), s, [], own ? sh : undefined).dist * sim.LEDGER.distFullW;
    };
    const own = BODIES.map((sh) => dist(sh, true));
    for (const d of own) expect(d).toBeCloseTo(0.1, 2);
    // 기본 핵으로 재면(고치기 전) 1.15와 1.35가 0.01W 넘게 갈렸다 — 테스트가 편향을 잡는지 확인
    const base = BODIES.map((sh) => dist(sh, false));
    expect(Math.abs(base[0]! - base[2]!)).toBeGreaterThan(0.01);
  });

  it('sim: birthShape 획은 그 개체의 체형 핵 표면(0.05W 안)에 붙고 체형이 기록된다, 없으면 기본형(체형 기록 없음)', () => {
    // 1.15 체형이 나오는 씨앗을 고른다(체형 차이가 기본형과 가장 크게 나는 쪽)
    let e = 0;
    let st = sim.createInitial(Date.UTC(2026, 11, 1, 1), 540, 5, { birth: { x: 0, y: 0, ms: 1, installAt: 1, entropy: e } });
    while (traitsOf(st.birth.seed).body !== 0) st = sim.createInitial(Date.UTC(2026, 11, 1, 1), 540, 5, { birth: { x: 0, y: 0, ms: 1, installAt: 1, entropy: ++e } });
    const raw = Array.from({ length: 14 }, (_, i) => ({ x: -0.3 + i * 0.04, y: -0.62 - 0.004 * i, t: i * 30 }));
    const at = st.createdAt + 60_000;
    const a = sim.reduce(st, { type: 'stroke', at, raw, birthShape: true }).state.strokes.at(-1)!;
    const b = sim.reduce(st, { type: 'stroke', at, raw }).state.strokes.at(-1)!;
    const tall = BODIES[0]!;
    expect(a.attach.body).toBe(0);
    expect(b.attach.body).toBeUndefined();
    const anchorGap = (rec: typeof a, sh: BodyShape) =>
      Math.min(...strokeSpine(rec, rec.drawnAtCoreScale, 1, undefined, GRAMMARS.A, sh).pts.map((p) => Math.abs(coreSdf(p.x, p.y, rec.drawnAtCoreScale, sh.core))));
    expect(anchorGap(a, tall)).toBeLessThan(0.05);
    expect(anchorGap(b, BASE_SHAPE)).toBeLessThan(0.05);
  });
});

// ── ④ 먹 토큰 ──
const s2l = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
function oklab(h: string): number[] {
  const [r, g, b] = rgb(h).map(s2l) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const lum = (h: string) => {
  const c = rgb(h).map(s2l);
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const cr = (a: string, b: string) => {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const minDist = (hs: string[]) => {
  let mn = 9;
  for (let i = 0; i < hs.length; i++)
    for (let j = i + 1; j < hs.length; j++) {
      const a = oklab(hs[i]!);
      const b = oklab(hs[j]!);
      mn = Math.min(mn, Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!));
    }
  return mn;
};
const T = Object.values(INK_TOKENS);

describe('④ 먹 토큰 v1.1(C-ink-tokens.mjs 출력)', () => {
  it('네 먹끼리 OKLab 거리 ≥ 0.044(지각 문턱 0.02의 두 배): 번짐 고리·담묵 획·밤 몸·밤 획', () => {
    expect(minDist(T.map((t) => t.day.wash))).toBeGreaterThanOrEqual(0.044);
    expect(minDist(T.map((t) => t.day.strokeInk))).toBeGreaterThanOrEqual(0.044);
    expect(minDist(T.map((t) => t.night.body))).toBeGreaterThanOrEqual(0.044);
    expect(minDist(T.map((t) => t.night.strokeInk))).toBeGreaterThanOrEqual(0.044);
    // 낮 몸(C 0.008)은 일부러 안 보인다 — 그래서 렌더는 같은 검정
    expect(minDist(T.map((t) => t.day.body))).toBeLessThan(0.02);
  });

  it('대비(D-08 비텍스트 3:1): 밤 몸–밤 바탕 ≥ 3.9, 밤 몸–눈 ≥ 3.28, 낮 새 획–바탕 ≥ 5.3', () => {
    for (const t of T) {
      expect(cr(t.night.body, PALETTE.night.bg)).toBeGreaterThanOrEqual(3.9);
      expect(cr(t.night.body, PALETTE.night.eye)).toBeGreaterThanOrEqual(3.28);
      expect(cr(t.day.strokeInk, PALETTE.day.bg)).toBeGreaterThanOrEqual(5.3);
    }
  });

  it('단조 순서(아트 4절): 낮 = 몸 > 새 획 > 고리(바탕 쪽으로), 밤 = 몸 > 새 획(밤 바탕 대비) — 핵이 늘 맨 앞', () => {
    for (const t of T) {
      expect(lum(PALETTE.day.body)).toBeLessThan(lum(t.day.strokeInk));
      expect(lum(t.day.strokeInk)).toBeLessThan(lum(t.day.wash));
      expect(cr(t.night.body, PALETTE.night.bg)).toBeGreaterThan(cr(t.night.strokeInk, PALETTE.night.bg));
      // 밤 새 획은 밤 몸과 1.5:1 이상 떨어진다(몸의 부속물로 붙어 보이지 않게)
      expect(cr(t.night.body, t.night.strokeInk)).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('strokeInkOf: 채택안 C는 토큰 그대로, 기본형 C = PALETTE 토큰, 옅은 문법(B)은 더 바탕 쪽', () => {
    const C = GRAMMARS.C;
    expect(strokeInkOf(C, BASE_INK_LOOK, false)).toBe(PALETTE.day.strokeInk);
    expect(strokeInkOf(C, BASE_INK_LOOK, true)).toBe(PALETTE.night.strokeInk);
    for (const id of sim.INK_IDS) {
      const lk = inkLook(id);
      expect(strokeInkOf(C, lk, false)).toBe(INK_TOKENS[id].day.strokeInk);
      expect(strokeInkOf(C, lk, true)).toBe(INK_TOKENS[id].night.strokeInk);
      // A(tone 0.1)는 몸 쪽, 낮 획은 C보다 어둡다
      expect(lum(strokeInkOf(GRAMMARS.A, lk, false))).toBeLessThan(lum(strokeInkOf(C, lk, false)));
    }
  });

  it('inkLook: 낮 몸은 고른 먹과 상관없이 같은 검정(D-20), 차이는 고리·담묵 획·밤 몸', () => {
    for (const id of sim.INK_IDS) {
      const lk = inkLook(id);
      expect(lk.dayBody).toBe(PALETTE.day.body);
      expect(lk.nightBody).toBe(INK_TOKENS[id].night.body);
      expect(lk.ring).toBe(INK_TOKENS[id].day.wash);
    }
    expect(inkLook(null)).toBe(BASE_INK_LOOK);
    expect(inkLook('nope' as never)).toBe(BASE_INK_LOOK);
  });
});

describe('⑤ 꿈 카드 먹(H3)', () => {
  const card: sim.DreamCard = { night: 3, motifId: 'center.moon', composition: 0, inkTone: 0.2, flow: 0, flowSeed: 3, strokeRef: null, nightsMerged: 1 };
  it('먹이 없거나 기본 먹이면 빌드 1 카드와 같고, 고른 먹이면 마블링 먹빛만 바뀐다(무늬·시드 그대로)', () => {
    const strokes = day7Records();
    const base = buildDreamScene({ card, strokes });
    expect(buildDreamScene({ card, strokes, ink: BASE_INK_LOOK })).toEqual(base);
    const inks = sim.INK_IDS.map((id) => buildDreamScene({ card, strokes, ink: inkLook(id) }));
    for (const sc of inks) {
      expect(sc.seed).toBe(base.seed);
      expect(sc.segs).toEqual(base.segs);
      expect(sc.ink).not.toEqual(base.ink);
    }
    // 네 먹의 옅은 쪽 먹빛이 서로 다르다(OKLab 0.02 이상)
    const hex = inks.map((sc) => '#' + sc.ink.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join(''));
    expect(minDist(hex)).toBeGreaterThan(0.02);
  });
});
