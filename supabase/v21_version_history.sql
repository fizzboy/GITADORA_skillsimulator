-- GITADORA Skill Simulator v21
-- Version history preparation / GALAXY WAVE DELTA migration
--
-- Purpose:
-- - Preserve the current GALAXY WAVE DELTA master and scores as one version.
-- - Future versions can have independent HOT/OTHER, difficulty and achievement rates.
-- - New versions start with no user scores (= 0.00).
-- - User UI can switch versions without another frontend redesign.
-- - Rate comparison can show the user's best achievement across all versions.

begin;

-- ============================================================
-- 1. Game versions
-- ============================================================
create table if not exists public.game_versions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  eamusement_slug text not null,
  sort_order integer not null default 1,
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists game_versions_one_current_idx
  on public.game_versions ((is_current))
  where is_current = true;

insert into public.game_versions (
  code, name, eamusement_slug, sort_order, is_current
)
values (
  'GALAXY_WAVE_DELTA',
  'GALAXY WAVE DELTA',
  'gitadora_galaxywave_delta',
  1,
  true
)
on conflict (code) do update
set
  name = excluded.name,
  eamusement_slug = excluded.eamusement_slug;

-- If no version is current for some reason, make GALAXY WAVE DELTA current.
update public.game_versions
set is_current = true
where code = 'GALAXY_WAVE_DELTA'
  and not exists (
    select 1 from public.game_versions where is_current = true
  );

alter table public.game_versions enable row level security;

drop policy if exists game_versions_select_authenticated on public.game_versions;
create policy game_versions_select_authenticated
  on public.game_versions
  for select
  to authenticated
  using (true);

revoke all on table public.game_versions from anon;
grant select on table public.game_versions to authenticated;

-- ============================================================
-- 2. Version-tag current songs and requests
-- ============================================================
alter table public.songs
  add column if not exists version_id uuid;

update public.songs
set version_id = (
  select id from public.game_versions
  where code = 'GALAXY_WAVE_DELTA'
  limit 1
)
where version_id is null;

alter table public.songs
  alter column version_id set not null;

alter table public.songs
  drop constraint if exists songs_version_id_fkey;

alter table public.songs
  add constraint songs_version_id_fkey
  foreign key (version_id)
  references public.game_versions(id)
  on delete restrict;

alter table public.song_requests
  add column if not exists version_id uuid;

update public.song_requests sr
set version_id = coalesce(
  (select s.version_id from public.songs s where s.id = sr.current_song_id),
  (select gv.id from public.game_versions gv where gv.code = 'GALAXY_WAVE_DELTA' limit 1)
)
where sr.version_id is null;

alter table public.song_requests
  alter column version_id set not null;

alter table public.song_requests
  drop constraint if exists song_requests_version_id_fkey;

alter table public.song_requests
  add constraint song_requests_version_id_fkey
  foreign key (version_id)
  references public.game_versions(id)
  on delete restrict;

-- A title/Part may exist once per version.
alter table public.songs
  drop constraint if exists songs_title_part_key;

alter table public.songs
  drop constraint if exists songs_version_title_part_key;

alter table public.songs
  add constraint songs_version_title_part_key
  unique (version_id, title, part);

drop index if exists public.songs_title_part_idx;
create index songs_version_title_part_idx
  on public.songs(version_id, title, part);

create index if not exists songs_version_hot_idx
  on public.songs(version_id, is_hot);

-- Pending new-song requests are also version-specific.
drop index if exists public.song_requests_pending_unique;
create unique index song_requests_pending_unique
  on public.song_requests(requester_id, version_id, lower(title), part)
  where status = 'pending'
    and request_type = 'new_song';

create index if not exists song_requests_version_status_idx
  on public.song_requests(version_id, status, created_at);

