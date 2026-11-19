// 숨·깜빡임 곡선(워크릿에서 부르는 순수 함수)

/** 3.6초 주기 숨. -1..1 */
export function breathAt(ms: number): number {
  'worklet';
  return Math.sin((ms / 3600) * Math.PI * 2);
}

/** 0(뜸)..1(감음). 4.2초마다 깜빡, 세 번에 한 번은 두 번 깜빡 */
export function blinkAt(ms: number): number {
  'worklet';
  const period = 4200;
  const cycle = Math.floor(ms / period);
  const ph = ms - cycle * period;
  const one = (x: number) => (x >= 0 && x < 150 ? Math.sin((x / 150) * Math.PI) : 0);
  let b = one(ph - 2600);
  if (cycle % 3 === 2) b = Math.max(b, one(ph - 2820));
  return b;
}
