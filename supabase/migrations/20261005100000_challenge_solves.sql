-- Coding challenges are graded in the browser (Pyodide); this records who solved what, for XP and the feed.
-- The code itself is not stored. Everyone can see solves; members record only their own.

create table public.challenge_solves (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  challenge_id  text not null check (challenge_id ~ '^[a-z0-9-]{1,40}$'),
  solved_at     timestamptz not null default now(),
  primary key (user_id, challenge_id)
);

alter table public.challenge_solves enable row level security;

create policy "Challenge solves are public"
  on public.challenge_solves for select
  using (true);

create policy "Members record their own solves"
  on public.challenge_solves for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_member)
  );

revoke update, delete on public.challenge_solves from anon, authenticated;

alter table public.challenge_solves replica identity full;
alter publication supabase_realtime add table public.challenge_solves;
