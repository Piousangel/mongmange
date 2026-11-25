# 운영 DB 복원 런북 — 복원 뒤 지운 계정 다시 지우기

- 근거: architecture.md v2.2 3-8 '백업'·'삭제(파기) 절차' 3, 5-5, B2 독립 리뷰 m2(`docs/team/reviews/2026-11-20-b2-review.md`), 처리방침 ko·en 6절 '파기 방법'.
- 누가: 운영자(오너). 언제: Supabase 백업에서 운영 DB를 되돌릴 때마다. 리허설은 B7(새 임시 프로젝트, 3-8 '백업').

## 왜
백업(보관 7일)을 되돌리면 백업 시점 뒤에 지운 계정(사용자·세이브·`auth.users`)이 되살아난다. 처리방침은 '지운 계정은 되살아나지 않는다'를 약속한다.
그래서 지울 때 `deletion_log.subject_hmac`(user id의 단방향 HMAC, pepper 파생 키)을 **7일만** 남긴다. 그 기간 안에 복원하면 이 값으로 다시 지운다.

## 절차
1. **복원 전**, 지금 DB가 살아 있으면 지운 계정 표지를 내보낸다(복원하면 백업 뒤에 쌓인 `deletion_log` 행도 사라지므로).
   ```sql
   \copy (select requested_at, channel, kind, items, subject_hmac, subject_expires_at from app.deletion_log
          where subject_hmac is not null and subject_expires_at > now()) to 'deletion-marks.csv' csv header
   ```
   이 파일에는 개수와 해시만 있다. 끝나면 지운다(오너 노트북, 클라우드에 올리지 않음).
2. 백업을 복원한다(Supabase 대시보드). 복원 리허설이면 운영 데이터를 스테이징에 넣지 않는다(3-8 '백업').
3. **복원 뒤**, 1의 행을 다시 넣는다(receipt 열은 넣지 않는다 — 24시간짜리라 이미 의미가 없다).
   ```sql
   \copy app.deletion_log (requested_at, channel, kind, items, subject_hmac, subject_expires_at) from 'deletion-marks.csv' csv header
   ```
