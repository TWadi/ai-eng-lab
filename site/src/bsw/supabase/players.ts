import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayersPort } from "../../rte/ports";
import { ok, type PlayersOverview } from "../../swc/logic/types";
import { failed } from "./errors";

/** Admin-only player management; the database refuses these calls for everyone else. */
export function supabasePlayers(client: SupabaseClient): PlayersPort {
  return {
    async overview() {
      const { data, error } = await client.rpc("lab_admin_overview");
      return error ? failed("lab_admin_overview", error, "Couldn't load the player list.") : ok(data as PlayersOverview);
    },
    async invite(github) {
      const { data, error } = await client.rpc("invite_player", { p_github: github });
      if (error) return failed("invite_player", error, "Couldn't invite that player.");
      return ok({ signedIn: Boolean((data as { signed_in?: boolean }).signed_in) });
    },
    async remove(github) {
      const { error } = await client.rpc("remove_player", { p_github: github });
      return error ? failed("remove_player", error, "Couldn't remove that player.") : ok(null);
    },
    async decline(github) {
      const { error } = await client.rpc("decline_player", { p_github: github });
      return error ? failed("decline_player", error, "Couldn't decline that player.") : ok(null);
    },
  };
}
