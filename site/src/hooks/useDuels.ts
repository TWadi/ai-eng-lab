import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import type { Duel, DuelEntry } from "../duels";
import { dbError, toGraded, type GradedQuiz, type Outcome, type QuizQuestion, type SubmitResult } from "./useQuizzes";

/** start_duel returns either a wait (before the shared start time) or the questions. */
export type DuelStart =
  | { readonly kind: "wait"; readonly startsAt: number; readonly serverOffset: number }
  | { readonly kind: "play"; readonly startsAt: number; readonly endsAt: number; readonly serverOffset: number; readonly questions: readonly QuizQuestion[] };

export interface DuelGraded extends GradedQuiz {
  readonly time_ms: number;
}

export interface DuelsState {
  /** True once the first list has loaded (so changes after it are real news). */
  readonly loaded: boolean;
  readonly duels: readonly Duel[];
  readonly entries: readonly DuelEntry[];
  readonly create: (itemId: string, opponentId: string) => Promise<Outcome<string>>;
  readonly respond: (duelId: string, accept: boolean) => Promise<Outcome<null>>;
  readonly cancel: (duelId: string) => Promise<Outcome<null>>;
  readonly start: (duelId: string) => Promise<Outcome<DuelStart>>;
  readonly submit: (duelId: string, answers: readonly number[]) => Promise<Outcome<DuelGraded>>;
  readonly finish: (duelId: string) => Promise<void>;
}

const DUEL_COLUMNS = "id,item_id,challenger,opponent,status,winner,created_at,completed_at,starts_at";
const ENTRY_COLUMNS = "duel_id,user_id,started_at,submitted_at,score,time_ms";
const OFFLINE: Outcome<never> = { ok: false, error: "The site isn't connected to its database." };

function upsert<T>(list: readonly T[], item: T, same: (a: T) => boolean): readonly T[] {
  return list.some(same) ? list.map((x) => (same(x) ? item : x)) : [item, ...list];
}

/** server time - local time, so countdowns agree across both players' computers. */
function offsetFrom(serverNow: string): number {
  return new Date(serverNow).getTime() - Date.now();
}

