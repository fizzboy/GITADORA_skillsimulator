-- GITADORA Skill Simulator v21 FIX4
-- EXC auto rule for synchronized/existing records
--
-- Rule:
-- achievement_rate = 100.00 -> fc = 'EXC'
-- achievement_rate < 100.00 and old fc = 'EXC' -> fc = null
--
-- GF/DM option UI change itself does not require DB changes.
-- DM continues storing play_option='NORMAL' for compatibility.

begin;

-- Existing data normalization across all versions.
update public.user_scores
set fc = case
  when achievement_rate = 100.00 then 'EXC'
  when achievement_rate < 100.00 and fc = 'EXC' then null
  else fc
end
where
  (achievement_rate = 100.00 and fc is distinct from 'EXC')
  or
  (achievement_rate < 100.00 and fc = 'EXC');

-- Fast sync function: apply the same automatic EXC rule.
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
            achievement_rate, fc, play_option
          )
          values (
            v_uid, v_song_id, null,
            v_rate,
            case when v_rate = 100.00 then 'EXC' else null end,
            'NORMAL'
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
            achievement_rate, fc, play_option
          )
          values (
            v_uid, null, v_request_id,
            v_rate,
            case when v_rate = 100.00 then 'EXC' else null end,
            'NORMAL'
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

revoke execute on function public.sync_skill_records(jsonb,uuid) from public, anon;
grant execute on function public.sync_skill_records(jsonb,uuid) to authenticated;

commit;

select
  count(*) filter (where achievement_rate = 100.00 and fc = 'EXC') as exc_100_count,
  count(*) filter (where achievement_rate < 100.00 and fc = 'EXC') as invalid_exc_count
from public.user_scores;
