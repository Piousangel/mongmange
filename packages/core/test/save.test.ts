import { describe, expect, it } from 'vitest';
import {
  CURRENT_MESH_VERSION,
  attachStroke,
  coreScale,
  coreSdf,
  makeRecord,
  parseSave,
  quantizeRaw,
  serializeSave,
  simplifyStroke,
  strokeLocal,
  strokeRibbon,
  type RawPoint,
  type SaveEnvelope,
} from '../src/index';

/** 결정적 의사 손획: 150점, 몸 오른쪽 아래에서 시작해 바깥으로 휘는 획 */
function fingerStroke(seed: number, n = 150): RawPoint[] {
  const out: RawPoint[] = [];
  let r = seed * 9301 + 49297;
  const rnd = () => {
    r = (r * 9301 + 49297) % 233280;
    return r / 233280 - 0.5;
  };
  const a0 = 0.6 + (seed % 7) * 0.7;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const th = a0 + u * 1.4;
    const rad = 0.52 + u * 0.25;
    out.push({ x: Math.sin(th) * rad + rnd() * 0.004, y: -Math.cos(th) * rad + rnd() * 0.004, t: Math.round(u * 1400), p: 0.4 + 0.2 * u });
  }
  return out;
}

describe('D-13 세이브 정본 = 원본 점열', () => {
  it('① 같은 raw → 같은 메시(결정성), 직렬화 왕복 후에도 같다', () => {
    const rec = makeRecord(fingerStroke(3), 2, 2);
    const a = strokeRibbon(rec, coreScale(5));
    const b = strokeRibbon(rec, coreScale(5));
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
    const env: SaveEnvelope = { schemaVersion: 2, strokes: [rec] };
    const back = parseSave(serializeSave(env));
    expect(back.strokes[0]!.raw).toEqual(rec.raw);
    const c = strokeRibbon(back.strokes[0]!, coreScale(5));
    expect(c.positions).toEqual(a.positions);
  });

  it('② meshVersion 1 → 2로 올려도 로드·렌더가 깨지지 않는다(구형 schema v1 봉투 마이그레이션 포함)', () => {
    const raw = quantizeRaw(fingerStroke(5));
    const s = coreScale(1);
    const attach = attachStroke(raw, s, 2, 1);
    const { taper: _t, ...attachV1 } = attach;
    // 옛 앱이 쓰던 schema v1: raw 숫자 배열, attach에 taper 없음, meshVersion 1
    const legacy = JSON.stringify({
      schemaVersion: 1,
      strokes: [{ raw: raw.map((p) => [p.x, p.y, p.t, p.p ?? 0.5]), attach: attachV1, drawnAtCoreScale: s, meshVersion: 1 }],
    });
    const asSaved = parseSave(legacy);
    expect(asSaved.strokes[0]!.meshVersion).toBe(1);
    const upgraded = parseSave(legacy, { upgradeMesh: true });
    expect(upgraded.strokes[0]!.meshVersion).toBe(CURRENT_MESH_VERSION);
    expect(CURRENT_MESH_VERSION).toBe(2);

    const m1 = strokeRibbon(asSaved.strokes[0]!, coreScale(3));
    const m2 = strokeRibbon(upgraded.strokes[0]!, coreScale(3));
    for (const m of [m1, m2]) {
      expect(m.indices.length).toBeGreaterThan(30);
      expect(m.positions.every(Number.isFinite)).toBe(true);
      const maxIdx = Math.max(...m.indices);
      expect(maxIdx).toBeLessThan(m.positions.length / 2);
    }
    // 정본은 그대로다
    expect(upgraded.strokes[0]!.raw).toEqual(asSaved.strokes[0]!.raw);
  });

  it('②-b 메시 v1 → v2로 바꿔도 몸 자리·모양이 유지된다(앵커가 끝점이 아닌 획)', () => {
    // 가운데가 몸(뒤쪽 270°)에 닿고 양 끝은 바깥으로 벌어지는 호 → 앵커 = 가운데 점
    const raw = quantizeRaw(
      Array.from({ length: 140 }, (_, i) => {
        const u = i / 139;
        const th = ((262 + u * 56) * Math.PI) / 180;
        const r = 0.53 + 0.5 * (u - 0.5) * (u - 0.5) + Math.sin(i * 1.7) * 0.003;
        return { x: Math.sin(th) * r, y: -Math.cos(th) * r, t: Math.round(u * 1100) };
      }),
    );
    const s = coreScale(2);
    const attach = attachStroke(raw, s, 2, 2);
    const p1 = simplifyStroke(raw, 64, 1);
    const p2 = simplifyStroke(raw, 64, 2);
    // 앵커가 정말 가운데인지(끝점 동어반복 방지)
    const ai = p1.reduce((b, q, i) => (Math.hypot(q.x - attach.ax, q.y - attach.ay) < Math.hypot(p1[b]!.x - attach.ax, p1[b]!.y - attach.ay) ? i : b), 0);
    expect(ai).toBeGreaterThan(p1.length * 0.25);
    expect(ai).toBeLessThan(p1.length * 0.75);
    for (const sNow of [s, coreScale(7)]) {
      const l1 = strokeLocal(p1, attach, s, sNow, 1);
      const l2 = strokeLocal(p2, attach, s, sNow, 1);
      // (a) v2에서도 획이 몸에서 뜨지 않는다: v2 스파인 중 몸 표면 0.02W 안의 점이 있다
      const touch = Math.min(...l2.map((q) => Math.abs(coreSdf(q.x, q.y, sNow))));
      expect(touch).toBeLessThan(0.02);
      // (b) 두 버전 스파인의 하우스도르프 거리 ≤ 0.02W(모양 유지)
      const near = (a: typeof l1, b: typeof l1) => Math.max(...a.map((q) => Math.min(...b.map((r) => Math.hypot(q.x - r.x, q.y - r.y)))));
      const hd = Math.max(near(l1, l2), near(l2, l1));
      console.info(`[②-b] touch ${touch.toFixed(4)} hd ${hd.toFixed(4)}`);
      expect(hd).toBeLessThan(0.02);
    }
  });

  it('미래 schemaVersion은 거부한다', () => {
    expect(() => parseSave(JSON.stringify({ schemaVersion: 3, strokes: [] }))).toThrow();
  });

  it('③ 24획 세이브(보통 획 150점) 크기 ≤ 64KB', () => {
    const strokes = Array.from({ length: 24 }, (_, i) => makeRecord(fingerStroke(i + 1), i, 2));
    const json = serializeSave({ schemaVersion: 2, strokes });
    const bytes = new TextEncoder().encode(json).length;
    expect(bytes).toBeLessThanOrEqual(64 * 1024);
    // 보고용 기록
    console.info(`[③] 24획 × 150점 세이브 = ${bytes} B (${(bytes / 1024).toFixed(1)} KB)`);
  });

  it('정본 상한: 512점·6초(시간 균등 솎기)', () => {
    const long: RawPoint[] = Array.from({ length: 2000 }, (_, i) => ({ x: Math.cos(i / 50), y: Math.sin(i / 50), t: i * 4 }));
    const q = quantizeRaw(long);
    expect(q.length).toBeLessThanOrEqual(512);
    expect(q.at(-1)!.t).toBeLessThanOrEqual(6000);
  });
});

describe('D-13 ④ 핵이 자라도 획 시작점은 표면 0.02W 안', () => {
  it('coreScale 1.0 → 1.25', () => {
    // 몸 표면 근처에서 시작해 바깥으로 뻗는 획(시작점 = 몸에 가장 가까운 점)
    const raw: RawPoint[] = Array.from({ length: 120 }, (_, i) => {
      const u = i / 119;
      return { x: -0.48 - u * 0.35, y: 0.05 - u * 0.2 + Math.sin(u * 3) * 0.03, t: u * 900 };
    });
    for (const level of [1, 2, 3] as const) {
      const rec = makeRecord(raw, 0, level);
      expect(rec.drawnAtCoreScale).toBe(1);
      const pts = simplifyStroke(rec.raw, 64, rec.meshVersion);
      for (const sNow of [1.0, 1.1, 1.25]) {
        const local = strokeLocal(pts, rec.attach, rec.drawnAtCoreScale, sNow, 1);
        const d = Math.abs(coreSdf(local[0]!.x, local[0]!.y, sNow));
        expect(d).toBeLessThan(0.02);
      }
    }
  });
});
