-- 복원: 문제없다고 판단한 격리본을 다시 공개한다. '________'를 인장 코드로, 두 번째 값을 판단 근거로 바꿔 Run.
-- 결과 'restore_queued' → 서버 작업 moderation(5분마다)이 파일을 공개로 옮기면 live. 바로 하려면 Cloud Scheduler에서 moderation '지금 실행'.
-- 결과 'off' → 주인이 격리 중에 링크를 꺼 두어 되살리지 않고 격리본을 지운다(주인의 끄기가 우선).
-- 같은 트랜잭션에서 신고 행 restored + 운영 기록(admin_actions 'restore').
select app.restore_page('________', '판단 근거: 신고 사유에 해당하는 모양이 없음');
