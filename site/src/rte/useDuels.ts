import { useCallback, useEffect, useState } from "react";
import type { Duel, DuelEntry } from "../swc/logic/duels";
import type { DuelGraded, DuelStart, Outcome, RaceSubmitted } from "../swc/logic/types";
import { useRte } from "./RteContext";

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
  /** Race a member on a challenge the server picks at random. */
  readonly createRace: (opponentId: string) => Promise<Outcome<string>>;
  /** Report a race result: every test passed, or gave up. */
  readonly submitRace: (duelId: string, passed: boolean, code: string) => Promise<Outcome<RaceSubmitted>>;
}

function upsert<T>(list: readonly T[], item: T, same: (a: T) => boolean): readonly T[] {
  return list.some(same) ? list.map((x) => (same(x) ? item : x)) : [item, ...list];
}

export function useDuels(): DuelsState {
  const { duels: port } = useRte();
  const [duels, setDuels] = useState<readonly Duel[]>([]);
  const [entries, setEntries] = useState<readonly DuelEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reloadEntries = useCallback(async () => {
    const res = await port.loadEntries();
    if (res.ok) setEntries(res.value);
  }, [port]);

  const refreshDuel = useCallback(async (duelId: string) => {
    const res = await port.loadDuel(duelId);
    if (res.ok && res.value) {
      const d = res.value;
      setDuels((cur) => upsert(cur, d, (x) => x.id === duelId));
    }
  }, [port]);

  useEffect(() => {
    let active = true;
    const reloadAll = async () => {
      const res = await port.loadDuels();
      if (!active) return;
      if (res.ok) setDuels(res.value);
      await reloadEntries();
      if (active) setLoaded(true);
    };
    void reloadAll();
    const stop = port.watch({
      duel: (d) => {
        setDuels((cur) => upsert(cur, d, (x) => x.id === d.id));
        // A decided duel reveals the other player's entry, which the database hid until now.
        if (d.status === "done") void reloadEntries();
      },
      entry: (e) => setEntries((cur) => upsert(cur, e, (x) => x.duel_id === e.duel_id && x.user_id === e.user_id)),
      // After a reconnect, events may have been missed: reload everything.
      reconnected: () => void reloadAll(),
    });
    return () => {
      active = false;
      stop();
    };
  }, [port, reloadEntries]);

  /** Every action re-reads the duel it touched (and entries when results change). */
  const create = useCallback(async (itemId: string, opponentId: string) => {
    const res = await port.create(itemId, opponentId);
    if (res.ok) await refreshDuel(res.value);
    return res;
  }, [port, refreshDuel]);

  const createRace = useCallback(async (opponentId: string) => {
    const res = await port.createRace(opponentId);
    if (res.ok) await refreshDuel(res.value);
    return res;
  }, [port, refreshDuel]);

  const respond = useCallback(async (duelId: string, accept: boolean) => {
    const res = await port.respond(duelId, accept);
    await refreshDuel(duelId);
    return res;
  }, [port, refreshDuel]);

  const cancel = useCallback(async (duelId: string) => {
    const res = await port.cancel(duelId);
    await refreshDuel(duelId);
    return res;
  }, [port, refreshDuel]);

  const start = useCallback(async (duelId: string) => {
    const res = await port.start(duelId);
    if (!res.ok) await refreshDuel(duelId);
    return res;
  }, [port, refreshDuel]);

  const submit = useCallback(async (duelId: string, answers: readonly number[]) => {
    const res = await port.submit(duelId, answers);
    await Promise.all([reloadEntries(), refreshDuel(duelId)]);
    return res;
  }, [port, reloadEntries, refreshDuel]);

  const submitRace = useCallback(async (duelId: string, passed: boolean, code: string) => {
    const res = await port.submitRace(duelId, passed, code);
    await Promise.all([reloadEntries(), refreshDuel(duelId)]);
    return res;
  }, [port, reloadEntries, refreshDuel]);

  const finish = useCallback(async (duelId: string) => {
    await port.finish(duelId);
    await refreshDuel(duelId);
  }, [port, refreshDuel]);

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

  return { loaded, duels, entries, create, respond, cancel, start, submit, finish, createRace, submitRace };
}
