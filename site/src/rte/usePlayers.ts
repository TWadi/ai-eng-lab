import { useCallback, useEffect, useState } from "react";
import { supabase } from "../bsw/supabase";
import { dbError, type Outcome } from "./useQuizzes";

export { cleanGithubInput, isGithubUsername } from "../swc/logic/players";

export interface WaitingPlayer {
  readonly github_username: string;
  readonly display_name: string | null;
  readonly avatar_url: string | null;
  readonly signed_in_at: string;
}

export interface PlayersOverview {
  /** Signed in with GitHub but not a player yet. */
  readonly waiting: readonly WaitingPlayer[];
  /** Signed in but turned down (they can still be let in later). */
  readonly declined: readonly WaitingPlayer[];
  /** Invited GitHub usernames that haven't signed in yet. */
  readonly invited: readonly string[];
}

export interface PlayersAdmin {
  readonly overview: PlayersOverview | null;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
  readonly invite: (github: string) => Promise<Outcome<{ readonly signedIn: boolean }>>;
  readonly remove: (github: string) => Promise<Outcome<null>>;
  readonly decline: (github: string) => Promise<Outcome<null>>;
}

/** Admin-only player management. Pass enabled=false for everyone else (no calls are made). */
export function usePlayers(enabled: boolean, onChanged: () => void): PlayersAdmin {
  const [overview, setOverview] = useState<PlayersOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase || !enabled) return;
    const { data, error: err } = await supabase.rpc("lab_admin_overview");
    if (err) {
      console.error("lab_admin_overview failed", err);
      setError(dbError(err, "Couldn't load the player list."));
      return;
    }
    setError(null);
    setOverview(data as PlayersOverview);
  }, [enabled]);

  useEffect(() => {
    void refresh();
    if (!enabled) return;
    const t = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(t);
  }, [enabled, refresh]);

  const invite = useCallback(async (github: string): Promise<Outcome<{ readonly signedIn: boolean }>> => {
    if (!supabase) return { ok: false, error: "The site isn't connected to its database." };
    const { data, error: err } = await supabase.rpc("invite_player", { p_github: github });
    if (err) return { ok: false, error: dbError(err, "Couldn't invite that player.") };
    await refresh();
    onChanged();
    return { ok: true, value: { signedIn: Boolean((data as { signed_in?: boolean }).signed_in) } };
  }, [refresh, onChanged]);

  const remove = useCallback(async (github: string): Promise<Outcome<null>> => {
    if (!supabase) return { ok: false, error: "The site isn't connected to its database." };
    const { error: err } = await supabase.rpc("remove_player", { p_github: github });
    if (err) return { ok: false, error: dbError(err, "Couldn't remove that player.") };
    await refresh();
    onChanged();
    return { ok: true, value: null };
  }, [refresh, onChanged]);

  const decline = useCallback(async (github: string): Promise<Outcome<null>> => {
    if (!supabase) return { ok: false, error: "The site isn't connected to its database." };
    const { error: err } = await supabase.rpc("decline_player", { p_github: github });
    if (err) return { ok: false, error: dbError(err, "Couldn't decline that player.") };
    await refresh();
    return { ok: true, value: null };
  }, [refresh]);

  return { overview, error, refresh, invite, remove, decline };
}
