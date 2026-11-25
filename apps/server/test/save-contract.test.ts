// 계약 테스트: 서버의 세이브 검사가 @mong/core(앱과 같은 코드)와 같은 판정을 내린다.
// 고정물은 core가 실제로 쓴 v1 세이브(packages/core/test/fixtures/saves) — 앱이 읽는 세이브를 서버도 읽어야 한다.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SAVE_V3_BLOCK_VERSION, SAVE_V3_KEYS, SAVE_V3_WORD_KEYS } from '@mong/contract';
import { SCHEMA_VERSION, sim, v3 } from '@mong/core';
import { describe, expect, it } from 'vitest';
import { inspectSave, SAVE_MAX_CHARS } from '../src/saves/inspect-save';
import { SAVE_SCHEMA, SIM_SCHEMA } from '../src/version';

const FIX_DIR = join(import.meta.dirname, '../../../packages/core/test/fixtures/saves');
const fixtures = readdirSync(FIX_DIR).filter((f) => f.endsWith('.json'));
const KST = -540;
const T0 = Date.UTC(2026, 10, 20, 10, 0, 0);

describe('세이브 계약 — 서버 검사 = core parseState', () => {
  it('서버가 내보내는 스키마 버전은 core 값', () => {
    expect(SAVE_SCHEMA).toBe(SCHEMA_VERSION);
    expect(SIM_SCHEMA).toBe(sim.SIM_SCHEMA_VERSION);
  });

  it('지금 core가 쓴 세이브(새 몽망이)를 검증한다', () => {
    const s = sim.createInitial(T0, KST, 42);
    const r = inspectSave(sim.serializeState(s, T0 + 1000));
    expect(r).toEqual({ kind: 'ok', envelopeVer: SCHEMA_VERSION, simVer: sim.SIM_SCHEMA_VERSION, dayIndex: s.dayIndex, strokesTotal: s.strokesTotal });
  });

  it.each(fixtures)('core 고정물 %s(옛 sim 1)도 앱과 똑같이 읽는다', (f) => {
    const json = readFileSync(join(FIX_DIR, f), 'utf8');
    const app = sim.parseState(json); // 앱이 하는 일
    const r = inspectSave(json);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.simVer).toBe(1); // 받은 판 그대로 기록
    expect(r.dayIndex).toBe(app.dayIndex);
    expect(r.strokesTotal).toBe(app.strokesTotal);
  });

  it('미래 버전은 거부하지 않고 future(validated=false)', () => {
    const s = sim.createInitial(T0, KST, 7);
    const obj = JSON.parse(sim.serializeState(s, T0)) as { sim: { version: number } };
    obj.sim.version = sim.SIM_SCHEMA_VERSION + 1;
    expect(inspectSave(JSON.stringify(obj))).toEqual({ kind: 'future', envelopeVer: SCHEMA_VERSION, simVer: sim.SIM_SCHEMA_VERSION + 1 });
  });

  it('손상·옛 형식·크기 초과는 invalid', () => {
    expect(inspectSave('{nope')).toEqual({ kind: 'invalid', reason: 'not_json' });
    expect(inspectSave('{"schemaVersion":2,"strokes":[]}')).toEqual({ kind: 'invalid', reason: 'legacy_without_sim' });
    const s = sim.createInitial(T0, KST, 9);
    const obj = JSON.parse(sim.serializeState(s, T0)) as { sim: { strokeMeta: unknown[] } };
    obj.sim.strokeMeta.push({ id: 'ghost' }); // 획 수 불일치
    expect(inspectSave(JSON.stringify(obj))).toEqual({ kind: 'invalid', reason: 'corrupt' });
    expect(inspectSave(' '.repeat(SAVE_MAX_CHARS + 1))).toEqual({ kind: 'invalid', reason: 'too_large' });
  });
});

