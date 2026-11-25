// 밥 알림 후보(D-27, care-rituals 2-3). 알림 자체(예약·문구·권한)는 V29이고 여기는 '몇 깸 뒤'만 정한다.
// QA-3 R2 ①-a: 입력은 불값 두 개뿐이다. 이 파일은 아무것도 import하지 않는다(사전·위기 대조·말결 금지 — 시험 v3-meal 정적 검사).
// 밥 간격은 이 계산에만 쓴다. 밥을 안 줘도 상태는 바뀌지 않는다(D-03).

export interface MealNudgeInput {
  /** 이번 깸에 한 마디(word)가 있는가 — 무엇을 썼는지와 무관 */
  hasWord: boolean;
  /** 밥 알림 받기(기본 꺼짐) */
  nudgeOptIn: boolean;
}

/** 쓴 깸 → 다음다음 깸(2), 안 쓴 깸 → 다음 깸(1). 꺼져 있으면 null(예약 0) */
export function nudgeWakesAhead(i: MealNudgeInput): 1 | 2 | null {
  if (!i.nudgeOptIn) return null;
  return i.hasWord ? 2 : 1;
}
