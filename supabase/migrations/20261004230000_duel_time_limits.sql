-- Live duel fixes from review:
-- * start_duel / submit_duel return {over: true} (and decide the duel) once the 120 s clock plus 15 s grace is over,
--   so nobody can answer at leisure by calling the API directly.
-- * create_duel closes stale live duels first, so an abandoned duel never blocks new challenges.

create or replace function public.create_duel(p_item text, p_opponent uuid)
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
  for stale in select id from public.duels where status = 'live' and starts_at < now() - interval '135 seconds' loop
    perform public.decide_duel(stale.id);
  end loop;

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
begin
  select * into d from public.duels where id = p_duel;
  if not found or uid is null or uid not in (d.challenger, d.opponent) then
    raise exception 'Duel not found';
  end if;
  if d.status = 'live' and now() > d.starts_at + interval '135 seconds' then
    -- Close it and report back (raising here would roll the close back).
    perform public.decide_duel(p_duel);
    return jsonb_build_object('over', true);
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
  if d.status = 'live' and now() > d.starts_at + interval '135 seconds' then
    -- Close it and report back (raising here would roll the close back).
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
