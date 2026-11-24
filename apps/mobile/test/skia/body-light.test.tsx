// V12a 2.5D 몸 빛(core bodyLight, 플래그 bodyLight) — 실제 Mongmangi를 헤드리스 CanvasKit(CPU)으로 그려 '그럴듯한 오답'을 막는다.
// ① 휘도: 몸 안 확산광 명도 차(OKLab ΔL 최대 − 최소) ≤ 0.08(아트 상한) + **정반사 = 램버트 모형 적합 잔차**(리뷰 H1: 국소 급등 지표는
//    넓은 정반사 로브를 못 잡았다). 셰이더 소스 정적 금지는 test/body-light-src.test.ts, 실제 셰이더 변이 음성 대조는 body-light-mutant.test.tsx
// ② 픽셀 동일: 꺼짐 = A7 golden(mongmangi-render), 켬 + 몸 폭 48pt 이하 = 꺼짐과 같은 해시
// ③ 구별 지표: distinct.test(RENDER_HEAVY)가 64pt(빛 켜짐)에서 나빠지지 않음을 본다
// ④ 방향: 시드·체형·낮밤·기울기와 상관없이 ΔL 기울기가 왼쪽 위(기울여도 빛은 화면에 고정)
// + 낮밤 세기 연속 보간(PM: 낮 1·밤 0.75), 그림자 색 연속(M2), 먹이 덜 찬 동안 눈 그림자가 몸에 비치지 않음(M3)
// LIGHT_DUMP=<폴더>면 켬·끔 PNG를 남기고 숫자를 찍는다(아트 판정 참고용).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('react-native-reanimated', async () => (await import('./mocks')).reanimatedMock());
vi.mock('@shopify/react-native-skia', async () => (await import('./mocks')).skiaMock());
vi.mock('react-native', async () => (await import('./mocks')).reactNativeMock());

let R: typeof import('./render');
let LM: typeof import('./light-metric');
let LC: typeof import('./light-case');
let core: typeof import('@mong/core');
let F: typeof import('../../src/features');
beforeAll(async () => {
  R = await import('./render');
  LM = await import('./light-metric');
  LC = await import('./light-case');
  core = await import('@mong/core');
  F = await import('../../src/features');
}, 120000);
const lookOf = (body: 0 | 1 | 2) => LC.lookOf(body);
const field = (o: Parameters<typeof import('./light-case').field>[0]) => LC.field(o);
const residualOf = (o: Parameters<typeof import('./light-case').residualOf>[0]) => LC.residualOf(o);
afterEach(() => F?.setFeature('bodyLight', null));

const DUMP = process.env.LIGHT_DUMP;
/** 기본 실행은 줄인 표본, RENDER_HEAVY=1(`pnpm verify --heavy`)·LIGHT_DUMP면 전체 행렬 */
const FULL = !!process.env.RENDER_HEAVY || !!DUMP;
const DPR = 2;
/**
 * 램버트 모형 잔차 상한(OKLab L): 잔차(α·β 맞춤 뒤) 0.03W 상자 평균의 최대와 정면 쪽(d 상위 3%) 치우침(모형 그대로).
 * 원본 실측(전체 행렬 12렌더): 최대 ≤ 0.0020, 치우침 |·| ≤ 0.0005. 실제 셰이더 변이(body-light-mutant): 리뷰 V1c 0.0085·0.0053,
 * 밤 전용 정반사 0.0043·0.0026 — 치우침이 두 변이 모두 문턱의 2.6배 이상이라 주 판정, 최대 잔차는 둘째 겹
 */
const MAX_RESIDUAL = 0.003;
const MAX_HOT_BIAS = 0.001;
/** 아트 상한(review 3-2, D-26): 몸 안 명도 차 ≤ 8% */
const MAX_RANGE = 0.08;

