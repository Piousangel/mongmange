// 성향 v2(최근 습관 추종형) — docs/design/sim/temperament-7day.mjs와 같은 입력 → 같은 결과.
// 골든 값은 그 스크립트를 그대로 돌린 전체 정밀도 출력이다(11-20, node 26). 화면 출력(소수 둘째 자리)도 함께 대조한다.
import { describe, expect, it } from 'vitest';
import { sim } from '../src/index';

type M = sim.Measures;
const KEYS: (keyof M)[] = ['speed', 'grind', 'len', 'dist', 'novel', 'touch', 'holdSpeed', 'tapSpread'];
const A = (): M => ({ speed: 0.85, grind: 0.1, len: 0.3, dist: 0.85, novel: 0.9, touch: 0.15, holdSpeed: 0.8, tapSpread: 0.9 });
const B = (): M => ({ speed: 0.2, grind: 0.9, len: 0.8, dist: 0.1, novel: 0.2, touch: 0.95, holdSpeed: 0.2, tapSpread: 0.1 });
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const SHORT: Record<sim.AxisId, string> = { tempo: 'T', boldness: 'B', closeness: 'C', curiosity: 'Q' };

/** 스크립트의 run()과 같은 입력 생성(난수 소비 순서까지 같게). 정산 수학은 전부 core 함수다 */
function run(gen: (d: number) => M, seed: number, days: number, noise: number) {
  let r = seed;
  const rnd = () => {
    const o = sim.rngNext(r);
    r = o.seed;
    return o.value;
  };
  const g = (d: number): M => {
    const x = gen(d);
    const y = {} as M;
    for (const k of KEYS) y[k] = clamp(x[k] + (rnd() - 0.5) * noise, 0, 1);
    return y;
  };
  let st = sim.initTemperament(sim.daySignals(g(0)));
  let hist: (sim.AxisId | null)[] = [];
  let obs = 0;
  let deep = 0;
  const trace: sim.AxisRecord[] = [];
  for (let d = 1; d <= days; d++) {
    const sg = sim.daySignals(g(d));
    const res = sim.settleTemperament(st.v, st.h, sg, hist);
    hist = [...hist, res.focus];
    st = { v: res.next, h: res.habit };
    const kind = sim.lineKind(res, sg);
    if (kind === 'deepen') deep++;
    if (kind === 'observation') obs++;
    trace.push(res.next);
  }
  return { v: st.v, tops: hist.map((t) => (t ? SHORT[t] : '·')).join(''), obs, deep, trace };
}

const GOLD = {
  A7: { v: [0.6753000921368804, -0.6183426506629364, -0.6164238590509558, 0.6758318228788301], tops: 'TBQCBCQ', obs: 0, deep: 0 },
  B7: { v: [-0.6803119157917273, 0.6365678666889922, 0.5906570020862462, -0.5239316460418388], tops: 'CTBTQBQ', obs: 0, deep: 0 },
  A30: { v: [0.7907727901227098, -0.6752151897291163, -0.660047027003131, 0.7318909871763497], tops: 'TBQCBCQTTQQBCC··C···QBQC··BBCQ', obs: 0, deep: 22 },
  B30: { v: [-0.8017227242426196, 0.7419236345335657, 0.7058425302271467, -0.743278591016456], tops: 'CTBTQBQQCQQTTB·BQ··QQ···Q···C·', obs: 0, deep: 22 },
  A90: { v: [0.7963079124075298, -0.6994868496193751, -0.6588426347395417, 0.7141668756440209], obs: 0, deep: 82 },
  B90: { v: [-0.7829257942371458, 0.7390974760203587, 0.6903929615622669, -0.7056962289574634], obs: 0, deep: 82 },
};
/** 스크립트 화면 출력(systems-v1 2.7 표와 같음) */
const PRINTED = {
  A7: '+0.68 -0.62 -0.62 +0.68',
  B7: '-0.68 +0.64 +0.59 -0.52',
  A30: '+0.79 -0.68 -0.66 +0.73',
  B30: '-0.80 +0.74 +0.71 -0.74',
  A90: '+0.80 -0.70 -0.66 +0.71',
  B90: '-0.78 +0.74 +0.69 -0.71',
};
const fmt = (v: sim.AxisRecord) => sim.AXES.map((k) => (v[k] >= 0 ? '+' : '') + v[k].toFixed(2)).join(' ');

