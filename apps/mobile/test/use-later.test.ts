// useLater 대기열: 언마운트(dispose) 때 남은 지연은 취소하되, 반드시 일어나야 하는 정리(flushOnUnmount)는 바로 실행한다(A6 리뷰 L2 — inkGrind 루프 멈춤).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLaterQueue } from '../src/lib/useLater';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useLater 대기열', () => {
  it('시간이 되면 실행한다', () => {
    const q = createLaterQueue();
    const f = vi.fn();
    q.later(f, 700);
    vi.advanceTimersByTime(699);
    expect(f).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('언마운트 때 보통 지연은 취소된다(사라진 화면에 늦은 setState 없음)', () => {
    const q = createLaterQueue();
    const f = vi.fn();
    q.later(f, 900);
    q.dispose();
    vi.advanceTimersByTime(2000);
    expect(f).not.toHaveBeenCalled();
  });
  it('flushOnUnmount 지연은 언마운트 때 바로 한 번 실행되고, 시간이 지나도 두 번 돌지 않는다', () => {
    const q = createLaterQueue();
    const stop = vi.fn();
    q.later(stop, 700, { flushOnUnmount: true });
    q.dispose();
    expect(stop).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it('이미 실행된 정리는 언마운트 때 다시 돌지 않는다', () => {
    const q = createLaterQueue();
    const stop = vi.fn();
    q.later(stop, 700, { flushOnUnmount: true });
    vi.advanceTimersByTime(700);
    q.dispose();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
