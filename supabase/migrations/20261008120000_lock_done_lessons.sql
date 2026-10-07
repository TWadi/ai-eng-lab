-- A finished lesson stays finished: players can no longer untick (delete) their progress.
drop policy if exists "Members remove their own progress" on public.progress;
revoke delete on public.progress from anon, authenticated;