-- ============================================================
-- 3. My score view now exposes the version
-- ============================================================
create or replace view public.my_score_details
with (security_invoker = true)
as
select
  us.id as score_id,
  us.user_id,
  us.song_id,
  us.song_request_id,
  coalesce(s.is_hot, false) as is_hot,
  coalesce(s.title, sr.title) as title,
  coalesce(s.part, sr.part) as part,
  coalesce(s.level, sr.proposed_level) as level,
  us.achievement_rate,
  us.fc,
  us.play_option,
  trunc((coalesce(s.level, sr.proposed_level) * 20 * us.achievement_rate / 100.0)::numeric, 2) as skill,
  (us.song_request_id is not null) as pending_master,
  sr.status as request_status,
  us.created_at,
  us.updated_at,
  coalesce(s.version_id, sr.version_id) as version_id,
  gv.name as version_name
from public.user_scores us
left join public.songs s on s.id = us.song_id
left join public.song_requests sr on sr.id = us.song_request_id
left join public.game_versions gv
  on gv.id = coalesce(s.version_id, sr.version_id)
where us.user_id = auth.uid();

grant select on public.my_score_details to authenticated;

-- ============================================================
-- 4. Version-aware user skill target
-- ============================================================
drop function if exists public.get_user_skill_targets(uuid,text,uuid);

create function public.get_user_skill_targets(
  p_user_id uuid,
  p_instrument text default 'GF',
  p_version_id uuid default null
)
returns table(
  score_id uuid,
  song_id uuid,
  is_hot boolean,
  title text,
  part text,
  level numeric,
  achievement_rate numeric,
  skill numeric,
  fc text,
  play_option text
)
language sql
stable
security definer
set search_path = ''
as $$
with target_version as (
  select coalesce(
    p_version_id,
    (select gv.id
     from public.game_versions gv
     where gv.is_current = true
     order by gv.sort_order desc
     limit 1)
  ) as id
),
scored as (
  select
    us.id as score_id,
    us.song_id,
    s.is_hot,
    s.title,
    s.part,
    s.level,
    us.achievement_rate,
    trunc((s.level * 20 * us.achievement_rate / 100.0)::numeric, 2) as skill,
    us.fc,
    us.play_option,
    us.updated_at
  from public.user_scores us
  join public.songs s on s.id = us.song_id
  cross join target_version tv
  where us.user_id = p_user_id
    and s.version_id = tv.id
    and s.title !~* '\(CLASSIC\)[[:space:]]*$'
    and (
      (upper(coalesce(p_instrument,'GF')) = 'DM' and s.part like '%-D')
      or
      (upper(coalesce(p_instrument,'GF')) <> 'DM' and (s.part like '%-G' or s.part like '%-B'))
    )
),
ranked as (
  select *,
    row_number() over(
      partition by title
      order by skill desc, updated_at desc
    ) as title_rank
  from scored
)
select
  score_id, song_id, is_hot, title, part, level,
  achievement_rate, skill, fc, play_option
from ranked
where title_rank = 1
order by skill desc, title;
$$;

revoke execute on function public.get_user_skill_targets(uuid,text,uuid) from public, anon;
grant execute on function public.get_user_skill_targets(uuid,text,uuid) to authenticated;

-- ============================================================
-- 5. Version-aware user list: GF/DM are both for selected version
-- ============================================================
drop function if exists public.list_user_summaries(text,text,uuid);

