# B6 첫날 실측 체크리스트 (한 장)

- 작성: DV-1·DV-3·QA-2, 2026-11-25(로드맵 B6b). 오너가 `b6-owner-guide.md` 1~14단계를 끝낸 **다음 날 아침**에 A·B를 위에서 아래로 한 번 돈다. **D(업타임·알림 만들기)는 T1 콜드 스타트 10회가 끝난 뒤**에 한다 — 업타임 U1(1분 점검)이 인스턴스를 데워 T1을 잴 수 없게 만들기 때문이다(B6b 리뷰 F2). T5b는 첫 preview 게시 뒤, C(리허설) 전.
- 흩어져 있던 곳: `apps/server/deploy/README.md` 7-3·9절(B6a 판은 10-2), `docs/design/server-v1/B7-report.md` 5·6절(L2·U1~U6·지표·로그 알림), DECISIONS 'B7a'(L3·L4·M3, web-edge)·'B6a'(L4·L5)·'C10'(리허설), `docs/release/privacy-policy.ko.md` 대조표 K4·K6·K7·K26·K27·K29·K30, `docs/design/server-v1/ota-self-host.md` 2·3·8·9절.
- 결과는 `docs/ops/b6-day1-<날짜>.md`에 항목 번호·출력(비밀값 없이)·통과/실패만 붙인다. 하나라도 실패면 그 줄의 '실패 시'만 하고 다음 줄로 간다(멈추라는 줄 제외).
- 셸 변수(비밀 아님): `P=<프로젝트 ID>` · `API=https://mong-api-<프로젝트 번호>.asia-northeast3.run.app` · `WEB=https://mongmang.ink` · `OTA=https://ota.mongmang.ink`
- 첫날 서버 상태(이 표의 기대값이 전제하는 것): `WEB_EDGE_CHECK=log`, `TRUSTED_PROXY_HOPS_API/WEB/OTA = 1/2/2`, `REPORT_AUTO_HIDE=false`, `STORAGE_DRIVER=none`(B6a 버킷 확인 전), min 0 · max 3.

## A. 오너가 할 단계 (gcloud·콘솔·비밀값이 필요한 것)

