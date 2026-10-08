-- Code races: the server picks a secret challenge; first pass wins; late passes are refused.
begin;
select tests.user('rita') as r \gset
select tests.user('sam') as s \gset

select tests.as_user(:'r');
select public.create_race(:'s') ->> 'id' as race \gset
select tests.eq((select challenge_id from public.duels where id = :'race'), null, 'challenge is secret before the end');
select tests.throws($$select * from private.duel_keys$$, 'permission denied');
select tests.as_user(:'s');
select public.respond_duel(:'race', true);
select tests.as_postgres();
update public.duels set starts_at = now() - interval '1 second' where id = :'race';

select tests.as_user(:'r');
select public.start_duel(:'race') ->> 'challenge_id' as cid \gset
select tests.eq((select count(*) from public.challenges where id = :'cid')::int, 1, 'start reveals a real challenge');
select tests.throws(format($$select public.submit_duel(%L, array[0,0,0,0,0])$$, :'race'), 'code race');
select tests.eq((public.submit_race(:'race', true, 'def f(): pass') ->> 'score')::int, 1, 'rita passes');
select tests.as_anon();
select tests.eq((select winner from public.duels where id = :'race'), :'r'::uuid, 'first pass wins at once');
select tests.eq((select challenge_id from public.duels where id = :'race'), :'cid', 'challenge revealed when decided');
select tests.eq((select answers ->> 'code' from public.duel_entries where duel_id = :'race' and user_id = :'r'), 'def f(): pass', 'code readable after the race');
select tests.as_postgres();

-- A pass after the 15-minute limit is refused.
select tests.as_user(:'r');
select public.create_race(:'s') ->> 'id' as late \gset
select tests.as_user(:'s');
select public.respond_duel(:'late', true);
select tests.as_postgres();
update public.duels set starts_at = now() - interval '904 seconds' where id = :'late';
insert into public.duel_entries (duel_id, user_id, started_at)
  select :'late', :'r', starts_at from public.duels where id = :'late';
select tests.as_user(:'r');
select tests.throws(format($$select public.submit_race(%L, true, 'x')$$, :'late'), 'Time is up');
select tests.as_postgres();
update public.duels set status = 'cancelled' where id = :'late';

-- Giving up while the rival never opened the race ends it with no winner.
select tests.as_user(:'r');
select public.create_race(:'s') ->> 'id' as gave_up \gset
select tests.as_user(:'s');
select public.respond_duel(:'gave_up', true);
select tests.as_postgres();
update public.duels set starts_at = now() - interval '1 second' where id = :'gave_up';
select tests.as_user(:'r');
select public.start_duel(:'gave_up');
select public.submit_race(:'gave_up', false, '');
select tests.eq((select status from public.duels where id = :'gave_up'), 'expired', 'give-up vs no-show expires');
select tests.as_postgres();
rollback;
