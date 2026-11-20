// 계약 테스트: 서버의 세이브 검사가 @mong/core(앱과 같은 코드)와 같은 판정을 내린다.
// 고정물은 core가 실제로 쓴 v1 세이브(packages/core/test/fixtures/saves) — 앱이 읽는 세이브를 서버도 읽어야 한다.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA_VERSION, sim } from '@mong/core';
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