| # | 무엇 | 명령 | 기대값 | 실패 시 | 연결 |
|---|---|---|---|---|---|
| O1 | OTA 주소 연결 | 안내서 14단계 뒤 Hosting 콘솔 → 사용자 도메인에 `ota.mongmang.ink` 추가(안내서 271행) → web-static `firebase deploy --only hosting`(이 판부터 `/api/v1/ota/**` rewrite 포함) | 콘솔에 '연결됨', `curl -s -o /dev/null -w '%{http_code}' $OTA/api/v1/ota/manifest` 가 **400**(헤더 없음 = 서버가 답함). 404면 rewrite가 안 나감 | 404: 배포한 판에 rewrite가 있는지(`apps/web-static/firebase.json`) — 빌드 검사가 없으면 실패하므로 옛 판이 남은 것. 다시 배포 | ota-self-host 8절 1, DECISIONS 'V21 ①' |
| O2 | 처리방침 K6 증거 ①~④ | `apps/server/deploy/deploy.sh --apply k6` + Firebase 콘솔 > Hosting > 사이트 설정 > Cloud Logging 통합 화면 캡처 | ① exclusions에 `log_id("run.googleapis.com/requests")` ② `…/mong-logs 7` ③ **빈 출력** ④ '사용 안 함' | ①② `deploy.sh --apply logging` 다시. ③에 줄이 있으면 **멈추고** 시각을 팀에 — 제외 전 로그면 7일 뒤 소멸까지 `log-debug-record.md`에 적고, 제외 뒤 로그면 필터가 틀림. ④ 켜져 있으면 끈다 | 방침 K6·K26, README 7-3 |
| O3 | Storage 5항목(B6a) — 버킷 4개 만든 뒤, `STORAGE_DRIVER=supabase` **전** | 아래 'O3 명령' | ① 600KB 넘는 파일 서명 업로드 **거부**(4xx) ② 서명 토큰 `exp − iat = 7200` ③ list-v2가 `probe/a/b.jpg`까지 돌려줌 ④ 공개 응답 `cache-control: public, max-age=3600`·`content-type: image/jpeg` ⑤ `storage.objects` 정책 **0행** + 앱 사용자 JWT(익명 로그인)로 4버킷 모두 쓰기 **4xx**·목록 **빈 결과**(README 10-2 ⑤) | 하나라도 다르면 **링크 기능을 켜지 않고** 팀에 알림(README 10-2). ②가 더 길면 서버 `SIGNED_UPLOAD_TAIL_MS`를 함께 늘림(서버 담당) | DECISIONS 'B6a' L4·L5, 방침 K29 |
| O4 | 풀러 시작 매개변수·왕복 | 아래 'O4 명령'(오너 노트북, 트랜잭션 풀러 6543) | `statement_timeout 5s`, `idle_in_transaction_session_timeout 40s`, `rtt_ms` 숫자 | 기본값(0)이 나오면 Supavisor가 시작 매개변수를 버린 것 → 팀이 `ALTER ROLE prisma SET …` 두 줄을 마이그레이션으로 준비(서버 담당). 연결 자체 실패면 `smoke` `/readyz`도 실패했을 것 — 안내서 7-2 CA 확인 | DECISIONS 'B7a' L3, prisma.service.ts |
| O5 | web-edge 판정 개수 읽기(T3 직후) | `gcloud logging read 'jsonPayload.code=("web_edge_unverified" OR "web_edge_denied")' --freshness=30m --project=$P --format='value(timestamp,jsonPayload.code,jsonPayload.count)'` | T3-①(Firebase 경유) 시각대에 **0건**, T3-②(직접 호출 3번) 1분 안에 `web_edge_unverified 3` | ①에 개수가 있으면 Firebase 출구가 `goog.json − cloud.json` 밖(L4: 접속 IP 199.36.158.100도 goog.json에 없었음) → **enforce 금지**, 서버 담당이 대역 근거를 다시 정함(예비안: 부하 분산기 + Cloud Armor) | DECISIONS 'B7a' 직접 호출 차단·M3·L4 |
| O6 | 요청 로그 시한부 켜기(필요할 때만) | `deploy.sh --apply logs-on --hours 2` → 끝나면 `logs-off` + `docs/ops/log-debug-record.md` 한 줄 | 만료 뒤 O2 ③ 다시 빈 출력 | — (켤지 말지는 T2가 판정 못 할 때만. 기본은 켜지 않는다) | 방침 K6, README 7-2 |
| O7 | Scheduler 세 잡 OIDC | `for j in storage-gc moderation cdn-purge; do gcloud scheduler jobs run $j --location=asia-northeast3 --project=$P; done` → 2분 뒤 `gcloud scheduler jobs describe <잡> --location=asia-northeast3 --format='value(status)'` | 세 잡 모두 `status` 비어 있음(성공), 서버 로그에 401·403 없음 | 401·403 = audience가 `CRON_AUDIENCE`(경로 없는 서비스 주소)와 다름 → `deploy.sh --apply scheduler` 다시 | README 2절 Scheduler, architecture 2-4 |

