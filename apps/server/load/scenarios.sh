#!/usr/bin/env bash
# B7 로컬 부하 시험 — 시나리오 1~5를 차례로(각각 짧게). 준비·정리는 README.md. 저장소 루트에서:
#   bash apps/server/load/scenarios.sh            # 전부
#   bash apps/server/load/scenarios.sh 1 3        # 고른 것만
# 대상은 127.0.0.1만(run.mjs가 막는다). 기기 부하 load average가 100을 넘으면 멈춘다.
set -euo pipefail
cd "$(dirname "$0")"
API=${API:-http://127.0.0.1:8160}
CDN=${CDN:-http://127.0.0.1:8161}
CTRL=${CTRL:-http://127.0.0.1:8163}
LIVE=B7HQTPX1
GONE=B7GNEZZ1
q() { docker exec mong-db-1 psql -U mong -d mong_load -Atc "$1"; }
mem() { docker stats --no-stream --format "$1 {{.CPUPerc}} {{.MemUsage}}" mongload-api; }
guard() {
  local l; l=$(uptime | sed -E 's/.*load averages?: ([0-9.]+).*/\1/')
  if awk "BEGIN{exit !($l > 100)}"; then echo "load $l > 100 — 멈춥니다"; exit 1; fi
}
H() { curl -s -o /dev/null -w "%{http_code}" -H "x-forwarded-for: $1, 35.191.0.1" "${@:2}"; }
# 비콘·스토어 이동은 인스턴스 메모리에 모았다가 15초마다 한 문장으로 쓴다(B7a, src/pages/link-counter.ts) → DB 합계는 그 뒤에 본다
settle() { sleep 17; }
want=" ${*:-1 2 3 4 5} "

if [[ $want == *" 1 "* ]]; then
  echo "## 1. 링크 하나 10만/일 — 순간 60 rps(근거는 B7-report 2절), CDN 없음(전부 미적중) + 한계"
  guard; node run.mjs --url "$API/m/$LIVE" --rps 60 --sec 20 --ip unique --label m-live-60rps-nocdn
  guard; node run.mjs --url "$API/m/$LIVE" --mode closed --conc 40 --sec 15 --ip unique --label m-live-ceiling
  q "delete from app.link_daily"
  guard; node run.mjs --url "$API/m/$LIVE/seen" --method POST --rps 60 --sec 20 --ip unique --label seen-60rps
  settle; echo "link_daily: $(q "select event||'='||count from app.link_daily")  (보낸 수와 같아야 함)"
  q "delete from app.link_daily"
  guard; node run.mjs --url "$API/m/$LIVE/seen" --method POST --mode closed --conc 40 --sec 15 --ip unique --label seen-ceiling
  settle; echo "link_daily: $(q "select event||'='||count from app.link_daily")"
fi

if [[ $want == *" 2 "* ]]; then
  echo "## 2. 캐시 적중·미적중 — CDN 흉내(엣지 4, s-maxage 300초를 15초로 줄임, 요청 합치기 끔) + 비콘·스토어 이동은 직접"
  node cdn-sim.mjs --port 8161 --origin "$API" --edges 4 --ttl-scale 0.05 --collapse 0 & CDNPID=$!
  sleep 1; q "delete from app.link_daily"; guard
  node run.mjs --url "$CDN/m/$LIVE" --rps 60 --sec 60 --ip unique --label L1-html-via-cdn & P1=$!
  node run.mjs --url "$API/m/$LIVE/seen" --method POST --rps 60 --sec 60 --ip unique --label L1-seen & P2=$!
  node run.mjs --url "$API/m/$LIVE/get?p=ios" --rps 3 --sec 60 --ip unique --label L1-get & P3=$!
  wait $P1 $P2 $P3; settle
  echo "cdn: $(curl -s "$CDN/__stats")"; echo "link_daily: $(q "select string_agg(event||'='||count, ' ') from app.link_daily")"
  kill $CDNPID
fi

if [[ $want == *" 3 "* ]]; then
  echo "## 3. 레이트 리밋 경계(한 IP) — 기대: page 60·gone 30 뒤 429, seen 30·get 30 뒤 세지 않음(204·302 그대로, B7a), 전역 120(429 no-store)"
  q "delete from app.link_daily"
  echo "page  : $(for i in $(seq 70); do H 10.9.0.1 "$API/m/$LIVE"; echo; done | sort | uniq -c | xargs)"
  echo "gone  : $(for i in $(seq 40); do H 10.9.0.2 "$API/m/$GONE"; echo; done | sort | uniq -c | xargs)"
  echo "seen  : $(for i in $(seq 40); do H 10.9.0.3 -X POST "$API/m/$LIVE/seen"; echo; done | sort | uniq -c | xargs)"
  settle; echo "seen DB=$(q "select count from app.link_daily where event='view'")"
  echo "get   : $(for i in $(seq 40); do H 10.9.0.4 "$API/m/$LIVE/get?p=ios"; echo; done | sort | uniq -c | xargs)"
  for i in $(seq 60); do H 10.9.0.5 "$API/m/$LIVE" >/dev/null; done
  for i in $(seq 30); do H 10.9.0.5 -X POST "$API/m/$LIVE/seen" >/dev/null; H 10.9.0.5 "$API/m/$LIVE/get?p=ios" >/dev/null; done
  echo "전역 120 소진 뒤 /m 머리글:"; curl -s -D - -o /dev/null -H "x-forwarded-for: 10.9.0.5, 35.191.0.1" "$API/m/$LIVE" | grep -i -E "^HTTP|cache-control|retry-after"
fi

if [[ $want == *" 4 "* ]]; then
  echo "## 4. DB 지연 주입(지연 프록시) — /m 60 rps 20초씩"
  for d in 300 1000 4900 5100; do
    guard; curl -s "$CTRL/set?delay=$d" >/dev/null
    node run.mjs --url "$API/m/$LIVE" --rps 60 --sec 20 --ip unique --timeout 15000 --label "m-live-dbdelay-${d}ms"
    curl -s "$CTRL/set?delay=0" >/dev/null; sleep 8
  done
  q "delete from app.link_daily"; curl -s "$CTRL/set?delay=300" >/dev/null
  node run.mjs --url "$API/m/$LIVE/seen" --method POST --rps 60 --sec 20 --ip unique --timeout 15000 --label seen-dbdelay-300ms
  curl -s "$CTRL/set?delay=0" >/dev/null; settle; echo "link_daily view = $(q "select coalesce(sum(count),0) from app.link_daily")"; sleep 5
  echo "### 데운 풀에서 DB 응답 15초 멈춤(블랙홀)"
  (sleep 5; curl -s "$CTRL/set?hold=1" >/dev/null; sleep 15; curl -s "$CTRL/set?hold=0" >/dev/null) &
  node run.mjs --url "$API/m/$LIVE" --rps 60 --sec 25 --ip unique --timeout 60000 --label m-live-warm-pool-hold-15s; wait
  echo "healthz: $(curl -s -o /dev/null -w '%{http_code}' "$API/healthz")"
fi

if [[ $want == *" 5 "* ]]; then
  echo "## 5. 메모리 — 서로 다른 IP 홍수(전역 throttler·RateLimiter 키 증가). 512MiB 컨테이너는 OOM으로 죽을 수 있다(B7-report 4절)"
  mem before
  (for i in 1 2 3; do sleep 9; mem "t+$((i*9))s" || true; done) &
  guard; node run.mjs --url "$API/m/$LIVE/report" --mode closed --conc 40 --sec 25 --ip unique --label mem-throttler-only || true
  wait; sleep 30; mem idle+30s || true
  echo "(OOM 재현은 손으로: node run.mjs --url $API/m/$LIVE --mode closed --conc 40 --sec 60 --ip unique → docker inspect mongload-api --format '{{.State.OOMKilled}}')"
fi
