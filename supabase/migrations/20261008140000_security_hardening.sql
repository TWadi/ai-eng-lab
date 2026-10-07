-- Security hardening (from the database architecture review).
--
-- 1) Impersonation at sign-up: membership and admin rights came from raw_user_meta_data.user_name, which the
--    CLIENT sets when signing up by email. Now a GitHub username is only trusted when Supabase Auth itself
--    recorded the sign-in provider as GitHub (raw_app_meta_data is server-controlled). Other sign-ups get no
--    username, so they can never match the members/admins lists or an invite.
-- 2) Duel answer leak: a quiz duel's answer sheet (copied into quiz_attempts) was public the moment the first
--    player locked in. It now stays hidden from everyone but its owner until the duel is decided.
-- 3) Double duels: "no open duel for either player" was a check-then-insert race. A trigger now serializes duel
--    creation per player pair with advisory locks and re-checks inside the lock.
-- 4) Defense in depth: API roles lose every table privilege they never need, so protection no longer relies
--    on "RLS has no policy for that" alone. GitHub usernames become case-insensitively unique in the allow-lists.

-- 1) Trust the GitHub username only for GitHub sign-ins.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
    uname is not null and exists (select 1 from public.members m where lower(m.github_username) = lower(uname)),
    uname is not null and exists (select 1 from public.admins a where lower(a.github_username) = lower(uname))
  );
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- 2) Hide a duel's answer sheets until the duel is decided.
drop policy if exists "Finished quizzes are public, open ones only to their owner" on public.quiz_attempts;
create policy "Finished quizzes are public, open ones only to their owner"
  on public.quiz_attempts for select
  using (
    user_id = (select auth.uid())
    or (
      completed_at is not null
      and (source_duel is null
           or exists (select 1 from public.duels d where d.id = source_duel and d.status = 'done'))
    )
  );

-- 3) One open (pending or live) duel per player, enforced under a lock.
create or replace function public.guard_one_open_duel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.guard_one_open_duel() from public, anon, authenticated;

drop trigger if exists duels_one_open_per_player on public.duels;
create trigger duels_one_open_per_player
  before insert on public.duels
  for each row execute function public.guard_one_open_duel();

create index if not exists duels_open_idx on public.duels (status) where status in ('pending', 'live');
create index if not exists duels_opponent_idx on public.duels (opponent, created_at desc);
create index if not exists duel_entries_user_idx on public.duel_entries (user_id);

-- 4) Least privilege for the API roles (anon = visitors, authenticated = signed-in users).
--    Reads stay governed by RLS; every write goes through security-definer functions or the explicit
--    insert policies on progress and challenge_solves.
revoke all on public.members, public.admins from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.profiles from anon, authenticated;
revoke update, delete, truncate, references, trigger on public.progress from anon, authenticated;
revoke update, delete, truncate, references, trigger on public.challenge_solves from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.quiz_attempts, public.duels, public.duel_entries, public.race_challenges
  from anon, authenticated;
revoke all on public.quiz_bank, public.quiz_keys, public.duel_keys from anon, authenticated;
revoke insert on public.progress, public.challenge_solves from anon;

create unique index if not exists members_github_lower_key on public.members (lower(github_username));
create unique index if not exists admins_github_lower_key on public.admins (lower(github_username));
