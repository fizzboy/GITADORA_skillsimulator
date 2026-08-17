
-- GD Pocket Board / Supabase schema
-- Run this file in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('HOT', 'OTHER')),
  title text not null,
  part text not null check (
    part in ('BSC-G','BSC-B','ADV-G','ADV-B','EXT-G','EXT-B','MAS-G','MAS-B')
  ),
  level numeric(4,2) not null check (level >= 0 and level <= 99.99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (title, part)
);

create table if not exists public.user_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  achievement_rate numeric(5,2) not null check (achievement_rate >= 0 and achievement_rate <= 100.00),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, song_id)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists songs_touch_updated_at on public.songs;
create trigger songs_touch_updated_at
before update on public.songs
for each row execute function public.touch_updated_at();

drop trigger if exists user_scores_touch_updated_at on public.user_scores;
create trigger user_scores_touch_updated_at
before update on public.user_scores
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- A view gives the application a single, consistent shape:
-- song data + user's achievement rate + automatically calculated skill.
create or replace view public.my_score_details
with (security_invoker = true)
as
select
  us.id as score_id,
  us.user_id,
  s.id as song_id,
  s.type,
  s.title,
  s.part,
  s.level,
  us.achievement_rate,
  trunc((s.level * 20 * us.achievement_rate / 100.0)::numeric, 2) as skill,
  us.created_at,
  us.updated_at
from public.user_scores us
join public.songs s on s.id = us.song_id
where us.user_id = auth.uid();

create index if not exists songs_title_idx on public.songs (title);
create index if not exists songs_type_idx on public.songs (type);
create index if not exists songs_title_part_idx on public.songs (title, part);
create index if not exists user_scores_user_id_idx on public.user_scores (user_id);
create index if not exists user_scores_song_id_idx on public.user_scores (song_id);

alter table public.profiles enable row level security;
alter table public.songs enable row level security;
alter table public.user_scores enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Song master is readable by logged-in users.
drop policy if exists "songs_select_authenticated" on public.songs;
create policy "songs_select_authenticated"
on public.songs for select
to authenticated
using (true);

-- For the first version, song-master editing is intentionally not exposed
-- from the normal user UI. Add admin policies later if needed.

drop policy if exists "user_scores_select_own" on public.user_scores;
create policy "user_scores_select_own"
on public.user_scores for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "user_scores_insert_own" on public.user_scores;
create policy "user_scores_insert_own"
on public.user_scores for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "user_scores_update_own" on public.user_scores;
create policy "user_scores_update_own"
on public.user_scores for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "user_scores_delete_own" on public.user_scores;
create policy "user_scores_delete_own"
on public.user_scores for delete
to authenticated
using (user_id = auth.uid());

grant select on public.songs to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.user_scores to authenticated;
grant select on public.my_score_details to authenticated;

-- Optional sample master data. Remove these rows if you don't want samples.
insert into public.songs (type, title, part, level)
values
  ('HOT', 'SAMPLE SONG', 'MAS-G', 8.20),
  ('HOT', 'SAMPLE SONG', 'MAS-B', 7.50),
  ('OTHER', 'SAMPLE SONG 2', 'EXT-G', 6.80)
on conflict (title, part) do nothing;