describe('세이브 v3 본문(V27b) — 서버 검사 = core checkUploadBodyV3, 허용 목록 밖은 저장하지 않음', () => {
  const at = Date.UTC(2026, 10, 25, 11, 0);
  const H = 3_600_000;
  const stroke = (seed: number) =>
    Array.from({ length: 60 }, (_, i) => {
      const u = i / 59;
      const th = 1.4 + (seed % 5) * 0.5 + u * 1.2;
      const r = 0.56 + u * 0.2;
      return { x: Math.sin(th) * r, y: -Math.cos(th) * r, t: Math.round(u * 900) };
    });
  function lived(days: number): v3.V3State {
    let s = v3.createV3(at, 540, 5, { birth: { x: 0, y: 0, ms: at, installAt: at, entropy: 3 } });
    const w = { ...v3.storedWordOf(v3.interpretWord('비', 'ko')), lexVer: v3.LEX_VER, source: 'keyboard' as const };
    for (let d = 0; d < days; d++) {
      const b = at + d * 24 * H + 9 * H;
      for (const e of [
        { type: 'appForeground', at: b, tzOffsetMin: 540 },
        { type: 'grind', at: b + 60_000, durationMs: 4000 },
        { type: 'write', at: b + 120_000, word: w, chars: 1, raw: stroke(d + 1) },
        { type: 'putToSleep', at: b + 2 * H },
        { type: 'appForeground', at: b + 12 * H, tzOffsetMin: 540 },
      ] as v3.V3Event[])
        s = v3.reduceV3(s, e).state;
    }
    return s;
  }
  it('계약 상수 = core 값(블록 판·허용 목록·말 키)', () => {
    expect(SAVE_V3_BLOCK_VERSION).toBe(v3.V3_VERSION);
    expect([...SAVE_V3_KEYS]).toEqual([...v3.V3_WIRE_KEYS]);
    expect([...SAVE_V3_WORD_KEYS]).toEqual([...v3.V3_WIRE_WORD_KEYS]);
  });
  it('앱이 만든 v3 본문은 검증된다(날·획 수는 sim 봉투에서)', () => {
    const s = lived(3);
    const r = inspectSave(v3.uploadBodyV3(s, at + 99 * H));
    expect(r).toEqual({ kind: 'ok', envelopeVer: SCHEMA_VERSION, simVer: sim.SIM_SCHEMA_VERSION, dayIndex: s.sim.dayIndex, strokesTotal: s.sim.strokesTotal });
  });
  it.each([
    ['기기 세이브를 그대로(말에 세기·사전 판·strokeId)', (s: v3.V3State) => v3.serializeV3(s, at), 'v3_word'],
    ['기기 전용 칸(captionsShown)', (s: v3.V3State) => withV3(s, (b) => (b.captionsShown = [1, 0, 0, 0])), 'v3_keys'],
    ['마실 날(walk)', (s: v3.V3State) => withV3(s, (b) => (b.walk = { day: true })), 'v3_keys'],
    ['말 없는 봉투 획', (s: v3.V3State) => withTop(s, (o) => (o.strokes as unknown[]).push((o.strokes as unknown[])[0])), 'v3_strokes'],
  ])('%s → invalid(422 save_invalid)', (_n, make, reason) => {
    expect(inspectSave(make(lived(2)))).toEqual({ kind: 'invalid', reason });
  });
  it('블록 판 +1은 future(원문 보관), +2는 future_too_far', () => {
    expect(inspectSave(withV3(lived(1), (b) => (b.version = v3.V3_VERSION + 1)))).toEqual({ kind: 'future', envelopeVer: SCHEMA_VERSION, simVer: sim.SIM_SCHEMA_VERSION });
    expect(inspectSave(withV3(lived(1), (b) => (b.version = v3.V3_VERSION + 2)))).toEqual({ kind: 'invalid', reason: 'future_too_far' });
  });
  function withTop(s: v3.V3State, f: (o: Record<string, unknown>) => void): string {
    const o = JSON.parse(v3.uploadBodyV3(s, at)) as Record<string, unknown>;
    f(o);
    return JSON.stringify(o);
  }
  function withV3(s: v3.V3State, f: (b: Record<string, unknown>) => void): string {
    return withTop(s, (o) => f(o.v3 as Record<string, unknown>));
  }
});
