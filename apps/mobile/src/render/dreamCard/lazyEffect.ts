// 런타임 셰이더 지연 생성: 모듈을 불러올 때 컴파일하지 않고, 처음 필요할 때 한 번만 만든다.
// 실패(null·예외)해도 던지지 않고 null을 기억한다 → 호출 쪽이 평평한 먹 층으로 그린다(앱이 죽지 않게).
export function lazyOnce<T>(make: () => T | null | undefined, onFail?: (e: unknown) => void): () => T | null {
  let done = false;
  let value: T | null = null;
  return () => {
    if (done) return value;
    done = true;
    try {
      value = make() ?? null;
      if (value === null) onFail?.(new Error('compile returned null'));
    } catch (e) {
      value = null;
      onFail?.(e);
    }
    return value;
  };
}