4. 다시 지우기를 **손으로 한 번 부른다**. `reapply-deletions`는 Scheduler 정기 잡이 **없다**(B6 준비 결정 — Scheduler 무료 3개 = `storage-gc`·`moderation`·`cdn-purge`만, `apps/server/deploy/README.md` 5절). 그래서 콘솔의 '지금 실행'은 쓸 수 없고, `mong-scheduler` 계정 이름으로 ID 토큰을 받아 직접 부른다(대상 `POST /internal/cron/reapply-deletions`, OIDC audience = `CRON_AUDIENCE` = 서비스 주소, 경로 없음).
   아래 한 덩어리를 **통째로** 붙여 넣는다(줄마다 나눠 붙이지 않는다. 원문 파일에서 복사하면 앞 공백 3칸은 뺀다 — `EOF` 줄이 맨 앞에 있어야 한다. `bash -s`가 아니라 `bash -c`인 까닭: gcloud가 표준 입력을 읽어 스크립트 나머지를 삼키지 않게). 역할 회수가 빠지지 않게 두 겹으로 막는다: ⓐ `trap … EXIT` — 성공·실패·Ctrl-C·터미널 닫힘(SIGHUP)에도 회수 ⓑ 30분 뒤 스스로 무효가 되는 조건부 바인딩 — 노트북이 꺼져 trap이 못 돌아도 30분 뒤 권한이 사라진다. 서비스 계정 리소스가 IAM 조건을 받는지는 [확인 필요]: 거절되면 조건 없이 다시 주고 ⓐ만 남는다(화면에 그렇게 찍힌다).
   ```sh
   P=<프로젝트 ID> NUM=<프로젝트 번호> bash -c "$(cat <<'EOF'
   set -u
   SA=mong-scheduler@$P.iam.gserviceaccount.com; ME=$(gcloud config get-value account 2>/dev/null)
   URL=https://mong-api-$NUM.asia-northeast3.run.app            # = CRON_AUDIENCE(경로 없음)
   ROLE=roles/iam.serviceAccountOpenIdTokenCreator             # 가장 좁은 역할(Owner에 이 권한이 있는지는 [확인 필요] — README 5절)
   # ⓪ 이미 같은 바인딩이 있었으면 끝에 회수하지 않는다(남의 바인딩을 지우지 않게)
   HAD=$(gcloud iam service-accounts get-iam-policy $SA --project=$P --flatten='bindings[].members' \
         --filter="bindings.role=$ROLE AND bindings.members=user:$ME" --format='value(bindings.role)')
   if [ -z "$HAD" ]; then
     trap 'gcloud iam service-accounts remove-iam-policy-binding $SA --member=user:$ME --role=$ROLE --all --project=$P >/dev/null && echo "역할 회수됨"' EXIT
     UNTIL=$(date -u -v+30M +%Y-%m-%dT%H:%M:%SZ)
     # ① 30분짜리 조건부 바인딩(거절되면 조건 없이)
     gcloud iam service-accounts add-iam-policy-binding $SA --member=user:$ME --role=$ROLE --project=$P >/dev/null \
       --condition="expression=request.time < timestamp('$UNTIL'),title=restore-runbook-30m" \
     || { echo "조건부 바인딩 거절 — 조건 없이 준다(trap이 회수)"; gcloud iam service-accounts add-iam-policy-binding $SA --member=user:$ME --role=$ROLE --project=$P --condition=None >/dev/null; }
   fi
   # ② 토큰 — IAM 전파는 보통 수십 초~2분. 권한 오류면 30초씩 최대 4번 다시(전파 지연을 audience 문제로 오해하지 않게)
   TOKEN=; for i in 1 2 3 4; do TOKEN=$(gcloud auth print-identity-token --impersonate-service-account=$SA --audiences=$URL --include-email 2>/dev/null) && break; echo "토큰 실패 $i/4 — IAM 전파 대기 30초"; sleep 30; done
   [ -n "$TOKEN" ] || { echo "토큰을 받지 못함 — 2분 넘게 실패면 ① 바인딩·계정을 확인"; exit 1; }
   # ③ 호출 — 토큰은 printf(셸 내장)로 헤더 파일(-H @-)에 넘겨 ps·셸 기록에 남기지 않는다
   printf 'Authorization: Bearer %s\n' "$TOKEN" | curl -sS -w '\nHTTP %{http_code}\n' -X POST -H @- $URL/internal/cron/reapply-deletions
   EOF
   )"
   ```
   응답 `{reapplied: n}`(HTTP 200)과 `restore_reapply` 경고 로그의 n을 기록하고, 마지막 줄에 '역할 회수됨'이 찍혔는지 본다(⓪에서 원래 있던 바인딩이면 찍히지 않는 것이 맞다). 응답이 **401·403**이면 audience(`URL`에 경로가 붙지 않았는지)와 서버 `CRON_SA_EMAIL`을 본다. 토큰 단계의 권한 오류는 전파 지연이 흔하니 1~2분 뒤 한 번 더 돌린다(②가 이미 2분 기다림). 명령의 뜻(역할·audience·헤더 파일)의 정본은 README 5절이다 — 달라지면 README를 따른다.
5. 바로 이어 `storage-gc`를 한 번 더 실행해 Auth 사용자 삭제를 마무리한다. 이 잡은 정기 잡이 있으므로 '지금 실행'(`gcloud scheduler jobs run storage-gc --location=asia-northeast3 --project=$P`)을 쓴다. `gc_stuck` 알림이 없으면 끝.
6. pepper를 그 사이 회전했다면, 옛 판이 `RECOVERY_PEPPERS_PREVIOUS`에 남아 있어야 옛 판으로 만든 표지도 찾는다(재삭제는 모든 판을 대 본다).

## 한계
- 지운 지 7일이 지난 표지는 없다 — 그 계정은 7일 넘은 백업에도 없으므로 되살아날 수 없다(백업 보관 7일).
- 1을 못 했고(지금 DB가 망가짐) 백업 시점 뒤에 지운 계정이 있으면 표지도 함께 사라진다. 이때는 그 기간의 삭제 영수증 문의를 받아 수동으로 지운다. 이 빈틈을 줄이려면 표지를 DB 밖(Secret Manager 등)에도 남겨야 한다 — 정식 출시 전 판단.
