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
  /**
   * M1: 부착 때 쓴 체형(0 = 1.15, 1 = 1.25, 2 = 1.35). 없으면 기본형 부착(빌드 1·플래그 꺼짐).
   * 렌더는 이 체형의 핵 표면에 획을 놓는다 — 원격 플래그를 롤백해도 붙은 자리(금지 자리 ① 판정)가 어긋나지 않게(리뷰 M2)
   */
  body?: 0 | 1 | 2;
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

/**
 * 한 개체의 몸 모양(M1 타고남 → 기하). 순수 숫자·배열만 담아 worklet으로 그대로 넘긴다.
 * 만드는 곳은 geometry/shape.ts(shapeOf). 주지 않으면 모든 기하 함수가 기본형(BASE_SHAPE와 같은 값)을 쓴다.
 */
export interface BodyShape {
  /** 체형 번호(traits BODY_ASPECTS 순서) — 부착 기록(Attach.body)용 */
  body: 0 | 1 | 2;
  /** 핵 SDF 매개변수(체형 폭:높이에서 푼 값) */
  core: import('./core').CoreParams;
  /** 빗 세 가닥 길이비(위 → 아래) */
  combRatios: readonly [number, number, number];
  /** D-12 금지 자리(①은 이 체형의 빗 뿌리에서 파생, ②는 고정) */
  forbidden: readonly (readonly [number, number])[];
  /** 번짐 고리 폭(W) — 후보 축이 채택되기 전에는 늘 1.3 */
  ringWidth: number;
  /** 폭:높이(기록·캡처용) */
  aspect: number;
  /** 셰이더 uniform용 [a, b, c, h]·[lean, round] — 렌더마다 새 배열을 만들지 않게(리뷰 M3) */
  coreU: readonly number[];
  coreKU: readonly number[];
}
