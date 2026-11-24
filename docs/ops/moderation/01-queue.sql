-- 신고 대기 목록(Supabase Studio SQL 편집기 → Run). 읽기만 한다.
-- 순서: ① 자동 숨김(격리)된 것 — decide_by(숨김 + 7일) 전에 02 복원 / 03 확정 / 05 이름 가리기 중 하나
--       ② held — 문턱(서로 다른 3명)을 넘었지만 숨기지 않은 것: immune(최근 7일 안에 복원됨)·breaker(서비스 전체 1시간 상한)·
--          disabled(자동 숨김 꺼짐 — B6 XFF 실측 전 운영 기본). 아직 공개 중이니 먼저 본다 — 내려야 하면 03, 아니면 04
--       ③ 아직 문턱 전인 열린 신고 — 필요하면 03(먼저 내림) 또는 04 기각
-- files = Storage 화면에서 미리 볼 경로(격리면 비공개 quarantine, 공개 중이면 public-pages). shown_name = 이 판에 실제로 실린 이름(판정 근거).
-- reports_1y = 같은 코드의 1년 신고 수(재발 판단). 30일 안에 결정하지 않으면 서버가 **복원**한다(기본값).
select r.target_ref                                                   as code,
       r.status::text                                                 as status,
       r.held,
       r.distinct_reporters::int                                      as reporters,
       r.reason_counts                                                as reasons,
       p.state::text                                                  as page_state,
       r.hidden_at,
       case when r.status = 'auto_hidden' then r.hidden_at + interval '7 days' end as decide_by,
       case when p.state = 'quarantined' then 'quarantine/' || p.store_key || '/' || p.path_prefix
            when p.state = 'live' then 'public-pages/' || p.store_key || '/' || p.path_prefix end as files,
       case when p.name_shown then p.meta ->> 'name' end              as shown_name,
       c.name_blocked,
       (select count(*)::int from app.reports o
         where o.target_kind = r.target_kind and o.target_ref = r.target_ref) as reports_1y,
       r.created_at                                                   as first_report_at
  from app.reports r
  left join app.creatures c on c.code = r.target_ref
  left join app.public_pages p on p.creature_id = c.id
 where r.target_kind = 'link' and r.status in ('auto_hidden', 'open')
 order by case when r.status = 'auto_hidden' then 0 when r.held is not null then 1 else 2 end,
          r.hidden_at asc nulls last, r.created_at asc;
