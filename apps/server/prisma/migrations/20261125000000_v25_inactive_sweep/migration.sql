-- V25 2년 미사용 정리의 하루 실행 기록(리뷰 M3 — Scheduler 재시도가 정리를 두 번 돌리지 않게). 한 행뿐, 식별자 없음(개수·사유만).
-- 매일 storage-gc가 `last_day`를 오늘(UTC)로 바꾸는 데 성공한 실행만 정리를 한다. 수동 `inactive-sweep`은 이 행을 쓰지 않는다.
CREATE TABLE "app"."inactive_sweep" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "last_day" DATE,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "deleted" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "candidates" INTEGER NOT NULL DEFAULT 0,
    "more" BOOLEAN NOT NULL DEFAULT false,
    "halted" VARCHAR(16),
    CONSTRAINT "inactive_sweep_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inactive_sweep_single_row" CHECK ("id" = 1)
);
INSERT INTO "app"."inactive_sweep" ("id") VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE "app"."inactive_sweep" ENABLE ROW LEVEL SECURITY;
