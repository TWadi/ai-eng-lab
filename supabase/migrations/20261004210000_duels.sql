-- Quiz duels: two members answer the same 5 bank questions; higher score wins, faster time breaks ties.
-- Everything runs in the database (free). Questions and answers live in duel_keys, which no client can read;
-- players get questions from start_duel(), which also starts their clock.

create table public.duels (
  id            uuid primary key default gen_random_uuid(),
  item_id       text not null check (item_id ~ '^[a-z0-9]{1,8}-[0-9]{1,3}$'),
  challenger    uuid not null references public.profiles (id) on delete cascade,
  opponent      uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'open' check (status in ('open', 'done')),
  winner        uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  check (challenger <> opponent)
);

create index duels_players_idx on public.duels (challenger, opponent, created_at desc);

create table public.duel_keys (
  duel_id         uuid primary key references public.duels (id) on delete cascade,
  questions       jsonb not null,
  answer_indexes  jsonb not null,
  explanations    jsonb not null
);

create table public.duel_entries (
  duel_id       uuid not null references public.duels (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  answers       jsonb,
  score         int,
  time_ms       int,
  primary key (duel_id, user_id)
);

alter table public.duels enable row level security;
alter table public.duel_keys enable row level security;     -- no policies
alter table public.duel_entries enable row level security;

create policy "Duels are public" on public.duels for select using (true);

-- You always see your own entry; the other player's result only once the duel is decided.
create policy "Duel results after the duel" on public.duel_entries for select using (
  user_id = (select auth.uid())
  or exists (select 1 from public.duels d where d.id = duel_id and d.status = 'done')
);

revoke insert, update, delete on public.duels, public.duel_entries from anon, authenticated;
revoke all on public.duel_keys from anon, authenticated;

alter table public.duels replica identity full;
alter table public.duel_entries replica identity full;
alter publication supabase_realtime add table public.duels, public.duel_entries;

create function public.create_duel(p_item text, p_opponent uuid)
returns uuid
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

  select count(*) into recent from public.duels where challenger = uid and created_at > now() - interval '24 hours';
  if recent >= 20 then
    raise exception 'You have started 20 duels in 24 hours. Try again tomorrow.';
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

  insert into public.duels (item_id, challenger, opponent) values (p_item, uid, p_opponent) returning id into duel;
  insert into public.duel_keys (duel_id, questions, answer_indexes, explanations) values (duel, qs, keys, expl);
  return duel;
end;
$$;

-- Returns the questions and starts (or resumes) the caller's clock.
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
  if d.status <> 'open' then
    raise exception 'This duel is already decided';
  end if;

  select * into e from public.duel_entries where duel_id = p_duel and user_id = uid;
  if found and e.submitted_at is not null then
    raise exception 'You already played this duel';
  end if;
  if not found then
    insert into public.duel_entries (duel_id, user_id) values (p_duel, uid) returning * into e;
  end if;

  return jsonb_build_object(
    'id', p_duel,
    'started_at', e.started_at,
    'questions', (select k.questions from public.duel_keys k where k.duel_id = p_duel)
  );
end;
$$;

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
  other public.duel_entries%rowtype;
  n int;
  correct int := 0;
  i int;
  result_winner uuid;
begin
  select * into d from public.duels where id = p_duel for update;
  if not found or uid is null or uid not in (d.challenger, d.opponent) then
    raise exception 'Duel not found';
  end if;
  select * into e from public.duel_entries where duel_id = p_duel and user_id = uid for update;
  if not found then
    raise exception 'Start the duel first';
  end if;
  if e.submitted_at is not null then
    raise exception 'You already played this duel';
  end if;

  select * into k from public.duel_keys where duel_id = p_duel;
  n := jsonb_array_length(k.questions);
  if p_answers is null or coalesce(array_length(p_answers, 1), 0) <> n then
    raise exception 'Answer every question';
  end if;
  for i in 1 .. n loop
    if p_answers[i] is null or p_answers[i] < 0 or p_answers[i] > 3 then
      raise exception 'Invalid answer';
    end if;
    if p_answers[i] = (k.answer_indexes ->> (i - 1))::int then
      correct := correct + 1;
    end if;
  end loop;

  update public.duel_entries
     set submitted_at = now(), answers = to_jsonb(p_answers), score = correct,
         time_ms = (extract(epoch from (now() - e.started_at)) * 1000)::int
   where duel_id = p_duel and user_id = uid
   returning * into e;

  select * into other from public.duel_entries
   where duel_id = p_duel and user_id <> uid and submitted_at is not null;
  if found then
    result_winner := case
      when e.score > other.score then uid
      when other.score > e.score then other.user_id
      when e.time_ms < other.time_ms then uid
      when other.time_ms < e.time_ms then other.user_id
      else null
    end;
    update public.duels set status = 'done', winner = result_winner, completed_at = now() where id = p_duel;
    d.status := 'done';
  end if;

  return jsonb_build_object(
    'score', correct,
    'total', n,
    'time_ms', e.time_ms,
    'questions', k.questions,
    'answers', to_jsonb(p_answers),
    'answer_indexes', k.answer_indexes,
    'explanations', k.explanations,
    'status', d.status,
    'winner', result_winner,
    'opponent_score', case when d.status = 'done' then other.score end,
    'opponent_time_ms', case when d.status = 'done' then other.time_ms end
  );
end;
$$;

revoke all on function public.create_duel(text, uuid) from public, anon;
revoke all on function public.start_duel(uuid) from public, anon;
revoke all on function public.submit_duel(uuid, int[]) from public, anon;
grant execute on function public.create_duel(text, uuid) to authenticated;
grant execute on function public.start_duel(uuid) to authenticated;
grant execute on function public.submit_duel(uuid, int[]) to authenticated;
