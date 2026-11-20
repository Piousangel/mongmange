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
4. 다시 지우기를 한 번 돌린다: Cloud Scheduler에서 `reapply-deletions` 잡을 '지금 실행'(대상 `POST /internal/cron/reapply-deletions`, OIDC audience = `CRON_AUDIENCE`). 응답 `{reapplied: n}`과 `restore_reapply` 경고 로그의 n을 기록한다.
5. 바로 이어 `storage-gc` 잡을 한 번 더 실행해 Auth 사용자 삭제를 마무리한다. `gc_stuck` 알림이 없으면 끝.
6. pepper를 그 사이 회전했다면, 옛 판이 `RECOVERY_PEPPERS_PREVIOUS`에 남아 있어야 옛 판으로 만든 표지도 찾는다(재삭제는 모든 판을 대 본다).

## 한계
- 지운 지 7일이 지난 표지는 없다 — 그 계정은 7일 넘은 백업에도 없으므로 되살아날 수 없다(백업 보관 7일).
- 1을 못 했고(지금 DB가 망가짐) 백업 시점 뒤에 지운 계정이 있으면 표지도 함께 사라진다. 이때는 그 기간의 삭제 영수증 문의를 받아 수동으로 지운다. 이 빈틈을 줄이려면 표지를 DB 밖(Secret Manager 등)에도 남겨야 한다 — 정식 출시 전 판단.
