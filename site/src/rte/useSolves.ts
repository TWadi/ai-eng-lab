import { useCallback, useEffect, useState } from "react";
import type { ChallengeSolve } from "../swc/logic/types";
import { useRte } from "./RteContext";

export interface SolvesState {
  readonly solves: readonly ChallengeSolve[];
  /** Record a solve for the signed-in member (succeeds if already solved). */
  readonly record: (userId: string, challengeId: string) => Promise<boolean>;
}

function withSolve(list: readonly ChallengeSolve[], s: ChallengeSolve): readonly ChallengeSolve[] {
  return list.some((x) => x.user_id === s.user_id && x.challenge_id === s.challenge_id) ? list : [...list, s];
}

export function useSolves(): SolvesState {
  const { solves: port } = useRte();
  const [solves, setSolves] = useState<readonly ChallengeSolve[]>([]);

  useEffect(() => {
    let active = true;
    void port.load().then((res) => {
      if (active && res.ok) setSolves(res.value);
    });
    const stop = port.watch((s) => setSolves((cur) => withSolve(cur, s)));
    return () => {
      active = false;
      stop();
    };
  }, [port]);

  const record = useCallback(async (userId: string, challengeId: string) => {
    const solvedAt = new Date().toISOString();
    const res = await port.record(userId, challengeId, solvedAt);
    if (res.ok) setSolves((cur) => withSolve(cur, { user_id: userId, challenge_id: challengeId, solved_at: solvedAt }));
    return res.ok;
  }, [port]);

  return { solves, record };
}
