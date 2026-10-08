import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProgressPort } from "../../rte/ports";
import type { ProgressRow } from "../../swc/logic/progress";
import { fail, ok, type Profile } from "../../swc/logic/types";
import { failed, isDuplicate } from "./errors";
import { watchTables } from "./realtime";

/** Players (member profiles) and who finished which roadmap item. */
export function supabaseProgress(client: SupabaseClient): ProgressPort {
  return {
    async loadMembers() {
      const { data, error } = await client.from("profiles").select("*").eq("is_member", true).order("created_at");
      return error ? failed("Loading players", error, "Couldn't load the players.") : ok(data as Profile[]);
    },

    async loadProgress() {
      const { data, error } = await client.from("progress").select("user_id,item_id,done_at");
      return error ? failed("Loading progress", error, "Couldn't load progress. Refresh to try again.") : ok(data as ProgressRow[]);
    },

    watchProgress(cb) {
      return watchTables(client, "progress-changes", [{
        table: "progress",
        on: (p) => {
          if (p.eventType === "INSERT") cb(p.new as unknown as ProgressRow);
        },
      }]);
    },

    watchMembers(cb) {
      return watchTables(client, "player-changes", [{ table: "profiles", on: cb }]);
    },

    async markDone(userId, itemId, doneAt) {
      const { error } = await client.from("progress").insert({ user_id: userId, item_id: itemId, done_at: doneAt });
      // Ticked in another tab already: the row exists, which is what we wanted.
      if (!error || isDuplicate(error)) return ok(null);
      console.error("Saving progress failed", error);
      return fail("Couldn't save that change. Check your connection and try again.");
    },
  };
}
