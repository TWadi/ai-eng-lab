-- Layered database architecture (the database's own "RTE"):
--   public  = the API the site talks to: tables it reads under row-level security + the functions it may call.
--   private = everything else, invisible to the Supabase API: answer keys, question bank, member/admin lists,
--             the duel referee, triggers, and the predicates RLS uses.
-- Also: every rule's number (duel clock, grace, invite lifetime, countdown, pass mark) is defined once
-- (private.duel_limit / duel_grace / invite_ttl / duel_countdown / is_pass), integrity checks and foreign keys
-- the review found missing, and the coding-challenge catalog is now public.challenges (races + solves).
-- No behavior change: supabase/tests replays this and runs the full behavioral suite.

-- ── Part A: layers ─────────────────────────────────────────────────────────────────────────────────────
-- public  = the API (ports): tables the site reads under RLS, and the functions it may call.
-- private = internals, invisible to the Supabase API: secret tables, the duel referee, triggers, policy helpers.

create schema if not exists private;
revoke all on schema private from public;
-- RLS policies call two private predicates as the signed-in user, so that role needs USAGE (but nothing else).
grant usage on schema private to authenticated;
-- Supabase Auth inserts users as supabase_auth_admin; the sign-up trigger lives in private.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema private to supabase_auth_admin;
  end if;
end $$;

alter table public.members   set schema private;
alter table public.admins    set schema private;
alter table public.quiz_bank set schema private;
alter table public.quiz_keys set schema private;
alter table public.duel_keys set schema private;

alter function public.handle_new_user()             set schema private;
alter function public.complete_item_on_pass()       set schema private;
alter function public.guard_one_open_duel()         set schema private;
alter function public.decide_duel(uuid)             set schema private;
alter function public.duel_limit(text)              set schema private;
alter function public.is_lab_admin()                set schema private;
alter function public.item_has_quiz(text)           set schema private;
alter function public.passed_quiz(uuid, text)       set schema private;

-- The coding-challenge catalog serves both races and solves.
alter table public.race_challenges rename to challenges;
alter policy "Race challenges are public" on public.challenges rename to "Challenges are public";

-- ── Settings: every rule's number lives in exactly one place ──────────────────────────────────────────
create or replace function private.duel_limit(p_kind text)
returns interval language sql immutable set search_path = ''
as $$ select case when p_kind = 'code' then interval '15 minutes' else interval '2 minutes' end $$;

-- Extra time after the clock for network lag before a duel is closed.
create or replace function private.duel_grace()
returns interval language sql immutable set search_path = ''
as $$ select interval '15 seconds' $$;

create or replace function private.invite_ttl()
returns interval language sql immutable set search_path = ''
as $$ select interval '5 minutes' $$;

create or replace function private.duel_countdown()
returns interval language sql immutable set search_path = ''
as $$ select interval '5 seconds' $$;

-- A quiz is passed with 80% (4 of 5). Also the site's QUIZ_PASS rule.
create or replace function private.is_pass(p_score int, p_total int)
returns boolean language sql immutable set search_path = ''
as $$ select p_score is not null and p_total > 0 and p_score * 5 >= p_total * 4 $$;

-- ── Part B: every function rewired to private internals and named settings ─────────────────────────
CREATE OR REPLACE FUNCTION private.complete_item_on_pass()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.completed_at is not null and private.is_pass(new.score, new.total)
     and exists (select 1 from public.profiles p where p.id = new.user_id and p.is_member) then
    insert into public.progress (user_id, item_id, done_at)
    values (new.user_id, new.item_id, new.completed_at)
    on conflict do nothing;
  end if;
  return new;
end;
$function$

;
-- ===
CREATE OR REPLACE FUNCTION private.decide_duel(p_duel uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  d public.duels%rowtype;
  a public.duel_entries%rowtype;
  b public.duel_entries%rowtype;
  a_score int; b_score int; a_time int; b_time int;
  a_solved boolean; b_solved boolean;
  over boolean;
  w uuid;
begin
  select * into d from public.duels where id = p_duel for update;
  if d.status <> 'live' then return; end if;
  select * into a from public.duel_entries where duel_id = p_duel and user_id = d.challenger;
  select * into b from public.duel_entries where duel_id = p_duel and user_id = d.opponent;
  over := now() > d.starts_at + private.duel_limit(d.kind) + private.duel_grace();

  if d.kind = 'code' then
    -- The first correct solution wins the moment it arrives (submit_race locks the duel, so there is only one).
    a_solved := coalesce(a.submitted_at is not null and a.score = 1, false);
    b_solved := coalesce(b.submitted_at is not null and b.score = 1, false);
    -- Also over: one player gave up and the other never opened the race.
    if not (a_solved or b_solved or over
            or (a.submitted_at is not null and b.submitted_at is not null)
            or (a.submitted_at is not null and b.duel_id is null)
            or (b.submitted_at is not null and a.duel_id is null)) then
      return;
    end if;
    if not a_solved and not b_solved then
      -- Nobody solved it (time ran out or both gave up): no winner, no XP.
      update public.duels set status = 'expired', completed_at = now(),
             challenge_id = (select k.challenge_id from private.duel_keys k where k.duel_id = p_duel)
       where id = p_duel;
      return;
    end if;
    update public.duels set status = 'done', winner = case when a_solved then d.challenger else d.opponent end,
           completed_at = now(), challenge_id = (select k.challenge_id from private.duel_keys k where k.duel_id = p_duel)
     where id = p_duel;
    return;
  end if;

  if not ((a.submitted_at is not null and b.submitted_at is not null) or over) then
    return;
  end if;

  -- Nobody played: the duel just expires (no XP for anyone).
  if a.submitted_at is null and b.submitted_at is null then
    update public.duels set status = 'expired', completed_at = now() where id = p_duel;
    return;
  end if;

  a_score := case when a.submitted_at is null then -1 else a.score end;
  b_score := case when b.submitted_at is null then -1 else b.score end;
  a_time := coalesce(a.time_ms, 2147483647);
  b_time := coalesce(b.time_ms, 2147483647);
  w := case
    when a_score > b_score then d.challenger
    when b_score > a_score then d.opponent
    when a_time < b_time then d.challenger
    when b_time < a_time then d.opponent
    else null
  end;
  update public.duels set status = 'done', winner = w, completed_at = now() where id = p_duel;
end;
$function$

;
-- ===
CREATE OR REPLACE FUNCTION private.guard_one_open_duel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status not in ('pending', 'live') then
    return new;
  end if;
  -- Lock both players (in a fixed order, so two opposite challenges can't deadlock).
  perform pg_advisory_xact_lock(hashtextextended(least(new.challenger, new.opponent)::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(greatest(new.challenger, new.opponent)::text, 0));
  if exists (
    select 1 from public.duels d
     where d.id <> new.id and d.status in ('pending', 'live')
       and (d.challenger in (new.challenger, new.opponent) or d.opponent in (new.challenger, new.opponent))
  ) then
    raise exception 'One of you already has a duel waiting or in progress. Finish or cancel it first.';
  end if;
  return new;
end;
$function$

;
-- ===
CREATE OR REPLACE FUNCTION private.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  from_github boolean := coalesce(new.raw_app_meta_data ->> 'provider', '') = 'github'
                         or coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'github';
  uname text := case when from_github then nullif(trim(new.raw_user_meta_data ->> 'user_name'), '') end;
begin
  insert into public.profiles (id, github_username, display_name, avatar_url, is_member, is_admin)
  values (
    new.id,
    coalesce(uname, ''),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    uname is not null and exists (select 1 from private.members m where lower(m.github_username) = lower(uname)),
    uname is not null and exists (select 1 from private.admins a where lower(a.github_username) = lower(uname))
  );
  return new;
end;
$function$

;
-- ===
CREATE OR REPLACE FUNCTION private.is_lab_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
$function$

;
-- ===
CREATE OR REPLACE FUNCTION private.item_has_quiz(p_item text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from private.quiz_bank q where q.item_id = p_item)
$function$

;
-- ===
CREATE OR REPLACE FUNCTION private.passed_quiz(p_user uuid, p_item text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.quiz_attempts a
     where a.user_id = p_user and a.item_id = p_item
       and a.completed_at is not null and private.is_pass(a.score, a.total)
  )
$function$

;
-- ===
CREATE OR REPLACE FUNCTION public.cancel_duel(p_duel uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.duels set status = 'cancelled', completed_at = now()
   where id = p_duel and challenger = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Only a waiting challenge you sent can be cancelled';
  end if;
end;
$function$

;
-- ===
CREATE OR REPLACE FUNCTION public.create_duel(p_item text, p_opponent uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  recent int;
  duel uuid;
  q record;
  opts jsonb;
  perm bigint[];
  qs jsonb := '[]'::jsonb;
  keys jsonb := '[]'::jsonb;
  expl jsonb := '[]'::jsonb;
  stale record;
begin
  if uid is null or not exists (select 1 from public.profiles p where p.id = uid and p.is_member) then
    raise exception 'Only lab members can start duels';
  end if;
  if p_opponent = uid then
    raise exception 'Pick someone else to duel';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_opponent and p.is_member) then
    raise exception 'That player is not a lab member';
  end if;

  -- Close live duels whose time is up, so they never block new challenges.
  for stale in select id from public.duels where status = 'live' and starts_at < now() - private.duel_limit('quiz') - private.duel_grace() loop
    perform private.decide_duel(stale.id);
  end loop;

  -- Stale invites first, so they don't block new ones.
  update public.duels set status = 'expired', completed_at = now()
   where status = 'pending' and created_at < now() - private.invite_ttl();

  if exists (select 1 from public.duels d where d.status in ('pending', 'live')
             and (uid in (d.challenger, d.opponent) or p_opponent in (d.challenger, d.opponent))) then
    raise exception 'One of you already has a duel waiting or in progress. Finish or cancel it first.';
  end if;

  select count(*) into recent from public.duels where challenger = uid and created_at > now() - interval '24 hours';
  if recent >= 30 then
    raise exception 'You have sent 30 challenges in 24 hours. Try again tomorrow.';
  end if;

  for q in select * from private.quiz_bank where item_id = p_item order by random() limit 5 loop
    select jsonb_agg(o.value order by o.r), array_agg(o.idx order by o.r)
      into opts, perm
      from (select value, ordinality - 1 as idx, random() as r
              from jsonb_array_elements(q.options) with ordinality) o;
    qs := qs || jsonb_build_array(jsonb_build_object('question', q.question, 'options', opts));
    keys := keys || to_jsonb(array_position(perm, q.answer_index::bigint) - 1);
    expl := expl || to_jsonb(q.explanation);
  end loop;
  if jsonb_array_length(qs) = 0 then
    raise exception 'There is no quiz for this item yet';
  end if;

  insert into public.duels (item_id, challenger, opponent, status) values (p_item, uid, p_opponent, 'pending') returning id into duel;
  insert into private.duel_keys (duel_id, questions, answer_indexes, explanations) values (duel, qs, keys, expl);
  return jsonb_build_object('id', duel, 'server_now', now());
end;
$function$

;
-- ===
CREATE OR REPLACE FUNCTION public.create_race(p_opponent uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  recent int;
  pick text;
  duel uuid;
  stale record;
begin
  if uid is null or not exists (select 1 from public.profiles p where p.id = uid and p.is_member) then
    raise exception 'Only lab members can start races';
  end if;
  if p_opponent = uid then
    raise exception 'Pick someone else to race';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_opponent and p.is_member) then
    raise exception 'That player is not a lab member';
  end if;

  -- Close live duels whose time is up and stale invites, so they never block new challenges.
  for stale in select id from public.duels where status = 'live' and starts_at < now() - private.duel_limit('quiz') - private.duel_grace() loop
    perform private.decide_duel(stale.id);
  end loop;
  update public.duels set status = 'expired', completed_at = now()
   where status = 'pending' and created_at < now() - private.invite_ttl();

  if exists (select 1 from public.duels d where d.status in ('pending', 'live')
             and (uid in (d.challenger, d.opponent) or p_opponent in (d.challenger, d.opponent))) then
    raise exception 'One of you already has a duel waiting or in progress. Finish or cancel it first.';
  end if;

  select count(*) into recent from public.duels where challenger = uid and created_at > now() - interval '24 hours';
  if recent >= 30 then
    raise exception 'You have sent 30 challenges in 24 hours. Try again tomorrow.';
  end if;

  select id into pick from public.challenges order by random() limit 1;
  if pick is null then
    raise exception 'There are no race challenges yet';
  end if;
  insert into public.duels (kind, item_id, challenger, opponent, status) values ('code', null, uid, p_opponent, 'pending') returning id into duel;
  insert into private.duel_keys (duel_id, questions, answer_indexes, explanations, challenge_id)
       values (duel, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, pick);
  return jsonb_build_object('id', duel, 'server_now', now());
end;
$function$

;
-- ===
CREATE OR REPLACE FUNCTION public.decline_player(p_github text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_lab_admin() then
    raise exception 'Only admins can decline players';
  end if;
  update public.profiles set declined_at = now()
   where lower(github_username) = lower(p_github) and not is_member;
  if not found then
    raise exception 'Nobody with that username is waiting';
  end if;
end;
$function$

;
-- ===
CREATE OR REPLACE FUNCTION public.finish_duel(p_duel uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  d public.duels%rowtype;
begin
  select * into d from public.duels where id = p_duel;
  if not found or auth.uid() is null or auth.uid() not in (d.challenger, d.opponent) then
    raise exception 'Duel not found';
  end if;
  perform private.decide_duel(p_duel);
  return (select status from public.duels where id = p_duel);
end;
$function$

;
-- ===
CREATE OR REPLACE FUNCTION public.invite_player(p_github text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  name text := trim(p_github);
  promoted int;
begin
  if not private.is_lab_admin() then
    raise exception 'Only admins can invite players';
  end if;
  if name is null or name !~ '^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$' then
    raise exception 'That is not a valid GitHub username';
  end if;
  insert into private.members (github_username) values (name) on conflict do nothing;
  update public.profiles set is_member = true, declined_at = null where lower(github_username) = lower(name) and not is_member;
  get diagnostics promoted = row_count;
  return jsonb_build_object('github_username', name, 'signed_in', promoted > 0
         or exists (select 1 from public.profiles p where lower(p.github_username) = lower(name)));
end;
$function$

;
-- ===
CREATE OR REPLACE FUNCTION public.lab_admin_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_lab_admin() then
    raise exception 'Only admins can manage players';
  end if;
  return jsonb_build_object(
    'waiting', coalesce((
      select jsonb_agg(jsonb_build_object('github_username', p.github_username, 'display_name', p.display_name,
                                          'avatar_url', p.avatar_url, 'signed_in_at', p.created_at) order by p.created_at desc)
        from public.profiles p where not p.is_member and p.declined_at is null and p.github_username <> ''), '[]'::jsonb),
    'declined', coalesce((
      select jsonb_agg(jsonb_build_object('github_username', p.github_username, 'display_name', p.display_name,
                                          'avatar_url', p.avatar_url, 'signed_in_at', p.created_at) order by p.declined_at desc)
        from public.profiles p where not p.is_member and p.declined_at is not null), '[]'::jsonb),
    'invited', coalesce((
      select jsonb_agg(m.github_username order by m.github_username)
        from private.members m
       where not exists (select 1 from public.profiles p where lower(p.github_username) = lower(m.github_username))), '[]'::jsonb)
  );
end;
$function$

;
-- ===
CREATE OR REPLACE FUNCTION public.quiz_items()
 RETURNS TABLE(item_id text, questions integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select b.item_id, count(*)::int from private.quiz_bank b group by b.item_id;
$function$

;
-- ===
CREATE OR REPLACE FUNCTION public.remove_player(p_github text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_lab_admin() then
    raise exception 'Only admins can remove players';
  end if;
  if exists (select 1 from public.profiles p where lower(p.github_username) = lower(p_github) and p.is_admin) then
    raise exception 'Admins can''t be removed here';
  end if;
  delete from private.members where lower(github_username) = lower(p_github);
  update public.profiles set is_member = false where lower(github_username) = lower(p_github);
end;
$function$

;
-- ===
CREATE OR REPLACE FUNCTION public.respond_duel(p_duel uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  d public.duels%rowtype;
begin
  select * into d from public.duels where id = p_duel for update;
  if not found or uid is distinct from d.opponent then
    raise exception 'Challenge not found';
  end if;
  if d.status <> 'pending' then
    raise exception 'This challenge is no longer waiting for an answer';
  end if;
  if d.created_at < now() - private.invite_ttl() then
    update public.duels set status = 'expired', completed_at = now() where id = p_duel;
    raise exception 'This challenge expired';
  end if;

  if p_accept then
    update public.duels set status = 'live', starts_at = now() + private.duel_countdown() where id = p_duel returning * into d;
  else
    update public.duels set status = 'declined', completed_at = now() where id = p_duel returning * into d;
  end if;
  return jsonb_build_object('status', d.status, 'starts_at', d.starts_at, 'server_now', now());
end;
$function$

;
-- ===
CREATE OR REPLACE FUNCTION public.start_duel(p_duel uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  d public.duels%rowtype;
  e public.duel_entries%rowtype;
  k private.duel_keys%rowtype;
begin
  select * into d from public.duels where id = p_duel;
  if not found or uid is null or uid not in (d.challenger, d.opponent) then
    raise exception 'Duel not found';
  end if;
  if d.status = 'live' and now() > d.starts_at + private.duel_limit(d.kind) + private.duel_grace() then
    -- Close it and report back (raising here would roll the close back).
    perform private.decide_duel(p_duel);
    return jsonb_build_object('over', true);
  end if;
  if d.status <> 'live' then
    raise exception 'This duel is not live';
  end if;

  if now() < d.starts_at - interval '300 milliseconds' then
    return jsonb_build_object('id', p_duel, 'kind', d.kind, 'starts_at', d.starts_at, 'server_now', now());
  end if;

  select * into e from public.duel_entries where duel_id = p_duel and user_id = uid;
  if found and e.submitted_at is not null then
    raise exception 'You already submitted this duel';
  end if;
  if not found then
    insert into public.duel_entries (duel_id, user_id, started_at) values (p_duel, uid, d.starts_at);
  end if;

  select * into k from private.duel_keys where duel_id = p_duel;
  return jsonb_build_object(
    'id', p_duel,
    'kind', d.kind,
    'starts_at', d.starts_at,
    'ends_at', d.starts_at + private.duel_limit(d.kind),
    'server_now', now(),
    'questions', case when d.kind = 'quiz' then k.questions end,
    'challenge_id', case when d.kind = 'code' then k.challenge_id end
  );
end;
$function$

;
-- ===
CREATE OR REPLACE FUNCTION public.start_quiz(p_item text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  recent int;
  attempt uuid;
  q record;
  opts jsonb;
  perm bigint[];
  qs jsonb := '[]'::jsonb;
  keys jsonb := '[]'::jsonb;
  expl jsonb := '[]'::jsonb;
begin
  if uid is null or not exists (select 1 from public.profiles p where p.id = uid and p.is_member) then
    raise exception 'Only lab members can take quizzes';
  end if;

  select count(*) into recent from public.quiz_attempts
   where user_id = uid and created_at > now() - interval '24 hours';
  if recent >= 50 then
    raise exception 'You have taken 50 quizzes in 24 hours. Take a break and try again tomorrow.';
  end if;

  for q in select * from private.quiz_bank where item_id = p_item order by random() limit 5 loop
    -- Shuffle the options so answer positions differ between attempts.
    select jsonb_agg(o.value order by o.r), array_agg(o.idx order by o.r)
      into opts, perm
      from (select value, ordinality - 1 as idx, random() as r
              from jsonb_array_elements(q.options) with ordinality) o;
    qs := qs || jsonb_build_array(jsonb_build_object('question', q.question, 'options', opts));
    keys := keys || to_jsonb(array_position(perm, q.answer_index::bigint) - 1);
    expl := expl || to_jsonb(q.explanation);
  end loop;

  if jsonb_array_length(qs) = 0 then
    raise exception 'There is no quiz for this item yet';
  end if;

  insert into public.quiz_attempts (user_id, item_id, questions, total, status)
  values (uid, p_item, qs, jsonb_array_length(qs), 'ready')
  returning id into attempt;

  insert into private.quiz_keys (attempt_id, answer_indexes, explanations)
  values (attempt, keys, expl);

  return jsonb_build_object('id', attempt, 'questions', qs);
end;
$function$

;
-- ===
CREATE OR REPLACE FUNCTION public.submit_duel(p_duel uuid, p_answers integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  d public.duels%rowtype;
  e public.duel_entries%rowtype;
  k private.duel_keys%rowtype;
  n int;
  correct int := 0;
  i int;
  attempt uuid;
begin
  -- Lock the duel so two simultaneous submits are serialized and the second one sees the first.
  select * into d from public.duels where id = p_duel for update;
  if not found or uid is null or uid not in (d.challenger, d.opponent) then
    raise exception 'Duel not found';
  end if;
  if d.kind <> 'quiz' then
    raise exception 'This is a code race';
  end if;
  if d.status = 'live' and now() > d.starts_at + private.duel_limit(d.kind) + private.duel_grace() then
    perform private.decide_duel(p_duel);
    return jsonb_build_object('over', true);
  end if;
  if d.status <> 'live' then
    raise exception 'This duel is already over';
  end if;
  select * into e from public.duel_entries where duel_id = p_duel and user_id = uid for update;
  if not found then
    raise exception 'Start the duel first';
  end if;
  if e.submitted_at is not null then
    raise exception 'You already submitted this duel';
  end if;

  select * into k from private.duel_keys where duel_id = p_duel;
  n := jsonb_array_length(k.questions);
  if p_answers is null or coalesce(array_length(p_answers, 1), 0) <> n then
    raise exception 'Send one answer per question (use -1 for skipped)';
  end if;
  for i in 1 .. n loop
    if p_answers[i] is null or p_answers[i] < -1 or p_answers[i] > 3 then
      raise exception 'Invalid answer';
    end if;
    if p_answers[i] = (k.answer_indexes ->> (i - 1))::int then
      correct := correct + 1;
    end if;
  end loop;

  update public.duel_entries
     set submitted_at = now(), answers = to_jsonb(p_answers), score = correct,
         time_ms = least((extract(epoch from (now() - d.starts_at)) * 1000)::int, (extract(epoch from private.duel_limit(d.kind)) * 1000)::int)
   where duel_id = p_duel and user_id = uid
   returning * into e;

  -- The duel also counts as this player's quiz on the item (best attempt still wins for XP).
  insert into public.quiz_attempts (user_id, item_id, questions, answers, score, total, status, created_at, completed_at, source_duel)
  values (uid, d.item_id, k.questions, to_jsonb(p_answers), correct, n, 'ready', d.starts_at, now(), p_duel)
  on conflict (source_duel, user_id) do nothing
  returning id into attempt;
  if attempt is not null then
    insert into private.quiz_keys (attempt_id, answer_indexes, explanations) values (attempt, k.answer_indexes, k.explanations);
  end if;

  perform private.decide_duel(p_duel);

  return jsonb_build_object(
    'score', correct, 'total', n, 'time_ms', e.time_ms,
    'questions', k.questions, 'answers', to_jsonb(p_answers),
    'answer_indexes', k.answer_indexes, 'explanations', k.explanations
  );
end;
$function$

;
-- ===
CREATE OR REPLACE FUNCTION public.submit_quiz(p_attempt uuid, p_answers integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.quiz_attempts%rowtype;
  k private.quiz_keys%rowtype;
  n int;
  correct int := 0;
  i int;
begin
  select * into a from public.quiz_attempts where id = p_attempt for update;
  if not found or a.user_id is distinct from auth.uid() then
    raise exception 'Quiz not found';
  end if;
  if a.status <> 'ready' or a.completed_at is not null then
    raise exception 'This quiz can no longer be submitted';
  end if;

  n := jsonb_array_length(a.questions);
  if p_answers is null or coalesce(array_length(p_answers, 1), 0) <> n then
    raise exception 'Answer every question';
  end if;
  for i in 1 .. n loop
    if p_answers[i] is null or p_answers[i] < 0 or p_answers[i] > 3 then
      raise exception 'Invalid answer';
    end if;
  end loop;

  select * into k from private.quiz_keys where attempt_id = p_attempt;
  if not found then
    raise exception 'Quiz key missing';
  end if;

  for i in 1 .. n loop
    if p_answers[i] = (k.answer_indexes ->> (i - 1))::int then
      correct := correct + 1;
    end if;
  end loop;

  update public.quiz_attempts
     set answers = to_jsonb(p_answers), score = correct, completed_at = now()
   where id = p_attempt;

  return jsonb_build_object(
    'score', correct,
    'total', n,
    'questions', a.questions,
    'answers', to_jsonb(p_answers),
    'answer_indexes', k.answer_indexes,
    'explanations', k.explanations
  );
end;
$function$

;
-- ===
CREATE OR REPLACE FUNCTION public.submit_race(p_duel uuid, p_passed boolean, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  d public.duels%rowtype;
  e public.duel_entries%rowtype;
begin
  select * into d from public.duels where id = p_duel for update;
  if not found or uid is null or uid not in (d.challenger, d.opponent) then
    raise exception 'Race not found';
  end if;
  if d.kind <> 'code' then
    raise exception 'This is not a code race';
  end if;
  if d.status = 'live' and now() > d.starts_at + private.duel_limit(d.kind) + private.duel_grace() then
    perform private.decide_duel(p_duel);
    return jsonb_build_object('over', true);
  end if;
  if d.status <> 'live' then
    raise exception 'This race is already over';
  end if;
  if p_passed is null or p_code is null or length(p_code) > 20000 then
    raise exception 'Invalid submission';
  end if;
  -- The grace period is for network lag on closing the race, not for extra coding time.
  if p_passed and now() > d.starts_at + private.duel_limit(d.kind) + interval '3 seconds' then
    raise exception 'Time is up';
  end if;
  select * into e from public.duel_entries where duel_id = p_duel and user_id = uid for update;
  if not found then
    raise exception 'Start the race first';
  end if;
  if e.submitted_at is not null then
    raise exception 'You already finished this race';
  end if;

  update public.duel_entries
     set submitted_at = now(), score = case when p_passed then 1 else 0 end,
         answers = jsonb_build_object('code', p_code),
         time_ms = least((extract(epoch from (now() - d.starts_at)) * 1000)::int, (extract(epoch from private.duel_limit(d.kind)) * 1000)::int)
   where duel_id = p_duel and user_id = uid
   returning * into e;

  perform private.decide_duel(p_duel);

  return jsonb_build_object('score', e.score, 'time_ms', e.time_ms,
                            'status', (select status from public.duels where id = p_duel));
end;
$function$
;

-- ── Part C: integrity and privileges ──────────────────────────────────────────────────────────────────
-- Nothing in private is callable through the API, except the two predicates RLS evaluates as the user.
revoke all on all functions in schema private from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public;
grant execute on function private.item_has_quiz(text), private.passed_quiz(uuid, text) to authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function private.handle_new_user() to supabase_auth_admin;
  end if;
end $$;

-- Values must make sense, whatever writes them.
alter table public.quiz_attempts
  add constraint quiz_attempts_total_range check (total between 1 and 10),
  add constraint quiz_attempts_score_range check (score is null or score between 0 and total);
alter table public.duels
  add constraint duels_winner_is_player check (winner is null or winner in (challenger, opponent)),
  add constraint duels_challenge_fk foreign key (challenge_id) references public.challenges (id);
alter table public.duel_entries
  add constraint duel_entries_score_range check (score is null or score between 0 and 10),
  add constraint duel_entries_time_positive check (time_ms is null or time_ms >= 0);
alter table private.duel_keys
  add constraint duel_keys_challenge_fk foreign key (challenge_id) references public.challenges (id);
alter table public.challenge_solves
  add constraint challenge_solves_challenge_fk foreign key (challenge_id) references public.challenges (id);

-- One profile per GitHub account name (empty for non-GitHub sign-ups).
create unique index if not exists profiles_github_lower_key
  on public.profiles (lower(github_username)) where github_username <> '';
create index if not exists duels_winner_idx on public.duels (winner) where winner is not null;

-- Someone waiting to be let in can at least read their own profile.
drop policy if exists "Member profiles are public" on public.profiles;
create policy "Member profiles are public, and your own"
  on public.profiles for select
  using (is_member or id = (select auth.uid()));

comment on schema private is 'Internals hidden from the Supabase API: secret tables, the duel referee, triggers and policy helpers.';
comment on schema public is 'The API: tables the site reads under row-level security, and the functions it may call.';
