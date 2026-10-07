-- Sign-up, membership, admins and who can see which profile.
begin;

-- The members list decides membership at sign-up; the admins list decides admin rights.
select tests.eq((select is_member from public.profiles where github_username = 'TWadi'), null, 'no TWadi profile before sign-up');
insert into auth.users (raw_user_meta_data, raw_app_meta_data) values
  ('{"user_name": "TWadi"}', '{"provider": "github"}'), ('{"user_name": "stranger"}', '{"provider": "github"}');
select tests.eq((select is_member from public.profiles where github_username = 'TWadi'), true, 'TWadi becomes a member on sign-up');
select tests.eq((select is_admin from public.profiles where github_username = 'TWadi'), true, 'TWadi becomes an admin on sign-up');
select tests.eq((select is_member from public.profiles where github_username = 'stranger'), false, 'a stranger signs up as a non-member');
select tests.eq((select is_admin from public.profiles where github_username = 'stranger'), false, 'a stranger is not an admin');

-- Visitors only see member profiles.
select tests.as_anon();
select tests.eq((select count(*) from public.profiles where github_username = 'stranger')::int, 0, 'anon cannot see a non-member');
select tests.eq((select count(*) from public.profiles where github_username = 'TWadi')::int, 1, 'anon sees members');
select tests.as_postgres();

-- Nobody can promote themselves.
select tests.as_user((select id from public.profiles where github_username = 'stranger'));
select tests.throws($$update public.profiles set is_member = true, is_admin = true$$, 'permission denied');
select tests.as_postgres();

-- The allow-lists themselves are unreadable through the API.
select tests.as_user((select id from public.profiles where github_username = 'TWadi'));
select tests.throws('select * from public.members', 'permission denied');
select tests.throws('select * from public.admins', 'permission denied');
select tests.as_postgres();

rollback;
