import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { checkImage, cleanTitle, imageExtension, removePage, upsertPage, type PageMeta } from "../pages";

export interface PagesState {
  readonly pages: readonly PageMeta[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly create: (trackId: string | null) => Promise<string | null>;
  readonly updateMeta: (id: string, patch: Partial<Pick<PageMeta, "title" | "track_id" | "item_id">>) => Promise<boolean>;
  readonly saveContent: (id: string, content: unknown[]) => Promise<boolean>;
  readonly loadContent: (id: string) => Promise<unknown[] | null>;
  readonly remove: (id: string) => Promise<boolean>;
  readonly uploadImage: (userId: string, file: File) => Promise<string>;
}

const META = "id,user_id,track_id,item_id,title,created_at,updated_at";

function toMeta(row: Record<string, unknown>): PageMeta {
  return {
    id: String(row.id), user_id: String(row.user_id), track_id: (row.track_id as string | null) ?? null,
    item_id: (row.item_id as string | null) ?? null, title: String(row.title ?? ""),
    created_at: String(row.created_at), updated_at: String(row.updated_at),
  };
}

export function usePages(): PagesState {
  const [pages, setPages] = useState<readonly PageMeta[]>([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;

    (async () => {
      const { data, error: err } = await client.from("pages").select(META).order("created_at").limit(1000);
      if (!active) return;
      if (err) {
        console.error("Failed to load pages", err);
        setError("Couldn't load notes. Refresh to try again.");
      } else {
        setPages((data ?? []).map(toMeta));
      }
      setLoading(false);
    })();

    const channel = client
      .channel("pages-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "pages" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: string }).id;
          if (id) setPages((cur) => removePage(cur, id));
        } else {
          setPages((cur) => upsertPage(cur, toMeta(payload.new as Record<string, unknown>)));
        }
      })
      .subscribe();

    return () => {
      active = false;
      client.removeChannel(channel);
    };
  }, []);

  const fail = (msg: string, err: unknown) => {
    console.error(msg, err);
    setError(`${msg} Check your connection and try again.`);
  };

  const create = useCallback(async (trackId: string | null) => {
    if (!supabase) return null;
    setError(null);
    const { data, error: err } = await supabase.from("pages").insert({ track_id: trackId }).select(META).single();
    if (err || !data) {
      fail("Couldn't create the page.", err);
      return null;
    }
    const meta = toMeta(data);
    setPages((cur) => upsertPage(cur, meta));
    return meta.id;
  }, []);

  const updateMeta = useCallback(async (id: string, patch: Partial<Pick<PageMeta, "title" | "track_id" | "item_id">>) => {
    if (!supabase) return false;
    const clean = patch.title === undefined ? patch : { ...patch, title: cleanTitle(patch.title) };
    const { data, error: err } = await supabase.from("pages").update(clean).eq("id", id).select(META).single();
    if (err || !data) {
      fail("Couldn't save the page details.", err);
      return false;
    }
    setPages((cur) => upsertPage(cur, toMeta(data)));
    return true;
  }, []);

  const saveContent = useCallback(async (id: string, content: unknown[]) => {
    if (!supabase) return false;
    const { error: err } = await supabase.from("pages").update({ content }).eq("id", id);
    if (err) {
      fail("Couldn't save your latest changes.", err);
      return false;
    }
    setError(null);
    return true;
  }, []);

  const loadContent = useCallback(async (id: string) => {
    if (!supabase) return null;
    const { data, error: err } = await supabase.from("pages").select("content").eq("id", id).maybeSingle();
    if (err) {
      fail("Couldn't open the page.", err);
      return null;
    }
    return data ? (data.content as unknown[]) : null;
  }, []);

  const remove = useCallback(async (id: string) => {
    if (!supabase) return false;
    const { error: err } = await supabase.from("pages").delete().eq("id", id);
    if (err) {
      fail("Couldn't delete the page.", err);
      return false;
    }
    setPages((cur) => removePage(cur, id));
    return true;
  }, []);

  const uploadImage = useCallback(async (userId: string, file: File) => {
    if (!supabase) throw new Error("Not connected");
    const check = checkImage(file);
    if (!check.ok) {
      setError(check.error);
      throw new Error(check.error);
    }
    const path = `${userId}/${crypto.randomUUID()}.${imageExtension(file.type)}`;
    const { error: err } = await supabase.storage.from("note-images").upload(path, file, { contentType: file.type });
    if (err) {
      fail("Couldn't upload the image.", err);
      throw err;
    }
    return supabase.storage.from("note-images").getPublicUrl(path).data.publicUrl;
  }, []);

  return { pages, loading, error, create, updateMeta, saveContent, loadContent, remove, uploadImage };
}
