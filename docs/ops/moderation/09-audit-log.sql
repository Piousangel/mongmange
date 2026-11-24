-- 운영 기록(최근 50건). 모든 운영 함수가 같은 트랜잭션에서 남긴다. 1년 뒤 지워진다(신고 기록과 같은 기간).
-- action: restore·restore_off·confirm_hide·auto_restore(격리 30일 기본값)·dismiss·mask_name·unmask_name·reopen·delete_request·delete_cancel(둘 다 코드 없음). actor = 실행한 DB 로그인
select at, action, target_kind, target_ref, note, actor
  from app.admin_actions
 order by at desc, id desc
 limit 50;