create function public.list_user_summaries(
  p_search text default '',
  p_instrument text default 'GF',
  p_version_id uuid default null
)
returns table(
  user_id uuid,
  username text,
  gf_skill numeric,
  dm_skill numeric,
  last_recorded_at timestamptz,
  is_favorite boolean,
  is_self boolean
)
language sql
stable
security definer
set search_path = ''
as $$
with target_version as (
  select coalesce(
    p_version_id,
    (select gv.id
     from public.game_versions gv
     where gv.is_current = true
     order by gv.sort_order desc
     limit 1)
  ) as id
),
scored as (
  select
    us.user_id,
    s.title,
    s.is_hot,
    case when s.part like '%-D' then 'DM' else 'GF' end as instrument,
    trunc((s.level * 20 * us.achievement_rate / 100.0)::numeric, 2) as skill,
    us.updated_at
  from public.user_scores us
  join public.songs s on s.id = us.song_id
  cross join target_version tv
  where s.version_id = tv.id
    and s.title !~* '\(CLASSIC\)[[:space:]]*$'
),
best_part as (
  select *,
    row_number() over (
      partition by user_id, instrument, title
      order by skill desc, updated_at desc
    ) as title_rank
  from scored
),
type_ranked as (
  select *,
    row_number() over (
      partition by user_id, instrument, is_hot
      order by skill desc, title
    ) as type_rank
  from best_part
  where title_rank = 1
),
totals as (
  select
    user_id,
    coalesce(sum(skill) filter (
      where instrument = 'GF' and type_rank <= 25
    ), 0)::numeric as gf_skill,
    coalesce(sum(skill) filter (
      where instrument = 'DM' and type_rank <= 25
    ), 0)::numeric as dm_skill
  from type_ranked
  group by user_id
),
last_records as (
  select
    us.user_id,
    max(us.updated_at) as last_recorded_at
  from public.user_scores us
  left join public.songs s on s.id = us.song_id
  left join public.song_requests sr on sr.id = us.song_request_id
  cross join target_version tv
  where coalesce(s.version_id, sr.version_id) = tv.id
  group by us.user_id
)
select
  p.id,
  p.username,
  coalesce(t.gf_skill, 0)::numeric,
  coalesce(t.dm_skill, 0)::numeric,
  lr.last_recorded_at,
  exists (
    select 1
    from public.user_favorites f
    where f.user_id = auth.uid()
      and f.favorite_user_id = p.id
      and f.instrument = case
        when upper(coalesce(p_instrument,'GF')) = 'DM' then 'DM'
        else 'GF'
      end
  ) as is_favorite,
  p.id = auth.uid() as is_self
from public.profiles p
left join totals t on t.user_id = p.id
left join last_records lr on lr.user_id = p.id
where p.username <> 'admin'
  and (
    coalesce(p_search,'') = ''
    or p.username like '%' || p_search || '%'
  )
order by coalesce(t.gf_skill,0) desc, p.username;
$$;

revoke execute on function public.list_user_summaries(text,text,uuid) from public, anon;
grant execute on function public.list_user_summaries(text,text,uuid) to authenticated;

