-- Admins let people in, decline or remove them; nobody else can.
begin;
select tests.user('boss', true, true) as boss \gset
select tests.user('pal') as pal \gset
select tests.user('newbie', false) as newbie \gset

select tests.as_user(:'pal');
select tests.throws($$select public.lab_admin_overview()$$, 'Only admins');
select tests.throws($$select public.invite_player('x')$$, 'Only admins');

select tests.as_user(:'boss');
select tests.eq((public.lab_admin_overview() -> 'waiting' -> 0 ->> 'github_username'), 'newbie', 'newbie is waiting');
select tests.throws($$select public.invite_player('-bad-')$$, 'not a valid GitHub username');
select public.decline_player('newbie');
select tests.eq(jsonb_array_length(public.lab_admin_overview() -> 'waiting'), 0, 'declined leaves waiting');
select public.invite_player('NEWBIE');
select tests.as_anon();
select tests.eq((select is_member from public.profiles where github_username = 'newbie'), true, 'invite is case-insensitive and lets them in');

-- Invited ahead of sign-up: they become a member the moment they sign in with GitHub.
select tests.as_user(:'boss');
select public.invite_player('future-friend');
select tests.as_postgres();
insert into auth.users (raw_user_meta_data, raw_app_meta_data) values ('{"user_name": "Future-Friend"}', '{"provider": "github"}');
select tests.eq((select is_member from public.profiles where github_username = 'Future-Friend'), true, 'pre-invited user joins on sign-in');

select tests.as_user(:'boss');
select public.remove_player('pal');
select tests.throws($$select public.remove_player('boss')$$, 'can''t be removed');
select tests.as_anon();
select tests.eq((select count(*) from public.profiles where github_username = 'pal')::int, 0, 'removed player is hidden');
select tests.as_postgres();
rollback;
