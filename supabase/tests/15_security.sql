-- Security regressions: impersonation at sign-up, duel answer leaks, double duels, table privileges.
begin;

-- 1) An email sign-up that claims a member's GitHub name gets nothing (user metadata is client-controlled).
insert into auth.users (raw_user_meta_data, raw_app_meta_data)
values ('{"user_name": "TWadi"}', '{"provider": "email", "providers": ["email"]}');
select tests.eq((select count(*) from public.profiles where is_admin or is_member)::int, 0, 'email impostor is neither admin nor member');
select tests.eq((select count(*) from public.profiles where lower(github_username) = 'twadi')::int, 0, 'email impostor gets no GitHub username');

-- ...so inviting the real name later can't promote the impostor either.
select tests.user('Wadi-admin', true, true) \gset admin_
select tests.as_user((select id from public.profiles where github_username = 'Wadi-admin'));
select public.invite_player('TWadi');
select tests.as_postgres();
select tests.eq((select count(*) from public.profiles where is_member and github_username <> 'Wadi-admin')::int, 0, 'invite does not promote an email impostor');

-- 2) A quiz duel answer sheet stays hidden from the rival until the duel is decided.
select tests.user('alice') as a \gset
select tests.user('bob') as b \gset
select tests.as_user(:'a');
select (public.create_duel('rag-1', :'b') ->> 'id') as duel \gset
select tests.as_user(:'b');
select public.respond_duel(:'duel', true);
select tests.as_postgres();
update public.duels set starts_at = now() - interval '1 second' where id = :'duel';
select tests.as_user(:'a');  select public.start_duel(:'duel');
select tests.as_user(:'b');  select public.start_duel(:'duel');
select tests.as_postgres();
select tests.duel_answers(:'duel') as key \gset
select tests.as_user(:'a');
select public.submit_duel(:'duel', :'key');
select tests.as_user(:'b');
select tests.eq((select count(*) from public.quiz_attempts where source_duel = :'duel')::int, 0, 'rival cannot see the first answer sheet mid-duel');
select tests.as_anon();
select tests.eq((select count(*) from public.quiz_attempts where source_duel = :'duel')::int, 0, 'nobody else sees it mid-duel');
select tests.as_user(:'b');
select public.submit_duel(:'duel', array[-1,-1,-1,-1,-1]);
select tests.as_anon();
select tests.eq((select count(*) from public.quiz_attempts where source_duel = :'duel')::int, 2, 'both sheets are public once decided');
select tests.as_postgres();

-- 3) A player can never be in two open duels, even if two challenges race each other.
select tests.user('carol') as c \gset
select tests.as_user(:'a');
select public.create_duel('rag-2', :'c');
select tests.as_postgres();
-- A second challenge involving carol (even inserted directly, bypassing create_duel's own check) is refused.
select tests.throws(format($$insert into public.duels (kind, item_id, challenger, opponent) values ('quiz', 'rag-1', %L, %L)$$, :'b', :'c'),
                    'already has a duel');

-- 4) Defense in depth: API roles hold no write privileges on protected tables.
select tests.as_user(:'a');
select tests.throws($$update public.profiles set is_admin = true$$, 'permission denied');
select tests.throws($$update public.progress set done_at = now()$$, 'permission denied');
select tests.throws($$delete from private.members$$, 'permission denied');
select tests.throws($$select * from private.admins$$, 'permission denied');
select tests.throws($$truncate public.progress$$, 'permission denied');
select tests.as_postgres();

rollback;
