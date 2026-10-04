-- Quiz hardening (from review):
-- 1. Correct answers move to quiz_keys, which no client can read, so a member can't look them up before answering.
-- 2. Members lose direct UPDATE on quiz_attempts; answers go through submit_quiz(), which grades server-side.
--    This also stops editing created_at to dodge the daily limit.
-- 3. The Edge Function records a 'pending' attempt before calling Claude, so failed and parallel
--    requests count toward the limit.
-- quiz_attempts was still empty when this ran.

drop trigger if exists quiz_attempts_grade on public.quiz_attempts;
drop function if exists public.grade_quiz_attempt();
drop policy if exists "Members submit their own answers" on public.quiz_attempts;

alter table public.quiz_attempts
  alter column questions drop not null,
  drop constraint if exists quiz_attempts_questions_check,
  add constraint quiz_attempts_questions_check
    check (questions is null or (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 1 and 10)),
  add column status text not null default 'pending' check (status in ('pending', 'ready', 'failed'));

create table public.quiz_keys (
  attempt_id      uuid primary key references public.quiz_attempts (id) on delete cascade,
  answer_indexes  jsonb not null check (jsonb_typeof(answer_indexes) = 'array'),
  explanations    jsonb not null check (jsonb_typeof(explanations) = 'array')
);

alter table public.quiz_keys enable row level security;  -- no policies: only the service role and submit_quiz() read it

-- Grade one attempt for the signed-in member and return the full results with explanations.
create function public.submit_quiz(p_attempt uuid, p_answers int[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.quiz_attempts%rowtype;
  k public.quiz_keys%rowtype;
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

  select * into k from public.quiz_keys where attempt_id = p_attempt;
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
$$;

revoke all on function public.submit_quiz(uuid, int[]) from public, anon;
grant execute on function public.submit_quiz(uuid, int[]) to authenticated;

-- Belt and braces: browsers never write these tables directly.
revoke insert, update, delete on public.quiz_attempts from anon, authenticated;
revoke all on public.quiz_keys from anon, authenticated;
