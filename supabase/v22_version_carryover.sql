-- GITADORA Skill Simulator 3.7.0
-- 新VERSION初回登録時のオプション・非公開コメント引き継ぎ
-- e-amusement同期のVERSION別保存対応

begin;

alter table public.user_scores
  add column if not exists private_comment text;

-- 手動登録画面で、直前VERSIONのオプション・コメントを初期表示する。
create or replace function public.get_my_previous_score_settings(
  p_title text,
  p_part text,
  p_version_id uuid
)
returns table(
  play_option text,
  private_comment text
)
language sql
stable
security definer
set search_path = ''
as $$
with target_version as (
  select gv.sort_order
  from public.game_versions gv
  where gv.id = p_version_id
),
history as (
  select
    case
      when p_part like '%-D' then 'NORMAL'
      else coalesce(nullif(us.play_option, ''), 'NORMAL')
    end as play_option,
    us.private_comment,
    source_version.sort_order,
    us.updated_at
  from public.user_scores us
  left join public.songs s on s.id = us.song_id
  left join public.song_requests sr on sr.id = us.song_request_id
  join public.game_versions source_version
    on source_version.id = coalesce(s.version_id, sr.version_id)
  cross join target_version target
  where us.user_id = auth.uid()
    and lower(coalesce(s.title, sr.title)) = lower(btrim(coalesce(p_title, '')))
    and coalesce(s.part, sr.part) = p_part
    and source_version.sort_order < target.sort_order
)
select
  history.play_option,
  history.private_comment
from history
order by history.sort_order desc, history.updated_at desc
limit 1;
$$;

revoke all on function public.get_my_previous_score_settings(text,text,uuid) from public, anon;
grant execute on function public.get_my_previous_score_settings(text,text,uuid) to authenticated;

-- e-amusement同期で新VERSIONのレコードを初めて作る場合も、
-- 同じ曲名・同じPartの直前VERSIONからオプションとコメントだけを引き継ぐ。
create or replace function public.sync_skill_records(
  p_records jsonb,
  p_version_id uuid
)
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
  v_previous_option text;
  v_previous_comment text;
  v_updated integer;
  v_saved integer := 0;
  v_requested integer := 0;
  v_skipped integer := 0;
begin
  if v_uid is null then
    raise exception 'ログインが必要です。';
  end if;

  if p_version_id is null
     or not exists (
       select 1 from public.game_versions gv where gv.id = p_version_id
     )
  then
    raise exception 'GITADORAバージョンが不正です。';
  end if;

  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception '同期データの形式が不正です。';
  end if;

  if jsonb_array_length(p_records) > 120 then
    raise exception '一度に同期できる件数は120件までです。';
  end if;

  for v_item in select value from jsonb_array_elements(p_records)
  loop
    begin
      v_title := btrim(coalesce(v_item->>'title',''));
      v_part := coalesce(v_item->>'part','');
      v_rate := nullif(v_item->>'rate','')::numeric;
      v_level := nullif(v_item->>'level','')::numeric;

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
      v_previous_option := 'NORMAL';
      v_previous_comment := null;

      select
        case
          when v_part like '%-D' then 'NORMAL'
          else coalesce(nullif(us.play_option, ''), 'NORMAL')
        end,
        us.private_comment
      into v_previous_option, v_previous_comment
      from public.user_scores us
      left join public.songs previous_song on previous_song.id = us.song_id
      left join public.song_requests previous_request on previous_request.id = us.song_request_id
      join public.game_versions previous_version
        on previous_version.id = coalesce(previous_song.version_id, previous_request.version_id)
      join public.game_versions target_version on target_version.id = p_version_id
      where us.user_id = v_uid
        and lower(coalesce(previous_song.title, previous_request.title)) = lower(v_title)
        and coalesce(previous_song.part, previous_request.part) = v_part
        and previous_version.sort_order < target_version.sort_order
      order by previous_version.sort_order desc, us.updated_at desc
      limit 1;

      v_previous_option := coalesce(v_previous_option, 'NORMAL');
      if v_part like '%-D'
         or v_previous_option not in ('NORMAL','RAN','SRA','RAN+','SRA+')
      then
        v_previous_option := 'NORMAL';
      end if;

      select s.id into v_song_id
      from public.songs s
      where s.version_id = p_version_id
        and s.title = v_title
        and s.part = v_part
      limit 1;

      if v_song_id is not null then
        update public.user_scores
        set
          achievement_rate = v_rate,
          fc = case
            when v_rate = 100.00 then 'EXC'
            when fc = 'EXC' then null
            else fc
          end,
          play_option = case
            when v_part like '%-D' then 'NORMAL'
            else play_option
          end,
          updated_at = now()
        where user_id = v_uid
          and song_id = v_song_id;

        get diagnostics v_updated = row_count;

        if v_updated = 0 then
          insert into public.user_scores(
            user_id, song_id, song_request_id,
            achievement_rate, fc, play_option, private_comment
          )
          values (
            v_uid, v_song_id, null,
            v_rate,
            case when v_rate = 100.00 then 'EXC' else null end,
            v_previous_option,
            v_previous_comment
          );
        end if;

        v_saved := v_saved + 1;
      else
        select sr.id into v_request_id
        from public.song_requests sr
        where sr.requester_id = v_uid
          and sr.version_id = p_version_id
          and lower(sr.title) = lower(v_title)
          and sr.part = v_part
          and sr.status = 'pending'
          and sr.request_type = 'new_song'
        order by sr.created_at desc
        limit 1;

        if v_request_id is null then
          insert into public.song_requests(
            requester_id, version_id,
            title, part, proposed_level,
            status, request_type
          )
          values (
            v_uid, p_version_id,
            v_title, v_part, v_level,
            'pending', 'new_song'
          )
          returning id into v_request_id;
        else
          update public.song_requests
          set proposed_level = v_level
          where id = v_request_id;
        end if;

        update public.user_scores
        set
          achievement_rate = v_rate,
          fc = case
            when v_rate = 100.00 then 'EXC'
            when fc = 'EXC' then null
            else fc
          end,
          play_option = case
            when v_part like '%-D' then 'NORMAL'
            else play_option
          end,
          updated_at = now()
        where user_id = v_uid
          and song_request_id = v_request_id;

        get diagnostics v_updated = row_count;

        if v_updated = 0 then
          insert into public.user_scores(
            user_id, song_id, song_request_id,
            achievement_rate, fc, play_option, private_comment
          )
          values (
            v_uid, null, v_request_id,
            v_rate,
            case when v_rate = 100.00 then 'EXC' else null end,
            v_previous_option,
            v_previous_comment
          );
        end if;

        v_requested := v_requested + 1;
      end if;

    exception
      when others then
        v_skipped := v_skipped + 1;
    end;
  end loop;

  return query select v_saved, v_requested, v_skipped;
end;
$$;

revoke all on function public.sync_skill_records(jsonb,uuid) from public, anon;
grant execute on function public.sync_skill_records(jsonb,uuid) to authenticated;

commit;

select
  p.proname as function_name,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_my_previous_score_settings','sync_skill_records')
order by p.proname;
