-- Allow item ids from tracks other than the numbered phases (e.g. "rag-3" for the RAG course).
-- Format: a short lowercase track id, a dash, and a number.

alter table public.progress drop constraint progress_item_id_check;
alter table public.progress add constraint progress_item_id_check
  check (item_id ~ '^[a-z0-9]{1,8}-[0-9]{1,3}$');

alter table public.notes drop constraint notes_item_id_check;
alter table public.notes add constraint notes_item_id_check
  check (item_id is null or item_id ~ '^[a-z0-9]{1,8}-[0-9]{1,3}$');
