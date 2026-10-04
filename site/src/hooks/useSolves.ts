import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";

export interface ChallengeSolve {
  readonly user_id: string;
  readonly challenge_id: string;
  readonly solved_at: string;
}

export interface SolvesState {
  readonly solves: readonly ChallengeSolve[];
  /** Record a solve for the signed-in member (no-op if already solved). */
  readonly record: (userId: string, challengeId: string) => Promise<boolean>;
}

export function useSolves(): SolvesState {
  const [solves, setSolves] = useState<readonly ChallengeSolve[]>([]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    (async () => {
      const { data, error } = await client.from("challenge_solves").select("user_id,challenge_id,solved_at").limit(2000);
      if (!active) return;
      if (error) console.error("Failed to load challenge solves", error);
      else setSolves((data ?? []) as ChallengeSolve[]);
    })();
    const channel = client
      .channel("solve-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "challenge_solves" }, (payload) => {
        const s = payload.new as ChallengeSolve;
        setSolves((cur) => (cur.some((x) => x.user_id === s.user_id && x.challenge_id === s.challenge_id) ? cur : [...cur, s]));
      })
      .subscribe();
    return () => {
      active = false;
      client.removeChannel(channel);
    };
  }, []);

  const record = useCallback(async (userId: string, challengeId: string) => {
    if (!supabase) return false;
    const solvedAt = new Date().toISOString();
    const { error } = await supabase.from("challenge_solves").insert({ user_id: userId, challenge_id: challengeId, solved_at: solvedAt });
    if (error && error.code !== "23505") {
      console.error("Failed to record solve", error);
      return false;
    }
    setSolves((cur) => (cur.some((x) => x.user_id === userId && x.challenge_id === challengeId)
      ? cur
      : [...cur, { user_id: userId, challenge_id: challengeId, solved_at: solvedAt }]));
    return true;
  }, []);

  return { solves, record };
}