**O3 명령**(서비스 롤 키는 화면·인자에 싣지 않는다 — 헤더 파일로):
```sh
S=https://<ref>.supabase.co/storage/v1; printf 'service role: '; read -rs K; echo; H=$(mktemp); chmod 600 $H; printf 'Authorization: Bearer %s\napikey: %s\n' "$K" "$K" > $H; unset K
# ① ② 서명 업로드 + 상한
R=$(curl -fsS -X POST -H @$H $S/object/upload/sign/page-staging/probe/a/b.jpg); echo "$R" | node -e "const t=JSON.parse(require('fs').readFileSync(0)).url.split('token=')[1];const p=JSON.parse(Buffer.from(t.split('.')[1],'base64url'));console.log('ttl',p.exp-p.iat)"
head -c 700000 /dev/urandom > /tmp/big.jpg; U=$(echo "$R" | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).url)")
curl -s -o /dev/null -w 'big %{http_code}\n' -X PUT -H 'content-type: image/jpeg' --data-binary @/tmp/big.jpg "$S$U"      # 4xx여야 함
# ③ 재귀 목록(작은 파일 하나를 서비스 롤로 올린 뒤)
printf '\xff\xd8\xff' | curl -fsS -X POST -H @$H -H 'content-type: image/jpeg' --data-binary @- $S/object/page-staging/probe/a/b.jpg >/dev/null
curl -fsS -X POST -H @$H -H 'content-type: application/json' -d '{"prefix":"probe/","with_delimiter":false}' $S/object/list-v2/page-staging
# ④ copy 메타데이터 → 공개 머리글
curl -fsS -X POST -H @$H -H 'content-type: application/json' -H 'x-upsert: true' -d '{"bucketId":"page-staging","sourceKey":"probe/a/b.jpg","destinationBucket":"public-pages","destinationKey":"probe/a/b.jpg","copyMetadata":false,"metadata":{"mimetype":"image/jpeg","cacheControl":"public, max-age=3600"}}' $S/object/copy
curl -sI https://<ref>.supabase.co/storage/v1/object/public/public-pages/probe/a/b.jpg | grep -iE '^(cache-control|content-type)'
# ⑤-2 앱 사용자 JWT로는 4버킷 쓰기·목록이 모두 막히는지(README 10-2 ⑤). publishable 키(sb_publishable_…)는 비밀 아님. 익명 사용자 하나가 생긴다(데이터 없음 — pg_cron 30일 정리 대상)
A=<publishable 키>; T=$(curl -fsS -X POST https://<ref>.supabase.co/auth/v1/signup -H "apikey: $A" -H 'content-type: application/json' -d '{}' | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).access_token)")
for b in page-staging public-pages quarantine ota-assets; do
  curl -s -o /dev/null -w "$b put %{http_code} " -X POST -H "apikey: $A" -H "Authorization: Bearer $T" -H 'content-type: image/jpeg' --data-binary 'x' $S/object/$b/probe/jwt.jpg     # 4xx여야 함
  curl -s -w " list %{http_code} " -X POST -H "apikey: $A" -H "Authorization: Bearer $T" -H 'content-type: application/json' -d '{"prefix":"probe/","with_delimiter":false}' $S/object/list-v2/$b; echo   # objects가 비어야 함(probe/a/b.jpg가 있어도)
done; unset T
# 치우기
curl -fsS -X DELETE -H @$H -H 'content-type: application/json' -d '{"prefixes":["probe/a/b.jpg"]}' $S/object/page-staging; curl -fsS -X DELETE -H @$H -H 'content-type: application/json' -d '{"prefixes":["probe/a/b.jpg"]}' $S/object/public-pages; rm -f $H /tmp/big.jpg
# ⑤ SQL 편집기: 0행이어야 함
#   select policyname, roles, cmd from pg_policies where schemaname='storage' and tablename='objects';
```

**O4 명령**(저장소 루트에서. URL의 `?sslmode=…`는 떼고 CA로 verify-full — B6a 10-1과 같은 방식):
```sh
printf 'DATABASE_URL(6543): '; read -rs DATABASE_URL; export DATABASE_URL; echo
node -e "const {Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL.split('?')[0],ssl:{ca:require('fs').readFileSync(process.argv[1],'utf8')},statement_timeout:5000,idle_in_transaction_session_timeout:40000});(async()=>{await c.connect();for(const k of ['statement_timeout','idle_in_transaction_session_timeout'])console.log(k,(await c.query('show '+k)).rows[0][k]);const t=Date.now();for(let i=0;i<20;i++)await c.query('select 1');console.log('rtt_ms',(Date.now()-t)/20);await c.end()})().catch(e=>{console.error(e.code||e.message);process.exit(1)})" <다운로드한 prod-ca.crt>
unset DATABASE_URL
```

## B. 팀이 할 단계 (공개 주소만 — 비밀값·GCP 권한 없이)