describe('① 휘도 — 확산광 ≤ 8%, 정반사 없음(램버트 잔차)', () => {
  it('세기 상한(1)에서 체형 × 낮·밤 × 시드: 몸 안 명도 차 ≤ 0.08, 램버트 모형 잔차 ≤ 문턱, 빛이 실제로 걸림', async () => {
    const rows: string[] = [];
    const got: { count: number; range: number; res: number; hot: number; beta: number }[] = [];
    for (const night of [0, 1])
      for (const body of FULL ? ([0, 1, 2] as const) : ([night ? 2 : 0] as const))
        for (const seed of FULL ? [3, 11] : [3]) {
          const r = await residualOf({ body, seed, night, level: 1, wpx: FULL ? 120 : 96 });
          rows.push(`${night ? 'night' : 'day'} b${body} s${seed} range=${r.range.range.toFixed(4)} resid=${r.res.maxAbs.toFixed(4)} hot=${r.res.hotBias.toFixed(4)} rms=${r.res.rms.toFixed(4)} beta=${r.res.beta.toFixed(3)} n=${r.count}`);
          got.push({ count: r.count, range: r.range.range, res: r.res.maxAbs, hot: r.res.hotBias, beta: r.res.beta });
        }
    if (DUMP || process.env.LIGHT_LOG) console.log(`[v12a] level 1\n${rows.join('\n')}`);
    for (const g of got) {
      expect(g.count).toBeGreaterThan(2000);
      expect(g.range).toBeLessThanOrEqual(MAX_RANGE);
      expect(g.range).toBeGreaterThan(0.025); // 아무것도 안 하는 빛(오답)을 막는다
      expect(g.res).toBeLessThanOrEqual(MAX_RESIDUAL); // 모형 밖 항(정반사 로브·밤 전용 항·사각 잘림) 없음
      expect(Math.abs(g.hot)).toBeLessThanOrEqual(MAX_HOT_BIAS); // 빛 정면 쪽에 한쪽으로 쌓인 밝기 없음
      expect(g.beta).toBeGreaterThan(0.85); // 모형 세기와 렌더 세기가 맞는다
      expect(g.beta).toBeLessThan(1.15);
    }
  }, FULL ? 1200000 : 300000);

  it('세기는 1에서 잘린다(상한을 넘는 값을 넘겨도 1과 같은 픽셀)', async () => {
    const look = lookOf(1);
    const records = core.handRecords(5, 7, look.shape);
    const a = await R.shootMong({ wpx: 96, dpr: DPR, look, records, light: 1 });
    const b = await R.shootMong({ wpx: 96, dpr: DPR, look, records, light: 3 });
    expect(R.hashRgba(b.rgba)).toBe(R.hashRgba(a.rgba));
    expect(core.bodyLightLevel(3)).toBe(1);
    expect(core.bodyLightLevel('low')).toBeLessThan(core.bodyLightLevel('mid'));
    expect(core.bodyLightPair({ day: 4, night: -1 })).toEqual({ day: 1, night: 0 });
  }, 600000);
});

describe('낮밤 세기(PM 11-25: 낮 1·밤 0.75) — night 연속 보간', () => {
  it('기본값 = 낮 1·밤 0.75, 보간은 연속', () => {
    expect(core.BODY_LIGHT_DEFAULT).toEqual({ day: 1, night: 0.75 });
    expect(core.bodyLightLevelAt(1, 0.75, 0)).toBe(1);
    expect(core.bodyLightLevelAt(1, 0.75, 1)).toBe(0.75);
    expect(core.bodyLightLevelAt(1, 0.75, 0.5)).toBeCloseTo(0.875, 12);
    expect(core.bodyLightLevelAt(1, 0.75, 0.51) - core.bodyLightLevelAt(1, 0.75, 0.49)).toBeCloseTo(-0.005, 12);
  });

  it('플래그를 켜면 낮 = 세기 1, 밤 = 세기 0.75와 같은 픽셀', async () => {
    const look = lookOf(1);
    const records = core.handRecords(6, 7, look.shape);
    F.setFeature('bodyLight', true);
    for (const [night, lv] of [[0, 1], [1, 0.75]] as const) {
      const flag = await R.shootMong({ wpx: 64, dpr: DPR, look, records, night, light: 'flag' });
      const want = await R.shootMong({ wpx: 64, dpr: DPR, look, records, night, light: lv });
      expect(R.hashRgba(flag.rgba), `night ${night}`).toBe(R.hashRgba(want.rgba));
    }
  }, 600000);
});

