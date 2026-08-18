-- GITADORA Skill Simulator v19
-- ① ユーザー一覧でGF/DM両方のスキルTOTALを返す
-- ② ライバル登録をGF/DMそれぞれ最大5件へ分離
-- ③ Rate比較も対象譜面のGF/DMライバルだけを参照

begin;

-- ------------------------------------------------------------
-- user_favorites: 既存ライバルはGFとして引き継ぐ
-- ------------------------------------------------------------
alter table public.user_favorites
  add column if not exists instrument text;

update public.user_favorites
set instrument = 'GF'
where instrument is null;

alter table public.user_favorites
  alter column instrument set default 'GF',
  alter column instrument set not null;

alter table public.user_favorites
  drop constraint if exists user_favorites_instrument_check;

alter table public.user_favorites
  add constraint user_favorites_instrument_check
  check (instrument in ('GF','DM'));

alter table public.user_favorites
  drop constraint if exists user_favorites_pkey;

alter table public.user_favorites
  add constraint user_favorites_pkey
  primary key (user_id, favorite_user_id, instrument);

-- ------------------------------------------------------------
-- GF/DMごとに最大5件
-- ------------------------------------------------------------
create or replace function public.enforce_favorite_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  select count(*)
  into v_count
  from public.user_favorites
  where user_id = new.user_id
    and instrument = new.instrument;

  if v_count >= 5 then
    raise exception '%のライバル登録は5件までです。', new.instrument;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- マイページ用ライバル一覧
-- ------------------------------------------------------------
drop function if exists public.get_my_favorites();
drop function if exists public.get_my_favorites(text);

create function public.get_my_favorites(p_instrument text default 'GF')
returns table(
  favorite_user_id uuid,
  username text,
  sort_order smallint
)
language sql
stable
security definer
set search_path = ''
as $$
select
  f.favorite_user_id,
  p.username,
  f.sort_order
from public.user_favorites f
join public.profiles p on p.id = f.favorite_user_id
where f.user_id = (select auth.uid())
  and f.instrument = case
    when upper(coalesce(p_instrument,'GF')) = 'DM' then 'DM'
    else 'GF'
  end
order by f.sort_order, f.created_at;
$$;

revoke execute on function public.get_my_favorites(text) from public, anon;
grant execute on function public.get_my_favorites(text) to authenticated;

-- ------------------------------------------------------------
-- ユーザー一覧
-- GF/DM両方のTOTALを常に返す
-- is_favoriteだけ現在表示中のGF/DMを参照
-- ------------------------------------------------------------
drop function if exists public.list_user_summaries(text);
drop function if exists public.list_user_summaries(text,text);

create function public.list_user_summaries(
  p_search text default '',
  p_instrument text default 'GF'
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
with scored as (
  select
    us.user_id,
    s.title,
    s.is_hot,
    case when s.part like '%-D' then 'DM' else 'GF' end as instrument,
    trunc((s.level * 20 * us.achievement_rate / 100.0)::numeric, 2) as skill,
    us.updated_at
  from public.user_scores us
  join public.songs s on s.id = us.song_id
  where s.title !~* '\(CLASSIC\)[[:space:]]*$'
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
  select user_id, max(updated_at) as last_recorded_at
  from public.user_scores
  group by user_id
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
    where f.user_id = (select auth.uid())
      and f.favorite_user_id = p.id
      and f.instrument = case
        when upper(coalesce(p_instrument,'GF')) = 'DM' then 'DM'
        else 'GF'
      end
  ) as is_favorite,
  p.id = (select auth.uid()) as is_self
from public.profiles p
left join totals t on t.user_id = p.id
left join last_records lr on lr.user_id = p.id
where p.username <> 'admin'
  and (
    coalesce(p_search,'') = ''
    or p.username like '%' || p_search || '%'
  )
order by coalesce(t.gf_skill,0) desc, p.username asc;
$$;

revoke execute on function public.list_user_summaries(text,text) from public, anon;
grant execute on function public.list_user_summaries(text,text) to authenticated;

-- ------------------------------------------------------------
-- Rate比較:
-- GF譜面ならGFライバル、DM譜面ならDMライバルだけを表示
-- ------------------------------------------------------------
create or replace function public.get_song_rate_comparison(p_song_id uuid)
returns table(
  user_id uuid,
  username text,
  achievement_rate numeric,
  skill numeric,
  fc text,
  play_option text,
  is_self boolean
)
language sql
stable
security definer
set search_path = ''
as $$
select
  p.id,
  p.username,
  us.achievement_rate,
  trunc((s.level * 20 * us.achievement_rate / 100.0)::numeric, 2) as skill,
  us.fc,
  us.play_option,
  p.id = (select auth.uid()) as is_self
from public.user_scores us
join public.profiles p on p.id = us.user_id
join public.songs s on s.id = us.song_id
where us.song_id = p_song_id
  and (
    p.id = (select auth.uid())
    or exists (
      select 1
      from public.user_favorites f
      where f.user_id = (select auth.uid())
        and f.favorite_user_id = p.id
        and f.instrument = case
          when s.part like '%-D' then 'DM'
          else 'GF'
        end
    )
  )
order by us.achievement_rate desc, us.updated_at asc;
$$;

revoke execute on function public.get_song_rate_comparison(uuid) from public, anon;
grant execute on function public.get_song_rate_comparison(uuid) to authenticated;

commit;

-- 確認
select
  instrument,
  count(*) as favorite_count
from public.user_favorites
group by instrument
order by instrument;
