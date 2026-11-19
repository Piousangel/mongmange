// 아이들 모션(아트 2-3·8절): 숨, 깜빡임, 빗의 지연 반응. 모두 시계의 순수 함수(worklet).

/** 깜빡임 일정: 간격 2~6초 불규칙, 15% 확률로 2연속(결정적 시드) */
const BLINKS: number[] = (() => {
  const out: number[] = [];
  let r = 12345;
  const rnd = () => {
    r = (r * 1103515245 + 12345) % 2147483648;
    return r / 2147483648;
  };
  let t = 2600;
  for (let i = 0; i < 400; i++) {
    out.push(t);
    if (rnd() < 0.15) out.push(t + 330);
    t += 2000 + rnd() * 4000;
  }
  return out;
})();

/** 한 번 깜빡임 곡선: 닫힘 80ms(ease-in) → 닫힌 채 40ms → 열림 120ms(ease-out). 0 뜸..1 덮임 */
export function blinkShape(dt: number, openMs = 120): number {
  'worklet';
  if (dt < 0) return 0;
  if (dt < 80) {
    const x = dt / 80;
    return x * x;
  }
  if (dt < 120) return 1;
  if (dt < 120 + openMs) {
    const x = (dt - 120) / openMs;
    return 1 - (1 - (1 - x) * (1 - x) * (1 - x));
  }
  return 0;
}

/** 시계 t(ms)에서 깜빡임 양. since = 깜빡임을 허용하기 시작한 시각 */
export function blinkAt(t: number, since = 0): number {
  'worklet';
  let b = 0;
  for (let i = 0; i < BLINKS.length; i++) {
    const bt = BLINKS[i]! + since;
    if (bt > t) break;
    if (t - bt < 300) b = Math.max(b, blinkShape(t - bt));
  }
  return b;
}

/** 숨(2.8~3.5초 주기, 몸 ±2%). 반환 -1..1 */
export function breathAt(t: number, periodMs = 3200): number {
  'worklet';
  return Math.sin((t / periodMs) * Math.PI * 2);
}

/** 감쇠 진동(빗 튕김·떨림용): 시작 후 dt ms, 주파수 Hz, 감쇠 /s */
export function wobble(dt: number, hz: number, decay: number): number {
  'worklet';
  if (dt < 0) return 0;
  const t = dt / 1000;
  return Math.sin(t * hz * Math.PI * 2) * Math.exp(-t * decay);
}
