// 링크 퍼널(비콘 view·스토어 이동 store_*) 메모리 합산 → 주기적 한 문장 UPSERT(B7a, B7-report 4절 B1·architecture.md 3-6 '링크 퍼널').
// 전에는 요청마다 DB 쿼리 2번(live 확인 + UPSERT 커밋)이라 DB가 느려지면 비콘이 풀을 먼저 채우고 조회수가 소리 없이 빠졌다(300ms에서 96%).
//
// 구조
//  - 요청은 메모리 칸 (UTC 날짜, 코드, 이벤트) → 개수에 1을 더할 뿐 DB를 치지 않는다. **IP·요청 정보는 받지 않는다**(처리방침 3-6 '개수만').
//  - LINK_FLUSH_EVERY_MS마다 한 번: 지금 칸 전부를 '묶음'(무작위 id)으로 떼어 한 문장으로 쓴다. 문장 = link_flush에 id 표지 INSERT
//    + link_daily UPSERT `count = count + n`(더하기라 인스턴스가 여럿이어도 합계가 맞다) + 2일 지난 표지 지우기.
//    live 확인(켜짐·live·숨김 아님)도 이 문장 안에서 한다 — 꺼진·지운·없는 코드의 칸은 버려진다(전과 같은 뜻, 확인 시점만 flush 때로).
//  - 시계: Cloud Run 기본 CPU 할당은 요청 밖에서 타이머를 거의 돌리지 않는다 → 타이머(unref) + **요청이 들어올 때 주기가 지났으면 그 요청이 시작**
//    (기다리지 않는다 — 비콘·302는 바로 나간다). 트래픽이 끊긴 인스턴스는 축소 때 SIGTERM flush가 쓴다.
//
// 실패·재시도(유실 0·중복 0)
//  - 결과를 모르는 실패(클라이언트 쿼리 제한 시간·연결 끊김 — 서버에서는 커밋됐을 수 있음)가 있으므로, 실패한 묶음은 **합치지 않고 같은 id 그대로** 들고 있다가
//    다음 주기에 다시 보낸다. 이미 반영된 묶음이면 표지 INSERT가 충돌해 아무것도 더하지 않는다(한 문장이라 표지와 합계는 함께 커밋되거나 함께 없던 일).
//  - 재시도 간격 = 주기(15초). 대기 묶음이 있는 동안 새 조회는 새 칸에 계속 모인다.
//  - 보존 범위: 대기 묶음 1개(칸 ≤ LINK_MAX_CELLS) + 모으는 칸(≤ LINK_MAX_CELLS). 모으는 칸이 꽉 차면 **이미 있는 칸은 계속 세고 새 칸만 버린다**
//    (버린 개수만 로그). 프로세스가 살아 있는 동안 DB가 오래 죽어도 이 범위 안은 잃지 않는다. 표지는 2일 보관 → 2일 안의 재시도만 중복 0을 보장
//    (그보다 긴 DB 장애는 인스턴스 재시작이 먼저 온다).
//  - 잃는 경우: 강제 종료(OOM·SIGKILL) 때 메모리 분량(최대 주기 15초 + 대기 묶음), SIGTERM 뒤 마감 8초(ShutdownBudget, 집계 핑과 공유) 안에 DB가 끝내
//    안 받을 때. 마감 0.3초 전에 못 쓴 개수만 로그(`link_flush_lost`).
//
// 메모리 예산: 칸 키 `YYYY-MM-DD|CODE8|store_android` 약 32자 + Map 항목 → 칸 하나 약 150바이트 × 2만(대기 + 모으는 칸) ≈ 3MB.
import { Injectable, Logger, type BeforeApplicationShutdown, type OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Clock, utcDay } from '../common/clock';
import { ShutdownBudget, within } from '../common/shutdown-budget';
import { PrismaService } from '../prisma/prisma.service';

export type LinkCountEvent = 'view' | 'store_ios' | 'store_android';

/**
 * flush 주기 15초. 근거: ① DB 쓰기가 '요청 수'에서 '인스턴스 수 × 4/분'으로 준다(피크 63 rps → 분당 4문장) ② 강제 종료 때 잃는 분량의 상한이
 * 주기만큼이다 — 30초면 쓰기는 절반이지만 잃는 폭이 두 배 ③ 대시보드는 하루 합계라 15초 늦어도 쓰임이 같다 ④ 핑 집계(10초)와 같은 자릿수
 */
export const LINK_FLUSH_EVERY_MS = 15_000;
/** 모으는 칸 상한(대기 묶음도 같은 상한). 피크에 링크 수천 개가 동시에 퍼져도 15초 안 서로 다른 칸은 이보다 적다 [팀 추정] */
export const LINK_MAX_CELLS = 10_000;

const SEP = '|';

interface Batch {
  id: string;
  cells: Map<string, number>;
}