-- ============================================================
-- 6. Personal best across every version
-- ============================================================
create or replace function public.get_song_personal_best_history(p_song_id uuid)
returns table(
  achievement_rate numeric,
  version_name text,
  version_code text,
  recorded_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
with target as (
  select s.title, s.part
  from public.songs s
  where s.id = p_song_id
),
history as (
  select
    us.achievement_rate,
    gv.name as version_name,
    gv.code as version_code,
    us.updated_at as recorded_at,
    gv.sort_order
  from public.user_scores us
  join public.songs s on s.id = us.song_id
  join public.game_versions gv on gv.id = s.version_id
  join target t on t.title = s.title and t.part = s.part
  where us.user_id = auth.uid()
)
select
  achievement_rate,
  version_name,
  version_code,
  recorded_at
from history
order by achievement_rate desc, sort_order desc, recorded_at desc
limit 1;
$$;

revoke execute on function public.get_song_personal_best_history(uuid) from public, anon;
grant execute on function public.get_song_personal_best_history(uuid) to authenticated;

-- ============================================================
-- 7. Fast sync, version-aware
-- ============================================================
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
        set achievement_rate = v_rate,
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
            v_rate, null, 'NORMAL'
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
        set achievement_rate = v_rate,
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
            v_rate, null, 'NORMAL'
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

-- ============================================================
-- 8. Admin master paging, version-aware
-- ============================================================
create or replace function public.admin_list_song_master(
  p_search text,
  p_limit integer,
  p_offset integer,
  p_version_id uuid
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
  v_limit integer := least(200, greatest(25, coalesce(p_limit,100)));
  v_offset integer := greatest(0, coalesce(p_offset,0));
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
    where s.version_id = p_version_id
      and (
        coalesce(p_search,'') = ''
        or s.title ilike '%' || p_search || '%'
      )
    group by s.title
  ),
  counted as (
    select g.*, count(*) over() as total_count
    from grouped g
  )
  select c.title, c.is_hot, c.levels, c.total_count
  from counted c
  order by c.title
  limit v_limit
  offset v_offset;
end;
$$;

revoke execute on function public.admin_list_song_master(text,integer,integer,uuid) from public, anon;
grant execute on function public.admin_list_song_master(text,integer,integer,uuid) to authenticated;

-- ============================================================
-- 9. Approval keeps request version
-- ============================================================
create or replace function public.approve_song_request(
  p_request_id uuid,
  p_level numeric,
  p_is_hot boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  r public.song_requests%rowtype;
  v_song_id uuid;
  v_existing_hot boolean := false;
begin
  if not public.is_admin() then
    raise exception '管理者権限がありません。';
  end if;

  if p_level is null or p_level <= 0 or p_level > 99.99 then
    raise exception '難易度が不正です。';
  end if;

  select * into r
  from public.song_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if not found then
    raise exception '対象の登録依頼が見つかりません。';
  end if;

  if r.request_type = 'level_correction' then
    if r.current_song_id is null then
      raise exception '修正対象の譜面が見つかりません。';
    end if;

    update public.songs
    set level = trunc(p_level::numeric,2)
    where id = r.current_song_id
      and version_id = r.version_id
    returning id into v_song_id;

    if v_song_id is null then
      raise exception '修正対象の譜面が見つかりません。';
    end if;

    if p_is_hot then
      update public.songs
      set is_hot = true
      where version_id = r.version_id
        and title = r.title;
    end if;
  else
    select coalesce(bool_or(is_hot),false)
    into v_existing_hot
    from public.songs
    where version_id = r.version_id
      and title = r.title;

    insert into public.songs(
      version_id, is_hot, title, part, level
    )
    values (
      r.version_id,
      p_is_hot or v_existing_hot,
      r.title,
      r.part,
      trunc(p_level::numeric,2)
    )
    on conflict (version_id,title,part)
    do update set
      level = excluded.level,
      is_hot = public.songs.is_hot or excluded.is_hot
    returning id into v_song_id;

    if p_is_hot or v_existing_hot then
      update public.songs
      set is_hot = true
      where version_id = r.version_id
        and title = r.title;
    end if;

    update public.user_scores
    set song_id = v_song_id,
        song_request_id = null,
        updated_at = now()
    where song_request_id = p_request_id;
  end if;

  update public.song_requests
  set status = 'approved',
      proposed_level = trunc(p_level::numeric,2),
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = p_request_id;

  return v_song_id;
end;
$$;

revoke execute on function public.approve_song_request(uuid,numeric,boolean) from public, anon;
grant execute on function public.approve_song_request(uuid,numeric,boolean) to authenticated;

commit;

-- ============================================================
-- Verification
-- ============================================================
select
  gv.code,
  gv.name,
  gv.is_current,
  count(distinct s.id) as charts,
  count(distinct us.id) as score_records
from public.game_versions gv
left join public.songs s on s.version_id = gv.id
left join public.user_scores us on us.song_id = s.id
group by gv.id
order by gv.sort_order desc;

select
  p.proname as function_name,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    (p.proname = 'get_user_skill_targets' and pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_instrument text, p_version_id uuid')
    or
    (p.proname = 'list_user_summaries' and pg_get_function_identity_arguments(p.oid) = 'p_search text, p_instrument text, p_version_id uuid')
    or
    p.proname = 'get_song_personal_best_history'
    or
    (p.proname = 'sync_skill_records' and pg_get_function_identity_arguments(p.oid) = 'p_records jsonb, p_version_id uuid')
    or
    (p.proname = 'admin_list_song_master' and pg_get_function_identity_arguments(p.oid) = 'p_search text, p_limit integer, p_offset integer, p_version_id uuid')
  )
order by p.proname;