| # | 무엇 | 명령 | 기대값 | 실패 시 | 연결 |
|---|---|---|---|---|---|
| T1 | 콜드 스타트 L2 — **U1(1분 점검) 만들기 전에** | 20분 아무도 안 부른 뒤 `curl -s -o /dev/null -w '%{http_code} %{time_starttransfer}\n' $API/healthz`, 하루에 걸쳐 10번 | 10번 모두 200 · **< 3초** | 3초 넘는 회차가 있으면 이미지 크기·`cpu-boost` 확인 → 출시 주 `--launch-week`(min 1) 앞당김을 PM에 제안. U1이 생긴 뒤에는 데워져 측정이 안 된다 | B7-report 5절·L2, README 9-3 |
| T2 | XFF 홉 수(`HOPS_*`) — 행동으로 판정(서버는 IP를 기록하지 않는다) | 아래 'T2 명령' ①~③ | ① API: 21번째부터 **429**(위조 XFF 무시) ② `/m`: 31번째부터 429 ③ OTA: 61번째부터 429 — 셋 다, **곧바로 다른 회선(휴대폰 LTE)**에서 한 번 부르면 429가 **아님** | 끝까지 429가 안 남 = 위조 값이 키(HOPS가 큼) → 1 줄임. 다른 회선도 429 = 모두가 한 키(HOPS가 작아 Firebase 출구가 키이거나, 커서 소켓 주소로 떨어짐) → 1 늘려 다시. 고친 값은 service YAML·`deploy.sh check` 기대값·DECISIONS 'B6 배포 준비' ⑤·서버 e2e 고정물(실측 XFF 모양) 한 커밋 | 방침 K4(IP 약 1분), architecture 3-8, README 9-1 |
| T3 | web-edge: Firebase 출구가 대역 안인가 | ① `for i in $(seq 1 5); do curl -s -o /dev/null $WEB/m/TESTTEST?b6=$i; done` ② 1분 뒤 `for i in 1 2 3; do curl -s -o /dev/null $API/m/TESTTEST; done` → 시각을 오너에게(O5) | O5 기대값대로(①은 0, ②는 3) | O5 '실패 시'. **enforce 전환 조건**: 이 줄 통과 + log 모드 며칠 `web_edge_unverified` 0 → 그 뒤 `WEB_EDGE_CHECK=enforce`(M3 위조 키 밀어내기가 그때 닫힘) | DECISIONS 'B7a' M3·L4 |
| T4 | 캐시 머리글 보존 — `/m` | `diff <(curl -sI $API/m/TESTTEST \| grep -i '^cache-control') <(curl -sI $WEB/m/TESTTEST \| grep -i '^cache-control')` | 차이 없음. 값은 live `public, max-age=60, s-maxage=300` / 사라진 링크 `…s-maxage=60` / 503·429 `no-store` | 다르면 Hosting이 덮은 것 → firebase.json `/m/*`에 Cache-Control이 끼었는지(빌드 검사가 막아야 함), 아니면 Firebase 동작 — 서버 담당과 판단. **503·429가 캐시되면 즉시 PM**(한 IP가 링크를 모두에게 막음) | 방침 K29, B3 리뷰 I3 |
| T5 | 캐시 머리글 보존 — OTA | 아래 'T2·T5 공통' `M=` 정의 뒤 `curl -sS -o /dev/null -D - $OTA/api/v1/ota/manifest "${M[@]}"`를 **두 번**, 그리고 `$API/api/v1/ota/manifest`로 한 번 | 두 번 모두 **204** · `cache-control: private, max-age=0` · `expo-protocol-version: 1` · 둘째 응답에 `age:`·캐시 적중 표지 없음 · `expo-server-defined-headers` 없음 · 직접 호출과 같은 cache-control. 에셋 `curl -sI $OTA/api/v1/ota/assets/$(printf 'A%.0s' {1..43})` 는 `no-store`(저장소 none → 404/503) | 400 = Hosting이 `expo-*` 요청 헤더를 떨굼 → **OTA를 Firebase 경유로 못 씀**, PM·서버(대안: 앱이 run.app 직접) [확인 필요]. cache-control이 바뀌거나 캐시되면 롤백이 늦게 닿음 → 빌드 검사(`firebase.json` OTA 헤더 금지)·Firebase 동작 확인. 큰 에셋은 Hosting → Cloud Run **60초 요청 제한(공식 문서 확정)** 때문에 T5b로 잰다 | ota-self-host 2·3절·8절 1, 방침 K7·K27 |
| T5b | 60초 제한 — 가장 큰 에셋 × 느린 회선(**첫 preview 게시 뒤, R4 전**) | 아래 'T5b 명령' | gzip·br·원본 세 꼴 모두 `200`·받은 크기 = `content-length`·`time_total` **≤ 45초**(60초에 여유 15초). Android 기본은 gzip이라 **gzip 줄이 기준** | 넘거나 504·중간 끊김 = 60초가 내려보내는 시간까지 센다 → **에셋만 Firebase를 거치지 않게** 옮긴다: ① 처리방침 K27·테스터판 1-1·6절 개정 먼저(release 담당) ② 서버 담당이 에셋 경로를 직접 호출 그룹(HOPS 1)으로 나누고 30초 공개 경로 제한에서 뺌 ③ 게시 `--asset-base-url`을 run.app으로 + 이미 나간 판 republish ④ T5b·R4 다시. 절차 정본 `ota-self-host.md` 10-1. 매니페스트 주소(app.json)는 그대로 — 동결(12-19)과 무관 | ota-self-host 10-1, 방침 K27, 테스터판 1-1·6절, DECISIONS 'B6b 판정' |
| T6 | `/m` 요청 머리글 보존(Sec-Fetch-Site·Origin) — 부작용 없는 꼴(본문 없음 → 신고 0건) | `R=(-s -o /dev/null -w '%{http_code}\n' -X POST $WEB/m/TESTTEST/report -H 'content-type: application/x-www-form-urlencoded' -d '')` 뒤 ① `curl "${R[@]}" -H 'sec-fetch-site: cross-site' -H 'origin: https://mongmang.ink'` ② `curl "${R[@]}" -H 'origin: https://mongmang.ink'` ③ `curl "${R[@]}" -H 'origin: https://evil.example'` | ① **403** ② **400**(같은 출처 통과, 사유 없음) ③ **403** | ①이 400 = Sec-Fetch-Site가 사라짐 → 옛 브라우저 경로(Origin)로만 막히는 것, 서버 담당에 알림. ②가 403 = Origin이 바뀜 → **웹 신고가 늘 막힘**, 즉시 서버 담당 | B5 리뷰 C1, README 9-2 |
| T7 | 업타임 U1~U6 손으로 한 바퀴(D1 설정 넘기기 전) | U1 `curl -s $API/healthz` · U3 `curl -s $WEB/m/TESTTEST \| grep -c '몽망이'` · U4 `curl -sI $WEB/.well-known/apple-app-site-association`·`…/assetlinks.json` · U5 `curl -s $WEB/config/v1.json \| node -e "JSON.parse(require('fs').readFileSync(0))"` · U6 T5 명령. U2는 토큰이 있어 D1에서 | U1 200 `"ok":true` · U3 200·1 이상(시드 링크) · U4 200 `application/json` · U5 파싱 성공 · U6 200 또는 204 | U3이 503 = DB 또는 Storage none(시드 링크가 아직 없음) → 시드 뒤 다시, U3 점검은 그때 켠다 | B7-report 6절 |
| T8 | 정리·넘기기 | 결과 파일 커밋, 확정한 값은 '확인 필요' 지우기: README 9절·DECISIONS 'B6 배포 준비'·'B7a'·'B6a' 남은 줄, 방침 대조표 K6·K26(증거 경로), K30은 T2 통과 뒤에만 '켤 수 있음' | — | — | 방침 대조표, roadmap B6 |

