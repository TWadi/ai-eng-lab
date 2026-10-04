-- AI quizzes: the `quiz` Edge Function writes a generated quiz (service role),
-- the member submits answers, and a trigger grades them so scores can't be typed in by hand.

create table public.quiz_attempts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  item_id       text not null check (item_id ~ '^[a-z0-9]{1,8}-[0-9]{1,3}$'),
  questions     jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 1 and 10),
  answers       jsonb check (answers is null or jsonb_typeof(answers) = 'array'),
  score         int,
  total         int not null,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index quiz_attempts_user_created_idx on public.quiz_attempts (user_id, created_at desc);

-- Grade on submit: answers can be set once, questions never change.
create function public.grade_quiz_attempt()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  i int;
  correct int := 0;
begin
  if old.completed_at is not null then
    raise exception 'This quiz was already submitted';
  end if;
  if new.questions is distinct from old.questions or new.user_id <> old.user_id
     or new.item_id <> old.item_id or new.total <> old.total then
    raise exception 'Only answers can be changed';
  end if;
  if new.answers is null or jsonb_array_length(new.answers) <> jsonb_array_length(old.questions) then
    raise exception 'Answer every question';
  end if;

  for i in 0 .. jsonb_array_length(old.questions) - 1 loop
    if (new.answers -> i) = (old.questions -> i -> 'answer_index') then
      correct := correct + 1;
    end if;
  end loop;

  new.score := correct;
  new.completed_at := now();
  return new;
end;
$$;

create trigger quiz_attempts_grade
  before update on public.quiz_attempts
  for each row execute function public.grade_quiz_attempt();

alter table public.quiz_attempts enable row level security;

-- Finished attempts are public (the activity feed shows scores); an unfinished one is visible
-- only to its owner, so nobody else sees the answers early. Only the Edge Function inserts.
create policy "Finished quizzes are public, open ones only to their owner"
  on public.quiz_attempts for select
  using (completed_at is not null or user_id = (select auth.uid()));

create policy "Members submit their own answers"
  on public.quiz_attempts for update to authenticated
  using (user_id = (select auth.uid()) and completed_at is null)
  with check (user_id = (select auth.uid()));

alter table public.quiz_attempts replica identity full;
alter publication supabase_realtime add table public.quiz_attempts;
