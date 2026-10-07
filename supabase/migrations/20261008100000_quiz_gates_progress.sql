-- 1) A lecture that has a quiz only counts as done once the player passed its quiz (4/5 or better, solo or duel).
--    Passing marks it done automatically; ticking it by hand is refused until then.
--    Lectures without a quiz can still be ticked freely. (All existing ticks already had a pass when this ran.)
-- 2) Admins can decline someone who signed in, so they leave the "waiting" list (and can still be let in later).

create or replace function public.item_has_quiz(p_item text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.quiz_bank q where q.item_id = p_item)
$$;

create or replace function public.passed_quiz(p_user uuid, p_item text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.quiz_attempts a
     where a.user_id = p_user and a.item_id = p_item
       and a.completed_at is not null and a.score is not null and a.score * 5 >= a.total * 4
  )
$$;

revoke all on function public.item_has_quiz(text) from public, anon;
revoke all on function public.passed_quiz(uuid, text) from public, anon;
grant execute on function public.item_has_quiz(text) to authenticated;
grant execute on function public.passed_quiz(uuid, text) to authenticated;

drop policy if exists "Members add their own progress" on public.progress;
create policy "Members add their own progress"
  on public.progress for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_member)
    and (not public.item_has_quiz(item_id) or public.passed_quiz((select auth.uid()), item_id))
  );

-- Passing a quiz (solo, or a duel's answer sheet) completes the lecture.
create or replace function public.complete_item_on_pass()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.completed_at is not null and new.score is not null and new.score * 5 >= new.total * 4
     and exists (select 1 from public.profiles p where p.id = new.user_id and p.is_member) then
    insert into public.progress (user_id, item_id, done_at)
    values (new.user_id, new.item_id, new.completed_at)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.complete_item_on_pass() from public, anon, authenticated;

drop trigger if exists quiz_attempts_complete_item on public.quiz_attempts;
create trigger quiz_attempts_complete_item
  after insert or update of completed_at, score on public.quiz_attempts
  for each row execute function public.complete_item_on_pass();

-- Past passes that never got ticked count now too.
insert into public.progress (user_id, item_id, done_at)
select distinct on (a.user_id, a.item_id) a.user_id, a.item_id, a.completed_at
  from public.quiz_attempts a
  join public.profiles p on p.id = a.user_id and p.is_member
 where a.completed_at is not null and a.score is not null and a.score * 5 >= a.total * 4
 order by a.user_id, a.item_id, a.completed_at
on conflict do nothing;

-- Declining a sign-up.
alter table public.profiles add column if not exists declined_at timestamptz;

create or replace function public.lab_admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_lab_admin() then
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
        from public.members m
       where not exists (select 1 from public.profiles p where lower(p.github_username) = lower(m.github_username))), '[]'::jsonb)
  );
end;
$$;

create or replace function public.invite_player(p_github text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  name text := trim(p_github);
  promoted int;
begin
  if not public.is_lab_admin() then
    raise exception 'Only admins can invite players';
  end if;
  if name is null or name !~ '^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$' then
    raise exception 'That is not a valid GitHub username';
  end if;
  insert into public.members (github_username) values (name) on conflict do nothing;
  update public.profiles set is_member = true, declined_at = null where lower(github_username) = lower(name) and not is_member;
  get diagnostics promoted = row_count;
  return jsonb_build_object('github_username', name, 'signed_in', promoted > 0
         or exists (select 1 from public.profiles p where lower(p.github_username) = lower(name)));
end;
$$;

create or replace function public.decline_player(p_github text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_lab_admin() then
    raise exception 'Only admins can decline players';
  end if;
  update public.profiles set declined_at = now()
   where lower(github_username) = lower(p_github) and not is_member;
  if not found then
    raise exception 'Nobody with that username is waiting';
  end if;
end;
$$;

revoke all on function public.decline_player(text) from public, anon;
grant execute on function public.decline_player(text) to authenticated;