**T2·T5 공통**(위조 XFF는 맨 왼쪽에 들어간다 — 앞단이 오른쪽에 덧붙이므로):
```sh
M=(-H 'expo-protocol-version: 1' -H 'expo-platform: android' -H 'expo-runtime-version: b6probe' -H 'expo-channel-name: preview' -H 'accept: multipart/mixed')
# ① API(앱 직접, HOPS_API) — /ping 20/분
for i in $(seq 1 22); do curl -s -o /dev/null -w '%{http_code} ' -X POST $API/api/v1/ping -H 'content-type: application/json' -H "x-forwarded-for: 198.51.100.$i" -d '{}'; done; echo
# ② /m(Firebase 경유, HOPS_WEB) — 사라진 링크 30/분. 질의 문자열로 CDN 적중을 피한다
for i in $(seq 1 32); do curl -s -o /dev/null -w '%{http_code} ' "$WEB/m/ZZZZZZZZ?b6=$RANDOM$i" -H "x-forwarded-for: 198.51.100.$i"; done; echo
# ③ OTA(Firebase 경유, HOPS_OTA) — 매니페스트 60/분
for i in $(seq 1 62); do curl -s -o /dev/null -w '%{http_code} ' $OTA/api/v1/ota/manifest "${M[@]}" -H "x-forwarded-for: 198.51.100.$i"; done; echo
```
- 리밋은 인스턴스 메모리라 인스턴스가 둘 이상이면 숫자가 흩어진다. 첫날(min 0·트래픽 0)은 하나일 것 — 흩어지면 1분 쉬고 한 번 더.
- OTA는 web-edge 판정을 받지 않는다(`/m/**`만). `*.run.app/api/v1/ota/*` 직접 호출에서는 HOPS 2 위치가 위조 값이라 매니페스트 리밋을 피할 수 있다 — 매니페스트는 서명 원문을 돌려줄 뿐이고 DB 읽기 1번이라 영향은 작다. 넓힐지는 T3 통과 뒤 서버 담당이 정한다(DECISIONS 'B7a' 앱 API와의 관계).

