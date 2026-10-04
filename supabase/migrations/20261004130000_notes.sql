-- Learning notes: each member posts notes from courses, videos and reading.
-- Everyone can read notes; members create, edit and delete only their own.

create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  body        text not null check (char_length(body) between 1 and 20000),
  source_url  text check (source_url is null or source_url ~ '^https?://' and char_length(source_url) <= 2000),
  item_id     text check (item_id is null or item_id ~ '^p[0-9]-[0-9]{1,2}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index notes_created_at_idx on public.notes (created_at desc);

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger notes_touch_updated_at
  before update on public.notes
  for each row execute function public.touch_updated_at();

alter table public.notes enable row level security;

create policy "Notes are public"
  on public.notes for select
  using (true);

create policy "Members add their own notes"
  on public.notes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_member)
  );

create policy "Members edit their own notes"
  on public.notes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Members delete their own notes"
  on public.notes for delete to authenticated
  using (user_id = (select auth.uid()));

-- Deletes need the full old row so the other person's page can drop the note live.
alter table public.notes replica identity full;
alter publication supabase_realtime add table public.notes;
