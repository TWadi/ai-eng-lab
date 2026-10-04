-- Live duels: challenge -> the opponent accepts or declines -> both play at the same moment.
-- Statuses: pending (invite sent) -> live (accepted, shared start time) -> done,
-- or pending -> declined / cancelled / expired. Old asynchronous 'open' duels are cancelled.
-- Timing: invites expire after 5 minutes, a 5-second countdown, then 120 seconds to answer.

alter table public.duels drop constraint if exists duels_status_check;
update public.duels set status = 'cancelled', completed_at = now() where status = 'open';
alter table public.duels
  add constraint duels_status_check check (status in ('pending', 'live', 'done', 'declined', 'cancelled', 'expired')),
  alter column status set default 'pending',
  add column if not exists starts_at timestamptz;

drop function if exists public.create_duel(text, uuid);
drop function if exists public.start_duel(uuid);
drop function if exists public.submit_duel(uuid, int[]);

create function public.create_duel(p_item text, p_opponent uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  -- Stale invites first, so they don't block new ones.
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

  for q in select * from public.quiz_bank where item_id = p_item order by random() limit 5 loop
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
  insert into public.duel_keys (duel_id, questions, answer_indexes, explanations) values (duel, qs, keys, expl);
  return jsonb_build_object('id', duel, 'server_now', now());
end;
$$;

create function public.respond_duel(p_duel uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  if d.created_at < now() - interval '5 minutes' then
    update public.duels set status = 'expired', completed_at = now() where id = p_duel;
    raise exception 'This challenge expired';
  end if;

  if p_accept then
    update public.duels set status = 'live', starts_at = now() + interval '5 seconds' where id = p_duel returning * into d;
  else
    update public.duels set status = 'declined', completed_at = now() where id = p_duel returning * into d;
  end if;
  return jsonb_build_object('status', d.status, 'starts_at', d.starts_at, 'server_now', now());
end;
$$;

create function public.cancel_duel(p_duel uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.duels set status = 'cancelled', completed_at = now()
   where id = p_duel and challenger = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Only a waiting challenge you sent can be cancelled';
  end if;
end;
$$;

-- Before the start time: returns how long to wait. From the start time: returns the questions.
create function public.start_duel(p_duel uuid)
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
  select * into d from public.duels where id = p_duel;
  if not found or uid is null or uid not in (d.challenger, d.opponent) then
    raise exception 'Duel not found';
  end if;
  if d.status <> 'live' then
    raise exception 'This duel is not live';
  end if;

  if now() < d.starts_at - interval '300 milliseconds' then
    return jsonb_build_object('id', p_duel, 'starts_at', d.starts_at, 'server_now', now());
  end if;

  select * into e from public.duel_entries where duel_id = p_duel and user_id = uid;
  if found and e.submitted_at is not null then
    raise exception 'You already submitted this duel';
  end if;
  if not found then
    insert into public.duel_entries (duel_id, user_id, started_at) values (p_duel, uid, d.starts_at);
  end if;

  return jsonb_build_object(
    'id', p_duel,
    'starts_at', d.starts_at,
    'ends_at', d.starts_at + interval '120 seconds',
    'server_now', now(),
    'questions', (select k.questions from public.duel_keys k where k.duel_id = p_duel)
  );
end;
$$;

-- Decide a live duel once both have submitted (or the clock ran out); a missing player loses.
create function public.decide_duel(p_duel uuid)
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
  w uuid;
begin
  select * into d from public.duels where id = p_duel for update;
  if d.status <> 'live' then return; end if;
  select * into a from public.duel_entries where duel_id = p_duel and user_id = d.challenger;
  select * into b from public.duel_entries where duel_id = p_duel and user_id = d.opponent;

  if not ((a.submitted_at is not null and b.submitted_at is not null)
          or now() > d.starts_at + interval '135 seconds') then
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

create function public.submit_duel(p_duel uuid, p_answers int[])
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

-- Either player can close a duel whose clock ran out (for when the other player left).
create function public.finish_duel(p_duel uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.duels%rowtype;
begin
  select * into d from public.duels where id = p_duel;
  if not found or auth.uid() is null or auth.uid() not in (d.challenger, d.opponent) then
    raise exception 'Duel not found';
  end if;
  perform public.decide_duel(p_duel);
  return (select status from public.duels where id = p_duel);
end;
$$;

revoke all on function public.create_duel(text, uuid) from public, anon;
revoke all on function public.respond_duel(uuid, boolean) from public, anon;
revoke all on function public.cancel_duel(uuid) from public, anon;
revoke all on function public.start_duel(uuid) from public, anon;
revoke all on function public.submit_duel(uuid, int[]) from public, anon;
revoke all on function public.finish_duel(uuid) from public, anon;
grant execute on function public.create_duel(text, uuid) to authenticated;
grant execute on function public.respond_duel(uuid, boolean) to authenticated;
grant execute on function public.cancel_duel(uuid) to authenticated;
grant execute on function public.start_duel(uuid) to authenticated;
grant execute on function public.submit_duel(uuid, int[]) to authenticated;
grant execute on function public.finish_duel(uuid) to authenticated;
