import type { SupabaseClient } from "@supabase/supabase-js";
import type { SolvesPort } from "../../rte/ports";
import { ok, type ChallengeSolve } from "../../swc/logic/types";
import { failed, isDuplicate } from "./errors";
import { watchTables } from "./realtime";

/** Coding challenges are graded in the browser; this records who solved what. */
export function supabaseSolves(client: SupabaseClient): SolvesPort {
  return {
    async load() {
      const { data, error } = await client.from("challenge_solves").select("user_id,challenge_id,solved_at").limit(2000);
      return error ? failed("Loading challenge solves", error, "Couldn't load solved challenges.") : ok(data as ChallengeSolve[]);
    },
    watch(cb) {
      return watchTables(client, "solve-changes", [{
        table: "challenge_solves",
        on: (p) => { if (p.eventType === "INSERT") cb(p.new as unknown as ChallengeSolve); },
      }]);
    },
    async record(userId, challengeId, solvedAt) {
      const { error } = await client.from("challenge_solves").insert({ user_id: userId, challenge_id: challengeId, solved_at: solvedAt });
      return !error || isDuplicate(error) ? ok(null) : failed("Recording a solve", error, "Couldn't record the solve.");
    },
  };
}