describe('② 픽셀 동일 — 꺼짐·48pt 이하', () => {
  it('켬 + 몸 폭 22·36·48pt = 꺼짐과 같은 해시(기본 5쌍: 경계 48pt 중심, 전체 = 체형 3 × 낮밤 × LOD 켬·끔)', async () => {
    type Pair = [number, 0 | 1 | 2, number, boolean];
    const pairs: Pair[] = [];
    if (FULL) {
      for (const wpx of [22, 36, 48]) for (const body of [0, 1, 2] as const) for (const night of [0, 1]) for (const lod of [false, true]) pairs.push([wpx, body, night, lod]);
    } else {
      pairs.push([48, 1, 0, false], [48, 1, 1, true], [48, 2, 0, true], [36, 0, 1, false], [22, 2, 0, true]);
    }
    for (const [wpx, body, night, lod] of pairs) {
      const look = lookOf(body);
      const records = core.handRecords(body + 2, 7, look.shape);
      const off = await R.shootMong({ wpx, dpr: DPR, look, records, night, lod });
      const on = await R.shootMong({ wpx, dpr: DPR, look, records, night, lod, light: 1 });
      expect(R.hashRgba(on.rgba), `${wpx}pt b${body} n${night} lod${lod}`).toBe(R.hashRgba(off.rgba));
    }
  }, FULL ? 1200000 : 300000);

  it('켬 + 몸 폭 49pt 이상 = 달라진다(빛이 실제로 걸림)', async () => {
    const look = lookOf(1);
    const records = core.handRecords(4, 7, look.shape);
    for (const wpx of [49, 64, 120]) {
      const off = await R.shootMong({ wpx, dpr: DPR, look, records });
      const on = await R.shootMong({ wpx, dpr: DPR, look, records, light: 0.5 });
      expect(R.hashRgba(on.rgba), `${wpx}pt`).not.toBe(R.hashRgba(off.rgba));
    }
  }, 600000);

  it('램프: 48 이하 0, 60 이상 1, 꺼짐 세기 = 0', () => {
    expect(core.bodyLightT(48)).toBe(0);
    expect(core.bodyLightT(22)).toBe(0);
    expect(core.bodyLightT(Number.NaN)).toBe(0);
    expect(core.bodyLightT(54)).toBeCloseTo(0.5, 10);
    expect(core.bodyLightT(60)).toBe(1);
    expect(core.bodyLightT(200)).toBe(1);
    expect(core.bodyLightLevel(0)).toBe(0);
    expect(core.bodyLightLevel(undefined)).toBe(0);
    expect(core.bodyLightLevel(-1)).toBe(0);
  });
});

describe('그림자 색 — night 연속(리뷰 M2)', () => {
  it('night 0.45 → 0.55 그림자 색 변화가 옆 구간(0.35 → 0.45, 0.55 → 0.65)과 같은 크기(0.5에서 튀지 않음)', async () => {
    // 획 없는 몸(그림자 자리에 획이 오지 않게), 바탕 고정(낮밤 바탕이 0.5에서 바뀌는 것은 그림자와 무관)
    const look = lookOf(1);
    const bg = core.PALETTE.day.bg;
    const shots = new Map<number, import('./render').Shot>();
    for (const night of [0.35, 0.45, 0.55, 0.65]) shots.set(night, await R.shootMong({ wpx: 96, dpr: DPR, look, records: [], night, light: 1, bg }));
    const s = core.coreScale(0);
    const mean = (sh: import('./render').Shot) => {
      // 오른쪽 아래 그림자 꼬리: 몸 오른쪽 끝 밖, 바닥 바로 아래
      const gy = sh.cy + (look.shape.core.h / 2) * s * sh.w;
      const acc = [0, 0, 0];
      let n = 0;
      for (let y = Math.round(gy + 0.02 * sh.w); y < gy + 0.08 * sh.w; y++)
        for (let x = Math.round(sh.cx + 0.6 * s * sh.w); x < sh.cx + 0.75 * s * sh.w; x++) {
          const i = (y * sh.width + x) * 4;
          for (let k = 0; k < 3; k++) acc[k] += sh.rgba[i + k]!;
          n++;
        }
      return acc.map((v) => v / n);
    };
    const m = [0.35, 0.45, 0.55, 0.65].map((k) => mean(shots.get(k)!));
    const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
    const side = Math.max(dist(m[0]!, m[1]!), dist(m[2]!, m[3]!));
    expect(side).toBeGreaterThan(0.5); // 그림자가 실제로 night에 따라 변한다(검사 자리가 맞다)
    expect(dist(m[1]!, m[2]!)).toBeLessThan(side * 2);
  }, 600000);
});

