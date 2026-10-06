-- A quiz duel also counts as each player's quiz on that roadmap item, so nobody has to redo the quiz
-- after dueling on a lecture. XP still uses the best attempt per item, so a duel can only help.
-- Duel-made attempts are tagged with source_duel (the feed already shows the duel, so it skips them).

alter table public.quiz_attempts add column if not exists source_duel uuid references public.duels (id) on delete set null;
create unique index if not exists quiz_attempts_source_duel_idx on public.quiz_attempts (source_duel, user_id);

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

  -- The duel also counts as this player's quiz on the item (best attempt still wins for XP).
  insert into public.quiz_attempts (user_id, item_id, questions, answers, score, total, status, created_at, completed_at, source_duel)
  values (uid, d.item_id, k.questions, to_jsonb(p_answers), correct, n, 'ready', d.starts_at, now(), p_duel)
  on conflict (source_duel, user_id) do nothing
  returning id into attempt;
  if attempt is not null then
    insert into public.quiz_keys (attempt_id, answer_indexes, explanations) values (attempt, k.answer_indexes, k.explanations);
  end if;

  perform public.decide_duel(p_duel);

  return jsonb_build_object(
    'score', correct, 'total', n, 'time_ms', e.time_ms,
    'questions', k.questions, 'answers', to_jsonb(p_answers),
    'answer_indexes', k.answer_indexes, 'explanations', k.explanations
  );
end;
$$;

-- Backfill: every quiz duel answer sheet already submitted becomes a finished quiz attempt.
with done as (
  select e.duel_id, e.user_id, d.item_id, k.questions, e.answers, e.score,
         jsonb_array_length(k.questions) as total, d.starts_at, e.submitted_at,
         k.answer_indexes, k.explanations
    from public.duel_entries e
    join public.duels d on d.id = e.duel_id
    join public.duel_keys k on k.duel_id = e.duel_id
   where d.kind = 'quiz' and e.submitted_at is not null and e.score is not null
     and jsonb_array_length(k.questions) > 0
), made as (
  insert into public.quiz_attempts (user_id, item_id, questions, answers, score, total, status, created_at, completed_at, source_duel)
  select user_id, item_id, questions, answers, score, total, 'ready', coalesce(starts_at, submitted_at), submitted_at, duel_id from done
  on conflict (source_duel, user_id) do nothing
  returning id, source_duel, user_id
)
insert into public.quiz_keys (attempt_id, answer_indexes, explanations)
select m.id, d.answer_indexes, d.explanations from made m join done d on d.duel_id = m.source_duel and d.user_id = m.user_id;
