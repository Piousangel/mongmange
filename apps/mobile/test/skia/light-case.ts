// V12a 몸 빛 시험 사례(body-light·body-light-mutant 공용): 같은 몽망이를 빛 끔·켬으로 그려 ΔL 장과 램버트 모형을 만든다.
// 시험 파일에서 vi.mock(reanimated·skia·react-native) 뒤에 동적 import로 쓴다.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as core from '@mong/core';
import * as R from './render';
import * as LM from './light-metric';

const DUMP = process.env.LIGHT_DUMP;
const DPR = 2;

export function lookOf(body: 0 | 1 | 2, ink: import('@mong/core').sim.InkId = 'songyeon') {
  const tr = { body, comb: 0, ring: 1 } as const;
  return { traits: tr, shape: core.shapeOf(tr), ink: core.inkLook(ink) };
}

export async function field(o: { body: 0 | 1 | 2; seed: number; night: number; level: number; wpx?: number; n?: number; tilt?: number }) {
  const look = lookOf(o.body);
  const records = core.handRecords(o.seed, o.n ?? 7, look.shape);
  const base = { wpx: o.wpx ?? 120, dpr: DPR, look, records, night: o.night, tilt: o.tilt ?? 0 };
  const unlit = await R.shootMong(base);
  const lit = await R.shootMong({ ...base, light: o.level });
  const s = core.coreScale(records.length);
  const ec = core.eyeCenters(look.shape.core);
  const eyes = [ec.lx, ec.rx].map((ex) => ({ x: unlit.cx + ex * s * unlit.w, y: unlit.cy + ec.y * s * unlit.w }));
  const f = LM.lightField(lit, unlit, o.night > 0.5, eyes, 0.17 * s * unlit.w);
  if (DUMP) {
    mkdirSync(DUMP, { recursive: true });
    const tag = `b${o.body}-s${o.seed}-${o.night ? 'night' : 'day'}-L${o.level}`;
    writeFileSync(path.join(DUMP, `${tag}-lit.png`), lit.png());
    writeFileSync(path.join(DUMP, `${tag}-off.png`), unlit.png());
  }
  // 램버트 모형(렌더와 같은 기하·세기)
  const B = core.BODY_LIGHT;
  const t = core.bodyLightT(o.wpx ?? 120) * Math.min(1, o.level);
  const n = o.night;
  const ld = core.hexRgb(B.lightDay);
  const ln = core.hexRgb(B.lightNight);
  const model: import('./light-metric').LambertModel = {
    core: look.shape.core,
    s,
    L: core.bodyLightDir(),
    flat: B.flat,
    d0: 0.35,
    lift: t * (B.lift.day + (B.lift.night - B.lift.day) * n),
    sink: t * (B.sink.day + (B.sink.night - B.sink.day) * n),
    lightCol: [0, 1, 2].map((i) => (ld[i]! + (ln[i]! - ld[i]!) * n) / 255),
  };
  return { f, lit, unlit, model };
}

/** 몸 렌더 하나의 램버트 잔차(tilt 0) */
export async function residualOf(o: { body: 0 | 1 | 2; seed: number; night: number; level: number; wpx?: number }) {
  const { f, unlit, model } = await field(o);
  return { res: LM.lambertResidual(f, unlit, model, unlit.cx, unlit.cy), range: LM.lightRange(f), count: f.count };
}