@Injectable()
export class LinkCounter implements BeforeApplicationShutdown, OnModuleDestroy {
  private readonly log = new Logger('LinkCounter');
  private current = new Map<string, number>();
  /** 보냈지만 반영을 확인하지 못한 묶음(같은 id로 다시 보낸다) */
  private pending: Batch | null = null;
  private inflight: Promise<void> | null = null;
  private lastFlushAt: number;
  private dropped = 0;
  private failures = 0;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly budget: ShutdownBudget = new ShutdownBudget(),
  ) {
    this.lastFlushAt = clock.now();
    this.timer = setInterval(() => this.tick(), LINK_FLUSH_EVERY_MS);
    this.timer.unref();
  }

  /** 하나 센다. 새 칸이 상한에 막혀 버려지면 false */
  add(code: string, event: LinkCountEvent): boolean {
    const now = this.clock.now();
    const k = `${utcDay(now)}${SEP}${code}${SEP}${event}`;
    const n = this.current.get(k);
    let kept = true;
    if (n !== undefined) this.current.set(k, n + 1);
    else if (this.current.size < LINK_MAX_CELLS) this.current.set(k, 1);
    else {
      this.dropped++;
      kept = false;
    }
    // 꽉 찼으면 주기를 기다리지 않고 떼어 보낸다 — 단 **대기 묶음(실패분)이 있으면 재시도는 주기(15초)대로만**(B7a 리뷰 M2:
    // 전에는 DB가 죽은 채 꽉 차면 요청마다 재시도해 풀을 묶었다). 그동안 새 칸은 버리고 개수만 센다
    if (this.current.size >= LINK_MAX_CELLS && !this.pending) void this.flush();
    else this.tick();
    return kept;
  }

  /** 주기가 지났으면 flush를 시작한다(기다리지 않음). 실패가 이어져도 시도 간격은 주기 그대로 */
  private tick(): void {
    if (this.clock.now() - this.lastFlushAt >= LINK_FLUSH_EVERY_MS) void this.flush();
  }

  /** 한 번 시도: 대기 묶음이 있으면 그것을(같은 id), 없으면 모은 칸을 새 묶음으로. 던지지 않는다. 동시에 하나만 */
  flush(): Promise<void> {
    this.inflight ??= this.flushOnce().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async flushOnce(): Promise<void> {
    this.lastFlushAt = this.clock.now();
    if (this.dropped > 0) {
      this.log.warn({ code: 'link_cells_dropped', dropped: this.dropped }, '링크 퍼널 칸 상한 초과로 버림');
      this.dropped = 0;
    }
    if (!this.pending) {
      if (this.current.size === 0) return;
      this.pending = { id: randomUUID(), cells: this.current };
      this.current = new Map();
    }
    const batch = this.pending;
    try {
      await this.write(batch);
      this.pending = null;
      this.failures = 0;
    } catch {
      this.failures++;
      // 값(코드)은 싣지 않는다 — 칸 수·개수·연속 실패 수만
      this.log.warn({ code: 'link_flush_failed', cells: batch.cells.size, count: total(batch.cells), failures: this.failures }, '링크 퍼널 flush 실패 — 같은 묶음을 다음 주기에 다시');
    }
  }

  /**
   * 남은 것이 없어질 때까지 flush. **마감은 하나**(budgetMs)이고 각 시도도 남은 시간으로 끊는다(B7a 리뷰 M1 — 마지막 시도가 쿼리 제한 6초를 더
   * 쓰며 마감을 넘기지 않게). 다 썼으면 true
   */
  async drain(budgetMs: number): Promise<boolean> {
    const until = Date.now() + budgetMs;
    while (this.pending || this.current.size > 0 || this.inflight) {
      const hadPending = this.pending;
      if (!(await within(this.flush(), until - Date.now()))) return false;
      // 같은 묶음이 또 실패했으면 잠깐 쉬고 다시(DB가 잠깐 끊긴 경우)
      if (this.pending && this.pending === hadPending && !(await within(new Promise((r) => setTimeout(r, 250)), until - Date.now()))) return false;
    }
    return true;
  }

  /** SIGTERM: 프로세스 하나의 종료 마감(ShutdownBudget)을 집계 핑과 **병렬로** 나눠 쓴다. 시작만 하고 돌아간다 */
  beforeApplicationShutdown(): void {
    clearInterval(this.timer);
    this.budget.run(async () => {
      if (await this.drain(this.budget.remaining())) return;
      const lost = (this.pending ? total(this.pending.cells) : 0) + total(this.current);
      this.log.error({ code: 'link_flush_lost', count: lost }, '종료 전 링크 퍼널을 다 쓰지 못함');
    });
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** 시험·관찰용 */
  get state(): { cells: number; pendingCells: number; failures: number } {
    return { cells: this.current.size, pendingCells: this.pending?.cells.size ?? 0, failures: this.failures };
  }

  private async write(batch: Batch): Promise<void> {
    // 키 순서로 정렬 + 문장에 ORDER BY(B7a 리뷰 L2 — unnest 순서는 계획에 따라 바뀔 수 있다) — 여러 인스턴스가 같은 행들을 같은 순서로 잠가
    // 교착을 피한다. 교착이 나도 문장 전체가 롤백되고 같은 id로 다시 보내므로 정확성은 그대로
    const rows = [...batch.cells].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, n]) => [...k.split(SEP), String(n)] as const);
    const col = (i: number) => rows.map((r) => r[i]!);
    await this.prisma.$executeRaw`
      WITH mark AS (
        INSERT INTO app.link_flush (id) VALUES (${batch.id}::uuid) ON CONFLICT (id) DO NOTHING RETURNING id
      ), expire AS (
        DELETE FROM app.link_flush WHERE at < now() - interval '2 days'
      )
      INSERT INTO app.link_daily (day, code, event, count)
      SELECT d.day, d.code, d.event, d.n
        FROM unnest(${col(0)}::text[]::date[], ${col(1)}::text[], ${col(2)}::text[]::app.link_event[], ${col(3)}::text[]::int[]) AS d(day, code, event, n)
       WHERE EXISTS (SELECT 1 FROM mark)
         AND EXISTS (SELECT 1 FROM app.creatures c JOIN app.public_pages p ON p.creature_id = c.id
                      WHERE c.code = d.code AND c.link_enabled AND NOT c.hidden AND p.state = 'live' AND p.path_prefix IS NOT NULL)
       ORDER BY d.day, d.code, d.event
      ON CONFLICT (day, code, event) DO UPDATE SET count = app.link_daily.count + EXCLUDED.count`;
  }
}

function total(cells: Map<string, number>): number {
  let s = 0;
  for (const n of cells.values()) s += n;
  return s;
}