describe('성향 sim 재현(temperament-7day.mjs v2)', () => {
  for (const days of [7, 30, 90] as const) {
    for (const who of ['A', 'B'] as const) {
      it(`${who} ${days}일`, () => {
        const res = run(who === 'A' ? A : B, who === 'A' ? 1 : 2, days, 0.3);
        const gold = GOLD[`${who}${days}`];
        sim.AXES.forEach((k, i) => expect(res.v[k]).toBeCloseTo(gold.v[i]!, 12));
        expect(fmt(res.v)).toBe(PRINTED[`${who}${days}`]);
        if ('tops' in gold) expect(res.tops).toBe(gold.tops);
        expect(res.obs).toBe(gold.obs);
        expect(res.deep).toBe(gold.deep);
        // 골든 불변식: 같은 결 3밤 연속 없음, 모든 축 |v| < 0.85
        expect(/(T{3}|B{3}|C{3}|Q{3})/.test(res.tops)).toBe(false);
        for (const t of res.trace) for (const k of sim.AXES) expect(Math.abs(t[k])).toBeLessThan(0.85);
      });
    }
  }

  it('습관 전환(15일 A → B): tempo 5밤 뒤 부호 바뀜, 9밤 뒤 −0.40', () => {
    const r = run((d) => (d <= 15 ? A() : B()), 3, 45, 0.3);
    expect(r.trace[14]!.tempo).toBeCloseTo(0.7994498233510323, 12);
    expect(r.trace.findIndex((v, i) => i >= 15 && v.tempo < 0) + 1 - 15).toBe(5);
    expect(r.trace.findIndex((v, i) => i >= 15 && v.tempo <= -0.4) + 1 - 15).toBe(9);
  });
});

describe('밤 정산 규칙', () => {
  const zero = (): sim.AxisRecord => ({ tempo: 0, boldness: 0, closeness: 0, curiosity: 0 });

  it('같은 축 3밤 연속 금지: 직전 두 밤이 tempo면 tempo 신호가 가장 커도 다른 축이 결', () => {
    const s = { ...zero(), tempo: 0.15, boldness: 0.05 };
    const res = sim.settleTemperament(zero(), zero(), s, ['tempo', 'tempo']);
    expect(res.focus).toBe('boldness');
    const free = sim.settleTemperament(zero(), zero(), s, ['boldness', 'tempo']);
    expect(free.focus).toBe('tempo');
  });

  it('한 밤 한 축(결 축)이 다른 축보다 크게(α 0.40 vs 0.15) 움직인다', () => {
    const s = { tempo: 0.1, boldness: 0.1, closeness: 0.1, curiosity: 0.1 };
    const res = sim.settleTemperament(zero(), zero(), s, []);
    expect(res.focus).toBe('tempo'); // 동점이면 앞 축
    expect(res.next.tempo / res.next.boldness).toBeCloseTo(0.4 / 0.15, 10);
  });

  it('모든 간격 < EPS면 결 없음(null)', () => {
    expect(sim.settleTemperament(zero(), zero(), zero(), []).focus).toBeNull();
  });

  it('첫날 신호는 2배, 축당 ±0.25에서 자른다(습관 흔적 초깃값 = 신호 그대로)', () => {
    const s = { tempo: 0.15, boldness: -0.05, closeness: 0.1, curiosity: 0 };
    const st = sim.initTemperament(s);
    expect(st.v).toEqual({ tempo: 0.25, boldness: -0.1, closeness: 0.2, curiosity: 0 });
    expect(st.h).toEqual(s);
  });

  it('하루 예산: 축마다 ±0.15에서 자른다', () => {
    const s = sim.daySignals({ speed: 1, grind: 0, len: 1, dist: 0, novel: 1, touch: 1, holdSpeed: 1, tapSpread: 1 });
    for (const k of sim.AXES) expect(Math.abs(s[k])).toBeLessThanOrEqual(0.15);
  });
});
