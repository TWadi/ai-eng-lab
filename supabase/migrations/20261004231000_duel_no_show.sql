-- An abandoned live duel where neither player submitted expires instead of counting as a draw.

create or replace function public.decide_duel(p_duel uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.duels%rowtype;
  a public.duel_entries%rowtype;
  b public.duel_entries%rowtype;
  a_score int; b_score int; a_time int; b_time int;
  w uuid;
begin
  select * into d from public.duels where id = p_duel for update;
  if d.status <> 'live' then return; end if;
  select * into a from public.duel_entries where duel_id = p_duel and user_id = d.challenger;
  select * into b from public.duel_entries where duel_id = p_duel and user_id = d.opponent;

  if not ((a.submitted_at is not null and b.submitted_at is not null)
          or now() > d.starts_at + interval '135 seconds') then
    return;
  end if;

  -- Nobody played: the duel just expires (no XP for anyone).
  if a.submitted_at is null and b.submitted_at is null then
    update public.duels set status = 'expired', completed_at = now() where id = p_duel;
    return;
  end if;

  a_score := case when a.submitted_at is null then -1 else a.score end;
  b_score := case when b.submitted_at is null then -1 else b.score end;
  a_time := coalesce(a.time_ms, 2147483647);
  b_time := coalesce(b.time_ms, 2147483647);
  w := case
    when a_score > b_score then d.challenger
    when b_score > a_score then d.opponent
    when a_time < b_time then d.challenger
    when b_time < a_time then d.opponent
    else null
  end;
  update public.duels set status = 'done', winner = w, completed_at = now() where id = p_duel;
end;
$$;

revoke all on function public.decide_duel(uuid) from public, anon, authenticated;