**T5b 명령**(게시한 판의 런타임 `<rv>`·채널을 넣는다. 매니페스트를 JSON 꼴로 받아 가장 큰 파일인 번들 주소를 꺼낸다. 1Mbps = `--limit-rate 125k`):
```sh
J=(-H 'expo-protocol-version: 1' -H 'expo-platform: android' -H "expo-runtime-version: <rv>" -H 'expo-channel-name: preview' -H 'accept: application/expo+json')
B=$(curl -fsS $OTA/api/v1/ota/manifest "${J[@]}" | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).launchAsset.url)"); echo "$B"
for enc in gzip br identity; do
  curl -s -o /dev/null --limit-rate 125k -H "accept-encoding: $enc" -w "$enc %{http_code} size=%{size_download} %{time_total}s\n" "$B"
done
# 같은 판의 iOS(`expo-platform: ios`)도 한 번. 실패 판정이면 같은 명령을 $API 주소로 바꿔 직접 호출은 통과하는지 대조한다
```

## C. 리허설(12-12, C10) — B6 뒤 같은 표에 이어 적는다

| # | 누가 | 명령 | 기대값 | 실패 시 | 연결 |
|---|---|---|---|---|---|
| R1 | 팀 | 리허설 AAB에서 `bundletool dump manifest --bundle <aab> \| grep -c 'com.google.android.gms.permission.AD_ID'` | **0** | 라이브러리가 끌고 옴 → 설정 플러그인으로 `tools:node="remove"`(C10 담당), Data safety·연령 답변 다시 확인 | `docs/release/age-rating-answers.md` 4c |
| R2 | 오너+팀 | 실기기에서 `https://mongmang.ink/m/TESTTEST` 탭, Android `adb shell pm get-app-links <패키지>` | 앱이 열림, `mongmang.ink: verified` | AASA·assetlinks 값(T7 U4)과 app.json `withAppLinks` props가 같은지 — 두 곳 같은 값 규칙 | DECISIONS 'C10' 리허설 항목 |
| R3 | 팀 | 위젯 추가 → 앱 `writeWidgetValue` → 위젯 값, 위젯 확장 판 번호(ITMS-90473 여부) | 두 플랫폼 값 표시, 경고 없음 | C10 담당 | DECISIONS 'C10' L1 |
| R4 | 오너+팀 | OTA 리허설: EAS 빌드 로그 런타임 = `ota-cli publish`의 `rv=` → preview 게시 → 실기기 받기·서명 검증·롤백 1회(`$OTA` 경유) | 받기·롤백 모두 다음 실행에 적용, 서버 로그에 설치 id 0 | 런타임 불일치 = fingerprint 입력이 빌드 환경마다 다름(V21 리뷰 H1) — 게시 중단 | ota-self-host 8절 5, 방침 K7·K8 |

