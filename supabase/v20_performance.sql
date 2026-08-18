-- GITADORA Skill Simulator v20
-- 高速スキル同期 + 管理画面曲マスター軽量化
--
-- 変更:
-- 1) sync_skill_records(jsonb)
--    ブラウザから1件ずつ保存していた最大100件の同期をDB内で一括処理
-- 2) admin_list_song_master()
--    曲マスターを全17,000譜面取得せず、曲単位100件ずつページ取得

begin;

-- ============================================================
-- 1. e-amusementスキル対象の一括同期
-- ============================================================
create or replace function public.sync_skill_records(p_records jsonb)
returns table(
  saved_count integer,
  requested_count integer,
  skipped_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_title text;
  v_part text;
  v_rate numeric;
  v_level numeric;
  v_song_id uuid;
  v_request_id uuid;
  v_updated integer;
  v_saved integer := 0;
  v_requested integer := 0;
  v_skipped integer := 0;
begin
  if v_uid is null then
    raise exception 'ログインが必要です。';
  end if;

  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception '同期データの形式が不正です。';
  end if;

  if jsonb_array_length(p_records) > 120 then
    raise exception '一度に同期できる件数は120件までです。';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_records)
  loop
    begin
      v_title := btrim(coalesce(v_item->>'title', ''));
      v_part := coalesce(v_item->>'part', '');
      v_rate := nullif(v_item->>'rate', '')::numeric;
      v_level := nullif(v_item->>'level', '')::numeric;

      if v_title = ''
         or v_part not in (
           'BSC-G','ADV-G','EXT-G','MAS-G',
           'BSC-B','ADV-B','EXT-B','MAS-B',
           'BSC-D','ADV-D','EXT-D','MAS-D'
         )
         or v_rate is null or v_rate < 0 or v_rate > 100
         or v_level is null or v_level <= 0 or v_level > 99.99
      then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_rate := trunc(v_rate, 2);
      v_level := trunc(v_level, 2);
      v_song_id := null;
      v_request_id := null;

      select s.id
      into v_song_id
      from public.songs s
      where s.title = v_title
        and s.part = v_part
      limit 1;

      if v_song_id is not null then
        -- 既存のFC / EXC・オプションはそのまま維持し、Rateだけ更新
        update public.user_scores
        set
          achievement_rate = v_rate,
          updated_at = now()
        where user_id = v_uid
          and song_id = v_song_id;

        get diagnostics v_updated = row_count;

        if v_updated = 0 then
          insert into public.user_scores(
            user_id,
            song_id,
            song_request_id,
            achievement_rate,
            fc,
            play_option
          )
          values (
            v_uid,
            v_song_id,
            null,
            v_rate,
            null,
            'NORMAL'
          );
        end if;

        v_saved := v_saved + 1;
      else
        -- 同じユーザー・曲名・Partのpending依頼があれば再利用
        select sr.id
        into v_request_id
        from public.song_requests sr
        where sr.requester_id = v_uid
          and lower(sr.title) = lower(v_title)
          and sr.part = v_part
          and sr.status = 'pending'
          and sr.request_type = 'new_song'
        order by sr.created_at desc
        limit 1;

        if v_request_id is null then
          insert into public.song_requests(
            requester_id,
            title,
            part,
            proposed_level,
            status,
            request_type
          )
          values (
            v_uid,
            v_title,
            v_part,
            v_level,
            'pending',
            'new_song'
          )
          returning id into v_request_id;
        else
          update public.song_requests
          set proposed_level = v_level
          where id = v_request_id;
        end if;

        -- 申請中スコアもRateのみ更新。既存FC/optionは維持。
        update public.user_scores
        set
          achievement_rate = v_rate,
          updated_at = now()
        where user_id = v_uid
          and song_request_id = v_request_id;

        get diagnostics v_updated = row_count;

        if v_updated = 0 then
          insert into public.user_scores(
            user_id,
            song_id,
            song_request_id,
            achievement_rate,
            fc,
            play_option
          )
          values (
            v_uid,
            null,
            v_request_id,
            v_rate,
            null,
            'NORMAL'
          );
        end if;

        v_requested := v_requested + 1;
      end if;

    exception
      when others then
        -- 1件の不正データで同期全体を止めない
        v_skipped := v_skipped + 1;
    end;
  end loop;

  return query
  select v_saved, v_requested, v_skipped;
end;
$$;

revoke execute on function public.sync_skill_records(jsonb) from public, anon;
grant execute on function public.sync_skill_records(jsonb) to authenticated;


-- ============================================================
-- 2. 管理画面の曲マスターをサーバー側で曲単位にまとめてページ取得
-- ============================================================
create or replace function public.admin_list_song_master(
  p_search text default '',
  p_limit integer default 100,
  p_offset integer default 0
)
returns table(
  title text,
  is_hot boolean,
  levels jsonb,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(200, greatest(25, coalesce(p_limit, 100)));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if not public.is_admin() then
    raise exception '管理者権限がありません。';
  end if;

  return query
  with grouped as (
    select
      s.title,
      bool_or(s.is_hot) as is_hot,
      jsonb_object_agg(s.part, s.level order by s.part) as levels
    from public.songs s
    where coalesce(p_search, '') = ''
       or s.title ilike '%' || p_search || '%'
    group by s.title
  ),
  counted as (
    select
      g.*,
      count(*) over() as total_count
    from grouped g
  )
  select
    c.title,
    c.is_hot,
    c.levels,
    c.total_count
  from counted c
  order by c.title
  limit v_limit
  offset v_offset;
end;
$$;

revoke execute on function public.admin_list_song_master(text,integer,integer) from public, anon;
grant execute on function public.admin_list_song_master(text,integer,integer) to authenticated;

commit;

-- ============================================================
-- 確認
-- ============================================================
select
  p.proname as function_name,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('sync_skill_records','admin_list_song_master')
order by p.proname;
