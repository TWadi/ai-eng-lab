-- Notion-style note pages, replacing the simple notes table (which was still empty).
-- Everyone can read pages; members create, edit and delete only their own.
-- Page content is BlockNote's JSON block format.

drop table if exists public.notes;

create table public.pages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  track_id    text check (track_id is null or track_id ~ '^[a-z0-9]{1,8}$'),
  item_id     text check (item_id is null or item_id ~ '^[a-z0-9]{1,8}-[0-9]{1,3}$'),
  title       text not null default '' check (char_length(title) <= 200),
  content     jsonb not null default '[]'::jsonb check (jsonb_typeof(content) = 'array' and pg_column_size(content) <= 1000000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index pages_track_idx on public.pages (track_id, created_at);

create trigger pages_touch_updated_at
  before update on public.pages
  for each row execute function public.touch_updated_at();

alter table public.pages enable row level security;

create policy "Pages are public"
  on public.pages for select
  using (true);

create policy "Members create their own pages"
  on public.pages for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_member)
  );

create policy "Members edit their own pages"
  on public.pages for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Members delete their own pages"
  on public.pages for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.pages replica identity full;
alter publication supabase_realtime add table public.pages;

-- Images pasted into pages. Public read; members upload into a folder named after their user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('note-images', 'note-images', true, 5242880, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do nothing;

create policy "Members upload images to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'note-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_member)
  );

create policy "Members delete their own images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'note-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
