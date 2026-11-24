# B7 로컬 부하 시험 도구

결과와 해석은 `docs/design/server-v1/B7-report.md`. 여기는 **다시 돌리는 법**만.

새 의존성 없음 — Node 내장 모듈만 쓴다(k6·autocannon·toxiproxy 대신). 부하는 **127.0.0.1에만** 보낸다(`run.mjs`가 다른 호스트를 거부).

| 파일 | 하는 일 |
|---|---|
| `run.mjs` | 부하 발생기. open(목표 rps)·closed(동시 N) 방식, XFF로 클라이언트 IP 흉내(`--ip unique·pool:N·fixed·none`). 결과 JSON 한 줄 |
| `cdn-sim.mjs` | Firebase Hosting 자리의 공유 캐시 흉내(s-maxage 존중, 엣지 수·TTL 축소·요청 합치기 켜고 끄기, `/__stats`) |
| `delay-proxy.mjs` | api ↔ Postgres TCP 지연 프록시(지연 ms·블랙홀·연결 끊기, 제어 HTTP 8163) |
| `seed.sql` | 격리 DB `mong_load`에 살아 있는 링크 `B7HQTPX1`·꺼진 링크 `B7GNEZZ1` |
| `scenarios.sh` | 시나리오 1~5를 짧게 차례로 |

## 준비 (저장소 루트에서)

기존 컨테이너(`mong-db-1`·`mong-api-1`)는 건드리지 않는다. 시험은 **별도 DB `mong_load`**와 **포트 8160~8169**만 쓴다.

```bash
# 0) db가 떠 있는지(54329)
docker ps --filter name=mong-db-1

# 1) 격리 DB + 마이그레이션 + 시드
docker exec mong-db-1 psql -U mong -d mong -c "CREATE DATABASE mong_load OWNER mong" \
  -c "GRANT CONNECT, CREATE ON DATABASE mong_load TO prisma" -c "GRANT CONNECT ON DATABASE mong_load TO ota_publisher"
docker exec mong-db-1 psql -U mong -d mong_load -c "GRANT USAGE, CREATE ON SCHEMA public TO prisma"
docker compose -f apps/server/compose.yaml run --rm --no-deps \
  -e DIRECT_URL=postgresql://prisma:prisma-local@db:5432/mong_load migrate
docker exec -i mong-db-1 psql -U prisma -d mong_load -v ON_ERROR_STOP=1 < apps/server/load/seed.sql

# 2) 지연 프록시(도커 네트워크 안, 제어만 호스트 127.0.0.1:8163)
docker run -d --name mongload-delay --network mong_default -p 127.0.0.1:8163:8163 \
  -v "$PWD/apps/server/load:/load:ro" --entrypoint node mong-api:local /load/delay-proxy.mjs

# 3) api 한 개(운영 이미지 mong-api:local, 8160). /m live 페이지를 내려면 저장소 드라이버가 local이어야 하고,
#    local은 운영 모드에서 부팅 거부라 NODE_ENV=development로 띄운다(B7-report 1절 한계)
docker compose -f apps/server/compose.yaml run -d --no-deps --name mongload-api -p 127.0.0.1:8160:8080 \
  -e NODE_ENV=development -e STORAGE_DRIVER=local -e STORAGE_LOCAL_DIR=/tmp/store \
  -e STORAGE_LOCAL_BASE_URL=http://127.0.0.1:8160 \
  -e DATABASE_URL=postgresql://prisma:prisma-local@mongload-delay:6432/mong_load api
# Cloud Run 한 인스턴스 크기로 묶는다(1 vCPU·512MiB)
docker update --cpus 1 --memory 512m --memory-swap 512m mongload-api
curl -s 127.0.0.1:8160/healthz
```

## 돌리기

```bash
bash apps/server/load/scenarios.sh        # 1~5 전부(약 8분)
bash apps/server/load/scenarios.sh 3      # 레이트 리밋만
node apps/server/load/run.mjs --url http://127.0.0.1:8160/m/B7HQTPX1 --rps 60 --sec 20 --ip unique
curl '127.0.0.1:8163/set?delay=300'       # DB 왕복마다 +300ms
curl '127.0.0.1:8163/set?hold=1'          # DB 응답 멈춤(블랙홀), hold=0으로 풀기
```

- 시험마다 짧게(20~60초). `uptime` load average가 100을 넘으면 `scenarios.sh`가 멈춘다.
- 시나리오 5는 메모리를 보는 것이라 **컨테이너가 OOM으로 죽을 수 있다**(그게 결과다). `docker start mongload-api`로 다시 띄운다(`docker update` 제한은 유지된다).
- 레이트 리밋 창은 인스턴스 메모리라, 시나리오 3을 1분 안에 다시 돌리면 이전 창이 남아 숫자가 달라진다.

## 정리

```bash
docker rm -f mongload-api mongload-delay
pkill -f cdn-sim.mjs || true
docker exec mong-db-1 psql -U mong -d mong -c "DROP DATABASE mong_load"   # db 컨테이너는 그대로
```

## B6 뒤(스테이징)

`run.mjs`는 지금 127.0.0.1만 허용한다. 스테이징(`mong-api-staging`)에 돌릴 때는 허용 목록에 그 호스트 **하나만** 명시적으로 더하는 변경을 따로 리뷰받는다(운영 호스트는 넣지 않는다). 실제 Firebase CDN·Supabase 풀러 왕복이 들어가므로 수치는 B7-report 5절의 환산 대신 실측으로 바꾼다.
