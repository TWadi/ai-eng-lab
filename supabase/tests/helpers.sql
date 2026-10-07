-- Test helpers (only ever created in the throwaway test database, never in production).
create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

-- A GitHub user signs in (fires the real handle_new_user trigger). Optionally made a member/admin.
create or replace function tests.user(p_github text, p_member boolean default true, p_admin boolean default false)
returns uuid language plpgsql as $$
declare uid uuid;
begin
  insert into auth.users (raw_user_meta_data, raw_app_meta_data)
  values (jsonb_build_object('user_name', p_github, 'full_name', p_github, 'avatar_url', ''),
          '{"provider": "github", "providers": ["github"]}')
  returning id into uid;
  update public.profiles set is_member = p_member, is_admin = p_admin where id = uid;
  return uid;
end $$;

-- Act as a signed-in user (role authenticated, auth.uid() = p_uid) until tests.as_postgres().
create or replace function tests.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function tests.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
end $$;

create or replace function tests.as_postgres() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- Assert that a statement fails with an error message containing p_expected.
create or replace function tests.throws(p_sql text, p_expected text) returns void language plpgsql as $$
declare failed boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    failed := true;
    if position(lower(p_expected) in lower(sqlerrm)) = 0 then
      raise exception 'Expected an error containing "%", got "%" from: %', p_expected, sqlerrm, p_sql;
    end if;
  end;
  if not failed then
    raise exception 'Expected an error containing "%" from: %', p_expected, p_sql;
  end if;
end $$;

create or replace function tests.eq(p_actual anyelement, p_expected anyelement, p_what text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception '%: expected %, got %', p_what, p_expected, p_actual;
  end if;
end $$;

-- Correct answers for an attempt / duel, read with superuser rights from the hidden key tables.
create or replace function tests.quiz_answers(p_attempt uuid) returns int[] language sql as $$
  select array_agg(v::int order by o) from public.quiz_keys k, jsonb_array_elements_text(k.answer_indexes) with ordinality as a(v, o)
   where k.attempt_id = p_attempt
$$;
create or replace function tests.duel_answers(p_duel uuid) returns int[] language sql as $$
  select array_agg(v::int order by o) from public.duel_keys k, jsonb_array_elements_text(k.answer_indexes) with ordinality as a(v, o)
   where k.duel_id = p_duel
$$;

grant execute on all functions in schema tests to anon, authenticated;
