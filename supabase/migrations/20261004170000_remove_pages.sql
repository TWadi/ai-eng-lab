-- Notes moved to Notion: remove the pages feature (only empty test pages existed, no images).

drop table if exists public.pages;
drop function if exists public.touch_updated_at();

drop policy if exists "Members upload images to their own folder" on storage.objects;
drop policy if exists "Members delete their own images" on storage.objects;
-- The empty `note-images` bucket is deleted from the dashboard (Storage),
-- since Supabase blocks deleting buckets with SQL.
