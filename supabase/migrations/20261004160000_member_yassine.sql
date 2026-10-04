-- Add Yassine (GitHub: bravo421) as a lab member.
insert into public.members (github_username) values ('bravo421')
on conflict do nothing;

-- If he already signed in before being added, promote his existing profile.
update public.profiles set is_member = true where lower(github_username) = 'bravo421';