**기기 이동·충돌 수동 시나리오(C13, Q9·Q5)** — R5~R13을 **iOS·Android 각 20회 이상**(조합을 바꿔 가며) 돌리고, 회차마다 `R번호/플랫폼/회차/통과·실패/화면`을 결과 파일에 한 줄씩 남긴다. 공통 통과 조건: 어느 회차에도 몽망이 본이 사라지지 않음(기기 본·공방 노트 칸·서버 본·서버 conflict 칸 중 어딘가에 남음), 사용자가 고르지 않았는데 서버 본이 바뀌지 않음, '지웠어요'·'되찾았어요'가 사실과 다르지 않음. 자동판은 `apps/mobile/test/c13-*.test.ts`(같은 불변식, 시드 재현) — 실기기에서 실패하면 그 흐름을 사건 열로 옮겨 자동판에 고정한다.

| # | 누가 | 명령 | 기대값 | 실패 시 | 연결 |
|---|---|---|---|---|---|
| R5 | 팀 | 두 기기 번갈아: A 켜기 → 글귀 적기 → B 되찾기(글귀 + 인장 코드) → 나란히에서 '이 기기'/'서버 본'을 번갈아 → A·B를 바꿔 다시 | 나란히 화면이 매번 뜸(자동으로 고르지 않음), 진 본은 공방 노트 칸(30일)·서버 conflict 칸에 보임, 옛 기기는 '옮겨 감' | 멈춤 — 맡겨 두기 플래그 켜지 않음 | DECISIONS 'C13', architecture 3-4 |
| R6 | 팀 | 같은 로그인 두 작성자: 세션 백업 제외 **전** 빌드에서 백업 복원(세션까지 따라옴) → 두 기기에서 각자 하루 키운 뒤 차례로 '지금 맡기기' | 두 번째 기기에 409 나란히, 고르기 전에는 올리지 않음 | 멈춤(자동판 변이 M1과 같은 결함) | C12 '충돌이면 자동으로 고르지 않는다' |
| R7 | 팀 | OS 백업 복원 뒤 옛 기기 계속 사용: A 백업 → 새 폰 복원(세션 없음) → 새 폰 '지금 맡기기', A는 그대로 키우며 맡기기 | 새 폰 '예전 계정' 안내(orphaned, 서버 본 지우지 않음), A 맡기기 정상 | 새 폰이 세션을 들고 왔으면 세션 백업 제외(C10b) 실패 — R6으로 | Q9, B2b 리뷰 H1 |
| R8 | 팀 | 되찾은 뒤 옛 기기 업로드: B가 되찾은 다음 A에서 키우고 '지금 맡기기' | A는 410 '옮겨 감', A 기기 몽망이 그대로·로컬 게임 계속 | — | Q9 |
| R9 | 팀 | 삭제 직후 옛 토큰: A 지우기(끝 네 자) 도중 비행기 모드 / 지운 직후 옛 세션 기기에서 맡기기 | 끊기면 '확인 필요'(지웠다고 하지 않음), 다시 확인에서만 '지웠어요', 옛 토큰 PUT은 401/410 | '지웠어요'가 202·같은 로그인 410 없이 뜨면 멈춤 | B2b, 자동판 변이 M4 |
| R10 | 팀 | 오프라인 7일: 비행기 모드로 7일(또는 날짜를 하루씩 7번 넘김) 매일 앱 열기·깸 → 다시 연결 → '지금 맡기기' | 끊긴 동안 '연결 없음'만(세션·기록 그대로), 다시 붙으면 토큰 갱신 → 서버가 바뀌었으면 나란히, 통계 켠 기기는 7일 창 안 사건만 보냄 | — | 자동판 `c13-scenarios` 오프라인 7일 |
| R11 | 팀 | 느린 서버(프록시 지연 10·20·30초, 응답 직전 끊기): 맡기기·되찾기·서버 본으로 이어 가기·지우기 각 1회 | 4초에 '조금 느려요', 15초 넘으면 '다시 시도'(맡기기·되찾기·이어 가기) / '확인 필요'(지우기), 다시 시도 뒤 rev 한 번만 오름, 기기 본 그대로 | — | Q5·L6, 자동판 느린 서버 |
| R12 | 팀 | 시계 조작: 기기 날짜 +31일·+400일·−40일로 바꾼 뒤 공방 노트·맡겨 두기 시트 열기, 다시 원래 날짜 | 칸은 '만료됨' 표시만, 개수·내용 그대로(자동 삭제 0) | 칸이 하나라도 사라지면 멈춤 | 재리뷰 5 V4·V5, 자동판 변이 M2 |
| R13 | 팀 | 결함 D1 확인(고친 뒤): 되찾기 → '서버 본' → 하루 키움 → '바꾸기 전으로 되돌리기' → '다시 고르기'에서 다시 '서버 본' | 키운 하루(되돌리기로 칸에 들어간 본)가 어딘가에 남음 | 고치기 전에는 사라지는 것이 지금 동작(알려진 결함) — 고친 판에서만 통과 판정 | DECISIONS 'C13' D1 |

