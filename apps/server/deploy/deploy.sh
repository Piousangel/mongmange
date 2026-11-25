#!/usr/bin/env bash
# mong-api 배포 도우미(B6). **기본은 dry-run** — 실행할 명령을 찍기만 한다. 실제로 실행하려면 --apply.
# 오너 노트북에서 오너 계정(gcloud auth login)으로 돈다. 비밀값을 읽거나 찍지 않는다(값 넣기는 b6-owner-guide.md 10단계, 오너 손으로).
#
#   apps/server/deploy/deploy.sh [--apply] [--env FILE] [--digest sha256:…] [--launch-week] <단계>...
#
# 단계(실제 순서·사이에 끼는 Supabase·비밀값 넣기는 docs/ops/b6-owner-guide.md):
#   check      템플릿을 채워 YAML·JSON 문법과 기대값(B7·architecture 설정)을 검사한다. gcloud 없이 돈다. 늘 먼저 돈다
#   apis       필요한 API 켜기
#   registry   Artifact Registry 저장소 mong(서울) + 정리 정책(최근 3개만)
#   accounts   서비스 계정 2개(mong-api-run: 실행, mong-scheduler: 호출)
#   secrets    비밀 4개의 **빈 자리**(서울 보관) + 실행 계정에 그 4개만 읽기 권한. 값은 넣지 않는다
#   logging    서울 로그 버킷 mong-logs 7일 + _Default 싱크 전환 + Cloud Run 플랫폼 요청 로그 제외
#   budget     예산 알림(25·50·100%)
#   build      linux/amd64 이미지 빌드 + 푸시(태그 = git 커밋) → 다이제스트를 찍는다
#   deploy     서비스 YAML을 채워 올리고 공개 호출(allUsers invoker)을 연다. --digest 필수(--apply일 때)
#   scheduler  호출 계정에 이 서비스 invoker만 주고 잡 3개(storage-gc·moderation·cdn-purge)를 만들거나 고친다
#   smoke      /healthz·/readyz(토큰은 Secret Manager에서 바로 헤더로 — 화면에 안 나옴)·cron 무인증 404
#
# 예) 전체를 미리 보기:  apps/server/deploy/deploy.sh check apis registry accounts secrets logging budget build deploy scheduler smoke
#     실제 실행:        apps/server/deploy/deploy.sh --apply apis registry accounts secrets
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$DEPLOY_DIR/../../.." && pwd)"
REGION=asia-northeast3
REPO=mong
SERVICE=mong-api
SECRETS=(DATABASE_URL SUPABASE_SERVICE_ROLE_KEY RECOVERY_PEPPER READY_TOKEN)
JOBS=(storage-gc moderation cdn-purge)
# 템플릿에서 채우는 자리 — 이 밖의 ${…}가 남으면 check가 실패한다
VARS=(PROJECT_ID PROJECT_NUMBER SUPABASE_URL HOPS_API HOPS_WEB HOPS_OTA METRIC_APP_VERSIONS MIN_INSTANCES IMAGE_DIGEST APP_VERSION)

APPLY=0
ENV_FILE="${HOME}/.config/mong/deploy.env"
IMAGE_DIGEST="${IMAGE_DIGEST:-}"
MIN_INSTANCES=0
STEPS=()

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while (($#)); do
  case "$1" in
    --apply) APPLY=1 ;;
    --env) ENV_FILE="$2"; shift ;;
    --digest) IMAGE_DIGEST="$2"; shift ;;
    --launch-week) MIN_INSTANCES=1 ;;
    -h|--help) usage 0 ;;
    check|apis|registry|accounts|secrets|logging|budget|build|deploy|scheduler|smoke) STEPS+=("$1") ;;
    *) echo "모르는 인자: $1" >&2; usage 2 ;;
  esac
  shift
