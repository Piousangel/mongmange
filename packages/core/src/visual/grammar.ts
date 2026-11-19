// 획 문법(렌더 스파이크 03): 유저 획이 몸과 한 덩어리 '검댕'으로 합쳐지지 않고 "몸 곁에 얹힌 붓자국"으로 읽히게 하는 렌더 규칙.
// 가장자리(블러·테·번짐)는 D-13대로 핵 + 획 + 빗 단일 coverage 하나로 만들고, 아래 값은 그 안쪽 칠과 획의 자리만 바꾼다.
// 세이브(D-13 정본 점열·attach)는 바꾸지 않는다 — 모두 파생 렌더 값이다.

export type GrammarId = 'A' | 'B' | 'C';

export interface StrokeGrammar {
  id: GrammarId;
  /** 획 기본 폭(W) */
  baseWidth: number;
  /** 끝 테이퍼가 시작되는 길이 비율 */
  tailStart: number;
  /** 끝 최소 폭(기본 폭 대비). 실처럼 빠지는 끝 금지 → 0.3 이상 */
  tailMin: number;
  /** 앵커를 뺀 자리에서 몸 표면과 획 안쪽 가장자리 사이 종이 틈(W) */
  gap: number;
  /** 앵커에서 틈이 다 열릴 때까지의 획 길이(W) */
  gapRamp: number;
  /** 획 안쪽 농도: 0 = 몸 먹 그대로, 1 = 바탕(종이). 담묵 */
  tone: number;
  /** 밤 농도(밤 몸 → 밤 바탕). 낮과 같은 '오래될수록·새 획일수록 바탕 쪽' 규칙 */
  toneNight: number;
  /** 비백(마른 붓 결) 세기 0..1. 획 안쪽에만, 끝(수필) 쪽으로 강해진다 */
  dry: number;
  /** 칠 마스크 닫힘(팽창 → 침식) 반경(pt). 틈보다 작아야 틈이 산다 */
  closePt: number;
}

/**
 * 세 안은 "획이 몸 위에 얹힌 붓자국으로 읽히는 정도"가 다르다.
 * A 은은한 톤 차(틈 최소) < B 비백 + 틈 < C 담묵으로 확실히 구별(02a 가운데에 가장 가까움).
 */
export const GRAMMARS: Record<GrammarId, StrokeGrammar> = {
  A: { id: 'A', baseWidth: 0.12, tailStart: 0.6, tailMin: 0.34, gap: 0.025, gapRamp: 0.08, tone: 0.1, toneNight: 0.15, dry: 0.25, closePt: 1.5 },
  B: { id: 'B', baseWidth: 0.125, tailStart: 0.58, tailMin: 0.32, gap: 0.06, gapRamp: 0.1, tone: 0.16, toneNight: 0.25, dry: 0.75, closePt: 0.6 },
  C: { id: 'C', baseWidth: 0.125, tailStart: 0.55, tailMin: 0.36, gap: 0.05, gapRamp: 0.1, tone: 0.32, toneNight: 0.35, dry: 0.45, closePt: 0.6 },
};

/** 판정 뒤 채택안(REPORT render-03 6절). 화면이 쿼리로 다른 안을 고르지 않으면 이것을 쓴다 */
export const DEFAULT_GRAMMAR: GrammarId = 'C';

export function grammarOf(id: string | null | undefined): StrokeGrammar {
  return id === 'A' || id === 'B' || id === 'C' ? GRAMMARS[id] : GRAMMARS[DEFAULT_GRAMMAR];
}
