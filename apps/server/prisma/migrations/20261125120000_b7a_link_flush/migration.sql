-- B7a: 링크 퍼널 메모리 합산의 '한 번만 반영' 표지(docs/design/server-v1/B7-report.md 4절 B1, DECISIONS B7a).
-- 인스턴스가 모아 둔 묶음 하나를 UPSERT할 때 같은 문장에서 그 묶음의 무작위 id를 여기 넣는다. 결과를 모르는 실패(클라이언트 시간 초과·
-- 연결 끊김 — 서버에서는 커밋됐을 수 있음) 뒤 같은 묶음을 같은 id로 다시 보내면, id가 이미 있어 아무것도 더하지 않는다 → 유실도 중복도 없다.
-- 칸은 무작위 id와 시각뿐(코드·IP·개수 없음). 2일 지난 행은 flush 문장이 함께 지운다.
CREATE TABLE "app"."link_flush" (
    "id" UUID NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "link_flush_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "link_flush_at_idx" ON "app"."link_flush"("at");

ALTER TABLE "app"."link_flush" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE app.link_flush FROM %I', r);
    END IF;
  END LOOP;
END $$;
