// D-13 세이브 정본 타입. 좌표는 그을 때의 핵 중심 원점·그때의 W 단위.

export interface RawPoint {
  x: number;
  y: number;
  /** 획 시작부터 ms */
  t: number;
  /** 압력 0..1(기기가 주면) */
  p?: number;
}

export type AttachLevel = 1 | 2 | 3;

/** D-12 부착 결과. 결정적으로 다시 계산할 수 있지만 버전 고정을 위해 저장한다 */
export interface Attach {
  level: AttachLevel;
  attachVersion: number;
  /** 회전 중심(획에서 몸에 가장 가까운 점, 단순화 점열 기준 raw 좌표) */
  ax: number;
  ay: number;
  /** 붙는 핵 각도(θ 규약) */
  theta: number;
  /** 회전(라디안, 화면 시계 방향 +) */
  rot: number;
  /** 균일 축소(L2+) */
  scale: number;
  /** 둘레 쪽 휨(L3, 0..0.3) */
  bend: number;
  /** 끝 테이퍼 보정(L2+) 0..1 */
  taper: number;
}

export interface StrokeRecord {
  raw: RawPoint[];
  attach: Attach;
  drawnAtCoreScale: number;
  meshVersion: number;
}

export interface SaveEnvelope {
  schemaVersion: number;
  strokes: StrokeRecord[];
}
