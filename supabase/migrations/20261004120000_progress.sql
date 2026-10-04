-- Progress tracker schema for the ai-eng-lab website.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- Model:
--   members   GitHub usernames allowed to write progress (not readable through the API)
--   profiles  one row per signed-in GitHub user, created by a trigger on sign-up
--   progress  one row per (user, roadmap item) that the user has finished
--
-- Everyone (signed out included) can read members' profiles and progress.
-- Only members can add or remove their own progress rows.

create table public.members (
  github_username text primary key
);

insert into public.members (github_username) values
  ('TWadi'),
  ('GhassenJamoussi99');

create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  github_username text not null,
  display_name    text,
  avatar_url      text,
  is_member       boolean not null default false,
  created_at      timestamptz not null default now()
);

create table public.progress (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  item_id  text not null check (item_id ~ '^p[0-9]-[0-9]{1,2}$'),
  done_at  timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- Create a profile whenever someone signs in with GitHub for the first time.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uname text := new.raw_user_meta_data ->> 'user_name';
begin
  insert into public.profiles (id, github_username, display_name, avatar_url, is_member)
  values (
    new.id,
    coalesce(uname, ''),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    exists (select 1 from public.members m where lower(m.github_username) = lower(uname))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row level security
alter table public.members  enable row level security;  -- no policies: API cannot read or write it
alter table public.profiles enable row level security;
alter table public.progress enable row level security;

create policy "Member profiles are public"
  on public.profiles for select
  using (is_member);

create policy "Progress is public"
  on public.progress for select
  using (true);

create policy "Members add their own progress"
  on public.progress for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_member)
  );

create policy "Members remove their own progress"
  on public.progress for delete to authenticated
  using (user_id = (select auth.uid()));

-- Live updates in the browser when the other person ticks something
alter publication supabase_realtime add table public.progress;
