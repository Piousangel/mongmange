-- B7 부하 시험 시드(격리된 DB `mong_load` 전용 — 운영·개발 DB `mong`에 넣지 않는다).
-- 살아 있는 링크 1개(B7HQTPX1)와 사라진 링크 대조용 코드(B7GNEZZ1, 꺼짐) 하나. 여러 번 돌려도 같은 상태가 된다.
BEGIN;
DELETE FROM app.link_daily WHERE code IN ('B7HQTPX1', 'B7GNEZZ1');
DELETE FROM app.users WHERE id IN ('00000000-0000-4000-8000-00000000b701', '00000000-0000-4000-8000-00000000b702');
INSERT INTO app.users (id) VALUES ('00000000-0000-4000-8000-00000000b701'), ('00000000-0000-4000-8000-00000000b702');
INSERT INTO app.creatures (id, user_id, code, link_enabled)
VALUES ('00000000-0000-4000-8000-00000000c701', '00000000-0000-4000-8000-00000000b701', 'B7HQTPX1', true),
       ('00000000-0000-4000-8000-00000000c702', '00000000-0000-4000-8000-00000000b702', 'B7GNEZZ1', false);
INSERT INTO app.public_pages (creature_id, store_key, ver, state, meta, name_shown, path_prefix, has_loop, published_at)
VALUES ('00000000-0000-4000-8000-00000000c701', 'b7000000000000000000000000000a01', 1, 'live',
        '{"snap":1,"ink":"songyeon","bornDate":"2026-11-01","dayAtPublish":7,"lang":"ko"}', false, 'B7loadPageKey_00000000', true, now());
COMMIT;
