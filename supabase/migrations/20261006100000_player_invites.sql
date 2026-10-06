-- Invite players from the site. Being a site member has nothing to do with the GitHub repo:
-- GitHub is only used to sign in, and members never get repo access from this.
--
-- Admins (TWadi and GhassenJamoussi99) can:
--   * see who signed in but isn't a player yet (lab_admin_overview)
--   * let a GitHub user in, before or after they first sign in (invite_player)
--   * remove a player (remove_player); their history stays in the database but is hidden
-- Nobody can make themselves an admin: profiles has no update policy.

alter table public.profiles add column if not exists is_admin boolean not null default false;
update public.profiles set is_admin = true where lower(github_username) in ('twadi', 'ghassenjamoussi99');

-- Keep the founders' admin flag even if their profile is created later.
create table if not exists public.admins (
  github_username text primary key
);
alter table public.admins enable row level security;  -- no policies: the API can't read or write it
insert into public.admins (github_username) values ('TWadi'), ('GhassenJamoussi99') on conflict do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uname text := new.raw_user_meta_data ->> 'user_name';
begin
  insert into public.profiles (id, github_username, display_name, avatar_url, is_member, is_admin)
  values (
    new.id,
    coalesce(uname, ''),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    exists (select 1 from public.members m where lower(m.github_username) = lower(uname)),
    exists (select 1 from public.admins a where lower(a.github_username) = lower(uname))
  );
  return new;
end;
$$;

create or replace function public.is_lab_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
$$;

-- Everything the admin panel shows, in one call.
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
    -- Signed in, not a player yet (newest first).
    'waiting', coalesce((
      select jsonb_agg(jsonb_build_object('github_username', p.github_username, 'display_name', p.display_name,
                                          'avatar_url', p.avatar_url, 'signed_in_at', p.created_at) order by p.created_at desc)
        from public.profiles p where not p.is_member and p.github_username <> ''), '[]'::jsonb),
    -- Invited but never signed in.
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
  -- GitHub usernames: letters, digits and single hyphens, up to 39 characters.
  if name is null or name !~ '^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$' then
    raise exception 'That is not a valid GitHub username';
  end if;
  insert into public.members (github_username) values (name) on conflict do nothing;
  update public.profiles set is_member = true where lower(github_username) = lower(name) and not is_member;
  get diagnostics promoted = row_count;
  return jsonb_build_object('github_username', name, 'signed_in', promoted > 0
         or exists (select 1 from public.profiles p where lower(p.github_username) = lower(name)));
end;
$$;

create or replace function public.remove_player(p_github text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_lab_admin() then
    raise exception 'Only admins can remove players';
  end if;
  if exists (select 1 from public.profiles p where lower(p.github_username) = lower(p_github) and p.is_admin) then
    raise exception 'Admins can''t be removed here';
  end if;
  delete from public.members where lower(github_username) = lower(p_github);
  update public.profiles set is_member = false where lower(github_username) = lower(p_github);
end;
$$;

revoke all on function public.is_lab_admin() from public, anon;
revoke all on function public.lab_admin_overview() from public, anon;
revoke all on function public.invite_player(text) from public, anon;
revoke all on function public.remove_player(text) from public, anon;
grant execute on function public.is_lab_admin() to authenticated;
grant execute on function public.lab_admin_overview() to authenticated;
grant execute on function public.invite_player(text) to authenticated;
grant execute on function public.remove_player(text) to authenticated;

-- Live updates: a newly invited player appears on everyone's board, and their own page unlocks.
alter table public.profiles replica identity full;
alter publication supabase_realtime add table public.profiles;
