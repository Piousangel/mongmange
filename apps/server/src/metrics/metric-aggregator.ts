// 집계 핑 메모리 합산 → '요청 안 flush'(architecture.md v2.1 3-6 쓰기 방식).
// - 인스턴스는 칸별 합계를 메모리에 모은다. 요청을 처리하다 마지막 flush 뒤 FLUSH_EVERY_MS가 지났으면 그 요청이 UPSERT를 시작하고
//   **최대 FLUSH_REQUEST_BUDGET_MS만 기다린다**(B0 리뷰 I4). 넘으면 쓰기는 뒤에서 계속되고 응답(204)은 바로 나간다 —
//   앱이 시간 초과로 '실패'라 보고 다시 보내 두 번 세는 일을 막는다(중복보다 유실이 낫다).
// - 종료(SIGTERM → Nest beforeApplicationShutdown)에서는 남은 칸이 없어질 때까지(최대 SHUTDOWN_FLUSH_TRIES번) flush한다.
//   진행 중인 flush가 있으면 끝나기를 기다린 뒤 그사이 쌓인 칸도 쓴다(리뷰 m2). PrismaService는 그 뒤 onApplicationShutdown에서 끊는다.
// - DB가 실패하면 합계를 메모리에 되돌려 다음 기회에 다시 쓴다(그사이 쌓인 같은 칸과 합산).
// - 칸 수 보호(리뷰 I5): 메모리 칸 상한 MAX_CELLS, 그리고 **인스턴스당 하루(UTC) 새 칸 상한** — 넘는 새 칸은 버리고 버린 개수만 로그에 남긴다.
//   레이트 리밋·이 상한은 인스턴스마다 따로라 인스턴스 수만큼 느슨해진다(한계, docs/ops/metrics/README.md).
// - 이 클래스는 IP·요청 정보를 받지 않는다 — 들어오는 것은 contract의 MetricCell(날짜·차원)뿐. 로그에는 칸 값을 싣지 않는다.
import { Injectable, Logger, type BeforeApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { METRIC_CELL_KEYS, type MetricCell } from '@mong/contract';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export const FLUSH_EVERY_MS = 10_000;
/** 요청 하나가 flush를 기다리는 최대 시간. 핑 응답이 늘 2초 안에 끝나게 */
export const FLUSH_REQUEST_BUDGET_MS = 1500;
/** 메모리 칸 수 상한. 넘으면 그 요청에서 바로 flush, flush 실패 중이면 새 칸은 버린다(메모리 보호) */
export const MAX_CELLS = 5000;
export const SHUTDOWN_FLUSH_TRIES = 3;

const SEP = '\u001f';
const keyOf = (c: MetricCell) => METRIC_CELL_KEYS.map((k) => String(c[k])).join(SEP);
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

@Injectable()
export class MetricAggregator implements BeforeApplicationShutdown {
  private readonly log = new Logger('Metrics');
  private cells = new Map<string, { cell: MetricCell; n: number }>();
  /** 창의 시작 = 마지막 flush 또는 (처음이면) 첫 칸이 들어온 때 */
  private lastFlushAt: number | null = null;
  private inflight: Promise<void> | null = null;
  /** 오늘(UTC) 이 인스턴스가 처음 본 칸 키 — 하루 새 칸 상한용 */
  private seenDay = '';
  private seenToday = new Set<string>();
  /** 상한 때문에 버린 칸 수(다음 flush 때 개수만 로그) */
  private dropped = 0;
  private readonly newCellsPerDay: number;
  /** 시험이 바꿔 끼우는 시계 */
  now: () => number = () => Date.now();

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.newCellsPerDay = config.get('METRIC_NEW_CELLS_PER_DAY', { infer: true });
  }

  /** 칸을 더한다. 상한을 넘는 새 칸은 버리고 false */
  add(cells: readonly MetricCell[]): boolean {
    let allKept = true;
    const now = this.now();
    this.lastFlushAt ??= now;
    const day = utcDay(now);
    if (day !== this.seenDay) {
      this.seenDay = day;
      this.seenToday = new Set();
    }
    for (const cell of cells) {
      const k = keyOf(cell);
      if (!this.seenToday.has(k)) {
        if (this.seenToday.size >= this.newCellsPerDay) {
          this.dropped++;
          allKept = false;
          continue;
        }
        this.seenToday.add(k);
      }
      const cur = this.cells.get(k);
      if (cur) cur.n += 1;
      else if (this.cells.size < MAX_CELLS) this.cells.set(k, { cell, n: 1 });
      else {
        this.dropped++;
        allKept = false;
      }
    }
    return allKept;
  }

  /** 지금 메모리에 있는 칸 수(시험·관찰용) */
  get size(): number {
    return this.cells.size;
  }

  /** 요청 끝에서 부른다: 10초가 지났거나 칸이 꽉 찼으면 flush를 시작하고 최대 FLUSH_REQUEST_BUDGET_MS만 기다린다 */
  async maybeFlush(): Promise<void> {
    if (this.cells.size === 0) return;
    if (this.now() - (this.lastFlushAt ?? this.now()) < FLUSH_EVERY_MS && this.cells.size < MAX_CELLS) return;
    let timer: NodeJS.Timeout | undefined;
    const budget = new Promise<void>((r) => {
      timer = setTimeout(r, FLUSH_REQUEST_BUDGET_MS);
    });
    await Promise.race([this.flush(), budget]);
    clearTimeout(timer);
  }

  /** UPSERT는 한 번에 하나. 진행 중이면 그것을 기다린 뒤, 그사이 쌓인 칸이 있으면 이어서 쓴다 */
  async flush(): Promise<void> {
    while (this.inflight) await this.inflight;
    if (this.cells.size === 0) return;
    const batch = [...this.cells.values()];
    this.cells = new Map();
    this.lastFlushAt = this.now();
    if (this.dropped > 0) {
      this.log.warn({ msg: '집계 칸 상한 초과로 버림', dropped: this.dropped });
      this.dropped = 0;
    }
    this.inflight = this.write(batch)
      .catch(() => {
        // 되돌린다(그사이 새로 쌓인 같은 칸과 합산). 값은 로그에 싣지 않는다
        for (const { cell, n } of batch) {
          const k = keyOf(cell);
          const cur = this.cells.get(k);
          if (cur) cur.n += n;
          else if (this.cells.size < MAX_CELLS) this.cells.set(k, { cell, n });
        }
        this.log.warn({ msg: '집계 flush 실패 — 메모리에 되돌림' });
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  private async write(batch: Array<{ cell: MetricCell; n: number }>): Promise<void> {
    const col = <K extends keyof MetricCell>(k: K) => batch.map(({ cell }) => String(cell[k]));
    // 한 문장 UPSERT(unnest). 같은 칸이 이미 있으면 count += n
    await this.prisma.$executeRaw`
      INSERT INTO "app"."metric_daily" ("day","event","cohort_day","day_n","platform","app_ver","lang","nt","wg","moon","count")
      SELECT * FROM unnest(
        ${col('day')}::text[]::date[], ${col('event')}::text[], ${col('cohortDay')}::text[]::date[], ${col('dayN')}::text[]::smallint[],
        ${col('platform')}::text[], ${col('appVer')}::text[], ${col('lang')}::text[], ${col('nt')}::text[], ${col('wg')}::text[],
        ${col('moon')}::text[], ${batch.map(({ n }) => String(n))}::text[]::int[]
      )
      ON CONFLICT ("day","event","cohort_day","day_n","platform","app_ver","lang","nt","wg","moon")
      DO UPDATE SET "count" = "metric_daily"."count" + EXCLUDED."count"`;
  }

  /** 종료: 남은 칸이 없어질 때까지(실패해 되돌린 칸 포함) 최대 SHUTDOWN_FLUSH_TRIES번 */
  async beforeApplicationShutdown(): Promise<void> {
    for (let i = 0; i < SHUTDOWN_FLUSH_TRIES && (this.cells.size > 0 || this.inflight); i++) await this.flush();
    if (this.dropped > 0) this.log.warn({ msg: '집계 칸 상한 초과로 버림', dropped: this.dropped });
  }
}
