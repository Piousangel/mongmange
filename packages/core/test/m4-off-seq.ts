// M4 '플래그 jeong 꺼짐 = M4 이전 v3 바이트 동일' 시험의 사건열(리뷰 M2). M4 이전 코드(main 6199815)로 만든 세이브
// `fixtures/v3-pre-m4.json`과 지금 코드로 jeong 꺼짐(이벤트에 jeong 칸 없음·call·jeongCaption 없음)으로 돌린 세이브를 바이트로 비교한다.
import { handStroke, kst, H, MIN, KST } from './sim-helpers';

/** 이벤트 모양은 M4 이전 v3 이벤트 그대로(새 칸 없음). 9일: 몸 탭이 있는 날·없는 날, 한 마디, 밥·간식, 오래 비움(80h) 포함 */
export function preM4Events(storedWord: (text: string) => unknown): Record<string, unknown>[] {
  const ev: Record<string, unknown>[] = [];
  for (let d = 0; d < 9; d++) {
    const base = kst(11, 25 + d + (d >= 5 ? 3 : 0), 20);
    ev.push({ type: 'appForeground', at: base, tzOffsetMin: KST });
    ev.push({ type: 'grind', at: base + MIN, durationMs: 9000 });
    if (d % 3 !== 1) ev.push({ type: 'tap', at: base + 90_000, target: 'body', holdMs: 100, x: 0.3, y: -0.3 });
    if (d % 4 !== 2) ev.push({ type: 'write', at: base + 2 * MIN, word: storedWord(['비', '고마워', '행복해'][d % 3]!), chars: 2, raw: handStroke(d + 1) });
    ev.push({ type: 'offer', at: base + 3 * MIN, kind: 'meal', item: 'clear' });
    ev.push({ type: 'offer', at: base + 4 * MIN, kind: 'treat', item: 'pattern' });
    if (d !== 4) ev.push({ type: 'putToSleep', at: base + 2 * H });
    ev.push({ type: 'appBackground', at: base + 2 * H + MIN });
  }
  return ev;
}
export const PRE_M4_START = kst(11, 25, 9);
