// 같은 몽망이의 0일차·7일차 기준 데이터(머리 중심 = 원점, 390pt 폭 기준 px).
import { buildStrokeMesh, synthStroke, type StrokeMesh, type Vec } from './strokeMesh';

export type InkKind = 'ink' | 'red';

export interface BodyStroke {
  mesh: StrokeMesh;
  kind: InkKind;
  seed: number;
  /** 0..1 오래된 획일수록 옅다(나이 = 회색화) */
  age: number;
}

export interface MongmangiPose {
  dropR: number;
  eye: Vec;
  eyeR: number;
  strokes: BodyStroke[];
  /** 화면에서 머리 중심 위치(폭·높이 비율) */
  anchor: Vec;
}

function stroke(ctrl: Vec[], width: number, speed: number, pressure: number, kind: InkKind, seed: number, age: number): BodyStroke {
  const mesh = buildStrokeMesh(synthStroke(ctrl, speed, pressure), { width, smooth: 2 });
  if (!mesh) throw new Error('preset stroke too short');
  return { mesh, kind, seed, age };
}

/** E 빗: 가로획 셋. 0일차는 짧은 틱, 7일차는 길게 */
function eComb(x0: number, len: number, ys: number[], width: number, ageBase: number): BodyStroke[] {
  return ys.map((y, i) =>
    stroke(
      [
        { x: x0, y },
        { x: x0 + len * 0.5, y: y - 1.5 },
        { x: x0 + len, y: y - 3 },
      ],
      width,
      1.6 + i * 0.25,
      0.55,
      'ink',
      11 + i * 7,
      ageBase,
    ),
  );
}

export function day0(): MongmangiPose {
  return {
    dropR: 30,
    eye: { x: 9, y: -8 },
    eyeR: 5.5,
    anchor: { x: 0.47, y: 0.45 },
    strokes: eComb(42, 20, [-8, 0, 8], 1.7, 0),
  };
}

export function day7(): MongmangiPose {
  return {
    dropR: 38,
    eye: { x: 13, y: -12 },
    eyeR: 7,
    anchor: { x: 0.52, y: 0.41 },
    strokes: [
      // 1~2일차: 초승달 주획(몸)
      stroke(
        [
          { x: -14, y: 18 },
          { x: -42, y: 62 },
          { x: -54, y: 122 },
          { x: -42, y: 180 },
          { x: -8, y: 218 },
          { x: 34, y: 230 },
        ],
        24,
        0.9,
        0.85,
        'ink',
        3,
        0.25,
      ),
      // 3~5일차: E 빗
      ...eComb(32, 78, [16, 50, 84], 9, 0.15),
      // 6일차: 꼬리 말림
      stroke(
        [
          { x: 30, y: 230 },
          { x: 66, y: 222 },
          { x: 80, y: 198 },
          { x: 66, y: 180 },
          { x: 50, y: 192 },
        ],
        8,
        1.4,
        0.5,
        'ink',
        41,
        0.05,
      ),
      // 7일차: 주홍 한 점
      stroke(
        [
          { x: 38, y: -42 },
          { x: 48, y: -58 },
          { x: 56, y: -70 },
        ],
        6,
        1.2,
        0.6,
        'red',
        53,
        0,
      ),
    ],
  };
}