done
((${#STEPS[@]})) || usage 2

# 입력값: 파일이 없으면 dry-run은 예시 파일로 돈다(명령 모양 보기용), --apply는 멈춘다
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
elif ((APPLY)); then
  echo "입력 파일이 없습니다: $ENV_FILE (deploy.env.example을 복사해 채우세요)" >&2; exit 2
else
  echo "[dry-run] $ENV_FILE 이 없어 예시 값(deploy.env.example)으로 보여 줍니다" >&2
  set -a; source "$DEPLOY_DIR/deploy.env.example"; set +a
fi
: "${PROJECT_ID:?}" "${PROJECT_NUMBER:?}" "${SUPABASE_URL:?}" "${HOPS_API:?}" "${HOPS_WEB:?}" "${HOPS_OTA:?}" "${METRIC_APP_VERSIONS:?}"
APP_VERSION="$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD 2>/dev/null || echo dev)"
AR_HOST="${REGION}-docker.pkg.dev"
IMAGE="${AR_HOST}/${PROJECT_ID}/${REPO}/${SERVICE}"
SERVICE_URL="https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"
RUN_SA="mong-api-run@${PROJECT_ID}.iam.gserviceaccount.com"
SCHED_SA="mong-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"
OUT="$(mktemp -d "${TMPDIR:-/tmp}/mong-deploy.XXXXXX")"
trap 'rm -rf "$OUT"' EXIT

say() { printf '\n== %s\n' "$*"; }
# 명령 하나: dry-run이면 찍고, --apply면 실행
run() {
  if ((APPLY)); then "$@"; else printf '[dry-run] '; printf '%q ' "$@"; printf '\n'; fi
}
# 파이프가 있는 명령(문자열 하나)
run_sh() {
  if ((APPLY)); then bash -c "$1"; else printf '[dry-run] %s\n' "$1"; fi
}
# 있으면 건너뛰고 없으면 만든다: exists <describe 명령…> -- <create 명령…>
ensure() {
  local describe=() create=()
  while [[ "$1" != -- ]]; do describe+=("$1"); shift; done; shift
  create=("$@")
  if ((APPLY)); then
    if "${describe[@]}" >/dev/null 2>&1; then echo "있음 — 건너뜀: ${describe[*]:0:4}"; else "${create[@]}"; fi
  else
    printf '[dry-run] (없을 때만) '; printf '%q ' "${create[@]}"; printf '\n'
  fi
}

# 템플릿 채우기: 정해진 이름의 ${VAR}만 바꾼다
render() {
  local src="$1" dst="$2" text val v
  text="$(cat "$src")"
  for v in "${VARS[@]}"; do
    val="${!v-}"
    text="${text//\$\{$v\}/$val}"
  done
  printf '%s\n' "$text" >"$dst"
}

render_all() {
  local digest="${IMAGE_DIGEST:-sha256:0000000000000000000000000000000000000000000000000000000000000000}"
  IMAGE_DIGEST="$digest" render "$DEPLOY_DIR/cloudrun/mong-api.service.yaml" "$OUT/mong-api.service.yaml"
  local j
  for j in "${JOBS[@]}"; do render "$DEPLOY_DIR/scheduler/$j.flags.yaml" "$OUT/$j.flags.yaml"; done
  cp "$DEPLOY_DIR/registry/cleanup-policy.json" "$OUT/cleanup-policy.json"
}

step_check() {
  say "check — 템플릿 채우기 + 문법·기대값 검사(gcloud 없음)"
  render_all
  # 주석 밖에 채우지 못한 ${…}가 남았는가
  if grep -v '^[[:space:]]*#' "$OUT"/*.yaml | grep -n '\${' >&2; then echo "채우지 못한 자리가 있습니다" >&2; exit 1; fi
  (cd "$REPO_ROOT" && OUT="$OUT" SERVICE_URL="$SERVICE_URL" RUN_SA="$RUN_SA" SCHED_SA="$SCHED_SA" node -e '
    const fs = require("fs"); const yaml = require("js-yaml"); const out = process.env.OUT;
    const fail = (m) => { console.error("check 실패: " + m); process.exit(1); };
    const eq = (a, b, what) => { if (String(a) !== String(b)) fail(`${what} = ${a} (기대 ${b})`); };
    const svc = yaml.load(fs.readFileSync(out + "/mong-api.service.yaml", "utf8"));
    const t = svc.spec.template, a = t.metadata.annotations, c = t.spec.containers[0];
    eq(svc.metadata.name, "mong-api", "서비스 이름");
    eq(svc.metadata.labels["cloud.googleapis.com/location"], "asia-northeast3", "리전");
    eq(svc.metadata.annotations["run.googleapis.com/ingress"], "all", "인그레스(README 4절)");
    eq(t.spec.containerConcurrency, 40, "동시성");
    eq(a["autoscaling.knative.dev/maxScale"], 3, "max 인스턴스");
    if (!["0", "1"].includes(a["autoscaling.knative.dev/minScale"])) fail("min 인스턴스는 0(소프트런칭) 또는 1(출시 주)");
    eq(t.spec.timeoutSeconds, 300, "요청 timeout(storage-gc attemptDeadline 이상)");
    eq(c.resources.limits.cpu, 1, "CPU"); eq(c.resources.limits.memory, "1Gi", "메모리(B7a 재시험 전)");
    eq(a["run.googleapis.com/startup-cpu-boost"], "true", "cpu-boost");
    eq(t.spec.serviceAccountName, process.env.RUN_SA, "실행 서비스 계정");
    if (!/^asia-northeast3-docker\.pkg\.dev\/[^/]+\/mong\/mong-api@sha256:[0-9a-f]{64}$/.test(c.image)) fail("이미지는 서울 AR + 다이제스트 고정: " + c.image);
    eq(c.startupProbe.httpGet.path, "/healthz", "startup 프로브"); eq(c.livenessProbe.httpGet.path, "/healthz", "liveness 프로브");
    const env = Object.fromEntries(c.env.map((e) => [e.name, e]));
    for (const s of ["DATABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RECOVERY_PEPPER", "READY_TOKEN"]) {
      if (!env[s] || !env[s].valueFrom || env[s].value !== undefined) fail(s + "는 Secret Manager 참조여야 한다(값 금지)");
      eq(env[s].valueFrom.secretKeyRef.name, s, s + " 비밀 이름");
    }
    for (const [k, v] of Object.entries(env)) if (v.value !== undefined && /postgres(ql)?:\/\/|sb_secret_|eyJ[A-Za-z0-9_-]{10,}/.test(v.value)) fail(k + "에 비밀값처럼 보이는 값");
    eq(env.NODE_ENV.value, "production", "NODE_ENV");
    eq(env.CRON_AUDIENCE.value, process.env.SERVICE_URL, "CRON_AUDIENCE");
    eq(env.CRON_SA_EMAIL.value, process.env.SCHED_SA, "CRON_SA_EMAIL");
    eq(env.STORAGE_DRIVER.value, "none", "STORAGE_DRIVER");
    eq(env.REPORT_AUTO_HIDE.value, "false", "REPORT_AUTO_HIDE(XFF 실측 전 끔)");
    for (const h of ["TRUSTED_PROXY_HOPS_API", "TRUSTED_PROXY_HOPS_WEB", "TRUSTED_PROXY_HOPS_OTA"]) if (!/^[1-5]$/.test(env[h].value)) fail(h + "는 운영에서 1~5");
    if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(env.SUPABASE_URL.value) && !/REPLACE/.test(env.SUPABASE_URL.value)) fail("SUPABASE_URL 형식");
    if (+env.DB_QUERY_TIMEOUT_MS.value <= +env.DB_STATEMENT_TIMEOUT_MS.value) fail("DB_QUERY_TIMEOUT_MS > DB_STATEMENT_TIMEOUT_MS");
    if (+env.DB_CONNECT_TIMEOUT_MS.value >= 2000) fail("DB_CONNECT_TIMEOUT_MS < READY_TIMEOUT_MS(2000)");
    const want = {
      "storage-gc": { s: "30 4 * * *", d: "300s", r: 2, min: "600s", max: "1200s", dbl: 1 },
      moderation: { s: "*/5 * * * *", d: "180s", r: 0 },
      "cdn-purge": { s: "* * * * *", d: "60s", r: 0 },
    };
    for (const [job, w] of Object.entries(want)) {
      const f = yaml.load(fs.readFileSync(`${out}/${job}.flags.yaml`, "utf8"));
      eq(f["--schedule"], w.s, job + " schedule"); eq(f["--time-zone"], "Asia/Seoul", job + " 시간대");
      eq(f["--uri"], `${process.env.SERVICE_URL}/internal/cron/${job}`, job + " uri");
      eq(f["--http-method"], "POST", job + " method");
      eq(f["--oidc-token-audience"], process.env.SERVICE_URL, job + " OIDC audience(= CRON_AUDIENCE)");
      eq(f["--oidc-service-account-email"], process.env.SCHED_SA, job + " OIDC 계정(= CRON_SA_EMAIL)");
      eq(f["--attempt-deadline"], w.d, job + " attemptDeadline"); eq(f["--max-retry-attempts"], w.r, job + " retryCount");
      if (w.min) { eq(f["--min-backoff"], w.min, job + " minBackoff"); eq(f["--max-backoff"], w.max, job + " maxBackoff"); eq(f["--max-doublings"], w.dbl, job + " maxDoublings"); }
      if (parseInt(f["--attempt-deadline"]) > t.spec.timeoutSeconds) fail(job + " attemptDeadline이 Cloud Run timeout보다 길다");
    }
    const pol = JSON.parse(fs.readFileSync(out + "/cleanup-policy.json", "utf8"));
    if (!pol.some((p) => p.action.type === "Keep" && p.mostRecentVersions && p.mostRecentVersions.keepCount >= 2)) fail("정리 정책에 최근 판 보존(Keep)이 없다");
    console.log("check 통과: 서비스 YAML 1·Scheduler 3·정리 정책 1 (동시성 40·max 3·timeout 300·1Gi·ingress all·비밀 4개는 이름만)");
  ')
  echo "채운 사본: $OUT (스크립트가 끝나면 지워짐)"
}

step_apis() {
  say "apis — 필요한 API 켜기"
  run gcloud services enable --project="$PROJECT_ID" \
    run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com cloudscheduler.googleapis.com \
    logging.googleapis.com monitoring.googleapis.com iam.googleapis.com iamcredentials.googleapis.com \
    firebase.googleapis.com firebasehosting.googleapis.com billingbudgets.googleapis.com
}

step_registry() {
  say "registry — Artifact Registry $REPO (서울) + 정리 정책"
  ensure gcloud artifacts repositories describe "$REPO" --location="$REGION" --project="$PROJECT_ID" -- \
    gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" --project="$PROJECT_ID" \
      --description="mong-api images (B6)"
  run gcloud artifacts repositories set-cleanup-policies "$REPO" --location="$REGION" --project="$PROJECT_ID" \
    --policy="$DEPLOY_DIR/registry/cleanup-policy.json" --no-dry-run
}

step_accounts() {
  say "accounts — 서비스 계정(역할은 secrets·scheduler 단계에서 자원 단위로만)"
  ensure gcloud iam service-accounts describe "$RUN_SA" --project="$PROJECT_ID" -- \
    gcloud iam service-accounts create mong-api-run --project="$PROJECT_ID" --display-name="mong-api runtime (no project roles)"
  ensure gcloud iam service-accounts describe "$SCHED_SA" --project="$PROJECT_ID" -- \
    gcloud iam service-accounts create mong-scheduler --project="$PROJECT_ID" --display-name="Cloud Scheduler -> mong-api /internal/cron (OIDC)"
}

step_secrets() {
  say "secrets — 비밀 ${#SECRETS[@]}개의 빈 자리(서울 보관) + 실행 계정 읽기 권한(비밀 하나씩)"
  local s
  for s in "${SECRETS[@]}"; do
    ensure gcloud secrets describe "$s" --project="$PROJECT_ID" -- \
      gcloud secrets create "$s" --project="$PROJECT_ID" --replication-policy=user-managed --locations="$REGION"
    run gcloud secrets add-iam-policy-binding "$s" --project="$PROJECT_ID" \
      --member="serviceAccount:$RUN_SA" --role=roles/secretmanager.secretAccessor --condition=None
  done
  echo "값은 넣지 않았습니다 — b6-owner-guide.md 10단계를 오너가 직접 합니다."
}

step_logging() {
  say "logging — 서울 버킷 mong-logs 7일, _Default 싱크 전환, Cloud Run 플랫폼 요청 로그 제외"
  local bucket="logging.googleapis.com/projects/${PROJECT_ID}/locations/${REGION}/buckets/mong-logs"
  ensure gcloud logging buckets describe mong-logs --location="$REGION" --project="$PROJECT_ID" -- \
    gcloud logging buckets create mong-logs --location="$REGION" --retention-days=7 --project="$PROJECT_ID" \
      --description="mong: 7 days, Seoul (architecture 5-2)"
  run gcloud logging buckets update mong-logs --location="$REGION" --retention-days=7 --project="$PROJECT_ID"
  # 플랫폼 요청 로그(IP·UA·전체 URL — /m 코드·/deletion 영수증 포함)는 받지 않는다. 5xx·지연 알림은 Cloud Monitoring 지표로 본다.
  # 앱 자체 로그(pino 화이트리스트: route 템플릿·상태·지연, IP 없음)는 남는다. DECISIONS 'B6 배포 준비' ③
  run gcloud logging sinks update _Default "$bucket" --project="$PROJECT_ID" \
    --add-exclusion='name=run-platform-requests,description=no IP/UA/URL request logs (B6),filter=log_id("run.googleapis.com/requests")'
  # 옛 _Default 버킷(global)은 위치를 못 바꾼다 → 새로 들어가는 것이 없게 된 뒤 보존을 최소(1일)로
  run gcloud logging buckets update _Default --location=global --retention-days=1 --project="$PROJECT_ID"
}

step_budget() {
  say "budget — 예산 알림(알림일 뿐 지출을 멈추지 않는다)"
  if ((APPLY)); then : "${BILLING_ACCOUNT:?deploy.env에 BILLING_ACCOUNT가 필요합니다}" "${BUDGET_AMOUNT:?}"; fi
  BILLING_ACCOUNT="${BILLING_ACCOUNT:-XXXXXX-XXXXXX-XXXXXX}"
  run gcloud billing budgets create --billing-account="$BILLING_ACCOUNT" --display-name="mong-monthly" \
    --budget-amount="$BUDGET_AMOUNT" --filter-projects="projects/$PROJECT_ID" \
    --threshold-rule=percent=0.25 --threshold-rule=percent=0.5 --threshold-rule=percent=1.0 \
    --threshold-rule=percent=1.0,basis=forecasted-spend
}

step_build() {
  say "build — linux/amd64 이미지(Apple Silicon에서도 Cloud Run용으로) → $IMAGE:$APP_VERSION"
  if ((APPLY)) && [[ -n "$(git -C "$REPO_ROOT" status --porcelain -- apps/server packages 2>/dev/null)" ]]; then
    echo "apps/server·packages에 커밋 안 된 변경이 있습니다 — 태그(커밋)와 이미지 내용이 달라지므로 멈춥니다" >&2; exit 1
  fi
  run gcloud auth configure-docker "$AR_HOST" --quiet
  run docker buildx build --platform linux/amd64 -f "$REPO_ROOT/apps/server/Dockerfile" \
    --build-arg "APP_VERSION=$APP_VERSION" -t "$IMAGE:$APP_VERSION" --push "$REPO_ROOT"
  run gcloud artifacts docker images describe "$IMAGE:$APP_VERSION" --format='value(image_summary.digest)'
  echo "위 다이제스트(sha256:…)를 deploy 단계의 --digest로 넘깁니다."
}

step_deploy() {
  say "deploy — 서비스 YAML 채우기 → services replace → 공개 호출"
  if ((APPLY)) && [[ ! "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]; then echo "--digest sha256:<64자>가 필요합니다(build 단계 출력)" >&2; exit 2; fi
  step_check >/dev/null
  run gcloud run services replace "$OUT/mong-api.service.yaml" --region="$REGION" --project="$PROJECT_ID"
  # 앱·Firebase rewrite가 인증 없이 부른다(권한 판단은 Nest — JWT·OIDC·READY_TOKEN)
  run gcloud run services add-iam-policy-binding "$SERVICE" --region="$REGION" --project="$PROJECT_ID" \
    --member=allUsers --role=roles/run.invoker
  echo "min 인스턴스 = $MIN_INSTANCES (출시 주에는 --launch-week로 다시 deploy)"
}

step_scheduler() {
  say "scheduler — 호출 계정 = 이 서비스 invoker만, 잡 ${#JOBS[@]}개(무료 3개 안)"
  render_all
  run gcloud run services add-iam-policy-binding "$SERVICE" --region="$REGION" --project="$PROJECT_ID" \
    --member="serviceAccount:$SCHED_SA" --role=roles/run.invoker
  local j
  for j in "${JOBS[@]}"; do
    if ((APPLY)) && gcloud scheduler jobs describe "$j" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
      gcloud scheduler jobs update http "$j" --location="$REGION" --project="$PROJECT_ID" --flags-file="$OUT/$j.flags.yaml"
    else
      run gcloud scheduler jobs create http "$j" --location="$REGION" --project="$PROJECT_ID" --flags-file="$OUT/$j.flags.yaml"
    fi
  done
}

step_smoke() {
  say "smoke — $SERVICE_URL"
  run curl -fsS "$SERVICE_URL/healthz"
  # 토큰은 Secret Manager에서 바로 헤더 파일로(화면·셸 기록에 남지 않음)
  run_sh "gcloud secrets versions access latest --secret=READY_TOKEN --project=$PROJECT_ID | sed 's/^/x-ready-token: /' | curl -fsS -H @- $SERVICE_URL/readyz"
  # cron은 토큰 없이 404여야 한다(경로가 있는지도 알리지 않음)
  run_sh "test \"\$(curl -s -o /dev/null -w '%{http_code}' -X POST $SERVICE_URL/internal/cron/storage-gc)\" = 404 && echo 'cron 무인증 404 확인'"
  # Scheduler가 실제로 통과하는지: moderation을 한 번 돌리고 상태를 본다(성공이면 status 비어 있음 = code 0)
  run gcloud scheduler jobs run moderation --location="$REGION" --project="$PROJECT_ID"
  run gcloud scheduler jobs describe moderation --location="$REGION" --project="$PROJECT_ID" --format='value(lastAttemptTime,status)'
}

((APPLY)) || echo "[dry-run] 아무것도 실행하지 않습니다. 실제 실행은 --apply" >&2
# check는 늘 먼저(템플릿이 틀리면 원격 명령 전에 멈춘다)
[[ " ${STEPS[*]} " == *" check "* ]] || step_check
for s in "${STEPS[@]}"; do "step_$s"; done
