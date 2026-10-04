import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import type { Duel, DuelEntry } from "../duels";
import { dbError, toGraded, type GradedQuiz, type OpenQuiz, type Outcome, type SubmitResult } from "./useQuizzes";

export interface DuelResult extends GradedQuiz {
  readonly time_ms: number;
  readonly status: "open" | "done";
  readonly winner: string | null;
  readonly opponent_score: number | null;
  readonly opponent_time_ms: number | null;
}

export interface DuelsState {
  readonly duels: readonly Duel[];
  readonly entries: readonly DuelEntry[];
  readonly create: (itemId: string, opponentId: string) => Promise<Outcome<string>>;
  readonly start: (duelId: string) => Promise<Outcome<OpenQuiz>>;
  readonly submit: (duelId: string, answers: readonly number[]) => Promise<Outcome<DuelResult>>;
}

const DUEL_COLUMNS = "id,item_id,challenger,opponent,status,winner,created_at,completed_at";
const ENTRY_COLUMNS = "duel_id,user_id,started_at,submitted_at,score,time_ms";

function upsert<T>(list: readonly T[], item: T, same: (a: T) => boolean): readonly T[] {
  return list.some(same) ? list.map((x) => (same(x) ? item : x)) : [item, ...list];
}

export function useDuels(): DuelsState {
  const [duels, setDuels] = useState<readonly Duel[]>([]);
  const [entries, setEntries] = useState<readonly DuelEntry[]>([]);

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

    (async () => {
      const { data, error } = await client.from("duels").select(DUEL_COLUMNS).order("created_at", { ascending: false }).limit(500);
      if (!active) return;
      if (error) console.error("Failed to load duels", error);
      else setDuels((data ?? []) as Duel[]);
      await reloadEntries();
    })();

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
      .subscribe();

    return () => {
      active = false;
      client.removeChannel(channel);
    };
  }, [reloadEntries]);

  const create = useCallback(async (itemId: string, opponentId: string): Promise<Outcome<string>> => {
    if (!supabase) return { ok: false, error: "The site isn't connected to its database." };
    const { data, error } = await supabase.rpc("create_duel", { p_item: itemId, p_opponent: opponentId });
    if (error || !data) {
      console.error("Failed to create duel", error);
      return { ok: false, error: dbError(error, "Couldn't start the duel. Try again.") };
    }
    return { ok: true, value: String(data) };
  }, []);

  const start = useCallback(async (duelId: string): Promise<Outcome<OpenQuiz>> => {
    if (!supabase) return { ok: false, error: "The site isn't connected to its database." };
    const { data, error } = await supabase.rpc("start_duel", { p_duel: duelId });
    if (error || !data) {
      console.error("Failed to open duel", error);
      return { ok: false, error: dbError(error, "Couldn't open the duel. Try again.") };
    }
    return { ok: true, value: data as OpenQuiz };
  }, []);

  const submit = useCallback(async (duelId: string, answers: readonly number[]): Promise<Outcome<DuelResult>> => {
    if (!supabase) return { ok: false, error: "The site isn't connected to its database." };
    const { data, error } = await supabase.rpc("submit_duel", { p_duel: duelId, p_answers: answers });
    if (error || !data) {
      console.error("Failed to submit duel", error);
      return { ok: false, error: dbError(error, "Couldn't submit your answers. Try again.") };
    }
    const r = data as SubmitResult & Omit<DuelResult, keyof GradedQuiz>;
    void reloadEntries();
    return {
      ok: true,
      value: {
        ...toGraded(r),
        time_ms: r.time_ms, status: r.status, winner: r.winner ?? null,
        opponent_score: r.opponent_score ?? null, opponent_time_ms: r.opponent_time_ms ?? null,
      },
    };
  }, [reloadEntries]);

  return { duels, entries, create, start, submit };
}
