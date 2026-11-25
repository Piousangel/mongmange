-- B6a 리뷰 H1: 서명 업로드 URL 꼬리 행. Supabase 서명 업로드 URL은 2시간 살아 있고 되돌릴 수 없다 → 발급(PUT page) 때 그 판 폴더를
-- '발급 + 2시간 + 여유' 뒤 staging에서 한 번 더 지우는 대기 행을 남긴다. creature_id·deletion_id 없이 둔다: 계정 삭제·링크 끄기·새 PUT이
-- 당기거나 지우지 않아 삭제 '뒤'에 늦게 도착한 업로드까지 지운다. 그때도 커밋 대기 중인 판이면 지우지 않고 행만 버린다(6시간 행이 맡음).
-- 날짜는 main의 B7a(20261125120000_b7a_link_flush) 뒤.
ALTER TYPE "app"."storage_gc_reason" ADD VALUE IF NOT EXISTS 'upload_tail';
