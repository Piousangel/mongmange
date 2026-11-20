// 컴포넌트 안 일회 지연의 정해진 자리(OPERATING 7-2, 린트 mong/no-floating-timer). 핸들을 버리는 setTimeout 대신 이것을 쓴다.
// 언마운트되면 아직 안 울린 지연을 취소한다 → 사라진 화면에 setState·소리가 늦게 도착하지 않는다.
// 단, **반드시 일어나야 하는 정리**(루프 소리 멈춤·자원 해제)는 `{ flushOnUnmount: true }`로 건다 — 언마운트 때 기다리지 않고 바로 실행한다(A6 리뷰 L2).
// 같은 지연을 '다시 걸면 앞의 것을 취소'해야 하면(문구 깜빡임 등) 지금처럼 ref에 핸들을 담아 clearTimeout한다.
// 시험: test/use-later.test.ts(대기열 로직 — React 없이 가짜 시계로)
import { useEffect, useRef } from 'react';

export type LaterOptions = { flushOnUnmount?: boolean };
export type Later = (fn: () => void, ms: number, opts?: LaterOptions) => void;

/** 지연 대기열: later로 걸고, dispose하면 남은 것은 취소(flushOnUnmount면 바로 실행) */
export function createLaterQueue(): { later: Later; dispose: () => void } {
  const pending = new Map<ReturnType<typeof setTimeout>, { fn: () => void; flush: boolean }>();
  return {
    later(fn, ms, opts) {
      const id = setTimeout(() => {
        pending.delete(id);
        fn();
      }, ms);
      pending.set(id, { fn, flush: opts?.flushOnUnmount === true });
    },
    dispose() {
      const jobs = [...pending];
      pending.clear();
      for (const [id, job] of jobs) {
        clearTimeout(id);
        if (job.flush) job.fn();
      }
    },
  };
}

export function useLater(): Later {
  const queue = useRef<ReturnType<typeof createLaterQueue> | null>(null);
  if (!queue.current) queue.current = createLaterQueue();
  useEffect(() => {
    const q = queue.current;
    return () => q?.dispose();
  }, []);
  return queue.current.later;
}