## D. 다음 날 — 업타임·알림 만들기(T1 10회 **뒤**)

| # | 누가 | 무엇 | 기대값 | 실패 시 | 연결 |
|---|---|---|---|---|---|
| D1 | 오너 | Cloud Monitoring 업타임 U1~U6 생성(3개 지역 이상, 표는 B7-report 6절). U2는 **업타임 전용** `x-ready-token`(운영 토큰 재사용 금지). **U6은 요청 머리글 5개**(`expo-protocol-version: 1`·`expo-platform: android`·`expo-runtime-version: uptime`·`expo-channel-name: production`·`accept: multipart/mixed`)를 넣는다 — 없으면 늘 400이다 | 6개 모두 초록. U6 = 204(판 없음) 또는 200 | 비용·무료 한도 [확인 필요] — 넘으면 U4·U5 주기를 늘림. U3은 시드 링크가 생긴 뒤에 켬(T7) | B7-report 6절, README 9-5 |
| D2 | 오너 | 지표 알림(경고): Cloud Run **5xx 비율 > 2%(5분)** · **지연 p95 > 1초(10분)**(`/m/:code`·`/api/v1/*`) · **인스턴스 수 = 3(10분)** | 정책 3개 생성, 시험 알림 1회 수신 | — | B7-report 6절 지표 |
| D3 | 오너 | 지표 알림(**긴급** — 메일 + 슬랙): **컨테이너 메모리 사용률 > 80%(5분)** · **컨테이너 재시작·OOM 1회** | 정책 2개 | — | B7-report 6절(B2 OOM 전조) |
| D4 | 오너 | 로그 기반 알림(경고): `m_db_unavailable` 분당 > 10(5분) · `link_cells_dropped`·`link_flush_lost`·`metric_flush_lost` ≥ 1 · `web_edge_unverified`·`web_edge_denied`(log 모드 > 0이면 enforce 보류, enforce 뒤 급증) · error 로그 `gc_stuck`·`report_auto_hidden_burst`·`moderation_sla`·`storage_bucket_mismatch`·`cdn_purge_failed`·`web_edge_ranges_stale` | `jsonPayload.code="…"` 필터 알림 생성, 각 1회 시험 로그로 수신 확인 | 로그 알림 수·비용 [확인 필요] | B7-report 6절 로그, DECISIONS 'B7a' L1·'B6a' |
| D5 | 오너 | 예산 알림 확인: GCP 30·60·120달러(`deploy.sh budget`이 만든 25·50·100%·예측 100%) + Firebase 전송량 | 결제 콘솔에 예산 1개·임계값 4개 | `deploy.sh --apply budget` 다시 | B7-report 6절, README 2절 예산 |
| D6 | 팀 | web-edge 대역 **매일 갱신 예약 작업**: `node apps/server/scripts/update-google-edge-ranges.mjs --check`를 예약 CI로(바뀌면 갱신 PR·알림) | 첫 실행 통과·다음 날 실행 기록 | 없으면 이미지 안 스냅숏이 7일 뒤 `web_edge_ranges_stale` 경고(D4가 받음) | DECISIONS 'B7a' 갱신 |
| D7 | 팀 | 남은 [확인 필요] 셋을 이 결과 파일에 닫는다: ① Cloud Run 서울(Tier 2) 무료 한도·송신 단가(공식 가격표) ② 요청 밖 타이머 지연 — 트래픽 끊긴 인스턴스의 링크 퍼널 칸이 SIGTERM flush로 들어오는지(`link_flush_lost` 0) ③ Apps Script UrlFetch 출구가 web-edge 대역 안인지(쿼터상 홍수 수단 아님 — 기록만) | 세 줄 모두 근거 링크·수치 | — | README 9-6, DECISIONS 'B7a' 남은 것·L5 |