describe('먹이 덜 찬 동안 눈 그림자(리뷰 M3)', () => {
  it('ink 0.5: 눈 위 몸(위로 민 사본 자리)이 빛 때문에 어두워지지 않는다 — 눈 그림자는 구멍 안에만', async () => {
    const look = lookOf(1);
    const records = core.handRecords(3, 7, look.shape);
    const s = core.coreScale(7);
    const ec = core.eyeCenters(look.shape.core);
    for (const ink of [0.5, 0.8]) {
      const off = await R.shootMong({ wpx: 120, dpr: DPR, look, records, ink });
      const lit = await R.shootMong({ wpx: 120, dpr: DPR, look, records, ink, light: 1 });
      // 눈 중심에서 위로 0.11~0.2W(지름 0.16W × 0.7 민 사본 자리, 구멍 밖) — 빛이 하는 일은 그 자리를 살짝 밝히는 것뿐이어야 한다
      let worst = 0;
      for (const ex of [ec.lx, ec.rx])
        for (let dy = 0.11; dy <= 0.2; dy += 0.01)
          for (let dx = -0.06; dx <= 0.06; dx += 0.02) {
            const x = Math.round(off.cx + (ex + dx) * s * off.w);
            const y = Math.round(off.cy + (ec.y - dy) * s * off.w);
            const i = (y * off.width + x) * 4;
            const L0 = LM.rgbL(off.rgba, i);
            const L1 = LM.rgbL(lit.rgba, i);
            worst = Math.min(worst, L1 - L0);
          }
      expect(worst, `ink ${ink}`).toBeGreaterThan(-0.004);
    }
  }, 600000);
});

describe('눈 구멍 두께', () => {
  it('낮: 구멍 위쪽 안이 어두워지고 가운데·아래는 그대로(눈동자처럼 가운데를 칠하지 않는다)', async () => {
    const look = lookOf(1);
    const records = core.handRecords(3, 7, look.shape);
    const off = await R.shootMong({ wpx: 120, dpr: DPR, look, records });
    const lit = await R.shootMong({ wpx: 120, dpr: DPR, look, records, light: 1 });
    const s = core.coreScale(7);
    const ec = core.eyeCenters(look.shape.core);
    const sum = (sh: typeof off, dy: number) => {
      let v = 0;
      for (const ex of [ec.lx, ec.rx]) {
        const i = (Math.round(sh.cy + (ec.y + dy) * s * sh.w) * sh.width + Math.round(sh.cx + ex * s * sh.w)) * 4;
        v += sh.rgba[i]! + sh.rgba[i + 1]! + sh.rgba[i + 2]!;
      }
      return v / 6;
    };
    expect(sum(off, -0.06) - sum(lit, -0.06)).toBeGreaterThan(20);
    for (const dy of [-0.02, 0, 0.04]) expect(sum(lit, dy)).toBe(sum(off, dy));
  }, 600000);
});

describe('④ 빛 방향 고정 — 왼쪽 위', () => {
  it('체형 3 × 시드 × 낮·밤(+ 기울기): ΔL 기울기가 왼쪽 위(빛 방향 ±35°)', async () => {
    const d = core.bodyLightDir();
    const want = (Math.atan2(d[1], d[0]) * 180) / Math.PI; // 화면 좌표(y 아래)라 왼쪽 위 = −90°~−180°
    const rows: string[] = [];
    for (const night of [0, 1])
      for (const body of [0, 1, 2] as const)
        for (const seed of FULL ? [1, 6, 13] : [1 + body * 6]) {
          const { f } = await field({ body, seed, night, level: 0.75, wpx: FULL ? 80 : 64 });
          const g = LM.lightGradient(f);
          rows.push(`${night ? 'night' : 'day'} b${body} s${seed} angle=${g.angleDeg.toFixed(1)} want=${want.toFixed(1)}`);
          // 밝은 쪽을 향하는 기울기: ΔL이 커지는 방향 = 빛 쪽
          expect(g.gx).toBeLessThan(0);
          expect(g.gy).toBeLessThan(0);
          expect(Math.abs(g.angleDeg - want)).toBeLessThan(35);
        }
    if (DUMP) console.log(`[v12a] direction\n${rows.join('\n')}`);
  }, FULL ? 1200000 : 300000);

  it('기울여도 빛은 화면에 고정(리뷰 L4): tilt ±0.35rad에서 ΔL 기울기 방향 차 < 12°(빛이 몸과 함께 돌면 약 40°)', async () => {
    const ang: number[] = [];
    for (const tilt of [-0.35, 0.35]) {
      const { f } = await field({ body: 1, seed: 4, night: 1, level: 1, wpx: 96, tilt });
      ang.push(LM.lightGradient(f).angleDeg);
    }
    expect(Math.abs(ang[0]! - ang[1]!)).toBeLessThan(12);
  }, 600000);
});
