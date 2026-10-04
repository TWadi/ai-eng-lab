import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { removeNote, sortNewestFirst, upsertNote, type Note, type NoteInput } from "../notes";

export interface NotesState {
  readonly notes: readonly Note[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly create: (input: NoteInput) => Promise<boolean>;
  readonly update: (id: string, input: NoteInput) => Promise<boolean>;
  readonly remove: (id: string) => Promise<boolean>;
}

const COLUMNS = "id,user_id,title,body,source_url,item_id,created_at,updated_at";

export function useNotes(): NotesState {
  const [notes, setNotes] = useState<readonly Note[]>([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;

    (async () => {
      const { data, error: err } = await client.from("notes").select(COLUMNS).order("created_at", { ascending: false }).limit(500);
      if (!active) return;
      if (err) {
        console.error("Failed to load notes", err);
        setError("Couldn't load notes. Refresh to try again.");
      } else {
        setNotes(sortNewestFirst(data as Note[]));
      }
      setLoading(false);
    })();

    const channel = client
      .channel("notes-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as Partial<Note>).id;
          if (id) setNotes((cur) => removeNote(cur, id));
        } else {
          setNotes((cur) => upsertNote(cur, payload.new as Note));
        }
      })
      .subscribe();

    return () => {
      active = false;
      client.removeChannel(channel);
    };
  }, []);

  const run = useCallback(async (action: () => PromiseLike<{ error: unknown; data?: unknown }>, failMsg: string) => {
    if (!supabase) return { ok: false as const };
    setError(null);
    const { error: err, data } = await action();
    if (err) {
      console.error(failMsg, err);
      setError(`${failMsg} Check your connection and try again.`);
      return { ok: false as const };
    }
    return { ok: true as const, data };
  }, []);

  const create = useCallback(async (input: NoteInput) => {
    const res = await run(() => supabase!.from("notes").insert(input).select(COLUMNS).single(), "Couldn't post the note.");
    if (res.ok && res.data) setNotes((cur) => upsertNote(cur, res.data as Note));
    return res.ok;
  }, [run]);

  const update = useCallback(async (id: string, input: NoteInput) => {
    const res = await run(() => supabase!.from("notes").update(input).eq("id", id).select(COLUMNS).single(), "Couldn't save your changes.");
    if (res.ok && res.data) setNotes((cur) => upsertNote(cur, res.data as Note));
    return res.ok;
  }, [run]);

  const remove = useCallback(async (id: string) => {
    const res = await run(() => supabase!.from("notes").delete().eq("id", id), "Couldn't delete the note.");
    if (res.ok) setNotes((cur) => removeNote(cur, id));
    return res.ok;
  }, [run]);

  return { notes, loading, error, create, update, remove };
}
