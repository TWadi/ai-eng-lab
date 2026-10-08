-- Architecture contract: the API surface (ports) is exactly this, nothing leaks out of private.
-- Adding a function or table to the API is a deliberate change: update this list in the same PR.
begin;

-- Functions the site may call (client/server ports).
select tests.eq(
  (select string_agg(p.proname, ',' order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')),
  'cancel_duel,create_duel,create_race,decline_player,finish_duel,invite_player,lab_admin_overview,quiz_items,'
  || 'remove_player,respond_duel,start_duel,start_quiz,submit_duel,submit_quiz,submit_race',
  'public functions callable by signed-in users');

select tests.eq(
  (select string_agg(p.proname, ',' order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  'quiz_items',
  'public functions callable by visitors');

-- Tables the site reads (sender/receiver ports), and the only two it may write directly.
select tests.eq(
  (select string_agg(c.relname, ',' order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege('anon', c.oid, 'select')),
  'challenge_solves,challenges,duel_entries,duels,profiles,progress,quiz_attempts',
  'tables visitors can read');
select tests.eq(
  (select string_agg(c.relname, ',' order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update')
           or has_table_privilege('authenticated', c.oid, 'delete'))),
  'challenge_solves,progress',
  'tables signed-in users may write (under RLS)');

-- Every public table has row-level security on.
select tests.eq(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity)::int,
  0, 'RLS on every public table');

-- Private internals: only the two RLS predicates are executable, and no table is reachable.
select tests.eq(
  (select string_agg(p.proname, ',' order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')),
  'item_has_quiz,passed_quiz',
  'private functions reachable by signed-in users');
select tests.eq(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relkind = 'r'
      and (has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('anon', c.oid, 'select')))::int,
  0, 'no private table is readable');
select tests.eq(has_schema_privilege('anon', 'private', 'usage'), false, 'visitors cannot even see the private schema');

-- Every security-definer function pins its search_path.
select tests.eq(
  (select string_agg(n.nspname || '.' || p.proname, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not coalesce(p.proconfig::text like '%search_path=%', false)),
  null, 'security definer functions set search_path');

rollback;
