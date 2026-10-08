import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, type Profile } from "../supabase";
import { groupByUser, withItem, withoutItem, type ProgressByUser, type ProgressRow } from "../progress";

export interface ProgressState {
  readonly members: readonly Profile[];
  readonly progress: ProgressByUser;
  readonly loading: boolean;
  readonly error: string | null;
  readonly toggle: (userId: string, itemId: string, done: boolean) => Promise<void>;
  /** Re-read the player list (e.g. after an admin let someone in). */
  readonly reloadMembers: () => Promise<void>;
}

export function useProgress(): ProgressState {
  const [members, setMembers] = useState<readonly Profile[]>([]);
  const [progress, setProgress] = useState<ProgressByUser>({});
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  const reloadMembers = useCallback(async () => {
    if (!supabase) return;
    const { data, error: err } = await supabase.from("profiles").select("*").eq("is_member", true).order("created_at");
    if (err) console.error("Failed to reload players", err);
    else setMembers(data as Profile[]);
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;

    (async () => {
      const [m, p] = await Promise.all([
        client.from("profiles").select("*").eq("is_member", true).order("created_at"),
        client.from("progress").select("user_id,item_id,done_at"),
      ]);
      if (!active) return;
      if (m.error || p.error) {
        console.error("Failed to load progress", m.error ?? p.error);
        setError("Couldn't load progress. Refresh to try again.");
      } else {
        setMembers(m.data as Profile[]);
        setProgress(groupByUser(p.data as ProgressRow[]));
      }
      setLoading(false);
    })();

    const channel = client
      .channel("progress-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "progress" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const r = payload.new as ProgressRow;
          setProgress((cur) => withItem(cur, r.user_id, r.item_id, r.done_at));
        } else if (payload.eventType === "DELETE") {
          const r = payload.old as Partial<ProgressRow>;
          if (r.user_id && r.item_id) {
            const { user_id, item_id } = r;
            setProgress((cur) => withoutItem(cur, user_id, item_id));
          }
        }
      })
      .subscribe();

    // A player was let in (or removed): refresh the board.
    const players = client
      .channel("player-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => void reloadMembers())
      .subscribe();

    return () => {
      active = false;
      client.removeChannel(channel);
      client.removeChannel(players);
    };
  }, [reloadMembers]);

  const toggle = useCallback(async (userId: string, itemId: string, done: boolean) => {
    if (!supabase) return;
    const before = progressRef.current;
    const doneAt = new Date().toISOString();
    setError(null);
    setProgress(done ? withItem(before, userId, itemId, doneAt) : withoutItem(before, userId, itemId));

    const { error: err } = done
      ? await supabase.from("progress").insert({ user_id: userId, item_id: itemId, done_at: doneAt })
      : await supabase.from("progress").delete().eq("user_id", userId).eq("item_id", itemId);

    const alreadyDone = err?.code === "23505"; // ticked in another tab: the row exists, which is what we wanted
    if (err && !alreadyDone) {
      console.error("Failed to save progress", err);
      setProgress(before);
      setError("Couldn't save that change. Check your connection and try again.");
    }
  }, []);

  return { members, progress, loading, error, toggle, reloadMembers };
}
