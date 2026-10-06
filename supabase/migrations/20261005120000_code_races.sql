-- Code races: a live duel on a coding challenge. Same invite flow as quiz duels (challenge -> accept -> 5 s countdown),
-- then both players get the same challenge, picked at random by the server and revealed only by start_duel().
-- The first to pass every test wins. Tests run in each player's browser (Pyodide), so the server trusts the
-- "all tests passed" claim, which is fine among the three of us. The submitted code is kept, so after the race
-- both players can read each other's solution (entries become visible once the duel is decided).
-- Races last 15 minutes, plus the same 15-second grace as quiz duels.

alter table public.duels
  add column if not exists kind text not null default 'quiz' check (kind in ('quiz', 'code')),
  -- Revealed when a race is decided (the live choice sits in duel_keys, which clients can't read).
  add column if not exists challenge_id text check (challenge_id ~ '^[a-z0-9-]{1,40}$'),
  alter column item_id drop not null;

alter table public.duels
  add constraint duels_kind_item check ((kind = 'quiz') = (item_id is not null));

alter table public.duel_keys add column if not exists challenge_id text;

-- Challenges a race can use. The server picks from here, so nobody can choose (and pre-solve) the challenge.
-- New challenges join with an insert in a later migration (a site test checks the list stays in sync).
create table public.race_challenges (
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$')
);
alter table public.race_challenges enable row level security;
create policy "Race challenges are public" on public.race_challenges for select using (true);
revoke insert, update, delete on public.race_challenges from anon, authenticated;
insert into public.race_challenges (id) values
  ('cosine-similarity'),
  ('chunk-overlap'),
  ('top-k'),
  ('precision-recall'),
  ('rrf'),
  ('bm25'),
  ('mmr'),
  ('recursive-split');

create or replace function public.duel_limit(p_kind text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case when p_kind = 'code' then interval '900 seconds' else interval '120 seconds' end
$$;

create or replace function public.decide_duel(p_duel uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
  over := now() > d.starts_at + public.duel_limit(d.kind) + interval '15 seconds';

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
             challenge_id = (select k.challenge_id from public.duel_keys k where k.duel_id = p_duel)
       where id = p_duel;
      return;
    end if;
    update public.duels set status = 'done', winner = case when a_solved then d.challenger else d.opponent end,
           completed_at = now(), challenge_id = (select k.challenge_id from public.duel_keys k where k.duel_id = p_duel)
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
$$;

revoke all on function public.decide_duel(uuid) from public, anon, authenticated;

create function public.create_race(p_opponent uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  for stale in select id from public.duels where status = 'live' and starts_at < now() - interval '135 seconds' loop
    perform public.decide_duel(stale.id);
  end loop;
  update public.duels set status = 'expired', completed_at = now()
   where status = 'pending' and created_at < now() - interval '5 minutes';

  if exists (select 1 from public.duels d where d.status in ('pending', 'live')
             and (uid in (d.challenger, d.opponent) or p_opponent in (d.challenger, d.opponent))) then
    raise exception 'One of you already has a duel waiting or in progress. Finish or cancel it first.';
  end if;

  select count(*) into recent from public.duels where challenger = uid and created_at > now() - interval '24 hours';
  if recent >= 30 then
    raise exception 'You have sent 30 challenges in 24 hours. Try again tomorrow.';
  end if;

  select id into pick from public.race_challenges order by random() limit 1;
  if pick is null then
    raise exception 'There are no race challenges yet';
  end if;
  insert into public.duels (kind, item_id, challenger, opponent, status) values ('code', null, uid, p_opponent, 'pending') returning id into duel;
  insert into public.duel_keys (duel_id, questions, answer_indexes, explanations, challenge_id)
       values (duel, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, pick);
  return jsonb_build_object('id', duel, 'server_now', now());
end;
$$;

-- Before the start time: returns how long to wait. From the start time: the questions (quiz) or the challenge (race).
create or replace function public.start_duel(p_duel uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  d public.duels%rowtype;
  e public.duel_entries%rowtype;
  k public.duel_keys%rowtype;
begin
  select * into d from public.duels where id = p_duel;
  if not found or uid is null or uid not in (d.challenger, d.opponent) then
    raise exception 'Duel not found';
  end if;
  if d.status = 'live' and now() > d.starts_at + public.duel_limit(d.kind) + interval '15 seconds' then
    -- Close it and report back (raising here would roll the close back).
    perform public.decide_duel(p_duel);
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

  select * into k from public.duel_keys where duel_id = p_duel;
  return jsonb_build_object(
    'id', p_duel,
    'kind', d.kind,
    'starts_at', d.starts_at,
    'ends_at', d.starts_at + public.duel_limit(d.kind),
    'server_now', now(),
    'questions', case when d.kind = 'quiz' then k.questions end,
    'challenge_id', case when d.kind = 'code' then k.challenge_id end
  );
end;
$$;

create or replace function public.submit_duel(p_duel uuid, p_answers int[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  d public.duels%rowtype;
  e public.duel_entries%rowtype;
  k public.duel_keys%rowtype;
  n int;
  correct int := 0;
  i int;
begin
  -- Lock the duel so two simultaneous submits are serialized and the second one sees the first.
  select * into d from public.duels where id = p_duel for update;
  if not found or uid is null or uid not in (d.challenger, d.opponent) then
    raise exception 'Duel not found';
  end if;
  if d.kind <> 'quiz' then
    raise exception 'This is a code race';
  end if;
  if d.status = 'live' and now() > d.starts_at + public.duel_limit(d.kind) + interval '15 seconds' then
    perform public.decide_duel(p_duel);
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

  select * into k from public.duel_keys where duel_id = p_duel;
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
         time_ms = least((extract(epoch from (now() - d.starts_at)) * 1000)::int, 120000)
   where duel_id = p_duel and user_id = uid
   returning * into e;

  perform public.decide_duel(p_duel);

  return jsonb_build_object(
    'score', correct, 'total', n, 'time_ms', e.time_ms,
    'questions', k.questions, 'answers', to_jsonb(p_answers),
    'answer_indexes', k.answer_indexes, 'explanations', k.explanations
  );
end;
$$;

-- A race player either passed every test (p_passed) or gave up. Their code is kept for the post-race comparison.
create function public.submit_race(p_duel uuid, p_passed boolean, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  if d.status = 'live' and now() > d.starts_at + public.duel_limit(d.kind) + interval '15 seconds' then
    perform public.decide_duel(p_duel);
    return jsonb_build_object('over', true);
  end if;
  if d.status <> 'live' then
    raise exception 'This race is already over';
  end if;
  if p_passed is null or p_code is null or length(p_code) > 20000 then
    raise exception 'Invalid submission';
  end if;
  -- The grace period is for network lag on closing the race, not for extra coding time.
  if p_passed and now() > d.starts_at + public.duel_limit(d.kind) + interval '3 seconds' then
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
         time_ms = least((extract(epoch from (now() - d.starts_at)) * 1000)::int, 900000)
   where duel_id = p_duel and user_id = uid
   returning * into e;

  perform public.decide_duel(p_duel);

  return jsonb_build_object('score', e.score, 'time_ms', e.time_ms,
                            'status', (select status from public.duels where id = p_duel));
end;
$$;

revoke all on function public.duel_limit(text) from public, anon;
revoke all on function public.create_race(uuid) from public, anon;
revoke all on function public.submit_race(uuid, boolean, text) from public, anon;
grant execute on function public.duel_limit(text) to authenticated;
grant execute on function public.create_race(uuid) to authenticated;
grant execute on function public.submit_race(uuid, boolean, text) to authenticated;
