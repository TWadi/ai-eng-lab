-- Coding-challenge solves: members record their own, once; everyone can see them.
begin;
select tests.user('cody') as c \gset
select tests.user('lurker', false) as l \gset

select tests.as_user(:'c');
insert into public.challenge_solves (user_id, challenge_id) values (:'c', 'bm25');
select tests.throws(format($$insert into public.challenge_solves (user_id, challenge_id) values (%L, 'bm25')$$, :'c'), 'duplicate key');
select tests.throws(format($$delete from public.challenge_solves where user_id = %L$$, :'c'), 'permission denied');

select tests.as_user(:'l');
select tests.throws(format($$insert into public.challenge_solves (user_id, challenge_id) values (%L, 'rrf')$$, :'l'), 'row-level security');
select tests.throws(format($$insert into public.challenge_solves (user_id, challenge_id) values (%L, 'rrf')$$, :'c'), 'row-level security');

select tests.as_anon();
select tests.eq((select count(*) from public.challenge_solves where user_id = :'c')::int, 1, 'solves are public');
select tests.as_postgres();
rollback;
