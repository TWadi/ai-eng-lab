import { useCallback, useEffect, useState } from "react";
import type { Outcome, PlayersOverview } from "../swc/logic/types";
import { useRte } from "./RteContext";

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
  const { players } = useRte();
  const [overview, setOverview] = useState<PlayersOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const res = await players.overview();
    if (res.ok) {
      setError(null);
      setOverview(res.value);
    } else {
      setError(res.error);
    }
  }, [enabled, players]);

  useEffect(() => {
    void refresh();
    if (!enabled) return;
    const t = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(t);
  }, [enabled, refresh]);

  /** Run an admin action, then refresh the lists (and the board, if membership changed). */
  const act = useCallback(<T,>(changesBoard: boolean, fn: () => Promise<Outcome<T>>) => async (): Promise<Outcome<T>> => {
    const res = await fn();
    if (res.ok) {
      await refresh();
      if (changesBoard) onChanged();
    }
    return res;
  }, [refresh, onChanged]);

  const invite = useCallback((github: string) => act(true, () => players.invite(github))(), [act, players]);
  const remove = useCallback((github: string) => act(true, () => players.remove(github))(), [act, players]);
  const decline = useCallback((github: string) => act(false, () => players.decline(github))(), [act, players]);

  return { overview, error, refresh, invite, remove, decline };
}
