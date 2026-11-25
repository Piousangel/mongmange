// 종료(SIGTERM) 마감 하나를 프로세스 전체가 나눠 쓴다(B7a 리뷰 M1).
// Cloud Run은 SIGTERM 뒤 유예 10초가 지나면 SIGKILL한다. 전에는 집계 핑 flush(최대 3번 × 쿼리 제한 6초)와 링크 퍼널 flush(8초)가 Nest 모듈 순서대로
// **차례로** 돌아 DB가 멈춘 날 10초를 넘었고, 그러면 손실 로그조차 남지 않았다.
//  - 마감 = 첫 종료 훅 시각 + SHUTDOWN_BUDGET_MS(8초). 각 집계기는 beforeApplicationShutdown에서 자기 flush를 `run()`으로 **시작만** 하고 바로 돌아간다
//    → 두 집계기가 **병렬**로 돈다. 각 시도는 남은 시간으로 끊는다(`within`).
//  - 손실 로그 여유 LOSS_LOG_RESERVE_MS를 남기고 끝낸다 → 마감 안에 '못 쓴 개수' 로그가 반드시 나간다(개수만 — 개인정보 0).
//  - PrismaService.onApplicationShutdown(모든 beforeApplicationShutdown 뒤)이 `settle()`로 마감까지 기다린 뒤 연결을 끊는다.
import { Injectable } from '@nestjs/common';

export const SHUTDOWN_BUDGET_MS = 8_000;
export const LOSS_LOG_RESERVE_MS = 300;

/** p가 ms 안에 끝나면 true(끝나지 않으면 기다리지 않고 false — p는 뒤에서 계속될 수 있다) */
export async function within(p: Promise<unknown>, ms: number): Promise<boolean> {
  if (ms <= 0) return false;
  let timer: NodeJS.Timeout | undefined;
  const t = new Promise<false>((r) => {
    timer = setTimeout(() => r(false), ms);
  });
  try {
    return await Promise.race([p.then(() => true as const, () => true as const), t]);
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class ShutdownBudget {
  /** 시험이 줄여 쓴다 */
  totalMs = SHUTDOWN_BUDGET_MS;
  private until: number | null = null;
  private readonly tasks: Array<Promise<unknown>> = [];

  /** 마감 시각(첫 호출 때 정해진다) */
  deadline(): number {
    return (this.until ??= Date.now() + this.totalMs);
  }

  /** 손실 로그 여유를 뺀 남은 시간(ms) */
  remaining(): number {
    return Math.max(0, this.deadline() - LOSS_LOG_RESERVE_MS - Date.now());
  }

  /** 종료 작업을 시작만 하고 돌아간다(다른 집계기와 병렬) */
  run(task: () => Promise<void>): void {
    this.deadline();
    this.tasks.push(task().catch(() => undefined));
  }

  /** 시작된 종료 작업을 마감까지만 기다린다 */
  async settle(): Promise<void> {
    if (this.tasks.length === 0) return;
    await within(Promise.all(this.tasks), this.deadline() - Date.now());
  }
}