export function useDuels(): DuelsState {
  const [duels, setDuels] = useState<readonly Duel[]>([]);
  const [entries, setEntries] = useState<readonly DuelEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reloadEntries = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("duel_entries").select(ENTRY_COLUMNS).limit(1000);
    if (error) console.error("Failed to load duel entries", error);
    else setEntries((data ?? []) as DuelEntry[]);
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;

    const reloadAll = async () => {
      const { data, error } = await client.from("duels").select(DUEL_COLUMNS).order("created_at", { ascending: false }).limit(500);
      if (!active) return;
      if (error) console.error("Failed to load duels", error);
      else setDuels((data ?? []) as Duel[]);
      await reloadEntries();
      if (active) setLoaded(true);
    };
    void reloadAll();
    let subscribedBefore = false;

    const channel = client
      .channel("duel-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "duels" }, (payload) => {
        if (payload.eventType === "DELETE") return;
        const d = payload.new as Duel;
        setDuels((cur) => upsert(cur, d, (x) => x.id === d.id));
        // A decided duel reveals the other player's entry, which RLS hid until now.
        if (d.status === "done") void reloadEntries();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "duel_entries" }, (payload) => {
        if (payload.eventType === "DELETE") return;
        const e = payload.new as DuelEntry;
        setEntries((cur) => upsert(cur, e, (x) => x.duel_id === e.duel_id && x.user_id === e.user_id));
      })
      .subscribe((status) => {
        // After a reconnect, events may have been missed: reload everything.
        if (status === "SUBSCRIBED") {
          if (subscribedBefore) void reloadAll();
          subscribedBefore = true;
        }
      });

    return () => {
      active = false;
      client.removeChannel(channel);
    };
  }, [reloadEntries]);

  const refreshDuel = useCallback(async (duelId: string) => {
    if (!supabase) return;
    const { data, error } = await supabase.from("duels").select(DUEL_COLUMNS).eq("id", duelId).maybeSingle();
    if (error) console.error("Failed to refresh duel", error);
    else if (data) setDuels((cur) => upsert(cur, data as Duel, (x) => x.id === duelId));
  }, []);

  const call = useCallback(async <T,>(fn: string, args: Record<string, unknown>, fallback: string): Promise<Outcome<T>> => {
    if (!supabase) return OFFLINE;
    const { data, error } = await supabase.rpc(fn, args);
    if (error) {
      console.error(`${fn} failed`, error);
      return { ok: false, error: dbError(error, fallback) };
    }
    return { ok: true, value: data as T };
  }, []);

  const create = useCallback(async (itemId: string, opponentId: string): Promise<Outcome<string>> => {
    const res = await call<{ id: string }>("create_duel", { p_item: itemId, p_opponent: opponentId }, "Couldn't send the challenge. Try again.");
    if (!res.ok) return res;
    await refreshDuel(res.value.id);
    return { ok: true, value: res.value.id };
  }, [call, refreshDuel]);

  const respond = useCallback(async (duelId: string, accept: boolean): Promise<Outcome<null>> => {
    const res = await call<unknown>("respond_duel", { p_duel: duelId, p_accept: accept }, "Couldn't answer the challenge. Try again.");
    await refreshDuel(duelId);
    return res.ok ? { ok: true, value: null } : res;
  }, [call, refreshDuel]);

  const cancel = useCallback(async (duelId: string): Promise<Outcome<null>> => {
    const res = await call<unknown>("cancel_duel", { p_duel: duelId }, "Couldn't cancel the challenge. Try again.");
    await refreshDuel(duelId);
    return res.ok ? { ok: true, value: null } : res;
  }, [call, refreshDuel]);

  const start = useCallback(async (duelId: string): Promise<Outcome<DuelStart>> => {
    const res = await call<{ starts_at: string; ends_at?: string; server_now: string; questions?: QuizQuestion[]; over?: boolean }>(
      "start_duel", { p_duel: duelId }, "Couldn't open the duel. Try again.",
    );
    if (!res.ok) return res;
    const r = res.value;
    if (r.over) {
      await refreshDuel(duelId);
      return { ok: false, error: "This duel is already over" };
    }
    const serverOffset = offsetFrom(r.server_now);
    const startsAt = new Date(r.starts_at).getTime();
    return r.questions && r.ends_at
      ? { ok: true, value: { kind: "play", startsAt, endsAt: new Date(r.ends_at).getTime(), serverOffset, questions: r.questions } }
      : { ok: true, value: { kind: "wait", startsAt, serverOffset } };
  }, [call, refreshDuel]);

  const submit = useCallback(async (duelId: string, answers: readonly number[]): Promise<Outcome<DuelGraded>> => {
    const res = await call<(SubmitResult & { time_ms: number }) | { over: true }>(
      "submit_duel", { p_duel: duelId, p_answers: answers }, "Couldn't submit your answers. Try again.",
    );
    await Promise.all([reloadEntries(), refreshDuel(duelId)]);
    if (!res.ok) return res;
    if ("over" in res.value) return { ok: false, error: "This duel is already over" };
    return { ok: true, value: { ...toGraded(res.value), time_ms: res.value.time_ms } };
  }, [call, reloadEntries, refreshDuel]);

  const finish = useCallback(async (duelId: string) => {
    await call<string>("finish_duel", { p_duel: duelId }, "");
    await refreshDuel(duelId);
  }, [call, refreshDuel]);

  // Safety net for missed realtime events: re-read pending and live duels every few seconds.
  const activeIds = duels.filter((d) => d.status === "pending" || d.status === "live").map((d) => d.id).join(",");
  useEffect(() => {
    if (!activeIds) return;
    const ids = activeIds.split(",");
    const t = window.setInterval(() => {
      ids.forEach((id) => void refreshDuel(id));
      void reloadEntries();
    }, 4000);
    return () => window.clearInterval(t);
  }, [activeIds, refreshDuel, reloadEntries]);

  return { loaded, duels, entries, create, respond, cancel, start, submit, finish };
}
