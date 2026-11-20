// dreams-sim.mjs의 타입(core 시험이 이 시뮬을 직접 불러 대조한다 — packages/core/test/dream-rules.test.ts).
export interface SimMotif {
  id: string;
  zone: string;
  family: string;
  unlock: number;
}
export interface SimScene {
  motifId: string;
  comp: number;
}
export type SimRule = 'R1' | 'R2' | 'R3' | 'R4';
export type SimPick = (zone: string, history: SimScene[], rand: () => number, moonWindow: boolean) => { pick: SimScene; relaxed: Set<SimRule> };
export interface SimRow {
  zone: string;
  nights: number;
  moon: boolean;
  R1: number;
  R2: number;
  R3: number;
  R4: number;
  repeat30: string;
  gap: string;
}
export const MOTIFS: SimMotif[];
export function pick(zone: string, history: SimScene[], rand: () => number, moonWindow: boolean, motifs?: SimMotif[]): { pick: SimScene; relaxed: Set<SimRule> };
export function run(
  zone: string,
  nights: number,
  seed: number,
  withMoon: boolean,
  pickFn?: SimPick,
): { R1: number; R2: number; R3: number; R4: number; repeat30: number; firstNights: number[] };
export function table(runs: number, zones?: string[], pickFn?: SimPick, nightsList?: number[]): SimRow[];
