--
-- PostgreSQL database dump
--

\restrict 4rvrEc9rsi2cpgY7uPqiuNgZoPam0uzOEec9YaUydOncyuXYe5bgkpmYZmTWRXy

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: approve_song_request(uuid, numeric, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_song_request(p_request_id uuid, p_level numeric, p_is_hot boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
    set level = trunc(p_level::numeric, 2)
    where id = r.current_song_id
    returning id into v_song_id;

    if v_song_id is null then
      raise exception '修正対象の譜面が見つかりません。';
    end if;

    -- HOTで承認された場合だけ同名曲全体をHOT化。
    -- 通常の修正承認では既存HOT状態を変更しない。
    if p_is_hot then
      update public.songs
      set is_hot = true
      where title = r.title;
    end if;
  else
    select coalesce(bool_or(is_hot), false)
    into v_existing_hot
    from public.songs
    where title = r.title;

    insert into public.songs (is_hot, title, part, level)
    values (
      p_is_hot or v_existing_hot,
      r.title,
      r.part,
      trunc(p_level::numeric, 2)
    )
    on conflict (title, part)
    do update set
      level = excluded.level,
      is_hot = public.songs.is_hot or excluded.is_hot
    returning id into v_song_id;

    if p_is_hot or v_existing_hot then
      update public.songs
      set is_hot = true
      where title = r.title;
    end if;

    update public.user_scores
    set
      song_id = v_song_id,
      song_request_id = null,
      updated_at = now()
    where song_request_id = p_request_id;
  end if;

  update public.song_requests
  set
    status = 'approved',
    proposed_level = trunc(p_level::numeric, 2),
    reviewed_at = now(),
    reviewed_by = auth.uid()
  where id = p_request_id;

  return v_song_id;
end;
$$;


--
-- Name: enforce_favorite_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_favorite_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_count integer;
begin
  select count(*)
  into v_count
  from public.user_favorites
  where user_id = new.user_id;

  if v_count >= 5 then
    raise exception 'お気に入り登録は5件までです。';
  end if;

  return new;
end;
$$;


--
-- Name: get_my_favorites(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_favorites() RETURNS TABLE(favorite_user_id uuid, username text, sort_order smallint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
select
  f.favorite_user_id,
  p.username,
  f.sort_order
from public.user_favorites f
join public.profiles p on p.id = f.favorite_user_id
where f.user_id = (select auth.uid())
order by f.sort_order, f.created_at;
$$;


--
-- Name: get_song_option_distribution(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_song_option_distribution(p_song_id uuid) RETURNS TABLE(play_option text, use_count bigint, total_count bigint, percentage numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
with target as (
  select
    coalesce(nullif(us.play_option, ''), 'NORMAL') as play_option
  from public.user_scores us
  where us.song_id = p_song_id
),
counts as (
  select
    play_option,
    count(*)::bigint as use_count
  from target
  group by play_option
),
total as (
  select count(*)::bigint as total_count
  from target
)
select
  c.play_option,
  c.use_count,
  t.total_count,
  case
    when t.total_count = 0 then 0::numeric
    else round((c.use_count::numeric * 100.0 / t.total_count), 1)
  end as percentage
from counts c
cross join total t
where c.use_count > 0
order by
  case c.play_option
    when 'NORMAL' then 1
    when 'RAN' then 2
    when 'SRA' then 3
    when 'RAN+' then 4
    when 'SRA+' then 5
    else 99
  end,
  c.play_option;
$$;


--
-- Name: get_song_rate_comparison(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_song_rate_comparison(p_song_id uuid) RETURNS TABLE(user_id uuid, username text, achievement_rate numeric, skill numeric, fc text, play_option text, is_self boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
select
  p.id,
  p.username,
  us.achievement_rate,
  trunc((s.level * 20 * us.achievement_rate / 100.0)::numeric, 2) as skill,
  us.fc,
  us.play_option,
  p.id = (select auth.uid()) as is_self
from public.user_scores us
join public.profiles p
  on p.id = us.user_id
join public.songs s
  on s.id = us.song_id
where
  us.song_id = p_song_id
  and (
    p.id = (select auth.uid())
    or exists (
      select 1
      from public.user_favorites f
      where f.user_id = (select auth.uid())
        and f.favorite_user_id = p.id
    )
  )
order by
  us.achievement_rate desc,
  us.updated_at asc;
$$;


--
-- Name: get_user_skill_targets(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_skill_targets(p_user_id uuid) RETURNS TABLE(score_id uuid, song_id uuid, is_hot boolean, title text, part text, level numeric, achievement_rate numeric, skill numeric, fc text, play_option text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
with scored as (
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
  where us.user_id = p_user_id
    and s.title !~* '\(CLASSIC\)[[:space:]]*$'
),
ranked as (
  select *,
    row_number() over (
      partition by title
      order by skill desc, updated_at desc
    ) as title_rank
  from scored
)
select
  score_id,
  song_id,
  is_hot,
  title,
  part,
  level,
  achievement_rate,
  skill,
  fc,
  play_option
from ranked
where title_rank = 1
order by skill desc, title;
$_$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
  );
$$;


--
-- Name: list_user_summaries(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_user_summaries(p_search text DEFAULT ''::text) RETURNS TABLE(user_id uuid, username text, total_skill numeric, last_recorded_at timestamp with time zone, is_favorite boolean, is_self boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
with scored as (
  select
    us.user_id,
    s.title,
    s.is_hot,
    trunc((s.level * 20 * us.achievement_rate / 100.0)::numeric, 2) as skill,
    us.updated_at
  from public.user_scores us
  join public.songs s on s.id = us.song_id
  where s.title !~* '\(CLASSIC\)[[:space:]]*$'
),
best_part as (
  select *,
    row_number() over (
      partition by user_id, title
      order by skill desc, updated_at desc
    ) as title_rank
  from scored
),
type_ranked as (
  select *,
    row_number() over (
      partition by user_id, is_hot
      order by skill desc, title
    ) as type_rank
  from best_part
  where title_rank = 1
),
totals as (
  select
    user_id,
    coalesce(sum(skill) filter (where type_rank <= 25), 0)::numeric as total_skill
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
  coalesce(t.total_skill, 0)::numeric,
  lr.last_recorded_at,
  exists (
    select 1
    from public.user_favorites f
    where f.user_id = (select auth.uid())
      and f.favorite_user_id = p.id
  ) as is_favorite,
  p.id = (select auth.uid()) as is_self
from public.profiles p
left join totals t on t.user_id = p.id
left join last_records lr on lr.user_id = p.id
where
  p.username <> 'admin'
  and (
    coalesce(p_search, '') = ''
    or p.username like '%' || p_search || '%'
  )
order by
  coalesce(t.total_skill, 0) desc,
  p.username asc;
$_$;


--
-- Name: reject_song_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_song_request(p_request_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception '管理者権限がありません。';
  end if;

  if not exists (
    select 1
    from public.song_requests
    where id = p_request_id
      and status = 'pending'
  ) then
    raise exception '対象の登録依頼が見つかりません。';
  end if;

  delete from public.user_scores
  where song_request_id = p_request_id;

  update public.song_requests
  set
    status = 'rejected',
    reviewed_at = now(),
    reviewed_by = auth.uid()
  where id = p_request_id;

  return true;
end;
$$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_users (
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: song_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.song_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requester_id uuid NOT NULL,
    title text NOT NULL,
    part text NOT NULL,
    proposed_level numeric(4,2) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    request_type text DEFAULT 'new_song'::text NOT NULL,
    current_song_id uuid,
    CONSTRAINT song_requests_level_check CHECK (((proposed_level > (0)::numeric) AND (proposed_level <= 99.99))),
    CONSTRAINT song_requests_part_allowed CHECK ((part = ANY (ARRAY['MAS-G'::text, 'MAS-B'::text, 'EXT-G'::text, 'EXT-B'::text, 'ADV-G'::text, 'ADV-B'::text, 'BSC-G'::text, 'BSC-B'::text]))),
    CONSTRAINT song_requests_part_check CHECK ((part = ANY (ARRAY['BSC-G'::text, 'BSC-B'::text, 'ADV-G'::text, 'ADV-B'::text, 'EXT-G'::text, 'EXT-B'::text, 'MAS-G'::text, 'MAS-B'::text]))),
    CONSTRAINT song_requests_request_type_check CHECK ((request_type = ANY (ARRAY['new_song'::text, 'level_correction'::text]))),
    CONSTRAINT song_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: songs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.songs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    part text NOT NULL,
    level numeric(4,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_hot boolean DEFAULT false NOT NULL,
    CONSTRAINT songs_level_check CHECK (((level >= (0)::numeric) AND (level <= 99.99))),
    CONSTRAINT songs_part_check CHECK ((part = ANY (ARRAY['BSC-G'::text, 'BSC-B'::text, 'ADV-G'::text, 'ADV-B'::text, 'EXT-G'::text, 'EXT-B'::text, 'MAS-G'::text, 'MAS-B'::text])))
);


--
-- Name: user_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    song_id uuid,
    achievement_rate numeric(5,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    fc text,
    play_option text DEFAULT 'NORMAL'::text NOT NULL,
    song_request_id uuid,
    CONSTRAINT user_scores_achievement_rate_check CHECK (((achievement_rate >= (0)::numeric) AND (achievement_rate <= 100.00))),
    CONSTRAINT user_scores_fc_allowed CHECK (((fc IS NULL) OR (fc = ANY (ARRAY['FC'::text, 'EXC'::text])))),
    CONSTRAINT user_scores_fc_check CHECK (((fc IS NULL) OR (fc = ANY (ARRAY['FC'::text, 'EXC'::text])))),
    CONSTRAINT user_scores_play_option_allowed CHECK ((play_option = ANY (ARRAY['NORMAL'::text, 'RAN'::text, 'SRA'::text, 'RAN+'::text, 'SRA+'::text]))),
    CONSTRAINT user_scores_play_option_check CHECK ((play_option = ANY (ARRAY['NORMAL'::text, 'RAN'::text, 'SRA'::text, 'RAN+'::text, 'SRA+'::text]))),
    CONSTRAINT user_scores_song_or_request_check CHECK ((((song_id IS NOT NULL) AND (song_request_id IS NULL)) OR ((song_id IS NULL) AND (song_request_id IS NOT NULL))))
);


--
-- Name: my_score_details; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.my_score_details WITH (security_invoker='true') AS
 SELECT us.id AS score_id,
    us.user_id,
    us.song_id,
    us.song_request_id,
    COALESCE(s.is_hot, false) AS is_hot,
    COALESCE(s.title, sr.title) AS title,
    COALESCE(s.part, sr.part) AS part,
    COALESCE(s.level, sr.proposed_level) AS level,
    us.achievement_rate,
    us.fc,
    us.play_option,
    trunc((((COALESCE(s.level, sr.proposed_level) * (20)::numeric) * us.achievement_rate) / 100.0), 2) AS skill,
    (us.song_request_id IS NOT NULL) AS pending_master,
    sr.status AS request_status,
    us.created_at,
    us.updated_at
   FROM ((public.user_scores us
     LEFT JOIN public.songs s ON ((s.id = us.song_id)))
     LEFT JOIN public.song_requests sr ON ((sr.id = us.song_request_id)))
  WHERE (us.user_id = auth.uid());


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    username text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_favorites (
    user_id uuid NOT NULL,
    favorite_user_id uuid NOT NULL,
    sort_order smallint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_favorites_not_self CHECK ((user_id <> favorite_user_id)),
    CONSTRAINT user_favorites_sort_order_check CHECK (((sort_order >= 1) AND (sort_order <= 5)))
);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (user_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: song_requests song_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.song_requests
    ADD CONSTRAINT song_requests_pkey PRIMARY KEY (id);


--
-- Name: songs songs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.songs
    ADD CONSTRAINT songs_pkey PRIMARY KEY (id);


--
-- Name: songs songs_title_part_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.songs
    ADD CONSTRAINT songs_title_part_key UNIQUE (title, part);


--
-- Name: user_favorites user_favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_favorites
    ADD CONSTRAINT user_favorites_pkey PRIMARY KEY (user_id, favorite_user_id);


--
-- Name: user_scores user_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_scores
    ADD CONSTRAINT user_scores_pkey PRIMARY KEY (id);


--
-- Name: user_scores user_scores_user_id_song_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_scores
    ADD CONSTRAINT user_scores_user_id_song_id_key UNIQUE (user_id, song_id);


--
-- Name: song_requests_pending_level_correction_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX song_requests_pending_level_correction_unique ON public.song_requests USING btree (requester_id, current_song_id) WHERE ((status = 'pending'::text) AND (request_type = 'level_correction'::text));


--
-- Name: song_requests_pending_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX song_requests_pending_unique ON public.song_requests USING btree (requester_id, lower(title), part) WHERE ((status = 'pending'::text) AND (request_type = 'new_song'::text));


--
-- Name: song_requests_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX song_requests_status_created_idx ON public.song_requests USING btree (status, created_at);


--
-- Name: songs_is_hot_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX songs_is_hot_idx ON public.songs USING btree (is_hot);


--
-- Name: songs_title_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX songs_title_idx ON public.songs USING btree (title);


--
-- Name: songs_title_part_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX songs_title_part_idx ON public.songs USING btree (title, part);


--
-- Name: user_favorites_user_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_favorites_user_order_idx ON public.user_favorites USING btree (user_id, sort_order);


--
-- Name: user_scores_song_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_scores_song_id_idx ON public.user_scores USING btree (song_id);


--
-- Name: user_scores_song_request_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_scores_song_request_idx ON public.user_scores USING btree (song_request_id);


--
-- Name: user_scores_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_scores_user_id_idx ON public.user_scores USING btree (user_id);


--
-- Name: user_scores_user_request_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_scores_user_request_unique ON public.user_scores USING btree (user_id, song_request_id) WHERE (song_request_id IS NOT NULL);


--
-- Name: songs songs_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER songs_touch_updated_at BEFORE UPDATE ON public.songs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: user_favorites trg_user_favorites_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_favorites_limit BEFORE INSERT ON public.user_favorites FOR EACH ROW EXECUTE FUNCTION public.enforce_favorite_limit();


--
-- Name: user_scores user_scores_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_scores_touch_updated_at BEFORE UPDATE ON public.user_scores FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: admin_users admin_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: song_requests song_requests_current_song_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.song_requests
    ADD CONSTRAINT song_requests_current_song_id_fkey FOREIGN KEY (current_song_id) REFERENCES public.songs(id) ON DELETE CASCADE;


--
-- Name: song_requests song_requests_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.song_requests
    ADD CONSTRAINT song_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: song_requests song_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.song_requests
    ADD CONSTRAINT song_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_favorites user_favorites_favorite_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_favorites
    ADD CONSTRAINT user_favorites_favorite_user_id_fkey FOREIGN KEY (favorite_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_favorites user_favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_favorites
    ADD CONSTRAINT user_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_scores user_scores_song_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_scores
    ADD CONSTRAINT user_scores_song_id_fkey FOREIGN KEY (song_id) REFERENCES public.songs(id) ON DELETE CASCADE;


--
-- Name: user_scores user_scores_song_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_scores
    ADD CONSTRAINT user_scores_song_request_id_fkey FOREIGN KEY (song_request_id) REFERENCES public.song_requests(id) ON DELETE CASCADE;


--
-- Name: user_scores user_scores_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_scores
    ADD CONSTRAINT user_scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: admin_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_users admin_users_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_users_select_own ON public.admin_users FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: user_favorites favorites_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY favorites_delete_own ON public.user_favorites FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: user_favorites favorites_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY favorites_insert_own ON public.user_favorites FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: user_favorites favorites_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY favorites_select_own ON public.user_favorites FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: user_favorites favorites_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY favorites_update_own ON public.user_favorites FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_admin ON public.profiles FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: profiles profiles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING ((id = auth.uid()));


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: song_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.song_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: song_requests song_requests_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY song_requests_insert_own ON public.song_requests FOR INSERT TO authenticated WITH CHECK (((requester_id = auth.uid()) AND (status = 'pending'::text)));


--
-- Name: song_requests song_requests_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY song_requests_select_admin ON public.song_requests FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: song_requests song_requests_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY song_requests_select_own ON public.song_requests FOR SELECT TO authenticated USING ((requester_id = auth.uid()));


--
-- Name: song_requests song_requests_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY song_requests_update_admin ON public.song_requests FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: songs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;

--
-- Name: songs songs_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY songs_delete_admin ON public.songs FOR DELETE TO authenticated USING (public.is_admin());


--
-- Name: songs songs_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY songs_insert_admin ON public.songs FOR INSERT TO authenticated WITH CHECK (public.is_admin());


--
-- Name: songs songs_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY songs_select_authenticated ON public.songs FOR SELECT TO authenticated USING (true);


--
-- Name: songs songs_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY songs_update_admin ON public.songs FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: user_favorites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

--
-- Name: user_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: user_scores user_scores_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_scores_delete_own ON public.user_scores FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: user_scores user_scores_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_scores_insert_own ON public.user_scores FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_scores user_scores_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_scores_select_own ON public.user_scores FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: user_scores user_scores_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_scores_update_own ON public.user_scores FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- PostgreSQL database dump complete
--

\unrestrict 4rvrEc9rsi2cpgY7uPqiuNgZoPam0uzOEec9YaUydOncyuXYe5bgkpmYZmTWRXy

